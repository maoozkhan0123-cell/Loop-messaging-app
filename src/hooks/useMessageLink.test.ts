import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLinkedMessage } from './useMessageLink'
import type { Message } from '@/types/database'

const CHANNEL = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const ROOT = '11111111-1111-1111-1111-111111111111'
const REPLY = '22222222-2222-2222-2222-222222222222'
const BEFORE = '00000000-0000-0000-0000-000000000000'
const AFTER = '33333333-3333-3333-3333-333333333333'
const message = (id: string, parentId: string | null = null) => ({ id, channel_id: CHANNEL, parent_id: parentId, user_id: 'author', body: id, created_at: '2026-11-11T10:00:00+00:00', deleted_at: null }) as Message
type Result = { data: unknown; error: unknown }
let queue: Result[]
let queries: Array<{ table: string; eq: ReturnType<typeof vi.fn>; is: ReturnType<typeof vi.fn>; or: ReturnType<typeof vi.fn>; order: ReturnType<typeof vi.fn>; limit: ReturnType<typeof vi.fn> }>
let supabase: Parameters<typeof fetchLinkedMessage>[0]

beforeEach(() => {
  queue = []
  queries = []
  supabase = { from: vi.fn((table: string) => {
    const result = queue.shift()
    if (!result) throw new Error(`Unexpected query: ${table}`)
    const query = {
      table, select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), in: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue(result),
      then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
    }
    queries.push(query)
    return query
  }) } as unknown as Parameters<typeof fetchLinkedMessage>[0]
})
const ok = (data: unknown): Result => ({ data, error: null })

describe('message permalink resolution', () => {
  it('loads a bounded chronological window around an old message with a deterministic ID tie-break', async () => {
    queue = [ok(message(ROOT)), ok([message(BEFORE)]), ok([message(AFTER)]), ok([{ id: 'author', display_name: 'Hanan' }])]
    const result = await fetchLinkedMessage(supabase, CHANNEL, ROOT)
    expect(result.rootContext.map((item) => item.id)).toEqual([BEFORE, ROOT, AFTER])
    expect(result.target.profiles?.display_name).toBe('Hanan')
    expect(queries).toHaveLength(4)
    for (const query of queries.filter((item) => item.table === 'messages')) {
      expect(query.eq).toHaveBeenCalledWith('channel_id', CHANNEL)
      expect(query.is).toHaveBeenCalledWith('deleted_at', null)
    }
    expect(queries[1].limit).toHaveBeenCalledWith(15)
    expect(queries[2].limit).toHaveBeenCalledWith(15)
    expect(queries[1].or).toHaveBeenCalledWith(expect.stringContaining(`id.lt.${ROOT}`))
    expect(queries[2].or).toHaveBeenCalledWith(expect.stringContaining(`id.gt.${ROOT}`))
    expect(queries[1].order).toHaveBeenCalledWith('id', { ascending: false })
    expect(queries[2].order).toHaveBeenCalledWith('id', { ascending: true })
  })

  it('resolves an old thread reply and its root with separate bounded context windows', async () => {
    queue = [ok(message(REPLY, ROOT)), ok(message(ROOT)), ok([]), ok([]), ok([message(BEFORE, ROOT)]), ok([message(AFTER, ROOT)]), ok([])]
    const result = await fetchLinkedMessage(supabase, CHANNEL, REPLY)
    expect(result.root.id).toBe(ROOT)
    expect(result.target.id).toBe(REPLY)
    expect(result.replyContext?.map((item) => item.id)).toEqual([BEFORE, REPLY, AFTER])
    expect(queries).toHaveLength(7)
    expect(queries[4].eq).toHaveBeenCalledWith('parent_id', ROOT)
    expect(queries[5].eq).toHaveBeenCalledWith('parent_id', ROOT)
    expect(queries[2].is).toHaveBeenCalledWith('parent_id', null)
  })

  it.each([ok(null), { data: null, error: { code: '42501', message: 'private details' } }])('keeps deleted, inaccessible and cross-channel targets generic', async (result) => {
    queue = [result]
    await expect(fetchLinkedMessage(supabase, CHANNEL, ROOT)).rejects.toThrow('This message is unavailable or you no longer have access to it.')
    expect(queries).toHaveLength(1)
  })

  it('does not expose a reply when its parent is inaccessible', async () => {
    queue = [ok(message(REPLY, ROOT)), ok(null)]
    await expect(fetchLinkedMessage(supabase, CHANNEL, REPLY)).rejects.toThrow('This message is unavailable or you no longer have access to it.')
    expect(queries).toHaveLength(2)
  })

  it('rejects malformed IDs without querying workspace data', async () => {
    await expect(fetchLinkedMessage(supabase, CHANNEL, 'invalid-link')).rejects.toThrow('This message link is invalid.')
    expect(queries).toEqual([])
  })
})
