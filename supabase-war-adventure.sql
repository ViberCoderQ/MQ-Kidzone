-- Kid Zone / War Adventure v2: classic War stakes history
-- Run this once in the Supabase SQL Editor (Database -> SQL Editor -> New query).

alter table game_sessions
  add column if not exists pot_history jsonb not null default '[]'::jsonb;

-- Force PostgREST to notice the new column immediately (otherwise it can take a while to pick up
-- schema changes made via raw SQL, same gotcha as last time).
notify pgrst, 'reload schema';
