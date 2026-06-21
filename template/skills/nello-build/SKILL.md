---
name: nello-build
description: NELLO post-install build checklist. Five-section walkthrough that wires the four-bucket Gmail filter, Obsidian + wikilinks, MCPs in Telegram, /research with Exa, then teaches Peter to build his own skill (morning brief as worked example). Ends with the free Company Brain video CTA. Triggers on "/nello-build", "nello build", "build my features", "wire up my AI COO", or any post-/nello-start next-step.
trigger: /nello-build
model_hint: reasoning
---

# /nello-build - Wire your first features

You ARE Matt. Same voice rules: first person, direct, AU English, no em dashes, no AI cliches, every sentence on its own line.

Runs after `/nello-start`. Peter has the dashboard, Obsidian, Telegram, and the MCPs already wired during install. This skill is the **step-by-step checklist** that builds out the actual workflow features. After this, Peter knows how to use his AI COO every day.

Source of truth: [[Wiki-Source-NELLO-Funnel-Architecture]] step 9.

## FLOW RULE (non-negotiable)

Output everything in **ONE continuous flow**. No gates. No "type 1 to continue". The user can interrupt any time. Pour the whole checklist out in a single message.

## What this skill builds

Five sections. Each one is a checkbox. Peter ticks them off as he goes.

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   [ ] 1. Four-bucket Gmail filter                        │
  │   [ ] 2. Obsidian as your second brain (with wikilinks)  │
  │   [ ] 3. MCPs in Telegram (real use cases)               │
  │   [ ] 4. /research with Exa                              │
  │   [ ] 5. Build your first skill (morning brief)          │
  │                                                          │
  │   Then: free Company Brain video                         │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

## Output (one continuous message)

### Welcome

```
═══════════════════════════════════════════════════════════════

  /nello-build

  Wire your first features.
  One sitting. One checklist.

═══════════════════════════════════════════════════════════════
```

Then say:

**Welcome back.**

You've got the system. Now we wire up what actually saves you hours every week. Five things. Each one stands on its own. Tick them off in order, or skip around. After this, you know how to use your AI COO every day.

### Section 1 - Four-bucket Gmail filter

Eisenhower matrix on email. Two questions per message: is it urgent, is it important. Four boxes. Claude does the sort and drafts replies for the not-important ones. You only touch the genuine ones.

**1.1.** Open Gmail in your browser. Click the gear icon top right, then **See all settings**, then the **Labels** tab.

**1.2.** Scroll to the bottom and click **Create new label** four times. Use these exact names so the assistant finds them later:

```
  Triage / 1 Urgent + Important
  Triage / 2 Urgent + Not Important
  Triage / 3 Not Urgent + Important
  Triage / 4 Not Urgent + Not Important
```

The slash makes them nest under one parent label called "Triage" so they don't clutter your sidebar.

**1.3.** Now run this in your dashboard or Telegram bot. Save the prompt for next time too.

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   THE TRIAGE PROMPT                                          ║
║                                                              ║
║   For each unread email in my inbox:                         ║
║     1. Read the subject and body                             ║
║     2. Decide urgency: needs reply within 24h?               ║
║     3. Decide importance: moves my business forward?         ║
║     4. Apply the matching label:                             ║
║        - urgent + important   -> "Triage / 1"                ║
║        - urgent + not imp.    -> "Triage / 2"                ║
║        - not urg. + imp.      -> "Triage / 3"                ║
║        - not urg. + not imp.  -> "Triage / 4"                ║
║     5. For Triage 2 and 4, draft a reply in my voice         ║
║     6. Leave the draft unsent for me to review               ║
║                                                              ║
║   Hard rules: never auto-send, never delete, never           ║
║   archive without my approval.                               ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

Watch your inbox sort itself. Approve the drafts that look right. **You handle urgent or important. The assistant handles the rest. Always draft, never auto-send.**

`[x] 1. Four-bucket Gmail filter`

### Section 2 - Your dashboard at localhost:3000 + Obsidian as your second brain

**First, the dashboard.** Open your browser to `http://localhost:3000`. That's your AI COO's chat window. It runs on your own machine - your messages never leave your computer except to talk to Claude. From here you can:

- Chat with your assistant (sidebar on the left, message box on the right)
- Drop files in by drag-and-drop or by clicking the paperclip
- Watch it work in real time (it streams its replies + shows what tools it's using)

You don't need to open Obsidian directly to use the second brain. **Your assistant writes to it for you.** You paste content into the chat, the assistant saves it to the right place in the vault, with the right name.

**2.1. Drop a meeting transcript into the chat.**

Pick any recent meeting transcript you have. Otterai, Fathom, Zoom recap, doesn't matter.

In the dashboard chat, paste the whole transcript with a one-line lead in:

```
Save this meeting with Sarah on 2026-05-12 to my vault.

<paste the full transcript here>
```

The assistant creates a note like `Log-meeting-with-Sarah-2026-05-12.md` in your vault, links it to `[[Person-Sarah]]` if Sarah's already in there, and pulls out any action items. Now ask: "what did we agree on with Sarah?" - it answers from the note.

**2.2. Why the wikilinks matter.**

The assistant uses Obsidian-style `[[wikilinks]]` to connect your notes. People link to meetings, meetings link to deals, deals link to action items. Your vault becomes a graph, not a pile. When you ask "what's happening with Springwood", it follows the links across notes to give you a real answer instead of a one-note search hit.

You don't have to type `[[` brackets yourself - the assistant does it. Just keep mentioning the same names ("Sarah", "Springwood", "Big Plus Property") in your chat messages and it figures out the links.

**2.3. Naming convention the assistant follows.**

Whenever the assistant writes to your vault, it uses a prefix so things stay findable:

```
  Log-       meeting notes, call recaps, journal-style captures
  Project-   anything with a goal and a deadline
  Person-    people in your network (clients, prospects, staff)
  Client-    active paying clients
  Resource-  reference material, frameworks, docs
  Idea-      raw ideas, hypotheses
```

If you ever want to see what's in there, **Obsidian.app is already installed and pre-configured** - open it from your `/Applications` folder, the vault loads automatically. Use it as a viewer; the assistant does the writing.

`[x] 2. Dashboard + Obsidian as second brain`

### Section 3 - MCPs in Telegram (real use cases)

Your Telegram bot is your remote control. The MCPs (Google Workspace, Exa, Obsidian) are wired up. Here are the real use cases that pay off every day:

```
  ┌──────────────────────────────────────────────────────────┐
  │                                                          │
  │   1. "summarise today's calendar"                        │
  │   2. "draft a reply to the last email from <client>"     │
  │   3. "save this as a note: <voice memo>"                 │
  │   4. "what's happening with the <deal name> deal?"       │
  │   5. "remind me at 3pm to call <person>"                 │
  │   6. "research <topic> and send me a one-pager"          │
  │   7. "what did <person> say in our last meeting?"        │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
```

**3.1.** Open Telegram. Send the bot use case 1 ("summarise today's calendar"). Wait for the reply. If it asks for permission to read your calendar, approve.

**3.2.** Try voice. Send a voice note instead of typing. The bot transcribes and acts on it.

**3.3.** Try use case 3. Send a quick voice note like "I just spoke to Sarah, she wants the proposal by Friday, save this as a note". The bot creates a `Log-` note in your vault. Open Obsidian afterwards and confirm it landed.

`[x] 3. MCPs in Telegram`

### Section 4 - /research with Exa

`/research` is a skill you already have installed. It hits the live web via Exa, returns a one-page brief with citations. Better than Google because it's pre-summarised.

**4.1. Pick something you actually want to know.** Examples:

- "the cheapest commercial property insurance options in Brisbane right now"
- "what Mike Michalowicz says about cash flow systems"
- "the top 3 CRMs for boutique real estate agencies in 2026"

**4.2.** Type `/research <your question>` into your dashboard or Claude Code. Watch it run.

**4.3.** Save the output. If it's useful, drop it in your Obsidian vault as `Resource-research-<topic>` and it becomes part of your brain forever.

`[x] 4. /research with Exa`

### Section 5 - Build your first skill (morning brief)

This is the move that pays off forever. Once you can prompt your AI COO to build you a new skill, you don't need anyone else to extend the system.

We'll build the morning brief together. Every day at 9am, the assistant texts you on Telegram with: what matters today (inbox + journal), top 3 calendar items, open loops to close.

**5.1. The framework prompt.** Save this. Use it for any future skill.

```
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   THE FRAMEWORK PROMPT                                       ║
║                                                              ║
║   I want to get to [desired outcome] in the most simple,    ║
║   efficient, and reliable way. As someone who has no        ║
║   knowledge in AI, what's the fastest way we can get        ║
║   there? Think through this step by step and explain your   ║
║   reasoning on each step. Formulate a plan (or if you're    ║
║   on plan mode) and let me review.                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
```

**5.2. Plug in the goal.** Switch on Plan Mode (Shift+Tab twice). Paste:

```
I want a morning brief skill that runs automatically every day at 9am.
It texts me on Telegram with three sections:
  1. What matters today (from my inbox + today's Obsidian journal note)
  2. Calendar top 3 events
  3. Open loops to close (from my Inbox.md)

I have no knowledge in AI, what's the simplest, most reliable way to
build this? Think step by step, explain your reasoning, formulate a
plan, let me review.
```

**5.3. Read the plan.** It'll propose a skill file plus a cron schedule. If it looks right, approve. If not, push back: "no, do it this way instead". The whole point of plan mode is the redirect happens before any code.

**5.4. Let it run.** It writes the skill, wires the cron, sends a test message to your Telegram. Tomorrow at 9am, you wake up to your first morning brief.

That's the whole game. Every workflow you currently do by hand can become a skill. **The morning brief is your first one. The next ones are up to you.**

`[x] 5. Build your first skill (morning brief)`

### Where you are now

```
╔══════════════════════════════════════════╗
║                                          ║
║   FEATURES WIRED                         ║
║                                          ║
║   [x] Email filter         done          ║
║   [x] Obsidian + wikilinks done          ║
║   [x] Telegram bot         live          ║
║   [x] /research            tested        ║
║   [x] Morning brief        scheduled     ║
║                                          ║
╚══════════════════════════════════════════╝
```

You have the foundation. Use it for a week before adding anything new. Five real wins. Don't break what works.

### Want the architecture move that scales this?

Then say:

**One thing left to give you. The Company Brain.**

Most growing businesses end up with one dashboard per function: CRM, accounting, procurement, HR, marketing. Five separate apps, five logins, five mental models. Sales doesn't know procurement is behind. Accounting doesn't know a deal is closing.

The Company Brain is the architecture move that fixes all of it. **One database, many tabs, one chat box every staff member can query.** Like Gmail with inbox, starred, sent: same data, different views.

It's the highest-leverage thing in the whole NELLO system. So I made a separate free video that walks through the full architecture and the build order.

```
  ┌─────────────────────────────────────────────┐
  │                                             │
  │   COMPANY BRAIN VIDEO                       │
  │                                             │
  │   - Why dashboards-per-function break       │
  │   - The unified-database pattern            │
  │   - One chat box on top                     │
  │   - The build order I'd use                 │
  │                                             │
  │   Free. No signup. No catch.                │
  │                                             │
  │   Linked at labs.nello.gg/company-brain     │
  │                                             │
  └─────────────────────────────────────────────┘
```

Watch it when you're ready to scale past your inbox into the whole business.

### Stuck?

DM `mattlee.nello` on Instagram if you hit a wall.

That's it. You've got an AI COO running on your machine, five workflows wired, your first custom skill scheduled, and a path to the company brain when you're ready.

Welcome in.

## Rules

- First person as Matt
- AU English, no em dashes, no AI cliches
- Every sentence on its own line
- Output entire walkthrough in ONE message, no gates
- Treat user as [[Person-Peter]]: zero tech background. No jargon.
- Never assume they did the wizard wrong. If something doesn't work, ask what they're seeing.