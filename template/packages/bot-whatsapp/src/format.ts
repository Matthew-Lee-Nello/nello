/**
 * Convert Markdown to WhatsApp's tiny markup.
 * WhatsApp supports: *bold*, _italic_, ~strike~, ```mono```.
 * Anything else is left as plain text.
 */
export function formatForWhatsApp(text: string): string {
  if (!text) return ''
  let t = text
  // **bold** / __bold__ -> *bold*
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
  t = t.replace(/__([^_\n]+)__/g, '*$1*')
  // Markdown headings -> a bold line
  t = t.replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
  // Links [text](url) -> text (url)
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
  // Horizontal rules -> drop
  t = t.replace(/^[-*]{3,}$/gm, '')
  return t.trim()
}

/**
 * Split text into chunks at or below `limit` without breaking words.
 * Same logic as the Telegram splitter; WhatsApp's ceiling is much higher but
 * we keep chunks readable.
 */
export function splitMessage(text: string, limit = 4096): string[] {
  if (text.length <= limit) return [text]

  const chunks: string[] = []
  let cursor = 0

  while (cursor < text.length) {
    const end = Math.min(cursor + limit, text.length)
    if (end === text.length) { chunks.push(text.slice(cursor)); break }

    let split = text.lastIndexOf('\n', end)
    if (split <= cursor) split = text.lastIndexOf(' ', end)
    if (split <= cursor) split = end

    chunks.push(text.slice(cursor, split))
    cursor = split
    while (text[cursor] === '\n' || text[cursor] === ' ') cursor++
  }

  return chunks
}
