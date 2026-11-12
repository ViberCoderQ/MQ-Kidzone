// Math content for every level: Practice questions and the cards/puzzles the three games use.
// The game engines (js/learning.js) don't know anything about math -- they ask a subject like
// this one for questions, card pairs, war cards and hidden-picture puzzles. Reading (phase 6)
// plugs into the same engines the same way.
const LearnUtil = (() => {
  const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // `count` distinct numbers including `correct`, close to it, within [min, max].
  function numberChoices(correct, count, min, max) {
    const set = new Set([correct]);
    let spread = 2;
    let guard = 0;
    while (set.size < count && guard++ < 200) {
      const n = correct + rand(-spread, spread);
      if (n >= min && n <= max) set.add(n);
      if (guard % 10 === 0) spread++;
    }
    for (let n = min; set.size < count && n <= max; n++) set.add(n);
    return shuffle([...set]);
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return { rand, pick, shuffle, numberChoices, esc };
})();

const MathContent = (() => {
  const { rand, pick, shuffle, numberChoices } = LearnUtil;

  const ANIMALS = [
    { e: '🐶', one: 'dog', many: 'dogs' }, { e: '🐱', one: 'cat', many: 'cats' }, { e: '🐸', one: 'frog', many: 'frogs' },
    { e: '🐢', one: 'turtle', many: 'turtles' }, { e: '🦁', one: 'lion', many: 'lions' }, { e: '🐵', one: 'monkey', many: 'monkeys' },
    { e: '🐟', one: 'fish', many: 'fish' }, { e: '🦖', one: 'dinosaur', many: 'dinosaurs' }, { e: '🐞', one: 'ladybug', many: 'ladybugs' },
    { e: '🐰', one: 'bunny', many: 'bunnies' }, { e: '🐧', one: 'penguin', many: 'penguins' }, { e: '🦊', one: 'fox', many: 'foxes' },
  ];
  const THINGS = [
    { e: '🍎', many: 'apples' }, { e: '⚽', many: 'soccer balls' }, { e: '🏈', many: 'footballs' }, { e: '⭐', many: 'stars' },
    { e: '🍪', many: 'cookies' }, { e: '🎈', many: 'balloons' },
  ];

  const LEVELS = [
    { n: 1, name: 'Find the number', note: 'Hear a number from 1 to 10 and tap it' },
    { n: 2, name: 'Count the pictures', note: 'Count up to 10 animals' },
    { n: 3, name: 'Picture adding within 5', note: 'Add two small groups of pictures' },
    { n: 4, name: 'Adding within 10', note: 'Like 3 + 4' },
    { n: 5, name: 'Taking away within 10', note: 'Like 9 − 3' },
    { n: 6, name: 'Adding and taking away within 20', note: 'Like 8 + 7 or 15 − 6' },
    { n: 7, name: 'Two-digit adding and taking away', note: 'Like 34 + 25 (no carrying)' },
  ];

  const group = (emoji, n, cls) => `<span class="emoji-group ${cls || ''}">${emoji.repeat(n)}</span>`;
  const dots = (n) => `<span class="dot-group">${'<i></i>'.repeat(n)}</span>`;

  // A fact (sum or difference) for levels 4-7: { a, b, op, answer, text, say }
  function fact(level) {
    let a, b, op;
    if (level <= 4) { op = '+'; a = rand(0, 9); b = rand(1, 10 - a); }
    else if (level === 5) { op = '−'; a = rand(2, 10); b = rand(0, a); }
    else if (level === 6) {
      op = Math.random() < 0.5 ? '+' : '−';
      if (op === '+') { a = rand(2, 15); b = rand(1, 20 - a); } else { a = rand(8, 20); b = rand(1, a); }
    } else {
      op = Math.random() < 0.5 ? '+' : '−';
      const at = rand(1, 8), ao = rand(0, 8);
      if (op === '+') { const bt = rand(1, 9 - at), bo = rand(0, 9 - ao); a = at * 10 + ao; b = bt * 10 + bo; }
      else { const bt = rand(0, at), bo = rand(0, ao); a = at * 10 + ao; b = bt * 10 + bo; if (b === 0) b = 10; }
    }
    const answer = op === '+' ? a + b : a - b;
    return { a, b, op, answer, text: `${a} ${op} ${b}`, say: `${a} ${op === '+' ? 'plus' : 'take away'} ${b}` };
  }

  const maxFor = (level) => (level <= 3 ? 10 : level <= 5 ? 10 : level === 6 ? 20 : 99);

  // ---------- Practice ----------
  function questionCount(level) { return level <= 3 ? 5 : 8; }

  function question(level) {
    if (level === 1) {
      const n = rand(1, 10);
      return {
        say: `Tap ${n}.`,
        html: '<div class="q-ear">👂</div><div class="q-sub">Listen, then tap the number</div>',
        answers: numberChoices(n, 3, 1, 10).map((v) => ({ value: v, html: String(v) })),
        correct: n,
      };
    }
    if (level === 2) {
      const a = pick(ANIMALS);
      const n = rand(1, 10);
      return {
        say: `How many ${n === 1 ? a.one : a.many}?`,
        html: group(a.e, n, 'count'),
        answers: numberChoices(n, 3, 1, 10).map((v) => ({ value: v, html: String(v) })),
        correct: n,
      };
    }
    if (level === 3) {
      const t = pick(THINGS);
      const a = rand(1, 4);
      const b = rand(1, 5 - a);
      return {
        say: `${a} plus ${b}. How many ${t.many} in all?`,
        html: `<div class="q-picture-sum"><span>${group(t.e, a)}<b>${a}</b></span><em>+</em><span>${group(t.e, b)}<b>${b}</b></span></div>`,
        answers: numberChoices(a + b, 3, 1, 6).map((v) => ({ value: v, html: String(v) })),
        correct: a + b,
      };
    }
    const f = fact(level);
    return {
      say: `${f.say}.`,
      html: `<div class="q-fact">${f.text} = <span class="q-blank">?</span></div>`,
      answers: numberChoices(f.answer, 4, 0, maxFor(level)).map((v) => ({ value: v, html: String(v) })),
      correct: f.answer,
    };
  }

  // ---------- Memory Match ----------
  function pairCount(level) { return level <= 2 ? 3 : level <= 5 ? 4 : 6; }

  function memoryPairs(level) {
    const count = pairCount(level);
    if (level <= 3) {
      const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, count);
      return nums.map((n) => ({
        key: `n${n}`,
        a: { html: `<span class="card-number">${n}</span>`, say: String(n) },
        b: { html: dots(n), say: '' },
      }));
    }
    const used = new Set();
    const pairs = [];
    let guard = 0;
    while (pairs.length < count && guard++ < 500) {
      const f = fact(level);
      if (used.has(f.answer)) continue;
      used.add(f.answer);
      pairs.push({
        key: `f${f.answer}`,
        a: { html: `<span class="card-fact">${f.text}</span>`, say: f.say },
        b: { html: `<span class="card-number">${f.answer}</span>`, say: String(f.answer) },
      });
    }
    return pairs;
  }

  // ---------- War ----------
  // Both players flip a card; he taps the card that is MORE. Levels 1-3 show pictures to
  // count, levels 4+ show facts he works out first.
  function warCard(level) {
    if (level <= 3) {
      const n = rand(1, level === 1 ? 5 : 10);
      const a = pick(ANIMALS);
      return { value: n, html: group(a.e, n, 'war'), say: '' };
    }
    const f = fact(level);
    return { value: f.answer, html: `<span class="card-fact">${f.text}</span>`, say: f.say };
  }
  const warPrompt = 'Which card is more? Tap it!';

  // ---------- Hidden Pictures ----------
  // Returns { say, html, items: [{ html, target }], countAloud }
  function hiddenPuzzle(level) {
    const filler = shuffle(['🌳', '🌸', '🍄', '🪨', '🌿', '🌻', '🐚', '🍃', '🌵', '🪵']).slice(0, 5);
    const fillerItems = (n) => Array.from({ length: n }, () => ({ html: pick(filler), target: false }));
    if (level === 2) {
      const a = pick(ANIMALS);
      const n = rand(3, 6);
      const others = ANIMALS.filter((x) => x !== a);
      return {
        say: `Find all the ${a.many}! Count them as you find them.`,
        html: `<span class="hidden-goal">${a.e}</span>`,
        countAloud: true,
        items: [
          ...Array.from({ length: n }, () => ({ html: a.e, target: true })),
          ...Array.from({ length: 10 }, () => ({ html: pick(others).e, target: false })),
          ...fillerItems(8),
        ],
      };
    }
    let target, sayGoal, goalHtml, distractNums;
    if (level <= 3) {
      target = rand(1, 9);
      sayGoal = `Find all the number ${target}s!`;
      goalHtml = `<span class="hidden-goal num">${target}</span>`;
      distractNums = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== target);
    } else {
      const f = fact(level);
      target = f.answer;
      sayGoal = `${f.say}. Find the answer! There are 3 of them.`;
      goalHtml = `<span class="hidden-goal fact">${f.text} = ?</span>`;
      distractNums = numberChoices(target, 6, 0, maxFor(level)).filter((x) => x !== target);
    }
    return {
      say: sayGoal,
      html: goalHtml,
      countAloud: false,
      items: [
        ...Array.from({ length: 3 }, () => ({ html: `<span class="hidden-num">${target}</span>`, target: true })),
        ...Array.from({ length: 12 }, () => ({ html: `<span class="hidden-num">${pick(distractNums)}</span>`, target: false })),
        ...fillerItems(9),
      ],
    };
  }

  return {
    id: 'math',
    label: 'Math',
    emoji: '🔢',
    accent: 'blue',
    levels: LEVELS,
    questionCount,
    question,
    pairCount,
    memoryPairs,
    warCard,
    warPrompt,
    hiddenPuzzle,
  };
})();
