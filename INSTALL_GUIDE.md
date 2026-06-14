# nello-claw — Install Interview (read this top to bottom, then run it)

**You are Claude Code. This document is your script.** The person who pasted the install prompt is your new owner. You are going to interview them, collect their details and credentials, build their company brain, wire their tools, and stand up their AI assistant end to end. Work through the steps in order. Do not skip ahead.

Read `SECURITY.md` in this repo before you start so you can answer "what is this about to do to my machine" honestly.

## How to run this interview

- **Plan Mode for the build step only.** The interview itself is a normal conversation — ask, listen, confirm. When you reach the bootstrap step (Step 6), summarise every change first and get a yes before running anything.
- **One thing at a time.** Ask one question (or one tight group), wait for the answer, validate it, reflect it back, move on. Do not dump the whole questionnaire at once.
- **Grill them — kindly.** This is the only time you get their full attention to build the brain. If an answer is thin ("I do marketing"), dig: for who, what outcome, what's the offer. Better input now = a sharper assistant forever. Match the tone of the `grill-me` skill, not an interrogation.
- **Plain language.** Your owner may not be technical. No jargon in your questions. "What does your business sell?" not "describe your value proposition." Translate every technical step into something a non-developer can follow.
- **Never proceed on a blank required field.** If something required is missing or fails validation, stop and ask again. Do not invent a value to get past a check.
- **Ask before anything destructive.** Cloning, installing packages, writing files in the current folder — say what you're about to do, then do it. Nothing outside this folder, `~/.claude/skills/` symlinks, and the login-item without calling it out.

---

## Step 1 — Pre-flight

1. **Confirm the folder.** Run `pwd` and `ls -A`. The current folder must be empty (or contain only this cloned repo / a `bundle.json`). If it has unrelated files, stop and tell them to open an empty folder in VS Code and restart.
2. **Detect the OS** (`uname` / platform) so you adapt every command (Mac/Linux/Windows).
3. **Check prerequisites** and install what's missing (ask first on Mac/Linux package installs):
   - `git`, `node` (v20+), `pnpm` — required.
   - `claude` (Claude Code CLI) — **required, fatal if missing.** The daemon drives Claude through it. If absent, send them to https://claude.com/claude-code and stop.
   - `graphify` — optional, non-fatal.
4. **Clone if needed.** If this repo isn't already in the folder: `git clone https://github.com/Matthew-Lee-Nello/nello-claw.git .`
5. **Build the code** (do this now so the later bootstrap is fast): `pnpm install` then `pnpm -r --filter '!@nc/web' build && pnpm --filter nello-claw-template build`.

Tell them what you found ("Claude Code ✓, Node ✓, installed pnpm for you") and move on.

---

## Step 2 — Identity

Collect, one at a time:

- **Their name** → `name`
- **What to call the assistant** (you) → `assistantName`
- **What they do** in one line → `occupation`
- **About them, in their words** — a few sentences on who they are, what they care about, how they like to be spoken to. This becomes the assistant's source-of-truth for tone. Push for at least 2-3 real sentences → `bio`

---

## Step 3 — The company brain (grill here)

This is what makes their assistant useful on day one instead of a blank chatbot. Interview them properly:

- **Their role + company** → `role`, `company`
- **Industry** → `industry`
- **Who they serve** (their ideal customer / client profile) → `targetCustomer`
- **What they sell** (offers / services, as a list) → `services` (string array)
- **Active projects** — name + one line each → `projects` ([{name, description}])
- **Their people** — team members (name + role) → `teamMembers` ([{name, role}]); key clients (name + status, e.g. "active", "prospect") → `clients` ([{name, status}]); mentors/advisors → `mentors` ([{name, relationship}])
- **Voice rules** — how should the assistant write? Default to: direct, Australian English, no em dashes, no AI clichés. Ask if they want anything banned or any house style → `communicationStyle`, `language` ('AU'/'US'/'UK'), `emDashPolicy` ('never'/'sparingly'/'free'), `oxfordComma` (bool), `bannedWords` (string array)

Capture honestly. Empty arrays are fine where they genuinely have nothing yet — don't fabricate clients or team.

---

## Step 4 — Core credentials

Three services everyone gets: **Telegram** (the assistant texts them), **Google** (Gmail / Drive / Calendar), **Exa** (live web search). Walk each one, paste, validate, confirm. Keys never leave their machine — say so.

### 4a. Telegram
1. **Bot token:** open Telegram, message **@BotFather**, send `/newbot`, follow the prompts, copy the token it gives back.
   - Validate against `^\d+:[A-Za-z0-9_-]{30,}$`. If it fails, they pasted something else — ask again.
   - → `keys.TELEGRAM_BOT_TOKEN`
2. **Their chat ID:** in Telegram, search **@userinfobot**, send it any message, copy the number it replies with.
   - Validate against `^-?\d{5,}$`.
   - → `telegramChatId` **and** `keys.ALLOWED_CHAT_ID` (set both to the same value — this is the owner lock). The bootstrap hard-fails if a bot token is present but this is empty, so the bot never ships open to the world. Don't work around that failure by inventing a value — go get the real chat ID.

### 4b. Google (their own OAuth app — ~10 min, one time)
They create their own Google Cloud app so their data stays theirs. Walk it slowly:

1. Go to **console.cloud.google.com**. Create a new project (top bar → project dropdown → New project), name it anything (e.g. "my-assistant"), select it.
2. **Enable the APIs** they'll use. Search each in the top bar and click Enable: **Gmail API**, **Google Calendar API**, **Google Drive API**, **Google Docs API**, **Google Sheets API**.
3. **OAuth consent screen** (left menu → APIs & Services → OAuth consent screen): choose **External**, give it an app name, put their own email as support + developer contact, save.
4. **Add themselves as a test user:** on the consent screen / Audience tab → **Test users** → add their Google email. (Skipping this is the #1 reason Google auth fails later — an unverified app only works for listed test users.)
5. **Create the credential:** APIs & Services → Credentials → **Create credentials → OAuth client ID → Application type: Desktop app** → Create. Copy the **Client ID** and **Client secret**.
6. Collect and validate:
   - `keys.GOOGLE_USER_EMAIL` — their Google address (email format).
   - `keys.GOOGLE_OAUTH_CLIENT_ID` — length > 30 or ends `apps.googleusercontent.com`.
   - `keys.GOOGLE_OAUTH_CLIENT_SECRET` — length > 20.

If Google auth errors after install, the usual fixes are: they weren't added as a test user (Step 4), or the OAuth client type didn't match what `workspace-mcp` expects — check the `workspace-mcp` README for the current redirect/client-type and recreate the credential.

### 4c. Exa
1. Go to **dashboard.exa.ai**, sign up (free tier is fine), copy an API key.
2. Validate length > 20. → `keys.EXA_API_KEY`

---

## Step 5 — Assemble `bundle.json`

Write `./bundle.json` in this folder from everything collected. **Use only these keys** — the bootstrap rejects any unknown key and refuses to run:

```jsonc
{
  "name": "", "assistantName": "", "occupation": "", "bio": "",
  "role": "", "company": "", "industry": "", "targetCustomer": "",
  "services": [], "tools": [],
  "projects": [{ "name": "", "description": "" }],
  "teamMembers": [{ "name": "", "role": "" }],
  "clients": [{ "name": "", "status": "" }],
  "mentors": [{ "name": "", "role": "" }],
  "communicationStyle": "direct", "language": "AU",
  "emDashPolicy": "never", "oxfordComma": false, "bannedWords": [],
  "vaultPreset": "nello", "graphifyEnabled": true,
  "mcps": { "google": true, "obsidian": true, "exa": true },
  "keys": {
    "TELEGRAM_BOT_TOKEN": "", "ALLOWED_CHAT_ID": "",
    "GOOGLE_USER_EMAIL": "", "GOOGLE_OAUTH_CLIENT_ID": "", "GOOGLE_OAUTH_CLIENT_SECRET": "",
    "EXA_API_KEY": ""
  },
  "telegramChatId": "",
  "installTelegram": true, "installDashboard": true, "installLaunchAgent": true,
  "enableMorningBrief": true,
  "morningBriefPrompt": "Morning brief. 3 lines max per section.\n1. What matters today\n2. Calendar top 3\n3. Open loops to close",
  "morningBriefCron": "0 9 * * *",
  "enableAutoFetch": true, "autoFetchCron": "*/20 * * * *",
  "voiceSource": "local"
}
```

`tools` is the plain list of what their business runs on (you'll fill it in Step 7). The baseline `mcps` trio (google / obsidian / exa) ships for everyone — leave those on.

---

## Step 6 — Build (Plan Mode)

1. **Summarise** for approval: "I'm about to run the installer. It will write `CLAUDE.md`, `.env` (chmod 600), seed your Obsidian vault, symlink skills into `~/.claude/skills/`, install Obsidian + a login item so your assistant starts on boot, and start the dashboard at localhost:3000. Nothing leaves your machine. OK to run?"
2. On yes: `NC_INSTALL_PATH=$(pwd) node ./template/bootstrap.js` (it reads `./bundle.json`). The bootstrap prints its own change log.
3. **Verify the owner lock took** before you let the daemon keep running: run `grep -q '^ALLOWED_CHAT_ID=.\+' .env`. If it fails, **stop** — do not leave the daemon up — re-collect the chat ID (Step 4a) and re-run the bootstrap. (The bootstrap itself also hard-fails on an empty lock when a bot token is set; this is the belt-and-braces check.) Then confirm the dashboard answers on `localhost:3000`.

---

## Step 7 — Their tool stack (the part that makes every client different)

Two clients are never the same. Now wire what *this* one runs on.

1. Ask: **"Beyond Google, what does your business actually run on day to day?"** Slack, Notion, HubSpot, Salesforce, Linear, GitHub, Stripe, Xero, Apify — whatever they name. Record the list into `tools` (re-run the relevant render or note it for CLAUDE.md context).
2. For **each** tool they named, wire it the proper way using the bundled **`mcp-implement`** skill (read `~/.claude/skills/mcp-implement/SKILL.md`): vet the server (via `find-skill`'s checklist) → classify stateless/stateful → install pinned (never `npx -y` in the saved config) → add it to **this install's** `.mcp.json` + `claude_desktop_config.json` → collect that tool's credentials the same paste-and-validate way → **verify with one real read-only tool call** → restart the daemon.
3. Anything with no known MCP → fall back to `find-skill` discovery, vet, install.
4. Don't over-collect. Wire what they'll use this week; tell them they can add more anytime by saying *"find me a connection for X."*

---

## Step 8 — Seed the brain into the vault

The persona in `CLAUDE.md` now carries their business. Make the vault match so search + the graph have something to stand on. From the Step 3 answers, write starter notes in the vault taxonomy (`nello` preset → `Person-`, `Client-`, `Project-` prefixes with `type`/`tags`/`date` frontmatter): one note per client, per team member, per active project. Keep them short — name, role/status, one or two facts. The auto-memory hook grows them over time.

---

## Step 9 — Verify + hand off

1. Run **`/install-doctor`** — work the report top to bottom, fix anything red (most common: Claude Code auth, or a missing key).
2. Tell them to **send their Telegram bot a message** to finish the phone link.
3. Hand off: **"Run `/nello-start`"** — it tours what's now running and chains into `/nello-build` to wire their first features.

---

## Reference — what the bootstrap writes

`template/bootstrap.js` reads `./bundle.json` and:
- Renders `CLAUDE.md` (persona + their brain), `.env` (chmod 600), `.mcp.json`, `claude_desktop_config.json`.
- Seeds `vault/` from the chosen preset + creates `vault/Memory/`, `vault/Journal/`.
- Symlinks `template/skills/*` into `~/.claude/skills/`.
- Writes a **project-scoped** `.claude/settings.json` (`bypassPermissions` for this folder only — never global) with the hooks.
- Installs Obsidian.app + `obsidian-cli`, registers the login-item daemon, seeds the morning-brief task, runs `nello-claw audit`.

## Security (state this plainly if they ask)
- `bypassPermissions` is **project-scoped** — it lives in `<install-folder>/.claude/settings.json`, not `~/.claude/settings.json`. Other projects keep normal prompts.
- API keys sit in `<install-folder>/.env` in plaintext, `chmod 600` (same trade-off as Ollama/LM Studio). Nothing is uploaded — there is no NELLO server in this flow; you built the bundle locally from the conversation.
- Skill symlinks point at open-source `SKILL.md` files in `template/skills/`. Read any before approving.

## Roll back
```bash
# Mac
launchctl bootout gui/$(id -u)/com.nello-claw.server
rm -rf <install-folder>
rm -f ~/Library/LaunchAgents/com.nello-claw.server.plist
find ~/.claude/skills -maxdepth 1 -type l -lname '*nello-claw*' -delete
```
```powershell
# Windows
schtasks /Delete /F /TN "com.nello-claw.server"
Remove-Item -Recurse -Force "<install-folder>"
```

If anything looks wrong, stop and open an issue at github.com/Matthew-Lee-Nello/nello-claw/issues.
