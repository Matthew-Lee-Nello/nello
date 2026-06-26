---
name: update-nello
description: Update an existing nello install to the latest version - pull the newest main, rebuild, refresh persona + skills + configs, run any pending stack migrations automatically (e.g. the old Google OAuth -> Composio move), and prompt only for a key that a newly added tool needs. Nothing personal is lost - vault, memory, identity and the Telegram owner lock are all preserved, there is NO re-interview. Use when the user says "/update", "update nello", "update my assistant", "update my install", "check for updates", "am I on the latest version", "pull the latest", "get the new skills", "migrate me to composio".
trigger: /update
model_hint: reasoning
---

# /update - update this install to the latest

One job: bring a clone up to the newest `main`, rebuild, re-render the configs/persona/skills, run any pending stack migrations (the full bootstrap does this on its own - the old Google OAuth -> Composio move is now one of them), and prompt only for a key a newly added tool needs. The full canonical step list lives in `<install>/UPDATE_GUIDE.md` - read it and follow it exactly. This skill orchestrates and points there; it does not duplicate the detail.

## Prime directives (read before doing anything)

- **Read `<install>/UPDATE_GUIDE.md` first** and follow its steps in order. That file is the source of truth; this is the map.
- **Run every command from the install folder** - the one with `.env`, `bundle.json` and `template/`. Confirm that first (`pwd`, `ls -A`). If it is not an install folder, stop and ask the user to `cd` into theirs.
- **Confirm before anything destructive.** Back up first. Never run a raw `git reset --hard` or `git stash -u` by hand (that would sweep up the untracked `.env` and vault). If a fast-forward pull is refused, use the safe engine (`self-update.js --salvage-reset`, see step 3) - it snapshots client state and salvages edits before it resets, so nothing is lost.
- **Preserve everything personal.** `vault/`, `store/`, `bundle.json` answers and the Telegram owner lock all carry over. There is NO re-interview - only code, configs, skills and persona refresh.
- **Adapt to the OS** (Mac / Windows / Linux) - the daemon start/stop commands differ; the guide lists each.
- **If something looks wrong** (not a git clone, missing `bundle.json`), stop and tell the user. Don't guess.

## The flow (summary - detail in UPDATE_GUIDE.md)

1. **Locate + back up.** Confirm `.env`, `bundle.json`, `template/` are here. Timestamp-copy `.env`, `bundle.json` and `.mcp.json` (Step 0).
2. **Stop the daemon** so nothing runs mid-update (Step 1, OS-specific).
3. **Pull latest main, fast-forward only.** `git fetch origin` then `git pull --ff-only origin main`. Updates always pull the newest `main`. **If the pull is refused** (a local edit to a tracked product file - the old chicken-and-egg that froze ancient installs), run the safe unstick instead of forcing:
   ```bash
   NC_INSTALL_PATH=$(pwd) node ./template/scripts/self-update.js --salvage-reset
   ```
   It checks the remote is really `Matthew-Lee-Nello/nello`, snapshots `.env`/`bundle.json`/`.mcp.json`/`.nello-version`, salvages your tracked-file edits into `client-overlay/quarantine/` (a client-edited shipped skill is also copied into `client-overlay/skills/` so it keeps working), then resets product files to `origin/main`. Client state (`.env`, vault, store) is gitignored, so it is never touched. Then continue with step 4.
4. **Rebuild.** `pnpm install` then `pnpm -r build` (Step 3).
5. **Refresh the install - this is where the upgrade happens** (Guide Step 4). Run the full bootstrap:
   ```bash
   NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js
   ```
   It re-renders persona (`CLAUDE.md`) + re-links skills + regenerates `.mcp.json`/`claude_desktop_config.json`, **runs any pending stack migrations on its own** (each recorded once in `.nello-version`; the old Google OAuth -> Composio move is migration `0001` - it strips the dead `GOOGLE_OAUTH_*` secrets and flips the install onto Composio, no hand-editing), mints the Composio router URL when the key is present, prunes retired MCP entries, and preserves the vault + `.env` + any client-added MCP. Safe to re-run. (A same-version config re-sync uses `--configs-only`; never use that for a version update - it skips migrations + persona.)
6. **Collect any new keys** (Guide Step 5). Ask bootstrap what's missing:
   ```bash
   node ./template/bootstrap.js --report-missing-keys
   ```
   `[]` = nothing to do, skip ahead. Otherwise, for each `{tool, key, where, hint}`: ask the user for that one key (tell them what it is for + where to get it), append it to `.env` (`printf '\n%s=%s\n' KEY VALUE >> .env`), then re-run the full bootstrap so the tool switches on. Re-check until `--report-missing-keys` prints `[]`. A just-migrated install shows `COMPOSIO_API_KEY` here - that is the single key the old OAuth->Composio step used to ask for, now handled the same way for every tool. If the user has no key to hand, the tool just stays off; nothing else is blocked.
7. **Restart the daemon** (Guide Step 6, OS-specific).
8. **Verify** (Guide Step 7). Run `/install-doctor`. Spot-check that `node ./template/bootstrap.js --report-missing-keys` is `[]`, `.mcp.json` no longer has `google_workspace`/`workspace-mcp`, `.nello-version` lists the applied migrations, and (if just migrated) `COMPOSIO_MCP_URL` is in `.env`. Open the dashboard - no Google OAuth prompt should appear.
9. **Reconnect apps, one click each.** The user says **"connect my Gmail"** (and Calendar, Drive, etc) in chat or Telegram; that calls `COMPOSIO_MANAGE_CONNECTIONS`, hands back a `connect.composio.dev` link, they click Allow. Read/send/create work; delete and trash stay blocked (Guide Step 8).

## End - announce what changed (auto-sent to Telegram)

The announcement is now produced by code, not by hand, so it is consistent and actually
reaches the owner. After the daemon is back up and `--report-missing-keys` is drained,
run the announce step exactly once:

```bash
NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js --announce
```

This reads the new `VERSION`, the pre-update `.nello-version.bak-*` (old version), the
`CHANGELOG.md` range, and the live missing-key report, then **sends the owner a Telegram
message**: what changed, the one thing they must do (e.g. paste the OpenAI key so memory
works), the auto-fetch cost + how to switch it off (`nello autofetch off`), and that their
vault/memory/identity are untouched. It also prints the same message to stdout - show that
to the user in chat too. If Telegram isn't wired yet, it prints `(Telegram not configured)`
and you relay the printed message yourself.

Then, in chat, add the one human touch the script can't: the **"connect my Gmail"** next
step if Composio was just wired. Backups (`.env.bak-*`, `bundle.json.bak-*`,
`.mcp.json.bak-*`, `.nello-version.bak-*`) can be deleted once everything works (Step 9).

## Rules

- The detail lives in `UPDATE_GUIDE.md` - keep this skill the orchestrator. If the guide and this summary ever disagree, the guide wins.
- Confirm before destructive steps; back up first; preserve vault + memory + identity.
- One broken step? Stop and report - don't push past a failed pull or build.
- Australian English, no em dashes, be specific.
