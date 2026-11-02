import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Checklist, TaskMember } from '@/types/task'
import { ChecklistSection } from './ChecklistSection'

const timestamp = '2026-11-02T12:00:00.000Z'

const members: TaskMember[] = [
  { id: 'member-1', name: 'Avery Stone', initials: 'AS', email: 'avery@example.com' },
]

const checklists: Checklist[] = [
  {
    id: 'checklist-1',
    title: 'Release checklist',
    hideCompleted: false,
    order: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    items: [
      { id: 'item-2', text: 'Ship release', completed: false, order: 1, createdAt: timestamp, updatedAt: timestamp },
      { id: 'item-1', text: 'Review changes', completed: true, order: 0, createdAt: timestamp, updatedAt: timestamp },
    ],
  },
]

function createActions() {
  return {
    addChecklist: vi.fn(),
    renameChecklist: vi.fn(),
    deleteChecklist: vi.fn(),
    toggleHideCompleted: vi.fn(),
    reorderChecklists: vi.fn(),
    addItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    reorderItems: vi.fn(),
  }
}

describe('ChecklistSection', () => {
  it('shows aggregate progress and delegates completion and visibility changes', () => {
    const actions = createActions()
    const { container } = render(<ChecklistSection checklists={checklists} members={members} actions={actions} />)

    expect(screen.getByText(/1 of 2 items completed/)).toBeInTheDocument()
    expect(screen.getByText(/1\/2/)).toBeInTheDocument()
    expect(Array.from(container.querySelectorAll<HTMLElement>('[style]')).some((element) => element.style.width === '50%')).toBe(true)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark Ship release complete' }))
    expect(actions.updateItem).toHaveBeenCalledWith('checklist-1', 'item-2', { completed: true })

    fireEvent.click(screen.getByRole('button', { name: 'Hide done' }))
    expect(actions.toggleHideCompleted).toHaveBeenCalledWith('checklist-1')
  })

  it('reorders sorted items using the keyboard-accessible controls', () => {
    const actions = createActions()
    render(<ChecklistSection checklists={checklists} members={members} actions={actions} />)

    fireEvent.click(screen.getByRole('button', { name: 'Move Ship release up' }))

    expect(actions.reorderItems).toHaveBeenCalledWith('checklist-1', ['item-2', 'item-1'])
  })

  it('creates trimmed checklist and item names with Enter', () => {
    const actions = createActions()
    const { rerender } = render(<ChecklistSection checklists={[]} members={members} actions={actions} />)

    fireEvent.click(screen.getByRole('button', { name: /break the work into trackable checklist items/i }))
    const titleInput = screen.getByPlaceholderText('Checklist title')
    fireEvent.change(titleInput, { target: { value: '  Launch  ' } })
    fireEvent.keyDown(titleInput, { key: 'Enter' })
    expect(actions.addChecklist).toHaveBeenCalledWith('Launch')

    rerender(<ChecklistSection checklists={checklists} members={members} actions={actions} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }))
    const itemInput = screen.getByPlaceholderText('Add an item')
    fireEvent.change(itemInput, { target: { value: '  Notify customers  ' } })
    fireEvent.keyDown(itemInput, { key: 'Enter' })
    expect(actions.addItem).toHaveBeenCalledWith('checklist-1', 'Notify customers')
  })
})
