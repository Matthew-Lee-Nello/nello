/**
 * Content-addressed dedup index.
 *
 * Backs the auto-fetch scheduler (and any other re-ingest path) so re-fetching
 * the same email / event / message doesn't write multiple copies into the
 * vault. The dedup key is (source, source_id) plus a content_hash — if the
 * content hash changed since the last write, the new version is treated as an
 * update (caller decides whether to overwrite, append, or skip).
 *
 * Index lives in the same SQLite db as sessions / scheduled_tasks.
 */

import { createHash } from 'node:crypto'
import { getDb } from './db.js'

/** sha256:<hex> — stable, content-addressed, fits the provenance frontmatter shape. */
export function contentHash(content: string): string {
  const hex = createHash('sha256').update(content, 'utf-8').digest('hex')
  return `sha256:${hex}`
}

let _initialised = false
function ensureTable(): void {
  if (_initialised) return
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS auto_fetch_seen (
      source       TEXT NOT NULL,
      source_id    TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      vault_path   TEXT,
      written_at   INTEGER NOT NULL,
      PRIMARY KEY (source, source_id)
    );
  `)
  _initialised = true
}

export interface SeenRecord {
  source: string
  source_id: string
  content_hash: string
  vault_path: string | null
  written_at: number
}

/**
 * Look up the last-seen record for a given (source, source_id) pair.
 * Returns null if never seen.
 */
export function getSeen(source: string, source_id: string): SeenRecord | null {
  ensureTable()
  const row = getDb()
    .prepare('SELECT source, source_id, content_hash, vault_path, written_at FROM auto_fetch_seen WHERE source = ? AND source_id = ?')
    .get(source, source_id) as SeenRecord | undefined
  return row ?? null
}

/**
 * Three-way classification for an incoming chunk against the dedup index:
 *  - 'new'        — never seen this (source, source_id) before
 *  - 'unchanged'  — already seen, content hash matches the last write
 *  - 'updated'    — already seen, but content hash differs (treat as update)
 */
export type DedupVerdict = 'new' | 'unchanged' | 'updated'

export function classify(source: string, source_id: string, content: string): {
  verdict: DedupVerdict
  hash: string
  previous: SeenRecord | null
} {
  const hash = contentHash(content)
  const previous = getSeen(source, source_id)
  if (!previous) return { verdict: 'new', hash, previous: null }
  if (previous.content_hash === hash) return { verdict: 'unchanged', hash, previous }
  return { verdict: 'updated', hash, previous }
}

/**
 * Record (or upsert) a write. Call after the auto-fetch pipeline actually
 * lands the note in the vault.
 */
export function markSeen(args: {
  source: string
  source_id: string
  content_hash: string
  vault_path?: string
}): void {
  ensureTable()
  getDb()
    .prepare(`
      INSERT INTO auto_fetch_seen (source, source_id, content_hash, vault_path, written_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(source, source_id) DO UPDATE SET
        content_hash = excluded.content_hash,
        vault_path   = excluded.vault_path,
        written_at   = excluded.written_at
    `)
    .run(args.source, args.source_id, args.content_hash, args.vault_path ?? null, Date.now())
}

/**
 * Remove the dedup record for a (source, source_id). Use when a note is
 * intentionally deleted from the vault and you want re-ingest to re-write it.
 */
export function forgetSeen(source: string, source_id: string): void {
  ensureTable()
  getDb()
    .prepare('DELETE FROM auto_fetch_seen WHERE source = ? AND source_id = ?')
    .run(source, source_id)
}
