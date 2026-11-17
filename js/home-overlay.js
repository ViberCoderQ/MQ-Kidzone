/* Bind the existing Kid Zone home-screen buttons to the exact hit areas measured off
   icons/home-background.png (1448 x 1086). Does NOT add a new navigation system: app.js
   still owns every click handler, config.js still owns the SECTIONS list -- this only
   moves the existing #section-grid buttons to sit on top of the matching artwork.

   Also owns the Home Layout Tool (Grown-ups > Home Screen Buttons): a live tuning panel,
   same "adjust while looking at the real screen, then Copy and bake the numbers in for
   good" pattern as the Chores Layout Tool (js/kid-rewards.js), just working in this file's
   own pixel-rect coordinate space instead of CSS custom properties. */
(() => {
  const W = 1448, H = 1086;
  // Starting rects for the current artwork ("Kid_Zone_Home_iPad_1448x1086") -- eyeballed
  // from the image, not pixel-measured, so expect to nudge them with the tool below.
  // [x, y, w, h] in artwork pixels, top-left origin.
  const DEFAULT_RECTS = {
    games: [36, 505, 210, 239], coloring: [264, 505, 210, 239],
    reading: [491, 505, 210, 239], math: [718, 505, 210, 239],
    puzzles: [946, 505, 210, 239], music: [1173, 505, 210, 239],
    chores: [116, 820, 564, 130], store: [767, 820, 565, 130],
  };
  const labels = {
    games: 'Games', coloring: 'Coloring', reading: 'Reading', math: 'Math',
    puzzles: 'Puzzles', music: 'Music', chores: 'My Chores', store: 'Rewards Store',
  };

  const home = document.getElementById('home-screen');
  const grid = document.getElementById('section-grid');
  if (!home || !grid) return;
  home.classList.add('kz-art-home');

  // ---- Draft overrides (Home Layout Tool), same "localStorage-only, not shipped" pattern
  // as js/kid-rewards.js's CHORES_LAYOUT_LOCAL_KEY. ----
  const HOME_LAYOUT_LOCAL_KEY = 'family-app.home-layout-DRAFT';
  let rects = { ...DEFAULT_RECTS, ...(getData(HOME_LAYOUT_LOCAL_KEY, null) || {}) };

  const apply = () => {
    for (const btn of grid.querySelectorAll('button[data-section]')) {
      const id = btn.dataset.section;
      const r = rects[id];
      if (!r) continue;
      const [x, y, w, h] = r;
      Object.assign(btn.style, {
        left: (x / W * 100) + '%', top: (y / H * 100) + '%',
        width: (w / W * 100) + '%', height: (h / H * 100) + '%',
      });
      const label = labels[id] || id;
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  };

  // renderSectionGrid() (js/app.js) clears and rebuilds these buttons every time the kid
  // enters the home screen, so re-apply positions whenever that happens.
  new MutationObserver(apply).observe(grid, { childList: true });
  apply();

  // ---- Home Layout Tool ----
  const IDS = Object.keys(DEFAULT_RECTS);
  const FIELD_LABELS = ['Left', 'Up/down', 'Width', 'Height'];

  const panel = document.createElement('aside');
  panel.id = 'home-layout-panel';
  panel.className = 'kz-layout-tool-panel hidden';
  panel.setAttribute('aria-label', 'Home layout tool');
  panel.innerHTML =
    `<div class="chores-layout-head"><strong>Home Layout Tool</strong>` +
    `<button type="button" id="home-layout-done-btn" class="big-btn primary-btn">✅ Done</button></div>` +
    IDS.map((id) => {
      const section = `<div class="chores-layout-section">${labels[id]}</div>`;
      const rows = FIELD_LABELS.map((fieldLabel, i) => {
        const max = i % 2 === 0 ? W : H; // Left/Width slide across W; Up-down/Height across H
        return `<label for="hl-${id}-${i}">${fieldLabel} <output id="hl-${id}-${i}-val"></output></label>` +
          `<input type="range" id="hl-${id}-${i}" min="0" max="${max}" step="1" value="${DEFAULT_RECTS[id][i]}">`;
      }).join('');
      return section + rows;
    }).join('') +
    `<div class="chores-layout-actions">` +
    `<button type="button" id="home-layout-reset-btn" class="big-btn">Reset to Default</button>` +
    `<button type="button" id="home-layout-copy-btn" class="big-btn primary-btn">📋 Copy Rects</button>` +
    `</div>`;
  document.body.appendChild(panel);

  function syncSliders() {
    IDS.forEach((id) => {
      rects[id].forEach((v, i) => {
        const input = document.getElementById(`hl-${id}-${i}`);
        if (input) input.value = v;
        const out = document.getElementById(`hl-${id}-${i}-val`);
        if (out) out.textContent = v + 'px';
      });
    });
  }
  syncSliders();

  IDS.forEach((id) => {
    [0, 1, 2, 3].forEach((i) => {
      const input = document.getElementById(`hl-${id}-${i}`);
      input.addEventListener('input', () => {
        rects = { ...rects, [id]: rects[id].map((v, j) => (j === i ? Number(input.value) : v)) };
        apply();
        syncSliders();
        setData(HOME_LAYOUT_LOCAL_KEY, rects); // draft only, so re-opening keeps your in-progress numbers
      });
    });
  });

  document.getElementById('home-layout-open-btn').addEventListener('click', () => {
    window.AppBridge.enterHome();
    panel.classList.remove('hidden');
  });
  document.getElementById('home-layout-done-btn').addEventListener('click', () => {
    panel.classList.add('hidden');
    window.AppBridge.enterParentArea();
  });
  document.getElementById('home-layout-reset-btn').addEventListener('click', () => {
    rects = JSON.parse(JSON.stringify(DEFAULT_RECTS));
    apply();
    syncSliders();
    setData(HOME_LAYOUT_LOCAL_KEY, rects);
  });
  document.getElementById('home-layout-copy-btn').addEventListener('click', async () => {
    const text = `const DEFAULT_RECTS = {\n` +
      IDS.map((id) => `    ${id}: [${rects[id].join(', ')}],`).join('\n') +
      `\n  };`;
    const btn = document.getElementById('home-layout-copy-btn');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
    } catch {
      prompt('Copy these rects and send them over:', text);
    }
    setTimeout(() => { btn.textContent = '📋 Copy Rects'; }, 1800);
  });
})();
