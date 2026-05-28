export interface Project { name: string; description: string; slug?: string }
export interface Person { name: string; role?: string; relationship?: string; slug?: string }
export interface Client { name: string; status: string; slug?: string }
export interface CustomPrefix { prefix: string; description: string }

export interface Bundle {
  // Screen 1 - About you (the only personalisation surface)
  name: string
  assistantName: string
  occupation: string
  bio: string

  // Silently defaulted - kept on the Bundle so bootstrap.js still has every field it expects
  timezone: string
  location: string
  age?: string
  values: string[]
  faith?: string
  communicationStyle: 'blunt' | 'warm' | 'formal' | 'casual'
  language: 'AU' | 'US' | 'UK' | 'other'

  role: string
  company: string
  industry: string
  projects: Project[]
  targetCustomer: string
  services: string[]
  tools: string[]

  teamMembers: Person[]
  clients: Client[]
  mentors: Person[]

  vaultPreset: 'nello' | 'para' | 'zettelkasten' | 'custom'
  vaultPath: string
  customPrefixes?: CustomPrefix[]
  graphifyEnabled: boolean

  emDashPolicy: 'never' | 'sparingly' | 'free'
  oxfordComma: boolean
  bannedWords: string[]
  enableHumanizer: boolean
  enableKarpathyGuidelines: boolean
  enableAiHumanizer: boolean

  // Screens 2 + 3 - the keys we still ask for
  keys: Record<string, string>
  mcps: {
    google?: boolean
    obsidian?: boolean
    exa?: boolean
  }

  installTelegram: boolean
  installDashboard: boolean
  installLaunchAgent: boolean
  enableMorningBrief: boolean
  morningBriefPrompt: string
  morningBriefCron: string
  enableAutoFetch: boolean
  autoFetchCron: string
  voiceSource: 'online' | 'local' | 'off'
  skillPack: string[]
  optionalSkills: string[]

  platform: Platform
}

export type Screen = 0 | 1 | 2 | 3

export type Platform = 'mac' | 'windows' | 'linux'
