# nello-claw

Hosted live-compile Brain Method setup for Skool members. One public website compiles a personalised Claude Code stack (Telegram bot + web dashboard + Obsidian vault + MCPs + skill pack + LaunchAgent) that a user installs on their Mac by pasting one prompt into Claude Code.

Product lives at `labs.nello.gg`.

## Repo Layout

- `web/` - Next.js 15 app. Hosted at labs.nello.gg. Marketing site + the one-prompt install handoff.
- `template/` - Monorepo of runtime packages + skills + hooks + vault presets. Cloned into the user's install folder, then `template/bootstrap.js` sets everything up.
- `docs/` - Architecture notes, contributor guide.

## Build

```
pnpm install
pnpm -r build
```

## Licence

MIT.
