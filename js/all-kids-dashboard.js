// All Kids Chores dashboard -- a parent-facing overview of every child's chores/coins for the
// day, opened from Home (see #all-kids-open in index.html/all-kids-dashboard.css). Cursor
// handoff, "Kid Zone Dashboard V3" (originally read-only except audio + Home nav), reformatted
// from the supplied minified JS into this codebase's usual style, then made interactive on top
// of that reformat -- see the lock/admin-mode section near the bottom, added later, not part of
// the original supply. Reuses the real app's own data functions throughout (loadProfiles,
// todaysChoresFor, choreEntryToday, spendableCoins, pictureHtml, markChoreDone,
// instantCompleteChore/unapproveChore, refreshKidsCache/refreshSharedData/refreshRewardsData/
// refreshCoinLedger) rather than re-deriving any of it -- no duplicate business logic.
(() => {
  const screen = document.getElementById('all-kids-screen');
  const stage = screen.querySelector('.stage');
  const panels = screen.querySelector('.panels');
  const message = screen.querySelector('.dashboard-message');
  const lockBtn = document.getElementById('all-kids-lock');
  const adminBanner = document.getElementById('all-kids-admin-banner');

  // Admin mode: unlocked with the same parent PIN as everywhere else, for as long as a parent is
  // actually on this screen watching kids do their morning routine -- auto-relocks the moment
  // they leave (tap Home), never persists across a visit, so a kid can't stumble onto it still
  // unlocked later in the day. Locked (default): tapping a chore works exactly like the kid's own
  // Chores screen -- marks it waiting for a grown-up, nothing more; tapping an already-logged
  // chore is a no-op there too, same as that screen. Unlocked: tapping a chore marks/unmarks it
  // completed directly (instantCompleteChore/unapproveChore, js/rewards-data.js), for a parent
  // standing right there confirming it happened in real time instead of waiting to approve it
  // later from the usual queue.
  let unlocked = false;
  function setUnlocked(value) {
    unlocked = value;
    lockBtn.textContent = unlocked ? '🔓' : '🔒';
    lockBtn.classList.toggle('unlocked', unlocked);
    lockBtn.setAttribute('aria-label', unlocked ? 'Lock -- stop marking chores complete yourself' : 'Unlock to mark chores complete yourself');
    adminBanner.classList.toggle('hidden', !unlocked);
  }
  lockBtn.onclick = () => {
    if (unlocked) { setUnlocked(false); return; }
    const explain = "Unlock to mark chores complete yourself while you watch your kids finish their morning routine (brushing teeth, getting dressed, etc). "
      + "While unlocked, tapping a chore here marks it done right away instead of waiting for you to approve it later -- tap a done one again to undo a mis-tap. "
      + "Locks again automatically when you leave this screen.";
    if (hasParentPin()) AppBridge.openPinPad('unlock', () => setUnlocked(true), explain);
    else AppBridge.openPinPad('create', () => setUnlocked(true));
  };

  // Each kid's panel gets a colored edge -- the admin-chosen dashboardColor (js/profiles.js) if
  // set, else a per-name fallback for this family's actual three kids, else just cycling through
  // the first three palette colors by position so a panel is never left uncolored.
  const PALETTE = {
    blue: '#0099e9', orange: '#f58b1b', green: '#12bd79', red: '#e03741',
    purple: '#974cda', pink: '#e75ba3', gold: '#dba51e', silver: '#919fb1',
  };
  const NAME_COLOR_FALLBACK = { keaton: 'blue', finn: 'orange', jaxon: 'green' };
  const POSITION_COLOR_FALLBACK = ['blue', 'orange', 'green'];

  // Tiny element-builder, same shape as this file's other one-liners: tag + class + optional
  // text content, nothing fancier needed since every element here gets its real content/children
  // appended right after creation anyway.
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function active() { return screen.classList.contains('active'); }

  // Picks the iPad layout both when actually on a real iPad (html.is-ipad, same signal every
  // other screen in this app uses) and when the window itself is narrow/square (aspect ratio
  // under 1.5) -- e.g. a computer window that's been resized down -- so the dashboard still reads
  // fine there even though it isn't a real iPad.
  function layout() {
    const wantIpad = document.documentElement.classList.contains('is-ipad') || (innerWidth / innerHeight) < 1.5;
    stage.className = 'stage ' + (wantIpad ? 'ipad' : 'desktop');
  }

  function render() {
    layout();
    panels.replaceChildren();
    // dashboard_visible defaults to true in Supabase, but !== false (not === true) is the real
    // guard -- a kid created before this column existed, or any other edge case that leaves it
    // undefined, should still show up rather than silently vanish from the dashboard.
    const kids = loadProfiles().filter((p) => p.dashboardVisible !== false);
    panels.style.setProperty('--columns', Math.max(1, Math.min(3, kids.length)));
    panels.classList.toggle('many', kids.length > 3);
    if (!kids.length) {
      panels.append(el('p', 'empty-dashboard', 'No children available.'));
      return;
    }

    kids.forEach((p, i) => {
      const color = Object.hasOwn(PALETTE, p.dashboardColor)
        ? p.dashboardColor
        : (NAME_COLOR_FALLBACK[p.name.toLowerCase()] || POSITION_COLOR_FALLBACK[i % 3]);
      const chores = todaysChoresFor(p);
      const done = chores.filter((c) => choreEntryToday(p.id, c.id)?.status === 'approved').length;

      const panel = el('section', 'panel');
      panel.style.setProperty('--edge', PALETTE[color]);

      const profile = el('div', 'profile');
      const avatar = el(p.photoUrl ? 'img' : 'span', 'avatar' + (p.photoUrl ? '' : ' initial'), p.photoUrl ? undefined : p.name.charAt(0).toUpperCase());
      if (p.photoUrl) { avatar.src = p.photoUrl; avatar.alt = p.name; }
      const info = el('div', '');
      info.append(
        el('div', 'name', p.name),
        el('div', 'balance', `${spendableCoins(p.id)} Coins`),
        el('div', 'count', `${done} of ${chores.length} Chores Finished!`),
      );
      const meter = el('div', 'meter');
      const fill = el('div', 'fill');
      fill.style.width = (chores.length ? 100 * done / chores.length : 0) + '%';
      meter.append(fill);
      info.append(meter);
      profile.append(avatar, info);
      panel.append(profile);

      const rows = el('div', 'rows');
      if (!chores.length) rows.append(el('p', 'empty-dashboard', 'No chores today!'));
      chores.forEach((c) => {
        const state = choreEntryToday(p.id, c.id)?.status || '';
        const row = el('div', 'chore ' + (state === 'approved' || state === 'waiting' ? state : ''));

        const picWrap = el('div', '');
        picWrap.innerHTML = pictureHtml(c.picture, '');
        row.append(picWrap.firstElementChild, el('span', '', c.name));

        const audio = el('button', 'audio');
        audio.type = 'button';
        audio.setAttribute('aria-label', 'Read ' + c.name);
        const icon = el('img', '');
        icon.src = 'assets/dashboard/audio-button.png';
        icon.alt = '';
        audio.append(icon);
        // stopPropagation: audio is a child of row, which has its own click handler below --
        // without this, tapping the audio icon would also trigger row's chore-state tap.
        audio.onclick = (e) => { e.stopPropagation(); Voice.speak(`${c.name}. ${AppBridge.coinWords(c.coins)}.`); };
        row.append(audio, el('span', 'coin', c.coins));

        const status = el('span', 'status', state === 'approved' ? '✓' : state === 'waiting' ? '…' : '');
        status.setAttribute('aria-label', state === 'approved' ? 'Completed' : state === 'waiting' ? 'Pending' : 'To Do');
        status.title = status.getAttribute('aria-label');
        row.append(status);

        // Locked: same as the kid's own Chores screen -- tapping an undone chore marks it waiting
        // for a grown-up; tapping an already-logged one (waiting or approved) does nothing, since
        // that screen's own buttons disappear the same way once logged. Unlocked: tapping marks/
        // unmarks it completed directly, for a parent watching it happen right now. Re-render
        // immediately after -- these functions already update the local cache synchronously, same
        // as the normal Chores screen does, so there's no need to wait on the Supabase round-trip
        // (which still happens, just in the background) before reflecting the change visually.
        row.addEventListener('click', () => {
          if (unlocked) {
            const entry = choreEntryToday(p.id, c.id);
            if (entry && entry.status === 'approved') unapproveChore(p.id, entry.id);
            else instantCompleteChore(p.id, c);
          } else if (!choreEntryToday(p.id, c.id)) {
            markChoreDone(p.id, c);
          }
          render();
        });

        rows.append(row);
      });
      panel.append(rows);
      panels.append(panel);
    });
  }

  // Guards against overlapping refreshes (e.g. the 60s timer firing again before a slow previous
  // one finished) and against updating a screen that isn't showing anymore, or belongs to a family
  // that was signed out of mid-request.
  let busy = false;
  async function refresh() {
    if (busy || !active()) return;
    busy = true;
    const family = ParentAuth.getFamilyId();
    try {
      if (!family) { AppBridge.enterHome(); return; }
      message.textContent = 'Refreshing…';
      await Promise.all([refreshKidsCache(), refreshSharedData(), refreshRewardsData(), refreshCoinLedger()]);
      if (active() && family === ParentAuth.getFamilyId()) {
        render();
        message.textContent = '';
      }
    } catch (err) {
      if (active()) message.textContent = 'Could not refresh. Reopen dashboard to retry.';
    } finally {
      busy = false;
    }
  }

  document.getElementById('all-kids-open').onclick = () => {
    if (!ParentAuth.getFamilyId()) return;
    setUnlocked(false); // always start a fresh visit locked, regardless of how the last one ended
    AppBridge.showScreen('all-kids-screen');
    render();
    refresh();
  };
  screen.querySelector('.home').onclick = () => {
    setUnlocked(false); // belt-and-suspenders -- the open handler above resets it too either way
    AppBridge.enterHome();
  };

  window.addEventListener('resize', () => { if (active()) layout(); });
  // Keeps the dashboard live while a parent is actually looking at it -- picks up another kid's
  // chore getting approved, a coin spend, etc. without needing to close and reopen the screen.
  setInterval(() => { if (active() && !document.hidden) refresh(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && active()) refresh(); });

  setUnlocked(false); // establishes the locked icon/aria-label/banner state at load, belt-and-suspenders with the static HTML
})();
