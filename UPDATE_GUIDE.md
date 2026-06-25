# nello - Update Guide

A command file your assistant follows to update an existing install to the latest version. The install folder is a git clone, so an update is: pull the latest code, rebuild, refresh the configs, run any pending stack migrations, and collect any new key a new tool needs. Nothing personal is lost.

> **Use Plan Mode** (Shift+Tab twice) when you paste the update prompt. Your assistant writes out the steps it intends to take. You read them. You approve, or you don't.

## What is preserved (never re-collected)

`vault/` (all your notes + Memory + Journal), `store/` (conversation memory + dedup index), your identity and business answers in `bundle.json`, and the Telegram owner lock. There is NO re-interview. Only the code, configs, skills and persona get refreshed - plus any new key a newly added tool needs (Step 5), which is the one thing an update can ask you for.

## Prime rules for the assistant

- Confirm before anything destructive. Make backups first (Step 0).
- Run every command from the install folder (the one that has `.env`, `bundle.json`, `template/`).
- Adapt commands to the operating system (Mac / Windows / Linux).
- If something looks wrong (not a git clone, missing `bundle.json`), stop and tell the user - do not guess.

## Step 0 - Locate the install + back up

1. `pwd` and `ls -A`. Confirm `.env`, `bundle.json` and `template/` are here. If not, this is not a nello install folder - ask the user to `cd` into theirs and restart.
2. Back up the files an update may change (timestamp the copies):
   ```bash
   cp .env .env.bak-$(date +%Y%m%d)
   cp bundle.json bundle.json.bak-$(date +%Y%m%d)
   [ -f .mcp.json ] && cp .mcp.json .mcp.json.bak-$(date +%Y%m%d)
   [ -f .nello-version ] && cp .nello-version .nello-version.bak-$(date +%Y%m%d)
   ```

## Step 0.5 - How to roll back (if any step fails)

If anything goes wrong mid-update, restore the backups and rebuild on the old code. Nothing personal is at risk (vault, Memory, store are never touched), but this returns the configs, keys and applied-migration record to exactly where they were:
```bash
cp .env.bak-$(date +%Y%m%d) .env
cp bundle.json.bak-$(date +%Y%m%d) bundle.json
[ -f .mcp.json.bak-$(date +%Y%m%d) ] && cp .mcp.json.bak-$(date +%Y%m%d) .mcp.json
[ -f .nello-version.bak-$(date +%Y%m%d) ] && cp .nello-version.bak-$(date +%Y%m%d) .nello-version
pnpm install && pnpm -r build
```
Then restart the daemon (Step 6) and tell the user the exact error you saw. Do not leave the install half-migrated.

## Step 1 - Stop the daemon

So nothing is running mid-update.
- **Mac:** `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.nello.server.plist` (ignore "not found")
- **Windows:** `schtasks /End /TN "com.nello.server"`
- **Linux:** `systemctl --user stop com.nello.server`

## Step 2 - Pull the latest code (latest `main`)

1. Confirm it is a git clone: `git rev-parse --is-inside-work-tree`. If that fails, the folder is not a clone - tell the user the safest path is a fresh install in a new folder (their vault can be copied across after). Stop here.
2. Pull, fast-forward only so a messy history can't silently merge:
   ```bash
   git fetch origin
   git checkout main 2>/dev/null || true
   git pull --ff-only origin main
   ```
   If the pull is refused because of local edits to tracked files (rare - the generated `.env`, `CLAUDE.md`, `.mcp.json`, `vault/` are all gitignored, so this should not happen), show the user `git status` and ask before doing anything else. Never `git reset --hard` or `git stash -u` here - `stash -u` would sweep up their untracked `.env` and vault.

## Step 3 - Rebuild

```bash
pnpm install
pnpm -r build
```

## Step 4 - Refresh the install (this is where the upgrade happens)

Run the **full** bootstrap. One command brings the whole stack current:
```bash
NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js
```
It does all of this automatically, from the new code + the live `.env`:
- re-renders the persona (`CLAUDE.md`), re-links the latest skills, regenerates `.mcp.json` + `claude_desktop_config.json`, and prunes any retired MCP entry;
- **runs any pending stack migrations** (each recorded in `.nello-version` so it runs exactly once). For example, an install still on the old Google OAuth wiring is moved onto Composio here with no hand-editing: the dead `GOOGLE_OAUTH_*` secrets are stripped from `.env` and the install is flipped onto Composio. New stack changes ship as new migrations and apply the same way - you never edit `.env` or `bundle.json` by hand for them;
- with `COMPOSIO_API_KEY` set and `COMPOSIO_MCP_URL` empty, mints the durable Composio Tool Router URL (delete/trash blocked server-side) and writes it back to `.env`;
- preserves any MCP server the client added themselves, plus the vault, `.env` and identity.

At the very end it prints a warning if a tool is turned on but missing a required key (for example a just-migrated install that now needs a Composio key). Step 5 collects those - that is the only thing left to do.

> `--configs-only` is a fast path for a same-version config re-sync (run by `scripts/sync-env-to-configs.sh` after the owner edits `.env`). It does NOT re-render the persona, re-link skills, or run migrations - never use it for a version update.

> If bootstrap rejects `bundle.json` with "unknown key", an old bundle has a field the new code retired - remove just that field from `bundle.json` and re-run.

## Step 5 - Collect any new keys (one prompt per new tool)

A new version can ship a tool that needs a key this install doesn't have yet. Ask bootstrap which required keys are missing:
```bash
node ./template/bootstrap.js --report-missing-keys
```
It prints a JSON array. `[]` means nothing to do - skip to Step 6. Otherwise each entry looks like:
```json
[{ "tool": "composio", "key": "COMPOSIO_API_KEY", "where": "dashboard.composio.dev", "hint": "starts with ak_" }]
```
For each entry:
1. Ask the user for that one key, telling them what it is for and where to get it (use `where` + `hint`). For Composio: one `ak_...` key connects Gmail, Calendar, Drive, Slack, Notion and 1000+ apps - it is the only thing they paste.
2. Append it to `.env` (leave every other line alone):
   ```bash
   printf '\n%s=%s\n' "COMPOSIO_API_KEY" "ak_theirs" >> .env
   ```
3. When all missing keys are added, re-run the full bootstrap so the new tools switch on (and, for Composio, the router URL mints):
   ```bash
   NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js
   ```
4. Confirm it is clean - `node ./template/bootstrap.js --report-missing-keys` should now print `[]`.

If the user doesn't have a key to hand, that's fine: the tool simply stays off until they add it later and re-run. Nothing else is blocked.

## Step 6 - Restart the daemon

- **Mac:** `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nello.server.plist` (or `launchctl kickstart -k gui/$(id -u)/com.nello.server`)
- **Windows:** `schtasks /Run /TN "com.nello.server"`
- **Linux:** `systemctl --user start com.nello.server`

## Step 7 - Verify

- Run `/install-doctor` (it audits the whole install).
- Manual spot-checks:
  ```bash
  node ./template/bootstrap.js --report-missing-keys   # expect []
  cat .nello-version                                   # shows commit + appliedMigrations
  grep -q 'google_workspace\|workspace-mcp' .mcp.json && echo "STILL HAS OLD GOOGLE - investigate" || echo "google removed OK"
  ```
- If the install just moved onto Composio, also confirm the router minted: `grep -q '^COMPOSIO_MCP_URL=.\+' .env && echo "router URL minted OK"`.
- Open the dashboard at http://localhost:3000 and send a message. No Google OAuth prompt should appear.

## Step 8 - Reconnect apps (one click each)

Connections run through Composio's one-click links. From the dashboard chat or Telegram, the user says **"connect my Gmail"** (and Calendar, Drive, etc). The assistant calls `COMPOSIO_MANAGE_CONNECTIONS`, hands back a `connect.composio.dev` link, the user clicks Allow. Done. Read, send and create work; delete and trash are blocked. (Only needed the first time, or after a fresh migration onto Composio.)

## Step 9 - Clean up (optional)

Once everything works, the user can delete the backups (`.env.bak-*`, `bundle.json.bak-*`, `.mcp.json.bak-*`, `.nello-version.bak-*`) and, if they never use Python MCP tools, uninstall `uv` (it was only needed for the old `workspace-mcp`).

---

**One-line summary for the user at the end:** what version they were on vs now, any migration that ran (e.g. moved onto Composio), any new key that was added, that their vault + memory + identity are intact, and the "connect my Gmail" next step if relevant.
