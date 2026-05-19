---
name: tool-rules
description: Per-tool rules ("never email Sarah", "always confirm before sending invoices") pinned into the system prompt so they survive context compaction. Use when the user says "never X", "always X", "don't ever X", "from now on X", or asks to set / list / remove a rule. Auto-promotes "never <verb> <noun>" phrasings to critical priority. Reads + writes .claude/tool-rules.md in the install folder.
model_hint: fast
---

# Tool Rules

Pinned safety rules per tool. Survives `/compact`. Read by the SessionStart hook into every new session.

## Why this exists

Auto-memory captures preferences over time. That's slow. **Tool rules** are immediate, pinned, and impossible for the agent to forget mid-task.

A rule looks like:

> **CRITICAL · mcp__gmail__send_gmail_message** — Never email sarah@bigco.com. She asked us to stop.

When the agent loads a session, the SessionStart hook prints the active rules into context. Rules tagged `CRITICAL` cannot be silently dropped during compaction — they're re-injected on every session start.

## When to invoke this skill

Triggers:
- User says **"never X"**, **"always X"**, **"don't ever X"**, **"from now on X"**, **"stop X-ing"**.
- User says **"add a rule"**, **"set a rule"**, **"list rules"**, **"remove the rule about X"**.
- A tool fails the same way twice — capture as a `NORMAL` observation so future sessions know.

## Rule levels

| Level | Behaviour |
|---|---|
| `CRITICAL` | Pinned in system prompt. Agent MUST refuse the action if a rule conflicts. Survives compaction. |
| `HIGH` | Loaded at session start. Agent should confirm before doing the conflicting action. |
| `NORMAL` | Observations, hints, failure-learnings. Reference material. |

## Auto-promotion

Phrasings matching `/^(never|don't ever|stop) <verb> <noun>/i` get auto-tagged `CRITICAL` on the matching tool. Other "always X" or "from now on X" wording defaults to `HIGH` unless the user says "critical".

## How to add a rule

1. **Pick the tool the rule applies to.** Most rules are tool-scoped. If the rule is global (e.g. "never write to my main branch"), file it under `GLOBAL`.
   - For MCP tools, use the full handle: `mcp__gmail__send_gmail_message`.
   - For built-in tools: `Bash`, `Edit`, `Write`, `TodoWrite`.
   - For all tools: `GLOBAL`.

2. **Pick the level.** Use auto-promotion rules above, or honour what the user said.

3. **Append to the file.** The file lives at `<install>/.claude/tool-rules.md`. Append the new rule under the tool's heading (create if missing):

```markdown
## mcp__gmail__send_gmail_message
- **CRITICAL** — Never email sarah@bigco.com. She asked us to stop (added 2026-05-19).
```

4. **Confirm to the user.** One line: "Rule added — `<tool>` will never <action>." That's it.

## How to list rules

Print the file. If empty, say so.

## How to remove a rule

Edit the file. Remove the bullet. Confirm.

## File format

The single file at `<install>/.claude/tool-rules.md` is the source of truth. Structure:

```markdown
# Tool Rules

Pinned rules. Read at session start. CRITICAL rules survive compaction.

## GLOBAL
- **CRITICAL** — Never push to `main` directly.

## mcp__gmail__send_gmail_message
- **CRITICAL** — Never email sarah@bigco.com.
- **HIGH** — Always cc accounts@nello.gg on invoice replies.

## Bash
- **HIGH** — Always confirm before running `rm -rf`.
```

Sort within each tool: CRITICAL → HIGH → NORMAL.

## Rules

- Don't summarise or rewrite existing rules. Append only.
- Each bullet includes the date added in parentheses.
- If the file doesn't exist yet, create it with the header above + the new rule.
- Never delete a CRITICAL rule without the user explicitly saying so. Confirm twice.
- The SessionStart hook is responsible for injecting these into context — you don't need to read the file yourself unless the user asks to list / edit.
