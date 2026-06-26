# Changelog

All notable changes to Nello are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions are read from the `VERSION`
file and stamped into `.nello-version` on every install/update. When you run `/update`,
the assistant reads the section(s) between your old version and the new one and tells
you what changed.

## [1.1.0] - 2026-06

Reliability release. Fixes the brain carry-forward so an older install actually moves
onto the OpenAI memory when you `/update`, ends every update with a clear Telegram
message, and stops auto-fetch from quietly running up an OpenAI bill.

### Added
- **Self-healing updates.** Updates can no longer get stuck. If you'd changed a file Nello
  manages, the update safely sets your edit aside, moves to the latest version, and if
  anything fails it rolls itself back to your last working version - nothing is lost. Your
  own skills and settings live in a private layer that every update preserves.
- **Weekly auto-update (on by default).** Nello checks for and applies updates once a week
  on its own, with the same rollback safety, and Telegrams you the result. Turn it off any
  time by setting `enableAutoUpdate` to false.
- **Update message on Telegram.** Every `/update` now finishes with a plain-English note:
  what changed, the one thing you need to do (usually nothing), and a reminder that your
  notes and memory are untouched.
- **`nello doctor --deep`.** One command checks the things that actually break - is the
  memory on OpenAI, is any scheduled task running too often - and tells you how to fix it.
- **`nello autofetch on|off`.** Turn the every-20-minute email check on or off whenever
  you want.

### Changed
- **Your memory now upgrades itself on `/update`.** Older installs are asked for an
  OpenAI key (if they don't have one) and the memory rebuilds on the new model. Before,
  an old install could finish updating with its memory silently switched off.
- **Auto-fetch is cheaper and tidier.** Filing your email into memory no longer re-scans
  everything each time, repeat emails are no longer re-saved, and a stuck task now pauses
  itself instead of running forever.

### Migrations (run automatically on `/update`)
- `0002` re-embeds the brain on OpenAI **safely** - it never wipes a working memory it
  can't rebuild. If no OpenAI key is set yet, your current memory keeps working and the
  rebuild happens automatically once you add the key.

### Caveats
- **The brain runs on OpenAI.** If you want memory on, Nello asks for your `OPENAI_API_KEY`
  during `/update` (one paste, from platform.openai.com). Without it, memory stays off and
  everything else still works.
- **Auto-fetch uses a little OpenAI credit.** Checking your email every ~20 minutes and
  filing it into memory costs a small amount. It stays on by default; run
  `nello autofetch off` any time to stop it.
- **Weekly auto-update is on by default.** Nello updates itself once a week (with rollback
  if anything fails). To stay fully manual, set `enableAutoUpdate` to false in your bundle.

[1.1.0]: https://github.com/Matthew-Lee-Nello/nello/releases/tag/v1.1.0

## [1.0.0] - 2026-06

The Nello release. Your assistant is now **Nello**, your AI Chief Operating Officer.

### Added
- **RTK token-saver** is installed and wired on every install - it trims dev-command
  output so the assistant burns far fewer tokens on routine work. Runs locally; your
  data never leaves your machine.
- **Versioned releases.** `/update` now tells you the version you were on, the version
  you moved to, and what changed (this file).

### Changed
- **Rebrand to Nello.** The assistant is named Nello on every install, positioned as
  your AI Chief Operating Officer. The website, onboarding and persona all lead with it.
- **GPT brain.** Semantic recall now embeds with OpenAI `text-embedding-3-small` instead
  of Voyage - cheaper, faster, and one fewer key to source. Set `OPENAI_API_KEY` to turn
  recall on (it stays off without one, exactly as before).
- **Telegram only.** WhatsApp is retired - it never linked reliably. Everything runs on
  Telegram. A WhatsApp install is moved over automatically; run `/connect-telegram` to
  pair the bot.
- **Slimmer dashboard.** `localhost:3000` is now a focused control panel - two tabs,
  **Scheduled Tasks** and **Monitor**. Chat lives in Telegram; your notes live in the
  vault.
- **Renamed internals** to Nello (the package namespace, the background-service name
  `com.nello.server`, the `nello` CLI, the default install folder `~/nello`).

### Migrations (run automatically on `/update`)
- `0002` re-embeds the brain on OpenAI (the embedding dimension changed, so the old
  index is rebuilt). A large vault may need a one-off `/build-recall`.
- `0003` moves a WhatsApp install onto Telegram and clears the old WhatsApp settings.
- `0004` retires the old `com.nello-claw.server` background service so it can't clash
  with the new one.

### Caveats
- **Existing installs keep their folder.** Your install keeps running from wherever it
  is now; only new installs use `~/nello`. Nothing moves on disk, so nothing is at risk.
- If recall was on via Voyage and you have no `OPENAI_API_KEY`, recall stays off until
  you add one and run `/build-recall`.

[1.0.0]: https://github.com/Matthew-Lee-Nello/nello/releases/tag/v1.0.0
