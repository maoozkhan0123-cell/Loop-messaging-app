import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownContent, TaskDescriptionEditor } from './TaskDescriptionEditor'

describe('MarkdownContent', () => {
  it('renders supported Markdown while keeping HTML and unsafe links inert', () => {
    const { container } = render(
      <MarkdownContent value={'# Release notes\n[Docs](https://example.com/guide)\n<img src=x onerror=alert(1)>\n[Unsafe](javascript:alert(1))'} />,
    )

    expect(screen.getByRole('heading', { name: 'Release notes' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('href', 'https://example.com/guide')
    expect(screen.getByRole('link', { name: 'Docs' })).toHaveAttribute('rel', 'noreferrer')
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(container.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(screen.getByText('[Unsafe](javascript:alert(1))')).toBeInTheDocument()
  })
})

describe('TaskDescriptionEditor', () => {
  it('saves the edited description with Ctrl+Enter', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TaskDescriptionEditor value="Original description" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /description/i }))
    const editor = screen.getByRole('combobox')
    fireEvent.change(editor, { target: { value: 'Updated **description**' } })
    fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Updated **description**'))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Original description')).toBeInTheDocument()
  })

  it('supports formatting shortcuts and cancels with Escape', () => {
    const onSave = vi.fn()
    render(<TaskDescriptionEditor value="Original description" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /description/i }))
    const editor = screen.getByRole('combobox') as HTMLTextAreaElement
    fireEvent.keyDown(editor, { key: 'b', ctrlKey: true })
    expect(editor).toHaveValue('Original description\n**text**')

    fireEvent.keyDown(editor, { key: 'Escape' })
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByText('Original description')).toBeInTheDocument()
  })

  it('previews the current draft without saving it', () => {
    const onSave = vi.fn()
    render(<TaskDescriptionEditor value="Initial" onSave={onSave} />)

    fireEvent.click(screen.getByRole('button', { name: /description/i }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '## Draft heading' } })
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    expect(screen.getByRole('heading', { name: 'Draft heading' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('stores selected mentions as stable member references', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    render(<TaskDescriptionEditor value="Coordinate with " members={[{ id:'member-42',name:'Sarah Khan',initials:'SK',role:'Design' }]} onSave={onSave}/>)

    fireEvent.click(screen.getByRole('button', { name: /description/i }))
    const editor=screen.getByRole('combobox')
    fireEvent.change(editor,{target:{value:'Coordinate with @sar'}})
    fireEvent.keyDown(editor,{key:'Enter'})
    expect(editor).toHaveValue('Coordinate with @[Sarah Khan](member:member-42) ')
    fireEvent.keyDown(editor,{key:'Enter',ctrlKey:true})

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Coordinate with @[Sarah Khan](member:member-42) '))
  })
})
