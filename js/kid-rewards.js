// The kid Chores and Store screens, the savings-goal bar on the home screen, and the parent
// area's "Waiting for approval" and "To deliver" lists.
const KidRewards = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => AppBridge.escapeHtml(String(s == null ? '' : s));
  const coins = (n) => AppBridge.coinWords(n);

  function me() { return getActiveProfile(); }

  // ================= Chores =================
  function choresLeftToday(profile) {
    if (!profile) return 0;
    return todaysChoresFor(profile).filter((c) => !choreEntryToday(profile.id, c.id)).length;
  }

  function openChores() {
    renderChores();
    AppBridge.showScreen('chores-screen');
  }

  const choresVoiceSlot = $('chores-voice-slot');
  choresVoiceSlot.appendChild(Voice.button('My chores. Tap Done when you finish one.'));
  $('chores-back-btn').addEventListener('click', () => AppBridge.enterHome());
  // New Home pill baked into the redesign's artwork -- same existing nav function, just a
  // second trigger for it (same pattern as the Games/Reading screen redesigns).
  $('kz-chores-home').addEventListener('click', () => AppBridge.enterHome());

  // Keeps the curved name text centered on the sign's arc regardless of name length (short or
  // long) or which curve/slope is currently active (computer vs iPad -- see applyChoresLayout).
  // text-anchor="middle" + startOffset="50%" (the SVG-native way to center text on a path) looks
  // right for ONE specific textLength, but combined with an explicitly forced textLength (needed
  // so short/long names don't look stretched/squished), browsers inconsistently anchor off the
  // text's natural width instead of the forced one -- the visible center (and the curve's peak,
  // the "tip of the slope") drifted depending on name length. Computing startOffset numerically
  // here instead -- half the arc's total length minus half the text's forced length -- centers
  // the text block exactly regardless of either one, with text-anchor left at its default
  // ("start") in index.html so nothing re-adjusts on top of this. Called both when the name
  // renders AND whenever the arc's `d` (its curve/slope) changes, since the arc's total length
  // changes with it.
  function centerChoresSignText() {
    const arc = $('kz-chores-sign-arc');
    const nameEl = $('kz-chores-sign-name');
    if (!arc || !nameEl) return;
    const textLen = Number(nameEl.getAttribute('textLength'));
    if (!textLen) return;
    nameEl.setAttribute('startOffset', (arc.getTotalLength() - textLen) / 2);
  }

  // Child's name in curved text on the wooden sign, plus the coin-balance pill -- textLength
  // keeps the curve looking proportional for both short and long names.
  function renderChoresBanner(profile) {
    const chores = todaysChoresFor(profile);
    const approved = chores.filter((c) => {
      const entry = choreEntryToday(profile.id, c.id);
      return entry && entry.status === 'approved';
    }).length;
    $('kz-chores-count').textContent = `${approved} of ${chores.length} Chores Finished!`;
    $('kz-chores-fill').style.width = (chores.length ? (100 * approved / chores.length) : 0) + '%';
    // Real photo (set in Grown-ups > Photo Editor > Child Photos) replaces the colored
    // initial-letter avatar entirely when one's set -- never shown together.
    $('kz-chores-avatar').innerHTML = profile.photoUrl
      ? `<img src="${esc(profile.photoUrl)}" alt="${esc(profile.name)}" />`
      : `<span class="profile-avatar" style="--avatar-color:${profile.avatarColor}">${esc(profile.name.charAt(0).toUpperCase())}</span>`;
    $('kz-chores-coins').textContent = `🪙 ${spendableCoins(profile.id)} Coins`;
    const nameEl = $('kz-chores-sign-name');
    nameEl.textContent = `${profile.name}’s Chores`;
    nameEl.setAttribute('textLength', Math.min(680, Math.max(490, (profile.name.length + 9) * 39)));
    centerChoresSignText();
  }

  function renderChores() {
    const profile = me();
    if (!profile) return;
    document.getElementById('chores-screen').classList.add('kz-chores-redesign');
    renderChoresBanner(profile);
    const list = $('chore-list');
    list.innerHTML = '';
    const chores = todaysChoresFor(profile);
    $('chore-empty').classList.toggle('hidden', chores.length > 0);
    chores.forEach((chore) => {
      const entry = choreEntryToday(profile.id, chore.id);
      const card = document.createElement('div');
      card.className = 'chore-card' + (entry ? ` ${entry.status}` : '');
      card.innerHTML = `${pictureHtml(chore.picture, 'pic-xl')}
        <div class="chore-card-text">
          <span class="chore-card-name">${esc(chore.name)}</span>
          <span class="chore-card-coins">${chore.coins} Coins</span>
        </div>`;
      card.appendChild(Voice.button(`${chore.name}. ${coins(chore.coins)}.`, 'corner'));

      const action = document.createElement('div');
      action.className = 'chore-card-action';
      if (!entry) {
        const done = document.createElement('button');
        done.type = 'button';
        done.className = 'done-btn';
        done.textContent = 'Done!';
        done.addEventListener('click', () => {
          markChoreDone(profile.id, chore);
          Voice.speak('Great job! Mom or Dad will check it.');
          renderChores();
        });
        action.appendChild(done);
      } else if (entry.status === 'waiting') {
        action.innerHTML = '<span class="chore-state waiting">⏳ Waiting for Mom or Dad</span>';
      } else {
        action.innerHTML = `<span class="chore-state approved">✅ ${entry.paid ? `+${entry.paid}` : 'Done'}</span>`;
      }
      card.appendChild(action);
      list.appendChild(card);
    });
  }

  // ---- Chores Layout Tool: a throwaway tuning aid, not a shipped feature. Adjust sliders
  // while looking at the real screen, then "Copy CSS" and hand the numbers back -- whoever's
  // doing the Cursor/Claude work pastes them into chores-redesign.css as the new fallback
  // values and this tool (and its temporary localStorage-only state) can be deleted. One
  // shared set of controls for the chore pills -- all six read the same CSS variables, so
  // moving/resizing them always happens "at the same time" by construction, not by looping
  // over each card. Extend-up/-down are independent: one grows the pill row from the top edge,
  // the other from the bottom edge, without disturbing the opposite edge.
  const CHORES_LAYOUT_LOCAL_KEY = 'family-app.chores-layout-DRAFT';
  // The draft is stored split by device (computer/ipad), same as the defaults below -- a single
  // shared draft meant tuning something on an emulated iPad silently overwrote the computer's
  // saved values (and vice versa) the next time either loaded, since there was nothing to tell
  // the two apart once saved. On two genuinely separate physical devices this never showed up
  // (separate browser storage already keeps them apart), but testing both "devices" via one
  // browser's emulation toggle hit it on every switch.
  function loadChoresDraft() {
    const all = getData(CHORES_LAYOUT_LOCAL_KEY, null) || {};
    return all[isTouch() ? 'ipad' : 'computer'] || {};
  }
  function saveChoresDraft(s) {
    const all = getData(CHORES_LAYOUT_LOCAL_KEY, null) || {};
    all[isTouch() ? 'ipad' : 'computer'] = s;
    setData(CHORES_LAYOUT_LOCAL_KEY, all);
  }
  // A specific device's current values regardless of which one is active right now (hardcoded
  // defaults merged with that device's own saved draft) -- same merge currentChoresDefaults() +
  // loadChoresDraft() do for whichever device isTouch() says is active, just explicitly callable
  // for the OTHER one too, for "Copy values from the other device" below.
  function choresBaselineFor(device) {
    const all = getData(CHORES_LAYOUT_LOCAL_KEY, null) || {};
    return { ...CHORES_LAYOUT_DEFAULTS[device], ...(all[device] || {}) };
  }
  // Reads the exact same html.is-ipad class every CSS rule below is now gated on (set once,
  // synchronously, by the inline script at the top of index.html's <head>) -- not
  // matchMedia('(pointer: coarse)'), which a touchscreen Windows laptop reports true for even
  // docked with a mouse attached. Keeping JS and CSS reading the identical signal is what
  // guarantees they never disagree about which device is active.
  function isTouch() { return document.documentElement.classList.contains('is-ipad'); }
  // Lets a grown-up tune the iPad half of this tool from a computer (or vice versa) -- without
  // this, isTouch() only ever reflects whichever device is physically open right now, so the
  // OTHER device's values/CSS could only ever be edited by someone literally holding that
  // device. Forces the real html.is-ipad class itself (not a separate tool-only flag), which is
  // what every is-ipad-gated CSS rule app-wide reads -- so the preview behind this panel is
  // pixel-accurate to the other device (background art included), not just a numbers simulation.
  // Captured once at load, before any toggling, so Done can restore the device's own real state.
  const CHORES_REAL_IS_IPAD = isTouch();
  function setChoresPreviewDevice(wantIpad) {
    document.documentElement.classList.toggle('is-ipad', wantIpad);
    choresLayoutState = { ...currentChoresDefaults(), ...loadChoresDraft() };
    applyChoresLayout(choresLayoutState);
    refreshChoresDeviceLabels();
  }
  function refreshChoresDeviceLabels() {
    const deviceBtn = $('chores-layout-device-btn');
    if (deviceBtn) deviceBtn.textContent = isTouch() ? '📱 Editing: iPad' : '💻 Editing: Computer';
    const copyBtn = $('chores-layout-copy-device-btn');
    if (copyBtn) copyBtn.textContent = `📋 Copy values from ${isTouch() ? 'Computer' : 'iPad'}`;
  }
  // Position nudges (X/Y) are in %, not px -- CSS translate() percentages are relative to the
  // element's OWN box size (not the viewport), so a % nudge lands in the same relative spot on
  // any device/window width. Size (headerW/bannerW/avatarW) is now a real % of a stable box
  // (the screen for header/banner, the banner for avatar) with height locked via aspect-ratio in
  // CSS -- not a scale() multiplier against the old cover-cropped-image-relative layout -- so
  // Computer and iPad start fully IDENTICAL on purpose (there's no longer a structural reason
  // they'd need to differ; only diverge a specific field via the device toggle if something
  // actually looks off on a real iPad). headerTextCurve is the #kz-chores-sign-arc path's curve,
  // not a CSS var (see applyChoresLayout below), but still gets its own per-device value for the
  // same reason as everything else -- it's just not structurally glued the way size/position are.
  const CHORES_LAYOUT_DEFAULTS = {
    computer: {
      // Tuned via the Chores Layout Tool, against the real background.
      headerX: 0, headerY: 0, headerW: 31,
      headerTextX: 1, headerTextY: -5, headerTextCurve: 82, headerTextSize: 128,
      bannerX: 0, bannerY: -26.5, bannerW: 60.5,
      avatarX: -3, avatarY: -3.5, avatarW: 16,
      todayX: 0, todayY: -11, todaySize: 71,
      countX: 0.5, countY: -20.5, countSize: 89,
      pillsX: 0, pillsY: 0, pillsScale: 101, pillsExtendUp: 0, pillsExtendDown: 0,
      chorePicX: 1, chorePicWidthScale: 128, chorePicHeightScale: 100,
    },
    ipad: {
      // Tuned via the Chores Layout Tool's device toggle, against the real 4:3 iPad background.
      headerX: 0, headerY: 0, headerW: 40,
      headerTextX: 0, headerTextY: -5, headerTextCurve: 82, headerTextSize: 128,
      bannerX: 0, bannerY: -19, bannerW: 71.5,
      avatarX: -3, avatarY: -4, avatarW: 16,
      todayX: 0, todayY: -11, todaySize: 83,
      countX: 0.5, countY: -19.5, countSize: 105,
      pillsX: 0, pillsY: 0, pillsScale: 101, pillsExtendUp: 0, pillsExtendDown: 0,
      chorePicX: 1, chorePicWidthScale: 128, chorePicHeightScale: 100,
    },
  };
  function currentChoresDefaults() {
    return { ...(isTouch() ? CHORES_LAYOUT_DEFAULTS.ipad : CHORES_LAYOUT_DEFAULTS.computer) };
  }
  const CHORES_LAYOUT_SPEC = [
    ['headerX', 'cl-header-x', '%'], ['headerY', 'cl-header-y', '%'], ['headerW', 'cl-header-w', '%'],
    ['headerTextX', 'cl-header-text-x', '%'], ['headerTextY', 'cl-header-text-y', '%'],
    ['headerTextCurve', 'cl-header-text-curve', ''], ['headerTextSize', 'cl-header-text-size', '%'],
    ['bannerX', 'cl-banner-x', '%'], ['bannerY', 'cl-banner-y', '%'], ['bannerW', 'cl-banner-w', '%'],
    ['avatarX', 'cl-avatar-x', '%'], ['avatarY', 'cl-avatar-y', '%'], ['avatarW', 'cl-avatar-w', '%'],
    ['todayX', 'cl-today-x', '%'], ['todayY', 'cl-today-y', '%'], ['todaySize', 'cl-today-size', '%'],
    ['countX', 'cl-count-x', '%'], ['countY', 'cl-count-y', '%'], ['countSize', 'cl-count-size', '%'],
    ['pillsX', 'cl-pills-x', '%'], ['pillsY', 'cl-pills-y', '%'], ['pillsScale', 'cl-pills-scale', '%'],
    ['pillsExtendUp', 'cl-pills-extend-up', '%'], ['pillsExtendDown', 'cl-pills-extend-down', '%'],
    ['chorePicX', 'cl-chore-pic-x', '%'],
    ['chorePicWidthScale', 'cl-chore-pic-width', '%'], ['chorePicHeightScale', 'cl-chore-pic-height', '%'],
  ];
  // Maps a CHORES_LAYOUT_SPEC key (e.g. "headerX") to its CSS var base name (e.g. "header-x").
  function kzcBase(key) {
    return key.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
  // -ipad-suffixed variable name on a real iPad, read only inside chores-redesign.css's
  // html.is-ipad-gated rules -- plain name otherwise. Same reasoning as home-overlay.js.
  function kzcVar(key) {
    return `--kzc-${kzcBase(key)}${isTouch() ? '-ipad' : ''}`;
  }

  function applyChoresLayout(layout) {
    const L = { ...currentChoresDefaults(), ...(layout || {}) };
    const root = document.documentElement.style;
    root.setProperty(kzcVar('headerX'), L.headerX + '%');
    root.setProperty(kzcVar('headerY'), L.headerY + '%');
    root.setProperty(kzcVar('headerW'), L.headerW + '%');
    root.setProperty(kzcVar('headerTextX'), L.headerTextX + '%');
    root.setProperty(kzcVar('headerTextY'), L.headerTextY + '%');
    root.setProperty(kzcVar('headerTextSize'), L.headerTextSize / 100);
    // The arc's curve ("slope") is the #kz-chores-sign-arc path's `d` attribute, not a CSS var --
    // SVG path geometry can't be driven by custom properties, so it's set directly here instead,
    // using the current device's own curve value (L.headerTextCurve already picked the right one).
    const arc = document.getElementById('kz-chores-sign-arc');
    if (arc) arc.setAttribute('d', `M 150 270 Q 500 ${270 - L.headerTextCurve} 850 270`);
    centerChoresSignText(); // arc length just changed with the curve above -- keep the name centered on it
    root.setProperty(kzcVar('bannerX'), L.bannerX + '%');
    root.setProperty(kzcVar('bannerY'), L.bannerY + '%');
    root.setProperty(kzcVar('bannerW'), L.bannerW + '%');
    root.setProperty(kzcVar('avatarX'), L.avatarX + '%');
    root.setProperty(kzcVar('avatarY'), L.avatarY + '%');
    root.setProperty(kzcVar('avatarW'), L.avatarW + '%');
    root.setProperty(kzcVar('todayX'), L.todayX + '%');
    root.setProperty(kzcVar('todayY'), L.todayY + '%');
    root.setProperty(kzcVar('todaySize'), L.todaySize / 100);
    root.setProperty(kzcVar('countX'), L.countX + '%');
    root.setProperty(kzcVar('countY'), L.countY + '%');
    root.setProperty(kzcVar('countSize'), L.countSize / 100);
    root.setProperty(kzcVar('pillsX'), L.pillsX + '%');
    root.setProperty(kzcVar('pillsY'), L.pillsY + '%');
    root.setProperty(kzcVar('pillsScale'), L.pillsScale / 100);
    root.setProperty(kzcVar('pillsExtendUp'), L.pillsExtendUp + '%');
    root.setProperty(kzcVar('pillsExtendDown'), L.pillsExtendDown + '%');
    root.setProperty(kzcVar('chorePicX'), L.chorePicX + '%');
    root.setProperty(kzcVar('chorePicWidthScale'), L.chorePicWidthScale / 100);
    root.setProperty(kzcVar('chorePicHeightScale'), L.chorePicHeightScale / 100);
    CHORES_LAYOUT_SPEC.forEach(([key, id, unit]) => {
      const input = $(id);
      if (input) input.value = L[key];
      const out = $(id + '-val');
      if (out) out.textContent = L[key] + unit;
    });
    return L;
  }

  let choresLayoutState = { ...currentChoresDefaults(), ...loadChoresDraft() };
  applyChoresLayout(choresLayoutState);

  CHORES_LAYOUT_SPEC.forEach(([key, id]) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('input', () => {
      choresLayoutState = { ...choresLayoutState, [key]: Number(input.value) };
      applyChoresLayout(choresLayoutState);
      saveChoresDraft(choresLayoutState); // draft only, so re-opening keeps your in-progress numbers
    });
  });

  $('chores-layout-open-btn').addEventListener('click', () => {
    applyChoresLayout(choresLayoutState);
    refreshChoresDeviceLabels();
    openChores();
    $('chores-layout-panel').classList.remove('hidden');
  });
  $('chores-layout-device-btn').addEventListener('click', () => setChoresPreviewDevice(!isTouch()));
  // One-time copy, not a live link: seeds the CURRENT device's values from a snapshot of the
  // other device's current values -- a fast starting point (most fields are usually close between
  // devices already), not an ongoing tether. Edit/Save/Reset afterward all behave exactly as
  // before; nothing about this button changes how the two devices are stored or applied.
  $('chores-layout-copy-device-btn').addEventListener('click', () => {
    choresLayoutState = choresBaselineFor(isTouch() ? 'computer' : 'ipad');
    applyChoresLayout(choresLayoutState);
    saveChoresDraft(choresLayoutState);
  });
  $('chores-layout-done-btn').addEventListener('click', () => {
    $('chores-layout-panel').classList.add('hidden');
    setChoresPreviewDevice(CHORES_REAL_IS_IPAD); // back to whichever device this really is
    AppBridge.enterParentArea();
  });
  $('chores-layout-reset-btn').addEventListener('click', () => {
    choresLayoutState = currentChoresDefaults();
    applyChoresLayout(choresLayoutState);
    saveChoresDraft(choresLayoutState);
  });
  $('chores-layout-copy-btn').addEventListener('click', async () => {
    const L = choresLayoutState;
    const text = `:root {\n` +
      `  /* ${isTouch() ? 'iPad' : 'Computer'} values */\n` +
      `  ${kzcVar('headerX')}: ${L.headerX}%; ${kzcVar('headerY')}: ${L.headerY}%; ${kzcVar('headerW')}: ${L.headerW}%;\n` +
      `  ${kzcVar('headerTextX')}: ${L.headerTextX}%; ${kzcVar('headerTextY')}: ${L.headerTextY}%; ${kzcVar('headerTextSize')}: ${L.headerTextSize / 100};\n` +
      `  /* also update index.html's <path id="kz-chores-sign-arc"> d attribute to: */\n` +
      `  /* d="M 150 270 Q 500 ${270 - L.headerTextCurve} 850 270" */\n` +
      `  ${kzcVar('bannerX')}: ${L.bannerX}%; ${kzcVar('bannerY')}: ${L.bannerY}%; ${kzcVar('bannerW')}: ${L.bannerW}%;\n` +
      `  ${kzcVar('avatarX')}: ${L.avatarX}%; ${kzcVar('avatarY')}: ${L.avatarY}%; ${kzcVar('avatarW')}: ${L.avatarW}%;\n` +
      `  ${kzcVar('todayX')}: ${L.todayX}%; ${kzcVar('todayY')}: ${L.todayY}%; ${kzcVar('todaySize')}: ${L.todaySize / 100};\n` +
      `  ${kzcVar('countX')}: ${L.countX}%; ${kzcVar('countY')}: ${L.countY}%; ${kzcVar('countSize')}: ${L.countSize / 100};\n` +
      `  ${kzcVar('pillsX')}: ${L.pillsX}%; ${kzcVar('pillsY')}: ${L.pillsY}%; ${kzcVar('pillsScale')}: ${L.pillsScale / 100};\n` +
      `  ${kzcVar('pillsExtendUp')}: ${L.pillsExtendUp}%; ${kzcVar('pillsExtendDown')}: ${L.pillsExtendDown}%;\n` +
      `  ${kzcVar('chorePicX')}: ${L.chorePicX}%; ${kzcVar('chorePicWidthScale')}: ${L.chorePicWidthScale / 100}; ${kzcVar('chorePicHeightScale')}: ${L.chorePicHeightScale / 100};\n` +
      `}` +
      (isTouch() ? `\n/* paste the lines above as a plain :root { ... } block anywhere in\n   chores-redesign.css -- no @media/class wrapper needed, these are just values; the\n   html.is-ipad-gated rules already in that file decide when each one actually gets used */` : '');
    const btn = $('chores-layout-copy-btn');
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
    } catch {
      prompt('Copy these CSS values and send them over:', text);
    }
    setTimeout(() => { btn.textContent = '📋 Copy CSS'; }, 1800);
  });

  // ================= Store =================
  let buying = null;
  // Which category pill was tapped to get here -- renderStore() filters by this. Set once per
  // openStoreItems() call and left alone across the re-renders triggered by a purchase confirm/
  // cancel below, so the list doesn't silently jump back to "every item" mid-flow.
  let currentStoreCategory = null;

  // The item grid itself -- not called directly from Home anymore (see openStore below).
  function openStoreItems(category) {
    currentStoreCategory = category || null;
    // Shown BEFORE rendering -- renderStore()'s RewardPill.fitDescription() needs real layout to
    // measure each name against (clientHeight/scrollHeight are both 0 on a display:none screen),
    // so it has to run while #store-screen is already visible, not before.
    AppBridge.showScreen('store-screen');
    renderStore();
    if (window.PigClerk) window.PigClerk.enter();
  }

  const PILL_COLORS = ['blue', 'cyan', 'gold', 'green', 'pink', 'orange', 'purple', 'red'];

  // One icon per fixed category (js/setup.js's CATEGORY_OPTIONS) -- assets/store-intro/
  // category-icons/*.png. Keys must match those option strings exactly.
  const CATEGORY_ICONS = {
    'Toys': 'assets/store-intro/category-icons/toys.png',
    'Games': 'assets/store-intro/category-icons/games.png',
    'Books': 'assets/store-intro/category-icons/books.png',
    'Adventures': 'assets/store-intro/category-icons/adventures.png',
    'Music': 'assets/store-intro/category-icons/music.png',
    'Art and Crafts': 'assets/store-intro/category-icons/art-and-crafts.png',
    'Sports': 'assets/store-intro/category-icons/sports.png',
    'Sweets': 'assets/store-intro/category-icons/sweets.png',
    'Special Rewards': 'assets/store-intro/category-icons/special-rewards.png',
    'Clothes': 'assets/store-intro/category-icons/clothes.png',
    'Science': 'assets/store-intro/category-icons/science.png',
  };

  // Per-CATEGORY label styling (not per-pill) -- the text that overflows is "Art and Crafts"/
  // "Special Rewards" themselves, independent of which colored pill they end up assigned to, so
  // this travels with the category name, not a pill color. fontSize is the clamp() max/preferred
  // baseline (same shape as store-intro.css's default); a category not listed here just uses
  // DEFAULT_LABEL_FONT_SIZE on one line. `lines`, when present, renders centered on N lines
  // instead of the single left-aligned line -- exact wording per line, not an automatic wrap (so
  // "Arts &" is deliberate, not a mid-word CSS break of "Art and Crafts").
  const DEFAULT_LABEL_FONT_SIZE = 28;
  const CATEGORY_LABEL_STYLE = {
    'Toys': { fontSize: 40.0 },
    'Games': { fontSize: 40.0 },
    'Books': { fontSize: 40.0 },
    'Adventures': { fontSize: 27.0 },
    'Music': { fontSize: 40.0 },
    'Art and Crafts': { fontSize: 40.0, lines: ['Arts &', 'Crafts'] },
    'Sports': { fontSize: 40.0 },
    'Sweets': { fontSize: 40.0 },
    'Special Rewards': { fontSize: 40.0, lines: ['Special', 'Rewards'] },
    'Clothes': { fontSize: 40.0 },
    'Science': { fontSize: 40.0 },
  };
  // Mirrors store-intro.css's own clamp() shape (min = half of fontSize, same vw ratio) so a
  // per-category override still scales with viewport width the same way the CSS default does.
  function labelFontSizeCss(size) { return `clamp(${(size * 0.5).toFixed(1)}px, ${(size * 0.0729).toFixed(3)}vw, ${size.toFixed(1)}px)`; }

  // Paints each pill's admin-assigned category (Setup > Reward Shop tab) into its
  // .store-pill-icon/.store-pill-label spans. A pill with no category assigned yet just stays
  // blank, same as before either zone had anything to show.
  function renderStorePillCategories() {
    const categories = getSettings().storePillCategories || {};
    PILL_COLORS.forEach((color) => {
      const pill = document.querySelector(`#store-intro-screen .store-pill-${color}`);
      if (!pill) return;
      const category = categories[color] || '';
      const icon = pill.querySelector('.store-pill-icon');
      const label = pill.querySelector('.store-pill-label');
      if (icon) icon.style.backgroundImage = CATEGORY_ICONS[category] ? `url('${CATEGORY_ICONS[category]}')` : '';
      if (label) {
        const style = CATEGORY_LABEL_STYLE[category];
        label.style.fontSize = labelFontSizeCss(style ? style.fontSize : DEFAULT_LABEL_FONT_SIZE);
        label.replaceChildren();
        if (style && style.lines) {
          label.style.whiteSpace = 'normal';
          label.style.textAlign = 'center';
          style.lines.forEach((line, i) => {
            if (i > 0) label.appendChild(document.createElement('br'));
            label.appendChild(document.createTextNode(line));
          });
        } else {
          label.style.whiteSpace = '';
          label.style.textAlign = '';
          label.appendChild(document.createTextNode(category));
        }
      }
    });
  }

  // Public entry point from Home (the "Rewards Store" section button and the savings-goal
  // pill both call this) -- opens the category screen first instead of jumping straight to the
  // item grid.
  function openStore() {
    AppBridge.showScreen('store-intro-screen');
    renderStorePillCategories();
    // reward-shop.js's <reward-shop-sign> measures its own letter widths via
    // getComputedTextLength() when it connects, which returns 0 (garbling the layout) if the
    // element exists while #store-intro-screen is still display:none. Creating it fresh here,
    // after the screen is already showing, guarantees it connects while visible.
    const inner = document.querySelector('#store-intro-screen .store-intro-inner');
    if (inner && !inner.querySelector('reward-shop-sign')) {
      const sign = document.createElement('reward-shop-sign');
      sign.className = 'store-intro-sign';
      inner.appendChild(sign);
    }
  }

  // The 8 category pills on #store-intro-screen -- each opens the item grid filtered to whatever
  // category Setup > Reward Shop currently has assigned to that pill's color (null/unassigned
  // pills open an unfiltered grid, same as every item having no category of its own). Looked up
  // fresh on each click, not captured once at page load, since a grown-up can reassign a pill's
  // category in Setup without this screen ever reloading.
  document.querySelectorAll('#store-intro-screen .store-pill').forEach((btn) => {
    const color = PILL_COLORS.find((c) => btn.classList.contains(`store-pill-${c}`));
    btn.addEventListener('click', () => openStoreItems((getSettings().storePillCategories || {})[color] || null));
  });

  // Items screen's back arrow returns to the category screen (not Home) -- it's the screen the
  // kid actually came from (openStoreItems() is only ever reached via a category pill tap).
  $('store-back-btn').addEventListener('click', () => {
    if (window.PigClerk) window.PigClerk.exit();
    openStore();
  });
  $('store-intro-home-btn').addEventListener('click', () => AppBridge.enterHome());

  function renderStore() {
    const profile = me();
    if (!profile) return;
    const spendable = spendableCoins(profile.id);
    const reserved = reservedCoins(profile.id);
    const chip = $('store-coins');
    chip.innerHTML = `<span class="coin-icon">🪙</span>${spendable}`;
    chip.appendChild(Voice.button(reserved
      ? `You can spend ${coins(spendable)}. ${coins(reserved)} are saved for things Mom or Dad will bring.`
      : `You can spend ${coins(spendable)}.`));

    // Things he asked for that a parent hasn't handed over yet.
    const waiting = waitingRequests(profile.id);
    const waitBox = $('store-waiting');
    waitBox.classList.toggle('hidden', !waiting.length);
    waitBox.innerHTML = waiting.length ? '<span class="store-waiting-title">⏳ Mom or Dad will bring:</span>' : '';
    waiting.forEach((r) => {
      const chipEl = document.createElement('span');
      chipEl.className = 'store-waiting-item';
      chipEl.innerHTML = `${pictureHtml(r.picture, 'pic-sm')}<span>${esc(r.name)}</span>`;
      waitBox.appendChild(chipEl);
    });

    const grid = $('store-grid');
    grid.innerHTML = '';
    // An item with no category of its own shows up under every pill (never silently disappears
    // just because this feature shipped); otherwise it only shows under the pill it matches.
    const items = getSettings().store.filter((i) => !i.category || i.category === currentStoreCategory);
    $('store-empty').classList.toggle('hidden', items.length > 0);
    items.forEach((item) => {
      const pill = RewardPill.render(item, spendable, (selected) => openBuy(selected));
      pill.appendChild(Voice.button(`${item.name}. ${coins(item.price)}.`, 'corner'));
      grid.appendChild(pill);
      RewardPill.fitDescription(pill); // needs real layout, so only after it's in the live DOM
    });
  }

  function openBuy(item) {
    buying = item;
    $('buy-pic').innerHTML = pictureHtml(item.picture, 'pic-xxl');
    $('buy-name').textContent = item.name;
    $('buy-price').textContent = `🪙 ${item.price}`;
    $('buy-overlay').classList.remove('hidden');
    Voice.speak(`Do you want to buy ${item.name} for ${coins(item.price)}?`);
  }

  $('buy-no-btn').addEventListener('click', () => {
    buying = null;
    $('buy-overlay').classList.add('hidden');
  });

  $('buy-yes-btn').addEventListener('click', () => {
    const profile = me();
    const item = buying;
    $('buy-overlay').classList.add('hidden');
    buying = null;
    if (!profile || !item) return;
    const req = requestPurchase(profile.id, item);
    if (!req) {
      Voice.speak("Hmm, you can't buy that right now.");
      renderStore();
      return;
    }
    // The home-screen "Saving for..." pill that showed/cleared this was removed (no in-game way
    // to set a goal exists since the Reward Shop redesign dropped the wishlist button it needed --
    // a future wishlist feature will replace both), but profile.savingsGoal itself is kept and
    // still cleared here so stale data doesn't linger for whatever reuses that field later.
    const goal = getSavingsGoal(profile);
    if (goal && goal.itemId === item.id) setSavingsGoal(profile.id, null);
    Voice.speak(`Yay! Mom or Dad will bring you ${item.name} soon.`);
    AppBridge.showToast(`🎉 Mom or Dad will bring: ${item.name}`, 2600);
    renderStore();
  });

  // ================= Parent lists =================
  function dayWord(day) {
    if (day === localDayKey(new Date())) return 'Today';
    if (day === localDayKey(new Date(Date.now() - 864e5))) return 'Yesterday';
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function queueRow(profile, picture, title, meta, buttons) {
    const row = document.createElement('div');
    row.className = 'queue-row';
    row.innerHTML = `${pictureHtml(picture, 'pic-md')}
      <span class="queue-row-text">
        <span class="queue-row-title">${esc(title)}</span>
        <span class="queue-row-meta"><span class="profile-avatar tiny" style="--avatar-color:${profile.avatarColor}">${esc(profile.name.charAt(0).toUpperCase())}</span>${esc(profile.name)} · ${esc(meta)}</span>
      </span>`;
    const actions = document.createElement('span');
    actions.className = 'queue-row-actions';
    buttons.forEach(([label, cls, fn]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `queue-btn ${cls}`;
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    });
    row.appendChild(actions);
    return row;
  }

  function renderParentQueues() {
    const profiles = loadProfiles();
    const approvals = $('parent-approvals');
    const deliveries = $('parent-deliveries');
    approvals.innerHTML = '';
    deliveries.innerHTML = '';
    let nA = 0;
    let nD = 0;

    profiles.forEach((p) => {
      waitingChores(p.id).forEach((e) => {
        nA++;
        approvals.appendChild(queueRow(p, e.picture, e.name, `🪙 ${e.coins} · ${dayWord(e.day)}`, [
          ['Not yet', 'no', () => { notYetChore(p.id, e.id); refreshParent(); }],
          ['Approve', 'yes', () => approve(p, e)],
        ]));
      });
      waitingRequests(p.id).forEach((r) => {
        nD++;
        deliveries.appendChild(queueRow(p, r.picture, r.name, `🪙 ${r.price}`, [
          ['Decline', 'no', () => {
            if (!confirm(`Decline ${r.name} for ${p.name}? The ${r.price} coins go back to him.`)) return;
            markRequestDeclined(p.id, r.id);
            refreshParent();
          }],
          ['Paid', 'yes', () => {
            markRequestPaid(p.id, r.id);
            AppBridge.showToast(`✅ ${r.price} coins taken from ${p.name}`, 2200);
            refreshParent();
          }],
        ]));
      });
    });

    if (!nA) approvals.innerHTML = '<p class="parent-card-note">Nothing waiting. 👍</p>';
    if (!nD) deliveries.innerHTML = '<p class="parent-card-note">Nothing to hand over.</p>';
    setBadge('approvals-count', nA);
    setBadge('deliveries-count', nD);
  }

  function setBadge(id, n) {
    const el = $(id);
    el.textContent = n;
    el.classList.toggle('hidden', !n);
  }

  function approve(profile, entry) {
    const allowed = choreCoinsAllowedNow(profile.id, entry.coins);
    let payFull = false;
    if (allowed < entry.coins) {
      payFull = confirm(`${profile.name} has reached today's chore coin limit.\n\nOK = pay the full ${entry.coins} coins anyway\nCancel = pay ${allowed} (what's left under the limit)`);
    }
    const paid = approveChore(profile.id, entry.id, payFull);
    AppBridge.showToast(paid ? `✅ ${profile.name} earned ${coins(paid)}` : `✅ Approved (no coins left today)`, 2200);
    refreshParent();
  }

  function refreshParent() {
    renderParentQueues();
    AppBridge.renderParentKidList();
  }

  return { openChores, openStore, renderParentQueues, choresLeftToday };
})();
