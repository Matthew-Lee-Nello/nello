#!/usr/bin/env node
/**
 * Cross-platform service installer.
 * Mac:   launchctl + plist (RunAtLoad + KeepAlive = boot start + crash restart)
 * Win:   Startup-folder shortcut (login start) + schtasks watchdog (crash restart)
 * Linux: systemd user service (Restart=always)
 *
 * Reads NC_INSTALL_PATH + NC_LAUNCHAGENT_LABEL from env.
 * Idempotent - safe to rerun.
 */

import { execSync, spawnSync, spawn } from 'node:child_process'
import { writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir, platform } from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = join(__dirname, '..')
const INSTALL = process.env.NC_INSTALL_PATH || join(homedir(), 'nello')
const LABEL = process.env.NC_LAUNCHAGENT_LABEL || 'com.nello.server'

// Resolve the vault path from the rendered .env so the daemon exports the same
// NC_VAULT_PATH the interactive surfaces get (PR-6 unified memory bus). Falls back to
// the conventional <install>/vault.
function resolveVaultPath() {
  try {
    const envPath = join(INSTALL, '.env')
    if (existsSync(envPath)) {
      const m = readFileSync(envPath, 'utf-8').match(/^VAULT_PATH=(.+)$/m)
      if (m) return m[1].replace(/^["']|["']$/g, '').trim()
    }
  } catch {}
  return join(INSTALL, 'vault')
}
const VAULT = resolveVaultPath()

// LABEL is interpolated into launchctl/schtasks/systemctl invocations AND into
// plist/systemd-unit bodies. Restrict to reverse-DNS-style identifiers so it
// can't break out of any of those contexts. Same regex as bootstrap.js.
if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(LABEL)) {
  console.error(`\x1b[38;2;255;80;80m✗\x1b[0m Invalid NC_LAUNCHAGENT_LABEL: ${JSON.stringify(LABEL)}. Allowed: alphanumeric + . _ - (max 128 chars).`)
  process.exit(1)
}

const NODE = process.execPath
// The dir holding the node binary that ran this installer. Prepended to the
// service PATH so a daemon child that spawns `node`/`npm`/`npx` by name resolves
// it - critical for nvm/fnm/volta users whose node lives outside the standard
// /usr/local|/opt/homebrew bins (otherwise hooks + voice features fail "command
// not found"). The daemon itself launches via the absolute NODE above regardless.
const NODE_BIN = dirname(NODE)
// gbrain (the semantic-recall engine) is a Bun global living in ~/.bun/bin, which
// is NOT a standard system bin. The daemon spawns `gbrain` by name from a minimal
// launchd/systemd environment, so this dir MUST be on the service PATH or recall
// fails "failed to spawn gbrain" (the same Node-on-PATH class of bug as before).
const BUN_BIN = join(homedir(), '.bun', 'bin')
// Daemon entry compiled to template/dist/index.js (the @nello/template package
// builds into its own dist/, not the install root). Don't change without also
// fixing template/package.json's build output path.
const ENTRY = join(INSTALL, 'template', 'dist', 'index.js')

const ACCENT = '\x1b[38;2;255;166;0m'
const RED = '\x1b[38;2;255;80;80m'
const RESET = '\x1b[0m'
const ok = (m) => console.log(`  ${ACCENT}✓${RESET} ${m}`)
const fail = (m) => console.log(`  ${RED}✗${RESET} ${m}`)

function installMac() {
  const dest = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
  mkdirSync(dirname(dest), { recursive: true })

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE}</string>
        <string>${ENTRY}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${INSTALL}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${INSTALL}/store/server.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL}/store/server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${NODE_BIN}:${BUN_BIN}:/opt/homebrew/bin:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${homedir()}</string>
        <key>NC_INSTALL_PATH</key>
        <string>${INSTALL}</string>
        <key>NC_VAULT_PATH</key>
        <string>${VAULT}</string>
    </dict>
    <key>ThrottleInterval</key>
    <integer>5</integer>
</dict>
</plist>
`
  writeFileSync(dest, plist)
  const uid = process.getuid?.() ?? 501
  // argv form avoids any shell-interpretation of LABEL/dest, even though both
  // are now regex-validated. Defence in depth.
  spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' })
  const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, dest], { stdio: 'pipe' })
  if (r.status === 0) {
    ok(`LaunchAgent loaded (${LABEL})`)
  } else {
    fail(`LaunchAgent load failed: ${r.stderr?.toString().split('\n')[0] || 'unknown'}`)
    process.exit(1)
  }
}

function installWindows() {
  // Drop a .lnk into the per-user Startup folder. Runs at every interactive
  // logon. Zero admin required (vs schtasks /Create /RL HIGHEST which needs
  // an elevated shell). The .cmd wrapper makes the daemon's stdout+stderr go
  // to store/server.log so we have logs to debug from.
  const wrapper = join(INSTALL, 'nello-daemon.cmd')
  const storeDir = join(INSTALL, 'store')
  const logFile = join(storeDir, 'server.log')
  // Backslashes are valid in cmd.exe paths; quoted paths handle spaces. No JSON-style escaping needed.
  const wrapperContent =
    `@echo off\r\n` +
    `rem nello daemon launcher (auto-generated by install-service.js)\r\n` +
    `cd /d "${INSTALL}"\r\n` +
    `if not exist "${storeDir}" mkdir "${storeDir}"\r\n` +
    // Put Node's own dir first on PATH so daemon child-spawns of `node`/`npx`
    // resolve even when the login/Git Bash PATH lacks Node. Parity with the Mac
    // plist + Linux unit; without it the agent SDK fails "failed to spawn code
    // process node".
    `set "PATH=${NODE_BIN};${BUN_BIN};%PATH%"\r\n` +
    `"${NODE}" "${ENTRY}" >> "${logFile}" 2>&1\r\n`
  writeFileSync(wrapper, wrapperContent)

  // Wipe any stale schtasks entries from previous installs (safe if absent).
  // argv form so LABEL is never re-interpreted by cmd.exe quoting.
  spawnSync('schtasks', ['/Delete', '/F', '/TN', LABEL], { stdio: 'ignore' })
  spawnSync('schtasks', ['/Delete', '/F', '/TN', `${LABEL}-watchdog`], { stdio: 'ignore' })

  // Drop the startup-folder .lnk. WScript.Shell COM via PowerShell - same
  // pattern as createWindowsShortcuts in bootstrap.js.
  const startup = join(
    process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'),
    'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'
  )
  mkdirSync(startup, { recursive: true })
  const shortcutPath = join(startup, 'nello.lnk')

  const ps = `$ws=New-Object -ComObject WScript.Shell; ` +
    `$s=$ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}'); ` +
    `$s.TargetPath='${wrapper.replace(/'/g, "''")}'; ` +
    `$s.WorkingDirectory='${INSTALL.replace(/'/g, "''")}'; ` +
    `$s.WindowStyle=7; ` +  // 7 = minimized so it doesn't pop a console window
    `$s.Description='nello daemon (auto-start at login)'; ` +
    `$s.Save();`

  try {
    execSync(`powershell -NoProfile -Command "${ps.replace(/"/g, '\\"')}"`, { stdio: 'pipe' })
    ok(`Startup shortcut created (${shortcutPath})`)
  } catch (err) {
    fail(`Startup shortcut creation failed: ${err.message?.split('\n')[0] || 'unknown'}`)
    process.exit(1)
  }

  // Start the daemon now so the user doesn't have to logout/login first.
  try {
    spawn('cmd', ['/c', 'start', '/min', '""', wrapper], { detached: true, stdio: 'ignore' }).unref()
    ok('daemon started in background')
  } catch {
    ok(`daemon will start on next login (run "${wrapper}" to launch now)`)
  }

  // Crash-restart watchdog. The Startup .lnk only covers login; a daemon that
  // dies mid-session would otherwise stay down until the next logout/login.
  // This task fires every 5 min and relaunches only when the recorded PID is
  // gone (and acquireLock makes a redundant launch a clean no-op anyway, so a
  // missed check is harmless). Best-effort: a schtasks quirk must never fail
  // the whole install.
  try {
    const watchdog = join(INSTALL, 'nello-watchdog.cmd')
    const watchdogContent =
      `@echo off\r\n` +
      `rem nello watchdog (auto-generated). Relaunches the daemon if its PID is gone.\r\n` +
      `set "PIDFILE=${join(storeDir, 'clawd.pid')}"\r\n` +
      `if not exist "%PIDFILE%" goto launch\r\n` +
      `set /p DPID=<"%PIDFILE%"\r\n` +
      `tasklist /FI "PID eq %DPID%" 2>nul | find "%DPID%" >nul\r\n` +
      `if not errorlevel 1 exit /b 0\r\n` +
      `:launch\r\n` +
      `start "" /min "${wrapper}"\r\n`
    writeFileSync(watchdog, watchdogContent)
    const w = spawnSync('schtasks', ['/Create', '/F', '/TN', `${LABEL}-watchdog`, '/TR', `"${watchdog}"`, '/SC', 'MINUTE', '/MO', '5', '/RL', 'LIMITED'], { stdio: 'ignore' })
    if (w.status === 0) ok('crash-restart watchdog registered (every 5 min)')
    else fail('watchdog registration skipped (login-start still active)')
  } catch {
    fail('watchdog registration skipped (login-start still active)')
  }
}

function installLinux() {
  const dest = join(homedir(), '.config', 'systemd', 'user', `${LABEL}.service`)
  mkdirSync(dirname(dest), { recursive: true })

  const unit = `[Unit]
Description=nello assistant daemon
After=network.target

[Service]
Type=simple
ExecStart=${NODE} ${ENTRY}
WorkingDirectory=${INSTALL}
Environment=NC_INSTALL_PATH=${INSTALL}
Environment=NC_VAULT_PATH=${VAULT}
Environment=PATH=${NODE_BIN}:${BUN_BIN}:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin
Restart=always
RestartSec=5
StandardOutput=append:${INSTALL}/store/server.log
StandardError=append:${INSTALL}/store/server.log

[Install]
WantedBy=default.target
`
  writeFileSync(dest, unit)
  const reload = spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'pipe' })
  const enable = spawnSync('systemctl', ['--user', 'enable', '--now', LABEL], { stdio: 'pipe' })
  if (reload.status === 0 && enable.status === 0) {
    ok(`systemd user service enabled (${LABEL})`)
  } else {
    const err = (enable.stderr || reload.stderr)?.toString().split('\n')[0] || 'unknown'
    fail(`systemctl failed: ${err}. Run 'loginctl enable-linger $USER' if running headless.`)
    process.exit(1)
  }
}

// ---------- daemon stop/start (centralised so self-update.js stays portable) ----------
// self-update.js shells `node install-service.js stop|start` around its git surgery, so
// the per-OS service commands live in exactly one place. Best-effort + idempotent.

function macUid() { return process.getuid?.() ?? 501 }

function stopDaemon() {
  if (platform() === 'darwin') {
    spawnSync('launchctl', ['bootout', `gui/${macUid()}/${LABEL}`], { stdio: 'ignore' })
  } else if (platform() === 'win32') {
    const pidFile = join(INSTALL, 'store', 'clawd.pid')
    try {
      if (existsSync(pidFile)) {
        const pid = readFileSync(pidFile, 'utf-8').trim()
        if (pid) spawnSync('taskkill', ['/PID', pid, '/F'], { stdio: 'ignore' })
      }
    } catch {}
  } else {
    spawnSync('systemctl', ['--user', 'stop', LABEL], { stdio: 'ignore' })
  }
  ok(`daemon stopped (${LABEL})`)
}

function startDaemon() {
  if (platform() === 'darwin') {
    const plist = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
    // bootstrap re-loads from the on-disk plist; if it's already loaded, kickstart it.
    const r = spawnSync('launchctl', ['bootstrap', `gui/${macUid()}`, plist], { stdio: 'ignore' })
    if (r.status !== 0) spawnSync('launchctl', ['kickstart', '-k', `gui/${macUid()}/${LABEL}`], { stdio: 'ignore' })
  } else if (platform() === 'win32') {
    const wrapper = join(INSTALL, 'nello-daemon.cmd')
    if (existsSync(wrapper)) { try { spawn('cmd', ['/c', 'start', '/min', '""', wrapper], { detached: true, stdio: 'ignore' }).unref() } catch {} }
  } else {
    spawnSync('systemctl', ['--user', 'start', LABEL], { stdio: 'ignore' })
  }
  ok(`daemon started (${LABEL})`)
}

// ---------- weekly update timer (Phase C) ----------
// A second scheduled job, label com.nello.update, that runs self-update.js once a week.
// By default self-update.js only NOTIFIES the owner that an update is ready (it never
// touches the box unattended); unattended apply is opt-in (enableAutoUpdate==='auto').
// Mirrors the daemon-install pattern per OS. Idempotent.
const UPDATE_LABEL = process.env.NC_UPDATE_LABEL || LABEL.replace(/\.server$/, '.update')
const SELF_UPDATE = join(INSTALL, 'template', 'scripts', 'self-update.js')

// Per-install minute (0-59) from the install path, so the whole fleet doesn't all fire
// in the same wall-clock minute (thundering herd against GitHub / OpenAI).
function jitterMinute() {
  let h = 0
  for (const c of INSTALL) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 60
}
const UPDATE_MIN = jitterMinute()
const UPDATE_MIN2 = String(UPDATE_MIN).padStart(2, '0')

function installUpdateTimer() {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(UPDATE_LABEL)) {
    fail(`Invalid update label: ${JSON.stringify(UPDATE_LABEL)}`); process.exit(1)
  }
  if (platform() === 'darwin') {
    const dest = join(homedir(), 'Library', 'LaunchAgents', `${UPDATE_LABEL}.plist`)
    mkdirSync(dirname(dest), { recursive: true })
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${UPDATE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE}</string>
        <string>${SELF_UPDATE}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${INSTALL}</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Weekday</key><integer>0</integer>
        <key>Hour</key><integer>4</integer>
        <key>Minute</key><integer>${UPDATE_MIN}</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${INSTALL}/store/self-update.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL}/store/self-update.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${NODE_BIN}:${BUN_BIN}:/opt/homebrew/bin:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${homedir()}</string>
        <key>NC_INSTALL_PATH</key>
        <string>${INSTALL}</string>
    </dict>
</dict>
</plist>
`
    writeFileSync(dest, plist)
    spawnSync('launchctl', ['bootout', `gui/${macUid()}/${UPDATE_LABEL}`], { stdio: 'ignore' })
    const r = spawnSync('launchctl', ['bootstrap', `gui/${macUid()}`, dest], { stdio: 'pipe' })
    if (r.status === 0) ok(`weekly update check registered (${UPDATE_LABEL}, Sun 04:${UPDATE_MIN2})`)
    else fail(`update timer load failed: ${r.stderr?.toString().split('\n')[0] || 'unknown'} (updates still available via /update)`)
  } else if (platform() === 'win32') {
    const wrapper = join(INSTALL, 'nello-update.cmd')
    const logFile = join(INSTALL, 'store', 'self-update.log')
    writeFileSync(wrapper,
      `@echo off\r\n` +
      `cd /d "${INSTALL}"\r\n` +
      `set "PATH=${NODE_BIN};${BUN_BIN};%PATH%"\r\n` +
      `"${NODE}" "${SELF_UPDATE}" >> "${logFile}" 2>&1\r\n`)
    spawnSync('schtasks', ['/Delete', '/F', '/TN', UPDATE_LABEL], { stdio: 'ignore' })
    const w = spawnSync('schtasks', ['/Create', '/F', '/TN', UPDATE_LABEL, '/TR', `"${wrapper}"`, '/SC', 'WEEKLY', '/D', 'SUN', '/ST', `04:${UPDATE_MIN2}`, '/RL', 'LIMITED'], { stdio: 'ignore' })
    if (w.status === 0) ok(`weekly update check registered (${UPDATE_LABEL}, Sun 04:${UPDATE_MIN2})`)
    else fail('update timer registration skipped (updates still available via /update)')
  } else {
    const svc = join(homedir(), '.config', 'systemd', 'user', `${UPDATE_LABEL}.service`)
    const tim = join(homedir(), '.config', 'systemd', 'user', `${UPDATE_LABEL}.timer`)
    mkdirSync(dirname(svc), { recursive: true })
    writeFileSync(svc, `[Unit]
Description=nello weekly self-update

[Service]
Type=oneshot
ExecStart=${NODE} ${SELF_UPDATE}
WorkingDirectory=${INSTALL}
Environment=NC_INSTALL_PATH=${INSTALL}
Environment=PATH=${NODE_BIN}:${BUN_BIN}:/usr/local/bin:${homedir()}/.local/bin:/usr/bin:/bin
StandardOutput=append:${INSTALL}/store/self-update.log
StandardError=append:${INSTALL}/store/self-update.log
`)
    writeFileSync(tim, `[Unit]
Description=nello weekly self-update timer

[Timer]
OnCalendar=Sun *-*-* 04:${UPDATE_MIN2}:00
Persistent=true

[Install]
WantedBy=timers.target
`)
    spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' })
    const e = spawnSync('systemctl', ['--user', 'enable', '--now', `${UPDATE_LABEL}.timer`], { stdio: 'pipe' })
    if (e.status === 0) ok(`weekly update check enabled (${UPDATE_LABEL}.timer, Sun 04:${UPDATE_MIN2})`)
    else fail(`update timer enable failed: ${e.stderr?.toString().split('\n')[0] || 'unknown'} (updates still available via /update)`)
  }
}

const cmd = process.argv[2] || 'install'
if (cmd === 'stop') stopDaemon()
else if (cmd === 'start') startDaemon()
else if (cmd === 'update-timer') installUpdateTimer()
else {
  const p = platform()
  if (p === 'darwin') installMac()
  else if (p === 'win32') installWindows()
  else if (p === 'linux') installLinux()
  else { fail(`unsupported platform: ${p}`); process.exit(1) }
}
