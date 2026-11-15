// Spot the Difference: a self-contained castle-themed puzzle (ported from the Cursor handoff),
// living inside the #spot-diff-screen section. All its own DOM ids are prefixed "sd-" so they
// can't collide with the rest of this single-page app, and its CSS is scoped under #spot-diff-root
// in spot-the-difference.css. Level data comes from js/spot-the-difference-levels.js.
//
// Single-player only: reached directly from the Games tile (js/games.js special-cases this game
// to skip the VS-a-kid/Computer picker entirely, since there's no opponent here).
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let leaveCallback = null;
  let levels = [];
  let index = 0;
  let found = new Set();
  let hintId = null;
  let hintTimer = null;
  let winTimer = null;

  const level = () => levels[index];

  // A difference's tap/mark region is an ellipse (rx, ry) -- most are still plain circles (rx===ry)
  // since that's all the original 120 ported differences have, but the align tool can stretch one
  // axis independently to better fit a tall/wide visual change. radiusX/radiusY are filled in from
  // the older single "radius" field here so the rest of the code never has to fall back itself.
  function normalizeDifferences(l) {
    l.differences.forEach((d) => {
      if (d.radiusX == null) d.radiusX = d.radius;
      if (d.radiusY == null) d.radiusY = d.radius;
    });
    return l;
  }

  // The original handoff hard-crashed the whole game if any level's data was malformed (exactly
  // five required differences, no two tap regions close enough to be ambiguous). That's too
  // fragile -- a single bad level (like the one already dropped from the catalog) would take the
  // entire game down. Validate once at startup and just skip anything that fails, instead of
  // throwing. Levels can have any number of differences (at least 2) -- the counter/dots/status
  // text all read the count off the level itself rather than assuming five.
  function validLevel(l) {
    if (!l || !Array.isArray(l.differences) || l.differences.length < 2) return false;
    normalizeDifferences(l);
    const n = l.differences.length;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const p = l.differences[a], q = l.differences[b];
        const dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < Math.max(p.radiusX, p.radiusY) + Math.max(q.radiusX, q.radiusY) + 12) return false;
      }
    }
    return true;
  }

  function status(s) { $('sd-status').textContent = s; }

  function loadLevel(i) {
    clearTimeout(winTimer);
    clearTimeout(hintTimer);
    index = i;
    found = new Set();
    hintId = null;
    setHidden('sd-overlay', true);
    const l = level();
    $('sd-boardLeft').querySelector('img').src = l.original;
    $('sd-boardRight').querySelector('img').src = l.modified;
    $('sd-levelName').textContent = `${index + 1} / ${levels.length} · ${l.title}`;
    $('sd-nextBtn').disabled = index === levels.length - 1;
    $('sd-prevBtn').disabled = index === 0;
    status(`Tap either picture to find ${l.differences.length} differences!`);
    render();
  }

  function setHidden(id, hidden) { $(id).classList.toggle('hidden', hidden); }

  function mark(board, d, hint) {
    const el = document.createElement('div');
    el.className = 'sd-ring' + (hint ? ' hint' : '');
    el.style.left = (d.x / level().imageWidth * 100) + '%';
    el.style.top = (d.y / level().imageHeight * 100) + '%';
    // Width scales off the board's own rendered width and height scales off its rendered height,
    // so a stretched (radiusX !== radiusY) difference still reads as stretched on screen, not
    // squashed back into a circle by the board's aspect ratio.
    const w = Math.max(14, d.radiusX * 2 / level().imageWidth * board.clientWidth);
    const h = Math.max(14, d.radiusY * 2 / level().imageHeight * board.clientHeight);
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    board.querySelector('.sd-marks').appendChild(el);
  }

  function render() {
    const l = level();
    [$('sd-boardLeft'), $('sd-boardRight')].forEach((b) => {
      b.querySelector('.sd-marks').replaceChildren();
      l.differences.forEach((d) => {
        if (found.has(d.id)) mark(b, d);
        else if (hintId === d.id) mark(b, d, true);
      });
    });
    $('sd-counter').textContent = `${found.size} / ${l.differences.length}`;
    $('sd-dots').replaceChildren(...l.differences.map((d) => {
      const dot = document.createElement('div');
      dot.className = 'sd-dot' + (found.has(d.id) ? ' found' : '');
      return dot;
    }));
    $('sd-hintBtn').disabled = found.size === l.differences.length;
  }

  function clickBoard(e) {
    const l = level();
    if (found.size === l.differences.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * l.imageWidth;
    const y = (e.clientY - rect.top) / rect.height * l.imageHeight;
    const sx = rect.width / l.imageWidth, sy = rect.height / l.imageHeight;
    // Normalized elliptical distance: 0 at the center, 1.0 exactly on the ellipse's edge. A plain
    // circle is just the special case rx===ry. "Closest" is whichever difference the tap is
    // proportionally nearest to, not necessarily nearest in raw pixels (a thin stretched ellipse
    // can have its edge closer in pixels than a small circle's center).
    const matches = l.differences
      .filter((d) => !found.has(d.id))
      .map((d) => {
        const dx = d.x - x, dy = d.y - y;
        return { d, pixelDist: Math.hypot(dx * sx, dy * sy), normDist: Math.hypot(dx / d.radiusX, dy / d.radiusY) };
      })
      .sort((a, b) => a.normDist - b.normDist);
    const closest = matches[0];
    // Accept inside the ellipse plus a little slack (1.35x), or always within a small absolute
    // pixel radius regardless of shape -- same generous "don't make tiny targets impossible to tap"
    // floor the original circular version had with Math.max(22, ...).
    if (closest && (closest.normDist <= 1.35 || closest.pixelDist <= 22)) {
      found.add(closest.d.id);
      hintId = null;
      // A short rotating set of encouragement lines rather than one message per find -- a level
      // can have any number of differences, not always exactly five, so this can't be a fixed-size
      // array indexed by how many have been found so far.
      const PRAISE = ['Great find!', 'You spotted another!', 'Awesome detective work!', 'Nice eye!', 'Keep going!'];
      status(found.size === l.differences.length
        ? `All ${l.differences.length} found!`
        : PRAISE[(found.size - 1) % PRAISE.length]);
      render();
      if (found.size === l.differences.length) {
        winTimer = setTimeout(() => {
          setHidden('sd-overlay', false);
          $('sd-winNextBtn').textContent = index === levels.length - 1 ? 'Play again' : 'Next puzzle';
        }, 550);
      }
    } else {
      status('Not quite! Look carefully and try another spot.');
    }
  }

  function hint() {
    const d = level().differences.find((d) => !found.has(d.id));
    if (!d) return;
    hintId = d.id;
    status(`Hint: Look near the ${d.label.toLowerCase()}.`);
    render();
    hintTimer = setTimeout(() => { if (hintId === d.id) { hintId = null; render(); } }, 2200);
  }

  function open(onLeave) {
    leaveCallback = onLeave;
    levels = (typeof SPOT_DIFF_LEVELS !== 'undefined' ? SPOT_DIFF_LEVELS : []).filter(validLevel);
    if (!levels.length) {
      status('No puzzles are available right now.');
      return;
    }
    loadLevel(0);
  }

  function leaveToMenu() {
    clearTimeout(winTimer);
    clearTimeout(hintTimer);
    if (leaveCallback) leaveCallback();
  }

  $('sd-backBtn').addEventListener('click', leaveToMenu);
  $('sd-boardLeft').addEventListener('pointerup', clickBoard);
  $('sd-boardRight').addEventListener('pointerup', clickBoard);
  $('sd-hintBtn').addEventListener('click', hint);
  $('sd-restartBtn').addEventListener('click', () => loadLevel(index));
  $('sd-prevBtn').addEventListener('click', () => loadLevel(index - 1));
  $('sd-nextBtn').addEventListener('click', () => loadLevel(index + 1));
  $('sd-againBtn').addEventListener('click', () => loadLevel(index));
  $('sd-winNextBtn').addEventListener('click', () => loadLevel(index === levels.length - 1 ? 0 : index + 1));
  window.addEventListener('resize', () => { if (levels.length) render(); });

  window.SpotTheDifference = { open };
})();
