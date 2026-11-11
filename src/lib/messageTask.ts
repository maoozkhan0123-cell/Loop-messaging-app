import type { Message } from '@/types/database'

export type MessageTaskSource = { author: string; conversation: string; excerpt: string; url: string }

export function messagePermalink(channelId: string, messageId: string, isDM: boolean, origin = '') {
  return `${origin}/${isDM ? 'dm' : 'channel'}/${encodeURIComponent(channelId)}?message=${encodeURIComponent(messageId)}`
}

export function plainMessageText(body: string | null) {
  return (body ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_~`]+/g, '').replace(/^\s*#{1,6}\s+/gm, '').trim()
}

export function messageTaskDraft(message: Message, conversation: string, isDM: boolean, origin = '') {
  const text = plainMessageText(message.body)
  const fallback = message.attachments?.[0]?.file_name ? `Follow up on ${message.attachments[0].file_name}` : 'Follow up on this message'
  const title = (text.split(/\r?\n/).find((line) => line.trim()) ?? fallback).replace(/\s+/g, ' ').slice(0, 160)
  const source: MessageTaskSource = {
    author: message.profiles?.display_name ?? 'Unknown author', conversation,
    excerpt: text.length > 2400 ? `${text.slice(0, 2400)}…` : text || fallback,
    url: messagePermalink(message.channel_id, message.id, isDM, origin),
  }
  return { title, description: withMessageSource(source.excerpt, source), source }
}

/** Keep the source durable even when the editable description is replaced in the review form. */
export function withMessageSource(description: string | undefined, source: MessageTaskSource) {
  const text = description?.trim() ?? ''
  return text.includes(source.url) ? text : `${text}${text ? '\n\n' : ''}Source message from ${source.author} in ${source.conversation}:\n[Open source message](${source.url})`
}
