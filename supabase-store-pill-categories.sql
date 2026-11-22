-- Which of the fixed Reward Shop categories each of the 8 category pills shows (Setup > Reward
-- Shop tab). jsonb keyed by pill color (store-pill-blue/cyan/gold/green/pink/orange/purple/red),
-- e.g. {"blue": "Toys", "cyan": "Games"} -- a color with no key yet (or a brand-new family row)
-- means that pill stays blank until a grown-up assigns it a category. Syncs the same way
-- coin_rules already does.
alter table families
  add column if not exists store_pill_categories jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
