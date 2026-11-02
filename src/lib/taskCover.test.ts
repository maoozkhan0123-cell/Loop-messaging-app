import { describe, expect, it } from 'vitest'
import {
  MAX_TASK_COVER_DIMENSION,
  MIN_TASK_COVER_HEIGHT,
  MIN_TASK_COVER_WIDTH,
  TaskCoverError,
  validateTaskCoverDimensions,
  validateTaskCoverFile,
} from './taskCover'

describe('task cover image validation', () => {
  it('accepts supported image metadata and usable dimensions', () => {
    expect(validateTaskCoverFile({ name: 'release.webp', type: 'image/webp', size: 1024 })).toBe('image/webp')
    expect(validateTaskCoverDimensions(1600, 500)).toEqual({ width: 1600, height: 500 })
  })

  it('rejects non-image formats and undersized or unsafe dimensions', () => {
    expect(() => validateTaskCoverFile({ name: 'notes.txt', type: 'text/plain', size: 10 })).toThrowError(TaskCoverError)
    expect(() => validateTaskCoverDimensions(MIN_TASK_COVER_WIDTH - 1, MIN_TASK_COVER_HEIGHT)).toThrow('at least')
    expect(() => validateTaskCoverDimensions(MAX_TASK_COVER_DIMENSION + 1, 500)).toThrow('too many pixels')
    expect(() => validateTaskCoverDimensions(8000, 6000)).toThrow('too many pixels')
  })
})
