#!/usr/bin/env node
/**
 * Safe self-merging update engine.
 *
 * The problem it solves: the interactive /update used `git pull --ff-only`, which a
 * single client edit to a TRACKED product file makes refuse - freezing the install on
 * stale update code (the chicken-and-egg that left an old client unable to pick up new
 * stack changes). This script salvages any such edits, hard-resets product files to
 * origin/main, rebuilds, runs the migrations + render, verifies, and AUTO-ROLLS-BACK on
 * any failure - so the box is either fully on the verified new version or fully back on
 * the old one. Client state (.env, bundle.json, vault/, store/, .mcp.json) is gitignored,
 * so the reset never touches it; the 4 files git can't restore are snapshotted first.
 *
 * Modes:
 *   (default)         full unattended update: snapshot -> stop -> salvage -> reset ->
 *                     build -> migrate -> verify -> (rollback on fail) -> start -> announce
 *   --salvage-reset   JUST the git unstick (snapshot + salvage + hard-reset to origin/main),
 *                     for the interactive /update skill to call when ff-only is refused;
 *                     the skill then continues with its own build + key prompts.
 *
 * Run from the install root (or with NC_INSTALL_PATH set). Headless: never prompts.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const INSTALL = process.env.NC_INSTALL_PATH || process.cwd()
const TEMPLATE_DIR = join(INSTALL, 'template')
const STORE_DIR = join(INSTALL, 'store')
const LOCK = join(STORE_DIR, 'update.lock')
const EXPECTED_REMOTE = 'Matthew-Lee-Nello/nello'
const SALVAGE_ONLY = process.argv.includes('--salvage-reset')

const ACCENT = '\x1b[38;2;255;166;0m'
const RED = '\x1b[38;2;255;80;80m'
const RESET = '\x1b[0m'
const log = (m) => console.log(`${ACCENT}[self-update]${RESET} ${m}`)
const err = (m) => console.log(`${RED}[self-update]${RESET} ${m}`)

function git(args, opts = {}) {
  return execSync(`git ${args}`, { cwd: INSTALL, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim()
}
function tryGit(args) { try { return { ok: true, out: git(args) } } catch (e) { return { ok: false, out: e.stderr?.toString() || e.message } } }

function readEnvVal(key) {
  try {
    const m = readFileSync(join(INSTALL, '.env'), 'utf-8').match(new RegExp('^' + key + '=(.*)$', 'm'))
    return m ? m[1].replace(/^["']|["']$/g, '').trim() : null
  } catch { return null }
}

async function telegram(text) {
  const token = readEnvVal('TELEGRAM_BOT_TOKEN')
  const chatId = String(readEnvVal('ALLOWED_CHAT_ID') || '').split(',')[0].trim()
  if (!token || !chatId) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }), signal: AbortSignal.timeout(8000),
    })
    return !!(await res.json().catch(() => ({}))).ok
  } catch { return false }
}

function stamp() { return new Date().toISOString().replace(/[:.]/g, '-') }

// --- preflight: refuse to hard-reset onto a stranger's main ---
function preflight() {
  if (!existsSync(join(INSTALL, '.git'))) { err(`${INSTALL} is not a git repo - cannot self-update. Re-clone from github.com/${EXPECTED_REMOTE}.`); process.exit(2) }
  const remote = tryGit('remote get-url origin')
  if (!remote.ok || !remote.out.includes(EXPECTED_REMOTE)) {
    err(`origin is ${remote.out || 'unset'}, not ${EXPECTED_REMOTE}. Refusing to hard-reset onto an unknown remote.`)
    process.exit(2)
  }
}

// --- single-flight lock (stale after 1h) ---
function acquireLock() {
  try {
    if (existsSync(LOCK)) {
      const age = Date.now() - Number(readFileSync(LOCK, 'utf-8').trim() || 0)
      if (age < 60 * 60 * 1000) { log('another update is in progress - exiting'); process.exit(0) }
    }
  } catch {}
  mkdirSync(STORE_DIR, { recursive: true })
  writeFileSync(LOCK, String(Date.now()))
}
function releaseLock() { try { if (existsSync(LOCK)) execSync(`rm -f "${LOCK}"`) } catch {} }

// --- snapshot the 4 files git can't restore + record the rollback commit ---
function snapshot() {
  const dir = join(INSTALL, '.nello-rollback', stamp())
  mkdirSync(dir, { recursive: true })
  for (const f of ['.env', 'bundle.json', '.mcp.json', '.nello-version']) {
    const src = join(INSTALL, f)
    if (existsSync(src)) { try { copyFileSync(src, join(dir, f)) } catch {} }
  }
  const commit = tryGit('rev-parse HEAD').out
  writeFileSync(join(dir, 'ROLLBACK_COMMIT'), commit)
  return { dir, commit }
}

// --- salvage client edits to tracked product files, then hard-reset to origin/main ---
function salvageAndReset() {
  // Only tracked files show here (client state is gitignored), so this lists exactly
  // the product-file edits the hard-reset is about to discard. Capture each as a diff
  // into the overlay quarantine so nothing is silently lost; a shipped skill edit also
  // gets copied into client-overlay/skills so it keeps loading after the reset.
  const status = tryGit('status --porcelain --untracked-files=no').out
  const edited = status.split('\n').map(l => l.slice(3).trim()).filter(Boolean)
  if (edited.length) {
    const qdir = join(INSTALL, 'client-overlay', 'quarantine', stamp())
    mkdirSync(qdir, { recursive: true })
    for (const f of edited) {
      const diff = tryGit(`diff -- "${f}"`).out
      if (diff) { try { writeFileSync(join(qdir, f.replace(/[\/]/g, '__') + '.patch'), diff) } catch {} }
      // A client-edited shipped skill survives as a standalone overlay skill.
      const m = f.match(/^template\/skills\/([^/]+)\//)
      if (m) {
        const dst = join(INSTALL, 'client-overlay', 'skills', m[1])
        try { mkdirSync(dst, { recursive: true }); execSync(`cp -R "${join(INSTALL, 'template', 'skills', m[1])}/." "${dst}/"`) } catch {}
      }
    }
    log(`salvaged ${edited.length} local edit(s) to client-overlay/quarantine`)
  }
  // Discard working-tree changes to tracked files and move product state to origin/main.
  // NOT `git stash -u` (that would sweep untracked client state); NOT a merge (could
  // leave conflict markers on a non-technical box). Hard-reset is convergent + clean.
  git('checkout -- .')
  const branch = tryGit('rev-parse --abbrev-ref HEAD').out
  if (branch === 'HEAD' || !branch) tryGit('checkout main')
  git('reset --hard origin/main')
}

function run(cmd) {
  log(`$ ${cmd}`)
  const r = spawnSync(cmd, { cwd: INSTALL, shell: true, stdio: 'pipe', env: { ...process.env, NC_INSTALL_PATH: INSTALL } })
  const out = (r.stdout?.toString() || '') + (r.stderr?.toString() || '')
  return { ok: r.status === 0, out }
}

function build() {
  let r = run('pnpm install --frozen-lockfile')
  if (!r.ok) r = run('pnpm install')
  if (!r.ok) return { ok: false, out: r.out }
  return run('pnpm -r build')
}

// --- verify gate: did the update leave a WORKING box? ---
// Hard requirements: build succeeded + daemon answers health. A missing OPENAI_API_KEY
// is NOT a failure (the box never had a brain; the announce asks the owner to paste it).
// But a brain that WAS on must not be left broken by the update - so when a key is
// present, the gbrain config must be on the OpenAI/1536 target. (Migration 0002 already
// guarantees it never wipes a keyless brain, so this only fires on a genuine regression.)
async function verifyGate(buildOk) {
  if (!buildOk) return { ok: false, why: 'build failed' }
  const port = readEnvVal('DASHBOARD_PORT') || '3000'
  let healthy = false
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/monitoring/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) { healthy = true; break }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!healthy) return { ok: false, why: 'daemon did not become healthy within 30s' }

  if (readEnvVal('OPENAI_API_KEY')) {
    const cfgPath = join(homedir(), '.gbrain', 'config.json')
    if (existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
        if (!String(cfg.embedding_model || '').startsWith('openai') || Number(cfg.embedding_dimensions) !== 1536) {
          return { ok: false, why: `brain config is ${cfg.embedding_model}/${cfg.embedding_dimensions}d, not openai/1536` }
        }
      } catch { return { ok: false, why: 'brain config unreadable after update' } }
    }
  }
  return { ok: true }
}

function rollback(snap) {
  err('rolling back to the previous version')
  tryGit(`reset --hard ${snap.commit}`)
  for (const f of ['.env', 'bundle.json', '.mcp.json', '.nello-version']) {
    const bak = join(snap.dir, f)
    if (existsSync(bak)) { try { copyFileSync(bak, join(INSTALL, f)) } catch {} }
  }
  build()
}

function daemon(action) {
  spawnSync('node', [join(TEMPLATE_DIR, 'scripts', 'install-service.js'), action], { cwd: INSTALL, stdio: 'inherit', env: { ...process.env, NC_INSTALL_PATH: INSTALL } })
}

async function main() {
  preflight()

  // Salvage-only: the interactive skill's frozen-pull recovery. Fetch, snapshot, salvage,
  // reset, done - the skill takes over from here (build + key prompts).
  if (SALVAGE_ONLY) {
    tryGit('fetch origin main')
    snapshot()
    salvageAndReset()
    log('product files reset to origin/main; client edits salvaged. Continue the update (build + bootstrap).')
    return
  }

  acquireLock()
  try {
    const fetched = tryGit('fetch origin main')
    if (!fetched.ok) { err(`git fetch failed: ${fetched.out.split('\n')[0]}`); return }
    const head = tryGit('rev-parse HEAD').out
    const remote = tryGit('rev-parse origin/main').out
    if (head && remote && head === remote) { log('already up to date - nothing to do'); return }

    const snap = snapshot()
    const oldVer = (() => { try { return JSON.parse(readFileSync(join(snap.dir, '.nello-version'), 'utf-8')).version } catch { return null } })()

    daemon('stop')
    salvageAndReset()

    const b = build()
    if (b.ok) {
      // Migrations + re-render + setupRecall (the actual upgrade). Non-interactive.
      const boot = run('node ./template/bootstrap.js')
      if (!boot.ok) b.ok = false
    }
    daemon('start')

    const gate = await verifyGate(b.ok)
    if (!gate.ok) {
      rollback(snap)
      daemon('start')
      await telegram(`Nello auto-update was rolled back safely.\n\nReason: ${gate.why}.\nYou're still on your previous working version (v${oldVer || '?'}). Nothing was lost. We'll retry on the next cycle, or run /update by hand.`)
      err(`update rolled back: ${gate.why}`)
      process.exitCode = 1
      return
    }

    // Success: write the post-update announcement (version delta, the one thing to do,
    // the auto-fetch cost) straight to the owner's Telegram.
    run('node ./template/bootstrap.js --announce')
    log('update complete + verified')
  } finally {
    releaseLock()
  }
}

main().catch((e) => { err(`fatal: ${e.message?.split('\n')[0] || e}`); releaseLock(); process.exit(1) })
