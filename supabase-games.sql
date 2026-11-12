-- Kid Zone / Supabase schema for the Games (VS) feature
-- Run this once in the Supabase SQL Editor (Database -> SQL Editor -> New query).
-- Safe to re-run.

create table if not exists game_sessions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  game_type text not null check (game_type in ('war', 'go_fish')),
  challenger_id uuid not null references kids(id) on delete cascade,
  opponent_id uuid not null references kids(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'declined', 'cancelled', 'active', 'finished')),
  state jsonb,              -- full game state (deck, hands, whose turn); unused until Phase 2
  turn_kid_id uuid references kids(id) on delete set null,   -- unused until Phase 2
  winner_kid_id uuid references kids(id) on delete set null, -- unused until Phase 2
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists game_sessions_family_idx on game_sessions (family_id);
create index if not exists game_sessions_opponent_idx on game_sessions (opponent_id, status);
create index if not exists game_sessions_challenger_idx on game_sessions (challenger_id, status);

alter table game_sessions enable row level security;

-- Same family-scoped pattern as every other table: RLS checks family_id, and this table is
-- covered by the "grant ... to authenticated" + "alter default privileges" statements already run
-- for the rest of the schema, so no extra GRANT is needed here.
drop policy if exists "game_sessions: family access" on game_sessions;
create policy "game_sessions: family access" on game_sessions
  for all using (family_id in (select id from families where owner_id = auth.uid()))
  with check (family_id in (select id from families where owner_id = auth.uid()));

-- Turns on live push updates for this table (Realtime) -- this is what lets a challenge, accept,
-- or decline show up instantly on the OTHER kid's iPad without them refreshing anything.
alter publication supabase_realtime add table game_sessions;

-- Required for DELETE events (a cancelled challenge) to actually reach a filtered subscription --
-- by default Postgres only logs the primary key for a deleted row, which isn't enough to check
-- the filter's family_id condition against, so the delete event gets silently dropped without
-- this. INSERT/UPDATE already work without it since the full new row is always available.
alter table game_sessions replica identity full;

-- ---------- War (Phase 2) ----------
-- "p1" = challenger, "p2" = opponent. Each kid's own revealed flag/card lives in its own column so
-- both kids can flip their own card at the same moment with zero write conflict (a shared jsonb
-- blob would risk one kid's flip clobbering the other's in a read-modify-write race). The decks
-- and pot are jsonb arrays, safe because only one actor (whoever collects) ever writes them.
alter table game_sessions
  add column if not exists phase text default 'flip' check (phase in ('flip', 'awaiting_collect')),
  add column if not exists p1_deck jsonb,
  add column if not exists p2_deck jsonb,
  add column if not exists p1_card text,
  add column if not exists p2_card text,
  add column if not exists p1_revealed boolean not null default false,
  add column if not exists p2_revealed boolean not null default false,
  add column if not exists pot jsonb not null default '[]'::jsonb,
  add column if not exists round_winner_id uuid references kids(id) on delete set null;

-- ---------- Tic Tac Toe & Connect 4 (Phase 3) ----------
-- Both are simple single-shared-board turn games (strictly alternating moves on one board, unlike
-- War's simultaneous per-side reveal), so they share these generic columns instead of each getting
-- their own -- game_type disambiguates which shape `board`/`last_move` actually holds:
--   tic_tac_toe: board = 9-slot array ('X'/'O'/null), last_move = a cell index (0-8)
--   connect_4:   board = 5x7 nested array ('R'/'G'/null), last_move = {row, col}
-- `turn` is only meaningful for Connect 4 (0 = challenger's turn, 1 = opponent's); Tic Tac Toe
-- derives whose turn it is from the board itself (see currentTurn() in tictactoe.js), same as it
-- already does for local play, so that column just stays null on its rows.
-- `result` holds null (in progress), the string 'draw', or {mark, line} for a win.
-- The game_type check was created inline on the original CREATE TABLE with no explicit name, so
-- this looks it up by definition rather than guessing Postgres's auto-generated name.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'game_sessions' and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%game_type%'
  loop
    execute format('alter table game_sessions drop constraint %I', c.conname);
  end loop;
end $$;

alter table game_sessions
  add constraint game_sessions_game_type_check check (game_type in ('war', 'go_fish', 'tic_tac_toe', 'connect_4'));

alter table game_sessions
  add column if not exists board jsonb,
  add column if not exists turn integer,
  add column if not exists last_move jsonb,
  add column if not exists result jsonb;
