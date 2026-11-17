// Kid profiles -- shared across every iPad via Supabase (one row per kid in the `kids` table,
// scoped to the signed-in parent's family; see js/parent-auth.js and js/supabase-client.js).
// "Which kid is using THIS iPad right now" stays purely local (ACTIVE_PROFILE_KEY below) -- kids
// never get their own login, so that's just UI state, not something to sync.
const ACTIVE_PROFILE_KEY = 'coloring-app.active-profile-id';

const AVATAR_COLORS = [
  '#ff6b6b', '#ff9f43', '#feca57', '#1dd1a1',
  '#54a0ff', '#5f27cd', '#ff6ba8', '#48dbfb',
];

// In-memory cache of the family's kids, kept in sync with Supabase. Every function below reads
// this synchronously (same pattern as settings.js's currentSettings), so the rest of the app
// doesn't need to change into async/await just because the data now lives in the cloud.
let kidsCache = [];
let kidsReadyResolve;
const kidsReady = new Promise((r) => { kidsReadyResolve = r; });
let kidsChangedCallback = null;
function onKidsChanged(cb) { kidsChangedCallback = cb; }

function rowToProfile(row) {
  return {
    id: row.id,
    name: row.name,
    avatarColor: row.avatar_color,
    photoUrl: row.photo_url,
    spellingHelper: row.spelling_helper,
    autoRead: row.auto_read,
    levels: { math: row.level_math, reading: row.level_reading },
    savingsGoal: row.savings_goal,
    createdAt: row.created_at,
  };
}

function patchToRow(patch) {
  const row = {};
  if ('name' in patch) row.name = patch.name;
  if ('avatarColor' in patch) row.avatar_color = patch.avatarColor;
  if ('photoUrl' in patch) row.photo_url = patch.photoUrl;
  if ('spellingHelper' in patch) row.spelling_helper = patch.spellingHelper;
  if ('autoRead' in patch) row.auto_read = patch.autoRead;
  if (patch.levels) {
    if ('math' in patch.levels) row.level_math = patch.levels.math;
    if ('reading' in patch.levels) row.level_reading = patch.levels.reading;
  }
  if ('savingsGoal' in patch) row.savings_goal = patch.savingsGoal;
  return row;
}

async function refreshKidsCache() {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) { kidsCache = []; return; }
  const { data, error } = await supabaseClient
    .from('kids').select('*').eq('family_id', familyId).order('created_at');
  if (error) { console.error('[Profiles] could not load kids from Supabase:', error); return; }
  kidsCache = (data || []).map(rowToProfile);
}

// Reload whenever the signed-in family changes (initial check, sign-in, sign-out) and tell
// whoever's listening (app.js) to re-render anything showing the kid list.
ParentAuth.onChange(async () => {
  await refreshKidsCache();
  kidsReadyResolve();
  if (kidsChangedCallback) kidsChangedCallback();
});

function loadProfiles() {
  return kidsCache;
}

function createProfile(name, avatarColor) {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) {
    alert('Sign in to the Family Account first (in the Grown-ups area), then add a kid.');
    return null;
  }
  const profiles = loadProfiles();
  const profile = {
    id: crypto.randomUUID(),
    name: name.trim() || 'Artist',
    avatarColor: avatarColor || AVATAR_COLORS[profiles.length % AVATAR_COLORS.length],
    spellingHelper: true, // the next letter of his name glows on the sign-in keyboard
    autoRead: true, // math and reading questions read themselves out loud
    levels: { math: 1, reading: 1 }, // parents move each boy up in the grown-ups area
    savingsGoal: null,
    createdAt: new Date().toISOString(),
  };
  kidsCache.push(profile);
  // Same id both places (generated here, not left to the database) so the cache and the
  // Supabase row never need reconciling.
  supabaseClient.from('kids').insert({
    id: profile.id,
    family_id: familyId,
    name: profile.name,
    avatar_color: profile.avatarColor,
    spelling_helper: profile.spellingHelper,
    auto_read: profile.autoRead,
    level_math: profile.levels.math,
    level_reading: profile.levels.reading,
  }).then(({ error }) => {
    if (error) console.error('[Profiles] could not save new kid to Supabase:', error);
  });
  return profile;
}

function deleteProfile(id) {
  kidsCache = kidsCache.filter((p) => p.id !== id);
  deleteCoinsForProfile(id);
  deleteRewardsForProfile(id);
  localStorage.removeItem(`family-app.progress.${id}`);
  deleteGalleryForProfile(id).catch((err) => console.error('[Profiles] could not delete gallery:', err));
  if (getActiveProfileId() === id) setActiveProfileId(null);
  supabaseClient.from('kids').delete().eq('id', id).then(({ error }) => {
    if (error) console.error('[Profiles] could not delete kid from Supabase:', error);
  });
}

function getActiveProfileId() {
  return getData(ACTIVE_PROFILE_KEY, null);
}

function setActiveProfileId(id) {
  setData(ACTIVE_PROFILE_KEY, id);
}

function getActiveProfile() {
  const id = getActiveProfileId();
  if (!id) return null;
  return loadProfiles().find((p) => p.id === id) || null;
}

function updateProfile(id, patch) {
  const p = kidsCache.find((x) => x.id === id);
  if (!p) return null;
  Object.assign(p, patch);
  const row = patchToRow(patch);
  if (Object.keys(row).length) {
    supabaseClient.from('kids').update(row).eq('id', id).then(({ error }) => {
      if (error) console.error('[Profiles] could not update kid in Supabase:', error);
    });
  }
  return p;
}

// Profiles made before the spelling helper existed count as "helper on".
function spellingHelperOn(profile) {
  return profile.spellingHelper !== false;
}

// Names are matched on letters only, ignoring case, spaces and punctuation, since the sign-in
// keyboard only has A to Z.
function nameLetters(name) {
  return (name || '').toUpperCase().replace(/[^A-Z]/g, '');
}
