/* Sets accessible labels on every Kid Zone home-screen button, and owns the Button Layout
   Tool (Grown-ups > Home Screen Buttons): a live tuning panel for all nine home buttons
   (Games/Coloring/Reading/Math/Puzzles/Music + My Chores/Rewards Store + the Grown-ups gear),
   each a standalone sprite positioned in home-overlay.css via CSS custom properties
   (--kzb-<id>-x/-y/-w).

   Every value here is a % -- of the full screen for position (left/top), of the full screen
   width for size -- not a pixel-rect tied to one shared background image's grid. That's what
   makes "bigger/smaller" and "left/right/up/down" work identically whether this is viewed on
   an iPad or a computer: a button's % position/size scales with whatever screen it's on, and
   its aspect-ratio (set per-button in CSS, not here) keeps it from ever distorting since only
   width is adjustable -- height always follows automatically.

   Same "adjust while looking at the real screen, then Copy and bake the numbers in for good"
   pattern as the Chores Layout Tool (js/kid-rewards.js). */
(() => {
  const BUTTONS = [
    { id: 'games', label: 'Games', x: 3.6, y: 45.6, w: 16 },
    { id: 'coloring', label: 'Coloring', x: 18.7071, y: 45.6, w: 16 },
    { id: 'reading', label: 'Reading', x: 33.8143, y: 45.6, w: 16 },
    { id: 'math', label: 'Math', x: 48.9214, y: 45.6, w: 16 },
    { id: 'puzzles', label: 'Puzzles', x: 64.5286, y: 45.6, w: 16 },
    { id: 'music', label: 'Music', x: 80.1357, y: 45.6, w: 16 },
    { id: 'chores', label: 'My Chores', x: 14.6, y: 72.2, w: 34.2 },
    { id: 'store', label: 'Rewards Store', x: 50.2, y: 72.4, w: 35.4 },
    { id: 'settings', label: 'Grown-ups gear', x: 92, y: 2, w: 6.8 },
  ];
  const DEFAULTS = {};
  BUTTONS.forEach((b) => { DEFAULTS[b.id] = { x: b.x, y: b.y, w: b.w }; });
  const ICON_IDS = ['games', 'coloring', 'reading', 'math', 'puzzles', 'music'];

  // Left/right had no bounds at all -- repeatedly tapping it could push a button to an extreme
  // value (e.g. -300%). On an iPad, that's triggered a real WebKit bug where aspect-ratio +
  // an extreme percentage offset on an absolutely-positioned element gets miscomputed and the
  // box (and sometimes the whole page's layout, which is why the tool itself went unresponsive
  // too) snaps toward the top-left. clampField keeps every value in a sane range so that can't
  // happen -- applied on every nudge AND when loading a saved draft, so a draft already pushed
  // out of range before this fix self-heals the next time the tool opens.
  const BOUNDS = { x: [-15, 105], y: [0, 100], w: [3, 70] };
  function clampField(field, value) {
    const [min, max] = BOUNDS[field];
    return Math.min(max, Math.max(min, value));
  }
  function clampButtonState(s) {
    return { x: clampField('x', s.x), y: clampField('y', s.y), w: clampField('w', s.w) };
  }

  // My Chores / Rewards Store sit inside the wooden banner drawn in the background, and
  // background-size:cover (home-overlay.css) crops that banner differently depending on the
  // screen's aspect ratio -- a computer window (close to the background's own shape) crops
  // very little, an iPad's squarer screen crops noticeably more off the sides, shifting where
  // the banner ends up. So those two get a SEPARATE set of CSS vars for touch devices
  // (--kzb-chores-x-ipad etc., read only inside home-overlay.css's `@media (pointer: coarse)`
  // block) instead of sharing one value with the computer. pointer:coarse means touch (the
  // iPad), pointer:fine means the mouse-driven computer this is likely being tuned from.
  const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches;
  const DEVICE_SPLIT_IDS = ['chores', 'store'];
  function cssVarName(id, field) {
    const suffix = IS_TOUCH && DEVICE_SPLIT_IDS.includes(id) ? '-ipad' : '';
    return `--kzb-${id}-${field}${suffix}`;
  }

  const home = document.getElementById('home-screen');
  const grid = document.getElementById('section-grid');
  if (!home || !grid) return;
  home.classList.add('kz-art-home');

  // Accessible label for every button -- independent of position, always applied.
  function applyLabels() {
    for (const btn of grid.querySelectorAll('button[data-section]')) {
      const id = btn.dataset.section;
      const match = BUTTONS.find((b) => b.id === id);
      const label = match ? match.label : id;
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  }
  // renderSectionGrid() (js/app.js) clears and rebuilds these buttons every time the kid
  // enters the home screen, so re-apply labels whenever that happens.
  new MutationObserver(applyLabels).observe(grid, { childList: true });
  applyLabels();

  // ---- Button Layout Tool: a throwaway tuning aid, not a shipped feature (same convention
  // as js/kid-rewards.js's Chores Layout Tool) -- draft-only in localStorage, under its own
  // key (not reused from the old pixel-rect tool, whose draft shape is incompatible). ----
  const DRAFT_KEY = 'family-app.home-buttons-DRAFT';
  let state = { ...DEFAULTS, ...(getData(DRAFT_KEY, null) || {}) };
  BUTTONS.forEach(({ id }) => { state[id] = clampButtonState(state[id]); });

  const root = document.documentElement.style;
  function applyLayout() {
    BUTTONS.forEach(({ id }) => {
      root.setProperty(cssVarName(id, 'x'), state[id].x + '%');
      root.setProperty(cssVarName(id, 'y'), state[id].y + '%');
      root.setProperty(cssVarName(id, 'w'), state[id].w + '%');
    });
  }
  applyLayout();

  // Shared "nudge amount" for every step button -- individual AND the icon-row group -- so
  // one tap always means the same thing everywhere.
  const STEP = 0.5;

  // Nudges every icon-row button's `field` by the same delta, relative to wherever each one
  // currently is -- NOT recomputed from some separately-tracked "group" baseline. An earlier
  // version kept the group's own x/y/size numbers and recalculated all six from scratch on
  // every group tap, which silently threw away any individual nudges made in between (the
  // group's stale baseline "won"). Reading each button's live current value here instead means
  // using the group controls can never reset anything -- it only ever moves whatever's there.
  function nudgeIconRow(field, delta) {
    ICON_IDS.forEach((id) => {
      state[id] = { ...state[id], [field]: clampField(field, state[id][field] + delta) };
    });
    applyLayout();
    syncControls();
    setData(DRAFT_KEY, state);
  }

  // Left/right (and the icon-row group's left/right/up/down/size) are step buttons -- a fixed
  // nudge every tap -- instead of a slider: easier to nudge precisely than dragging a thumb,
  // and for the group specifically, a slider would need its own absolute "current value" that
  // can only describe one number even when the six buttons it affects have since drifted apart
  // (exactly the bug above). Up/down and Size stay sliders for the individual per-button rows,
  // where that problem doesn't apply.
  const FIELDS = [['x', 'Left / right', 'step'], ['y', 'Up / down', 'slider', 0, 100], ['w', 'Size', 'slider', 3, 70]];
  const GROUP_FIELDS = [
    ['x', 'Left / right', '◀ Left', 'Right ▶'],
    ['y', 'Up / down', '▲ Up', '▼ Down'],
    ['w', 'Size', '− Smaller', '+ Bigger'],
  ];

  function fieldHtml(scope, field, fieldLabel, kind, min, max, value) {
    const idBase = `hb-${scope}-${field}`;
    if (kind === 'step') {
      return `<label>${fieldLabel} <output id="${idBase}-val"></output></label>` +
        `<div class="chores-layout-actions">` +
        `<button type="button" class="big-btn" id="${idBase}-dec">◀ Left</button>` +
        `<button type="button" class="big-btn" id="${idBase}-inc">Right ▶</button>` +
        `</div>`;
    }
    return `<label for="${idBase}">${fieldLabel} <output id="${idBase}-val"></output></label>` +
      `<input type="range" id="${idBase}" min="${min}" max="${max}" step="0.1" value="${value}">`;
  }

  const panel = document.createElement('aside');
  panel.id = 'home-layout-panel';
  panel.className = 'kz-layout-tool-panel hidden';
  panel.setAttribute('aria-label', 'Home button layout tool');
  panel.innerHTML =
    `<div class="chores-layout-head"><strong>Home Buttons Layout Tool (${IS_TOUCH ? 'iPad' : 'Computer'})</strong>` +
    `<button type="button" id="home-layout-done-btn" class="big-btn primary-btn">✅ Done</button></div>` +
    `<button type="button" id="home-layout-preview-btn" class="big-btn" style="margin-top:10px;width:100%">👀 Preview (hide this panel)</button>` +
    `<div class="chores-layout-section">Icon row -- Games through Music, all six together (nudges each one by the same amount from wherever it already is)</div>` +
    GROUP_FIELDS.map(([field, fieldLabel, decLabel, incLabel]) =>
      `<label>${fieldLabel}</label>` +
      `<div class="chores-layout-actions">` +
      `<button type="button" class="big-btn" id="hb-group-${field}-dec">${decLabel}</button>` +
      `<button type="button" class="big-btn" id="hb-group-${field}-inc">${incLabel}</button>` +
      `</div>`
    ).join('') +
    BUTTONS.map(({ id, label }) => {
      const note = DEVICE_SPLIT_IDS.includes(id) ? ` -- ${IS_TOUCH ? 'iPad-only' : 'computer-only'} values` : '';
      const section = `<div class="chores-layout-section">${label}${note}</div>`;
      const rows = FIELDS.map(([field, fieldLabel, kind, min, max]) =>
        fieldHtml(id, field, fieldLabel, kind, min, max, state[id][field])
      ).join('');
      return section + rows;
    }).join('') +
    `<div class="chores-layout-actions">` +
    `<button type="button" id="home-layout-reset-btn" class="big-btn">Reset to Default</button>` +
    `<button type="button" id="home-layout-copy-btn" class="big-btn primary-btn">📋 Copy CSS</button>` +
    `</div>`;
  document.body.appendChild(panel);

  // Small floating pill shown while the panel is hidden for a preview -- the only way back,
  // since the panel itself is gone. Not part of .kz-layout-tool-panel (that's the full-size
  // shell); this is deliberately tiny and out of the way so it doesn't block the preview.
  const previewBackBtn = document.createElement('button');
  previewBackBtn.type = 'button';
  previewBackBtn.id = 'home-layout-preview-back-btn';
  previewBackBtn.className = 'big-btn primary-btn hidden';
  previewBackBtn.textContent = '⬅ Back to Adjusting';
  Object.assign(previewBackBtn.style, {
    position: 'fixed', left: '50%', bottom: '16px', transform: 'translateX(-50%)',
    zIndex: '61', width: 'auto', padding: '10px 22px',
  });
  document.body.appendChild(previewBackBtn);

  function syncControls() {
    BUTTONS.forEach(({ id }) => {
      FIELDS.forEach(([field, , kind]) => {
        const idBase = `hb-${id}-${field}`;
        const value = state[id][field];
        if (kind === 'slider') {
          const input = document.getElementById(idBase);
          if (input) input.value = value;
        }
        const out = document.getElementById(`${idBase}-val`);
        if (out) out.textContent = Math.round(value * 10) / 10 + '%';
      });
    });
  }
  syncControls();

  GROUP_FIELDS.forEach(([field]) => {
    document.getElementById(`hb-group-${field}-dec`).addEventListener('click', () => nudgeIconRow(field, -STEP));
    document.getElementById(`hb-group-${field}-inc`).addEventListener('click', () => nudgeIconRow(field, STEP));
  });

  BUTTONS.forEach(({ id }) => {
    FIELDS.forEach(([field, , kind]) => {
      const idBase = `hb-${id}-${field}`;
      const commit = () => {
        applyLayout();
        syncControls();
        setData(DRAFT_KEY, state); // draft only, so re-opening keeps your in-progress numbers
      };
      if (kind === 'step') {
        document.getElementById(`${idBase}-dec`).addEventListener('click', () => {
          state = { ...state, [id]: { ...state[id], [field]: clampField(field, state[id][field] - STEP) } };
          commit();
        });
        document.getElementById(`${idBase}-inc`).addEventListener('click', () => {
          state = { ...state, [id]: { ...state[id], [field]: clampField(field, state[id][field] + STEP) } };
          commit();
        });
      } else {
        document.getElementById(idBase).addEventListener('input', (e) => {
          state = { ...state, [id]: { ...state[id], [field]: clampField(field, Number(e.target.value)) } };
          commit();
        });
      }
    });
  });

  document.getElementById('home-layout-open-btn').addEventListener('click', () => {
    window.AppBridge.enterHome();
    panel.classList.remove('hidden');
  });
  document.getElementById('home-layout-done-btn').addEventListener('click', () => {
    panel.classList.add('hidden');
    previewBackBtn.classList.add('hidden');
    window.AppBridge.enterParentArea();
  });
  document.getElementById('home-layout-preview-btn').addEventListener('click', () => {
    panel.classList.add('hidden');
    previewBackBtn.classList.remove('hidden');
  });
  previewBackBtn.addEventListener('click', () => {
    previewBackBtn.classList.add('hidden');
    panel.classList.remove('hidden');
  });
  document.getElementById('home-layout-reset-btn').addEventListener('click', () => {
    state = JSON.parse(JSON.stringify(DEFAULTS));
    applyLayout();
    syncControls();
    setData(DRAFT_KEY, state);
  });
  document.getElementById('home-layout-copy-btn').addEventListener('click', async () => {
    const text = `:root {\n` +
      `  /* ${IS_TOUCH ? 'iPad' : 'Computer'} values */\n` +
      BUTTONS.map(({ id }) =>
        `  ${cssVarName(id, 'x')}: ${state[id].x}%; ${cssVarName(id, 'y')}: ${state[id].y}%; ${cssVarName(id, 'w')}: ${state[id].w}%;`
      ).join('\n') +
      `\n}` +
      (IS_TOUCH ? `\n/* paste the chores/store lines above inside home-overlay.css's existing\n   @media (pointer: coarse) { ... } block, not at the top level */` : '');
    const btn = document.getElementById('home-layout-copy-btn');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
    } catch {
      prompt('Copy these CSS values and send them over:', text);
    }
    setTimeout(() => { btn.textContent = '📋 Copy CSS'; }, 1800);
  });
})();
