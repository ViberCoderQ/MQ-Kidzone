// Connect 4. Built from a user-supplied Cursor prototype (castle board art + win logic + the
// falling-token masking technique), not from scratch.
//
// IMPORTANT asset fact: the supplied board art (castle_background.png, now composited into
// icons/connect4/castle-board.png) only has 5 rows of illustrated holes, not the 6 rows standard
// Connect 4 uses -- confirmed by direct pixel inspection and cross-checked with OpenCV Hough
// circle detection (35 real circles found, cleanly 7x5, no 6th row anywhere in the image). The
// prototype's own game.js assumed 6 rows and papered over this by painting a flat rectangle +
// hand-drawn vector ring over the ENTIRE board interior every frame, which faked the look of a
// 6th row's edge even though no illustrated hole exists there. Per explicit user decision, this
// build keeps the artwork untouched and plays as a 7-wide x 5-tall board instead (35 openings).
//
// Rendering is a <canvas> (not DOM/CSS elements) specifically to reproduce the prototype's actual
// masking behavior: a falling token is only drawn when its current y is close to a SPECIFIC hole's
// y, checked independently per hole in its column every frame (see drawFrame below, ported from
// the prototype's draw()). Since the reveal windows don't overlap, this naturally makes the token
// disappear behind the solid board face between holes and reappear at each one as it falls --
// exactly the prototype's effect, not a different animation. Settled/background rendering still
// avoids the prototype's actual bug (ghosting from baked-in example names/status): the background
// image here is the corrected, text-free composite, and nameplates/status are live HTML overlays
// on top of the canvas, same safe split used elsewhere in this app.
const Connect4 = (() => {
  const ROWS = 5, COLS = 7;
  const CANVAS_W = 1672, CANVAS_H = 941;

  function createEmptyBoard() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }

  // Pure: returns { board: nextBoard, row } (the row the disc lands in) or null if the column is
  // full or out of range. Never mutates the board passed in.
  function dropDisc(board, col, mark) {
    if (col < 0 || col >= COLS) return null;
    let row = -1;
    for (let r = ROWS - 1; r >= 0; r--) { if (board[r][col] === null) { row = r; break; } }
    if (row === -1) return null;
    const next = board.map((r) => r.slice());
    next[row][col] = mark;
    return { board: next, row };
  }

  // Checks only the 4 lines through (row, col) -- the cell just played -- same approach as the
  // prototype's winnerCheck. Returns { mark, line } (line = up to 4 [row, col] pairs) or null.
  function checkWinner(board, row, col) {
    const mark = board[row][col];
    if (!mark) return null;
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
      const line = [[row, col]];
      for (const s of [-1, 1]) {
        for (let k = 1; k < 4; k++) {
          const rr = row + s * dr * k, cc = col + s * dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || board[rr][cc] !== mark) break;
          line.push([rr, cc]);
        }
      }
      if (line.length >= 4) return { mark, line: line.slice(0, 4) };
    }
    return null;
  }

  function isBoardFull(board) { return board[0].every((c) => c !== null); }

  // ---------- computer opponent ----------
  // Three difficulty tiers, same ladder and persistence pattern as Tic Tac Toe's: easy is pure
  // random, medium adds win/block awareness, hard adds the depth-limited minimax lookahead that
  // used to be the only mode. Saved per-device so it sticks across games.
  const DIFFICULTY_KEY = 'family-app.connect4.difficulty';
  let difficulty = getData(DIFFICULTY_KEY, 'medium');
  const CENTER_FIRST_COLS = [3, 2, 4, 1, 5, 0, 6];
  function openColumns(board) { return CENTER_FIRST_COLS.filter((c) => board[0][c] === null); }

  function evaluateWindow(cells, mark, oppMark) {
    const mine = cells.filter((c) => c === mark).length;
    const theirs = cells.filter((c) => c === oppMark).length;
    const empty = 4 - mine - theirs;
    if (mine > 0 && theirs > 0) return 0;
    if (mine === 4) return 100000;
    if (mine === 3 && empty === 1) return 100;
    if (mine === 2 && empty === 2) return 10;
    if (theirs === 4) return -100000;
    if (theirs === 3 && empty === 1) return -100;
    if (theirs === 2 && empty === 2) return -10;
    return 0;
  }
  function evaluateBoard(board, mark, oppMark) {
    let score = 0;
    for (let r = 0; r < ROWS; r++) if (board[r][3] === mark) score += 6;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]], mark, oppMark);
    }
    for (let c = 0; c < COLS; c++) for (let r = 0; r <= ROWS - 4; r++) {
      score += evaluateWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]], mark, oppMark);
    }
    for (let r = 0; r <= ROWS - 4; r++) for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]], mark, oppMark);
    }
    for (let r = 3; r < ROWS; r++) for (let c = 0; c <= COLS - 4; c++) {
      score += evaluateWindow([board[r][c], board[r - 1][c + 1], board[r - 2][c + 2], board[r - 3][c + 3]], mark, oppMark);
    }
    return score;
  }
  function findImmediateMove(board, mark) {
    for (const c of openColumns(board)) {
      const res = dropDisc(board, c, mark);
      if (res && checkWinner(res.board, res.row, c)) return c;
    }
    return null;
  }
  function minimax(board, depth, alpha, beta, maximizing, mark, oppMark) {
    const cols = openColumns(board);
    if (cols.length === 0) return { score: 0, col: null };
    if (depth === 0) return { score: evaluateBoard(board, mark, oppMark), col: null };
    let best = null;
    for (const c of cols) {
      const res = dropDisc(board, c, maximizing ? mark : oppMark);
      if (!res) continue;
      const win = checkWinner(res.board, res.row, c);
      let score;
      if (win) score = (win.mark === mark ? 1 : -1) * (100000 + depth);
      else if (res.board[0].every((v) => v !== null)) score = 0;
      else score = minimax(res.board, depth - 1, alpha, beta, !maximizing, mark, oppMark).score;
      if (!best || (maximizing ? score > best.score : score < best.score)) best = { score, col: c };
      if (maximizing) alpha = Math.max(alpha, score); else beta = Math.min(beta, score);
      if (alpha >= beta) break;
    }
    return best;
  }
  function pickBotMove(board) {
    const mark = 'G', oppMark = 'R';
    const cols = openColumns(board);
    if (!cols.length) return null;
    if (difficulty === 'easy') return cols[Math.floor(Math.random() * cols.length)];
    const filled = board.reduce((n, row) => n + row.filter((c) => c !== null).length, 0);
    if (filled === 0) return 3;
    const win = findImmediateMove(board, mark);
    if (win !== null) return win;
    const block = findImmediateMove(board, oppMark);
    if (block !== null) return block;
    if (difficulty === 'medium') return cols[Math.floor(Math.random() * cols.length)];
    const result = minimax(board, 5, -Infinity, Infinity, true, mark, oppMark);
    return result && result.col !== null ? result.col : cols[0];
  }

  // ---------- board geometry ----------
  // Measured directly from icons/connect4/castle-board.png (NOT the prototype's unverified pixel
  // guesses): each hole's center found via OpenCV Hough circle detection, run per-row, then
  // averaged per column/row for a clean 7x5 grid (all 35 holes detected with tight, consistent
  // spacing -- no interpolation needed). Percent of frame width/height, same convention as
  // tictactoe.js's THEMES[...].cell. Fine-tune further via connect4-align-tool.html.
  const BOARD_GEOM = {
    bg: 'icons/connect4/castle-board.png',
    colLeft: [29.480, 36.382, 43.164, 49.958, 56.717, 63.678, 70.365],
    rowTop: [30.279, 40.527, 50.835, 61.189, 71.755],
    holeRadius: 2.677, // % of frame width
    namePlate: {
      p1: { left: 13.22, top: 7.80, width: 21.77, height: 12.65 },
      p2: { left: 64.80, top: 7.70, width: 22.49, height: 12.65 },
    },
  };
  // Per-hole override layer (35 slots, row*7+col): { dx, dy, r } in percentage points /
  // scale-multiplier, or null = use the shared grid above untouched. Filled in via
  // connect4-align-tool.html's "Copy JS" output.
  const HOLE_OVERRIDE = Array.from({ length: ROWS * COLS }, () => null);

  function pxX(pct) { return (pct / 100) * CANVAS_W; }
  function pxY(pct) { return (pct / 100) * CANVAS_H; }
  // Center + radius of a hole in canvas pixel space. A single radius (not separate width/height)
  // is correct here precisely because canvas draws in one uniform pixel grid -- unlike CSS
  // width%/height%, which are independently relative to the parent's width and height.
  function holeGeom(row, col) {
    const ov = HOLE_OVERRIDE[row * COLS + col];
    const leftPct = BOARD_GEOM.colLeft[col] + (ov ? ov.dx : 0);
    const topPct = BOARD_GEOM.rowTop[row] + (ov ? ov.dy : 0);
    const rPct = BOARD_GEOM.holeRadius * (ov && ov.r != null ? ov.r : 1);
    return { x: pxX(leftPct), y: pxY(topPct), r: pxX(rPct) };
  }

  // ---------- disc drawing (ported from the prototype's disc()) ----------
  function drawDisc(c, x, y, mark, r) {
    c.save();
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.08, x, y, r);
    if (mark === 'R') { g.addColorStop(0, '#ff7777'); g.addColorStop(0.5, '#ff2028'); g.addColorStop(1, '#a50017'); }
    else { g.addColorStop(0, '#fff5a1'); g.addColorStop(0.5, '#ffcc05'); g.addColorStop(1, '#d37a00'); }
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = r * 0.13;
    c.strokeStyle = mark === 'R' ? '#a90013' : '#ae6a00';
    c.stroke();
    c.beginPath(); c.arc(x, y, r - r * 0.18, 0, Math.PI * 2);
    c.strokeStyle = mark === 'R' ? '#ff9b92' : '#fff2a0';
    c.lineWidth = r * 0.065;
    c.stroke();
    c.font = `bold ${Math.round(r * 1.1)}px Georgia`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = mark === 'R' ? '#ffaaa4' : '#fff3a2';
    c.fillText('❖', x, y + r * 0.08);
    c.restore();
  }

  function namePlateHtml(key, extraClass) {
    const p = BOARD_GEOM.namePlate[key];
    const style = `left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%`;
    return `<div class="connect4-nameplate ${extraClass}" style="${style}"></div>`;
  }

  // p1 (left badge) = challenger = Red, always -- for a local game the human is always set as
  // challenger_id (see startLocalGame), so this falls out as "p1 = You" there too, not a separate
  // branch. Falls back to generic labels if a name can't be found, same spirit as War's.
  function playerNames(session) {
    if (!session || session.isLocal) {
      const me = typeof getActiveProfile === 'function' ? getActiveProfile() : null;
      return { p1: (me && me.name) || 'You', p2: 'Computer' };
    }
    const challenger = loadProfiles().find((p) => p.id === session.challenger_id);
    const opponent = loadProfiles().find((p) => p.id === session.opponent_id);
    return { p1: (challenger && challenger.name) || 'Player 1', p2: (opponent && opponent.name) || 'Player 2' };
  }

  // Perspective-aware for a real kid-vs-kid game ("Your Turn" when it's actually yours, the other
  // kid's real name otherwise) -- amIP1 is computed the same way for local play too (the human is
  // always challenger_id), so "Your Turn" / "Computer's Turn" for local falls straight out of this
  // as a special case, not a separate branch.
  function statusText(session) {
    const me = getActiveProfile();
    const amIP1 = !!(me && me.id === session.challenger_id);
    const myMark = amIP1 ? 'R' : 'G';
    const names = playerNames(session);
    if (session.status === 'finished') {
      if (session.result === 'draw') return "It's a tie! Try again!";
      if (session.result.mark === myMark) return '\u{1F389} You win!';
      const winnerName = session.result.mark === 'R' ? names.p1 : names.p2;
      return `\u{1F389} ${winnerName} wins!`;
    }
    if (session.thinking) return 'Computer is thinking…';
    const myTurn = (session.turn === 0) === amIP1;
    if (myTurn) return 'Your Turn';
    const otherName = session.turn === 0 ? names.p1 : names.p2;
    return `${otherName}'s Turn`;
  }

  // ---------- rendering engine ----------
  // A persistent canvas + requestAnimationFrame loop (one per game, not rebuilt every move) --
  // this is what makes the per-hole masking/strobe effect possible, same architecture as the
  // prototype's own draw(t) loop. render(session) just keeps `currentSession` fresh; the loop
  // itself reads it every frame.
  let canvasEl = null, ctx = null, rafId = null;
  let bgImage = null;
  let currentSession = null;
  let activeAnim = null; // { col, row, mark, y, vy, phase } -- the currently-falling disc, or null
  let confettiParticles = [];
  let confettiStart = 0;

  function drawFrame(t) {
    if (!canvasEl || !canvasEl.isConnected) { rafId = null; return; } // DOM was replaced -- stop
    const session = currentSession;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    if (bgImage && bgImage.complete && bgImage.naturalWidth) ctx.drawImage(bgImage, 0, 0, CANVAS_W, CANVAS_H);

    const winLine = session && session.result && session.result !== 'draw' ? session.result.line : [];
    const isWinCell = (r, c) => winLine.some(([wr, wc]) => wr === r && wc === c);

    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const { x, y, r } = holeGeom(row, col);
        // Clip to this hole's own circle before drawing anything into it -- same guard the
        // prototype used (ctx.clip() per hole), so a disc can never visually bleed onto the solid
        // board face even if its position/radius is slightly off; the frame stays in front by
        // construction since nothing drawn here can escape the opening.
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
        ctx.clip();

        const settled = session && session.board[row][col];
        if (settled) {
          drawDisc(ctx, x, y, settled, r * 0.92);
          // Falling-disc visibility check runs independently per hole, even over a settled cell's
          // column -- harmless, since a column never has a falling disc above an already-settled
          // target row in practice (the move that fills a row ends that disc's animation).
        } else if (activeAnim && activeAnim.col === col) {
          // The core of the prototype's masking trick: only draw the falling disc here if its
          // CURRENT y is close to THIS hole's y. Reveal windows (r*2) don't overlap the ~1.8x-r
          // gap between adjacent holes, so the disc is invisible while crossing the solid board
          // face between them and reappears at the next hole down -- not a different animation,
          // the same disappear/reappear check as the prototype's draw() loop.
          if (Math.abs(activeAnim.y - y) < r * 2) {
            drawDisc(ctx, x, activeAnim.y, activeAnim.mark, r * 0.92);
          }
        }
        ctx.restore(); // drop the clip

        // Win-glow ring is intentionally drawn AFTER the clip is dropped -- it needs to extend a
        // few px beyond the hole's own edge to read as a glow, same as the prototype's win-pulse
        // pass, which also runs unclipped after its per-hole loop.
        if (settled && isWinCell(row, col)) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, r + 4 + 3 * Math.sin(t / 160), 0, Math.PI * 2);
          ctx.strokeStyle = '#ffe85c';
          ctx.lineWidth = 5;
          ctx.shadowColor = '#fff58e';
          ctx.shadowBlur = 20;
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    if (confettiParticles.length) {
      if (t - confettiStart > 4400) {
        confettiParticles = [];
      } else {
        for (const p of confettiParticles) {
          p.y += p.speed * 2.4;
          p.x += Math.sin(t / 220 + p.rot) * 0.8;
          p.rot += 0.035;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      }
    }

    rafId = requestAnimationFrame(drawFrame);
  }

  // Gravity + landing-bounce physics, ported directly from the prototype's drop() step() --
  // same accel/damping constants, same two-phase (fall-then-settle) logic. Calls onSettle once
  // the disc has fully come to rest in its target hole.
  function animateDrop(col, mark, targetRow, onSettle) {
    const startY = pxY(BOARD_GEOM.rowTop[0]) - pxX(BOARD_GEOM.holeRadius) * 3;
    const targetGeom = holeGeom(targetRow, col);
    activeAnim = { col, mark, y: startY, vy: 0, phase: 0 };
    let prev = performance.now();
    function step(now) {
      if (!activeAnim) return; // cancelled mid-fall (e.g. Play Again)
      const dt = Math.min((now - prev) / 16.667, 2);
      prev = now;
      activeAnim.vy += 0.88 * dt;
      activeAnim.y += activeAnim.vy * dt;
      if (activeAnim.y >= targetGeom.y) {
        activeAnim.y = targetGeom.y;
        if (activeAnim.phase === 0 && activeAnim.vy > 5) {
          activeAnim.vy = -Math.min(7, activeAnim.vy * 0.10);
          activeAnim.phase = 1;
        } else {
          activeAnim = null;
          onSettle();
          return;
        }
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function startConfetti() {
    confettiParticles = Array.from({ length: 110 }, () => ({
      x: Math.random() * CANVAS_W, y: -Math.random() * 900, rot: Math.random() * 6,
      w: 8 + Math.random() * 12, h: 5 + Math.random() * 9,
      color: ['#ffe351', '#ff3355', '#64caff', '#fff', '#9b69ff'][Math.floor(Math.random() * 5)],
      speed: 2 + Math.random() * 4,
    }));
    confettiStart = performance.now();
  }

  function colFromEvent(e) {
    const rect = canvasEl.getBoundingClientRect();
    const x = (e.clientX - rect.left) * CANVAS_W / rect.width;
    const y = (e.clientY - rect.top) * CANVAS_H / rect.height;
    const topY = pxY(BOARD_GEOM.rowTop[0]) - pxX(BOARD_GEOM.holeRadius) * 1.6;
    const botY = pxY(BOARD_GEOM.rowTop[ROWS - 1]) + pxX(BOARD_GEOM.holeRadius) * 1.6;
    if (y < topY || y > botY) return -1;
    let best = 0, bestDist = Infinity;
    for (let c = 0; c < COLS; c++) {
      const d = Math.abs(pxX(BOARD_GEOM.colLeft[c]) - x);
      if (d < bestDist) { bestDist = d; best = c; }
    }
    return best;
  }

  function buildShell(body) {
    // Settings (computer difficulty) is a local-vs-computer-only concept and never changes mid-
    // session (a game stays local or stays remote its whole life), so deciding whether to show it
    // ONCE here, at mount time, is safe. Again is different -- buildShell only runs once per game
    // (see render()'s "canvas missing/disconnected" check), but a REMOTE game's status flips from
    // active to finished via a later render() that only runs the cheap updateChrome() path, not
    // this one -- so Again is always in the DOM and updateChrome() toggles whether it's shown,
    // rather than this function baking in a one-time, now-stale answer.
    const isLocal = !!(currentSession && currentSession.isLocal);
    body.innerHTML = `
      <div class="connect4-board">
        <div class="connect4-frame">
          <canvas class="connect4-canvas" width="${CANVAS_W}" height="${CANVAS_H}"></canvas>
          ${namePlateHtml('p1', 'p1')}
          ${namePlateHtml('p2', 'p2')}
          <div class="connect4-status" aria-live="polite"><span class="connect4-status-text"></span></div>
          <button type="button" class="connect4-home-btn" id="connect4-home-btn" aria-label="Home"></button>
          <button type="button" class="connect4-again-btn" id="connect4-again-btn" aria-label="Play Again" style="display:none"></button>
          ${isLocal ? '<button type="button" class="connect4-settings-btn" id="connect4-settings-btn" aria-label="Settings"></button>' : ''}
        </div>
      </div>`;
    canvasEl = body.querySelector('.connect4-canvas');
    ctx = canvasEl.getContext('2d');
    if (!bgImage) { bgImage = new Image(); bgImage.src = BOARD_GEOM.bg; }
    canvasEl.addEventListener('pointerdown', (e) => {
      const col = colFromEvent(e);
      if (col < 0) return;
      if (currentSession && currentSession.isLocal) tapColumn(col); else tapColumnRemote(currentSession, col);
    });
    document.getElementById('connect4-home-btn').addEventListener('click', () => {
      document.getElementById('vs-play-back-btn').click();
    });
    document.getElementById('connect4-again-btn').addEventListener('click', () => {
      if (currentSession && currentSession.isLocal) playAgain(); else playAgainRemote(currentSession);
    });
    const settingsBtn = document.getElementById('connect4-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => { settingsOpen = true; render(currentSession); });
    if (!rafId) rafId = requestAnimationFrame(drawFrame);
  }

  function updateChrome(session) {
    const names = playerNames(session);
    const againBtn = document.querySelector('.connect4-again-btn');
    // Local: always available (mid-game restart). Remote: only once the game is actually over --
    // no unilateral mid-game reset while the other kid is still playing.
    if (againBtn) againBtn.style.display = (session.isLocal || session.status === 'finished') ? '' : 'none';
    const p1El = document.querySelector('.connect4-nameplate.p1');
    const p2El = document.querySelector('.connect4-nameplate.p2');
    if (p1El) p1El.textContent = names.p1;
    if (p2El) p2El.textContent = names.p2;
    const statusEl = document.querySelector('.connect4-status-text');
    if (statusEl) statusEl.textContent = statusText(session);
  }

  function render(session) {
    if (settingsOpen) { renderSettings(session); return; }
    currentSession = session;
    const body = document.getElementById('vs-play-body');
    if (!canvasEl || !canvasEl.isConnected) buildShell(body);
    updateChrome(session);
    if (session.status === 'finished' && session.result && session.result !== 'draw') {
      // A remote rematch (see playAgainRemote) reuses the SAME session.id for a second game, so
      // id alone isn't a unique-per-win key there the way it is for a one-shot game -- folding the
      // final board in too keeps each distinct win's key distinct (false positive would need the
      // exact same board to recur, not just the same session).
      const key = session.isLocal ? `local|${session.nonce}` : `${session.id}|${JSON.stringify(session.board)}`;
      if (lastCelebratedKey !== key) { lastCelebratedKey = key; startConfetti(); }
    }
  }

  // ---------- settings screen ----------
  // Replaces the board entirely while open, same fullscreen .connect4-board/.connect4-frame shell
  // as the real board (reusing BOARD_GEOM.bg as a plain CSS background instead of canvas, since
  // there's nothing to animate here) -- same pattern as Tic Tac Toe's renderSettings. Closing it
  // re-renders the normal board; render()'s existing "canvas missing/disconnected" check handles
  // rebuilding the canvas and restarting the draw loop, since this wipes the old canvas out via
  // body.innerHTML same as starting fresh would.
  const DIFFICULTIES = [
    { key: 'easy', label: 'Easy', hint: 'Computer drops randomly' },
    { key: 'medium', label: 'Medium', hint: 'Computer wins when it can, blocks when it must' },
    { key: 'hard', label: 'Hard', hint: 'Computer plans several moves ahead -- tough to beat' },
  ];
  function renderSettings(session) {
    const body = document.getElementById('vs-play-body');
    const optionsHtml = DIFFICULTIES.map((d) => `
      <button type="button" class="connect4-settings-option${d.key === difficulty ? ' active' : ''}" data-difficulty="${d.key}">
        <span class="connect4-settings-option-label">${d.label}</span>
        <span class="connect4-settings-option-hint">${d.hint}</span>
      </button>`).join('');

    body.innerHTML = `
      <div class="connect4-board">
        <div class="connect4-frame" style="background-image:url('${BOARD_GEOM.bg}');background-size:100% 100%;">
          <div class="connect4-settings-panel">
            <h3>Computer difficulty</h3>
            ${optionsHtml}
            <button type="button" class="connect4-settings-back" id="connect4-settings-back-btn">Back to game</button>
          </div>
        </div>
      </div>`;

    body.querySelectorAll('.connect4-settings-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        difficulty = btn.dataset.difficulty;
        setData(DIFFICULTY_KEY, difficulty);
        renderSettings(session);
      });
    });
    document.getElementById('connect4-settings-back-btn').addEventListener('click', () => {
      settingsOpen = false;
      render(session);
    });
  }

  // ---------- local driver: vs the computer, no network at all (same idea as War/Tic Tac Toe) ----------
  let localGame = null;
  let localRerender = null;
  let botTimer = null;
  // Keyed (like War's lastFxKey), not a plain boolean -- a boolean reset only by startLocalGame/
  // playAgain would stay stuck "already celebrated" the first time this module renders a REMOTE
  // win after having shown a local one earlier in the session, since nothing remote ever resets it.
  // A remote session.id is unique per real game, so it alone is enough to key on there; a LOCAL
  // game's id is always the literal string 'local' though (same id every round), so localGameNonce
  // (bumped each startLocalGame/playAgain) stands in for it to keep each local ROUND's key unique.
  let lastCelebratedKey = null;
  let localGameNonce = 0;
  // Whether the Settings screen is covering the board right now -- a view-only flag, not game
  // state, so playAgain() leaves it alone; only reset when the game session itself goes away (see
  // clearLocalGame below), same as Tic Tac Toe's settingsOpen.
  let settingsOpen = false;

  function startLocalGame(meId, onChange) {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    canvasEl = null; ctx = null; activeAnim = null; confettiParticles = [];
    localGameNonce++;
    localGame = {
      isLocal: true, id: 'local', game_type: 'connect_4', nonce: localGameNonce,
      challenger_id: meId, opponent_id: 'computer', status: 'active',
      ...buildInitialState(),
      thinking: false,
    };
    localRerender = onChange;
    return localGame;
  }
  // Called once a real challenge is accepted (see games.js respondToChallenge) -- the shared
  // columns a remote session needs, same spirit as War's buildInitialState.
  function buildInitialState() {
    return { board: createEmptyBoard(), turn: 0, result: null, last_move: null };
  }
  function clearLocalGame() {
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    activeAnim = null;
    localGame = null;
    localRerender = null;
    currentSession = null;
    settingsOpen = false;
  }
  function notifyLocal() { if (localRerender) localRerender(localGame); }

  function checkEnd(row, col) {
    const win = checkWinner(localGame.board, row, col);
    if (win) { localGame.status = 'finished'; localGame.result = win; return; }
    if (isBoardFull(localGame.board)) { localGame.status = 'finished'; localGame.result = 'draw'; }
  }

  function maybeBotMove() {
    if (!localGame || localGame.status !== 'active' || localGame.turn !== 1) return;
    localGame.thinking = true;
    notifyLocal();
    botTimer = setTimeout(() => {
      botTimer = null;
      if (!localGame || localGame.status !== 'active') return;
      localGame.thinking = false;
      const col = pickBotMove(localGame.board);
      if (col === null) return;
      const res = dropDisc(localGame.board, col, 'G');
      if (!res) return;
      animateDrop(col, 'G', res.row, () => {
        localGame.board = res.board;
        localGame.last_move = { row: res.row, col };
        checkEnd(res.row, col);
        if (localGame.status === 'active') localGame.turn = 0;
        notifyLocal();
      });
    }, 500 + Math.random() * 500);
  }

  function tapColumn(col) {
    if (!localGame || localGame.status !== 'active' || localGame.thinking || localGame.turn !== 0 || activeAnim) return;
    const res = dropDisc(localGame.board, col, 'R');
    if (!res) return;
    animateDrop(col, 'R', res.row, () => {
      localGame.board = res.board;
      localGame.last_move = { row: res.row, col };
      checkEnd(res.row, col);
      if (localGame.status === 'active') localGame.turn = 1;
      notifyLocal();
      maybeBotMove();
    });
  }

  // ---------- remote driver: playing a real kid, via Supabase (same idea as War's) ----------
  // No separate "resolve" step needed, same reasoning as Tic Tac Toe: Connect 4 strictly alternates
  // on one shared board, so whoever just moved can compute win/draw/finished in the same step and
  // write it all at once -- no concurrent-write case beyond "the game is still active".
  async function tapColumnRemote(session, col) {
    const me = getActiveProfile();
    if (!me) return;
    const amIP1 = me.id === session.challenger_id;
    const myTurn = amIP1 ? 0 : 1;
    if (session.turn !== myTurn || activeAnim) return;
    const myMark = amIP1 ? 'R' : 'G';
    const res = dropDisc(session.board, col, myMark);
    if (!res) return;
    animateDrop(col, myMark, res.row, async () => {
      const patch = { board: res.board, last_move: { row: res.row, col }, turn: myTurn === 0 ? 1 : 0 };
      const win = checkWinner(res.board, res.row, col);
      if (win) Object.assign(patch, { status: 'finished', result: win, winner_kid_id: me.id });
      else if (isBoardFull(res.board)) Object.assign(patch, { status: 'finished', result: 'draw' });
      const { error } = await supabaseClient.from('game_sessions').update(patch)
        .eq('id', session.id).eq('status', 'active');
      if (error) console.error('[Connect4] could not drop:', error);
    });
  }

  // Either kid can start a rematch once the game is actually over -- reuses the same session row
  // (just resets it back to a fresh board), so the existing Realtime subscription both kids are
  // already on picks it up with no new challenge/accept round-trip needed. Guarded on the game
  // still being 'finished' so a stray double-tap can't stomp a round that's already back underway.
  async function playAgainRemote(session) {
    const patch = { ...buildInitialState(), status: 'active' };
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('status', 'finished');
    if (error) console.error('[Connect4] could not start a rematch:', error);
  }

  function playAgain() {
    if (!localGame || !localGame.isLocal) return;
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    activeAnim = null;
    confettiParticles = [];
    localGameNonce++;
    localGame.board = createEmptyBoard();
    localGame.status = 'active';
    localGame.result = null;
    localGame.last_move = null;
    localGame.thinking = false;
    localGame.turn = 0;
    localGame.nonce = localGameNonce;
    notifyLocal();
  }

  return {
    createEmptyBoard, dropDisc, checkWinner, isBoardFull,
    buildInitialState, startLocalGame, clearLocalGame, render,
  };
})();
