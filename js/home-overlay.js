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
  // Computer and iPad each have their own default x/y/w per button now (two different
  // background images -- see home-overlay.css -- put the row/banner in different spots).
  // ipad: mirrors the CSS's own --kzb-<id>-*-ipad fallbacks, kept in sync by hand whenever
  // those are re-baked.
  const BUTTONS = [
    { id: 'games', label: 'Games', computer: { x: 3.6, y: 45.6, w: 16 }, ipad: { x: 3.6, y: 50.6, w: 16.5 } },
    { id: 'coloring', label: 'Coloring', computer: { x: 18.7071, y: 45.6, w: 16 }, ipad: { x: 18.7071, y: 50.6, w: 16.5 } },
    { id: 'reading', label: 'Reading', computer: { x: 33.8143, y: 45.6, w: 16 }, ipad: { x: 33.8143, y: 50.6, w: 16.5 } },
    { id: 'math', label: 'Math', computer: { x: 48.9214, y: 45.6, w: 16 }, ipad: { x: 48.9214, y: 50.6, w: 16.5 } },
    { id: 'puzzles', label: 'Puzzles', computer: { x: 64.5286, y: 45.6, w: 16 }, ipad: { x: 64.5286, y: 50.6, w: 16.5 } },
    { id: 'music', label: 'Music', computer: { x: 80.1357, y: 45.6, w: 16 }, ipad: { x: 80.1357, y: 50.6, w: 16.5 } },
    { id: 'chores', label: 'My Chores', computer: { x: 14.6, y: 71.8, w: 34.7 }, ipad: { x: 12.1, y: 72.8, w: 38 } },
    { id: 'store', label: 'Rewards Store', computer: { x: 50.2, y: 72.1, w: 35.4 }, ipad: { x: 49.7, y: 73, w: 38.2 } },
    { id: 'settings', label: 'Grown-ups gear', computer: { x: 92, y: 2, w: 6.8 }, ipad: { x: 92, y: 2, w: 6.8 } },
  ];
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
    const clamped = Math.min(max, Math.max(min, value));
    // Rounded to 4dp -- repeatedly adding a 0.1 step with plain float math drifts into
    // junk like 72.79999999999997% (still fine visually, just ugly in a Copy CSS output).
    return Math.round(clamped * 10000) / 10000;
  }
  function clampButtonState(s) {
    return { x: clampField('x', s.x), y: clampField('y', s.y), w: clampField('w', s.w) };
  }

  // The Home background is a completely different image on touch devices (icons/
  // home-background-ipad.png vs icons/home-background.png -- see home-overlay.css), with its
  // own button-row position and its own wooden banner position. So every button gets its own
  // -ipad-suffixed set of CSS vars, read only inside home-overlay.css's html.is-ipad-gated rules,
  // instead of sharing one value with the computer.
  //
  // Reads the exact same html.is-ipad class every one of those CSS rules is gated on (set once,
  // synchronously, by the inline script at the top of index.html's <head>) -- not
  // matchMedia('(pointer: coarse)'), which a touchscreen Windows laptop reports true for even
  // docked with a mouse attached (that was the original bug this used to guard against with a
  // live re-check instead of a cached one: toggling DevTools' device emulation mid-session used
  // to desync a frozen JS boolean from CSS's live-reevaluating media query -- reading the same
  // class JS and CSS both already agree on sidesteps that class of bug entirely, since there's
  // only one signal to go stale instead of two that could disagree).
  function isTouch() { return document.documentElement.classList.contains('is-ipad'); }
  // Lets a grown-up tune the iPad half of this tool from a computer (or vice versa) -- without
  // this, isTouch() only ever reflects whichever device is physically open right now, so the
  // OTHER device's values/CSS could only ever be edited by someone literally holding that
  // device. Forces the real html.is-ipad class itself (not a separate tool-only flag), which is
  // what every is-ipad-gated CSS rule app-wide reads -- so the preview behind this panel (or
  // revealed by the "Preview" button below) is pixel-accurate to the other device, background
  // art included, not just a numbers simulation. Captured once at load, before any toggling, so
  // Done can restore the device's own real state.
  const HOME_REAL_IS_IPAD = isTouch();
  function cssVarName(id, field) {
    return `--kzb-${id}-${field}${isTouch() ? '-ipad' : ''}`;
  }
  // Picks each button's computer or ipad defaults based on the CURRENT device -- called fresh
  // (not cached) for the same reason as isTouch() above, and critically, used everywhere a
  // "no draft yet" baseline is needed. Using a single shared default object here was the actual
  // bug behind "my iPad changes aren't showing up": applyLayout() runs unconditionally on every
  // page load, so with no per-device defaults, it was always pushing the computer's numbers
  // into the iPad's CSS variables (even on a device with zero saved draft), overwriting the
  // carefully-baked iPad fallback in home-overlay.css every single time -- not a caching issue
  // at all, so reloading/reopening/signing out could never have fixed it.
  function currentDefaults() {
    const d = {};
    BUTTONS.forEach((b) => { d[b.id] = { ...(isTouch() ? b.ipad : b.computer) }; });
    return d;
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
  // The draft is stored split by device (computer/ipad), same as the defaults -- a single
  // shared draft meant tuning something on an emulated iPad silently overwrote the computer's
  // saved values (and vice versa) the next time either loaded, since there was nothing to tell
  // the two apart once saved. On two genuinely separate physical devices this never showed up
  // (separate browser storage already keeps them apart), but testing both "devices" via one
  // browser's emulation toggle hit it on every switch.
  function loadDraft() {
    const all = getData(DRAFT_KEY, null) || {};
    return all[isTouch() ? 'ipad' : 'computer'] || {};
  }
  function saveDraft(s) {
    const all = getData(DRAFT_KEY, null) || {};
    all[isTouch() ? 'ipad' : 'computer'] = s;
    setData(DRAFT_KEY, all);
  }
  let state = { ...currentDefaults(), ...loadDraft() };
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
  // one tap always means the same thing everywhere. Up/down on My Chores/Rewards Store gets
  // its own, smaller step (Y_STEP) -- those two are fine-tuning against a drawn banner, where
  // the regular step was too coarse to land precisely.
  const STEP = 0.5;
  const Y_STEP = 0.1;

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
    saveDraft(state);
  }

  // Left/right (and the icon-row group's left/right/up/down/size) are step buttons -- a fixed
  // nudge every tap -- instead of a slider: easier to nudge precisely than dragging a thumb,
  // and for the group specifically, a slider would need its own absolute "current value" that
  // can only describe one number even when the six buttons it affects have since drifted apart
  // (exactly the bug above). Up/down and Size stay sliders for the individual per-button rows,
  // where that problem doesn't apply -- except My Chores/Rewards Store's Up/down, which are
  // also step buttons (Y_STEP_IDS below): those two need fine, precise nudges while lining up
  // with the wooden banner, and a slider makes that guesswork instead of a known-size tap.
  const FIELDS = [['x', 'Left / right', 'step'], ['y', 'Up / down', 'slider', 0, 100], ['w', 'Size', 'slider', 3, 70]];
  const Y_STEP_IDS = ['chores', 'store'];
  function fieldsFor(id) {
    return FIELDS.map(([field, fieldLabel, kind, min, max]) =>
      field === 'y' && Y_STEP_IDS.includes(id) ? [field, fieldLabel, 'step'] : [field, fieldLabel, kind, min, max]
    );
  }
  const GROUP_FIELDS = [
    ['x', 'Left / right', '◀ Left', 'Right ▶'],
    ['y', 'Up / down', '▲ Up', '▼ Down'],
    ['w', 'Size', '− Smaller', '+ Bigger'],
  ];
  const STEP_LABELS = { x: ['◀ Left', 'Right ▶'], y: ['▲ Up', '▼ Down'], w: ['− Smaller', '+ Bigger'] };

  function fieldHtml(scope, field, fieldLabel, kind, min, max, value) {
    const idBase = `hb-${scope}-${field}`;
    if (kind === 'step') {
      const [decLabel, incLabel] = STEP_LABELS[field];
      return `<label>${fieldLabel} <output id="${idBase}-val"></output></label>` +
        `<div class="chores-layout-actions">` +
        `<button type="button" class="big-btn" id="${idBase}-dec">${decLabel}</button>` +
        `<button type="button" class="big-btn" id="${idBase}-inc">${incLabel}</button>` +
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
    `<div class="chores-layout-head"><strong id="home-layout-title">Home Buttons Layout Tool (${isTouch() ? 'iPad' : 'Computer'})</strong>` +
    `<button type="button" id="home-layout-device-btn" class="big-btn"></button>` +
    `<button type="button" id="home-layout-done-btn" class="big-btn primary-btn">✅ Done</button></div>` +
    `<p class="parent-card-note">Tap the device button above to tune the OTHER device's values/` +
    `preview from here -- without it, the iPad half can only ever be edited by someone physically on an iPad.</p>` +
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
      const section = `<div class="chores-layout-section" data-device-label="${id}">${label} -- ${isTouch() ? 'iPad-only' : 'computer-only'} values</div>`;
      const rows = fieldsFor(id).map(([field, fieldLabel, kind, min, max]) =>
        fieldHtml(id, field, fieldLabel, kind, min, max, state[id][field])
      ).join('');
      return section + rows;
    }).join('') +
    `<div class="chores-layout-actions">` +
    `<button type="button" id="home-layout-reset-btn" class="big-btn">Reset to Default</button>` +
    `<button type="button" id="home-layout-copy-btn" class="big-btn primary-btn">📋 Copy CSS</button>` +
    `</div>`;
  document.body.appendChild(panel);

  // Updates the title badge + every per-button "-- iPad-only/computer-only values" section
  // header to match the device setChoresPreviewDevice-style toggle below just switched to --
  // these are baked into the HTML as plain text at build time (above), so they don't update on
  // their own the way the actual field values (syncControls) already do.
  function refreshHomeDeviceLabels() {
    const title = document.getElementById('home-layout-title');
    if (title) title.textContent = `Home Buttons Layout Tool (${isTouch() ? 'iPad' : 'Computer'})`;
    BUTTONS.forEach(({ id, label }) => {
      const el = panel.querySelector(`[data-device-label="${id}"]`);
      if (el) el.textContent = `${label} -- ${isTouch() ? 'iPad-only' : 'computer-only'} values`;
    });
    const btn = document.getElementById('home-layout-device-btn');
    if (btn) btn.textContent = isTouch() ? '📱 Editing: iPad' : '💻 Editing: Computer';
  }
  function setHomePreviewDevice(wantIpad) {
    document.documentElement.classList.toggle('is-ipad', wantIpad);
    state = { ...currentDefaults(), ...loadDraft() };
    BUTTONS.forEach(({ id }) => { state[id] = clampButtonState(state[id]); });
    applyLayout();
    syncControls();
    refreshHomeDeviceLabels();
  }

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
      fieldsFor(id).forEach(([field, , kind]) => {
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
  refreshHomeDeviceLabels();

  GROUP_FIELDS.forEach(([field]) => {
    document.getElementById(`hb-group-${field}-dec`).addEventListener('click', () => nudgeIconRow(field, -STEP));
    document.getElementById(`hb-group-${field}-inc`).addEventListener('click', () => nudgeIconRow(field, STEP));
  });

  BUTTONS.forEach(({ id }) => {
    fieldsFor(id).forEach(([field, , kind]) => {
      const idBase = `hb-${id}-${field}`;
      const commit = () => {
        applyLayout();
        syncControls();
        saveDraft(state); // draft only, so re-opening keeps your in-progress numbers
      };
      if (kind === 'step') {
        const step = field === 'y' ? Y_STEP : STEP;
        document.getElementById(`${idBase}-dec`).addEventListener('click', () => {
          state = { ...state, [id]: { ...state[id], [field]: clampField(field, state[id][field] - step) } };
          commit();
        });
        document.getElementById(`${idBase}-inc`).addEventListener('click', () => {
          state = { ...state, [id]: { ...state[id], [field]: clampField(field, state[id][field] + step) } };
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
  document.getElementById('home-layout-device-btn').addEventListener('click', () => setHomePreviewDevice(!isTouch()));
  document.getElementById('home-layout-done-btn').addEventListener('click', () => {
    panel.classList.add('hidden');
    previewBackBtn.classList.add('hidden');
    setHomePreviewDevice(HOME_REAL_IS_IPAD); // back to whichever device this really is
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
    state = currentDefaults();
    applyLayout();
    syncControls();
    saveDraft(state);
  });
  document.getElementById('home-layout-copy-btn').addEventListener('click', async () => {
    const text = `:root {\n` +
      `  /* ${isTouch() ? 'iPad' : 'Computer'} values */\n` +
      BUTTONS.map(({ id }) =>
        `  ${cssVarName(id, 'x')}: ${state[id].x}%; ${cssVarName(id, 'y')}: ${state[id].y}%; ${cssVarName(id, 'w')}: ${state[id].w}%;`
      ).join('\n') +
      `\n}` +
      (isTouch() ? `\n/* paste the chores/store lines above as a plain :root { ... } block anywhere\n   in home-overlay.css -- no @media/class wrapper needed, these are just values; the\n   html.is-ipad-gated rules already in that file decide when each one actually gets used */` : '');
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
