// Chores and the store: what each boy has done, what he has asked to buy, and his savings goal.
// Synced through Supabase (chore_log, store_requests) so this follows a kid across iPads, same
// as his coins -- cached in memory per kid id (see js/coins.js for the same pattern) so every
// read here stays synchronous. The chore and store LISTS themselves come from the shared
// settings (js/settings.js); his savings goal is a field on his own profile (js/profiles.js).

// ---------- chores ----------
// Log entry: { id, choreId, day ("2026-10-24"), status: 'waiting' | 'approved', name, picture,
//              coins, doneAt, decidedAt?, paid? }
// "Not yet" from a parent removes the entry, so the chore shows up on his list again.
let choreLogCache = new Map(); // kidId -> entries, newest first
let requestsCache = new Map(); // kidId -> entries, newest first

function rowToChoreLogEntry(row) {
  return {
    id: row.id, choreId: row.chore_id, day: row.day, status: row.status,
    name: row.name, picture: row.picture, coins: row.coins,
    doneAt: row.done_at, decidedAt: row.decided_at || undefined, paid: row.paid == null ? undefined : row.paid,
  };
}
function rowToRequestEntry(row) {
  return {
    id: row.id, itemId: row.item_id, name: row.name, picture: row.picture, price: row.price,
    status: row.status, at: row.requested_at, decidedAt: row.decided_at || undefined,
  };
}

// Builds into local maps and swaps them in at the end (one atomic assignment each), rather than
// resetting the shared caches up front and appending after the awaits below -- ParentAuth can
// fire onChange more than once for what's really the same sign-in, and two overlapping calls
// appending into the same already-reset cache would double up every entry.
async function refreshRewardsData() {
  const familyId = ParentAuth.getFamilyId();
  if (!familyId) { choreLogCache = new Map(); requestsCache = new Map(); return; }
  const [choreLogRes, requestsRes] = await Promise.all([
    supabaseClient.from('chore_log').select('*').eq('family_id', familyId).order('done_at', { ascending: false }),
    supabaseClient.from('store_requests').select('*').eq('family_id', familyId).order('requested_at', { ascending: false }),
  ]);
  if (choreLogRes.error) console.error('[Rewards] could not load chore log:', choreLogRes.error);
  if (requestsRes.error) console.error('[Rewards] could not load store requests:', requestsRes.error);
  const nextChoreLog = new Map();
  (choreLogRes.data || []).forEach((row) => {
    const list = nextChoreLog.get(row.kid_id) || [];
    list.push(rowToChoreLogEntry(row));
    nextChoreLog.set(row.kid_id, list);
  });
  const nextRequests = new Map();
  (requestsRes.data || []).forEach((row) => {
    const list = nextRequests.get(row.kid_id) || [];
    list.push(rowToRequestEntry(row));
    nextRequests.set(row.kid_id, list);
  });
  choreLogCache = nextChoreLog;
  requestsCache = nextRequests;
}

ParentAuth.onChange(() => { refreshRewardsData(); });

function loadChoreLog(profileId) {
  return choreLogCache.get(profileId) || [];
}

// Today's chores for this boy: assigned to everyone or to his (real, Supabase) id, on today's
// weekday. Chores not marked Done simply disappear at midnight, since tomorrow's list is built
// fresh.
function todaysChoresFor(profile, date) {
  const d = date || new Date();
  const weekday = d.getDay();
  return getSettings().chores.filter((c) => {
    const forHim = !c.kids || !c.kids.length || c.kids.includes(profile.id);
    const today = !c.days || !c.days.length || c.days.includes(weekday);
    return forHim && today;
  });
}

function choreEntryToday(profileId, choreId) {
  const today = localDayKey(new Date());
  return loadChoreLog(profileId).find((e) => e.choreId === choreId && e.day === today) || null;
}

function markChoreDone(profileId, chore) {
  if (choreEntryToday(profileId, chore.id)) return null;
  const familyId = ParentAuth.getFamilyId();
  const entry = {
    id: crypto.randomUUID(),
    choreId: chore.id,
    day: localDayKey(new Date()),
    status: 'waiting',
    name: chore.name,
    picture: chore.picture,
    coins: chore.coins,
    doneAt: new Date().toISOString(),
  };
  const list = choreLogCache.get(profileId) || [];
  list.unshift(entry);
  choreLogCache.set(profileId, list);
  if (familyId) {
    supabaseClient.from('chore_log').insert({
      id: entry.id, family_id: familyId, kid_id: profileId, chore_id: entry.choreId,
      day: entry.day, status: entry.status, name: entry.name, picture: entry.picture,
      coins: entry.coins, done_at: entry.doneAt,
    }).then(({ error }) => {
      if (error) console.error('[Rewards] could not save chore completion:', error);
    });
  }
  return entry;
}

function waitingChores(profileId) {
  return loadChoreLog(profileId).filter((e) => e.status === 'waiting');
}

// Approve: pays the chore's coins (up to the chore limit unless `payFull`). Returns coins paid.
function approveChore(profileId, entryId, payFull) {
  const list = choreLogCache.get(profileId) || [];
  const e = list.find((x) => x.id === entryId);
  if (!e || e.status !== 'waiting') return 0;
  let paid;
  if (payFull) {
    addCoinEntry(profileId, { amount: e.coins, source: 'chores', label: `Chore: ${e.name}`, emoji: choreEmoji(e) });
    paid = e.coins;
  } else {
    paid = earnCoins(profileId, 'chores', { label: `Chore: ${e.name}`, emoji: choreEmoji(e), amount: e.coins }).amount;
  }
  e.status = 'approved';
  e.paid = paid;
  e.decidedAt = new Date().toISOString();
  supabaseClient.from('chore_log').update({ status: 'approved', paid, decided_at: e.decidedAt }).eq('id', entryId).then(({ error }) => {
    if (error) console.error('[Rewards] could not save chore approval:', error);
  });
  return paid;
}

function notYetChore(profileId, entryId) {
  const list = choreLogCache.get(profileId) || [];
  choreLogCache.set(profileId, list.filter((x) => x.id !== entryId));
  supabaseClient.from('chore_log').delete().eq('id', entryId).then(({ error }) => {
    if (error) console.error('[Rewards] could not remove chore entry:', error);
  });
}

// ---------- All Kids Chores dashboard: admin quick-complete ----------
// A parent standing right there watching a kid finish a chore can mark it straight to approved
// from the dashboard, instead of the normal two-step "kid taps Done, parent approves later" --
// this just runs both existing steps back to back. Always earn-capped (payFull=false), same as
// the approval queue's own default -- deliberately never shows the "pay full anyway?" popup that
// flow uses for the daily-limit edge case, since that'd interrupt a fast morning routine on a
// shared/TV display; a parent who wants to override the limit can still do that from the normal
// approval queue. Returns the coins actually paid (0 if none, e.g. already logged by the kid and
// approved, or the daily limit was already hit).
function instantCompleteChore(profileId, chore) {
  let entry = choreEntryToday(profileId, chore.id);
  if (!entry) entry = markChoreDone(profileId, chore);
  if (!entry || entry.status !== 'waiting') return 0;
  return approveChore(profileId, entry.id, false);
}

// Reverses an instantCompleteChore tap (admin mode toggles a completed chore back to not-done,
// e.g. a mis-tap during the morning routine). Un-pays whatever was paid with a new negative
// ledger entry -- same append-only convention every other coin adjustment in this app already
// uses, not editing/removing the original payment -- then removes the chore_log entry via the
// existing notYetChore() so the chore shows up as not-done again, same end state a parent's
// "Not yet" on a waiting (not yet approved) entry already leaves.
function unapproveChore(profileId, entryId) {
  const list = choreLogCache.get(profileId) || [];
  const e = list.find((x) => x.id === entryId);
  if (!e || e.status !== 'approved') return;
  if (e.paid) addCoinEntry(profileId, { amount: -e.paid, source: 'chores', label: `Undo: ${e.name}`, emoji: choreEmoji(e) });
  notYetChore(profileId, entryId);
}

function choreEmoji(e) {
  return e.picture && e.picture.type === 'emoji' ? e.picture.value : '🧹';
}

// How many coins approving this chore would pay under today's limits.
function choreCoinsAllowedNow(profileId, coins) {
  const rule = getCoinRules().sections.chores;
  const sectionLeft = Math.max(0, rule.dailyLimit - coinsEarnedToday(profileId, 'chores'));
  const overallLeft = Math.max(0, overallDailyLimit() - coinsEarnedToday(profileId));
  return Math.min(coins, sectionLeft, overallLeft);
}

// ---------- store requests ----------
// Request: { id, itemId, name, picture, price, status: 'waiting' | 'paid' | 'declined', at, decidedAt? }
function loadRequests(profileId) {
  return requestsCache.get(profileId) || [];
}

// Coins set aside for purchases still waiting for a parent -- they can't be spent twice.
function reservedCoins(profileId) {
  return loadRequests(profileId).filter((r) => r.status === 'waiting').reduce((s, r) => s + r.price, 0);
}

function spendableCoins(profileId) {
  return getCoinBalance(profileId) - reservedCoins(profileId);
}

function startOfWeek(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const back = (x.getDay() + 6) % 7; // weeks start on Monday
  x.setDate(x.getDate() - back);
  return x;
}

// For items with a "once a day / once a week" limit: has he already bought it this day/week?
function boughtWithinLimit(profileId, item) {
  if (!item.limit) return false;
  const now = new Date();
  return loadRequests(profileId).some((r) => {
    if (r.itemId !== item.id || r.status === 'declined') return false;
    const at = new Date(r.at);
    if (item.limit === 'day') return localDayKey(at) === localDayKey(now);
    return at >= startOfWeek(now);
  });
}

function requestPurchase(profileId, item) {
  if (spendableCoins(profileId) < item.price || boughtWithinLimit(profileId, item)) return null;
  const familyId = ParentAuth.getFamilyId();
  const req = {
    id: crypto.randomUUID(),
    itemId: item.id,
    name: item.name,
    picture: item.picture,
    price: item.price, // the price he saw, even if parents change it later
    status: 'waiting',
    at: new Date().toISOString(),
  };
  const list = requestsCache.get(profileId) || [];
  list.unshift(req);
  requestsCache.set(profileId, list);
  if (familyId) {
    supabaseClient.from('store_requests').insert({
      id: req.id, family_id: familyId, kid_id: profileId, item_id: req.itemId,
      name: req.name, picture: req.picture, price: req.price, status: req.status, requested_at: req.at,
    }).then(({ error }) => {
      if (error) console.error('[Rewards] could not save purchase request:', error);
    });
  }
  return req;
}

function waitingRequests(profileId) {
  return loadRequests(profileId).filter((r) => r.status === 'waiting');
}

function markRequestPaid(profileId, requestId) {
  const list = requestsCache.get(profileId) || [];
  const r = list.find((x) => x.id === requestId);
  if (!r || r.status !== 'waiting') return false;
  r.status = 'paid';
  r.decidedAt = new Date().toISOString();
  supabaseClient.from('store_requests').update({ status: 'paid', decided_at: r.decidedAt }).eq('id', requestId).then(({ error }) => {
    if (error) console.error('[Rewards] could not save purchase payment:', error);
  });
  const emoji = r.picture && r.picture.type === 'emoji' ? r.picture.value : '🛍️';
  addCoinEntry(profileId, { amount: -r.price, source: 'store', label: `Bought: ${r.name}`, emoji });
  return true;
}

function markRequestDeclined(profileId, requestId) {
  const list = requestsCache.get(profileId) || [];
  const r = list.find((x) => x.id === requestId);
  if (!r || r.status !== 'waiting') return false;
  r.status = 'declined';
  r.decidedAt = new Date().toISOString();
  supabaseClient.from('store_requests').update({ status: 'declined', decided_at: r.decidedAt }).eq('id', requestId).then(({ error }) => {
    if (error) console.error('[Rewards] could not save purchase decline:', error);
  });
  return true;
}

// ---------- savings goal ----------
// Kept on the profile as a copy of the item, so it still shows if the item is later removed.
function getSavingsGoal(profile) {
  const g = profile.savingsGoal;
  if (!g) return null;
  const live = getSettings().store.find((i) => i.id === g.itemId);
  return live ? { itemId: live.id, name: live.name, picture: live.picture, price: live.price, available: true } : { ...g, available: false };
}

function setSavingsGoal(profileId, item) {
  updateProfile(profileId, { savingsGoal: item ? { itemId: item.id, name: item.name, picture: item.picture, price: item.price } : null });
}

// The Supabase rows are removed automatically (kid_id has ON DELETE CASCADE from the kids table)
// when the kid itself is deleted -- this just clears the local cache.
function deleteRewardsForProfile(profileId) {
  choreLogCache.delete(profileId);
  requestsCache.delete(profileId);
}
