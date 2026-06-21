# nello-claw - Audit Reference

Reference documentation for the audit + upgrade flow. Not a command file.

If you got here from labs.nello.gg/audit, the prompt you pasted into Claude Code already names the steps. This document explains what each step does so you can verify before approving.

> **Use Claude Code's Plan Mode** (Shift+Tab twice) when you paste the audit prompt. Your assistant writes out the steps it intends to take. You read them. You approve, or you don't.

## Who this is for

People who already have Claude Code and some setup in place — for example, the Google Workspace MCP wired up, or a vault folder, or a few skills installed — but want to add the rest of the nello-claw stack piece by piece.

If you have nothing in place yet, go to labs.nello.gg and follow the standard install instead.

## What the audit looks at

Your assistant reads (does not modify) these locations on your computer:

- `~/.claude/skills/` — currently installed abilities
- `~/.claude/settings.json` — hooks, plugins, permissions, statusline
- `~/.mcp.json` — connections (Gmail, Drive, etc) you have wired
- `~/.claude/plugins/cache/` — plugin marketplaces enabled
- whether `~/nello-claw/` exists already

It clones the public reference repo to `/tmp/nello-claw-ref/` (read-only, gets deleted later) and compares.

## What it offers to install

For each missing piece, the assistant asks you yes / no / later:

- Symlink missing default abilities into `~/.claude/skills/` — non-destructive, existing skills with same name get renamed to `.bak-<timestamp>` first
- Add hooks (SessionStart, UserPromptSubmit, PostToolUse, statusline) to `~/.claude/settings.json` — backs up existing first
- Add bypassPermissions to **a project-scoped settings file** at `~/nello-claw-audit/.claude/settings.json`, NOT to your global `~/.claude/settings.json`. This means it only applies when Claude is working in that project folder
- Wire missing MCP connections to `~/.mcp.json` — backs up existing first
- Render a personalised `CLAUDE.md` from your answers

## What it does NOT do without explicit yes

- Does not modify your global `~/.claude/settings.json` without asking
- Does not delete any existing skills
- Does not overwrite any file without first making a `.bak-<timestamp>` backup
- Does not install services / daemons / LaunchAgents
- Does not write anything outside the paths listed above

## Security

Same as INSTALL_GUIDE.md:

- `bypassPermissions` only ever lands in a **project-scoped** `.claude/settings.json`, never your global one
- All keys live in plaintext on your computer (in `.env` files), `chmod 600`
- Nothing gets uploaded to NELLO Labs
- The reference repo at github.com/Matthew-Lee-Nello/nello-claw is public; you can read every file before approving

## How to verify before approving

1. Run the audit prompt in Plan Mode (Shift+Tab twice in Claude Code)
2. Read the plan your assistant produces
3. For each "install X" step, ask "show me the file you would write" — the assistant will print it
4. Approve only the steps you want
