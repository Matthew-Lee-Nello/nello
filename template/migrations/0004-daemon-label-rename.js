// 0004-daemon-label-rename
//
// v1.0 renamed the background service com.nello-claw.server -> com.nello.server. The
// new bootstrap installs the new label (installService, later this same run); this
// migration retires the OLD one so two daemons don't fight over the dashboard port
// and the Telegram long-poll (a 409 conflict loop). OS-aware + best-effort: a
// failure just leaves a stale, idle old agent that never wins the port.
import { execSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const OLD = 'com.nello-claw.server'

function sh(cmd) { try { execSync(cmd, { stdio: 'ignore' }) } catch { /* best-effort */ } }

export default {
  id: '0004-daemon-label-rename',
  description: 'retire the old com.nello-claw.server service (renamed to com.nello.server)',

  detect() {
    try {
      if (process.platform === 'darwin') {
        return existsSync(join(homedir(), 'Library', 'LaunchAgents', `${OLD}.plist`))
      }
      if (process.platform === 'linux') {
        return existsSync(join(homedir(), '.config', 'systemd', 'user', `${OLD}.service`))
      }
      if (process.platform === 'win32') {
        try { execSync(`schtasks /Query /TN "${OLD}"`, { stdio: 'ignore' }); return true } catch { return false }
      }
    } catch { /* fall through */ }
    return false
  },

  run(ctx) {
    if (process.platform === 'darwin') {
      const uid = process.getuid ? process.getuid() : ''
      sh(`launchctl bootout gui/${uid}/${OLD}`)
      try { rmSync(join(homedir(), 'Library', 'LaunchAgents', `${OLD}.plist`), { force: true }) } catch {}
    } else if (process.platform === 'linux') {
      sh(`systemctl --user disable --now ${OLD}`)
      try { rmSync(join(homedir(), '.config', 'systemd', 'user', `${OLD}.service`), { force: true }) } catch {}
      sh('systemctl --user daemon-reload')
    } else if (process.platform === 'win32') {
      sh(`schtasks /End /TN "${OLD}"`)
      sh(`schtasks /Delete /TN "${OLD}" /F`)
      sh(`schtasks /Delete /TN "${OLD}-watchdog" /F`)
    }
    ctx.ok('retired the old com.nello-claw.server service (new label: com.nello.server)')
  },
}
