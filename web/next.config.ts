import type { NextConfig } from 'next'
import { execSync, } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Latest git commit timestamp, burned in at build time. Vercel rebuilds on every
// push to production, so this tracks "last updated" - if it ever looks stale, the
// site just hasn't been redeployed since the change. Falls back to build time if git
// isn't available (running outside a repo).
const lastCommitISO = (() => {
  try {
    return execSync('git log -1 --format=%cI', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return new Date().toISOString()
  }
})()

// The release version, read from the repo-root VERSION file at build time, so the
// site can show "Nello v1.0.0" next to the date.
const version = (() => {
  try {
    return readFileSync(join(process.cwd(), '..', 'VERSION'), 'utf-8').trim()
  } catch {
    return ''
  }
})()

// Conservative default CSP. This site is static marketing + an install-prompt
// copy button; it never handles API keys. CSP stays locked down as defence-in-depth.
// `'unsafe-inline'` on style-src is required by Next's inline injected styles;
// every other directive is locked down. Adjust the connect-src list if/when a
// real /api endpoint needs an upstream call.
// Next dev mode uses eval() for HMR; allow it only in development.
const isDev = process.env.NODE_ENV !== 'production'

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://booking.nello.gg https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://booking.nello.gg https://www.facebook.com",
  "frame-src 'self' https://booking.nello.gg https://www.youtube-nocookie.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

// /setup is the GHL post-submit redirect target. The iframe inside our
// lead-capture modal navigates here, so it must allow same-origin framing.
const SETUP_BRIDGE_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
const SETUP_BRIDGE_HEADERS = [
  { key: 'Content-Security-Policy', value: SETUP_BRIDGE_CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  env: {
    NEXT_PUBLIC_LAST_UPDATED: lastCommitISO,
    NEXT_PUBLIC_VERSION: version,
  },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/setup', headers: SETUP_BRIDGE_HEADERS },
    ]
  },
}

export default config
