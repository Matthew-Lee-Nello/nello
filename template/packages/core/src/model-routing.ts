/**
 * Model routing hints.
 *
 * Skills declare `model_hint: <kind>` in their SKILL.md frontmatter. A runtime
 * caller (or any one-shot SDK call that picks its own model — e.g. dashboard
 * chat title generation) resolves the hint to a concrete Anthropic model ID.
 *
 * This is metadata-first: the Claude Code SDK runs one model per session, so
 * skill hints are advisory for in-session work. The resolver is used directly
 * by call sites that DO pick a model (cheap one-shots, summarisers).
 *
 * Add new hints sparingly. Keep the surface tight.
 */

export type ModelHint = 'fast' | 'reasoning' | 'vision' | 'code' | 'summarize'

const HINT_TO_MODEL: Record<ModelHint, string> = {
  fast:      'claude-haiku-4-5',
  reasoning: 'claude-opus-4-7',
  vision:    'claude-sonnet-4-6',
  code:      'claude-sonnet-4-6',
  summarize: 'claude-haiku-4-5',
}

const DEFAULT_MODEL = 'claude-sonnet-4-6'

export function hintToModel(hint: string | undefined | null): string {
  if (!hint) return DEFAULT_MODEL
  return HINT_TO_MODEL[hint as ModelHint] ?? DEFAULT_MODEL
}
