#!/usr/bin/env node
/**
 * parse-chatgpt.mjs - pure-Node normaliser for a ChatGPT data export.
 *
 * Zero dependencies. Reads the `conversations.json` that ships inside a ChatGPT
 * "Export data" download and turns it into a flat, easy-to-archive array.
 *
 * Input  : a path to conversations.json, a directory to search for it (an
 *          unzipped export folder, or ~/Downloads), OR the raw .zip from the
 *          ChatGPT "Export data" download - a .zip is unzipped to a temp dir
 *          automatically using the OS unzip tool (no npm deps).
 * Output : JSON on stdout (or --out <file>).
 *
 * Flags  :
 *   --out <file>   write the normalised array to <file> instead of stdout
 *   --index        print only a summary { count, from, to, total_messages,
 *                  titles[] } - use this for the confirm-before-run step
 *
 * Normalised conversation:
 *   { id, title, created, updated, message_count,
 *     messages: [{ role, text }], transcript }
 *
 * Malformed conversations are skipped (counted), never fatal.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

function die(msg) { process.stderr.write(`parse-chatgpt: ${msg}\n`); process.exit(2) }

// Temp dir holding an unzipped export. Wiped on exit (any path, incl. die/early-exit)
// so a full plaintext copy of the user's ChatGPT history never lingers in OS temp.
let tempDir = null
process.on('exit', () => { if (tempDir) { try { rmSync(tempDir, { recursive: true, force: true }) } catch { /* best effort */ } } })

// If the input is the raw ChatGPT "Export data" .zip, unzip it to a temp dir and
// return that dir (findConversationsJson then walks it). Otherwise return the path
// unchanged. Shells the OS unzip tool so the parser keeps zero npm dependencies.
function resolveExport(input) {
  if (!existsSync(input)) die(`path not found: ${input}`)
  if (statSync(input).isFile() && input.toLowerCase().endsWith('.zip')) {
    const abs = resolve(input)  // absolute path: never mis-parsed as a leading-dash flag
    const dest = mkdtempSync(join(tmpdir(), 'cgpt-export-'))
    tempDir = dest
    try {
      if (process.platform === 'win32') {
        // Pass paths via env vars, NOT string-interpolated into -Command, so a path
        // containing $(...) or backticks cannot execute as PowerShell.
        execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command',
          '$ErrorActionPreference="Stop"; Expand-Archive -LiteralPath $env:NC_CGPT_ZIP -DestinationPath $env:NC_CGPT_DEST -Force'],
          { stdio: 'ignore', env: { ...process.env, NC_CGPT_ZIP: abs, NC_CGPT_DEST: dest } })
      } else {
        execFileSync('unzip', ['-o', '-q', abs, '-d', dest], { stdio: 'ignore' })
      }
    } catch (e) {
      // macOS fallback: ditto unzips when the bundled `unzip` chokes on a big export.
      if (process.platform === 'darwin') {
        try { execFileSync('ditto', ['-x', '-k', abs, dest], { stdio: 'ignore' }) }
        catch { die(`could not unzip ${input}: ${e.message}`) }
      } else {
        die(`could not unzip ${input}: ${e.message}`)
      }
    }
    // A leading-dash or empty archive can exit 0 yet extract nothing - fail loudly.
    if (!readdirSync(dest).length) die(`nothing extracted from ${input} - is it a valid .zip?`)
    return dest
  }
  return input
}

// Find conversations.json at the root or nested under it. Exports put it under a
// dated subfolder; double-zipped/wrapped exports go one deeper - so walk a few levels
// (capped, cheap), in sorted order so the pick is deterministic across platforms.
function findConversationsJson(input) {
  if (!existsSync(input)) die(`path not found: ${input}`)
  if (statSync(input).isFile()) return input
  const found = searchDir(input, 4)
  if (found) return found
  die(`no conversations.json found under ${input}`)
}

function searchDir(dir, depth) {
  const direct = join(dir, 'conversations.json')
  try { if (statSync(direct).isFile()) return direct } catch { /* not here */ }
  if (depth <= 0) return null
  let entries
  try { entries = readdirSync(dir).sort() } catch { return null }
  for (const entry of entries) {
    const full = join(dir, entry)
    try {
      if (statSync(full).isDirectory()) {
        const hit = searchDir(full, depth - 1)
        if (hit) return hit
      }
    } catch { /* unreadable entry, skip */ }
  }
  return null
}

function isoFromEpoch(sec) {
  if (typeof sec !== 'number' || !isFinite(sec)) return null
  return new Date(sec * 1000).toISOString()
}

// ChatGPT message content comes in several shapes; pull out plain text only.
function partsToText(content) {
  if (!content || typeof content !== 'object') return ''
  if (Array.isArray(content.parts)) {
    const out = []
    for (const p of content.parts) {
      if (typeof p === 'string') out.push(p)
      else if (p && typeof p === 'object' && typeof p.text === 'string') out.push(p.text)
      // image / audio / file pointers are skipped on purpose
    }
    return out.join('\n').trim()
  }
  if (typeof content.text === 'string') return content.text.trim()
  return ''
}

function roleLabel(role) {
  if (role === 'assistant') return 'Assistant'
  if (role === 'user') return 'User'
  if (role === 'tool') return 'Tool'
  return String(role || 'unknown')
}

function normaliseConversation(conv) {
  const mapping = conv && conv.mapping
  if (!mapping || typeof mapping !== 'object') return null
  const messages = []
  for (const nodeId of Object.keys(mapping)) {
    const node = mapping[nodeId]
    const m = node && node.message
    if (!m || typeof m !== 'object') continue
    const role = m.author && m.author.role
    if (!role || role === 'system') continue
    if (m.metadata && m.metadata.is_visually_hidden_from_conversation) continue
    const text = partsToText(m.content)
    if (!text) continue
    messages.push({ role, text, ts: typeof m.create_time === 'number' ? m.create_time : 0 })
  }
  if (messages.length === 0) return null
  messages.sort((a, b) => a.ts - b.ts)
  const created = isoFromEpoch(conv.create_time)
  const updated = isoFromEpoch(conv.update_time) || created
  const transcript = messages.map(x => `${roleLabel(x.role)}: ${x.text}`).join('\n\n')
  return {
    id: conv.conversation_id || conv.id || null,
    title: (conv.title && String(conv.title).trim()) || '(untitled)',
    created,
    updated,
    message_count: messages.length,
    messages: messages.map(({ role, text }) => ({ role, text })),
    transcript,
  }
}

// ---- main ----
const argv = process.argv.slice(2)
if (argv.length === 0 || argv[0].startsWith('--')) {
  die('usage: node parse-chatgpt.mjs <conversations.json|dir> [--out file] [--index]')
}
const input = argv[0]
const outIdx = argv.indexOf('--out')
const outFile = outIdx >= 0 ? argv[outIdx + 1] : null
const indexOnly = argv.includes('--index')

const jsonPath = findConversationsJson(resolveExport(input))

// Guard the in-memory parse: readFileSync as a string caps at ~512MB (V8 max string)
// and parsed objects balloon past that, so refuse oversized exports with a clear
// message instead of a cryptic RangeError mislabelled as a parse failure.
const MAX_JSON_BYTES = 400 * 1024 * 1024
const jsonBytes = statSync(jsonPath).size
if (jsonBytes > MAX_JSON_BYTES) {
  die(`conversations.json is ${Math.round(jsonBytes / 1e6)}MB - too large to parse in memory (cap ${Math.round(MAX_JSON_BYTES / 1e6)}MB). Split the export and import in parts.`)
}
let raw
try { raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) }
catch (e) {
  const hint = e instanceof RangeError ? ' (export too large to hold in memory)' : ''
  die(`could not parse ${jsonPath}: ${e.message}${hint}`)
}
if (!Array.isArray(raw)) die('conversations.json is not a JSON array (unexpected export shape)')

const convos = []
let skipped = 0
for (const conv of raw) {
  try {
    const n = normaliseConversation(conv)
    if (n) convos.push(n); else skipped++
  } catch { skipped++ }
}
convos.sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')))

if (indexOnly) {
  const dates = convos.map(c => c.created).filter(Boolean).sort()
  const summary = {
    count: convos.length,
    skipped,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    total_messages: convos.reduce((s, c) => s + c.message_count, 0),
    titles: convos.slice(0, 25).map(c => c.title),
  }
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n')
  process.exit(0)
}

const payload = JSON.stringify(convos)
if (outFile) {
  writeFileSync(outFile, payload, 'utf-8')
  process.stderr.write(`parse-chatgpt: wrote ${convos.length} conversations (${skipped} skipped) -> ${outFile}\n`)
} else {
  process.stdout.write(payload)
}
