# Security

How nello treats your data, what permissions it touches, and what to verify before installing.

## What stays on your computer

Everything. nello is a local-only tool.

- API keys: you hand them to your assistant during the Claude Code install interview. It writes them into `<install-folder>/.env` (chmod 600) and assembles `<install-folder>/bundle.json` locally from the conversation. Nothing is typed into a browser, downloaded, or sent to a NELLO Labs server.
- Conversations with your assistant: SQLite database at `~/nello/store/clawd.db` on your machine.
- Your notes / vault: `~/nello/vault/` (or wherever you pointed at) on your machine.
- Memory + context: same SQLite DB.

NELLO Labs operates `labs.nello.gg` and the public GitHub repo. We do not have a backend that receives or stores your data.

## What the install touches on your machine

In the install folder (whatever folder you `cd`'d into before running):
- `<install-folder>/` — the cloned repo + `.env` + `vault/` + `store/` + `node_modules/`
- `<install-folder>/.claude/settings.json` — **project-scoped** Claude Code settings (only applies inside this folder)

Outside the install folder:
- `~/.claude/skills/<one-symlink-per-bundled-skill>` — symbolic links pointing at the bundled abilities in `<install-folder>/template/skills/`
- `~/Library/LaunchAgents/com.nello.server.plist` (Mac only, if you opted in to auto-start)
- Windows auto-start: a `.lnk` in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\` (per-user; no admin/UAC required)
- Linux auto-start: `~/.config/systemd/user/com.nello.server.service`
- `~/Applications/nello.app` (Mac) or Start Menu + Desktop shortcuts (Windows) — open the dashboard in app-mode

System-level packages installed if missing (uses your existing package manager, prompts for password when the package manager does):
- **Mac:** Homebrew (if missing), `node@20`, `git`, `uv`
- **Windows:** `OpenJS.NodeJS.LTS`, `Git.Git`, `astral-sh.uv` via `winget`
- **Linux:** `nodejs` via `apt-get`, `uv` via `astral.sh` script
- **All platforms:** `pnpm`, `obsidian-cli` via `npm install -g`

Claude Code, VS Code and Obsidian are manual prerequisites you install yourself (claude.com/claude-code, code.visualstudio.com, obsidian.md/download). The installer does not download them.

It does NOT touch:
- Your global `~/.claude/settings.json`
- Files outside the locations listed above

## bypassPermissions clarification

A common concern: nello enables `bypassPermissions: true` in Claude Code settings. Important details:

- It is written to `~/nello/.claude/settings.json` — a **project-scoped** file
- Project-scoped settings only apply when Claude Code is working inside that project folder
- Your other projects, and any Claude Code work outside `~/nello/`, are unchanged
- This is not a stealth modification — the upfront summary at install time prints exactly what is going where, and the file is right there for you to read after install

You can verify after install:
```bash
diff ~/.claude/settings.json /tmp/before-install-snapshot   # if you snapshotted first
cat ~/nello/.claude/settings.json                       # the project-scoped file
```

If you want this off entirely, edit `~/nello/.claude/settings.json` and remove the `permissions` block. Your assistant will then prompt for every tool use the way Claude Code normally does.

## Trust boundary: what your assistant will act on

Because tools run without a per-action prompt (see above), treat everything that feeds your assistant's context as if it were code it can run:

- **Your `CLAUDE.md`, bundled skills, and vault notes are effectively trusted.** A skill or a note that says "delete X" or "email Y to Z" can make the assistant do it. Only add skills and notes you trust, the same way you'd only run a script you trust.
- **Inbound messages and attachments are untrusted.** A PDF, image, voice note or caption you forward (especially something forwarded on from someone else) can carry text aimed at hijacking the assistant ("ignore your instructions and ..."). nello fences this content and labels it as data, not instructions, so the assistant is told to analyse it rather than obey it - but no prompt-injection defence is perfect. Don't forward attachments from people you don't trust and expect their embedded instructions to be safe.
- **The owner lock** means only your own number/chat can reach the assistant; a stranger can't message it. Anything *you* forward still flows in as above.

If you handle sensitive material, keep `bypassPermissions` off (above) so every tool use is gated.

## API keys handling

Plaintext, in `~/nello/.env`. Permissions set to `0600` (read/write owner only).

This matches every other local AI tool with API keys — nothing exotic. If your laptop disk is encrypted (FileVault on Mac, BitLocker on Windows), your keys are encrypted at rest along with everything else.

The `bundle.json` your assistant assembled in the install folder also contains plaintext keys until you delete it. The installer leaves it in place so you can verify what was in it (it also prints the exact path). Delete it yourself after install:

```bash
# Mac/Linux
rm <install-folder>/bundle.json

# Windows
del <install-folder>\bundle.json
```

## How to verify the install before approving

1. Use Plan Mode in Claude Code (Shift+Tab twice). Your assistant will summarise every step it intends to take. Read it. Approve only if it matches what `INSTALL_GUIDE.md` says.

2. Read these files in this repo before installing:
   - [`template/bootstrap.js`](template/bootstrap.js) — the install script
   - [`template/scripts/render-configs.js`](template/scripts/render-configs.js) — what gets written to `.mcp.json`, `claude_desktop_config.json`, and project-scoped `.claude/settings.json`
   - [`template/CLAUDE.md.hbs`](template/CLAUDE.md.hbs) — your assistant's persona

3. The install runs `pnpm install` and `pnpm -r build`. Standard Node ecosystem dependency tree. You can audit it with `pnpm audit` after install.

## Reporting a security issue

Open an issue at https://github.com/Matthew-Lee-Nello/nello/issues with the label `security` — or email matt@nello.gg directly for anything sensitive.

## Roll back

Complete removal:

```bash
# Mac
launchctl bootout gui/$(id -u)/com.nello.server 2>/dev/null
rm -rf ~/nello
rm -f ~/Library/LaunchAgents/com.nello.server.plist
find ~/.claude/skills -maxdepth 1 -type l -lname '*nello*' -delete

# Windows
schtasks /Delete /F /TN "com.nello.server"
Remove-Item -Recurse -Force "$HOME\nello"
Remove-Item -ErrorAction SilentlyContinue "$HOME\Desktop\nello.lnk"
Remove-Item -ErrorAction SilentlyContinue "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\nello.lnk"

# Linux
systemctl --user disable --now com.nello.server
rm -rf ~/nello
rm -f ~/.config/systemd/user/com.nello.server.service
```
