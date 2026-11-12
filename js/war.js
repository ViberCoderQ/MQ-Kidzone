// War: the actual card game. Two ways to play, sharing the same round rules:
//  - against another kid (a real game_sessions row, synced live through Supabase -- see games.js)
//  - against the computer (a purely local, in-memory session with no network/DB involvement at
//    all, since there's no second device that needs to see it)
// "p1" = the challenger, "p2" = the opponent -- each kid's own revealed flag/card lives in its own
// column/field so both sides can flip their own card at the same moment with zero write conflict.
//
// Note: there is a completely unrelated older #war-screen single-player math game elsewhere in
// index.html (a "higher card wins" number-comparison drill against a buddy bear) -- this file has
// nothing to do with that screen.
//
// Layout note: the original "War Adventure" handoff's demo board is a wide landscape layout with
// decks on the left/right and a table in the center. This app's screens are portrait-first (an
// iPad kiosk app), so that's adapted here as decks at top (opponent) and bottom (you), with a
// shared center "table" area in between where drawn cards actually land -- same deck -> table
// spatial idea, just rotated for a narrow vertical screen instead of a wide one.
//
// Animation note: a tapped card visually flies from your deck up to the center table (a real
// overlay element, not just a CSS transition on the card itself) before the actual game-state
// changes -- this matches the handoff's "animate before rerender" requirement. The OPPONENT's
// reveal (whether the computer or a remote kid) just appears directly without a fly animation:
// recreating a perfectly-timed cross-device flight animation over Supabase Realtime is a much
// bigger synchronization problem than this pass is scoped for, so that's a deliberate
// simplification, not an oversight.
//
// War-stakes note: on a tie, the game enters a real persisted 'war' phase. Each side independently
// re-taps their OWN deck (same gesture as a normal round) to deal their 3 face-down stakes + 1
// face-up decider in one action; the round only resolves once BOTH sides have dealt. A nested tie
// (the deciders match too) reuses those same two decider cards as the next round's trigger pair and
// repeats -- no new "tie" entries are pushed for that, so no card is ever double-counted. Only the
// current round's fan is ever shown on screen (`war_round_start` marks where it begins in
// `pot_history`); earlier rounds stay recorded for the eventual result text but aren't redrawn.
const War = (() => {
  const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
  const SUITS = ['S', 'H', 'D', 'C'];
  const RANK_WORDS = { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' };

  // ---------- visual themes ----------
  // One picked per game. A local (vs-computer) game picks randomly when it starts; a remote game
  // has no theme column to avoid a DB migration, so both devices instead derive the exact same
  // theme from the session's own id, which is automatically stable and shared with no round-trip.
  const THEMES = {
    castle: { name: 'Castle Clash', win: '✨' },
    jungle: { name: 'Jungle Temple', win: '🌿' },
    space: { name: 'Galactic Arena', win: '🌟' },
    ocean: { name: 'Sunken Ruins', win: '🫧' },
    pirate: { name: 'Pirate Harbor', win: '🏴‍☠️' },
    toys: { name: 'Toy Block Castle', win: '⭐' },
    volcano: { name: 'Volcanic Fortress', win: '🔥' },
    candy: { name: 'Candy Castle', win: '🍬' },
  };
  const THEME_KEYS = Object.keys(THEMES);
  function chooseTheme() { return THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)]; }
  function themeForSessionId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return THEME_KEYS[hash % THEME_KEYS.length];
  }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function buildFxSpans(themeKey) {
    const t = THEMES[themeKey] || THEMES.castle;
    const count = 6 + Math.floor(Math.random() * 5); // 6-10
    let html = '';
    for (let i = 0; i < count; i++) {
      const x = Math.round(Math.random() * 100);
      const delay = (Math.random() * 0.5).toFixed(2);
      html += `<span style="--x:${x}%;--delay:${delay}s">${t.win}</span>`;
    }
    return html;
  }

  function buildDeck() {
    const deck = [];
    SUITS.forEach((s) => RANKS.forEach((r) => deck.push(r + s)));
    return deck;
  }
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function rankValue(card) { return RANKS.indexOf(card[0]) + 2; }
  function rankLabel(card) { return card[0] === 'T' ? '10' : card[0]; }
  function rankWord(card) { return RANK_WORDS[card[0]] || rankLabel(card); }
  function suitSymbol(card) { return { S: '♠', H: '♥', D: '♦', C: '♣' }[card[1]]; }
  function isRed(card) { return card[1] === 'H' || card[1] === 'D'; }

  // Called once, whether starting a local computer game or accepting a real challenge. Decks start
  // at a full 26 each -- nobody's card is pre-dealt, so the deck count only ever drops at the
  // instant a card is actually tapped/played (see computeFlipPatch), never before.
  function buildInitialState() {
    const deck = shuffle(buildDeck());
    return {
      phase: 'flip',
      p1_deck: deck.slice(0, 26), p2_deck: deck.slice(26),
      p1_card: null, p2_card: null,
      p1_revealed: false, p2_revealed: false,
      pot_history: [], war_round_start: 0, round_winner_id: null,
    };
  }

  // ---------- pure round logic: takes a session-like object, returns a patch or null ----------
  // Draws the top card off MY OWN deck and reveals it in one atomic step -- this is the moment the
  // deck count actually decreases, matching "counts decrease when a card is played" rather than
  // pre-dealing it earlier and just flipping a card that was already removed from the count.
  function computeFlipPatch(session, meId) {
    const amIP1 = meId === session.challenger_id;
    const revealedCol = amIP1 ? 'p1_revealed' : 'p2_revealed';
    const cardCol = amIP1 ? 'p1_card' : 'p2_card';
    const deckCol = amIP1 ? 'p1_deck' : 'p2_deck';
    if (session[revealedCol]) return null;
    const deck = [...(session[deckCol] || [])];
    if (!deck.length) return null;
    const card = deck.shift();
    return { [revealedCol]: true, [cardCol]: card, [deckCol]: deck };
  }

  // A side with literally no cards left can't put anything into a war -- the other side (if they
  // still have cards) wins the whole game outright. If somehow both are empty at once, the
  // challenger keeps the same arbitrary tie-break the game has always used for that edge case.
  function warShortageWinner(session) {
    const p1Empty = session.p1_deck.length === 0;
    const p2Empty = session.p2_deck.length === 0;
    if (!p1Empty && !p2Empty) return null;
    if (p1Empty && p2Empty) return session.challenger_id;
    return p1Empty ? session.opponent_id : session.challenger_id;
  }

  function computeResolvePatch(session) {
    if (session.phase !== 'flip' || !session.p1_revealed || !session.p2_revealed) return null;
    const r1 = rankValue(session.p1_card);
    const r2 = rankValue(session.p2_card);
    if (r1 !== r2) {
      const winnerId = r1 > r2 ? session.challenger_id : session.opponent_id;
      return { phase: 'awaiting_collect', round_winner_id: winnerId };
    }
    // Tie -- record the trigger pair and move into the 'war' phase. Nothing is dealt yet; each side
    // deals their own stakes+decider independently via computeWarDealPatch once they re-tap.
    const newHistory = [
      ...(session.pot_history || []),
      { card: session.p1_card, owner: 'p1', kind: 'tie', revealed: true },
      { card: session.p2_card, owner: 'p2', kind: 'tie', revealed: true },
    ];
    const shortageWinner = warShortageWinner(session);
    if (shortageWinner) return { status: 'finished', winner_kid_id: shortageWinner, pot_history: newHistory };
    return {
      phase: 'war', pot_history: newHistory, war_round_start: newHistory.length - 2,
      p1_card: null, p2_card: null, p1_revealed: false, p2_revealed: false, round_winner_id: null,
    };
  }

  // One side's half of a war round: deals up to 3 face-down stakes + 1 face-up decider from their
  // own deck in one tap (reusing p1_revealed/p2_revealed to mean "already dealt this round", exactly
  // like they mean "already flipped this round" during a normal 'flip' phase). Shortage rule: keep
  // at least 1 card back for the decider, dealing as many stakes as can be spared (0-3) otherwise.
  function computeWarDealPatch(session, meId) {
    if (session.phase !== 'war') return null;
    const amIP1 = meId === session.challenger_id;
    const revealedCol = amIP1 ? 'p1_revealed' : 'p2_revealed';
    const cardCol = amIP1 ? 'p1_card' : 'p2_card';
    const deckCol = amIP1 ? 'p1_deck' : 'p2_deck';
    const owner = amIP1 ? 'p1' : 'p2';
    if (session[revealedCol]) return null;
    const deck = [...(session[deckCol] || [])];
    if (!deck.length) return null;
    const stakesAvailable = Math.min(3, deck.length - 1);
    const newEntries = [];
    for (let i = 0; i < stakesAvailable; i++) newEntries.push({ card: deck.shift(), owner, kind: 'stake', revealed: false });
    const decider = deck.shift();
    newEntries.push({ card: decider, owner, kind: 'decider', revealed: true });
    return {
      [deckCol]: deck, [revealedCol]: true, [cardCol]: decider,
      pot_history: [...session.pot_history, ...newEntries],
    };
  }

  // Once both sides have dealt (p1_revealed && p2_revealed during 'war'), compare their deciders --
  // same comparison computeResolvePatch does for a normal round. A further tie re-enters 'war' using
  // those two decider cards as the new round's trigger pair: `indexOf` finds where they actually
  // live in pot_history (not just "the last 2 entries"), since the two sides deal independently and
  // may interleave with the OTHER side's stakes if one side taps before the other finishes.
  function computeWarResolvePatch(session) {
    if (session.phase !== 'war' || !session.p1_revealed || !session.p2_revealed) return null;
    const r1 = rankValue(session.p1_card);
    const r2 = rankValue(session.p2_card);
    if (r1 !== r2) {
      const winnerId = r1 > r2 ? session.challenger_id : session.opponent_id;
      return { phase: 'awaiting_collect', round_winner_id: winnerId };
    }
    const shortageWinner = warShortageWinner(session);
    if (shortageWinner) return { status: 'finished', winner_kid_id: shortageWinner };
    const lastDeciderIndex = (owner) => {
      let idx = -1;
      session.pot_history.forEach((e, i) => { if (e.owner === owner && e.kind === 'decider') idx = i; });
      return idx;
    };
    const roundStart = Math.min(lastDeciderIndex('p1'), lastDeciderIndex('p2'));
    return { phase: 'war', war_round_start: roundStart, p1_revealed: false, p2_revealed: false, round_winner_id: null };
  }

  function computeCollectPatch(session, meId) {
    if (session.round_winner_id !== meId || session.phase !== 'awaiting_collect') return null;
    const amIP1 = meId === session.challenger_id;
    const historyCards = (session.pot_history || []).map((e) => e.card);
    // When a round ends via a tie/war, p1_card/p2_card are the SAME cards as the last two
    // 'decider' entries already recorded in pot_history (see dealWarStakes above) -- so pot_history
    // alone already accounts for every card in play. Only fall back to p1_card/p2_card for a plain
    // non-war win, where pot_history is empty and those two slots are the round's only cards.
    const won = historyCards.length ? historyCards : [session.p1_card, session.p2_card];
    const myDeck = [...(amIP1 ? session.p1_deck : session.p2_deck), ...won];
    const oppDeck = [...(amIP1 ? session.p2_deck : session.p1_deck)];
    if (oppDeck.length === 0) {
      return { p1_deck: amIP1 ? myDeck : oppDeck, p2_deck: amIP1 ? oppDeck : myDeck, status: 'finished', winner_kid_id: meId };
    }
    // Next round's cards are NOT pre-dealt here -- both card slots go back to empty/face-down,
    // and each side's deck count only drops again once they actually tap to play their next card.
    return {
      p1_deck: amIP1 ? myDeck : oppDeck, p2_deck: amIP1 ? oppDeck : myDeck,
      p1_card: null, p2_card: null,
      p1_revealed: false, p2_revealed: false, pot_history: [], phase: 'flip', round_winner_id: null,
    };
  }

  // ---------- remote driver (playing against another kid, via Supabase) ----------
  // Concurrency note: resolve/collect use eq() guards (on the revealed flags / round_winner_id +
  // phase) rather than a version counter or a Postgres RPC. This is safe here specifically because
  // every patch is a *pure, deterministic* function of the session -- if both clients' Realtime
  // callbacks happened to fire a resolve at the same instant, they'd independently compute the
  // identical patch, so a duplicate write is wasted but never wrong. Collect has no such race at
  // all: only the actual winner's device ever renders a collect button in the first place. A
  // versioned compare-and-swap or server-side RPC would be the more bulletproof approach if this
  // ever needs to defend against a genuinely adversarial client; for two siblings on a shared
  // family app, the deterministic-patch guarantee is a reasonable, much simpler bar to clear.
  async function flip(session, meId) {
    const patch = computeFlipPatch(session, meId);
    if (!patch) return;
    const { error } = await supabaseClient.from('game_sessions').update(patch).eq('id', session.id);
    if (error) console.error('[War] could not flip:', error);
  }

  async function resolveIfBothRevealed(session) {
    const patch = computeResolvePatch(session);
    if (!patch) return;
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('p1_revealed', true).eq('p2_revealed', true);
    if (error) console.error('[War] could not resolve round:', error);
  }

  async function warDeal(session, meId) {
    const patch = computeWarDealPatch(session, meId);
    if (!patch) return;
    const amIP1 = meId === session.challenger_id;
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('phase', 'war').eq(amIP1 ? 'p1_revealed' : 'p2_revealed', false);
    if (error) console.error('[War] could not deal war cards:', error);
  }

  async function resolveWarIfBothDealt(session) {
    const patch = computeWarResolvePatch(session);
    if (!patch) return;
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('phase', 'war').eq('p1_revealed', true).eq('p2_revealed', true);
    if (error) console.error('[War] could not resolve war round:', error);
  }

  async function collect(session, meId) {
    const patch = computeCollectPatch(session, meId);
    if (!patch) return;
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('round_winner_id', meId).eq('phase', 'awaiting_collect');
    if (error) console.error('[War] could not collect:', error);
  }

  // ---------- local driver (playing against the computer -- no network at all) ----------
  let localGame = null;
  let localRerender = null;

  function startLocalGame(meId, onChange) {
    localGame = {
      isLocal: true, id: 'local', game_type: 'war',
      challenger_id: meId, opponent_id: 'computer', status: 'active',
      theme: chooseTheme(),
      ...buildInitialState(),
    };
    localRerender = onChange;
    lastFxKey = null;
    resetResultSequence();
    return localGame;
  }
  function clearLocalGame() { localGame = null; localRerender = null; resetResultSequence(); }
  function notifyLocal() { if (localRerender) localRerender(localGame); }

  function flipLocal(meId) {
    const patch = computeFlipPatch(localGame, meId);
    if (!patch) return;
    Object.assign(localGame, patch);
    notifyLocal();
    maybeBotMove();
  }
  function maybeResolveLocal() {
    const patch = computeResolvePatch(localGame);
    if (!patch) return;
    Object.assign(localGame, patch);
    notifyLocal();
  }
  function warDealLocal(meId) {
    const patch = computeWarDealPatch(localGame, meId);
    if (!patch) return;
    Object.assign(localGame, patch);
    notifyLocal();
    maybeBotMove();
  }
  function maybeResolveWarLocal() {
    const patch = computeWarResolvePatch(localGame);
    if (!patch) return;
    Object.assign(localGame, patch);
    notifyLocal();
  }
  // Collecting on behalf of the computer is still a deliberate human tap (see render()'s "Continue
  // / Collect for Computer" button) -- there is no automatic collection for either side.
  function collectLocal(meId) {
    const patch = computeCollectPatch(localGame, meId);
    if (!patch) return;
    Object.assign(localGame, patch);
    notifyLocal();
  }
  // The computer only ever reacts to the human's move -- it never flips (or deals war cards) first,
  // so it always feels like it's "watching" rather than racing ahead. It does NOT auto-collect when
  // it wins; the child must tap the on-screen button so they always see what happened before it
  // advances. The human is always p1 in a local game (see startLocalGame), so these checks are
  // hardcoded to "p1 went, p2 (computer) hasn't" rather than generic amIP1 logic.
  function maybeBotMove() {
    if (!localGame || localGame.status !== 'active') return;
    if (localGame.phase === 'flip' && localGame.p1_revealed && !localGame.p2_revealed) {
      setTimeout(() => {
        if (!localGame || localGame.phase !== 'flip' || !localGame.p1_revealed || localGame.p2_revealed) return;
        const patch = computeFlipPatch(localGame, 'computer');
        if (patch) Object.assign(localGame, patch);
        notifyLocal();
        maybeResolveLocal();
      }, 700 + Math.random() * 500);
    } else if (localGame.phase === 'war' && localGame.p1_revealed && !localGame.p2_revealed) {
      setTimeout(() => {
        if (!localGame || localGame.phase !== 'war' || !localGame.p1_revealed || localGame.p2_revealed) return;
        const patch = computeWarDealPatch(localGame, 'computer');
        if (patch) Object.assign(localGame, patch);
        notifyLocal();
        maybeResolveWarLocal();
      }, 700 + Math.random() * 500);
    }
  }

  // ---------- fly animation: a real overlay element travels from the deck to the table ----------
  function flyCard(fromEl, toEl, { faceDown }) {
    return new Promise((resolve) => {
      if (!fromEl || !toEl || matchMedia('(prefers-reduced-motion: reduce)').matches) { resolve(); return; }
      const from = fromEl.getBoundingClientRect();
      const to = toEl.getBoundingClientRect();
      const card = document.createElement('div');
      card.className = 'war-flying-card' + (faceDown ? ' face-down' : '');
      card.style.left = `${from.left + from.width / 2 - 56}px`;
      card.style.top = `${from.top + from.height / 2 - 76}px`;
      document.body.appendChild(card);
      requestAnimationFrame(() => {
        card.style.left = `${to.left + to.width / 2 - 56}px`;
        card.style.top = `${to.top + to.height / 2 - 76}px`;
        card.style.transform = 'rotate(-6deg) scale(1.05)';
      });
      setTimeout(() => { card.remove(); resolve(); }, 420);
    });
  }

  // ---------- rendering (shared by both drivers) ----------
  let lastFxKey = null; // guards against replaying the win effect on every unrelated rerender
  let busy = false; // true while a fly animation is in flight, to block double-taps
  // Round-end is fully automatic, no Collect button anywhere: once a winner is decided, any
  // face-down stakes flip one at a time (mine first, then the opponent's -- purely local/client-side,
  // like the fly animation, never synced to the session), then everything just sits on screen for a
  // beat, then collection happens on its own and the next round starts. resultSequenceKey identifies
  // which round-result this progress belongs to, so a genuinely new result resets it;
  // resultSequenceStarted guards against re-kicking the timer chain on every unrelated rerender.
  const STAKE_FLIP_MS = 675;
  const RESULT_HOLD_MS = 1500;
  let resultSequenceKey = null;
  let stakesRevealedCount = 0;
  let resultSequenceStarted = false;
  let resultSequenceTimer = null;
  function resetResultSequence() {
    resultSequenceKey = null;
    stakesRevealedCount = 0;
    resultSequenceStarted = false;
    if (resultSequenceTimer) { clearTimeout(resultSequenceTimer); resultSequenceTimer = null; }
  }
  // UI-only mute toggle -- there's no actual audio anywhere in this app yet, so this just flips
  // the icon for now; wire it to real sound effects later if/when those are added.
  let soundOn = true;
  function soundToggleHtml() {
    return `<button type="button" class="war-sound-btn" id="war-sound-btn" aria-label="${soundOn ? 'Mute sound' : 'Unmute sound'}" aria-pressed="${!soundOn}">${soundOn ? '🔊' : '🔇'}</button>`;
  }
  function wireSoundToggle(rerender) {
    const btn = document.getElementById('war-sound-btn');
    if (btn) btn.addEventListener('click', () => { soundOn = !soundOn; rerender(); });
  }

  function cardFaceHtml(card) {
    const red = isRed(card);
    return `<span class="war-card-rank${red ? ' red' : ''}">${rankLabel(card)}</span><span class="war-card-suit${red ? ' red' : ''}">${suitSymbol(card)}</span>`;
  }

  // Fan cards overlap each other, so a dead-center rank (like cardFaceHtml above) gets covered by
  // whichever card sits in front of it. Corner markers stay legible instead -- top AND bottom on
  // the SAME edge (not the diagonal real-card convention), because the fan's overlap always covers
  // one whole vertical edge of a card, not a diagonal half: "me" cards fan left and get covered on
  // their right, so their markers go on the left; "opp" cards mirror that, covered on their left,
  // markers on the right.
  function cardCornersHtml(card) {
    const red = isRed(card);
    const cls = red ? ' red' : '';
    const label = rankLabel(card);
    const suit = suitSymbol(card);
    return `
      <span class="war-fan-corner top${cls}">${label}<small>${suit}</small></span>
      <span class="war-fan-corner bottom${cls}">${label}<small>${suit}</small></span>`;
  }

  function deckHtml({ id, count, tappable, hint }) {
    const classes = ['war-deck'];
    if (tappable) classes.push('tappable');
    const depth = Math.min(16, Math.max(2, Math.round(count * 0.6)));
    const inner = `<span class="war-deck-stack" style="--depth:${depth}px"></span><span class="war-deck-count">🂠 ${count} left</span>${hint ? `<span class="war-deck-hint">${hint}</span>` : ''}`;
    if (tappable) return `<button type="button" class="${classes.join(' ')}" id="${id}" aria-label="Tap your deck to draw a card">${inner}</button>`;
    return `<div class="${classes.join(' ')}" id="${id}">${inner}</div>`;
  }

  function tableSlotHtml(id, revealed, card, { won, lost } = {}) {
    const classes = ['war-slot'];
    if (!revealed) classes.push('face-down');
    if (won) classes.push('won');
    if (lost) classes.push('lost');
    const inner = revealed && card ? cardFaceHtml(card) : '🂠';
    return `<div class="${classes.join(' ')}" id="${id}">${inner}</div>`;
  }

  // The current war round's cards for one owner: whichever entry starts the round (the trigger --
  // either the original tied cards, or a previous round's deciders reused as the new trigger) plus
  // whatever this owner has dealt themselves since. Only ever looks at the CURRENT round
  // (pot_history from war_round_start onward) -- earlier rounds stay recorded but aren't redrawn.
  function warRoundInfo(session, owner) {
    const mine = (session.pot_history || []).slice(session.war_round_start || 0).filter((e) => e.owner === owner);
    const trigger = mine[0] || null;
    const rest = mine.slice(1);
    return { trigger, stakes: rest.filter((e) => e.kind === 'stake'), decider: rest.find((e) => e.kind === 'decider') || null };
  }

  // Fan offsets go from frontmost (the trigger card, index 0, no rotation) outward to the back of
  // the fan -- "me" fans away to the left, "opp" mirrors it to the right.
  const FAN_OFFSETS = {
    me: ['translateX(0) rotate(0deg)', 'translateX(-14%) rotate(-8deg)', 'translateX(-26%) rotate(-16deg)', 'translateX(-37%) rotate(-24deg)'],
    opp: ['translateX(0) rotate(0deg)', 'translateX(14%) rotate(8deg)', 'translateX(26%) rotate(16deg)', 'translateX(37%) rotate(24deg)'],
  };
  // revealedCount/justRevealedIndex drive the post-war "Show Cards" sequence: stakes at index <
  // revealedCount render face-up (the Nth one gets a one-off flip-in animation via .just-revealed),
  // everything else stays face-down exactly as it does while the war is still being dealt.
  function warFanHtml(info, side, color, revealedCount, justRevealedIndex) {
    const offsets = FAN_OFFSETS[side];
    const n = revealedCount || 0;
    let html = '';
    for (let i = 0; i < 3; i++) {
      const entry = info.stakes[i];
      if (!entry) { html += `<div class="war-fan-card back ${color} hidden" style="transform:${offsets[3 - i]}"></div>`; continue; }
      if (i < n) {
        const justClass = i === justRevealedIndex ? ' just-revealed' : '';
        html += `<div class="war-fan-card face side-${side}${justClass}" style="transform:${offsets[3 - i]}">${cardCornersHtml(entry.card)}</div>`;
      } else {
        html += `<div class="war-fan-card back ${color}" style="transform:${offsets[3 - i]}"></div>`;
      }
    }
    if (info.trigger) {
      // The trigger card sits frontmost in the fan with nothing covering it, so it keeps the
      // regular big centered rank (same treatment as the decider) -- corner markers are only
      // needed on the stakes, which actually get overlapped.
      html += `<div class="war-fan-card face" style="transform:${offsets[0]}">${cardFaceHtml(info.trigger.card)}</div>`;
    }
    return html;
  }
  function warDeciderHtml(info, id) {
    const inner = info.decider ? `<div class="war-decider-card">${cardFaceHtml(info.decider.card)}</div>` : '';
    return `<div class="war-decider-slot" id="${id}">${inner}</div>`;
  }

  function render(session) {
    const me = getActiveProfile();
    if (!me) return;
    const amIP1 = me.id === session.challenger_id;
    const myRevealed = amIP1 ? session.p1_revealed : session.p2_revealed;
    const oppRevealed = amIP1 ? session.p2_revealed : session.p1_revealed;
    const myCard = amIP1 ? session.p1_card : session.p2_card;
    const oppCard = amIP1 ? session.p2_card : session.p1_card;
    const myDeckLeft = (amIP1 ? session.p1_deck : session.p2_deck || []).length;
    const oppDeckLeft = (amIP1 ? session.p2_deck : session.p1_deck || []).length;
    const opponentId = amIP1 ? session.opponent_id : session.challenger_id;
    const isVsComputer = opponentId === 'computer';
    const opponent = isVsComputer ? { name: 'Computer' } : loadProfiles().find((p) => p.id === opponentId);
    const opponentName = escapeHtml(opponent ? opponent.name : 'Opponent');
    const bothRevealed = session.p1_revealed && session.p2_revealed;
    const inWar = session.phase === 'war';
    const iWonRound = session.phase === 'awaiting_collect' && session.round_winner_id === me.id;
    const theyWonRound = session.phase === 'awaiting_collect' && session.round_winner_id === opponentId;
    const theme = session.isLocal ? session.theme : themeForSessionId(session.id);
    const wasWarRound = (session.pot_history || []).length > 0;
    // The fan+floating-decider layout replaces the single played-card slots for the whole war
    // (while dealing/waiting) AND for the brief "awaiting_collect" moment right after it resolves,
    // so the result/collect UI still reads in context. A plain (non-war) win keeps the old slots.
    const showFan = inWar || (session.phase === 'awaiting_collect' && wasWarRound);

    const body = document.getElementById('vs-play-body');
    const topControlsHtml = `
      <div class="war-top-controls">
        <button type="button" class="war-fullscreen-back-btn" id="war-fullscreen-back-btn" aria-label="Back">←</button>
        ${soundToggleHtml()}
      </div>`;

    if (session.status === 'finished') {
      const iWonGame = session.winner_kid_id === me.id;
      body.innerHTML = `
        <div class="war-board war-adventure" data-theme="${theme}">
          ${topControlsHtml}
          <div class="war-gameover">
            <div class="war-gameover-emoji">${iWonGame ? '🏆' : '🙂'}</div>
            <h3 aria-live="polite">${iWonGame ? 'You won all the cards!' : `${opponentName} won all the cards!`}</h3>
            <button type="button" class="big-btn primary-btn" id="war-back-to-games-btn">Back to Games</button>
          </div>
        </div>`;
      document.getElementById('war-back-to-games-btn').addEventListener('click', () => {
        if (session.isLocal) clearLocalGame();
        Games.openGamesScreen();
      });
      wireSoundToggle(() => render(session));
      wireBackButton();
      return;
    }

    let resultHtml = '';
    if (iWonRound || theyWonRound) {
      const winnerCard = session.round_winner_id === session.challenger_id ? session.p1_card : session.p2_card;
      const loserCard = session.round_winner_id === session.challenger_id ? session.p2_card : session.p1_card;
      const explain = `${rankWord(winnerCard)} beats ${rankWord(loserCard)}`;
      const whoText = iWonRound ? 'You win this round!' : `${opponentName} wins this round!`;
      const fxKey = `${session.id}|${session.p1_card}|${session.p2_card}|${session.round_winner_id}`;
      const showFx = fxKey !== lastFxKey;
      lastFxKey = fxKey;
      resultHtml = `
        <div class="war-round-result${iWonRound ? ' win' : ''}" role="status" aria-live="polite">
          ${wasWarRound ? '<div class="war-result-tag">⚔️ Won the War!</div>' : ''}
          ${whoText}
          <small>${explain}</small>
        </div>
        <div class="war-win-fx">${showFx ? buildFxSpans(theme) : ''}</div>`;
    }

    let warBannerHtml = '';
    if (inWar && !bothRevealed) {
      warBannerHtml = !myRevealed
        ? '<div class="war-pot">⚔️ WAR! Tap your deck again!</div>'
        : `<div class="war-pot">⚔️ WAR!<small>Waiting for ${opponentName}...</small></div>`;
    } else if (inWar && bothRevealed) {
      warBannerHtml = '<div class="war-pot">⚔️ Comparing...</div>';
    }

    const myInfo = showFan ? warRoundInfo(session, amIP1 ? 'p1' : 'p2') : null;
    const oppInfo = showFan ? warRoundInfo(session, amIP1 ? 'p2' : 'p1') : null;

    // Round-end is fully automatic, no button anywhere: once a winner is decided, any face-down
    // stakes flip one at a time (mine first, then the opponent's -- a purely local/client-side
    // animation, like the fly animation, never synced to the session), everything then holds on
    // screen for a beat, and collection just happens on its own. Both sides independently run this
    // same local sequence (even the side that lost, so they see what they lost too), but only the
    // side with actual collect rights (the winner, or the human standing in for a computer win)
    // triggers the real collect() at the end -- the other side's screen updates once that lands.
    const isRoundEnd = iWonRound || theyWonRound;
    const amICollector = iWonRound || (theyWonRound && isVsComputer);
    const myStakeTotal = myInfo ? myInfo.stakes.length : 0;
    const oppStakeTotal = oppInfo ? oppInfo.stakes.length : 0;
    const revealTotal = isRoundEnd && wasWarRound ? myStakeTotal + oppStakeTotal : 0;

    const roundKey = `${session.id}|${session.p1_card}|${session.p2_card}|${session.round_winner_id}`;
    if (isRoundEnd) {
      if (resultSequenceKey !== roundKey) {
        resultSequenceKey = roundKey;
        stakesRevealedCount = 0;
        resultSequenceStarted = false;
        if (resultSequenceTimer) { clearTimeout(resultSequenceTimer); resultSequenceTimer = null; }
      }
    } else if (resultSequenceKey !== null) {
      resetResultSequence();
    }

    const myRevealedStakes = Math.min(stakesRevealedCount, myStakeTotal);
    const oppRevealedStakes = Math.max(0, Math.min(stakesRevealedCount, revealTotal) - myStakeTotal);
    const justIndex = isRoundEnd && stakesRevealedCount > 0 ? stakesRevealedCount - 1 : -1;
    const myJustIndex = justIndex >= 0 && justIndex < myStakeTotal ? justIndex : -1;
    const oppJustIndex = justIndex >= myStakeTotal ? justIndex - myStakeTotal : -1;

    let bottomCenterHtml = '';
    if (isRoundEnd && stakesRevealedCount >= revealTotal) {
      bottomCenterHtml = amICollector
        ? '<p class="parent-card-note">Starting next round...</p>'
        : `<p class="parent-card-note">${opponentName} is collecting...</p>`;
    }

    if (isRoundEnd && !resultSequenceStarted) {
      resultSequenceStarted = true;
      const collectingForId = iWonRound ? me.id : session.round_winner_id;
      const runStep = () => {
        if (stakesRevealedCount < revealTotal) {
          stakesRevealedCount++;
          render(session);
          resultSequenceTimer = setTimeout(runStep, STAKE_FLIP_MS);
        } else {
          resultSequenceTimer = setTimeout(() => {
            resultSequenceTimer = null;
            if (!amICollector) return;
            document.querySelectorAll('.war-slot, .war-fan-card, .war-decider-card').forEach((el) => el.classList.add('collecting'));
            setTimeout(() => {
              if (session.isLocal) collectLocal(collectingForId);
              else collect(session, me.id);
            }, 350);
          }, RESULT_HOLD_MS);
        }
      };
      resultSequenceTimer = setTimeout(runStep, STAKE_FLIP_MS);
    }

    const centerHtml = showFan ? `
        <div class="war-decider-zone">
          ${warDeciderHtml(myInfo, 'war-my-decider-slot')}
          ${warDeciderHtml(oppInfo, 'war-opp-decider-slot')}
        </div>
        <div class="war-fan-info">
          ${warBannerHtml}
          ${resultHtml}
        </div>
        <div class="war-fan-zone">
          <div class="war-fan">${warFanHtml(myInfo, 'me', 'blue', myRevealedStakes, myJustIndex)}</div>
          <div class="war-fan">${warFanHtml(oppInfo, 'opp', 'red', oppRevealedStakes, oppJustIndex)}</div>
        </div>
      ` : `
        <div class="war-center-stack">
          <div class="war-table-cards">
            ${tableSlotHtml('war-my-slot', myRevealed, myCard, { won: iWonRound, lost: theyWonRound })}
            ${tableSlotHtml('war-opp-slot', oppRevealed, oppCard, { won: theyWonRound, lost: iWonRound })}
          </div>
          <div class="war-center-info">${resultHtml}</div>
        </div>
      `;

    body.innerHTML = `
      <div class="war-board war-adventure" data-theme="${theme}">
        ${topControlsHtml}
        <div class="war-nameplate me"><span class="war-player-name">You</span></div>
        <div class="war-nameplate opp"><span class="war-player-name">${opponentName}</span></div>

        ${centerHtml}

        <div class="war-deck-area me">
          ${deckHtml({ id: 'war-my-deck', count: myDeckLeft, tappable: !myRevealed && !busy && myDeckLeft > 0, hint: !myRevealed ? (inWar ? 'TAP FOR WAR!' : 'TAP YOUR DECK') : '' })}
        </div>
        <div class="war-deck-area opp">
          ${deckHtml({ id: 'war-opp-deck', count: oppDeckLeft, tappable: false })}
        </div>

        <div class="war-bottom-center">${bottomCenterHtml}</div>
      </div>`;

    const deckBtn = document.getElementById('war-my-deck');
    if (deckBtn && !myRevealed) {
      deckBtn.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        deckBtn.disabled = true;
        const flyTarget = document.getElementById(inWar ? 'war-my-decider-slot' : 'war-my-slot');
        await flyCard(deckBtn, flyTarget, { faceDown: false });
        busy = false;
        if (inWar) {
          if (session.isLocal) warDealLocal(me.id); else await warDeal(session, me.id);
        } else if (session.isLocal) flipLocal(me.id); else await flip(session, me.id);
      });
    }
    wireSoundToggle(() => render(session));
    wireBackButton();
    if (!session.isLocal && bothRevealed) {
      if (session.phase === 'flip') resolveIfBothRevealed(session);
      else if (session.phase === 'war') resolveWarIfBothDealt(session);
    }
  }

  // Reuses the real nav back button's own click handler (session cleanup + AppBridge.enterHome())
  // instead of duplicating that logic -- this button just overlays the fullscreen board in its place.
  function wireBackButton() {
    const btn = document.getElementById('war-fullscreen-back-btn');
    if (btn) btn.addEventListener('click', () => document.getElementById('vs-play-back-btn').click());
  }

  return { buildInitialState, render, startLocalGame, clearLocalGame };
})();
