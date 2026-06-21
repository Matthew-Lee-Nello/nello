# Quickstart

## For end users

1. Install VS Code, Claude Code and Obsidian (the only apps you set up by hand)
2. Go to **labs.nello.gg**, watch the walkthrough, copy the install prompt
3. Open an empty folder in VS Code and paste the prompt into Claude Code (Plan Mode)
4. Answer the interview - identity, business, and a couple of keys (Composio, Telegram, Exa)
5. Wait ~15 minutes while it builds
6. Send a message to your Telegram bot, or open http://localhost:3000

## For contributors

```bash
git clone https://github.com/Matthew-Lee-Nello/nello-claw.git
cd nello-claw
pnpm install
pnpm -r build
```

Run the wizard locally:

```bash
pnpm dev:web
# opens http://localhost:3939
```

Run a local end-to-end install test:

```bash
# Create a test bundle
cat > /tmp/test-bundle.json <<'EOF'
{
  "name": "Test User",
  "assistantName": "Ada",
  "timezone": "UTC",
  "values": [],
  "communicationStyle": "blunt",
  "language": "US",
  "role": "Dev",
  "company": "Acme",
  "projects": [],
  "teamMembers": [],
  "clients": [],
  "mentors": [],
  "vaultPreset": "para",
  "graphifyEnabled": false,
  "emDashPolicy": "never",
  "oxfordComma": false,
  "bannedWords": [],
  "enableHumanizer": false,
  "enableKarpathyGuidelines": true,
  "enableAiHumanizer": false,
  "keys": { "TELEGRAM_BOT_TOKEN": "dummy", "ALLOWED_CHAT_ID": "0" },
  "mcps": {},
  "installTelegram": false,
  "installDashboard": true,
  "installLaunchAgent": false,
  "enableMorningBrief": false,
  "morningBriefPrompt": "",
  "morningBriefCron": "0 9 * * *",
  "voiceSource": "off",
  "skillPack": ["karpathy-guidelines", "find-skills"],
  "optionalSkills": [],
  "tools": [],
  "frameworks": [],
  "services": [],
  "targetCustomer": "",
  "industry": "",
  "vaultPath": "",
  "location": ""
}
EOF

# Run bootstrap against the test bundle into a temp dir
NC_INSTALL_PATH=/tmp/nello-claw-test NC_BUNDLE=/tmp/test-bundle.json \
  node template/bootstrap.js
```

## Deploying

Web: `cd web && vercel --prod`
Template: tag the repo. The paste-prompt clones it; pin a tag for production installs.
