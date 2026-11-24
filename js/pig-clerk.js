// Animated pig shopkeeper for the Reward Shop's item screen (#store-screen). Ported from the
// Cursor handoff (KidZone_Pig_Rig_V5_4B.html) -- that file is a debug/inspection prototype with
// manual buttons/sliders/an A/B comparison view/audit charts; this strips all of that down to
// the one playback it's actually used for in the app: wave in once on entry, settle to the rest
// pose, then idle (breathing/blink/ear-wiggle/head-tilt) until the kid leaves.
//
// V5.4B replaces an earlier WebGL skeletal-mesh "arm lowering" rig (V6) that visibly glitched --
// instead the whole wave-to-rest motion (168 frames / 2.8s) is one continuous sprite-atlas
// animation, with the last 19 frames (150-168, the segment V6's audit data flagged for
// ghosting/lowering defects) replaced by individually regenerated PNG frames instead of atlas
// tiles. No mesh, no shader, no joints -- just frame lookups. Character artwork is a shared
// 1312x1199 transparent-background canvas (master/body/head layers + arm sprite atlases + the
// 19 fixed tail frames); no new artwork was created here, only the integration (asset loading,
// placement, and trigger wiring) is new.
//
// Position/speed/idle-intensity/timing are live-tunable from pig-align-tool.html via the shared
// TUNE_KEY below (through getData/setData, same data layer as everything else -- see js/store.js)
// instead of being hardcoded here, so the standalone tool and this real app always agree and a
// change in one tab shows up in the other (see the 'storage' listener near the bottom) without
// a code edit/reload.
(() => {
  const CHAR_W = 1312, CHAR_H = 1199;
  const END_PHASE = 2.8;       // seconds: total wave-to-rest animation length (168 frames @ 60fps)
  const TAIL_START = 149.5 / 60; // seconds: frames >=150 use the regenerated newFrame PNGs
  // Idle sway/breathing grid -- the handoff used 12x12 (288 triangles/frame); that many
  // clip+drawImage calls every frame, for as long as the pig idles, was the suspected cause of
  // iPad jitter. 7x7 (98 triangles) with per-triangle source cropping (see tri() below) was an
  // improvement but still choppy. A coarser 5x5 grid plus throttling the recompute rate made the
  // frame rate better but visibly worse -- fewer/bigger triangles approximate the smooth
  // breathing/tilt curve with cruder flat facets, which shows up as a slight "dragging" warp in
  // the art on anything but a very subtle sway. Back to 7x7; see the vertex de-duplication below
  // instead for the next round of cost-cutting that doesn't touch visual resolution.
  const IDLE_GRID = 7;

  // Character canvas size/scale at each breakpoint -- NOT tunable from the align tool (only
  // position is), since these were already calibrated once by compositing master.png over each
  // clean-plate background and matching the old baked-in pig's footprint.
  const SIZE = {
    computer: { canvasW: 1672, canvasH: 941, w: 332, h: 332 },
    ipad: { canvasW: 1448, canvasH: 1086, w: 390, h: 390 },
  };

  const TUNE_KEY = 'family-app.pig-clerk-tune';
  // Tuned via pig-align-tool.html (computer left at its original calibrated position; iPad and
  // timing/idle values dialed in against the tool's fixed, non-cropping preview).
  const DEFAULT_TUNE = {
    computer: { x: 15, y: 303 },
    ipad: { x: 2, y: 334 },
    speed: 1.4,           // multiplies dt -- how fast the whole 168-frame wave/tail sequence plays
    intensity: 1.4,       // overall strength of the idle breathing/wiggle/tilt sway (blink is binary)
    idleStartDelay: -0.65, // seconds added to END_PHASE before idle effects kick in (negative = earlier)
    effects: { breathing: true, blinking: true, earWiggle: true, headTilt: true },
  };
  function loadTune() {
    const saved = (typeof getData === 'function' ? getData(TUNE_KEY, null) : null) || {};
    return {
      ...DEFAULT_TUNE,
      ...saved,
      computer: { ...DEFAULT_TUNE.computer, ...(saved.computer || {}) },
      ipad: { ...DEFAULT_TUNE.ipad, ...(saved.ipad || {}) },
      effects: { ...DEFAULT_TUNE.effects, ...(saved.effects || {}) },
    };
  }
  let CONFIG = loadTune();
  // Another tab (the align tool, most likely) changed the shared tune -- pick it up live without
  // needing this tab/app reloaded. Doesn't fire for changes made from THIS document; the tool
  // calls PigClerk.setTune() directly for that case, which updates CONFIG itself.
  window.addEventListener('storage', (e) => { if (e.key === TUNE_KEY) CONFIG = loadTune(); });

  const ASSET_BASE = 'assets/store-items/pig/';
  const ASSET_FILES = {
    // restBody.png (an arms-down idle body variant) is part of the handoff's asset set but is
    // unreachable in this version's own logic -- bodyLayer is drawn unconditionally whenever the
    // compose branch runs, and the ternary that would pick restBody only applies when neither
    // the wave nor the tail-fix is active, which is exactly when that branch doesn't run at all
    // (master is shown directly instead). Left unloaded rather than shipped unused.
    master: 'master.png', bodyLayer: 'bodyLayer.png', headLayer: 'headLayer.png',
    atlas0: 'atlas0.webp', atlas1: 'atlas1.webp', atlas2: 'atlas2.webp', atlas3: 'atlas3.webp',
    atlas4: 'atlas4.webp', atlas5: 'atlas5.webp', atlas6: 'atlas6.webp', atlas7: 'atlas7.webp',
    atlas8: 'atlas8.webp', atlas9: 'atlas9.webp',
  };
  for (let i = 150; i <= 168; i++) ASSET_FILES['newFrame' + i] = 'newFrame' + i + '.png';

  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

  const imgs = {};
  const stage = document.createElement('canvas');
  stage.width = CHAR_W; stage.height = CHAR_H;
  const stageCtx = stage.getContext('2d');

  // Triangle-warp blit used only for the idle sway/breathing deform below -- splits the
  // character image into a grid (IDLE_GRID below) and redraws each triangle offset by deform(),
  // same technique (and same source coordinates) as the handoff, with two changes for iPad
  // performance: (1) each draw is cropped to that triangle's own source bounding box instead of
  // passing the full 1312x1199 image through the clip+transform every time -- the transform maps
  // the coordinate SYSTEM, not a specific pixel selection, so cropping to just the needed source
  // pixels is equivalent, just far less for the browser to rasterize per call; (2) the grid is
  // coarser (see IDLE_GRID) than the handoff's original 12x12, cutting total draws further. Both
  // were the suspected cost on iPad Safari, which is markedly slower than desktop at clip-heavy
  // canvas work -- see pig-align-tool.html for a way to compare before/after frame time.
  function tri(ctx, img, s, d) {
    const [a, b, c] = s, [A, B, C] = d;
    const den = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    const u = ((B[0] - A[0]) * (c[1] - a[1]) - (C[0] - A[0]) * (b[1] - a[1])) / den;
    const v = ((C[0] - A[0]) * (b[0] - a[0]) - (B[0] - A[0]) * (c[0] - a[0])) / den;
    const q = ((B[1] - A[1]) * (c[1] - a[1]) - (C[1] - A[1]) * (b[1] - a[1])) / den;
    const r = ((C[1] - A[1]) * (b[0] - a[0]) - (B[1] - A[1]) * (c[0] - a[0])) / den;
    ctx.save();
    ctx.beginPath();
    const center = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    d.forEach((p, i) => {
      const dx = p[0] - center[0], dy = p[1] - center[1], len = Math.hypot(dx, dy) || 1;
      const pp = [p[0] + dx / len * 2, p[1] + dy / len * 2];
      i ? ctx.lineTo(...pp) : ctx.moveTo(...pp);
    });
    ctx.closePath();
    ctx.clip();
    ctx.transform(u, q, v, r, A[0] - u * a[0] - v * a[1], A[1] - q * a[0] - r * a[1]);
    const pad = 3; // a touch of slack around the triangle so its own antialiased edge isn't cut
    const sx = Math.max(0, Math.min(a[0], b[0], c[0]) - pad);
    const sy = Math.max(0, Math.min(a[1], b[1], c[1]) - pad);
    const sw = Math.min(img.width, Math.max(a[0], b[0], c[0]) + pad) - sx;
    const sh = Math.min(img.height, Math.max(a[1], b[1], c[1]) + pad) - sy;
    ctx.drawImage(img, sx, sy, sw, sh, sx, sy, sw, sh);
    ctx.restore();
  }

  // ---- idle deform (breathing/ear-wiggle/head-tilt sway + blinking) -- same formulas as the
  // handoff, applied only once the pig has settled to rest (see draw()).
  function deform(x, y, b, e, tilt, out) {
    const top = Math.max(0, 1 - y / CHAR_H);
    const ear = Math.exp(-((x - 800) ** 2 / 85000 + (y - 100) ** 2 / 45000));
    const nx = x + tilt * 7 * top + b * 3 * (x - CHAR_W / 2) / CHAR_W;
    const ny = y + b * 5 * Math.sin(Math.PI * y / CHAR_H) + e * 9 * ear;
    if (out) { out[0] = nx; out[1] = ny; return out; }
    return [nx, ny];
  }

  // Precomputed once (grid shape never changes at runtime): IDLE_GRID carves the character into
  // an (n+1)x(n+1) vertex mesh, same as the old V6 rig's verts/indices approach. The handoff's
  // original code called deform() once per TRIANGLE CORNER (3x per triangle, ~6x per interior
  // vertex since a regular grid's interior vertices are shared by ~6 triangles) -- i.e. it
  // deformed most vertices multiple times over with the identical result. Deforming each of the
  // (n+1)^2 unique vertices exactly once per frame instead, into a reused output buffer (no new
  // arrays), is the same math/same visual result for a fraction of the calls and allocations:
  // for IDLE_GRID=7, 64 deform() calls instead of 294, and zero per-frame array creation for the
  // vertex positions themselves (only the small per-triangle s/d arrays tri() takes remain).
  const gridN = IDLE_GRID;
  const gridVerts = []; // source (undeformed) positions, index = jj*(gridN+1)+ii
  for (let jj = 0; jj <= gridN; jj++) for (let ii = 0; ii <= gridN; ii++) {
    gridVerts.push([ii * CHAR_W / gridN, jj * CHAR_H / gridN]);
  }
  const deformedVerts = gridVerts.map(() => [0, 0]); // reused in place every frame, same shape
  const gridTris = []; // each entry: [i0, i1, i2] indices into gridVerts/deformedVerts
  for (let jj = 0; jj < gridN; jj++) for (let ii = 0; ii < gridN; ii++) {
    const k = jj * (gridN + 1) + ii;
    gridTris.push([k, k + 1, k + gridN + 1], [k + 1, k + gridN + 2, k + gridN + 1]);
  }

  function applyWarp(ctx, img, b, e, tilt) {
    for (let k = 0; k < gridVerts.length; k++) deform(gridVerts[k][0], gridVerts[k][1], b, e, tilt, deformedVerts[k]);
    for (const [i0, i1, i2] of gridTris) {
      tri(ctx, img, [gridVerts[i0], gridVerts[i1], gridVerts[i2]], [deformedVerts[i0], deformedVerts[i1], deformedVerts[i2]]);
    }
  }

  function loadAssets() {
    return Promise.all(Object.entries(ASSET_FILES).map(([key, file]) => new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => { imgs[key] = img; resolve(); };
      img.onerror = reject;
      img.src = ASSET_BASE + file;
    })));
  }
  let assetsPromise = null;

  // ---- session state ----
  const canvas = document.getElementById('pig-clerk-canvas');
  const mainCtx = canvas ? canvas.getContext('2d') : null;
  let rafId = null;
  let t = 0, last = 0, idleSeed = 0;
  let size = null;
  let sessionId = 0; // bumped on every enter() so a stale pre-load .then() from an earlier,
                      // superseded enter() call can't start a second, uncancellable rAF loop

  function device() { return document.documentElement.classList.contains('is-ipad') ? 'ipad' : 'computer'; }

  function place() {
    const s = SIZE[device()];
    canvas.width = s.canvasW; canvas.height = s.canvasH;
    return s;
  }

  // ---- optional on-screen FPS readout, for judging perf changes on a real device without a
  // plugged-in debugger -- add ?pigfps=1 (or ?pigfps=1&device=ipad in the real app) to the URL.
  // Invisible unless that flag is present; costs nothing when it's not.
  const DEBUG_FPS = new URLSearchParams(location.search).has('pigfps');
  let fpsEl = null, fpsFrames = 0, fpsWindowStart = 0, fpsLastShown = '';
  function fpsTick(now) {
    if (!DEBUG_FPS) return;
    if (!fpsEl) {
      fpsEl = document.createElement('div');
      fpsEl.style.cssText = 'position:fixed;top:8px;left:8px;z-index:9999;background:#000a;color:#6f6;font:14px/1.3 monospace;padding:4px 8px;border-radius:6px;pointer-events:none;white-space:pre;';
      document.body.appendChild(fpsEl);
    }
    fpsFrames++;
    if (!fpsWindowStart) fpsWindowStart = now;
    const elapsed = now - fpsWindowStart;
    if (elapsed >= 500) { // refresh twice a second -- frequent enough to see jank, cheap enough not to add its own
      fpsLastShown = (fpsFrames / (elapsed / 1000)).toFixed(0) + ' fps  (' + (elapsed / fpsFrames).toFixed(1) + ' ms/frame)';
      fpsFrames = 0; fpsWindowStart = now;
    }
    fpsEl.textContent = 'pig-clerk: ' + fpsLastShown;
  }

  function draw(now) {
    fpsTick(now);
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    t += dt * CONFIG.speed;
    const phase = t;
    const s = size;
    const pos = CONFIG[device()];

    const lift = phase >= 0 && phase < END_PHASE ? smooth(phase / 0.65) * smooth((END_PHASE - phase) / 0.65) : 0;
    const tail = phase >= TAIL_START && phase < END_PHASE;
    let img = imgs.master;

    if (lift > 0.001 || tail) {
      const n = Math.max(0, Math.min(168, Math.round(phase * 60)));
      stageCtx.clearRect(0, 0, CHAR_W, CHAR_H);
      stageCtx.drawImage(imgs.bodyLayer, 0, 0);
      if (tail) {
        stageCtx.drawImage(imgs['newFrame' + Math.min(168, Math.max(150, n))], 850, 440, 462, 759);
      } else {
        const j = n % 16;
        stageCtx.clearRect(850, 440, 462, 759);
        stageCtx.drawImage(imgs.bodyLayer, 850, 440, 462, 759, 850, 440, 462, 759);
        stageCtx.drawImage(imgs['atlas' + Math.floor(n / 16)], (j % 4) * 370, Math.floor(j / 4) * 607, 370, 607, 850, 440, 462, 759);
      }
      stageCtx.drawImage(imgs.headLayer, 0, 0);
      img = stage;
    }

    const idleActive = phase >= END_PHASE + CONFIG.idleStartDelay;
    const st = idleActive ? t + idleSeed : 0;
    const fx = CONFIG.effects;
    const b = idleActive && fx.breathing ? Math.sin(st * 1.55) * CONFIG.intensity : 0;
    const e = idleActive && fx.earWiggle ? Math.sin(st * 17) * Math.pow(Math.max(0, Math.sin(st * 0.64)), 24) * CONFIG.intensity : 0;
    const tilt = idleActive && fx.headTilt ? Math.sin(st * 0.7) * CONFIG.intensity : 0;

    mainCtx.clearRect(0, 0, canvas.width, canvas.height);
    mainCtx.save();
    mainCtx.translate(pos.x, pos.y);
    mainCtx.scale(s.w / CHAR_W, s.h / CHAR_H);

    if (Math.abs(b) + Math.abs(e) + Math.abs(tilt) < 0.001) {
      mainCtx.drawImage(img, 0, 0);
    } else {
      applyWarp(mainCtx, img, b, e, tilt);
    }

    if (idleActive && fx.blinking) {
      const blink = Math.max(0, 1 - Math.abs((st % 5.3) - 3.1) / 0.115);
      if (blink > 0.05) {
        for (const [x, y, rx, ry] of [[545, 440, 70, 75], [833, 326, 57, 66]]) {
          const [xx, yy] = deform(x, y, b, e, tilt);
          mainCtx.save();
          mainCtx.translate(xx, yy);
          mainCtx.scale(1, blink);
          const g = mainCtx.createLinearGradient(0, -ry, 0, ry);
          g.addColorStop(0, '#ffb6bd'); g.addColorStop(1, '#e87983');
          mainCtx.fillStyle = g;
          mainCtx.beginPath(); mainCtx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); mainCtx.fill();
          mainCtx.strokeStyle = '#733238'; mainCtx.lineWidth = 5;
          mainCtx.beginPath(); mainCtx.moveTo(-rx * 0.85, 10); mainCtx.quadraticCurveTo(0, 35, rx * 0.85, 10); mainCtx.stroke();
          mainCtx.restore();
        }
      }
    }
    mainCtx.restore();

    rafId = requestAnimationFrame(draw);
  }

  function enter() {
    if (!canvas || !mainCtx) return;
    size = place();
    if (rafId) cancelAnimationFrame(rafId);
    t = 0; last = 0; idleSeed = Math.random() * 20;
    const mySession = ++sessionId;
    if (!assetsPromise) assetsPromise = loadAssets().catch((err) => { console.warn('[pig-clerk] asset load failed', err); assetsPromise = null; });
    assetsPromise.then(() => {
      if (mySession !== sessionId) return; // superseded by a later enter()/exit() in the meantime
      if (!imgs.master) return; // load failed; stay invisible rather than throw mid-render
      last = 0;
      rafId = requestAnimationFrame(draw);
    });
  }

  function exit() {
    sessionId++; // invalidate any enter() still waiting on assetsPromise
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (mainCtx && canvas) mainCtx.clearRect(0, 0, canvas.width, canvas.height);
    if (fpsEl) fpsEl.textContent = 'pig-clerk: stopped';
  }

  // ---- tuning API, used by pig-align-tool.html (and available from the console too) ----
  function getTune() { return JSON.parse(JSON.stringify(CONFIG)); }
  function setTune(partial) {
    CONFIG = {
      ...CONFIG, ...partial,
      computer: { ...CONFIG.computer, ...(partial.computer || {}) },
      ipad: { ...CONFIG.ipad, ...(partial.ipad || {}) },
      effects: { ...CONFIG.effects, ...(partial.effects || {}) },
    };
    if (typeof setData === 'function') setData(TUNE_KEY, CONFIG);
  }
  function resetTune() {
    CONFIG = JSON.parse(JSON.stringify(DEFAULT_TUNE));
    if (typeof setData === 'function') setData(TUNE_KEY, CONFIG);
  }

  window.PigClerk = { enter, exit, getTune, setTune, resetTune, DEFAULT_TUNE };
})();
