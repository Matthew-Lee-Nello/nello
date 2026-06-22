/**
 * Provision a Composio Tool Router session for one client.
 *
 * Mints a durable per-user router URL with the MCP-standard `destructiveHint` tag
 * DISABLED, so the assistant can read / send / create across 1000+ apps but can never
 * delete or trash anything (refused server-side at the session layer). The agent sees
 * ~6 meta-tools (search / execute / manage-connections) and pulls in what it needs.
 *
 * Pure Node fetch, no SDK, no Python. The installer calls provisionRouterUrl() during
 * bootstrap so the only Composio value anyone pastes is the API key - the URL is made
 * here automatically. Also runnable standalone (and from the labs.nello.gg wizard).
 *
 * CLI:  COMPOSIO_API_KEY=ak_xxx node composio-provision.mjs <user_id e.g. their email>
 */
const ENDPOINT = 'https://backend.composio.dev/api/v3.1/tool_router/session'

export async function provisionRouterUrl(apiKey, userId) {
  if (!apiKey) throw new Error('COMPOSIO_API_KEY required')
  if (!userId) throw new Error('user_id required')

  // Bound the call so a slow/hung Composio backend can't hang the installer
  // forever (the user would see a dead spinner and force-kill mid-install).
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  let res
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        manage_connections: { enable: true },
        tags: { disable: ['destructiveHint'] }, // blocks every delete/trash tool, all apps
      }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Composio provisioning timed out after 30s. Check your network and run the installer again.')
    throw new Error(`Could not reach Composio (${err?.message || err}). Check your network and try again.`)
  } finally {
    clearTimeout(timer)
  }

  const text = await res.text()
  if (!res.ok) {
    // Classified so the user knows whether it's their key, Composio, or the network.
    if (res.status === 401 || res.status === 403) throw new Error('Composio rejected the API key (401/403). Double-check it at dashboard.composio.dev and re-run.')
    if (res.status >= 500) throw new Error(`Composio is temporarily unavailable (${res.status}). Try again in a few minutes.`)
    throw new Error(`Composio session create failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const data = JSON.parse(text)
  const url = data?.mcp?.url || data?.mcp_url || data?.url
  if (!url) throw new Error(`Composio session response had no mcp url: ${text.slice(0, 200)}`)
  return url
}

// standalone / wizard use
if (import.meta.url === `file://${process.argv[1]}`) {
  const userId = process.argv[2]
  const apiKey = process.env.COMPOSIO_API_KEY
  provisionRouterUrl(apiKey, userId)
    .then(url => {
      // Print only the minted URL. Never echo the API key - this runs standalone
      // from the labs.nello.gg wizard, where stdout can be captured/logged.
      console.log(`COMPOSIO_MCP_URL=${url}`)
    })
    .catch(e => { console.error(e.message); process.exit(1) })
}
