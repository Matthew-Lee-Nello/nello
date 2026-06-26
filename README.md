# nello

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

## Updating an existing install

Already installed and want the latest? Go to `labs.nello.gg/update` and paste the prompt, or just say `/update` to your assistant. It pulls the newest `main`, rebuilds, refreshes the persona + skills, and migrates an old Google-OAuth setup onto the Composio Tool Router - vault, memory and identity all preserved, no re-interview. Full detail in [UPDATE_GUIDE.md](UPDATE_GUIDE.md).

## Seed your company brain

Optional, and you run it when you're ready: `/build-brain` backfills your connected tools (Gmail, Calendar, Drive, Notion, CRM) into the Obsidian vault, archived and extracted into the taxonomy with wikilinks. Point it at an exported ChatGPT history (`/build-brain export <path>`) to fold that in too, or run `/build-brain aggregate` for just the connected tools. It uses OpenAI credit to embed, so it's a deliberate step, not an automatic one.

## Licence

MIT.
