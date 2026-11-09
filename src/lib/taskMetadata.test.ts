import { describe, expect, it } from 'vitest'
import { createTaskSharedMetadata, parseTaskSharedMetadata, scopeTaskSharedMetadata } from './taskMetadata'

const now = '2026-11-09T12:00:00.000Z'

describe('shared task metadata', () => {
  it('rebases label identities for duplicated tasks without repeatedly adding a scope', () => {
    const metadata = createTaskSharedMetadata(['Release'], [], now)
    const first = scopeTaskSharedMetadata('task-a', metadata)
    const copy = scopeTaskSharedMetadata('task-b', first)
    expect(first.labels[0].id).not.toBe(copy.labels[0].id)
    expect(scopeTaskSharedMetadata('task-a', first)).toEqual(first)
    expect(copy.labels[0].name).toBe('Release')
  })

  it('creates stable labels and durable checklist item identities', () => {
    const metadata = createTaskSharedMetadata([' Release ', 'release', 'Review'], [{ label: ' Verify production ', completed: true }], now)
    expect(metadata.labels.map(label => label.name)).toEqual(['Release', 'Review'])
    expect(metadata.labels[0].id).toBe(createTaskSharedMetadata(['release'], [], now).labels[0].id)
    expect(metadata.checklists[0].items[0]).toMatchObject({ text: 'Verify production', completed: true, order: 0 })
    expect(parseTaskSharedMetadata(JSON.parse(JSON.stringify(metadata)))).toEqual(metadata)
  })

  it('keeps empty groups and rejects malformed dates rather than silently persisting corrupt details', () => {
    const metadata = createTaskSharedMetadata([], [{ label: 'Work' }], now)
    metadata.checklists[0].items = []
    expect(parseTaskSharedMetadata(metadata)?.checklists).toEqual(metadata.checklists)
    expect(parseTaskSharedMetadata({})).toBeUndefined()
    const invalid = createTaskSharedMetadata([], [{ label: 'Work' }], now)
    invalid.checklists[0].items[0].dueDate = '2026-02-31'
    expect(parseTaskSharedMetadata(invalid)).toBeUndefined()
  })
})
