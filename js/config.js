// App-wide settings. Change the name here and in manifest.json ("name" and "short_name") and it
// updates everywhere.
const APP_NAME = 'Kid Zone';

// The kid sections shown on the home screen, in order. "ready: false" shows the tile dimmed with
// a "Soon" badge; tapping it just says the name out loud.
const SECTIONS = [
  { id: 'coloring', label: 'Coloring', emoji: '🖍️', accent: 'pink', ready: true },
  { id: 'chores', label: 'Chores', emoji: '🧹', accent: 'green', ready: true },
  { id: 'math', label: 'Math', emoji: '🔢', accent: 'blue', ready: true },
  { id: 'reading', label: 'Reading', emoji: '📚', accent: 'purple', ready: true },
  { id: 'games', label: 'Games', emoji: '🎮', accent: 'orange', ready: true },
  { id: 'store', label: 'Store', emoji: '🛍️', accent: 'yellow', ready: true },
  { id: 'puzzles', label: 'Puzzles', emoji: '🧩', accent: 'red', ready: false },
  { id: 'music', label: 'Music', emoji: '🎵', accent: 'purple', ready: false },
];

// Coin values, chores and store items are no longer set here: parents change them in Setup on
// the central computer, which saves data/settings.json (see js/settings.js).

// Supabase project: one shared "family" of data (kids, chores, store, coins) that every iPad
// reads and writes, instead of each iPad keeping its own separate copy. The key below is the
// public "anon"/"publishable" key -- safe to ship in client code, since every table it can touch
// is locked down with Row Level Security (see supabase-schema.sql). Never put the service_role
// key here.
const SUPABASE_URL = 'https://csveetfqtbtpjkkizxvg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hfvLCsSbqbHv7lf0vBM62g_VQr1AwU6';
