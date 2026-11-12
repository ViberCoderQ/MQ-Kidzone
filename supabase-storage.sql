-- Kid Zone / Supabase Storage for chore & store pictures
-- Run this once in the Supabase SQL Editor (Database -> SQL Editor -> New query).
-- Safe to re-run.

-- One bucket for every family's chore/store photos. Files are saved under
-- "<family_id>/<random-filename>.jpg" -- the bucket is public (so <img src="..."> just works,
-- no sign-in required to VIEW a picture, same as any normal website image), but only a signed-in
-- member of that family can upload/replace/delete files inside their own family's folder. Since
-- folder names are random UUIDs and filenames include a timestamp, nobody could guess another
-- family's picture URLs in practice -- this is a deliberate simplicity-vs-privacy tradeoff (full
-- private access control is possible but needs a bigger change on the app side; ask if you'd
-- rather have that instead).
insert into storage.buckets (id, name, public)
values ('pictures', 'pictures', true)
on conflict (id) do nothing;

drop policy if exists "pictures: public read" on storage.objects;
create policy "pictures: public read" on storage.objects
  for select
  using (bucket_id = 'pictures');

drop policy if exists "pictures: family can upload" on storage.objects;
create policy "pictures: family can upload" on storage.objects
  for insert
  with check (
    bucket_id = 'pictures'
    and (storage.foldername(name))[1] in (select id::text from families where owner_id = auth.uid())
  );

drop policy if exists "pictures: family can update" on storage.objects;
create policy "pictures: family can update" on storage.objects
  for update
  using (
    bucket_id = 'pictures'
    and (storage.foldername(name))[1] in (select id::text from families where owner_id = auth.uid())
  );

drop policy if exists "pictures: family can delete" on storage.objects;
create policy "pictures: family can delete" on storage.objects
  for delete
  using (
    bucket_id = 'pictures'
    and (storage.foldername(name))[1] in (select id::text from families where owner_id = auth.uid())
  );
