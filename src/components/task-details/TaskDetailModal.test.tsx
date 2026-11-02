import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskDetailModal } from './TaskDetailModal'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver',ResizeObserverStub)

const createdAt='2026-11-02T12:00:00.000Z'
const task:ProjectTask={id:'modal-smoke-task',board_id:'board-1',column_id:'column-1',title:'Enterprise task workspace',description:'Initial details',priority:'medium',due_date:null,assignee_id:null,created_by:'user-1',position:0,created_at:createdAt}
const columns:ProjectColumn[]=[{id:'column-1',board_id:'board-1',name:'To Do',position:0,created_at:createdAt},{id:'column-2',board_id:'board-1',name:'In Progress',position:1,created_at:createdAt}]
const boards:ProjectBoard[]=[{id:'board-1',name:'Product',description:null,created_by:'user-1',created_at:createdAt,archived_at:null}]
const profile:Profile={id:'user-1',display_name:'Ada Lovelace',email:'ada@example.com',avatar_url:null,job_title:'Engineer',status:'online',created_at:createdAt}

describe('TaskDetailModal',() => {
  it('renders the integrated workspace and opens real task actions',async () => {
    render(<TaskDetailModal task={task} columns={columns} boards={boards} availableTasks={[task]} teamProfiles={[profile]} currentProfile={profile} initialComments={[]} onClose={vi.fn()} onUpdate={vi.fn().mockResolvedValue(task)} onDelete={vi.fn().mockResolvedValue(undefined)} onDuplicate={vi.fn().mockResolvedValue({...task,id:'copy-1'})} onMove={vi.fn().mockResolvedValue(task)} onAddComment={vi.fn()}/>)

    expect(await screen.findByRole('dialog',{name:'Enterprise task workspace'})).toBeInTheDocument()
    expect(screen.getByText('Initial details')).toBeInTheDocument()
    expect(screen.getByRole('combobox',{name:'Workflow status'})).toHaveValue('column-1')

    fireEvent.pointerDown(screen.getByRole('button',{name:'More task actions'}),{button:0,ctrlKey:false})
    expect(await screen.findByRole('menuitem',{name:'Duplicate task'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem',{name:/Archive & trash recovery/})).toBeInTheDocument()
  })
})
