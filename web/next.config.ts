import type { NextConfig } from 'next'

// Conservative default CSP. The wizard collects API keys + stores them in
// localStorage during the session, so any XSS bug on this site is high-stakes.
// `'unsafe-inline'` on style-src is required by Next's inline injected styles;
// every other directive is locked down. Adjust the connect-src list if/when a
// real /api endpoint needs an upstream call.
// Next dev mode uses eval() for HMR; allow it only in development.
const isDev = process.env.NODE_ENV !== 'production'

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://booking.nello.gg`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://booking.nello.gg",
  "frame-src 'self' https://booking.nello.gg",
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

// /lead-captured is the GHL post-submit redirect target. The iframe inside our
// lead-capture modal navigates here, so it must allow same-origin framing.
const LEAD_CAPTURED_CSP = CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self'")
const LEAD_CAPTURED_HEADERS = [
  { key: 'Content-Security-Policy', value: LEAD_CAPTURED_CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

const config: NextConfig = {
  reactStrictMode: true,
  experimental: { typedRoutes: true },
  async headers() {
    return [
      { source: '/:path*', headers: SECURITY_HEADERS },
      { source: '/lead-captured', headers: LEAD_CAPTURED_HEADERS },
    ]
  },
}

export default config
