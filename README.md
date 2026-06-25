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

## Updating an existing install

Already installed and want the latest? Go to `labs.nello.gg/update` and paste the prompt, or just say `/update` to your assistant. It pulls the newest `main`, rebuilds, refreshes the persona + skills, and migrates an old Google-OAuth setup onto the Composio Tool Router - vault, memory and identity all preserved, no re-interview. Full detail in [UPDATE_GUIDE.md](UPDATE_GUIDE.md).

## Seed your company brain

After install, `/build-brain` imports your exported ChatGPT history and backfills your connected tools (Gmail, Calendar, Drive, Notion, CRM) into the Obsidian vault - archived + extracted into the taxonomy with wikilinks.

## Licence

MIT.
