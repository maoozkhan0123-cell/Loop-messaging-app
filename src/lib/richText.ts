// Converts between the composer's rich-text DOM and the markdown we store in messages.
// The stored format is what formatMessage() renders: **bold**, _italic_, ~~strike~~,
// `code`, ```blocks```, [links](url), "- " / "1. " lists and "> " quotes.

const ZERO_WIDTH = /​/g

/** Puts markers around the text while keeping surrounding spaces outside them. */
function wrap(text: string, marker: string, end = marker) {
  const match = text.match(/^(\s*)([\s\S]*?)(\s*)$/)
  if (!match || !match[2]) return text
  return `${match[1]}${marker}${match[2]}${end}${match[3]}`
}

function isBold(el: HTMLElement) {
  const weight = el.style?.fontWeight
  return ['B', 'STRONG'].includes(el.tagName) || weight === 'bold' || Number(weight) >= 600
}
function isItalic(el: HTMLElement) { return ['I', 'EM'].includes(el.tagName) || el.style?.fontStyle === 'italic' }
function isStrike(el: HTMLElement) { return ['S', 'STRIKE', 'DEL'].includes(el.tagName) || /line-through/.test(el.style?.textDecoration ?? '') }

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(ZERO_WIDTH, '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  if (el.tagName === 'BR') return '\n'
  if (['DIV', 'P', 'UL', 'OL', 'BLOCKQUOTE', 'PRE'].includes(el.tagName)) return blocks(el)
  if (el.tagName === 'CODE') return wrap((el.textContent ?? '').replace(ZERO_WIDTH, ''), '`')
  let text = Array.from(el.childNodes).map(inline).join('')
  if (el.tagName === 'A') {
    const href = el.getAttribute('href') ?? ''
    return /^(https?:\/\/|mailto:)/i.test(href) ? (text.trim() && text !== href ? `[${text}](${href})` : href) : text
  }
  if (isStrike(el)) text = wrap(text, '~~')
  if (isItalic(el)) text = wrap(text, '_')
  if (isBold(el)) text = wrap(text, '**')
  return text
}

function blocks(root: HTMLElement): string {
  const out: string[] = []
  let line = ''
  const flush = () => { out.push(line); line = '' }
  for (const node of Array.from(root.childNodes)) {
    const el = node as HTMLElement
    const tag = node.nodeType === Node.ELEMENT_NODE ? el.tagName : ''
    if (tag === 'UL' || tag === 'OL') {
      if (line) flush()
      Array.from(el.children).forEach((item, index) => out.push(`${tag === 'OL' ? `${index + 1}. ` : '- '}${inline(item).replace(/\n+$/, '').replace(/\n/g, ' ')}`))
    } else if (tag === 'BLOCKQUOTE') {
      if (line) flush()
      blocks(el).replace(/\n+$/, '').split('\n').forEach((quoteLine) => out.push(`> ${quoteLine}`))
    } else if (tag === 'PRE') {
      if (line) flush()
      out.push('```', (el.textContent ?? '').replace(ZERO_WIDTH, '').replace(/\n$/, ''), '```')
    } else if (tag === 'DIV' || tag === 'P' || tag === 'LI') {
      if (line) flush()
      const inner = Array.from(el.childNodes).length === 1 && (el.firstChild as HTMLElement)?.tagName === 'BR' ? '' : blocks(el).replace(/\n$/, '')
      out.push(inner)
    } else {
      line += inline(node)
    }
  }
  if (line) flush()
  return out.join('\n')
}

/** Reads the composer's DOM into the stored markdown format. */
export function htmlToMarkdown(root: HTMLElement): string {
  return blocks(root).replace(/\n{3,}/g, '\n\n').replace(/^\n+|\s+$/g, '')
}

function escapeHtml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function inlineHtml(text: string) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
    .replace(/~~([^~\n]+)~~/g, '<strike>$1</strike>')
    .replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<i>$2</i>')
    .replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/g, '<a href="$2">$1</a>')
}

/** Builds composer HTML from stored markdown (used for drafts and failed sends). */
export function markdownToHtml(markdown: string): string {
  if (!markdown) return ''
  const lines = markdown.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length;) {
    const line = lines[i]
    if (line.trim() === '```') {
      const code: string[] = []
      i++
      while (i < lines.length && lines[i].trim() !== '```') code.push(lines[i++])
      i++
      out.push(`<pre>${escapeHtml(code.join('\n'))}</pre>`)
    } else if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(inlineHtml(lines[i++].replace(/^>\s?/, '')))
      out.push(`<blockquote>${quote.join('<br>')}</blockquote>`)
    } else if (/^\s*[-*•]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d/.test(line)
      const pattern = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*•]\s+/
      const items: string[] = []
      while (i < lines.length && pattern.test(lines[i])) items.push(`<li>${inlineHtml(lines[i++].replace(pattern, ''))}</li>`)
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`)
    } else {
      out.push(`<div>${inlineHtml(line) || '<br>'}</div>`)
      i++
    }
  }
  return out.join('')
}
