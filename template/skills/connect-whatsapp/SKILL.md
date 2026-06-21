---
name: connect-whatsapp
description: Link WhatsApp to this install on the user's OWN number, using the "Message Yourself" self-chat as the assistant console. Runs a one-shot linker that renders the pairing QR as an image INSIDE this chat so the user scans it on the spot (Linked Devices -> Link a Device), auto-captures their number, then restarts the daemon and confirms with a test self-message. Also the way to SWITCH from Telegram to WhatsApp. Use when the user says "/connect-whatsapp", "connect whatsapp", "link whatsapp", "set up whatsapp", "switch to whatsapp", "use whatsapp instead", "whatsapp isn't working", "scan the whatsapp qr", "show me the qr".
trigger: /connect-whatsapp
model_hint: reasoning
---

# /connect-whatsapp - link WhatsApp by scanning a QR right here

One job: link this install to the user's WhatsApp on their own number and make the "Message Yourself" self-chat the assistant console. The QR shows up **as an image in this chat** - the user scans it with their phone and they're connected. Their number is captured automatically; they never type it.

## Prime directives (read before doing anything)

- **Run everything from the install folder** - the one with `.env`, `template/` and `store/`. Confirm first (`pwd`, `ls -A`). If it is not an install folder, stop and ask the user to `cd` into theirs.
- **Only one WhatsApp socket at a time.** The daemon and the linker both use `.wa-session`; two sockets corrupt the auth and trip WhatsApp's throttle. So the order is hard: **stop the daemon -> run the linker -> wait for it to finish -> start the daemon.** Never start the daemon while the linker is still alive.
- **Never hammer the link.** If WhatsApp refuses (the linker prints `LINK_401`), that is its anti-abuse throttle from repeated attempts. **Wait** - a few minutes first, longer if it keeps refusing. Do not re-run in a tight loop; that deepens the throttle.
- **Owner-locked.** WhatsApp runs on the user's own number; their "Message Yourself" self-chat is the only surface the bot reads or replies on. Nobody else can command it.

## Setup (resolve once)

- `INSTALL` = the install folder (`.env`, `template/`, `store/`, `node_modules/`).
- The linker is `INSTALL/template/packages/bot-whatsapp/dist/link.js` (built by `pnpm -r build`; if it is missing, run the build first).
- The daemon LaunchAgent label is `com.nello-claw.server`.

## The flow

1. **Confirm the folder + the build.** `pwd`; `ls -A` shows `.env`, `template/`, `store/`. Check the linker exists: `ls template/packages/bot-whatsapp/dist/link.js`. If missing, `pnpm -r build` first.

2. **Set the channel to WhatsApp** (this also handles switching off Telegram). In `.env`: set `MESSAGING_CHANNEL=whatsapp` (replace the line if present, else add it), and clear any Telegram lines so the daemon can't run two channels - blank out `TELEGRAM_BOT_TOKEN=` and `ALLOWED_CHAT_ID=`. Leave `WHATSAPP_OWNER_NUMBER` alone; the linker fills it.

3. **Stop the daemon** so the linker owns `.wa-session` alone:
   - Mac: `launchctl bootout gui/$(id -u)/com.nello-claw.server 2>/dev/null || true`
   - Linux: `systemctl --user stop com.nello-claw.server`
   - Windows: `schtasks /End /TN "com.nello-claw.server"`
   (On a first-ever link the daemon holds no WhatsApp socket yet, so this is a safe no-op.)

4. **Run the linker in the background**, teeing its output to a log you can poll:
   ```bash
   NC_INSTALL_PATH="$(pwd)" node template/packages/bot-whatsapp/dist/link.js > store/wa-link.log 2>&1 &
   ```
   (Use the Bash tool's background mode. The linker prints one-line sentinels to that log.)

5. **Show the QR in this chat.** Poll `store/wa-link.log` for a line `LINK_QR_READY <png-path> <ts>`. When it appears, **Read the PNG at `<png-path>`** (it is `INSTALL/store/link-qr.png`) so it renders inline here. Tell the user: *"On your phone: WhatsApp -> Settings -> Linked Devices -> Link a Device -> point the camera at this code."*

6. **Re-show on rotation.** The QR refreshes about every 20 seconds; each refresh writes a new `LINK_QR_READY` line with a newer `<ts>` and overwrites the same PNG. Each time you see a newer `<ts>`, Read the PNG again and say "here's a fresh code, scan this one". Keep going until you see `LINK_SUCCESS` or a terminal line.
   - If `LINK_SUCCESS` arrives with **no** QR ever shown, the device was already linked - skip the scan step.

7. **Confirm the link.** Poll for `LINK_SUCCESS <number>`. Read back the captured number and verify it landed: `grep WHATSAPP_OWNER_NUMBER .env`.

8. **Restart the daemon** so it boots the WhatsApp bot with the new number + saved creds:
   - Mac: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.nello-claw.server.plist`
   - Linux: `systemctl --user start com.nello-claw.server`
   - Windows: `schtasks /Run /TN "com.nello-claw.server"`

9. **Verify it actually works.** Wait ~10s, then tail `store/server.log` for `whatsapp connected` (and no repeating `Connection Failure`). Ask the user to send themselves a one-word message ("ping") in the WhatsApp self-chat. Confirm: a reply comes back, with no visible junk character, and the log shows exactly one turn - no echo loop. Done.

## When it doesn't link

**The linker ALWAYS exits on exactly one terminal sentinel: `LINK_SUCCESS`, `LINK_401`, `LINK_TIMEOUT`, `LINK_CLOSED`, or `LINK_FAIL`. Whichever one you see, step 8 (restart the daemon) is MANDATORY before you finish this skill - treat it as a finally-step. The worst outcome is leaving the user with their daemon down and no way to message their assistant, so never end your turn after stopping the daemon without restarting it.**

- **`LINK_401`** (WhatsApp refused): the throttle. Restart the daemon, then tell the user to wait - a few minutes first, longer if it repeats - before trying again. Offer the pairing-code path: re-run with `node template/packages/bot-whatsapp/dist/link.js --pair <their-number-in-international-digits>`, relay the `LINK_PAIR_CODE` it prints, and have them enter it under "Link with phone number instead".
- **`LINK_TIMEOUT`** (no scan in 2 min): the linker exited cleanly. Restart the daemon and offer to run it again when they're ready with their phone.
- **`LINK_CLOSED <code>`** (closed for another reason): restart the daemon, report the code, and retry once after a short wait.
- **`LINK_FAIL <msg>`**: restart the daemon, report the message, retry once.
- **Stale/invalid creds** (link keeps closing / `LINK_401` on an already-linked number): with the user's OK, clear the session - `rm -rf .wa-session` - then run the linker again for a fresh QR. Restart the daemon afterwards either way.

## Rules

- Stop the daemon before linking, restart it after - on EVERY branch, success or failure. Never end your turn with the daemon stopped.
- One WhatsApp socket at a time. Wait for a terminal sentinel before restarting.
- Don't hammer the link on `LINK_401`; wait it out.
- Australian English, no em dashes, be specific.
