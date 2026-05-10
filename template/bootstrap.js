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

import { readFileSync, writeFileSync, existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, copyFileSync, readdirSync, chmodSync, renameSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'
import { execSync, spawnSync } from 'node:child_process'
import Handlebars from 'handlebars'

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
// "## Installed MCPs" bullet list, so any MCP added to .mcp.json.hbs
// needs a row here too — otherwise the bullet shows the name with an
// empty purpose.
const MCP_PURPOSES = {
  google: 'Gmail, Calendar, Drive, Docs, Sheets via workspace-mcp',
  obsidian: 'read/write your vault directly',
  exa: 'web research with citations',
  apify: 'web scraping + Actor marketplace',
  gitnexus: 'GitHub repo intelligence',
  n8n: 'workflow automation',
}

function buildContext(bundle) {
  const installPathPosix = toPosixPath(INSTALL_PATH)
  const vaultPathPosix = toPosixPath(bundle.vaultPath || join(INSTALL_PATH, 'vault'))
  const escapedPath = installPathPosix.replace(/^\//, '-').replace(/\//g, '-')
  // `mcps` stays a boolean map ({google: true, ...}) because .mcp.json.hbs
  // does {{#if mcps.google}} checks. CLAUDE.md.hbs needs a real list to
  // iterate with {{#each mcpsList}}, so build that here as [{name, purpose}].
  const mcpsList = Object.entries(bundle.mcps || {})
    .filter(([, on]) => !!on)
    .map(([name]) => ({ name, purpose: MCP_PURPOSES[name] || '' }))
  return {
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
  const keys = bundle.keys || {}
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

function symlinkSkills() {
  const src = join(TEMPLATE_DIR, 'skills')
  const dest = SKILLS_DIR
  mkdirSync(dest, { recursive: true })

  // Use 'junction' on Windows so users don't need Developer Mode or admin to
  // install. Junctions work for directory targets exactly like symlinks but
  // don't require the SeCreateSymbolicLinkPrivilege. All bundled skills are
  // directories, so junction is a drop-in replacement here.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'

  for (const name of readdirSync(src)) {
    const srcPath = join(src, name)
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
    } catch (err) {
      warn(`couldn't link ${name}: ${err.message?.split('\n')[0] || 'unknown'}. Skill won't be discoverable until linked manually.`)
    }
  }
  ok(`linked ${readdirSync(src).length} skills into ${dest}`)
}

function mergeSettingsJson(ctx) {
  const settingsPath = SETTINGS_PATH
  mkdirSync(dirname(settingsPath), { recursive: true })

  const newSettings = JSON.parse(Handlebars.compile(
    readFileSync(join(TEMPLATE_DIR, 'hooks', 'settings.json.hbs'), 'utf-8'),
    { noEscape: true }
  )(ctx))

  let existing = {}
  if (existsSync(settingsPath)) {
    try { existing = JSON.parse(readFileSync(settingsPath, 'utf-8')) } catch {}
    copyFileSync(settingsPath, `${settingsPath}.bak-${Date.now()}`)
  }

  const merged = { ...existing, ...newSettings }
  merged.hooks = { ...(existing.hooks || {}), ...newSettings.hooks }
  merged.enabledPlugins = { ...(existing.enabledPlugins || {}), ...newSettings.enabledPlugins }
  merged.extraKnownMarketplaces = { ...(existing.extraKnownMarketplaces || {}), ...newSettings.extraKnownMarketplaces }

  writeFileSync(settingsPath, JSON.stringify(merged, null, 2))
  ok(`wrote project-scoped settings: ${settingsPath}`)
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
  // uv ships uvx, which `template/.mcp.json.hbs` calls to run `workspace-mcp`
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
    // Fallback - download installer + run silently
    try {
      const installer = join(process.env.TEMP || process.env.LOCALAPPDATA || '.', 'Obsidian-installer.exe')
      info('Downloading Obsidian installer (winget unavailable)...')
      execSync(`powershell -NoProfile -Command "irm https://obsidian.md/download | Out-Null; Invoke-WebRequest -Uri 'https://github.com/obsidianmd/obsidian-releases/releases/latest/download/Obsidian.exe' -OutFile '${installer}'"`, { stdio: 'pipe' })
      execSync(`"${installer}" /S`, { stdio: 'pipe' })  // /S = silent install
      if (exeCandidates.some(p => existsSync(p))) { ok('Obsidian installed via direct download'); _obsidianInstalled = true; return }
      warn('Obsidian installer ran but app not found at expected path. Open https://obsidian.md/download and install manually.')
    } catch {
      warn('Obsidian install skipped - get it from https://obsidian.md/download (vault still works as plain markdown)')
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

async function main() {
  console.log(BANNER)

  if (!existsSync(BUNDLE_PATH)) {
    fail(`bundle not found at ${BUNDLE_PATH}`)
    process.exit(1)
  }

  const bundle = JSON.parse(readFileSync(BUNDLE_PATH, 'utf-8'))
  const ctx = buildContext(bundle)

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
  renderTemplate(join(TEMPLATE_DIR, '.mcp.json.hbs'), join(INSTALL_PATH, '.mcp.json'), ctx)
  renderTemplate(join(TEMPLATE_DIR, 'claude_desktop_config.json.hbs'), join(INSTALL_PATH, 'claude_desktop_config.json'), ctx)
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
    ok('obsidian-cli installed globally')
  } catch (err) {
    warn(`obsidian-cli install failed (${err.message?.split('\n')[0] || 'unknown'}). Vault still works as plain markdown.`)
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
      console.log(`  ${DIM}schtasks /End /TN "${LAUNCHAGENT_LABEL}" && schtasks /Run /TN "${LAUNCHAGENT_LABEL}"${RESET}`)
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

  // Auto-open browser. Ignore errors - if the user has no GUI, this is a no-op.
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${dashboardUrl}"`, { stdio: 'ignore' })
    } else if (process.platform === 'win32') {
      execSync(`start "" "${dashboardUrl}"`, { stdio: 'ignore', shell: 'cmd.exe' })
    } else {
      execSync(`xdg-open "${dashboardUrl}"`, { stdio: 'ignore' })
    }
  } catch {}

  // Final summary - point user at the dashboard chat. They can ask Claude what's set up.
  let skillCount = 0, mcpCount = 0
  try { skillCount = readdirSync(join(TEMPLATE_DIR, 'skills')).length } catch {}
  try {
    const m = JSON.parse(readFileSync(join(INSTALL_PATH, '.mcp.json'), 'utf-8'))
    mcpCount = Object.keys(m.mcpServers || {}).length
  } catch {}
  const chatId = (bundle.keys?.ALLOWED_CHAT_ID ?? '').split(',')[0]?.trim()
  const vaultPath = join(INSTALL_PATH, 'vault')

  console.log(`\n${ACCENT}✓ Done${RESET}\n`)
  console.log(`${ACCENT}What's set up:${RESET}`)
  console.log(`  • Dashboard at ${dashboardUrl}${DIM} ${dashboardHealthy ? '(open)' : '(starting...)'}${RESET}`)
  console.log(`  • Obsidian vault at ${vaultPath}${DIM} ${_obsidianInstalled ? '(open in Obsidian.app)' : '(install Obsidian from https://obsidian.md to view as a graph)'}${RESET}`)
  if (chatId) console.log(`  • Telegram bot linked to chat ${chatId}`)
  console.log(`  • ${skillCount} skills, ${mcpCount} MCP servers\n`)
  console.log(`${ACCENT}Next:${RESET}`)
  console.log(`  1. ${ACCENT}Run /nello-start${RESET} in this terminal (or in the dashboard chat) to begin onboarding`)
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
