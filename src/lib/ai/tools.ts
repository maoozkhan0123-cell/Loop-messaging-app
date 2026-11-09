import type Groq from 'groq-sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { nextOccurrence } from '../calendar'

// Tools the assistant can call. Every tool runs with the signed-in user's Supabase session, so row-level
// security limits the assistant to exactly what that user may see. Results are compact plain text to stay
// inside Groq's free-tier token limits. Nothing here writes: create_task only returns a proposal that the
// user must confirm in the UI (see /api/ai/action).

export type TaskProposal = {
  id: string
  type: 'create_task'
  title: string
  description: string | null
  boardId: string
  boardName: string
  assigneeId: string | null
  assigneeName: string | null
  dueDate: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
}

export type ToolContext = { supabase: SupabaseClient; userId: string; proposals: TaskProposal[]; timeZone?: string }

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): Groq.Chat.ChatCompletionTool => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
})

export const AI_TOOLS: Groq.Chat.ChatCompletionTool[] = [
  fn('get_my_tasks', 'Tasks assigned to the current user, with project, status, priority and due date.', {
    include_done: { type: 'boolean', description: 'Also include finished tasks. Default false.' },
  }),
  fn('search_tasks', 'Find tasks the user can see by words in the title or description.', {
    query: { type: 'string', description: 'Words to search for.' },
  }, ['query']),
  fn('get_task', 'Full details of one task: description, status, assignees, dates and recent comments.', {
    task_id: { type: 'string', description: 'Task id from another tool result.' },
  }, ['task_id']),
  fn('find_person', 'Everything involving one teammate that the user can see: tasks they assigned (created), tasks they are assigned to, tasks they commented on, and their recent messages. Use it for any question about a person.', {
    person: { type: 'string', description: 'Teammate name, e.g. "Usman".' },
  }, ['person']),
  fn('list_projects', 'Projects the user can see, with how many of their tasks are open.'),
  fn('get_channel_messages', 'Recent messages from a channel or direct message the user is in.', {
    channel: { type: 'string', description: 'Channel name (e.g. "general"), a teammate name for a DM, or a channel id.' },
    limit: { type: 'number', description: 'How many recent messages, up to 40. Default 25.' },
  }, ['channel']),
  fn('get_calendar', 'Company events, the user\'s meetings and task deadlines in the coming days.', {
    days_ahead: { type: 'number', description: 'How many days ahead, up to 31. Default 7.' },
  }),
  fn('get_ideas', 'Ideas on the team Ideas board, with status, author and comment count. Optionally filter by words.', {
    query: { type: 'string', description: 'Optional words to filter by.' },
  }),
  fn('create_task', 'Prepare a new task. It is NOT saved until the user clicks Confirm, so tell them to review it.', {
    title: { type: 'string' },
    project: { type: 'string', description: 'Project name.' },
    assignee: { type: 'string', description: 'Teammate name, or "me". Optional.' },
    due_date: { type: 'string', description: 'YYYY-MM-DD. Optional.' },
    priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
    description: { type: 'string' },
  }, ['title', 'project']),
]

const clip = (text: string | null | undefined, max: number) => {
  const value = (text ?? '').replace(/\s+/g, ' ').trim()
  return value.length > max ? `${value.slice(0, max)}…` : value
}
const day = (value: string | null | undefined) => (value ? value.slice(0, 10) : 'none')

/** A timestamp in the user's own time zone, e.g. "Thu 6 Nov 15:00". */
function localTime(ctx: ToolContext, iso: string) {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: ctx.timeZone || 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso)).replace(',', '')
  } catch { return iso.slice(0, 16).replace('T', ' ') + ' UTC' }
}

type Task = { id: string; title: string; description: string | null; board_id: string; column_id: string; priority: string; due_date: string | null; start_date?: string | null; assignee_id: string | null; created_by: string | null; archived_at?: string | null }

async function names(ctx: ToolContext, ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  if (!unique.length) return new Map<string, string>()
  const { data } = await ctx.supabase.from('profiles').select('id,display_name').in('id', unique)
  return new Map(((data ?? []) as Array<{ id: string; display_name: string }>).map((row) => [row.id, row.display_name]))
}

/** Adds project and status names and renders one line per task. */
async function describeTasks(ctx: ToolContext, tasks: Task[]) {
  if (!tasks.length) return []
  const [{ data: boards }, { data: columns }, creators] = await Promise.all([
    ctx.supabase.from('project_boards').select('id,name').in('id', [...new Set(tasks.map((task) => task.board_id))]),
    ctx.supabase.from('project_columns').select('id,name').in('id', [...new Set(tasks.map((task) => task.column_id))]),
    names(ctx, tasks.map((task) => task.created_by)),
  ])
  const boardName = new Map(((boards ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]))
  const columnName = new Map(((columns ?? []) as Array<{ id: string; name: string }>).map((row) => [row.id, row.name]))
  return tasks.map((task) => ({
    task,
    status: columnName.get(task.column_id) ?? 'unknown',
    line: `- [${task.id}] ${task.title} | project: ${boardName.get(task.board_id) ?? '?'} | status: ${columnName.get(task.column_id) ?? '?'} | priority: ${task.priority} | due: ${day(task.due_date)} | assigned by: ${task.created_by === ctx.userId ? 'the user' : creators.get(task.created_by ?? '') ?? 'unknown'}`,
  }))
}

const isDone = (status: string) => /done|complete/i.test(status)

async function myTaskIds(ctx: ToolContext) {
  const [{ data: primary, error: primaryError }, { data: extra, error: extraError }] = await Promise.all([
    ctx.supabase.from('project_tasks').select('id').eq('assignee_id', ctx.userId).is('archived_at', null),
    ctx.supabase.from('project_task_assignees').select('task_id').eq('user_id', ctx.userId),
  ])
  if (primaryError) throw primaryError
  if (extraError) throw extraError
  return [...new Set([...((primary ?? []) as Array<{ id: string }>).map((row) => row.id), ...((extra ?? []) as Array<{ task_id: string }>).map((row) => row.task_id)])]
}

const tools: Record<string, (ctx: ToolContext, args: Record<string, unknown>) => Promise<string>> = {
  async get_my_tasks(ctx, args) {
    const ids = await myTaskIds(ctx)
    if (!ids.length) return 'No tasks are assigned to the user.'
    const { data, error } = await ctx.supabase.from('project_tasks').select('*').in('id', ids).is('archived_at', null).order('due_date', { ascending: true, nullsFirst: false }).limit(40)
    if (error) throw error
    const rows = (await describeTasks(ctx, (data ?? []) as Task[])).filter((row) => args.include_done === true || !isDone(row.status))
    return rows.length ? rows.map((row) => row.line).join('\n') : 'The user has no open tasks.'
  },

  async search_tasks(ctx, args) {
    const query = String(args.query ?? '').replace(/[%_,()]/g, ' ').trim()
    if (!query) return 'Give some words to search for.'
    const { data, error } = await ctx.supabase.from('project_tasks').select('*').is('archived_at', null)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%`).order('created_at', { ascending: false }).limit(15)
    if (error) throw error
    const rows = await describeTasks(ctx, (data ?? []) as Task[])
    return rows.length ? rows.map((row) => row.line).join('\n') : `No tasks match "${query}".`
  },

  async get_task(ctx, args) {
    const { data: task, error } = await ctx.supabase.from('project_tasks').select('*').eq('id', String(args.task_id ?? '')).maybeSingle()
    if (error) throw error
    if (!task) return 'That task does not exist or the user cannot see it.'
    const [rows, { data: assignees }, { data: comments }] = await Promise.all([
      describeTasks(ctx, [task as Task]),
      ctx.supabase.from('project_task_assignees').select('user_id').eq('task_id', task.id),
      ctx.supabase.from('project_task_comments').select('user_id,comment,created_at').eq('task_id', task.id).order('created_at', { ascending: false }).limit(15),
    ])
    const assigneeIds = [task.assignee_id, ...((assignees ?? []) as Array<{ user_id: string }>).map((row) => row.user_id)]
    const commentRows = ((comments ?? []) as Array<{ user_id: string | null; comment: string; created_at: string }>).reverse()
    const who = await names(ctx, [...assigneeIds, task.created_by, ...commentRows.map((row) => row.user_id)])
    const people = [...new Set(assigneeIds.filter(Boolean))].map((id) => who.get(id as string) ?? 'someone')
    return [
      rows[0].line,
      `created by: ${who.get(task.created_by) ?? 'unknown'} | assignees: ${people.join(', ') || 'none'} | start: ${day(task.start_date)}`,
      `description: ${clip(task.description, 1200) || '(empty)'}`,
      commentRows.length ? `comments (oldest first):\n${commentRows.map((row) => `- ${day(row.created_at)} ${who.get(row.user_id ?? '') ?? 'someone'}: ${clip(row.comment, 300)}`).join('\n')}` : 'comments: none',
    ].join('\n')
  },

  async find_person(ctx, args) {
    const wanted = String(args.person ?? '').replace(/^@/, '').replace(/[%_]/g, '').trim()
    if (!wanted) return 'Say which teammate.'
    const { data: people } = await ctx.supabase.from('profiles').select('id,display_name,job_title').ilike('display_name', `%${wanted}%`).limit(5)
    const found = (people ?? []) as Array<{ id: string; display_name: string; job_title: string | null }>
    if (!found.length) return `Nobody called "${wanted}" in the workspace.`
    if (found.length > 1 && !found.some((person) => person.display_name.toLowerCase() === wanted.toLowerCase())) return `"${wanted}" matches: ${found.map((person) => person.display_name).join(', ')}. Ask which one.`
    const person = found.find((item) => item.display_name.toLowerCase() === wanted.toLowerCase()) ?? found[0]

    const [{ data: created }, { data: primary }, { data: extra }, { data: commented }] = await Promise.all([
      ctx.supabase.from('project_tasks').select('*').eq('created_by', person.id).is('archived_at', null).limit(30),
      ctx.supabase.from('project_tasks').select('*').eq('assignee_id', person.id).is('archived_at', null).limit(30),
      ctx.supabase.from('project_task_assignees').select('task_id').eq('user_id', person.id),
      ctx.supabase.from('project_task_comments').select('task_id,comment,created_at').eq('user_id', person.id).order('created_at', { ascending: false }).limit(20),
    ])
    const extraIds = ((extra ?? []) as Array<{ task_id: string }>).map((row) => row.task_id)
    const commentRows = (commented ?? []) as Array<{ task_id: string; comment: string; created_at: string }>
    const otherIds = [...new Set([...extraIds, ...commentRows.map((row) => row.task_id)])]
    const { data: others } = otherIds.length ? await ctx.supabase.from('project_tasks').select('*').in('id', otherIds).is('archived_at', null) : { data: [] }
    // Everything above is already limited by row-level security to tasks the user may see.
    const all = new Map<string, Task>()
    for (const task of [...(created ?? []), ...(primary ?? []), ...(others ?? [])] as Task[]) all.set(task.id, task)
    const lines = new Map((await describeTasks(ctx, [...all.values()])).map((row) => [row.task.id, row.line]))
    const assignedIds = new Set([...((primary ?? []) as Task[]).map((task) => task.id), ...extraIds])
    const mine = new Set(await myTaskIds(ctx))
    const section = (title: string, ids: string[]) =>
      `${title}:\n${ids.length ? ids.map((id) => `${lines.get(id)}${mine.has(id) ? ' | shared with the user' : ''}`).join('\n') : '- none'}`
    const createdIds = ((created ?? []) as Task[]).map((task) => task.id).filter((id) => lines.has(id))
    const assignedTo = [...assignedIds].filter((id) => lines.has(id))
    const commentedOn = [...new Set(commentRows.map((row) => row.task_id))].filter((id) => lines.has(id))

    const { data: messages } = await ctx.supabase.from('messages').select('body,created_at,channel_id').eq('user_id', person.id).is('deleted_at', null).order('created_at', { ascending: false }).limit(8)
    return [
      `${person.display_name}${person.job_title ? ` (${person.job_title})` : ''}. Only items the user is allowed to see are listed.`,
      section(`Tasks ${person.display_name} assigned (created)`, createdIds),
      section(`Tasks assigned to ${person.display_name}`, assignedTo),
      section(`Tasks ${person.display_name} commented on`, commentedOn),
      `Their latest comments:\n${commentRows.filter((row) => lines.has(row.task_id)).slice(0, 6).map((row) => `- ${day(row.created_at)} on "${all.get(row.task_id)?.title}": ${clip(row.comment, 200)}`).join('\n') || '- none visible'}`,
      `Their recent messages in the user's channels:\n${((messages ?? []) as Array<{ body: string | null; created_at: string }>).map((row) => `- ${localTime(ctx, row.created_at)}: ${clip(row.body, 200) || '(attachment)'}`).join('\n') || '- none'}`,
    ].join('\n\n')
  },

  async list_projects(ctx) {
    const [{ data: boards, error }, ids] = await Promise.all([
      ctx.supabase.from('project_boards').select('id,name').is('archived_at', null).order('created_at', { ascending: false }),
      myTaskIds(ctx),
    ])
    if (error) throw error
    if (!boards?.length) return 'Accessible projects: 0. No project boards were returned for this user.'
    const { data: mine, error: tasksError } = ids.length ? await ctx.supabase.from('project_tasks').select('*').in('id', ids).is('archived_at', null) : { data: [], error: null }
    if (tasksError) throw tasksError
    const open = (await describeTasks(ctx, (mine ?? []) as Task[])).filter((row) => !isDone(row.status))
    return [
      `Accessible projects: ${boards.length}.`,
      'Every project below is visible to the user. Zero personally assigned open tasks does not mean a project is inaccessible.',
      ...(boards as Array<{ id: string; name: string }>).map((board) => `- Project: ${board.name} | open tasks assigned to the user: ${open.filter((row) => row.task.board_id === board.id).length}`),
    ].join('\n')
  },

  async get_channel_messages(ctx, args) {
    const wanted = String(args.channel ?? '').replace(/^#/, '').trim().toLowerCase()
    const limit = Math.min(40, Math.max(1, Number(args.limit) || 25))
    // Channels the user belongs to (RLS), including DMs labelled by the other person's name.
    const { data: memberships } = await ctx.supabase.from('channel_members').select('channel_id').eq('user_id', ctx.userId)
    const channelIds = ((memberships ?? []) as Array<{ channel_id: string }>).map((row) => row.channel_id)
    if (!channelIds.length) return 'The user is not in any channels.'
    const [{ data: channels }, { data: members }] = await Promise.all([
      ctx.supabase.from('channels').select('id,name,type').in('id', channelIds).is('archived_at', null),
      ctx.supabase.from('channel_members').select('channel_id,user_id').in('channel_id', channelIds).neq('user_id', ctx.userId),
    ])
    const dmPeople = await names(ctx, ((members ?? []) as Array<{ user_id: string }>).map((row) => row.user_id))
    const labelled = ((channels ?? []) as Array<{ id: string; name: string | null; type: string }>).map((channel) => ({
      ...channel,
      label: channel.type === 'dm' || channel.type === 'group_dm'
        ? `DM with ${((members ?? []) as Array<{ channel_id: string; user_id: string }>).filter((row) => row.channel_id === channel.id).map((row) => dmPeople.get(row.user_id) ?? 'someone').join(', ')}`
        : `#${channel.name}`,
    }))
    const match = labelled.find((channel) => channel.id === wanted || channel.name?.toLowerCase() === wanted)
      ?? labelled.find((channel) => channel.label.toLowerCase().includes(wanted))
    if (!match) return `No channel or DM matches "${args.channel}". Available: ${labelled.map((channel) => channel.label).join(', ')}`
    const { data: messages, error } = await ctx.supabase.from('messages').select('user_id,body,created_at').eq('channel_id', match.id).is('deleted_at', null).is('parent_id', null).order('created_at', { ascending: false }).limit(limit)
    if (error) throw error
    const rows = ((messages ?? []) as Array<{ user_id: string | null; body: string | null; created_at: string }>).reverse()
    if (!rows.length) return `${match.label} has no messages yet.`
    const who = await names(ctx, rows.map((row) => row.user_id))
    return `${match.label}, last ${rows.length} messages (oldest first):\n${rows.map((row) => `- ${localTime(ctx, row.created_at)} ${who.get(row.user_id ?? '') ?? 'someone'}: ${clip(row.body, 280) || '(attachment)'}`).join('\n')}`
  },

  async get_calendar(ctx, args) {
    const days = Math.min(31, Math.max(1, Number(args.days_ahead) || 7))
    const from = new Date(); from.setHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + days * 86_400_000)
    const [{ data: events }, ids] = await Promise.all([
      ctx.supabase.from('workspace_events').select('title,starts_at,ends_at,visibility,recurrence,location').lte('starts_at', to.toISOString()).order('starts_at').limit(60),
      myTaskIds(ctx),
    ])
    // Each event once, at its next occurrence inside the window (repeating events roll forward).
    const upcoming = ((events ?? []) as Array<{ title: string; starts_at: string; ends_at: string; visibility: string; recurrence: 'none' | 'daily' | 'weekly' | 'monthly'; location: string | null }>)
      .flatMap((event) => {
        const next = nextOccurrence(event, from)
        return next && next <= to ? [{ ...event, starts_at: next.toISOString() }] : []
      })
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
    const { data: tasks } = ids.length ? await ctx.supabase.from('project_tasks').select('*').in('id', ids).is('archived_at', null).not('due_date', 'is', null).lte('due_date', to.toISOString()) : { data: [] }
    const deadlines = (await describeTasks(ctx, (tasks ?? []) as Task[])).filter((row) => !isDone(row.status))
    return [
      `Events (next ${days} days):`,
      ...(upcoming.length ? upcoming.map((event) => `- ${localTime(ctx, event.starts_at)} ${event.title} (${event.visibility === 'company' ? 'company-wide' : 'meeting'}${event.recurrence !== 'none' ? `, repeats ${event.recurrence}` : ''}${event.location ? `, ${event.location}` : ''})`) : ['- none']),
      'Task deadlines (open, assigned to the user; includes overdue):',
      ...(deadlines.length ? deadlines.map((row) => row.line) : ['- none']),
    ].join('\n')
  },

  async get_ideas(ctx, args) {
    const query = String(args.query ?? '').replace(/[%_,()]/g, ' ').trim()
    let request = ctx.supabase.from('ideas').select('id,title,description,status,author_id,created_at').neq('status', 'archived').order('created_at', { ascending: false }).limit(25)
    if (query) request = request.or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    const { data, error } = await request
    if (error) throw error
    const ideas = (data ?? []) as Array<{ id: string; title: string; description: string; status: string; author_id: string | null; created_at: string }>
    if (!ideas.length) return query ? `No ideas match "${query}".` : 'There are no ideas on the board yet.'
    const [who, { data: comments }] = await Promise.all([
      names(ctx, ideas.map((idea) => idea.author_id)),
      ctx.supabase.from('idea_comments').select('idea_id').in('idea_id', ideas.map((idea) => idea.id)),
    ])
    const counts = new Map<string, number>()
    for (const row of (comments ?? []) as Array<{ idea_id: string }>) counts.set(row.idea_id, (counts.get(row.idea_id) ?? 0) + 1)
    return ideas.map((idea) => `- ${idea.title} | status: ${idea.status.replace('_', ' ')} | by ${who.get(idea.author_id ?? '') ?? 'someone'} on ${day(idea.created_at)} | ${counts.get(idea.id) ?? 0} comments | ${clip(idea.description, 200)}`).join('\n')
  },

  async create_task(ctx, args) {
    const title = clip(String(args.title ?? ''), 200)
    if (!title) return 'A task needs a title.'
    const project = String(args.project ?? '').trim()
    const { data: boards } = await ctx.supabase.from('project_boards').select('id,name').is('archived_at', null)
    const list = (boards ?? []) as Array<{ id: string; name: string }>
    const board = list.find((item) => item.name.toLowerCase() === project.toLowerCase()) ?? list.find((item) => item.name.toLowerCase().includes(project.toLowerCase()))
    if (!board) return `No project called "${project}". Projects: ${list.map((item) => item.name).join(', ') || 'none'}. Ask the user which one.`

    let assigneeId: string | null = null
    let assigneeName: string | null = null
    const assignee = String(args.assignee ?? '').trim()
    if (assignee) {
      if (/^(me|myself|i)$/i.test(assignee)) assigneeId = ctx.userId
      else {
        const { data: people } = await ctx.supabase.from('profiles').select('id,display_name').ilike('display_name', `%${assignee.replace(/[%_]/g, '')}%`).limit(5)
        const found = (people ?? []) as Array<{ id: string; display_name: string }>
        if (found.length !== 1) return found.length ? `"${assignee}" matches several people: ${found.map((person) => person.display_name).join(', ')}. Ask which one.` : `Nobody called "${assignee}". Ask the user to check the name.`
        assigneeId = found[0].id; assigneeName = found[0].display_name
      }
      if (assigneeId === ctx.userId) assigneeName = 'you'
    }
    const dueDate = typeof args.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(args.due_date) ? args.due_date : null
    const priority = (['low', 'medium', 'high', 'urgent'] as const).find((value) => value === args.priority) ?? 'medium'
    const proposal: TaskProposal = {
      id: crypto.randomUUID(), type: 'create_task', title, description: clip(String(args.description ?? ''), 2000) || null,
      boardId: board.id, boardName: board.name, assigneeId, assigneeName, dueDate, priority,
    }
    ctx.proposals.push(proposal)
    return `Prepared (not saved yet): "${title}" in ${board.name}${assigneeName ? `, assigned to ${assigneeName}` : ''}${dueDate ? `, due ${dueDate}` : ''}, ${priority} priority. The user must click Confirm to create it.`
  },
}

/** Runs one tool call. Errors come back as text so the model can explain or try another way. */
export async function runTool(ctx: ToolContext, name: string, rawArgs: string) {
  const tool = tools[name]
  if (!tool) return `Unknown tool "${name}".`
  let args: Record<string, unknown> = {}
  try { args = rawArgs ? JSON.parse(rawArgs) : {} } catch { return 'The tool arguments were not valid JSON.' }
  try {
    const result = await tool(ctx, args)
    return result.length > 6000 ? `${result.slice(0, 6000)}\n…(more results cut off)` : result
  } catch (error) {
    return `The tool failed: ${error instanceof Error ? error.message : (error as { message?: string })?.message ?? 'unknown error'}`
  }
}
