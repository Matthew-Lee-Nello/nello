/**
 * Provenance frontmatter for auto-captured vault notes.
 *
 * Any note written by an auto-ingest path (auto-fetch, trigger handler,
 * background job) should carry provenance so the agent can trace any claim
 * back to its source and so re-ingest can dedupe by source_id + content_hash.
 *
 * Format mirrors the openhuman memory-tree convention — a flat YAML block
 * at the top of the markdown file. Hand-written notes (the user typing in
 * Obsidian) do not need this; provenance is for machine-written notes only.
 */

export interface Provenance {
  /** Logical source name — 'gmail', 'calendar', 'slack', 'apify-actor:<id>' */
  source: string
  /** Stable upstream ID — gmail thread_id, calendar event_id, slack ts */
  source_id?: string
  /** MCP / connector the data came through — 'google_workspace', 'slack', 'exa' */
  toolkit?: string
  /** What unit this note represents — 'thread', 'event', 'channel-digest', 'page' */
  scope?: string
  /** Inclusive time range the note covers (ISO 8601 strings or Date) */
  time_range?: { from: Date | string; to: Date | string }
  /** When this note was written by the auto-ingest pipeline */
  fetched_at?: Date
  /** Content hash for dedup — sha256:<hex>. Compute via the @nc/dedup util. */
  content_hash?: string
  /** Free-form extra fields (will be serialised in YAML order) */
  [k: string]: unknown
}

function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : d
}

function quoteIfNeeded(v: string): string {
  // Quote strings that contain YAML-special characters or look numeric.
  if (/^[A-Za-z_][A-Za-z0-9_.:/-]*$/.test(v) && !/^(true|false|null|yes|no)$/i.test(v)) return v
  return JSON.stringify(v)
}

function serialiseValue(v: unknown): string {
  if (v === undefined || v === null) return 'null'
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'string') return quoteIfNeeded(v)
  if (Array.isArray(v)) return '[' + v.map(serialiseValue).join(', ') + ']'
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    return '{ ' + entries.map(([k, val]) => `${k}: ${serialiseValue(val)}`).join(', ') + ' }'
  }
  return JSON.stringify(v)
}

/**
 * Render a Provenance object as a YAML frontmatter block (without the
 * surrounding `---` fences — `noteWithProvenance` adds those).
 */
export function provenanceFrontmatter(p: Provenance): string {
  const lines: string[] = []
  // Stable field order: known keys first, then alphabetised extras.
  const known = ['source', 'source_id', 'toolkit', 'scope', 'time_range', 'fetched_at', 'content_hash']
  const seen = new Set<string>()

  for (const key of known) {
    if (!(key in p)) continue
    seen.add(key)
    const value = p[key]
    if (value === undefined) continue
    if (key === 'time_range' && value && typeof value === 'object') {
      const tr = value as { from: Date | string; to: Date | string }
      lines.push(`time_range: { from: ${iso(tr.from)}, to: ${iso(tr.to)} }`)
    } else if (key === 'fetched_at' && value instanceof Date) {
      lines.push(`fetched_at: ${value.toISOString()}`)
    } else {
      lines.push(`${key}: ${serialiseValue(value)}`)
    }
  }

  const extras = Object.keys(p).filter(k => !seen.has(k)).sort()
  for (const key of extras) {
    const value = p[key]
    if (value === undefined) continue
    lines.push(`${key}: ${serialiseValue(value)}`)
  }

  return lines.join('\n')
}

/**
 * Build a full markdown note string with provenance frontmatter prepended.
 * The body is appended verbatim — no trimming, no munging.
 */
export function noteWithProvenance(p: Provenance, body: string): string {
  const block = provenanceFrontmatter(p)
  return `---\n${block}\n---\n\n${body}`
}
