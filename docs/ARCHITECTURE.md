# nello Architecture

## Two deliverables

1. **`web/`** — Next.js app hosted at labs.nello.gg. Hands the user one install prompt to paste into Claude Code.
2. **`template/`** — monorepo of runtime packages cloned onto the user's Mac; `template/bootstrap.js` runs the install.

## End-to-end flow

```
┌────────────────────────┐
│ User visits             │
│ labs.nello.gg/wizard    │
└───────────┬─────────────┘
            │ copies one install prompt
            ▼
┌────────────────────────┐
│ Paste into Claude Code  │  clones the repo into the open VS Code folder,
│ (Plan Mode)             │  reads SECURITY.md + INSTALL_GUIDE.md
└───────────┬─────────────┘
            │ INSTALL_GUIDE interview: identity + business + keys
            ▼
┌────────────────────────┐
│ template/bootstrap.js   │  Renders every .hbs with the interview values.
│                         │  Writes CLAUDE.md, .env, .mcp.json.
│                         │  Seeds vault from chosen preset.
│                         │  Symlinks the skill pack into ~/.claude/skills/.
│                         │  Merges ~/.claude/settings.json.
│                         │  Installs LaunchAgent + morning brief + auto-fetch.
└───────────┬─────────────┘
            ▼
┌────────────────────────┐
│ Three surfaces running  │
│ simultaneously:         │
│  - Telegram bot daemon  │
│  - Dashboard (:3000)    │
│  - Terminal claude CLI  │
│ All share SQLite at     │
│ store/clawd.db          │
└────────────────────────┘
```

## Template monorepo

```
template/
├── CLAUDE.md.hbs                  Personalised system prompt
├── AGENTS.md.hbs                  Session startup protocol
├── .env.example                   Every env var documented
├── .mcp.json.hbs                  MCP config
├── claude_desktop_config.json.hbs Desktop app MCP config
├── brain-context.md.hbs           Auto-injected identity summary
├── bootstrap.js                   Install orchestrator (generates the LaunchAgent plist
│                                  + service files inline - they are NOT shipped templates)
├── pnpm-workspace.yaml
├── src/index.ts                   Daemon entry (wires bot + scheduler + dashboard)
├── scripts/                       install-service.js, self-update.js, render-configs.js,
│                                  composio-provision.mjs, release.js, notify.sh
├── packages/
│   ├── core/                      SQLite schema + memory + agent wrapper
│   ├── vault-seeder/              Renders vault preset into disk
│   ├── bot-telegram/              grammy bot with format/split helpers
│   ├── voice-online/              Groq STT + ElevenLabs TTS
│   ├── voice-local/               mlx-whisper + Piper
│   ├── scheduler/                 Cron poller + schedule CLI + morning brief seeder
│   ├── dashboard/                 Express + WebSocket + React UI (Scheduled Tasks + Monitor)
│   └── audit/                     nello audit + doctor
├── hooks/
│   ├── inject-brain-context.js    SessionStart
│   ├── auto-memory.js             UserPromptSubmit memory capture
│   ├── graphify-incremental.js    PostToolUse graph rebuild
│   ├── statusline.js              Terminal statusline
│   ├── gbrain-sync.js             PostToolUse semantic re-embed (brain installs)
│   ├── block-dangerous-git.js     PreToolUse git guard
│   └── stop-beep.js               Stop hook
├── migrations/                    Idempotent stack migrations (0001-0004), run on /update
├── skills/                        20 bundled skills (canonical source for the symlinked set)
└── vault-presets/                 nello / para / zettelkasten / custom
```

## Memory model

Three layers, each with a different retention profile:

1. **Claude Code session resumption** (per-chat sessionId) - ephemeral, per conversation
2. **SQLite `memories` table** - dual sector: semantic (1.0 start salience, decays 0.98/day, deletes <0.1) + episodic (decays faster)
3. **Auto-memory files** at `~/.claude/projects/<proj>/memory/*.md` - MEMORY.md index, user/feedback/project/reference types

All three get injected into the session by the SessionStart hook.

## Skill pack (always installed)

Every directory under `template/skills/` is symlinked into `~/.claude/skills/` by the
installer (that dir is the source of truth; the set below is current at v1.3 - 20 skills):

| Skill | What it does |
|-------|--------------|
| nello-start | First-run orientation - what each piece is, in plain English |
| nello-build | Guided build of the user's company brain + first workflows |
| update-nello | `/update` - pull latest, rebuild, run migrations, announce the version |
| install-doctor | Deep health check of an install (brain, daemon, channel, recall) |
| diagnose | Triage a specific failure |
| connect-telegram | Make a bot with @BotFather + pair the owner chat |
| auto-fetch | The 20-min tick: fold new email/calendar into the vault (code-enforced dedup) |
| build-brain | Backfill connected tools (+ optional ChatGPT export) into the vault |
| build-recall | Embed the vault into gbrain semantic recall on demand |
| triage | Classify an incoming item (drop/ack/react/escalate) |
| cron | Manage scheduled tasks |
| research | Parallel multi-source research (Exa/Tavily) |
| karpathy-guidelines | Clean, minimal code reasoning |
| mcp-implement | Vet + wire a new MCP server end to end |
| write-skill | Author a new skill |
| find-skill | Discover an existing skill for a need |
| to-prd | Turn a request into a PRD |
| tool-rules | The tool-use rules the agent follows |
| grill-me | Adversarial self-questioning before a decision |
| zoom-out | Step back to the bigger picture on a stuck task |

Plugin markets (andrej-karpathy-skills, agentmemory) are registered in `settings.json`.

## Vault presets

- **NELLO** - dense prefix taxonomy with wikilinks. Matt's system.
- **PARA** - Projects / Areas / Resources / Archive. Tiago Forte.
- **Zettelkasten** - atomic notes with unique ID prefixes.
- **Custom** - user defines their own prefixes during the install interview.

Each preset has a `VAULT-RULES.md` (or `Resource-Vault-Rules.md` for NELLO), an `Inbox.md`, any starter MOCs, and a `_stubs/` directory for dynamic note creation later.

## Security

- API keys are collected conversationally by the assistant during the INSTALL_GUIDE interview and written to `.env`. They never touch the browser or a NELLO server.
- Installer reads `<install-folder>/bundle.json`, assembled locally by the assistant from the interview. Never fetched from a server.
- Keys live in `~/nello/.env` with `chmod 600`. 
- LaunchAgent runs as user, no privileged access.

## Extensibility

Users extend via:
- `/write-skill` to author a new skill (and `/find-skill` to locate an existing one)
- `/mcp-implement` to vet + wire a new MCP server
- a `client-overlay/skills/` dir, whose skills win by name and survive every `/update`
- `pnpm --filter @nello/<pkg>` workflows for custom code additions
