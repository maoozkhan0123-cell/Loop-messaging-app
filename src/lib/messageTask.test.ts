import { describe, expect, it } from 'vitest'
import { messageTaskDraft, messagePermalink, withMessageSource } from './messageTask'
import type { Message } from '@/types/database'

describe('message task drafts', () => {
  it('prefills plain editable context with the exact reply permalink and author', () => {
    const draft = messageTaskDraft({ id: 'reply', channel_id: 'channel', parent_id: 'root', body: '**Fix the [checkout](https://example.com)**\nBefore Friday', profiles: { display_name: 'Hanan' } } as Message, '#Release', false, 'https://loop.example')
    expect(draft.title).toBe('Fix the checkout')
    expect(draft.description).toContain('Fix the checkout\nBefore Friday')
    expect(draft.description).toContain('Source message from Hanan in #Release:')
    expect(draft.source.url).toBe('https://loop.example/channel/channel?message=reply')
  })

  it('provides a useful attachment-only title and a DM route', () => {
    const draft = messageTaskDraft({ id: 'message', channel_id: 'dm', body: null, attachments: [{ file_name: 'Brief.pdf' }] } as Message, 'Hanan', true)
    expect(draft.title).toBe('Follow up on Brief.pdf')
    expect(draft.source.url).toBe('/dm/dm?message=message')
    expect(messagePermalink('channel /', 'id?', false)).toBe('/channel/channel%20%2F?message=id%3F')
  })

  it('bounds long context and preserves a durable backlink after description edits without duplication', () => {
    const draft = messageTaskDraft({ id: 'message', channel_id: 'channel', body: 'x'.repeat(4000) } as Message, '#General', false)
    expect(draft.title).toHaveLength(160)
    expect(draft.source.excerpt).toHaveLength(2401)
    const edited = withMessageSource('My edited requirements', draft.source)
    expect(edited).toContain('My edited requirements')
    expect(edited).toContain(draft.source.url)
    expect(withMessageSource(edited, draft.source)).toBe(edited)
  })
})
