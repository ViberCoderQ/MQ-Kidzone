// Reward Shop item pill -- vanilla port of the Cursor handoff's React RewardPill component
// (Claude/Kid Zone/Reward shop/Items Section/Item Pills/KidZone_RewardPill_Complete_Cursor_
// Handoff.zip). Every layer (photo, name, cost, progress bar, status button) is independently
// positioned via the --photo-x/-y/-w/... custom properties set on .kz-pill in store-items.css;
// resizing .kz-pill itself (its width %) scales every layer together because their font-sizes
// use cqw (container-query width, from .kz-pill's own container-type:inline-size) instead of vw.
const RewardPill = (() => {
  const ASSET_BASE = 'assets/store-items/';
  const ASSETS = {
    blankPill: ASSET_BASE + 'reward-pill-blank.png',
    closePill: ASSET_BASE + 'reward-pill-close.png',
    readyPill: ASSET_BASE + 'reward-pill-ready.png',
    photoFrame: ASSET_BASE + 'product-photo-frame.png',
    costBadge: ASSET_BASE + 'coin-cost-badge.png',
    giftIcon: ASSET_BASE + 'gift-icon.svg',
    checkIcon: ASSET_BASE + 'check-icon.svg',
  };
  // Pill background swaps with status: earning (default gold) -> close (orange, >=75%) ->
  // ready (green, enough coins) -- same three tiers the status button already used.
  const BACKGROUNDS = { earning: 'blankPill', close: 'closePill', ready: 'readyPill' };
  const LABELS = { earning: 'Keep Earning!', close: 'Getting Close!', ready: 'Ready to Buy!' };

  // Mirrors the handoff's calculateRewardProgress(): percent/status only, no reservation or
  // spending side effects -- purely what's shown on the pill.
  function progress(coinCost, childCoins, closeThreshold) {
    const cost = Math.max(0, Number(coinCost) || 0);
    const balance = Math.max(0, Number(childCoins) || 0);
    const remaining = Math.max(0, cost - balance);
    const percent = cost === 0 ? 100 : Math.min(100, (balance / cost) * 100);
    const threshold = closeThreshold == null ? 0.75 : closeThreshold;
    const status = percent >= 100 ? 'ready' : percent >= threshold * 100 ? 'close' : 'earning';
    return { cost, remaining, percent, status, progressCoins: Math.min(balance, cost) };
  }

  // item: a store settings entry { id, name, price, picture, limit }. childCoins: the kid's
  // current spendable balance. onSelect(item): called when the status button is tapped --
  // always, regardless of status, same as the handoff (the existing buy-confirm overlay already
  // handles "can't afford it" and "already bought today/this week").
  function render(item, childCoins, onSelect) {
    const { cost, remaining, percent, status, progressCoins } = progress(item.price, childCoins);
    const isReady = status === 'ready';

    const pill = document.createElement('div');
    pill.className = `kz-pill kz-pill--${status}`;

    pill.innerHTML = `
      <img class="kz-pill__background" src="${ASSETS[BACKGROUNDS[status]]}" alt="" draggable="false" />
      <div class="kz-pill__photo"></div>
      <img class="kz-pill__photo-frame" src="${ASSETS.photoFrame}" alt="" draggable="false" />
      <div class="kz-pill__description"></div>
      <div class="kz-pill__cost-badge" aria-hidden="true"><img src="${ASSETS.costBadge}" alt="" /></div>
      <div class="kz-pill__cost-text">${cost.toLocaleString()} Coins</div>
      <div class="kz-pill__divider" aria-hidden="true"></div>
      <div class="kz-pill__remaining">${remaining ? `${remaining.toLocaleString()} more coins needed!` : 'Enough coins!'}</div>
      <div class="kz-pill__progress" role="progressbar" aria-label="Coins earned toward reward" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">
        <div class="kz-pill__progress-fill" style="width:${percent}%"></div>
      </div>
      <div class="kz-pill__progress-count">${progressCoins.toLocaleString()} / ${cost.toLocaleString()} Coins</div>
      <button type="button" class="kz-pill__status" aria-label="${LABELS[status]} Open ${item.name || 'reward'}">
        <span class="kz-pill__status-background" aria-hidden="true"></span>
        <img class="kz-pill__status-icon" src="${isReady ? ASSETS.checkIcon : ASSETS.giftIcon}" alt="" />
        <span class="kz-pill__status-text">${LABELS[status]}</span>
      </button>`;

    pill.querySelector('.kz-pill__photo').innerHTML = pictureHtml(item.picture, 'kz-pill__photo-img');
    pill.querySelector('.kz-pill__description').textContent = item.name || '';
    pill.querySelector('.kz-pill__status').addEventListener('click', () => onSelect && onSelect(item));

    return pill;
  }

  // --description-font (store-items.css) is the MAXIMUM size, not a fixed one -- call this once
  // pillEl is attached to the live DOM (needs real layout to measure overflow). Shrinks the name
  // down from that max, in small steps, only as far as actually needed to stop it being clipped
  // or spilling past its box; short names stay at the full max size untouched.
  function fitDescription(pillEl) {
    const el = pillEl.querySelector('.kz-pill__description');
    if (!el) return;
    el.style.fontSize = ''; // drop any previous shrink, back to the CSS max, before measuring
    const maxPx = parseFloat(getComputedStyle(el).fontSize);
    if (!maxPx) return;
    const fits = () => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    if (fits()) return;
    const minPx = Math.max(6, maxPx * 0.35);
    const step = Math.max(0.5, maxPx * 0.06);
    let size = maxPx;
    while (size > minPx) {
      size -= step;
      el.style.fontSize = size + 'px';
      if (fits()) break;
    }
  }

  return { render, fitDescription };
})();
