import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskAttachment } from '@/types/task'
import {
  createAttachmentObjectUrl,
  getAttachmentBlob,
  revokeAttachmentObjectUrl,
} from '@/lib/attachmentStorage'
import { AttachmentSection } from './AttachmentSection'

vi.mock('@/lib/attachmentStorage', () => ({
  createAttachmentObjectUrl: vi.fn(),
  downloadAttachmentBlob: vi.fn(),
  getAttachmentBlob: vi.fn(),
  revokeAttachmentObjectUrl: vi.fn(),
}))

const imageAttachment: TaskAttachment = {
  id: 'attachment-1',
  taskId: 'task-1',
  name: 'release-preview.png',
  mimeType: 'image/png',
  sizeBytes: 2048,
  storageKey: 'task/task-1/attachment-1',
  uploadedBy: 'user-1',
  createdAt: '2026-11-02T12:00:00.000Z',
}

describe('AttachmentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAttachmentBlob).mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    vi.mocked(createAttachmentObjectUrl).mockReturnValue('blob:release-preview')
  })

  it('opens an accessible image preview and closes it with the labelled control', async () => {
    render(
      <AttachmentSection
        attachments={[imageAttachment]}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Preview release-preview.png' }))

    const dialog = await screen.findByRole('dialog', { name: 'release-preview.png' })
    expect(dialog).toHaveAccessibleDescription(/Attachment preview/)
    expect(screen.getByRole('img', { name: 'release-preview.png' })).toHaveAttribute('src', 'blob:release-preview')
    expect(getAttachmentBlob).toHaveBeenCalledWith('task/task-1/attachment-1')

    fireEvent.click(screen.getByRole('button', { name: 'Close attachment preview' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(revokeAttachmentObjectUrl).toHaveBeenCalledWith('blob:release-preview')
  })

  it('announces a missing local attachment instead of opening an empty dialog', async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(null)
    render(
      <AttachmentSection
        attachments={[imageAttachment]}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Preview release-preview.png' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('The local file is no longer available.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
