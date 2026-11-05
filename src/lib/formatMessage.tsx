import { Fragment, type ReactNode } from 'react'

// Slack-style message formatting rendered as React elements (never raw HTML).
// Supports **bold**, _italic_ / *italic*, ~~strike~~, `code`, ```code blocks```,
// [links](url), bare URLs, "> " quotes, "- " bullets and "1. " numbered lists, and @Name mentions.

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(~~[^~\n]+~~)|(_[^_\n]+_)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((?:https?:\/\/|mailto:)[^)\s]+\))|((?:https?:\/\/)[^\s<]+[^\s<.,;:!?)\]'"])|((?<![\w@])@[A-Z][A-Za-z.'-]*(?: [A-Z][A-Za-z.'-]*)?)/g

function safeHref(url: string) {
  return /^(https?:\/\/|mailto:)/i.test(url) ? url : undefined
}

type FormatOptions = { /** The reader's display name: mentions of them are highlighted. */ me?: string }

function renderInline(text: string, key: string, options: FormatOptions = {}): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    if (start > last) out.push(text.slice(last, start))
    const token = match[0]
    const k = `${key}-${index++}`
    if (match[1]) out.push(<code key={k} className="rounded bg-[#F3F4F6] px-1 py-0.5 font-mono text-[12.5px] text-[#E01E5A]">{token.slice(1, -1)}</code>)
    else if (match[2]) out.push(<strong key={k} className="font-bold">{renderInline(token.slice(2, -2), k, options)}</strong>)
    else if (match[3]) out.push(<s key={k}>{renderInline(token.slice(2, -2), k, options)}</s>)
    else if (match[4] || match[5]) out.push(<em key={k}>{renderInline(token.slice(1, -1), k, options)}</em>)
    else if (match[8]) {
      const isMe = !!options.me && token.slice(1).toLowerCase() === options.me.toLowerCase()
      out.push(<span key={k} className={isMe ? 'rounded bg-amber-100 px-0.5 font-semibold text-amber-900' : 'rounded bg-[#EBF5FF] px-0.5 font-semibold text-[#1D6FD6]'}>{token}</span>)
    }
    else if (match[6]) {
      const [, label, url] = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/) ?? []
      out.push(<a key={k} href={safeHref(url)} target="_blank" rel="noreferrer noopener" className="text-[#3589FA] hover:underline">{label}</a>)
    } else out.push(<a key={k} href={safeHref(token)} target="_blank" rel="noreferrer noopener" className="break-all text-[#3589FA] hover:underline">{token}</a>)
    last = start + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function renderLines(text: string, key: string, options: FormatOptions = {}): ReactNode[] {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const k = `${key}-${i}`
    if (/^>\s?/.test(line)) {
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''))
      out.push(<blockquote key={k} className="my-0.5 border-l-4 border-[#D1D5DB] pl-3 text-[#4B5563]">{quote.map((q, n) => <Fragment key={n}>{n > 0 && <br />}{renderInline(q, `${k}-${n}`, options)}</Fragment>)}</blockquote>)
      continue
    }
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*•]\s+/, ''))
      out.push(<ul key={k} className="my-0.5 list-disc pl-6">{items.map((item, n) => <li key={n}>{renderInline(item, `${k}-${n}`, options)}</li>)}</ul>)
      continue
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      const first = Number(line.match(/\d+/)?.[0] ?? 1)
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''))
      out.push(<ol key={k} start={first} className="my-0.5 list-decimal pl-6">{items.map((item, n) => <li key={n}>{renderInline(item, `${k}-${n}`, options)}</li>)}</ol>)
      continue
    }
    out.push(<Fragment key={k}>{renderInline(line, k, options)}{i < lines.length - 1 && <br />}</Fragment>)
    i++
  }
  return out
}

export function formatMessage(body: string, options: FormatOptions = {}): ReactNode {
  const parts = body.split(/```/)
  // Odd parts sit between ``` fences; an unclosed fence is shown as plain text.
  const closed = parts.length % 2 === 1
  return parts.map((part, index) => {
    if (index % 2 === 1 && (closed || index < parts.length - 1)) {
      return <pre key={index} className="my-1 overflow-x-auto whitespace-pre rounded-lg border border-[#E5E7EB] bg-[#F8FAFC] p-3 font-mono text-[12.5px] leading-5 text-[#1F2937]">{part.replace(/^\n/, '').replace(/\n$/, '')}</pre>
    }
    const text = index % 2 === 1 ? '```' + part : part
    return <Fragment key={index}>{renderLines(index > 0 ? text.replace(/^\n/, '') : text, String(index), options)}</Fragment>
  })
}
