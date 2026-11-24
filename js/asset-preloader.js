// Fetches/decodes each screen's background art (and the pig's sprite set) in the background
// after Home has had a chance to settle, instead of only starting the moment a kid actually taps
// into that screen. Every screen in this app is CSS `display:none` until navigated to, and
// browsers don't fetch a `background-image` while its element is display:none -- so without this,
// the FIRST visit to any screen in a session pays real network+decode time right at the moment of
// the tap (that's the 1-2s hitch on older/slower iPads). Once an image has been through
// `new Image().src = url` here, the browser's decoded-image cache already has it by the time the
// real background-image rule needs it, so that first visit just repaints instead of fetching.
//
// Order below is "heaviest/most complained-about first, lighter hub screens after" -- these are
// background tasks competing with whatever the kid actually taps next, so the screens that were
// most noticeably slow get primed soonest; the hub screens are small enough that a few seconds'
// delay in reaching them in this queue barely matters. Entirely best-effort: a failed/slow image
// here never blocks anything else, and if the kid navigates somewhere before its tier is reached,
// that real navigation just pays the normal first-visit cost this was trying to avoid -- nothing
// about the app's actual behavior depends on this module running at all.
(() => {
  const isIpad = () => document.documentElement.classList.contains('is-ipad');

  // Each entry is a function returning an array of URLs for the CURRENT device -- evaluated lazily
  // (not at load time) since is-ipad is already set synchronously before this script runs, but
  // keeping it a function costs nothing and avoids ever caching a stale device guess.
  const TIERS = [
    // Tier 1: the heaviest screens, and the ones the 1-2s hitch was most noticeable on.
    [
      () => [isIpad() ? 'assets/store-items/items-background-ipad.png' : 'assets/store-items/items-background-computer.png'],
      () => ['assets/memory-match/backgrounds/castle-select-layered.png', 'assets/memory-match/backgrounds/castle-board-reference.png'],
      () => ['assets/spot-the-difference/castle-background.png'],
    ],
    // Tier 2: hub/category screens -- smaller, single background each.
    [
      () => ['assets/games-carousel/games-meadow.png'],
      () => ['assets/reading-carousel/meadow.png'],
      () => ['assets/chores/background.png'],
      () => [isIpad() ? 'assets/store-intro/store-intro-ipad.png' : 'assets/store-intro/store-intro-computer.png'],
    ],
  ];

  function preloadImage(url) {
    return new Promise((resolve) => {
      const img = new Image();
      if ('fetchPriority' in img) img.fetchPriority = 'low'; // hint only -- ignored where unsupported
      img.onload = resolve;
      img.onerror = resolve; // never let one bad/missing URL stall the queue behind it
      img.src = url;
    });
  }

  // Small concurrency cap, not "all at once" -- an old iPad on home WiFi doing a dozen-plus
  // simultaneous large-image fetches would itself jank whatever the kid is doing on Home, which
  // defeats the point. Runs each tier's groups through this limited pool before moving to the
  // next tier.
  async function runPool(groups, concurrency) {
    const queue = groups.flatMap((group) => group());
    let i = 0;
    async function worker() {
      while (i < queue.length) {
        const url = queue[i++];
        await preloadImage(url);
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  }

  async function run() {
    // The pig's own asset set (biggest single chunk, ~17MB) starts in parallel with tier 1's
    // images rather than ahead of or behind them -- it's fetched via its own module (pig-
    // clerk.js's `imgs`/`assetsPromise`), not raw <img> tags, so it can't share this file's pool.
    if (window.PigClerk) window.PigClerk.preload();
    for (const tier of TIERS) await runPool(tier, 3);
  }

  // Idle callback if available (won't fire until the browser judges Home is done with its own
  // work), falling back to a flat delay elsewhere (Safari/iPadOS has no requestIdleCallback as of
  // this writing). Either way, deliberately not "as soon as this script loads" -- Home's own
  // first paint should never have to share bandwidth/CPU with this.
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
})();
