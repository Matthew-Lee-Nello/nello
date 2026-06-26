---
name: nello-start
description: NELLO post-install welcome + tour. Runs after the install finishes and the AI COO is live. Confirms what's running on the user's machine (dashboard, Obsidian, Telegram, MCPs), introduces the framework prompt, hands off to /nello-build. Triggers on "/nello-start", "nello start", "start nello onboarding", or any first-run "what now" after install.
trigger: /nello-start
model_hint: fast
---

# /nello-start - Welcome to your AI COO

You ARE the user's own assistant. Speak in first person as the assistant identity defined in `CLAUDE.md` (the user's own name, voice and persona) - never as Matt or any NELLO staff member. Follow the voice rules in `CLAUDE.md`: direct, the user's chosen language and style, no em dashes, no AI cliches, every sentence on its own line.

This skill runs **after** the install has finished and the AI COO is live. They already have the dashboard, Obsidian, Telegram, and the MCPs wired - all collected conversationally during the Claude Code install interview. Connecting an app (Gmail, Calendar, etc.) is one Composio click: the assistant mints a connect link when they ask, they click Allow, done. Show them that the first time they need it.

## FLOW RULE (non-negotiable)

Output everything in **ONE continuous flow**. No "type 1 to continue" gates. No "ready to move on?" pauses. The user can interrupt at any time. Pour out the welcome and the tour in a single message.

## What to output

### Welcome screen

```
═══════════════════════════════════════════════════════════════

  ███╗   ██╗███████╗██╗     ██╗      ██████╗
  ████╗  ██║██╔════╝██║     ██║     ██╔═══██╗
  ██╔██╗ ██║█████╗  ██║     ██║     ██║   ██║
  ██║╚██╗██║██╔══╝  ██║     ██║     ██║   ██║
  ██║ ╚████║███████╗███████╗███████╗╚██████╔╝
  ╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝ ╚═════╝

  YOUR AI COO IS LIVE

═══════════════════════════════════════════════════════════════
```

Then **before anything else**, lock in the one rule that runs everything from here:

```
═══════════════════════════════════════════════════════════════

   ██╗███████╗    ██╗   ██╗ ██████╗ ██╗   ██╗
   ██║██╔════╝    ╚██╗ ██╔╝██╔═══██╗██║   ██║
   ██║█████╗       ╚████╔╝ ██║   ██║██║   ██║
   ██║██╔══╝        ╚██╔╝  ██║   ██║██║   ██║
   ██║██║            ██║   ╚██████╔╝╚██████╔╝
   ╚═╝╚═╝            ╚═╝    ╚═════╝  ╚═════╝

   DON'T KNOW WHAT TO DO?  ASK CLAUDE.

   THAT'S HOW YOU TRAIN YOUR AI MUSCLE.

═══════════════════════════════════════════════════════════════
```

Stuck? Ask. Confused? Ask. Don't know which slash command? Ask. Don't know what the bot can do? Ask. Every time you ask, you learn faster and you stop relying on me.

**Here's by far the biggest cheatcode.**

Want your agent to learn ANYTHING?

```
  /find-skill [thing you want the agent to do]
```

It searches the open skills ecosystem, vets the candidate against a red-flag checklist (no curl-to-unknown, no credential reads, no obfuscated code), and only installs if it passes. Try it once today. You'll never wonder "can my AI do X" again - you'll just ask it to find a skill.

Then say:

**Welcome.**

**You did the hardest part already.** You watched the video, got the keys, ran the install, answered the interview. While you were doing all that, your machine quietly turned itself into Nello - your AI Chief Operating Officer.

Right now, on your computer:

- A **Telegram bot** is alive. The bot you set up in step 2 - that's where you talk to Nello, day to day. Try sending it a message right now and watch it reply.
- A **control panel** is running at `localhost:3000`. Two tabs: **Scheduled Tasks** (set up recurring jobs) and **Monitor** (is everything healthy). You chat with Nello on Telegram, not here.
- **Obsidian.app** is installed with the NELLO vault preset. That's Nello's long-term memory.
- **Gmail, Drive, Docs, Sheets, Calendar** are one click from connected. Say "connect my Gmail" and click the link Nello hands you - then it can read, send and create across all of them.
- **Live web research** is wired up via Exa.
- **RTK** is installed - a token saver that quietly trims command output so Nello does more work for less. It runs on your machine; none of your data leaves it.
- A **LaunchAgent** keeps Nello running on your computer. As long as your computer is on, Nello is on.

### What each piece does, in plain English

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   DASHBOARD (localhost:3000)                             │
  │     Your control panel: scheduled tasks + health.       │
  │     You chat with Nello on Telegram, not here.          │
  │                                                          │
  │   OBSIDIAN VAULT                                         │
  │     The brain. Notes, transcripts, decisions, voice.    │
  │     Your AI reads it before answering anything.         │
  │                                                          │
  │   TELEGRAM BOT                                           │
  │     The remote control. Text it from anywhere.          │
  │     Voice notes work too.                                │
  │                                                          │
  │   GMAIL + GOOGLE WORKSPACE                               │
  │     Your AI now has read + write on everything Google.  │
  │     Drafts replies, schedules calendar, files docs.     │
  │                                                          │
  │   /research (EXA)                                        │
  │     Live web research. Like a Google search but the     │
  │     answer comes back as a one-page brief.              │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

### The one prompt that runs your whole AI life

Save this. Use it any time you don't know what to say.

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   THE FRAMEWORK PROMPT                                       ║
║                                                              ║
║   I want to get to [desired outcome] in the most simple,    ║
║   efficient, and reliable way. As someone who has no        ║
║   knowledge in AI, what's the fastest way we can get there? ║
║   Think through this step by step and explain your          ║
║   reasoning on each step. Formulate a plan (or if you're    ║
║   on plan mode) and let me review.                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Plug in any goal. Get a plan back. Approve. Walk away while it runs.

### Your slash commands (the shortcuts your AI knows)

Slash commands are pre-built workflows your AI already knows how to run. You type `/`, pick one from the menu, and it goes. Run them in Claude Code in your terminal, or message your Telegram bot.

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   /nello-start    this welcome tour                      │
  │   /nello-build    wire your first features (next step)   │
  │   /build-brain    seed your brain from ChatGPT + tools   │
  │   /research       live web research with Exa             │
  │   /install-doctor sanity check what's running            │
  │   /find-skill     find + vet + install any new skill     │
  │   /diagnose       fix something that's broken            │
  │   /grill-me       stress-test a plan or decision         │
  │   /to-prd         turn a conversation into a PRD         │
  │   /write-skill    build a brand new slash command        │
  │   /zoom-out       step back from the weeds               │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

**How to use them:**

1. In **Claude Code** (the terminal app), just type `/` and the menu opens. Pick one, hit enter, it runs.
2. On **Telegram**, message your bot in plain English (or run a command by name, e.g. "run nello-build").
3. **If a slash command doesn't show up** in Claude Code, start a new chat. Claude Code reloads its skills list per session. If it still doesn't show, just ask Claude to run it by name ("run nello-build").

**If Telegram ever stops texting you:** say **`/connect-telegram`** - it walks you through making a bot with @BotFather, pasting the token, and re-pairing your chat in under a minute.

**You can write your own slash commands too.** That's what `/write-skill` is for. We'll do that together at the end of `/nello-build`.

### Try one of these right now

First connect your Google apps: say "connect my Gmail and Calendar", click the link your assistant gives you, hit Allow. Ten seconds. Then pick one, copy it, and send it to your Telegram bot (or run it in Claude Code). Feel the system work before you go any further.

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   1. "What do I need to know from the last 12 hours?"    │
  │      (reads inbox + calendar, hands back a tight brief)  │
  │                                                          │
  │   2. "What's on my calendar today and tomorrow?"         │
  │      (your AI now sees your Google Calendar)             │
  │                                                          │
  │   3. "Catch me up on my unread emails. Group by sender." │
  │      (skim 50 emails in 10 seconds, prioritised)         │
  │                                                          │
  │   4. "Just chat. Tell me what you can do for me."        │
  │      (no goal. Let the agent walk you around its tools)  │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

Try one. That's the value moment. Everything from here is just adding leverage on top of it.

### Quick check before we move on

Open your browser to `localhost:3000`. If the dashboard is up, you're set.

Open Telegram. Message your bot. If it replies, you're set.

If either one isn't working, tell me what you're seeing and I'll fix it.

### What's next

You have the system. Now we wire up the first features that actually save you hours.

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   NEXT: /nello-build                                     │
  │                                                          │
  │   Wires up your first four high-leverage features:       │
  │                                                          │
  │   1. Four-bucket Gmail filter                            │
  │   2. Obsidian as your second brain                       │
  │   3. MCPs in Telegram (real use cases)                   │
  │   4. /research with Exa                                  │
  │                                                          │
  │   Then we teach you to build your own skills.            │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

**Type `/nello-build` when you're ready.**

## Rules

- First person as the assistant defined in CLAUDE.md (never as Matt or NELLO staff)
- The user's chosen language, no em dashes, no AI cliches
- Every sentence on its own line
- Output the entire welcome in ONE message, no gates
- Treat the user as a non-technical business owner - zero tech background. No jargon.
- Telegram + keys were collected during the install interview - don't re-do that. App connections (Gmail etc.) happen here via one-click Composio links; walk them through "connect my Gmail" when they need it.
- The ASCII NELLO logo MUST render with consistent character width