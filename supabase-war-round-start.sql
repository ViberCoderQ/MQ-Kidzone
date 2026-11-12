alter table game_sessions
  add column if not exists war_round_start integer not null default 0;

alter table game_sessions
  drop constraint if exists game_sessions_phase_check;
alter table game_sessions
  add constraint game_sessions_phase_check check (phase in ('flip', 'war', 'awaiting_collect'));

notify pgrst, 'reload schema';
