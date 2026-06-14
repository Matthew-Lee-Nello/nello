---
name: mcp-implement
description: Wire any MCP server into THIS assistant end to end - vet, classify, install pinned, declare in the install's own .mcp.json + claude_desktop_config.json, restart the daemon, verify with a real tool call, guardrail destructive tools. Takes a GitHub repo, npm package, or HTTP endpoint. Trigger - "/mcp-implement <target>", "add this MCP", "connect me to <tool>", "wire up <service>".
trigger: /mcp-implement
---

# /mcp-implement (client edition)

One flow takes an MCP server from "I use this tool" to "verified working on every surface of my assistant." Used by `INSTALL_GUIDE.md` during setup to wire each tool the owner's business runs on, and any time afterwards when they want a new connection.

This is the **client** version. There is no shared manifest - the source of truth for connections on this box is two files in the install folder: `.mcp.json` (the daemon + terminal Claude Code) and `claude_desktop_config.json` (Claude Desktop, if used). You edit those directly. Secrets live in `.env`.

## Hard rules

1. **`npx -y` is banned in the saved config.** Per-spawn registry resolution floats versions and dies when the npx cache corrupts. Install the package pinned and point the config at the absolute bin. (The baseline `obsidian`/`exa`/`apify` entries use `npx -y` for zero-setup convenience; for anything you add here, pin it.)
2. **Vet before you install.** Run the `find-skill` red-flag checklist (`~/.claude/skills/find-skill/SKILL.md`) on the source. Any red flag → stop, report, do not install.
3. **Write the resolved secret straight into the server's `env` block in the config** (same as the baseline google/exa/apify servers). The daemon spawns MCP servers without loading `.env` into its environment, so a `${VAR}` reference reaches the server as the literal string `${VAR}`, not the value, and auth silently fails. Keep `.env` as a human-readable record if you like, but the value the server actually runs with lives in `.mcp.json`. Never put secrets in `CLAUDE.md`.
4. **Real verification, not a handshake.** A server "works" when one real read-only tool call returns data. A clean startup log is not proof.
5. **Confirm before destructive tools.** Anything that deletes/sends/pays gets an explicit "ask first" note in `CLAUDE.md`.
6. **Merge, never clobber.** Add your server to the existing `mcpServers` object; keep everything already there.

## Workflow

### Step 1 - Vet (hard gate)
Given a GitHub repo / npm package / HTTP endpoint: prefer official-vendor or high-star, actively-maintained sources. Run the `find-skill` checklist on it (install scripts, postinstall hooks, where it sends data, how it handles credentials). Read the README for transport (stdio/http), auth (API key / OAuth / none), required env vars, and the tool list. **Stop on any red flag.**

### Step 2 - Classify
Answer four questions:
- Does it **bind a port** (OAuth callback, embedded web server)?
- Does it **write shared state** (token/lock/credential files at fixed paths)?
- Does it hold **heavy caches** or cold-start over ~2s?
- Do **multiple surfaces** need it at once?

All "no" → **stateless**: per-session stdio is fine, proceed.
Any "yes" → **stateful**: it must run as ONE long-lived service and every surface points at `{ "type": "http", "url": "http://127.0.0.1:<port>/mcp" }`. Google Workspace is the model already on this box - copy its shape. Don't run a stateful server as per-session stdio; you'll get port/credential fights.

### Step 3 - Install pinned
- Node: `npm view <pkg> version` → `npm i -g <pkg>@<exact>`. Find the bin: `which <bin>` / `npm root -g`.
- Python: `uv tool install <pkg>==<exact>` (bin lands in `~/.local/bin`).
Confirm it runs: `<bin> --help` or a 5-second spawn.

### Step 4 - Declare in the install's config
Add the server to **both** files in the install folder, merging into the existing `mcpServers` object:
- `<install-folder>/.mcp.json` - used by the daemon and terminal Claude Code.
- `<install-folder>/claude_desktop_config.json` - used by Claude Desktop.

Put the resolved secret value directly in the server's `env` block, exactly like the baseline servers. Example (pinned stdio):
```json
"slack": {
  "command": "/opt/homebrew/bin/slack-mcp-server",
  "args": [],
  "env": { "SLACK_BOT_TOKEN": "xoxb-the-actual-token" }
}
```
> The installer (`bootstrap.js`) preserves servers you add here on any future re-run: it keeps your unmanaged servers and only refreshes the baseline ones it owns.

### Step 5 - Collect credentials
Walk the owner through getting whatever the server needs (API key, OAuth token), the same paste-and-validate way the install does it. Write the resolved value into the server's `env` block in `.mcp.json` (Step 4), not as a `${VAR}` reference. Never echo a full secret back.

### Step 6 - Restart the daemon
The daemon reads `.mcp.json` at start. Restart it so the new server loads:
- **Mac:** `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server`
- **Linux:** `systemctl --user restart com.nello-claw.server`
- **Windows:** the daemon is a plain node process started by the Startup-folder launcher, not a scheduled task. Log out and back in to relaunch it, or kill the node daemon and re-run `nello-claw-daemon.cmd`.

### Step 7 - Verify with a real call (blocking gate)
- **Terminal Claude Code (the gold standard):** in a fresh session, ToolSearch for the new tool and make one real read-only call. It must return data. This proves the server loads under the same config the daemon uses.
- **Daemon health:** after the restart, check `store/server.log` for a pino `MCP not connected` warning naming the new server. Its absence means the daemon loaded it. (The daemon logs that warning for any server whose init status isn't `connected`.)
Do not call it done until a real read-only call returns data.

### Step 8 - Guardrail + document
Categorise the tools (read-only / write / destructive / money). Add a short section to `<install-folder>/CLAUDE.md` under "Installed MCPs": the account it uses, the tool prefix, common operations, and an explicit "never without confirmation" line for any delete/send/pay tool.

### Step 9 - Cleanup check
After a test session exits: `pgrep -fl <bin>` and, for stateful servers, `lsof -nP -iTCP -sTCP:LISTEN | grep <port>`. Orphan process or leaked listener → your Step 2 classification was wrong; reclassify as stateful and redo.

### Step 10 - Report
```
MCP wired: <name>
  Pin: <pkg>@<version> -> <bin>
  Classification: stateless | stateful (port <port>)
  Config: .mcp.json + claude_desktop_config.json
  Verify: real <tool> call returned data
```

## Upgrading later
Never auto-upgrade. Install the new version, bump the pin in `.mcp.json`, restart the daemon, re-verify with a real call. Keep it only if green; roll back by reinstalling the previous pin.
