export function executiveHealthScore(overdue: number, blocked: number, criticalRisks: number) {
  return Math.max(0, Math.min(100, 100 - overdue * 12 - blocked * 15 - criticalRisks * 18))
}

export function executiveHealthStatus(score: number): 'healthy' | 'at_risk' | 'critical' {
  return score < 50 ? 'critical' : score < 75 ? 'at_risk' : 'healthy'
}

export function workloadLevel(percent: number | null, activeTasks: number) {
  const indicator = percent ?? activeTasks * 10
  if (indicator > 110) return 'overloaded'
  if (indicator > 85) return 'high'
  if (indicator > 50) return 'balanced'
  return 'available'
}
