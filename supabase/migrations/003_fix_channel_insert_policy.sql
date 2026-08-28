-- auth.role() = 'authenticated' can fail depending on JWT claim setup.
-- auth.uid() is not null is the reliable equivalent for logged-in users.

drop policy if exists "Authenticated users can create channels" on channels;

create policy "Authenticated users can create channels"
  on channels for insert
  with check (auth.uid() is not null);

-- Same fix for channel_members insert
drop policy if exists "Authenticated users can join public channels" on channel_members;

create policy "Authenticated users can join public channels"
  on channel_members for insert
  with check (auth.uid() is not null);

-- Same fix for attachments insert
drop policy if exists "Uploaders can insert attachments" on attachments;

create policy "Uploaders can insert attachments"
  on attachments for insert
  with check (auth.uid() = uploader_id);
