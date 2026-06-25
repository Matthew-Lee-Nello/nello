import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnvFile } from './env.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Project paths - resolved relative to this file
export const PROJECT_ROOT = process.env.NC_INSTALL_PATH || join(__dirname, '..', '..', '..', '..')
export const STORE_DIR = join(PROJECT_ROOT, 'store')
export const UPLOADS_DIR = join(PROJECT_ROOT, 'workspace', 'uploads')
export const VAULT_PATH = process.env.NC_VAULT_PATH || join(PROJECT_ROOT, 'vault')

const env = readEnvFile()

// Required
export const TELEGRAM_BOT_TOKEN = env['TELEGRAM_BOT_TOKEN'] ?? ''
export const ALLOWED_CHAT_IDS = (env['ALLOWED_CHAT_ID'] ?? '')
  .split(',')
  .map(id => id.trim())
  .filter(id => id.length > 0)

// Messaging surface. Telegram is the only supported channel (WhatsApp retired in
// v1.0 - it never linked reliably). Kept as an export for back-compat with bundles
// and configs that still carry the key; the daemon always runs Telegram.
export const MESSAGING_CHANNEL = (env['MESSAGING_CHANNEL'] ?? 'telegram').trim().toLowerCase()

// Which Claude Code setting scopes the agent loads. Default 'project,user' - 'user'
// is where the install's skills + CLAUDE.md live, so clients need it. Override to
// 'project' on a machine whose global ~/.claude is large (huge CLAUDE.md + many
// SessionStart hooks), where loading 'user' overflows the prompt ("Prompt is too
// long") and the agent exits 1. Comma-separated; values: project | user | local.
export const AGENT_SETTING_SOURCES = (env['NC_SETTING_SOURCES'] ?? 'project,user')
  .split(',').map(s => s.trim()).filter(Boolean)

// Voice
export const GROQ_API_KEY = env['GROQ_API_KEY'] ?? ''

// Composio Tool Router - the connection layer (Gmail, Calendar, Drive, Slack, Notion +
// 1000 apps). COMPOSIO_MCP_URL is the per-client durable router URL minted by
// scripts/composio-provision.py (destructiveHint disabled = no delete/trash). The agent
// searches + runs any app's tools through it. COMPOSIO_API_KEY is the project key (the
// only Composio secret on this machine).
export const COMPOSIO_API_KEY = env['COMPOSIO_API_KEY'] ?? ''
export const COMPOSIO_MCP_URL = env['COMPOSIO_MCP_URL'] ?? ''
export const COMPOSIO_USER_ID = env['COMPOSIO_USER_ID'] ?? (env['GOOGLE_USER_EMAIL'] ?? '')

// Semantic recall (gbrain). As of v1.0 the master switch is OPENAI_API_KEY (below):
// gbrain embeds with OpenAI text-embedding-3-small. VOYAGE_API_KEY is kept only as a
// legacy export for back-compat with older .env files; nothing reads it anymore.
// (Original note retained:) VOYAGE_API_KEY was the master switch: when present,
// bootstrap installs gbrain + flips NC_MEMORY_ENGINE to 'gbrain', and
// buildMemoryContext augments every reply with vault knowledge (hybrid vector +
// BM25 + typed-edge graph) via the local gbrain CLI. Empty key → MEMORY_ENGINE
// stays 'legacy' and nothing brain-related runs (identical to a no-recall install).
export const VOYAGE_API_KEY = env['VOYAGE_API_KEY'] ?? ''
export const MEMORY_ENGINE = (env['NC_MEMORY_ENGINE'] ?? 'legacy').trim().toLowerCase()

// Optional integrations
export const OPENAI_API_KEY = env['OPENAI_API_KEY'] ?? ''
export const GOOGLE_USER_EMAIL = env['GOOGLE_USER_EMAIL'] ?? ''
export const FIRECRAWL_API_KEY = env['FIRECRAWL_API_KEY'] ?? ''
export const EXA_API_KEY = env['EXA_API_KEY'] ?? ''
export const TAVILY_API_KEY = env['TAVILY_API_KEY'] ?? ''
export const APIFY_TOKEN = env['APIFY_TOKEN'] ?? ''

// Runtime constants
export const MAX_MESSAGE_LENGTH = 4096           // Telegram limit
export const TYPING_REFRESH_MS = 4000            // Refresh typing indicator every 4s
export const MEMORY_DELETE_THRESHOLD = 0.1       // Salience below this gets deleted
export const MEMORY_DAILY_DECAY = 0.98           // Salience multiplier per day
export const MEMORY_ACCESS_BOOST = 0.1           // Salience added on access, capped at 5.0
export const MEMORY_MAX_SALIENCE = 5.0
export const SCHEDULER_POLL_MS = 60000           // Check scheduled tasks every 60s
export const SESSION_TTL_MS = 48 * 60 * 60 * 1000  // Sessions expire after 48h
export const POLLING_STALL_CHECK_MS = 5 * 60 * 1000  // 5min
export const AUTH_REFRESH_MS = 12 * 60 * 60 * 1000   // 12h

// Dashboard
export const DASHBOARD_PORT = parseInt(env['DASHBOARD_PORT'] ?? '3000', 10)
// Install-generated bearer token gating the dashboard. The installer writes a
// random value into .env; an empty token disables the gate (dev/legacy only).
export const DASHBOARD_TOKEN = env['DASHBOARD_TOKEN'] ?? ''
