#!/usr/bin/env node
/**
 * UserPromptSubmit hook - scans the user's latest prompt for memory triggers
 * and writes a memory note straight into the Obsidian vault.
 *
 * Stdin: { prompt: string, session_id?: string, cwd?: string }
 * Writes to: <install>/vault/Memory/<type>_<slug>_<date>.md
 * Updates:   <install>/vault/Memory/MEMORY.md (index)
 *
 * The vault IS the memory. Obsidian indexes these notes via the graph view +
 * full-text search. SessionStart hook reads them back into new conversations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'

const raw = readFileSync(0, 'utf-8').trim()
if (!raw) process.exit(0)

let payload
try { payload = JSON.parse(raw) } catch { process.exit(0) }

const prompt = (payload.prompt || '').trim()
if (!prompt || prompt.length < 15) process.exit(0)

// Resolve install path - prefer NC_INSTALL_PATH (set by daemon launcher), fall back to cwd.
const INSTALL = process.env.NC_INSTALL_PATH || payload.cwd || process.cwd()

// Vault path lives in .env. Default to <install>/vault.
let vaultPath = join(INSTALL, 'vault')
const envPath = join(INSTALL, '.env')
if (existsSync(envPath)) {
  const envText = readFileSync(envPath, 'utf-8')
  const match = envText.match(/^VAULT_PATH=(.+)$/m)
  if (match) vaultPath = match[1].replace(/^["']|["']$/g, '').trim()
}
const memDir = join(vaultPath, 'Memory')

const SIGNALS = {
  user: /\b(my (role|job|name|company|age|timezone|location|email|phone) is|i(?:'|\s)?m (a|an|the) |i work (at|as)|i live in)\b/i,
  feedback: /\b(don'?t|never|stop|always|actually|no,|correction[:,]?|that'?s wrong|prefer(?:red)?|i (like|want) you to)\b/i,
  project: /\b(deadline|launching|ship(?:ping)?|freeze|deploy|release|due by|working on|project [a-z])\b/i,
  reference: /\b(lives at|find(?:s)? (it|them) in|we track [a-z]+ in|the (dashboard|board|channel|folder|doc) for)\b/i,
}

let type = null
for (const [k, re] of Object.entries(SIGNALS)) {
  if (re.test(prompt)) { type = k; break }
}
if (!type) process.exit(0)

mkdirSync(memDir, { recursive: true })

const slug = prompt.toLowerCase()
  .replace(/[^a-z0-9\s]/g, '')
  .split(/\s+/)
  .filter(w => w.length > 3)
  .slice(0, 4)
  .join('_') || 'note'

// 6-char prompt hash so two prompts with the same first-4-long-words on the
// same day don't silently overwrite each other. Previous behaviour: existsSync
// → exit 0, second prompt dropped. Now each unique prompt gets its own file.
const hash = createHash('sha256').update(prompt).digest('hex').slice(0, 6)
const ts = new Date().toISOString().slice(0, 10)
const fname = `${type}_${slug}_${ts}_${hash}.md`
const fpath = join(memDir, fname)

if (existsSync(fpath)) process.exit(0)

const title = `${type}: ${slug.replace(/_/g, ' ')}`

const body = `---
name: ${title}
description: Auto-captured from prompt on ${ts}
type: ${type}
tags: [memory, ${type}]
date: ${ts}
---

${prompt}
`
writeFileSync(fpath, body, 'utf-8')

const indexPath = join(memDir, 'MEMORY.md')
const line = `- [[${fname.replace(/\.md$/, '')}|${title}]] - captured ${ts}`

if (existsSync(indexPath)) {
  const existing = readFileSync(indexPath, 'utf-8')
  if (!existing.includes(fname.replace(/\.md$/, ''))) {
    writeFileSync(indexPath, existing.trimEnd() + '\n' + line + '\n', 'utf-8')
  }
} else {
  const seed = `---
name: Memory Index
description: Auto-captured memories from your Claude conversations
tags: [memory, index]
---

# Memory

Your assistant captures things here automatically. Each note has a type (user / feedback / project / reference). Open the graph view in Obsidian to see them clustered.

${line}
`
  writeFileSync(indexPath, seed, 'utf-8')
}

process.exit(0)
