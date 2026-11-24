// Games: tap a game to see its detail screen, then either VS (challenge another kid in the
// family, synced live through Supabase Realtime) or play against the computer (purely local, no
// network at all). This module owns the challenge pipeline (who challenged whom,
// waiting/accepted/declined) and the Games/detail/picker/waiting/incoming-challenge screens; the
// actual rules for each game live in their own file (see js/war.js) and are rendered into the
// shared vs-play-screen. Go Fish still shows a placeholder until it's built.
const Games = (() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => AppBridge.escapeHtml(String(s == null ? '' : s));

  const CATALOG = [
    { id: 'war', name: 'War', emoji: '🃏', accent: 'orange' },
    { id: 'go_fish', name: 'Go Fish', emoji: '🎣', accent: 'blue' },
    { id: 'tic_tac_toe', name: 'Tic Tac Toe', emoji: '⭕', accent: 'purple' },
    { id: 'connect_4', name: 'Connect 4', emoji: '🔴', accent: 'red' },
    { id: 'spot_the_difference', name: 'Spot the Difference', emoji: '🔎', accent: 'green' },
  ];
  // Spot the Difference is single-player (no opponent), so it skips the VS-a-kid/Computer picker
  // entirely instead of going through openGameDetail like every other game here.
  const SINGLE_PLAYER = new Set(['spot_the_difference']);
  // Games with a real driver (buildInitialState/render) wired up, for both the vs-computer path and
  // the real kid-vs-kid challenge pipeline below -- a lookup object rather than an if/else chain so
  // each call site below stays a one-liner and a missing entry (go_fish) falls through to a single
  // shared "not built yet" fallback instead of needing its own check at every site.
  const DRIVERS = { war: War, tic_tac_toe: TicTacToe, connect_4: Connect4 };

  let sessionsCache = [];
  let channel = null;
  let waitingSessionId = null; // the challenge *I* sent and am watching for a response
  let shownChallengeOverlayFor = null; // session id currently shown in the incoming-challenge overlay
  let currentPlaySessionId = null; // the session shown on vs-play-screen, kept live via Realtime
  let playScreenPollTimer = null;

  function gameInfo(gameType) {
    return CATALOG.find((g) => g.id === gameType) || null;
  }

  // ---------- data layer ----------
  async function refreshSessions() {
    const familyId = ParentAuth.getFamilyId();
    if (!familyId) { sessionsCache = []; return; }
    const { data, error } = await supabaseClient
      .from('game_sessions').select('*').eq('family_id', familyId).order('created_at', { ascending: false });
    if (error) { console.error('[Games] could not load game sessions:', error); return; }
    sessionsCache = data || [];
  }

  // A fresh name every time (rather than reusing `game_sessions_<familyId>`) avoids a nasty race:
  // supabase-js caches channel objects by name, so if ParentAuth.onChange ever fires twice in
  // quick succession, reusing the same name could hand back a channel that's already subscribed,
  // and calling .on() on it again throws ("cannot add postgres_changes callbacks after
  // subscribe()"). channelOpChain also serializes the teardown/setup itself, since two overlapping
  // onChange firings would otherwise both read the same stale `channel` value before either one
  // gets a chance to replace it.
  let channelGeneration = 0;
  function ensureChannel(familyId) {
    const name = `game_sessions_${familyId}_${++channelGeneration}`;
    channel = supabaseClient
      .channel(name)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_sessions', filter: `family_id=eq.${familyId}` }, async () => {
        await refreshSessions();
        onSessionsChanged();
      })
      .subscribe();
  }

  let channelOpChain = Promise.resolve();
  ParentAuth.onChange(() => {
    channelOpChain = channelOpChain.then(async () => {
      const oldChannel = channel;
      channel = null;
      if (oldChannel) await supabaseClient.removeChannel(oldChannel);
      const familyId = ParentAuth.getFamilyId();
      await refreshSessions();
      if (familyId) ensureChannel(familyId);
      onSessionsChanged();
    }).catch((err) => console.error('[Games] channel setup failed:', err));
  });

  function incomingChallengesFor(kidId) {
    return sessionsCache.filter((s) => s.opponent_id === kidId && s.status === 'pending');
  }
  // In-progress games this kid is part of -- lets them get back in after a reload, an accidental
  // back-tap, or just closing the app mid-game, instead of the match being stranded.
  function activeSessionsFor(kidId) {
    return sessionsCache.filter((s) => s.status === 'active' && (s.challenger_id === kidId || s.opponent_id === kidId));
  }
  function sessionById(id) {
    return sessionsCache.find((s) => s.id === id) || null;
  }

  async function createChallenge(gameType, challengerId, opponentId) {
    const familyId = ParentAuth.getFamilyId();
    if (!familyId) throw new Error('Sign in to the Family Account first.');
    const { data, error } = await supabaseClient.from('game_sessions').insert({
      family_id: familyId, game_type: gameType, challenger_id: challengerId, opponent_id: opponentId, status: 'pending',
    }).select('*').single();
    if (error) throw error;
    sessionsCache.unshift(data);
    return data;
  }

  async function respondToChallenge(sessionId, accept) {
    const patch = { status: accept ? 'active' : 'declined', updated_at: new Date().toISOString() };
    if (accept) {
      const session = sessionById(sessionId);
      const driver = session && DRIVERS[session.game_type];
      if (driver) Object.assign(patch, driver.buildInitialState());
    }
    const { data, error } = await supabaseClient.from('game_sessions')
      .update(patch).eq('id', sessionId).select('*').single();
    if (error) throw error;
    const idx = sessionsCache.findIndex((s) => s.id === sessionId);
    if (idx >= 0) sessionsCache[idx] = data; else sessionsCache.unshift(data);
    return data;
  }

  async function cancelChallenge(sessionId) {
    const { error } = await supabaseClient.from('game_sessions').delete().eq('id', sessionId);
    if (error) throw error;
    sessionsCache = sessionsCache.filter((s) => s.id !== sessionId);
  }

  // ---------- reacting to live (Realtime) changes ----------
  function onSessionsChanged() {
    AppBridge.renderSectionGrid();
    checkWaitingSession();
    checkIncomingChallenge();
    refreshPlayScreenIfOpen();
  }

  // Safety net for the Realtime subscription silently dying -- which iOS Safari does to
  // backgrounded WebSockets routinely, and exactly what the waiting-for-your-turn kid's iPad is
  // doing most of a VS match (screen off/app backgrounded until it's their turn). When that
  // happens, no postgres_changes event ever arrives to tell them a move was made, so their board
  // just never updates again even though the game is fine server-side -- they see the board/names
  // (rendered once at accept-time, before the socket died) but never the other kid's moves. Two
  // independent catches, since either on its own can miss a case the other covers:
  // (1) the moment their iPad comes back to the foreground at all (covers the common "was locked/
  // backgrounded" case immediately, not waiting for the poll below);
  // (2) a plain poll, but ONLY while actually on the VS play screen (not app-wide) -- catches a
  // socket that died for some other reason while the app stayed foregrounded the whole time.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshSessions().then(onSessionsChanged);
  });
  function startPlayScreenPoll() {
    stopPlayScreenPoll();
    playScreenPollTimer = setInterval(async () => {
      if (!currentPlaySessionId) return;
      await refreshSessions();
      onSessionsChanged();
    }, 4000);
  }
  function stopPlayScreenPoll() {
    if (playScreenPollTimer) { clearInterval(playScreenPollTimer); playScreenPollTimer = null; }
  }

  // Keeps the play screen live: every flip/collect from either kid re-renders the board.
  function refreshPlayScreenIfOpen() {
    if (!currentPlaySessionId) return;
    const session = sessionById(currentPlaySessionId);
    if (!session) return;
    const driver = DRIVERS[session.game_type];
    if (driver) driver.render(session);
  }

  // If I'm on the "waiting for a response" overlay, see if the other kid has answered yet.
  function checkWaitingSession() {
    if (!waitingSessionId) return;
    const s = sessionById(waitingSessionId);
    if (!s) return;
    if (s.status === 'active') {
      waitingSessionId = null;
      $('vs-waiting-overlay').classList.add('hidden');
      openPlayScreen(s);
    } else if (s.status === 'declined') {
      waitingSessionId = null;
      $('vs-waiting-overlay').classList.add('hidden');
      const opponent = loadProfiles().find((p) => p.id === s.opponent_id);
      AppBridge.showToast(`${opponent ? opponent.name : 'They'} said no thanks.`, 2600);
      openGamesScreen();
    }
  }

  // Surface a live "you've been challenged!" prompt regardless of what screen the kid is on.
  function checkIncomingChallenge() {
    const profile = getActiveProfile();
    if (!profile) return;
    const incoming = incomingChallengesFor(profile.id);
    if (!incoming.length) {
      shownChallengeOverlayFor = null;
      $('vs-challenge-overlay').classList.add('hidden');
      return;
    }
    const next = incoming[0];
    if (shownChallengeOverlayFor === next.id) return; // already showing this one
    shownChallengeOverlayFor = next.id;
    const challenger = loadProfiles().find((p) => p.id === next.challenger_id);
    const info = gameInfo(next.game_type);
    $('vs-challenge-title').textContent = `${challenger ? challenger.name : 'Someone'} challenged you to ${info ? info.name : 'a game'}! ${info ? info.emoji : '🎮'}`;
    $('vs-challenge-overlay').classList.remove('hidden');
  }

  $('vs-challenge-decline-btn').addEventListener('click', async () => {
    const id = shownChallengeOverlayFor;
    $('vs-challenge-overlay').classList.add('hidden');
    shownChallengeOverlayFor = null;
    if (id) { try { await respondToChallenge(id, false); } catch (err) { console.error('[Games] could not decline:', err); } }
  });

  $('vs-challenge-accept-btn').addEventListener('click', async () => {
    const id = shownChallengeOverlayFor;
    $('vs-challenge-overlay').classList.add('hidden');
    shownChallengeOverlayFor = null;
    if (!id) return;
    try {
      const session = await respondToChallenge(id, true);
      openPlayScreen(session);
    } catch (err) {
      console.error('[Games] could not accept:', err);
      AppBridge.showToast('Could not join that game. Try again?', 2600);
    }
  });

  // ---------- Games screen: list of games, each with a VS button ----------
  function openGamesScreen() {
    currentPlaySessionId = null;
    renderGamesList();
    AppBridge.showScreen('games-screen');
  }
  $('games-back-btn').addEventListener('click', () => AppBridge.enterHome());
  $('kz-games-home').addEventListener('click', () => AppBridge.enterHome());
  $('kz-games-settings').addEventListener('click', () => {
    // Same gear used on the kid home screen (js/app.js), not a second settings path --
    // this just gives the redesigned Games screen its own trigger for it.
    const settings = document.getElementById('home-parent-settings') || document.getElementById('parent-entry-btn');
    if (settings) settings.click();
    else AppBridge.showToast('Open parent settings from the home screen.');
  });

  function renderGamesList() {
    const resumeBox = $('games-resume-list');
    resumeBox.innerHTML = '';
    const me = getActiveProfile();
    if (me) {
      activeSessionsFor(me.id).forEach((session) => {
        const opponentId = session.challenger_id === me.id ? session.opponent_id : session.challenger_id;
        const opponent = opponentId === 'computer' ? { name: 'Computer' } : loadProfiles().find((p) => p.id === opponentId);
        const info = gameInfo(session.game_type);
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'setup-row';
        row.innerHTML = `<span class="pic pic-md pic-emoji">${info ? info.emoji : '🎮'}</span>` +
          `<span class="setup-row-text"><span class="setup-row-name">Resume ${info ? info.name : 'game'}</span><span class="setup-row-meta">vs ${esc(opponent ? opponent.name : 'opponent')}</span></span>` +
          `<span class="parent-kid-more">▶</span>`;
        row.addEventListener('click', () => openPlayScreen(session));
        resumeBox.appendChild(row);
      });
    }

    // Games are rendered as a carousel (games-carousel.js), not the old tile grid. To add a
    // game: add its CATALOG entry above and drop assets/games-carousel/<id>.png -- no layout
    // edits needed here.
    document.getElementById('games-screen').classList.add('kz-games-redesign');
    KidZoneGamesCarousel.mount($('kz-games-carousel'), CATALOG.map((g) => ({
      id: g.id, name: g.name, image: 'assets/games-carousel/' + g.id + '.png',
    })), (game) => (SINGLE_PLAYER.has(game.id) ? openSinglePlayerGame(game.id) : openGameDetail(game.id)));
  }

  // ---------- single-player games: straight into the game, no VS/Computer picker ----------
  function openSinglePlayerGame(gameId) {
    if (gameId === 'spot_the_difference' && window.SpotTheDifference) {
      SpotTheDifference.open(openGamesScreen);
      AppBridge.showScreen('spot-diff-screen');
    }
  }

  // ---------- one game's detail: VS a kid, or play against the computer ----------
  let detailGameId = null;

  function openGameDetail(gameId) {
    detailGameId = gameId;
    const info = gameInfo(gameId);
    $('game-detail-title').textContent = info.name;
    $('game-detail-emoji').textContent = info.emoji;
    AppBridge.showScreen('game-detail-screen');
  }
  $('game-detail-back-btn').addEventListener('click', () => openGamesScreen());
  $('game-detail-vs-btn').addEventListener('click', () => openPicker(detailGameId));
  $('game-detail-computer-btn').addEventListener('click', () => startVsComputer(detailGameId));

  function startVsComputer(gameId) {
    const me = getActiveProfile();
    if (!me) return;
    const info = gameInfo(gameId);
    const driver = DRIVERS[gameId];
    if (!driver) {
      AppBridge.showToast('Playing against the computer is coming soon for this game!', 2400);
      return;
    }
    currentPlaySessionId = null; // this is a local game, not a Realtime-tracked one
    const session = driver.startLocalGame(me.id, (updated) => driver.render(updated));
    $('vs-play-title').textContent = `${info.emoji} ${info.name}`;
    driver.render(session);
    AppBridge.showScreen('vs-play-screen');
  }

  // How many challenges are waiting on the currently active kid -- used for the home-tile badge.
  function pendingCountForActive() {
    const profile = getActiveProfile();
    if (!profile) return 0;
    return incomingChallengesFor(profile.id).length;
  }

  // ---------- opponent picker ----------
  let pickingGameId = null;

  function openPicker(gameId) {
    pickingGameId = gameId;
    const info = gameInfo(gameId);
    $('vs-picker-title').textContent = `Challenge who to ${info.name}?`;
    renderPicker();
    $('vs-picker-overlay').classList.remove('hidden');
  }

  function renderPicker() {
    const me = getActiveProfile();
    const box = $('vs-picker-list');
    box.innerHTML = '';
    const others = loadProfiles().filter((p) => p.id !== (me && me.id));
    if (!others.length) {
      box.innerHTML = '<p class="parent-card-note">No other kids to challenge yet.</p>';
      return;
    }
    others.forEach((p) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'setup-row';
      row.innerHTML = `<span class="profile-avatar small" style="--avatar-color:${p.avatarColor}">${esc(p.name.charAt(0).toUpperCase())}</span>` +
        `<span class="setup-row-text"><span class="setup-row-name">${esc(p.name)}</span></span>`;
      row.addEventListener('click', () => sendChallenge(p));
      box.appendChild(row);
    });
  }

  $('vs-picker-cancel-btn').addEventListener('click', () => {
    $('vs-picker-overlay').classList.add('hidden');
    pickingGameId = null;
  });

  async function sendChallenge(opponent) {
    const me = getActiveProfile();
    if (!me || !pickingGameId) return;
    const gameId = pickingGameId;
    $('vs-picker-overlay').classList.add('hidden');
    pickingGameId = null;
    try {
      const session = await createChallenge(gameId, me.id, opponent.id);
      waitingSessionId = session.id;
      const info = gameInfo(gameId);
      $('vs-waiting-title').textContent = `Waiting for ${opponent.name}...`;
      $('vs-waiting-note').textContent = `${opponent.name} needs to accept your ${info.name} challenge on their iPad.`;
      $('vs-waiting-overlay').classList.remove('hidden');
    } catch (err) {
      console.error('[Games] could not send challenge:', err);
      AppBridge.showToast('Could not send that challenge. Try again?', 2600);
    }
  }

  $('vs-waiting-cancel-btn').addEventListener('click', async () => {
    const id = waitingSessionId;
    waitingSessionId = null;
    $('vs-waiting-overlay').classList.add('hidden');
    if (id) { try { await cancelChallenge(id); } catch (err) { console.error('[Games] could not cancel:', err); } }
  });

  // ---------- play screen ----------
  function openPlayScreen(session) {
    const info = gameInfo(session.game_type);
    const me = getActiveProfile();
    const opponentId = session.challenger_id === (me && me.id) ? session.opponent_id : session.challenger_id;
    const opponent = loadProfiles().find((p) => p.id === opponentId);
    $('vs-play-title').textContent = `${info ? info.emoji : ''} ${info ? info.name : 'Game'}`;
    currentPlaySessionId = session.id;
    const driver = DRIVERS[session.game_type];
    if (driver) {
      driver.render(session);
    } else {
      $('vs-play-body').innerHTML = `<p class="parent-card-note">You're playing ${info ? info.name : 'a game'} with ${opponent ? opponent.name : 'your opponent'}! The game itself is coming soon -- for now this just proves the challenge connected.</p>`;
    }
    AppBridge.showScreen('vs-play-screen');
    // openPlayScreen is only ever reached for a real (Supabase-backed) session -- the vs-computer
    // path above (startVsComputer) is entirely separate and never calls this -- so this is always
    // a game that actually needs the Realtime-dead safety net.
    startPlayScreenPoll();
  }
  $('vs-play-back-btn').addEventListener('click', () => {
    currentPlaySessionId = null;
    stopPlayScreenPoll();
    War.clearLocalGame();
    TicTacToe.clearLocalGame();
    Connect4.clearLocalGame();
    AppBridge.enterHome();
  });

  return { openGamesScreen, pendingCountForActive };
})();
