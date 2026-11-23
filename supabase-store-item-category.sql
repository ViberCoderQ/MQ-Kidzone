-- Which fixed Reward Shop category (js/setup.js's CATEGORY_OPTIONS) a store item belongs to, e.g.
-- 'Toys'. Null means "not categorized yet" -- such an item shows up under every category pill
-- until a grown-up assigns it one, same treatment a brand-new install's rows get for free.
alter table store_items
  add column if not exists category text;

notify pgrst, 'reload schema';
