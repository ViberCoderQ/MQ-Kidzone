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

  function renderChores() {
    const profile = me();
    if (!profile) return;
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
          <span class="chore-card-coins">🪙 ${chore.coins}</span>
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
