export type Profile = {
  id: string
  display_name: string
  email: string
  avatar_url: string | null
  job_title: string | null
  status: 'online' | 'away' | 'offline'
  created_at: string
  department?: string | null
  manager_id?: string | null
  weekly_capacity_hours?: number | null
}

export type ChannelType = 'public' | 'private' | 'dm' | 'group_dm'

export type Channel = {
  id: string
  type: ChannelType
  name: string | null
  topic: string | null
  created_by: string | null
  created_at: string
  archived_at: string | null
}

export type ChannelMember = {
  channel_id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  last_read_at: string
  notification_pref: 'all' | 'mentions' | 'none'
  joined_at: string
}

export type Message = {
  id: string
  channel_id: string
  user_id: string | null
  parent_id: string | null
  body: string | null
  edited_at: string | null
  deleted_at: string | null
  created_at: string
  // joined relations
  profiles?: Profile
  reactions?: Reaction[]
  attachments?: Attachment[]
  reply_count?: number
}

export type Reaction = {
  message_id: string
  user_id: string
  emoji: string
  created_at: string
}

export type Attachment = {
  id: string
  message_id: string
  uploader_id: string | null
  object_key: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export type ChannelWithMember = Channel & {
  channel_members?: ChannelMember[]
  unread_count?: number
  other_member?: Profile // for DMs
}

export type PresenceUser = {
  user_id: string
  status: 'online' | 'away' | 'offline'
  online_at: string
}

export type TypingUser = {
  user_id: string
  display_name: string
  typing: boolean
}

// ============================================================
// PROJECTS (KANBAN) TYPES
// ============================================================
export type ProjectBoard = {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  archived_at: string | null
}

export type ProjectColumn = {
  id: string
  board_id: string
  name: string
  position: number
  created_at: string
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export type ProjectTask = {
  id: string
  board_id: string
  column_id: string
  title: string
  description: string | null
  priority: TaskPriority
  due_date: string | null
  assignee_id: string | null
  created_by: string | null
  position: number
  created_at: string
  start_date?: string | null
  estimated_hours?: number | null
  blocked_reason?: string | null
  archived_at?: string | null
  version?: number
  assignee?: Profile
  creator?: Profile
  comments_count?: number
}

export type ProjectMilestone = {
  id: string; board_id: string; title: string; description: string | null; target_date: string
  owner_id: string | null; status: 'planned' | 'in_progress' | 'completed' | 'at_risk'; created_by: string | null; created_at: string
}

export type ProjectRisk = {
  id: string; board_id: string; title: string; description: string | null
  severity: 'low' | 'medium' | 'high' | 'critical'; probability: 'unlikely' | 'possible' | 'likely'
  mitigation: string | null; owner_id: string | null; review_date: string | null
  status: 'open' | 'mitigating' | 'resolved' | 'accepted'; created_by: string | null; created_at: string
}

export type ProjectTaskComment = {
  id: string
  task_id: string
  user_id: string | null
  comment: string
  created_at: string
  profile?: Profile
}

export type WorkspaceEvent = {
  id: string
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  location: string | null
  meeting_url: string | null
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly'
  created_by: string
  created_at: string
  creator?: Profile
  attendee_count?: number
  my_response?: 'pending' | 'accepted' | 'declined' | 'maybe'
}

export type ScheduledMessage = {
  id: string
  user_id: string
  channel_id: string
  parent_id: string | null
  body: string
  scheduled_for: string
  status: 'pending' | 'sent' | 'cancelled' | 'failed'
  created_at: string
}

export type TaskChecklistItem = {
  id: string
  task_id: string
  label: string
  completed: boolean
  position: number
  created_by: string | null
  created_at: string
}

// ============================================================
// IDEAS (BRAINSTORMING) TYPES
// ============================================================
export type IdeaStatus = 'under_review' | 'planned' | 'in_progress' | 'completed' | 'archived'

export type Idea = {
  id: string
  title: string
  description: string
  status: IdeaStatus
  author_id: string | null
  created_at: string
  author?: Profile
  comments_count?: number
}

export type IdeaComment = {
  id: string
  idea_id: string
  author_id: string | null
  content: string
  created_at: string
  author?: Profile
}
