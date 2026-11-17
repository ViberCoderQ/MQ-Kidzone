-- Per-kid photo (shown in the Chores screen's progress banner, replacing the colored
-- initial-letter avatar when set). Set in Grown-ups > Photo Editor > Child Photos.
-- Uses the existing "pictures" Storage bucket (see supabase-storage.sql) -- same bucket and
-- family-scoped RLS policies chore/store/home photos already use.
alter table kids
  add column if not exists photo_url text;

notify pgrst, 'reload schema';
