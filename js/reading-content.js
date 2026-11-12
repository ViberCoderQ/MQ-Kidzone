// Reading content for every level, plus Reading's own games: Letter Snap and Mystery Animal (a
// gentle hangman). Practice and Hidden Pictures run on the shared engines in js/learning.js.
// Memory Match is its own separate game -- see js/memory-match-game.js.
const ReadingContent = (() => {
  const { rand, pick, shuffle, esc } = LearnUtil;
  const $ = (id) => document.getElementById(id);
  const L = () => Learning;

  const LEVELS = [
    { n: 1, name: 'Find the letter', note: 'Hear a letter name and tap it' },
    { n: 2, name: 'Letter sounds', note: 'Hear a sound and tap its letter' },
    { n: 3, name: 'Starting sounds', note: 'What does the picture start with?' },
    { n: 4, name: 'Sight words', note: 'Common words like the, and, is' },
    { n: 5, name: 'Three-letter words', note: 'Read words like cat, dog, sun' },
    { n: 6, name: 'Short sentences', note: 'Read a short sentence and pick the picture' },
  ];

  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  // How the voice should say each letter's NAME (a lone "A" is often read as "uh").
  const LETTER_NAMES = { A: 'ay', B: 'bee', C: 'see', D: 'dee', E: 'ee', F: 'eff', G: 'jee', H: 'aitch', I: 'eye', J: 'jay', K: 'kay', L: 'el', M: 'em', N: 'en', O: 'oh', P: 'pee', Q: 'cue', R: 'are', S: 'ess', T: 'tee', U: 'you', V: 'vee', W: 'double you', X: 'ex', Y: 'why', Z: 'zee' };
  const letterName = (l) => LETTER_NAMES[l.toUpperCase()] || l;
  // Letter SOUNDS, spelled so the built-in voice gets close. Vowels use a key word instead.
  const LETTER_SOUNDS = { B: 'buh', C: 'kuh', D: 'duh', F: 'fff', G: 'guh', H: 'hhh', J: 'juh', K: 'kuh', L: 'lll', M: 'mmm', N: 'nnn', P: 'puh', R: 'rrr', S: 'sss', T: 'tuh', V: 'vvv', W: 'wuh', Y: 'yuh', Z: 'zzz' };

  // Pictures and the words they stand for (used for starting sounds, hidden pictures).
  const PICS = [
    ['apple', '🍎'], ['ant', '🐜'], ['ball', '⚽'], ['bus', '🚌'], ['bear', '🐻'], ['bee', '🐝'], ['banana', '🍌'], ['bed', '🛏️'], ['bat', '🦇'],
    ['cat', '🐱'], ['car', '🚗'], ['cow', '🐮'], ['cake', '🎂'], ['cup', '🥤'], ['carrot', '🥕'], ['dog', '🐶'], ['duck', '🦆'], ['drum', '🥁'],
    ['door', '🚪'], ['deer', '🦌'], ['egg', '🥚'], ['elephant', '🐘'], ['fish', '🐟'], ['fox', '🦊'], ['frog', '🐸'], ['fire', '🔥'], ['flower', '🌸'],
    ['goat', '🐐'], ['grapes', '🍇'], ['gift', '🎁'], ['guitar', '🎸'], ['hat', '🎩'], ['horse', '🐴'], ['house', '🏠'], ['heart', '❤️'], ['hen', '🐔'],
    ['juice', '🧃'], ['jet', '✈️'], ['kite', '🪁'], ['key', '🔑'], ['kangaroo', '🦘'], ['lion', '🦁'], ['leaf', '🍃'], ['lemon', '🍋'], ['ladybug', '🐞'],
    ['lock', '🔒'], ['moon', '🌙'], ['mouse', '🐭'], ['monkey', '🐵'], ['milk', '🥛'], ['mushroom', '🍄'], ['nest', '🪺'], ['nose', '👃'], ['nut', '🥜'],
    ['octopus', '🐙'], ['pig', '🐷'], ['pizza', '🍕'], ['pear', '🍐'], ['penguin', '🐧'], ['pencil', '✏️'], ['popcorn', '🍿'], ['queen', '👑'],
    ['rabbit', '🐰'], ['rocket', '🚀'], ['rainbow', '🌈'], ['ring', '💍'], ['robot', '🤖'], ['sun', '☀️'], ['snake', '🐍'], ['star', '⭐'], ['sock', '🧦'],
    ['snail', '🐌'], ['spider', '🕷️'], ['tiger', '🐯'], ['tree', '🌳'], ['train', '🚂'], ['turtle', '🐢'], ['tomato', '🍅'], ['tent', '⛺'],
    ['umbrella', '☂️'], ['van', '🚐'], ['violin', '🎻'], ['whale', '🐳'], ['watch', '⌚'], ['worm', '🪱'], ['wolf', '🐺'], ['watermelon', '🍉'],
    ['yarn', '🧶'], ['yo-yo', '🪀'], ['zebra', '🦓'],
  ].map(([w, e]) => ({ w, e, l: w[0].toUpperCase() }));
  const picsFor = (letter) => PICS.filter((p) => p.l === letter);
  const LETTERS_WITH_PICS = ABC.filter((l) => picsFor(l).length > 0);
  const LETTERS_WITH_3 = ABC.filter((l) => picsFor(l).length >= 3);

  // Three-letter words with pictures (levels 5-6).
  const CVC = [
    ['cat', '🐱'], ['dog', '🐶'], ['pig', '🐷'], ['sun', '☀️'], ['bus', '🚌'], ['hat', '🎩'], ['bed', '🛏️'], ['cup', '🥤'], ['fox', '🦊'],
    ['hen', '🐔'], ['bat', '🦇'], ['box', '📦'], ['bug', '🐛'], ['cow', '🐮'], ['map', '🗺️'], ['pan', '🍳'], ['pen', '🖊️'], ['web', '🕸️'],
    ['bag', '👜'], ['leg', '🦵'], ['log', '🪵'], ['rat', '🐀'], ['van', '🚐'], ['ant', '🐜'], ['egg', '🥚'], ['owl', '🦉'], ['net', '🥅'], ['mug', '☕'],
  ].map(([w, e]) => ({ w, e }));

  // Real photos, added through the in-app Photo Editor (Parent Area -> Photo Editor -> Reading
  // Pictures), that take over for a word's built-in emoji wherever that word appears in Letter
  // Snap or Mystery Animal.
  const _customPicsByWord = new Map(
    (typeof CUSTOM_READING_PICS !== 'undefined' ? CUSTOM_READING_PICS : []).map((p) => [p.word.toLowerCase(), p.src])
  );
  function picContent(word, emoji) {
    const src = _customPicsByWord.get(String(word).toLowerCase());
    return src ? `<img src="${src}" alt="" class="word-pic-img">` : emoji;
  }

  // Mystery Animal's word list -- hoisted out of its own IIFE (below) so allReadingPicWords() can
  // see it too, for the Photo Editor's Reading Pictures admin grid.
  const ANIMALS = [
    ['cat', '🐱'], ['dog', '🐶'], ['pig', '🐷'], ['cow', '🐮'], ['fox', '🦊'], ['owl', '🦉'], ['hen', '🐔'], ['bat', '🦇'], ['ant', '🐜'], ['bee', '🐝'],
    ['lion', '🦁'], ['bear', '🐻'], ['frog', '🐸'], ['duck', '🦆'], ['fish', '🐟'], ['goat', '🐐'], ['seal', '🦭'], ['wolf', '🐺'], ['deer', '🦌'], ['crab', '🦀'],
    ['tiger', '🐯'], ['zebra', '🦓'], ['horse', '🐴'], ['snake', '🐍'], ['mouse', '🐭'], ['sheep', '🐑'], ['panda', '🐼'], ['koala', '🐨'], ['camel', '🐫'],
    ['llama', '🦙'], ['otter', '🦦'], ['whale', '🐳'], ['shark', '🦈'], ['snail', '🐌'], ['eagle', '🦅'],
  ].map(([w, e]) => ({ w: w.toUpperCase(), name: w, e }));

  const SIGHT = ['the', 'and', 'is', 'to', 'a', 'I', 'you', 'it', 'in', 'we', 'go', 'see', 'can', 'me', 'my', 'up', 'look', 'play', 'said', 'he', 'she', 'at', 'on', 'no', 'yes', 'big', 'run', 'come', 'here', 'like'];
  const RHYMES = [['cat', 'hat', 'bat', 'rat', 'mat', 'sat'], ['dog', 'log', 'hog', 'fog', 'jog'], ['pig', 'wig', 'big', 'dig', 'fig'], ['sun', 'bun', 'run', 'fun'], ['hen', 'pen', 'ten', 'men'], ['hop', 'mop', 'top', 'pop'], ['bug', 'mug', 'rug', 'hug'], ['bed', 'red', 'fed', 'led']];
  const SENTENCES = [
    (p) => `I see a ${p.w}.`, (p) => `The ${p.w} is big.`, (p) => `Look at the ${p.w}!`, (p) => `I like my ${p.w}.`, (p) => `Here is a ${p.w}.`, (p) => `Can you see the ${p.w}?`,
  ];

  const pic = (word, e) => `<span class="card-pic">${picContent(word, e)}</span>`;
  const otherLetters = (l, n) => shuffle(ABC.filter((x) => x !== l)).slice(0, n);

  // ---------- Practice ----------
  function questionCount(level) { return level <= 3 ? 5 : 6; }

  function question(level) {
    if (level === 1) {
      const l = pick(ABC);
      return {
        say: `Tap ${letterName(l)}.`,
        html: '<div class="q-ear">👂</div><div class="q-sub">Listen, then tap the letter</div>',
        answers: shuffle([l, ...otherLetters(l, 2)]).map((v) => ({ value: v, html: v })),
        correct: l,
      };
    }
    if (level === 2) {
      const l = pick(LETTERS_WITH_PICS);
      const key = pick(picsFor(l));
      const sound = LETTER_SOUNDS[l];
      return {
        say: sound ? `Which letter says ${sound}, like ${key.w}?` : `Which letter does ${key.w} start with?`,
        html: `<div class="q-ear">👂</div><div class="q-sub">Which letter makes the sound?</div>`,
        answers: shuffle([l, ...otherLetters(l, 2)]).map((v) => ({ value: v, html: v })),
        correct: l,
      };
    }
    if (level === 3) {
      const p = pick(PICS);
      return {
        say: `What does ${p.w} start with?`,
        html: `<div class="q-big-pic">${p.e}</div>`,
        answers: shuffle([p.l, ...otherLetters(p.l, 2)]).map((v) => ({ value: v, html: v })),
        correct: p.l,
      };
    }
    if (level === 4) {
      const w = pick(SIGHT);
      const others = shuffle(SIGHT.filter((x) => x !== w)).slice(0, 2);
      return {
        say: `Tap the word ${w === 'a' ? 'ay' : w}.`,
        html: '<div class="q-ear">👂</div><div class="q-sub">Listen, then tap the word</div>',
        answers: shuffle([w, ...others]).map((v) => ({ value: v, html: `<span class="answer-word">${esc(v)}</span>` })),
        correct: w,
      };
    }
    if (level === 5) {
      const p = pick(CVC);
      const others = shuffle(CVC.filter((x) => x.w !== p.w && (x.w[0] === p.w[0] || x.w[2] === p.w[2] || x.w[1] === p.w[1]))).slice(0, 2);
      while (others.length < 2) others.push(pick(CVC.filter((x) => x.w !== p.w && !others.includes(x))));
      return {
        say: 'Which word goes with the picture?',
        html: `<div class="q-big-pic">${p.e}</div>`,
        answers: shuffle([p, ...others]).map((x) => ({ value: x.w, html: `<span class="answer-word">${x.w}</span>` })),
        correct: p.w,
      };
    }
    // Level 6: read a sentence, tap the matching picture. The sentence isn't read aloud -- that's the reading.
    const p = pick(CVC);
    const others = shuffle(CVC.filter((x) => x.w !== p.w)).slice(0, 2);
    return {
      say: 'Read the sentence. Tap the picture that goes with it.',
      html: `<div class="q-sentence">${esc(pick(SENTENCES)(p))}</div>`,
      answers: shuffle([p, ...others]).map((x) => ({ value: x.w, html: `<span class="answer-pic">${x.e}</span>` })),
      correct: p.w,
    };
  }

  // Reading's Memory Match is a separate, self-contained castle-themed game (js/memory-match-game.js
  // + js/memory-match-words.js) with its own word catalog, reached straight from the subject menu --
  // it does not run through this file's question/puzzle generators.

  const praise = () => L().praise();

  // A small A-Z keyboard (same ABC order as the sign-in screen).
  function abcKeyboard(onKey, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'abc-keyboard small';
    ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ'].forEach((row) => {
      const r = document.createElement('div');
      r.className = 'abc-row';
      row.split('').forEach((l) => {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = 'abc-key';
        k.dataset.letter = l;
        k.textContent = l;
        k.addEventListener('click', () => onKey(l, k));
        r.appendChild(k);
      });
      wrap.appendChild(r);
    });
    return wrap;
  }

  // ---------- Hidden Pictures ----------
  function hiddenPuzzle(level) {
    // Decorations that are NOT in the word list (a 🌸 would be a "flower" for F, a 🌳 a "tree").
    const filler = shuffle(['🪨', '🐚', '🌿', '🍂', '🌾', '🪵']).slice(0, 4);
    const fill = (n) => Array.from({ length: n }, () => ({ html: pick(filler), target: false }));
    if (level <= 2) {
      const l = pick(ABC);
      const others = ABC.filter((x) => x !== l);
      return {
        say: `Find all the letter ${letterName(l)}s! There are 3.`,
        html: `<span class="hidden-goal word">${l}</span>`,
        items: [
          ...Array.from({ length: 3 }, () => ({ html: `<span class="hidden-num">${l}</span>`, target: true })),
          ...Array.from({ length: 14 }, () => ({ html: `<span class="hidden-num">${pick(others)}</span>`, target: false })),
          ...fill(7),
        ],
      };
    }
    if (level === 3) {
      const l = pick(LETTERS_WITH_3);
      const targets = shuffle(picsFor(l)).slice(0, 3);
      // C and K make the same sound, so a "cat" never sits in a K puzzle (or a "kite" in a C one).
      const soundAlike = { C: 'K', K: 'C' };
      const others = shuffle(PICS.filter((p) => p.l !== l && p.l !== soundAlike[l])).slice(0, 15);
      return {
        say: `Find 3 things that start with ${letterName(l)}!`,
        html: `<span class="hidden-goal word">${l}</span>`,
        items: [...targets.map((p) => ({ html: p.e, target: true })), ...others.map((p) => ({ html: p.e, target: false })), ...fill(5)],
      };
    }
    const words = level === 4 ? SIGHT.filter((w) => w.length > 1) : CVC.map((p) => p.w);
    const w = pick(words);
    const others = words.filter((x) => x !== w);
    return {
      say: `Find the word ${w}! There are 3.`,
      html: `<span class="hidden-goal word">${esc(w)}</span>`,
      items: [
        ...Array.from({ length: 3 }, () => ({ html: `<span class="hidden-word">${esc(w)}</span>`, target: true })),
        ...Array.from({ length: 14 }, () => ({ html: `<span class="hidden-word">${esc(pick(others))}</span>`, target: false })),
        ...fill(7),
      ],
    };
  }

  // ================= Letter Snap =================
  // A "match this" card stays put; cards flip one at a time. Tap Snap when they go together:
  // the picture starts with the letter (levels 1-3), the same word (level 4), or the words
  // rhyme (levels 5+). Untimed -- he taps Next to see the next card.
  const Snap = (() => {
    const GOAL = 5;
    let target = null, card = null, snaps = 0, mistakes = 0, flips = 0, locked = false;

    function makeTarget(level) {
      if (level <= 3) { const l = pick(LETTERS_WITH_3); return { kind: 'letter', l, html: `<span class="card-number">${l}</span>`, say: `Snap when the picture starts with ${letterName(l)}.` }; }
      if (level === 4) { const w = pick(SIGHT.filter((x) => x.length > 1)); return { kind: 'sight', w, html: `<span class="card-word">${esc(w)}</span>`, say: 'Snap when you see the same word.' }; }
      const fam = pick(RHYMES); const w = pick(fam);
      return { kind: 'rhyme', fam, w, html: `<span class="card-word">${w}</span>`, say: `Snap when the word rhymes with ${w}.` };
    }

    function makeCard(level) {
      const match = Math.random() < 0.4;
      if (target.kind === 'letter') {
        const alike = { C: 'K', K: 'C' }[target.l];
        const p = match ? pick(picsFor(target.l)) : pick(PICS.filter((x) => x.l !== target.l && x.l !== alike));
        return { match, html: pic(p.w, p.e), say: p.w };
      }
      if (target.kind === 'sight') {
        const w = match ? target.w : pick(SIGHT.filter((x) => x !== target.w && x.length > 1));
        return { match, html: `<span class="card-word">${esc(w)}</span>`, say: '' };
      }
      const w = match ? pick(target.fam.filter((x) => x !== target.w)) : pick(RHYMES.filter((f) => f !== target.fam).flat());
      return { match, html: `<span class="card-word">${w}</span>`, say: w };
    }

    function start() {
      const level = L().currentLevel();
      snaps = 0; mistakes = 0; flips = 0;
      target = makeTarget(level);
      $('snap-target').innerHTML = target.html;
      $('snap-count').textContent = `${snaps} / ${GOAL}`;
      AppBridge.showScreen('snap-screen');
      L().autoSay(`Letter Snap! ${target.say}`);
      setTimeout(next, 400);
    }

    function next() {
      const level = L().currentLevel();
      card = makeCard(level);
      flips++;
      locked = false;
      const el = $('snap-card');
      el.classList.remove('flip-in', 'win', 'shake');
      void el.offsetWidth;
      el.classList.add('flip-in');
      el.innerHTML = card.html;
      if (card.say && level !== 4) L().autoSay(card.say);
    }

    function snap() {
      if (locked) return;
      if (card.match) {
        locked = true;
        snaps++;
        $('snap-count').textContent = `${snaps} / ${GOAL}`;
        $('snap-card').classList.add('win');
        L().say(`Snap! ${L().praise()}`);
        if (snaps >= GOAL) {
          setTimeout(() => L().finishRound({ correct: Math.max(0, GOAL - Math.floor(mistakes / 2)), total: GOAL, text: `You found ${GOAL} snaps!`, sayText: `You found ${GOAL} snaps!` }), 900);
        } else setTimeout(next, 1100);
      } else {
        mistakes++;
        const el = $('snap-card');
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        L().say(target.kind === 'letter' ? `Not this one. ${card.say} starts with ${letterName(card.say[0])}.` : 'Not this one. Tap Next!');
      }
    }

    function skip() {
      if (locked) return;
      if (card.match) {
        mistakes++;
        L().say('Oops, that one was a match! Here comes another.');
      }
      next();
    }

    $('snap-btn').addEventListener('click', snap);
    $('snap-next-btn').addEventListener('click', skip);
    $('snap-back-btn').addEventListener('click', () => L().backToMenu());
    $('snap-replay-btn').addEventListener('click', () => L().say(`${target.say}${card && card.say && L().currentLevel() !== 4 ? ` This card: ${card.say}.` : ''}`));
    return { start };
  })();

  // ================= Mystery Animal (the gentle hangman) =================
  // Guess letters to fill in the animal's name; each right letter uncovers part of the hidden
  // picture. Each miss rolls away one of six soccer balls. Levels 1-3: easy mode (the word shows
  // faintly and its letters glow).
  const Mystery = (() => {
    const ROUNDS = 3;
    const BALLS = 6;
    let round = 0, solved = 0, animal = null, guessed = new Set(), balls = BALLS, done = false, kb = null, easy = false;

    function pickAnimal(level) {
      const maxLen = level <= 4 ? 4 : 5;
      const minLen = level >= 6 ? 4 : 3;
      return pick(ANIMALS.filter((a) => a.w.length <= maxLen && a.w.length >= minLen));
    }

    function start() {
      round = 0;
      solved = 0;
      AppBridge.showScreen('mystery-screen');
      nextAnimal();
    }

    function nextAnimal() {
      const level = L().currentLevel();
      easy = level <= 3;
      animal = pickAnimal(level);
      guessed = new Set();
      balls = BALLS;
      done = false;
      $('mystery-round').textContent = `Animal ${round + 1} of ${ROUNDS}`;
      $('mystery-pic').innerHTML = picContent(animal.name, animal.e);
      const tiles = $('mystery-tiles');
      tiles.innerHTML = Array.from({ length: 9 }, () => '<i></i>').join('');
      const kbBox = $('mystery-keyboard');
      kbBox.innerHTML = '';
      kb = abcKeyboard((l, key) => guess(l, key));
      kbBox.appendChild(kb);
      render();
      L().autoSay(easy ? 'Who is hiding? Tap the glowing letters to find out!' : `Who is hiding? Guess the letters! The word has ${animal.w.length} letters.`);
    }

    function render() {
      $('mystery-blanks').innerHTML = animal.w.split('').map((ch) => {
        const shown = guessed.has(ch) || done;
        return `<span class="word-blank${shown ? ' filled' : ''}${easy && !shown ? ' faint' : ''}">${shown || easy ? ch : ''}</span>`;
      }).join('');
      $('mystery-balls').innerHTML = '⚽'.repeat(balls) + '<span class="gone">⚽</span>'.repeat(BALLS - balls);
      if (easy && !done) {
        kb.querySelectorAll('.abc-key').forEach((k) => k.classList.toggle('glow', animal.w.includes(k.dataset.letter) && !guessed.has(k.dataset.letter)));
      }
      // Uncover tiles in step with how much of the word is found.
      const unique = new Set(animal.w.split(''));
      const found = [...unique].filter((c) => guessed.has(c)).length;
      const open = done ? 9 : Math.floor((found / unique.size) * 8);
      $('mystery-tiles').querySelectorAll('i').forEach((t, i) => t.classList.toggle('open', i < open || done));
    }

    function guess(letter, key) {
      if (done || guessed.has(letter) || key.disabled) return;
      key.disabled = true;
      if (animal.w.includes(letter)) {
        guessed.add(letter);
        key.classList.add('right');
        L().say(`Yes! ${letterName(letter)}!`);
        if (animal.w.split('').every((c) => guessed.has(c))) { finishAnimal(true); return; }
      } else {
        key.classList.add('wrong');
        balls--;
        L().say(`No ${letterName(letter)}.`);
        if (balls <= 0) { finishAnimal(false); return; }
      }
      render();
    }

    function finishAnimal(won) {
      done = true;
      if (won) solved++;
      render();
      setTimeout(() => L().say(won ? `It's a ${animal.name}! ${L().praise()}` : `It's a ${animal.name}! Let's try another!`), 300);
      setTimeout(() => {
        round++;
        if (round >= ROUNDS) {
          L().finishRound({ correct: solved, total: ROUNDS, text: `You found ${solved} of ${ROUNDS} mystery animals!`, sayText: `You found ${solved} mystery animals!` });
        } else nextAnimal();
      }, 2600);
    }

    $('mystery-back-btn').addEventListener('click', () => L().backToMenu());
    $('mystery-replay-btn').addEventListener('click', () => L().say(`Who is hiding? The word has ${animal ? animal.w.length : ''} letters.`));
    return { start };
  })();

  return {
    id: 'reading',
    label: 'Reading',
    emoji: '📚',
    accent: 'purple',
    levels: LEVELS,
    areas: ['practice', 'memory', 'snap', 'hidden', 'mystery'],
    extraAreas: {
      snap: { label: 'Letter Snap', emoji: '✋', start: () => Snap.start() },
      mystery: { label: 'Mystery Animal', emoji: '🕵️', start: () => Mystery.start() },
    },
    questionCount,
    question,
    hiddenPuzzle,
    // For the Photo Editor's Reading Pictures admin grid: every word used in Letter Snap (PICS) or
    // Mystery Animal (ANIMALS), deduped, with its original built-in emoji -- the admin grid checks
    // CUSTOM_READING_PICS itself to decide whether to show that or a photo.
    allReadingPicWords() {
      const seen = new Map();
      PICS.forEach((p) => seen.set(p.w, p.e));
      ANIMALS.forEach((a) => { if (!seen.has(a.name)) seen.set(a.name, a.e); });
      return Array.from(seen, ([word, emoji]) => ({ word, emoji }));
    },
  };
})();

Learning.register(ReadingContent);
