# Your setup, in plain English

This is the simple tour of what you've got and how to keep it current. No jargon. If you ever want the deep technical version, that lives in [INSTALL_GUIDE.md](INSTALL_GUIDE.md) and [UPDATE_GUIDE.md](UPDATE_GUIDE.md).

---

## What you've got

Think of it as one assistant with a few moving parts. They all sit on your own computer. Nothing here lives on someone else's server.

**The background helper.** An always-on helper that runs quietly behind the scenes. It's the engine: it's what makes your assistant reply, remember things, and run jobs on a schedule. It starts itself when you turn your computer on, so you never have to launch it.

**Your phone chat.** You talk to your assistant from your phone, through Telegram. Send it a message, it answers. That's the everyday way you use it.

**The dashboard.** A private web page on your own machine. Open it in your browser at a local address. It's a second place to chat and a window into what's running. It's locked to your computer with a key, so only you can open it.

**Your notes.** A folder of notes your assistant keeps for you: people, projects, clients, decisions, and a daily journal. You can open it in Obsidian and read or edit it yourself any time. These are plain files on your computer. They're yours to keep.

**The memory.** Your assistant remembers past chats and the facts that matter, so you're not repeating yourself. It's stored privately on your machine.

**The app connector.** One secure link that lets your assistant use your apps: Gmail, Calendar, Drive, Slack, Notion, and a lot more. You connect each app once with a single click, then your assistant can read and send through it. It can't delete anything, by design.

**The skills.** Ready-made jobs you can ask for by name. A few you'll use:
- `/update` gets you the latest version
- `/build-brain` pulls your history into your notes
- `/connect-telegram` sets up (or re-pairs) your phone chat
- `/install-doctor` checks everything's healthy

**Comes back on its own.** After a restart or a power-off, all of this starts itself again. You don't relaunch anything.

---

## How to update

When there's a new version, here's the whole job:

1. Open Claude Code in your install folder (the one with your notes).
2. Either type `/update`, or go to **labs.nello.gg/update** and paste the prompt it gives you.
3. Your assistant shows you a plan first, checks with you before anything risky, then backs up your stuff, pulls the latest, rebuilds, and restarts itself.

**What stays:** everything personal. Your notes, your memory, your journal, your answers from setup. You never set up again.

**If something looks off** mid-update, your assistant stops and tells you instead of guessing.

Want the full step-by-step with the safety net (how it backs up and how it rolls back if a step fails)? That's in [UPDATE_GUIDE.md](UPDATE_GUIDE.md).

---

## Quick checks

- **"Am I on the latest?"** Ask your assistant that, or run `/install-doctor`.
- **Something not replying?** Run `/install-doctor`. It tells you what's running, what's stuck, and what to do.
- **Telegram stopped texting you?** Say `/connect-telegram` and follow along to re-pair it.
