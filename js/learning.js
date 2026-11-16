// Math and Reading: the subject menu, Practice, and the three games (Memory Match, War, Hidden
// Pictures). The engines here are the same for every subject; each subject (MathContent,
// ReadingContent) supplies its own questions, cards and puzzles for each level.
const Learning = (() => {
  const $ = (id) => document.getElementById(id);
  const { shuffle, rand, pick } = LearnUtil;
  const SUBJECTS = {};
  const PRAISE = ['Yes!', 'Great job!', 'You got it!', 'Awesome!', 'Way to go!', 'Super!'];

  function register(subject) { SUBJECTS[subject.id] = subject; }

  // ---------- per-boy settings + scores ----------
  function levelFor(profile, subjectId) {
    const n = profile && profile.levels && profile.levels[subjectId];
    return Number(n) || 1;
  }
  function setLevel(profileId, subjectId, level) {
    const p = loadProfiles().find((x) => x.id === profileId);
    if (!p) return;
    updateProfile(profileId, { levels: { ...(p.levels || {}), [subjectId]: level } });
  }
  function autoReadOn(profile) { return !profile || profile.autoRead !== false; }

  function progressKey(profileId) { return `family-app.progress.${profileId}`; }
  function loadProgress(profileId) {
    const raw = getData(progressKey(profileId), []);
    return Array.isArray(raw) ? raw : [];
  }
  function recordProgress(profileId, entry) {
    const list = loadProgress(profileId);
    list.unshift({ ...entry, at: new Date().toISOString() });
    setData(progressKey(profileId), list.slice(0, 200));
  }
  function deleteProgressForProfile(profileId) { localStorage.removeItem(progressKey(profileId)); }

  // ---------- shared state ----------
  let subject = null;
  let level = 1;
  let area = null;

  function me() { return getActiveProfile(); }
  function say(text) { if (text) Voice.speak(text); }
  function autoSay(text) { if (autoReadOn(me())) say(text); }

  // ---------- subject menu ----------
  const AREAS = [
    { id: 'practice', label: 'Practice', emoji: '📝' },
    { id: 'memory', label: 'Memory Match', emoji: '🃏' },
    { id: 'war', label: 'War', emoji: '🎴' },
    { id: 'hidden', label: 'Hidden Pictures', emoji: '🔍' },
  ];

  function openSubject(subjectId) {
    subject = SUBJECTS[subjectId];
    const profile = me();
    if (!subject || !profile) return;
    level = Math.min(levelFor(profile, subject.id), subject.levels.length);
    $('subject-title').textContent = subject.label;
    const lv = subject.levels.find((l) => l.n === level) || subject.levels[0];
    const chip = $('subject-level');
    chip.innerHTML = `Level ${level}`;
    chip.appendChild(Voice.button(`Level ${level}. ${lv.name}.`));
    const tiles = $('subject-tiles');
    tiles.innerHTML = '';
    tiles.dataset.accent = subject.accent;
    // A subject can choose its areas, including its own extra games (Reading: Letter Snap,
    // Mystery Animal).
    const areas = (subject.areas || AREAS.map((a) => a.id))
      .map((id) => AREAS.find((a) => a.id === id) || (subject.extraAreas && subject.extraAreas[id] && { id, ...subject.extraAreas[id] }))
      .filter(Boolean);
    const subjectScreen = document.getElementById('subject-screen');
    if (subject.id === 'reading' && window.KidZoneReadingCarousel) {
      // Reading gets the artwork carousel (reading-carousel.js); Math keeps the plain tile grid
      // below. To add a Reading activity: add it to areas/extraAreas above and drop
      // assets/reading-carousel/<id>.png -- no layout edits needed here.
      subjectScreen.classList.add('kz-reading-redesign');
      KidZoneReadingCarousel.mount($('kz-reading-carousel'), areas.map((a) => ({
        id: a.id, name: (subject.areaLabels && subject.areaLabels[a.id]) || a.label, image: 'assets/reading-carousel/' + a.id + '.png',
      })), (item) => startArea(item.id));
    } else {
      subjectScreen.classList.remove('kz-reading-redesign');
      areas.forEach((a) => {
        const label = (subject.areaLabels && subject.areaLabels[a.id]) || a.label;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'section-tile area-tile';
        btn.dataset.accent = subject.accent;
        btn.innerHTML = `<span class="section-tile-icon">${a.emoji}</span><span class="section-tile-label">${label}</span>`;
        if (a.id === 'practice') btn.innerHTML += '<span class="soon-badge more-coins">More coins</span>';
        btn.appendChild(Voice.button(label, 'corner'));
        btn.addEventListener('click', () => startArea(a.id));
        tiles.appendChild(btn);
      });
    }
    AppBridge.showScreen('subject-screen');
  }

  $('subject-back-btn').addEventListener('click', () => AppBridge.enterHome());
  $('kz-reading-home').addEventListener('click', () => AppBridge.enterHome());
  $('kz-reading-settings').addEventListener('click', () => {
    // Same gear used on the kid home screen and the redesigned Games screen (js/app.js,
    // js/games.js) -- not a second settings path, just another trigger for it.
    const settings = document.getElementById('home-parent-settings') || document.getElementById('parent-entry-btn');
    if (settings) settings.click();
    else AppBridge.showToast('Open parent settings from the home screen.');
  });

  function startArea(id) {
    area = id;
    if (id === 'practice') Practice.start();
    else if (id === 'memory') {
      if (subject.id === 'reading' && window.MemoryMatchGame) { MemoryMatchGame.open(backToMenu); AppBridge.showScreen('memory-match-screen'); }
      else Memory.start();
    }
    else if (id === 'war') War.start();
    else if (id === 'hidden') Hidden.start();
    else if (subject.extraAreas && subject.extraAreas[id]) subject.extraAreas[id].start();
  }

  function backToMenu() {
    speechSynthesis && speechSynthesis.cancel && speechSynthesis.cancel();
    openSubject(subject.id);
  }
  ['practice-back-btn', 'memory-back-btn', 'war-back-btn', 'hidden-back-btn'].forEach((id) => $(id).addEventListener('click', backToMenu));

  // ---------- end of a round: stars, coins, scores ----------
  function finishRound({ correct, total, text, sayText }) {
    const profile = me();
    if (!profile) return;
    const ratio = total ? correct / total : 1;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : 1;
    const rule = getCoinRules().sections[subject.id];
    const amount = area === 'practice' ? rule.perItem : rule.gamePerItem;
    const areaLabel = (subject.areaLabels && subject.areaLabels[area])
      || (AREAS.find((a) => a.id === area) || {}).label
      || (subject.extraAreas && subject.extraAreas[area] && subject.extraAreas[area].label)
      || area;
    const result = earnCoins(profile.id, subject.id, { amount, label: `${subject.label}: ${areaLabel}`, emoji: subject.emoji });
    recordProgress(profile.id, { subject: subject.id, area, level, correct, total });

    $('round-stars').innerHTML = '⭐'.repeat(stars) + '<span class="dim">⭐</span>'.repeat(3 - stars);
    $('round-text').textContent = text;
    const coinsEl = $('round-coins');
    let coinWords;
    if (result.amount > 0) {
      coinsEl.textContent = `+${result.amount} 🪙`;
      coinsEl.className = 'round-coins';
      coinWords = `You earned ${AppBridge.coinWords(result.amount)}!`;
    } else {
      coinsEl.textContent = `All ${subject.label.toLowerCase()} coins earned today 🌟`;
      coinsEl.className = 'round-coins done';
      coinWords = `You earned all your ${subject.label.toLowerCase()} coins today.`;
    }
    $('round-overlay').classList.remove('hidden');
    say(`${sayText || text} ${coinWords}`);
  }

  $('round-again-btn').addEventListener('click', () => {
    $('round-overlay').classList.add('hidden');
    startArea(area);
  });
  $('round-done-btn').addEventListener('click', () => {
    $('round-overlay').classList.add('hidden');
    backToMenu();
  });

  function praise() { return pick(PRAISE); }

  // ================= Practice =================
  const Practice = (() => {
    let i = 0, total = 0, correct = 0, firstTry = true, q = null, locked = false;

    function start() {
      i = 0;
      correct = 0;
      total = subject.questionCount(level);
      $('practice-title').textContent = `${subject.label} Practice`;
      AppBridge.showScreen('practice-screen');
      next();
    }

    function next() {
      q = subject.question(level);
      firstTry = true;
      locked = false;
      const dots = $('practice-progress');
      dots.innerHTML = Array.from({ length: total }, (_, k) => `<i class="${k < i ? 'done' : k === i ? 'now' : ''}"></i>`).join('');
      $('practice-question').innerHTML = q.html;
      const answers = $('practice-answers');
      answers.innerHTML = '';
      answers.className = `practice-answers n${q.answers.length}${q.answerClass ? ` ${q.answerClass}` : ''}`;
      q.answers.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'answer-btn';
        b.innerHTML = a.html;
        b.addEventListener('click', () => choose(a, b));
        answers.appendChild(b);
      });
      autoSay(q.say);
    }

    function choose(a, btn) {
      if (locked) return;
      if (a.value === q.correct) {
        locked = true;
        btn.classList.add('correct');
        if (firstTry) correct++;
        say(q.praise || praise());
        setTimeout(() => {
          i++;
          if (i >= total) {
            finishRound({ correct, total, text: `${correct} out of ${total} right on the first try!`, sayText: `Great job! You got ${correct} out of ${total}.` });
          } else next();
        }, 1100);
      } else {
        firstTry = false;
        btn.classList.add('wrong');
        btn.disabled = true;
        say(a.sayWrong || 'Try again!');
      }
    }

    $('practice-replay-btn').addEventListener('click', () => q && say(q.say));
    return { start };
  })();

  // ================= Memory Match (Math only -- Reading has its own castle-themed game) =================
  const Memory = (() => {
    let cards = [], open = [], matched = 0, moves = 0, pairs = 0, busy = false;

    function start() {
      const list = subject.memoryPairs(level);
      pairs = list.length;
      matched = 0;
      moves = 0;
      open = [];
      busy = false;
      cards = shuffle(list.flatMap((p) => [{ key: p.key, ...p.a }, { key: p.key, ...p.b }]));
      const grid = $('memory-grid');
      grid.innerHTML = '';
      grid.className = `memory-grid c${cards.length}`;
      cards.forEach((c, idx) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'memory-card';
        el.innerHTML = `<span class="memory-face front">${c.html}</span><span class="memory-face back">?</span>`;
        el.addEventListener('click', () => flip(idx, el));
        c.el = el;
        grid.appendChild(el);
      });
      $('memory-status').textContent = `Find the ${pairs} pairs!`;
      AppBridge.showScreen('memory-screen');
      autoSay(subject.memoryIntro || 'Flip two cards to find a match!');
    }

    function flip(idx, el) {
      const c = cards[idx];
      if (busy || c.matched || open.includes(c)) return;
      el.classList.add('flipped');
      if (c.say) say(c.say);
      open.push(c);
      if (open.length < 2) return;
      moves++;
      const [a, b] = open;
      if (a.key === b.key) {
        const finishMatch = () => {
          a.matched = b.matched = true;
          a.el.classList.add('matched');
          b.el.classList.add('matched');
          open = [];
          matched++;
          $('memory-status').textContent = `${matched} of ${pairs} pairs found`;
          if (matched === pairs) {
            setTimeout(() => {
              const best = pairs + 2;
              const score = moves <= best ? pairs : Math.max(1, pairs - Math.ceil((moves - best) / 2));
              finishRound({ correct: score, total: pairs, text: `You found all ${pairs} pairs in ${moves} tries!`, sayText: `You found all the pairs!` });
            }, 900);
          }
        };
        setTimeout(() => say(praise()), 450);
        finishMatch();
      } else {
        busy = true;
        setTimeout(() => {
          a.el.classList.remove('flipped');
          b.el.classList.remove('flipped');
          open = [];
          busy = false;
        }, 1300);
      }
    }
    return { start };
  })();

  // ================= War =================
  const War = (() => {
    const ROUNDS = 8;
    const BUDDIES = [{ e: '🐻', name: 'Bear' }, { e: '🦊', name: 'Fox' }, { e: '🐼', name: 'Panda' }, { e: '🐯', name: 'Tiger' }];
    let round = 0, mine = null, theirs = null, pot = 0, myCards = 0, theirCards = 0, rightTaps = 0, tries = 0, buddy = null, waitingTap = false;

    function start() {
      round = 0; pot = 0; myCards = 0; theirCards = 0; rightTaps = 0; tries = 0;
      buddy = pick(BUDDIES);
      $('war-buddy').textContent = buddy.e;
      $('war-buddy-name').textContent = buddy.name;
      $('war-theirs-label').textContent = `${buddy.name}'s card`;
      $('war-mine').innerHTML = '';
      $('war-theirs').innerHTML = '';
      $('war-mine').className = 'war-card down';
      $('war-theirs').className = 'war-card down';
      updateScore();
      setPrompt('Tap Flip to start!');
      $('war-flip-btn').classList.remove('hidden');
      AppBridge.showScreen('war-screen');
      autoSay(`Let's play War with ${buddy.name}! Tap Flip.`);
    }

    function updateScore() {
      $('war-score-me').textContent = myCards;
      $('war-score-them').textContent = theirCards;
      $('war-round').textContent = `Flip ${Math.min(round + 1, ROUNDS)} of ${ROUNDS}`;
    }
    function setPrompt(t) { $('war-prompt').textContent = t; }

    function flipCards() {
      $('war-flip-btn').classList.add('hidden');
      mine = subject.warCard(level);
      theirs = subject.warCard(level);
      if (theirs.value === mine.value && Math.random() < 0.6) theirs = subject.warCard(level); // ties are rare
      pot += 2;
      ['mine', 'theirs'].forEach((who) => {
        const el = $(`war-${who}`);
        el.className = 'war-card';
        el.innerHTML = (who === 'mine' ? mine : theirs).html;
      });
      waitingTap = true;
      setPrompt(subject.warPrompt);
      const sayCards = mine.say && theirs.say ? ` Your card: ${mine.say}. ${buddy.name}'s card: ${theirs.say}.` : '';
      autoSay(`${subject.warPrompt}${sayCards}`);
    }

    function tap(who) {
      if (!waitingTap) return;
      const picked = who === 'mine' ? mine : theirs;
      const other = who === 'mine' ? theirs : mine;
      const el = $(`war-${who}`);
      if (mine.value === theirs.value) {
        waitingTap = false;
        rightTaps++;
        tries++;
        setPrompt('Same! War! Flip again. The winner takes them all!');
        say('They are the same! War! Flip again, and the winner takes them all!');
        afterRound();
        return;
      }
      if (picked.value > other.value) {
        waitingTap = false;
        tries++;
        rightTaps++;
        el.classList.add('win');
        const iWin = who === 'mine';
        if (iWin) myCards += pot; else theirCards += pot;
        const msg = iWin ? `${praise()} Your card wins!` : `${praise()} ${buddy.name}'s card is more. ${buddy.name} gets these.`;
        setPrompt(iWin ? '🎉 Your card wins!' : `${buddy.e} ${buddy.name} wins these`);
        say(msg);
        pot = 0;
        afterRound();
      } else {
        tries++;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        say('Look again!');
      }
    }

    function afterRound() {
      round++;
      updateScore();
      setTimeout(() => {
        if (round >= ROUNDS && pot === 0) {
          const result = myCards > theirCards ? 'You won the game!' : myCards < theirCards ? `${buddy.name} won this time!` : "It's a tie!";
          finishRound({ correct: rightTaps, total: tries || 1, text: `${result} You: ${myCards} cards. ${buddy.name}: ${theirCards}.`, sayText: result });
        } else {
          if (round >= ROUNDS) round = ROUNDS - 1; // a war on the last flip gets one more flip
          $('war-flip-btn').classList.remove('hidden');
        }
      }, 1500);
    }

    $('war-flip-btn').addEventListener('click', flipCards);
    $('war-mine').addEventListener('click', () => tap('mine'));
    $('war-theirs').addEventListener('click', () => tap('theirs'));
    $('war-replay-btn').addEventListener('click', () => say(waitingTap ? subject.warPrompt : $('war-prompt').textContent));
    return { start };
  })();

  // ================= Hidden Pictures =================
  const Hidden = (() => {
    const PUZZLES = 3;
    const COLS = 7, ROWS = 4;
    let n = 0, puzzle = null, found = 0, targets = 0, misses = 0;

    function start() {
      n = 0;
      misses = 0;
      AppBridge.showScreen('hidden-screen');
      next();
    }

    function next() {
      puzzle = subject.hiddenPuzzle(level);
      found = 0;
      targets = puzzle.items.filter((x) => x.target).length;
      $('hidden-goal').innerHTML = puzzle.html;
      $('hidden-count').textContent = `0 / ${targets}`;
      $('hidden-round').textContent = `Picture ${n + 1} of ${PUZZLES}`;
      const field = $('hidden-field');
      field.innerHTML = '';
      // A faint coloring page behind the items makes the "scene".
      const cat = pick(ANIMAL_CATEGORIES);
      const bg = document.createElement('img');
      bg.className = 'hidden-bg';
      bg.src = pick(cat.items).src;
      bg.alt = '';
      field.appendChild(bg);
      const cells = shuffle(Array.from({ length: COLS * ROWS }, (_, k) => k));
      shuffle(puzzle.items).slice(0, COLS * ROWS).forEach((item, k) => {
        const cell = cells[k];
        const col = cell % COLS, row = Math.floor(cell / COLS);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'hidden-item';
        el.innerHTML = item.html;
        el.style.left = `${((col + 0.5 + (Math.random() - 0.5) * 0.5) / COLS) * 100}%`;
        el.style.top = `${((row + 0.5 + (Math.random() - 0.5) * 0.45) / ROWS) * 100}%`;
        // Numbers and words tilt only a little, so a 6 never looks like a 9.
        const tilt = /hidden-(num|word)/.test(item.html) ? 12 : 35;
        el.style.setProperty('--rot', `${rand(-tilt, tilt)}deg`);
        el.style.setProperty('--scale', (0.85 + Math.random() * 0.45).toFixed(2));
        el.addEventListener('click', () => tapItem(item, el));
        field.appendChild(el);
      });
      autoSay(puzzle.say);
    }

    function tapItem(item, el) {
      if (el.classList.contains('found')) return;
      if (item.target) {
        el.classList.add('found');
        found++;
        $('hidden-count').textContent = `${found} / ${targets}`;
        say(puzzle.countAloud ? String(found) : found === targets ? praise() : pick(['Yes!', 'Found one!', 'Good eye!']));
        if (found === targets) {
          setTimeout(() => {
            if (puzzle.countAloud) say(`You found ${targets}!`);
            n++;
            if (n >= PUZZLES) {
              const score = Math.max(1, PUZZLES - Math.floor(misses / 4));
              finishRound({ correct: score, total: PUZZLES, text: `You found everything in all ${PUZZLES} pictures!`, sayText: 'You found them all!' });
            } else setTimeout(next, puzzle.countAloud ? 1400 : 300);
          }, 700);
        }
      } else {
        misses++;
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
      }
    }

    $('hidden-replay-btn').addEventListener('click', () => puzzle && say(puzzle.say));
    return { start };
  })();

  return {
    register, openSubject, levelFor, setLevel, autoReadOn, loadProgress, deleteProgressForProfile, SUBJECTS,
    // for a subject's own extra games
    finishRound, backToMenu, say, autoSay, praise, currentLevel: () => level, me,
  };
})();

Learning.register(MathContent);
