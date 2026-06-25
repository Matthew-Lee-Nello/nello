---
name: build-recall
description: Embed the whole vault into gbrain semantic recall (OpenAI). Use after /build-brain backfills a large archive, when the bootstrap auto-embed was skipped because the vault was too big, or when recall is missing notes. Triggers on "build recall", "rebuild recall", "embed my vault", "/build-recall".
trigger: /build-recall
model_hint: fast
---

# /build-recall - Embed the vault into semantic recall

Bring gbrain's semantic recall up to date with everything in the vault, including the bulk `vault/Imports/` archive that the per-edit hook deliberately skips. Run this when recall is missing notes, after a big `/build-brain` import, or when the installer skipped the auto-embed because the vault was already large (an OpenAI cost the owner should opt into, not a silent side effect).

Run from the install folder (the one with `.env` and `vault/`).

## 0. Preconditions
- `.env` has an `OPENAI_API_KEY` (recall is off without it - nothing to build).
- `~/.bun/bin/gbrain --version` works (it should print **gbrain X.Y.Z** - garrytan/gbrain, the brain). If missing, recall isn't installed; re-run the installer with an `OPENAI_API_KEY` present.

## 1. How big is the job?
- `ls -1 "$VAULT_PATH"/**/*.md 2>/dev/null | wc -l` (or count under `vault/`).
- OpenAI text-embedding-3-small embeds at ~$0.02 / million tokens. A few thousand notes is cents; tell the owner the rough note count before a very large run so there are no surprises.

## 2. Embed the whole vault
gbrain reads `OPENAI_API_KEY` from the environment, so pass it inline from `.env`:

```bash
cd <install folder>
OK=$(grep -m1 '^OPENAI_API_KEY=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
VAULT=$(grep -m1 '^VAULT_PATH=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")
OPENAI_API_KEY="$OK" ~/.bun/bin/gbrain import "$VAULT"
```

`import` is content-hash incremental, so re-running it only embeds new/changed notes. It's safe to run repeatedly.

## 3. Verify
```bash
OPENAI_API_KEY="$OK" ~/.bun/bin/gbrain doctor --fast
OPENAI_API_KEY="$OK" ~/.bun/bin/gbrain query "<a topic you know is in the vault>" --no-expand
```
- `doctor` reports the page + embedding counts (embeddings should be ≈ pages).
- `query` should return ranked hits. A 401 / auth error = the OpenAI key is wrong - fix it in `.env` and restart the daemon (`launchctl kickstart -k gui/$(id -u)/com.nello-claw.server` on Mac).

## Notes
- The daemon reads `NC_MEMORY_ENGINE` once at boot. If you just added the key, restart the daemon so it starts injecting `[recall]` into replies.
- This embeds `vault/Imports/` too (the per-edit hook skips that tree on purpose). That's the whole point of this skill.
