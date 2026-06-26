---
name: auto-fetch
description: Walk every active MCP connection (Gmail, Calendar, Drive, Slack if connected), fetch only what's new since the last tick, triage each item, and hand the batch to `nello autofetch-write` which deduplicates, writes notes with provenance, and records them seen — in code, atomically. Use when triggered by the scheduled auto-fetch task every 20 minutes, or when the user says "run auto-fetch", "fetch now", "pull new emails", "/auto-fetch". Posts a one-line summary on completion.
model_hint: fast
---

# Auto-fetch

One global tick across every active connection. Runs on a 20-minute cron by default. Pulls only what changed since the last tick.

**You fetch and triage. Code does the rest.** Dedup classification, writing notes with provenance, the Inbox.md append, and recording items as seen are all done deterministically by `nello autofetch-write` — you never call `classify`/`markSeen` or write auto-fetch notes by hand. This is deliberate: a missed `markSeen` used to re-scrape and re-embed the same email every tick and run up the OpenAI bill. The gate is in code now so that can't happen.

## When this fires

- Every 20 minutes (default) via the scheduled task. The task is whatever `nello autofetch status` reports.
- On demand: **"run auto-fetch"**, **"fetch now"**, **"pull new emails"**, **"/auto-fetch"**.
- The morning brief may call this as its first step.

## The tick

### 1. Per source, get the cursor and fetch only what's new

For each enabled MCP connection (only the ones actually wired):

```bash
nello autofetch-cursor <source>   # prints an ISO timestamp, or nothing on first run
```

Fetch items newer than that cursor (on first run, default to the last 24 hours):

| Source | MCP tool | Query |
|---|---|---|
| `gmail` | `mcp__google_workspace__search_gmail_messages` | `after:<cursor>` |
| `calendar` | `mcp__google_workspace__list_events` | `timeMin=<cursor>` |
| `drive` | `mcp__google_workspace__list_drive_items` | `modifiedTime>=<cursor>` |
| `slack` (if connected) | the connected slack MCP | `oldest=<cursor>` |

**Cap each source at 50 items per tick.** If there are more, take the 50 oldest and note "will catch up next tick" — the next tick's cursor picks up where you stopped.

If a connection is down, skip that source and continue. One broken connector never kills the tick.

### 2. Triage each item (cheap, fast)

For every fetched item decide one verdict:

- `drop` — noise; record it seen so it never comes back, but write nothing.
- `ack` — worth keeping, not worth surfacing; write the note, no Inbox.md line.
- `react` — the default; write the note and add an Inbox.md line.
- `escalate` — time-sensitive; write + Inbox.md line + you'll Telegram a one-liner (step 4).

### 3. Hand the whole batch to the code gate

Assemble **one** JSON array across all sources. Each element:

```json
{
  "source": "gmail",
  "source_id": "<stable upstream id: gmail thread_id, calendar event_id, slack ts>",
  "toolkit": "google_workspace",
  "scope": "thread",
  "summary": "<one-line summary for the Inbox.md entry>",
  "fields": { "sender": "...", "subject": "...", "date": "..." },
  "body": "<the note body you want stored>",
  "triage": "react"
}
```

Write it to a temp file and call the gate:

```bash
nello autofetch-write /tmp/autofetch-batch.json
```

It classifies each item against the dedup index (skips `unchanged` — no write, no embed), writes new/updated notes to `vault/Inbox/auto-fetch/<source>/<source_id>.md` with provenance frontmatter, appends the Inbox.md lines, never clobbers a note a human edited after the last write, and records every item seen — all atomically. It prints a one-line summary, then a line beginning `NELLO_AUTOFETCH_RESULT ` followed by JSON `{ "summary": ..., "escalations": [...] }`. Read the summary for the chat reply; parse the JSON after that marker for the escalations.

### 4. Report

- Send the printed `summary` line to the chat as your only reply. No preamble, no multi-line recap.
- For each entry in `escalations`, send a single Telegram line via the bot (the connected send-message tool) so the user sees the urgent ones immediately.

## Rules

- **Never write auto-fetch notes yourself.** Build the JSON batch and let `nello autofetch-write` do every write. It owns `vault/Inbox/auto-fetch/<source>/` and the Inbox.md append, and nothing else.
- **Never call `classify`/`markSeen` by hand** — the gate does, transactionally.
- **Never fetch more than 50 items per source per tick.**
- **Don't spam the chat.** One line per tick.
