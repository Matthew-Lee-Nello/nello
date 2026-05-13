#!/usr/bin/env node
/**
 * PostToolUse hook (cross-platform Node version, replaces graphify-incremental.sh).
 * Rebuilds the knowledge graph incrementally after vault edits. Non-fatal.
 * Skips silently if graphify is not installed.
 */

import { readFileSync, existsSync, realpathSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { homedir } from 'node:os'
import { execFile } from 'node:child_process'

const INSTALL = process.env.NC_INSTALL_PATH || join(homedir(), 'nello-claw')

// Read stdin payload (JSON from Claude Code hook system)
let payload = ''
try { payload = readFileSync(0, 'utf-8') } catch { process.exit(0) }
let parsed
try { parsed = JSON.parse(payload) } catch { process.exit(0) }

const touched = parsed?.tool_input?.file_path
if (!touched) process.exit(0)

// Bail unless touched file is inside vault
const envPath = join(INSTALL, '.env')
if (!existsSync(envPath)) process.exit(0)
const envText = readFileSync(envPath, 'utf-8')
const match = envText.match(/^VAULT_PATH=(.+)$/m)
const vaultPath = match ? match[1].replace(/^["']|["']$/g, '').trim() : null
if (!vaultPath) process.exit(0)

// Real path-prefix check. The previous startsWith comparison let
// `/Users/x/vault-evil/note.md` pass when VAULT_PATH was `/Users/x/vault`
// (a classic prefix-confusion bug) and treated unresolved symlink-traversal
// paths as inside-vault. Normalise both sides and require an exact match
// or path-separator boundary.
function resolveSafely(p) {
  try { return realpathSync(p) } catch { return resolve(p) }
}
const touchedReal = resolveSafely(touched)
const vaultReal = resolveSafely(vaultPath)
if (touchedReal !== vaultReal && !touchedReal.startsWith(vaultReal + sep)) process.exit(0)

// Fire-and-forget incremental rebuild. Detached, but log non-zero exits to
// stderr so a missing/poisoned `graphify` binary doesn't fail silently.
execFile('graphify', ['rebuild', '--incremental'], { cwd: vaultReal, detached: true, stdio: 'ignore' }, (err) => {
  if (err && process.env.NC_GRAPHIFY_HOOK_DEBUG) {
    process.stderr.write(`graphify-incremental: ${err.message?.split('\n')[0] || 'unknown error'}\n`)
  }
})
process.exit(0)
