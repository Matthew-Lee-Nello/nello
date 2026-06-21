---
name: install-doctor
description: End-to-end audit of a nello-claw install. Reports what's wired, what's broken, where it stalled, what permissions are stuck. Use when the dashboard isn't responding, the assistant says "(no response)", Obsidian or the Telegram bot aren't working, or the user just wants a sanity check. Triggers on "install doctor", "audit my install", "what's broken", "/install-doctor".
trigger: /install-doctor
model_hint: fast
---

# /install-doctor - End-to-End Install Audit

Audit the nello-claw install from inside the install folder. Print a readable report with `✓` for OK, `✗` for broken, `⚠` for warnings. End with a "next 3 things to fix" list, ordered by impact.

Run from the install folder (the one that has `CLAUDE.md`, `.env`, `vault/`).

## 1. Install files
- `ls -la ./`
- Confirm these all exist: `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `.env`, `.claude/settings.json`, `vault/`, `store/`, `dist/`, `node_modules/`, `template/skills/`
- `stat -f "%p" .env` - must end in `600` for security (only the user can read keys)

## 2. Env keys (mask values)
- Read `.env`. List every `KEY=` line.
- Report `SET` / `MISSING` / `EMPTY` for: `TELEGRAM_BOT_TOKEN`, `ALLOWED_CHAT_ID`, `COMPOSIO_API_KEY`, `COMPOSIO_MCP_URL`, `GOOGLE_USER_EMAIL`, `EXA_API_KEY`, `VAULT_PATH`
- Never print actual key values.

## 3. Services (Mac launchd / Win schtasks / Linux systemd)
- Mac: `launchctl list | grep nello-claw` - report PID + last exit code
- Win: `schtasks /Query /TN "com.nello-claw.server" /FO LIST`
- Linux: `systemctl --user status com.nello-claw.server`
- `lsof -i :3000` (or whatever `DASHBOARD_PORT` is in `.env`) - confirm something is listening

## 4. Daemon health
- `curl -s http://localhost:3000/api/monitoring/health`
- Report HTTP status + body
- If non-200 or no response: that's the smoking gun. Continue to logs.

## 5. Daemon logs
- `tail -100 store/server.log`
- Flag: errors, missing env vars, port collisions, Claude SDK auth failures, MCP connection issues
- Paste the actual error lines, not just "see log"

## 6. CLI tools wired
- `which claude && claude --version`
- `which uv && uv --version` (used by some MCP servers)
- `which obsidian-cli && obsidian-cli --version`
- `ls -la /Applications/Obsidian.app` (Mac) or `%LOCALAPPDATA%\Obsidian\Obsidian.exe` (Win)
- `ls -la ~/Applications/nello-claw.app` (Mac shortcut)

## 7. Claude Code auth (the most common cause of "no response")
- `ls -la ~/.claude/auth.json`
- If missing: the daemon can't talk to Claude. Run `claude` once in a terminal to log in, then restart the daemon: `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server`
- If present, check `mtime` - older than a few weeks may need refresh

## 8. Skills wired
- `ls -la ~/.claude/skills/ | head -20`
- Count symlinks pointing at this install's `template/skills/`
- Verify none are broken: `for s in ~/.claude/skills/*; do readlink "$s" || echo "BROKEN: $s"; done`

## 9. Project-scoped settings
- `cat .claude/settings.json`
- Confirm `bypassPermissions` is set HERE in the project, NOT in `~/.claude/settings.json` (that would disable safety prompts globally - bad)
- `cat ~/.claude/settings.json` and warn if it contains `bypassPermissions: true`
- Confirm `hooks` block has `SessionStart`, `UserPromptSubmit`, `PostToolUse` pointing at this install's paths

## 10. Vault state
- `ls vault/Memory/ vault/Journal/ vault/.obsidian/`
- Confirm `Memory/MEMORY.md` exists
- Confirm `.obsidian/appearance.json` has `"accentColor": "#FFA600"`

## 11. Chat round-trip test

First create a real chat (FOREIGN KEY constraint requires the chat to exist):
```bash
CHAT=$(curl -sX POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"name":"doctor-test"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -sX POST "http://localhost:3000/api/chat/$CHAT/message" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hi"}'
```
Note: the API expects `{"text":"..."}` not `{"message":"..."}`. Print the full response. If `reply` is empty/null, the daemon is reachable but the agent is failing - usually Claude Code auth (see step 7).

## 12. Telegram bot test
- Read `TELEGRAM_BOT_TOKEN` from `.env`
- `curl -s "https://api.telegram.org/bot<TOKEN>/getMe"` - confirm bot is alive
- `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"` - confirm at least one message has been sent (so `chat_id` got captured into `ALLOWED_CHAT_ID`)

## 13. Permissions / friction
- Mac: any pending sudo prompts (`sudo -n true`)
- Mac TCC: scan recent `console.log` for "Privacy & Security" denials affecting `claude`, `node`, `obsidian`, or `nello-claw`
- Note any installer prompts that didn't auto-resolve

## 14. Stale install detection
- Check for leftover installs at `~/nello-claw/` (Mac/Linux) or `C:\Users\<user>\nello-claw\` (Windows). If one exists AND the current install is somewhere else, flag ⚠ with the cleanup command:
  - Mac/Linux: `rm -rf ~/nello-claw`
  - Windows: `Remove-Item -Recurse -Force "$HOME\nello-claw"`
  Stale installs cause the wrong scheduled task / LaunchAgent to fire on reboot.

## 15. Summary

Print:
```
INSTALL DOCTOR REPORT
=====================

[1]  Install files        ✓ / ✗
[2]  Env keys             ✓ / ⚠ / ✗
[3]  Services running     ✓ / ✗
[4]  Daemon health        ✓ / ✗
[5]  Daemon logs clean    ✓ / ⚠ / ✗
[6]  CLI tools            ✓ / ⚠ / ✗
[7]  Claude Code auth     ✓ / ✗
[8]  Skills wired         ✓ / ✗
[9]  Project settings     ✓ / ⚠ / ✗
[10] Vault state          ✓ / ⚠ / ✗
[11] Chat round-trip      ✓ / ✗
[12] Telegram bot         ✓ / ✗
[13] Permissions          ✓ / ⚠
[14] Stale install paths  ✓ / ⚠

NEXT 3 THINGS TO FIX (priority order):
1. ...
2. ...
3. ...
```

## Quick fixes the doctor can suggest

| Symptom | Likely fix |
|---------|-----------|
| Health endpoint times out | Daemon crashed. `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server` and recheck `store/server.log` |
| `(no response)` from chat | Claude Code auth missing. Run `claude` once in terminal to log in. Restart daemon. |
| Telegram returns 401 | Bot token invalid. Regenerate via `@BotFather` and update `.env` |
| Apps won't connect (Composio) | Check `COMPOSIO_API_KEY` + `COMPOSIO_MCP_URL` in `.env`, then re-run `scripts/sync-env-to-configs.sh` |
| Vault doesn't open in Obsidian | Obsidian not installed. Get it from obsidian.md/download |
| Permission prompts won't go away | Mac TCC blocked the daemon. System Settings → Privacy & Security → grant access to `node` |

## After the report

If anything shows ✗, fix it then re-run `/install-doctor` to confirm green.
