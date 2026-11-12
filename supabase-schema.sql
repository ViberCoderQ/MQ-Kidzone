-- Kid Zone / Supabase schema
-- Run this once in the Supabase SQL Editor (Database -> SQL Editor -> New query).
-- Safe to re-run: uses "if not exists" / "or replace" where possible.

create extension if not exists pgcrypto;

-- ---------- families: one row per parent account ----------
create table if not exists families (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Our Family',
  coin_rules jsonb not null default '{
    "sections": {
      "coloring": {"perItem": 2, "dailyLimit": 6, "minActions": 3},
      "chores": {"dailyLimit": 20},
      "math": {"perItem": 3, "gamePerItem": 1, "dailyLimit": 10},
      "reading": {"perItem": 3, "gamePerItem": 1, "dailyLimit": 10}
    }
  }'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- kids: one row per child, shared across every iPad ----------
create table if not exists kids (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  avatar_color text,
  spelling_helper boolean not null default true,
  auto_read boolean not null default true,
  level_math int not null default 1,
  level_reading int not null default 1,
  savings_goal jsonb,
  created_at timestamptz not null default now()
);

-- ---------- chores: parent-curated catalog ----------
create table if not exists chores (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  picture jsonb not null default '{"type":"emoji","value":"⭐"}'::jsonb,
  coins int not null default 2,
  kid_ids uuid[] not null default '{}',   -- empty = everyone
  days int[] not null default '{}',       -- empty = every day; 0=Sun..6=Sat
  created_at timestamptz not null default now()
);

-- ---------- store_items: parent-curated catalog ----------
create table if not exists store_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null,
  picture jsonb not null default '{"type":"emoji","value":"🎁"}'::jsonb,
  price int not null default 20,
  item_limit text check (item_limit in ('day','week')),
  created_at timestamptz not null default now()
);

-- ---------- chore_log: "I did this today" / parent approval, per kid ----------
create table if not exists chore_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  chore_id uuid references chores(id) on delete set null,
  day date not null,
  status text not null default 'waiting' check (status in ('waiting','approved')),
  name text not null,
  picture jsonb,
  coins int not null default 0,
  paid int,
  done_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists chore_log_kid_day_idx on chore_log (kid_id, day);

-- ---------- store_requests: purchase asks, per kid ----------
create table if not exists store_requests (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  item_id uuid references store_items(id) on delete set null,
  name text not null,
  picture jsonb,
  price int not null,
  status text not null default 'waiting' check (status in ('waiting','paid','declined')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists store_requests_kid_idx on store_requests (kid_id);

-- ---------- coin_ledger: append-only history, per kid; balance = sum(amount) ----------
create table if not exists coin_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kid_id uuid not null references kids(id) on delete cascade,
  amount int not null,
  source text not null,
  label text,
  emoji text,
  created_at timestamptz not null default now()
);
create index if not exists coin_ledger_kid_idx on coin_ledger (kid_id);

-- ================= Row Level Security =================
-- Every table is scoped to "rows whose family_id belongs to the signed-in parent".
-- Kids never get their own Supabase login; the parent signs in once per iPad in
-- Setup, and that session stays active for the whole device (kid-switching is
-- purely an app-level concept, not a Supabase auth concept).

alter table families enable row level security;
alter table kids enable row level security;
alter table chores enable row level security;
alter table store_items enable row level security;
alter table chore_log enable row level security;
alter table store_requests enable row level security;
alter table coin_ledger enable row level security;

-- families: a user can see/insert/update only their own family row
drop policy if exists "family: owner full access" on families;
create policy "family: owner full access" on families
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- helper condition reused by every child table: family_id must belong to the caller
drop policy if exists "kids: family access" on kids;
create policy "kids: family access" on kids
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "chores: family access" on chores;
create policy "chores: family access" on chores
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "store_items: family access" on store_items;
create policy "store_items: family access" on store_items
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "chore_log: family access" on chore_log;
create policy "chore_log: family access" on chore_log
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "store_requests: family access" on store_requests;
create policy "store_requests: family access" on store_requests
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

drop policy if exists "coin_ledger: family access" on coin_ledger;
create policy "coin_ledger: family access" on coin_ledger
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

-- ================= Table grants =================
-- RLS policies only take effect once the role already has base table privileges -- Postgres
-- checks GRANTs first, then RLS filters rows on top. Tables made via raw SQL (like this script)
-- don't get those grants automatically the way Supabase's Table Editor UI would set them up, so
-- without this block every query fails with "permission denied" before RLS is even consulted.
-- Only "authenticated" (the signed-in parent) ever needs access -- kids never sign in to
-- Supabase directly, and the app does no queries at all before the parent's first sign-in.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
