alter table public.kids add column if not exists dashboard_color text check (dashboard_color in ('blue','orange','green','red','purple','pink','gold','silver'));
