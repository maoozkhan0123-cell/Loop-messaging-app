import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GanttChart, ViewSwitcher } from './WorkViews'

describe('work views', () => {
  it('switches between the available views', () => {
    const onChange = vi.fn()
    render(<ViewSwitcher value="list" onChange={onChange} includeBoard />)
    expect(screen.getByRole('button', { name: /list view/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: /gantt view/i }))
    expect(onChange).toHaveBeenCalledWith('gantt')
  })

  it('renders long timelines with clickable, labelled rows', () => {
    const onClick = vi.fn()
    render(<GanttChart items={[{ id: 'one', title: 'Product launch', subtitle: 'Marketing', start: '2026-01-01', end: '2026-06-30', onClick }]} />)
    const row = screen.getByRole('button', { name: 'Open Product launch' })
    expect(screen.getByText('Marketing')).toBeInTheDocument()
    fireEvent.click(row)
    expect(onClick).toHaveBeenCalledOnce()
  })
})
