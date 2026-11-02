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
    const componentProps=props()
    render(<TaskQuickActions {...componentProps}/>)

    fireEvent.click(screen.getByRole('button',{name:'Assignees'}))

    expect(screen.getByRole('heading',{name:'Assignees'})).toBeInTheDocument()
    const member=screen.getByRole('button',{name:/Ada Lovelace/})
    expect(member).toHaveAttribute('aria-pressed','false')
    fireEvent.click(member)
    expect(componentProps.onAssignee).toHaveBeenCalledWith('user-1',false)
  })

  it('opens the label popover and delegates assignment by stable label ID',() => {
    const componentProps=props()
    const allLabels=[{id:'label-1',name:'Needs review',color:'violet' as const,createdAt:'2026-11-02T12:00:00.000Z',updatedAt:'2026-11-02T12:00:00.000Z'}]
    render(<TaskQuickActions {...componentProps} allLabels={allLabels}/>)

    fireEvent.click(screen.getByRole('button',{name:'Labels'}))

    expect(screen.getByRole('heading',{name:'Labels'})).toBeInTheDocument()
    const label=screen.getByRole('button',{name:'Needs review'})
    expect(label).toHaveAttribute('aria-pressed','false')
    fireEvent.click(label)
    expect(componentProps.onAddLabel).toHaveBeenCalledWith('label-1')
  })

  it('opens the priority popover and applies a selected workflow priority',() => {
    const componentProps=props()
    render(<TaskQuickActions {...componentProps}/>)

    fireEvent.click(screen.getByRole('button',{name:'Medium'}))
    expect(screen.getByRole('heading',{name:'Priority'})).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'High'}))

    expect(componentProps.onPriority).toHaveBeenCalledWith('high')
  })
})
