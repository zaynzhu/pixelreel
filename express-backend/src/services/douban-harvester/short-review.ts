const HELPFUL_MARKUP_PATTERN = /<span\b[^>]*class\s*=\s*["'][^"']*\bpl\b[^"']*["'][^>]*>[\s\S]*?<\/span>/gi
const HELPFUL_TEXT_PATTERN = /\s*[（(]\s*\d+\s*有用\s*[)）]\s*$/u

export function normalizeDoubanShortReview(value: string | null | undefined) {
  if (!value) return null

  const lines = value
    .replace(HELPFUL_MARKUP_PATTERN, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;|&#160;|&#xA0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(HELPFUL_TEXT_PATTERN, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.trim())

  while (lines[0] === "") lines.shift()
  while (lines.at(-1) === "") lines.pop()

  const normalized = lines.join("\n").replace(/\n{3,}/g, "\n\n")
  return normalized || null
}
