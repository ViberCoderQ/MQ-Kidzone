(() => {
  // 4x3 grid: Red Orange Yellow Green / Blue Indigo Purple Pink / Brown Black Gray White.
  // Pink and Brown share Red's and Orange's hue on purpose (pink IS a light red, brown IS a dark
  // orange) -- SHADE_RANGES below is what keeps their shade ramps from actually overlapping.
  const PALETTE = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#5b4fcf', '#9b59b6', '#ff69b4', '#8b5a2b', '#000000', '#9e9e9e', '#ffffff'];

  // Per-color lightness sweep for generateShades(). Colors not listed here use the function's
  // default (92 down to 8). Hue-sharing pairs each get a non-overlapping slice (with a small gap)
  // so no two colors can ever generate the same hex; Pink and Brown's slices are the widest
  // ("extended"), since they're the ones absorbing the territory Red/Orange gave up.
  const SHADE_RANGES = {
    '#e74c3c': { lightest: 55, darkest: 10 },  // Red -- no more pale/pink tints above 55
    '#ff69b4': { lightest: 97, darkest: 58 },  // Pink -- extended light band
    '#e67e22': { lightest: 92, darkest: 35 },  // Orange -- no more dark/brown shades below 35
    '#8b5a2b': { lightest: 32, darkest: 4 },   // Brown -- extended dark band
    '#000000': { lightest: 22, darkest: 0 },   // Black -- near-black only, no gray creep
    '#9e9e9e': { lightest: 62, darkest: 32 },  // Gray -- the true middle band
    '#ffffff': { lightest: 100, darkest: 70 }, // White -- near-white only, no gray creep
  };

  // Free Draw's Neon Mode (black background, flat row of standard neon colors) -- no shade
  // ramp for these the way the normal palette gets one, since "neon" already IS the saturated
  // end of the range; a generated tint/shade ramp off these would mostly just look washed out.
  const NEON_PALETTE = ['#ff10f0', '#ff6700', '#faff00', '#39ff14', '#00ffff', '#1f51ff', '#bc13fe', '#ff0a3c'];

  // ---- screen navigation ----
  const screens = Array.from(document.querySelectorAll('.screen'));
  function showScreen(id) {
    screens.forEach((s) => s.classList.toggle('active', s.id === id));
  }

  // ---- App name (placeholder until the family picks one; see js/config.js) ----
  document.title = APP_NAME;
  document.querySelectorAll('.js-app-name').forEach((el) => { el.textContent = APP_NAME; });

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---- Little messages + coin celebration (usable from any screen) ----
  const toastEl = document.getElementById('toast');
  let toastTimer = null;
  function showToast(text, ms) {
    toastEl.textContent = text;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), ms || 2000);
  }

  const celebrateOverlay = document.getElementById('celebrate-overlay');
  let celebrateTimer = null;
  function celebrateCoins(amount, opts) {
    const words = amount === 1 ? '1 coin' : `${amount} coins`;
    document.getElementById('celebrate-amount').textContent = `+${amount}`;
    document.getElementById('celebrate-text').textContent = `You earned ${words}!`;
    celebrateOverlay.classList.remove('hidden');
    celebrateOverlay.classList.remove('pop');
    void celebrateOverlay.offsetWidth;
    celebrateOverlay.classList.add('pop');
    if (!opts || !opts.quiet) Voice.speak(`Yay! You earned ${words}!`);
    clearTimeout(celebrateTimer);
    celebrateTimer = setTimeout(() => celebrateOverlay.classList.add('hidden'), 2200);
  }
  celebrateOverlay.addEventListener('click', () => celebrateOverlay.classList.add('hidden'));

  // ---- Sign-in: type your name on the ABC keyboard ----
  // Letters are in ABC order. Each letter says itself when tapped. With the spelling helper on,
  // the next letter of a matching kid's name glows; when the whole name is typed he's signed in.
  const abcKeyboard = document.getElementById('abc-keyboard');
  const signinName = document.getElementById('signin-name');
  const signinPrompt = document.getElementById('signin-prompt');
  const profileEmptyHint = document.getElementById('profile-empty-hint');
  const helloOverlay = document.getElementById('hello-overlay');
  const homeProfileChip = document.getElementById('home-profile-chip');
  let typedName = '';
  let signingIn = false;

  signinPrompt.appendChild(Voice.button('Type your name'));

  const ABC_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'];
  ABC_ROWS.forEach((row, rowIndex) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'abc-row';
    row.split('').forEach((letter) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'abc-key';
      key.dataset.letter = letter;
      key.textContent = letter;
      key.addEventListener('click', () => typeLetter(letter));
      rowEl.appendChild(key);
    });
    if (rowIndex === ABC_ROWS.length - 1) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'abc-key abc-back';
      back.id = 'abc-back';
      back.setAttribute('aria-label', 'Delete a letter');
      back.textContent = '⌫';
      back.addEventListener('click', () => {
        typedName = typedName.slice(0, -1);
        renderSignin();
      });
      rowEl.appendChild(back);
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'abc-key abc-go';
      go.id = 'abc-go';
      go.setAttribute('aria-label', 'Go');
      go.textContent = '✓';
      go.addEventListener('click', () => tryGo(true));
      rowEl.appendChild(go);
    }
    abcKeyboard.appendChild(rowEl);
  });

  function typeLetter(letter) {
    if (signingIn || typedName.length >= 14) return;
    Voice.speak(letter.toLowerCase() === 'a' ? 'ay' : letter);
    typedName += letter;
    renderSignin();
    tryGo(false);
  }

  function renderSignin() {
    const profiles = loadProfiles();
    const firstRun = !hasParentPin();
    document.getElementById('first-run').classList.toggle('hidden', !firstRun);
    profileEmptyHint.classList.toggle('hidden', profiles.length > 0 || firstRun);
    abcKeyboard.classList.toggle('hidden', profiles.length === 0);
    signinName.classList.toggle('hidden', profiles.length === 0);
    signinPrompt.classList.toggle('hidden', profiles.length === 0);

    signinName.innerHTML = '';
    if (!typedName) {
      const ph = document.createElement('span');
      ph.className = 'signin-letter placeholder';
      ph.textContent = '?';
      signinName.appendChild(ph);
    }
    typedName.split('').forEach((l) => {
      const span = document.createElement('span');
      span.className = 'signin-letter';
      span.textContent = l;
      signinName.appendChild(span);
    });

    // Letters on the ABC keyboard no longer hint/glow toward the next letter of a name (even for
    // kids with the "spelling helper" setting on) -- just the Back/Go buttons still light up to
    // show whether the typed name matches anyone, since that's a "ready to go" signal, not a hint.
    const helpers = profiles.map((p) => nameLetters(p.name)).filter(Boolean);
    const matching = helpers.filter((n) => n.startsWith(typedName));
    document.getElementById('abc-back').classList.toggle('glow', !!typedName && helpers.length > 0 && matching.length === 0);
    document.getElementById('abc-go').classList.toggle('glow', matching.includes(typedName) && !!typedName);
  }

  // Signs in when the typed letters spell a kid's name. While typing (fromGoKey false) it waits
  // if another kid's name is longer and starts the same way (e.g. "JO" and "JOHN").
  function tryGo(fromGoKey) {
    if (!typedName || signingIn) return;
    const profiles = loadProfiles();
    const match = profiles.find((p) => nameLetters(p.name) === typedName);
    if (!match) {
      if (fromGoKey) {
        signinName.classList.remove('shake');
        void signinName.offsetWidth;
        signinName.classList.add('shake');
        Voice.speak('Hmm, try again!');
      }
      return;
    }
    const longerOne = profiles.some((p) => p !== match && nameLetters(p.name).startsWith(typedName));
    if (longerOne && !fromGoKey) return;
    signIn(match);
  }

  function signIn(profile) {
    signingIn = true;
    setActiveProfileId(profile.id);
    document.getElementById('hello-text').textContent = `Hi, ${profile.name}!`;
    helloOverlay.classList.remove('hidden');
    Voice.speak(`Hi ${profile.name}!`);
    setTimeout(() => {
      helloOverlay.classList.add('hidden');
      typedName = '';
      signingIn = false;
      enterHome();
    }, 1300);
  }

  function showProfileScreen() {
    typedName = '';
    renderSignin();
    refreshInstallHint();
    showScreen('profile-screen');
  }

  // ---- Add a kid (parent area) ----
  const addProfileBtn = document.getElementById('add-profile-btn');
  const newProfileOverlay = document.getElementById('new-profile-overlay');
  const newProfileName = document.getElementById('new-profile-name');
  const newProfileColorGrid = document.getElementById('new-profile-color-grid');
  const newProfileCancelBtn = document.getElementById('new-profile-cancel-btn');
  const newProfileCreateBtn = document.getElementById('new-profile-create-btn');
  let pendingAvatarColor = AVATAR_COLORS[0];

  function renderAvatarColorGrid() {
    newProfileColorGrid.innerHTML = '';
    AVATAR_COLORS.forEach((c) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'avatar-dot' + (c === pendingAvatarColor ? ' selected' : '');
      dot.style.background = c;
      dot.addEventListener('click', () => {
        pendingAvatarColor = c;
        newProfileColorGrid.querySelectorAll('.avatar-dot').forEach((d) => d.classList.remove('selected'));
        dot.classList.add('selected');
      });
      newProfileColorGrid.appendChild(dot);
    });
  }

  addProfileBtn.addEventListener('click', () => {
    pendingAvatarColor = AVATAR_COLORS[loadProfiles().length % AVATAR_COLORS.length];
    newProfileName.value = '';
    renderAvatarColorGrid();
    newProfileOverlay.classList.remove('hidden');
    setTimeout(() => newProfileName.focus(), 50);
  });

  newProfileCancelBtn.addEventListener('click', () => newProfileOverlay.classList.add('hidden'));

  newProfileCreateBtn.addEventListener('click', () => {
    const name = newProfileName.value.trim();
    if (!nameLetters(name)) {
      alert('Please type a name using letters A to Z, since that is all the sign-in keyboard has.');
      newProfileName.focus();
      return;
    }
    const clash = loadProfiles().find((p) => nameLetters(p.name) === nameLetters(name));
    if (clash) {
      alert(`There's already a kid called ${clash.name} in your family.`);
      return;
    }
    createProfile(name, pendingAvatarColor);
    newProfileOverlay.classList.add('hidden');
    renderParentKidList();
    const welcome = document.getElementById('parent-welcome-card');
    if (!welcome.classList.contains('hidden')) {
      welcome.classList.add('hidden');
      showToast(`✅ ${name} is set up! Tap ← to go to the sign-in screen.`, 3200);
    }
  });

  newProfileName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') newProfileCreateBtn.click();
  });

  // ---- "Add to Home Screen" tip (iPad/iPhone Safari only, hidden once installed) ----
  const INSTALL_HINT_KEY = 'family-app.install-hint-dismissed';
  const installHint = document.getElementById('install-hint');
  function isStandalone() {
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }
  function isAppleTouchDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function refreshInstallHint() {
    installHint.classList.toggle('hidden', !(isAppleTouchDevice() && !isStandalone() && !getData(INSTALL_HINT_KEY, false)));
  }
  document.getElementById('install-hint-close').addEventListener('click', () => {
    setData(INSTALL_HINT_KEY, true);
    refreshInstallHint();
  });

  // ---- Kid home: one tile per section ----
  const sectionGrid = document.getElementById('section-grid');
  const homeCoinCount = document.getElementById('home-coin-count');

  function renderSectionGrid() {
    sectionGrid.innerHTML = '';
    SECTIONS.forEach((sec) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'section-tile' + (sec.ready ? '' : ' not-ready');
      btn.dataset.accent = sec.accent;
      btn.innerHTML = `<span class="section-tile-icon">${sec.emoji}</span><span class="section-tile-label">${escapeHtml(sec.label)}</span>${sec.ready ? '' : '<span class="soon-badge">Soon</span>'}`;
      btn.appendChild(Voice.button(sec.label, 'corner'));
      if (sec.id === 'chores') {
        const left = KidRewards.choresLeftToday(getActiveProfile());
        if (left > 0) {
          const badge = document.createElement('span');
          badge.className = 'tile-count';
          badge.textContent = left;
          btn.appendChild(badge);
        }
      }
      if (sec.id === 'games') {
        const pending = Games.pendingCountForActive();
        if (pending > 0) {
          const badge = document.createElement('span');
          badge.className = 'tile-count';
          badge.textContent = pending;
          btn.appendChild(badge);
        }
      }
      btn.addEventListener('click', () => openSection(sec));
      sectionGrid.appendChild(btn);
    });
  }

  function openSection(sec) {
    if (sec.id === 'coloring') {
      showScreen('coloring-screen');
      return;
    }
    if (sec.id === 'chores') { KidRewards.openChores(); return; }
    if (sec.id === 'math' || sec.id === 'reading') { Learning.openSubject(sec.id); return; }
    if (sec.id === 'games') { Games.openGamesScreen(); return; }
    if (sec.id === 'store') { KidRewards.openStore(); return; }
    Voice.speak(`${sec.label}. Coming soon!`);
    showToast(`${sec.emoji} Coming soon!`, 1800);
  }

  function enterHome() {
    const profile = getActiveProfile();
    if (!profile) { showProfileScreen(); return; }
    homeProfileChip.innerHTML = `<span class="profile-avatar small" style="--avatar-color:${profile.avatarColor}">${escapeHtml(profile.name.charAt(0).toUpperCase())}</span>${escapeHtml(profile.name)}<span class="chip-bye" aria-hidden="true">👋</span>`;
    homeCoinCount.textContent = spendableCoins(profile.id); // coins set aside for purchases aren't counted
    renderSectionGrid();
    KidRewards.renderHomeGoal(profile);
    showScreen('home-screen');
  }

  // Tapping his name chip signs him out, back to the keyboard.
  homeProfileChip.addEventListener('click', () => {
    setActiveProfileId(null);
    showProfileScreen();
  });

  // ---- My coins ----
  const coinBalanceEl = document.getElementById('coin-balance');
  const coinTodayEl = document.getElementById('coin-today');
  const coinHistoryEl = document.getElementById('coin-history');
  const coinHistoryEmpty = document.getElementById('coin-history-empty');

  function coinWords(n) {
    return Math.abs(n) === 1 ? '1 coin' : `${Math.abs(n)} coins`;
  }

  function friendlyDay(iso) {
    const d = new Date(iso);
    const today = localDayKey(new Date());
    const yesterday = localDayKey(new Date(Date.now() - 864e5));
    const key = localDayKey(d);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function renderCoinHistory(container, entries, { withVoice }) {
    container.innerHTML = '';
    entries.forEach((e) => {
      const row = document.createElement('div');
      row.className = 'coin-row ' + (e.amount >= 0 ? 'plus' : 'minus');
      const sign = e.amount >= 0 ? '+' : '−';
      row.innerHTML = `<span class="coin-row-emoji">${escapeHtml(e.emoji || '🪙')}</span>` +
        `<span class="coin-row-text"><span class="coin-row-label">${escapeHtml(e.label || '')}</span><span class="coin-row-day">${escapeHtml(friendlyDay(e.at))}</span></span>` +
        `<span class="coin-row-amount">${sign}${Math.abs(e.amount)}</span>`;
      if (withVoice) {
        const said = `${e.label}. ${e.amount >= 0 ? 'Plus' : 'Minus'} ${coinWords(e.amount)}.`;
        row.appendChild(Voice.button(said));
      }
      container.appendChild(row);
    });
  }

  function renderCoinsScreen() {
    const profile = getActiveProfile();
    if (!profile) return;
    const balance = spendableCoins(profile.id);
    const reserved = reservedCoins(profile.id);
    coinBalanceEl.innerHTML = `<span class="coin-balance-icon">🪙</span><span class="coin-balance-number">${balance}</span>`;
    coinBalanceEl.appendChild(Voice.button(`You have ${coinWords(balance)}.`));
    let reservedEl = document.getElementById('coin-reserved');
    if (!reservedEl) {
      reservedEl = document.createElement('div');
      reservedEl.id = 'coin-reserved';
      reservedEl.className = 'coin-reserved';
      coinBalanceEl.after(reservedEl);
    }
    reservedEl.classList.toggle('hidden', !reserved);
    reservedEl.innerHTML = reserved ? `⏳ ${reserved} more saved for things Mom or Dad will bring` : '';
    if (reserved) reservedEl.appendChild(Voice.button(`${coinWords(reserved)} are saved for things Mom or Dad will bring.`));

    // Today's progress for each earning section, so he (and you) can see what's left.
    coinTodayEl.innerHTML = '';
    Object.entries(getCoinRules().sections).forEach(([id, rule]) => {
      const sec = SECTIONS.find((x) => x.id === id);
      if (!sec || !sec.ready) return; // only sections the boys can use yet
      const earned = coinsEarnedToday(profile.id, id);
      const pct = rule.dailyLimit ? Math.min(100, Math.round((earned / rule.dailyLimit) * 100)) : 0;
      const row = document.createElement('div');
      row.className = 'coin-today-row';
      row.innerHTML = `<span class="coin-today-emoji">${rule.emoji}</span>` +
        `<span class="coin-today-bar"><span style="width:${pct}%"></span></span>` +
        `<span class="coin-today-count">${earned} / ${rule.dailyLimit}</span>`;
      const said = earned >= rule.dailyLimit
        ? `You earned all your ${rule.label.toLowerCase()} coins today!`
        : `${rule.label}: you earned ${coinWords(earned)} today. You can earn ${coinWords(rule.dailyLimit - earned)} more.`;
      row.appendChild(Voice.button(said));
      coinTodayEl.appendChild(row);
    });

    const entries = loadCoinHistory(profile.id).slice(0, 100);
    coinHistoryEmpty.classList.toggle('hidden', entries.length > 0);
    renderCoinHistory(coinHistoryEl, entries, { withVoice: true });
  }

  document.getElementById('home-coin-chip').addEventListener('click', () => {
    renderCoinsScreen();
    showScreen('coins-screen');
  });
  document.getElementById('coins-back-btn').addEventListener('click', () => enterHome());

  // ---- Coloring section menu ----
  document.getElementById('coloring-back-btn').addEventListener('click', () => enterHome());
  document.querySelectorAll('#coloring-screen .menu-card').forEach((card) => {
    card.appendChild(Voice.button(card.dataset.say, 'corner'));
  });
  document.getElementById('nav-free-draw').addEventListener('click', () => openCanvas('draw'));
  document.getElementById('nav-coloring-book').addEventListener('click', () => {
    renderCategoryGrid();
    showScreen('category-screen');
  });
  document.getElementById('nav-gallery').addEventListener('click', () => {
    renderGalleryGrid();
    showScreen('gallery-screen');
  });

  // ---- Coloring Book: category picker (Mammals / Insects / Reptiles / ...) ----
  const categoryGrid = document.getElementById('category-grid');
  document.getElementById('category-back-btn').addEventListener('click', () => showScreen('coloring-screen'));

  function drawThumb(canvasEl, src) {
    const tctx = canvasEl.getContext('2d');
    tctx.fillStyle = '#ffffff';
    tctx.fillRect(0, 0, canvasEl.width, canvasEl.height);
    RasterArt.load(src).then(({ img, bbox }) => {
      RasterArt.drawFitted(tctx, img, bbox, canvasEl.width, canvasEl.height, 0.1);
    }).catch((err) => console.error('[Thumb] failed to load', src, err));
  }

  function renderCategoryGrid() {
    categoryGrid.innerHTML = '';
    ANIMAL_CATEGORIES.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-card';
      btn.innerHTML = `<canvas class="template-thumb" width="160" height="160"></canvas><span class="template-name">${cat.emoji} ${cat.name}</span>`;
      btn.appendChild(Voice.button(cat.name, 'corner'));
      drawThumb(btn.querySelector('canvas'), findTemplate(cat.cover).src);
      btn.addEventListener('click', () => {
        renderTemplateGrid(cat.id);
        showScreen('template-screen');
      });
      categoryGrid.appendChild(btn);
    });
  }

  // ---- Template picker (one category's animals) ----
  const templateGrid = document.getElementById('template-grid');
  const templateScreenTitle = document.getElementById('template-screen-title');
  let currentCategoryId = null;
  document.getElementById('template-back-btn').addEventListener('click', () => {
    renderCategoryGrid();
    showScreen('category-screen');
  });

  function renderTemplateGrid(categoryId) {
    currentCategoryId = categoryId;
    const cat = findCategory(categoryId);
    templateScreenTitle.textContent = cat ? cat.name : 'Pick a Picture';
    templateGrid.innerHTML = '';
    (cat ? cat.items : []).forEach((tpl) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'template-card';
      btn.innerHTML = `<canvas class="template-thumb" width="160" height="160"></canvas><span class="template-name">${tpl.name}</span>`;
      btn.appendChild(Voice.button(tpl.name, 'corner'));
      drawThumb(btn.querySelector('canvas'), tpl.src);
      btn.addEventListener('click', () => openCanvas('fill', tpl.id));
      templateGrid.appendChild(btn);
    });
  }

  // ---- Canvas screen (Free Draw + Coloring Book share this) ----
  const canvasEl = document.getElementById('draw-canvas');
  const canvasTitle = document.getElementById('canvas-title');
  const colorPaletteEl = document.getElementById('color-palette');
  const shadeRowEl = document.getElementById('shade-row');
  const brushSizeInput = document.getElementById('brush-size');
  let currentCanvasMode = 'draw';
  let currentTemplateId = null;
  let editingArtworkId = null; // the gallery piece this canvas saves into (set by "Keep Coloring" or after the first save)
  let openedFromGallery = false; // decides where the back button goes
  const SHADE_COUNT = 25;
  let preEyedropperTool = null; // tool to restore after an eyedropper pick (or a cancel), e.g. bucket vs. a stylus
  let adminCurrentSrc = null; // image src/object-URL currently open in the admin editor, for its Clear button
  let adminCurrentTemplateId = null; // set only when editing a registered template (not a fresh upload)
  let adminCurrentStickerId = null; // set only when editing a registered custom sticker (not a fresh upload)
  let adminSuggestedName = 'template.png'; // filename offered to the Save-As / download, for admin exports

  // Red/Pink and Orange/Brown share a hue, so a hue-only search can't tell them apart -- group
  // them into families and let the picked pixel's own lightness decide which member it's closer
  // to (comparing against the midpoint between the two colors' SHADE_RANGES).
  const HUE_FAMILIES = [
    ['#e74c3c', '#ff69b4'], // Red, Pink
    ['#e67e22', '#8b5a2b'], // Orange, Brown
    ['#f1c40f'], ['#2ecc71'], ['#3498db'], ['#5b4fcf'], ['#9b59b6'],
  ];

  // Finds which top-palette swatch a picked-up color "belongs to" (by hue, or by lightness for
  // near-grayscale picks) so the shade row can be rebuilt around it with the exact picked shade
  // highlighted -- the same thing tapping a base swatch already does, just starting from a canvas
  // tap instead of a palette tap.
  function findClosestBaseHex(pickedHex) {
    const [r, g, b] = hexToRgbTriple(pickedHex);
    const [h, s, l] = rgbToHsl(r, g, b);
    if (s < 12) {
      if (l < 33) return '#000000';
      if (l < 67) return '#9e9e9e';
      return '#ffffff';
    }
    let bestFamily = HUE_FAMILIES[0], bestDiff = Infinity;
    HUE_FAMILIES.forEach((family) => {
      const [br, bg, bb] = hexToRgbTriple(family[0]);
      const [bh] = rgbToHsl(br, bg, bb);
      let diff = Math.abs(bh - h);
      if (diff > 180) diff = 360 - diff;
      if (diff < bestDiff) { bestDiff = diff; bestFamily = family; }
    });
    if (bestFamily.length === 1) return bestFamily[0];
    const [core, extended] = bestFamily;
    const threshold = (SHADE_RANGES[core].lightest + SHADE_RANGES[extended].darkest) / 2;
    return l > threshold ? extended : core;
  }

  // Picking a base swatch up top fills this row with shades of it (light tint through dark
  // shade, same hue) so a kid can get a closer match than the 12 fixed swatches alone without a
  // full color-picker UI. Whichever shade is actually painted with is tracked by its own
  // "selected" ring here; the base palette's ring just marks which family you're currently in.
  function renderShadeRow(baseHex, opts) {
    const selectHex = (opts && opts.selectHex) || baseHex;
    shadeRowEl.innerHTML = '';
    generateShades(baseHex, SHADE_COUNT, SHADE_RANGES[baseHex]).forEach((shadeHex) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'shade-swatch' + (shadeHex.toLowerCase() === selectHex.toLowerCase() ? ' selected' : '');
      sw.style.background = shadeHex;
      sw.addEventListener('click', () => {
        CanvasEngine.setColor(shadeHex);
        shadeRowEl.querySelectorAll('.shade-swatch').forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
        if (CanvasEngine.getTool() === 'eraser') setActiveTool('paintbrush');
      });
      shadeRowEl.appendChild(sw);
    });
  }

  function renderPalette() {
    colorPaletteEl.innerHTML = '';
    PALETTE.forEach((c, colorIndex) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      // Default selection: Red, first swatch in the grid.
      const isDefault = colorIndex === 0;
      sw.className = 'swatch' + (isDefault ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        CanvasEngine.setColor(c);
        colorPaletteEl.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
        renderShadeRow(c);
        // Picking a color while erasing implicitly means "I want to draw with it" again.
        if (CanvasEngine.getTool() === 'eraser') setActiveTool('paintbrush');
      });
      colorPaletteEl.appendChild(sw);
    });
    renderShadeRow(PALETTE[0]); // matches the default-selected base swatch above
  }

  // ---- Neon Mode (Free Draw only): black background + a flat row of neon colors, no shade row ----
  const neonModeBtn = document.getElementById('neon-mode-btn');
  let neonModeActive = false;

  function renderNeonPalette() {
    colorPaletteEl.innerHTML = '';
    NEON_PALETTE.forEach((c, colorIndex) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (colorIndex === 0 ? ' selected' : '');
      sw.style.background = c;
      sw.addEventListener('click', () => {
        CanvasEngine.setColor(c);
        colorPaletteEl.querySelectorAll('.swatch').forEach((s) => s.classList.remove('selected'));
        sw.classList.add('selected');
        if (CanvasEngine.getTool() === 'eraser') setActiveTool('paintbrush');
      });
      colorPaletteEl.appendChild(sw);
    });
    CanvasEngine.setColor(NEON_PALETTE[0]);
  }

  // Switching the backdrop color is only meaningful alongside a fresh (black or white) canvas --
  // flipping it mid-picture would just change what NEW strokes blend into, leaving old strokes
  // sitting on the wrong-color backdrop underneath them. Clearing on toggle keeps "canvas color"
  // and "what's actually painted" from ever disagreeing, same reasoning as Clear itself having no
  // undo-past-it confirmation elsewhere in Free Draw.
  function setNeonMode(on) {
    neonModeActive = on;
    neonModeBtn.classList.toggle('active', on);
    shadeRowEl.classList.toggle('hidden', on); // "no shades" for neon -- just the flat row
    CanvasEngine.setBackgroundColor(on ? '#000000' : '#ffffff');
    CanvasEngine.clearToBlank();
    if (on) renderNeonPalette();
    else renderPalette();
  }

  neonModeBtn.addEventListener('click', () => setNeonMode(!neonModeActive));

  // ---- Stylus picker overlay ----
  const stylusOverlay = document.getElementById('stylus-overlay');
  const stylusPickerBody = document.getElementById('stylus-picker-body');
  const stylusLauncherBtn = document.getElementById('stylus-launcher-btn');
  const stylusLauncherEmoji = document.getElementById('stylus-launcher-emoji');
  const stylusLauncherLabel = document.getElementById('stylus-launcher-label');
  let pickerBuilt = false;

  function renderStylusPicker() {
    if (pickerBuilt) return; // catalog is static -- build the grid once, just re-mark "active" on open
    stylusPickerBody.innerHTML = '';
    STYLUS_CATEGORY_ORDER.forEach((category) => {
      const items = STYLUS_CATALOG.filter((s) => s.category === category);
      if (!items.length) return;
      const heading = document.createElement('div');
      heading.className = 'stylus-category-heading';
      heading.textContent = category;
      stylusPickerBody.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'stylus-grid';
      items.forEach((s) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'stylus-tile';
        tile.dataset.tool = s.id;
        tile.innerHTML = `<span class="stylus-tile-emoji">${s.emoji}</span><span class="tool-label">${s.label}</span>`;
        tile.addEventListener('click', () => {
          setActiveTool(s.id);
          stylusOverlay.classList.add('hidden');
        });
        grid.appendChild(tile);
      });
      stylusPickerBody.appendChild(grid);
    });
    pickerBuilt = true;
    markActiveStylusTile();
  }

  function markActiveStylusTile() {
    const tool = CanvasEngine.getTool();
    stylusPickerBody.querySelectorAll('.stylus-tile').forEach((t) => {
      t.classList.toggle('active', t.dataset.tool === tool);
    });
  }

  function setActiveTool(tool) {
    // A real tool choice made through any other path (stylus picker, "eraser auto-switch", etc.)
    // always wins over a still-armed color-match -- otherwise the button could be left looking
    // armed after the engine's actual tool already moved on.
    preEyedropperTool = null;
    eyedropperBtn.classList.remove('active');
    CanvasEngine.setTool(tool);
    const stylus = findStylus(tool);
    if (stylus) {
      stylusLauncherEmoji.textContent = stylus.emoji;
      stylusLauncherLabel.textContent = stylus.label;
    }
    markActiveStylusTile();
    fillPillBtn.classList.toggle('active', tool === 'bucket');
    eraserPillBtn.classList.toggle('active', tool === 'eraser');
  }

  // ---- Top pill bar: Fill/Eraser are one-tap shortcuts into tools that otherwise live inside
  // the Brush picker (bucket/eraser). ----
  const fillPillBtn = document.getElementById('tool-fill-btn');
  const eraserPillBtn = document.getElementById('tool-eraser-btn');
  fillPillBtn.addEventListener('click', () => setActiveTool('bucket'));
  eraserPillBtn.addEventListener('click', () => setActiveTool('eraser'));

  // ---- Text / Backgrounds pills: not built yet, so they announce themselves instead of
  // silently doing nothing. ----
  document.getElementById('text-tool-btn').addEventListener('click', () => showToast('🔤 Text tool coming soon!', 1800));
  document.getElementById('background-picker-btn').addEventListener('click', () => showToast('🖼️ Backgrounds coming soon!', 1800));

  stylusLauncherBtn.addEventListener('click', () => {
    renderStylusPicker();
    markActiveStylusTile();
    stylusOverlay.classList.remove('hidden');
  });
  document.getElementById('stylus-overlay-close').addEventListener('click', () => {
    stylusOverlay.classList.add('hidden');
  });

  // ---- Colors / Effects tabs in the right-hand panel ----
  const colorsTabBtn = document.getElementById('colors-tab-btn');
  const effectsTabBtn = document.getElementById('effects-tab-btn');
  const colorsTabPanel = document.getElementById('colors-tab-panel');
  const effectsTabPanel = document.getElementById('effects-tab-panel');
  function setPanelTab(tab) {
    colorsTabBtn.classList.toggle('active', tab === 'colors');
    effectsTabBtn.classList.toggle('active', tab === 'effects');
    colorsTabPanel.classList.toggle('hidden', tab !== 'colors');
    effectsTabPanel.classList.toggle('hidden', tab !== 'effects');
  }
  colorsTabBtn.addEventListener('click', () => setPanelTab('colors'));
  effectsTabBtn.addEventListener('click', () => setPanelTab('effects'));

  // ---- Zoom / pan ----
  // Zoom level and pan position both live in CanvasEngine now -- panning via two-finger drag has
  // to be disambiguated from a one-finger brush stroke/fill right at the pointer-event level
  // (both land on the same canvas), which needs tight coordination with the draw/fill state
  // machine that only the engine has. These buttons just call into it.
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const zoomResetBtn = document.getElementById('zoom-reset-btn');

  function refreshZoomButtons() {
    zoomResetBtn.classList.toggle('hidden', !CanvasEngine.isZoomedOrPanned());
    zoomInBtn.disabled = CanvasEngine.isAtMaxZoom();
    zoomOutBtn.disabled = CanvasEngine.isAtMinZoom();
  }
  // Keeps the buttons in sync live during a two-finger pinch too, not just after clicking one of
  // them directly.
  CanvasEngine.setOnZoomChange(refreshZoomButtons);

  zoomInBtn.addEventListener('click', () => {
    CanvasEngine.zoomIn();
    refreshZoomButtons();
  });
  zoomOutBtn.addEventListener('click', () => {
    CanvasEngine.zoomOut();
    refreshZoomButtons();
  });
  zoomResetBtn.addEventListener('click', () => {
    CanvasEngine.resetZoom();
    refreshZoomButtons();
  });

  function openCanvas(mode, templateId) {
    currentCanvasMode = mode;
    currentTemplateId = templateId || null;
    editingArtworkId = null; // fresh session, not continuing a saved piece
    openedFromGallery = false;
    setPanelTab('colors'); // never land on a stale Effects tab from a previous visit
    // admin-only controls; shown by openAdminEditor
    document.getElementById('admin-protect-toggle').classList.add('hidden');
    document.getElementById('admin-download-btn').classList.add('hidden');
    document.getElementById('admin-delete-btn').classList.add('hidden');
    // Stickers, Shapes, and Lasso are a Free Draw thing for now -- a Coloring Book page already has a picture on it.
    document.getElementById('sticker-launcher-btn').classList.toggle('hidden', mode !== 'draw');
    document.getElementById('shape-launcher-btn').classList.toggle('hidden', mode !== 'draw');
    document.getElementById('tool-lasso').classList.toggle('hidden', mode !== 'draw');
    // Lasso never carries over from a previous Free Draw visit either -- always starts fresh/off.
    lassoModeActive = false;
    lassoSelectMode = 'freehand';
    lassoDrawingPath = null;
    lassoDragOrigin = null;
    lassoSelectionPath = null;
    lassoFloating = null;
    document.getElementById('lasso-canvas').classList.add('hidden');
    document.getElementById('lasso-action-controls').classList.add('hidden');
    document.getElementById('lasso-mode-controls').classList.add('hidden');
    document.querySelectorAll('.lasso-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'freehand'));
    document.getElementById('tool-lasso').classList.remove('active');
    // Neon Mode is Free Draw only too, and never carries over from a previous Free Draw visit --
    // every fresh canvas-screen open (Free Draw or Coloring Book) starts from the normal white
    // background + palette; CanvasEngine.loadBlank()/loadTemplate() below then actually paints it.
    neonModeActive = false;
    neonModeBtn.classList.remove('active');
    neonModeBtn.classList.toggle('hidden', mode !== 'draw');
    // Rainbow and the paint effects, unlike Neon Mode, work in both Free Draw and Coloring Book,
    // so they're never hidden here -- just reset off, same "never carries over from a previous
    // visit" reasoning.
    CanvasEngine.setRainbowMode(false);
    CanvasEngine.setPaintEffect(null);
    paintEffectButtons.forEach((b) => b.classList.remove('active'));
    shadeRowEl.classList.remove('hidden');
    CanvasEngine.setBackgroundColor('#ffffff');
    renderPalette();
    canvasTitle.textContent = mode === 'draw' ? 'Free Draw' : (findTemplate(templateId) || {}).name || 'Coloring Book';

    showScreen('canvas-screen');
    // Canvas must be laid out (visible, has real dimensions) before we size the backing buffer.
    requestAnimationFrame(() => {
      CanvasEngine.init(canvasEl);
      if (mode === 'fill') {
        CanvasEngine.loadTemplate(templateId);
        setActiveTool('bucket');
      } else {
        CanvasEngine.loadBlank();
        setActiveTool('paintbrush');
      }
      CanvasEngine.setBrushSize(Number(brushSizeInput.value));
      refreshZoomButtons(); // CanvasEngine.init() already reset zoom/pan for this fresh screen
    });
  }

  document.getElementById('canvas-back-btn').addEventListener('click', () => {
    if (currentCanvasMode === 'admin') {
      showScreen('admin-screen');
    } else if (openedFromGallery) {
      // Came from "Keep Coloring" on a saved piece -- currentCategoryId may be stale or never
      // set if the gallery was opened directly, so always return to the gallery, not the
      // category browser.
      renderGalleryGrid();
      showScreen('gallery-screen');
    } else if (currentCanvasMode === 'fill') {
      renderTemplateGrid(currentCategoryId);
      showScreen('template-screen');
    } else {
      showScreen('coloring-screen');
    }
  });

  document.getElementById('tool-undo').addEventListener('click', () => CanvasEngine.undo());
  document.getElementById('tool-redo').addEventListener('click', () => CanvasEngine.redo());

  // ---- Color match (eyedropper) ----
  const eyedropperBtn = document.getElementById('tool-eyedropper');
  eyedropperBtn.addEventListener('click', () => {
    if (CanvasEngine.getTool() === 'eyedropper') {
      // Tapped again while armed -- cancel back to whatever was active before, untouched.
      CanvasEngine.setTool(preEyedropperTool || 'paintbrush');
      preEyedropperTool = null;
      eyedropperBtn.classList.remove('active');
      return;
    }
    preEyedropperTool = CanvasEngine.getTool();
    CanvasEngine.setTool('eyedropper');
    eyedropperBtn.classList.add('active');
  });

  // ---- Straight Line (modifier on whichever stylus/eraser is already selected) ----
  const lineBtn = document.getElementById('tool-line');
  lineBtn.addEventListener('click', () => {
    const on = !CanvasEngine.getStraightLineMode();
    CanvasEngine.setStraightLineMode(on);
    lineBtn.classList.toggle('active', on);
  });

  // ---- Rainbow + the four paint effects (Effects tab): cycles the stroke color by distance (
  // Rainbow) or paints a per-pixel pattern (Fire/Candy Stripe/Hollow Outline/Sparkle) as the kid
  // draws, with whatever stylus/size is currently selected -- see activeStrokeColor() and the
  // Paint effect GL renderer section in canvas-engine.js. All five are mutually exclusive (a
  // stroke can only use one paint mechanism at a time) and all work in both Free Draw and
  // Coloring Book (unlike Neon Mode, none of them touch the background/palette, so there's no
  // reason to restrict them).
  const rainbowBtn = document.getElementById('rainbow-mode-btn');
  const paintEffectButtons = Array.from(document.querySelectorAll('.paint-effect-toggle'));

  // `effect` is '' for Rainbow, or 'fire'/'candy'/'hollow'/'sparkle' -- turns everything else off
  // first, since the five are mutually exclusive, then applies the one that was actually clicked
  // (unless it was already the active one, which turns it back off to plain solid-color painting).
  function setActivePaintEffect(effect) {
    const alreadyOn = effect === '' ? CanvasEngine.getRainbowMode() : CanvasEngine.getPaintEffect() === effect;
    CanvasEngine.setRainbowMode(false);
    CanvasEngine.setPaintEffect(null);
    paintEffectButtons.forEach((b) => b.classList.remove('active'));
    if (alreadyOn) return;
    if (effect === '') {
      CanvasEngine.setRainbowMode(true);
    } else {
      CanvasEngine.setPaintEffect(effect);
    }
    const btn = paintEffectButtons.find((b) => b.dataset.effect === effect);
    if (btn) btn.classList.add('active');
  }

  paintEffectButtons.forEach((btn) => {
    btn.addEventListener('click', () => setActivePaintEffect(btn.dataset.effect));
  });

  CanvasEngine.setOnColorPicked((pickedHex) => {
    CanvasEngine.setTool(preEyedropperTool || 'paintbrush');
    preEyedropperTool = null;
    eyedropperBtn.classList.remove('active');

    const baseHex = findClosestBaseHex(pickedHex);
    const swatchEls = colorPaletteEl.querySelectorAll('.swatch');
    swatchEls.forEach((s) => s.classList.remove('selected'));
    const idx = PALETTE.indexOf(baseHex);
    if (idx >= 0 && swatchEls[idx]) swatchEls[idx].classList.add('selected');
    renderShadeRow(baseHex, { selectHex: pickedHex });
  });

  // ---- Stickers (Free Draw only): pick a flat silhouette, drag/pinch it into place, stamp it ----
  const stickerLauncherBtn = document.getElementById('sticker-launcher-btn');
  const stickerOverlay = document.getElementById('sticker-overlay');
  const stickerPickerBody = document.getElementById('sticker-picker-body');
  const stickerCanvas = document.getElementById('sticker-canvas');
  const stickerCtx = stickerCanvas.getContext('2d');
  const zoomControlsEl = document.querySelector('.zoom-controls');
  let stickerPickerBuilt = false;
  let stickerPlacement = null; // { shapeId, x, y, size, rotation } in real canvas-pixel coords, or null
  const stickerPointers = new Map(); // pointerId -> last known client {x, y}
  let stickerDragStart = null; // { pointerClientX, pointerClientY, placeX, placeY }
  let stickerPinchStartDist = null;
  let stickerPinchStartSize = null;
  let stickerPinchStartAngle = null; // radians, angle between the two fingers when the pinch began
  let stickerRotationStart = null; // stickerPlacement.rotation at that same moment
  let lastStickerSize = null; // whatever size the last sticker was committed at, so e.g. spelling
                               // out a word with letter stickers doesn't mean re-pinching every letter

  function renderStickerPicker() {
    if (stickerPickerBuilt) return; // catalog is static -- build the grid once
    stickerPickerBody.innerHTML = '';
    STICKER_CATEGORIES.forEach((cat) => {
      if (!cat.items.length) return; // e.g. "My Stickers" before any sticker has been uploaded yet
      const heading = document.createElement('div');
      heading.className = 'stylus-category-heading';
      heading.textContent = cat.label;
      stickerPickerBody.appendChild(heading);

      const grid = document.createElement('div');
      grid.className = 'stylus-grid';
      const isGlyphCategory = cat.id === 'numbers' || cat.id === 'letters';
      cat.items.forEach((item) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'sticker-tile';
        if (isGlyphCategory) {
          tile.innerHTML = `<span class="sticker-tile-glyph">${item.name}</span>`;
        } else {
          tile.innerHTML = '<canvas width="40" height="40"></canvas>';
        }
        tile.addEventListener('click', () => {
          stickerOverlay.classList.add('hidden');
          startStickerPlacement(item.id);
        });
        grid.appendChild(tile);
        if (!isGlyphCategory) {
          const tctx = tile.querySelector('canvas').getContext('2d');
          tctx.translate(20, 20);
          tctx.fillStyle = '#3a2e2e';
          tctx.strokeStyle = '#3a2e2e';
          item.draw(tctx, 30);
          // Custom (uploaded) stickers load their image asynchronously -- if the picker is opened
          // before that finishes, this one-shot tile render would otherwise stay blank forever.
          if (item.img && !item.img.complete) {
            item.img.addEventListener('load', () => {
              tctx.clearRect(-20, -20, 40, 40);
              item.draw(tctx, 30);
            }, { once: true });
          }
        }
      });
      stickerPickerBody.appendChild(grid);
    });
    stickerPickerBuilt = true;
  }

  stickerLauncherBtn.addEventListener('click', () => {
    renderStickerPicker();
    stickerOverlay.classList.remove('hidden');
  });
  document.getElementById('sticker-overlay-close').addEventListener('click', () => {
    stickerOverlay.classList.add('hidden');
  });

  function drawStickerPlacement() {
    if (!stickerPlacement) return;
    const sticker = findSticker(stickerPlacement.shapeId);
    if (!sticker) return;
    stickerCtx.clearRect(0, 0, stickerCanvas.width, stickerCanvas.height);
    stickerCtx.save();
    stickerCtx.translate(stickerPlacement.x, stickerPlacement.y);
    stickerCtx.rotate(stickerPlacement.rotation);
    // Matches whatever CanvasEngine.stampShape will actually commit, so the preview never shows
    // an invisible black silhouette while dragging it around on Neon Mode's black canvas.
    const previewInk = CanvasEngine.getBackgroundColor() === '#000000' ? '#ffffff' : '#000000';
    stickerCtx.fillStyle = previewInk;
    stickerCtx.strokeStyle = previewInk;
    sticker.draw(stickerCtx, stickerPlacement.size);
    stickerCtx.restore();
    // Dashed ring around it -- the only visual cue that this is still floating/movable, not
    // already part of the picture.
    stickerCtx.save();
    stickerCtx.strokeStyle = 'rgba(167, 139, 250, 0.9)';
    stickerCtx.lineWidth = Math.max(2, stickerCanvas.width * 0.003);
    stickerCtx.setLineDash([stickerCanvas.width * 0.012, stickerCanvas.width * 0.008]);
    stickerCtx.beginPath();
    stickerCtx.arc(stickerPlacement.x, stickerPlacement.y, stickerPlacement.size * 0.75, 0, Math.PI * 2);
    stickerCtx.stroke();
    stickerCtx.restore();
  }

  function startStickerPlacement(shapeId) {
    const canvas = CanvasEngine.getCanvas();
    // Placing always starts from a reset view -- keeps this canvas's pixel coordinates identical
    // to the real canvas's, with no zoom/pan transform to account for. The zoom controls are
    // hidden for the same reason: zooming mid-placement would desync the two canvases, since only
    // #draw-canvas receives CanvasEngine's view transform.
    CanvasEngine.resetZoom();
    refreshZoomButtons();
    zoomControlsEl.classList.add('hidden');
    shapeLauncherBtn.classList.add('hidden'); // only one placement overlay at a time
    stickerCanvas.width = canvas.width;
    stickerCanvas.height = canvas.height;

    stickerPlacement = {
      shapeId,
      x: canvas.width / 2,
      y: canvas.height / 2,
      size: lastStickerSize || Math.min(canvas.width, canvas.height) * 0.35,
      rotation: 0,
    };
    stickerCanvas.classList.remove('hidden');
    drawStickerPlacement();
  }

  function endStickerPlacement() {
    stickerPlacement = null;
    stickerPointers.clear();
    stickerDragStart = null;
    stickerPinchStartDist = null;
    stickerCanvas.classList.add('hidden');
    shapeLauncherBtn.classList.remove('hidden');
    zoomControlsEl.classList.remove('hidden');
    refreshZoomButtons();
  }

  // Stamps the floating sticker for real and ends placement -- used to be a separate "Done"
  // button tap; now triggered by tapping outside the dashed selection ring instead (see the
  // pointerdown handler below).
  function commitStickerPlacement() {
    if (!stickerPlacement) return;
    const sticker = findSticker(stickerPlacement.shapeId);
    if (sticker) CanvasEngine.stampShape(sticker.draw, stickerPlacement.x, stickerPlacement.y, stickerPlacement.size, stickerPlacement.rotation);
    lastStickerSize = stickerPlacement.size; // next sticker starts at this size instead of the default
    endStickerPlacement();
  }

  function stickerClientToCanvas(clientX, clientY) {
    const rect = stickerCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (stickerCanvas.width / rect.width),
      y: (clientY - rect.top) * (stickerCanvas.height / rect.height),
    };
  }

  stickerCanvas.addEventListener('pointerdown', (evt) => {
    if (!stickerPlacement) return;
    // First finger down, landing outside the dashed selection ring -- treated as "I'm done,
    // place it here" instead of starting a drag, so there's no separate Done button to tap.
    if (stickerPointers.size === 0) {
      const { x, y } = stickerClientToCanvas(evt.clientX, evt.clientY);
      const dist = Math.hypot(x - stickerPlacement.x, y - stickerPlacement.y);
      if (dist > stickerPlacement.size * 0.75) {
        commitStickerPlacement();
        return;
      }
    }
    try { stickerCanvas.setPointerCapture(evt.pointerId); } catch { /* pointer may already be gone */ }
    stickerPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (stickerPointers.size === 1) {
      stickerDragStart = { pointerClientX: evt.clientX, pointerClientY: evt.clientY, placeX: stickerPlacement.x, placeY: stickerPlacement.y };
    } else if (stickerPointers.size === 2) {
      const pts = [...stickerPointers.values()];
      stickerPinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      stickerPinchStartSize = stickerPlacement.size;
      stickerPinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      stickerRotationStart = stickerPlacement.rotation;
    }
  });

  stickerCanvas.addEventListener('pointermove', (evt) => {
    if (!stickerPlacement || !stickerPointers.has(evt.pointerId)) return;
    stickerPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    const rect = stickerCanvas.getBoundingClientRect();
    const scaleX = stickerCanvas.width / rect.width;
    const scaleY = stickerCanvas.height / rect.height;

    if (stickerPointers.size === 1 && stickerDragStart) {
      stickerPlacement.x = stickerDragStart.placeX + (evt.clientX - stickerDragStart.pointerClientX) * scaleX;
      stickerPlacement.y = stickerDragStart.placeY + (evt.clientY - stickerDragStart.pointerClientY) * scaleY;
      drawStickerPlacement();
    } else if (stickerPointers.size === 2 && stickerPinchStartDist) {
      const pts = [...stickerPointers.values()];
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const ratio = dist / stickerPinchStartDist;
      const minSize = Math.min(stickerCanvas.width, stickerCanvas.height) * 0.04;
      const maxSize = Math.min(stickerCanvas.width, stickerCanvas.height) * 1.4;
      stickerPlacement.size = Math.min(maxSize, Math.max(minSize, stickerPinchStartSize * ratio));
      // Same two fingers, same gesture -- the angle between them twists the shape exactly like
      // the distance between them resizes it, no separate "rotate mode" to find or switch into.
      const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      stickerPlacement.rotation = stickerRotationStart + (angle - stickerPinchStartAngle);
      drawStickerPlacement();
    }
  });

  function endStickerPointer(evt) {
    stickerPointers.delete(evt.pointerId);
    stickerPinchStartDist = null;
    if (stickerPointers.size === 1 && stickerPlacement) {
      // One finger lifted mid-pinch -- rebase dragging on the remaining finger's current spot so
      // the shape doesn't jump.
      const [remaining] = stickerPointers.values();
      stickerDragStart = { pointerClientX: remaining.x, pointerClientY: remaining.y, placeX: stickerPlacement.x, placeY: stickerPlacement.y };
    } else {
      stickerDragStart = null;
    }
  }
  stickerCanvas.addEventListener('pointerup', endStickerPointer);
  stickerCanvas.addEventListener('pointercancel', endStickerPointer);

  // ---- Shapes (Free Draw only): hollow geometric outlines whose corners drag independently --
  // a Rectangle pulled into a trapezoid, a Triangle pulled into any other triangle. Mirrors the
  // Stickers placement flow above (reset zoom, floating overlay canvas, drag/pinch, Done stamps
  // it for real) but each vertex is its own draggable point instead of one resize/rotate handle,
  // and the stamp is a stroked outline only, never filled.
  const shapeLauncherBtn = document.getElementById('shape-launcher-btn');
  const shapeOverlay = document.getElementById('shape-overlay');
  const shapePickerBody = document.getElementById('shape-picker-body');
  const shapeCanvas = document.getElementById('shape-canvas');
  const shapeCtx = shapeCanvas.getContext('2d');
  let shapePickerBuilt = false;
  // { shapeId, strokeWidth, ...either vertices: [{x,y}...] OR ellipse: {cx,cy,rx,ry} } in real
  // canvas-pixel coords, or null. The Circle is the only shape that uses `ellipse` -- see
  // currentShapeVertices() for how either form becomes an actual stroke path.
  let shapePlacement = null;
  const shapePointers = new Map(); // pointerId -> last known client {x, y}
  let shapeDragStart = null; // { pointerClientX, pointerClientY, startVertices or startEllipse } for whichever single-finger drag is active
  let shapeDragVertexIndex = null; // which vertex a solo finger grabbed, or null = dragging the whole shape
  let shapePinchStartDist = null;
  let shapePinchStartVertices = null; // vertex snapshot when a 2-finger pinch began (non-ellipse shapes)
  let shapePinchCentroid = null; // fixed scale-from/rotate-around point for that same pinch (non-ellipse shapes)
  let shapePinchStartAngle = null; // radians, angle between the two fingers when the pinch began
  let shapePinchStartEllipse = null; // {cx,cy,rx,ry} snapshot when a 2-finger pinch began (Circle only)
  // Horizontal/vertical finger-spread (client px) when a Circle pinch began -- how much each
  // grows determines the independent rx/ry stretch ratio, which is what turns it into an oval.
  let shapePinchStartSpread = null;
  // null until the pinch has moved enough to show intent, then 'x' or 'y' for the rest of this
  // gesture -- a real pinch is never perfectly axis-aligned, so without locking to one axis a
  // diagonal pull would grow both rx and ry at once instead of cleanly stretching one direction.
  let shapePinchAxis = null;

  // Either shape representation, reduced to a point ring for stroking/stamping/bbox math.
  function currentShapeVertices(placement) {
    if (placement.ellipse) {
      const e = placement.ellipse;
      return ellipseVertices(e.cx, e.cy, e.rx, e.ry, 48);
    }
    return placement.vertices;
  }

  function shapeClientToCanvas(clientX, clientY) {
    const rect = shapeCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (shapeCanvas.width / rect.width),
      y: (clientY - rect.top) * (shapeCanvas.height / rect.height),
    };
  }

  // Generously large tap target -- a precise pixel-perfect grab point would be nearly impossible
  // for a kid's finger on a corner that's only a couple of stroke-widths across.
  function shapeHandleRadius() {
    return Math.max(28, shapeCanvas.width * 0.025);
  }

  function renderShapePicker() {
    if (shapePickerBuilt) return; // catalog is static -- build the grid once
    shapePickerBody.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'stylus-grid';
    SHAPE_CATALOG.forEach((shape) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'sticker-tile';
      tile.innerHTML = '<canvas width="40" height="40"></canvas>';
      tile.addEventListener('click', () => {
        shapeOverlay.classList.add('hidden');
        startShapePlacement(shape.id);
      });
      grid.appendChild(tile);
      const tctx = tile.querySelector('canvas').getContext('2d');
      tctx.translate(20, 20);
      tctx.strokeStyle = '#3a2e2e';
      tctx.lineWidth = 2;
      strokePolygonPath(tctx, shape.vertices.map((v) => ({ x: v.x * 32, y: v.y * 32 })));
    });
    shapePickerBody.appendChild(grid);
    shapePickerBuilt = true;
  }

  shapeLauncherBtn.addEventListener('click', () => {
    renderShapePicker();
    shapeOverlay.classList.remove('hidden');
  });
  document.getElementById('shape-overlay-close').addEventListener('click', () => {
    shapeOverlay.classList.add('hidden');
  });

  function drawShapePlacement() {
    if (!shapePlacement) return;
    const vertices = currentShapeVertices(shapePlacement);
    shapeCtx.clearRect(0, 0, shapeCanvas.width, shapeCanvas.height);

    shapeCtx.save();
    // Matches whatever CanvasEngine.stampPolygon will actually commit, so the preview never shows
    // an invisible black outline while dragging it around on Neon Mode's black canvas.
    shapeCtx.strokeStyle = CanvasEngine.getBackgroundColor() === '#000000' ? '#ffffff' : '#000000';
    shapeCtx.lineWidth = shapePlacement.strokeWidth;
    shapeCtx.lineJoin = 'round';
    strokePolygonPath(shapeCtx, vertices);
    shapeCtx.restore();

    // Dashed selection box -- the same "still floating" cue Stickers uses, just a rectangle
    // around the shape's current bounds instead of a circle, since these aren't circular.
    const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = shapeCanvas.width * 0.025;
    shapeCtx.save();
    shapeCtx.strokeStyle = 'rgba(167, 139, 250, 0.9)';
    shapeCtx.lineWidth = Math.max(2, shapeCanvas.width * 0.003);
    shapeCtx.setLineDash([shapeCanvas.width * 0.012, shapeCanvas.width * 0.008]);
    shapeCtx.strokeRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
    shapeCtx.restore();

    // Draggable corner handles -- the Circle skips these: it reshapes by pinch-stretching (see
    // the pointer handlers below), not by dragging individual points, so there's nothing to show
    // a grab handle for.
    if (!shapePlacement.ellipse) {
      const r = shapeHandleRadius();
      vertices.forEach((v) => {
        shapeCtx.save();
        shapeCtx.fillStyle = 'rgba(167, 139, 250, 0.95)';
        shapeCtx.strokeStyle = '#ffffff';
        shapeCtx.lineWidth = Math.max(2, shapeCanvas.width * 0.004);
        shapeCtx.beginPath();
        shapeCtx.arc(v.x, v.y, r, 0, Math.PI * 2);
        shapeCtx.fill();
        shapeCtx.stroke();
        shapeCtx.restore();
      });
    }
  }

  function startShapePlacement(shapeId) {
    const template = findShapeTemplate(shapeId);
    if (!template) return;
    const canvas = CanvasEngine.getCanvas();
    // Same reasoning as Stickers: reset zoom so this overlay's pixel coordinates stay identical
    // to the real canvas's for the whole placement.
    CanvasEngine.resetZoom();
    refreshZoomButtons();
    zoomControlsEl.classList.add('hidden');
    stickerLauncherBtn.classList.add('hidden'); // only one placement overlay at a time
    shapeCanvas.width = canvas.width;
    shapeCanvas.height = canvas.height;

    const size = Math.min(canvas.width, canvas.height) * 0.45;
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const strokeWidth = Math.max(8, Math.min(canvas.width, canvas.height) * 0.012);
    shapePlacement = shapeId === 'shape_circle'
      ? { shapeId, ellipse: { cx, cy, rx: size / 2, ry: size / 2 }, strokeWidth }
      : { shapeId, vertices: template.vertices.map((v) => ({ x: cx + v.x * size, y: cy + v.y * size })), strokeWidth };
    shapeCanvas.classList.remove('hidden');
    drawShapePlacement();
  }

  function endShapePlacement() {
    shapePlacement = null;
    shapePointers.clear();
    shapeDragStart = null;
    shapeDragVertexIndex = null;
    shapePinchStartDist = null;
    shapePinchAxis = null;
    shapeCanvas.classList.add('hidden');
    stickerLauncherBtn.classList.remove('hidden');
    zoomControlsEl.classList.remove('hidden');
    refreshZoomButtons();
  }

  // Stamps the floating shape for real and ends placement -- used to be a separate "Done" button
  // tap; now triggered by tapping outside the dashed selection box instead.
  function commitShapePlacement() {
    if (!shapePlacement) return;
    CanvasEngine.stampPolygon(currentShapeVertices(shapePlacement), shapePlacement.strokeWidth);
    endShapePlacement();
  }

  shapeCanvas.addEventListener('pointerdown', (evt) => {
    if (!shapePlacement) return;
    // First finger down, landing outside the dashed selection box -- treated as "I'm done, place
    // it here" instead of starting a drag, so there's no separate Done button to tap. Uses the
    // same padding drawShapePlacement's own dashed box is drawn with, so the tap boundary always
    // matches exactly what's visibly drawn.
    if (shapePointers.size === 0) {
      const { x, y } = shapeClientToCanvas(evt.clientX, evt.clientY);
      const vertices = currentShapeVertices(shapePlacement);
      const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
      const pad = shapeCanvas.width * 0.025;
      const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad;
      const minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
      if (x < minX || x > maxX || y < minY || y > maxY) {
        commitShapePlacement();
        return;
      }
    }
    try { shapeCanvas.setPointerCapture(evt.pointerId); } catch { /* pointer may already be gone */ }
    shapePointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (shapePointers.size === 1) {
      const { x, y } = shapeClientToCanvas(evt.clientX, evt.clientY);
      // The Circle has no draggable corners -- it's never a vertex grab, always "move the whole
      // shape" (see below).
      let nearestIndex = null;
      if (!shapePlacement.ellipse) {
        const r = shapeHandleRadius();
        let nearestDist = Infinity;
        shapePlacement.vertices.forEach((v, i) => {
          const d = Math.hypot(v.x - x, v.y - y);
          if (d <= r && d < nearestDist) { nearestDist = d; nearestIndex = i; }
        });
      }
      shapeDragVertexIndex = nearestIndex; // null = no corner grabbed, drag the whole shape instead
      shapeDragStart = {
        pointerClientX: evt.clientX,
        pointerClientY: evt.clientY,
        startVertices: shapePlacement.vertices ? shapePlacement.vertices.map((v) => ({ ...v })) : null,
        startEllipse: shapePlacement.ellipse ? { ...shapePlacement.ellipse } : null,
      };
    } else if (shapePointers.size === 2) {
      const pts = [...shapePointers.values()];
      shapePinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      shapePinchStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
      if (shapePlacement.ellipse) {
        shapePinchStartEllipse = { ...shapePlacement.ellipse };
        shapePinchStartSpread = { x: Math.abs(pts[1].x - pts[0].x), y: Math.abs(pts[1].y - pts[0].y) };
        shapePinchAxis = null; // each new pinch re-decides its own direction
      } else {
        shapePinchStartVertices = shapePlacement.vertices.map((v) => ({ ...v }));
        const xs = shapePinchStartVertices.map((v) => v.x), ys = shapePinchStartVertices.map((v) => v.y);
        shapePinchCentroid = {
          x: xs.reduce((a, b) => a + b, 0) / xs.length,
          y: ys.reduce((a, b) => a + b, 0) / ys.length,
        };
      }
      shapeDragVertexIndex = null; // a 2nd finger joining always means "resize/twist the whole thing"
    }
  });

  shapeCanvas.addEventListener('pointermove', (evt) => {
    if (!shapePlacement || !shapePointers.has(evt.pointerId)) return;
    shapePointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    const rect = shapeCanvas.getBoundingClientRect();
    const scaleX = shapeCanvas.width / rect.width;
    const scaleY = shapeCanvas.height / rect.height;

    if (shapePointers.size === 1 && shapeDragStart) {
      const dx = (evt.clientX - shapeDragStart.pointerClientX) * scaleX;
      const dy = (evt.clientY - shapeDragStart.pointerClientY) * scaleY;
      if (shapePlacement.ellipse) {
        shapePlacement.ellipse.cx = shapeDragStart.startEllipse.cx + dx;
        shapePlacement.ellipse.cy = shapeDragStart.startEllipse.cy + dy;
      } else if (shapeDragVertexIndex !== null) {
        const start = shapeDragStart.startVertices[shapeDragVertexIndex];
        shapePlacement.vertices[shapeDragVertexIndex] = { x: start.x + dx, y: start.y + dy };
      } else {
        shapePlacement.vertices = shapeDragStart.startVertices.map((v) => ({ x: v.x + dx, y: v.y + dy }));
      }
      drawShapePlacement();
    } else if (shapePointers.size === 2 && shapePinchStartDist) {
      const pts = [...shapePointers.values()];
      if (shapePlacement.ellipse) {
        // Stretches ONE axis at a time instead of the uniform scale+rotate the other shapes get --
        // a real pinch is almost never perfectly horizontal or vertical, so letting both rx and ry
        // react at once made every pull feel diagonal/uncontrolled. Instead, whichever axis has
        // moved further from the pinch's starting spread wins the whole gesture; the other axis is
        // left exactly as it was until the fingers lift and a fresh pinch begins. Always rendered
        // as a true smooth ellipse (see currentShapeVertices), so it stays round-edged either way.
        // No rotation for the oval -- keeps the stretch gesture simple and unambiguous.
        const spreadX = Math.abs(pts[1].x - pts[0].x);
        const spreadY = Math.abs(pts[1].y - pts[0].y);
        const deltaX = spreadX - shapePinchStartSpread.x;
        const deltaY = spreadY - shapePinchStartSpread.y;
        const axisLockThreshold = 6; // px of spread change before committing to a direction, so a
                                      // barely-moved pinch doesn't lock onto the wrong axis
        if (!shapePinchAxis && (Math.abs(deltaX) > axisLockThreshold || Math.abs(deltaY) > axisLockThreshold)) {
          shapePinchAxis = Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y';
        }
        const minSpread = 4; // guards against a divide-by-near-zero if the fingers start almost in line
        if (shapePinchAxis === 'x') {
          const ratioX = Math.max(0.15, Math.min(5, spreadX / Math.max(minSpread, shapePinchStartSpread.x)));
          shapePlacement.ellipse.rx = shapePinchStartEllipse.rx * ratioX;
        } else if (shapePinchAxis === 'y') {
          const ratioY = Math.max(0.15, Math.min(5, spreadY / Math.max(minSpread, shapePinchStartSpread.y)));
          shapePlacement.ellipse.ry = shapePinchStartEllipse.ry * ratioY;
        }
      } else {
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = Math.max(0.15, Math.min(5, dist / shapePinchStartDist));
        // Same two fingers, same gesture -- the angle between them twists the whole shape exactly
        // like the distance between them resizes it, no separate "rotate mode" to find or switch
        // into (same approach Stickers already use). Rotating is a rigid transform around the
        // shape's centroid, applied on top of the scale, so it works the same whether the shape is
        // still a regular polygon or has already been pulled into something irregular.
        const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        const rotation = angle - shapePinchStartAngle;
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        shapePlacement.vertices = shapePinchStartVertices.map((v) => {
          const dx = (v.x - shapePinchCentroid.x) * ratio;
          const dy = (v.y - shapePinchCentroid.y) * ratio;
          return {
            x: shapePinchCentroid.x + (dx * cos - dy * sin),
            y: shapePinchCentroid.y + (dx * sin + dy * cos),
          };
        });
      }
      drawShapePlacement();
    }
  });

  function endShapePointer(evt) {
    shapePointers.delete(evt.pointerId);
    shapePinchStartDist = null;
    if (shapePointers.size === 1 && shapePlacement) {
      // One finger lifted mid-pinch -- rebase on the remaining finger as a whole-shape drag (not
      // a vertex grab; the fingers were pinching, not aiming at one corner).
      const [remaining] = shapePointers.values();
      shapeDragVertexIndex = null;
      shapeDragStart = {
        pointerClientX: remaining.x,
        pointerClientY: remaining.y,
        startVertices: shapePlacement.vertices ? shapePlacement.vertices.map((v) => ({ ...v })) : null,
        startEllipse: shapePlacement.ellipse ? { ...shapePlacement.ellipse } : null,
      };
    } else {
      shapeDragStart = null;
      shapeDragVertexIndex = null;
    }
  }
  shapeCanvas.addEventListener('pointerup', endShapePointer);
  shapeCanvas.addEventListener('pointercancel', endShapePointer);

  // ---- Lasso Select (Free Draw only): circle part of the drawing, then Copy or Cut it -- either
  // way you get a floating piece you drag into place, same "tap outside to drop it" convention as
  // Stickers/Shapes. Unlike those, this is a toggled TOOL (like Straight Line), not a one-shot
  // launcher -- it stays active across multiple selections until tapped off again.
  const lassoBtn = document.getElementById('tool-lasso');
  const lassoCanvas = document.getElementById('lasso-canvas');
  const lassoCtx = lassoCanvas.getContext('2d');
  const lassoActionControls = document.getElementById('lasso-action-controls');
  const lassoCopyBtn = document.getElementById('lasso-copy-btn');
  const lassoCutBtn = document.getElementById('lasso-cut-btn');
  const lassoModeControls = document.getElementById('lasso-mode-controls');
  const lassoModeButtons = Array.from(document.querySelectorAll('.lasso-mode-btn'));
  let lassoModeActive = false;
  let lassoSelectMode = 'freehand'; // 'freehand' | 'rect' | 'circle' -- how the next loop is built
  let lassoDrawingPath = null; // array of {x,y} while a loop is actively being dragged out
  let lassoDragOrigin = null; // fixed start corner for rect/circle modes, which rebuild the whole path every move instead of appending to it
  let lassoSelectionPath = null; // closed loop once released -- Copy/Cut buttons showing
  let lassoFloating = null; // { cutoutCanvas, bbox, x, y, scale } once Copy/Cut was tapped
  const lassoPointers = new Map();
  let lassoDragStart = null;
  let lassoPinchStartDist = null;
  let lassoPinchStartScale = null;

  function lassoClientToCanvas(clientX, clientY) {
    const rect = lassoCanvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) * (lassoCanvas.width / rect.width),
      y: (clientY - rect.top) * (lassoCanvas.height / rect.height),
    };
  }

  // Rebuilt from scratch on every pointermove (not appended to like freehand) -- a rectangle/
  // circle is always defined by just its two drag corners, so each frame recomputes the whole
  // outline from the fixed origin to wherever the pointer is now.
  function lassoRectPath(x1, y1, x2, y2) {
    return [{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }];
  }
  function lassoCirclePath(x1, y1, x2, y2) {
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
    const points = [];
    const sides = 40; // smooth enough at typical canvas resolutions without being costly to clip
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      points.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
    }
    return points;
  }
  function lassoPathFromDrag(x1, y1, x2, y2) {
    if (lassoSelectMode === 'rect') return lassoRectPath(x1, y1, x2, y2);
    if (lassoSelectMode === 'circle') return lassoCirclePath(x1, y1, x2, y2);
    return null; // freehand builds its path by appending points instead, see pointermove
  }

  function lassoDashedPath(ctxTarget, points, closed) {
    ctxTarget.save();
    ctxTarget.strokeStyle = 'rgba(167, 139, 250, 0.9)';
    ctxTarget.lineWidth = Math.max(2, lassoCanvas.width * 0.003);
    ctxTarget.lineJoin = 'round';
    ctxTarget.setLineDash([lassoCanvas.width * 0.012, lassoCanvas.width * 0.008]);
    ctxTarget.beginPath();
    ctxTarget.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctxTarget.lineTo(points[i].x, points[i].y);
    if (closed) ctxTarget.closePath();
    ctxTarget.stroke();
    ctxTarget.restore();
  }

  function redrawLassoOverlay() {
    lassoCtx.clearRect(0, 0, lassoCanvas.width, lassoCanvas.height);
    if (lassoDrawingPath && lassoDrawingPath.length > 1) {
      // Freehand is drawn open (it's not a loop until it closes); rect/circle are already a
      // closed shape by construction the instant the drag starts, so their preview is too.
      lassoDashedPath(lassoCtx, lassoDrawingPath, lassoSelectMode !== 'freehand');
    }
    if (lassoSelectionPath) {
      lassoDashedPath(lassoCtx, lassoSelectionPath, true);
    }
    if (lassoFloating) {
      const { cutoutCanvas, bbox, x, y, scale } = lassoFloating;
      const w = bbox.w * scale, h = bbox.h * scale;
      lassoCtx.drawImage(cutoutCanvas, x - w / 2, y - h / 2, w, h);
      const pad = lassoCanvas.width * 0.02;
      lassoDashedPath(lassoCtx, [
        { x: x - w / 2 - pad, y: y - h / 2 - pad },
        { x: x + w / 2 + pad, y: y - h / 2 - pad },
        { x: x + w / 2 + pad, y: y + h / 2 + pad },
        { x: x - w / 2 - pad, y: y + h / 2 + pad },
      ], true);
    }
  }

  function enterLassoMode() {
    if (lassoModeActive) return;
    const canvas = CanvasEngine.getCanvas();
    // Same reasoning as Stickers/Shapes: reset zoom so this overlay's pixel coordinates stay
    // identical to the real canvas's for the whole session.
    CanvasEngine.resetZoom();
    refreshZoomButtons();
    zoomControlsEl.classList.add('hidden');
    stickerLauncherBtn.classList.add('hidden');
    shapeLauncherBtn.classList.add('hidden');
    lassoCanvas.width = canvas.width;
    lassoCanvas.height = canvas.height;
    lassoCanvas.classList.remove('hidden');
    lassoModeControls.classList.remove('hidden');
    lassoModeActive = true;
    lassoBtn.classList.add('active');
  }

  function exitLassoMode() {
    lassoModeActive = false;
    lassoDrawingPath = null;
    lassoDragOrigin = null;
    lassoSelectionPath = null;
    lassoFloating = null;
    lassoPointers.clear();
    lassoDragStart = null;
    lassoPinchStartDist = null;
    lassoCanvas.classList.add('hidden');
    lassoActionControls.classList.add('hidden');
    lassoModeControls.classList.add('hidden');
    lassoBtn.classList.remove('active');
    lassoSelectMode = 'freehand';
    lassoModeButtons.forEach((b) => b.classList.toggle('active', b.dataset.mode === 'freehand'));
    stickerLauncherBtn.classList.remove('hidden');
    shapeLauncherBtn.classList.remove('hidden');
    zoomControlsEl.classList.remove('hidden');
    refreshZoomButtons();
  }

  lassoBtn.addEventListener('click', () => {
    if (lassoModeActive) exitLassoMode();
    else enterLassoMode();
  });

  lassoModeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      lassoSelectMode = btn.dataset.mode;
      lassoModeButtons.forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  function beginLassoFloating(cutout) {
    lassoFloating = {
      cutoutCanvas: cutout.canvas,
      bbox: cutout.bbox,
      x: cutout.bbox.x + cutout.bbox.w / 2,
      y: cutout.bbox.y + cutout.bbox.h / 2,
      scale: 1,
    };
    lassoSelectionPath = null;
    lassoActionControls.classList.add('hidden');
    redrawLassoOverlay();
  }

  lassoCopyBtn.addEventListener('click', () => {
    if (!lassoSelectionPath) return;
    const cutout = CanvasEngine.extractLassoCutout(lassoSelectionPath);
    if (cutout) beginLassoFloating(cutout);
  });

  lassoCutBtn.addEventListener('click', () => {
    if (!lassoSelectionPath) return;
    const cutout = CanvasEngine.extractLassoCutout(lassoSelectionPath);
    if (!cutout) return;
    CanvasEngine.clearLassoRegion(lassoSelectionPath); // lift it off the page as its own undo step
    beginLassoFloating(cutout);
  });

  // Drops the floating piece for real and goes back to "ready for a new loop" -- does NOT exit
  // Lasso mode, so copying/cutting several things in a row doesn't mean re-tapping the tool.
  function commitLassoFloating() {
    if (!lassoFloating) return;
    CanvasEngine.stampImage(lassoFloating.cutoutCanvas, lassoFloating.x, lassoFloating.y, lassoFloating.scale);
    lassoFloating = null;
    lassoPointers.clear();
    lassoDragStart = null;
    lassoPinchStartDist = null;
    lassoModeControls.classList.remove('hidden'); // back to "ready for a new loop"
    redrawLassoOverlay();
  }

  lassoCanvas.addEventListener('pointerdown', (evt) => {
    if (!lassoModeActive) return;

    if (lassoFloating) {
      // First finger down, landing outside the dashed box around the floating piece -- same
      // "tap outside to place it" convention as Stickers/Shapes.
      if (lassoPointers.size === 0) {
        const { x, y } = lassoClientToCanvas(evt.clientX, evt.clientY);
        const w = lassoFloating.bbox.w * lassoFloating.scale, h = lassoFloating.bbox.h * lassoFloating.scale;
        const pad = lassoCanvas.width * 0.02;
        const outside = x < lassoFloating.x - w / 2 - pad || x > lassoFloating.x + w / 2 + pad
          || y < lassoFloating.y - h / 2 - pad || y > lassoFloating.y + h / 2 + pad;
        if (outside) {
          commitLassoFloating();
          return;
        }
      }
      try { lassoCanvas.setPointerCapture(evt.pointerId); } catch { /* pointer may already be gone */ }
      lassoPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      if (lassoPointers.size === 1) {
        lassoDragStart = { pointerClientX: evt.clientX, pointerClientY: evt.clientY, startX: lassoFloating.x, startY: lassoFloating.y };
      } else if (lassoPointers.size === 2) {
        const pts = [...lassoPointers.values()];
        lassoPinchStartDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        lassoPinchStartScale = lassoFloating.scale;
      }
      return;
    }

    // Otherwise, every pointerdown starts a brand-new loop (replacing any pending selection) --
    // if it turns out to be a plain tap (see pointerup below), nothing short enough to be a real
    // loop gets kept, which is exactly how a tap outside an old selection clears it.
    try { lassoCanvas.setPointerCapture(evt.pointerId); } catch { /* pointer may already be gone */ }
    lassoPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
    if (lassoPointers.size > 1) return; // a loop is a single-finger gesture; ignore extra fingers
    lassoSelectionPath = null;
    lassoActionControls.classList.add('hidden');
    const { x, y } = lassoClientToCanvas(evt.clientX, evt.clientY);
    if (lassoSelectMode === 'freehand') {
      lassoDrawingPath = [{ x, y }];
    } else {
      lassoDragOrigin = { x, y };
      lassoDrawingPath = lassoPathFromDrag(x, y, x, y);
    }
    redrawLassoOverlay();
  });

  lassoCanvas.addEventListener('pointermove', (evt) => {
    if (!lassoModeActive) return;

    if (lassoFloating) {
      if (!lassoPointers.has(evt.pointerId)) return;
      lassoPointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      const rect = lassoCanvas.getBoundingClientRect();
      const scaleX = lassoCanvas.width / rect.width, scaleY = lassoCanvas.height / rect.height;
      if (lassoPointers.size === 1 && lassoDragStart) {
        lassoFloating.x = lassoDragStart.startX + (evt.clientX - lassoDragStart.pointerClientX) * scaleX;
        lassoFloating.y = lassoDragStart.startY + (evt.clientY - lassoDragStart.pointerClientY) * scaleY;
        redrawLassoOverlay();
      } else if (lassoPointers.size === 2 && lassoPinchStartDist) {
        const pts = [...lassoPointers.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = Math.max(0.2, Math.min(4, dist / lassoPinchStartDist));
        lassoFloating.scale = lassoPinchStartScale * ratio;
        redrawLassoOverlay();
      }
      return;
    }

    if (!lassoDrawingPath || !lassoPointers.has(evt.pointerId)) return;
    const { x, y } = lassoClientToCanvas(evt.clientX, evt.clientY);
    if (lassoSelectMode === 'freehand') {
      lassoDrawingPath.push({ x, y });
    } else {
      lassoDrawingPath = lassoPathFromDrag(lassoDragOrigin.x, lassoDragOrigin.y, x, y);
    }
    redrawLassoOverlay();
  });

  function endLassoPointer(evt) {
    if (lassoFloating) {
      lassoPointers.delete(evt.pointerId);
      lassoPinchStartDist = null;
      if (lassoPointers.size === 1) {
        // One finger lifted mid-pinch -- rebase on the remaining finger so the piece doesn't jump.
        const [remaining] = lassoPointers.values();
        lassoDragStart = { pointerClientX: remaining.x, pointerClientY: remaining.y, startX: lassoFloating.x, startY: lassoFloating.y };
      } else {
        lassoDragStart = null;
      }
      return;
    }

    lassoPointers.delete(evt.pointerId);
    if (!lassoDrawingPath) return;
    // Freehand: >=3 points makes a real loop. Rect/circle: always has enough points by
    // construction, but needs an actual real drag (not a plain tap, which never moves the
    // pointer far from lassoDragOrigin) to count as more than zero-area. Either way, something
    // too short/small just clears whatever selection was showing and keeps nothing new.
    let validLoop = lassoDrawingPath.length >= 3;
    if (validLoop && lassoSelectMode !== 'freehand' && lassoDragOrigin) {
      const xs = lassoDrawingPath.map((p) => p.x), ys = lassoDrawingPath.map((p) => p.y);
      const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
      validLoop = w > 10 && h > 10;
    }
    if (validLoop) {
      lassoSelectionPath = lassoDrawingPath;
      lassoActionControls.classList.remove('hidden');
      lassoModeControls.classList.add('hidden'); // hide the mode-switcher while a selection is pending
    }
    lassoDrawingPath = null;
    lassoDragOrigin = null;
    redrawLassoOverlay();
  }
  lassoCanvas.addEventListener('pointerup', endLassoPointer);
  lassoCanvas.addEventListener('pointercancel', endLassoPointer);

  document.getElementById('tool-clear').addEventListener('click', () => {
    if (currentCanvasMode === 'admin') {
      // Discards edits and re-runs the same auto-clean pass a fresh load does, rather than
      // clearing to blank -- there's no "blank" concept here, just back to the starting image.
      CanvasEngine.loadForAdmin(adminCurrentSrc, () => {
        CanvasEngine.setColor('#000000');
        refreshProtectToggle();
      });
    } else if (currentCanvasMode === 'fill') {
      CanvasEngine.clearToTemplate(currentTemplateId);
    } else {
      CanvasEngine.clearToBlank();
    }
  });
  brushSizeInput.addEventListener('input', () => CanvasEngine.setBrushSize(Number(brushSizeInput.value)));

  document.getElementById('canvas-save-btn').addEventListener('click', () => {
    if (currentCanvasMode === 'admin') {
      // Without this catch, any unexpected throw anywhere in the save/verify chain would fail
      // completely silently -- no checkmark, no warning popup, nothing -- since nothing upstream
      // of this click handler was ever watching for it.
      handleAdminExport().catch((err) => {
        console.error('[Admin] save crashed unexpectedly:', err);
        alert(`Save failed unexpectedly: ${err.message || err}`);
      });
      return;
    }
    const profile = getActiveProfile();
    if (!profile) return;
    saveKidArtwork(profile).catch((err) => {
      console.error('[Gallery] save failed:', err);
      alert("Couldn't save this picture. Ask a grown-up to check the iPad's storage.");
    });
  });

  async function saveKidArtwork(profile) {
    await galleryReady;
    let piece;
    if (editingArtworkId) {
      // Continuing a saved piece -- update it in place rather than leaving an older
      // half-finished copy sitting next to the newer save.
      piece = await updateArtworkInGallery(profile.id, editingArtworkId, CanvasEngine.getCanvas());
    } else {
      piece = await addArtworkToGallery(
        profile.id,
        CanvasEngine.getCanvas(),
        currentCanvasMode,
        currentCanvasMode === 'fill' ? currentTemplateId : null
      );
      // Saving the same picture again keeps updating this one instead of making copies.
      editingArtworkId = piece.id;
    }
    flashSaved();
    if (piece) await payColoringCoins(profile, piece);
  }

  // Each picture pays once, after enough coloring (see minActions in js/config.js), up to the
  // daily limit. A picture that hit the limit can still pay on a later day when saved again.
  async function payColoringCoins(profile, piece) {
    const rule = getCoinRules().sections.coloring;
    if (!rule || piece.coinsPaid) return;
    if (CanvasEngine.getEditCount() < (rule.minActions || 0)) {
      setTimeout(() => {
        Voice.speak('Saved! Color a little more to earn coins.');
        showToast('🖍️ Color a little more to earn coins!', 2200);
      }, 500);
      return;
    }
    const name = currentCanvasMode === 'fill' ? ((findTemplate(currentTemplateId) || {}).name || 'Coloring page') : 'Free Draw picture';
    const result = earnCoins(profile.id, 'coloring', { label: `Colored: ${name}`, emoji: '🖍️' });
    if (result.amount > 0) {
      piece.coinsPaid = true;
      await putArtwork(piece);
      setTimeout(() => celebrateCoins(result.amount), 400);
    } else {
      setTimeout(() => {
        Voice.speak("Saved! You've earned all your coloring coins today.");
        showToast('🌟 All coloring coins earned today!', 2400);
      }, 500);
    }
  }

  function flashSaved() {
    const btn = document.getElementById('canvas-save-btn');
    const original = btn.textContent;
    btn.textContent = '✅';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 900);
  }

  window.addEventListener('resize', () => {
    if (document.getElementById('canvas-screen').classList.contains('active')) {
      CanvasEngine.handleResize();
    }
  });

  // ---- Admin: template editor ----
  // Not part of the kid-facing flow -- reached only via the small gear button on the profile
  // screen. Reuses the same canvas-screen/CanvasEngine singleton as Free Draw/Coloring Book
  // (only one of the three is ever open at a time), just with ink protection switched off so the
  // existing stylus tools can clean up the line art itself instead of being blocked by it.
  const adminGrid = document.getElementById('admin-grid');
  const adminUploadInput = document.getElementById('admin-upload-input');
  const adminProtectToggle = document.getElementById('admin-protect-toggle');
  const adminDownloadBtn = document.getElementById('admin-download-btn');
  const adminDeleteBtn = document.getElementById('admin-delete-btn');
  const adminConnectFolderBtn = document.getElementById('admin-connect-folder-btn');
  const adminFolderStatus = document.getElementById('admin-folder-status');
  const adminAssignOverlay = document.getElementById('admin-assign-overlay');
  const adminAssignTitle = document.getElementById('admin-assign-title');
  const adminAssignName = document.getElementById('admin-assign-name');
  const adminAssignCategory = document.getElementById('admin-assign-category');
  const adminAssignNewCatFields = document.getElementById('admin-assign-new-category-fields');
  const adminAssignNewCatName = document.getElementById('admin-assign-new-cat-name');
  const adminAssignNewCatEmoji = document.getElementById('admin-assign-new-cat-emoji');
  let adminPendingUploadSrc = null; // object URL waiting on the category-assign overlay
  let adminPendingNewItem = null; // { categoryId, itemId, name, newCategory } -- set only for an upload being registered
  let adminPendingNewSticker = null; // { itemId, name } -- set only for a sticker upload being registered
  let adminAssignKind = 'template'; // 'template' | 'sticker' -- which fields the assign overlay shows, and which Continue branch to take
  let adminGridBuilt = false;

  const stickerAdminGrid = document.getElementById('sticker-admin-grid');
  const stickerAdminUploadInput = document.getElementById('sticker-admin-upload-input');
  const stickerAdminConnectFolderBtn = document.getElementById('sticker-admin-connect-folder-btn');
  const stickerAdminFolderStatus = document.getElementById('sticker-admin-folder-status');
  const stickerBuiltinOverlay = document.getElementById('sticker-builtin-overlay');
  const stickerBuiltinTitle = document.getElementById('sticker-builtin-title');
  let stickerAdminGridBuilt = false;
  let stickerBuiltinTarget = null; // { id, name } of the built-in shape the small overlay is acting on
  let stickerReplaceTargetId = null; // set just before opening the file picker to "replace" a built-in shape

  const readingPicsGrid = document.getElementById('reading-pics-grid');
  const readingPicsUploadInput = document.getElementById('reading-pics-upload-input');
  const readingPicsConnectFolderBtn = document.getElementById('reading-pics-connect-folder-btn');
  const readingPicsFolderStatus = document.getElementById('reading-pics-folder-status');
  const wordPicOverlay = document.getElementById('word-pic-overlay');
  const wordPicTitle = document.getElementById('word-pic-title');
  const wordPicRemoveBtn = document.getElementById('word-pic-remove-btn');
  const wordPicReplaceBtn = document.getElementById('word-pic-replace-btn');
  const wordPicCancelBtn = document.getElementById('word-pic-cancel-btn');
  const readingPicNameOverlay = document.getElementById('reading-pic-name-overlay');
  const readingPicNameInput = document.getElementById('reading-pic-name-input');
  const readingPicNameCancelBtn = document.getElementById('reading-pic-name-cancel-btn');
  const readingPicNameContinueBtn = document.getElementById('reading-pic-name-continue-btn');
  let readingPicsGridBuilt = false;
  let wordPicTarget = null; // { word, emoji, hasCustom } the small overlay is acting on, or null
  let readingPicPendingBlob = null; // shrunk photo blob waiting on the "what word is this" overlay

  const memoryMatchGrid = document.getElementById('memory-match-grid');
  const memoryMatchUploadInput = document.getElementById('memory-match-upload-input');
  const memoryMatchConnectFolderBtn = document.getElementById('memory-match-connect-folder-btn');
  const memoryMatchFolderStatus = document.getElementById('memory-match-folder-status');
  const memoryMatchCountStatus = document.getElementById('memory-match-count-status');
  const memoryMatchNameOverlay = document.getElementById('memory-match-name-overlay');
  const memoryMatchNameInput = document.getElementById('memory-match-name-input');
  const memoryMatchCategoryInput = document.getElementById('memory-match-category-input');
  const memoryMatchNameCancelBtn = document.getElementById('memory-match-name-cancel-btn');
  const memoryMatchNameContinueBtn = document.getElementById('memory-match-name-continue-btn');
  let memoryMatchGridBuilt = false;
  let memoryMatchPendingBlob = null; // shrunk picture blob waiting on the "what word is this" overlay

  // Persists a FileSystemDirectoryHandle to the project's root folder (the one containing
  // assets/templates/) across page reloads, so Save can write straight to the correct file by
  // walking down from it -- no Save As dialog, no chance of a kid^Wadmin saving the edit into
  // Downloads (or anywhere else) where the app will never see it. IndexedDB is the only storage
  // that can hold a real handle object; localStorage can only hold strings.
  const ADMIN_DB_NAME = 'coloring-app-admin';
  const ADMIN_DB_STORE = 'handles';
  const ADMIN_ROOT_KEY = 'assetsRoot';

  // Re-confirming permission on a previously-connected folder can surface as a small, easy-to-miss
  // browser prompt (not a blocking modal) rather than an obvious dialog -- if it goes unnoticed,
  // that promise just sits pending forever, which from the admin's side looks exactly like "I
  // clicked Save and nothing happened," with no error to catch because nothing actually failed.
  // Racing every such step against a timeout guarantees Save always eventually says SOMETHING.
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(
        () => reject(new Error(`${label} took too long (over ${ms / 1000}s). If a browser permission prompt popped up near the address bar (or in a separate window), check for it and respond, then try Save again.`)),
        ms
      )),
    ]);
  }

  function openAdminDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(ADMIN_DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(ADMIN_DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGet(key) {
    const db = await openAdminDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(ADMIN_DB_STORE, 'readonly').objectStore(ADMIN_DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbSet(key, value) {
    const db = await openAdminDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ADMIN_DB_STORE, 'readwrite');
      tx.objectStore(ADMIN_DB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Re-grants (or confirms) permission on the stored handle -- Chrome re-asks for this every
  // session even though the handle itself persists, and that re-ask only works from a direct
  // user gesture, which is why this is always called from inside a click handler.
  async function getConnectedProjectRoot() {
    if (!window.showDirectoryPicker) return null;
    console.log('[Admin] checking stored project folder handle...');
    const handle = await idbGet(ADMIN_ROOT_KEY).catch(() => null);
    if (!handle) { console.log('[Admin] no project folder connected yet'); return null; }
    try {
      const query = await withTimeout(handle.queryPermission({ mode: 'readwrite' }), 5000, 'Checking folder permission');
      console.log('[Admin] queryPermission ->', query);
      if (query === 'granted') return handle;
      const req = await withTimeout(handle.requestPermission({ mode: 'readwrite' }), 15000, 'Folder permission prompt');
      console.log('[Admin] requestPermission ->', req);
      return req === 'granted' ? handle : null;
    } catch (err) {
      console.warn('[Admin] stored project folder handle check failed or timed out:', err);
      return null;
    }
  }

  // Walks a relative path (e.g. "assets/templates/mammals/giraffe.png") down from a connected
  // root handle to the exact file -- this is what makes Save able to overwrite the real asset
  // directly instead of needing the admin to navigate a save dialog to the right spot by hand.
  async function resolveFileHandleFromRoot(rootHandle, relativePath) {
    const parts = relativePath.split('/').filter(Boolean);
    let dir = rootHandle;
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i]);
    }
    return dir.getFileHandle(parts[parts.length - 1], { create: false });
  }

  // Registers a brand-new upload as a real Coloring Book entry: writes its PNG into
  // assets/templates/<categoryId>/ (creating that folder if this is a new coloring book), then
  // patches js/templates.js to add the catalog entry (and a whole new category object, if
  // needed) -- backing the file up first and re-reading it afterward to confirm the new id is
  // actually there, rather than trusting a clean write with no thrown error.
  async function registerNewTemplate(root, newItem, blob) {
    const { categoryId, itemId, name, newCategory } = newItem;
    const relativePngPath = `assets/templates/${categoryId}/${itemId}.png`;

    let dir = root;
    for (const part of ['assets', 'templates', categoryId]) {
      dir = await dir.getDirectoryHandle(part, { create: true });
    }
    const pngHandle = await dir.getFileHandle(`${itemId}.png`, { create: true });
    const pngWritable = await pngHandle.createWritable();
    await pngWritable.write(blob);
    await pngWritable.close();

    const jsDir = await root.getDirectoryHandle('js');
    const templatesHandle = await jsDir.getFileHandle('templates.js');
    const originalText = await (await templatesHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('templates.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const itemLine = `      { id: '${itemId}', name: '${escapedName}', src: '${relativePngPath}?v=1' },\n`;
    let patchedText;

    if (newCategory) {
      const escapedCatName = newCategory.name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const categoryBlock =
        `  {\n    id: '${categoryId}', name: '${escapedCatName}', emoji: '${newCategory.emoji}', cover: '${itemId}',\n    items: [\n${itemLine}    ],\n  },\n`;
      const insertMarker = '\n];';
      const idx = originalText.lastIndexOf(insertMarker);
      if (idx === -1) throw new Error('Could not find the end of ANIMAL_CATEGORIES in templates.js to insert the new coloring book.');
      patchedText = originalText.slice(0, idx) + '\n' + categoryBlock + originalText.slice(idx);
    } else {
      const catRegex = new RegExp(`(id:\\s*'${categoryId}'[\\s\\S]*?items:\\s*\\[[\\s\\S]*?\\n)(\\s*)(\\],)`);
      if (!catRegex.test(originalText)) throw new Error(`Could not find the coloring book "${categoryId}" in templates.js to add this picture to.`);
      patchedText = originalText.replace(catRegex, (full, itemsBody, indent, closeBracket) => itemsBody + itemLine + indent + closeBracket);
    }

    const templatesWritable = await templatesHandle.createWritable();
    await templatesWritable.write(patchedText);
    await templatesWritable.close();

    const verifyResp = await fetch(`js/templates.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (!verifyText.includes(`id: '${itemId}'`)) {
      throw new Error('Wrote templates.js, but could not confirm the new entry is present after re-reading it. A backup (templates.js.bak) was saved before this change.');
    }
  }

  // Brace-depth scan, not a regex -- a category object contains nested item objects (each its
  // own {...}), so a regex hunting for "the next closing brace" stops at the first ITEM's close,
  // and a non-greedy "anything until id: 'x'" search has no way to stay within one category
  // block, so it can walk straight through unrelated categories to find a same-shaped id
  // elsewhere. This finds the exact start/end of one category's own {...} by tracking brace
  // depth from its own opening brace, verified against the real catalog file before shipping.
  function findCategoryBlockRange(text, catId) {
    const idMarker = `id: '${catId}'`;
    const idIdx = text.indexOf(idMarker);
    if (idIdx === -1) return null;
    const openIdx = text.lastIndexOf('{', idIdx);
    if (openIdx === -1) return null;
    let depth = 0;
    for (let i = openIdx; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) {
          let end = i + 1;
          if (text[end] === ',') end++;
          if (text[end] === '\n') end++;
          return { start: openIdx, end };
        }
      }
    }
    return null;
  }

  // Removes a registered picture: deletes its PNG, then patches templates.js to drop its catalog
  // entry (backing the file up first, same as registerNewTemplate). If it was the last picture in
  // its coloring book, removes the whole now-empty category too -- an empty category would crash
  // the category picker, which needs a valid cover item to thumbnail. If it was the category's
  // cover, repoints the cover to another remaining picture first.
  async function deleteRegisteredTemplate(root, templateId) {
    const tpl = findTemplate(templateId);
    if (!tpl) throw new Error('Could not find this picture in the catalog.');
    const cat = ANIMAL_CATEGORIES.find((c) => c.items.some((i) => i.id === templateId));
    if (!cat) throw new Error('Could not find which coloring book this picture belongs to.');
    const willBeEmpty = cat.items.length <= 1;
    const replacementCoverId = cat.cover === templateId
      ? (cat.items.find((i) => i.id !== templateId) || {}).id
      : null;

    const relativePath = tpl.src.split('?')[0];
    const parts = relativePath.split('/');
    const fileName = parts.pop();
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(fileName);

    const jsDir = await root.getDirectoryHandle('js');
    const templatesHandle = await jsDir.getFileHandle('templates.js');
    const originalText = await (await templatesHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('templates.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const itemLineRegex = new RegExp(`[ \\t]*\\{\\s*id:\\s*'${templateId}'[^}]*\\},?\\n`);
    if (!itemLineRegex.test(originalText)) throw new Error(`Could not find "${templateId}" in templates.js to remove (the picture file was already deleted).`);
    let patchedText = originalText.replace(itemLineRegex, '');

    if (replacementCoverId) {
      const coverRegex = new RegExp(`(id:\\s*'${cat.id}'[^}]*?cover:\\s*')${templateId}(')`);
      patchedText = patchedText.replace(coverRegex, `$1${replacementCoverId}$2`);
    }

    if (willBeEmpty) {
      const range = findCategoryBlockRange(patchedText, cat.id);
      if (!range) throw new Error(`Removed the last picture from "${cat.id}", but couldn't find the now-empty coloring book block to remove it too.`);
      patchedText = patchedText.slice(0, range.start) + patchedText.slice(range.end);
    }

    const templatesWritable = await templatesHandle.createWritable();
    await templatesWritable.write(patchedText);
    await templatesWritable.close();

    const verifyResp = await fetch(`js/templates.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (verifyText.includes(`id: '${templateId}'`)) {
      throw new Error('Deleted the file, but the entry still appears to be present in templates.js after re-reading it. A backup (templates.js.bak) was saved before this change.');
    }
  }

  // Registers a brand-new upload as a real sticker: writes its PNG into assets/stickers/ (flat,
  // no categories -- unlike templates, stickers have no coloring-book grouping), then patches
  // js/custom-stickers.js to add the catalog entry, backing it up first and re-reading it
  // afterward to confirm the new id is actually there. Mirrors registerNewTemplate exactly, just
  // against the simpler single-array custom-stickers.js instead of templates.js's categories.
  // custom-stickers.js holds two arrays (CUSTOM_STICKERS and HIDDEN_BUILTIN_STICKERS) -- this
  // finds the named one specifically and appends a line just before its closing "];", so adding to
  // one never risks matching the other's closing bracket instead.
  function insertLineIntoNamedArray(text, arrayName, line) {
    const re = new RegExp(`(const ${arrayName} = \\[\\n)([\\s\\S]*?)(\\n\\];)`);
    const m = text.match(re);
    if (!m) throw new Error(`Could not find ${arrayName} in custom-stickers.js to update.`);
    const insertAt = m.index + m[1].length + m[2].length;
    return text.slice(0, insertAt) + line + text.slice(insertAt);
  }

  async function registerNewSticker(root, newItem, blob) {
    const { itemId, name, hideBuiltinId } = newItem;
    const relativePngPath = `assets/stickers/${itemId}.png`;

    const assetsDir = await root.getDirectoryHandle('assets', { create: true });
    const stickersDir = await assetsDir.getDirectoryHandle('stickers', { create: true });
    const pngHandle = await stickersDir.getFileHandle(`${itemId}.png`, { create: true });
    const pngWritable = await pngHandle.createWritable();
    await pngWritable.write(blob);
    await pngWritable.close();

    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('custom-stickers.js');
    const originalText = await (await dataHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('custom-stickers.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const escapedName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const itemLine = `  { id: '${itemId}', name: '${escapedName}', src: '${relativePngPath}?v=1' },\n`;
    let patchedText = insertLineIntoNamedArray(originalText, 'CUSTOM_STICKERS', itemLine);
    if (hideBuiltinId) {
      // Replacing a built-in shape with this photo -- same id, so the photo takes over every
      // place the built-in used to show up, and the built-in itself needs hiding so the two
      // don't both appear.
      patchedText = insertLineIntoNamedArray(patchedText, 'HIDDEN_BUILTIN_STICKERS', `  '${hideBuiltinId}',\n`);
    }

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/custom-stickers.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (!verifyText.includes(`id: '${itemId}'`)) {
      throw new Error('Wrote custom-stickers.js, but could not confirm the new entry is present after re-reading it. A backup (custom-stickers.js.bak) was saved before this change.');
    }
  }

  // Hides a built-in vector shape (one defined in js/stickers.js, not an upload) from the picker,
  // by adding its id to HIDDEN_BUILTIN_STICKERS -- there's no PNG file or catalog entry to delete
  // for these, just this exclusion list that js/stickers.js filters every category against.
  async function hideBuiltinSticker(root, stickerId) {
    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('custom-stickers.js');
    const originalText = await (await dataHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('custom-stickers.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const patchedText = insertLineIntoNamedArray(originalText, 'HIDDEN_BUILTIN_STICKERS', `  '${stickerId}',\n`);

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/custom-stickers.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (!verifyText.includes(`'${stickerId}',`)) {
      throw new Error('Wrote custom-stickers.js, but could not confirm the sticker was hidden after re-reading it. A backup (custom-stickers.js.bak) was saved before this change.');
    }
  }

  // Removes a registered sticker: deletes its PNG, then patches custom-stickers.js to drop its
  // catalog entry (backing the file up first, same as deleteRegisteredTemplate). No category or
  // cover-image bookkeeping needed here -- stickers don't have either.
  async function deleteRegisteredSticker(root, stickerId) {
    const item = CUSTOM_STICKERS.find((s) => s.id === stickerId);
    if (!item) throw new Error('Could not find this sticker in the catalog.');

    const relativePath = item.src.split('?')[0];
    const parts = relativePath.split('/');
    const fileName = parts.pop();
    let dir = root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part);
    await dir.removeEntry(fileName);

    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('custom-stickers.js');
    const originalText = await (await dataHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('custom-stickers.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const itemLineRegex = new RegExp(`[ \\t]*\\{\\s*id:\\s*'${stickerId}'[^}]*\\},?\\n`);
    if (!itemLineRegex.test(originalText)) throw new Error(`Could not find "${stickerId}" in custom-stickers.js to remove (the sticker file was already deleted).`);
    const patchedText = originalText.replace(itemLineRegex, '');

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/custom-stickers.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (verifyText.includes(`id: '${stickerId}'`)) {
      throw new Error('Deleted the file, but the entry still appears to be present in custom-stickers.js after re-reading it. A backup (custom-stickers.js.bak) was saved before this change.');
    }
  }

  // Reading Pictures stay real color photos (no line-art/silhouette conversion the way templates
  // and stickers get) -- just centered, cropped to a square, and shrunk, the same way chore/store
  // photos already are in js/setup.js. Kept as its own small copy rather than sharing Setup's
  // internal version, since Setup doesn't export it and the two screens are otherwise independent.
  function shrinkReadingPhoto(file) {
    const MAX = 512;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const out = Math.min(MAX, side);
        const c = document.createElement('canvas');
        c.width = out;
        c.height = out;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, out, out);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert the photo'))), 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
      img.src = url;
    });
  }

  // Writes (or overwrites) one word's photo and its custom-reading-pics.js entry in a single pass
  // -- this doubles as both "add a new word" and "replace an existing word's photo", since an
  // existing { word: '...' } line is just updated in place instead of duplicated.
  async function saveReadingPic(root, word, blob) {
    const relativePngPath = `assets/reading-pics/${word}.jpg`;
    const assetsDir = await root.getDirectoryHandle('assets', { create: true });
    const picsDir = await assetsDir.getDirectoryHandle('reading-pics', { create: true });
    const fileHandle = await picsDir.getFileHandle(`${word}.jpg`, { create: true });
    const fileWritable = await fileHandle.createWritable();
    await fileWritable.write(blob);
    await fileWritable.close();

    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('custom-reading-pics.js');
    const originalText = await (await dataHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('custom-reading-pics.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const newLine = `  { word: '${word}', src: '${relativePngPath}?v=${Date.now()}' },\n`;
    const existingLineRegex = new RegExp(`[ \\t]*\\{\\s*word:\\s*'${word}'[^}]*\\},?\\n`);
    const patchedText = existingLineRegex.test(originalText)
      ? originalText.replace(existingLineRegex, newLine)
      : insertLineIntoNamedArray(originalText, 'CUSTOM_READING_PICS', newLine);

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/custom-reading-pics.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (!verifyText.includes(`word: '${word}'`)) {
      throw new Error('Wrote custom-reading-pics.js, but could not confirm the new entry is present after re-reading it. A backup (custom-reading-pics.js.bak) was saved before this change.');
    }
  }

  // Removes a word's custom photo -- if the word also has a built-in emoji (most of them do), it
  // just falls back to that automatically next load, since this only ever controlled the override.
  async function removeReadingPic(root, word) {
    try {
      const assetsDir = await root.getDirectoryHandle('assets');
      const picsDir = await assetsDir.getDirectoryHandle('reading-pics');
      await picsDir.removeEntry(`${word}.jpg`);
    } catch (err) {
      console.warn('[Admin] reading picture file was already missing:', err);
    }

    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('custom-reading-pics.js');
    const originalText = await (await dataHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('custom-reading-pics.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const itemLineRegex = new RegExp(`[ \\t]*\\{\\s*word:\\s*'${word}'[^}]*\\},?\\n`);
    if (!itemLineRegex.test(originalText)) throw new Error(`Could not find "${word}" in custom-reading-pics.js to remove (the photo file was already deleted).`);
    const patchedText = originalText.replace(itemLineRegex, '');

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/custom-reading-pics.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (verifyText.includes(`word: '${word}'`)) {
      throw new Error('Deleted the file, but the entry still appears to be present in custom-reading-pics.js after re-reading it. A backup (custom-reading-pics.js.bak) was saved before this change.');
    }
  }

  // Memory Match word pictures stay square like Reading Pictures, but transparent PNG (not a
  // white-filled JPG) since these sit inside a card face with its own frame art.
  function shrinkMemoryMatchPhoto(file) {
    const MAX = 512;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const out = Math.min(MAX, side);
        const c = document.createElement('canvas');
        c.width = out;
        c.height = out;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not convert the picture'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image')); };
      img.src = url;
    });
  }

  // Flips one word's enabled flag in place in js/memory-match-words.js (every record always
  // carries its own enabled field, unlike Reading Pictures' separate on/off list).
  async function toggleMemoryMatchWordEnabled(root, id, enabled) {
    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('memory-match-words.js');
    const originalText = await (await dataHandle.getFile()).text();

    const backupHandle = await jsDir.getFileHandle('memory-match-words.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const recordRegex = new RegExp(`(\\{ id: '${id}'[^}]*enabled: )(true|false)([^}]*\\})`);
    if (!recordRegex.test(originalText)) throw new Error(`Could not find "${id}" in memory-match-words.js to update.`);
    const patchedText = originalText.replace(recordRegex, `$1${enabled}$3`);

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/memory-match-words.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (!new RegExp(`\\{ id: '${id}'[^}]*enabled: ${enabled}[^}]*\\}`).test(verifyText)) {
      throw new Error(`Wrote memory-match-words.js, but could not confirm "${id}" is ${enabled ? 'on' : 'off'} after re-reading it. A backup (memory-match-words.js.bak) was saved before this change.`);
    }
  }

  // Registers a brand-new Memory Match word: saves its picture, then appends a record to
  // js/memory-match-words.js (the array is never actually empty -- it ships with 50 words -- so a
  // plain append before the closing "];" is always safe here).
  async function saveMemoryMatchWord(root, { id, word, category }, blob) {
    const relativePngPath = `assets/memory-match/card-fronts/${id}.png`;
    const assetsDir = await root.getDirectoryHandle('assets', { create: true });
    const memDir = await assetsDir.getDirectoryHandle('memory-match', { create: true });
    const frontsDir = await memDir.getDirectoryHandle('card-fronts', { create: true });
    const fileHandle = await frontsDir.getFileHandle(`${id}.png`, { create: true });
    const fileWritable = await fileHandle.createWritable();
    await fileWritable.write(blob);
    await fileWritable.close();

    const jsDir = await root.getDirectoryHandle('js');
    const dataHandle = await jsDir.getFileHandle('memory-match-words.js');
    const originalText = await (await dataHandle.getFile()).text();

    if (new RegExp(`\\{ id: '${id}'`).test(originalText)) throw new Error(`"${id}" is already a Memory Match word.`);

    const backupHandle = await jsDir.getFileHandle('memory-match-words.js.bak', { create: true });
    const backupWritable = await backupHandle.createWritable();
    await backupWritable.write(originalText);
    await backupWritable.close();

    const newLine = `  { id: '${id}', word: '${word}', image: '${relativePngPath}', category: '${category}', enabled: true },\n`;
    const patchedText = originalText.replace(/\n\];\n?$/, `\n${newLine}];\n`);

    const dataWritable = await dataHandle.createWritable();
    await dataWritable.write(patchedText);
    await dataWritable.close();

    const verifyResp = await fetch(`js/memory-match-words.js?_verify=${Date.now()}`, { cache: 'reload' });
    const verifyText = await verifyResp.text();
    if (!verifyText.includes(`id: '${id}'`)) {
      throw new Error('Wrote memory-match-words.js, but could not confirm the new entry is present after re-reading it. A backup (memory-match-words.js.bak) was saved before this change.');
    }
  }

  async function refreshAdminFolderStatus() {
    if (!window.showDirectoryPicker) {
      adminFolderStatus.textContent = "This browser can't connect a folder directly -- Save will use a Save As dialog instead.";
      adminConnectFolderBtn.classList.add('hidden');
      return;
    }
    const handle = await idbGet(ADMIN_ROOT_KEY).catch(() => null);
    if (!handle) {
      adminFolderStatus.textContent = 'Not connected -- Save will open a Save As dialog each time.';
      return;
    }
    const query = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
    adminFolderStatus.textContent = query === 'granted'
      ? `Connected to "${handle.name}" -- Save writes straight to the right file.`
      : `Connected to "${handle.name}" -- click Connect again to re-grant permission this session.`;
  }

  adminConnectFolderBtn.addEventListener('click', async () => {
    try {
      // Pick this app's own project folder itself (the one with index.html and assets/ in it)
      // -- once, not per-template -- everything after this resolves relative to it.
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet(ADMIN_ROOT_KEY, handle);
      await refreshAdminFolderStatus();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Admin] folder connect failed:', err);
    }
  });

  // Reached from the parent area's "Open the photo editor" button (computer only).
  function openTemplateEditorScreen() {
    renderAdminGrid();
    refreshAdminFolderStatus();
    showScreen('admin-screen');
  }
  document.getElementById('admin-back-btn').addEventListener('click', () => showScreen('photo-hub-screen'));

  // Shares the same connected project-folder handle as the photo editor (ADMIN_ROOT_KEY in
  // IndexedDB) -- it's the same project, so connecting from either screen works for both.
  async function refreshStickerAdminFolderStatus() {
    if (!window.showDirectoryPicker) {
      stickerAdminFolderStatus.textContent = "This browser can't connect a folder directly -- Save will use a Save As dialog instead.";
      stickerAdminConnectFolderBtn.classList.add('hidden');
      return;
    }
    const handle = await idbGet(ADMIN_ROOT_KEY).catch(() => null);
    if (!handle) {
      stickerAdminFolderStatus.textContent = 'Not connected -- Save will open a Save As dialog each time.';
      return;
    }
    const query = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
    stickerAdminFolderStatus.textContent = query === 'granted'
      ? `Connected to "${handle.name}" -- Save writes straight to the right file.`
      : `Connected to "${handle.name}" -- click Connect again to re-grant permission this session.`;
  }

  stickerAdminConnectFolderBtn.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet(ADMIN_ROOT_KEY, handle);
      await refreshStickerAdminFolderStatus();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Admin] folder connect failed:', err);
    }
  });

  // Reached from the parent area's "Open the sticker editor" button (computer only).
  function openStickerEditorScreen() {
    renderStickerAdminGrid();
    refreshStickerAdminFolderStatus();
    showScreen('sticker-admin-screen');
  }
  document.getElementById('sticker-admin-back-btn').addEventListener('click', () => showScreen('photo-hub-screen'));

  // Shows every sticker a kid can pick in Free Draw -- the app's built-in vector shapes (via
  // STICKER_CATEGORIES, already filtered against HIDDEN_BUILTIN_STICKERS) alongside any uploaded
  // photos -- so any of them can be deleted or replaced from here, not just uploads. Built-ins
  // have no pixels to touch up, so they open the small Delete/Replace overlay instead of the full
  // editor the way an uploaded photo does.
  function renderStickerAdminGrid() {
    if (stickerAdminGridBuilt) return;
    stickerAdminGrid.innerHTML = '';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'template-card admin-upload-card';
    uploadBtn.innerHTML = '<span class="admin-upload-icon">⬆️</span><span class="template-name">Upload New Sticker</span>';
    uploadBtn.addEventListener('click', () => { stickerReplaceTargetId = null; stickerAdminUploadInput.click(); });
    stickerAdminGrid.appendChild(uploadBtn);

    STICKER_CATEGORIES.forEach((cat) => {
      const isCustom = cat.id === 'custom';
      cat.items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'template-card';
        btn.innerHTML = `<canvas class="template-thumb" width="160" height="160"></canvas><span class="template-name">${isCustom ? item.name : `${cat.label}: ${item.name}`}</span>`;
        const thumbCanvas = btn.querySelector('canvas');
        if (isCustom) {
          drawThumb(thumbCanvas, item.src);
          btn.addEventListener('click', () => openStickerAdminEditor({ stickerId: item.id }));
        } else {
          const tctx = thumbCanvas.getContext('2d');
          tctx.translate(80, 80);
          tctx.fillStyle = '#3a2e2e';
          tctx.strokeStyle = '#3a2e2e';
          item.draw(tctx, 120);
          btn.addEventListener('click', () => openBuiltinStickerOverlay(item));
        }
        stickerAdminGrid.appendChild(btn);
      });
    });
    stickerAdminGridBuilt = true;
  }

  function openBuiltinStickerOverlay(item) {
    stickerBuiltinTarget = item;
    stickerBuiltinTitle.textContent = item.name;
    stickerBuiltinOverlay.classList.remove('hidden');
  }

  document.getElementById('sticker-builtin-cancel-btn').addEventListener('click', () => {
    stickerBuiltinOverlay.classList.add('hidden');
    stickerBuiltinTarget = null;
  });

  document.getElementById('sticker-builtin-replace-btn').addEventListener('click', () => {
    if (!stickerBuiltinTarget) return;
    stickerReplaceTargetId = stickerBuiltinTarget.id;
    stickerBuiltinOverlay.classList.add('hidden');
    stickerAdminUploadInput.click();
  });

  document.getElementById('sticker-builtin-delete-btn').addEventListener('click', async () => {
    if (!stickerBuiltinTarget) return;
    const target = stickerBuiltinTarget;
    const confirmed = confirm(`Remove "${target.name}" from the sticker picker?\n\nKids won't see this shape anymore. This can't be undone from here (though a custom-stickers.js.bak backup is kept).`);
    if (!confirmed) return;
    const root = await getConnectedProjectRoot();
    if (!root) {
      alert('To delete a sticker, first connect your project folder (📁 Connect Project Folder on the Sticker Editor screen), then try again.');
      return;
    }
    try {
      await hideBuiltinSticker(root, target.id);
      stickerBuiltinOverlay.classList.add('hidden');
      stickerBuiltinTarget = null;
      alert(`Removed "${target.name}". Reloading the page to pick up the change...`);
      location.reload();
    } catch (err) {
      console.error('[Admin] hiding built-in sticker failed:', err);
      alert(`Couldn't remove this sticker: ${err.message}`);
    }
  });

  stickerAdminUploadInput.addEventListener('change', () => {
    const file = stickerAdminUploadInput.files && stickerAdminUploadInput.files[0];
    stickerAdminUploadInput.value = ''; // so picking the same file again still fires 'change'
    if (!file) return;
    adminAssignKind = 'sticker';
    adminPendingUploadSrc = URL.createObjectURL(file);
    const defaultName = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'New Sticker';
    adminAssignName.value = stickerReplaceTargetId && stickerBuiltinTarget ? stickerBuiltinTarget.name : defaultName;
    adminAssignName.placeholder = 'Sticker name...';
    adminAssignTitle.textContent = stickerReplaceTargetId ? 'Replace Sticker' : 'New Sticker Details';
    adminAssignCategory.classList.add('hidden');
    adminAssignNewCatFields.classList.add('hidden');
    adminAssignOverlay.classList.remove('hidden');
    setTimeout(() => adminAssignName.focus(), 50);
  });

  function openStickerAdminEditor({ stickerId, uploadedSrc, suggestedName, label, newItem }) {
    const item = stickerId ? CUSTOM_STICKERS.find((s) => s.id === stickerId) : null;
    adminPendingNewItem = null; // a sticker flow never registers a template, even if one was mid-upload
    adminPendingNewSticker = newItem || null;
    currentCanvasMode = 'admin';
    currentTemplateId = null;
    editingArtworkId = null;
    adminCurrentSrc = item ? item.src : uploadedSrc;
    adminCurrentTemplateId = null;
    adminCurrentStickerId = item ? item.id : null;
    adminSuggestedName = suggestedName || (item ? `${item.id}.png` : 'sticker.png');
    canvasTitle.textContent = `Sticker: ${item ? item.name : label || 'New Sticker'}`;
    neonModeActive = false;
    neonModeBtn.classList.remove('active');
    neonModeBtn.classList.add('hidden');
    CanvasEngine.setRainbowMode(false);
    CanvasEngine.setPaintEffect(null);
    paintEffectButtons.forEach((b) => { b.classList.remove('active'); b.classList.add('hidden'); });
    shadeRowEl.classList.remove('hidden');
    document.getElementById('tool-lasso').classList.add('hidden');

    showScreen('canvas-screen');
    requestAnimationFrame(() => {
      CanvasEngine.init(canvasEl);
      CanvasEngine.loadForAdmin(adminCurrentSrc, () => {
        CanvasEngine.setColor('#000000');
        refreshZoomButtons();
        refreshProtectToggle();
      });
      setActiveTool('pen');
      CanvasEngine.setBrushSize(Number(brushSizeInput.value));
      adminProtectToggle.classList.remove('hidden');
      adminDownloadBtn.classList.remove('hidden');
      adminDeleteBtn.classList.toggle('hidden', !adminCurrentStickerId); // only for an existing registered sticker
    });
  }

  // ---- Reading Pictures: real photos for Memory Match / Letter Snap / Mystery Animal, keyed by
  // word -- no canvas editor here (these stay real color photos, not line art), just Replace/Remove
  // on an existing word, or Upload New Picture to add a brand-new one. ----
  async function refreshReadingPicsFolderStatus() {
    if (!window.showDirectoryPicker) {
      readingPicsFolderStatus.textContent = "This browser can't connect a folder directly -- Save will use a Save As dialog instead.";
      readingPicsConnectFolderBtn.classList.add('hidden');
      return;
    }
    const handle = await idbGet(ADMIN_ROOT_KEY).catch(() => null);
    if (!handle) {
      readingPicsFolderStatus.textContent = 'Not connected -- Save will open a Save As dialog each time.';
      return;
    }
    const query = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
    readingPicsFolderStatus.textContent = query === 'granted'
      ? `Connected to "${handle.name}" -- Save writes straight to the right file.`
      : `Connected to "${handle.name}" -- click Connect again to re-grant permission this session.`;
  }

  readingPicsConnectFolderBtn.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet(ADMIN_ROOT_KEY, handle);
      await refreshReadingPicsFolderStatus();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Admin] folder connect failed:', err);
    }
  });

  function openReadingPicsEditorScreen() {
    renderReadingPicsGrid();
    refreshReadingPicsFolderStatus();
    showScreen('reading-pics-admin-screen');
  }
  document.getElementById('reading-pics-admin-back-btn').addEventListener('click', () => showScreen('photo-hub-screen'));

  // ---- Memory Match Words: the dedicated picture/word catalog for Reading's Memory Match. Tap a
  // word to toggle it on/off; Upload New Word adds a brand-new 3-4 letter entry. Words are never
  // deleted here (disabling is reversible) -- hand-edit js/memory-match-words.js to actually
  // remove one. ----
  async function refreshMemoryMatchFolderStatus() {
    if (!window.showDirectoryPicker) {
      memoryMatchFolderStatus.textContent = "This browser can't connect a folder directly -- Save will use a Save As dialog instead.";
      memoryMatchConnectFolderBtn.classList.add('hidden');
      return;
    }
    const handle = await idbGet(ADMIN_ROOT_KEY).catch(() => null);
    if (!handle) {
      memoryMatchFolderStatus.textContent = 'Not connected -- Save will open a Save As dialog each time.';
      return;
    }
    const query = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'prompt');
    memoryMatchFolderStatus.textContent = query === 'granted'
      ? `Connected to "${handle.name}" -- Save writes straight to the right file.`
      : `Connected to "${handle.name}" -- click Connect again to re-grant permission this session.`;
  }

  memoryMatchConnectFolderBtn.addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await idbSet(ADMIN_ROOT_KEY, handle);
      await refreshMemoryMatchFolderStatus();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('[Admin] folder connect failed:', err);
    }
  });

  function openMemoryMatchEditorScreen() {
    renderMemoryMatchGrid();
    refreshMemoryMatchFolderStatus();
    showScreen('memory-match-admin-screen');
  }
  document.getElementById('memory-match-admin-back-btn').addEventListener('click', () => showScreen('photo-hub-screen'));

  function renderMemoryMatchGrid() {
    if (memoryMatchGridBuilt) return;
    memoryMatchGrid.innerHTML = '';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'template-card admin-upload-card';
    uploadBtn.innerHTML = '<span class="admin-upload-icon">⬆️</span><span class="template-name">Upload New Word</span>';
    uploadBtn.addEventListener('click', () => memoryMatchUploadInput.click());
    memoryMatchGrid.appendChild(uploadBtn);

    const words = (typeof MEMORY_MATCH_WORDS !== 'undefined' ? MEMORY_MATCH_WORDS : []).slice().sort((a, b) => a.word.localeCompare(b.word));
    let enabledCount = 0;
    words.forEach((item) => {
      if (item.enabled !== false) enabledCount++;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `template-card memory-match-word${item.enabled === false ? ' off' : ''}`;
      btn.innerHTML = `<canvas class="template-thumb" width="160" height="160"></canvas><span class="template-name">${item.word}</span><span class="memory-match-toggle">${item.enabled === false ? 'Off' : 'On'}</span>`;
      drawThumb(btn.querySelector('canvas'), item.image);
      btn.addEventListener('click', async () => {
        const root = await getConnectedProjectRoot();
        if (!root) {
          alert('To turn a word on or off, first connect your project folder (📁 Connect Project Folder on this screen), then try again.');
          return;
        }
        try {
          await toggleMemoryMatchWordEnabled(root, item.id, item.enabled === false);
          alert(`${item.word} is now ${item.enabled === false ? 'on' : 'off'}. Reloading the page to pick up the change...`);
          location.reload();
        } catch (err) {
          console.error('[Admin] updating Memory Match word failed:', err);
          alert(`Couldn't update "${item.word}": ${err.message}`);
        }
      });
      memoryMatchGrid.appendChild(btn);
    });
    memoryMatchCountStatus.textContent = enabledCount < 16
      ? `⚠️ ${enabledCount} of ${words.length} words on -- need at least 16 to fill the biggest board (16 pairs).`
      : `${enabledCount} of ${words.length} words on. All 4 board sizes (10/12/14/16 pairs) are ready.`;
    memoryMatchGridBuilt = true;
  }

  memoryMatchUploadInput.addEventListener('change', async () => {
    const file = memoryMatchUploadInput.files && memoryMatchUploadInput.files[0];
    memoryMatchUploadInput.value = '';
    if (!file) return;
    try {
      memoryMatchPendingBlob = await shrinkMemoryMatchPhoto(file);
    } catch (err) {
      console.error('[Admin] Memory Match picture could not be read:', err);
      alert("That picture couldn't be opened. Try a JPG or PNG photo.");
      return;
    }
    memoryMatchNameInput.value = '';
    memoryMatchCategoryInput.value = 'objects';
    memoryMatchNameOverlay.classList.remove('hidden');
    setTimeout(() => memoryMatchNameInput.focus(), 50);
  });

  memoryMatchNameCancelBtn.addEventListener('click', () => {
    memoryMatchNameOverlay.classList.add('hidden');
    memoryMatchPendingBlob = null;
  });

  memoryMatchNameContinueBtn.addEventListener('click', async () => {
    const word = memoryMatchNameInput.value.trim().toUpperCase();
    if (!/^[A-Z]{3,4}$/.test(word)) {
      alert('Use a 3-4 letter word (letters only), like "frog" or "cat".');
      memoryMatchNameInput.focus();
      return;
    }
    const id = slugify(word);
    const category = memoryMatchCategoryInput.value;
    const blob = memoryMatchPendingBlob;
    memoryMatchNameOverlay.classList.add('hidden');
    memoryMatchPendingBlob = null;
    const root = await getConnectedProjectRoot();
    if (!root) {
      alert('To add a new word, first connect your project folder (📁 Connect Project Folder on the Memory Match Words screen), then try again.');
      return;
    }
    try {
      await saveMemoryMatchWord(root, { id, word, category }, blob);
      alert(`Added "${word}" to Memory Match! Reloading the page to pick it up...`);
      location.reload();
    } catch (err) {
      console.error('[Admin] adding Memory Match word failed:', err);
      alert(`Couldn't add this word: ${err.message}`);
    }
  });

  function renderReadingPicsGrid() {
    if (readingPicsGridBuilt) return;
    readingPicsGrid.innerHTML = '';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'template-card admin-upload-card';
    uploadBtn.innerHTML = '<span class="admin-upload-icon">⬆️</span><span class="template-name">Upload New Picture</span>';
    uploadBtn.addEventListener('click', () => { wordPicTarget = null; readingPicsUploadInput.click(); });
    readingPicsGrid.appendChild(uploadBtn);

    const customByWord = new Map(CUSTOM_READING_PICS.map((p) => [p.word, p.src]));
    ReadingContent.allReadingPicWords()
      .sort((a, b) => a.word.localeCompare(b.word))
      .forEach((item) => {
        const customSrc = customByWord.get(item.word);
        const label = item.word.charAt(0).toUpperCase() + item.word.slice(1);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'template-card';
        btn.innerHTML = `<canvas class="template-thumb" width="160" height="160"></canvas><span class="template-name">${label}</span>`;
        const thumbCanvas = btn.querySelector('canvas');
        if (customSrc) {
          drawThumb(thumbCanvas, customSrc);
        } else {
          const tctx = thumbCanvas.getContext('2d');
          tctx.font = '90px sans-serif';
          tctx.textAlign = 'center';
          tctx.textBaseline = 'middle';
          tctx.fillText(item.emoji, 80, 86);
        }
        btn.addEventListener('click', () => openWordPicOverlay({ word: item.word, emoji: item.emoji, hasCustom: !!customSrc }));
        readingPicsGrid.appendChild(btn);
      });
    readingPicsGridBuilt = true;
  }

  function openWordPicOverlay(item) {
    wordPicTarget = item;
    wordPicTitle.textContent = item.word.charAt(0).toUpperCase() + item.word.slice(1);
    wordPicRemoveBtn.classList.toggle('hidden', !item.hasCustom);
    wordPicOverlay.classList.remove('hidden');
  }

  wordPicCancelBtn.addEventListener('click', () => {
    wordPicOverlay.classList.add('hidden');
    wordPicTarget = null;
  });

  wordPicReplaceBtn.addEventListener('click', () => {
    if (!wordPicTarget) return;
    wordPicOverlay.classList.add('hidden');
    readingPicsUploadInput.click(); // wordPicTarget stays set so the upload handler skips the naming step
  });

  wordPicRemoveBtn.addEventListener('click', async () => {
    if (!wordPicTarget) return;
    const target = wordPicTarget;
    const confirmed = confirm(`Remove the photo for "${target.word}"? It will go back to the default picture.\n\n(A custom-reading-pics.js.bak backup is kept.)`);
    if (!confirmed) return;
    const root = await getConnectedProjectRoot();
    if (!root) {
      alert('To remove a photo, first connect your project folder (📁 Connect Project Folder on the Reading Pictures screen), then try again.');
      return;
    }
    try {
      await removeReadingPic(root, target.word);
      wordPicOverlay.classList.add('hidden');
      wordPicTarget = null;
      alert(`Removed the photo for "${target.word}". Reloading the page to pick up the change...`);
      location.reload();
    } catch (err) {
      console.error('[Admin] removing reading picture failed:', err);
      alert(`Couldn't remove this photo: ${err.message}`);
    }
  });

  readingPicsUploadInput.addEventListener('change', async () => {
    const file = readingPicsUploadInput.files && readingPicsUploadInput.files[0];
    readingPicsUploadInput.value = '';
    if (!file) return;
    let blob;
    try {
      blob = await shrinkReadingPhoto(file);
    } catch (err) {
      console.error('[Admin] reading picture could not be read:', err);
      alert("That picture couldn't be opened. Try a JPG or PNG photo.");
      return;
    }

    if (wordPicTarget) {
      // Replacing a known word -- the word is already fixed, so just save under it directly.
      const word = wordPicTarget.word;
      wordPicTarget = null;
      const root = await getConnectedProjectRoot();
      if (!root) {
        alert('To save this photo, first connect your project folder (📁 Connect Project Folder on the Reading Pictures screen), then try again.');
        return;
      }
      try {
        await saveReadingPic(root, word, blob);
        alert(`Saved the photo for "${word}". Reloading the page to pick it up...`);
        location.reload();
      } catch (err) {
        console.error('[Admin] saving reading picture failed:', err);
        alert(`Couldn't save this photo: ${err.message}`);
      }
      return;
    }

    // Brand-new word -- ask what it's a picture of before saving.
    readingPicPendingBlob = blob;
    readingPicNameInput.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().toLowerCase();
    readingPicNameOverlay.classList.remove('hidden');
    setTimeout(() => readingPicNameInput.focus(), 50);
  });

  readingPicNameCancelBtn.addEventListener('click', () => {
    readingPicNameOverlay.classList.add('hidden');
    readingPicPendingBlob = null;
  });

  readingPicNameContinueBtn.addEventListener('click', async () => {
    if (!readingPicNameInput.value.trim()) { readingPicNameInput.focus(); return; }
    const word = slugify(readingPicNameInput.value.trim());
    const blob = readingPicPendingBlob;
    readingPicNameOverlay.classList.add('hidden');
    readingPicPendingBlob = null;
    const root = await getConnectedProjectRoot();
    if (!root) {
      alert('To add a new picture, first connect your project folder (📁 Connect Project Folder on the Reading Pictures screen), then try again.');
      return;
    }
    try {
      await saveReadingPic(root, word, blob);
      alert(`Added a picture for "${word}"! Reloading the page to pick it up...`);
      location.reload();
    } catch (err) {
      console.error('[Admin] adding reading picture failed:', err);
      alert(`Couldn't add this picture: ${err.message}`);
    }
  });

  function renderAdminGrid() {
    if (adminGridBuilt) return; // catalog is static for the length of a session -- build once
    adminGrid.innerHTML = '';

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'template-card admin-upload-card';
    uploadBtn.innerHTML = '<span class="admin-upload-icon">⬆️</span><span class="template-name">Upload New Image</span>';
    uploadBtn.addEventListener('click', () => adminUploadInput.click());
    adminGrid.appendChild(uploadBtn);

    ANIMAL_CATEGORIES.forEach((cat) => {
      cat.items.forEach((tpl) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'template-card';
        btn.innerHTML = `<canvas class="template-thumb" width="160" height="160"></canvas><span class="template-name">${cat.name}: ${tpl.name}</span>`;
        drawThumb(btn.querySelector('canvas'), tpl.src);
        btn.addEventListener('click', () => openAdminEditor({ templateId: tpl.id }));
        adminGrid.appendChild(btn);
      });
    });
    adminGridBuilt = true;
  }

  function slugify(s) {
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
  }

  function populateAdminAssignCategorySelect() {
    adminAssignCategory.innerHTML = '';
    ANIMAL_CATEGORIES.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      adminAssignCategory.appendChild(opt);
    });
    const newOpt = document.createElement('option');
    newOpt.value = '__new__';
    newOpt.textContent = '+ Create New Coloring Book';
    adminAssignCategory.appendChild(newOpt);
  }

  adminAssignCategory.addEventListener('change', () => {
    adminAssignNewCatFields.classList.toggle('hidden', adminAssignCategory.value !== '__new__');
  });

  adminUploadInput.addEventListener('change', () => {
    const file = adminUploadInput.files && adminUploadInput.files[0];
    adminUploadInput.value = ''; // so picking the same file again still fires 'change'
    if (!file) return;
    adminAssignKind = 'template';
    adminPendingUploadSrc = URL.createObjectURL(file);
    adminAssignName.value = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'New Picture';
    adminAssignName.placeholder = 'Picture name...';
    adminAssignTitle.textContent = 'New Picture Details';
    adminAssignCategory.classList.remove('hidden');
    populateAdminAssignCategorySelect();
    adminAssignCategory.value = ANIMAL_CATEGORIES.length ? ANIMAL_CATEGORIES[0].id : '__new__';
    adminAssignNewCatFields.classList.add('hidden');
    adminAssignNewCatName.value = '';
    adminAssignNewCatEmoji.value = '';
    adminAssignOverlay.classList.remove('hidden');
    setTimeout(() => adminAssignName.focus(), 50);
  });

  document.getElementById('admin-assign-cancel-btn').addEventListener('click', () => {
    adminAssignOverlay.classList.add('hidden');
    adminPendingUploadSrc = null;
    stickerReplaceTargetId = null;
    stickerBuiltinTarget = null;
  });

  document.getElementById('admin-assign-continue-btn').addEventListener('click', () => {
    const name = adminAssignName.value.trim() || (adminAssignKind === 'sticker' ? 'New Sticker' : 'New Picture');
    const src = adminPendingUploadSrc;

    if (adminAssignKind === 'sticker') {
      // Replacing a built-in shape reuses its exact id, so the photo takes over every place the
      // shape used to show up instead of landing as an unrelated new entry.
      const itemId = stickerReplaceTargetId || slugify(name);
      const hideBuiltinId = stickerReplaceTargetId;
      adminAssignOverlay.classList.add('hidden');
      adminPendingUploadSrc = null;
      stickerReplaceTargetId = null;
      stickerBuiltinTarget = null;
      openStickerAdminEditor({
        uploadedSrc: src,
        suggestedName: `${itemId}.png`,
        label: name,
        newItem: { itemId, name, hideBuiltinId },
      });
      return;
    }

    let categoryId = adminAssignCategory.value;
    let newCategory = null;
    if (categoryId === '__new__') {
      const catName = adminAssignNewCatName.value.trim();
      if (!catName) { adminAssignNewCatName.focus(); return; }
      categoryId = slugify(catName);
      newCategory = { id: categoryId, name: catName, emoji: adminAssignNewCatEmoji.value.trim() || '🎨' };
    }
    const itemId = slugify(name);
    adminAssignOverlay.classList.add('hidden');
    adminPendingUploadSrc = null;
    openAdminEditor({
      uploadedSrc: src,
      suggestedName: `${itemId}.png`,
      label: name,
      newItem: { categoryId, itemId, name, newCategory },
    });
  });

  function openAdminEditor({ templateId, uploadedSrc, suggestedName, label, newItem }) {
    const tpl = templateId ? findTemplate(templateId) : null;
    adminPendingNewItem = newItem || null;
    adminPendingNewSticker = null; // a template flow never registers a sticker, even if one was mid-upload
    adminCurrentStickerId = null;
    currentCanvasMode = 'admin';
    currentTemplateId = null;
    editingArtworkId = null;
    adminCurrentSrc = tpl ? tpl.src : uploadedSrc;
    adminCurrentTemplateId = tpl ? tpl.id : null;
    adminSuggestedName = suggestedName || (tpl ? `${tpl.id}.png` : 'template.png');
    canvasTitle.textContent = `Admin: ${tpl ? tpl.name : label || 'New Image'}`;
    neonModeActive = false;
    neonModeBtn.classList.remove('active');
    neonModeBtn.classList.add('hidden');
    CanvasEngine.setRainbowMode(false);
    CanvasEngine.setPaintEffect(null);
    paintEffectButtons.forEach((b) => { b.classList.remove('active'); b.classList.add('hidden'); });
    shadeRowEl.classList.remove('hidden');
    document.getElementById('tool-lasso').classList.add('hidden');

    showScreen('canvas-screen');
    requestAnimationFrame(() => {
      CanvasEngine.init(canvasEl);
      CanvasEngine.loadForAdmin(adminCurrentSrc, () => {
        CanvasEngine.setColor('#000000');
        refreshZoomButtons();
        refreshProtectToggle();
      });
      setActiveTool('pen');
      CanvasEngine.setBrushSize(Number(brushSizeInput.value));
      adminProtectToggle.classList.remove('hidden');
      adminDownloadBtn.classList.remove('hidden');
      adminDeleteBtn.classList.toggle('hidden', !adminCurrentTemplateId); // only for an existing registered picture
    });
  }

  function refreshProtectToggle() {
    const on = CanvasEngine.getProtectInk();
    adminProtectToggle.textContent = on ? '🔒' : '🔓';
    adminProtectToggle.classList.toggle('active', on);
  }

  adminProtectToggle.addEventListener('click', () => {
    CanvasEngine.setProtectInk(!CanvasEngine.getProtectInk());
    refreshProtectToggle();
  });

  // Deliberately bypasses every File System Access API path above (no connected folder, no Save
  // As dialog, no permission re-confirmation) -- just a plain browser download, the one mechanism
  // that cannot hang waiting on a permission prompt or silently fail from a misconfigured folder
  // connection. Always available as a fallback: download the file, then hand it off the same way
  // every other template image this session has been handed off.
  adminDownloadBtn.addEventListener('click', async () => {
    const blob = await CanvasEngine.exportTransparentPng();
    if (!blob) { alert("Couldn't export the image -- try again."); return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = adminSuggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flashSaved();
  });

  adminDeleteBtn.addEventListener('click', async () => {
    if (adminCurrentStickerId) {
      const item = CUSTOM_STICKERS.find((s) => s.id === adminCurrentStickerId);
      const confirmed = confirm(`Delete "${item ? item.name : adminCurrentStickerId}" from My Stickers?\n\nThis can't be undone from here (though a custom-stickers.js.bak backup is kept).`);
      if (!confirmed) return;
      const root = await getConnectedProjectRoot();
      if (!root) {
        alert('To delete a sticker, first connect your project folder (📁 Connect Project Folder on the Sticker Editor screen), then try again.');
        return;
      }
      try {
        await deleteRegisteredSticker(root, adminCurrentStickerId);
        alert(`Deleted "${item ? item.name : adminCurrentStickerId}". Reloading the page to pick up the change...`);
        location.reload();
      } catch (err) {
        console.error('[Admin] sticker delete failed:', err);
        alert(`Couldn't delete this sticker: ${err.message}`);
      }
      return;
    }
    if (!adminCurrentTemplateId) return; // only ever shown for an existing registered picture
    const tpl = findTemplate(adminCurrentTemplateId);
    const confirmed = confirm(`Delete "${tpl ? tpl.name : adminCurrentTemplateId}" from the Coloring Book?\n\nThis removes the picture file and its catalog entry. This can't be undone from here (though a templates.js.bak backup is kept).`);
    if (!confirmed) return;
    const root = await getConnectedProjectRoot();
    if (!root) {
      alert('To delete a picture, first connect your project folder (📁 Connect Project Folder on the Admin screen), then try again.');
      return;
    }
    try {
      await deleteRegisteredTemplate(root, adminCurrentTemplateId);
      // The in-memory catalog was only parsed once at page load, so the admin grid and the real
      // Coloring Book would both keep showing the just-deleted picture until a true reload --
      // simplest correct fix is to just do that reload automatically instead of leaving it as a
      // manual step (and a stale grid sitting right behind the "deleted" confirmation).
      alert(`Deleted "${tpl ? tpl.name : adminCurrentTemplateId}". Reloading the page to pick up the change...`);
      location.reload();
    } catch (err) {
      console.error('[Admin] delete failed:', err);
      alert(`Couldn't delete this picture: ${err.message}`);
    }
  });

  // Proves the save actually landed where the app will look, instead of trusting that a
  // writable.close() with no thrown error means the Coloring Book will see it. Re-fetches the
  // exact src through a brand-new cache-busted URL (guaranteed network hit, no HTTP cache, no
  // RasterArt cache) and compares its raw byte size against what was just written -- an exact
  // match is strong proof it's the same file; a mismatch means the save went somewhere else, or
  // under a different name, even though the dialog itself reported success.
  async function verifySavedBytes(src, expectedBlob) {
    try {
      const bustUrl = `${src.split('?')[0]}?_verify=${Date.now()}`;
      const resp = await fetch(bustUrl, { cache: 'reload' });
      if (!resp.ok) return false;
      const fetchedBlob = await resp.blob();
      return fetchedBlob.size === expectedBlob.size;
    } catch (err) {
      console.error('[Admin] save verification fetch failed:', err);
      return false;
    }
  }

  function reportSaveOutcome(ok, detail) {
    if (ok) {
      flashSaved();
    } else {
      alert(`Saved, but I couldn't confirm the Coloring Book will show this update.\n\n${detail}`);
    }
  }

  async function handleAdminExport() {
    console.log('[Admin] Save clicked -- exporting canvas...');
    const blob = await CanvasEngine.exportTransparentPng();
    if (!blob) { console.warn('[Admin] export produced no blob -- aborting'); return; }
    console.log('[Admin] export complete, blob size =', blob.size);

    // A brand-new sticker upload -- needs a connected folder no matter what, since it has to both
    // place a PNG and patch js/custom-stickers.js, which a plain Save As dialog can't do.
    if (adminPendingNewSticker) {
      const root = await getConnectedProjectRoot();
      if (!root) {
        alert('To add a new sticker, first connect your project folder (📁 Connect Project Folder on the Sticker Editor screen), then Save again.');
        return;
      }
      try {
        await registerNewSticker(root, adminPendingNewSticker, blob);
        const addedName = adminPendingNewSticker.name;
        adminPendingNewSticker = null;
        alert(`Added "${addedName}" to My Stickers! Reloading the page to pick it up...`);
        location.reload();
      } catch (err) {
        console.error('[Admin] registering new sticker failed:', err);
        alert(`Couldn't add this sticker automatically: ${err.message}`);
      }
      return;
    }

    // Editing an existing custom sticker -- overwrite its PNG directly, same as a connected-folder
    // template edit, then reload so the in-memory Image cache in stickers.js picks up the change
    // (simpler and just as reliable as the template path's live cache-invalidate, since a sticker
    // edit is rare enough that a reload isn't a real cost).
    if (adminCurrentStickerId) {
      const item = CUSTOM_STICKERS.find((s) => s.id === adminCurrentStickerId);
      const root = await getConnectedProjectRoot();
      if (!root) {
        alert('To save changes to this sticker, first connect your project folder (📁 Connect Project Folder on the Sticker Editor screen), then Save again.');
        return;
      }
      try {
        const relativePath = item.src.split('?')[0];
        const fileHandle = await resolveFileHandleFromRoot(root, relativePath);
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert(`Saved changes to "${item.name}". Reloading the page to pick it up...`);
        location.reload();
      } catch (err) {
        console.error('[Admin] saving sticker failed:', err);
        alert(`Couldn't save this sticker: ${err.message}`);
      }
      return;
    }

    // A brand-new upload that's being registered as a real Coloring Book entry -- this needs a
    // connected folder no matter what, since it has to both place a PNG (possibly in a new
    // category folder) and patch js/templates.js, which a plain Save As dialog can't do.
    if (adminPendingNewItem) {
      const root = await getConnectedProjectRoot();
      if (!root) {
        alert('To add a new picture to the Coloring Book, first connect your project folder (📁 Connect Project Folder on the Admin screen), then Save again.');
        return;
      }
      try {
        await registerNewTemplate(root, adminPendingNewItem, blob);
        const addedName = adminPendingNewItem.name;
        adminPendingNewItem = null;
        alert(`Added "${addedName}" to the Coloring Book! Reloading the page to pick it up...`);
        location.reload();
      } catch (err) {
        console.error('[Admin] registering new template failed:', err);
        alert(`Couldn't add this picture automatically: ${err.message}`);
      }
      return;
    }

    // Preferred path: a connected project folder + an existing registered template -- resolve
    // and overwrite the exact file directly, with no dialog at all, so there's no "saved to the
    // wrong place" failure mode. Falls through to the Save As dialog below if anything about this
    // isn't available (nothing connected yet, a fresh upload with no file to target, or the
    // resolve/write itself fails for some other reason).
    if (adminCurrentTemplateId) {
      console.log('[Admin] editing registered template', adminCurrentTemplateId, '-- checking for a connected folder');
      const root = await getConnectedProjectRoot();
      if (root) {
        const relativePath = adminCurrentSrc.split('?')[0]; // e.g. assets/templates/mammals/giraffe.png
        console.log('[Admin] folder connected -- writing directly to', relativePath);
        try {
          const fileHandle = await resolveFileHandleFromRoot(root, relativePath);
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
          console.log('[Admin] direct write complete, verifying...');
          RasterArt.invalidate(adminCurrentSrc);
          const ok = await verifySavedBytes(adminCurrentSrc, blob);
          console.log('[Admin] verification result:', ok);
          reportSaveOutcome(ok, `Wrote to "${relativePath}" in the connected folder, but a fresh fetch of that same path didn't come back matching. Try reconnecting the project folder (it must be this app's own folder itself, not "assets" or a subfolder) and saving again.`);
          return;
        } catch (err) {
          console.error('[Admin] direct folder save failed, falling back to Save As:', err);
        }
      } else {
        console.log('[Admin] no usable connected folder -- falling back to Save As dialog');
      }
    }

    if (window.showSaveFilePicker) {
      console.log('[Admin] opening Save As dialog...');
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: adminSuggestedName,
          types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
        });
        console.log('[Admin] Save As dialog returned, chosen name:', handle.name);
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        if (adminCurrentTemplateId) {
          // Editing a registered template -- the next time anything in the app asks for this
          // exact src (category/template pickers, or opening it for real), it should see the
          // just-written file, not whatever was decoded before the edit -- but only IF this was
          // actually saved to the right name in the right place, which a Save As dialog can't
          // guarantee the way a connected folder can.
          RasterArt.invalidate(adminCurrentSrc);
          if (handle.name !== adminSuggestedName) {
            reportSaveOutcome(false, `You saved as "${handle.name}", but the Coloring Book needs the exact filename "${adminSuggestedName}" inside this template's existing folder in assets/templates/. A different name or location won't update the app. Use "Connect Project Folder" (on the Admin screen) to make this automatic instead.`);
            return;
          }
          const ok = await verifySavedBytes(adminCurrentSrc, blob);
          reportSaveOutcome(ok, `Saved as "${handle.name}", but a fresh fetch of "${adminCurrentSrc.split('?')[0]}" didn't come back matching -- this usually means it was saved to a different folder than the one the app actually reads from. Use "Connect Project Folder" (on the Admin screen) to make this automatic instead.`);
          return;
        }
        // Brand-new upload, nothing registered yet to verify against -- just confirm the write.
        flashSaved();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return; // user cancelled the picker -- not an error
        console.error('[Admin] Save As failed, falling back to download:', err);
        // fall through to the download fallback below
      }
    }

    // Fallback: browsers without the File System Access API, or a Save As that failed above.
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = adminSuggestedName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    flashSaved();
  }

  // ---- Gallery ----
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmptyHint = document.getElementById('gallery-empty-hint');
  document.getElementById('gallery-back-btn').addEventListener('click', () => showScreen('coloring-screen'));

  async function renderGalleryGrid() {
    const profile = getActiveProfile();
    galleryGrid.innerHTML = '';
    if (!profile) return;
    await galleryReady;
    let pieces = [];
    try {
      pieces = await loadGallery(profile.id);
    } catch (err) {
      console.error('[Gallery] load failed:', err);
    }
    galleryGrid.innerHTML = ''; // a second quick tap may have rendered meanwhile
    galleryEmptyHint.classList.toggle('hidden', pieces.length > 0);
    pieces.forEach((piece) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gallery-item';
      btn.innerHTML = `<img src="${piece.dataUrl}" alt="Saved artwork" />`;
      btn.addEventListener('click', () => openArtworkView(piece.id));
      galleryGrid.appendChild(btn);
    });
  }

  const artworkViewImg = document.getElementById('artwork-view-img');
  let openArtworkId = null;

  async function openArtworkView(id) {
    const piece = await getArtwork(id);
    if (!piece) return;
    openArtworkId = id;
    artworkViewImg.src = piece.dataUrl;
    showScreen('artwork-screen');
  }

  document.getElementById('artwork-back-btn').addEventListener('click', () => showScreen('gallery-screen'));

  document.getElementById('artwork-delete-btn').addEventListener('click', async () => {
    const profile = getActiveProfile();
    if (!profile || !openArtworkId) return;
    try {
      await deleteArtworkFromGallery(profile.id, openArtworkId);
    } catch (err) {
      console.error('[Gallery] delete failed:', err);
    }
    showScreen('gallery-screen');
    renderGalleryGrid();
  });

  document.getElementById('artwork-edit-btn').addEventListener('click', async () => {
    const profile = getActiveProfile();
    if (!profile || !openArtworkId) return;
    const piece = await getArtwork(openArtworkId);
    if (!piece) return;
    openCanvasForEdit(piece);
  });

  function openCanvasForEdit(piece) {
    const mode = piece.mode === 'fill' ? 'fill' : 'draw';
    currentCanvasMode = mode;
    currentTemplateId = piece.templateId || null;
    editingArtworkId = piece.id;
    openedFromGallery = true;
    // Same Neon Mode reset as openCanvas() -- a saved piece's background color isn't tracked, so
    // this always resumes as a normal white-background edit (see loadSavedArtwork's own comment).
    document.getElementById('sticker-launcher-btn').classList.toggle('hidden', mode !== 'draw');
    document.getElementById('shape-launcher-btn').classList.toggle('hidden', mode !== 'draw');
    document.getElementById('tool-lasso').classList.toggle('hidden', mode !== 'draw');
    lassoModeActive = false;
    lassoSelectMode = 'freehand';
    lassoDrawingPath = null;
    lassoDragOrigin = null;
    lassoSelectionPath = null;
    lassoFloating = null;
    document.getElementById('lasso-canvas').classList.add('hidden');
    document.getElementById('lasso-action-controls').classList.add('hidden');
    document.getElementById('lasso-mode-controls').classList.add('hidden');
    document.querySelectorAll('.lasso-mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'freehand'));
    document.getElementById('tool-lasso').classList.remove('active');
    neonModeActive = false;
    neonModeBtn.classList.remove('active');
    neonModeBtn.classList.toggle('hidden', mode !== 'draw');
    CanvasEngine.setRainbowMode(false);
    CanvasEngine.setPaintEffect(null);
    paintEffectButtons.forEach((b) => b.classList.remove('active'));
    shadeRowEl.classList.remove('hidden');
    renderPalette();
    canvasTitle.textContent = mode === 'draw' ? 'Free Draw' : (findTemplate(currentTemplateId) || {}).name || 'Coloring Book';

    showScreen('canvas-screen');
    requestAnimationFrame(() => {
      CanvasEngine.init(canvasEl);
      CanvasEngine.loadSavedArtwork(piece.dataUrl, currentTemplateId);
      setActiveTool(mode === 'fill' ? 'bucket' : 'paintbrush');
      CanvasEngine.setBrushSize(Number(brushSizeInput.value));
      refreshZoomButtons();
    });
  }

  // ---- boot ----
  // ---- Parent area ----
  const parentKidList = document.getElementById('parent-kid-list');
  const parentStatus = document.getElementById('parent-status');
  const canEditTemplates = !!window.showDirectoryPicker; // desktop Chrome/Edge on the central computer only

  function renderParentKidList() {
    parentKidList.innerHTML = '';
    const profiles = loadProfiles();
    if (!profiles.length) {
      parentKidList.innerHTML = '<p class="parent-card-note">No kids yet. Add one below.</p>';
      return;
    }
    profiles.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'parent-kid-row';
      row.innerHTML = `<span class="profile-avatar small" style="--avatar-color:${p.avatarColor}">${escapeHtml(p.name.charAt(0).toUpperCase())}</span>` +
        `<span class="parent-kid-name">${escapeHtml(p.name)}</span>` +
        `<span class="parent-kid-coins">🪙 ${getCoinBalance(p.id)}</span><span class="parent-kid-more">›</span>`;
      row.addEventListener('click', () => openKidPanel(p.id));
      parentKidList.appendChild(row);
    });
  }

  function renderParentCoinRules() {
    const sec = getCoinRules().sections;
    const lines = [
      `${sec.coloring.emoji} Coloring: ${coinWords(sec.coloring.perItem)} a picture (after ${sec.coloring.minActions} strokes or fills), up to ${sec.coloring.dailyLimit} a day`,
      `${sec.chores.emoji} Chores: each chore's own value, up to ${sec.chores.dailyLimit} a day`,
      `${sec.math.emoji} Math: ${coinWords(sec.math.perItem)} a Practice round, ${coinWords(sec.math.gamePerItem)} a game, up to ${sec.math.dailyLimit} a day`,
      `${sec.reading.emoji} Reading: ${coinWords(sec.reading.perItem)} a Practice round, ${coinWords(sec.reading.gamePerItem)} a game, up to ${sec.reading.dailyLimit} a day`,
      `Overall daily limit: ${overallDailyLimit()} coins`,
    ];
    document.getElementById('parent-coin-rules').innerHTML = lines.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  }

  // ---- One kid's panel: spelling helper, add/take away coins, history, remove ----
  const kidOverlay = document.getElementById('kid-overlay');
  const kidHelperToggle = document.getElementById('kid-helper-toggle');
  const kidAdjustAmount = document.getElementById('kid-adjust-amount');
  const kidAdjustReason = document.getElementById('kid-adjust-reason');
  let kidPanelId = null;

  function openKidPanel(id) {
    kidPanelId = id;
    kidAdjustAmount.value = '';
    kidAdjustReason.value = '';
    renderKidPanel();
    kidOverlay.classList.remove('hidden');
  }

  function renderKidPanel() {
    const p = loadProfiles().find((x) => x.id === kidPanelId);
    if (!p) { kidOverlay.classList.add('hidden'); return; }
    document.getElementById('kid-title').textContent = p.name;
    document.getElementById('kid-balance').textContent = `🪙 ${getCoinBalance(p.id)} coins`;
    kidHelperToggle.checked = spellingHelperOn(p);
    document.getElementById('kid-autoread-toggle').checked = p.autoRead !== false;
    renderKidLearning(p);
    const history = loadCoinHistory(p.id).slice(0, 50);
    const historyEl = document.getElementById('kid-history');
    renderCoinHistory(historyEl, history, { withVoice: false });
    if (!history.length) historyEl.innerHTML = '<p class="parent-card-note">No coins yet.</p>';
  }

  document.getElementById('kid-autoread-toggle').addEventListener('change', (e) => {
    if (kidPanelId) updateProfile(kidPanelId, { autoRead: e.target.checked });
  });

  // Level picker + recent scores for each subject (Math, Reading), so parents can tell when
  // he's ready to move up.
  function renderKidLearning(p) {
    const box = document.getElementById('kid-learning');
    box.innerHTML = '';
    const progress = Learning.loadProgress(p.id);
    Object.values(Learning.SUBJECTS).forEach((subj) => {
      const wrap = document.createElement('div');
      wrap.className = 'kid-subject';
      const current = Learning.levelFor(p, subj.id);
      wrap.innerHTML = `<label class="kid-subject-row"><strong>${subj.emoji} ${escapeHtml(subj.label)} level</strong></label>`;
      const sel = document.createElement('select');
      sel.className = 'name-input small-input';
      subj.levels.forEach((lv) => {
        const o = document.createElement('option');
        o.value = lv.n;
        o.textContent = `${lv.n}. ${lv.name}`;
        if (lv.n === current) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', () => {
        Learning.setLevel(p.id, subj.id, Number(sel.value));
        renderKidPanel();
      });
      wrap.querySelector('.kid-subject-row').appendChild(sel);
      const lvInfo = subj.levels.find((l) => l.n === current);
      const recent = progress.filter((e) => e.subject === subj.id && e.area === 'practice' && e.level === current).slice(0, 5);
      const note = document.createElement('p');
      note.className = 'parent-card-note';
      note.textContent = (lvInfo ? `${lvInfo.note}. ` : '') + (recent.length
        ? `Last Practice scores at this level: ${recent.map((e) => `${e.correct}/${e.total}`).join(', ')}`
        : 'No Practice rounds at this level yet.');
      wrap.appendChild(note);
      box.appendChild(wrap);
    });
  }

  kidHelperToggle.addEventListener('change', () => {
    if (kidPanelId) updateProfile(kidPanelId, { spellingHelper: kidHelperToggle.checked });
  });

  function adjustKidCoins(sign) {
    const amount = Math.round(Number(kidAdjustAmount.value));
    if (!amount || amount < 1) { kidAdjustAmount.focus(); return; }
    const reason = kidAdjustReason.value.trim() || (sign > 0 ? 'Bonus from Mom or Dad' : 'Taken away by Mom or Dad');
    addCoinEntry(kidPanelId, { amount: sign * amount, source: 'parent', label: reason, emoji: sign > 0 ? '🎁' : '➖' });
    kidAdjustAmount.value = '';
    kidAdjustReason.value = '';
    renderKidPanel();
    renderParentKidList();
  }
  document.getElementById('kid-add-coins-btn').addEventListener('click', () => adjustKidCoins(1));
  document.getElementById('kid-remove-coins-btn').addEventListener('click', () => adjustKidCoins(-1));
  document.getElementById('kid-close-btn').addEventListener('click', () => {
    kidOverlay.classList.add('hidden');
    renderParentKidList();
  });
  document.getElementById('kid-remove-btn').addEventListener('click', () => {
    const p = loadProfiles().find((x) => x.id === kidPanelId);
    if (!p) return;
    if (!confirm(`Remove ${p.name} from your family?\n\nThis removes them on every iPad, and deletes ${p.name}'s coins and saved drawings on this device. It can't be undone.`)) return;
    deleteProfile(p.id);
    kidOverlay.classList.add('hidden');
    renderParentKidList();
  });

  async function renderParentStatus() {
    const items = [];
    items.push(isStandalone() ? '✅ Opened from the Home Screen' : (isAppleTouchDevice() ? '⚠️ Opened in Safari. Add it to the Home Screen so its data is kept safe.' : 'ℹ️ Opened in a browser tab'));
    let persisted = false;
    try { persisted = !!(navigator.storage && navigator.storage.persisted && await navigator.storage.persisted()); } catch (e) { /* not supported */ }
    items.push(persisted ? '✅ Storage protected from automatic clean-up' : 'ℹ️ Storage not marked as protected by this browser');
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage } = await navigator.storage.estimate();
        if (typeof usage === 'number') items.push(`💾 Using about ${(usage / 1048576).toFixed(1)} MB`);
      }
    } catch (e) { /* not supported */ }
    items.push(Voice.isAvailable() ? '✅ Read-aloud voice available' : '⚠️ This browser has no read-aloud voice');
    parentStatus.innerHTML = items.map((t) => `<li>${escapeHtml(t)}</li>`).join('');
  }

  // ---- Backup ----
  const BACKUP_REMIND_DAYS = 14;
  function renderBackupNote() {
    const note = document.getElementById('backup-note');
    const last = Backup.lastBackupAt();
    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
    const base = 'Saves everything on this iPad (kids, coins, chores, purchases, levels, drawings and the PIN) to one file. Keep it in iCloud Drive or AirDrop it to the computer.';
    let when;
    if (days === null) when = '⚠️ This iPad has never been backed up.';
    else if (days === 0) when = '✅ Last backup: today.';
    else if (days === 1) when = '✅ Last backup: yesterday.';
    else when = `${days >= BACKUP_REMIND_DAYS ? '⚠️' : '✅'} Last backup: ${days} days ago.`;
    note.innerHTML = `${escapeHtml(base)}<br><strong class="${days === null || days >= BACKUP_REMIND_DAYS ? 'warn-text' : ''}">${escapeHtml(when)}</strong>`;
  }

  document.getElementById('backup-save-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Preparing the backup...';
    try {
      const r = await Backup.save();
      if (r.result !== 'cancelled') {
        const size = r.bytes >= 1048576 ? `${(r.bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(r.bytes / 1024))} KB`;
        showToast(`✅ Backup saved (${r.drawings} drawing${r.drawings === 1 ? '' : 's'}, ${size})`, 3000);
      }
    } catch (err) {
      console.error('[Backup] failed:', err);
      alert(`The backup couldn't be made: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '💾 Back up this iPad';
      renderBackupNote();
    }
  });

  const backupFile = document.getElementById('backup-file');
  document.getElementById('backup-restore-btn').addEventListener('click', () => backupFile.click());
  backupFile.addEventListener('change', async () => {
    const file = backupFile.files && backupFile.files[0];
    backupFile.value = '';
    if (!file) return;
    let backup;
    try {
      backup = await Backup.read(file);
    } catch (err) {
      alert(err.message);
      return;
    }
    const when = new Date(backup.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    const kids = backup.kids && backup.kids.length ? backup.kids.join(', ') : 'no kids';
    const ok = confirm(`Restore the backup from ${when}?\n\nKids in it: ${kids}\nDrawings: ${backup.artworks.length}\n\nThis REPLACES everything on this iPad (kids, coins, chores, purchases, drawings and the PIN) with what's in the backup.`);
    if (!ok) return;
    try {
      await Backup.restore(backup);
      alert('Restored! The app will now restart.');
      location.reload();
    } catch (err) {
      console.error('[Backup] restore failed:', err);
      alert(`Restoring didn't work, and nothing was changed: ${err.message || err}`);
    }
  });

  function enterParentArea() {
    renderBackupNote();
    if (loadProfiles().length) welcomePending = false;
    document.getElementById('parent-welcome-card').classList.toggle('hidden', !welcomePending && loadProfiles().length > 0);
    KidRewards.renderParentQueues();
    renderParentKidList();
    renderParentCoinRules();
    renderParentStatus();
    document.getElementById('parent-photo-hub-card').classList.toggle('hidden', !canEditTemplates);
    showScreen('parent-screen');
  }

  function leaveParentArea() {
    if (getActiveProfile()) enterHome();
    else showProfileScreen();
  }

  document.getElementById('parent-back-btn').addEventListener('click', leaveParentArea);
  document.getElementById('parent-lock-btn').addEventListener('click', leaveParentArea);
  document.getElementById('open-photo-hub-btn').addEventListener('click', () => showScreen('photo-hub-screen'));
  document.getElementById('photo-hub-back-btn').addEventListener('click', () => enterParentArea());
  document.getElementById('photo-hub-coloring-btn').addEventListener('click', openTemplateEditorScreen);
  document.getElementById('photo-hub-stickers-btn').addEventListener('click', openStickerEditorScreen);
  document.getElementById('photo-hub-chores-btn').addEventListener('click', () => Setup.open('chores'));
  document.getElementById('photo-hub-store-btn').addEventListener('click', () => Setup.open('store'));
  document.getElementById('photo-hub-reading-btn').addEventListener('click', openReadingPicsEditorScreen);
  document.getElementById('photo-hub-memory-btn').addEventListener('click', openMemoryMatchEditorScreen);
  document.getElementById('test-voice-btn').addEventListener('click', () => Voice.speak('Hi! I will read things out loud.'));
  document.getElementById('check-updates-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Checking...';
    try {
      await Promise.all([refreshSharedData(), refreshKidsCache()]);
      renderParentCoinRules();
      renderParentStatus();
      renderParentKidList();
      showToast('✅ Up to date', 2200);
    } catch (err) {
      console.error('[App] could not refresh from Supabase:', err);
      showToast("Couldn't reach the server. Try again in a bit.", 2600);
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Check for updates';
    }
  });
  document.getElementById('open-setup-btn').addEventListener('click', () => Setup.open());
  // First time (no PIN yet): create one, then land in the grown-ups area with a nudge to add
  // the boy. After that: the PIN unlocks the grown-ups area.
  function openParentEntry() {
    if (hasParentPin()) openPinPad('unlock', enterParentArea);
    else openPinPad('create', () => { welcomePending = true; enterParentArea(); });
  }
  let welcomePending = false;
  document.getElementById('parent-entry-btn').addEventListener('click', openParentEntry);
  document.getElementById('first-run-btn').addEventListener('click', openParentEntry);
  document.getElementById('welcome-add-kid-btn').addEventListener('click', () => addProfileBtn.click());
  const changePin = () => openPinPad('change', () => showToast('🔑 PIN changed', 2200));
  document.getElementById('change-pin-btn').addEventListener('click', changePin);
  document.getElementById('header-change-pin-btn').addEventListener('click', changePin);

  // ---- PIN pad ----
  // Modes: 'unlock' (check the PIN), 'create' (first time: enter + confirm), 'change' (current,
  // then new + confirm).
  const pinOverlay = document.getElementById('pin-overlay');
  const pinTitle = document.getElementById('pin-title');
  const pinMessage = document.getElementById('pin-message');
  const pinDots = document.getElementById('pin-dots');
  const pinPad = document.getElementById('pin-pad');
  const pinForgotBtn = document.getElementById('pin-forgot-btn');
  let pinEntry = '';
  let pinStep = null; // 'check' | 'new' | 'confirm'
  let pinFirstNew = '';
  let pinOnSuccess = null;
  let pinBusy = false;

  for (let i = 0; i < PIN_LENGTH; i++) {
    const dot = document.createElement('span');
    dot.className = 'pin-dot';
    pinDots.appendChild(dot);
  }
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].forEach((key) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pin-key' + (key === '' ? ' blank' : '') + (key === '⌫' ? ' back' : '');
    b.textContent = key;
    if (key === '') b.disabled = true;
    b.addEventListener('click', () => pressPinKey(key));
    pinPad.appendChild(b);
  });

  function renderPinDots() {
    pinDots.querySelectorAll('.pin-dot').forEach((d, i) => d.classList.toggle('filled', i < pinEntry.length));
  }

  function setPinStep(step) {
    pinStep = step;
    pinEntry = '';
    renderPinDots();
    if (step === 'check') pinMessage.textContent = 'Enter the parent PIN';
    if (step === 'new') {
      pinMessage.textContent = pinOverlay.dataset.mode === 'create'
        ? `Choose a ${PIN_LENGTH}-digit PIN that only grown-ups know. You'll use it to approve chores, pay for store items and change settings.`
        : `Choose a new ${PIN_LENGTH}-digit PIN`;
    }
    if (step === 'confirm') pinMessage.textContent = 'Type it again to confirm';
    pinForgotBtn.classList.toggle('hidden', step !== 'check');
  }

  function openPinPad(mode, onSuccess) {
    pinOnSuccess = onSuccess;
    pinTitle.textContent = mode === 'create' ? 'Create a parent PIN' : mode === 'change' ? 'Change PIN' : 'Grown-ups only';
    pinOverlay.dataset.mode = mode;
    setPinStep(mode === 'create' ? 'new' : 'check');
    pinOverlay.classList.remove('hidden');
  }

  function closePinPad() {
    pinOverlay.classList.add('hidden');
    pinEntry = '';
    renderPinDots();
  }

  function shakePin(message) {
    pinMessage.textContent = message;
    pinDots.classList.remove('shake');
    void pinDots.offsetWidth;
    pinDots.classList.add('shake');
    pinEntry = '';
    setTimeout(renderPinDots, 250);
  }

  async function pressPinKey(key) {
    if (pinBusy) return;
    if (key === '⌫') { pinEntry = pinEntry.slice(0, -1); renderPinDots(); return; }
    if (pinEntry.length >= PIN_LENGTH) return;
    pinEntry += key;
    renderPinDots();
    if (pinEntry.length < PIN_LENGTH) return;

    pinBusy = true;
    try {
      const mode = pinOverlay.dataset.mode;
      if (pinStep === 'check') {
        if (await checkParentPin(pinEntry)) {
          if (mode === 'change') { setPinStep('new'); return; }
          closePinPad();
          pinOnSuccess && pinOnSuccess();
        } else {
          shakePin('That PIN is not right. Try again.');
        }
      } else if (pinStep === 'new') {
        pinFirstNew = pinEntry;
        setPinStep('confirm');
      } else if (pinStep === 'confirm') {
        if (pinEntry === pinFirstNew) {
          await setParentPin(pinEntry);
          closePinPad();
          pinOnSuccess && pinOnSuccess();
        } else {
          pinFirstNew = '';
          setPinStep('new');
          shakePin("Those didn't match. Choose a new PIN again.");
        }
      }
    } finally {
      pinBusy = false;
    }
  }

  document.getElementById('pin-close-btn').addEventListener('click', closePinPad);

  // ---- Forgot PIN: a multiplication question little kids can't answer yet ----
  const pinResetOverlay = document.getElementById('pin-reset-overlay');
  const pinResetQuestion = document.getElementById('pin-reset-question');
  const pinResetAnswer = document.getElementById('pin-reset-answer');
  let pinResetExpected = null;

  pinForgotBtn.addEventListener('click', () => {
    const a = 12 + Math.floor(Math.random() * 8);
    const b = 6 + Math.floor(Math.random() * 4);
    pinResetExpected = a * b;
    pinResetQuestion.textContent = `What is ${a} × ${b}?`;
    pinResetAnswer.value = '';
    closePinPad();
    pinResetOverlay.classList.remove('hidden');
    setTimeout(() => pinResetAnswer.focus(), 50);
  });
  document.getElementById('pin-reset-cancel-btn').addEventListener('click', () => pinResetOverlay.classList.add('hidden'));
  document.getElementById('pin-reset-ok-btn').addEventListener('click', () => {
    if (Number(pinResetAnswer.value.trim()) !== pinResetExpected) {
      pinResetAnswer.value = '';
      pinResetAnswer.placeholder = 'Not quite. Try again';
      return;
    }
    pinResetOverlay.classList.add('hidden');
    openPinPad('create', enterParentArea);
  });

  // ---- Offline support + keeping data safe ----
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[SW] registration failed:', err));
  }
  requestPersistentStorage();

  // Pieces the Setup screen (js/setup.js) borrows.
  async function connectProjectFolder() {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    await idbSet(ADMIN_ROOT_KEY, handle);
    return handle;
  }
  async function getStoredProjectFolder() {
    return idbGet(ADMIN_ROOT_KEY).catch(() => null);
  }
  window.AppBridge = {
    showScreen, enterParentArea, enterHome, escapeHtml, showToast, coinWords, celebrateCoins, renderParentKidList,
    getConnectedProjectRoot, connectProjectFolder, getStoredProjectFolder, renderSectionGrid,
  };

  renderPalette();
  // Re-render anything that lists kids whenever the Supabase-backed kids cache changes (first
  // load, a kid added/removed on another iPad and picked back up, or a sign-in/out).
  onKidsChanged(() => {
    renderSignin();
    renderParentKidList();
  });
  // Wait (briefly) for the newest settings and the family's kids so coin rules and the kid list
  // are current from the first tap. Also waits for every script on the page to finish loading
  // (DOMContentLoaded), since the home screen uses code from files loaded after this one.
  const pageLoaded = document.readyState === 'loading'
    ? new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }))
    : Promise.resolve();
  const dataReady = Promise.all([
    Promise.race([settingsReady, new Promise((r) => setTimeout(r, 2500))]),
    Promise.race([kidsReady, new Promise((r) => setTimeout(r, 2500))]),
  ]);
  Promise.all([pageLoaded, dataReady]).then(() => {
    renderSignin();
    // If the parent already tapped into the Grown-ups area (or anywhere else) while this was
    // still loading, don't yank them back to the sign-in screen once it resolves.
    const active = document.querySelector('.screen.active');
    if (active && active.id !== 'profile-screen') return;
    if (getActiveProfile()) {
      enterHome();
    } else {
      showProfileScreen();
    }
  });
})();
