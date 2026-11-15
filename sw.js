// Offline support. "Network first": when the iPad is online it always gets the newest files
// from Netlify (so a new deploy shows up right away), and a copy of each file is kept. When it's
// offline, the kept copy is used instead, so the app still opens and works.
const CACHE = 'family-app-v103';
const CORE = [
  './',
  'index.html',
  'style.css',
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
