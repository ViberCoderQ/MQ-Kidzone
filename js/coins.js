// Coins: one running history ("ledger") per kid, synced through Supabase so a kid's balance
// follows them to any iPad instead of staying stuck on whichever device he earned it on. Cached
// in memory per kid id (same pattern as js/profiles.js and js/settings.js) so every read here
// stays synchronous -- the rest of the app calls these constantly during gameplay and shouldn't
// need to become async just because the data now lives in the cloud. Writes update the cache
// immediately and insert the row in the background.
//
// Entry: { id, at (ISO time), amount (+ earned / - spent), source, label, emoji }
//   source: 'coloring', 'chores', 'math', 'reading' (the sections that count toward daily
//   limits), 'store' (a purchase), or 'parent' for a grown-up's manual add/remove.
let coinLedgerCache = new Map(); // kidId -> entries, newest first

function rowToCoinEntry(row) {
  return { id: row.id, at: row.created_at, amount: row.amount, source: row.source, label: row.label || '', emoji: row.emoji || '🪙' };
}

// Builds into a local map and swaps it in at the end (one atomic assignment), rather than
// resetting the shared cache up front and appending to it after the await below -- ParentAuth can
// fire onChange more than once for what's really the same sign-in, and two overlapping calls
// appending into the same already-reset cache would double up every entry.
async function refreshCoinLedger() {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) { coinLedgerCache = new Map(); return; }
  const { data, error } = await supabaseClient
    .from('coin_ledger').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
  if (error) { console.error('[Coins] could not load coin ledger:', error); return; }
  const next = new Map();
  (data || []).forEach((row) => {
    const list = next.get(row.kid_id) || [];
    list.push(rowToCoinEntry(row));
    next.set(row.kid_id, list);
  });
  coinLedgerCache = next;
}

ParentAuth.onChange(() => { refreshCoinLedger(); });

function loadCoinHistory(profileId) {
  return coinLedgerCache.get(profileId) || [];
}

function getCoinBalance(profileId) {
  return loadCoinHistory(profileId).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
}

function addCoinEntry(profileId, { amount, source, label, emoji }) {
  const familyId = ParentAuth.getFamilyId();
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    amount: Math.round(Number(amount) || 0),
    source,
    label: label || '',
    emoji: emoji || '🪙',
  };
  const list = coinLedgerCache.get(profileId) || [];
  list.unshift(entry);
  coinLedgerCache.set(profileId, list);
  if (familyId) {
    supabaseClient.from('coin_ledger').insert({
      id: entry.id, family_id: familyId, kid_id: profileId,
      amount: entry.amount, source: entry.source, label: entry.label, emoji: entry.emoji,
    }).then(({ error }) => {
      if (error) console.error('[Coins] could not save coin entry:', error);
    });
  }
  return entry;
}

// The Supabase row is removed automatically (kid_id has ON DELETE CASCADE from the kids table)
// when the kid itself is deleted -- this just clears the local cache.
function deleteCoinsForProfile(profileId) {
  coinLedgerCache.delete(profileId);
}

// Local calendar day ("2026-10-24"), so limits reset at the iPad's own midnight.
function localDayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function coinsEarnedToday(profileId, source) {
  const today = localDayKey(new Date());
  const earningSources = Object.keys(getCoinRules().sections);
  return loadCoinHistory(profileId)
    .filter((e) => e.amount > 0 && localDayKey(e.at) === today)
    .filter((e) => (source ? e.source === source : earningSources.includes(e.source)))
    .reduce((sum, e) => sum + e.amount, 0);
}

// The overall daily limit is the section limits added up.
function overallDailyLimit() {
  return Object.values(getCoinRules().sections).reduce((sum, s) => sum + (s.dailyLimit || 0), 0);
}

// Pays coins for one finished thing in a section, respecting that section's daily limit and the
// overall one. Returns { amount, status }: status is 'paid', 'partial' (paid less than usual
// because the limit was nearly reached) or 'limit' (nothing left to earn today).
// `amount` overrides the section's usual per-item pay (chores each have their own value).
function earnCoins(profileId, sectionId, { label, emoji, amount: wanted }) {
  const rule = getCoinRules().sections[sectionId];
  if (!rule) return { amount: 0, status: 'limit' };
  const full = wanted != null ? wanted : rule.perItem;
  const sectionLeft = Math.max(0, rule.dailyLimit - coinsEarnedToday(profileId, sectionId));
  const overallLeft = Math.max(0, overallDailyLimit() - coinsEarnedToday(profileId));
  const amount = Math.min(full, sectionLeft, overallLeft);
  if (amount <= 0) return { amount: 0, status: 'limit' };
  addCoinEntry(profileId, { amount, source: sectionId, label, emoji });
  return { amount, status: amount < full ? 'partial' : 'paid' };
}
