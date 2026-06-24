/**
 * gbrain semantic recall.
 *
 * Shells out to the local gbrain CLI (`garrytan/gbrain`, a Bun tool) to pull
 * relevant vault knowledge - hybrid vector + BM25 + typed-edge graph - so the
 * assistant's reply is grounded in what it actually knows about the owner's
 * people, clients, deals and concepts, not just recent conversation.
 *
 * Ported verbatim in spirit from nello-workspace/src/brain.ts. A hard timeout +
 * a silent fallback means a slow or absent brain NEVER blocks a reply. Gated by
 * NC_MEMORY_ENGINE=gbrain (config MEMORY_ENGINE), which bootstrap only sets when
 * a VOYAGE_API_KEY is present. `gbrain query --no-expand` needs only the Voyage
 * key (it skips the OpenAI expansion/chat models).
 */
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { VOYAGE_API_KEY, OPENAI_API_KEY } from './config.js'

// Absolute bin + an explicit PATH: the daemon runs under launchd/systemd with a
// minimal environment, so we cannot rely on the shell PATH finding gbrain. gbrain
// is a Bun global, so it lives in ~/.bun/bin (NOT the npm global bin).
const GBRAIN_BIN = join(homedir(), '.bun', 'bin', 'gbrain')
const GBRAIN_PATH = [
  join(homedir(), '.bun', 'bin'),
  join(homedir(), '.local', 'bin'),
  '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
].join(':')

/**
 * Query the brain. Returns up to `k` short knowledge snippets, or [] on any
 * error/timeout (never throws). Output of `gbrain query --no-expand` is a ranked
 * list of "[score] slug -- snippet text" lines.
 */
export function gbrainSearch(query: string, k = 4, timeoutMs = 4000): Promise<string[]> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: string[]) => { if (!settled) { settled = true; resolve(v) } }
    try {
      execFile(
        GBRAIN_BIN,
        // --source-id default scopes recall to the client's vault (the 'default'
        // source). Explicit + future-proof: if reference corpora are ever added as
        // other gbrain sources, a no-source query could auto-nudge to one and
        // pollute personal recall. Harmless when 'default' is the only source.
        ['query', query.slice(0, 500), '--no-expand', '--source-id', 'default'],
        {
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
          env: { PATH: GBRAIN_PATH, HOME: homedir(), VOYAGE_API_KEY, OPENAI_API_KEY },
        },
        (err, stdout) => {
          if (err || !stdout) return done([])
          done(parseSnippets(stdout, k))
        },
      )
    } catch {
      done([])
    }
  })
}

// A gbrain hit spans multiple lines: a "[score] slug -- <heading>" header line,
// then the snippet BODY wrapped across the following line(s), then a blank line
// before the next hit. The naive line-by-line match kept only the header's
// heading and dropped the body - gutting the snippet. Accumulate the header text
// + every continuation line up to the next header or a blank line.
const HEADER_RE = /^\s*\[[\d.]+\]\s+(\S+)\s+--\s+(.+)$/
function parseSnippets(stdout: string, k: number): string[] {
  const out: string[] = []
  const lines = stdout.split('\n')
  let i = 0
  while (i < lines.length && out.length < k) {
    const m = lines[i].match(HEADER_RE)
    if (!m) { i++; continue }
    const slug = m[1]
    let text = m[2].trim()
    let j = i + 1
    while (j < lines.length && lines[j].trim() !== '' && !HEADER_RE.test(lines[j])) {
      text += ' ' + lines[j].trim()
      j++
    }
    text = text.replace(/\s+/g, ' ').trim()
    if (text) out.push(`${slug}: ${text}`.slice(0, 300))
    i = j
  }
  return out
}
