#!/usr/bin/env node
/**
 * nello-claw bootstrap - renders the wizard bundle into a live installation.
 *
 * Input: ./bundle.json (or NC_BUNDLE env path) - wizard answers JSON
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
import { fileURLToPath } from 'node:url'
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
  google: 'Gmail, Calendar, Drive, Docs, Sheets via workspace-mcp',
  obsidian: 'read/write your vault directly',
  exa: 'web research with citations',
  apify: 'web scraping + Actor marketplace',
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
  }
}

function writeEnv(bundle) {
  const keys = { ...(bundle.keys || {}) }

  // Telegram owner lock. The wizard can supply the owner chat ID either as a
  // top-level `telegramChatId` field (PR-7.1) or inside keys.ALLOWED_CHAT_ID
  // (existing wizard path). The explicit field wins. Writing this into .env is
  // the load-bearing fix: a non-empty ALLOWED_CHAT_ID means the bot's
  // isAuthorised() has a real list AND discovery.ts (first-message-wins
  // pairing, gated on an empty allowlist) never fires.
  const ownerChatId = String(bundle.telegramChatId ?? keys.ALLOWED_CHAT_ID ?? '').trim()
  if (ownerChatId) keys.ALLOWED_CHAT_ID = ownerChatId

  // Fail closed on an unlocked bot. If a Telegram token ships but no owner chat
  // ID, discovery.ts does first-message-wins pairing and hands ownership of a
  // bypassPermissions assistant to whoever messages the bot first. install.sh
  // asserts this after the fact, but the conversational install runs bootstrap
  // directly (NC_INSTALL_PATH=… node template/bootstrap.js) — so guard the
  // invariant here, where every entry path passes through.
  if (keys.TELEGRAM_BOT_TOKEN && !ownerChatId) {
    fail('Telegram bot token present but ALLOWED_CHAT_ID / telegramChatId is empty. The bot would ship unlocked (discovery.ts first-message-wins pairing). Re-collect the owner chat ID and re-run.')
    process.exit(1)
  }

  // Dashboard auth token (v1 security blocker). The dashboard + its chat route
  // run with bypassPermissions, so an unauthed device reaching it is RCE. The
  // server gates every request (and the WS upgrade) on DASHBOARD_TOKEN. Generate
  // a strong random token here and persist it in .env so it's stable across
  // daemon restarts. Reuse an existing value if the wizard or a prior install
  // already set one, so re-running bootstrap doesn't invalidate live sessions.
  const existingEnvPath = join(INSTALL_PATH, '.env')
  if (!keys.DASHBOARD_TOKEN) {
    let priorToken = ''
    try {
      if (existsSync(existingEnvPath)) {
        const m = readFileSync(existingEnvPath, 'utf-8').match(/^DASHBOARD_TOKEN=(.+)$/m)
        if (m) priorToken = m[1].replace(/^["']|["']$/g, '').trim()
      }
    } catch {}
    keys.DASHBOARD_TOKEN = priorToken || randomBytes(32).toString('hex')
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
  try { chmodSync(envPath, 0o600) } catch {}
}

// Every server name a given renderer can emit (all baseline flags on). Derived
// from the renderer itself, not hardcoded, so the managed set can never drift
// from render-configs.js. .mcp.json and claude_desktop_config.json have
// different baseline sets, so each call passes its own renderer's set.
function managedMcpKeys(renderFn) {
  const allOn = { mcps: { google: true, obsidian: true, exa: true, apify: true, tavily: true, firecrawl: true }, env: {}, vaultPath: '' }
  return new Set(Object.keys(renderFn(allOn).mcpServers || {}))
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

// Cache result so end-of-install summary can mention if user still needs to install Obsidian.
let _obsidianInstalled = false

function installObsidianApp() {
  // Cross-platform Obsidian install with real fallbacks. Idempotent - skips if
  // already installed. Runs from bootstrap so EVERY entry path gets Obsidian
  // (bash one-liner, PowerShell, Claude Code paste-in, manual git clone all
  // hit this same code).
  const platform = process.platform

  if (platform === 'darwin') {
    if (existsSync('/Applications/Obsidian.app')) { ok('Obsidian.app already installed'); _obsidianInstalled = true; return }
    // Try Homebrew first
    try {
      execSync('which brew', { stdio: 'pipe' })
      execSync('brew install --cask obsidian', { stdio: 'pipe' })
      if (existsSync('/Applications/Obsidian.app')) { ok('Obsidian.app installed via Homebrew'); _obsidianInstalled = true; return }
    } catch {}
    // Fallback - download .dmg directly + open it. User drag-drops to Applications.
    // Better than nothing: at least the user sees Obsidian in their face.
    try {
      const dmg = join(process.env.TMPDIR || '/tmp', 'Obsidian.dmg')
      execSync(`curl -fsSL -o "${dmg}" https://github.com/obsidianmd/obsidian-releases/releases/latest/download/Obsidian-universal.dmg`, { stdio: 'pipe' })
      execSync(`open "${dmg}"`, { stdio: 'pipe' })
      warn('Obsidian.dmg opened - drag the app icon to Applications, then close the disk image. Vault still works as plain markdown if you skip.')
    } catch {
      warn('Obsidian install skipped - get it from https://obsidian.md/download (vault still works as plain markdown)')
    }
  } else if (platform === 'win32') {
    const exeCandidates = [
      join(process.env.LOCALAPPDATA || '', 'Obsidian', 'Obsidian.exe'),
      join(process.env.LOCALAPPDATA || '', 'Programs', 'Obsidian', 'Obsidian.exe'),
      'C:\\Program Files\\Obsidian\\Obsidian.exe',
      'C:\\Program Files (x86)\\Obsidian\\Obsidian.exe',
    ]
    if (exeCandidates.some(p => existsSync(p))) { ok('Obsidian already installed'); _obsidianInstalled = true; return }
    // Try winget first
    try {
      execSync('winget install --silent --accept-source-agreements --accept-package-agreements Obsidian.Obsidian', { stdio: 'pipe' })
      if (exeCandidates.some(p => existsSync(p))) { ok('Obsidian installed via winget'); _obsidianInstalled = true; return }
    } catch {}
    // Fallback - resolve latest installer asset via GitHub Releases API then download.
    // Earlier versions of this script hit a hardcoded URL that 404'd because Obsidian
    // ships versioned filenames (e.g. Obsidian-1.5.12.exe), not a stable Obsidian.exe.
    try {
      const installer = join(process.env.TEMP || process.env.LOCALAPPDATA || '.', 'Obsidian-installer.exe')
      // Escape PowerShell single-quote literal for paths that may contain `'`
      // (e.g. `C:\Users\O'Brien\AppData\Local\Temp`). Without this the single-
      // quoted PS string breaks and the user gets a confusing parser error or,
      // worse, runs arbitrary follow-on text as a command.
      const installerPsLit = installer.replace(/'/g, "''")
      info('Resolving latest Obsidian installer (winget unavailable)...')
      const ps = [
        "$ErrorActionPreference='Stop'",
        "$rel = Invoke-RestMethod 'https://api.github.com/repos/obsidianmd/obsidian-releases/releases/latest'",
        "$asset = $rel.assets | Where-Object { $_.name -match '^Obsidian-\\d+\\.\\d+\\.\\d+\\.exe$' } | Select-Object -First 1",
        "if (-not $asset) { throw 'no matching installer in latest release' }",
        `Invoke-WebRequest -Uri $asset.browser_download_url -OutFile '${installerPsLit}'`,
      ].join('; ')
      // spawnSync with argv avoids the cmd.exe quoting layer entirely — safer than
      // execSync(`powershell -Command "${ps}"`) when ps contains nested quotes.
      const psRes = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'pipe' })
      if (psRes.status !== 0) {
        throw new Error(psRes.stderr?.toString().split('\n')[0] || 'powershell download failed')
      }
      const runRes = spawnSync(installer, ['/S'], { stdio: 'pipe' })  // /S = silent install
      if (runRes.status !== 0) {
        throw new Error(runRes.stderr?.toString().split('\n')[0] || 'installer exit non-zero')
      }
      if (exeCandidates.some(p => existsSync(p))) { ok('Obsidian installed via direct download'); _obsidianInstalled = true; return }
      warn('Obsidian installer ran but app not found at expected path. Open https://obsidian.md/download and install manually.')
    } catch (err) {
      const reason = err?.stderr?.toString().split('\n')[0] || err?.message?.split('\n')[0] || 'unknown'
      warn(`Obsidian install skipped (${reason}) - get it from https://obsidian.md/download (vault still works as plain markdown)`)
    }
  } else {
    warn('Linux: install Obsidian manually from https://obsidian.md/download (vault still works as plain markdown)')
  }
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

// Hand-rolled bundle schema check. Hosted wizard already produces well-shaped
// bundles, but bundle.json is the trust boundary between the wizard host and
// the customer machine — anything that lands in ~/Downloads can be replaced
// or tampered with before install. Reject unknown top-level keys and bad
// types so a hostile bundle can't smuggle extra data into context that later
// drives file writes or process spawning.
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
])
function validateBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    fail('bundle.json must be a JSON object')
    process.exit(1)
  }
  for (const key of Object.keys(bundle)) {
    if (!BUNDLE_KNOWN_KEYS.has(key)) {
      fail(`bundle.json contains unknown key: ${JSON.stringify(key)}. Refusing to proceed — re-download a fresh bundle from labs.nello.gg.`)
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
  console.log(BANNER)

  if (!existsSync(BUNDLE_PATH)) {
    fail(`bundle not found at ${BUNDLE_PATH}`)
    process.exit(1)
  }

  detectStaleInstalls()

  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf-8'))
  validateBundle(bundle)
  const ctx = buildContext(bundle)
  validateVaultPath(ctx.vaultPath)

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
