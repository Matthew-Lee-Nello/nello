import { NextResponse } from 'next/server'
import crypto from 'node:crypto'

// Meta Conversions API (CAPI) bridge. Browser pixel fires `Lead` with eventID;
// the client also POSTs here so we forward the same event server-side. Meta
// dedupes by eventID, so we get ~30% recovery from ad-blocked / Safari-ITP
// browsers without double-counting.
//
// Required env:
//   NEXT_PUBLIC_META_PIXEL_ID    Pixel ID (also burned into MetaPixel.tsx)
//   META_CAPI_ACCESS_TOKEN       Long-lived system-user token from Events Manager

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN
const GRAPH_VERSION = 'v18.0'

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
    return NextResponse.json({ skipped: 'missing_config' }, { status: 200 })
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
  const eventId = body.eventId
  if (!eventId) {
    return NextResponse.json({ error: 'missing_event_id' }, { status: 400 })
  }

  const cookieHeader = req.headers.get('cookie')
  const fbp = readCookie(cookieHeader, '_fbp')
  const fbc = readCookie(cookieHeader, '_fbc')
  const userAgent = req.headers.get('user-agent') || undefined
  const clientIp = pickClientIp(req)

  const userData: Record<string, string> = {}
  if (body.email) userData.em = sha256(body.email)
  if (body.phone) userData.ph = sha256(body.phone)
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
        event_source_url: body.eventSourceUrl,
        action_source: 'website',
        user_data: userData,
      },
    ],
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events?access_token=${encodeURIComponent(ACCESS_TOKEN)}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    if (!res.ok) {
      return NextResponse.json({ error: 'graph_api', status: res.status, body: text }, { status: 502 })
    }
    return NextResponse.json({ ok: true, graph: text }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'fetch_failed', detail: String(err) }, { status: 502 })
  }
}
