import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET, POST } from './route'
import { DELETE, PATCH } from './[memberId]/route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), listUsers: vi.fn(), getUserById: vi.fn(), generateLink: vi.fn(),
  updateUserById: vi.fn(), deleteUser: vi.fn(), from: vi.fn(), sendEmail: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: mocks }, from: mocks.from }) }))
vi.mock('@/lib/email', () => ({ sendAccountLinkEmail: mocks.sendEmail }))

type Write = { table: string; operation: string; value?: unknown }
let writes: Write[] = []
let memberships: Array<{ channel_id: string; role: string; user_id: string }> = []
let failure: { table: string; operation: string; transport?: boolean } | null = null
const target = { id: 'member-1', email: 'teammate@bytechsol.com', app_metadata: { role: 'member' }, user_metadata: { display_name: 'Teammate' }, created_at: '2026-11-09T12:00:00Z' }
const context = { params: Promise.resolve({ memberId: target.id }) }
const invite = (overrides: Record<string, unknown> = {}) => new Request('https://example.test/api/members', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ displayName: 'Teammate', email: target.email, accessRole: 'member', channelIds: ['room-1'], ...overrides }),
})
const update = (overrides: Record<string, unknown> = {}) => new Request(`https://example.test/api/members/${target.id}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'update', displayName: 'Teammate', jobTitle: 'Designer', role: 'member', channelIds: ['room-1'], ...overrides }),
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  writes = []
  memberships = [{ channel_id: 'room-1', user_id: target.id, role: 'member' }]
  failure = null
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'actor-1', email: 'manager@bytechsol.com', app_metadata: { role: 'admin' } } }, error: null })
  mocks.listUsers.mockResolvedValue({ data: { users: [] }, error: null })
  mocks.getUserById.mockResolvedValue({ data: { user: target }, error: null })
  mocks.generateLink.mockResolvedValue({ data: { user: target, properties: { action_link: 'https://example.test/invite' } }, error: null })
  mocks.updateUserById.mockResolvedValue({ data: { user: target }, error: null })
  mocks.deleteUser.mockResolvedValue({ data: { user: target }, error: null })
  mocks.sendEmail.mockResolvedValue(undefined)
  mocks.from.mockImplementation((table: string) => {
    let operation = 'select'
    const chain = {
      select: () => chain, eq: () => chain, is: () => chain, in: () => chain,
      upsert: (value: unknown) => { operation = 'upsert'; writes.push({ table, operation, value }); return chain },
      insert: (value: unknown) => { operation = 'insert'; writes.push({ table, operation, value }); return chain },
      update: (value: unknown) => { operation = 'update'; writes.push({ table, operation, value }); return chain },
      delete: () => { operation = 'delete'; writes.push({ table, operation }); return chain },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => {
        const failed = failure?.table === table && failure.operation === operation
        if (failed && failure?.transport) return Promise.reject(new Error('Network unavailable')).then(resolve, reject)
        return Promise.resolve({
          data: table === 'channels' ? [{ id: 'room-1' }, { id: 'room-2' }] : table === 'channel_members' ? memberships : null,
          error: failed ? { code: 'PGRST205', message: 'Store unavailable' } : null,
        }).then(resolve, reject)
      },
    }
    return chain
  })
})
afterEach(() => vi.restoreAllMocks())

describe('member administration safety', () => {
  it('allows CEOs but rejects an employee even if their editable metadata claims admin', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'ceo', email: 'ceo@bytechsol.com', app_metadata: { role: 'ceo' } } } })
    expect((await GET()).status).toBe(200)
    mocks.getUser.mockResolvedValueOnce({ data: { user: { id: 'employee', app_metadata: {}, user_metadata: { role: 'admin' } } } })
    expect((await GET()).status).toBe(403)
    expect(mocks.listUsers).toHaveBeenCalledOnce()
  })

  it('does not return empty channel access after a membership read fails', async () => {
    failure = { table: 'channel_members', operation: 'select' }
    expect((await GET()).status).toBe(500)
  })

  it('respects an explicitly empty channel selection on invitations', async () => {
    expect((await POST(invite({ channelIds: [] }))).status).toBe(201)
    expect(writes.filter(write => write.table === 'channel_members')).toEqual([])
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
  })

  it('maps CEO workspace access to a valid channel admin role', async () => {
    expect((await POST(invite({ accessRole: 'ceo' }))).status).toBe(201)
    expect(mocks.updateUserById).toHaveBeenCalledWith(target.id, expect.objectContaining({ app_metadata: expect.objectContaining({ role: 'ceo' }) }))
    expect(writes.find(write => write.table === 'channel_members')).toMatchObject({ value: [{ channel_id: 'room-1', user_id: target.id, role: 'admin' }] })
  })

  it('rolls back a newly created invite when its role cannot be provisioned', async () => {
    mocks.updateUserById.mockResolvedValueOnce({ error: { message: 'Role update failed' } })
    expect((await POST(invite())).status).toBe(500)
    expect(mocks.deleteUser).toHaveBeenCalledWith(target.id)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('never deletes or re-provisions an existing unconfirmed account', async () => {
    mocks.listUsers.mockResolvedValueOnce({ data: { users: [{ ...target, email_confirmed_at: null }] }, error: null })
    expect((await POST(invite())).status).toBe(409)
    expect(mocks.generateLink).not.toHaveBeenCalled()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('rolls back a new account when channel provisioning fails before email delivery', async () => {
    failure = { table: 'channel_members', operation: 'upsert' }
    expect((await POST(invite())).status).toBe(500)
    expect(mocks.deleteUser).toHaveBeenCalledWith(target.id)
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('keeps an invitation successful when the audit store is unavailable after sending', async () => {
    failure = { table: 'member_audit_logs', operation: 'insert', transport: true }
    expect((await POST(invite())).status).toBe(201)
    expect(mocks.sendEmail).toHaveBeenCalledOnce()
    expect(mocks.deleteUser).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalled()
  })

  it('validates existing memberships before changing account access', async () => {
    failure = { table: 'channel_members', operation: 'select' }
    expect((await PATCH(update({ role: 'ceo' }), context)).status).toBe(500)
    expect(mocks.updateUserById).not.toHaveBeenCalled()
    expect(writes).toEqual([])
  })

  it('preserves retained channel owners and adds valid roles without deleting retained rows', async () => {
    memberships[0].role = 'owner'
    expect((await PATCH(update({ role: 'ceo', channelIds: ['room-1', 'room-2'] }), context)).status).toBe(200)
    expect(writes.filter(write => write.table === 'channel_members')).toEqual([{ table: 'channel_members', operation: 'upsert', value: [{ channel_id: 'room-2', user_id: target.id, role: 'admin' }] }])
  })

  it('does not remove existing memberships when adding the requested new access fails', async () => {
    failure = { table: 'channel_members', operation: 'upsert' }
    expect((await PATCH(update({ channelIds: ['room-2'] }), context)).status).toBe(500)
    expect(writes.some(write => write.table === 'channel_members' && write.operation === 'delete')).toBe(false)
  })

  it('rejects unknown actions and protects the acting administrator from deletion', async () => {
    expect((await PATCH(update({ action: 'typo' }), context)).status).toBe(400)
    mocks.getUserById.mockResolvedValueOnce({ data: { user: { ...target, id: 'actor-1' } }, error: null })
    expect((await DELETE(new Request('https://example.test'), { params: Promise.resolve({ memberId: 'actor-1' }) })).status).toBe(400)
    expect(mocks.deleteUser).not.toHaveBeenCalled()
  })

  it('does not record a successful deletion when Auth refuses to delete the account', async () => {
    mocks.deleteUser.mockResolvedValueOnce({ error: { message: 'Deletion failed' } })
    expect((await DELETE(new Request('https://example.test'), context)).status).toBe(500)
    expect(writes.some(write => write.table === 'member_audit_logs')).toBe(false)
  })

  it('records a completed deletion without referencing its removed profile row', async () => {
    expect((await DELETE(new Request('https://example.test'), context)).status).toBe(200)
    expect(writes.find(write => write.table === 'member_audit_logs')).toMatchObject({ value: {
      target_id: null, action: 'delete', details: { email: target.email, deleted_user_id: target.id },
    } })
  })
})
