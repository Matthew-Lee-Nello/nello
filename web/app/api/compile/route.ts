import { NextResponse } from 'next/server'
import { nanoid } from 'nanoid'

// Edge runtime: in-memory rate limiter per worker. Vercel may run multiple
// edge workers, so this caps PER-WORKER. Good enough for the wizard's traffic
// pattern (a few hits per real user, very low total volume); upgrade to KV
// when global limits become necessary.
export const runtime = 'edge'

const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 10
const bucket = new Map<string, { count: number; resetAt: number }>()

function rateLimitKey(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'anonymous'
  )
}

function rateLimit(req: Request): { ok: true } | { ok: false; retryAfterSec: number } {
  const key = rateLimitKey(req)
  const now = Date.now()
  const slot = bucket.get(key)
  if (!slot || slot.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    // Opportunistic cleanup of expired entries to keep the map small.
    if (bucket.size > 1024) {
      for (const [k, v] of bucket) if (v.resetAt <= now) bucket.delete(k)
    }
    return { ok: true }
  }
  slot.count++
  if (slot.count > RATE_LIMIT_MAX) {
    return { ok: false, retryAfterSec: Math.ceil((slot.resetAt - now) / 1000) }
  }
  return { ok: true }
}

/**
 * Issue an install-session token. The bundle (with API keys) is built and
 * downloaded entirely client-side — this endpoint never receives the keys.
 * The token is a fresh nanoid, not a cryptographic signature; it's used by
 * the wizard frontend purely as a "compile succeeded" sentinel that gates
 * the install-command UI. We accept an opaque `meta` blob for client-side
 * timing diagnostics but reject everything else so future callers can't
 * smuggle data into a request we explicitly do not process.
 */
export async function POST(req: Request) {
  const rl = rateLimit(req)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }
  if (body !== null && body !== undefined && (typeof body !== 'object' || Array.isArray(body))) {
    return NextResponse.json({ error: 'body must be an object' }, { status: 400 })
  }
  // Allow `{}` or `{ meta: {...} }`. Reject any other top-level key so an
  // attacker can't probe future-fields or smuggle data into request logs.
  if (body && typeof body === 'object') {
    for (const k of Object.keys(body as object)) {
      if (k !== 'meta') {
        return NextResponse.json({ error: `unexpected field: ${k}` }, { status: 400 })
      }
    }
  }

  const token = nanoid(16)
  return NextResponse.json({
    token,
    installUrl: `/i/${token}`,
    expires: Date.now() + 1000 * 60 * 60 * 24,
  })
}
