---
name: cron
description: Schedule recurring or one-off tasks. Use when the user says "remind me at X", "every Monday at 9 do X", "schedule a task", "every morning brief me", "stop the morning brief", "list my scheduled tasks", "pause that recurring task", or asks anything about cron / scheduled / recurring jobs. Wraps the @nello/scheduler CLI (nc-schedule) so the agent can manage cron tasks through normal Bash calls.
model_hint: fast
---

# Cron

Schedule a prompt to run on a cron expression. Tasks run in their own chat session, with full tool access (Gmail, Calendar, Obsidian, etc), exactly as if the user had typed the prompt manually.

The scheduler daemon (`@nello/scheduler`) ticks every minute, finds due tasks, and invokes them. The `nc-schedule` CLI does CRUD on the task table.

## When to invoke this skill

- "Remind me Thursday at 9am to follow up with Alice."
- "Every Monday at 8am give me a brief of last week."
- "Stop the morning brief."
- "List my scheduled tasks."
- "Pause the calendar digest, I'm on holiday."
- "Resume the morning brief."
- Anything about cron, recurring, scheduled, every X minutes / hours / days.

## The six verbs

| User intent | Action |
|---|---|
| Add new recurring task | `cron_add` → `nc-schedule create` |
| List all scheduled tasks | `cron_list` → `nc-schedule list` |
| Update an existing task | `cron_update` → `nc-schedule delete <id>` then `create` with new args |
| Remove a task | `cron_remove` → `nc-schedule delete` |
| Pause without removing | `cron_pause` → `nc-schedule pause` |
| Resume a paused task | `cron_resume` → `nc-schedule resume` |

## How to call

The `nc-schedule` binary is installed by `pnpm install` in the install folder. Always run it via Bash from the install folder so the `@nello/core` SQLite db is found.

### Add

```bash
nc-schedule create "<prompt>" "<cron>" "<chat_id>"
```

- `<prompt>` — the natural-language instruction the agent will execute on the tick. Quote it.
- `<cron>` — 5-field cron expression. Use `0 9 * * 1` for "every Monday at 9am". Use `0 9 * * *` for "every morning at 9".
- `<chat_id>` — which chat the task results post into. Use the current chat ID unless the user specifies. The dashboard exposes the chat ID; if you can't find one, use `default`.

Reply with the task ID returned by the CLI, plus a plain-English summary of when it'll fire next.

### List

```bash
nc-schedule list                # all tasks
nc-schedule list <chat_id>      # tasks for one chat
```

Format the output as a table: id, status, schedule (translated to plain English — "every Monday 9am"), next run (relative time — "in 3 days"), short prompt.

### Pause / Resume / Remove

```bash
nc-schedule pause <id>
nc-schedule resume <id>
nc-schedule delete <id>
```

If the user gives a description instead of an ID ("pause the morning brief"), `nc-schedule list` first, match the description against the prompts, then act on the matched ID. Confirm to the user before deleting.

### Update

There is no in-place update. To change a schedule or prompt:

1. `nc-schedule list` to find the task ID.
2. Show the user the old definition.
3. `nc-schedule delete <id>`.
4. `nc-schedule create` with the new prompt + cron.
5. Report the new ID.

## Translating natural language → cron

| User says | Cron |
|---|---|
| Every morning at 9 | `0 9 * * *` |
| Every weekday at 8am | `0 8 * * 1-5` |
| Every Monday at 9am | `0 9 * * 1` |
| Every hour | `0 * * * *` |
| Every 30 minutes | `*/30 * * * *` |
| Every Sunday at 6pm | `0 18 * * 0` |
| First of the month at midnight | `0 0 1 * *` |

If the user gives a one-shot time ("at 3pm tomorrow"), compute the exact UTC cron for that single fire (`<min> <hour> <day> <month> *`). It will fire once, then sit dormant until the same day/month next year. If that's not what the user wants, set the schedule to that exact moment, deliver, then `nc-schedule delete` from the task body itself.

## Rules

- Always confirm the cron in plain English before creating (e.g. "Scheduling for every Monday at 9am, your time zone — confirm?"). Cron is cryptic; the user shouldn't have to read it.
- If the user gives a vague time ("morning"), pick 9am unless they push back.
- Default chat ID for any new task is the current chat unless the user names a different one.
- Tasks run with the same tools and MCPs the agent has. They post into the chat you assigned, not as a system message.
- The morning brief preset (if installed) is a regular task — list it with the rest and edit / pause / delete the same way.
