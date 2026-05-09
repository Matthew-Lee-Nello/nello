# nello-claw - Install Reference

Reference documentation for what the install actually does. Not a command file.

If you got here from the wizard at labs.nello.gg, the prompt you pasted into Claude Code already contains the actual install steps. This document is here so you (and your assistant) can verify what is about to happen before approving it in Plan Mode.

> **Use Claude Code's Plan Mode** (Shift+Tab twice) when you paste the install prompt. Your assistant writes out the steps it intends to take. You read them. You approve, or you don't.

## Where it installs

Whatever folder you are currently in when you run the install command. So before you start: open VS Code, open the folder you want your assistant to live in (any name, any location - Desktop, Documents, etc), then run the install in that folder's Terminal.

If you start the install in a folder that already has unrelated files, the installer refuses and tells you to pick a fresh empty folder.

## What gets installed

Running the install fills your chosen folder with:

- `CLAUDE.md` - your assistant's persona, generated from your wizard answers
- `.env` - your API keys (Telegram, Google, optional ones), permissions set so only you can read it
- `vault/` - your Obsidian vault, structured per the system you picked (NELLO/PARA/Zettelkasten/Custom)
  - `vault/Memory/` - your assistant auto-captures preferences/feedback/decisions here as Obsidian notes (the vault IS the permanent memory)
  - `vault/Journal/` - empty by default; write your own daily notes here, or ask the assistant to summarise into `YYYY-MM-DD.md`. SessionStart hook reads today + yesterday's journal back into context if files are present.
  - `vault/.obsidian/` - pre-configured dark theme + FFA600 accent + graph view tuned for your scale
- `store/clawd.db` - SQLite database for short-term conversation context, scheduled tasks, sessions
- `node_modules/`, `dist/` - dependencies and compiled code
- `.claude/settings.json` - **project-scoped** Claude Code settings (see "Security" below)
- All bundled abilities (skills) get symlinked into `~/.claude/skills/` so Claude Code can discover them when working in `<install-folder>/`. Current count: 11 (find-skills, install-doctor, karpathy-guidelines, research, diagnose, grill-me, zoom-out, to-prd, write-skill, nello-start, nello-build).

It also auto-installs (if missing):
- **Obsidian.app** (Mac via Homebrew cask, Windows via winget) - so your vault opens in a real app, not just on disk
- **obsidian-cli** (npm global) - lets your assistant write/search the vault from the command line

If you opted in:
- A LaunchAgent (Mac) or Task Scheduler entry (Windows) or systemd user service (Linux) so the daemon starts on login
- A `nello-claw.app` (Mac) or Start Menu shortcut (Windows) that opens the dashboard at `localhost:3000` in app-mode

When the install finishes the dashboard opens in app-mode AND your vault opens in Obsidian alongside it.

## What the bootstrap script does

[`template/bootstrap.js`](template/bootstrap.js) is the script that does the work. It:

1. Reads your `~/Downloads/nello-claw-bundle.json` (your wizard answers + API keys)
2. Renders Handlebars templates with your values to write `CLAUDE.md`, `AGENTS.md`, `.mcp.json`, `.env`
3. Sets `chmod 600` on `.env` so other users on your machine cannot read it
4. Seeds your notes folder from the preset you picked
5. Symlinks the bundled abilities (skills) into `~/.claude/skills/` - currently 11 of them (find-skills, install-doctor, karpathy-guidelines, research, diagnose, grill-me, zoom-out, to-prd, write-skill, nello-start, nello-build). If a skill with the same name already exists there, the existing one is renamed to `.bak-<timestamp>` first
6. Writes a project-scoped `.claude/settings.json` inside `<install-folder>/` with hooks + `bypassPermissions: true` for THAT project only
7. Creates `store/`, `workspace/uploads/`, `vault/Memory/`, `vault/Journal/` directories
8. Installs Obsidian.app (Homebrew cask on Mac, winget on Windows) and `obsidian-cli` globally via npm so your assistant can drive Obsidian from the command line. Skipped if Obsidian is already installed.
8. If you opted into auto-start: registers the service via `launchctl` (Mac) / `schtasks` (Windows) / `systemctl --user` (Linux)
9. If you opted into morning brief: seeds a scheduled task in the SQLite DB
10. Runs `nello-claw audit` to verify everything

You can read the full script at the path above before running.

## Security

Three things to know:

**1. `bypassPermissions` is project-scoped, not global.**

The setting goes in `<install-folder>/.claude/settings.json`, not `~/.claude/settings.json`. It only applies when Claude Code is working inside the `<install-folder>/` folder (which is where your assistant lives). Your other projects keep their normal Claude Code permission prompts.

You can verify after install:
```
cat <install-folder>/.claude/settings.json
cat ~/.claude/settings.json   # should be unchanged
```

**2. Your API keys live on your computer in plaintext, in `<install-folder>/.env`.**

This is the same trade-off every local AI tool makes (Ollama, LM Studio, etc). The file has `chmod 600` so only your user account can read it. Nobody at NELLO Labs sees your keys - the wizard at labs.nello.gg never receives them, the install bundle is downloaded directly to your machine.

After install: delete `~/Downloads/nello-claw-bundle.json` yourself. The installer leaves it in place so you can verify it. The keys in there are duplicates of what got written to `<install-folder>/.env`.

**3. The skill symlinks point at files inside `<install-folder>/template/skills/`.**

Those are open-source SKILL.md files in the public repo at github.com/Matthew-Lee-Nello/nello-claw. Read them before approving the install if you want to know what abilities your assistant gets:
- [skills/karpathy-guidelines](template/skills/karpathy-guidelines/) - clean code reasoning
- [skills/find-skills](template/skills/find-skills/) - discover more abilities
- [skills/research](template/skills/research/) - parallel web research
- [skills/checkpoint](template/skills/checkpoint/) - save session before clearing
- [skills/think](template/skills/think/) - structured problem breakdown
- [skills/self-improving](template/skills/self-improving/) - agent reflects on mistakes
- [skills/vault-audit](template/skills/vault-audit/) - vault hygiene checker

## What it does NOT do

- It does not modify `~/.claude/settings.json` (your global Claude Code settings)
- It does not upload anything to NELLO Labs servers
- It does not phone home, send telemetry, or report usage
- It does not modify any file outside `<install-folder>/`, `~/.claude/skills/<symlinks>`, `~/Library/LaunchAgents/com.nello-claw.server.plist` (Mac), or the equivalents on Windows/Linux

## Roll back

To completely remove:
```bash
# Mac
launchctl bootout gui/$(id -u)/com.nello-claw.server
rm -rf <install-folder>
rm -f ~/Library/LaunchAgents/com.nello-claw.server.plist
# Skill symlinks (only the ones that point at nello-claw)
find ~/.claude/skills -maxdepth 1 -type l -lname '*nello-claw*' -delete
```

```powershell
# Windows
schtasks /Delete /F /TN "com.nello-claw.server"
Remove-Item -Recurse -Force "$HOME\nello-claw"
Remove-Item "$HOME\Desktop\nello-claw.lnk", "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\nello-claw.lnk"
```

## How to verify before installing

1. Read [`template/bootstrap.js`](template/bootstrap.js) - that is the install script
2. Read [`template/hooks/settings.json.hbs`](template/hooks/settings.json.hbs) - what gets written to project settings
3. Read [`template/CLAUDE.md.hbs`](template/CLAUDE.md.hbs) - what gets written as your assistant's persona
4. Use Plan Mode in Claude Code (Shift+Tab twice) - your assistant will summarise everything before running

If anything looks wrong, do not approve the plan. Open an issue at github.com/Matthew-Lee-Nello/nello-claw/issues.
