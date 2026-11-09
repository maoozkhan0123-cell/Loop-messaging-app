-- Saved AI assistant conversations. Each person sees only their own chats (admins included).
-- Safe to run more than once.

begin;

create table if not exists public.ai_conversations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null default 'New chat' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_idx on public.ai_conversations(user_id, updated_at desc);

create table if not exists public.ai_messages (
  id uuid primary key default uuid_generate_v4(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  -- Task proposals shown with an assistant reply, with their state (created/cancelled) once acted on.
  proposals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists ai_messages_conversation_idx on public.ai_messages(conversation_id, created_at);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "People manage their own AI chats" on public.ai_conversations;
create policy "People manage their own AI chats" on public.ai_conversations for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "People manage their own AI messages" on public.ai_messages;
create policy "People manage their own AI messages" on public.ai_messages for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (
    select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid()));

grant select, insert, update, delete on public.ai_conversations, public.ai_messages to authenticated;

commit;
