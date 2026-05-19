import type { Bundle } from './types'

export const DEFAULT_BUNDLE: Bundle = {
  // User-entered (Screen 1)
  name: '',
  assistantName: '',
  occupation: '',
  bio: '',

  // Silently defaulted - assistant fills these in over time via auto-memory + conversation
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  location: '',
  values: [],
  communicationStyle: 'blunt',
  language: 'AU',

  role: '',
  company: '',
  industry: '',
  projects: [],
  targetCustomer: '',
  services: [],
  tools: [],

  teamMembers: [],
  clients: [],
  mentors: [],

  vaultPreset: 'nello',
  vaultPath: '',
  graphifyEnabled: true,

  emDashPolicy: 'never',
  oxfordComma: false,
  bannedWords: [],
  enableHumanizer: true,
  enableKarpathyGuidelines: true,
  enableAiHumanizer: true,

  // User-entered (Screen 2 - Connections)
  keys: {},

  // Four integrations the install ships with. Connections that work without
  // keys (Obsidian) + the ones we collect keys for (Google, Exa).
  // Telegram lives outside this map; it's a bot, not an MCP.
  mcps: {
    google: true,
    exa: true,
    obsidian: true,
  },

  // Surfaces - all on, no user choice
  installTelegram: true,
  installDashboard: true,
  installLaunchAgent: true,
  enableMorningBrief: true,
  morningBriefPrompt: 'Morning brief. 3 lines max per section.\n1. What matters today (Inbox + today\'s journal)\n2. Calendar top 3\n3. Open loops to close',
  morningBriefCron: '0 9 * * *',

  // Auto-fetch: every 20 minutes, walk active MCP connections (Gmail, Calendar,
  // Drive) and fold new items into vault/Inbox.md with provenance + dedup.
  // Same machinery as the morning brief, just on a tighter cadence.
  enableAutoFetch: true,
  autoFetchCron: '*/20 * * * *',

  // Voice: local TTS by default. voice-local package handles platform detection;
  // on non-Mac it falls back to off gracefully.
  voiceSource: 'local',

  // Mirror of template/skills/ — keep in sync when adding/removing bundled
  // skills. The bootstrap symlinker reads the directory directly (it does not
  // consult this list); this array is informational for the wizard summary
  // + docs. Audit reads template/skills/ at runtime to avoid drift.
  skillPack: [
    'auto-fetch', 'cron', 'diagnose', 'find-skill', 'grill-me', 'install-doctor',
    'karpathy-guidelines', 'nello-build', 'nello-start', 'research',
    'to-prd', 'tool-rules', 'write-skill', 'zoom-out',
  ],
  optionalSkills: [],

  platform: 'mac',
}
