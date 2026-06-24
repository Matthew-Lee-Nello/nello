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
- **Version + updates:** `cat .nello-version` (the commit + date this install was built from). Then check drift: `git fetch origin main -q 2>/dev/null && git rev-list --count HEAD..origin/main 2>/dev/null`. If it returns 1 or more, report "behind by N - a newer nello-claw is out, run /update". If `.nello-version` is missing, the install predates version stamping (so it's behind - recommend /update). If the count is 0, report "up to date".

## 2. Env keys (mask values)
- Read `.env`. List every `KEY=` line. Never print actual key values.
- **Messaging channel:** read `MESSAGING_CHANNEL` (telegram / whatsapp; empty = legacy telegram). Report it - it decides which messaging checks apply below (§12).
- Report `SET` / `MISSING` / `EMPTY` for: `COMPOSIO_API_KEY` (must start `ak_`), `COMPOSIO_MCP_URL` (the minted router URL - EMPTY means Composio provisioning failed at bootstrap), `GOOGLE_USER_EMAIL`, `EXA_API_KEY`, `VAULT_PATH`.
- **`DASHBOARD_TOKEN` is OPTIONAL** - empty is fine and is the default (no ✗). The dashboard binds `127.0.0.1` (loopback-only) and has an Origin/CSRF guard, so a local install needs no token. Only set it if you expose the dashboard beyond localhost (Tailscale serve / a tunnel); setting it re-enables the auth gate.
- **Pick-one integrity:** a `telegram` install should have `WHATSAPP_OWNER_NUMBER` empty (and a `whatsapp` install should have `TELEGRAM_BOT_TOKEN` empty). Both populated = ⚠ split-brain; the daemon runs only the chosen one, but clean up the stray.

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

## 9b. MCP config sanity
- `cat .mcp.json` parses as JSON. Confirm the managed servers are present: `composio`, `obsidian`, `exa`.
- **Stale Google OAuth servers:** grep for `google_workspace` / `workspace-mcp`. If present, the managed-key prune didn't run (pre-Composio leftover) - recommend `bash scripts/sync-env-to-configs.sh` (re-runs `bootstrap.js --configs-only`, which prunes them). On a current install these must be ABSENT.
- Any client-added (unmanaged) MCP server should still be there - the prune must not have over-deleted.

## 10. Vault state
- `ls vault/Memory/ vault/Journal/ vault/.obsidian/`
- Confirm `Memory/MEMORY.md` exists
- Confirm `.obsidian/appearance.json` has `"accentColor": "#FFA600"`
- **Brain seeded?** Count taxonomy notes: `ls vault | grep -cE '^(Person|Client|Project)-'` (also check subfolders). Zero of all three on a real client = ⚠ "brain not seeded - run /build-brain (point me at a ChatGPT export) or seed from the interview".

## 10b. Semantic recall (gbrain) - only if `VOYAGE_API_KEY` is set

Skip this whole section silently if `.env` has no `VOYAGE_API_KEY` (recall is off by design - not a failure).

If `VOYAGE_API_KEY` IS set:
- `NC_MEMORY_ENGINE` in `.env` should be `gbrain` (bootstrap sets it from the key). If it's empty/`legacy` while the key is present, recall won't run - ⚠ "re-run bootstrap".
- `ls ~/.bun/bin/gbrain` exists AND `~/.bun/bin/gbrain --version` prints `gbrain X.Y.Z` (must be **garrytan/gbrain**, the brain - NOT the npm GPU library). Missing = ✗ "bun/gbrain didn't install; re-run bootstrap (needs a VOYAGE_API_KEY present)".
- **Daemon PATH:** the service must have `~/.bun/bin` on PATH or it can't spawn gbrain. Mac: `launchctl print gui/$(id -u)/com.nello-claw.server | grep -i path` (or read the plist `EnvironmentVariables` PATH). If `~/.bun/bin` is absent → ✗ "recall will fail 'failed to spawn gbrain'; re-run the service install".
- `ls ~/.gbrain/brain.pglite` exists (the local index). gbrain reads `VOYAGE_API_KEY` from the env, so source it from `.env` for the next two checks:
  `VK=$(grep -m1 '^VOYAGE_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")`
- `VOYAGE_API_KEY="$VK" ~/.bun/bin/gbrain doctor --fast` is healthy. Report the page/embedding count (embeddings should be ≈ pages; far fewer = un-embedded notes, suggest `/build-recall`).
- **Voyage canary (a revoked/expired key fails silently):** `VOYAGE_API_KEY="$VK" ~/.bun/bin/gbrain query "test" --no-expand`. A 401/auth error in the output = ✗ "Voyage key rejected - recall is silently dead; rotate the key in `.env` and restart the daemon". No error (even zero hits) = ✓.
- **Did the daemon actually pick it up?** `config.ts` reads `NC_MEMORY_ENGINE` once at boot. If the key/engine was added AFTER the daemon started, the doctor sees `gbrain` in `.env` but the live daemon is still on `legacy`. Confirm the daemon was (re)started since the key was set; if unsure, `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server` (Mac) and watch `store/server.log`.

## 11. Chat round-trip test

First create a real chat (FOREIGN KEY constraint requires the chat to exist):
```bash
CHAT=$(curl -sX POST http://localhost:3000/api/chat -H 'Content-Type: application/json' -d '{"name":"doctor-test"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
curl -sX POST "http://localhost:3000/api/chat/$CHAT/message" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hi"}'
```
Note: the API expects `{"text":"..."}` not `{"message":"..."}`. Print the full response. If `reply` is empty/null, the daemon is reachable but the agent is failing - usually Claude Code auth (see step 7).

## 12. Messaging channel test (branch on MESSAGING_CHANNEL from §2)

**If `telegram`:**
- Read `TELEGRAM_BOT_TOKEN`. `curl -s "https://api.telegram.org/bot<TOKEN>/getMe"` - confirm the bot is alive.
- `ALLOWED_CHAT_ID` non-empty (the owner lock took). If empty, discovery hasn't completed - tell the user to message the bot.
- `curl -s "https://api.telegram.org/bot<TOKEN>/getUpdates"` - confirm at least one message exists (proves the phone link).

**If `whatsapp`:**
- `WHATSAPP_OWNER_NUMBER` SET (digits). If EMPTY → ⚠ "run /connect-whatsapp and scan the QR" (expected before linking, not a failure).
- `ls .wa-session/creds.json` (or `$WHATSAPP_SESSION_DIR`) exists → the device is linked. Missing = QR not scanned yet.
- `grep -c "whatsapp connected" store/server.log` ≥ 1, and no repeating `Connection Failure` → the socket is live.

## 13. Permissions / friction
- Mac: any pending sudo prompts (`sudo -n true`)
- Mac TCC: scan recent `console.log` for "Privacy & Security" denials affecting `claude`, `node`, `obsidian`, or `nello-claw`
- Note any installer prompts that didn't auto-resolve

## 14. Stale install detection
- Check for leftover installs at `~/nello-claw/` (Mac/Linux) or `C:\Users\<user>\nello-claw\` (Windows). If one exists AND the current install is somewhere else, flag ⚠ with the cleanup command:
  - Mac/Linux: `rm -rf ~/nello-claw`
  - Windows: `Remove-Item -Recurse -Force "$HOME\nello-claw"`
  Stale installs cause the wrong scheduled task / LaunchAgent to fire on reboot.

## 16. Brain backfill (informational)
- Has `/build-brain` run? Look for `vault/Imports/` (archived ChatGPT/source history). If absent, note "optional - run /build-brain to fold a ChatGPT export + connected tools into the brain". Never ✗; purely informational.

## 17. Branch / merge gate (only when run from the dev SOURCE repo, not a client install)
- If this folder is the nello-claw source repo (has `web/`, a `.git` with the GitHub remote): `git rev-parse --abbrev-ref HEAD` and `git status --porcelain`.
- If the WhatsApp / build-brain / channel-choice / update work sits on a feature branch (e.g. `feat/client-stack-v1`) and is NOT merged to `main`, flag ✗: **clients pulling `/update` track `origin/main` and won't receive any of it until the branch merges.** This is the John/Sunita update blocker - name it explicitly.
- On a normal client install this section is N/A - skip silently.

## 15. Summary

Print:
```
INSTALL DOCTOR REPORT
=====================
Channel: telegram | whatsapp

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
[10b] Semantic recall     ✓ / ⚠ / ✗ / n/a (gbrain - only if VOYAGE_API_KEY set)
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
| Health endpoint times out | Daemon crashed. `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server` and recheck `store/server.log` |
| `(no response)` from chat | Claude Code auth missing. Run `claude` once in terminal to log in. Restart daemon. |
| Telegram returns 401 | Bot token invalid. Regenerate via `@BotFather` and update `.env` |
| WhatsApp not linked / `(no response)` | Run `/connect-whatsapp`, scan the QR. If it keeps refusing (`LINK_401`), WhatsApp is throttling - wait, then retry. |
| WhatsApp answers its own messages | Old build without the echo guard. Rebuild (`pnpm -r build`) and restart the daemon. |
| Apps won't connect (Composio) | Check `COMPOSIO_API_KEY` + `COMPOSIO_MCP_URL` in `.env`, then re-run `scripts/sync-env-to-configs.sh` |
| Recall not working / no `[recall]` in replies | `VOYAGE_API_KEY` set? `~/.bun/bin/gbrain --version` works? `~/.bun/bin` on the daemon PATH? `NC_MEMORY_ENGINE=gbrain`? If the key was rejected (Voyage canary 401), rotate it. Re-run bootstrap after fixing the key. |
| Vault doesn't open in Obsidian | Obsidian not installed. Get it from obsidian.md/download |
| Permission prompts won't go away | Mac TCC blocked the daemon. System Settings → Privacy & Security → grant access to `node` |

## After the report

If anything shows ✗, fix it then re-run `/install-doctor` to confirm green.
