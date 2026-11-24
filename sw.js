// Offline support. "Network first": when the iPad is online it always gets the newest files
// from Netlify (so a new deploy shows up right away), and a copy of each file is kept. When it's
// offline, the kept copy is used instead, so the app still opens and works.
const CACHE = 'family-app-v125';
const CORE = [
  './',
  'index.html',
  'style.css',
  'store-items.css',
  'memory-match.css',
  'spot-the-difference.css',
  'manifest.json',
  'icons/icon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/config.js',
  'js/supabase-client.js',
  'js/parent-auth.js',
  'js/store.js',
  'js/voice.js',
  'js/parent-pin.js',
  'js/settings.js',
  'js/coins.js',
  'js/rewards-data.js',
  'js/profiles.js',
  'js/templates.js',
  'js/raster-art.js',
  'js/styluses.js',
  'js/custom-stickers.js',
  'js/stickers.js',
  'js/shapes.js',
  'js/colors.js',
  'js/canvas-engine.js',
  'js/gallery.js',
  'js/backup.js',
  'js/app.js',
  'js/setup.js',
  'js/kid-rewards.js',
  'js/reward-pill.js',
  'js/pig-clerk.js',
  'js/asset-preloader.js',
  'js/war.js',
  'js/tictactoe.js',
  'js/connect4.js',
  'js/games.js',
  'js/math-content.js',
  'js/learning.js',
  'js/custom-reading-pics.js',
  'js/reading-content.js',
  'js/memory-match-words.js',
  'js/mm-trace-glyphs.js',
  'js/memory-match-game.js',
  'js/spot-the-difference-levels.js',
  'js/spot-the-difference.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE))
      .catch((err) => console.warn('[SW] pre-caching failed (will cache as files load):', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The photo editor's save check must always hit the real file, never a kept copy.
  if (url.searchParams.has('_verify') || req.cache === 'reload') return;

  // Static art (backgrounds, icons, the pig's sprites) -- cache first, not network first. These
  // never change in place: a real content change always comes with either a bumped "?v=NN" query
  // string or a bumped CACHE constant above (which deletes every old entry on activate), so once
  // a given URL has been fetched once, it's safe to keep serving it from the cache forever without
  // re-checking the network -- which is what makes a second visit to any screen, even after the
  // whole app has been fully closed and reopened, show up instantly instead of re-fetching and
  // re-decoding the same image over again. This was the actual cause of the "every screen is slow
  // the first time, every time" feeling: everything below used to go through the network-first
  // path meant for index.html/JS/CSS (where "always get the newest" matters and files are small
  // enough that re-checking costs nothing), including images that never change and can be large.
  if ((req.destination === 'image') && (url.pathname.includes('/assets/') || url.pathname.includes('/icons/'))) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const anyVersion = await cache.match(req, { ignoreSearch: true });
        if (anyVersion) return anyVersion;
        throw err;
      }
    })());
    return;
  }

  // Everything else (the HTML shell, JS, CSS, manifest) -- network first, unchanged: always get
  // the newest file when online, so a new deploy shows up right away without a stale cache ever
  // masking it; only fall back to the kept copy when actually offline.
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      const cache = await caches.open(CACHE);
      // Exact match first, then the same file ignoring "?v=58"-style version tags.
      const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const page = (await cache.match('index.html')) || (await cache.match('./'));
        if (page) return page;
      }
      throw err;
    }
  })());
});
