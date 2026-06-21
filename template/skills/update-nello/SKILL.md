---
name: update-nello
description: Update an existing nello-claw install to the latest version - pull the newest main, rebuild, refresh persona + skills + configs, and (only if the old wiring is still there) migrate Google OAuth onto the Composio Tool Router. Nothing personal is lost - vault, memory, identity and the Telegram owner lock are all preserved, there is NO re-interview. Use when the user says "/update", "update nello", "update my assistant", "update my install", "check for updates", "am I on the latest version", "pull the latest", "get the new skills", "migrate me to composio".
trigger: /update
model_hint: reasoning
---

# /update - update this install to the latest

One job: bring a clone up to the newest `main`, rebuild, re-render the configs/persona/skills, and migrate the old Google OAuth wiring onto Composio only if it is still present. The full canonical step list lives in `<install>/UPDATE_GUIDE.md` - read it and follow it exactly. This skill orchestrates and points there; it does not duplicate the detail.

## Prime directives (read before doing anything)

- **Read `<install>/UPDATE_GUIDE.md` first** and follow its steps in order. That file is the source of truth; this is the map.
- **Run every command from the install folder** - the one with `.env`, `bundle.json` and `template/`. Confirm that first (`pwd`, `ls -A`). If it is not an install folder, stop and ask the user to `cd` into theirs.
- **Confirm before anything destructive.** Back up first. Never `git reset --hard` or `git stash -u` (that would sweep up the untracked `.env` and vault).
- **Preserve everything personal.** `vault/`, `store/`, `bundle.json` answers and the Telegram owner lock all carry over. There is NO re-interview - only code, configs, skills and persona refresh.
- **Adapt to the OS** (Mac / Windows / Linux) - the daemon start/stop commands differ; the guide lists each.
- **If something looks wrong** (not a git clone, missing `bundle.json`), stop and tell the user. Don't guess.

## The flow (summary - detail in UPDATE_GUIDE.md)

1. **Locate + back up.** Confirm `.env`, `bundle.json`, `template/` are here. Timestamp-copy `.env`, `bundle.json` and `.mcp.json` (Step 0).
2. **Stop the daemon** so nothing runs mid-update (Step 1, OS-specific).
3. **Pull latest main, fast-forward only.** `git fetch origin` then `git pull --ff-only origin main`. Updates always pull the newest `main`. If the pull is refused by local edits, show `git status` and ask - never force (Step 2).
4. **Rebuild.** `pnpm install` then `pnpm -r build` (Step 3).
5. **Migrate Google OAuth -> Composio ONLY if the old wiring is present** (Step 4). Detect it first:
   ```bash
   grep -qE 'GOOGLE_OAUTH_CLIENT_ID|GOOGLE_OAUTH_CLIENT_SECRET' .env && echo "OLD .env"
   grep -q 'google_workspace\|workspace-mcp' .mcp.json 2>/dev/null && echo "OLD .mcp.json"
   ```
   If neither prints, this install is already on Composio - **skip the migration, it is a plain code refresh.** If the old wiring is there: ask the user for their Composio key (`ak_...` from dashboard.composio.dev - the only thing they paste), strip the `GOOGLE_OAUTH_*` lines from `.env` and add `COMPOSIO_API_KEY=ak_<theirs>` (keep `GOOGLE_USER_EMAIL` - it becomes their Composio user id), leave `COMPOSIO_MCP_URL` empty, and mirror the same change in `bundle.json` (`"composio": true`, drop any `"google": true`).
6. **Refresh the install.** Run the full bootstrap so persona (`CLAUDE.md`) and skills re-link too:
   ```bash
   NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js
   ```
   It reads the live `.env` (wins over `bundle.json`), mints the durable Composio Tool Router URL when the key is set and the URL is empty, regenerates `.mcp.json` + `claude_desktop_config.json` with the `composio` entry, **prunes the old `google_workspace` / `workspace-mcp` entry** so it stops asking for Google OAuth, and preserves any MCP the user added. Safe to re-run - it skips the existing vault and preserves `.env`. (For a configs-only pass without touching persona, the guide notes `--configs-only`.)
7. **Restart the daemon** (Step 6, OS-specific).
8. **Verify.** Run `/install-doctor`. Spot-check that `.mcp.json` has `composio`, no longer has `google_workspace`/`workspace-mcp`, and that `COMPOSIO_MCP_URL` got minted into `.env`. Open the dashboard - no Google OAuth prompt should appear (Step 7).
9. **Reconnect apps, one click each.** The user says **"connect my Gmail"** (and Calendar, Drive, etc) in chat or Telegram; that calls `COMPOSIO_MANAGE_CONNECTIONS`, hands back a `connect.composio.dev` link, they click Allow. Read/send/create work; delete and trash stay blocked (Step 8).

## End

Tell the user one line: the version they were on vs now, whether Composio is now wired (or was already), that their vault + memory + identity are intact with no re-interview, and the "connect my Gmail" next step. Backups (`.env.bak-*`, `bundle.json.bak-*`, `.mcp.json.bak-*`) can be deleted once everything works (Step 9).

## Rules

- The detail lives in `UPDATE_GUIDE.md` - keep this skill the orchestrator. If the guide and this summary ever disagree, the guide wins.
- Confirm before destructive steps; back up first; preserve vault + memory + identity.
- One broken step? Stop and report - don't push past a failed pull or build.
- Australian English, no em dashes, be specific.
