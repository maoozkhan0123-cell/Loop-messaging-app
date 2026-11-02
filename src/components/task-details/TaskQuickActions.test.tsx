import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { taskDetailsFromProjectTask } from '@/lib/taskMutations'
import { TaskQuickActions } from './TaskQuickActions'

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver',ResizeObserverStub)

const task=taskDetailsFromProjectTask({
  id:'task-1',
  board_id:'board-1',
  column_id:'column-1',
  title:'Test task',
  description:null,
  priority:'medium',
  due_date:null,
  assignee_id:null,
  created_by:'user-1',
  position:0,
  created_at:'2026-11-02T12:00:00.000Z',
},{status:'todo'})

function props() {
  return {
    task,
    members:[{id:'user-1',name:'Ada Lovelace',initials:'AL'}],
    labels:[],
    allLabels:[],
    allTasks:[task],
    dependencies:[],
    onAssignee:vi.fn(),
    onCreateLabel:vi.fn(),
    onAddLabel:vi.fn(),
    onRemoveLabel:vi.fn(),
    onUpdateLabel:vi.fn(),
    onDeleteLabel:vi.fn(),
    onDates:vi.fn(),
    onPriority:vi.fn(),
    onEstimate:vi.fn(),
    onChecklist:vi.fn(),
    onAttachment:vi.fn(),
    onDependency:vi.fn(),
  }
}

describe('TaskQuickActions',() => {
  it('forwards Radix trigger behavior so quick-action popovers open',() => {
    render(<TaskQuickActions {...props()}/>)

    fireEvent.click(screen.getByRole('button',{name:'Assignees'}))

    expect(screen.getByRole('heading',{name:'Assignees'})).toBeInTheDocument()
    expect(screen.getByRole('button',{name:/Ada Lovelace/})).toBeInTheDocument()
  })
})
