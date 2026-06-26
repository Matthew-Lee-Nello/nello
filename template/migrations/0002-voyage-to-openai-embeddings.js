// 0002-voyage-to-openai-embeddings
//
// v1.0 moved gbrain off Voyage (voyage-3.5-lite, 1024-dim) onto OpenAI
// (text-embedding-3-small, 1536-dim). Stored vectors at the OLD dimension can't be
// compared against a 1536 query, and `gbrain import` is content-hash incremental so a
// model change alone won't re-embed. The store therefore has to be cleared so
// configureGbrain + seedRecall (later in THIS same bootstrap) rebuild it fresh on the
// OpenAI model.
//
// The hard rule: NEVER wipe a brain we can't rebuild. Rebuilding needs OPENAI_API_KEY,
// and an ancient install won't have one yet. So when the key is absent we leave the
// existing (Voyage / old-dimension) store intact and DEFER - the key is now collected
// by /update's missing-key prompt (it's in KEY_MANIFEST as `brain`), and this migration
// re-evaluates and completes on the pass where the key is present. The old brain keeps
// working until then; it is never left wiped-and-empty.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const GBRAIN_DIR = join(homedir(), '.gbrain')
const GBRAIN_CFG = join(GBRAIN_DIR, 'config.json')

const TARGET_DIM = 1536

export default {
  id: '0002-voyage-to-openai-embeddings',
  description: 're-embed the brain on OpenAI (was Voyage; dimension 1024 -> 1536)',

  // Migrate any store that isn't already on the v1.1 target. That's a Voyage store OR
  // any store at a dimension other than 1536 (catches a half-switched install whose
  // config points at OpenAI but whose vectors are still 1024). A fresh install (no
  // store) returns false: configureGbrain builds it at 1536 from the start, nothing to do.
  detect() {
    try {
      if (!existsSync(GBRAIN_CFG)) return false
      const cfg = JSON.parse(readFileSync(GBRAIN_CFG, 'utf-8'))
      const model = typeof cfg.embedding_model === 'string' ? cfg.embedding_model : ''
      const dims = Number(cfg.embedding_dimensions)
      return model.startsWith('voyage') || dims !== TARGET_DIM
    } catch { return false }
  },

  run(ctx) {
    if (!ctx.env.OPENAI_API_KEY) {
      // No key yet -> can't re-embed -> do NOT wipe. Keep the existing brain working
      // and defer. /update collects OPENAI_API_KEY via the missing-key prompt, then
      // re-runs bootstrap; this migration completes on that pass.
      ctx.warn('Brain is on the old embedding model; v1.1 uses OpenAI (text-embedding-3-small/1536). Add OPENAI_API_KEY to .env (platform.openai.com) and Nello re-embeds automatically. Your current brain keeps working until then.')
      return { defer: true }
    }
    // Key present: clear the old-dimension store so configureGbrain + seedRecall
    // (later this same bootstrap) re-init gbrain on openai:text-embedding-3-small/1536
    // and re-import the vault fresh. Best-effort: a failure just leaves recall empty
    // until /build-recall.
    try { rmSync(GBRAIN_DIR, { recursive: true, force: true }) } catch {}
    ctx.ok('brain store cleared for OpenAI re-embed (rebuilds this run; a large vault: run /build-recall)')
  },
}
