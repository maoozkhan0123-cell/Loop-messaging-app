import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TaskTitleEditor } from './TaskTitleEditor'

describe('TaskTitleEditor', () => {
  it('trims and saves a changed title with Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TaskTitleEditor title="Original task" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit task title' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '  Updated task  ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Updated task'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('cancels with Escape without saving the draft', () => {
    const onSave = vi.fn()
    render(<TaskTitleEditor title="Original task" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit task title' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Discard me' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Original task' })).toBeInTheDocument()
  })

  it('validates an empty title on blur and keeps the editor open', async () => {
    const onSave = vi.fn()
    render(<TaskTitleEditor title="Original task" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit task title' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)

    expect(await screen.findByRole('alert')).toHaveTextContent('Task title cannot be empty.')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves a valid changed title on blur', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TaskTitleEditor title="Original task" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit task title' }))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Blurred task' } })
    fireEvent.blur(input)

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Blurred task'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})
