#!/usr/bin/env node
/**
 * Safe self-merging update engine.
 *
 * Two jobs:
 *  1. Make the interactive /update unstickable. `git pull --ff-only` refuses when a
 *     client edited a TRACKED product file - the chicken-and-egg that froze old installs.
 *     `--salvage-reset` salvages those edits and moves product files to origin/main.
 *  2. Power the weekly timer. By DEFAULT the timer runs NOTIFY mode: it only checks
 *     whether an update is pending and Telegrams the owner to run /update - it never
 *     touches the box unattended. Full unattended apply (stop -> reset -> build ->
 *     migrate -> verify -> rollback) is opt-in via bundle.enableAutoUpdate === 'auto'.
 *
 * Client state (.env, bundle.json, vault/, store/, .mcp.json) is gitignored, so the
 * reset never touches it; the pieces git can't restore (.env/bundle.json/.mcp.json/
 * .nello-version AND ~/.gbrain) are snapshotted first and restored on rollback.
 *
 * Modes:
 *   (default)         weekly entry. NOTIFY unless enableAutoUpdate==='auto' (then APPLY).
 *   --salvage-reset   just the safe git unstick, for the interactive /update skill.
 *   --apply           force the full unattended apply (used internally / for testing).
 *
 * Run from the install root (or with NC_INSTALL_PATH set). Headless: never prompts.
 */

import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, cpSync, rmSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const INSTALL = process.env.NC_INSTALL_PATH || process.cwd()
const TEMPLATE_DIR = join(INSTALL, 'template')
const STORE_DIR = join(INSTALL, 'store')
const ROLLBACK_ROOT = join(INSTALL, '.nello-rollback')
const LOCK = join(STORE_DIR, 'update.lock')
const LAST_FAILED = join(ROLLBACK_ROOT, 'last-failed-commit')
const GBRAIN_DIR = join(homedir(), '.gbrain')
const GBRAIN_BIN = join(homedir(), '.bun', 'bin', 'gbrain')
const EXPECTED_REMOTE = 'Matthew-Lee-Nello/nello'
const SALVAGE_ONLY = process.argv.includes('--salvage-reset')
const FORCE_APPLY = process.argv.includes('--apply')

const ACCENT = '\x1b[38;2;255;166;0m'
const RED = '\x1b[38;2;255;80;80m'
const RESET = '\x1b[0m'
const log = (m) => console.log(`${ACCENT}[self-update]${RESET} ${m}`)
const err = (m) => console.log(`${RED}[self-update]${RESET} ${m}`)

function git(args, opts = {}) {
  return execSync(`git ${args}`, { cwd: INSTALL, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString().trim()
}
function tryGit(args) { try { return { ok: true, out: git(args) } } catch (e) { return { ok: false, out: e.stderr?.toString() || e.message } } }
// Argv form (no shell) for paths that may contain spaces or quotes — never string-interpolate a path into a shell.
function gitArgs(args) {
  const r = spawnSync('git', args, { cwd: INSTALL, encoding: 'utf-8' })
  return { ok: r.status === 0, out: (r.stdout || '') }
}

function readEnvVal(key) {
  try {
    const m = readFileSync(join(INSTALL, '.env'), 'utf-8').match(new RegExp('^' + key + '=(.*)$', 'm'))
    return m ? m[1].replace(/^["']|["']$/g, '').trim() : null
  } catch { return null }
}
function readBundle() {
  try { return JSON.parse(readFileSync(join(INSTALL, 'bundle.json'), 'utf-8')) } catch { return {} }
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
function verOf(ref) { const r = tryGit(`show ${ref}:VERSION`); return r.ok ? r.out.trim() : null }

// Parse the owner/repo out of an ssh or https git URL and compare EXACTLY to ours.
// A substring check (the old `.includes`) would accept a tampered remote like
// `github.com/attacker/Matthew-Lee-Nello-nello-mirror` and then `reset --hard` onto it.
function remoteMatches(url) {
  const m = String(url).match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?\s*$/)
  return !!m && m[1].toLowerCase() === EXPECTED_REMOTE.toLowerCase()
}

// --- preflight: refuse to touch a repo that isn't ours ---
function preflight() {
  if (!existsSync(join(INSTALL, '.git'))) { err(`${INSTALL} is not a git repo - cannot self-update. Re-clone from github.com/${EXPECTED_REMOTE}.`); process.exit(2) }
  const remote = tryGit('remote get-url origin')
  if (!remote.ok || !remoteMatches(remote.out)) {
    err(`origin is ${remote.out || 'unset'}, not ${EXPECTED_REMOTE}. Refusing to reset onto an unknown remote.`)
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
function releaseLock() { try { if (existsSync(LOCK)) rmSync(LOCK, { force: true }) } catch {} }

// --- snapshot the state git can't restore: the 4 files AND the gbrain store ---
function snapshot() {
  const dir = join(ROLLBACK_ROOT, stamp())
  mkdirSync(dir, { recursive: true })
  for (const f of ['.env', 'bundle.json', '.mcp.json', '.nello-version']) {
    const src = join(INSTALL, f)
    if (existsSync(src)) { try { copyFileSync(src, join(dir, f)) } catch {} }
  }
  // The gbrain store is the 5th piece of unsnapshotted state migration 0002 may wipe
  // mid-bootstrap; back it up so a failed apply can restore a working brain.
  if (existsSync(GBRAIN_DIR)) { try { cpSync(GBRAIN_DIR, join(dir, 'gbrain'), { recursive: true }) } catch {} }
  const commit = tryGit('rev-parse HEAD').out
  writeFileSync(join(dir, 'ROLLBACK_COMMIT'), commit)
  return { dir, commit }
}

// --- salvage client edits to tracked product files, then reset to origin/main ---
// Returns the number of edits set aside, so the caller can tell the owner.
function salvageAndReset() {
  // NUL-delimited names vs HEAD: handles paths with spaces, renames, and Windows
  // backslashes (the old `status --porcelain` + `slice(3)` silently lost those, so a
  // client edit to such a path was discarded by the reset with no recoverable patch).
  const edited = gitArgs(['diff', '-z', '--name-only', 'HEAD']).out.split('\0').map(s => s.trim()).filter(Boolean)
  if (edited.length) {
    const qdir = join(INSTALL, 'client-overlay', 'quarantine', stamp())
    mkdirSync(qdir, { recursive: true })
    for (const f of edited) {
      // Salvage BEFORE the reset, per file, each guarded so one failure can't abort the
      // rest (or leave the reset to discard an unsalvaged edit). Argv form — never shell.
      try {
        const diff = gitArgs(['diff', 'HEAD', '--', f]).out
        if (diff) writeFileSync(join(qdir, f.replace(/[/\\]/g, '__') + '.patch'), diff)
      } catch {}
      // A client-edited shipped skill survives as a standalone overlay skill.
      const m = f.match(/^template[/\\]skills[/\\]([^/\\]+)[/\\]/)
      if (m) {
        const dst = join(INSTALL, 'client-overlay', 'skills', m[1])
        try { mkdirSync(dst, { recursive: true }); cpSync(join(INSTALL, 'template', 'skills', m[1]), dst, { recursive: true }) } catch {}
      }
    }
    log(`salvaged ${edited.length} local edit(s) to client-overlay/quarantine`)
  }
  // Discard working-tree changes to tracked files and move product state to origin/main.
  // NOT `git stash -u` (would sweep untracked client state); NOT a merge (could leave
  // conflict markers on a non-technical box). On an attached `main` this is convergent.
  git('checkout -- .')
  const branch = tryGit('rev-parse --abbrev-ref HEAD').out
  if (branch === 'HEAD' || !branch) tryGit('checkout main')
  git('reset --hard origin/main')
  return edited.length
}

function run(cmd) {
  log(`$ ${cmd}`)
  const r = spawnSync(cmd, { cwd: INSTALL, shell: true, stdio: 'pipe', env: { ...process.env, NC_INSTALL_PATH: INSTALL } })
  return { ok: r.status === 0, status: r.status, out: (r.stdout?.toString() || '') + (r.stderr?.toString() || '') }
}

// pnpm may not be on the timer's minimal PATH even when it's on the user's shell PATH.
// Try it by name, then corepack, then npx, so an environmental PATH gap doesn't read as
// a build failure. Fall through ONLY when the LAUNCHER itself is missing (shell exit 127
// on posix, or the Windows "is not recognized" message) - a real build failure (exit 1,
// "Module not found", a registry 404) is returned as-is so we don't mask it.
function pnpm(args) {
  for (const base of ['pnpm', 'corepack pnpm', 'npx --yes pnpm']) {
    const r = run(`${base} ${args}`)
    if (r.ok) return r
    const launcherMissing = r.status === 127 || /is not recognized as an internal or external/i.test(r.out)
    if (!launcherMissing) return r
  }
  return { ok: false, out: 'pnpm not resolvable (tried pnpm, corepack, npx)' }
}
function build() {
  let r = pnpm('install --frozen-lockfile')
  if (!r.ok) r = pnpm('install')
  if (!r.ok) return { ok: false, out: r.out }
  return pnpm('-r build')
}

function daemon(action) {
  spawnSync('node', [join(TEMPLATE_DIR, 'scripts', 'install-service.js'), action], { cwd: INSTALL, stdio: 'inherit', env: { ...process.env, NC_INSTALL_PATH: INSTALL } })
}

// --- verify gate: did the update leave a WORKING box? ---
// Hard: build OK + daemon answers health. A missing OPENAI_API_KEY is NOT a failure
// (0002 never wipes a keyless brain). When a key IS present and the engine + config are
// in place, a live gbrain query must not 401 - that catches a brain the update broke
// (rotated/rejected key, bad config) without false-failing on an absent/environmental
// gbrain or an empty store (a query on an empty store returns no hits, not an error).
async function verifyGate(buildOk, expectedVersion, brainExpected) {
  if (!buildOk) return { ok: false, why: 'build failed' }
  const port = readEnvVal('DASHBOARD_PORT') || '3000'
  // 90s budget (was 30): a slow client box doing a fresh build + restart can take well
  // over 30s to bind. A health timeout here is TRANSIENT — see the caller: we still roll
  // back to be safe, but we do NOT blacklist the commit, so it retries next week instead
  // of being permanently downgraded to notify-only for being slow once.
  let health = null
  for (let i = 0; i < 90; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/monitoring/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) { health = await res.json().catch(() => ({})); break }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  if (!health) return { ok: false, why: 'daemon did not become healthy within 90s', transient: true }

  // Freshness check: we just stopped + started the daemon, so a healthy one MUST have a
  // small uptime. A large uptime means the restart didn't take and a stale old-code daemon
  // is still answering. This is the signal the version compare alone can't give on a
  // same-version push (a bug-fix commit that didn't bump VERSION). Generous threshold so a
  // slow build can't false-fail; a stale daemon on an established box has been up for hours.
  if (typeof health.uptime_s === 'number' && health.uptime_s > 600) {
    return { ok: false, why: `daemon uptime ${health.uptime_s}s - it did not restart onto the new build` }
  }
  // Build-stamp assert: the daemon reports the VERSION it booted from. If it's answering
  // with a DIFFERENT version than the one we just reset to, the restart didn't take and a
  // stale old-code daemon is still serving. A daemon too old to report a version (pre-1.2)
  // returns undefined: the uptime check above still covers it, so don't fail on the version.
  if (expectedVersion && health.version && health.version !== expectedVersion) {
    return { ok: false, why: `daemon still serving v${health.version}, expected v${expectedVersion} (restart did not take)` }
  }

  const key = readEnvVal('OPENAI_API_KEY')
  if (key && brainExpected) {
    // Key present AND recall expected: the engine + config MUST be there after the update.
    // A missing one is the silent-empty-brain outcome v1.1 set out to kill — FAIL, don't
    // skip (the old gate skipped when config.json was absent, passing a dead brain).
    if (!existsSync(GBRAIN_BIN) || !existsSync(join(GBRAIN_DIR, 'config.json'))) {
      return { ok: false, why: 'recall expected (OpenAI key present) but gbrain engine/config is missing after update' }
    }
    const q = spawnSync(GBRAIN_BIN, ['query', 'healthcheck', '--limit', '1'], {
      env: { ...process.env, HOME: homedir(), OPENAI_API_KEY: key }, encoding: 'utf-8', timeout: 20000,
    })
    // Couldn't even run (ENOENT, timeout) = the engine the update should have left working
    // isn't. An empty store still exits 0 with no hits + no error, so it passes.
    if (q.error) return { ok: false, why: `brain query could not run (${q.error.message?.split('\n')[0] || 'spawn error'})` }
    const out = (q.stdout || '') + (q.stderr || '')
    if (/unauthor|invalid api key|incorrect api key|\b401\b/i.test(out)) return { ok: false, why: 'brain query rejected (OpenAI key invalid after update)' }
    if (/dimension mismatch|vector dimension|expected \d+ dimensions/i.test(out)) return { ok: false, why: 'brain store dimension mismatch after update' }
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
  // Restore the gbrain store if the failed apply wiped it - but only from a NON-EMPTY
  // backup, so a torn/empty snapshot can never replace a real brain with nothing.
  const gbak = join(snap.dir, 'gbrain')
  try {
    if (existsSync(gbak) && readdirSync(gbak).length > 0) {
      rmSync(GBRAIN_DIR, { recursive: true, force: true })
      cpSync(gbak, GBRAIN_DIR, { recursive: true })
    }
  } catch {}
  const b = build()   // rebuild the OLD code; report if THIS fails (a louder problem)
  return b.ok
}

// ---- NOTIFY mode (the default weekly behaviour) ----
async function notify(curVer, newVer) {
  const sent = await telegram(
    `Nello update ready: v${curVer || '?'} -> v${newVer || '?'}.\n\n` +
    `Reply /update (or run it) whenever suits to apply it - it takes a minute and nothing is lost (your notes, memory and identity carry over). ` +
    `Want updates to apply on their own? Set enableAutoUpdate to "auto".`)
  log(sent ? 'notified owner of pending update' : 'pending update (Telegram not configured)')
}

// ---- APPLY mode (opt-in: enableAutoUpdate === 'auto') ----
async function apply(remoteSha, oldVer, newVer) {
  // Loop-breaker: never re-apply the same origin/main commit that already failed here.
  // Without this a genuinely-broken push would stop->reset->fail->rollback every week.
  try {
    if (existsSync(LAST_FAILED) && readFileSync(LAST_FAILED, 'utf-8').trim() === remoteSha) {
      log('this update already failed once here - notifying instead of re-applying')
      await notify(oldVer, verOf('origin/main'))
      return
    }
  } catch {}

  const brainExpected = readBundle().enableRecall !== false

  // Stop the daemon FIRST so it isn't writing ~/.gbrain while we snapshot it, then take a
  // quiescent snapshot. The whole mutate region is guarded: if salvage/reset/build/migrate
  // throws, b stays not-ok (-> rollback) and the daemon is always restarted in finally.
  daemon('stop')
  const snap = snapshot()
  let salvaged = 0
  let b = { ok: false, out: '' }
  try {
    salvaged = salvageAndReset()
    b = build()
    // --migrate-only: run JUST migrations + render + brain rebuild + version stamp, NOT the
    // full install. The full bootstrap re-runs installClaudePlugins/installUv/RTK, any of
    // which process.exit(1) on a transient third-party registry hiccup — that would roll
    // back a perfectly good code update every week for a reason that has nothing to do with us.
    if (b.ok) { const boot = run('node ./template/bootstrap.js --migrate-only'); if (!boot.ok) b = { ok: false, out: boot.out } }
  } catch (e) {
    b = { ok: false, out: `update threw: ${e.message?.split('\n')[0] || e}` }
  } finally {
    daemon('start')
  }

  const gate = b.ok ? await verifyGate(true, newVer, brainExpected) : { ok: false, why: (b.out || 'build/migrate failed').split('\n')[0].slice(0, 200) }
  if (!gate.ok) {
    const restoredOk = rollback(snap)
    daemon('start')
    // Only blacklist the commit when the failure is REAL (build/migrate/brain broke), not
    // when the box was merely slow to answer health (gate.transient) — otherwise one slow
    // start permanently downgrades a good release to notify-only.
    if (!gate.transient) { try { mkdirSync(ROLLBACK_ROOT, { recursive: true }); writeFileSync(LAST_FAILED, remoteSha) } catch {} }
    const tail = restoredOk
      ? `You're still on your previous working version (v${oldVer || '?'}); nothing was lost.`
      : `WARNING: the rollback rebuild also failed - please run /update by hand to recover.`
    await telegram(`Nello auto-update was rolled back.\n\nReason: ${gate.why}.\n${tail}\nWe won't retry this same update automatically; a future update will apply normally.`)
    err(`update rolled back: ${gate.why}${restoredOk ? '' : ' (ROLLBACK BUILD ALSO FAILED)'}`)
    process.exitCode = 1
    return
  }

  try { if (existsSync(LAST_FAILED)) rmSync(LAST_FAILED, { force: true }) } catch {}
  run('node ./template/bootstrap.js --announce')
  if (salvaged > 0) await telegram(`Heads up: ${salvaged} local edit(s) to Nello's own files were set aside in client-overlay/quarantine during the update (your notes and memory are untouched).`)
  log('update complete + verified')
}

async function main() {
  preflight()

  // Interactive skill's frozen-pull recovery: just the safe git unstick. This runs the
  // SAME snapshot + reset as the apply path, so it needs the SAME guards: take the lock
  // (so the weekly timer can't run a reset/snapshot at the same moment) and stop the
  // daemon (so it isn't writing ~/.gbrain while we snapshot it). Leave the daemon stopped —
  // the /update skill rebuilds and restarts it; restarting stale dist here would be pointless.
  if (SALVAGE_ONLY) {
    acquireLock()
    try {
      tryGit('fetch origin main')
      daemon('stop')
      snapshot()
      const n = salvageAndReset()
      log(`product files reset to origin/main${n ? `; ${n} local edit(s) salvaged to client-overlay/quarantine` : ''}. Daemon stopped — finish the update (build + bootstrap) then restart it.`)
    } finally {
      releaseLock()
    }
    return
  }

  acquireLock()
  try {
    if (!tryGit('fetch origin main').ok) { err('git fetch failed'); return }
    const head = tryGit('rev-parse HEAD').out
    const remote = tryGit('rev-parse origin/main').out
    if (head && remote && head === remote) { log('already up to date - nothing to do'); return }

    const oldVer = verOf('HEAD')
    const newVer = verOf('origin/main')
    const wantApply = FORCE_APPLY || readBundle().enableAutoUpdate === 'auto'

    if (wantApply) await apply(remote, oldVer, newVer)
    else await notify(oldVer, newVer)
  } finally {
    releaseLock()
  }
}

main().catch((e) => { err(`fatal: ${e.message?.split('\n')[0] || e}`); releaseLock(); process.exit(1) })
