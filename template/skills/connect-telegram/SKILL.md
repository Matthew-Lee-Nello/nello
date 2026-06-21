---
name: connect-telegram
description: Set this install up on Telegram, or switch it from WhatsApp to Telegram. Collects the bot token, makes Telegram the active channel, restarts the daemon, and the first message the user sends the bot captures their chat ID automatically (the owner lock). Use when the user says "/connect-telegram", "connect telegram", "set up telegram", "switch to telegram", "use telegram instead", "go back to telegram".
trigger: /connect-telegram
model_hint: reasoning
---

# /connect-telegram - run the assistant on Telegram

One job: make Telegram the messaging channel for this install. If they were on WhatsApp, this switches them over. The user creates a bot with @BotFather, pastes the token once, and the first message they send the bot locks it to them.

## Prime directives

- **Run everything from the install folder** (`.env`, `template/`, `store/`). Confirm first (`pwd`, `ls -A`). If it is not an install folder, stop and ask the user to `cd` into theirs.
- **The bot must end up owner-locked.** A Telegram bot with a token but no `ALLOWED_CHAT_ID` is unlocked - anyone who messages it owns the assistant. We rely on discovery (first-message-wins) to set the lock right after restart, so the daemon MUST be restarted with the token set and the lock empty so discovery runs.
- **One channel at a time.** Setting Telegram clears the WhatsApp number so the daemon doesn't try to run both.

## The flow

1. **Confirm the folder.** `pwd`; `ls -A` shows `.env`, `template/`, `store/`.

2. **Get the bot token.** Ask the user to open Telegram, message **@BotFather**, send `/newbot`, follow the prompts, and copy the token it gives back (looks like `123456789:AAH...`). Validate it matches `^\d+:[A-Za-z0-9_-]{30,}$` before continuing.

3. **Set Telegram as the channel** in `.env`:
   - `MESSAGING_CHANNEL=telegram` (replace the line if present, else add it)
   - `TELEGRAM_BOT_TOKEN=<their token>`
   - `ALLOWED_CHAT_ID=` (leave it **empty** - discovery fills it on the first message)
   - `WHATSAPP_OWNER_NUMBER=` (clear it so WhatsApp doesn't also start)

4. **Restart the daemon:**
   - Mac: `launchctl kickstart -k gui/$(id -u)/com.nello-claw.server`
   - Linux: `systemctl --user restart com.nello-claw.server`
   - Windows: `schtasks /End /TN "com.nello-claw.server" & schtasks /Run /TN "com.nello-claw.server"`

5. **Capture the owner lock.** Tell the user to open their new bot in Telegram and send it any message (e.g. "hi"). The daemon is in discovery mode: it grabs that chat's ID, writes `ALLOWED_CHAT_ID` to `.env`, replies to confirm, and **restarts itself** to load the lock. Wait ~15s, then verify: `grep ALLOWED_CHAT_ID .env` shows a number.

6. **Verify it works.** Ask the user to send one more message; confirm the assistant replies. Tail `store/server.log` for `Telegram bot polling`. Done.

## Rules

- Never leave a token set with an empty lock and the daemon NOT restarted - that's the unlocked window. Always restart so discovery runs.
- If discovery times out (no message in 30 min), the bot stays disabled; just have the user message it and restart again.
- Australian English, no em dashes, be specific.
