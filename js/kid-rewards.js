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
  // isTouch() re-checks matchMedia on every call rather than caching it once -- a one-time
  // snapshot goes stale the moment a browser's device-emulation mode is toggled after the page
  // already loaded, since CSS media queries re-evaluate live but a frozen JS boolean doesn't
  // (same bug class home-overlay.js's Home Button Layout Tool hit first).
  function isTouch() { return window.matchMedia('(pointer: coarse)').matches; }
  // Position nudges (X/Y) are in %, not px -- CSS translate() percentages are relative to the
  // element's OWN box size (not the viewport), and every box here is already sized as a % of
  // the screen, so a % nudge lands in the same relative spot on any device/window width. But the
  // Chores screen's background art is a different shape on an iPad than on a computer window
  // (same reason the Home screen's background differs per device), so each value below has its
  // own computer/ipad pair -- picked by isTouch() -- instead of one shared number. headerTextCurve
  // is the #kz-chores-sign-arc path's curve, not a CSS var (see applyChoresLayout below), but
  // still gets its own per-device value for the same reason.
  const CHORES_LAYOUT_DEFAULTS = {
    computer: {
      headerX: 0, headerY: 0, headerScale: 61,
      headerTextX: 0, headerTextY: -5, headerTextCurve: 82, headerTextSize: 128,
      bannerX: 0, bannerY: -15, bannerScale: 78, bannerHeightScale: 196,
      avatarX: 1.5, avatarY: -25, avatarSize: 104,
      todayX: 0, todayY: -15.5, todaySize: 87,
      countX: 0.5, countY: -23, countSize: 105,
      pillsX: 0, pillsY: 0, pillsScale: 101, pillsExtendUp: 0, pillsExtendDown: 0,
    },
    ipad: {
      headerX: 0, headerY: 1, headerScale: 76,
      headerTextX: 0, headerTextY: -6, headerTextCurve: 80, headerTextSize: 133,
      bannerX: 0, bannerY: -2.5, bannerScale: 97, bannerHeightScale: 196,
      avatarX: 1, avatarY: -25, avatarSize: 104,
      todayX: -0.5, todayY: -14.5, todaySize: 87,
      countX: 0, countY: -23.5, countSize: 105,
      pillsX: 0, pillsY: 0, pillsScale: 99, pillsExtendUp: 0, pillsExtendDown: 0,
    },
  };
  function currentChoresDefaults() {
    return { ...(isTouch() ? CHORES_LAYOUT_DEFAULTS.ipad : CHORES_LAYOUT_DEFAULTS.computer) };
  }
  const CHORES_LAYOUT_SPEC = [
    ['headerX', 'cl-header-x', '%'], ['headerY', 'cl-header-y', '%'], ['headerScale', 'cl-header-scale', '%'],
    ['headerTextX', 'cl-header-text-x', '%'], ['headerTextY', 'cl-header-text-y', '%'],
    ['headerTextCurve', 'cl-header-text-curve', ''], ['headerTextSize', 'cl-header-text-size', '%'],
    ['bannerX', 'cl-banner-x', '%'], ['bannerY', 'cl-banner-y', '%'], ['bannerScale', 'cl-banner-scale', '%'],
    ['bannerHeightScale', 'cl-banner-height-scale', '%'],
    ['avatarX', 'cl-avatar-x', '%'], ['avatarY', 'cl-avatar-y', '%'], ['avatarSize', 'cl-avatar-size', '%'],
    ['todayX', 'cl-today-x', '%'], ['todayY', 'cl-today-y', '%'], ['todaySize', 'cl-today-size', '%'],
    ['countX', 'cl-count-x', '%'], ['countY', 'cl-count-y', '%'], ['countSize', 'cl-count-size', '%'],
    ['pillsX', 'cl-pills-x', '%'], ['pillsY', 'cl-pills-y', '%'], ['pillsScale', 'cl-pills-scale', '%'],
    ['pillsExtendUp', 'cl-pills-extend-up', '%'], ['pillsExtendDown', 'cl-pills-extend-down', '%'],
  ];
  // Maps a CHORES_LAYOUT_SPEC key (e.g. "headerX") to its CSS var base name (e.g. "header-x").
  function kzcBase(key) {
    return key.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
  // -ipad-suffixed variable name on touch devices, read only inside chores-redesign.css's
  // `@media (pointer: coarse)` block -- plain name otherwise. Same reasoning as home-overlay.js.
  function kzcVar(key) {
    return `--kzc-${kzcBase(key)}${isTouch() ? '-ipad' : ''}`;
  }

  function applyChoresLayout(layout) {
    const L = { ...currentChoresDefaults(), ...(layout || {}) };
    const root = document.documentElement.style;
    root.setProperty(kzcVar('headerX'), L.headerX + '%');
    root.setProperty(kzcVar('headerY'), L.headerY + '%');
    root.setProperty(kzcVar('headerScale'), L.headerScale / 100);
    root.setProperty(kzcVar('headerTextX'), L.headerTextX + '%');
    root.setProperty(kzcVar('headerTextY'), L.headerTextY + '%');
    root.setProperty(kzcVar('headerTextSize'), L.headerTextSize / 100);
    // The arc's curve ("slope") is the #kz-chores-sign-arc path's `d` attribute, not a CSS var --
    // SVG path geometry can't be driven by custom properties, so it's set directly here instead,
    // using the current device's own curve value (L.headerTextCurve already picked the right one).
    const arc = document.getElementById('kz-chores-sign-arc');
    if (arc) arc.setAttribute('d', `M 150 270 Q 500 ${270 - L.headerTextCurve} 850 270`);
    root.setProperty(kzcVar('bannerX'), L.bannerX + '%');
    root.setProperty(kzcVar('bannerY'), L.bannerY + '%');
    root.setProperty(kzcVar('bannerScale'), L.bannerScale / 100);
    root.setProperty(kzcVar('bannerHeightScale'), L.bannerHeightScale / 100);
    root.setProperty(kzcVar('avatarX'), L.avatarX + '%');
    root.setProperty(kzcVar('avatarY'), L.avatarY + '%');
    root.setProperty(kzcVar('avatarSize'), L.avatarSize / 100);
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
    CHORES_LAYOUT_SPEC.forEach(([key, id, unit]) => {
      const input = $(id);
      if (input) input.value = L[key];
      const out = $(id + '-val');
      if (out) out.textContent = L[key] + unit;
    });
    return L;
  }

  let choresLayoutState = { ...currentChoresDefaults(), ...(getData(CHORES_LAYOUT_LOCAL_KEY, null) || {}) };
  applyChoresLayout(choresLayoutState);

  CHORES_LAYOUT_SPEC.forEach(([key, id]) => {
    const input = $(id);
    if (!input) return;
    input.addEventListener('input', () => {
      choresLayoutState = { ...choresLayoutState, [key]: Number(input.value) };
      applyChoresLayout(choresLayoutState);
      setData(CHORES_LAYOUT_LOCAL_KEY, choresLayoutState); // draft only, so re-opening keeps your in-progress numbers
    });
  });

  $('chores-layout-open-btn').addEventListener('click', () => {
    applyChoresLayout(choresLayoutState);
    openChores();
    $('chores-layout-panel').classList.remove('hidden');
  });
  $('chores-layout-done-btn').addEventListener('click', () => {
    $('chores-layout-panel').classList.add('hidden');
    AppBridge.enterParentArea();
  });
  $('chores-layout-reset-btn').addEventListener('click', () => {
    choresLayoutState = currentChoresDefaults();
    applyChoresLayout(choresLayoutState);
    setData(CHORES_LAYOUT_LOCAL_KEY, choresLayoutState);
  });
  $('chores-layout-copy-btn').addEventListener('click', async () => {
    const L = choresLayoutState;
    const text = `:root {\n` +
      `  /* ${isTouch() ? 'iPad' : 'Computer'} values */\n` +
      `  ${kzcVar('headerX')}: ${L.headerX}%; ${kzcVar('headerY')}: ${L.headerY}%; ${kzcVar('headerScale')}: ${L.headerScale / 100};\n` +
      `  ${kzcVar('headerTextX')}: ${L.headerTextX}%; ${kzcVar('headerTextY')}: ${L.headerTextY}%; ${kzcVar('headerTextSize')}: ${L.headerTextSize / 100};\n` +
      `  /* also update index.html's <path id="kz-chores-sign-arc"> d attribute to: */\n` +
      `  /* d="M 150 270 Q 500 ${270 - L.headerTextCurve} 850 270" */\n` +
      `  ${kzcVar('bannerX')}: ${L.bannerX}%; ${kzcVar('bannerY')}: ${L.bannerY}%; ${kzcVar('bannerScale')}: ${L.bannerScale / 100}; ${kzcVar('bannerHeightScale')}: ${L.bannerHeightScale / 100};\n` +
      `  ${kzcVar('avatarX')}: ${L.avatarX}%; ${kzcVar('avatarY')}: ${L.avatarY}%; ${kzcVar('avatarSize')}: ${L.avatarSize / 100};\n` +
      `  ${kzcVar('todayX')}: ${L.todayX}%; ${kzcVar('todayY')}: ${L.todayY}%; ${kzcVar('todaySize')}: ${L.todaySize / 100};\n` +
      `  ${kzcVar('countX')}: ${L.countX}%; ${kzcVar('countY')}: ${L.countY}%; ${kzcVar('countSize')}: ${L.countSize / 100};\n` +
      `  ${kzcVar('pillsX')}: ${L.pillsX}%; ${kzcVar('pillsY')}: ${L.pillsY}%; ${kzcVar('pillsScale')}: ${L.pillsScale / 100};\n` +
      `  ${kzcVar('pillsExtendUp')}: ${L.pillsExtendUp}%; ${kzcVar('pillsExtendDown')}: ${L.pillsExtendDown}%;\n` +
      `}` +
      (isTouch() ? `\n/* paste the lines above inside chores-redesign.css's existing\n   @media (pointer: coarse) { ... } block, not at the top level */` : '');
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

  function openStore() {
    renderStore();
    AppBridge.showScreen('store-screen');
  }

  $('store-back-btn').addEventListener('click', () => AppBridge.enterHome());

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
    const items = getSettings().store;
    $('store-empty').classList.toggle('hidden', items.length > 0);
    const goal = getSavingsGoal(profile);
    items.forEach((item) => {
      const card = document.createElement('div');
      const canAfford = spendable >= item.price;
      const already = boughtWithinLimit(profile.id, item);
      const isGoal = goal && goal.itemId === item.id;
      card.className = 'store-card' + (canAfford && !already ? '' : ' cant') + (isGoal ? ' goal' : '');
      card.innerHTML = `${pictureHtml(item.picture, 'pic-xl')}
        <span class="store-card-name">${esc(item.name)}</span>
        <span class="store-card-price">🪙 ${item.price}</span>`;
      card.appendChild(Voice.button(`${item.name}. ${coins(item.price)}.`, 'corner'));

      const action = document.createElement('div');
      action.className = 'store-card-action';
      if (already) {
        action.innerHTML = `<span class="store-note">✓ Got it ${item.limit === 'day' ? 'today' : 'this week'}</span>`;
      } else if (canAfford) {
        const buy = document.createElement('button');
        buy.type = 'button';
        buy.className = 'buy-open-btn';
        buy.textContent = 'Buy';
        buy.addEventListener('click', () => openBuy(item));
        action.appendChild(buy);
      } else {
        const need = item.price - spendable;
        const note = document.createElement('span');
        note.className = 'store-note';
        note.textContent = `Need ${need} more`;
        action.appendChild(note);
        const star = document.createElement('button');
        star.type = 'button';
        star.className = 'goal-btn' + (isGoal ? ' on' : '');
        star.textContent = isGoal ? '⭐ My goal' : '☆ Save for this';
        star.addEventListener('click', () => {
          if (isGoal) {
            setSavingsGoal(profile.id, null);
            Voice.speak('Okay, no goal for now.');
          } else {
            setSavingsGoal(profile.id, item);
            Voice.speak(`Great! You are saving for ${item.name}. You need ${coins(need)} more.`);
          }
          renderStore();
        });
        action.appendChild(star);
      }
      card.appendChild(action);
      grid.appendChild(card);
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
    const goal = getSavingsGoal(profile);
    if (goal && goal.itemId === item.id) setSavingsGoal(profile.id, null);
    Voice.speak(`Yay! Mom or Dad will bring you ${item.name} soon.`);
    AppBridge.showToast(`🎉 Mom or Dad will bring: ${item.name}`, 2600);
    renderStore();
  });

  // ================= Savings goal on the home screen =================
  function renderHomeGoal(profile) {
    const el = $('home-goal');
    let goal = profile ? getSavingsGoal(profile) : null;
    if (goal && !goal.available) {
      // The item was taken out of the store -- quietly drop the goal.
      setSavingsGoal(profile.id, null);
      goal = null;
    }
    el.classList.toggle('hidden', !goal);
    if (!goal) { el.innerHTML = ''; return; }
    const have = Math.max(0, spendableCoins(profile.id));
    const pct = Math.min(100, Math.round((have / goal.price) * 100));
    const ready = have >= goal.price;
    el.classList.toggle('ready', ready);
    el.innerHTML = `${pictureHtml(goal.picture, 'pic-md')}
      <span class="home-goal-body">
        <span class="home-goal-label">${ready ? 'You can buy it! 🎉' : `Saving for ${esc(goal.name)}`}</span>
        <span class="coin-today-bar"><span style="width:${pct}%"></span></span>
      </span>
      <span class="home-goal-count">${Math.min(have, goal.price)} / ${goal.price}</span>`;
    el.appendChild(Voice.button(ready
      ? `You have enough coins for ${goal.name}! Go to the store to buy it.`
      : `You are saving for ${goal.name}. You have ${coins(Math.min(have, goal.price))} of ${goal.price}.`));
  }
  $('home-goal').addEventListener('click', () => openStore());

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

  return { openChores, openStore, renderHomeGoal, renderParentQueues, choresLeftToday };
})();
