import { readFileSync, renameSync, existsSync } from 'node:fs'
import { basename } from 'node:path'
import { GROQ_API_KEY } from '@nello/core'

/**
 * Transcribe audio via Groq Whisper.
 * Renames .oga to .ogg (Groq won't accept .oga).
 */
export async function transcribeAudio(filePath: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')

  let path = filePath
  if (path.endsWith('.oga')) {
    const renamed = path.slice(0, -4) + '.ogg'
    renameSync(path, renamed)
    path = renamed
  }
  if (!existsSync(path)) throw new Error(`audio file not found: ${path}`)

  const buffer = readFileSync(path)
  const filename = basename(path)

  const boundary = `----NCBoundary${Date.now()}`
  const parts: Buffer[] = []

  const field = (name: string, value: string) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf-8')

  parts.push(field('model', 'whisper-large-v3'))
  parts.push(field('response_format', 'text'))

  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: audio/ogg\r\n\r\n`,
    'utf-8'
  ))
  parts.push(buffer)
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8'))

  const body = Buffer.concat(parts)

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Groq ${res.status}: ${text}`)
  }

  return (await res.text()).trim()
}

export function voiceCapabilities(): { stt: boolean; tts: boolean } {
  // Online voice = Groq STT only. TTS lives in @nello/voice-local (Piper).
  return { stt: !!GROQ_API_KEY, tts: false }
}
