import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runTool, type ToolContext } from './tools'

type QueryResult = { data: unknown; error: { message: string; code?: string } | null }
const boards = [{ id: 'board-1', name: 'Loop Workspace' }, { id: 'board-2', name: 'Loop errors' }]
let results: Record<string, QueryResult[]>
let from: ReturnType<typeof vi.fn>
let context: ToolContext

beforeEach(() => {
  results = {
    project_boards: [{ data: boards, error: null }],
    project_tasks: [{ data: [], error: null }],
    project_task_assignees: [{ data: [], error: null }],
  }
  from = vi.fn((table: string) => {
    const result = results[table]?.shift()
    if (!result) throw new Error(`Unexpected query: ${table}`)
    const builder = {
      select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(),
      then: (resolve: (value: QueryResult) => unknown) => Promise.resolve(result).then(resolve),
    }
    return builder
  })
  context = { supabase: { from } as unknown as ToolContext['supabase'], userId: 'user-1', proposals: [] }
})

describe('workspace project lookup grounding', () => {
  it('lists both accessible project names even when the user has no assigned tasks', async () => {
    const result = await runTool(context, 'list_projects', '{}')
    expect(result).toContain('Accessible projects: 2.')
    expect(result).toContain('Project: Loop Workspace | open tasks assigned to the user: 0')
    expect(result).toContain('Project: Loop errors | open tasks assigned to the user: 0')
    expect(result).toContain('does not mean a project is inaccessible')
    expect(result).not.toContain('cannot see any projects')
    expect(context.proposals).toEqual([])
  })

  it('reports a genuinely empty accessible project list explicitly', async () => {
    results.project_boards = [{ data: [], error: null }]
    expect(await runTool(context, 'list_projects', '{}')).toBe('Accessible projects: 0. No project boards were returned for this user.')
  })

  it('reports a board lookup failure instead of claiming no projects are visible', async () => {
    results.project_boards = [{ data: null, error: { code: 'PGRST205', message: 'Project lookup unavailable' } }]
    expect(await runTool(context, 'list_projects', '{}')).toBe('The tool failed: Project lookup unavailable')
  })

  it.each(['project_tasks', 'project_task_assignees'])('reports %s assignment failures instead of inventing zero task counts', async (table) => {
    results[table] = [{ data: null, error: { message: 'Assignments unavailable' } }]
    const result = await runTool(context, 'list_projects', '{}')
    expect(result).toBe('The tool failed: Assignments unavailable')
    expect(result).not.toContain('Accessible projects: 0')
  })

  it('reports a task detail lookup failure instead of inventing zero open counts', async () => {
    results.project_tasks = [{ data: [{ id: 'task-1' }], error: null }, { data: null, error: { message: 'Tasks unavailable' } }]
    expect(await runTool(context, 'list_projects', '{}')).toBe('The tool failed: Tasks unavailable')
  })
})
