import { NextResponse } from 'next/server'
import crypto from 'node:crypto'

// Meta Conversions API (CAPI) bridge. Browser pixel fires `Lead` with eventID;
// the client also POSTs here so we forward the same event server-side. Meta
// dedupes by eventID, so we get ~30% recovery from ad-blocked / Safari-ITP
// browsers without double-counting.
//
// Required env:
//   NEXT_PUBLIC_META_PIXEL_ID    Pixel ID (public, baked into MetaPixel.tsx).
//   META_CAPI_ACCESS_TOKEN       Long-lived system-user token from Events Manager.
//                                NEVER prefix with NEXT_PUBLIC_ - it must stay
//                                server-only or it gets inlined into the client
//                                bundle and stolen.

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN
const GRAPH_VERSION = 'v18.0'

// Only these event names are accepted. Anything else is rejected so a third
// party can't spray garbage events at our pixel.
const ALLOWED_EVENTS = new Set([
  'Lead',
  'CompleteRegistration',
  'ViewContent',
  'Contact',
  'Subscribe',
])

// Origin allowlist - requests must come from one of these hosts. Local dev is
// permitted so `next dev` keeps working. Anything else gets 403.
const ALLOWED_HOSTS = new Set([
  'labs.nello.gg',
  'www.labs.nello.gg',
  'localhost:4173',
  'localhost:3000',
  '127.0.0.1:4173',
  '127.0.0.1:3000',
])

function hostFromHeader(value: string | null): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).host
  } catch {
    return undefined
  }
}

function isAllowedOrigin(req: Request): boolean {
  const origin = hostFromHeader(req.headers.get('origin'))
  if (origin && ALLOWED_HOSTS.has(origin)) return true
  // Some same-origin POSTs omit Origin; fall back to Referer.
  const referer = hostFromHeader(req.headers.get('referer'))
  if (referer && ALLOWED_HOSTS.has(referer)) return true
  return false
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex')
}

function pickClientIp(req: Request): string | undefined {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0]!.trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real
  return undefined
}

function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined
  const parts = cookieHeader.split(';')
  for (const part of parts) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

export async function POST(req: Request) {
  if (!PIXEL_ID || !ACCESS_TOKEN) {
    // Config missing - never reveal which one. Caller gets a generic skip.
    return NextResponse.json({ ok: true, skipped: true }, { status: 200 })
  }

  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  let body: {
    eventName?: string
    eventId?: string
    eventSourceUrl?: string
    email?: string
    phone?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const eventName = body.eventName || 'Lead'
  if (!ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ error: 'invalid_event' }, { status: 400 })
  }

  const eventId = body.eventId
  if (typeof eventId !== 'string' || eventId.length < 8 || eventId.length > 128) {
    return NextResponse.json({ error: 'invalid_event_id' }, { status: 400 })
  }

  // eventSourceUrl must be on our allowed hosts. Stop attackers using us to
  // attribute conversions to phishing landing pages.
  let eventSourceUrl: string | undefined
  if (typeof body.eventSourceUrl === 'string') {
    const host = hostFromHeader(body.eventSourceUrl)
    if (host && ALLOWED_HOSTS.has(host)) eventSourceUrl = body.eventSourceUrl
  }

  const cookieHeader = req.headers.get('cookie')
  const fbp = readCookie(cookieHeader, '_fbp')
  const fbc = readCookie(cookieHeader, '_fbc')
  const userAgent = req.headers.get('user-agent') || undefined
  const clientIp = pickClientIp(req)

  const userData: Record<string, string> = {}
  if (typeof body.email === 'string' && body.email.includes('@')) {
    userData.em = sha256(body.email)
  }
  if (typeof body.phone === 'string' && body.phone.length >= 6) {
    userData.ph = sha256(body.phone.replace(/\D/g, ''))
  }
  if (clientIp) userData.client_ip_address = clientIp
  if (userAgent) userData.client_user_agent = userAgent
  if (fbp) userData.fbp = fbp
  if (fbc) userData.fbc = fbc

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: eventSourceUrl,
        action_source: 'website',
        user_data: userData,
      },
    ],
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      // Log server-side, return generic upstream error to caller. Never echo
      // the Graph API response body since it can contain the access token or
      // structural hints about our config.
      console.error('[meta-capi] graph error', res.status, await res.text())
      return NextResponse.json({ error: 'upstream' }, { status: 502 })
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (err) {
    console.error('[meta-capi] fetch error', err)
    return NextResponse.json({ error: 'upstream' }, { status: 502 })
  }
}

export async function GET() {
  // No GET surface. Reduces accidental exposure from random scanners.
  return NextResponse.json({ error: 'method_not_allowed' }, { status: 405 })
}
