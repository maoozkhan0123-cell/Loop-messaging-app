import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RightSidebar } from './RightSidebar'
import type { Profile } from '@/types/database'

const profiles = [
  { id: 'a', display_name: 'Amina', email: 'a@example.com', avatar_url: null, job_title: 'Designer', status: 'online', created_at: '' },
  { id: 'b', display_name: 'Bilal', email: 'b@example.com', avatar_url: null, job_title: null, status: 'away', created_at: '' },
  { id: 'c', display_name: 'Cara', email: 'c@example.com', avatar_url: null, job_title: null, status: 'offline', created_at: '' },
] as Profile[]

describe('RightSidebar presence', () => {
  it('groups presence correctly and messages the selected member', () => {
    const message = vi.fn().mockResolvedValue(undefined)
    render(<RightSidebar tasks={[]} boards={[]} columns={[]} profiles={profiles} onCreateTask={vi.fn()} onOpenTask={vi.fn()} onMessageMember={message} onViewTeam={vi.fn()} />)
    expect(screen.getByText('Online now (1)')).toBeInTheDocument()
    expect(screen.getByText('Away')).toBeInTheDocument()
    expect(screen.getByText('Offline')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Message Bilal' }))
    expect(message).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }))
  })
})
