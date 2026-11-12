// Tic Tac Toe. Themed boards (a landscape, fixed-4:3 image per theme, Player 1 = X / Player 2 = O,
// plus a baked-in Home/Refresh/Settings row) live entirely in THEMES below -- background image,
// the 9 cell positions, the 3 button positions, the piece images, and every per-cell/per-mark
// centering correction from piece-align-tool.html. style.css only holds STRUCTURAL rules shared by
// every theme (sizing math, animations, the box-shadow shape); nothing theme-specific lives there
// anymore, so adding a new theme is "add an entry to THEMES + new image files", not a CSS/JS
// rewrite. A local (vs-computer) game picks a theme at random the same way War does; only a local
// match is wired up at all -- a real VS-another-kid match over Supabase would need a new
// game_sessions column shape and isn't requested yet.
//
// Board representation: a 9-slot array, index 0-8 left-to-right/top-to-bottom like a phone keypad:
//   0 | 1 | 2
//   3 | 4 | 5
//   6 | 7 | 8
// Each slot is 'X', 'O', or null (empty). 'X' always goes first, matching the board art's
// "Player 1 = X" badge; the human is always X, the computer is always O.
const TicTacToe = (() => {
  const WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6],            // diagonals
  ];

  function createEmptyBoard() { return Array(9).fill(null); }

  function otherMark(mark) { return mark === 'X' ? 'O' : 'X'; }

  // Whose turn it is, purely derived from the board: X always moves first, and since the marks
  // strictly alternate, X is one move "ahead" of O until they even out.
  function currentTurn(board) {
    const xCount = board.filter((c) => c === 'X').length;
    const oCount = board.filter((c) => c === 'O').length;
    return xCount > oCount ? 'O' : 'X';
  }

  // Returns { mark, line } for the first three-in-a-row found, or null if nobody's won yet.
  function checkWinner(board) {
    for (const line of WIN_LINES) {
      const [a, b, c] = line;
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { mark: board[a], line };
      }
    }
    return null;
  }

  function isBoardFull(board) { return board.every((c) => c !== null); }

  // A finished game is either a three-in-a-row or a full board with no winner (a draw) -- used to
  // stop accepting moves once either is true.
  function isOver(board) { return !!checkWinner(board) || isBoardFull(board); }

  // Pure move application: returns a NEW board with the mark placed at index, or null if the move
  // is illegal (out of range, cell already taken, or the game already ended). Never mutates the
  // board passed in, matching the rest of this app's patch-style game logic (see war.js).
  function applyMove(board, index, mark) {
    if (index < 0 || index > 8) return null;
    if (board[index] !== null) return null;
    if (isOver(board)) return null;
    if (mark !== currentTurn(board)) return null; // not this mark's turn
    const next = board.slice();
    next[index] = mark;
    return next;
  }

  // ---------- computer difficulty ----------
  // Saved per-device (same getData/setData localStorage wrapper the rest of the app uses), so it
  // sticks across games instead of resetting every time. Defaults to 'medium' -- a plain coin-flip
  // random bot (the only mode that existed before) is a bit too easy to not notice, and 'hard' is
  // unbeatable, which isn't a great surprise default for a kid who hasn't picked it on purpose.
  const DIFFICULTY_KEY = 'family-app.tictactoe.difficulty';
  let difficulty = getData(DIFFICULTY_KEY, 'medium');

  function openCells(board) { return board.reduce((acc, c, i) => { if (c === null) acc.push(i); return acc; }, []); }
  // Unlike applyMove, this doesn't check whose turn it "really" is -- it's for the bot to simulate
  // hypothetical moves (e.g. "what if X played here") regardless of whose actual turn it is.
  function simulateMove(board, index, mark) {
    const next = board.slice();
    next[index] = mark;
    return next;
  }
  function randomMove(board) {
    const open = openCells(board);
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  }
  // The first open cell that would let `mark` win immediately, or null if none does.
  function findWinningMove(board, mark) {
    for (const i of openCells(board)) {
      const win = checkWinner(simulateMove(board, i, mark));
      if (win && win.mark === mark) return i;
    }
    return null;
  }
  // Take a winning move if there is one; otherwise block the human's winning move if there is one;
  // otherwise random. Noticeably smarter than easy without being unbeatable.
  function mediumMove(board) {
    return findWinningMove(board, 'O') ?? findWinningMove(board, 'X') ?? randomMove(board);
  }
  // Classic minimax over the whole remaining game tree -- trivial to run instantly at this board
  // size (at most 9! nodes, far fewer in practice once wins start pruning branches), so no need for
  // alpha-beta pruning or memoization. O maximizes, X minimizes; ties score 0.
  function minimax(board, mark) {
    const winner = checkWinner(board);
    if (winner) return { score: winner.mark === 'O' ? 1 : -1 };
    if (isBoardFull(board)) return { score: 0 };
    let best = null;
    for (const i of openCells(board)) {
      const result = minimax(simulateMove(board, i, mark), otherMark(mark));
      const candidate = { index: i, score: result.score };
      if (!best) { best = candidate; continue; }
      if (mark === 'O' ? candidate.score > best.score : candidate.score < best.score) best = candidate;
    }
    return best;
  }
  function hardMove(board) { return minimax(board, 'O').index; }

  function pickBotMove(board) {
    if (difficulty === 'hard') return hardMove(board);
    if (difficulty === 'medium') return mediumMove(board);
    return randomMove(board);
  }

  // ---------- themes ----------
  // `cell`: shared width/height (% of board) plus each column's left-edge % and each row's
  // top-edge % -- these 3 numbers aren't quite uniform across cells (photographed/rendered art,
  // not a vector grid) but are close enough that one shared size reads fine.
  // `buttons`: shared top/width/height plus each control's left-edge %.
  // `pieceBase`: default per-mark centering correction (compensates for the piece art's own
  // visual-weight asymmetry, e.g. a crown sitting above a ring). `pieceCell[i]`, indexed 0-8 like
  // the board, holds a PER-CELL override for X and/or O (null = "use pieceBase for this one") --
  // the 9 tiles aren't perfectly uniform so a cell sometimes needs its own nudge on top of the
  // mark's base correction.
  // `glowCell[i]`: per-cell win-glow position override in px ({ox, oy}) or null = no offset.
  // castle's data pulled out to its own constant so the clone helper below (used by the 5 same-
  // template boards further down) can reference it -- can't reference THEMES.castle from inside the
  // THEMES literal itself, since THEMES isn't bound to anything until that whole literal finishes.
  const CASTLE_THEME = {
    bg: 'icons/tictactoe/castle-board.png',
    // Replaced with a widescreen (16:9, 1671x941) sunset castle board -- a different aspect ratio
    // than the old 4:3 art, which is why .tictactoe-frame's aspect-ratio in style.css changed too.
    // Grid/buttons/nameplates all measured fresh the same way as before (brightness/color
    // detection, cross-validated per row/column), not reused from the old 4:3 numbers.
    cell: { width: 11.71, height: 17.85, colLeft: [31.00, 44.11, 57.27], rowTop: [24.55, 44.31, 63.76] },
    buttons: { top: 83.84, width: 6.64, height: 11.05, left: { home: 21.46, refresh: 47.49, settings: 71.78 } },
    pieceImg: { X: 'icons/tictactoe/piece-x.png', O: 'icons/tictactoe/piece-o.png' },
    // pieceBase carries over unchanged -- it corrects for the PIECE ART's own shape (e.g. the O's
    // crown), which didn't change, only the background did. pieceCell/glowCell reset to neutral
    // below, though: those correct for per-TILE position, and the tiles themselves moved, so the
    // old per-cell numbers would be close-but-wrong rather than right. Re-tune via
    // piece-align-tool.html.
    pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: -0.1, dy: -1.9, scale: 1 } },
    pieceCell: [
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
      { X: null, O: { dx: -0.1, dy: -7.9, scale: 1 } },
    ],
    glowBase: { spread: 4, blur: 22, color: '#75ff45' },
    glowCell: Array.from({ length: 9 }, () => null),
    namePlate: {
      p1: { left: 10.29, top: 5.31, width: 11.91, height: 4.68 },
      p2: { left: 77.20, top: 5.31, width: 12.87, height: 4.36 },
    },
  };
  // Deep-clones castle's grid/button/piece/glow/nameplate numbers for a new same-template board --
  // pirate/volcano/underwater/toyroom/space were deliberately generated to match the castle board's
  // layout (confirmed: all within 1px of castle's 1671x941 and the same grid/badge/button
  // composition), so reusing castle's already-tuned numbers as each one's STARTING point is the
  // right call, not a shortcut -- re-measuring from scratch would just reproduce the same numbers.
  // Each clone is independent (not a shared reference), so tuning one via piece-align-tool.html
  // later won't drag the others along with it. No new piece art was provided for these, so they
  // reuse castle's X/O images too.
  function cloneCastleLayout() {
    const c = CASTLE_THEME;
    return {
      cell: { ...c.cell, colLeft: [...c.cell.colLeft], rowTop: [...c.cell.rowTop] },
      buttons: { ...c.buttons, left: { ...c.buttons.left } },
      pieceImg: { ...c.pieceImg },
      pieceBase: { X: { ...c.pieceBase.X }, O: { ...c.pieceBase.O } },
      pieceCell: c.pieceCell.map((cell) => ({ X: cell.X ? { ...cell.X } : null, O: cell.O ? { ...cell.O } : null })),
      glowBase: { ...c.glowBase },
      glowCell: c.glowCell.map((g) => (g ? { ...g } : null)),
      namePlate: { p1: { ...c.namePlate.p1 }, p2: { ...c.namePlate.p2 } },
    };
  }

  const THEMES = {
    castle: CASTLE_THEME,
    candy: {
      bg: 'icons/tictactoe/castle-board-candy.png',
      // Also replaced with a widescreen (16:9, 1672x941) version. Same measurement method as
      // castle; this candy board's cream-tile color profile needed slightly looser thresholds than
      // the previous candy image (a lighter/more saturated frosting tone and a brighter maroon
      // badge-bar red), so the classifiers were recalibrated against THIS image's actual sampled
      // pixels rather than reusing the old candy board's thresholds blind.
      cell: { width: 11.46, height: 16.33, colLeft: [31.16, 44.20, 57.36], rowTop: [25.51, 44.42, 63.13] },
      buttons: { top: 83.84, width: 6.70, height: 11.05, left: { home: 21.53, refresh: 47.49, settings: 71.65 } },
      pieceImg: { X: 'icons/tictactoe/piece-x-candy.png', O: 'icons/tictactoe/piece-o-candy.png' },
      pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: 0, dy: 0, scale: 1 } },
      pieceCell: [
        { X: { dx: 0, dy: -6.0, scale: 1 }, O: { dx: 0, dy: -7.0, scale: 1 } },
        { X: { dx: 0, dy: -6.0, scale: 1 }, O: { dx: 0, dy: -6.0, scale: 1 } },
        { X: { dx: 0, dy: -6.0, scale: 1 }, O: { dx: 0, dy: -7.0, scale: 1 } },
        { X: { dx: 0, dy: -7.0, scale: 1 }, O: { dx: 0, dy: -7.0, scale: 1 } },
        { X: { dx: 0, dy: -7.0, scale: 1 }, O: { dx: 0, dy: -7.0, scale: 1 } },
        { X: { dx: 0, dy: -7.0, scale: 1 }, O: { dx: 0, dy: -7.0, scale: 1 } },
        { X: { dx: 0, dy: -6.0, scale: 1 }, O: { dx: 0, dy: -6.0, scale: 1 } },
        { X: { dx: 0, dy: -6.0, scale: 1 }, O: { dx: 0, dy: -6.0, scale: 1 } },
        { X: { dx: 0, dy: -6.0, scale: 1 }, O: { dx: 0, dy: -6.0, scale: 1 } },
      ],
      glowBase: { spread: 4, blur: 22, color: '#75ff45' },
      glowCell: Array.from({ length: 9 }, () => null),
      namePlate: {
        p1: { left: 9.69, top: 5.21, width: 13.16, height: 4.89 },
        p2: { left: 76.70, top: 5.21, width: 13.82, height: 4.89 },
      },
    },
    pirate: {
      bg: 'icons/tictactoe/castle-board-pirate.png',
      ...cloneCastleLayout(),
      // Own piece art (cutlass X / skull-and-rope-wheel O), not castle's crowned pieces -- different
      // shape, so the crown-offset pieceBase/pieceCell corrections don't apply; reset to neutral.
      pieceImg: { X: 'icons/tictactoe/piece-x-pirate.png', O: 'icons/tictactoe/piece-o-pirate.png' },
      pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: 0, dy: 0, scale: 1 } },
      // Nudged via piece-align-tool.html: cell 8 (row 3, col 3) sits slightly differently in the
      // board photo than the other tiles, and cell 7's O needed its own correction too.
      pieceCell: [
        { X: { dx: -1.4, dy: -2.9, scale: 1.00 }, O: { dx: 0.0, dy: -1.0, scale: 1.00 } },
        { X: { dx: 0.0, dy: -2.7, scale: 1.00 }, O: { dx: 0.0, dy: -1.0, scale: 1.00 } },
        { X: { dx: 0.0, dy: -3.1, scale: 1.00 }, O: { dx: 1.0, dy: -1.0, scale: 1.00 } },
        { X: { dx: -0.6, dy: -3.1, scale: 1.00 }, O: { dx: 0.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: -1.0, dy: -3.1, scale: 1.00 }, O: { dx: 0.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: -0.6, dy: -3.3, scale: 1.00 }, O: { dx: 2.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: -1.0, dy: -4.0, scale: 1.00 }, O: { dx: 0.0, dy: -1.0, scale: 1.00 } },
        { X: { dx: -1.0, dy: -3.0, scale: 1.00 }, O: { dx: 0.0, dy: -1.0, scale: 1.00 } },
        { X: { dx: 1.0, dy: -3.0, scale: 1.00 }, O: { dx: 1.0, dy: -1.0, scale: 1.00 } },
      ],
    },
    volcano: {
      bg: 'icons/tictactoe/castle-board-volcano.png',
      ...cloneCastleLayout(),
      // Own piece art (lava-cracked claw X / T-Rex egg O), not castle's crowned pieces -- reset
      // corrections to neutral, same reasoning as pirate/toyroom/space.
      pieceImg: { X: 'icons/tictactoe/piece-x-volcano.png', O: 'icons/tictactoe/piece-o-volcano.png' },
      pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: 0, dy: 0, scale: 1 } },
      // Nudged via piece-align-tool.html.
      pieceCell: [
        { X: { dx: -4.3, dy: -3.5, scale: 1.00 }, O: { dx: -2.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: 2.0, dy: -4.0, scale: 1.00 }, O: { dx: 5.1, dy: -4.1, scale: 1.00 } },
        { X: { dx: 5.3, dy: -5.1, scale: 1.00 }, O: { dx: 6.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: -5.0, dy: -2.0, scale: 1.00 }, O: { dx: -2.0, dy: -1.0, scale: 1.00 } },
        { X: { dx: 1.0, dy: -3.0, scale: 1.00 }, O: { dx: 4.0, dy: 0.0, scale: 1.00 } },
        { X: { dx: 5.0, dy: -2.0, scale: 1.00 }, O: { dx: 6.2, dy: 0.0, scale: 1.00 } },
        { X: { dx: -5.0, dy: 0.0, scale: 1.00 }, O: { dx: -2.0, dy: 0.0, scale: 1.00 } },
        { X: { dx: 1.0, dy: -1.0, scale: 1.00 }, O: { dx: 3.0, dy: 0.0, scale: 1.00 } },
        { X: { dx: 5.0, dy: 0.0, scale: 1.00 }, O: { dx: 6.0, dy: 0.0, scale: 1.00 } },
      ],
    },
    underwater: {
      bg: 'icons/tictactoe/castle-board-underwater.png',
      ...cloneCastleLayout(),
      // Own piece art (starfish X / octopus-and-shell O), not castle's crowned pieces -- reset
      // corrections to neutral, same reasoning as pirate/toyroom/space/volcano.
      pieceImg: { X: 'icons/tictactoe/piece-x-underwater.png', O: 'icons/tictactoe/piece-o-underwater.png' },
      pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: 0, dy: 0, scale: 1 } },
      pieceCell: Array.from({ length: 9 }, () => ({ X: null, O: null })),
    },
    toyroom: {
      bg: 'icons/tictactoe/castle-board-toyroom.png',
      ...cloneCastleLayout(),
      // Own piece art (plush star X / rocket-and-rings O), not castle's crowned pieces -- reset
      // corrections to neutral since the crown-offset tuning doesn't apply to different-shaped art.
      pieceImg: { X: 'icons/tictactoe/piece-x-toyroom.png', O: 'icons/tictactoe/piece-o-toyroom.png' },
      pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: 0, dy: 0, scale: 1 } },
      // Nudged via piece-align-tool.html.
      pieceCell: [
        { X: { dx: -3.0, dy: -4.0, scale: 1.00 }, O: { dx: -3.0, dy: -4.0, scale: 1.00 } },
        { X: { dx: 0.0, dy: -3.0, scale: 1.00 }, O: { dx: 0.0, dy: -4.0, scale: 1.00 } },
        { X: { dx: 1.0, dy: -4.0, scale: 1.00 }, O: { dx: 1.0, dy: -4.0, scale: 1.00 } },
        { X: { dx: -3.0, dy: -5.0, scale: 1.00 }, O: { dx: -2.0, dy: -4.0, scale: 1.00 } },
        { X: { dx: 0.0, dy: -5.0, scale: 1.00 }, O: { dx: 0.0, dy: -4.0, scale: 1.00 } },
        { X: { dx: 1.0, dy: -5.0, scale: 1.00 }, O: { dx: 2.0, dy: -4.0, scale: 1.00 } },
        { X: { dx: -4.0, dy: -3.0, scale: 1.00 }, O: { dx: -3.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: 0.0, dy: -2.0, scale: 1.00 }, O: { dx: 0.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: 1.0, dy: -3.0, scale: 1.00 }, O: { dx: 2.0, dy: -3.0, scale: 1.00 } },
      ],
    },
    space: {
      bg: 'icons/tictactoe/castle-board-space.png',
      ...cloneCastleLayout(),
      // Own piece art (ringed-planet X / rocket-ring O) -- reset corrections to neutral, same
      // reasoning as pirate/toyroom: castle's crown-offset tuning doesn't apply to different art.
      pieceImg: { X: 'icons/tictactoe/piece-x-space.png', O: 'icons/tictactoe/piece-o-space.png' },
      pieceBase: { X: { dx: 0, dy: 0, scale: 1 }, O: { dx: 0, dy: 0, scale: 1 } },
      // Nudged via piece-align-tool.html.
      pieceCell: [
        { X: { dx: -3.0, dy: -7.0, scale: 1.00 }, O: { dx: -4.0, dy: -6.0, scale: 1.00 } },
        { X: { dx: -1.0, dy: -7.0, scale: 1.00 }, O: { dx: -2.0, dy: -6.0, scale: 1.00 } },
        { X: { dx: 2.0, dy: -7.0, scale: 1.00 }, O: { dx: 0.0, dy: -5.0, scale: 1.00 } },
        { X: { dx: -3.0, dy: -6.0, scale: 1.00 }, O: { dx: -6.0, dy: -6.0, scale: 1.00 } },
        { X: { dx: -1.0, dy: -6.0, scale: 1.00 }, O: { dx: -2.0, dy: -6.0, scale: 1.00 } },
        { X: { dx: 3.0, dy: -7.0, scale: 1.00 }, O: { dx: 0.0, dy: -6.0, scale: 1.00 } },
        { X: { dx: -3.0, dy: -4.0, scale: 1.00 }, O: { dx: -5.0, dy: -2.0, scale: 1.00 } },
        { X: { dx: -1.0, dy: -3.0, scale: 1.00 }, O: { dx: -2.0, dy: -3.0, scale: 1.00 } },
        { X: { dx: 2.0, dy: -4.0, scale: 1.00 }, O: { dx: 0.0, dy: -4.0, scale: 1.00 } },
      ],
    },
  };
  const THEME_KEYS = Object.keys(THEMES);
  function chooseTheme() { return THEME_KEYS[Math.floor(Math.random() * THEME_KEYS.length)]; }
  // A remote game has no theme column (same reasoning as War: avoid a migration just for this) --
  // both kids' devices instead derive the identical theme from the session's own id, which is
  // automatically stable and shared with no round-trip. Same hash as War's themeForSessionId.
  function themeForSessionId(id) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return THEME_KEYS[hash % THEME_KEYS.length];
  }
  const THEME_LABELS = {
    castle: 'Castle', candy: 'Candy', pirate: 'Pirate', volcano: 'Volcano',
    underwater: 'Undersea', toyroom: 'Toy Box', space: 'Space',
  };
  // Saved the same way as difficulty -- 'random' (the default) means "pick a new one every game",
  // same as the original behavior; picking a real theme key pins every future game to it until
  // changed back.
  const THEME_PREF_KEY = 'family-app.tictactoe.theme';
  let themePref = getData(THEME_PREF_KEY, 'random');
  function resolveTheme() { return themePref !== 'random' && THEMES[themePref] ? themePref : chooseTheme(); }

  function pieceTuning(theme, i, mark) {
    const cellOverride = theme.pieceCell[i] && theme.pieceCell[i][mark];
    return cellOverride || theme.pieceBase[mark];
  }
  function glowTuning(theme, i) {
    return theme.glowCell[i] || { ox: 0, oy: 0 };
  }

  // ---------- piece art ----------
  // `animate` is false for every pre-existing mark on a rerender (this module re-renders the whole
  // board on every change, unlike a one-shot DOM append) -- only the just-placed mark gets the
  // drop-in animation, via session.last_move (see tapCell/maybeBotMove/refreshLocal/tapCellRemote).
  //
  // Two nested spans, not one: the outer .tictactoe-piece plays the enter animation (which animates
  // its own `transform`, ending at `transform:none` via fill-mode "both"), while the inner
  // .tictactoe-piece-art carries the per-mark/per-cell centering nudge as ITS OWN `transform`,
  // applied inline (see render() below) since it now varies by theme. Putting both offsets on the
  // same element made the animation's end-state silently cancel the nudge every time a piece was
  // freshly placed -- it only reappeared once the next move's rerender dropped the `enter` class.
  function pieceHtml(theme, i, mark, animate) {
    const cls = mark.toLowerCase();
    const t = pieceTuning(theme, i, mark);
    const pieceStyle = t.scale !== 1 ? ` style="width:${(76 * t.scale).toFixed(2)}%;height:${(82 * t.scale).toFixed(2)}%"` : '';
    const artStyle = ` style="transform:translate(${t.dx}%, ${t.dy}%)"`;
    return `<span class="tictactoe-piece${animate ? ' enter' : ''}"${pieceStyle}><span class="tictactoe-piece-art ${cls}"${artStyle}><img src="${theme.pieceImg[mark]}" alt="${mark}" /></span></span>`;
  }

  // ---------- local driver: vs the computer, no network at all (same idea as War's local game) ----------
  let localGame = null;
  let localRerender = null;
  let botTimer = null;
  // Whether the Settings screen is covering the board right now -- a view-only flag, not game
  // state, so it isn't reset by refreshLocal() and doesn't need to survive a new startLocalGame().
  let settingsOpen = false;
  // Identifies which exact board instance is currently mounted in the DOM (see render()) -- a
  // kid-vs-kid game can trigger render() far more often than local play ever did (EVERY Realtime
  // change to ANY of the family's game_sessions rows re-renders whichever game screen is open right
  // now, not just changes to the one actually being watched), and tearing down + rebuilding every
  // cell's image on every single call -- including the 7-8 pieces that DIDN'T change that turn --
  // is expensive enough on a heavy illustrated board to visibly stutter/flash. mountedKey/
  // mountedBoard let render() tell "still the same game, something real changed" (patch just the
  // cells that differ) apart from "a different game/theme is now showing" (full rebuild, same as
  // before) and "literally nothing changed" (do even less).
  let mountedKey = null;
  let mountedBoard = null;

  function startLocalGame(meId, onChange) {
    localGame = {
      isLocal: true, id: 'local', game_type: 'tic_tac_toe',
      challenger_id: meId, opponent_id: 'computer', status: 'active',
      theme: resolveTheme(),
      ...buildInitialState(),
      thinking: false,
    };
    localRerender = onChange;
    return localGame;
  }
  // Called once a real challenge is accepted (see games.js respondToChallenge) -- the shared
  // columns a remote session needs, same spirit as War's buildInitialState. No theme column: a
  // remote game derives its theme deterministically from the session id instead (see
  // themeForSessionId, used in render()), same trick War uses to avoid a migration just for that.
  function buildInitialState() {
    return { board: createEmptyBoard(), result: null, last_move: null };
  }
  function clearLocalGame() {
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    localGame = null;
    localRerender = null;
    settingsOpen = false;
  }
  function notifyLocal() { if (localRerender) localRerender(localGame); }

  function checkEnd() {
    const win = checkWinner(localGame.board);
    if (win) { localGame.status = 'finished'; localGame.result = win; return; }
    if (isBoardFull(localGame.board)) { localGame.status = 'finished'; localGame.result = 'draw'; }
  }

  // The computer only ever reacts to the human's move (same "watching, not racing ahead" feel as
  // War's bot). Which cell it picks depends on `difficulty` (see pickBotMove above). `thinking`
  // drives the status pill's "Computer is thinking..." text during the delay.
  function maybeBotMove() {
    if (!localGame || localGame.status !== 'active') return;
    if (currentTurn(localGame.board) !== 'O') return;
    localGame.thinking = true; // caller renders once with this already set -- see tapCell
    botTimer = setTimeout(() => {
      botTimer = null;
      if (!localGame || localGame.status !== 'active') return;
      localGame.thinking = false;
      const choice = pickBotMove(localGame.board);
      if (choice === null) return;
      const next = applyMove(localGame.board, choice, 'O');
      if (!next) return;
      localGame.board = next;
      localGame.last_move = choice;
      checkEnd();
      notifyLocal();
    }, 500 + Math.random() * 500);
  }

  function tapCell(index) {
    if (!localGame || localGame.status !== 'active' || localGame.thinking) return;
    if (currentTurn(localGame.board) !== 'X') return; // computer's turn, or not your move
    const next = applyMove(localGame.board, index, 'X');
    if (!next) return;
    localGame.board = next;
    localGame.last_move = index;
    checkEnd();
    // Runs BEFORE the render, not after: this way the human's new piece and (if it's now the
    // computer's turn) the "Computer is thinking..." status both land in a SINGLE full re-render
    // instead of two back-to-back ones -- the board is heavy enough (board art + every placed
    // piece's image, all torn down and rebuilt on each render) that doing that twice per tap was
    // visibly janky/flashing.
    maybeBotMove();
    notifyLocal();
  }

  function refreshLocal() {
    if (!localGame) return;
    if (botTimer) { clearTimeout(botTimer); botTimer = null; }
    localGame.board = createEmptyBoard();
    localGame.status = 'active';
    localGame.result = null;
    localGame.last_move = null;
    localGame.thinking = false;
    notifyLocal();
  }

  // ---------- remote driver: playing a real kid, via Supabase (same idea as War's) ----------
  // No separate "resolve" step needed the way War has one: unlike War's simultaneous per-side
  // reveal, Tic Tac Toe strictly alternates on one shared board, so whoever just moved can compute
  // win/draw/finished in the same step and write it all at once -- the writer is always exactly the
  // kid whose turn it was, so there's no concurrent-write case to guard against beyond "the game is
  // still active" (eq('status','active')).
  async function tapCellRemote(session, index) {
    const me = getActiveProfile();
    if (!me) return;
    const myMark = me.id === session.challenger_id ? 'X' : 'O';
    if (currentTurn(session.board) !== myMark) return;
    const next = applyMove(session.board, index, myMark);
    if (!next) return;
    const patch = { board: next, last_move: index };
    const win = checkWinner(next);
    if (win) Object.assign(patch, { status: 'finished', result: win, winner_kid_id: me.id });
    else if (isBoardFull(next)) Object.assign(patch, { status: 'finished', result: 'draw' });
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('status', 'active');
    if (error) console.error('[TicTacToe] could not play:', error);
  }

  // Either kid can start a rematch once the game is actually over -- reuses the same session row
  // (just resets it back to a fresh board), so the existing Realtime subscription both kids are
  // already on picks it up with no new challenge/accept round-trip needed. Guarded on the game
  // still being 'finished' so a stray double-tap can't stomp a round that's already back underway.
  async function playAgainRemote(session) {
    const patch = { ...buildInitialState(), status: 'active' };
    const { error } = await supabaseClient.from('game_sessions').update(patch)
      .eq('id', session.id).eq('status', 'finished');
    if (error) console.error('[TicTacToe] could not start a rematch:', error);
  }

  // The P1 badge is always X, the P2 badge always O (baked into the board art) -- for a local game
  // the human is always X/p1 and the computer is O/p2; for a real kid-vs-kid game, p1/p2 are
  // whichever kid is the challenger/opponent, same convention as the board's own "Player 1 = X"
  // art. Falls back to generic labels/"You" if a name can't be found, same spirit as War's.
  function playerNames(session) {
    if (!session || session.isLocal) {
      const me = typeof getActiveProfile === 'function' ? getActiveProfile() : null;
      return { p1: (me && me.name) || 'You', p2: 'Computer' };
    }
    const challenger = loadProfiles().find((p) => p.id === session.challenger_id);
    const opponent = loadProfiles().find((p) => p.id === session.opponent_id);
    return { p1: (challenger && challenger.name) || 'Player 1', p2: (opponent && opponent.name) || 'Player 2' };
  }

  // Perspective-aware for a real kid-vs-kid game ("Your turn" when it's actually yours, the other
  // kid's real name otherwise) -- amIP1 is computed the same way for local play too (the human is
  // always set as challenger_id in startLocalGame), so "Your turn — X" / "Computer's turn — O" for
  // local falls straight out of the same logic as a special case, not a separate branch.
  function statusText(session) {
    const me = getActiveProfile();
    const amIP1 = !!(me && me.id === session.challenger_id);
    const myMark = amIP1 ? 'X' : 'O';
    const names = playerNames(session);
    if (session.status === 'finished') {
      if (session.result === 'draw') return "It's a tie! Try again!";
      if (session.result.mark === myMark) return '\u{1F389} You win!';
      const winnerName = session.result.mark === 'X' ? names.p1 : names.p2;
      return `\u{1F389} ${winnerName} wins!`;
    }
    if (session.thinking) return 'Computer is thinking…';
    const turn = currentTurn(session.board);
    if (turn === myMark) return `Your turn — ${turn}`;
    const otherName = turn === 'X' ? names.p1 : names.p2;
    return `${otherName}'s turn — ${turn}`;
  }

  // ---------- settings screen ----------
  // Replaces the board entirely (not an overlay on top of it) while it's open, same fullscreen
  // .tictactoe-board/.tictactoe-frame shell as the real board -- using the SAME theme.bg means it
  // never looks like a different screen, just the board with its tiles/pieces swapped out for a
  // difficulty picker. Closing it just re-renders the normal board from where the game left off.
  const DIFFICULTIES = [
    { key: 'easy', label: 'Easy', hint: 'Computer moves randomly' },
    { key: 'medium', label: 'Medium', hint: 'Computer wins when it can, blocks when it must' },
    { key: 'hard', label: 'Hard', hint: 'Computer plays perfectly -- best you can do is tie' },
  ];
  function renderSettings(session) {
    const body = document.getElementById('vs-play-body');
    const theme = THEMES[session.theme] || THEMES[THEME_KEYS[0]];
    const optionsHtml = DIFFICULTIES.map((d) => `
      <button type="button" class="tictactoe-settings-option${d.key === difficulty ? ' active' : ''}" data-difficulty="${d.key}">
        <span class="tictactoe-settings-option-label">${d.label}</span>
        <span class="tictactoe-settings-option-hint">${d.hint}</span>
      </button>`).join('');
    // 'random' first, then every real theme key -- clicking "Random" re-rolls a fresh one each
    // time (and applies it to the board right away), so it doubles as a quick way to preview boards.
    const themeOptionsHtml = ['random', ...THEME_KEYS].map((key) => {
      const label = key === 'random' ? 'Random' : (THEME_LABELS[key] || key);
      return `<button type="button" class="tictactoe-settings-theme-option${key === themePref ? ' active' : ''}" data-theme="${key}">${label}</button>`;
    }).join('');

    body.innerHTML = `
      <div class="tictactoe-board">
        <div class="tictactoe-frame" style="background-image:url('${theme.bg}')">
          <div class="tictactoe-settings-panel">
            <h3>Computer difficulty</h3>
            ${optionsHtml}
            <h3>Board theme</h3>
            <div class="tictactoe-settings-theme-grid">${themeOptionsHtml}</div>
            <button type="button" class="tictactoe-settings-back" id="tictactoe-settings-back-btn">Back to game</button>
          </div>
        </div>
      </div>`;

    body.querySelectorAll('.tictactoe-settings-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        difficulty = btn.dataset.difficulty;
        setData(DIFFICULTY_KEY, difficulty);
        renderSettings(session);
      });
    });
    body.querySelectorAll('.tictactoe-settings-theme-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        themePref = btn.dataset.theme;
        setData(THEME_PREF_KEY, themePref);
        session.theme = resolveTheme(); // instant preview on the settings screen's own background
        renderSettings(session);
      });
    });
    document.getElementById('tictactoe-settings-back-btn').addEventListener('click', () => {
      settingsOpen = false;
      render(session);
    });
  }

  // ---------- rendering ----------
  // Full rebuild vs. incremental patch: a brand new game/theme (or coming back from Settings,
  // which replaces this whole subtree) needs the former; an ongoing game's next move only needs
  // the ONE cell that changed touched, not all 9 recreated -- see mountedKey's declaration for why
  // that distinction matters here specifically (it didn't for War/Connect 4).
  function render(session) {
    if (settingsOpen) { renderSettings(session); return; }
    const body = document.getElementById('vs-play-body');
    const theme = THEMES[session.isLocal ? session.theme : themeForSessionId(session.id)] || THEMES[THEME_KEYS[0]];
    const key = `${session.id}|${session.isLocal}|${session.isLocal ? session.theme : ''}`;
    const needsFullMount = key !== mountedKey || !body.querySelector('.tictactoe-cell');

    if (needsFullMount) {
      // buildBoardShell paints cells from session.board directly (covers mounting mid-game, e.g.
      // coming back from Settings) -- patchCells must NOT also run against a stale mountedBoard
      // right after, or it would see every already-filled cell as "new" and append a SECOND piece
      // into it on top of the one buildBoardShell already drew.
      mountedKey = key;
      buildBoardShell(body, session, theme);
    } else {
      patchCells(body, session, theme);
    }
    mountedBoard = session.board.slice();

    // Cheap, always re-applied regardless of which path above ran -- none of these recreate a
    // DOM node, just text/class/style tweaks, so there's no rebuild cost to guard here.
    body.querySelectorAll('.tictactoe-cell').forEach((btn) => {
      const winLine = session.result && session.result !== 'draw' ? session.result.line : [];
      btn.classList.toggle('won', winLine.includes(Number(btn.dataset.cell)));
    });
    const statusEl = body.querySelector('.tictactoe-status');
    if (statusEl) statusEl.textContent = statusText(session);
    const names = playerNames(session);
    const p1El = body.querySelector('.tictactoe-nameplate.p1') || body.querySelectorAll('.tictactoe-nameplate')[0];
    const p2El = body.querySelector('.tictactoe-nameplate.p2') || body.querySelectorAll('.tictactoe-nameplate')[1];
    if (p1El) p1El.textContent = names.p1;
    if (p2El) p2El.textContent = names.p2;
    // Refresh DOES work for a remote game (see playAgainRemote), but only once it's actually over
    // -- no unilateral mid-game reset while the other kid is still playing. session.status can flip
    // to 'finished' via an incremental patch (no full remount), so this has to be re-decided every
    // render, not just baked in once at mount time.
    const refreshBtn = document.getElementById('tictactoe-refresh-btn');
    if (refreshBtn) refreshBtn.style.display = (session.isLocal || session.status === 'finished') ? '' : 'none';
  }

  function controlHtml(theme, key, label) {
    const style = `top:${theme.buttons.top}%;left:${theme.buttons.left[key]}%;width:${theme.buttons.width}%;height:${theme.buttons.height}%`;
    return `<button type="button" class="tictactoe-circle-btn ${key}" style="${style}" id="tictactoe-${key}-btn" aria-label="${label}"></button>`;
  }

  // Builds the static shell ONCE per game instance: cell grid (pieces included, for the common
  // case of mounting mid-game e.g. after returning from Settings), nameplates, and the three corner
  // buttons -- then wires every listener that only needs setting up once. Settings is a local-vs-
  // computer-only concept (a real kid-vs-kid game's theme comes from the session id, not themePref,
  // so showing it there would be confusing chrome with no real effect) and never changes mid-
  // session, so deciding whether to include it is safe to do here, unlike Refresh above.
  function buildBoardShell(body, session, theme) {
    const winLine = session.result && session.result !== 'draw' ? session.result.line : [];
    const cellsHtml = session.board.map((mark, i) => {
      const row = Math.floor(i / 3), col = i % 3;
      const classes = ['tictactoe-cell'];
      if (winLine.includes(i)) classes.push('won');
      const piece = mark ? pieceHtml(theme, i, mark, i === session.last_move) : '';
      const glow = glowTuning(theme, i);
      const cellStyle = `left:${theme.cell.colLeft[col]}%;top:${theme.cell.rowTop[row]}%;width:${theme.cell.width}%;height:${theme.cell.height}%`;
      const glowStyle = `transform:translate(${glow.ox}px, ${glow.oy}px)`;
      return `<button type="button" class="${classes.join(' ')}" style="${cellStyle}" data-row="${row}" data-col="${col}" data-cell="${i}" aria-label="Row ${row + 1}, column ${col + 1}${mark ? `, ${mark}` : ''}"><span class="tictactoe-win-glow" style="${glowStyle}"></span>${piece}</button>`;
    }).join('');

    const names = playerNames(session);
    const namePlateHtml = (key, name) => {
      const p = theme.namePlate[key];
      const style = `left:${p.left}%;top:${p.top}%;width:${p.width}%;height:${p.height}%`;
      return `<div class="tictactoe-nameplate ${key}" style="${style}">${AppBridge.escapeHtml(name)}</div>`;
    };

    body.innerHTML = `
      <div class="tictactoe-board">
        <div class="tictactoe-frame" style="background-image:url('${theme.bg}')">
          ${cellsHtml}
          ${namePlateHtml('p1', names.p1)}
          ${namePlateHtml('p2', names.p2)}
          ${controlHtml(theme, 'home', 'Home')}
          <button type="button" class="tictactoe-circle-btn refresh" style="top:${theme.buttons.top}%;left:${theme.buttons.left.refresh}%;width:${theme.buttons.width}%;height:${theme.buttons.height}%;display:none" id="tictactoe-refresh-btn" aria-label="Play again"></button>
          ${session.isLocal ? controlHtml(theme, 'settings', 'Settings') : ''}
          <div class="tictactoe-status" aria-live="polite"></div>
        </div>
      </div>`;

    body.querySelectorAll('.tictactoe-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cell = Number(btn.dataset.cell);
        if (session.isLocal) tapCell(cell); else tapCellRemote(session, cell);
      });
    });
    document.getElementById('tictactoe-home-btn').addEventListener('click', () => {
      document.getElementById('vs-play-back-btn').click();
    });
    document.getElementById('tictactoe-refresh-btn').addEventListener('click', () => {
      if (session.isLocal) refreshLocal(); else playAgainRemote(session);
    });
    const settingsBtn = document.getElementById('tictactoe-settings-btn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => { settingsOpen = true; render(session); });
  }

  // Only touches cells whose mark actually changed since the last paint -- the other 7-8 pieces'
  // <img> elements are left completely alone, which is the whole point (see mountedKey's comment).
  function patchCells(body, session, theme) {
    session.board.forEach((mark, i) => {
      if (mark === mountedBoard[i]) return;
      const cellBtn = body.querySelector(`.tictactoe-cell[data-cell="${i}"]`);
      if (!cellBtn) return;
      const oldPiece = cellBtn.querySelector('.tictactoe-piece');
      if (oldPiece) oldPiece.remove();
      if (mark) {
        const wrap = document.createElement('div');
        wrap.innerHTML = pieceHtml(theme, i, mark, i === session.last_move);
        cellBtn.appendChild(wrap.firstElementChild);
      }
    });
  }

  return {
    WIN_LINES, createEmptyBoard, otherMark, currentTurn, checkWinner, isBoardFull, isOver, applyMove,
    buildInitialState, startLocalGame, clearLocalGame, render,
  };
})();
