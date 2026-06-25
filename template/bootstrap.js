#!/usr/bin/env node
/**
 * nello-claw bootstrap - renders the install bundle into a live installation.
 *
 * Input: ./bundle.json (or NC_BUNDLE env path) - install-interview answers JSON, assembled locally
 * Output: personalised files written into the install dir (CWD)
 *
 * Steps:
 *   1. Render CLAUDE.md, AGENTS.md, .mcp.json, claude_desktop_config.json, plist
 *   2. Seed the vault preset into the target vault path
 *   3. Symlink bundled skills into ~/.claude/skills/
 *   4. Merge settings.json into ~/.claude/settings.json
 *   5. If morningBrief enabled, register the cron task
 *   6. If service enabled and macOS, install + load LaunchAgent
 *   7. Run audit at the end
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, copyFileSync, readdirSync, chmodSync, renameSync, realpathSync } from 'node:fs'
import { join, dirname, basename, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { homedir } from 'node:os'
import { execSync, spawnSync } from 'node:child_process'
import Handlebars from 'handlebars'
import { randomBytes } from 'node:crypto'
import { renderMcpJson, renderClaudeDesktopConfig, renderSettingsJson } from './scripts/render-configs.js'

// Use fileURLToPath so install paths with spaces (e.g. "/Users/foo/Work - Claude AI/")
// don't end up percent-encoded. new URL(...).pathname keeps "%20" for spaces.
const TEMPLATE_DIR = dirname(fileURLToPath(import.meta.url))
const INSTALL_PATH = process.env.NC_INSTALL_PATH || process.cwd()
const BUNDLE_PATH = process.env.NC_BUNDLE || join(INSTALL_PATH, 'bundle.json')

// Sandbox overrides - tests use these to isolate from production ~/.claude.
// SETTINGS_PATH defaults to PROJECT-SCOPED settings inside the install dir, NOT global.
// This means bypassPermissions only applies when Claude is working in ~/nello-claw/.
const SETTINGS_PATH = process.env.NC_SETTINGS_PATH || join(INSTALL_PATH, '.claude', 'settings.json')
const SKILLS_DIR = process.env.NC_SKILLS_DIR || join(homedir(), '.claude', 'skills')
const LAUNCHAGENT_LABEL = process.env.NC_LAUNCHAGENT_LABEL || 'com.nello-claw.server'

// NC_LAUNCHAGENT_LABEL is interpolated into launchctl/schtasks/systemctl commands
// AND into plist/systemd-unit XML/INI bodies. Restrict to reverse-DNS-style labels
// so it can't break out of any of those contexts even if a downstream call uses
// shell-string interpolation.
const LABEL_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
if (!LABEL_RE.test(LAUNCHAGENT_LABEL)) {
  console.error(`\x1b[38;2;255;80;80m✗\x1b[0m Invalid NC_LAUNCHAGENT_LABEL: ${JSON.stringify(LAUNCHAGENT_LABEL)}. Allowed: alphanumeric + . _ - (max 128 chars).`)
  process.exit(1)
}

// Theme: FFA600 accent via 24-bit truecolour. Falls back gracefully on plain terminals.
const ACCENT = '\x1b[38;2;255;166;0m'
const WHITE = '\x1b[38;2;255;255;255m'
const RED = '\x1b[38;2;255;80;80m'
const DIM = '\x1b[2m', RESET = '\x1b[0m'
const ok = (m) => console.log(`  ${ACCENT}✓${RESET} ${m}`)
const warn = (m) => console.log(`  ${ACCENT}!${RESET} ${m}`)
const fail = (m) => console.log(`  ${RED}✗${RESET} ${m}`)
const info = (m) => console.log(`\n${ACCENT}→${RESET} ${WHITE}${m}${RESET}`)

// Handlebars helpers
Handlebars.registerHelper('eq', (a, b) => a === b)
Handlebars.registerHelper('or', (...args) => args.slice(0, -1).some(v => !!v))
Handlebars.registerHelper('and', (...args) => args.slice(0, -1).every(v => !!v))
Handlebars.registerHelper('slug', (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
Handlebars.registerHelper('today', () => new Date().toISOString().slice(0, 10))

function renderTemplate(srcHbs, destPath, ctx) {
  const raw = readFileSync(srcHbs, 'utf-8')
  const out = Handlebars.compile(raw, { noEscape: true })(ctx)
  mkdirSync(dirname(destPath), { recursive: true })
  writeFileSync(destPath, out, 'utf-8')
}

// Normalize Windows backslash paths to forward slashes for safe injection into
// JSON templates (.mcp.json, claude_desktop_config.json, settings.json). Bare
// backslashes like \U \m \D are invalid JSON escapes and break parsers.
// Node accepts forward slashes everywhere on Windows for fs ops, so this is
// universal-safe.
function toPosixPath(p) {
  return String(p).replace(/\\/g, '/')
}

// One-line description per MCP. CLAUDE.md.hbs renders these as the
// "## Installed MCPs" bullet list, so any MCP added to render-configs.js
// needs a row here too — otherwise the bullet shows the name with an
// empty purpose.
const MCP_PURPOSES = {
  composio: 'Gmail, Calendar, Drive, Docs, Sheets + 250 more apps - one-click OAuth, no Google Cloud setup',
  obsidian: 'read/write your vault directly',
  exa: 'web research with citations',
  apify: 'web scraping + Actor marketplace',
}

// Required keys per capability. A tool that's turned on (its `mcps` flag set) but
// missing a REQUIRED key can't work - so on /update bootstrap reports the gap and
// the skill prompts for just that one key (the interview-diff). This is what makes
// a new tool propagate cleanly: ship the tool + add its required key here, and the
// client's next /update asks for the single new key and nothing else. Optional keys
// are deliberately NOT listed - an absent optional key just leaves its feature
// gated off, exactly as today. `where`/`hint` give the skill the prompt copy.
const KEY_MANIFEST = {
  composio: {
    enabled: (ctx) => !!ctx.mcps.composio,
    required: [{ key: 'COMPOSIO_API_KEY', where: 'dashboard.composio.dev', hint: 'starts with ak_' }],
  },
  exa: {
    enabled: (ctx) => !!ctx.mcps.exa,
    required: [{ key: 'EXA_API_KEY', where: 'dashboard.exa.ai', hint: 'long alphanumeric string' }],
  },
  apify: {
    enabled: (ctx) => !!ctx.mcps.apify,
    required: [{ key: 'APIFY_TOKEN', where: 'console.apify.com - Settings - Integrations', hint: 'starts with apify_api_' }],
  },
  tavily: {
    enabled: (ctx) => !!ctx.mcps.tavily,
    required: [{ key: 'TAVILY_API_KEY', where: 'app.tavily.com', hint: 'starts with tvly-' }],
  },
  firecrawl: {
    enabled: (ctx) => !!ctx.mcps.firecrawl,
    required: [{ key: 'FIRECRAWL_API_KEY', where: 'firecrawl.dev', hint: 'starts with fc-' }],
  },
}

// Required keys that an enabled tool still lacks. Drives the /update interview-diff
// (via `--report-missing-keys`) and a non-fatal warning at the end of a full run.
function missingRequiredKeys(ctx) {
  const env = ctx.env || {}
  const missing = []
  for (const [tool, spec] of Object.entries(KEY_MANIFEST)) {
    let on = false
    try { on = !!spec.enabled(ctx) } catch { on = false }
    if (!on) continue
    for (const r of spec.required) {
      const v = env[r.key]
      if (v === undefined || v === null || String(v).trim() === '') missing.push({ tool, ...r })
    }
  }
  return missing
}

function buildContext(bundle) {
  const installPathPosix = toPosixPath(INSTALL_PATH)
  const vaultPathPosix = toPosixPath(bundle.vaultPath || join(INSTALL_PATH, 'vault'))
  const escapedPath = installPathPosix.replace(/^\//, '-').replace(/\//g, '-')
  // `mcps` stays a boolean map ({google: true, ...}) because render-configs.js
  // does `if (mcps.google)` checks. CLAUDE.md.hbs needs a real list to
  // iterate with {{#each mcpsList}}, so build that here as [{name, purpose}].
  const mcpsList = Object.entries(bundle.mcps || {})
    .filter(([, on]) => !!on)
    .map(([name]) => ({ name, purpose: MCP_PURPOSES[name] || '' }))
  // Persona defaults. CLAUDE.md.hbs reads these directly; a conversational
  // install may legitimately leave some unset. Defaulting here (rather than in
  // the bundle) keeps the rendered persona correct — e.g. without
  // installTelegram/installDashboard the "accessible via …" line drops both
  // surfaces it actually has.
  const PERSONA_DEFAULTS = {
    communicationStyle: 'direct',
    language: 'AU',
    emDashPolicy: 'never',
    oxfordComma: false,
    bannedWords: [],
    values: [],
    enableKarpathyGuidelines: true,
    enableHumanizer: true,
    installTelegram: true,
    installDashboard: true,
  }
  return {
    ...PERSONA_DEFAULTS,
    ...bundle,
    installPath: installPathPosix,
    escapedPath,
    home: toPosixPath(homedir()),
    nodePath: toPosixPath(process.execPath),
    today: new Date().toISOString().slice(0, 10),
    vaultPath: vaultPathPosix,
    env: bundle.keys || {},
    mcps: bundle.mcps || {},
    mcpsList,
    // Semantic recall (gbrain) master switch. A VOYAGE_API_KEY in .env is the
    // ONLY thing that turns the brain on: it gates the Bun/gbrain/graphify
    // installs, the gbrain-sync hook, the CLAUDE.md recall rule, and (via
    // writeEnv) NC_MEMORY_ENGINE=gbrain. No key → none of it is installed or
    // written, so a keyless install is byte-for-byte identical to a no-recall one.
    brainEnabled: !!((bundle.keys || {}).VOYAGE_API_KEY),
  }
}

function writeEnv(bundle) {
  const keys = { ...(bundle.keys || {}) }

  // Messaging channel. Telegram is the only supported surface (WhatsApp retired in
  // v1.0 - it never linked reliably). Always telegram, regardless of any legacy
  // bundle/env value, and strip the retired WhatsApp keys so they never linger in
  // .env. (Migration 0003 also rewrites a stale 'whatsapp' value in bundle.json;
  // coercing here means a re-run lands on telegram even before migrations run.)
  keys.MESSAGING_CHANNEL = 'telegram'
  delete keys.WHATSAPP_OWNER_NUMBER
  delete keys.WHATSAPP_SESSION_DIR

  // Telegram owner lock. The wizard can supply the owner chat ID either as a
  // top-level `telegramChatId` field (PR-7.1) or inside keys.ALLOWED_CHAT_ID
  // (existing wizard path). The explicit field wins. Writing this into .env is
  // the load-bearing fix: a non-empty ALLOWED_CHAT_ID means the bot's
  // isAuthorised() has a real list AND discovery.ts (first-message-wins
  // pairing, gated on an empty allowlist) never fires.
  const ownerChatId = String(bundle.telegramChatId ?? keys.ALLOWED_CHAT_ID ?? '').trim()
  if (ownerChatId) keys.ALLOWED_CHAT_ID = ownerChatId

  // Fail closed on an unlocked bot. If a Telegram token ships but no owner chat ID,
  // discovery.ts does first-message-wins pairing and hands ownership of a
  // bypassPermissions assistant to whoever messages the bot first. install.sh asserts
  // this after the fact, but the conversational install runs bootstrap directly
  // (NC_INSTALL_PATH=… node template/bootstrap.js) — so guard the invariant here,
  // where every entry path passes through. (A token-less install, e.g. one just
  // migrated off WhatsApp, passes this and surfaces the token via the missing-key
  // report; the client pairs it with /connect-telegram, which captures the chat ID.)
  if (keys.TELEGRAM_BOT_TOKEN && !ownerChatId) {
    fail('Telegram bot token present but ALLOWED_CHAT_ID / telegramChatId is empty. The bot would ship unlocked (discovery.ts first-message-wins pairing). Re-collect the owner chat ID and re-run.')
    process.exit(1)
  }

  // Semantic recall (gbrain). A VOYAGE_API_KEY is the master switch: when present,
  // flip the daemon's memory engine to 'gbrain' so buildMemoryContext augments
  // replies with vault knowledge. No key → leave it 'legacy' (the default in
  // config.ts) and write nothing, so a keyless install behaves exactly as before.
  if (keys.VOYAGE_API_KEY) {
    keys.NC_MEMORY_ENGINE = 'gbrain'
  } else {
    delete keys.NC_MEMORY_ENGINE
  }
  if (keys.VOYAGE_API_KEY && keys.VOYAGE_API_KEY.length < 20) {
    warn('VOYAGE_API_KEY looks too short - double-check it at dash.voyageai.com. A wrong key flips recall on but 401s silently; /install-doctor has a Voyage canary that catches it.')
  }

  // Dashboard auth token: OPT-IN, not generated by default. The dashboard binds
  // 127.0.0.1 (loopback-only) and has an Origin/CSRF guard, so a local install
  // needs no token - requiring one just blocked setup. The server gate is
  // dormant when DASHBOARD_TOKEN is empty. Only set DASHBOARD_TOKEN in .env if
  // you expose the dashboard beyond localhost (Tailscale serve / a tunnel), in
  // which case the gate turns back on with that value. Any prior token already
  // in .env is preserved by the env merge, so existing setups keep working.

  // Validate key formats so a typo'd key fails loud here instead of a silent
  // "(no response)" days later. Warn-only - a key could be a new format; the
  // warning tells the operator to double-check rather than blocking the install.
  if (keys.COMPOSIO_API_KEY && !/^ak_[A-Za-z0-9_-]+$/.test(keys.COMPOSIO_API_KEY)) {
    warn('COMPOSIO_API_KEY does not look like a Composio key (expected ak_...). Double-check it at dashboard.composio.dev.')
  }
  if (keys.TELEGRAM_BOT_TOKEN && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(keys.TELEGRAM_BOT_TOKEN)) {
    warn('TELEGRAM_BOT_TOKEN does not match the BotFather format (digits:token). Double-check it with @BotFather.')
  }

  const lines = [
    '# Auto-generated by nello-claw bootstrap',
    `# ${new Date().toISOString()}`,
    '',
  ]
  for (const [k, v] of Object.entries(keys)) {
    if (v === null || v === undefined || v === '') continue
    const escaped = String(v).includes(' ') || String(v).includes('#') ? `"${v}"` : v
    lines.push(`${k}=${escaped}`)
  }
  lines.push('')
  lines.push(`VAULT_PATH=${bundle.vaultPath || join(INSTALL_PATH, 'vault')}`)
  const envPath = join(INSTALL_PATH, '.env')
  writeFileSync(envPath, lines.join('\n'))
  lockFile(envPath)
}

// Parse an existing .env into a plain object, stripping the surrounding quotes
// writeEnv adds to values that contain a space or '#'. Used to overlay the live
// .env onto bundle.keys so .env is the source of truth on any re-run (and the
// `--configs-only` fast sync). Missing/unreadable file → {}.
function readEnvOverlay(envPath) {
  const out = {}
  try {
    if (!existsSync(envPath)) return out
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (!m) continue
      out[m[1]] = m[2].replace(/\r$/, '').replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}

// Read the existing version stamp (commit/date/appliedMigrations). Missing or
// unreadable → {}. Used so writeVersionStamp can preserve appliedMigrations and
// runMigrations can tell which migrations an install has already applied.
function readVersionStamp(installPath) {
  try {
    return JSON.parse(readFileSync(join(installPath, '.nello-version'), 'utf-8')) || {}
  } catch { return {} }
}

// Stamp the install with the code version it was built from, so /install-doctor
// and the assistant can tell when a client is behind origin/main and prompt an
// update. Also records the migration ids this install has applied so the runner is
// idempotent. The git commit/date are best-effort (missing git / detached repo just
// leaves them as the previous value), but appliedMigrations is ALWAYS persisted -
// it must never depend on git, or a migration could re-run every update.
function writeVersionStamp(installPath, appliedMigrations) {
  const prev = readVersionStamp(installPath)
  const stamp = {
    commit: prev.commit ?? null,
    date: prev.date ?? null,
    stampedAt: new Date().toISOString(),
    appliedMigrations: appliedMigrations ?? prev.appliedMigrations ?? [],
  }
  try {
    const opts = { cwd: TEMPLATE_DIR, stdio: ['ignore', 'pipe', 'ignore'] }
    stamp.commit = execSync('git rev-parse --short HEAD', opts).toString().trim()
    stamp.date = execSync('git log -1 --format=%cI', opts).toString().trim()
  } catch {}
  try {
    writeFileSync(join(installPath, '.nello-version'), JSON.stringify(stamp, null, 2) + '\n')
  } catch {}
}

// Patch bundle.json in place, applying only a structural mutation (e.g. flip an
// mcps flag), without touching keys. Migrations use this to make a change durable:
// the in-memory bundle drives THIS run's render, but the next run reloads
// bundle.json, so a structural change (composio: true) has to land on disk too.
// bundle.json always exists at /update time (the skill confirms it), so this runs.
// Never re-spreads the .env secret overlay back into bundle.json.
function patchBundleJsonFile(mutator) {
  try {
    if (!existsSync(BUNDLE_PATH)) return false
    const b = JSON.parse(readFileSync(BUNDLE_PATH, 'utf-8'))
    mutator(b)
    writeFileSync(BUNDLE_PATH, JSON.stringify(b, null, 2) + '\n')
    return true
  } catch (e) {
    warn(`could not persist bundle.json change: ${e.message?.split('\n')[0] || e}`)
    return false
  }
}

// Versioned, idempotent stack migrations. Each module in template/migrations/ is
// `NNNN-slug.js` exporting `default { id, description, detect(ctx), run(ctx) }`.
// detect(ctx) returns truthy only when the OLD state is still present (so a fresh
// or already-migrated install is a no-op). Every migration is recorded once in
// .nello-version.appliedMigrations and never re-evaluated, so adding a stack change
// = drop a new file here; the client's next /update applies exactly the pending ones.
// Migrations run on the full bootstrap (which /update calls), not --configs-only.
async function runMigrations(bundle) {
  const dir = join(TEMPLATE_DIR, 'migrations')
  const prev = readVersionStamp(INSTALL_PATH)
  const applied = new Set(Array.isArray(prev.appliedMigrations) ? prev.appliedMigrations : [])
  if (!existsSync(dir)) return [...applied]

  const files = readdirSync(dir).filter(f => /^\d{4}-.*\.m?js$/.test(f)).sort()
  if (files.length === 0) return [...applied]

  bundle.keys = bundle.keys || {}
  const mctx = {
    installPath: INSTALL_PATH,
    bundle,
    env: bundle.keys,
    patchBundle: patchBundleJsonFile,
    ok, warn, info, fail,
  }

  let ran = 0
  for (const f of files) {
    let mod
    try {
      mod = (await import(pathToFileURL(join(dir, f)).href)).default
    } catch (e) {
      warn(`migration ${f} failed to load, skipping: ${e.message?.split('\n')[0] || e}`)
      continue
    }
    if (!mod || !mod.id) { warn(`migration ${f} has no id, skipping`); continue }
    if (applied.has(mod.id)) continue

    let needed = true
    try { needed = mod.detect ? !!mod.detect(mctx) : true }
    catch (e) { warn(`migration ${mod.id} detect() threw, skipping: ${e.message?.split('\n')[0] || e}`); continue }

    if (needed) {
      try {
        info(`Migration ${mod.id}${mod.description ? ` - ${mod.description}` : ''}`)
        await mod.run(mctx)
        ran++
      } catch (e) {
        // Leave it UNRECORDED so the next /update retries it; don't block the others.
        fail(`migration ${mod.id} failed (will retry next update): ${e.message?.split('\n')[0] || e}`)
        continue
      }
    }
    // Record both "ran" and "not applicable here" so it's never re-evaluated.
    applied.add(mod.id)
  }
  if (ran > 0) ok(`applied ${ran} migration${ran === 1 ? '' : 's'}`)
  return [...applied]
}

// Lock a secret-bearing file to the current user only. chmod 600 covers Unix; on
// Windows chmod is a no-op, so enforce a real NTFS ACL via icacls (strip
// inheritance, grant only the current user full control). Best-effort, never fatal.
function lockFile(p) {
  try {
    if (process.platform === 'win32') {
      const user = process.env.USERNAME || process.env.USER || ''
      if (!user) {
        warn(`Could not identify the current user to lock ${p}. Secure it manually so other accounts on this PC can't read your keys.`)
        return
      }
      try {
        execSync(`icacls "${p}" /inheritance:r /grant:r "${user}:F"`, { stdio: 'ignore' })
      } catch {
        // Don't swallow: a failed lock leaves secrets readable by every account
        // on the box, and the user would never know.
        warn(`Could not lock ${p} via icacls - your keys may be readable by other Windows accounts. Secure it manually (Properties > Security) or move the install to an NTFS drive.`)
      }
    } else {
      chmodSync(p, 0o600)
    }
  } catch { /* best-effort */ }
}

// Every server name a given renderer can emit (all baseline flags on). Derived
// from the renderer itself, not hardcoded, so the managed set can never drift
// from render-configs.js. .mcp.json and claude_desktop_config.json have
// different baseline sets, so each call passes its own renderer's set.
// Servers nello-claw shipped before the Composio migration. The current renderer
// never emits these, so without listing them here an old install's stale
// google_workspace / workspace-mcp entry would be treated as client-added and
// preserved on re-sync - and keep prompting for Google OAuth after an update.
// Listing them as "managed" makes a re-run (or `--configs-only`) prune them.
// Kept tight to the names nello-claw itself shipped, so a client's own MCPs are
// never touched.
const DEPRECATED_MCP_KEYS = ['google_workspace', 'workspace-mcp']

function managedMcpKeys(renderFn) {
  const allOn = { mcps: { composio: true, obsidian: true, exa: true, apify: true, tavily: true, firecrawl: true }, env: {}, vaultPath: '' }
  return new Set([...Object.keys(renderFn(allOn).mcpServers || {}), ...DEPRECATED_MCP_KEYS])
}

// Write the rendered MCP config, preserving servers a client added post-install
// (via /mcp-implement for their own tool stack) while letting the render stay
// authoritative over the baseline. Managed baseline servers are dropped from the
// on-disk set first, then the fresh render is overlaid — so a re-run with a
// baseline MCP deselected actually removes it, and a renamed baseline command is
// replaced, instead of a stale entry lingering. Unmanaged (client-added) servers
// pass through untouched.
function writeMergedMcpConfig(path, rendered, managed) {
  // Refuse to write through a symlink (same guard as mergeSettingsJson). Without
  // it the writeFileSync below follows a planted symlink and overwrites an
  // arbitrary user-writable file outside the install folder, breaking the
  // SECURITY.md boundary.
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    fail(`Refusing to write through symlink: ${path}`)
    process.exit(1)
  }
  let existingServers = {}
  if (existsSync(path)) {
    try { existingServers = JSON.parse(readFileSync(path, 'utf-8')).mcpServers || {} } catch {}
  }
  const preserved = Object.fromEntries(
    Object.entries(existingServers).filter(([k]) => !managed.has(k))
  )
  const merged = { mcpServers: { ...preserved, ...(rendered.mcpServers || {}) } }
  writeFileSync(path, JSON.stringify(merged, null, 2))
  // .mcp.json + claude_desktop_config.json carry the Composio/Exa/Apify/Tavily
  // keys in their server headers - lock them down like .env so another local user
  // can't read them.
  lockFile(path)
}

function symlinkSkills() {
  const src = join(TEMPLATE_DIR, 'skills')
  const dest = SKILLS_DIR
  mkdirSync(dest, { recursive: true })

  // Resolve the canonical skills root once so we can verify every individual
  // skill entry actually lives under it. Without this check, a hostile fork or
  // a symlinked entry inside template/skills/ would get a globally-discoverable
  // ~/.claude/skills/<name> pointing anywhere on disk.
  const skillsRoot = realpathSync(src)
  let linked = 0

  // Use 'junction' on Windows so users don't need Developer Mode or admin to
  // install. Junctions work for directory targets exactly like symlinks but
  // don't require the SeCreateSymbolicLinkPrivilege. All bundled skills are
  // directories, so junction is a drop-in replacement here.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'

  for (const name of readdirSync(src)) {
    const srcPath = join(src, name)
    let realSrc
    try {
      realSrc = realpathSync(srcPath)
    } catch {
      warn(`skill ${name}: can't resolve path, skipping`)
      continue
    }
    if (realSrc !== skillsRoot && !realSrc.startsWith(skillsRoot + sep)) {
      warn(`skill ${name}: resolves outside template/skills (${realSrc}), skipping`)
      continue
    }
    const destPath = join(dest, name)
    if (existsSync(destPath)) {
      try {
        const stat = lstatSync(destPath)
        if (stat.isSymbolicLink() || (process.platform === 'win32' && stat.isDirectory())) {
          // Symlink (Mac/Linux) or junction (Windows) - safe to remove
          try { unlinkSync(destPath) } catch { try { renameSync(destPath, `${destPath}.bak-${Date.now()}`) } catch {} }
        } else {
          // Real directory - back up so we don't blow away user data
          const bak = `${destPath}.bak-${Date.now()}`
          renameSync(destPath, bak)
          warn(`backed up existing skill to ${basename(bak)}`)
        }
      } catch {}
    }
    try {
      symlinkSync(srcPath, destPath, linkType)
      linked++
    } catch (err) {
      warn(`couldn't link ${name}: ${err.message?.split('\n')[0] || 'unknown'}. Skill won't be discoverable until linked manually.`)
    }
  }
  ok(`linked ${linked} skills into ${dest}`)
}

function mergeSettingsJson(ctx) {
  const settingsPath = SETTINGS_PATH
  mkdirSync(dirname(settingsPath), { recursive: true })

  // Refuse to write through a symlink. Without this an attacker who can place a
  // symlink at .claude/settings.json (or who races us in a shared install dir)
  // can redirect this write at any user-writable file.
  if (existsSync(settingsPath) && lstatSync(settingsPath).isSymbolicLink()) {
    fail(`Refusing to write through symlink: ${settingsPath}`)
    process.exit(1)
  }

  // Build settings via JS object + JSON.stringify, not Handlebars. installPath
  // can contain quotes/backslashes/newlines that would break the JSON output.
  const newSettings = renderSettingsJson(ctx)

  let existing = {}
  if (existsSync(settingsPath)) {
    try { existing = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
    copyFileSync(settingsPath, `${settingsPath}.bak-${Date.now()}`)
  }

  const merged = { ...existing, ...newSettings }
  merged.hooks = { ...(existing.hooks || {}), ...newSettings.hooks }
  merged.enabledPlugins = { ...(existing.enabledPlugins || {}), ...newSettings.enabledPlugins }
  merged.extraKnownMarketplaces = { ...(existing.extraKnownMarketplaces || {}), ...newSettings.extraKnownMarketplaces }

  // Atomic write: serialize to a temp file in the same dir then rename. A crash
  // mid-write can no longer leave a truncated settings.json that breaks Claude
  // Code at next session start.
  const tmpPath = `${settingsPath}.tmp.${process.pid}.${randomBytes(4).toString('hex')}`
  writeFileSync(tmpPath, JSON.stringify(merged, null, 2))
  renameSync(tmpPath, settingsPath)
  ok(`wrote project-scoped settings: ${settingsPath}`)
}

// Install + activate the Claude Code plugins the stack depends on.
//
// `enabledPlugins` in settings.json only ACTIVATES already-installed plugins -
// it does NOT fetch them from the marketplace. The Agent SDK query() the daemon
// uses does not run the CLI's startup marketplace-fetch either. So without this
// explicit install, enabledPlugins points at plugins that aren't on disk and
// silently no-ops on a clean box.
//
// Install form is fully-qualified `plugin@marketplace`. There is no --yes flag;
// supplying the positional arg makes the install non-interactive. Idempotent:
// re-adding a marketplace or re-installing a plugin is a no-op, so "already"
// outcomes are treated as success. A genuine install error is FATAL - the
// permanent-memory promise (agentmemory) is load-bearing on a client box.
function installClaudePlugins() {
  const plugins = [
    { marketplace: 'agentmemory', repo: 'rohitg00/agentmemory', plugin: 'agentmemory@agentmemory' },
    { marketplace: 'karpathy-skills', repo: 'forrestchang/andrej-karpathy-skills', plugin: 'andrej-karpathy-skills@karpathy-skills' },
  ]

  const run = (args) => {
    const res = spawnSync('claude', args, { stdio: 'pipe', encoding: 'utf-8', shell: process.platform === 'win32' })
    const out = `${res.stdout || ''}${res.stderr || ''}`
    return { status: res.status, out, err: res.error }
  }

  // `claude` must be on PATH for any of this to work. install.sh / install.ps1
  // make the CLI install fatal on client installs, so absence here is a real
  // failure, not a soft warning.
  const probe = spawnSync('claude', ['--version'], { stdio: 'pipe', encoding: 'utf-8', shell: process.platform === 'win32' })
  if (probe.status !== 0) {
    fail(`claude CLI not found on PATH - cannot install plugins. Install it (npm i -g @anthropic-ai/claude-code) and re-run bootstrap.`)
    process.exit(1)
  }

  for (const p of plugins) {
    const addRes = run(['plugin', 'marketplace', 'add', p.repo, '--scope', 'user'])
    if (addRes.status !== 0 && !/already|exists/i.test(addRes.out)) {
      fail(`plugin marketplace add ${p.repo} failed: ${addRes.out.split('\n')[0] || addRes.err?.message || 'unknown error'}`)
      process.exit(1)
    }
    const instRes = run(['plugin', 'install', p.plugin, '--scope', 'user'])
    if (instRes.status !== 0 && !/already|installed/i.test(instRes.out)) {
      fail(`plugin install ${p.plugin} failed: ${instRes.out.split('\n')[0] || instRes.err?.message || 'unknown error'}`)
      process.exit(1)
    }
    ok(`plugin ${p.plugin} installed`)
  }
}

function installService() {
  // Cross-platform: delegates to scripts/install-service.js (Mac launchctl / Win schtasks / Linux systemd)
  const res = spawnSync('node', [join(TEMPLATE_DIR, 'scripts', 'install-service.js')], {
    env: {
      ...process.env,
      NC_INSTALL_PATH: INSTALL_PATH,
      NC_LAUNCHAGENT_LABEL: LAUNCHAGENT_LABEL,
    },
    stdio: 'inherit',
  })
  if (res.status !== 0) fail(`service install failed (exit ${res.status})`)
}

function createMacAppShortcut() {
  const appDir = join(homedir(), 'Applications', 'nello-claw.app')
  const macOSDir = join(appDir, 'Contents', 'MacOS')
  const resourcesDir = join(appDir, 'Contents', 'Resources')
  mkdirSync(macOSDir, { recursive: true })
  mkdirSync(resourcesDir, { recursive: true })

  // Copy icon if present in the cloned repo
  const repoIcon = join(TEMPLATE_DIR, '..', 'installer', 'icon.icns')
  if (existsSync(repoIcon)) {
    try { copyFileSync(repoIcon, join(resourcesDir, 'icon.icns')) } catch {}
  }

  const launcher = `#!/bin/bash
URL="http://localhost:3000"
if open -Ra "Google Chrome" 2>/dev/null; then
  open -na "Google Chrome" --args --app="$URL"
elif open -Ra "Microsoft Edge" 2>/dev/null; then
  open -na "Microsoft Edge" --args --app="$URL"
else
  open "$URL"
fi
`
  writeFileSync(join(macOSDir, 'run'), launcher)
  try { execSync(`chmod +x "${join(macOSDir, 'run')}"`) } catch {}

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>run</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundleIdentifier</key><string>com.nello-claw.app</string>
  <key>CFBundleName</key><string>nello-claw</string>
  <key>CFBundleDisplayName</key><string>nello-claw</string>
  <key>CFBundleVersion</key><string>1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><false/>
</dict>
</plist>
`
  writeFileSync(join(appDir, 'Contents', 'Info.plist'), plist)
  ok(`Mac app shortcut at ${appDir}`)
}

function createWindowsShortcuts() {
  // Drop Start Menu + Desktop .lnk shortcuts using a tiny PowerShell one-liner.
  // Mirrors what install.ps1 does, but runs from bootstrap so the Claude Code
  // paste-in path also gets the shortcut (install.ps1 only fires from the
  // PowerShell one-liner entry).
  const startMenu = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'nello-claw.lnk')
  const desktop = join(homedir(), 'Desktop', 'nello-claw.lnk')

  // Find Chrome / Edge so the shortcut opens the dashboard in app-mode
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')
  const chromeCandidates = [
    join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ]
  const browser = chromeCandidates.find(p => existsSync(p)) || ''
  const url = 'http://localhost:3000'

  const icoCandidate = join(TEMPLATE_DIR, '..', 'installer', 'icon.ico')
  const iconLine = existsSync(icoCandidate) ? `$s.IconLocation = '${icoCandidate},0';` : ''

  const target = browser || url
  const args = browser ? `--app=${url}` : ''

  for (const shortcutPath of [startMenu, desktop]) {
    const ps = `$ws=New-Object -ComObject WScript.Shell; $s=$ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); $s.TargetPath='${target.replace(/'/g, "''")}'; $s.Arguments='${args}'; ${iconLine} $s.Description='nello-claw - your AI Chief Operations Officer'; $s.Save();`
    try {
      execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: 'pipe' })
    } catch (err) {
      warn(`Couldn't create ${basename(shortcutPath)}: ${err.message?.split('\n')[0] || 'unknown'}`)
    }
  }
  ok('Windows shortcuts created (Start Menu + Desktop)')
}

function installUv() {
  // uv ships uvx, which the rendered .mcp.json calls to run `workspace-mcp`
  // (the Google Workspace MCP). Without uv, Google MCP fails with command not found.
  // Idempotent. Universal across all install entry paths.
  try { execSync('which uv', { stdio: 'pipe' }); ok('uv already installed'); return } catch {}
  const platform = process.platform
  if (platform === 'darwin') {
    try {
      execSync('which brew', { stdio: 'pipe' })
      execSync('brew install uv', { stdio: 'pipe' })
      ok('uv installed via Homebrew')
    } catch {
      try {
        execSync('curl -LsSf https://astral.sh/uv/install.sh | sh', { stdio: 'pipe' })
        ok('uv installed via astral.sh script')
      } catch {
        warn('uv install failed - Google Workspace MCP will not run until you install uv (https://docs.astral.sh/uv/)')
      }
    }
  } else if (platform === 'win32') {
    try {
      execSync('winget install --silent --accept-source-agreements --accept-package-agreements astral-sh.uv', { stdio: 'pipe' })
      ok('uv installed via winget')
    } catch {
      // winget may not be available on older Win10 or in restricted environments.
      // Fall back to astral.sh's PowerShell installer (works without admin or winget).
      try {
        execSync('powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"', { stdio: 'pipe' })
        ok('uv installed via astral.sh PowerShell script')
      } catch {
        warn('uv install failed via winget AND astral.sh fallback. Google Workspace MCP will not run until you install uv manually (https://docs.astral.sh/uv/).')
      }
    }
  } else {
    try {
      execSync('curl -LsSf https://astral.sh/uv/install.sh | sh', { stdio: 'pipe' })
      ok('uv installed via astral.sh script')
    } catch {
      warn('uv install failed - install manually from https://docs.astral.sh/uv/')
    }
  }
}

// ---------- Semantic recall (gbrain + graphify) ----------
// Installed ONLY when a VOYAGE_API_KEY is present (ctx.brainEnabled). gbrain is a
// Bun tool (garrytan/gbrain), so Bun is installed first, then gbrain, then the
// Python graph (graphify). Every step is non-fatal: a failed install leaves the
// box behaving exactly like a keyless one (the daemon's gbrainSearch silently
// no-ops, the graphify hook skips silently). Voyage is the only key gbrain needs
// on the query/import path (brain.ts uses `--no-expand`, skipping OpenAI models).
const GBRAIN_BIN = join(homedir(), '.bun', 'bin', 'gbrain')

function commandExists(cmd) {
  try { return spawnSync(cmd, ['--version'], { shell: true, stdio: 'ignore' }).status === 0 } catch { return false }
}

function installBun() {
  if (commandExists('bun')) { ok('bun already installed'); return true }
  const platform = process.platform
  try {
    if (platform === 'win32') {
      execSync('powershell -NoProfile -ExecutionPolicy Bypass -Command "irm bun.sh/install.ps1 | iex"', { stdio: 'pipe' })
    } else {
      execSync('curl -fsSL https://bun.sh/install | bash', { stdio: 'pipe' })
    }
    // Bun installs to ~/.bun/bin, which isn't on this process's PATH yet - prepend
    // it so the gbrain install below can find `bun`.
    const bunBin = join(homedir(), '.bun', 'bin')
    process.env.PATH = `${bunBin}${platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`
    ok('bun installed')
    return true
  } catch (err) {
    warn(`bun install failed (${err.message?.split('\n')[0] || 'unknown'}). Semantic recall stays off until bun is installed (https://bun.sh).`)
    return false
  }
}

function installGbrain() {
  if (existsSync(GBRAIN_BIN)) { ok('gbrain already installed'); return true }
  try {
    execSync('bun install -g github:garrytan/gbrain', { stdio: 'pipe' })
    ok('gbrain installed (semantic recall engine)')
    return existsSync(GBRAIN_BIN)
  } catch (err) {
    warn(`gbrain install failed (${err.message?.split('\n')[0] || 'unknown'}). Semantic recall stays off.`)
    return false
  }
}

function installGraphify() {
  if (commandExists('graphify')) { ok('graphify already installed'); return }
  try {
    execSync('pipx install graphifyy', { stdio: 'pipe' })
    ok('graphify installed (knowledge graph)')
  } catch {
    try {
      execSync('python3 -m pip install --user graphifyy', { stdio: 'pipe' })
      ok('graphify installed via pip --user')
    } catch (err) {
      warn(`graphify install failed (${err.message?.split('\n')[0] || 'unknown'}). The graph is optional - its hook skips silently.`)
    }
  }
}

function configureGbrain(voyageKey) {
  // `gbrain init --pglite` lays down a valid default config + local PGLite store.
  // Then point the embedding model at Voyage (voyage-3.5-lite, 1024-dim) so embeds
  // need only VOYAGE_API_KEY. We patch just those fields and preserve gbrain's
  // other defaults (expansion/chat models are never hit on the --no-expand path).
  if (!existsSync(GBRAIN_BIN)) return
  const cfgDir = join(homedir(), '.gbrain')
  const cfgPath = join(cfgDir, 'config.json')
  const env = { ...process.env, HOME: homedir(), VOYAGE_API_KEY: voyageKey || '' }
  try {
    if (!existsSync(cfgPath)) execSync(`"${GBRAIN_BIN}" init --pglite`, { stdio: 'pipe', env })
  } catch { /* init is best-effort; the patch below still writes a usable config */ }
  try {
    mkdirSync(cfgDir, { recursive: true })
    let cfg = {}
    if (existsSync(cfgPath)) { try { cfg = JSON.parse(readFileSync(cfgPath, 'utf-8')) } catch { cfg = {} } }
    cfg.embedding_model = 'voyage:voyage-3.5-lite'
    cfg.embedding_dimensions = 1024
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2))
    ok('gbrain configured (voyage:voyage-3.5-lite, local PGLite)')
  } catch (err) {
    warn(`gbrain config write failed (${err.message?.split('\n')[0] || 'unknown'}).`)
  }
}

// Count markdown files under a dir (bounded walk) so seedRecall can refuse a
// large auto-embed. After /build-brain the vault can hold thousands of Imports/
// notes; embedding all of them is a Voyage cost event the owner should trigger
// explicitly, not a silent bootstrap/update side effect.
function countMarkdown(dir, cap = 1000) {
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

function seedRecall(ctx) {
  if (!existsSync(GBRAIN_BIN)) return
  const vault = ctx.vaultPath
  const count = countMarkdown(vault)
  if (count > 800) {
    warn(`Vault has ${count}+ notes - skipping auto-embed to avoid a large Voyage bill. Run /build-recall to embed it when ready.`)
    return
  }
  try {
    execSync(`"${GBRAIN_BIN}" import "${vault}"`, {
      stdio: 'pipe',
      env: { ...process.env, HOME: homedir(), VOYAGE_API_KEY: ctx.env.VOYAGE_API_KEY || '' },
    })
    ok(`semantic recall seeded (${count} notes embedded)`)
  } catch (err) {
    warn(`recall seed failed (${err.message?.split('\n')[0] || 'unknown'}). Run /build-recall to retry.`)
  }
}

function setupRecall(ctx) {
  if (!ctx.brainEnabled) return
  info('Setting up semantic recall (gbrain + graphify)')
  if (installBun()) installGbrain()
  installGraphify()
  configureGbrain(ctx.env.VOYAGE_API_KEY)
  seedRecall(ctx)
}

// Cache result so end-of-install summary can mention if user still needs to install Obsidian.
let _obsidianInstalled = false

function installObsidianApp() {
  // Obsidian is a NAMED manual prerequisite now (the site tells the owner to grab
  // it alongside VS Code). We no longer download it here — the old brew/dmg/winget/
  // PowerShell-asset paths were the flakiest part of the whole install. Just detect
  // whether it's present so the end-of-install summary and the auto-open-vault step
  // (gated on _obsidianInstalled) behave correctly; warn with the link if missing.
  // The vault works as plain markdown either way.
  const platform = process.platform
  const winCandidates = [
    join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe'),
    join(process.env.LOCALAPPDATA || '', 'Programs', 'Obsidian', 'Obsidian.exe'),
    'C:\\Program Files\\Obsidian\\Obsidian.exe',
    'C:\\Program Files (x86)\\Obsidian\\Obsidian.exe',
  ]
  let present = false
  if (platform === 'darwin') present = existsSync('/Applications/Obsidian.app')
  else if (platform === 'win32') present = winCandidates.some(p => existsSync(p))
  else { try { present = !!execSync('command -v obsidian', { stdio: 'pipe' }).toString().trim() } catch {} }

  if (present) { ok('Obsidian found'); _obsidianInstalled = true }
  else warn('Obsidian not found - install it from https://obsidian.md/download (the vault still works as plain markdown without it)')
}

function seedMorningBrief(bundle) {
  if (!bundle.enableMorningBrief) return
  const prompt = bundle.morningBriefPrompt || 'Morning brief: what matters today?'
  const cron = bundle.morningBriefCron || '0 9 * * *'
  const chatId = (bundle.keys?.ALLOWED_CHAT_ID ?? '').split(',')[0]?.trim()
  if (!chatId) { warn('morning brief skipped (no chat id yet)'); return }

  const res = spawnSync('node', [
    join(TEMPLATE_DIR, 'packages', 'scheduler', 'dist', 'register-morning-brief.js'),
  ], {
    env: { ...process.env, MORNING_BRIEF_PROMPT: prompt, MORNING_BRIEF_CRON: cron, ALLOWED_CHAT_ID: chatId, NC_INSTALL_PATH: INSTALL_PATH },
    stdio: 'inherit',
  })
  if (res.status === 0) ok(`morning brief registered (${cron})`)
  else warn('morning brief registration failed')
}

function seedAutoFetch(bundle) {
  if (bundle.enableAutoFetch === false) return  // default on if undefined
  const cron = bundle.autoFetchCron || '*/20 * * * *'
  const chatId = (bundle.keys?.ALLOWED_CHAT_ID ?? '').split(',')[0]?.trim()
  if (!chatId) { warn('auto-fetch skipped (no chat id yet)'); return }

  const res = spawnSync('node', [
    join(TEMPLATE_DIR, 'packages', 'scheduler', 'dist', 'register-auto-fetch.js'),
  ], {
    env: { ...process.env, AUTO_FETCH_CRON: cron, ALLOWED_CHAT_ID: chatId, NC_INSTALL_PATH: INSTALL_PATH },
    stdio: 'inherit',
  })
  if (res.status === 0) ok(`auto-fetch registered (${cron})`)
  else warn('auto-fetch registration failed')
}

const BANNER = `
${ACCENT}
 ███╗   ██╗███████╗██╗     ██╗      ██████╗
 ████╗  ██║██╔════╝██║     ██║     ██╔═══██╗
 ██╔██╗ ██║█████╗  ██║     ██║     ██║   ██║  ${RESET}${DIM}claw${RESET}${ACCENT}
 ██║╚██╗██║██╔══╝  ██║     ██║     ██║   ██║
 ██║ ╚████║███████╗███████╗███████╗╚██████╔╝
 ╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝ ╚═════╝
${RESET}
`

function detectStaleInstalls() {
  // Surface (without auto-deleting) any leftover install state that points at a
  // different folder than the current INSTALL_PATH. Common cause: user reinstalled
  // into a fresh folder without cleaning up ~/nello-claw and the schtasks/launchd
  // entry from a prior attempt, which fights the new daemon on next logon.
  const here = resolve(INSTALL_PATH)
  const dirCandidates = [join(homedir(), 'nello-claw')].filter(p => existsSync(p) && resolve(p) !== here)
  const serviceCandidates = []
  if (process.platform === 'darwin') {
    const plist = join(homedir(), 'Library', 'LaunchAgents', `${LAUNCHAGENT_LABEL}.plist`)
    if (existsSync(plist)) {
      try {
        const body = readFileSync(plist, 'utf-8')
        if (!body.includes(here)) serviceCandidates.push(`launchd plist ${plist} (points outside ${here})`)
      } catch { /* unreadable - leave alone */ }
    }
  } else if (process.platform === 'win32') {
    const q = spawnSync('schtasks', ['/Query', '/TN', LAUNCHAGENT_LABEL, '/FO', 'LIST', '/V'], { stdio: 'pipe' })
    if (q.status === 0) {
      const out = q.stdout?.toString() || ''
      if (!out.toLowerCase().includes(here.toLowerCase())) {
        serviceCandidates.push(`schtasks "${LAUNCHAGENT_LABEL}" (points outside ${here})`)
      }
    }
  } else if (process.platform === 'linux') {
    const unit = join(homedir(), '.config', 'systemd', 'user', `${LAUNCHAGENT_LABEL}.service`)
    if (existsSync(unit)) {
      try {
        const body = readFileSync(unit, 'utf-8')
        if (!body.includes(here)) serviceCandidates.push(`systemd unit ${unit} (points outside ${here})`)
      } catch { /* unreadable */ }
    }
  }
  if (dirCandidates.length === 0 && serviceCandidates.length === 0) return
  warn('Detected leftover state from a previous install:')
  for (const d of dirCandidates) warn(`  - directory: ${d}`)
  for (const s of serviceCandidates) warn(`  - service:   ${s}`)
  warn('These will fight the new install on next logon. Recommended cleanup:')
  if (dirCandidates.length > 0) warn(`  rm -rf ${dirCandidates.join(' ')}`)
  if (process.platform === 'win32') warn(`  schtasks /Delete /F /TN "${LAUNCHAGENT_LABEL}"`)
  if (process.platform === 'darwin') warn(`  launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/${LAUNCHAGENT_LABEL}.plist; rm ~/Library/LaunchAgents/${LAUNCHAGENT_LABEL}.plist`)
  if (process.platform === 'linux') warn(`  systemctl --user disable --now ${LAUNCHAGENT_LABEL}; rm ~/.config/systemd/user/${LAUNCHAGENT_LABEL}.service`)
}

// Hand-rolled bundle schema check. The assistant assembles bundle.json locally
// from the install interview, but it's still the trust boundary into bootstrap:
// a hand-edited or tampered bundle must not smuggle extra data into context that
// later drives file writes or process spawning. Reject unknown top-level keys and
// bad types.
const BUNDLE_KNOWN_KEYS = new Set([
  'name', 'assistantName', 'occupation', 'location', 'timezone', 'bio', 'age',
  'projects', 'teamMembers', 'clients', 'mentors', 'tools',
  // Deep company brain — the conversational install (INSTALL_GUIDE.md) interviews
  // the client about their business and writes these so CLAUDE.md ships with real
  // context instead of empty defaults.
  'role', 'company', 'industry', 'targetCustomer', 'services', 'values',
  // Voice/persona — consumed by CLAUDE.md.hbs. Without these on the whitelist a
  // bundle that sets them is hard-rejected, so the persona could never be tuned.
  'communicationStyle', 'language', 'emDashPolicy', 'oxfordComma', 'bannedWords',
  'enableKarpathyGuidelines', 'enableHumanizer', 'installTelegram', 'installDashboard',
  'vaultPath', 'vaultPreset', 'customPrefixes', 'graphifyEnabled',
  'mcps', 'keys',
  'installLaunchAgent', 'enableMorningBrief', 'morningBriefPrompt', 'morningBriefCron',
  'enableAutoFetch', 'autoFetchCron',
  'telegramChatId',
  // Pick-one messaging channel chosen at install: "telegram" or "whatsapp".
  'messagingChannel',
])
function validateBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    fail('bundle.json must be a JSON object')
    process.exit(1)
  }
  for (const key of Object.keys(bundle)) {
    if (!BUNDLE_KNOWN_KEYS.has(key)) {
      fail(`bundle.json contains unknown key: ${JSON.stringify(key)}. Refusing to proceed. Re-assemble bundle.json from the install interview (INSTALL_GUIDE.md Step 5).`)
      process.exit(1)
    }
  }
  // Spot-check shapes for fields that get interpolated into paths or configs.
  for (const k of ['vaultPath', 'vaultPreset', 'name', 'assistantName', 'bio', 'occupation']) {
    if (bundle[k] !== undefined && typeof bundle[k] !== 'string') {
      fail(`bundle.${k} must be a string, got ${typeof bundle[k]}`)
      process.exit(1)
    }
  }
  if (bundle.mcps !== undefined && (typeof bundle.mcps !== 'object' || Array.isArray(bundle.mcps))) {
    fail('bundle.mcps must be a plain object map')
    process.exit(1)
  }
  if (bundle.keys !== undefined && (typeof bundle.keys !== 'object' || Array.isArray(bundle.keys))) {
    fail('bundle.keys must be a plain object map')
    process.exit(1)
  }
  if (bundle.messagingChannel !== undefined
      && bundle.messagingChannel !== 'telegram'
      && bundle.messagingChannel !== 'whatsapp') {
    fail(`bundle.messagingChannel must be "telegram" or "whatsapp", got ${JSON.stringify(bundle.messagingChannel)}`)
    process.exit(1)
  }
}

// Resolve the requested vault path and refuse anything outside the user's
// home directory. Without this, `bundle.vaultPath = "/etc"` (or any other
// shared system dir) makes mkdirSync + the vault-seeder write files outside
// the install boundary documented in SECURITY.md.
function validateVaultPath(vaultPath) {
  // Don't realpath the leaf — it might not exist yet (vault is created later).
  // Walk up to the first existing ancestor and realpath that.
  let probe = resolve(vaultPath)
  let depth = 0
  while (!existsSync(probe) && dirname(probe) !== probe && depth < 64) {
    probe = dirname(probe)
    depth++
  }
  const realProbe = existsSync(probe) ? realpathSync(probe) : probe
  const home = realpathSync(homedir())
  if (realProbe !== home && !realProbe.startsWith(home + sep)) {
    fail(`Refusing to seed vault outside home directory.\n    vaultPath: ${vaultPath}\n    resolved:  ${realProbe}\n    must be under: ${home}`)
    process.exit(1)
  }
}

async function main() {
  // --report-missing-keys emits pure JSON to stdout (the /update skill parses it),
  // so keep the banner out of its output. Every other path prints it.
  if (!process.argv.includes('--report-missing-keys')) console.log(BANNER)

  if (!existsSync(BUNDLE_PATH)) {
    fail(`bundle not found at ${BUNDLE_PATH}`)
    process.exit(1)
  }

  const CONFIGS_ONLY = process.argv.includes('--configs-only')
  // Read-only query mode: print the required keys an enabled tool still lacks (as
  // JSON) and exit. The /update skill calls this to drive the interview-diff -
  // prompt for just the missing keys, write them to .env, re-render. No writes,
  // no migrations, no provisioning, no stale-install scan.
  const REPORT_MISSING = process.argv.includes('--report-missing-keys')

  if (!CONFIGS_ONLY && !REPORT_MISSING) detectStaleInstalls()

  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf-8'))
  validateBundle(bundle)

  // .env is the single source of truth for secrets once an install exists.
  // Overlay it onto bundle.keys (env wins) so a re-run — and especially the
  // `--configs-only` sync after the owner edits .env — regenerates configs from
  // the live .env, not the frozen bundle.json. This also makes the Composio
  // auto-provision below skip when COMPOSIO_MCP_URL already lives in .env (the
  // minted URL is written to .env but never back to bundle.json), so there's no
  // accidental re-mint. First install: .env doesn't exist yet → overlay empty →
  // output unchanged.
  bundle.keys = { ...(bundle.keys || {}), ...readEnvOverlay(join(INSTALL_PATH, '.env')) }

  // Versioned stack migrations (full bootstrap only - the path /update runs). These
  // are deterministic transforms keyed by id, applied at most once, recorded in
  // .nello-version. They mutate bundle.keys (-> .env via writeEnv) and bundle.mcps
  // (-> bundle.json via patchBundle), so they must run BEFORE the Composio provision
  // and buildContext below, where those values are read.
  let appliedMigrations
  if (!CONFIGS_ONLY && !REPORT_MISSING) {
    appliedMigrations = await runMigrations(bundle)
  }

  // Composio: the only value collected is the API key. Mint this install's durable
  // Tool Router URL from it automatically (destructiveHint disabled = no delete/trash),
  // so nobody pastes a URL. Skip if one was already provided (wizard pre-provisioned),
  // and skip entirely for the read-only --report-missing-keys query (no network call).
  if (!REPORT_MISSING && bundle.keys?.COMPOSIO_API_KEY && !bundle.keys?.COMPOSIO_MCP_URL) {
    const userId = bundle.keys.COMPOSIO_USER_ID || bundle.keys.GOOGLE_USER_EMAIL
    if (!userId) {
      fail('COMPOSIO_API_KEY set but no COMPOSIO_USER_ID / GOOGLE_USER_EMAIL to key the connections to.')
      process.exit(1)
    }
    info('Provisioning Composio Tool Router (no delete/trash)')
    const { provisionRouterUrl } = await import('./scripts/composio-provision.mjs')
    try {
      bundle.keys.COMPOSIO_MCP_URL = await provisionRouterUrl(bundle.keys.COMPOSIO_API_KEY, userId)
      ok('Composio router ready')
    } catch (err) {
      fail(`Composio provisioning failed: ${err.message?.split('\n')[0] || err}`)
      process.exit(1)
    }
  }

  const ctx = buildContext(bundle)

  // --report-missing-keys: print the required-but-absent keys for enabled tools and
  // stop. Read-only - no vault validation, no stamp, no file writes.
  if (REPORT_MISSING) {
    process.stdout.write(JSON.stringify(missingRequiredKeys(ctx)) + '\n')
    return
  }

  validateVaultPath(ctx.vaultPath)

  // Record the code version this install was built from (for /install-doctor + the
  // update-staleness check) plus the migrations applied. Both the full install and
  // --configs-only restamp; --configs-only passes no migration list so the prior
  // appliedMigrations is preserved.
  writeVersionStamp(INSTALL_PATH, appliedMigrations)

  // --configs-only: the `sync-env-to-configs.sh` fast path. Regenerate JUST
  // .mcp.json + claude_desktop_config.json from the live .env (already overlaid
  // onto bundle.keys above), then stop — no persona re-render, no vault reseed,
  // no plugin/skill/service/Obsidian work, no audit, no dashboard poll. Byte-
  // identical to the full path's config write (same renderers + managed sets),
  // and writeMergedMcpConfig preserves client-added (unmanaged) MCP servers.
  if (CONFIGS_ONLY) {
    info('Syncing MCP configs from .env')
    writeMergedMcpConfig(join(INSTALL_PATH, '.mcp.json'), renderMcpJson(ctx), managedMcpKeys(renderMcpJson))
    writeMergedMcpConfig(join(INSTALL_PATH, 'claude_desktop_config.json'), renderClaudeDesktopConfig(ctx), managedMcpKeys(renderClaudeDesktopConfig))
    ok('.mcp.json + claude_desktop_config.json synced from .env')
    return
  }

  // Upfront summary so user (and Claude in plan mode) sees every change before any of them happen.
  console.log(`${ACCENT}This bootstrap will make these changes:${RESET}`)
  console.log(`  ${DIM}1.${RESET} Write personalised files to ${INSTALL_PATH}/ (CLAUDE.md, AGENTS.md, .env, .mcp.json, vault/)`)
  console.log(`  ${DIM}2.${RESET} ${process.platform === 'win32' ? `Lock down ${INSTALL_PATH}\\.env via NTFS user-only ACL` : `chmod 600 on ${INSTALL_PATH}/.env so only you can read it`}`)
  console.log(`  ${DIM}3.${RESET} Symlink ${readdirSync(join(TEMPLATE_DIR, 'skills')).length} bundled skills into ${SKILLS_DIR} (existing skills with same names get .bak'd)`)
  console.log(`  ${DIM}4.${RESET} Write project-scoped settings to ${SETTINGS_PATH}`)
  console.log(`     ${DIM}(this enables bypassPermissions ONLY when working in this folder, NOT globally)${RESET}`)
  console.log(`  ${DIM}5.${RESET} Install obsidian-cli globally via npm (lets Claude write vault notes from CLI)`)
  console.log(`  ${DIM}6.${RESET} Create vault/Memory/ + vault/Journal/ - your assistant auto-saves notes here as Obsidian markdown`)
  if (bundle.installLaunchAgent) {
    console.log(`  ${DIM}7.${RESET} Register auto-start service "${LAUNCHAGENT_LABEL}" via launchctl/schtasks/systemd`)
  }
  if (bundle.enableMorningBrief) {
    console.log(`  ${DIM}8.${RESET} Seed daily morning-brief task in store/clawd.db`)
  }
  console.log(`  ${DIM}*.${RESET} Bundle file at ${BUNDLE_PATH} is NOT deleted automatically - you delete it after\n`)

  info('Writing personalised files')
  renderTemplate(join(TEMPLATE_DIR, 'CLAUDE.md.hbs'), join(INSTALL_PATH, 'CLAUDE.md'), ctx)
  renderTemplate(join(TEMPLATE_DIR, 'AGENTS.md.hbs'), join(INSTALL_PATH, 'AGENTS.md'), ctx)
  renderTemplate(join(TEMPLATE_DIR, 'brain-context.md.hbs'), join(INSTALL_PATH, 'brain-context.md'), ctx)
  // JSON configs go through JS object factories + JSON.stringify, not Handlebars.
  // Handlebars HTML-escapes but does NOT JSON-string-escape, so any `"` or `\`
  // or newline in installPath / vaultPath / env values used to break these
  // configs or inject extra args/env structure into spawned MCP processes.
  writeMergedMcpConfig(join(INSTALL_PATH, '.mcp.json'), renderMcpJson(ctx), managedMcpKeys(renderMcpJson))
  writeMergedMcpConfig(join(INSTALL_PATH, 'claude_desktop_config.json'), renderClaudeDesktopConfig(ctx), managedMcpKeys(renderClaudeDesktopConfig))
  writeEnv(bundle)
  ok('CLAUDE.md, AGENTS.md, brain-context.md, .env, .mcp.json, claude_desktop_config.json')

  // A tool was turned on but a required key is missing - say so loudly rather than
  // let it fail silently later. /update collects these for you (the interview-diff);
  // a manual install can just add the key to .env and re-run.
  const missingKeys = missingRequiredKeys(ctx)
  if (missingKeys.length) {
    const plural = missingKeys.length > 1
    warn(`Missing required key${plural ? 's' : ''} for enabled tool${plural ? 's' : ''}: ${missingKeys.map(m => `${m.key} (${m.tool}, from ${m.where})`).join('; ')}`)
    warn(`Add ${plural ? 'them' : 'it'} to .env to switch ${plural ? 'those tools' : 'that tool'} on. /update prompts for new keys automatically.`)
  }

  info('Seeding vault')
  const { seedVault } = await import('./packages/vault-seeder/dist/seed.js')
  const seedResult = seedVault({
    preset: bundle.vaultPreset || 'nello',
    vaultPath: ctx.vaultPath,
    presetsRoot: join(TEMPLATE_DIR, 'vault-presets'),
    bundle: ctx,
  })
  ok(`vault seeded (${seedResult.written.length} files, ${seedResult.skipped.length} skipped)`)

  info('Installing Claude Code plugins (agentmemory, karpathy-skills)')
  installClaudePlugins()

  info('Linking skill pack + merging settings.json')
  symlinkSkills()
  mergeSettingsJson(ctx)

  info('Creating runtime dirs')
  mkdirSync(join(INSTALL_PATH, 'store'), { recursive: true })
  mkdirSync(join(INSTALL_PATH, 'workspace', 'uploads'), { recursive: true })
  // Vault is the memory. Memory + Journal subdirs live inside the vault
  // so Obsidian indexes them via graph + full-text search.
  mkdirSync(join(ctx.vaultPath, 'Memory'), { recursive: true })
  mkdirSync(join(ctx.vaultPath, 'Journal'), { recursive: true })
  ok('store/, workspace/uploads/, vault/Memory/, vault/Journal/')

  info('Setting up Obsidian (vault is the permanent memory)')
  installObsidianApp()
  try {
    execSync('npm install -g obsidian-cli', { stdio: 'pipe' })
    // Verify it actually lands on PATH - npm global bin path mismatch is common on Windows.
    const probe = spawnSync('obsidian-cli', ['--version'], { shell: true, stdio: 'pipe' })
    if (probe.status === 0) {
      ok('obsidian-cli installed globally')
    } else {
      let prefix = ''
      try { prefix = execSync('npm config get prefix', { stdio: 'pipe' }).toString().trim() } catch {}
      warn(`obsidian-cli installed but not on PATH${prefix ? ` (add ${prefix} to PATH)` : ''}. Vault still works as plain markdown.`)
    }
  } catch (err) {
    const reason = err?.stderr?.toString().split('\n')[0] || err?.message?.split('\n')[0] || 'unknown'
    warn(`obsidian-cli install failed (${reason}). Vault still works as plain markdown.`)
  }

  info('Installing uv (Python runtime for Google Workspace MCP)')
  installUv()

  // Semantic recall: installs Bun + gbrain + graphify and embeds the seeded vault
  // via Voyage. No-op unless a VOYAGE_API_KEY is present (ctx.brainEnabled).
  setupRecall(ctx)

  if (bundle.installLaunchAgent) {
    info('Installing auto-start service')
    installService()
  }

  if (bundle.enableMorningBrief) {
    info('Seeding morning brief')
    seedMorningBrief(bundle)
  }

  if (bundle.enableAutoFetch !== false) {
    info('Seeding auto-fetch (20-min tick)')
    seedAutoFetch(bundle)
  }

  info('Audit')
  try {
    execSync(`node "${join(TEMPLATE_DIR, 'packages', 'audit', 'dist', 'cli.js')}" audit`, {
      stdio: 'inherit',
      env: { ...process.env, NC_INSTALL_PATH: INSTALL_PATH },
    })
  } catch {}

  // App shortcut. Universal here so all entry paths get it (bash one-liner,
  // PowerShell, Claude Code paste-in, manual git clone).
  if (process.platform === 'darwin') {
    info('Creating Mac app shortcut')
    createMacAppShortcut()
  } else if (process.platform === 'win32') {
    info('Creating Windows shortcuts')
    createWindowsShortcuts()
  }

  // The daemon uses the user's Claude Code session via the Claude Agent SDK.
  // No API key needed - SDK reads ~/.claude/.credentials.json (Claude Code login).
  // If that file is missing, runAgent() returns "(no response)" silently.
  // This is the #1 thing that breaks installs.
  const claudeCreds = join(homedir(), '.claude', '.credentials.json')
  const hasClaudeLogin = existsSync(claudeCreds)

  // Bundle still has plaintext keys. Tell the user, don't auto-delete.
  // Auto-delete looks like covering tracks; explicit deletion is safer + clearer.
  console.log(`\n${ACCENT}Done.${RESET}\n`)
  console.log(`Your keys are now in ${INSTALL_PATH}/.env ${process.platform === 'win32' ? '(NTFS user-only)' : '(chmod 600)'}.`)
  console.log(`The original bundle still has plaintext copies. ${ACCENT}Delete it now:${RESET}`)
  console.log(`  ${DIM}rm "${BUNDLE_PATH}"${RESET}\n`)

  if (!hasClaudeLogin) {
    console.log(`${RED}One more thing - log in to Claude Code.${RESET}`)
    console.log(`The daemon talks to Claude through your Claude Code session. Run this once:`)
    console.log(`  ${ACCENT}claude${RESET}`)
    console.log(`${DIM}It opens a browser, you sign in with Claude.ai (free), it caches credentials at ~/.claude/.credentials.json.${RESET}`)
    console.log(`${DIM}Then restart the daemon:${RESET}`)
    if (process.platform === 'darwin') {
      console.log(`  ${DIM}launchctl kickstart -k gui/$(id -u)/${LAUNCHAGENT_LABEL}${RESET}`)
    } else if (process.platform === 'win32') {
      console.log(`  ${DIM}Log out and back in (the Startup item relaunches the daemon), or kill the node daemon and re-run nello-claw-daemon.cmd${RESET}`)
    } else {
      console.log(`  ${DIM}systemctl --user restart ${LAUNCHAGENT_LABEL}${RESET}`)
    }
    console.log(`${DIM}Without this, the dashboard chat will say "(no response)".${RESET}\n`)
  } else {
    console.log(`${ACCENT}Claude Code login: ready${RESET} ${DIM}(daemon will talk to Claude through your session)${RESET}\n`)
  }

  // Poll the dashboard health endpoint for up to 30s, then auto-open the
  // browser regardless. Even if the daemon hasn't bound to the port yet, the
  // browser will show "can't connect" → load the page once it does. Better
  // UX than leaving the user staring at terminal text wondering what to do.
  const dashboardUrl = readDashboardUrl()
  info(`Waiting for dashboard at ${dashboardUrl}`)
  let dashboardHealthy = false
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${dashboardUrl}/api/monitoring/health`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) { dashboardHealthy = true; break }
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }

  if (dashboardHealthy) {
    ok(`Dashboard is up at ${dashboardUrl}`)
  } else {
    warn(`Dashboard didn't respond on /api/monitoring/health within 30s. Opening anyway - it may still be starting.`)
    const logFile = join(INSTALL_PATH, 'store', 'server.log')
    if (existsSync(logFile)) {
      console.log(`\n${DIM}Last 30 lines of ${logFile}:${RESET}`)
      try {
        const log = readFileSync(logFile, 'utf-8').split('\n').slice(-30).join('\n')
        console.log(log.split('\n').map(l => `  ${l}`).join('\n'))
      } catch {}
    }
  }

  const vaultPath = join(INSTALL_PATH, 'vault')

  // Auto-open dashboard + Obsidian vault. Both wrapped so failures don't abort
  // install. Print fallback manual instructions either way so Peter knows what
  // to do if the GUI handoff silently no-ops (headless box, missing default
  // browser, Obsidian not in PATH, etc).
  let dashboardOpened = false
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${dashboardUrl}"`, { stdio: 'ignore' })
      dashboardOpened = true
    } else if (process.platform === 'win32') {
      execSync(`start "" "${dashboardUrl}"`, { stdio: 'ignore', shell: 'cmd.exe' })
      dashboardOpened = true
    } else {
      execSync(`xdg-open "${dashboardUrl}"`, { stdio: 'ignore' })
      dashboardOpened = true
    }
  } catch {}

  let vaultOpened = false
  if (_obsidianInstalled) {
    try {
      if (process.platform === 'darwin') {
        // `open -a Obsidian <folder>` launches Obsidian and prompts to open
        // the folder as a vault on first run, then opens it directly on
        // subsequent runs.
        execSync(`open -a Obsidian "${vaultPath}"`, { stdio: 'ignore' })
        vaultOpened = true
      } else if (process.platform === 'win32') {
        // Reuse the candidate paths from installObsidianApp so we launch the
        // real exe with the vault as arg.
        const exeCandidates = [
          join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe'),
          join(process.env.LOCALAPPDATA || '', 'Programs', 'Obsidian', 'Obsidian.exe'),
          'C:\\Program Files\\Obsidian\\Obsidian.exe',
          'C:\\Program Files (x86)\\Obsidian\\Obsidian.exe',
        ]
        const exe = exeCandidates.find(p => existsSync(p))
        if (exe) {
          execSync(`start "" "${exe}" "${vaultPath}"`, { stdio: 'ignore', shell: 'cmd.exe' })
          vaultOpened = true
        }
      } else {
        // Linux: try xdg-open on the folder. Obsidian's .desktop entry usually
        // handles directory mime type when installed via AppImage/snap.
        execSync(`xdg-open "${vaultPath}"`, { stdio: 'ignore' })
        vaultOpened = true
      }
    } catch {}
  }

  // Final summary - point user at the dashboard chat. They can ask Claude what's set up.
  let skillCount = 0, mcpCount = 0
  try { skillCount = readdirSync(join(TEMPLATE_DIR, 'skills')).length } catch {}
  try {
    const m = JSON.parse(readFileSync(join(INSTALL_PATH, '.mcp.json'), 'utf-8'))
    mcpCount = Object.keys(m.mcpServers || {}).length
  } catch {}
  const chatId = (bundle.keys?.ALLOWED_CHAT_ID ?? '').split(',')[0]?.trim()

  console.log(`\n${ACCENT}✓ Done${RESET}\n`)
  console.log(`${ACCENT}What's set up:${RESET}`)
  console.log(`  • Dashboard at ${dashboardUrl}${DIM} ${dashboardOpened ? '(opening in your browser...)' : '(open it manually)'}${RESET}`)
  console.log(`  • Obsidian vault at ${vaultPath}${DIM} ${vaultOpened ? '(opening in Obsidian...)' : ''}${RESET}`)
  if (chatId) console.log(`  • Telegram bot linked to chat ${chatId}`)
  console.log(`  • ${skillCount} skills, ${mcpCount} MCP servers\n`)

  // Explicit how-to-open-vault block. Peter is non-technical: spell out the
  // folder location AND the manual open path so he can get back to it after
  // the first auto-open if he closes Obsidian.
  console.log(`${ACCENT}Your vault (your AI's long-term memory):${RESET}`)
  console.log(`  • Lives at: ${ACCENT}${vaultPath}${RESET}`)
  console.log(`  • Folder name inside Obsidian: ${ACCENT}vault${RESET} (sits inside your install folder)`)
  if (_obsidianInstalled) {
    console.log(`  • To re-open later: launch Obsidian → it remembers this vault, or File → Open Vault → pick the folder above`)
    if (!vaultOpened) {
      console.log(`    ${DIM}It didn't auto-open this time. Open Obsidian.app, then File → Open Vault → pick the folder above.${RESET}`)
    }
  } else {
    console.log(`  • Obsidian didn't install automatically. Get it from ${ACCENT}https://obsidian.md/download${RESET}`)
    console.log(`    Then open Obsidian → ${ACCENT}File → Open Vault${RESET} → pick the folder above`)
  }
  console.log(`  ${DIM}Inside you'll see: Inbox.md (capture anything), Journal/ (daily notes), Memory/ (your AI's auto-memory), MOC-*.md (maps of content).${RESET}\n`)

  if (!dashboardOpened) {
    console.log(`${DIM}If your browser didn't open: visit ${dashboardUrl} manually.${RESET}\n`)
  }
  console.log(`${ACCENT}Next:${RESET}`)
  console.log(`  1. ${ACCENT}Run /nello-start${RESET} in this terminal (or in the dashboard chat) to begin onboarding`)
  console.log(`     ${DIM}If you don't see it, start a new chat. If you still don't, ask Claude to run it.${RESET}`)
  console.log(`  2. Open the dashboard above and message your AI COO`)
  console.log(`  3. Stuck? Run /install-doctor for a full audit of what's wired\n`)
}

function readDashboardUrl() {
  // Read DASHBOARD_PORT from .env if set, else default 3000
  let port = '3000'
  try {
    const envPath = join(INSTALL_PATH, '.env')
    if (existsSync(envPath)) {
      const env = readFileSync(envPath, 'utf-8')
      const match = env.match(/^DASHBOARD_PORT=(.+)$/m)
      if (match) port = match[1].replace(/^["']|["']$/g, '').trim()
    }
  } catch {}
  return `http://localhost:${port}`
}

main().catch((err) => {
  fail(err.stack || err.message)
  process.exit(1)
})
