-- Schema for paper-reading-pwa
-- Run this against a Supabase project's SQL editor (or via the Supabase CLI)
-- after the project has been created. auth.users is managed by Supabase Auth.

create table if not exists papers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  reached_last_page boolean not null default false,
  finished_reading boolean not null default false,
  finished_at timestamptz,
  imported_to_detabase boolean not null default false
);

create index if not exists papers_user_id_idx on papers (user_id);

-- Reading stage. Three-valued rather than two booleans so that an
-- impossible combination cannot be represented at all. `finished_reading`
-- and `finished_at` are kept for the existing reading-completion flow and
-- are written only by setReadingStage, so the two can never disagree.
alter table papers
  add column if not exists reading_stage text not null default 'up_next';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'papers_reading_stage_check'
  ) then
    alter table papers
      add constraint papers_reading_stage_check
      check (reading_stage in ('up_next', 'reading', 'finished'));
  end if;
end $$;

-- Backfill: a paper already marked finished belongs in the finished
-- stage; everything else starts in up_next.
update papers set reading_stage = 'finished'
  where finished_reading = true and reading_stage <> 'finished';

-- Soft delete. A timestamp rather than a boolean, so it answers both
-- "is this removed" and "when was it removed" — the trash lists by
-- removal time, and a retention policy later needs no schema change.
alter table papers
  add column if not exists deleted_at timestamptz;

create index if not exists papers_user_deleted_idx
  on papers (user_id, deleted_at);

create table if not exists notes (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  page_number integer not null,
  position jsonb,
  selected_text text,
  note_text text,
  created_at timestamptz not null default now()
);

-- Adds hand-drawn (Apple Pencil / touch) annotation support to notes. A note
-- is either a typed note (note_text set, strokes null) or a stroke-based
-- annotation (strokes set, note_text null) — see apple-pencil-annotations
-- proposal. note_text's NOT NULL constraint must be dropped so a
-- stroke-only note (note_text = null) can be inserted; existing typed notes
-- are unaffected (strokes defaults to null on existing rows).
alter table notes add column if not exists strokes jsonb;
alter table notes alter column note_text drop not null;

create index if not exists notes_paper_id_idx on notes (paper_id);
create index if not exists notes_user_id_idx on notes (user_id);

create table if not exists translation_cache (
  id uuid primary key default gen_random_uuid(),
  source_text_hash text not null,
  source_lang text not null,
  target_lang text not null,
  translated_text text not null,
  paper_id uuid references papers (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (source_text_hash, source_lang, target_lang)
);

-- One continuous reflection conversation per paper. Kept as its own table
-- rather than folded into notes: messages have a role (user/assistant),
-- stream in append-only chronological order, and grow unboundedly as a
-- conversation — a different shape from a user's discrete notes. See
-- paper-reflection-chat design.md.
create table if not exists reflection_messages (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references papers (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists reflection_messages_paper_id_idx on reflection_messages (paper_id);
create index if not exists reflection_messages_user_id_idx on reflection_messages (user_id);

-- Row Level Security: every table is scoped to auth.uid() so a signed-in
-- user can only see/modify their own rows. translation_cache has no
-- user_id column (translations are content-addressed, not per-user) but
-- still requires an authenticated session to read/write.

alter table papers enable row level security;
alter table notes enable row level security;
alter table translation_cache enable row level security;
alter table reflection_messages enable row level security;

create policy "papers_select_own" on papers
  for select using (auth.uid() = user_id);
create policy "papers_insert_own" on papers
  for insert with check (auth.uid() = user_id);
create policy "papers_update_own" on papers
  for update using (auth.uid() = user_id);
create policy "papers_delete_own" on papers
  for delete using (auth.uid() = user_id);

create policy "notes_select_own" on notes
  for select using (auth.uid() = user_id);
create policy "notes_insert_own" on notes
  for insert with check (auth.uid() = user_id);
create policy "notes_update_own" on notes
  for update using (auth.uid() = user_id);
create policy "notes_delete_own" on notes
  for delete using (auth.uid() = user_id);

create policy "translation_cache_select_authenticated" on translation_cache
  for select using (auth.role() = 'authenticated');
create policy "translation_cache_insert_authenticated" on translation_cache
  for insert with check (auth.role() = 'authenticated');

create policy "reflection_messages_select_own" on reflection_messages
  for select using (auth.uid() = user_id);
create policy "reflection_messages_insert_own" on reflection_messages
  for insert with check (auth.uid() = user_id);

-- Storage: the `papers` bucket (created manually — see storage-setup.md)
-- is private, but "private" only blocks anonymous access. Reading/writing
-- objects still requires explicit RLS policies on storage.objects, scoped
-- here to each user's own path prefix ("${userId}/...", set by
-- lib/papers/upload.ts) via storage.foldername(name).

create policy "papers_bucket_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'papers' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "papers_bucket_select_own_folder" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'papers' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "papers_bucket_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'papers' and (storage.foldername(name))[1] = auth.uid()::text
  );
