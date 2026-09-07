<!--
  Manual setup step — NOT covered by schema.sql.

  schema.sql only contains SQL migrations for Postgres tables (papers,
  notes, translation_cache) and their Row Level Security policies.
  Supabase Storage buckets are a separate resource that cannot be created
  by a plain SQL migration run through the SQL editor, so this step must
  be done once, by hand, in the Supabase dashboard.
-->

# Supabase Storage setup

Before uploads will work (`lib/papers/upload.ts`), create the Storage bucket
that PDFs are uploaded into:

1. Open the Supabase dashboard for this project → **Storage**.
2. Click **New bucket**.
3. Name it exactly `papers`.
4. Leave **Public bucket** turned **off** (private). Papers belong to a
   single user and must only be reachable through an authenticated,
   Row-Level-Security-scoped request — never via a public URL.
5. Save.

Making the bucket private only blocks anonymous access — it does NOT by
itself grant the signed-in owner read/write access. Storage objects have
their own Row Level Security (on the `storage.objects` table) that must be
set up explicitly, same as any other table. Run the storage policies at
the bottom of `schema.sql` (`papers_bucket_insert_own_folder`,
`papers_bucket_select_own_folder`, `papers_bucket_delete_own_folder`) in
the SQL editor — they scope access to each user's own `${userId}/...`
folder prefix (see `lib/papers/upload.ts`), matching the per-user
namespacing this app already uses.
