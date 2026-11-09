import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskDetailModal } from './TaskDetailModal'
import type { Profile, ProjectBoard, ProjectColumn, ProjectTask } from '@/types/database'
import { createTaskSharedMetadata } from '@/lib/taskMetadata'

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
  it('hydrates shared creation details and persists checklist edits to the server', async () => {
    localStorage.clear()
    const metadata = createTaskSharedMetadata(['Launch'], [{ label: 'Verify the deployment' }], createdAt)
    const sharedTask = { ...task, id: 'shared-modal-task', labels: ['Launch'], task_metadata: metadata }
    const onUpdate = vi.fn().mockResolvedValue(sharedTask)
    render(<TaskDetailModal task={sharedTask} columns={columns} boards={boards} availableTasks={[sharedTask]} teamProfiles={[profile]} currentProfile={profile} initialComments={[]} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn().mockResolvedValue(undefined)} onDuplicate={vi.fn().mockResolvedValue(sharedTask)} onMove={vi.fn().mockResolvedValue(sharedTask)} onAddComment={vi.fn()}/>)
    expect(await screen.findByRole('checkbox', { name: 'Mark Verify the deployment complete' })).not.toBeChecked()
    expect((await screen.findAllByText('Launch')).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Verify the deployment complete' }))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      taskId: sharedTask.id,
      labels: ['Launch'],
      taskMetadata: expect.objectContaining({ checklists: [expect.objectContaining({ items: [expect.objectContaining({ completed: true })] })] }),
    })))
  })

  it('renders the integrated workspace and opens real task actions',async () => {
    localStorage.clear()
    const onUpdate=vi.fn().mockResolvedValue(task)
    const onAddComment=vi.fn().mockResolvedValue({id:'comment-1',task_id:task.id,user_id:profile.id,comment:'Ready for release',created_at:createdAt})
    render(<TaskDetailModal task={task} columns={columns} boards={boards} availableTasks={[task]} teamProfiles={[profile]} currentProfile={profile} initialComments={[]} onClose={vi.fn()} onUpdate={onUpdate} onDelete={vi.fn().mockResolvedValue(undefined)} onDuplicate={vi.fn().mockResolvedValue({...task,id:'copy-1'})} onMove={vi.fn().mockResolvedValue(task)} onAddComment={onAddComment}/>)

    const dialog=await screen.findByRole('dialog',{name:'Enterprise task workspace'})
    const workspace=within(dialog)
    expect(dialog).toHaveClass('task-workspace')
    expect(dialog).toHaveClass('md:h-[88vh]','md:max-h-[850px]','md:max-w-5xl','overflow-hidden')
    expect(workspace.getByRole('navigation',{name:'Task breadcrumb'})).toBeInTheDocument()
    expect(workspace.getByText('Initial details')).toBeInTheDocument()

    const sectionTabs=workspace.getByRole('tablist',{name:'Task workspace sections'})
    const detailsTab=within(sectionTabs).getByRole('tab',{name:'Details'})
    const activityTab=within(sectionTabs).getByRole('tab',{name:/Activity/})
    expect(detailsTab).toHaveAttribute('aria-selected','true')
    const detailsPanel=dialog.querySelector('#task-details-panel')
    const activityPanel=dialog.querySelector('#task-activity-panel')
    expect(detailsPanel).toHaveAttribute('role','tabpanel')
    expect(detailsPanel).toHaveClass('overflow-y-auto','md:col-span-7','lg:col-span-8','md:p-6')
    expect(activityPanel).toHaveAttribute('role','tabpanel')
    expect(activityPanel).toHaveClass('h-full','overflow-hidden','md:col-span-5','lg:col-span-4')
    expect(detailsPanel?.parentElement).toHaveClass('overflow-hidden','md:grid-cols-12')
    expect(workspace.getByRole('heading',{name:'Activity & Discussion'})).toBeInTheDocument()

    fireEvent.click(activityTab)
    expect(activityTab).toHaveAttribute('aria-selected','true')
    expect(detailsTab).toHaveAttribute('aria-selected','false')
    fireEvent.click(detailsTab)

    const status=workspace.getAllByRole('button',{name:'Status: To Do'})[0]
    fireEvent.click(status)
    fireEvent.click(await screen.findByRole('button',{name:'In Progress'}))
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({taskId:'modal-smoke-task',columnId:'column-2'}))

    const composer=workspace.getByRole('combobox',{name:'Write a comment'})
    fireEvent.change(composer,{target:{value:'Ready for release'}})
    fireEvent.click(workspace.getByRole('button',{name:'Send'}))
    await waitFor(() => expect(onAddComment).toHaveBeenCalledWith({taskId:'modal-smoke-task',comment:'Ready for release'}))
    await waitFor(() => expect(composer).toHaveValue(''))
    expect(workspace.getByText('Ready for release')).toBeInTheDocument()

    fireEvent.pointerDown(workspace.getByRole('button',{name:'More task actions'}),{button:0,ctrlKey:false})
    expect(await screen.findByRole('menuitem',{name:'Duplicate task'})).toBeInTheDocument()
    expect(screen.getByRole('menuitem',{name:/Archive & trash recovery/})).toBeInTheDocument()
  })
})
