#!/usr/bin/env node
/**
 * SessionStart hook (cross-platform Node version, replaces inject-brain-context.sh).
 * Cats brain-context + graphify summary + today's/yesterday's journal into the new session.
 *
 * Reads NC_INSTALL_PATH from env (set by daemon launcher).
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const INSTALL = process.env.NC_INSTALL_PATH || process.cwd()

// Resolve vault path from .env, fall back to <install>/vault
function resolveVault() {
  const envPath = join(INSTALL, '.env')
  if (existsSync(envPath)) {
    const env = readFileSync(envPath, 'utf-8')
    const match = env.match(/^VAULT_PATH=(.+)$/m)
    if (match) return match[1].replace(/^["']|["']$/g, '').trim()
  }
  return join(INSTALL, 'vault')
}
const VAULT = resolveVault()

function ymd(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const today = ymd(new Date())
const yesterday = ymd(new Date(Date.now() - 86400000))

// Per-file and aggregate caps stop a pathologically large vault file from
// blowing the SessionStart hook budget (and Claude's context window). A user
// who lets MEMORY.md or Inbox.md grow to thousands of lines used to inject
// the entire file into every new session, every time.
const PER_FILE_LINES = 200
const PER_FILE_BYTES = 32 * 1024
const TOTAL_BYTES_CAP = 192 * 1024

let totalEmitted = 0

function emitFile(label, path, head = 0) {
  if (!existsSync(path)) return
  if (totalEmitted >= TOTAL_BYTES_CAP) {
    console.log(`## ${label}\n_(skipped — SessionStart injection budget exhausted)_\n`)
    return
  }
  let body = readFileSync(path, 'utf-8')
  const effectiveLineCap = head > 0 ? Math.min(head, PER_FILE_LINES) : PER_FILE_LINES
  const lines = body.split('\n')
  let truncated = false
  if (lines.length > effectiveLineCap) {
    body = lines.slice(0, effectiveLineCap).join('\n')
    truncated = true
  }
  if (body.length > PER_FILE_BYTES) {
    body = body.slice(0, PER_FILE_BYTES)
    truncated = true
  }
  const remaining = TOTAL_BYTES_CAP - totalEmitted
  if (body.length > remaining) {
    body = body.slice(0, remaining)
    truncated = true
  }
  totalEmitted += body.length
  console.log(`## ${label}`)
  console.log(body)
  if (truncated) console.log(`\n_(truncated by SessionStart hook — open ${path} for the full file)_`)
  console.log('')
}

emitFile('Brain Context', join(INSTALL, 'brain-context.md'))
emitFile('Tool Rules (pinned — CRITICAL rules MUST be followed)', join(INSTALL, '.claude', 'tool-rules.md'))
emitFile('Knowledge Graph (auto-loaded)', join(VAULT, 'graphify-out', 'GRAPH_REPORT.md'), 100)
emitFile('Memory Index', join(VAULT, 'Memory', 'MEMORY.md'))
emitFile(`Journal - ${today}`, join(VAULT, 'Journal', `${today}.md`))
emitFile(`Journal - ${yesterday}`, join(VAULT, 'Journal', `${yesterday}.md`))
emitFile('Inbox', join(VAULT, 'Inbox.md'))
