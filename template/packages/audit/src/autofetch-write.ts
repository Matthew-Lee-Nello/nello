/**
 * `nello autofetch-write` — the deterministic write gate for auto-fetch.
 *
 * WHY THIS EXISTS
 * The original "scraping my email every 10 min, destroying my API" incident had a
 * root cause that survived v1.1: the fetch→classify→write→markSeen loop lived in
 * SKILL.md prose and was *LLM-trusted*. A single missed `markSeen` call left an item
 * permanently `new`, so every tick re-wrote it (and re-embedded it) forever; a skipped
 * `classify` re-wrote unchanged items. "The agent usually remembers" is not a cost
 * control.
 *
 * This moves the gate into CODE. The agent's only job is to fetch (it owns the MCP
 * connections) and triage. It then hands every item to this command as one JSON batch,
 * and THIS does, transactionally per item:
 *   1. build the dedup `content` from a FIXED field whitelist (in code, not the prompt)
 *      so body jitter — Gmail labels, thread counts, snippet ordering — can't flip a
 *      byte-identical item to `updated` and re-burn it;
 *   2. classify against the dedup index — `unchanged` is dropped here, no write, no embed;
 *   3. for new/updated: respect triage, write the note, and `markSeen` in the SAME step
 *      as the write — a missed markSeen is now impossible.
 *
 * Input: a JSON array (file path argv[0], or stdin if omitted or '-') of:
 *   { source, source_id, toolkit?, scope?, summary?, fields?: {sender,subject,date,...},
 *     body, triage: 'drop'|'ack'|'react'|'escalate' }
 * Output: a one-line human summary, then a JSON line { summary, escalations } so the
 *   agent can send the (rare) escalations as Telegram one-liners.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { VAULT_PATH, classify, markSeen, lastSeenAt } from '@nello/core'
import { noteWithProvenance } from '@nello/vault-seeder'

/**
 * `nello autofetch-cursor <source>` — print the ISO timestamp the agent should fetch
 * AFTER for this source (the newest thing we've already filed), or nothing for a first
 * run. Lets the agent pull only what's new instead of re-listing the same window each
 * tick — so an empty tick stays cheap even before the code gate runs.
 */
export function runAutofetchCursor(source: string | undefined): void {
  if (!source) { console.error('Usage: nello autofetch-cursor <source>'); process.exit(1) }
  const at = lastSeenAt(source)
  if (at) console.log(new Date(at).toISOString())
}

type Triage = 'drop' | 'ack' | 'react' | 'escalate'
interface InItem {
  source: string
  source_id: string
  toolkit?: string
  scope?: string
  summary?: string
  fields?: Record<string, unknown>
  body: string
  triage?: Triage
}

// Mtime tolerance (ms) for the hand-edit guard — covers clock skew / fs granularity.
const HAND_EDIT_TOLERANCE_MS = 2000

function readInput(pathArg: string | undefined): InItem[] {
  let raw: string
  if (!pathArg || pathArg === '-') {
    raw = readFileSync(0, 'utf-8') // fd 0 = stdin
  } else {
    raw = readFileSync(pathArg, 'utf-8')
  }
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error('autofetch-write expects a JSON array of items')
  return parsed as InItem[]
}

/** Filesystem-safe leaf from an arbitrary upstream id (gmail thread_id, event_id, ts).
 * When the id is long enough to need truncation, append a short hash of the FULL id so two
 * distinct long ids that share a 120-char prefix can't collide onto one file (the dedup DB
 * keys on the full id, but the file must stay distinct too). */
function safeId(id: string): string {
  const clean = String(id).replace(/[^A-Za-z0-9._-]/g, '_')
  if (clean.length <= 120) return clean || 'item'
  const h = createHash('sha256').update(String(id)).digest('hex').slice(0, 8)
  return `${clean.slice(0, 111)}-${h}`
}

/**
 * The string that gets hashed for dedup. Built in code from an explicit whitelist so it
 * is stable across ticks regardless of how the agent phrased anything. Order is fixed.
 */
function dedupContent(item: InItem): string {
  const f = item.fields || {}
  const parts = [
    `source:${item.source}`,
    `id:${item.source_id}`,
    `sender:${f.sender ?? f.from ?? ''}`,
    `subject:${f.subject ?? f.title ?? ''}`,
    `date:${f.date ?? f.when ?? ''}`,
    '',
    (item.body ?? '').trim(),
  ]
  return parts.join('\n')
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function runAutofetchWrite(pathArg: string | undefined): void {
  let items: InItem[]
  try {
    items = readInput(pathArg)
  } catch (err) {
    console.error(`autofetch-write: bad input — ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }

  const inboxMd = join(VAULT_PATH, 'Inbox.md')
  const now = new Date()
  let nNew = 0, nUpdated = 0, nSkipped = 0, nDropped = 0, nAcked = 0, nReacted = 0, nEscalated = 0
  const sources = new Set<string>()
  const escalations: { source: string; summary: string; path: string }[] = []
  const inboxLines: string[] = []

  for (const item of items) {
    if (!item || !item.source || !item.source_id) { nSkipped++; continue }
    sources.add(item.source)
    const triage: Triage = item.triage ?? 'react'
    const content = dedupContent(item)
    const { verdict, hash, previous } = classify(item.source, item.source_id, content)

    // Unchanged is killed HERE — never reaches a write or an embed. This is the line
    // that stops the re-scrape storm regardless of what the agent did upstream.
    if (verdict === 'unchanged') { nSkipped++; continue }

    // Triage 'drop': record it as seen (so it never re-triages) but write nothing.
    if (triage === 'drop') {
      markSeen({ source: item.source, source_id: item.source_id, content_hash: hash, vault_path: undefined })
      nDropped++
      continue
    }

    // Reuse the previous path ONLY if it's still inside the current vault. If the owner
    // moved their vault, a stored absolute path points outside it — fall back to the
    // computed in-vault path so the note (and its wikilink) stay under the live vault.
    const inVault = (p?: string | null) => !!p && (p === VAULT_PATH || p.startsWith(VAULT_PATH + '/') || p.startsWith(VAULT_PATH + '\\'))
    const dest = inVault(previous?.vault_path) ? (previous!.vault_path as string) : join(VAULT_PATH, 'Inbox', 'auto-fetch', item.source, `${safeId(item.source_id)}.md`)

    // Hand-edit guard: if the note on disk was modified by a human AFTER our last write,
    // don't clobber it. Record the new hash as seen so we stop re-detecting it as updated.
    if (verdict === 'updated' && previous && existsSync(dest)) {
      try {
        if (statSync(dest).mtimeMs > previous.written_at + HAND_EDIT_TOLERANCE_MS) {
          markSeen({ source: item.source, source_id: item.source_id, content_hash: hash, vault_path: dest })
          nSkipped++
          continue
        }
      } catch { /* stat failed — fall through and (re)write */ }
    }

    // Sanitise the agent-supplied extra field KEYS before they become frontmatter lines.
    // provenanceFrontmatter escapes values but emits keys raw, so a key with a newline/`:`
    // could inject arbitrary frontmatter. Keep only safe key names (the agent controls these,
    // so low blast radius, but this is exactly the LLM-trusted-write class we're closing).
    const safeFields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(item.fields || {})) {
      if (/^[A-Za-z0-9_-]{1,40}$/.test(k)) safeFields[k] = v
    }
    const note = noteWithProvenance({
      source: item.source,
      source_id: item.source_id,
      toolkit: item.toolkit,
      scope: item.scope,
      fetched_at: now,
      content_hash: hash,
      ...safeFields,
    }, item.body ?? '')

    try {
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, note, 'utf-8')
    } catch (err) {
      console.error(`autofetch-write: failed to write ${dest} — ${err instanceof Error ? err.message : String(err)}`)
      nSkipped++
      continue
    }

    // markSeen in the SAME step as the write — they cannot drift apart.
    markSeen({ source: item.source, source_id: item.source_id, content_hash: hash, vault_path: dest })

    if (verdict === 'new') nNew++; else nUpdated++

    const rel = dest.startsWith(VAULT_PATH) ? dest.slice(VAULT_PATH.length).replace(/^[/\\]/, '').replace(/\.md$/, '') : dest
    const summary = (item.summary || String(item.fields?.subject || item.fields?.title || '')).replace(/\s+/g, ' ').trim().slice(0, 140) || '(no summary)'

    if (triage === 'ack') { nAcked++; continue } // written, but no Inbox.md line

    const prefix = triage === 'escalate' ? '**ESCALATE** — ' : ''
    inboxLines.push(`- [${hhmm(now)}] ${item.source}: ${prefix}${summary} → [[${rel}]]`)
    if (triage === 'escalate') { nEscalated++; escalations.push({ source: item.source, summary, path: rel }) }
    else nReacted++
  }

  if (inboxLines.length) {
    try {
      if (!existsSync(inboxMd)) writeFileSync(inboxMd, '# Inbox\n\n', 'utf-8')
      appendFileSync(inboxMd, inboxLines.join('\n') + '\n', 'utf-8')
    } catch (err) {
      console.error(`autofetch-write: could not append to Inbox.md — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const summary = `Auto-fetch: ${nNew} new, ${nUpdated} updated, ${nSkipped} skipped (dropped ${nDropped}, acked ${nAcked}, reacted ${nReacted}, escalated ${nEscalated}) across ${sources.size} source${sources.size === 1 ? '' : 's'}.`
  console.log(summary)
  // Machine-readable result on its own marked line. The marker makes it unambiguous to find
  // even if a library log line (e.g. the DB "initialised" notice) trails on stdout.
  console.log('NELLO_AUTOFETCH_RESULT ' + JSON.stringify({ summary, escalations }))
}
