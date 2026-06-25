#!/usr/bin/env node
/**
 * PostToolUse hook - keeps gbrain semantic recall fresh after vault edits.
 *
 * Registered ONLY on a brain-enabled install (an OPENAI_API_KEY is present), so a
 * keyless box never runs this. Mirrors graphify-incremental.js: non-fatal, skips
 * silently if gbrain isn't installed.
 *
 * Imports from the VAULT ROOT (same root as bootstrap's seedRecall) so page slugs
 * stay consistent - importing a subfolder would mint a divergent duplicate of the
 * same note. `gbrain import` is content-hash incremental, so re-importing the root
 * only embeds the file that actually changed.
 *
 * Cost discipline (keeps OpenAI bills sane):
 *  - Skips the Imports/ tree as a TRIGGER - /build-brain dumps thousands of archive
 *    notes there; embedding them is an explicit /build-recall step, not a silent
 *    per-edit side effect.
 *  - Refuses to auto-import a vault over 800 notes (defers to /build-recall).
 *  - Debounces: at most one import per 10s, and never two concurrent imports
 *    against the single-writer PGLite store (a lockfile guards both).
 */

import { readFileSync, existsSync, realpathSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'

const INSTALL = process.env.NC_INSTALL_PATH || join(homedir(), 'nello-claw')
const GBRAIN_BIN = join(homedir(), '.bun', 'bin', 'gbrain')
if (!existsSync(GBRAIN_BIN)) process.exit(0)

let payload = ''
try { payload = readFileSync(0, 'utf-8') } catch { process.exit(0) }
let parsed
try { parsed = JSON.parse(payload) } catch { process.exit(0) }

const touched = parsed?.tool_input?.file_path
if (!touched || !touched.endsWith('.md')) process.exit(0)

// Resolve the vault + the OpenAI key from .env (same source the daemon reads).
const envPath = join(INSTALL, '.env')
if (!existsSync(envPath)) process.exit(0)
const envText = readFileSync(envPath, 'utf-8')
const vaultMatch = envText.match(/^VAULT_PATH=(.+)$/m)
const vaultPath = vaultMatch ? vaultMatch[1].replace(/^["']|["']$/g, '').trim() : null
if (!vaultPath) process.exit(0)
const openaiMatch = envText.match(/^OPENAI_API_KEY=(.+)$/m)
const openaiKey = openaiMatch ? openaiMatch[1].replace(/^["']|["']$/g, '').trim() : ''
if (!openaiKey) process.exit(0)

function resolveSafely(p) {
  try { return realpathSync(p) } catch { return resolve(p) }
}
const touchedReal = resolveSafely(touched)
const vaultReal = resolveSafely(vaultPath)
// Must be strictly inside the vault.
if (touchedReal !== vaultReal && !touchedReal.startsWith(vaultReal + sep)) process.exit(0)

// Don't let the bulk/auto-generated trees TRIGGER a sync (the cost guard). Imports/
// is the /build-brain backfill (embed it explicitly); Memory/Journal are churny
// auto-notes already covered by FTS.
const rel = touchedReal.slice(vaultReal.length + 1)
const top = rel.split(sep)[0]
if (top === 'Imports' || top === 'Memory' || top === 'Journal' || top === '.obsidian' || top === '.git') process.exit(0)

// Debounce: one import per 10s, and never two at once (PGLite is single-writer).
// A whole-vault import catches every change since the last run, so skipping a
// closely-following edit is safe - the in-flight (or next) import covers it.
const lock = join(INSTALL, 'store', '.gbrain-sync.lock')
try {
  const age = Date.now() - statSync(lock).mtimeMs
  if (age < 10000) process.exit(0)
} catch { /* no lock yet */ }

// Cost guard: refuse a large vault (post /build-brain) - that's a /build-recall job.
function countMarkdown(dir, cap = 801) {
  let n = 0
  const stack = [dir]
  while (stack.length && n <= cap) {
    let entries = []
    try { entries = readdirSync(stack.pop(), { withFileTypes: true }) } catch { continue }
    for (const e of entries) {
      const p = join(e.path ?? dir, e.name)
      if (e.isDirectory()) { if (e.name !== '.obsidian' && e.name !== '.git') stack.push(p) }
      else if (e.name.endsWith('.md')) { n++; if (n > cap) break }
    }
  }
  return n
}
if (countMarkdown(vaultReal) > 800) process.exit(0)

try { writeFileSync(lock, String(process.pid)) } catch { /* best-effort */ }

const PATH = [join(homedir(), '.bun', 'bin'), join(homedir(), '.local', 'bin'),
  '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'].join(':')

execFile(
  GBRAIN_BIN,
  ['import', vaultReal],
  { detached: true, stdio: 'ignore', env: { PATH, HOME: homedir(), OPENAI_API_KEY: openaiKey } },
  (err) => {
    try { unlinkSync(lock) } catch { /* already gone */ }
    if (err && process.env.NC_GBRAIN_HOOK_DEBUG) {
      process.stderr.write(`gbrain-sync: ${err.message?.split('\n')[0] || 'unknown error'}\n`)
    }
  },
)
process.exit(0)
