export type Profile = {
  id: string
  display_name: string
  email: string
  avatar_url: string | null
  job_title: string | null
  status: 'online' | 'away' | 'offline'
  created_at: string
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
  assignee?: Profile
  creator?: Profile
  comments_count?: number
}

export type ProjectTaskComment = {
  id: string
  task_id: string
  user_id: string | null
  comment: string
  created_at: string
  profile?: Profile
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


