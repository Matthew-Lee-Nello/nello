'use client'

// Fire a deduplicated Lead event on both the browser pixel and the server-side
// Conversions API. Same eventID on both sides lets Meta merge them so paid-ads
// attribution doesn't double-count.

const STORAGE_KEY = 'nello-meta-lead-fired'

export function fireMetaLead() {
  if (typeof window === 'undefined') return
  try {
    if (sessionStorage.getItem(STORAGE_KEY) === '1') return
    sessionStorage.setItem(STORAGE_KEY, '1')
  } catch {
    // sessionStorage may be unavailable - proceed without dedup.
  }

  const eventId = `lead_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

  if (typeof window.fbq === 'function') {
    window.fbq('track', 'Lead', {}, { eventID: eventId })
  }

  void fetch('/api/meta-capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      eventName: 'Lead',
      eventId,
      eventSourceUrl: window.location.href,
    }),
    keepalive: true,
  }).catch(() => {
    // Pixel still fired client-side - silent server fallback.
  })
}
