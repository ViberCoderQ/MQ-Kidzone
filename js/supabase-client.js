// One shared connection to the family's cloud data. Created once at load time and reused
// everywhere (profiles.js, settings.js, coins.js, rewards-data.js, setup.js all read/write
// through this same client). The session (who the signed-in parent is) is kept in localStorage
// by the Supabase SDK itself, under the storageKey below, so a parent who signs in once on an
// iPad stays signed in across restarts -- see js/parent-auth.js for the sign-in flow itself.
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'family-app.supabase-auth',
  },
});
