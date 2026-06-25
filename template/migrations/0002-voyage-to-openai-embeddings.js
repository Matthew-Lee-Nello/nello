// 0002-voyage-to-openai-embeddings
//
// v1.0 moved gbrain off Voyage (voyage-3.5-lite, 1024-dim) onto OpenAI
// (text-embedding-3-small, 1536-dim). The stored vectors are at the OLD dimension,
// so a query embedded at 1536 can't compare against a 1024 store - the brain has to
// be re-embedded. `gbrain import` is content-hash incremental and won't re-embed on
// a model change alone (the note content is unchanged), so we clear the gbrain store
// here; configureGbrain + seedRecall later in THIS same bootstrap re-init it on the
// OpenAI model and rebuild fresh at 1536.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const GBRAIN_DIR = join(homedir(), '.gbrain')
const GBRAIN_CFG = join(GBRAIN_DIR, 'config.json')

export default {
  id: '0002-voyage-to-openai-embeddings',
  description: 're-embed the brain on OpenAI (was Voyage; dimension 1024 -> 1536)',

  // Only an install whose gbrain store was built on Voyage needs the rebuild. A
  // fresh install (no store) or one already on OpenAI returns false = no-op.
  detect() {
    try {
      if (!existsSync(GBRAIN_CFG)) return false
      const cfg = JSON.parse(readFileSync(GBRAIN_CFG, 'utf-8'))
      return typeof cfg.embedding_model === 'string' && cfg.embedding_model.startsWith('voyage')
    } catch { return false }
  },

  run(ctx) {
    // Wipe the Voyage-dimension store + config so setupRecall (later this bootstrap)
    // re-inits gbrain on openai:text-embedding-3-small/1536 and re-imports the vault
    // fresh. Best-effort: a failure just leaves recall empty until /build-recall.
    try { rmSync(GBRAIN_DIR, { recursive: true, force: true }) } catch {}
    if (!ctx.env.OPENAI_API_KEY) {
      ctx.warn('Brain was on Voyage; v1.0 uses OpenAI. Add OPENAI_API_KEY to .env and run /build-recall to switch recall back on.')
    } else {
      ctx.ok('brain store cleared for OpenAI re-embed (rebuilds this run; a large vault: run /build-recall)')
    }
  },
}
