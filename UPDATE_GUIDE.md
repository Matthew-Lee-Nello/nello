# nello-claw - Update Guide

A command file your assistant follows to update an existing install to the latest version, and to migrate an old install OFF Google OAuth ONTO the Composio Tool Router (the one-key connection layer). The install folder is a git clone, so an update is: pull the latest code, rebuild, refresh the configs, migrate if needed. Nothing personal is lost.

> **Use Plan Mode** (Shift+Tab twice) when you paste the update prompt. Your assistant writes out the steps it intends to take. You read them. You approve, or you don't.

## What is preserved (never re-collected)

`vault/` (all your notes + Memory + Journal), `store/` (conversation memory + dedup index), your identity and business answers in `bundle.json`, and the Telegram owner lock. There is NO re-interview. Only the code, configs, skills and persona get refreshed.

## Prime rules for the assistant

- Confirm before anything destructive. Make backups first (Step 0).
- Run every command from the install folder (the one that has `.env`, `bundle.json`, `template/`).
- Adapt commands to the operating system (Mac / Windows / Linux).
- If something looks wrong (not a git clone, missing `bundle.json`), stop and tell the user - do not guess.

## Step 0 - Locate the install + back up

1. `pwd` and `ls -A`. Confirm `.env`, `bundle.json` and `template/` are here. If not, this is not a nello-claw install folder - ask the user to `cd` into theirs and restart.
2. Back up the three files you may change (timestamp the copies):
   ```bash
   cp .env .env.bak-$(date +%Y%m%d)
   cp bundle.json bundle.json.bak-$(date +%Y%m%d)
   [ -f .mcp.json ] && cp .mcp.json .mcp.json.bak-$(date +%Y%m%d)
   ```

## Step 0.5 - How to roll back (if any step fails)

If anything goes wrong mid-update, restore the backups and rebuild on the old code. Nothing personal is at risk (vault, Memory, store are never touched), but this returns the configs + keys to exactly where they were:
```bash
cp .env.bak-$(date +%Y%m%d) .env
cp bundle.json.bak-$(date +%Y%m%d) bundle.json
[ -f .mcp.json.bak-$(date +%Y%m%d) ] && cp .mcp.json.bak-$(date +%Y%m%d) .mcp.json
pnpm install && pnpm -r build
```
Then restart the daemon (Step 6) and tell Matt the exact error you saw. Do not leave the install half-migrated.

## Step 1 - Stop the daemon

So nothing is running mid-update.
- **Mac:** `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.nello-claw.server.plist` (ignore "not found")
- **Windows:** `schtasks /End /TN "com.nello-claw.server"`
- **Linux:** `systemctl --user stop com.nello-claw.server`

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

## Step 4 - Migrate Google OAuth to Composio (only if needed)

**Detect the old wiring:**
```bash
grep -qE 'GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET' .env && echo "OLD .env"
grep -q 'google_workspace\|workspace-mcp' .mcp.json 2>/dev/null && echo "OLD .mcp.json"
```

If neither shows up, this install is already on Composio - **skip to Step 5** (a plain code refresh).

If the old wiring is there, migrate it. The whole point: replace the per-app Google OAuth setup with one Composio key.

1. **Get the Composio key.** Ask the user for their Composio API key (it starts `ak_`, from dashboard.composio.dev). This is the only thing they paste. One key connects Gmail, Calendar, Drive, Slack, Notion, CRMs and 1000+ more.
2. **Edit `.env`:** remove the `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` lines; add `COMPOSIO_API_KEY=ak_<theirs>`. Leave `COMPOSIO_MCP_URL` unset (the next step mints it). KEEP `GOOGLE_USER_EMAIL` - it becomes their Composio user id. Keep every other key (Telegram, Exa, etc).
3. **Edit `bundle.json`** (you, the assistant, make these edits with your file tools - do not ask the user to hand-edit JSON): under `"keys"`, drop `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`, add `"COMPOSIO_API_KEY": "ak_<theirs>"` (keep `GOOGLE_USER_EMAIL`). Under `"mcps"`, you MUST set `"composio": true` and remove any `"google": true`. This is load-bearing: the renderer only writes a `composio` entry to `.mcp.json` when `mcps.composio` is true, so without it the migration produces no Composio connection.

**Before Step 5, sanity-check the edits:**
```bash
grep -q '^COMPOSIO_API_KEY=ak_' .env && echo "env key OK" || echo "FIX: COMPOSIO_API_KEY missing/!ak_ in .env"
grep -q '^GOOGLE_USER_EMAIL=' .env && echo "user email OK" || echo "FIX: GOOGLE_USER_EMAIL missing (Composio needs it as the user id)"
grep -q '"composio"[[:space:]]*:[[:space:]]*true' bundle.json && echo "bundle mcps.composio OK" || echo "FIX: set mcps.composio=true in bundle.json"
```
Fix any line that says FIX before running Step 5.

## Step 5 - Refresh the install

Run the **full** bootstrap. It re-renders the persona (`CLAUDE.md` - so the old Google-OAuth instructions become Composio), re-links the new skills (`/build-brain`, `/update`...), and regenerates the configs, all from the new code + the live `.env`:
```bash
NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js
```
It does these automatically:
- reads the live `.env` (it wins over `bundle.json`),
- with `COMPOSIO_API_KEY` set and `COMPOSIO_MCP_URL` empty, mints the durable Composio Tool Router URL (delete/trash blocked server-side) and writes it back to `.env`,
- regenerates `.mcp.json` + `claude_desktop_config.json` with the `composio` entry, and **prunes the old `google_workspace` / `workspace-mcp` entry** (so it stops asking for Google OAuth),
- preserves any MCP server the client added themselves.

If the Composio mint fails (a network blip or a bad key - you'll see a "Composio session create failed" error and bootstrap stops), nothing is broken: `.env` still has the old keys removed and the new key added. Re-check the key is a valid `ak_...` from dashboard.composio.dev, confirm the machine is online, and re-run the same command. It only mints when `COMPOSIO_MCP_URL` is still empty, so re-running is safe. If it keeps failing, roll back (Step 0.5) and tell Matt.

The full run is safe to re-run: it skips the vault if it exists, preserves `.env`, merges MCP configs (keeping any client-added servers), and re-symlinks skills. Always use the full run for an update - it is what gives the user the new Composio persona, the new skills, and the Google-OAuth prune in one pass.

> `--configs-only` is a *fast path for a same-version config re-sync* (e.g. after the owner edits `.env`), run by `scripts/sync-env-to-configs.sh`. It does NOT re-render the persona or re-link skills, so never use it for a version update - you'd keep the old `CLAUDE.md` and miss the new skills.

> If bootstrap rejects `bundle.json` with "unknown key", an old bundle has a field the new code retired - remove just that field from `bundle.json` and re-run.

## Step 6 - Restart the daemon

- **Mac:** `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nello-claw.server.plist` (or `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server`)
- **Windows:** `schtasks /Run /TN "com.nello-claw.server"`
- **Linux:** `systemctl --user start com.nello-claw.server`

## Step 7 - Verify

- Run `/install-doctor` (it audits the whole install).
- Manual spot-checks:
  ```bash
  grep -q '"composio"' .mcp.json && echo "composio OK"
  grep -q 'google_workspace\|workspace-mcp' .mcp.json && echo "STILL HAS OLD GOOGLE - investigate" || echo "google removed OK"
  grep -q '^COMPOSIO_MCP_URL=.\+' .env && echo "router URL minted OK"
  ```
- Open the dashboard at http://localhost:3000 and send a message. No Google OAuth prompt should appear.

## Step 8 - Reconnect apps (one click each)

Connections move from Google OAuth to Composio's one-click links. From the dashboard chat or Telegram, the user says **"connect my Gmail"** (and Calendar, Drive, etc). The assistant calls `COMPOSIO_MANAGE_CONNECTIONS`, hands back a `connect.composio.dev` link, the user clicks Allow. Done. Read, send and create work; delete and trash are blocked.

## Step 9 - Clean up (optional)

Once everything works, the user can delete the backups (`.env.bak-*`, `bundle.json.bak-*`, `.mcp.json.bak-*`) and, if they never use Python MCP tools, uninstall `uv` (it was only needed for the old `workspace-mcp`).

---

**One-line summary for the user at the end:** what version they were on vs now, that Google OAuth is gone and Composio is wired, that their vault + memory + identity are intact, and the "connect my Gmail" next step.
