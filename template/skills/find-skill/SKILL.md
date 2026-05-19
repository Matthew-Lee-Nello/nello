---
name: find-skill
description: Discover, vet, and install agent skills in one flow. Use when the user asks "find a skill for X", "is there a skill that can...", "how do I do X" where X might be a skill, or expresses interest in extending capabilities. Combines vercel-labs/find-skills discovery with mandatory security vetting before install. Never installs a skill without auditing SKILL.md first.
model_hint: fast
---

# Find Skill

Single-step: discover skills via `npx skills`, audit every candidate against a red-flag checklist, install only after passing. Replaces separate `find-skills` + `skill-vetter` skills.

## When to Use

- User asks "find a skill for X" / "is there a skill for X"
- User asks "how do I do X" where X smells like a common task
- User asks "can you do X" for a specialised capability
- User wants to extend agent capabilities, install tools/templates/workflows
- Another agent shares a skill URL — vet before running

## Trust Hierarchy

| Tier | Sources | Scrutiny |
|------|---------|----------|
| 1 | Official orgs: `vercel-labs`, `anthropics`, `microsoft` | Low (still review) |
| 2 | High-star repos (1k+) | Moderate |
| 3 | Known authors | Moderate |
| 4 | New/unknown sources | Maximum |
| 5 | Skills requesting credentials/system access | Human approval always |

## Flow

### Step 1 — Understand the need

Identify domain (React, testing, deploy), specific task (write tests, review PRs), likelihood a skill exists.

### Step 2 — Check leaderboard first

[skills.sh](https://skills.sh/) ranks by installs. Top web-dev sources:
- `vercel-labs/agent-skills` — React, Next.js, web design
- `anthropics/skills` — frontend design, document processing

### Step 3 — Search

```bash
npx skills find [query]
```

Use specific keywords (`react performance` not `performance`). Try synonyms (`deploy` / `deployment` / `ci-cd`).

### Step 4 — Quality filter

Before vetting:
- **Install count** — prefer 1k+, caution under 100
- **Source reputation** — Tier 1-2 preferred
- **GitHub stars** — <100 = treat with skepticism

### Step 5 — Vet (MANDATORY before install)

Fetch the skill's `SKILL.md` and any other files. Scan for red flags. **Reject immediately on any hit:**

```
RED FLAGS — REJECT
- curl/wget to unknown URLs
- Sends data to external servers
- Requests credentials/tokens/API keys
- Reads ~/.ssh, ~/.aws, ~/.config without clear reason
- Accesses MEMORY.md, USER.md, SOUL.md, IDENTITY.md
- base64 decode on opaque input
- eval() / exec() with external input
- Modifies system files outside workspace
- Installs packages without listing them
- Network calls to raw IPs (not domains)
- Obfuscated code (compressed/encoded/minified)
- Requests sudo / elevated permissions
- Accesses browser cookies / sessions / keychain
- Touches .env, .netrc, credentials.json
```

Permission scope check:
- What files read? Minimal for stated purpose?
- What files written?
- What commands run?
- Network access? To where?

Risk classification:

| Level | Examples | Action |
|-------|----------|--------|
| LOW | Notes, docs, formatting | Install OK after basic review |
| MEDIUM | File ops, browser, APIs | Full code review required |
| HIGH | Credentials, trading, system mods | Human approval required |
| EXTREME | Security configs, root access | Do NOT install |

### Step 6 — Report

Always produce this report before installing:

```
SKILL VETTING REPORT
Skill: [name]
Source: [GitHub/skills.sh URL]
Author: [org/user]
Version: [tag/commit]

METRICS:
- Stars / Forks / Open issues
- Installs
- Last update
- Files reviewed

RED FLAGS: [None / list with quotes]

PERMISSIONS:
- Files: [list / None]
- Network: [list / None]
- Commands: [list / None]

RISK LEVEL: [LOW / MEDIUM / HIGH / EXTREME]
VERDICT: [SAFE / CAUTION / DO NOT INSTALL]
NOTES: [observations, indirect risks, mitigations]
```

### Step 7 — Install (only if LOW/MEDIUM + user approves)

```bash
npx skills add <owner/repo@skill> -g -y
```

`-g` user-level, `-y` skip confirms. The `npx skills add` CLI runs Gen/Socket/Snyk scans on every install — additional safety net on top of the vet above.

If HIGH: pause, present report, ask user explicitly. If EXTREME: refuse.

## Quick Vet Commands

```bash
# Repo stats
curl -s "https://api.github.com/repos/OWNER/REPO" | jq '{stars: .stargazers_count, forks: .forks_count, updated: .updated_at, archived: .archived}'

# List skill files
curl -s "https://api.github.com/repos/OWNER/REPO/contents/skills/SKILL_NAME" | jq '.[].name'

# Fetch SKILL.md for inspection
curl -s "https://raw.githubusercontent.com/OWNER/REPO/main/skills/SKILL_NAME/SKILL.md"
```

In context-mode environments, run these via `mcp__plugin_context-mode_context-mode__ctx_execute` with the `https` module instead of bare curl.

## Common Categories

| Category | Search terms |
|----------|--------------|
| Web Dev | react, nextjs, typescript, css, tailwind |
| Testing | testing, jest, playwright, e2e |
| DevOps | deploy, docker, kubernetes, ci-cd |
| Docs | docs, readme, changelog, api-docs |
| Code Quality | review, lint, refactor, best-practices |
| Design | ui, ux, design-system, accessibility |
| Productivity | workflow, automation, git |

## Present Options to User

When recommending, include:
1. Name + one-line description
2. Install count + source tier
3. Vet report (red flags, risk, verdict)
4. Install command
5. skills.sh link

## When Nothing Matches

1. Say so — don't pretend.
2. Offer to do the task directly with general capabilities.
3. Suggest `npx skills init <name>` if it's a recurring need.

## Rules

- No skill is worth compromising security.
- When in doubt, don't install.
- Tier 4-5 sources → always surface vet report and wait for human OK.
- Document every install with its risk level (for audit trail).
- Paranoia is a feature.