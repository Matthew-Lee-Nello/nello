# Changelog

All notable changes to Nello are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/); versions are read from the `VERSION`
file and stamped into `.nello-version` on every install/update. When you run `/update`,
the assistant reads the section(s) between your old version and the new one and tells
you what changed.

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
