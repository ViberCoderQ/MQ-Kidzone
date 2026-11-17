-- Family-wide, cross-device home-screen family photo (set in Grown-ups > Home Screen Photo).
-- home_photo_url points at a file in the existing "pictures" Storage bucket (see
-- supabase-storage.sql -- same bucket chore/store photos already use; run that first if you
-- haven't). home_photo_size_pct syncs the same way coin_rules already does. null url = use the
-- built-in default photo (icons/home-logo.png).
alter table families
  add column if not exists home_photo_size_pct int not null default 36;
alter table families
  add column if not exists home_photo_url text;

notify pgrst, 'reload schema';
