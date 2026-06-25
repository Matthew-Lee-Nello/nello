/**
 * Config renderers.
 *
 * Previously `.mcp.json`, `claude_desktop_config.json`, and `.claude/settings.json`
 * were rendered via Handlebars templates with `noEscape: true`. Handlebars HTML
 * escaping is not JSON-string escaping, so a single `"` or backslash or newline
 * in `installPath`, `vaultPath`, or any wizard env value broke the output JSON
 * or, worse, injected extra args/env structure into configs that later spawn
 * MCP server processes.
 *
 * Each function here returns a plain JS object. The caller serialises with
 * `JSON.stringify(obj, null, 2)` and writes it to disk. JSON.stringify handles
 * every escape correctly, so this whole class of bugs goes away.
 *
 * `ctx` shape comes from `buildContext()` in bootstrap.js.
 */

// The Composio Tool Router URL for one client (minted per user by the provisioner,
// scripts/composio-provision.mjs, with the `destructiveHint` tag disabled so the
// agent can read/send/create across 1000+ apps but never delete or trash). The
// agent sees ~6 meta-tools (search / execute / manage-connections) and pulls in
// only what it needs, so the tool list stays tiny no matter how many apps connect.
// Durable: the URL keeps working once created.
export function composioMcpUrl(env) {
  return env.COMPOSIO_MCP_URL || ''
}

export function renderMcpJson(ctx) {
  const mcps = ctx.mcps || {}
  const env = ctx.env || {}
  const servers = {}

  // Only emit composio once it's actually provisioned. A blank url (provision
  // skipped, or a --configs-only re-render before the URL was minted) yields an
  // http server that silently fails to connect - so the agent believes Gmail is
  // wired when it isn't. Gate on the URL being present.
  if (mcps.composio && composioMcpUrl(env)) {
    servers.composio = {
      type: 'http',
      url: composioMcpUrl(env),
      headers: { 'x-api-key': env.COMPOSIO_API_KEY || '' },
    }
  }
  if (mcps.obsidian) {
    servers.obsidian = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ctx.vaultPath],
    }
  }
  if (mcps.exa) {
    servers.exa = {
      command: 'npx',
      args: ['-y', 'exa-mcp-server'],
      env: { EXA_API_KEY: env.EXA_API_KEY || '' },
    }
  }
  if (mcps.apify) {
    servers.apify = {
      command: 'npx',
      args: ['-y', '@apify/actors-mcp-server'],
      env: { APIFY_TOKEN: env.APIFY_TOKEN || '' },
    }
  }

  return { mcpServers: servers }
}

export function renderClaudeDesktopConfig(ctx) {
  const mcps = ctx.mcps || {}
  const env = ctx.env || {}
  const servers = {}

  // Only emit composio once it's actually provisioned. A blank url (provision
  // skipped, or a --configs-only re-render before the URL was minted) yields an
  // http server that silently fails to connect - so the agent believes Gmail is
  // wired when it isn't. Gate on the URL being present.
  if (mcps.composio && composioMcpUrl(env)) {
    servers.composio = {
      type: 'http',
      url: composioMcpUrl(env),
      headers: { 'x-api-key': env.COMPOSIO_API_KEY || '' },
    }
  }
  if (mcps.obsidian) {
    servers.obsidian = {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', ctx.vaultPath],
    }
  }
  if (mcps.tavily) {
    servers.tavily = {
      command: 'npx',
      args: ['-y', 'tavily-mcp'],
      env: { TAVILY_API_KEY: env.TAVILY_API_KEY || '' },
    }
  }
  if (mcps.exa) {
    servers.exa = {
      command: 'npx',
      args: ['-y', 'exa-mcp-server'],
      env: { EXA_API_KEY: env.EXA_API_KEY || '' },
    }
  }
  if (mcps.firecrawl) {
    servers.firecrawl = {
      command: 'npx',
      args: ['-y', 'firecrawl-mcp'],
      env: { FIRECRAWL_API_KEY: env.FIRECRAWL_API_KEY || '' },
    }
  }

  return { mcpServers: servers }
}

export function renderSettingsJson(ctx) {
  const installPath = ctx.installPath
  // PostToolUse vault hooks. graphify-incremental ships always (skips silently if
  // graphify isn't installed). gbrain-sync is added ONLY for a brain-enabled
  // install (an OPENAI_API_KEY is present) so a keyless box registers nothing new
  // and stays byte-for-byte identical to a no-recall install.
  const postToolUseHooks = [
    { type: 'command', command: `node "${installPath}/template/hooks/graphify-incremental.js"` },
  ]
  if (ctx.brainEnabled) {
    postToolUseHooks.push({ type: 'command', command: `node "${installPath}/template/hooks/gbrain-sync.js"` })
  }
  return {
    permissions: {
      defaultMode: 'bypassPermissions',
    },
    alwaysThinkingEnabled: false,
    effortLevel: 'max',
    enabledPlugins: {
      'andrej-karpathy-skills@karpathy-skills': true,
      'agentmemory@agentmemory': true,
    },
    extraKnownMarketplaces: {
      'karpathy-skills': {
        source: {
          source: 'github',
          repo: 'forrestchang/andrej-karpathy-skills',
        },
      },
      'agentmemory': {
        source: {
          source: 'github',
          repo: 'rohitg00/agentmemory',
        },
      },
    },
    hooks: {
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: `node "${installPath}/template/hooks/block-dangerous-git.js"` },
            // RTK token-saver: rewrites dev-command output so the assistant burns far
            // fewer tokens. Runtime-gated on rtk being on PATH (self-heals - no-op
            // until the brew install lands, active the moment it does). Runs locally.
            { type: 'command', command: 'if command -v rtk >/dev/null 2>&1; then exec rtk hook claude; fi' },
          ],
        },
      ],
      SessionStart: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: `node "${installPath}/template/hooks/inject-brain-context.js"` },
          ],
        },
      ],
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: `node "${installPath}/template/hooks/auto-memory.js"` },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: postToolUseHooks,
        },
      ],
      Stop: [
        {
          matcher: '',
          hooks: [
            { type: 'command', command: `node "${installPath}/template/hooks/stop-beep.js"` },
          ],
        },
      ],
    },
    statusLine: {
      type: 'command',
      command: `node "${installPath}/template/hooks/statusline.js"`,
    },
  }
}
