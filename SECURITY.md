# Security

How nello-claw treats your data, what permissions it touches, and what to verify before installing.

## What stays on your computer

Everything. nello-claw is a local-only tool.

- API keys: paste them into the wizard at labs.nello.gg → bundle file is downloaded directly to your `~/Downloads/` folder. The wizard runs in your browser; the keys never travel to a NELLO Labs server.
- Conversations with your assistant: SQLite database at `~/nello-claw/store/clawd.db` on your machine.
- Your notes / vault: `~/nello-claw/vault/` (or wherever you pointed at) on your machine.
- Memory + context: same SQLite DB.

NELLO Labs operates `labs.nello.gg` (the wizard) and the public GitHub repo. We do not have a backend that receives or stores your data.

## What the install touches on your machine

In the install folder (whatever folder you `cd`'d into before running):
- `<install-folder>/` — the cloned repo + `.env` + `vault/` + `store/` + `node_modules/`
- `<install-folder>/.claude/settings.json` — **project-scoped** Claude Code settings (only applies inside this folder)

Outside the install folder:
- `~/.claude/skills/<one-symlink-per-bundled-skill>` — symbolic links pointing at the bundled abilities in `<install-folder>/template/skills/`
- `~/Library/LaunchAgents/com.nello-claw.server.plist` (Mac only, if you opted in to auto-start)
- Windows auto-start: a `.lnk` in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\` (per-user; no admin/UAC required)
- Linux auto-start: `~/.config/systemd/user/com.nello-claw.server.service`
- `~/Applications/nello-claw.app` (Mac) or Start Menu + Desktop shortcuts (Windows) — open the dashboard in app-mode

System-level packages installed if missing (uses your existing package manager, prompts for password when the package manager does):
- **Mac:** Homebrew (if missing), `node@20`, `git`, `uv`, `obsidian` cask (installs Obsidian.app to `/Applications/`)
- **Windows:** `OpenJS.NodeJS.LTS`, `Git.Git`, `astral-sh.uv`, `Obsidian.Obsidian` via `winget`
- **Linux:** `nodejs` via `apt-get`, `uv` via `astral.sh` script
- **All platforms:** `pnpm`, `@anthropic-ai/claude-code`, `obsidian-cli` via `npm install -g`

It does NOT touch:
- Your global `~/.claude/settings.json`
- Files outside the locations listed above

## bypassPermissions clarification

A common concern: nello-claw enables `bypassPermissions: true` in Claude Code settings. Important details:

- It is written to `~/nello-claw/.claude/settings.json` — a **project-scoped** file
- Project-scoped settings only apply when Claude Code is working inside that project folder
- Your other projects, and any Claude Code work outside `~/nello-claw/`, are unchanged
- This is not a stealth modification — the upfront summary at install time prints exactly what is going where, and the file is right there for you to read after install

You can verify after install:
```bash
diff ~/.claude/settings.json /tmp/before-install-snapshot   # if you snapshotted first
cat ~/nello-claw/.claude/settings.json                       # the project-scoped file
```

If you want this off entirely, edit `~/nello-claw/.claude/settings.json` and remove the `permissions` block. Your assistant will then prompt for every tool use the way Claude Code normally does.

## API keys handling

Plaintext, in `~/nello-claw/.env`. Permissions set to `0600` (read/write owner only).

This matches every other local AI tool with API keys — nothing exotic. If your laptop disk is encrypted (FileVault on Mac, BitLocker on Windows), your keys are encrypted at rest along with everything else.

The bundle file at `~/Downloads/nello-claw-bundle.json` also contains plaintext keys until you delete it. The installer leaves it in place so you can verify what was in it. Delete it yourself after install:

```bash
# Mac/Linux
rm ~/Downloads/nello-claw-bundle.json

# Windows
del %USERPROFILE%\Downloads\nello-claw-bundle.json
```

## How to verify the install before approving

1. Use Plan Mode in Claude Code (Shift+Tab twice). Your assistant will summarise every step it intends to take. Read it. Approve only if it matches what `INSTALL_GUIDE.md` says.

2. Read these files in this repo before installing:
   - [`template/bootstrap.js`](template/bootstrap.js) — the install script
   - [`template/hooks/settings.json.hbs`](template/hooks/settings.json.hbs) — what gets written to project settings
   - [`template/CLAUDE.md.hbs`](template/CLAUDE.md.hbs) — your assistant's persona
   - [`installer/install.sh`](installer/install.sh) / [`installer/install.ps1`](installer/install.ps1) — only used if you take the bash/PowerShell fallback path

3. The install runs `pnpm install` and `pnpm -r build`. Standard Node ecosystem dependency tree. You can audit it with `pnpm audit` after install.

## Reporting a security issue

Open an issue at https://github.com/Matthew-Lee-Nello/nello-claw/issues with the label `security` — or email matt@nello.gg directly for anything sensitive.

## Roll back

Complete removal:

```bash
# Mac
launchctl bootout gui/$(id -u)/com.nello-claw.server 2>/dev/null
rm -rf ~/nello-claw
rm -f ~/Library/LaunchAgents/com.nello-claw.server.plist
find ~/.claude/skills -maxdepth 1 -type l -lname '*nello-claw*' -delete

# Windows
schtasks /Delete /F /TN "com.nello-claw.server"
Remove-Item -Recurse -Force "$HOME\nello-claw"
Remove-Item -ErrorAction SilentlyContinue "$HOME\Desktop\nello-claw.lnk"
Remove-Item -ErrorAction SilentlyContinue "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\nello-claw.lnk"

# Linux
systemctl --user disable --now com.nello-claw.server
rm -rf ~/nello-claw
rm -f ~/.config/systemd/user/com.nello-claw.server.service
```
