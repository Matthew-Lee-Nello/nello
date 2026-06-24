// 0001-oauth-to-composio
//
// Retire the pre-Composio Google wiring. An install built before the Composio Tool
// Router carried GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in .env and a
// google_workspace / workspace-mcp entry in .mcp.json. This migration does the
// deterministic half: strip the dead OAuth secrets and flip the install onto Composio.
//
// The rest happens for free:
//   - .mcp.json pruning of google_workspace/workspace-mcp is already automatic
//     (DEPRECATED_MCP_KEYS in bootstrap.js, applied on every render);
//   - collecting the COMPOSIO_API_KEY is the /update interview-diff's job (composio's
//     required key in KEY_MANIFEST), so this migration never prompts;
//   - the durable Tool Router URL is minted by the Composio provision step once the
//     key is present.
//
// GOOGLE_USER_EMAIL is kept on purpose - it becomes the Composio user id.

export default {
  id: '0001-oauth-to-composio',
  description: 'retire Google OAuth wiring, move install onto Composio',

  // Only an install that still carries the old OAuth secrets needs this. A fresh or
  // already-migrated install returns false here and the runner records it as a no-op.
  detect(ctx) {
    const env = ctx.env || {}
    return !!(env.GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_SECRET)
  },

  run(ctx) {
    // Drop the dead OAuth secrets - writeEnv persists the removal to .env.
    delete ctx.env.GOOGLE_OAUTH_CLIENT_ID
    delete ctx.env.GOOGLE_OAUTH_CLIENT_SECRET

    // Flip THIS run's render onto Composio.
    ctx.bundle.mcps = { ...(ctx.bundle.mcps || {}), composio: true }
    delete ctx.bundle.mcps.google

    // Make it durable: the next bootstrap reloads bundle.json, so both the mcps flag
    // AND the dead OAuth secrets must be removed there too. Otherwise the next update
    // reloads them from bundle.json (the .env overlay is a merge that never deletes
    // absent keys) and, with 0001 already recorded, nothing strips them again - the
    // secret would resurrect into .env. This mirrors the old skill's dual edit.
    ctx.patchBundle((b) => {
      b.mcps = { ...(b.mcps || {}), composio: true }
      if (b.mcps) delete b.mcps.google
      if (b.keys) {
        delete b.keys.GOOGLE_OAUTH_CLIENT_ID
        delete b.keys.GOOGLE_OAUTH_CLIENT_SECRET
      }
    })

    ctx.ok('Google OAuth retired; install moved onto Composio (the Composio key is collected by the /update key check if missing)')
  },
}
