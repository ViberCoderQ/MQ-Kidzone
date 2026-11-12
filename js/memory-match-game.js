// Reading's Memory Match: a self-contained castle-themed game (ported from the Cursor handoff),
// living inside the #memory-match-screen section. All its own DOM ids are prefixed "mm-" so they
// can't collide with the rest of this single-page app, and its CSS is scoped under #memory-match-root
// in style.css so its .screen/.hidden/.face/etc. classes can't be shadowed by -- or shadow -- the
// app's own global classes of the same name. Word data comes from js/memory-match-words.js.
//
// Six difficulty levels, tied to the profile's own Reading level (set in Parent Area -> that kid's
// settings), same as every other Reading game -- there's no in-game level picker:
//   1: Match only; automatically collect the pair (no popup)
//   2: Trace each dotted letter outline with a finger/stylus, then Finish
//   3: Pick the first letter from three choices
//   4: Tap scrambled letter tiles into slots in order (tap a placed tile to undo it)
//   5: Type the 3-letter word on the keyboard
//   6: Type the 3- or 4-letter word on the keyboard
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const state = { level: 1, traceDone: [], choiceLetters: [], tiles: [], placed: [], columns: 0, deck: [], open: [], matched: new Set(), attempts: 0, phase: 'select', answer: '', challenge: null, timer: null, sound: true, confirmAction: null };
  const WORDS = () => (typeof MEMORY_MATCH_WORDS !== 'undefined' ? MEMORY_MATCH_WORDS : [])
    .filter((w) => w.enabled !== false && /^[A-Z]{3,4}$/.test(w.word) && typeof w.image === 'string');
  const shuffle = (items) => {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const totalPairs = () => state.columns * 2;
  const setHidden = (id, hidden) => $(id).classList.toggle('hidden', hidden);
  let leaveCallback = null;

  function beep(freq = 660) {
    if (!state.sound) return;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return;
      const ctx = new C();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.05, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.13);
      o.onended = () => ctx.close();
    } catch (_) { /* no audio available -- silently skip */ }
  }

  // Levels 1-5 only use 3-letter words (so tracing/choices/tiles/typing all stay at the easier
  // length); level 6 opens up to the full 3-4 letter catalog.
  function buildDeck(columns) {
    const words = WORDS().filter((w) => state.level === 6 || w.word.length === 3);
    const count = columns * 2;
    if (words.length < count) throw new Error(`Need ${count} unique enabled words for this level; found ${words.length}`);
    const chosen = shuffle(words).slice(0, count);
    return shuffle(chosen.flatMap((w) => [
      { key: w.id + '-1', wordId: w.id, word: w.word, image: w.image },
      { key: w.id + '-2', wordId: w.id, word: w.word, image: w.image },
    ]));
  }

  function startGame(columns) {
    clearTimeout(state.timer);
    state.columns = columns;
    state.deck = buildDeck(columns);
    state.open = [];
    state.matched = new Set();
    state.attempts = 0;
    state.answer = '';
    state.challenge = null;
    state.phase = 'playing';
    setHidden('mm-selectScreen', true);
    setHidden('mm-playScreen', false);
    setHidden('mm-shade', true);
    setHidden('mm-matchDialog', true);
    setHidden('mm-confirmDialog', true);
    setHidden('mm-infoDialog', true);
    renderBoard();
    renderStats();
  }

  function renderBoard() {
    const grid = $('mm-grid');
    grid.replaceChildren();
    grid.style.setProperty('--columns', state.columns);
    state.deck.forEach((card, idx) => {
      const button = document.createElement('button');
      button.className = 'memory-card';
      button.type = 'button';
      button.dataset.key = card.key;
      // Grid auto-flow is row-major, so this is also the card's visual row (0-3) -- lets
      // memory-match.css nudge a whole row at once via [data-row="N"].
      button.dataset.row = String(Math.floor(idx / state.columns));
      button.setAttribute('aria-label', 'Face down card');
      button.innerHTML = `<span class="inner"><span class="face back"><img src="assets/memory-match/castle-q.png" alt=""></span><span class="face front"><img src="${card.image}" alt=""></span></span>`;
      button.addEventListener('click', () => flip(card.key));
      grid.append(button);
    });
  }

  function updateCards() {
    for (const card of state.deck) {
      const el = $('mm-grid').querySelector(`[data-key="${card.key}"]`);
      const matched = state.matched.has(card.wordId);
      const visible = matched || state.open.includes(card.key);
      el.classList.toggle('revealed', visible && !matched);
      el.classList.toggle('matched', matched);
      el.disabled = matched || state.phase !== 'playing' || state.open.includes(card.key);
      el.setAttribute('aria-label', visible ? `Picture card, ${matched ? 'completed pair' : 'face up'}` : 'Face down card');
    }
  }

  function renderStats() {
    $('mm-pairsText').textContent = `${state.matched.size} / ${totalPairs()}`;
    $('mm-attemptsText').textContent = String(state.attempts);
    const pct = Math.round((state.matched.size / totalPairs()) * 100);
    $('mm-progressText').textContent = pct + '%';
    $('mm-meterFill').style.width = pct + '%';
    updateCards();
  }

  function flip(key) {
    if (state.phase !== 'playing' || state.open.length >= 2) return;
    const card = state.deck.find((c) => c.key === key);
    if (!card || state.open.includes(key) || state.matched.has(card.wordId)) return;
    state.open.push(key);
    beep(540);
    updateCards();
    if (state.open.length !== 2) return;
    state.attempts++;
    renderStats();
    const first = state.deck.find((c) => c.key === state.open[0]);
    if (first.wordId === card.wordId) {
      state.phase = 'challenge';
      // Level 1 is match-only: collect the pair automatically, no popup at all.
      state.timer = setTimeout(() => (state.level === 1 ? completeMatch(card) : showChallenge(card)), 520);
    } else {
      state.phase = 'mismatch';
      state.timer = setTimeout(() => { state.open = []; state.phase = 'playing'; updateCards(); }, 1100);
    }
  }

  function completeMatch(card) {
    state.matched.add(card.wordId);
    state.challenge = null;
    state.answer = '';
    state.open = [];
    setHidden('mm-matchDialog', true);
    setHidden('mm-shade', true);
    beep(1000);
    renderStats();
    if (state.matched.size === totalPairs()) { state.phase = 'won'; finishGame(); }
    else { state.phase = 'playing'; updateCards(); }
  }

  function showChallenge(card) {
    state.challenge = card;
    state.answer = '';
    state.traceDone = Array(card.word.length).fill(false);
    state.phase = 'challenge';
    $('mm-challengeImage').src = card.image;
    $('mm-challengeImage').alt = 'Picture for ' + card.word;
    $('mm-feedback').textContent = '';
    const instructions = {
      2: 'Trace each dotted letter!', 3: 'Choose the first letter!',
      4: 'Put the letters in order!', 5: 'Spell the 3-letter word!', 6: 'Spell the word!',
    };
    $('mm-challengePrompt').textContent = instructions[state.level];
    const isTrace = state.level === 2, isChoice = state.level === 3 || state.level === 4;
    setHidden('mm-traceArea', !isTrace);
    setHidden('mm-choiceArea', !isChoice);
    setHidden('mm-keyboard', state.level < 5);
    setHidden('mm-eraseBtn', isTrace || state.level === 3);
    setHidden('mm-hintBtn', state.level !== 2 && state.level !== 4);
    $('mm-submitBtn').textContent = isTrace ? '✓ Finish' : '✓ Check';
    if (state.level === 3) {
      const correct = card.word[0];
      state.choiceLetters = shuffle([correct, ...shuffle('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => l !== correct)).slice(0, 2)]);
    }
    if (state.level === 4) {
      let scrambled = shuffle(card.word.split(''));
      for (let i = 0; i < 8 && scrambled.join('') === card.word; i++) scrambled = shuffle(card.word.split(''));
      if (scrambled.join('') === card.word) scrambled.reverse();
      state.tiles = scrambled.map((letter, i) => ({ letter, id: i, used: false }));
      state.placed = [];
    }
    renderSlots();
    if (isTrace) renderTrace();
    if (isChoice) renderChoices();
    setHidden('mm-shade', false);
    setHidden('mm-matchDialog', false);
    renderStats();
    beep(900);
  }

  function renderSlots() {
    const slots = $('mm-letterSlots');
    slots.replaceChildren();
    if (!state.challenge) return;
    const word = state.challenge.word;
    if (state.level === 2) { slots.classList.add('hidden'); return; }
    slots.classList.remove('hidden');
    for (let i = 0; i < word.length; i++) {
      const s = document.createElement('span');
      s.textContent = state.level === 3 ? (i === 0 ? state.answer : word[i]) : state.answer[i] || '';
      if (state.level === 4 && state.placed[i] !== undefined) {
        s.classList.add('mm-removable');
        s.setAttribute('role', 'button');
        s.setAttribute('tabindex', '0');
        s.setAttribute('aria-label', 'Remove ' + s.textContent);
        s.addEventListener('click', () => removeTile(i));
        s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); removeTile(i); } });
      }
      slots.append(s);
    }
  }

  function renderChoices() {
    const area = $('mm-choiceArea');
    area.replaceChildren();
    if (state.level === 3) {
      for (const letter of state.choiceLetters) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = letter;
        btn.className = state.answer === letter ? 'mm-selected' : '';
        btn.addEventListener('click', () => { state.answer = letter; $('mm-feedback').textContent = ''; renderSlots(); renderChoices(); beep(630); });
        area.append(btn);
      }
    } else if (state.level === 4) {
      for (const tile of state.tiles) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = tile.letter;
        btn.disabled = tile.used;
        btn.addEventListener('click', () => {
          if (state.placed.length >= state.challenge.word.length || tile.used) return;
          tile.used = true;
          state.placed.push(tile.id);
          state.answer = state.placed.map((id) => state.tiles.find((t) => t.id === id).letter).join('');
          $('mm-feedback').textContent = '';
          renderSlots();
          renderChoices();
          beep(630);
        });
        area.append(btn);
      }
    }
  }

  function removeTile(index) {
    if (state.level !== 4 || state.phase !== 'challenge') return;
    const id = state.placed.splice(index, 1)[0];
    if (id !== undefined) state.tiles.find((t) => t.id === id).used = false;
    state.answer = state.placed.map((id) => state.tiles.find((t) => t.id === id).letter).join('');
    renderSlots();
    renderChoices();
  }

  // Trace real SVG letter outlines, not a drawing pad. Each glyph's sampled stroke must be
  // visited with a finger/pencil; paths use the actual letter outlines (js/mm-trace-glyphs.js).
  function renderTrace() {
    const area = $('mm-traceArea');
    area.replaceChildren();
    const word = state.challenge.word;
    [...word].forEach((letter, i) => {
      const holder = document.createElement('div');
      holder.className = 'mm-trace-letter';
      if (state.traceDone[i]) holder.classList.add('done');
      const svgNS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('aria-label', 'Trace ' + letter);
      const path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d', window.MM_TRACE_GLYPHS[letter]);
      path.setAttribute('class', 'mm-letter-path');
      svg.append(path);
      const ink = document.createElementNS(svgNS, 'path');
      ink.setAttribute('class', 'mm-trace-ink');
      svg.append(ink);
      holder.append(svg);
      area.append(holder);
      // A glyph's "d" can hold more than one subpath -- e.g. A and B each have a small inner
      // hole (A's crossbar notch, B's two bowls) in addition to the outer silhouette. Sampling
      // the whole "d" as one run weights samples by arc length, so a tiny inner hole barely
      // counts toward the 77% target and tracing could skip it entirely (skipping A's crossbar).
      // Splitting by subpath and requiring each one to hit 77% on its own forces every part,
      // including the crossbar, to actually be traced.
      const subpaths = window.MM_TRACE_GLYPHS[letter].match(/M[^M]*/g).map((sub) => {
        const subPath = document.createElementNS(svgNS, 'path');
        subPath.setAttribute('d', sub);
        const subLength = subPath.getTotalLength();
        const n = Math.max(8, Math.ceil(subLength / 2.4));
        const pts = Array.from({ length: n }, (_, k) => subPath.getPointAtLength((k * subLength) / (n - 1)));
        return { samples: pts, seen: new Set() };
      });
      // Every letter's own path data uses its natural position in the font's shared coordinate
      // space (e.g. narrow "I" sits near x:[26,52], wide "M" near x:[26,136]), so a single
      // viewBox sized to fit the widest letters left every narrower letter sitting off-center to
      // the left. Centering each letter on its own bounding box fixes that. getBBox() can't be
      // used here -- this runs before the dialog is unhidden, and Chromium returns an all-zero
      // box for elements inside a display:none subtree -- so the box is built from the subpath
      // sample points instead (pure path geometry, unaffected by whether anything is rendered).
      const allPts = subpaths.flatMap((sp) => sp.samples);
      const minX = Math.min(...allPts.map((p) => p.x)), maxX = Math.max(...allPts.map((p) => p.x));
      const minY = Math.min(...allPts.map((p) => p.y)), maxY = Math.max(...allPts.map((p) => p.y));
      const pad = 8;
      svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
      let active = false;
      // Letters are traced as several separate pen-strokes (an E's three bars plus its spine,
      // a T's bar and stem, etc.), lifting and re-touching between each. inkStrokes keeps every
      // stroke's own points so earlier strokes stay drawn -- only the live stroke is mutated.
      const inkStrokes = [];
      const redrawInk = () => {
        ink.setAttribute('d', inkStrokes.map((stroke) => stroke.map((q, k) => (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')).join(' '));
      };
      const pointFromEvent = (e) => {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        return ctm ? pt.matrixTransform(ctm.inverse()) : null;
      };
      const mark = (e) => {
        const p = pointFromEvent(e);
        if (!p) return;
        let near = false;
        // Letter strokes are ~25-26 units thick (half-width ~13), so tracing through the
        // center of a stroke -- the natural way to trace a thick letter -- sits ~13 units
        // from the dashed boundary line. 15 covers that with a little slack for touch imprecision.
        subpaths.forEach((sp) => {
          sp.samples.forEach((q, k) => { if (Math.hypot(q.x - p.x, q.y - p.y) < 15) { sp.seen.add(k); near = true; } });
        });
        if (near) {
          inkStrokes[inkStrokes.length - 1].push([p.x, p.y]);
          redrawInk();
        }
        if (subpaths.every((sp) => sp.seen.size / sp.samples.length >= 0.77) && !state.traceDone[i]) {
          state.traceDone[i] = true;
          holder.classList.add('done');
          beep(900);
          $('mm-feedback').textContent = state.traceDone.every(Boolean) ? 'Great tracing! Tap Finish!' : '';
        }
      };
      svg.addEventListener('pointerdown', (e) => { if (state.traceDone[i]) return; active = true; inkStrokes.push([]); svg.setPointerCapture(e.pointerId); mark(e); e.preventDefault(); });
      svg.addEventListener('pointermove', (e) => { if (active) { mark(e); e.preventDefault(); } });
      const stop = () => { active = false; };
      svg.addEventListener('pointerup', stop);
      svg.addEventListener('pointercancel', stop);
    });
  }

  function typeLetter(letter) {
    if (state.phase !== 'challenge' || state.level < 5 || state.answer.length >= state.challenge.word.length || !/^[A-Z]$/.test(letter)) return;
    state.answer += letter;
    $('mm-feedback').textContent = '';
    renderSlots();
    beep(620);
  }

  function erase() {
    if (state.phase !== 'challenge') return;
    if (state.level === 4) { removeTile(state.placed.length - 1); return; }
    if (state.level < 5) return;
    state.answer = state.answer.slice(0, -1);
    $('mm-feedback').textContent = '';
    renderSlots();
  }

  function hint() {
    if (state.phase !== 'challenge') return;
    if (state.level === 2) { $('mm-feedback').textContent = 'Follow the dotted outline with your finger!'; return; }
    if (state.level === 4) {
      state.tiles.forEach((t) => { t.used = false; });
      state.placed = [];
      state.answer = '';
      const first = state.tiles.find((t) => t.letter === state.challenge.word[0]);
      first.used = true;
      state.placed = [first.id];
      state.answer = first.letter;
      renderSlots();
      renderChoices();
      $('mm-feedback').textContent = 'Here is the first letter!';
    }
  }

  function submit() {
    if (state.phase !== 'challenge') return;
    if (state.level === 2) {
      if (!state.traceDone.every(Boolean)) { $('mm-feedback').textContent = 'Trace all the letters first!'; return; }
    } else if (state.level === 3) {
      // Level 3's "answer" is just the one picked letter (the rest of the word is already shown
      // in the slots), so it's checked against word[0] directly -- never against the full word.
      if (!state.answer) { $('mm-feedback').textContent = 'Pick a letter first!'; return; }
      if (state.answer !== state.challenge.word[0]) {
        $('mm-feedback').textContent = 'Not quite — try again!';
        beep(210);
        state.answer = '';
        renderSlots();
        renderChoices();
        return;
      }
    } else if (state.answer.length !== state.challenge.word.length) {
      $('mm-feedback').textContent = 'Finish the word first!';
      return;
    } else if (state.answer !== state.challenge.word) {
      $('mm-feedback').textContent = 'Not quite — try again!';
      beep(210);
      if (state.level === 4) { state.tiles.forEach((t) => { t.used = false; }); state.placed = []; state.answer = ''; renderSlots(); renderChoices(); }
      else { state.answer = ''; renderSlots(); }
      return;
    }
    completeMatch(state.challenge);
  }

  // Every other game in Kid Zone reports completion through Learning.finishRound (stars, coins,
  // Play Again/Done) -- Memory Match does the same instead of its own separate "you won" popup,
  // so it pays out like every other activity.
  function finishGame() {
    const pairs = totalPairs();
    const best = pairs + 2;
    const score = state.attempts <= best ? pairs : Math.max(1, pairs - Math.ceil((state.attempts - best) / 2));
    Learning.finishRound({
      correct: score,
      total: pairs,
      text: `You found all ${pairs} pairs in ${state.attempts} tries!`,
      sayText: 'You found all the pairs!',
    });
  }

  function showInfo(title, msg) {
    $('mm-infoTitle').textContent = title;
    $('mm-infoMessage').textContent = msg;
    setHidden('mm-infoDialog', false);
  }

  function confirmAction(action, message) {
    state.confirmAction = action;
    $('mm-confirmMessage').textContent = message;
    setHidden('mm-confirmDialog', false);
  }

  function home() {
    clearTimeout(state.timer);
    state.phase = 'select';
    state.challenge = null;
    state.open = [];
    setHidden('mm-matchDialog', true);
    setHidden('mm-shade', true);
    setHidden('mm-infoDialog', true);
    setHidden('mm-confirmDialog', true);
    setHidden('mm-playScreen', true);
    setHidden('mm-selectScreen', false);
  }

  // The outer Kid Zone header's back button -- leaves Memory Match entirely, back to Reading's
  // subject menu. Confirms first if a board is actually in progress (home()'s own ⌂ button only
  // goes back to board selection, which is a smaller step than this).
  function leaveToMenu() {
    if (state.phase === 'select' || state.phase === 'won') { if (leaveCallback) leaveCallback(); return; }
    confirmAction(() => { if (leaveCallback) leaveCallback(); }, 'Leave Memory Match? Your current progress will be lost.');
  }

  // Called by Learning.startArea each time a child opens Reading's Memory Match tile -- always
  // starts fresh at the board-size picker. Level comes straight from the profile's own Reading
  // level (Parent Area -> that kid -> Learning levels), same source every other Reading game
  // reads from -- there's no separate level control inside Memory Match itself.
  function open(onLeave) {
    leaveCallback = onLeave;
    state.level = Math.min(6, Math.max(1, Number(Learning.currentLevel()) || 1));
    home();
    const words = WORDS();
    const eligible = state.level === 6 ? words.length : words.filter((w) => w.word.length === 3).length;
    if (eligible < 10) showInfo('Missing word cards', 'At least 10 enabled picture words of the right length are required for the smallest board.');
  }

  $('mm-sizeButtons').addEventListener('click', (e) => { const btn = e.target.closest('[data-cols]'); if (btn) startGame(Number(btn.dataset.cols)); });
  $('mm-resetBtn').addEventListener('click', () => confirmAction(() => startGame(state.columns), 'Shuffle and restart this board? Your current progress will be lost.'));
  $('mm-homeBtn').addEventListener('click', () => confirmAction(home, 'Return to board selection? Your current progress will be lost.'));
  $('mm-backBtn').addEventListener('click', leaveToMenu);
  $('mm-cancelConfirm').addEventListener('click', () => setHidden('mm-confirmDialog', true));
  $('mm-acceptConfirm').addEventListener('click', () => {
    const action = state.confirmAction;
    state.confirmAction = null;
    setHidden('mm-confirmDialog', true);
    if (action) action();
  });
  $('mm-settingsBtn').addEventListener('click', () => showInfo('How to play', 'Flip two cards to find a match. Each level has its own word activity. Finish the activity to collect the pair!'));
  $('mm-soundBtn').addEventListener('click', () => {
    state.sound = !state.sound;
    $('mm-soundBtn').classList.toggle('muted', !state.sound);
    $('mm-soundBtn').setAttribute('aria-label', state.sound ? 'Mute sound' : 'Enable sound');
  });
  $('mm-closeInfo').addEventListener('click', () => setHidden('mm-infoDialog', true));
  $('mm-eraseBtn').addEventListener('click', erase);
  $('mm-hintBtn').addEventListener('click', hint);
  $('mm-submitBtn').addEventListener('click', submit);

  const kb = $('mm-keyboard');
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = letter;
    btn.setAttribute('aria-label', 'Letter ' + letter);
    btn.addEventListener('click', () => typeLetter(letter));
    kb.append(btn);
  }

  document.addEventListener('keydown', (e) => {
    // Only react while Memory Match is the screen actually on screen -- this is a document-level
    // listener in an app with many other screens, unlike the standalone original.
    if (!$('memory-match-screen').classList.contains('active')) return;
    if (state.phase !== 'challenge' || !$('mm-confirmDialog').classList.contains('hidden') || !$('mm-infoDialog').classList.contains('hidden')) return;
    if (/^[a-z]$/i.test(e.key)) { e.preventDefault(); typeLetter(e.key.toUpperCase()); }
    else if (e.key === 'Backspace') { e.preventDefault(); erase(); }
    else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  window.MemoryMatchGame = {
    open,
    getState: () => ({ level: state.level, columns: state.columns, cardCount: state.deck.length, pairs: totalPairs(), matched: state.matched.size, attempts: state.attempts, phase: state.phase }),
  };
})();
