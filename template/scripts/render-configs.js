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

export function renderMcpJson(ctx) {
  const mcps = ctx.mcps || {}
  const env = ctx.env || {}
  const servers = {}

  if (mcps.google) {
    servers.google_workspace = {
      command: 'uvx',
      args: ['workspace-mcp'],
      env: {
        GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID || '',
        GOOGLE_OAUTH_CLIENT_SECRET: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      },
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

  if (mcps.google) {
    servers.google_workspace = {
      command: 'uvx',
      args: ['workspace-mcp'],
      env: {
        GOOGLE_OAUTH_CLIENT_ID: env.GOOGLE_OAUTH_CLIENT_ID || '',
        GOOGLE_OAUTH_CLIENT_SECRET: env.GOOGLE_OAUTH_CLIENT_SECRET || '',
      },
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
            { type: 'command', command: `${installPath}/template/hooks/block-dangerous-git.sh` },
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
          hooks: [
            { type: 'command', command: `node "${installPath}/template/hooks/graphify-incremental.js"` },
          ],
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
