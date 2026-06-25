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
│                         │  Symlinks 11 skills into ~/.claude/skills/.
│                         │  Merges ~/.claude/settings.json.
│                         │  Installs LaunchAgent + morning brief.
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
├── com.nello.server.plist.hbs  macOS LaunchAgent
├── brain-context.md.hbs           Auto-injected identity summary
├── bootstrap.js                   Install orchestrator
├── pnpm-workspace.yaml
├── src/index.ts                   Daemon entry (wires bot + scheduler + dashboard)
├── packages/
│   ├── core/                      SQLite schema + memory + agent wrapper
│   ├── vault-seeder/              Renders vault preset into disk
│   ├── bot-telegram/              grammy bot with format/split helpers
│   ├── voice-online/              Groq STT + ElevenLabs TTS
│   ├── voice-local/               mlx-whisper + Piper
│   ├── scheduler/                 Cron poller + schedule CLI + morning brief seeder
│   ├── dashboard/                 Express + WebSocket + React UI (Chat/Cron/Monitoring)
│   └── audit/                     nello audit + doctor
├── hooks/
│   ├── inject-brain-context.sh    SessionStart
│   ├── auto-memory.js             UserPromptSubmit memory capture
│   ├── graphify-incremental.sh    PostToolUse graph rebuild
│   ├── statusline.sh              Terminal statusline
│   └── settings.json.hbs          ~/.claude/settings.json merge source
├── skills/                        7 bundled Tier 1 skills
└── vault-presets/                 nello / para / zettelkasten / custom
```

## Memory model

Three layers, each with a different retention profile:

1. **Claude Code session resumption** (per-chat sessionId) - ephemeral, per conversation
2. **SQLite `memories` table** - dual sector: semantic (1.0 start salience, decays 0.98/day, deletes <0.1) + episodic (decays faster)
3. **Auto-memory files** at `~/.claude/projects/<proj>/memory/*.md` - MEMORY.md index, user/feedback/project/reference types

All three get injected into the session by the SessionStart hook.

## Skill pack (Tier 1, always installed)

11 skills symlinked into `~/.claude/skills/` by the installer:

| Skill | What it does |
|-------|--------------|
| karpathy-guidelines | Clean, minimal code reasoning |
| find-skills | Discover + install skills |
| find-mcp | Discover + install MCPs |
| research | Parallel multi-source research |
| checkpoint | Save summary before /newchat |
| think | Structured problem breakdown |
| self-improving | Agent reflects on mistakes |
| simplify | Review code for reuse/quality |
| vault-audit | Check vault against rules |
| update-config | Edit settings.json safely |
| fewer-permission-prompts | Build allowlist from transcripts |

Tier 2 are opt-in during the install interview (mcp-builder, process-transcript, etc.). Tier 3 is plugin markets (andrej-karpathy-skills, caveman) registered in settings.json.

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
- `/find-skills` to add more skills
- `/find-mcp` to wire more MCPs
- `/update-config` to edit settings.json
- `pnpm --filter @nello/<pkg>` workflows for custom code additions
