---
name: triage
description: Classify an inbound item (email, calendar invite, Slack message, webhook event, RSS entry) into one of four buckets — drop / ack / react / escalate — using a cheap fast-model call. Use when /auto-fetch needs to decide what to do with each fetched item, or when the user says "triage this", "is this important", "should I care about X", "/triage". Returns the verdict + a one-line reason. Never writes to the vault, never sends notifications — the caller acts on the verdict.
model_hint: fast
---

# Triage

Cheap classifier in front of expensive paths. Protects the vault from spam and the user's attention from noise.

## When this fires

- Every item fetched by `/auto-fetch` before write.
- Manually: user says "triage this email", "is this important", "should I care about X", "/triage <description>".

## The four verdicts

| Verdict | Meaning | Action the caller takes |
|---|---|---|
| `drop` | Spam, automated marketing, no-reply digest, irrelevant — never write, never surface. | Mark dedup-seen with `dropped:true`, do nothing else. |
| `ack` | Real but low-signal — receipt, calendar reminder, "your invoice was paid", routine status update. Write to vault for the record, do not surface. | Write note, do NOT append to `Inbox.md`. |
| `react` | Worth knowing about. Most items land here — work emails, calendar invites, Slack mentions, customer messages. | Write note + append to `Inbox.md`. (Default.) |
| `escalate` | Time-sensitive or high-stakes — boss/client urgent, payment failed, account compromised, urgent personal. | Write note + append to `Inbox.md` + send a one-line summary to Telegram. |

## Decision criteria

Use these as defaults. The user can override later via `/tool-rules` adding `triage` rules ("never escalate emails from sarah@bigco.com").

### Drop signals (any one is enough)
- Sender domain matches `@noreply.`, `@notifications.`, `@email.`, `@updates.`, `@news.`
- Subject contains: "unsubscribe", "newsletter", "weekly digest", "monthly summary", "your invitation expires"
- LinkedIn / Twitter / Meta notification emails
- Sales outreach with no prior relationship
- Calendar invites for events already declined or in the past
- Auto-generated CI/CD success notifications

### Ack signals
- Payment confirmations, receipts, "thanks for your order"
- Calendar reminders for events the user already knows about (existing on calendar)
- "Your password was changed" (when the user just changed it)
- Read-receipts, delivery confirmations
- Routine bank statements

### React signals (default — when in doubt, react)
- Direct work email from a known contact
- New calendar invite the user hasn't seen
- Customer / client message
- Slack @-mention
- Question requiring a reply
- Document shared with the user

### Escalate signals (any one is enough)
- Subject or body marked URGENT, ASAP, "need this today", "time-sensitive"
- From a sender on the user's escalation list (read from `<install>/.claude/tool-rules.md` under the `triage` namespace — entries like `**ESCALATE** — Always escalate emails from boss@company.com`)
- Payment failed, card declined, account suspended, security alert (real, not phishing)
- Calendar invite for a meeting starting within 2 hours
- Slack @here / @channel from a small high-priority channel

## How to call

The caller passes a structured item description and waits for a verdict. Use a tight prompt — this is supposed to be fast and cheap.

### Input shape

```
{
  source: 'gmail' | 'calendar' | 'slack' | 'webhook',
  from: '<sender identifier>',
  subject: '<subject line if any>',
  preview: '<first 500 chars of body>',
  metadata: { thread_id, labels, is_in_thread, ... }
}
```

### Output shape

Exactly one line:

```
<verdict>: <one-line reason>
```

Examples:

```
drop: LinkedIn notification, sender @notifications.linkedin.com
ack: Stripe payment receipt for $49 monthly subscription
react: Direct question from alice@bigco.com about Q3 forecast
escalate: Boss email subject "URGENT — call me before 3pm"
```

## Rules

- **Default to `react`** when the signals are ambiguous. Cheaper to write a note the user ignores than to miss a real signal.
- **Never escalate without a hard signal** — escalation pings the user's Telegram. False positives erode trust fast.
- **Respect tool-rules.** Before classifying, scan `<install>/.claude/tool-rules.md` for any `triage` namespace rules and apply them.
- **One LLM call per item.** No follow-up questions, no second-guessing. Verdict in one line, move on.
- **Do not write to the vault.** Do not send notifications. Return the verdict. The caller acts.
