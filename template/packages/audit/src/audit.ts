import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { homedir } from 'node:os'
import { PROJECT_ROOT, STORE_DIR, VAULT_PATH, listTasks, setTaskStatus, type Task } from '@nello/core'

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

// ---------- deep diagnostics (nello doctor --deep) ----------
// The shallow audit checks files exist. --deep answers the questions a broken client
// install actually raises: did the brain migrate to OpenAI, is a runaway cron burning
// the API. It is also the Phase-C verify gate: a dead brain here exits non-zero.

function readEnvVal(key: string): string | null {
  try {
    const txt = readFileSync(join(PROJECT_ROOT, '.env'), 'utf-8')
    const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'))
    return m ? m[1].replace(/^["']|["']$/g, '').trim() : null
  } catch { return null }
}

function readBundle(): Record<string, unknown> {
  try { return JSON.parse(readFileSync(join(PROJECT_ROOT, 'bundle.json'), 'utf-8')) } catch { return {} }
}

function deepChecks(): Check[] {
  const out: Check[] = []
  const bundle = readBundle()
  const brainExpected = bundle.enableRecall !== false
  const openaiKey = readEnvVal('OPENAI_API_KEY')
  const memEngine = readEnvVal('NC_MEMORY_ENGINE')

  // The #1 reason an updated install has no memory: the brain key was never collected.
  if (brainExpected) {
    out.push({
      name: 'brain: OPENAI_API_KEY',
      ok: !!openaiKey,
      detail: openaiKey ? 'present' : 'MISSING - paste it in .env (platform.openai.com), then run /update or /build-recall so memory works',
    })
  }

  // gbrain engine + embedding config: catch a store left on Voyage / the wrong dimension.
  const gbrainBin = join(homedir(), '.bun', 'bin', 'gbrain')
  if (brainExpected && openaiKey) {
    out.push({ name: 'brain: gbrain engine', ok: existsSync(gbrainBin), detail: existsSync(gbrainBin) ? 'installed' : 'not installed - run /update (or bun install -g github:garrytan/gbrain)' })
  }
  const cfgPath = join(homedir(), '.gbrain', 'config.json')
  if (existsSync(cfgPath)) {
    let model = '', dims = 0
    try { const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')); model = String(cfg.embedding_model || ''); dims = Number(cfg.embedding_dimensions) } catch { /* unreadable -> flagged below */ }
    const onTarget = model.startsWith('openai') && dims === 1536
    out.push({ name: 'brain: embedding model', ok: onTarget, detail: onTarget ? `${model} / ${dims}d` : `${model || 'unknown'} / ${dims || '?'}d - STALE (target openai:text-embedding-3-small/1536). Run /update or /build-recall to re-embed.` })
  } else if (brainExpected && openaiKey) {
    out.push({ name: 'brain: embedding config', ok: false, detail: '~/.gbrain/config.json missing - recall not initialised; run /update or /build-recall' })
  }
  if (brainExpected) {
    const engineOn = memEngine === 'gbrain'
    out.push({ name: 'brain: memory engine', ok: engineOn || !openaiKey, detail: engineOn ? 'gbrain' : (openaiKey ? 'legacy/FTS - key present but engine not flipped; re-run /update' : 'legacy/FTS - no key yet') })
  }

  // Scheduled tasks: list every cron and flag the email-scrape cost path + duplicates.
  let tasks: Task[] = []
  try { tasks = listTasks() } catch { /* db not created yet */ }
  if (tasks.length === 0) {
    out.push({ name: 'scheduled tasks', ok: true, detail: 'none' })
  } else {
    for (const t of tasks) {
      const isFetch = String(t.prompt).includes('/auto-fetch')
      const everyN = (String(t.schedule).match(/^\*\/(\d+)\s/) || [])[1]
      const n = everyN ? parseInt(everyN, 10) : null
      const tooHot = isFetch && n !== null && n < 20
      out.push({
        name: `task ${t.id} [${t.status}]`,
        ok: !tooHot,
        detail: `${t.schedule}${isFetch ? ' (auto-fetch: reads email, costs OpenAI credit)' : ''}${tooHot ? ` - every ${n} min, hotter than the 20-min default; \`nello autofetch off\` to stop (deduped on next /update)` : ''}`,
      })
    }
    const fetchTasks = tasks.filter(t => String(t.prompt).includes('/auto-fetch'))
    if (fetchTasks.length > 1) {
      out.push({ name: 'auto-fetch duplicates', ok: false, detail: `${fetchTasks.length} auto-fetch tasks (${fetchTasks.map(t => t.id).join(', ')}) - the next /update collapses these to one` })
    }
  }
  return out
}

export function runDoctor(deep = false): void {
  if (!deep) { runAudit(); return }
  console.log(`\n${ACCENT}nello doctor --deep${RESET}\n${DIM}${'─'.repeat(44)}${RESET}`)
  const checks = [...runChecks(), ...deepChecks()]
  let failed = 0
  for (const c of checks) {
    console.log(`  ${tick(c.ok)}  ${WHITE}${c.name}${RESET}${warn(c.detail)}`)
    if (!c.ok) failed++
  }
  console.log(`${DIM}${'─'.repeat(44)}${RESET}`)
  if (failed === 0) {
    console.log(`${ACCENT}All checks passed (deep).${RESET}\n`)
  } else {
    console.log(`${ACCENT}${failed} check(s) failed.${RESET}\n`)
    process.exit(1)
  }
}

// ---------- nello autofetch on|off|status ----------
// The owner-facing opt-out the post-update Telegram message points at. `off` pauses the
// task AND persists enableAutoFetch=false to bundle.json so a later /update won't
// re-seed it. `on` reverses both.
function patchBundleFlag(key: string, value: boolean): void {
  const bundlePath = join(PROJECT_ROOT, 'bundle.json')
  try {
    if (!existsSync(bundlePath)) return  // bundle deleted post-install; pausing the task is enough
    const b = JSON.parse(readFileSync(bundlePath, 'utf-8'))
    b[key] = value
    writeFileSync(bundlePath, JSON.stringify(b, null, 2) + '\n')
  } catch (err) {
    console.error(`(could not persist ${key} to bundle.json: ${err instanceof Error ? err.message : String(err)})`)
  }
}

export function runAutofetch(action: string): void {
  let tasks: Task[] = []
  try { tasks = listTasks().filter(t => String(t.prompt).includes('/auto-fetch')) } catch { /* no db */ }

  if (action === 'status') {
    if (!tasks.length) { console.log('auto-fetch: not registered'); return }
    for (const t of tasks) console.log(`auto-fetch ${t.id}: ${t.status} (${t.schedule})`)
    return
  }
  if (action === 'off') {
    for (const t of tasks) setTaskStatus(t.id, 'paused')
    patchBundleFlag('enableAutoFetch', false)
    console.log(`auto-fetch paused (${tasks.length} task${tasks.length === 1 ? '' : 's'}). It won't read your email or spend OpenAI credit until you run \`nello autofetch on\`.`)
    return
  }
  if (action === 'on') {
    for (const t of tasks) setTaskStatus(t.id, 'active')
    patchBundleFlag('enableAutoFetch', true)
    console.log(tasks.length ? `auto-fetch resumed (${tasks.length} task${tasks.length === 1 ? '' : 's'}).` : 'auto-fetch will be seeded on the next /update or daemon start.')
    return
  }
  console.log('Usage: nello autofetch <on|off|status>')
  process.exit(1)
}
