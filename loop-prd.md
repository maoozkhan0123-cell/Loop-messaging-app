# Loop — Internal Team Messaging App
## Product & Architecture Requirements Document (v1.0, Web)

> This document is written to be handed directly to an AI coding agent (Claude Code) as a build spec. It defines product scope, system architecture, database schema, storage design, and phased delivery plan for v1 (web only). Mobile is explicitly out of scope for v1 and is planned as a v2 phase reusing the same backend.

---

## 1. Product name

**Loop** — final decision.

Note: Microsoft Loop is an existing Microsoft 365 product with the same name. Since this is an internal-only tool with no public branding or trademark exposure, that's not a blocker — just worth knowing if anyone searches for help or screenshots online and finds Microsoft's product instead.

Used throughout this document for package names, env vars, and the DB project name (e.g. `loop-web`, `loop-prod`).

---

## 2. Goals & scope

**Goal:** Replace reliance on external chat tools with a self-owned internal messaging app — channels, DMs, file sharing, and search — for a team under 100 people.

**v1 scope (this document):**
- Web app only (desktop browser, responsive enough for tablet)
- Public & private channels
- 1:1 and group direct messages
- Threaded replies, emoji reactions
- File/image/zip sharing, up to ~1GB per file
- Search: scoped to a single conversation, and global across everything the user has access to
- Presence (online/away/offline) and typing indicators
- In-app + browser push notifications

**Explicitly out of scope for v1** (planned for later phases):
- Native mobile app (React Native, reusing this same Supabase backend)
- Slash commands / bots / third-party integrations
- Voice/video calls
- Message content search inside file attachments (PDF/doc text extraction)
- Admin console beyond basic user invite/role management

---

## 3. Tech stack at a glance

| Layer | Choice | Notes |
|---|---|---|
| Backend platform | Supabase (Postgres, Auth, Realtime, Edge Functions) | Free tier is sufficient at this scale |
| File storage | Supabase Storage (Pro plan) | Pro removes the 50MB free-tier per-file cap — global file size limit can be set up to 500GB |
| Frontend framework | Next.js (App Router) + TypeScript | |
| Styling / components | Tailwind CSS + shadcn/ui primitives, sourced via **21st.dev** component registry | See Section 9 for design direction |
| State / data fetching | TanStack Query | Pairs naturally with Supabase client SDK, handles optimistic updates |
| Realtime transport | Supabase Realtime (Postgres WAL-based broadcast + Presence channels) | No external message broker needed at this scale |
| Async jobs | `pgmq` (Postgres extension) + `pg_cron` + Edge Functions | Background jobs without extra infra |
| Push notifications (v1) | Web Push API (VAPID) via Service Worker | Native browser API, no Firebase dependency needed since mobile is deferred |
| Hosting (frontend) | Vercel (free tier fits this scale) | |

---

## 4. System architecture

With Supabase Pro, the architecture consolidates to a single backend — no separate object storage provider needed. **Clients** (Next.js web app) talk to Supabase directly for everything: auth, messages, realtime subscriptions, search, and file storage.

**Message send flow:**
1. Client inserts a row into `messages` via the Supabase client SDK (RLS validates the user is a member of that channel).
2. Postgres commits the row.
3. Supabase Realtime picks up the change from the WAL and broadcasts it instantly to every client subscribed to that channel's topic — this is the entire "message queue," no external broker required.
4. A database trigger enqueues a job in `pgmq` for any channel member who is *not* currently connected (checked against Realtime Presence).
5. A cron-scheduled Edge Function drains that queue and sends a Web Push notification to those offline/inactive users.

**File upload flow:**
1. Client requests a signed upload URL from an Edge Function, passing channel ID, file name, size, and mime type.
2. Edge Function checks the user is a member of that channel and the file passes size/type rules, then calls the Supabase Storage API to mint a signed upload URL for that path.
3. Client uploads the file directly to Supabase Storage using that signed URL — for files in the hundreds-of-MB to 1GB range, use Supabase Storage's resumable upload support so a flaky connection doesn't force a full restart.
4. On successful upload, client inserts a row into `attachments` referencing the storage object path, linked to a `messages` row. This insert triggers the same Realtime broadcast as a normal message.

**File download flow:**
1. Client requests a signed download URL from an Edge Function for a given attachment.
2. Edge Function checks channel membership, then mints a short-lived (e.g. 5 minute) signed URL via Supabase Storage.
3. Client downloads directly from Supabase Storage.

Storage access can additionally be locked down with native Storage RLS policies (Supabase applies the same row-level security model to `storage.objects` as it does to regular tables), giving you a second layer of enforcement beyond the Edge Function checks if you want defense in depth.

---

## 5. Database schema (Postgres / Supabase)

A single-workspace design is used deliberately — this is an internal tool for one company, not a multi-tenant SaaS product, so there's no `workspaces` table. Don't add one; it's unnecessary complexity for this use case.

```sql
-- profiles extends Supabase's built-in auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  email text not null unique,
  avatar_url text,
  job_title text,
  status text default 'offline', -- fallback display value; live status comes from Realtime Presence
  created_at timestamptz default now()
);

create type channel_type as enum ('public', 'private', 'dm', 'group_dm');

-- channels covers public/private channels AND 1:1 / group DMs
create table channels (
  id uuid primary key default gen_random_uuid(),
  type channel_type not null,
  name text, -- null for dm/group_dm; client derives display name from participants
  topic text,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  archived_at timestamptz
);

create table channel_members (
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  role text default 'member', -- 'owner' | 'admin' | 'member'
  last_read_at timestamptz default now(),
  notification_pref text default 'all', -- 'all' | 'mentions' | 'none'
  joined_at timestamptz default now(),
  primary key (channel_id, user_id)
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references channels(id) on delete cascade,
  user_id uuid references profiles(id),
  parent_id uuid references messages(id), -- thread replies point to root message
  body text,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(body, ''))) stored,
  edited_at timestamptz,
  deleted_at timestamptz, -- soft delete, keep row for thread integrity
  created_at timestamptz default now()
);
create index idx_messages_channel_pagination on messages (channel_id, created_at desc, id);
create index idx_messages_search on messages using gin (search_vector);

create table reactions (
  message_id uuid references messages(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  emoji text not null,
  created_at timestamptz default now(),
  primary key (message_id, user_id, emoji)
);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  uploader_id uuid references profiles(id),
  object_key text not null, -- Supabase Storage object path, not a public URL
  file_name text not null,
  file_name_search tsvector generated always as (to_tsvector('english', file_name)) stored,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz default now()
);
create index idx_attachments_search on attachments using gin (file_name_search);
```

### Example RLS policy (pattern to replicate across tables)

```sql
alter table messages enable row level security;

create policy "members can read channel messages"
on messages for select
using (
  exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
    and channel_members.user_id = auth.uid()
  )
);

create policy "members can send channel messages"
on messages for insert
with check (
  exists (
    select 1 from channel_members
    where channel_members.channel_id = messages.channel_id
    and channel_members.user_id = auth.uid()
  )
  and user_id = auth.uid()
);
```

Apply the same membership-check pattern to `reactions`, `attachments`, and `channel_members` reads. Private channels and DMs need no special-casing here — membership in `channel_members` is the single source of truth for access, for every channel type.

---

## 6. Search architecture

Two search modes, same underlying mechanism:

- **In-conversation search**: `WHERE channel_id = $1 AND search_vector @@ websearch_to_tsquery('english', $query)`, plus the equivalent on `attachments.file_name_search` for that channel.
- **Global search**: same query, without the `channel_id` filter — RLS automatically restricts results to channels the user belongs to, so no separate access-control logic is needed in the query itself.

This is built entirely on Postgres full-text search (`tsvector` + GIN index) — no external search service needed at this scale. File *content* search (extracting text from PDFs/docs to make them searchable) is a good v2 addition but adds real complexity (text extraction pipeline, larger search index) — don't build it into v1.

---

## 7. Edge Functions needed

| Function | Trigger | Purpose |
|---|---|---|
| `generate-upload-url` | Client call | Validates membership + file rules, mints signed Supabase Storage upload URL |
| `generate-download-url` | Client call | Validates membership, mints signed Supabase Storage download URL |
| `dispatch-notifications` | `pg_cron` schedule (e.g. every 30s) | Drains `pgmq` queue, sends Web Push to offline/inactive members |

Keep this list minimal for v1 — search and presence don't need dedicated functions since they're handled natively by Postgres generated columns and Supabase Realtime Presence respectively.

---

## 8. Non-functional requirements

- **File size limit**: enforce at the Edge Function level before minting an upload URL. Supabase Pro allows the global file size limit to be set up to 500GB, but set the bucket limit to something deliberate (e.g. 1–2GB) — storage on Pro is billed pay-as-you-go beyond the bundled allowance, so an unbounded cap invites surprise costs, not a technical risk.
- **Allowed file types**: allow common office/image/archive formats by default (`.zip`, `.pdf`, `.docx`, `.xlsx`, `.png`, `.jpg`, `.gif`, etc); block executables (`.exe`, `.sh`, `.bat`) outright at the Edge Function layer.
- **Rate limiting**: throttle upload-URL requests per user (e.g. 20/minute) in the Edge Function to prevent abuse — this is application logic, not a platform feature, since it isn't something the underlying tools provide out of the box for this exact pattern.
- **Pagination**: always cursor-based (`created_at + id`), never offset — keeps scroll-back performant regardless of channel history length.
- **Soft deletes**: messages are soft-deleted (`deleted_at`) rather than hard-deleted, so thread integrity and audit trail are preserved.
- **Connection pooling**: Edge Functions and any server-side code must use Supabase's pooled connection string (transaction mode), not the direct connection, since serverless invocations open connections frequently.

---

## 9. UI/UX direction — avoid the "AI-generated" look

Build the component layer from **21st.dev** (Tailwind + shadcn/ui-based registry) as a starting point, but the brief is explicitly to make this feel like a real, opinionated product — not a templated dashboard. Concretely:

- **Typography**: pick a deliberate font pairing (e.g. a distinct sans for UI chrome + a slightly different weight/family for message body text) — not default Inter applied uniformly everywhere.
- **Color identity**: choose one real accent color tied to brand, not the generic purple-to-blue gradient that signals "AI-generated SaaS template." Mostly neutral grays/whites with the accent used sparingly for actionable elements.
- **Density over whitespace**: this is a daily-use tool, not a marketing site — favor Slack/Linear-level information density in the sidebar and message list over generous card padding and big empty states.
- **Real empty states and loading states**: custom-written copy and skeleton loaders matched to actual layout, not generic spinners or stock illustrations.
- **Subtle, purposeful motion**: short transitions (150–200ms) for channel switches, new message arrival, and thread panel open/close using Framer Motion — avoid decorative animation that doesn't serve a state change.
- **Command palette**: a `Cmd/Ctrl+K` quick-switcher for jumping between channels/DMs and triggering global search — this single feature does a lot to make the app feel like a "real tool" rather than a generic chat demo.
- **Avoid the tells**: no pill-shaped buttons everywhere, no drop-shadow-on-every-card, no centered hero sections, no rounded-full avatars-with-gradient-ring pattern repeated everywhere without reason.

Layout: persistent left sidebar (channels grouped from DMs), main message pane, collapsible right-hand thread panel, top search bar that expands into the global search overlay on focus.

---

## 10. Build phases

1. **Foundation** — Supabase project setup, R2 bucket + API tokens, Next.js scaffold, design system setup (21st.dev components + Tailwind theme), auth (email/password + magic link).
2. **Core messaging** — public channels, send/receive with Realtime, basic three-pane layout.
3. **DMs & threads** — 1:1 and group DMs, threaded replies, emoji reactions.
4. **Files** — R2 presigned upload/download flow, image previews, zip/doc handling, drag-and-drop.
5. **Search** — in-conversation and global search UI + queries, command palette.
6. **Notifications & presence** — Web Push integration, typing indicators, unread badges, notification preferences per channel.
7. **Hardening** — RLS policy audit, rate limiting, error monitoring, basic admin (invite users, archive channels).

**Future (v2+):** React Native mobile app reusing this same Supabase backend, FCM/APNs push, file content search, integrations/bots.

---

## 11. Open decisions for the team before build starts

- Hard file size cap (suggested 1–2GB)
- Whether private channels require invite-only or admin-approval to join
- Retention policy — keep messages/files indefinitely, or auto-archive after N months
