/**
 * Conversation summariser for /compact.
 *
 * The product core ships no standalone embedding/LLM client, so we reuse the
 * existing Claude Code agent (runAgent) with a fresh throwaway session to
 * produce the summary. Heavier than a dedicated small model, but zero new deps
 * and always available wherever the agent runs.
 */
import { runAgent } from './agent.js'

export function isSummariserAvailable(): boolean {
  return true
}

export async function summariseConversation(transcript: string): Promise<string> {
  const prompt =
    'Summarise the following conversation into 3 to 6 terse bullet points capturing ' +
    'durable facts, decisions made, open threads, and the current goal. Output only ' +
    '"- " bullets, no preamble, no headers.\n\nConversation:\n' +
    transcript.slice(0, 24000)

  // No sessionId => a fresh, throwaway session. We ignore the returned session id.
  const result = await runAgent(prompt)
  const text = (result.text || '').trim()
  if (!text) throw new Error('summariser returned empty')
  return text
}
