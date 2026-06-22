---
name: auto-fetch
description: Walk every active MCP connection (Gmail, Calendar, Drive, Slack if connected) and fold new items into the vault with provenance + dedup. Use when triggered by the scheduled auto-fetch task every 20 minutes, or when user says "run auto-fetch", "fetch now", "pull new emails", "/auto-fetch". Reads each connection's per-source cursor, fetches new items since last tick, classifies via @nc/core dedup (skip unchanged, write new, overwrite updated), writes notes with @nc/vault-seeder provenance frontmatter into vault/Inbox/auto-fetch/<source>/<source_id>.md, and appends a one-line entry per item to vault/Inbox.md. Posts a one-line summary on completion.
model_hint: fast
---

# Auto-fetch

One global tick across every active connection. Runs on a 20-minute cron by default. Pulls only what changed since the last tick, dedupes by content, writes with provenance.

## Why this exists

The user shouldn't have to ask "what's new in my inbox?" - the system should already have read it, classified it, and dropped the highlights into the vault by the time they open it. This skill is the worker that walks the connections.

## When this fires

- Every 20 minutes (default) via the scheduled task registered at install. The task ID is whatever `nc-schedule list` returns for the prompt that starts with "Run /auto-fetch".
- On demand when the user says **"run auto-fetch"**, **"fetch now"**, **"pull new emails"**, **"/auto-fetch"**.
- The morning brief task may call this as its first step.

## The contract per tick

For each enabled MCP connection (decided at runtime — only fetch from what's actually wired):

### 1. Determine the cursor

Read the last `fetched_at` for this source from the dedup index (`@nc/core` `getSeen` — most recent for source). If none, default to "last 24 hours" for first run, otherwise "since last cursor".

### 2. Fetch new items

| Source | MCP tool | Query |
|---|---|---|
| `gmail` | `mcp__google_workspace__search_gmail_messages` | `after:<cursor>` |
| `calendar` | `mcp__google_workspace__list_events` | `timeMin=<cursor>` |
| `drive` | `mcp__google_workspace__list_drive_items` | filter by `modifiedTime>=<cursor>` |
| `slack` (if connected) | the connected slack MCP | `oldest=<cursor>` |

Cap each source at 50 items per tick. If a source has more, stop at 50 and log "Truncated at 50 items, will catch up next tick."

### 3. Dedup-classify each item

For each item, build a stable `source_id` and a `content` string (the body the agent will store), then:

```js
import { classify, markSeen } from '@nc/core'
const { verdict, hash, previous } = classify(source, source_id, content)
```

- `verdict === 'unchanged'` → skip, do not write, do not count.
- `verdict === 'new'` → run triage (step 3b), then act on the triage verdict (step 4).
- `verdict === 'updated'` → run triage (step 3b), then act on the triage verdict; if writing, overwrite at `previous.vault_path`.

### 3b. Triage each new/updated item

Invoke `/triage` on the item (cheap fast-model classifier). It returns one of `drop | ack | react | escalate`:

- `drop` → call `markSeen({ source, source_id, content_hash: hash, vault_path: null })` but write nothing. Increment the "dropped" counter, move on.
- `ack` → write the note (step 4) but skip the `Inbox.md` append (step 5). User can find it via search if they need it.
- `react` → write the note + append the `Inbox.md` line. This is the default.
- `escalate` → write the note + append `Inbox.md` line + send a one-line Telegram message via the bot (use the existing send-message MCP if available, or write a flagged entry to `Inbox.md` prefixed `**ESCALATE** —` so the user notices on next open).

Pass the triage verdict back to the user's final summary line so they can see the distribution.

### 4. Write the note

```js
import { noteWithProvenance } from '@nc/vault-seeder'
const body = noteWithProvenance({
  source, source_id, toolkit, scope, time_range, fetched_at, content_hash: hash,
  // extras as needed: sender, subject, channel, etc.
}, content)
```

Path: `vault/Inbox/auto-fetch/<source>/<source_id>.md`. Create directories as needed.

### 5. Append to Inbox.md

For each new/updated item, append a single line to `vault/Inbox.md`:

```
- [HH:MM] <source>: <one-line summary> → [[Inbox/auto-fetch/<source>/<source_id>]]
```

Order matters: oldest item first within a tick. Don't rewrite existing lines.

## Output

When the whole tick completes, reply with exactly one line to the chat:

```
Auto-fetch: <N> new, <M> updated, <S> skipped (dropped <D>, acked <A>, reacted <R>, escalated <E>) across <K> sources.
```

No preamble. No multi-line summary. The vault is the artefact — the chat just confirms.

## Rules

- **Never fetch more than 50 items per source per tick.** Truncation is fine — next tick will catch up.
- **Never overwrite a vault note the user has hand-edited.** If the dedup index says we wrote it but the file's mtime is later than the recorded `written_at`, treat as user-modified, log a warning, skip.
- **Never write into `vault/Memory/`, `vault/Journal/`, or root-level non-Inbox files.** Auto-fetch owns `vault/Inbox/auto-fetch/<source>/` and the per-line Inbox.md append. Nothing else.
- **Never write into `vault/notes/` either** — that's reserved for user-typed hand notes that other systems may auto-ingest.
- **Fail gracefully.** If an MCP is down, log it, skip the source, continue with the rest. Never let one broken connector kill the whole tick.
- **Don't spam the chat.** One line per tick, period.
