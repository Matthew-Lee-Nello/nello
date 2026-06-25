---
name: research
description: Multi-source research. Queries Exa for web results, the user's local QMD knowledge base collections if installed, and the user's own past context in the nello memory database, then synthesises results with citations. Use when the user asks to research a topic, find out what creators say, compare frameworks, or needs web + knowledge base + personal context in one pass. Triggers on "research X", "dig into X", "find me everything on X", "cross-reference X", "/research".
trigger: /research
model_hint: reasoning
---

# /research - Multi-Source Research

Query every available research source in parallel. Synthesise with citations. Save the result to local memory so future queries compound.

## Invocation

```
/research <topic or question in natural language>
/research --scope web      # Exa only
/research --scope kb       # local QMD knowledge base only (if installed)
/research --scope memory   # local memories only
```

Default is all legs in parallel.

## Legs (run in parallel)

### Leg 1 - Web (Exa)
Use the `exa` MCP wired in `.mcp.json`. Query with the topic. Take top 5-8 results. Pull full content via `web_fetch_exa` for the top 2-3 most relevant.

### Leg 2 - Local knowledge base (QMD)
If the user has the `qmd` MCP wired and has ingested any collections (via `/person-kb`, `/book-kb`, `/voice-kb`), query `mcp__qmd__query` with the topic. Default: search all collections. If `--collection <slug>` passed, scope to that one. Retrieve full context for top 2-3 hits via `mcp__qmd__get` or `mcp__qmd__multi_get`.

### Leg 3 - Personal memory
Query the local memory DB at `<install-path>/store/clawd.db`, table `memories`, with FTS5 search on the topic.

```bash
sqlite3 "$CLAWD_DB" \
  "SELECT datetime(created_at,'unixepoch','localtime'), sector, salience, substr(content,1,300) \
   FROM memories WHERE content LIKE '%<keyword>%' AND sector='semantic' \
   ORDER BY salience DESC, created_at DESC LIMIT 10"
```

Also search the vault at `<install-path>/vault/Memory/*.md` for matches, plus any `Person-*.md` files if the question mentions a specific person.

## Synthesis Format

```markdown
## Research: <question>

### Web findings (Exa)
(top 5 results, cite as `[Exa: <url>]`. Pull direct quotes from the top 2-3 you fetched in full.)

### Framework library
(what local QMD collections say, if any are installed. Cite each claim: `[<Collection>: <source title>]`. Direct quotes preferred.)

### Your past context
(what local memories + vault notes say. `[memory <date>]` or `[[Note-Name]]` attribution. If nothing, say "nothing found".)

### Synthesis
(3-5 bullets of concrete takeaways, reconciling contradictions. Every bullet cites its source.)

### Recommended next action
(one sentence. What to actually do with this research?)
```

## After the Synthesis

Save the result back to memories as a semantic memory with salience 3.5 so future related queries benefit:

```bash
sqlite3 "$CLAWD_DB" \
  "INSERT INTO memories (chat_id, topic_key, content, sector, salience, created_at, accessed_at) \
   VALUES ('$ALLOWED_CHAT_ID', 'research-<slug>', '<short synthesis>', 'semantic', 3.5, \
   strftime('%s','now'), strftime('%s','now'))"
```

## Rules

1. **Run legs in parallel.** Never query one source at a time when multiple are available.
2. **Every claim must be cited.** If a bullet does not have a source, drop it.
3. **Never invent quotes.** If QMD returns nothing, say "nothing found" - do not paraphrase from general knowledge.
4. Follow the voice rules in the repo `CLAUDE.md`.
5. **Respect API costs.** Exa charges per query. If the question is trivial, skip the web leg and just use QMD or a local grep.
6. **Feed the memory loop.** Every completed research synthesis gets saved back to memories.

## Prerequisites

- `exa` MCP wired in `.mcp.json` (default for nello installs)
- `CLAWD_DB` env var points to `<install-path>/store/clawd.db`
- Optional: `qmd` MCP + at least one ingested collection for Leg 2

## Want more sources?

If you need Reddit chatter, scraped pages, or specialised search, ask the assistant to install another MCP:

```
find me a connection for reddit search
find me a connection for scraping arbitrary websites
```

The `/find-mcp` skill (already installed) walks through finding + wiring it.

## Relationship to Other Skills

- **`/find-mcp`** - install additional research MCPs on demand
- **`/find-skills`** - find research-adjacent skills (analyse-transcript, compare-frameworks, etc.)
