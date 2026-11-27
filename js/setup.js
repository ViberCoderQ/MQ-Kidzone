// Setup: chores, store items and coin rules. Works from any device -- changes (including new
// photos) save straight to Supabase, no project folder needed.
const Setup = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => AppBridge.escapeHtml(String(s == null ? '' : s));

  const EMOJI_GROUPS = [
    { name: 'Chores', items: ['🪥', '🛏️', '🧸', '🍽️', '🧺', '👕', '🧦', '👟', '🧹', '🧽', '🗑️', '♻️', '🐶', '🐱', '🐟', '🌱', '🚿', '🛁', '📚', '🎒', '🥦', '🥛', '🙏', '🤝', '🚗', '🍂', '💧', '🪴', '🧴', '🍳'] },
    { name: 'Rewards', items: ['🍦', '🍭', '🍪', '🧁', '🍕', '🍔', '🍿', '🎮', '📺', '🎬', '📱', '🎁', '⚽', '🏈', '🏀', '🛝', '🏊', '🎨', '🖍️', '🦖', '🚂', '🎟️', '🌙', '⭐', '🏆', '🦁', '🐉', '🎳', '🛹', '🧩'] },
  ];
  // Shown Monday first; stored as JavaScript day numbers (Sunday = 0).
  const DAYS = [
    { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
    { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
  ];
  // The 8 Reward Shop category pills (store-intro.css's .store-pill-<color>), in on-screen order
  // (left cabinet top-to-bottom, then right cabinet top-to-bottom) -- swatches match the pill art.
  const PILL_SLOTS = [
    { color: 'blue', label: 'Blue — left shelf 1', swatch: '#1455e0' },
    { color: 'cyan', label: 'Cyan — left shelf 2', swatch: '#36b7ef' },
    { color: 'gold', label: 'Gold — left shelf 3', swatch: '#f3b61d' },
    { color: 'green', label: 'Green — left shelf 4', swatch: '#36b24a' },
    { color: 'pink', label: 'Pink — right shelf 1', swatch: '#e8187f' },
    { color: 'orange', label: 'Orange — right shelf 2', swatch: '#f3821d' },
    { color: 'purple', label: 'Purple — right shelf 3', swatch: '#8a2fd6' },
    { color: 'red', label: 'Red — right shelf 4', swatch: '#e21f2b' },
  ];
  // Fixed list for now -- no free text, no admin-added images (that's future work, once the
  // admin has real category icon art to go with each name).
  const CATEGORY_OPTIONS = ['Toys', 'Games', 'Books', 'Adventures', 'Music', 'Art and Crafts', 'Sports', 'Sweets', 'Special Rewards', 'Clothes', 'Science'];
  // Mirrors js/kid-rewards.js's CATEGORY_ICONS -- shown here as a small preview next to each
  // row's dropdown so the grown-up can see what the kid will see, since a native <select> can't
  // show images inside its own <option>s.
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

  const pendingPhotos = new Map(); // preview object URL -> { blob, fileName }
  let editing = null; // { kind: 'chores'|'store', item, isNew, original }
  let editPicture = null;
  let coinSaveTimer = null;

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'item';
  }

  function setStatus(text, kind) {
    const el = $('setup-status');
    el.textContent = text;
    el.dataset.kind = kind || '';
  }

  // ---------- open / close ----------
  async function open(startTab) {
    pendingPhotos.clear();
    setStatus('');
    showTab(startTab || 'chores');
    renderAll();
    AppBridge.showScreen('setup-screen');
  }

  $('setup-back-btn').addEventListener('click', () => AppBridge.enterParentArea());

  // ---------- tabs ----------
  function showTab(tab) {
    document.querySelectorAll('.setup-tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.setup-panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  }
  document.querySelectorAll('.setup-tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  function renderAll() {
    renderChores();
    renderStore();
    renderCategories();
    renderCoins();
    renderDashboardVisibility();
  }

  // ---------- All Kids Chores dashboard: who shows up ----------
  // Same immediate-save-on-change, no separate Done button, pattern as renderCategories() below --
  // one control per row, nothing to batch into a single submit. dashboardVisible defaults to true
  // (Supabase column default), so a kid with it unset still shows as checked here.
  function renderDashboardVisibility() {
    const box = $('setup-dashboard-list');
    box.innerHTML = '';
    const kids = loadProfiles();
    if (!kids.length) {
      box.innerHTML = '<p class="parent-card-note">No kids yet -- add one from the Grown-ups screen first.</p>';
      return;
    }
    kids.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'setup-row';
      row.innerHTML = `<span class="setup-row-text"><span class="setup-row-name">${esc(p.name)}</span></span>
        <input type="checkbox" class="switch" ${p.dashboardVisible !== false ? 'checked' : ''} aria-label="Show ${esc(p.name)} on the dashboard" />`;
      row.querySelector('input').addEventListener('change', async (e) => {
        const checked = e.target.checked;
        setStatus('Saving...');
        try {
          const familyId = ParentAuth.getFamilyId();
          const { error } = await supabaseClient.from('kids')
            .update({ dashboard_visible: checked }).eq('id', p.id).eq('family_id', familyId);
          if (error) throw error;
          p.dashboardVisible = checked;
          setStatus('✅ Saved', 'ok');
        } catch (err) {
          console.error('[Setup] could not save dashboard visibility:', err);
          e.target.checked = !checked; // roll back the toggle to match what's actually saved
          setStatus('Could not save -- check your connection', 'error');
        }
      });
      box.appendChild(row);
    });
  }

  // ---------- reward shop categories ----------
  // Each category can only be assigned to one pill at a time -- picking it in one <select>
  // disables that <option> in the other 7 until it's freed up again (changed back to "Not set"
  // or reassigned). Saves immediately on change, no separate Done button (there's only one
  // control per row, unlike the chore/store item editor).
  function renderCategories() {
    const box = $('setup-categories-list');
    box.innerHTML = '';
    const assigned = getSettings().storePillCategories || {};
    PILL_SLOTS.forEach(({ color, label, swatch }) => {
      const row = document.createElement('div');
      row.className = 'setup-row';
      const current = assigned[color] || '';
      const usedElsewhere = new Set(
        PILL_SLOTS.filter((s) => s.color !== color).map((s) => assigned[s.color]).filter(Boolean)
      );
      const options = ['<option value="">— Not set —</option>']
        .concat(CATEGORY_OPTIONS.map((name) => {
          const disabled = usedElsewhere.has(name) && name !== current;
          return `<option value="${esc(name)}"${name === current ? ' selected' : ''}${disabled ? ' disabled' : ''}>${esc(name)}</option>`;
        }));
      const iconUrl = CATEGORY_ICONS[current] || '';
      row.innerHTML = `<span class="setup-category-swatch" style="background:${swatch}"></span>
        <span class="setup-category-icon-preview" style="${iconUrl ? `background-image:url('${iconUrl}')` : ''}"></span>
        <span class="setup-row-text"><span class="setup-row-name">${esc(label)}</span></span>
        <select class="name-input small-input setup-category-select">${options.join('')}</select>`;
      row.querySelector('select').addEventListener('change', async (e) => {
        const next = { ...getSettings().storePillCategories, [color]: e.target.value || undefined };
        if (!e.target.value) delete next[color];
        const preview = row.querySelector('.setup-category-icon-preview');
        preview.style.backgroundImage = CATEGORY_ICONS[e.target.value] ? `url('${CATEGORY_ICONS[e.target.value]}')` : '';
        setStatus('Saving...');
        try {
          await saveStorePillCategories(next);
          setStatus('✅ Saved', 'ok');
        } catch (err) {
          console.error('[Setup] could not save reward shop categories:', err);
          setStatus('Could not save -- check your connection', 'error');
        }
        renderCategories();
      });
      box.appendChild(row);
    });
  }

  // ---------- chores + store lists ----------
  function whoText(chore) {
    if (!chore.kids || !chore.kids.length) return 'Everyone';
    const names = chore.kids.map((id) => {
      const k = loadProfiles().find((p) => p.id === id);
      return k ? k.name : null;
    }).filter(Boolean);
    return names.length ? names.join(', ') : 'Everyone';
  }
  function daysText(chore) {
    if (!chore.days || !chore.days.length || chore.days.length === 7) return 'Every day';
    return DAYS.filter((d) => chore.days.includes(d.n)).map((d) => d.label).join(', ');
  }
  function limitText(item) {
    return item.limit === 'day' ? 'Once a day' : item.limit === 'week' ? 'Once a week' : 'Any time';
  }

  function renderList(container, items, describe, kind) {
    container.innerHTML = '';
    if (!items.length) {
      container.innerHTML = '<p class="parent-card-note">Nothing here yet.</p>';
      return;
    }
    items.forEach((item) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'setup-row';
      row.innerHTML = `${pictureHtml(item.picture, 'pic-md')}<span class="setup-row-text"><span class="setup-row-name">${esc(item.name)}</span><span class="setup-row-meta">${esc(describe(item))}</span></span><span class="setup-row-coins">🪙 ${kind === 'chores' ? item.coins : item.price}</span><span class="parent-kid-more">›</span>`;
      row.addEventListener('click', () => openEditor(kind, item));
      container.appendChild(row);
    });
  }

  function renderChores() {
    renderList($('setup-chore-list'), getSettings().chores, (c) => `${whoText(c)} · ${daysText(c)}`, 'chores');
  }
  function renderStore() {
    renderList($('setup-store-list'), getSettings().store, (i) => limitText(i), 'store');
  }

  $('setup-add-chore-btn').addEventListener('click', () => openEditor('chores', null));
  $('setup-add-store-btn').addEventListener('click', () => openEditor('store', null));

  // ---------- item editor ----------
  function openEditor(kind, item) {
    const isNew = !item;
    const base = item ? clone(item) : (kind === 'chores'
      ? { name: '', picture: { type: 'emoji', value: '⭐' }, coins: 2, kids: [], days: [] }
      : { name: '', picture: { type: 'emoji', value: '🎁' }, price: 20, limit: null, category: null });
    editing = { kind, item: base, original: item, isNew };
    editPicture = base.picture;

    $('setup-item-title').textContent = `${isNew ? 'New' : 'Edit'} ${kind === 'chores' ? 'chore' : 'store item'}`;
    $('setup-item-name').value = base.name;
    $('setup-item-name').placeholder = kind === 'chores' ? 'e.g. Brush teeth' : 'e.g. Ice cream';
    $('setup-item-amount-label').textContent = kind === 'chores' ? 'Coins earned' : 'Price in coins';
    $('setup-item-amount').value = kind === 'chores' ? base.coins : base.price;
    $('setup-item-kids-field').classList.toggle('hidden', kind !== 'chores');
    $('setup-item-days-field').classList.toggle('hidden', kind !== 'chores');
    $('setup-item-limit-field').classList.toggle('hidden', kind !== 'store');
    $('setup-item-limit').value = base.limit || '';
    $('setup-item-category-field').classList.toggle('hidden', kind !== 'store');
    if (kind === 'store') renderCategoryOptions(base.category);
    $('setup-item-delete-btn').classList.toggle('hidden', isNew);
    if (kind === 'chores') { renderKidChips(); renderDayChips(); }
    renderPicturePicker();
    $('setup-item-overlay').classList.remove('hidden');
    setTimeout(() => $('setup-item-name').focus(), 50);
  }

  function renderPicturePicker() {
    $('setup-pic-preview').innerHTML = pictureHtml(editPicture, 'pic-lg');
    const grid = $('setup-emoji-grid');
    grid.innerHTML = '';
    EMOJI_GROUPS.forEach((g) => {
      const h = document.createElement('div');
      h.className = 'setup-emoji-heading';
      h.textContent = g.name;
      grid.appendChild(h);
      g.items.forEach((e) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'setup-emoji' + (editPicture && editPicture.type === 'emoji' && editPicture.value === e ? ' selected' : '');
        b.textContent = e;
        b.addEventListener('click', () => { editPicture = { type: 'emoji', value: e }; renderPicturePicker(); });
        grid.appendChild(b);
      });
    });
  }

  // Options are only the categories currently assigned to one of the 8 shop pills (Reward Shop
  // tab above) -- never the full fixed 11, so an item can't be filed under a category no pill
  // actually shows right now and go invisible. `current` is the item's own saved category (may
  // not be assigned to a pill anymore, e.g. if a grown-up reassigned pills after the fact) -- kept
  // as a selected-but-otherwise-ordinary option so opening the editor again doesn't silently
  // blank it out.
  function renderCategoryOptions(current) {
    const assigned = getSettings().storePillCategories || {};
    const active = [...new Set(Object.values(assigned).filter(Boolean))];
    if (current && !active.includes(current)) active.push(current);
    const options = ['<option value="">— Not set —</option>']
      .concat(active.map((name) => `<option value="${esc(name)}"${name === current ? ' selected' : ''}>${esc(name)}</option>`));
    $('setup-item-category').innerHTML = options.join('');
  }

  // Kid-targeting uses each kid's real (Supabase) id now, not their name -- real ids can't
  // collide or go stale the way matching by typed name could.
  function renderKidChips() {
    const box = $('setup-item-kids');
    box.innerHTML = '';
    const chosen = editing.item.kids || [];
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'setup-chip' + (chosen.length === 0 ? ' on' : '');
    all.textContent = 'Everyone';
    all.addEventListener('click', () => { editing.item.kids = []; renderKidChips(); });
    box.appendChild(all);
    const kids = loadProfiles();
    kids.forEach((k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'setup-chip' + (chosen.includes(k.id) ? ' on' : '');
      b.textContent = k.name;
      b.addEventListener('click', () => {
        const list = editing.item.kids || [];
        editing.item.kids = list.includes(k.id) ? list.filter((id) => id !== k.id) : [...list, k.id];
        if (editing.item.kids.length === kids.length) editing.item.kids = []; // all of them = Everyone
        renderKidChips();
      });
      box.appendChild(b);
    });
    if (!kids.length) {
      const note = document.createElement('span');
      note.className = 'parent-card-note';
      note.textContent = 'Add a kid in the Grown-ups area first to target a specific kid.';
      box.appendChild(note);
    }
  }

  function renderDayChips() {
    const box = $('setup-item-days');
    box.innerHTML = '';
    const chosen = editing.item.days || [];
    const every = document.createElement('button');
    every.type = 'button';
    every.className = 'setup-chip' + (chosen.length === 0 ? ' on' : '');
    every.textContent = 'Every day';
    every.addEventListener('click', () => { editing.item.days = []; renderDayChips(); });
    box.appendChild(every);
    DAYS.forEach((d) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'setup-chip' + (chosen.includes(d.n) ? ' on' : '');
      b.textContent = d.label;
      b.addEventListener('click', () => {
        const list = editing.item.days || [];
        editing.item.days = list.includes(d.n) ? list.filter((n) => n !== d.n) : [...list, d.n];
        if (editing.item.days.length === 7) editing.item.days = [];
        renderDayChips();
      });
      box.appendChild(b);
    });
  }

  // Lets the uploaded picture get swapped in once the grown-up positions/zooms it in whichever
  // crop dialog matched the item kind (Chore Picture or Store Item Picture, below). Same
  // pendingPhotos/editPicture bookkeeping either way, so the rest of the editor (Done/Cancel,
  // persistPendingPhoto) doesn't need to know which dialog ran.
  function adoptPicture(blob) {
    const fileName = `${slugify($('setup-item-name').value || 'picture')}-${Date.now()}.jpg`;
    const previewUrl = URL.createObjectURL(blob);
    pendingPhotos.set(previewUrl, { blob, fileName });
    editPicture = { type: 'image', src: previewUrl };
    renderPicturePicker();
  }

  $('setup-pic-upload-btn').addEventListener('click', () => $('setup-pic-upload').click());
  $('setup-pic-upload').addEventListener('change', () => {
    const input = $('setup-pic-upload');
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    // Chores get the box matching .chore-card > .pic's real shape; store items get the box
    // matching .kz-pill__photo's real shape (see openStorePicCropper below) -- either way, an
    // interactive crop dialog, never the old blind auto-crop.
    const opener = editing && editing.kind === 'chores' ? openChorePicCropper : openStorePicCropper;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); opener(img); };
    img.onerror = () => { URL.revokeObjectURL(url); alert("That picture couldn't be opened. Try a JPG or PNG photo."); };
    img.src = url;
  });

  // ---- Chore Picture crop dialog: same pan/zoom-inside-a-shaped-box interaction as js/app.js's
  // Child Photo crop dialog, just producing a pendingPhotos blob (via adoptPicture) instead of
  // uploading straight to a kid's profile -- the chore item itself isn't saved until Setup's own
  // Done button, same as every other picture choice here. ----
  let choreCropState = null;
  const choreCropPointers = new Map();
  let choreCropPinchStartDist = 0;
  let choreCropPinchStartScale = 1;
  const choreCropDialog = $('chore-pic-crop-dialog');
  const choreCropViewport = $('chore-pic-crop-viewport');
  const choreCropImg = $('chore-pic-crop-img');
  const choreCropBox = $('chore-pic-crop-box');
  const choreCropZoomInput = $('chore-pic-crop-zoom');

  function openChorePicCropper(img) {
    choreCropImg.src = img.src;
    choreCropDialog.classList.remove('hidden');
    requestAnimationFrame(() => {
      const vpRect = choreCropViewport.getBoundingClientRect();
      const boxRect = choreCropBox.getBoundingClientRect();
      const boxLeft = boxRect.left - vpRect.left;
      const boxTop = boxRect.top - vpRect.top;
      const coverScale = Math.max(boxRect.width / img.naturalWidth, boxRect.height / img.naturalHeight);
      const containScale = Math.min(boxRect.width / img.naturalWidth, boxRect.height / img.naturalHeight);
      const minScale = containScale * 0.5;
      choreCropState = {
        naturalW: img.naturalWidth, naturalH: img.naturalHeight,
        boxLeft, boxTop, boxW: boxRect.width, boxH: boxRect.height,
        minScale, maxScale: coverScale * 4, scale: coverScale,
      };
      choreCropState.offsetX = boxLeft + boxRect.width / 2 - (img.naturalWidth * coverScale) / 2;
      choreCropState.offsetY = boxTop + boxRect.height / 2 - (img.naturalHeight * coverScale) / 2;
      choreClampCropOffset();
      choreCropZoomInput.value = Math.round(((coverScale - minScale) / (choreCropState.maxScale - minScale)) * 100);
      choreRenderCropImage();
    });
  }

  function choreClampCropOffset() {
    const s = choreCropState;
    const dispW = s.naturalW * s.scale;
    const dispH = s.naturalH * s.scale;
    s.offsetX = dispW >= s.boxW
      ? Math.min(s.boxLeft, Math.max(s.boxLeft + s.boxW - dispW, s.offsetX))
      : s.boxLeft + (s.boxW - dispW) / 2;
    s.offsetY = dispH >= s.boxH
      ? Math.min(s.boxTop, Math.max(s.boxTop + s.boxH - dispH, s.offsetY))
      : s.boxTop + (s.boxH - dispH) / 2;
  }

  function choreRenderCropImage() {
    const s = choreCropState;
    choreCropImg.style.width = `${s.naturalW * s.scale}px`;
    choreCropImg.style.height = `${s.naturalH * s.scale}px`;
    choreCropImg.style.transform = `translate(${s.offsetX}px, ${s.offsetY}px)`;
  }

  function choreApplyCropZoom(newScaleRaw, anchorX, anchorY) {
    const s = choreCropState;
    const newScale = Math.min(s.maxScale, Math.max(s.minScale, newScaleRaw));
    const imgX = (anchorX - s.offsetX) / s.scale;
    const imgY = (anchorY - s.offsetY) / s.scale;
    s.scale = newScale;
    s.offsetX = anchorX - imgX * newScale;
    s.offsetY = anchorY - imgY * newScale;
    choreClampCropOffset();
    choreRenderCropImage();
    choreCropZoomInput.value = Math.round(((s.scale - s.minScale) / (s.maxScale - s.minScale || 1)) * 100);
  }

  choreCropZoomInput.addEventListener('input', (e) => {
    if (!choreCropState) return;
    const s = choreCropState;
    const t = Number(e.target.value) / 100;
    choreApplyCropZoom(s.minScale + t * (s.maxScale - s.minScale), s.boxLeft + s.boxW / 2, s.boxTop + s.boxH / 2);
  });

  function choreCropPoint(e) {
    const r = choreCropViewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  choreCropViewport.addEventListener('pointerdown', (e) => {
    if (!choreCropState) return;
    try { choreCropViewport.setPointerCapture(e.pointerId); } catch { /* pointer already gone -- harmless */ }
    choreCropPointers.set(e.pointerId, choreCropPoint(e));
    if (choreCropPointers.size === 2) {
      const pts = [...choreCropPointers.values()];
      choreCropPinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      choreCropPinchStartScale = choreCropState.scale;
    }
  });
  choreCropViewport.addEventListener('pointermove', (e) => {
    if (!choreCropState || !choreCropPointers.has(e.pointerId)) return;
    const prev = choreCropPointers.get(e.pointerId);
    const curr = choreCropPoint(e);
    choreCropPointers.set(e.pointerId, curr);
    if (choreCropPointers.size === 1) {
      choreCropState.offsetX += curr.x - prev.x;
      choreCropState.offsetY += curr.y - prev.y;
      choreClampCropOffset();
      choreRenderCropImage();
    } else if (choreCropPointers.size === 2 && choreCropPinchStartDist > 0) {
      const pts = [...choreCropPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      choreApplyCropZoom(choreCropPinchStartScale * (dist / choreCropPinchStartDist), midX, midY);
    }
  });
  function choreCropPointerEnd(e) {
    choreCropPointers.delete(e.pointerId);
    if (choreCropPointers.size < 2) choreCropPinchStartDist = 0;
  }
  choreCropViewport.addEventListener('pointerup', choreCropPointerEnd);
  choreCropViewport.addEventListener('pointercancel', choreCropPointerEnd);

  function closeChorePicCropper() {
    choreCropDialog.classList.add('hidden');
    choreCropState = null;
    choreCropPointers.clear();
    choreCropPinchStartDist = 0;
  }
  $('chore-pic-crop-cancel-btn').addEventListener('click', closeChorePicCropper);
  $('chore-pic-crop-save-btn').addEventListener('click', () => {
    if (!choreCropState) return;
    const s = choreCropState;
    const srcX = (s.boxLeft - s.offsetX) / s.scale;
    const srcY = (s.boxTop - s.offsetY) / s.scale;
    const srcW = s.boxW / s.scale;
    const srcH = s.boxH / s.scale;
    const outW = 480;
    const outH = Math.round(outW / (s.boxW / s.boxH));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    // Zoomed out past "fits the box" leaves a gap on one or both axes -- fill it white first so
    // JPEG export (no alpha channel) doesn't turn that gap black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(choreCropImg, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    closeChorePicCropper();
    canvas.toBlob((blob) => { if (blob) adoptPicture(blob); }, 'image/jpeg', 0.85);
  });

  // ---- Store Item Picture crop dialog: same pan/zoom-inside-a-shaped-box interaction as the
  // Chore Picture crop dialog above, just against #store-pic-crop-box's own shape (a stadium
  // matching .kz-pill__photo's real on-screen ratio, not a tall rectangle) -- producing a
  // pendingPhotos blob (via adoptPicture) the same way. ----
  let storeCropState = null;
  const storeCropPointers = new Map();
  let storeCropPinchStartDist = 0;
  let storeCropPinchStartScale = 1;
  const storeCropDialog = $('store-pic-crop-dialog');
  const storeCropViewport = $('store-pic-crop-viewport');
  const storeCropImg = $('store-pic-crop-img');
  const storeCropBox = $('store-pic-crop-box');
  const storeCropZoomInput = $('store-pic-crop-zoom');

  function openStorePicCropper(img) {
    storeCropImg.src = img.src;
    storeCropDialog.classList.remove('hidden');
    requestAnimationFrame(() => {
      const vpRect = storeCropViewport.getBoundingClientRect();
      const boxRect = storeCropBox.getBoundingClientRect();
      const boxLeft = boxRect.left - vpRect.left;
      const boxTop = boxRect.top - vpRect.top;
      const coverScale = Math.max(boxRect.width / img.naturalWidth, boxRect.height / img.naturalHeight);
      const containScale = Math.min(boxRect.width / img.naturalWidth, boxRect.height / img.naturalHeight);
      const minScale = containScale * 0.5;
      storeCropState = {
        naturalW: img.naturalWidth, naturalH: img.naturalHeight,
        boxLeft, boxTop, boxW: boxRect.width, boxH: boxRect.height,
        minScale, maxScale: coverScale * 4, scale: coverScale,
      };
      storeCropState.offsetX = boxLeft + boxRect.width / 2 - (img.naturalWidth * coverScale) / 2;
      storeCropState.offsetY = boxTop + boxRect.height / 2 - (img.naturalHeight * coverScale) / 2;
      storeClampCropOffset();
      storeCropZoomInput.value = Math.round(((coverScale - minScale) / (storeCropState.maxScale - minScale)) * 100);
      storeRenderCropImage();
    });
  }

  function storeClampCropOffset() {
    const s = storeCropState;
    const dispW = s.naturalW * s.scale;
    const dispH = s.naturalH * s.scale;
    s.offsetX = dispW >= s.boxW
      ? Math.min(s.boxLeft, Math.max(s.boxLeft + s.boxW - dispW, s.offsetX))
      : s.boxLeft + (s.boxW - dispW) / 2;
    s.offsetY = dispH >= s.boxH
      ? Math.min(s.boxTop, Math.max(s.boxTop + s.boxH - dispH, s.offsetY))
      : s.boxTop + (s.boxH - dispH) / 2;
  }

  function storeRenderCropImage() {
    const s = storeCropState;
    storeCropImg.style.width = `${s.naturalW * s.scale}px`;
    storeCropImg.style.height = `${s.naturalH * s.scale}px`;
    storeCropImg.style.transform = `translate(${s.offsetX}px, ${s.offsetY}px)`;
  }

  function storeApplyCropZoom(newScaleRaw, anchorX, anchorY) {
    const s = storeCropState;
    const newScale = Math.min(s.maxScale, Math.max(s.minScale, newScaleRaw));
    const imgX = (anchorX - s.offsetX) / s.scale;
    const imgY = (anchorY - s.offsetY) / s.scale;
    s.scale = newScale;
    s.offsetX = anchorX - imgX * newScale;
    s.offsetY = anchorY - imgY * newScale;
    storeClampCropOffset();
    storeRenderCropImage();
    storeCropZoomInput.value = Math.round(((s.scale - s.minScale) / (s.maxScale - s.minScale || 1)) * 100);
  }

  storeCropZoomInput.addEventListener('input', (e) => {
    if (!storeCropState) return;
    const s = storeCropState;
    const t = Number(e.target.value) / 100;
    storeApplyCropZoom(s.minScale + t * (s.maxScale - s.minScale), s.boxLeft + s.boxW / 2, s.boxTop + s.boxH / 2);
  });

  function storeCropPoint(e) {
    const r = storeCropViewport.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  storeCropViewport.addEventListener('pointerdown', (e) => {
    if (!storeCropState) return;
    try { storeCropViewport.setPointerCapture(e.pointerId); } catch { /* pointer already gone -- harmless */ }
    storeCropPointers.set(e.pointerId, storeCropPoint(e));
    if (storeCropPointers.size === 2) {
      const pts = [...storeCropPointers.values()];
      storeCropPinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      storeCropPinchStartScale = storeCropState.scale;
    }
  });
  storeCropViewport.addEventListener('pointermove', (e) => {
    if (!storeCropState || !storeCropPointers.has(e.pointerId)) return;
    const prev = storeCropPointers.get(e.pointerId);
    const curr = storeCropPoint(e);
    storeCropPointers.set(e.pointerId, curr);
    if (storeCropPointers.size === 1) {
      storeCropState.offsetX += curr.x - prev.x;
      storeCropState.offsetY += curr.y - prev.y;
      storeClampCropOffset();
      storeRenderCropImage();
    } else if (storeCropPointers.size === 2 && storeCropPinchStartDist > 0) {
      const pts = [...storeCropPointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      storeApplyCropZoom(storeCropPinchStartScale * (dist / storeCropPinchStartDist), midX, midY);
    }
  });
  function storeCropPointerEnd(e) {
    storeCropPointers.delete(e.pointerId);
    if (storeCropPointers.size < 2) storeCropPinchStartDist = 0;
  }
  storeCropViewport.addEventListener('pointerup', storeCropPointerEnd);
  storeCropViewport.addEventListener('pointercancel', storeCropPointerEnd);

  function closeStorePicCropper() {
    storeCropDialog.classList.add('hidden');
    storeCropState = null;
    storeCropPointers.clear();
    storeCropPinchStartDist = 0;
  }
  $('store-pic-crop-cancel-btn').addEventListener('click', closeStorePicCropper);
  $('store-pic-crop-save-btn').addEventListener('click', () => {
    if (!storeCropState) return;
    const s = storeCropState;
    const srcX = (s.boxLeft - s.offsetX) / s.scale;
    const srcY = (s.boxTop - s.offsetY) / s.scale;
    const srcW = s.boxW / s.scale;
    const srcH = s.boxH / s.scale;
    const outW = 480;
    const outH = Math.round(outW / (s.boxW / s.boxH));
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    // Zoomed out past "fits the box" leaves a gap on one or both axes -- fill it white first so
    // JPEG export (no alpha channel) doesn't turn that gap black.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(storeCropImg, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
    closeStorePicCropper();
    canvas.toBlob((blob) => { if (blob) adoptPicture(blob); }, 'image/jpeg', 0.85);
  });

  function closeEditor() {
    $('setup-item-overlay').classList.add('hidden');
    editing = null;
  }

  $('setup-item-cancel-btn').addEventListener('click', closeEditor);

  // If a brand-new photo was picked for this item, upload it to Supabase Storage now and point
  // the item at its public URL. Items using an emoji, or an existing photo that was already
  // saved before, skip this entirely -- no upload needed. Works from any device.
  async function persistPendingPhoto(item) {
    if (!item.picture || item.picture.type !== 'image' || !pendingPhotos.has(item.picture.src)) return;
    const oldSrc = item.picture.src;
    const { blob, fileName } = pendingPhotos.get(oldSrc);
    const familyId = ParentAuth.getFamilyId();
    if (!familyId) throw new Error('Sign in to the Family Account first.');
    const path = `${familyId}/${fileName}`;
    const { error } = await supabaseClient.storage.from('pictures').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = supabaseClient.storage.from('pictures').getPublicUrl(path);
    item.picture = { type: 'image', src: data.publicUrl };
    pendingPhotos.delete(oldSrc);
  }

  $('setup-item-done-btn').addEventListener('click', async () => {
    const name = $('setup-item-name').value.trim();
    if (!name) { $('setup-item-name').focus(); return; }
    const amount = Math.round(Number($('setup-item-amount').value));
    if (!Number.isFinite(amount) || amount < 0 || amount > 999) {
      alert('Please enter a number of coins from 0 to 999.');
      $('setup-item-amount').focus();
      return;
    }
    const item = editing.item;
    item.name = name;
    item.picture = editPicture;
    if (editing.kind === 'chores') item.coins = amount;
    else { item.price = amount; item.limit = $('setup-item-limit').value || null; item.category = $('setup-item-category').value || null; }

    const btn = $('setup-item-done-btn');
    btn.disabled = true;
    try {
      await persistPendingPhoto(item);
      if (editing.kind === 'chores') await saveChoreItem(item, editing.isNew);
      else await saveStoreItem(item, editing.isNew);
      closeEditor();
      renderAll();
    } catch (err) {
      console.error('[Setup] could not save:', err);
      alert(`Could not save: ${err.message || err}`);
    } finally {
      btn.disabled = false;
    }
  });

  $('setup-item-delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${editing.original.name}"?`)) return;
    const btn = $('setup-item-delete-btn');
    btn.disabled = true;
    try {
      if (editing.kind === 'chores') await deleteChoreItem(editing.original.id);
      else await deleteStoreItem(editing.original.id);
      closeEditor();
      renderAll();
    } catch (err) {
      console.error('[Setup] could not delete:', err);
      alert(`Could not delete: ${err.message || err}`);
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- coins tab ----------
  const COIN_FIELDS = [
    { id: 'coloring', fields: [['perItem', 'Coins per saved picture'], ['minActions', 'Brush strokes or fills needed first'], ['dailyLimit', 'Daily limit']] },
    { id: 'chores', fields: [['dailyLimit', 'Daily limit (each chore pays its own value)']] },
    { id: 'math', fields: [['perItem', 'Coins per Practice round'], ['gamePerItem', 'Coins per game round'], ['dailyLimit', 'Daily limit']] },
    { id: 'reading', fields: [['perItem', 'Coins per Practice round'], ['gamePerItem', 'Coins per game round'], ['dailyLimit', 'Daily limit']] },
  ];

  // Saves ~700ms after the parent stops typing, instead of on every keystroke.
  function scheduleCoinSave() {
    clearTimeout(coinSaveTimer);
    setStatus('Saving...');
    coinSaveTimer = setTimeout(async () => {
      try {
        await saveCoinRules(getSettings().coinRules.sections);
        setStatus('✅ Saved', 'ok');
      } catch (err) {
        console.error('[Setup] could not save coin rules:', err);
        setStatus('Could not save -- check your connection', 'error');
      }
    }, 700);
  }

  function renderCoins() {
    const box = $('setup-coins');
    box.innerHTML = '';
    const sections = getSettings().coinRules.sections;
    COIN_FIELDS.forEach(({ id, fields }) => {
      const info = SECTION_INFO[id];
      const card = document.createElement('div');
      card.className = 'setup-coin-card';
      card.innerHTML = `<h3 class="parent-card-title">${info.emoji} ${esc(info.label)}</h3>`;
      fields.forEach(([key, label]) => {
        const row = document.createElement('label');
        row.className = 'setup-field-inline';
        row.textContent = label;
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.max = '999';
        input.className = 'name-input small-input';
        input.value = sections[id][key];
        input.addEventListener('input', () => {
          const v = Math.round(Number(input.value));
          if (Number.isFinite(v) && v >= 0 && v <= 999) {
            sections[id][key] = v;
            renderOverall();
            scheduleCoinSave();
          }
        });
        row.appendChild(input);
        card.appendChild(row);
      });
      box.appendChild(card);
    });
    renderOverall();
  }

  function renderOverall() {
    const total = Object.values(getSettings().coinRules.sections).reduce((s, r) => s + (r.dailyLimit || 0), 0);
    $('setup-overall').innerHTML = `Overall daily limit: <strong>${total} coins</strong>`;
  }

  // Suggests limits from the store's prices: a typical (middle-priced) item should take about
  // the chosen number of days of full earning.
  $('setup-suggest-btn').addEventListener('click', () => {
    const days = Math.max(1, Math.round(Number($('setup-suggest-days').value) || 3));
    const store = getSettings().store;
    const sections = getSettings().coinRules.sections;
    const prices = store.map((i) => i.price).filter((p) => p > 0).sort((a, b) => a - b);
    const out = $('setup-suggest-result');
    out.classList.remove('hidden');
    if (!prices.length) {
      out.innerHTML = '<p class="parent-card-note">Add some store items with prices first.</p>';
      return;
    }
    const typical = prices[Math.floor(prices.length / 2)];
    const overall = Math.max(4, Math.ceil(typical / days));
    const chores = Math.round(overall * 0.4);
    const math = Math.round(overall * 0.25);
    const reading = Math.round(overall * 0.25);
    const coloring = Math.max(1, overall - chores - math - reading);
    const practice = (limit) => Math.max(1, Math.round(limit / 3));
    const game = (limit) => Math.max(1, Math.round(practice(limit) / 3));
    const s = {
      coloring: { perItem: Math.max(1, Math.round(coloring / 3)), dailyLimit: coloring, minActions: sections.coloring.minActions },
      chores: { dailyLimit: chores },
      math: { perItem: practice(math), gamePerItem: game(math), dailyLimit: math },
      reading: { perItem: practice(reading), gamePerItem: game(reading), dailyLimit: reading },
    };
    const total = coloring + chores + math + reading;
    const slow = store.filter((i) => i.price / total > 14);
    out.innerHTML = `
      <p>The middle store price is <strong>${typical} coins</strong>, so about <strong>${total} coins a day</strong>:</p>
      <ul>
        <li>🧹 Chores: up to ${chores} a day</li>
        <li>🔢 Math: ${s.math.perItem} per Practice round, ${s.math.gamePerItem} per game, up to ${math} a day</li>
        <li>📚 Reading: ${s.reading.perItem} per Practice round, ${s.reading.gamePerItem} per game, up to ${reading} a day</li>
        <li>🖍️ Coloring: ${s.coloring.perItem} per picture, up to ${coloring} a day</li>
      </ul>
      ${slow.map((i) => `<p class="setup-warn">⚠️ ${esc(i.name)} would take about ${Math.ceil(i.price / total)} days.</p>`).join('')}
      <button type="button" class="big-btn primary-btn" id="setup-suggest-use">Use these</button>`;
    $('setup-suggest-use').addEventListener('click', () => {
      Object.entries(s).forEach(([id, vals]) => Object.assign(sections[id], vals));
      out.classList.add('hidden');
      renderCoins();
      scheduleCoinSave();
    });
  });

  return { open };
})();
