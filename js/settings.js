// Shared data: chores, store items and coin rules, scoped to the signed-in parent's family and
// kept in Supabase so every iPad sees the same thing -- edit a chore in Setup on any iPad and it
// saves immediately, no "drag the folder to Netlify" step. Kid names/IDs come from
// js/profiles.js (loadProfiles()), not from here.
//
// Pictures are either a built-in emoji ({ type: 'emoji', value: '🪥' }) or an uploaded photo
// ({ type: 'image', src: 'data/pictures/brush-teeth-1729790000.jpg' }) -- photos still need a
// desktop browser with the project folder connected (see setup.js); emoji pictures work anywhere.
const SECTION_INFO = {
  coloring: { label: 'Coloring', emoji: '🖍️' },
  chores: { label: 'Chores', emoji: '🧹' },
  math: { label: 'Math', emoji: '🔢' },
  reading: { label: 'Reading', emoji: '📚' },
};

const DEFAULT_COIN_SECTIONS = {
  coloring: { perItem: 2, dailyLimit: 6, minActions: 3 },
  chores: { dailyLimit: 20 },
  math: { perItem: 3, gamePerItem: 1, dailyLimit: 10 },
  reading: { perItem: 3, gamePerItem: 1, dailyLimit: 10 },
};

let currentChores = [];
let currentStore = [];
let currentCoinRules = normalizeCoinRules(null);

let settingsReadyResolve;
const settingsReady = new Promise((r) => { settingsReadyResolve = r; });
let settingsChangedCallback = null;
function onSettingsChanged(cb) { settingsChangedCallback = cb; }

function normalizeCoinRules(raw) {
  const rawSections = (raw && raw.sections) || {};
  const sections = {};
  Object.entries(DEFAULT_COIN_SECTIONS).forEach(([id, defaults]) => {
    const merged = { ...defaults };
    Object.keys(defaults).forEach((k) => {
      const v = Number((rawSections[id] || {})[k]);
      if (Number.isFinite(v) && v >= 0) merged[k] = Math.round(v);
    });
    sections[id] = merged;
  });
  return { sections };
}

function rowToChore(row) {
  return { id: row.id, name: row.name, picture: row.picture, coins: row.coins, kids: row.kid_ids || [], days: row.days || [] };
}
function rowToStoreItem(row) {
  return { id: row.id, name: row.name, picture: row.picture, price: row.price, limit: row.item_limit || null };
}

async function refreshSharedData() {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) {
    currentChores = [];
    currentStore = [];
    currentCoinRules = normalizeCoinRules(null);
    return;
  }
  const [choresRes, storeRes, familyRes] = await Promise.all([
    supabaseClient.from('chores').select('*').eq('family_id', familyId).order('created_at'),
    supabaseClient.from('store_items').select('*').eq('family_id', familyId).order('created_at'),
    supabaseClient.from('families').select('coin_rules').eq('id', familyId).single(),
  ]);
  if (choresRes.error) console.error('[Settings] could not load chores:', choresRes.error);
  if (storeRes.error) console.error('[Settings] could not load store items:', storeRes.error);
  if (familyRes.error) console.error('[Settings] could not load coin rules:', familyRes.error);
  currentChores = (choresRes.data || []).map(rowToChore);
  currentStore = (storeRes.data || []).map(rowToStoreItem);
  currentCoinRules = normalizeCoinRules(familyRes.data ? familyRes.data.coin_rules : null);
}

ParentAuth.onChange(async () => {
  await refreshSharedData();
  settingsReadyResolve();
  if (settingsChangedCallback) settingsChangedCallback();
});

function getSettings() {
  return { chores: currentChores, store: currentStore, coinRules: currentCoinRules };
}

// Coin rules with labels attached, e.g. getCoinRules().sections.coloring.perItem
function getCoinRules() {
  const sections = {};
  Object.entries(currentCoinRules.sections).forEach(([id, rule]) => {
    sections[id] = { ...SECTION_INFO[id], ...rule };
  });
  return { sections };
}

async function saveCoinRules(sections) {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) throw new Error('Sign in to the Family Account first.');
  currentCoinRules = normalizeCoinRules({ sections });
  const { error } = await supabaseClient.from('families').update({ coin_rules: currentCoinRules }).eq('id', familyId);
  if (error) throw error;
}

async function saveChoreItem(item, isNew) {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) throw new Error('Sign in to the Family Account first.');
  const row = { family_id: familyId, name: item.name, picture: item.picture, coins: item.coins, kid_ids: item.kids || [], days: item.days || [] };
  if (isNew) {
    const { data, error } = await supabaseClient.from('chores').insert(row).select('*').single();
    if (error) throw error;
    item.id = data.id;
    currentChores.push(rowToChore(data));
  } else {
    const { error } = await supabaseClient.from('chores').update(row).eq('id', item.id);
    if (error) throw error;
    const idx = currentChores.findIndex((c) => c.id === item.id);
    if (idx >= 0) currentChores[idx] = { ...item };
  }
}

async function deleteChoreItem(id) {
  const { error } = await supabaseClient.from('chores').delete().eq('id', id);
  if (error) throw error;
  currentChores = currentChores.filter((c) => c.id !== id);
}

async function saveStoreItem(item, isNew) {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) throw new Error('Sign in to the Family Account first.');
  const row = { family_id: familyId, name: item.name, picture: item.picture, price: item.price, item_limit: item.limit || null };
  if (isNew) {
    const { data, error } = await supabaseClient.from('store_items').insert(row).select('*').single();
    if (error) throw error;
    item.id = data.id;
    currentStore.push(rowToStoreItem(data));
  } else {
    const { error } = await supabaseClient.from('store_items').update(row).eq('id', item.id);
    if (error) throw error;
    const idx = currentStore.findIndex((i) => i.id === item.id);
    if (idx >= 0) currentStore[idx] = { ...item };
  }
}

async function deleteStoreItem(id) {
  const { error } = await supabaseClient.from('store_items').delete().eq('id', id);
  if (error) throw error;
  currentStore = currentStore.filter((i) => i.id !== id);
}

// HTML for a chore or store picture. `cls` sizes it.
function pictureHtml(picture, cls) {
  const c = cls || '';
  if (picture && picture.type === 'image' && picture.src) {
    const src = String(picture.src).replace(/"/g, '&quot;');
    return `<img class="pic ${c}" src="${src}" alt="" />`;
  }
  const emoji = (picture && picture.value) || '⭐';
  const span = document.createElement('span');
  span.textContent = emoji;
  return `<span class="pic pic-emoji ${c}">${span.innerHTML}</span>`;
}
