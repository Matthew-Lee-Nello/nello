---
name: install-doctor
description: End-to-end audit of a nello install. Reports what's wired, what's broken, where it stalled, what permissions are stuck. Use when the dashboard isn't responding, the assistant says "(no response)", Obsidian or the Telegram bot aren't working, or the user just wants a sanity check. Triggers on "install doctor", "audit my install", "what's broken", "/install-doctor".
trigger: /install-doctor
model_hint: fast
---

# /install-doctor - End-to-End Install Audit

Audit the nello install from inside the install folder. Print a readable report with `✓` for OK, `✗` for broken, `⚠` for warnings. End with a "next 3 things to fix" list, ordered by impact.

Run from the install folder (the one that has `CLAUDE.md`, `.env`, `vault/`).

**Fast path:** `node ./template/packages/audit/dist/cli.js doctor --deep` (or `nello doctor --deep` if the bin is on PATH) runs the machine checks - brain key + gbrain embedding model/dimension, and every scheduled task's cron - in one shot, exiting non-zero if the brain is dead or a cron is misbehaving. Use it first, then work the sections below for anything it flags.

## 1. Install files
- `ls -la ./`
- Confirm these all exist: `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `.env`, `.claude/settings.json`, `vault/`, `store/`, `dist/`, `node_modules/`, `template/skills/`
- `stat -f "%p" .env` - must end in `600` for security (only the user can read keys)
- **Version + updates:** `cat .nello-version` (the commit + date this install was built from). Then check drift: `git fetch origin main -q 2>/dev/null && git rev-list --count HEAD..origin/main 2>/dev/null`. If it returns 1 or more, report "behind by N - a newer nello is out, run /update". If `.nello-version` is missing, the install predates version stamping (so it's behind - recommend /update). If the count is 0, report "up to date".

## 2. Env keys (mask values)
- Read `.env`. List every `KEY=` line. Never print actual key values.
- **Messaging channel:** Telegram is the only channel (WhatsApp retired in v1.0). If `MESSAGING_CHANNEL=whatsapp` still lingers in `.env`, flag ⚠ "stale WhatsApp channel - run /update to migrate to Telegram, then /connect-telegram".
- Report `SET` / `MISSING` / `EMPTY` for: `COMPOSIO_API_KEY` (must start `ak_`), `COMPOSIO_MCP_URL` (the minted router URL - EMPTY means Composio provisioning failed at bootstrap), `GOOGLE_USER_EMAIL`, `EXA_API_KEY`, `VAULT_PATH`.
- **`DASHBOARD_TOKEN` is OPTIONAL** - empty is fine and is the default (no ✗). The dashboard binds `127.0.0.1` (loopback-only) and has an Origin/CSRF guard, so a local install needs no token. Only set it if you expose the dashboard beyond localhost (Tailscale serve / a tunnel); setting it re-enables the auth gate.

## 3. Services (Mac launchd / Win schtasks / Linux systemd)
- Mac: `launchctl list | grep nello` - report PID + last exit code
- Win: `schtasks /Query /TN "com.nello.server" /FO LIST`
- Linux: `systemctl --user status com.nello.server`
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
- `ls -la ~/Applications/nello.app` (Mac shortcut)

## 7. Claude Code auth (the most common cause of "no response")
- `ls -la ~/.claude/auth.json`
- If missing: the daemon can't talk to Claude. Run `claude` once in a terminal to log in, then restart the daemon: `launchctl kickstart -k gui/$(id -u)/com.nello.server`
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

## 9b. MCP config sanity
- `cat .mcp.json` parses as JSON. Confirm the managed servers are present: `composio`, `obsidian`, `exa`.
- **Stale Google OAuth servers:** grep for `google_workspace` / `workspace-mcp`. If present, the managed-key prune didn't run (pre-Composio leftover) - recommend `bash scripts/sync-env-to-configs.sh` (re-runs `bootstrap.js --configs-only`, which prunes them). On a current install these must be ABSENT.
- Any client-added (unmanaged) MCP server should still be there - the prune must not have over-deleted.

## 10. Vault state
- `ls vault/Memory/ vault/Journal/ vault/.obsidian/`
- Confirm `Memory/MEMORY.md` exists
- Confirm `.obsidian/appearance.json` has `"accentColor": "#FFA600"`
- **Brain seeded?** Count taxonomy notes: `ls vault | grep -cE '^(Person|Client|Project)-'` (also check subfolders). Zero of all three on a real client = ⚠ "brain not seeded - run /build-brain (point me at a ChatGPT export) or seed from the interview".

## 10b. Semantic recall (gbrain) - only if `OPENAI_API_KEY` is set

Skip this whole section silently if `.env` has no `OPENAI_API_KEY` (recall is off by design - not a failure).

If `OPENAI_API_KEY` IS set:
- `NC_MEMORY_ENGINE` in `.env` should be `gbrain` (bootstrap sets it from the key). If it's empty/`legacy` while the key is present, recall won't run - ⚠ "re-run bootstrap".
- `ls ~/.bun/bin/gbrain` exists AND `~/.bun/bin/gbrain --version` prints `gbrain X.Y.Z` (must be **garrytan/gbrain**, the brain - NOT the npm GPU library). Missing = ✗ "bun/gbrain didn't install; re-run bootstrap (needs an OPENAI_API_KEY present)".
- **Daemon PATH:** the service must have `~/.bun/bin` on PATH or it can't spawn gbrain. Mac: `launchctl print gui/$(id -u)/com.nello.server | grep -i path` (or read the plist `EnvironmentVariables` PATH). If `~/.bun/bin` is absent → ✗ "recall will fail 'failed to spawn gbrain'; re-run the service install".
- `ls ~/.gbrain/brain.pglite` exists (the local index). gbrain reads `OPENAI_API_KEY` from the env, so source it from `.env` for the next two checks:
  `OK=$(grep -m1 '^OPENAI_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")`
- `OPENAI_API_KEY="$OK" ~/.bun/bin/gbrain doctor --fast` is healthy. Report the page/embedding count (embeddings should be ≈ pages; far fewer = un-embedded notes, suggest `/build-recall`).
- **OpenAI canary (a revoked/expired key fails silently):** `OPENAI_API_KEY="$OK" ~/.bun/bin/gbrain query "test" --no-expand`. A 401/auth error in the output = ✗ "OpenAI key rejected - recall is silently dead; rotate the key in `.env` and restart the daemon". No error (even zero hits) = ✓.
- **Did the daemon actually pick it up?** `config.ts` reads `NC_MEMORY_ENGINE` once at boot. If the key/engine was added AFTER the daemon started, the doctor sees `gbrain` in `.env` but the live daemon is still on `legacy`. Confirm the daemon was (re)started since the key was set; if unsure, `launchctl kickstart -k gui/$(id -u)/com.nello.server` (Mac) and watch `store/server.log`.

## 11. Chat round-trip test

First create a real chat (FOREIGN KEY constraint requires the chat to exist):
```bash
CHAT=$(curl -sX POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"name":"doctor-test"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -sX POST "http://localhost:3000/api/chat/$CHAT/message" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hi"}'
```
Note: the API expects `{"text":"..."}` not `{"message":"..."}`. Print the full response. If `reply` is empty/null, the daemon is reachable but the agent is failing - usually Claude Code auth (see step 7).

## 12. Messaging channel test (Telegram)
- Read `TELEGRAM_BOT_TOKEN`. If EMPTY → ⚠ "run /connect-telegram to create a bot and pair your chat" (expected on a fresh or just-migrated install, not a failure).
- `curl -s "https://api.telegram.org/bot<TOKEN>/getMe"` - confirm the bot is alive.
- `ALLOWED_CHAT_ID` non-empty (the owner lock took). If empty, discovery hasn't completed - tell the user to message the bot.
- `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"` - confirm at least one message exists (proves the phone link).

## 13. Permissions / friction
- Mac: any pending sudo prompts (`sudo -n true`)
- Mac TCC: scan recent `console.log` for "Privacy & Security" denials affecting `claude`, `node`, `obsidian`, or `nello`
- Note any installer prompts that didn't auto-resolve

## 14. Stale install detection
- Check for leftover installs at `~/nello/` (Mac/Linux) or `C:\Users\<user>\nello\` (Windows). If one exists AND the current install is somewhere else, flag ⚠ with the cleanup command:
  - Mac/Linux: `rm -rf ~/nello`
  - Windows: `Remove-Item -Recurse -Force "$HOME\nello"`
  Stale installs cause the wrong scheduled task / LaunchAgent to fire on reboot.

## 16. Brain backfill (informational)
- Has `/build-brain` run? Look for `vault/Imports/` (archived ChatGPT/source history). If absent, note "optional - run /build-brain to fold a ChatGPT export + connected tools into the brain". Never ✗; purely informational.

## 17. Branch / merge gate (only when run from the dev SOURCE repo, not a client install)
- If this folder is the nello source repo (has `web/`, a `.git` with the GitHub remote): `git rev-parse --abbrev-ref HEAD` and `git status --porcelain`.
- If new stack work sits on a feature branch (e.g. `feat/v1-telegram-gpt-rtk-selfupdate`) and is NOT merged to `main`, flag ✗: **clients pulling `/update` track `origin/main` and won't receive any of it until the branch merges.** Name the unmerged branch explicitly.
- On a normal client install this section is N/A - skip silently.

## 15. Summary

Print:
```
INSTALL DOCTOR REPORT
=====================
Channel: telegram

[1]  Install files        ✓ / ✗
[2]  Env keys             ✓ / ⚠ / ✗
[3]  Services running     ✓ / ✗
[4]  Daemon health        ✓ / ✗
[5]  Daemon logs clean    ✓ / ⚠ / ✗
[6]  CLI tools            ✓ / ⚠ / ✗
[7]  Claude Code auth     ✓ / ✗
[8]  Skills wired         ✓ / ✗
[9]  Project settings     ✓ / ⚠ / ✗
[9b] MCP config sane      ✓ / ⚠ / ✗
[10] Vault state          ✓ / ⚠ / ✗
[10b] Semantic recall     ✓ / ⚠ / ✗ / n/a (gbrain - only if OPENAI_API_KEY set)
[11] Chat round-trip      ✓ / ✗
[12] Messaging channel    ✓ / ⚠ / ✗
[13] Permissions          ✓ / ⚠
[14] Stale install paths  ✓ / ⚠
[16] Brain backfill       ✓ / ⚠ (info)
[17] Branch/merge gate    ✓ / ✗ (dev repo only)

NEXT 3 THINGS TO FIX (priority order):
1. ...
2. ...
3. ...
```

## Quick fixes the doctor can suggest

| Symptom | Likely fix |
|---------|-----------|
| Health endpoint times out | Daemon crashed. `launchctl kickstart -k gui/$(id -u)/com.nello.server` and recheck `store/server.log` |
| `(no response)` from chat | Claude Code auth missing. Run `claude` once in terminal to log in. Restart daemon. |
| Telegram returns 401 | Bot token invalid. Regenerate via `@BotFather` and update `.env` |
| Telegram not paired / `(no response)` | Run `/connect-telegram` to create a bot and message it once so discovery captures your chat ID. |
| Apps won't connect (Composio) | Check `COMPOSIO_API_KEY` + `COMPOSIO_MCP_URL` in `.env`, then re-run `scripts/sync-env-to-configs.sh` |
| Recall not working / no `[recall]` in replies | `OPENAI_API_KEY` set? `~/.bun/bin/gbrain --version` works? `~/.bun/bin` on the daemon PATH? `NC_MEMORY_ENGINE=gbrain`? If the key was rejected (OpenAI canary 401), rotate it. Re-run bootstrap after fixing the key. |
| Vault doesn't open in Obsidian | Obsidian not installed. Get it from obsidian.md/download |
| Permission prompts won't go away | Mac TCC blocked the daemon. System Settings → Privacy & Security → grant access to `node` |

## After the report

If anything shows ✗, fix it then re-run `/install-doctor` to confirm green.
