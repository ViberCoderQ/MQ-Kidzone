// Family Account: the ONE real login in this app. A parent signs in here once per iPad (in the
// Grown-ups area); kids never see this and never get their own Supabase login -- the "whose
// gallery/coins am I looking at" switching on the sign-in keyboard stays purely local, same as
// before. Once signed in, the session is kept by the Supabase SDK itself (see
// js/supabase-client.js) and survives restarts until someone taps Sign Out.
//
// First sign-up also creates this parent's single `families` row, which every other table
// (kids, chores, store, coin_ledger, ...) is scoped to via Row Level Security.
const ParentAuth = (() => {
  const $ = (id) => document.getElementById(id);

  let currentFamily = null; // { id, name } once signed in, else null
  let readyResolve;
  const readyPromise = new Promise((r) => { readyResolve = r; });
  const changeListeners = []; // called with the family id (or null) whenever sign-in state settles

  function getFamilyId() {
    return currentFamily ? currentFamily.id : null;
  }

  function getCurrentFamily() {
    return currentFamily;
  }

  // Fires after every sign-in/sign-out/initial-session-check, once `currentFamily` is current.
  // `ready` additionally resolves (once) the very first time this happens, so other modules can
  // wait for "do we know yet whether someone's signed in" the same way app.js already waits on
  // settings.js's settingsReady.
  function onChange(cb) {
    changeListeners.push(cb);
  }
  function notifyChange() {
    readyResolve();
    changeListeners.forEach((cb) => { try { cb(getFamilyId()); } catch (err) { console.error('[ParentAuth] onChange listener failed:', err); } });
  }

  function showError(message) {
    const el = $('family-account-error');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('hidden', !message);
  }

  function renderSignedOut() {
    currentFamily = null;
    $('family-account-signed-out').classList.remove('hidden');
    $('family-account-signed-in').classList.add('hidden');
    notifyChange();
  }

  function renderSignedIn(user, family) {
    currentFamily = family;
    showError('');
    $('family-account-signed-out').classList.add('hidden');
    $('family-account-signed-in').classList.remove('hidden');
    $('family-account-email-line').textContent = `✅ Signed in as ${user.email}`;
    notifyChange();
  }

  // Finds this parent's family row, creating it the first time they ever sign in. Supabase fires
  // onAuthStateChange for every sign-in, including ones we also drive by hand (e.g. right after
  // signUp()), so two calls can land here for the same brand-new user at once; if the insert
  // loses that race (23505 = unique_violation on owner_id), just re-select instead of failing.
  async function ensureFamilyRow(user) {
    const { data: existing, error: selErr } = await supabaseClient
      .from('families').select('id, name').eq('owner_id', user.id).maybeSingle();
    if (selErr) throw selErr;
    if (existing) return existing;
    const { data: created, error: insErr } = await supabaseClient
      .from('families').insert({ owner_id: user.id }).select('id, name').single();
    if (!insErr) return created;
    if (insErr.code === '23505') {
      const { data: retry, error: retryErr } = await supabaseClient
        .from('families').select('id, name').eq('owner_id', user.id).single();
      if (retryErr) throw retryErr;
      return retry;
    }
    throw insErr;
  }

  async function handleSignedIn(user) {
    try {
      const family = await ensureFamilyRow(user);
      renderSignedIn(user, family);
    } catch (err) {
      console.error('[ParentAuth] could not load/create family row:', err);
      showError("Signed in, but couldn't set up the family account. Check your connection and try again.");
      // Still notify/resolve `ready` even though we don't have a family -- otherwise anything
      // waiting on ParentAuth.ready (e.g. profiles.js loading kids) would hang forever on a
      // transient network error instead of just proceeding with "no family yet."
      currentFamily = null;
      notifyChange();
    }
  }

  async function signUp() {
    const email = $('family-email').value.trim();
    const password = $('family-password').value;
    if (!email || !password) { showError('Enter an email and password first.'); return; }
    if (password.length < 6) { showError('Password needs to be at least 6 characters.'); return; }
    showError('');
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) { showError(error.message); return; }
    if (!data.session) {
      showError('Account created! Check that email to confirm it, then come back and Sign In.');
      return;
    }
    // Don't call handleSignedIn() here too -- a session just got established, so
    // onAuthStateChange below is about to fire for it on its own.
  }

  async function signIn() {
    const email = $('family-email').value.trim();
    const password = $('family-password').value;
    if (!email || !password) { showError('Enter your email and password.'); return; }
    showError('');
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) { showError(error.message); return; }
    // onAuthStateChange below picks up the new session and renders the signed-in state.
  }

  async function signOut() {
    await supabaseClient.auth.signOut();
    renderSignedOut();
  }

  async function init() {
    $('family-signup-btn').addEventListener('click', signUp);
    $('family-signin-btn').addEventListener('click', signIn);
    $('family-signout-btn').addEventListener('click', signOut);

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) await handleSignedIn(session.user);
    else renderSignedOut();

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session && session.user) handleSignedIn(session.user);
      else renderSignedOut();
    });
  }

  return { init, getFamilyId, getCurrentFamily, onChange, get ready() { return readyPromise; } };
})();

ParentAuth.init();
