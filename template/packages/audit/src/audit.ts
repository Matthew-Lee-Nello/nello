import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { PROJECT_ROOT, STORE_DIR, VAULT_PATH } from '@nello/core'

export interface Check {
  name: string
  ok: boolean
  detail?: string
}

// Theme: FFA600 accent via 24-bit truecolour, white text.
const ACCENT = '\x1b[38;2;255;166;0m'
const WHITE = '\x1b[38;2;255;255;255m'
const RED = '\x1b[38;2;255;80;80m'
const DIM = '\x1b[2m'
const RESET = '\x1b[0m'

function tick(ok: boolean): string {
  return ok ? `${ACCENT}OK${RESET}` : `${RED}X${RESET}`
}

function warn(detail?: string): string {
  return detail ? ` ${DIM}- ${detail}${RESET}` : ''
}

function runChecks(): Check[] {
  const checks: Check[] = []

  // 1. Core files exist
  for (const f of ['CLAUDE.md', 'AGENTS.md', '.env', '.mcp.json']) {
    const p = join(PROJECT_ROOT, f)
    checks.push({ name: `file: ${f}`, ok: existsSync(p), detail: existsSync(p) ? undefined : p })
  }

  // 2. Store dir with DB
  const dbPath = join(STORE_DIR, 'clawd.db')
  // DB is created on first daemon run - treat missing as OK, just note it.
  checks.push({ name: 'SQLite DB', ok: true, detail: existsSync(dbPath) ? dbPath : `${dbPath} (will be created on first run)` })

  // 3. Vault
  const vaultExists = existsSync(VAULT_PATH)
  checks.push({ name: 'Vault path', ok: vaultExists, detail: VAULT_PATH })
  if (vaultExists) {
    const hasInbox = existsSync(join(VAULT_PATH, 'Inbox.md'))
    checks.push({ name: 'Vault Inbox.md', ok: hasInbox })
    const rules = existsSync(join(VAULT_PATH, 'Resource-Vault-Rules.md')) || existsSync(join(VAULT_PATH, 'VAULT-RULES.md'))
    checks.push({ name: 'Vault rules', ok: rules })
  }

  // 4. Skill symlinks. Source of truth is the bundled template/skills/ directory:
  // anything shipped there must be linked into ~/.claude/skills/. Reading the
  // directory at audit time instead of a hardcoded list prevents drift.
  const skillsDir = process.env.NC_SKILLS_DIR || join(homedir(), '.claude', 'skills')
  const bundledSkillsDir = join(PROJECT_ROOT, 'template', 'skills')
  let expected: string[] = []
  try {
    if (existsSync(bundledSkillsDir)) {
      expected = readdirSync(bundledSkillsDir, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.'))
        .map(e => e.name)
    }
  } catch { /* leave empty, will report as no checks rather than false negatives */ }
  for (const s of expected) {
    const p = join(skillsDir, s)
    checks.push({ name: `skill: ${s}`, ok: existsSync(p) })
  }

  // 5. Claude Code CLI
  try {
    const out = execSync('claude --version', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    checks.push({ name: 'Claude CLI', ok: true, detail: out })
  } catch {
    checks.push({ name: 'Claude CLI', ok: false, detail: 'run: npm install -g @anthropic-ai/claude-code' })
  }

  // 6. Node version
  const nv = process.version
  const major = parseInt(nv.slice(1).split('.')[0], 10)
  checks.push({ name: 'Node 20+', ok: major >= 20, detail: nv })

  // 7. LaunchAgent (macOS only, skip if user opted out)
  if (process.platform === 'darwin') {
    const label = process.env.NC_LAUNCHAGENT_LABEL || 'com.nello.server'
    const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
    const projectPlist = join(PROJECT_ROOT, `${label}.plist`)
    if (existsSync(projectPlist) || existsSync(plist)) {
      checks.push({ name: 'LaunchAgent', ok: existsSync(plist), detail: plist })
    } else {
      checks.push({ name: 'LaunchAgent', ok: true, detail: 'not configured (opt-out)' })
    }
  }

  return checks
}

export function runAudit(): void {
  console.log(`\n${ACCENT}nello audit${RESET}\n${DIM}${'─'.repeat(44)}${RESET}`)
  const checks = runChecks()
  let failed = 0
  for (const c of checks) {
    console.log(`  ${tick(c.ok)}  ${WHITE}${c.name}${RESET}${warn(c.detail)}`)
    if (!c.ok) failed++
  }
  console.log(`${DIM}${'─'.repeat(44)}${RESET}`)
  if (failed === 0) {
    console.log(`${ACCENT}All checks passed.${RESET}\n`)
  } else {
    console.log(`${ACCENT}${failed} check(s) failed.${RESET}\n`)
    process.exit(1)
  }
}

export function runDoctor(): void {
  runAudit()
}
