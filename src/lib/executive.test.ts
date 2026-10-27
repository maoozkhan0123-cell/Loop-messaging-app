import { describe, expect, it } from 'vitest'
import { executiveHealthScore, executiveHealthStatus, workloadLevel } from './executive'

describe('executive decision metrics', () => {
  it('scores project risk with documented deductions and a zero floor', () => {
    expect(executiveHealthScore(1, 1, 1)).toBe(55)
    expect(executiveHealthScore(10, 10, 10)).toBe(0)
  })
  it('classifies health at stable thresholds', () => {
    expect(executiveHealthStatus(74)).toBe('at_risk')
    expect(executiveHealthStatus(49)).toBe('critical')
    expect(executiveHealthStatus(75)).toBe('healthy')
  })
  it('uses configured capacity before the task-count fallback', () => {
    expect(workloadLevel(120, 1)).toBe('overloaded')
    expect(workloadLevel(null, 3)).toBe('available')
  })
})
