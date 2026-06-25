#!/usr/bin/env node
/**
 * archive-items.mjs - bulk archive writer for /build-brain.
 *
 * Takes a JSON array of already-normalised items (ChatGPT conversations OR
 * items fetched from a connected source) and writes one provenance-stamped,
 * deduped markdown note per item into the vault. Doing this in one Node pass
 * is the cheap path for "everything" backfills - the agent never loops note
 * by note.
 *
 * Reuses the shipped libraries (no new deps):
 *   - @nello/core         classify + markSeen   (the auto_fetch_seen dedup index)
 *   - @nello/vault-seeder noteWithProvenance     (provenance + taxonomy frontmatter)
 *
 * Resolution note: this file lives at <install>/template/skills/build-brain/,
 * so bare imports resolve up the tree to <install>/node_modules. Run it with
 * Node from anywhere; do NOT pass --preserve-symlinks.
 *
 * Usage:
 *   node archive-items.mjs --source gmail --vault <vaultPath> \
 *        --subdir Imports/gmail --items items.json \
 *        [--prefix Log] [--toolkit google_workspace] [--scope thread] [--type log]
 *
 * items.json: [{ source_id, title, created?, updated?, content, slug? }]
 *   - source_id : stable upstream id (required) - dedup + filename key
 *   - content   : the text body to store (required)
 *   - created/updated : ISO date strings (optional)
 *
 * Prints a JSON summary: { source, total, new, updated, unchanged, skipped, sample }
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { classify, markSeen } from '@nello/core'
import { noteWithProvenance } from '@nello/vault-seeder'

function die(msg) { process.stderr.write(`archive-items: ${msg}\n`); process.exit(2) }

function arg(name, def = null) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'untitled'
}
function shortId(s) { return createHash('sha256').update(String(s)).digest('hex').slice(0, 8) }
function today() { return new Date().toISOString().slice(0, 10) }

const source = arg('source') || die('--source required')
const vault = arg('vault') || die('--vault required')
const subdir = arg('subdir') || `Imports/${source}`
const itemsPath = arg('items') || die('--items required')
const prefix = arg('prefix', 'Log')
const toolkit = arg('toolkit', source)
const scope = arg('scope', 'item')
const type = arg('type', 'log')

let items
try { items = JSON.parse(readFileSync(itemsPath, 'utf-8')) }
catch (e) { die(`could not read items ${itemsPath}: ${e.message}`) }
if (!Array.isArray(items)) die('items file must be a JSON array')

const summary = { source, total: items.length, new: 0, updated: 0, unchanged: 0, skipped: 0, errors: 0, sample: [] }

for (const it of items) {
  // Accept the parse-chatgpt.mjs shape ({id, transcript}) as well as the
  // generic connected-source shape ({source_id, content}).
  const source_id = it && (it.source_id ?? it.id)
  const content = it && (it.content ?? it.transcript)
  if (!source_id || !content) { summary.skipped++; continue }

  const { verdict, hash, previous } = classify(source, String(source_id), content)
  if (verdict === 'unchanged') { summary.unchanged++; continue }

  const date = (it.created || it.updated || today()).slice(0, 10)
  const month = date.slice(0, 7)
  const slug = it.slug ? slugify(it.slug) : slugify(it.title || source_id)
  // Deterministic path from source_id so an 'updated' item overwrites its own
  // note. Reuse the previously recorded path if we have one.
  const path = previous && previous.vault_path
    ? previous.vault_path
    : join(vault, subdir, month, `${prefix}-${source}-${slug}-${shortId(source_id)}.md`)

  // Never clobber a note the user has hand-edited since we last wrote it.
  if (previous && previous.vault_path && existsSync(previous.vault_path)) {
    try {
      if (statSync(previous.vault_path).mtimeMs > previous.written_at + 1000) {
        process.stderr.write(`archive-items: skip hand-edited ${previous.vault_path}\n`)
        summary.skipped++
        continue
      }
    } catch { /* stat failed, fall through and rewrite */ }
  }

  const meta = {
    source, source_id: String(source_id), toolkit, scope,
    content_hash: hash, type, tags: [source, 'imported'], date,
    title: it.title || source_id,
  }
  if (it.created) meta.time_range = { from: it.created, to: it.updated || it.created }

  const body = `# ${it.title || source_id}\n\n${content}`
  const note = noteWithProvenance(meta, body)
  // One bad write (disk full, permission) must not abort the whole batch or
  // resumption breaks - log it, count it, keep going. markSeen only records
  // after a successful write, so a failed item is retried on the next run.
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, note, 'utf-8')
    markSeen({ source, source_id: String(source_id), content_hash: hash, vault_path: path })
  } catch (e) {
    process.stderr.write(`archive-items: write failed for ${source_id}: ${e.message}\n`)
    summary.errors++
    continue
  }

  if (verdict === 'new') summary.new++; else summary.updated++
  if (summary.sample.length < 5) summary.sample.push(path)
}

process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
