import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SignupPage from './page'

const mocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), fetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }))
vi.mock('next/image', () => ({ default: ({ alt }: { alt: string }) => <span>{alt}</span> }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', mocks.fetch)
  mocks.fetch.mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, redirectTo: '/login' }), { status: 200 }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('SignupPage verification', () => {
  it('keeps the password off the send-code request and honors the server login redirect after verification', async () => {
    render(<SignupPage />)
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'New Teammate' } })
    fireEvent.change(screen.getByLabelText('Work email'), { target: { value: 'NEW@BYTECHSOL.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Example-test-password1!' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Verification Code' }))
    const code = await screen.findByLabelText('6-Digit Code')
    const firstPayload = JSON.parse(mocks.fetch.mock.calls[0][1].body)
    expect(firstPayload).toEqual({ email: 'new@bytechsol.com', displayName: 'New Teammate' })
    expect(firstPayload).not.toHaveProperty('password')
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify & Create Account' }))
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login'))
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toEqual({ email: 'new@bytechsol.com', code: '123456', password: 'Example-test-password1!' })
    expect(mocks.refresh).toHaveBeenCalledOnce()
  })
})
