// Shared drawing engine for both Free Draw and Coloring Book -- one canvas, one undo/redo
// stack, one set of pointer handlers. Which stylus is selected (see TOOL_STYLES / 'bucket')
// drives behavior uniformly in both screens; the only difference between them is what app.js
// puts on the canvas before handing it to the player (blank vs. a template image).
const CanvasEngine = (() => {
  // Undo is patch-based (dirty-rectangle), not full-canvas snapshots: each entry only stores the
  // bounding box that actually changed, with its before/after pixels. A full-canvas snapshot at
  // device-pixel-ratio resolution can be tens of MB on a tablet; patches for a single filled body
  // part or stroke are a small fraction of that.
  const MAX_UNDO = 25;

  // Stylus types available in Free Draw. Each maps to a width multiplier (of the brush-size
  // slider), an opacity, and a line cap/join -- except 'spray', 'glitter', 'bucket' and
  // 'eyedropper', which have their own custom handling (scatter / flood-fill / pixel sampling)
  // directly in the pointer handlers below instead of through strokeTo/dot.
  const TOOL_STYLES = {
    paintbrush: { widthMul: 1, opacity: 0.97, cap: 'round', join: 'round' },
    pen: { widthMul: 0.35, opacity: 1, cap: 'round', join: 'round' },
    marker: { widthMul: 1.6, opacity: 0.55, cap: 'square', join: 'round' },
    crayon: { widthMul: 1, opacity: 1, cap: 'round', join: 'round', textured: true },
    eraser: { widthMul: 2.2, opacity: 1, cap: 'round', join: 'round' },
  };

  let canvas, ctx;
  let tool = 'paintbrush'; // see TOOL_STYLES, or 'bucket' for flood-fill
  let color = '#e74c3c';
  let brushSize = 10;
  // Free Draw's Neon Mode swaps this to black so the eraser and a fresh/cleared canvas match the
  // dark backdrop instead of leaving white behind -- every other mode (Coloring Book, Admin,
  // gallery re-opens) explicitly resets it back to white at the top of its own loader, since none
  // of them have a Neon Mode concept.
  let backgroundColor = '#ffffff';
  // Stickers, Shapes, and Straight Line all commit in one fixed "ink" color rather than whatever
  // the kid currently has selected (same reasoning stickers always had: stamp one solid color,
  // then let the bucket tool recolor it) -- black reads fine on Neon Mode's white-palette-on-
  // black-canvas normally, but is literally invisible against Neon Mode's own black background,
  // so this flips to white whenever the background is black.
  function inkColor() {
    return backgroundColor === '#000000' ? '#ffffff' : '#000000';
  }

  // ---- Rainbow effect: cycles the stroke color continuously by distance traveled, not by time
  // or touch-event count, so it looks identical whether a stroke is drawn slowly or flicked fast
  // (and isn't affected by how often the device happens to fire pointermove). `color` itself is
  // never touched by any of this -- activeStrokeColor() only ever substitutes what gets *painted
  // with*, so turning Rainbow back off needs no restore step; the kid's actual selected color was
  // sitting there untouched the whole time.
  let rainbowMode = false;
  let rainbowDistance = 0; // canvas px traveled so far on the current stroke; reset in beginDraw
  // red, orange, yellow, green, (cyan-ish,) blue, purple -- plus HSL-interpolated waypoints
  // between each pair (2 across the widest hue gaps: yellow->green, green->blue, blue->purple,
  // and purple back to red; 1 across the narrower ones) so no single lerp has as far to travel in
  // hue-space as the named colors alone would. Straight RGB interpolation across a wide hue gap
  // tends to dip through a duller, less saturated color than either endpoint -- which reads as a
  // flat/slow patch even though it's mathematically continuous -- these waypoints keep every step
  // similarly short and vivid. The array is a closed LOOP: index 0 (red) is treated as the stop
  // right after the last one (purple -> pink/magenta waypoints -> red), not an endpoint to bounce
  // back from -- see rainbowColorAt.
  const RAINBOW_STOPS = [
    '#ff0000', '#ff4600', '#ff8c00', '#ffb200', '#ffd700',
    '#96ed00', '#18da00', '#00c853', '#00e8be', '#09c8ff',
    '#2979ff', '#1c19f1', '#641bd1', '#8e24aa',
    '#c41aa3', '#e10e63',
  ];
  // CSS px of travel per stop-to-stop transition (scaled by dpr below), sized so one full lap of
  // all RAINBOW_STOPS.length transitions (the last one being purple's waypoints back to red)
  // covers about the same total distance the original 6-stop version's one-way red->purple sweep
  // did (~350 CSS px), not 2-3x longer just because there are more stops now.
  const RAINBOW_SEGMENT_PX = 350 / RAINBOW_STOPS.length;

  function lerpHexColor(hexA, hexB, t) {
    const [ar, ag, ab] = hexToRgb(hexA);
    const [br, bg, bb] = hexToRgb(hexB);
    return rgbToHex(
      Math.round(ar + (br - ar) * t),
      Math.round(ag + (bg - ag) * t),
      Math.round(ab + (bb - ab) * t)
    );
  }

  // Loops continuously through the stops (red -> orange -> ... -> purple -> pink/magenta
  // waypoints -> back to red -> ...) instead of bouncing back the way it came, so a long stroke
  // just keeps cycling the same direction forever -- matching "...purple, and back to red,
  // regardless of the direction or shape of the stroke" exactly. Any individual stroke still
  // starts at red (distance 0), since that's RAINBOW_STOPS[0] and the loop always starts there.
  function rainbowColorAt(distance) {
    const segLen = RAINBOW_SEGMENT_PX * dpr;
    const n = RAINBOW_STOPS.length;
    const lap = segLen * n; // one full loop back to red
    const pos = ((distance % lap) + lap) % lap; // defensive against a negative distance, though it should never go negative
    const stopFloat = pos / segLen;
    const i0 = Math.floor(stopFloat) % n;
    const i1 = (i0 + 1) % n;
    return lerpHexColor(RAINBOW_STOPS[i0], RAINBOW_STOPS[i1], stopFloat - Math.floor(stopFloat));
  }

  // What dot()/scatterSpray()/drawSparkle() actually paint with -- the kid's selected color
  // normally, or the current point along the rainbow cycle when the effect is on (never for the
  // eraser or bucket, which have their own fixed meanings for "color"). A continuous stroke line
  // doesn't use this -- see the Rainbow window renderer further down for why a single flat color
  // per draw call isn't enough for that case.
  function activeStrokeColor() {
    if (rainbowMode && tool !== 'eraser' && tool !== 'bucket') return rainbowColorAt(rainbowDistance);
    return color;
  }

  // Rainbow stroke rendering lives in its own section further down (see "Rainbow window
  // renderer", right after strokeTo) -- it needs currentStrokeWidth()/toolStyle()/protectInkInRegion/
  // clampBBox/cropRegion, which aren't defined yet at this point in the file.

  let undoStack = [];
  let editCount = 0; // strokes + fills on this canvas session (undo takes one away) -- used to decide if a saved picture earns coins
  let redoStack = [];
  let drawing = false;
  let lastX = 0, lastY = 0;
  // Straight Line mode: a modifier on whichever stylus/eraser is already selected, not a stylus of
  // its own -- the kid keeps their current color/brush, strokes just come out straight instead of
  // freehand. lineStartX/Y hold the gesture's fixed anchor point (set once in beginDraw, never
  // reassigned by the live preview, unlike lastX/Y which freehand drawing keeps sliding forward).
  let straightLineMode = false;
  let lineStartX = 0, lineStartY = 0;
  let activePointerId = null;
  let dpr = 1; // canvas pixels per screen point (at least the device's own pixel ratio)
  // Raised when a coloring page is loaded so the canvas holds the page at its ORIGINAL
  // resolution instead of shrinking it to screen size (see ensureScaleFor).
  let minScale = 0;
  // Limits so big canvases stay safe on an iPad: total canvas pixels for kids' coloring vs. the
  // photo editor on the computer, the browser's max side length, and undo memory.
  const MAX_KID_PIXELS = 9e6;
  const MAX_ADMIN_PIXELS = 16e6;
  const MAX_SIDE = 4096;
  const MAX_UNDO_BYTES = 160 * 1024 * 1024;
  let undoBytes = 0;
  let sprayTimer = null;
  let fillPending = false;
  let engineGen = 0; // bumped on init() so an in-flight chunked flood fill can detect a screen switch and abandon
  // Bumped by anything that overwrites canvas pixels from outside a flood fill's own control
  // (undo, redo, clear) so an in-flight chunked fill -- which can span several animation frames
  // on a large region -- can tell the canvas moved on without it and abandon instead of clobbering
  // whatever undo/clear just produced with its own stale snapshot once it finally finishes.
  let canvasContentGen = 0;

  // Full-canvas snapshot taken at the start of the current stroke (Free Draw pen/brush/etc, not
  // bucket), held only until the stroke ends -- just long enough to crop the small "before" patch
  // for whatever bounding box the stroke actually touches. Never retained in the undo stack itself.
  let strokeOriginal = null;
  let strokeMinX = 0, strokeMinY = 0, strokeMaxX = 0, strokeMaxY = 0;

  // One bit per pixel, captured ONCE right when a template image is loaded (or reloaded via
  // Clear) -- marks exactly which pixels are the original picture's line art. This is what the
  // fill tool is never allowed to touch, forever, regardless of what gets painted on top of
  // everything else. It must be a fixed snapshot rather than "is this pixel currently dark?",
  // or filling a region with black (or any dark palette color) would make that region
  // indistinguishable from real ink and permanently un-fillable from then on -- null in Free Draw
  // (blank canvas has no "original picture" to protect).
  let inkMask = null;
  let protectInk = true; // admin mode flips this off so the stylus tools can edit the line art itself

  function setProtectInk(v) { protectInk = v; }
  function getProtectInk() { return protectInk; }

  // ---- Zoom / pan ----
  // Pure CSS transform on the canvas element itself -- the pointer-to-pixel mapping below reads
  // the canvas's live (post-transform) bounding box on every tap, so zooming/panning needs no
  // special-casing elsewhere; a tap at any zoom level already lands on the right pixel.
  let zoomScale = 1;
  let panX = 0, panY = 0;
  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;
  const ZOOM_STEP = 0.5;
  let onZoomChange = null; // app.js hooks this to keep its +/-/reset buttons in sync, including live during a pinch
  let onColorPicked = null; // app.js hooks this to update the palette/shade-row UI after an eyedropper tap

  function applyTransform() {
    const t = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    canvas.style.transform = t;
    // #rainbow-gl-canvas sits on top of the real canvas at the same unzoomed size/position (see
    // style.css) and needs the exact same live transform, or else while zoomed/panned the GL
    // preview renders in the wrong screen spot -- paint would appear to trail up-and-left of the
    // finger, then "snap" to the right place once the finished stroke composites onto the real
    // canvas (whose own pointer-to-pixel mapping already accounts for the transform correctly).
    const glCanvas = document.getElementById('rainbow-gl-canvas');
    if (glCanvas) glCanvas.style.transform = t;
    if (onZoomChange) onZoomChange();
  }

  // Adjusts panX/panY so that whatever content currently sits under (clientX, clientY) is still
  // under it after rescaling to newScale, instead of the view always rescaling around the
  // canvas's fixed center and making you re-pan back to whatever you actually wanted to look at.
  // Standard map/photo-app "zoom to a point" technique: with transform-origin at the canvas's own
  // top-left (0 0), a point's screen position is stageLeft + panX + localX*scale, where
  // stageLeft/localX don't change with the current transform -- solving that for panX after a
  // scale change, holding the screen position fixed, gives the update below.
  function zoomAround(clientX, clientY, newScale) {
    const stageRect = canvas.parentElement.getBoundingClientRect();
    const localX = clientX - stageRect.left;
    const localY = clientY - stageRect.top;
    const ratio = newScale / zoomScale;
    panX = localX - (localX - panX) * ratio;
    panY = localY - (localY - panY) * ratio;
    zoomScale = newScale;
  }

  function resetZoom() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    applyTransform();
  }

  function zoomIn() {
    const stageRect = canvas.parentElement.getBoundingClientRect();
    const newScale = Math.min(MAX_ZOOM, zoomScale + ZOOM_STEP);
    zoomAround(stageRect.left + stageRect.width / 2, stageRect.top + stageRect.height / 2, newScale);
    applyTransform();
  }

  function zoomOut() {
    const stageRect = canvas.parentElement.getBoundingClientRect();
    const newScale = Math.max(MIN_ZOOM, zoomScale - ZOOM_STEP);
    zoomAround(stageRect.left + stageRect.width / 2, stageRect.top + stageRect.height / 2, newScale);
    if (newScale === MIN_ZOOM) { panX = 0; panY = 0; } // fully settled back to the default view, not just scale
    applyTransform();
  }

  function isZoomedOrPanned() {
    return zoomScale !== MIN_ZOOM || panX !== 0 || panY !== 0;
  }

  function getZoomScale() {
    return zoomScale;
  }

  function isAtMinZoom() {
    return zoomScale <= MIN_ZOOM;
  }

  function isAtMaxZoom() {
    return zoomScale >= MAX_ZOOM;
  }

  function setOnZoomChange(cb) {
    onZoomChange = cb;
  }

  function setOnColorPicked(cb) {
    onColorPicked = cb;
  }

  // ---- Multi-touch gesture handling: one finger draws/fills, two fingers pinch-zoom + pan ----
  // Bucket fill and a stroke's first dot both happen instantly on pointerdown, so a brief
  // hold-off is used before committing to either: if a second finger joins within that window,
  // the first finger's gesture is cancelled (or, if it had already resolved, undone) and both
  // fingers become a pinch/pan instead. Waiting to see what actually happens is the only reliable
  // way to tell "one finger about to draw" apart from "first finger of a two-finger gesture" --
  // there's no way to know from the first touch alone.
  const HOLDOFF_MS = 70;
  let downPointerIds = new Set(); // every pointer physically touching down right now
  let soloPointerId = null; // the one finger currently eligible to become a draw/fill, if any
  let soloCommitted = false; // whether that finger's gesture already committed an undo patch
  let soloClientX = 0, soloClientY = 0; // its latest known position (CLIENT coords)
  let holdoffTimer = null;
  let panPointerIds = []; // 0, 1 (transitional), or 2 -- pointers driving an active pinch/pan
  let panPositions = new Map(); // pointerId -> last known {x, y} CLIENT coords, panning only
  let panLastMidX = 0, panLastMidY = 0;
  let panLastDist = 0; // distance between the two pointers, for pinch-to-zoom

  function clampBBox(minX, minY, maxX, maxY) {
    const x = Math.max(0, Math.floor(minX));
    const y = Math.max(0, Math.floor(minY));
    const right = Math.min(canvas.width, Math.ceil(maxX));
    const bottom = Math.min(canvas.height, Math.ceil(maxY));
    const w = right - x, h = bottom - y;
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  }

  function cropRegion(flatData, fullWidth, bbox) {
    const out = ctx.createImageData(bbox.w, bbox.h);
    for (let row = 0; row < bbox.h; row++) {
      const srcStart = ((bbox.y + row) * fullWidth + bbox.x) * 4;
      const destStart = row * bbox.w * 4;
      out.data.set(flatData.subarray(srcStart, srcStart + bbox.w * 4), destStart);
    }
    return out;
  }

  function makeSolidImageData(w, h, r, g, b) {
    const img = ctx.createImageData(w, h);
    const data = img.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    return img;
  }

  function commitPatch(x, y, w, h, before, after) {
    canvasContentGen++;
    undoStack.push({ x, y, w, h, before, after });
    undoBytes += patchBytes(undoStack[undoStack.length - 1]);
    while (undoStack.length > 1 && (undoStack.length > MAX_UNDO || undoBytes > MAX_UNDO_BYTES)) {
      undoBytes -= patchBytes(undoStack.shift());
    }
    redoStack = [];
    editCount++;
  }

  // Commits a sticker (see js/stickers.js) into the real canvas at (x, y, size, rotation) -- all
  // in actual backing-pixel coordinates, not CSS/zoomed coordinates; the caller (app.js) only
  // starts a placement at zoom reset to 1x specifically so this never has to account for the view
  // transform. Always stamped solid black, same as any other line art, so the bucket tool can
  // recolor it immediately afterward exactly like it recolors any already-filled region. The
  // bbox margin is a full `size` per side -- generous enough that a rotated shape's corners
  // (at most ~0.71 * size from center, for a shape that fully fills its size x size box) always
  // stay inside it regardless of rotation, so rotating never needs a bigger undo-patch margin.
  function stampShape(drawFn, x, y, size, rotation = 0) {
    const bbox = clampBBox(x - size, y - size, x + size, y + size);
    if (!bbox) return;
    let before = null;
    try {
      before = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
    } catch (err) {
      console.warn('[CanvasEngine] stampShape failed to snapshot before state (will not be undoable):', err);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = inkColor();
    ctx.strokeStyle = inkColor();
    try {
      drawFn(ctx, size);
    } finally {
      ctx.restore();
    }
    if (before) {
      try {
        const after = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
        commitPatch(bbox.x, bbox.y, bbox.w, bbox.h, before, after);
        return;
      } catch (err) {
        console.warn('[CanvasEngine] stampShape failed to record undo patch:', err);
      }
    }
    canvasContentGen++;
  }

  // Commits a hollow geometric shape (see js/shapes.js) as a stroked-only outline through a set
  // of already-absolute-coordinate vertices -- unlike stampShape, there's no translate/rotate
  // here, since each vertex was already individually positioned (dragged, resized) by the time
  // Done is tapped. Always one fixed ink color (see inkColor()), same as everything else, so the
  // bucket tool can fill either side of the outline immediately afterward.
  function stampPolygon(vertices, strokeWidth) {
    if (!vertices || vertices.length < 3) return;
    const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y);
    const margin = strokeWidth + 4;
    const bbox = clampBBox(
      Math.min(...xs) - margin, Math.min(...ys) - margin,
      Math.max(...xs) + margin, Math.max(...ys) + margin
    );
    if (!bbox) return;
    let before = null;
    try {
      before = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
    } catch (err) {
      console.warn('[CanvasEngine] stampPolygon failed to snapshot before state (will not be undoable):', err);
    }
    ctx.save();
    ctx.strokeStyle = inkColor();
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    strokePolygonPath(ctx, vertices);
    ctx.restore();
    if (before) {
      try {
        const after = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
        commitPatch(bbox.x, bbox.y, bbox.w, bbox.h, before, after);
        return;
      } catch (err) {
        console.warn('[CanvasEngine] stampPolygon failed to record undo patch:', err);
      }
    }
    canvasContentGen++;
  }

  // ---- Lasso Select (Free Draw only): circle part of the drawing to Copy or Cut it, then drag
  // the floating piece into place. `path` is a freehand array of {x, y} points in real
  // canvas-pixel coordinates -- app.js owns recording it (drawn on its own overlay canvas) and
  // just hands the closed loop to these three primitives.

  // Read-only: returns a small offscreen canvas holding only the pixels inside the lasso path
  // (clipped -- everything outside stays fully transparent), plus the bounding box it came from.
  // Never touches the real canvas, so Copy can call this alone and Cut calls it before clearing.
  function extractLassoCutout(path) {
    if (!path || path.length < 3) return null;
    const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
    const bbox = clampBBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    if (!bbox) return null;
    const out = document.createElement('canvas');
    out.width = bbox.w;
    out.height = bbox.h;
    const octx = out.getContext('2d');
    try {
      octx.save();
      octx.beginPath();
      octx.moveTo(path[0].x - bbox.x, path[0].y - bbox.y);
      for (let i = 1; i < path.length; i++) octx.lineTo(path[i].x - bbox.x, path[i].y - bbox.y);
      octx.closePath();
      octx.clip();
      octx.drawImage(canvas, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, bbox.w, bbox.h);
      octx.restore();
    } catch (err) {
      console.warn('[CanvasEngine] extractLassoCutout failed:', err);
      return null;
    }
    return { canvas: out, bbox };
  }

  // Cut's "lift it off the page" half -- clips to the exact lasso path (not just its bounding
  // box, so the hole left behind matches the loop's own shape) and fills just that with the
  // background color, as its own undoable patch.
  function clearLassoRegion(path) {
    if (!path || path.length < 3) return;
    const xs = path.map((p) => p.x), ys = path.map((p) => p.y);
    const bbox = clampBBox(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    if (!bbox) return;
    let before = null;
    try {
      before = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
    } catch (err) {
      console.warn('[CanvasEngine] clearLassoRegion failed to snapshot before state (will not be undoable):', err);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(bbox.x, bbox.y, bbox.w, bbox.h);
    ctx.restore();
    if (before) {
      try {
        const after = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
        commitPatch(bbox.x, bbox.y, bbox.w, bbox.h, before, after);
        return;
      } catch (err) {
        console.warn('[CanvasEngine] clearLassoRegion failed to record undo patch:', err);
      }
    }
    canvasContentGen++;
  }

  // Commits a floating lasso cutout (or any small offscreen canvas) onto the real canvas,
  // centered at (x, y) and scaled by `scale` -- the final "drop it here" step for both Copy and
  // Cut/Move, as one undoable patch.
  function stampImage(sourceCanvas, x, y, scale) {
    if (!sourceCanvas) return;
    const w = sourceCanvas.width * scale, h = sourceCanvas.height * scale;
    const bbox = clampBBox(x - w / 2, y - h / 2, x + w / 2, y + h / 2);
    if (!bbox) return;
    let before = null;
    try {
      before = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
    } catch (err) {
      console.warn('[CanvasEngine] stampImage failed to snapshot before state (will not be undoable):', err);
    }
    ctx.drawImage(sourceCanvas, x - w / 2, y - h / 2, w, h);
    if (before) {
      try {
        const after = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
        commitPatch(bbox.x, bbox.y, bbox.w, bbox.h, before, after);
        return;
      } catch (err) {
        console.warn('[CanvasEngine] stampImage failed to record undo patch:', err);
      }
    }
    canvasContentGen++;
  }

  function patchBytes(p) {
    return ((p.before && p.before.data.length) || 0) + ((p.after && p.after.data.length) || 0);
  }

  // Keeps #rainbow-gl-canvas's own backing buffer pixel-for-pixel identical to the real canvas's,
  // so RainbowGL's output composites onto ctx with a plain drawImage(gl, 0, 0) -- no scaling, no
  // separate dpr tracking to keep in sync. Lazily creates the GL context the first time; safe to
  // call every time the canvas resizes.
  function syncRainbowGL() {
    const glCanvas = document.getElementById('rainbow-gl-canvas');
    if (!glCanvas) return;
    if (!RainbowGL.isReady()) RainbowGL.init(glCanvas);
    RainbowGL.resize(canvas.width, canvas.height);
  }

  function fitCanvasToStage() {
    const stage = canvas.parentElement;
    const rect = stage.getBoundingClientRect();
    dpr = Math.max(1, window.devicePixelRatio || 1, minScale);
    const prevW = canvas.width, prevH = canvas.height;
    let prevSnap = null;
    if (prevW && prevH) {
      try { prevSnap = ctx.getImageData(0, 0, prevW, prevH); } catch { prevSnap = null; }
    }
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx = canvas.getContext('2d');
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (prevSnap) {
      // Resize event mid-session (e.g. orientation change) -- best effort: stretch the old
      // content back in rather than losing it outright.
      const tmp = document.createElement('canvas');
      tmp.width = prevW; tmp.height = prevH;
      tmp.getContext('2d').putImageData(prevSnap, 0, 0);
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    }
    syncRainbowGL();
  }

  // Before drawing a picture into the canvas: make the canvas big enough that the picture is
  // drawn at (up to) its own original pixel size, not shrunk to the screen. Only called right
  // before the canvas is filled fresh, so nothing on it is lost by resizing.
  function ensureScaleFor(bbox, paddingFrac, maxPixels) {
    const rect = canvas.parentElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const pad = Math.min(rect.width, rect.height) * paddingFrac;
    const availW = Math.max(1, rect.width - pad * 2);
    const availH = Math.max(1, rect.height - pad * 2);
    const needed = Math.max(bbox.w / availW, bbox.h / availH);
    const cap = Math.min(Math.sqrt(maxPixels / (rect.width * rect.height)), MAX_SIDE / Math.max(rect.width, rect.height));
    const base = Math.max(1, window.devicePixelRatio || 1);
    const scale = Math.max(base, Math.min(needed, cap));
    minScale = scale;
    if (Math.abs(scale - dpr) < 0.01) return;
    dpr = scale;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    syncRainbowGL();
  }

  function clientToCanvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function pointerToCanvasCoords(evt) {
    return clientToCanvasCoords(evt.clientX, evt.clientY);
  }

  function toolStyle() {
    return TOOL_STYLES[tool] || TOOL_STYLES.paintbrush;
  }

  function currentStrokeWidth() {
    return brushSize * toolStyle().widthMul * dpr;
  }

  // Textured crayon stroke: several short, jittered, semi-random-opacity passes over the
  // same segment instead of one clean line, to read as waxy/grainy rather than smooth.
  // overrideColor lets Straight Line force white in Neon Mode (see drawStraightLinePreview)
  // without affecting crayon's normal freehand use, which always paints the selected color.
  function crayonSegment(x1, y1, x2, y2, overrideColor) {
    const baseWidth = currentStrokeWidth();
    const passes = 5;
    const segStyle = overrideColor || color;
    for (let i = 0; i < passes; i++) {
      const jx = (Math.random() - 0.5) * baseWidth * 0.25;
      const jy = (Math.random() - 0.5) * baseWidth * 0.25;
      ctx.globalAlpha = 0.45 + Math.random() * 0.4;
      ctx.strokeStyle = segStyle;
      ctx.lineWidth = baseWidth * (0.55 + Math.random() * 0.5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(x1 + jx, y1 + jy);
      ctx.lineTo(x2 + jx, y2 + jy);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function strokeTo(x, y) {
    const style = toolStyle();
    if (style.textured) {
      crayonSegment(lastX, lastY, x, y);
    } else {
      ctx.globalAlpha = style.opacity;
      ctx.strokeStyle = tool === 'eraser' ? backgroundColor : color;
      ctx.lineWidth = currentStrokeWidth();
      ctx.lineCap = style.cap;
      ctx.lineJoin = style.join;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const margin = currentStrokeWidth() + 10;
    protectInkInRegion(
      Math.min(lastX, x) - margin, Math.min(lastY, y) - margin,
      Math.max(lastX, x) + margin, Math.max(lastY, y) + margin
    );
    lastX = x;
    lastY = y;
  }

  // A gradient between exactly 2 points, colored by their own rainbowColorAt() values -- used
  // for ONE short path segment at a time (see redrawRainbowWindow), never a whole multi-point
  // path. A canvas linear gradient is defined along a straight axis; for a single short segment
  // that axis IS the segment, so distance-along-the-path and position-along-the-axis are the same
  // thing and the color is exactly right. Stretching this same technique across a whole curved
  // window (coloring stop N by how far along the overall path it is, but placing it at its
  // projection onto the window's first->last straight axis) is what caused the bug this replaces:
  // a loop or sharp bend makes a point's projection onto that axis land nowhere near where its
  // actual stroke color should be painted, so colors bunch up solid in some areas and get
  // compressed into stripes in others. Keeping each segment's own gradient axis equal to that
  // segment avoids the mismatch entirely, regardless of how the overall stroke curves.
  function rainbowSegmentGradient(targetCtx, p1, p2, d1, d2) {
    const grad = targetCtx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    const c1 = rainbowColorAt(d1);
    if (d2 <= d1) {
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c1);
      return grad;
    }
    grad.addColorStop(0, c1);
    grad.addColorStop(1, rainbowColorAt(d2));
    return grad;
  }

  // Offscreen scratch buffer, reused across Rainbow redraws and resized up as needed (never back
  // down). Every segment in the current window is painted onto this at FULL opacity -- so
  // wherever two segments geometrically overlap (inevitable at any bend when each one needs its
  // own accurate gradient -- see rainbowSegmentGradient above), the later one simply replaces the
  // earlier one instead of alpha-compositing on top of it. The whole buffer is then composited
  // onto the real canvas ONCE at the stylus's actual opacity. That single final composite is what
  // keeps the stroke seam-free: there is only ever one semi-transparent paint operation, not many
  // small overlapping ones compositing into visibly denser spots (the original "circles" bug).
  let rainbowScratchCanvas = null;
  let rainbowScratchCtx = null;
  function rainbowScratch(w, h) {
    if (!rainbowScratchCanvas) {
      rainbowScratchCanvas = document.createElement('canvas');
      rainbowScratchCtx = rainbowScratchCanvas.getContext('2d');
    }
    if (rainbowScratchCanvas.width < w || rainbowScratchCanvas.height < h) {
      rainbowScratchCanvas.width = Math.max(w, rainbowScratchCanvas.width);
      rainbowScratchCanvas.height = Math.max(h, rainbowScratchCanvas.height);
    } else {
      rainbowScratchCtx.clearRect(0, 0, rainbowScratchCanvas.width, rainbowScratchCanvas.height);
    }
    return rainbowScratchCtx;
  }

  // Strokes every segment of `points` onto scratch context `sctx` (already offset into its local
  // space) at full opacity, each with its own accurate 2-point gradient -- the shared rendering
  // step both the plain-stylus and textured (crayon, called once per jittered pass) branches of
  // redrawRainbowWindow use.
  function paintRainbowSegmentsOnto(sctx, points, distances, lineWidth, cap, join) {
    sctx.lineWidth = lineWidth;
    sctx.lineCap = cap;
    sctx.lineJoin = join;
    for (let i = 0; i < points.length - 1; i++) {
      sctx.strokeStyle = rainbowSegmentGradient(sctx, points[i], points[i + 1], distances[i], distances[i + 1]);
      sctx.beginPath();
      sctx.moveTo(points[i].x, points[i].y);
      sctx.lineTo(points[i + 1].x, points[i + 1].y);
      sctx.stroke();
    }
  }

  // ---- Rainbow window renderer (Crayon only -- see RainbowGL below for every other brush) ----
  // Crayon's texture is 5 separate jittered passes composited at random partial opacity, which is
  // the one Rainbow case a single-mesh GPU renderer can't reproduce, so it keeps the original CPU
  // approach. Every non-textured brush instead goes through RainbowGL (js/rainbow-gl.js): a real
  // triangle-strip ribbon, one point's RGB per vertex, GPU-interpolated and GPU-antialiased, drawn
  // in one call per redraw regardless of how long the stroke has gotten -- so unlike this window
  // system, it doesn't need capping/flattening to stay cheap. See beginRainbowGLStroke below.
  //
  // A Rainbow stroke is never drawn as separate stroke() calls straight onto the real canvas,
  // strung together -- that was the original "circles" bug: any two separate semi-transparent
  // paint operations meeting at a shared point, no matter how short or finely sampled, overlap at
  // least a little (their caps, or -- with each segment needing its own gradient, see above --
  // just the segments themselves at a bend), and that overlap visibly composites more opaque than
  // its surroundings. Painting every segment onto an offscreen scratch layer at full opacity first
  // (see rainbowScratch) and compositing that layer onto the real canvas once, per window redraw,
  // is what avoids it: there is only ever one semi-transparent paint per redraw.
  //
  // Point data accumulates in a growing "window" for the current stroke; every new point (or
  // batch of coalesced points) redraws the ENTIRE window, by first restoring the window's own
  // working area back to a snapshot taken when the window began (the same restore-then-redraw
  // technique Straight Line's preview already uses) and then repainting it fresh. Capped and
  // periodically flattened into the real canvas (see extendRainbowStroke) so a long stroke doesn't
  // mean redrawing a bigger and bigger area forever.
  let rainbowWindowPoints = null; // [{x,y}, ...] for the stroke-so-far since the last flatten, or null when idle
  let rainbowWindowDistances = null; // parallel array -- cumulative rainbowDistance at each point
  let rainbowWindowOriginal = null; // canvas snapshot taken the moment the current window began
  let rainbowWindowMinX = 0, rainbowWindowMinY = 0, rainbowWindowMaxX = 0, rainbowWindowMaxY = 0;
  // Points before the window flattens into the canvas and a fresh one begins. Every redraw
  // repaints the whole window from point 0, so cost grows with window size -- measured on desktop
  // Chrome, Crayon's 5-pass jitter costs ~5x a plain stroke, so this stays small to keep worst-case
  // redraw cost well under a frame budget (iPad readback is slower still). Every other brush uses
  // RainbowGL instead (see below), which doesn't need a cap at all.
  const RAINBOW_WINDOW_CAP_TEXTURED = 10;

  function beginRainbowWindow(x, y) {
    rainbowWindowPoints = [{ x, y }];
    rainbowWindowDistances = [rainbowDistance];
    rainbowWindowMinX = x; rainbowWindowMaxX = x;
    rainbowWindowMinY = y; rainbowWindowMaxY = y;
    try {
      rainbowWindowOriginal = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('[CanvasEngine] rainbow window snapshot failed:', err);
      rainbowWindowOriginal = null;
    }
  }

  function redrawRainbowWindow() {
    const points = rainbowWindowPoints;
    const distances = rainbowWindowDistances;
    const style = toolStyle();
    const margin = currentStrokeWidth() + 10;
    const bbox = clampBBox(
      rainbowWindowMinX - margin, rainbowWindowMinY - margin,
      rainbowWindowMaxX + margin, rainbowWindowMaxY + margin
    );
    if (bbox && rainbowWindowOriginal) {
      try {
        const region = cropRegion(rainbowWindowOriginal.data, canvas.width, bbox);
        ctx.putImageData(region, bbox.x, bbox.y);
      } catch (err) {
        console.warn('[CanvasEngine] rainbow window restore failed:', err);
      }
    }

    if (points.length < 2) {
      // Just the stroke's very first touch so far -- a dot, same as every other stylus leaves if
      // the finger lifts before moving at all. One fill, no overlap possible, no scratch needed.
      ctx.globalAlpha = style.opacity;
      ctx.fillStyle = rainbowColorAt(distances[0]);
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, currentStrokeWidth() / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (bbox) protectInkInRegion(bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h);
      return;
    }
    if (!bbox) return; // nothing on-canvas to paint into

    const ox = bbox.x, oy = bbox.y;
    const local = points.map((pt) => ({ x: pt.x - ox, y: pt.y - oy }));

    if (style.textured) {
      const baseWidth = currentStrokeWidth();
      const passes = 5;
      for (let p = 0; p < passes; p++) {
        const sctx = rainbowScratch(bbox.w, bbox.h);
        const jittered = local.map((pt) => ({
          x: pt.x + (Math.random() - 0.5) * baseWidth * 0.25,
          y: pt.y + (Math.random() - 0.5) * baseWidth * 0.25,
        }));
        paintRainbowSegmentsOnto(sctx, jittered, distances, baseWidth * (0.55 + Math.random() * 0.5), 'round', 'round');
        ctx.globalAlpha = 0.45 + Math.random() * 0.4;
        ctx.drawImage(rainbowScratchCanvas, 0, 0, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
      }
      ctx.globalAlpha = 1;
    } else {
      const sctx = rainbowScratch(bbox.w, bbox.h);
      paintRainbowSegmentsOnto(sctx, local, distances, currentStrokeWidth(), style.cap, style.join);
      ctx.globalAlpha = style.opacity;
      ctx.drawImage(rainbowScratchCanvas, 0, 0, bbox.w, bbox.h, bbox.x, bbox.y, bbox.w, bbox.h);
      ctx.globalAlpha = 1;
    }

    protectInkInRegion(bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h);
  }

  // Appends newly-arrived points (already in canvas-pixel coords) to the current window, advances
  // rainbowDistance by however far each one actually moved, redraws, and -- once the window has
  // grown past RAINBOW_WINDOW_CAP points -- flattens it: whatever is now correctly on the canvas
  // becomes the new baseline and a fresh, empty window starts from the last point. Flattening
  // keeps the area being restored-and-redrawn every move bounded, instead of growing for as long
  // as the stroke keeps going.
  function extendRainbowStroke(newPoints) {
    if (!rainbowWindowPoints) return;
    for (const { x, y } of newPoints) {
      rainbowDistance += Math.hypot(x - lastX, y - lastY);
      rainbowWindowPoints.push({ x, y });
      rainbowWindowDistances.push(rainbowDistance);
      if (x < rainbowWindowMinX) rainbowWindowMinX = x;
      if (x > rainbowWindowMaxX) rainbowWindowMaxX = x;
      if (y < rainbowWindowMinY) rainbowWindowMinY = y;
      if (y > rainbowWindowMaxY) rainbowWindowMaxY = y;
      lastX = x;
      lastY = y;
    }
    redrawRainbowWindow();
    // This window system is Crayon-only now (see beginDraw) -- RAINBOW_WINDOW_CAP_TEXTURED is the
    // only cap that's ever reached here.
    if (rainbowWindowPoints.length > RAINBOW_WINDOW_CAP_TEXTURED) {
      beginRainbowWindow(lastX, lastY); // flatten -- what's on the canvas right now is correct and becomes the new baseline
    }
  }

  // ---- Rainbow GL renderer (every non-textured brush) ----
  // RainbowGL (js/rainbow-gl.js) draws into #rainbow-gl-canvas, a transparent WebGL overlay sitting
  // directly on top of #draw-canvas (see style.css), completely separate from this canvas/ctx and
  // its undo history until the stroke actually finishes. Live: every point goes into
  // rainbowGLPoints (color pre-resolved per point, see extendRainbowGLStroke) and the whole mesh
  // redraws in one GPU draw call -- no windowing/flattening needed, unlike the CPU path above.
  // Finished: finishRainbowGLStroke composites the overlay onto the real canvas once, at the
  // tool's normal opacity, then clears the overlay -- from that point on it's just pixels, exactly
  // like every other tool, so Undo/Redo/ink-protection need no special cases for it at all.
  let rainbowGLActive = false;
  let rainbowGLPoints = null; // [{x, y, r, g, b}, ...] -- r/g/b already 0..1, resolved once per point

  function rainbowRgb01(distance) {
    const [r, g, b] = hexToRgb(rainbowColorAt(distance));
    return [r / 255, g / 255, b / 255];
  }

  function renderRainbowGLStroke() {
    RainbowGL.renderStroke(rainbowGLPoints, currentStrokeWidth() / 2);
  }

  function beginRainbowGLStroke(x, y) {
    if (!RainbowGL.isReady()) { dot(x, y); return; } // WebGL unavailable -- fall back to a plain dot/strokeTo path
    rainbowGLActive = true;
    const [r, g, b] = rainbowRgb01(rainbowDistance);
    rainbowGLPoints = [{ x, y, r, g, b }];
    renderRainbowGLStroke();
  }

  function extendRainbowGLStroke(newPoints) {
    if (!rainbowGLActive) return;
    for (const { x, y } of newPoints) {
      rainbowDistance += Math.hypot(x - lastX, y - lastY);
      const [r, g, b] = rainbowRgb01(rainbowDistance);
      rainbowGLPoints.push({ x, y, r, g, b });
      lastX = x;
      lastY = y;
    }
    renderRainbowGLStroke();
  }

  // Bakes the in-progress overlay into the real canvas and clears it -- called once the stroke
  // actually finishes (onPointerUp), before the generic before/after undo-patch crop below reads
  // the canvas, so the composited pixels are what gets captured as this stroke's "after" state.
  function finishRainbowGLStroke() {
    if (!rainbowGLActive) return;
    const style = toolStyle();
    ctx.globalAlpha = style.opacity;
    ctx.drawImage(RainbowGL.getCanvas(), 0, 0);
    ctx.globalAlpha = 1;
    const bbox = clampBBox(strokeMinX, strokeMinY, strokeMaxX, strokeMaxY);
    if (bbox) protectInkInRegion(bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h);
    RainbowGL.clear();
    rainbowGLActive = false;
    rainbowGLPoints = null;
  }

  // Discards an in-progress overlay stroke without compositing it -- a pinch starting mid-stroke
  // (cancelSoloGesture) or a screen switch (init); in both cases the real canvas was never
  // touched by this stroke in the first place, so there's nothing to undo, just the overlay to
  // clear.
  function cancelRainbowGLStroke() {
    if (!rainbowGLActive) return;
    RainbowGL.clear();
    rainbowGLActive = false;
    rainbowGLPoints = null;
  }

  // ---- Paint effect GL renderer (Fire, Candy Stripe, Hollow Outline, Rainbow Ribbon, Sparkle) ----
  // Same overlay-then-composite-once lifecycle as Rainbow GL above, sharing the same
  // #rainbow-gl-canvas/WebGL context (see RainbowGL.renderEffectStroke in js/rainbow-gl.js) but a
  // second shader program that computes each effect's pattern per-fragment from distance-along-
  // stroke and side-across-stroke, rather than a color resolved per vertex -- Fire's flicker,
  // Candy Stripe's bands, Hollow Outline's discarded center, Rainbow Ribbon's fixed parallel
  // lanes, and Sparkle's noise flecks all need more than a single color at each point to work.
  // Mutually exclusive with Rainbow (see setPaintEffect/setRainbowMode) and independent of the
  // Brush dropdown's texture: unlike Crayon + Rainbow, none of these five effects has a
  // CPU-texture equivalent to fall back to, so they always render as a plain GL ribbon regardless
  // of which stylus is selected.
  const PAINT_EFFECT_IDS = { fire: 0, candy: 1, hollow: 2, ribbon: 3, sparkle: 4 };
  let paintEffect = null; // null | 'fire' | 'candy' | 'hollow' | 'ribbon' | 'sparkle'
  let paintEffectActive = false;
  let paintEffectPoints = null; // [{x, y, distance}, ...] -- color is resolved in the shader, not per point

  function paintEffectColorRgb01() {
    const [r, g, b] = hexToRgb(color);
    return [r / 255, g / 255, b / 255];
  }

  function renderPaintEffectStroke() {
    const halfWidth = currentStrokeWidth() / 2;
    RainbowGL.renderEffectStroke(paintEffectPoints, halfWidth, PAINT_EFFECT_IDS[paintEffect], paintEffectColorRgb01());
  }

  function beginPaintEffectStroke(x, y) {
    if (!RainbowGL.isReady() || !RainbowGL.initEffects()) { dot(x, y); return; } // WebGL/effects unavailable -- fall back to a plain dot/strokeTo path
    paintEffectActive = true;
    paintEffectPoints = [{ x, y, distance: 0 }];
    renderPaintEffectStroke();
  }

  function extendPaintEffectStroke(newPoints) {
    if (!paintEffectActive) return;
    for (const { x, y } of newPoints) {
      const prevDistance = paintEffectPoints[paintEffectPoints.length - 1].distance;
      const distance = prevDistance + Math.hypot(x - lastX, y - lastY);
      paintEffectPoints.push({ x, y, distance });
      lastX = x;
      lastY = y;
    }
    renderPaintEffectStroke();
  }

  // Bakes the in-progress overlay into the real canvas and clears it, same as finishRainbowGLStroke.
  function finishPaintEffectStroke() {
    if (!paintEffectActive) return;
    const style = toolStyle();
    ctx.globalAlpha = style.opacity;
    ctx.drawImage(RainbowGL.getCanvas(), 0, 0);
    ctx.globalAlpha = 1;
    const bbox = clampBBox(strokeMinX, strokeMinY, strokeMaxX, strokeMaxY);
    if (bbox) protectInkInRegion(bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h);
    RainbowGL.clear();
    paintEffectActive = false;
    paintEffectPoints = null;
  }

  // Discards an in-progress overlay stroke without compositing it, same as cancelRainbowGLStroke.
  function cancelPaintEffectStroke() {
    if (!paintEffectActive) return;
    RainbowGL.clear();
    paintEffectActive = false;
    paintEffectPoints = null;
  }

  // Straight Line mode's live preview: a straight line's final endpoint isn't known until the
  // finger lifts, so (unlike strokeTo, which just extends the path one segment further every
  // move) each frame restores the untouched pixels across everywhere this gesture has reached so
  // far, then redraws one fresh segment from the fixed start point to wherever the pointer is
  // now. onPointerUp's existing commit logic needs no changes at all -- it already crops whatever
  // the final strokeMinX/Y..strokeMaxX/Y bbox ended up being from strokeOriginal, which is exactly
  // what this has been maintaining as it goes.
  function drawStraightLinePreview(x, y) {
    expandStrokeBBox(x, y);
    const bbox = clampBBox(strokeMinX, strokeMinY, strokeMaxX, strokeMaxY);
    if (bbox && strokeOriginal) {
      try {
        const region = cropRegion(strokeOriginal.data, canvas.width, bbox);
        ctx.putImageData(region, bbox.x, bbox.y);
      } catch (err) {
        console.warn('[CanvasEngine] straight-line preview failed to restore the working area:', err);
      }
    }
    const style = toolStyle();
    // Straight Line respects whatever color is selected, same as freehand drawing -- except in
    // Neon Mode, where it's treated like an "ink tool" (same as Stickers/Shapes) and always
    // commits in white instead, per the user's explicit request for all three.
    const lineColor = tool === 'eraser' ? backgroundColor : (backgroundColor === '#000000' ? '#ffffff' : color);
    if (style.textured) {
      crayonSegment(lineStartX, lineStartY, x, y, lineColor);
    } else {
      ctx.globalAlpha = style.opacity;
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = currentStrokeWidth();
      ctx.lineCap = style.cap;
      ctx.lineJoin = style.join;
      ctx.beginPath();
      ctx.moveTo(lineStartX, lineStartY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (bbox) protectInkInRegion(bbox.x, bbox.y, bbox.x + bbox.w, bbox.y + bbox.h);
  }

  function dot(x, y) {
    const style = toolStyle();
    if (style.textured) {
      crayonSegment(x, y, x, y);
    } else {
      ctx.globalAlpha = style.opacity;
      ctx.fillStyle = tool === 'eraser' ? backgroundColor : activeStrokeColor();
      ctx.beginPath();
      ctx.arc(x, y, currentStrokeWidth() / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const margin = currentStrokeWidth() / 2 + 10;
    protectInkInRegion(x - margin, y - margin, x + margin, y + margin);
  }

  // Spray Can: a burst of tiny semi-transparent dots scattered within a radius, re-fired on
  // an interval while the pointer is held down (not just on move) so holding still still
  // builds up coverage, like a real airbrush.
  function scatterSpray(x, y) {
    const radius = currentStrokeWidth() * 1.4;
    const density = 14;
    ctx.fillStyle = activeStrokeColor();
    for (let i = 0; i < density; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      ctx.globalAlpha = 0.35 + Math.random() * 0.3;
      ctx.beginPath();
      ctx.arc(px, py, Math.max(1, dpr * 1.2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const margin = radius + 6;
    protectInkInRegion(x - margin, y - margin, x + margin, y + margin);
  }

  function startSprayLoop() {
    stopSprayLoop();
    sprayTimer = setInterval(() => scatterSpray(lastX, lastY), 70);
  }

  function stopSprayLoop() {
    if (sprayTimer) {
      clearInterval(sprayTimer);
      sprayTimer = null;
    }
  }

  // Glitter: a handful of small sparkle shapes scattered near the pointer on each move.
  function drawSparkle(x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.random() * Math.PI);
    ctx.fillStyle = activeStrokeColor();
    ctx.globalAlpha = 0.75 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.25, -size * 0.25);
    ctx.lineTo(size, 0);
    ctx.lineTo(size * 0.25, size * 0.25);
    ctx.lineTo(0, size);
    ctx.lineTo(-size * 0.25, size * 0.25);
    ctx.lineTo(-size, 0);
    ctx.lineTo(-size * 0.25, -size * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function scatterGlitter(x, y) {
    const radius = currentStrokeWidth() * 1.1;
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      drawSparkle(x + Math.cos(angle) * r, y + Math.sin(angle) * r, (1.5 + Math.random() * 2) * dpr);
    }
    const margin = radius + 5 * dpr;
    protectInkInRegion(x - margin, y - margin, x + margin, y + margin);
  }

  // Grows the current stroke's bounding box to cover (x, y) plus a safety margin for line
  // width / jitter / scatter radius, so the eventual undo patch fully covers every pixel the
  // stroke actually touched.
  function expandStrokeBBox(x, y) {
    const pad = currentStrokeWidth() * 2 + 20;
    if (x - pad < strokeMinX) strokeMinX = x - pad;
    if (x + pad > strokeMaxX) strokeMaxX = x + pad;
    if (y - pad < strokeMinY) strokeMinY = y - pad;
    if (y + pad > strokeMaxY) strokeMaxY = y + pad;
  }

  // Cancels whatever the solo finger's gesture was doing, in whatever state it was in -- still
  // in its hold-off window, mid-stroke, mid-fill, or (rare but possible for a very quick tap)
  // already finished and committed -- so a two-finger pan starting never leaves behind a stray
  // mark or fill from the finger that's about to become part of that pan instead.
  function cancelSoloGesture() {
    if (holdoffTimer) { clearTimeout(holdoffTimer); holdoffTimer = null; }
    if (fillPending) {
      // The chunked fill only ever writes to the real canvas once, right at the very end (see
      // floodFillAt) -- bumping canvasContentGen makes its next scheduled chunk notice and bail
      // out before that write/commit ever happens, so there's nothing to visually undo here.
      canvasContentGen++;
      fillPending = false;
    }
    if (drawing) {
      if (strokeOriginal) {
        try { ctx.putImageData(strokeOriginal, 0, 0); } catch (err) { console.warn('[CanvasEngine] failed to cancel in-progress stroke:', err); }
      }
      drawing = false;
      strokeOriginal = null;
    }
    rainbowWindowPoints = null;
    cancelRainbowGLStroke();
    cancelPaintEffectStroke();
    stopSprayLoop();
    if (soloCommitted) undo(); // already-finished fill/stroke -- take it back
    soloPointerId = null;
    soloCommitted = false;
    activePointerId = null;
  }

  function beginDraw(pointerId, clientX, clientY) {
    activePointerId = pointerId;
    const { x, y } = clientToCanvasCoords(clientX, clientY);

    if (tool === 'eyedropper') {
      // Instant, like a bucket tap -- but it only ever reads a pixel, never changes the canvas,
      // so there's nothing to undo and no fillPending-style async wait before the lock releases.
      const px = Math.round(x), py = Math.round(y);
      if (px >= 0 && py >= 0 && px < canvas.width && py < canvas.height) {
        try {
          const d = ctx.getImageData(px, py, 1, 1).data;
          color = rgbToHex(d[0], d[1], d[2]);
          if (onColorPicked) onColorPicked(color);
        } catch (err) {
          console.warn('[CanvasEngine] eyedropper failed to read the tapped pixel:', err);
        }
      }
      activePointerId = null;
      return;
    }

    if (tool === 'bucket') {
      fillPending = true;
      const gen = engineGen;
      console.log('[CanvasEngine] fill started', { x: Math.round(x), y: Math.round(y) });
      floodFillAt(Math.round(x), Math.round(y), (changed) => {
        console.log('[CanvasEngine] fill finished', { changed, gen, engineGen });
        if (changed && soloPointerId === pointerId) soloCommitted = true;
        fillPending = false;
        if (gen !== engineGen) return; // screen changed mid-fill; nothing left to update
        if (soloPointerId === pointerId) activePointerId = null;
      });
      return;
    }

    drawing = true;
    lastX = x;
    lastY = y;
    lineStartX = x;
    lineStartY = y;
    rainbowDistance = 0; // every new stroke starts the cycle over at red
    // Held only for this one stroke, to crop a small "before" patch once the stroke's final
    // bounding box is known at pointerup -- never put in the undo stack itself.
    try {
      strokeOriginal = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('Failed to snapshot canvas before stroke (likely out of memory):', err);
      strokeOriginal = null; // the stroke still draws -- it just won't be undoable
    }
    strokeMinX = x; strokeMaxX = x; strokeMinY = y; strokeMaxY = y;
    expandStrokeBBox(x, y);
    rainbowWindowPoints = null; // no window yet -- started below only if this stroke actually uses one
    rainbowGLActive = false;
    rainbowGLPoints = null;
    paintEffectActive = false;
    paintEffectPoints = null;

    if (tool === 'spray') {
      scatterSpray(x, y);
      startSprayLoop();
    } else if (tool === 'glitter') {
      scatterGlitter(x, y);
    } else if (rainbowMode && tool !== 'eraser' && !straightLineMode) {
      if (toolStyle().textured) {
        rainbowWindowPoints = [{ x, y }];
        rainbowWindowDistances = [rainbowDistance];
        rainbowWindowMinX = x; rainbowWindowMaxX = x;
        rainbowWindowMinY = y; rainbowWindowMaxY = y;
        rainbowWindowOriginal = strokeOriginal; // identical snapshot taken just above -- no need to retake it
        redrawRainbowWindow(); // draws the starting dot
      } else {
        beginRainbowGLStroke(x, y);
      }
    } else if (paintEffect && tool !== 'eraser' && !straightLineMode) {
      beginPaintEffectStroke(x, y);
    } else {
      dot(x, y);
    }
  }

  function updatePanFromPointers() {
    if (panPointerIds.length !== 2) return;
    const p1 = panPositions.get(panPointerIds[0]);
    const p2 = panPositions.get(panPointerIds[1]);
    if (!p1 || !p2) return;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (panLastDist > 0 && dist > 0) {
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomScale * (dist / panLastDist)));
      // Anchored at the PREVIOUS midpoint (where the fingers were a moment ago, not where they
      // are now) so this frame's scale change doesn't itself shift the content there; the
      // separate translate below then carries it the rest of the way to the new midpoint,
      // tracking the fingers' actual drag. Over many fast move events this keeps whatever's
      // between your fingers anchored there continuously, not just on the initial touch.
      zoomAround(panLastMidX, panLastMidY, newScale);
    }
    panLastDist = dist;
    panX += midX - panLastMidX;
    panY += midY - panLastMidY;
    panLastMidX = midX;
    panLastMidY = midY;
    applyTransform();
  }

  function onPointerDown(evt) {
    const secondFingerJoining = downPointerIds.size > 0 && panPointerIds.length < 2;
    downPointerIds.add(evt.pointerId);
    try { canvas.setPointerCapture(evt.pointerId); } catch { /* pointer may already be gone */ }

    if (panPointerIds.length >= 2) return; // a 3rd+ finger -- ignore it entirely

    if (secondFingerJoining) {
      const firstId = soloPointerId !== null
        ? soloPointerId
        : [...downPointerIds].find((id) => id !== evt.pointerId);
      cancelSoloGesture();
      panPointerIds = firstId !== undefined && firstId !== null ? [firstId, evt.pointerId] : [evt.pointerId];
      panPositions.clear();
      panPositions.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      if (!panPositions.has(panPointerIds[0])) {
        // Best known position for the first finger -- its hold-off/drawing position is at most
        // HOLDOFF_MS old, which is close enough not to cause a visible jump when panning begins.
        panPositions.set(panPointerIds[0], { x: soloClientX, y: soloClientY });
      }
      const p1 = panPositions.get(panPointerIds[0]);
      const p2 = panPositions.get(panPointerIds[1]) || p1;
      panLastMidX = (p1.x + p2.x) / 2;
      panLastMidY = (p1.y + p2.y) / 2;
      panLastDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      return;
    }

    // First (solo) finger down -- hold off briefly before committing to a draw/fill, in case a
    // second finger is about to join for a pan instead.
    soloPointerId = evt.pointerId;
    soloCommitted = false;
    soloClientX = evt.clientX;
    soloClientY = evt.clientY;
    holdoffTimer = setTimeout(() => {
      holdoffTimer = null;
      if (soloPointerId !== evt.pointerId) return;
      beginDraw(evt.pointerId, soloClientX, soloClientY);
    }, HOLDOFF_MS);
  }

  function onPointerMove(evt) {
    if (panPointerIds.includes(evt.pointerId)) {
      panPositions.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });
      updatePanFromPointers();
      return;
    }

    if (evt.pointerId !== soloPointerId) return;
    soloClientX = evt.clientX;
    soloClientY = evt.clientY;
    if (!drawing) return; // still in the hold-off window, nothing drawn yet

    // Rainbow or a paint effect, on a regular (non-spray/glitter/straight-line) stroke: hand off
    // to the window renderer (Crayon) or RainbowGL (everything else) entirely instead of drawing
    // anything here directly -- that's what keeps the stroke a single continuous path with no
    // internal seams, regardless of how many points arrive per event.
    if (rainbowWindowPoints || rainbowGLActive || paintEffectActive) {
      // Apple Pencil in particular can report several sub-events per animation frame on a fast
      // stroke -- replay all of them into the window instead of just this event's final
      // position, so the window's own points stay fine-grained then too. Falls back to just this
      // one event's position when the browser doesn't support coalescing.
      const MAX_COALESCED = 16;
      let newPoints;
      if (typeof evt.getCoalescedEvents === 'function') {
        const raw = evt.getCoalescedEvents();
        const points = raw && raw.length ? raw : [evt];
        const n = points.length;
        const sampleCount = Math.min(n, MAX_COALESCED);
        newPoints = [];
        // Evenly sampled across the whole batch, but i=0 and i=sampleCount-1 always resolve to
        // index 0 and n-1 exactly -- the last point in particular must land exactly on this
        // event's own (clientX, clientY), or lastX/lastY would end this move a few pixels short
        // of where the pointer actually is, same as every other tool already relies on.
        for (let i = 0; i < sampleCount; i++) {
          const idx = sampleCount === 1 ? n - 1 : Math.round((i * (n - 1)) / (sampleCount - 1));
          const p = points[idx];
          newPoints.push(clientToCanvasCoords(p.clientX, p.clientY));
        }
      } else {
        newPoints = [pointerToCanvasCoords(evt)];
      }
      if (rainbowWindowPoints) extendRainbowStroke(newPoints);
      else if (rainbowGLActive) extendRainbowGLStroke(newPoints);
      else extendPaintEffectStroke(newPoints);
      newPoints.forEach(({ x, y }) => expandStrokeBBox(x, y));
      return;
    }

    const { x, y } = pointerToCanvasCoords(evt);
    // Distance-driven, not per-event -- so Spray/Glitter's own Rainbow coloring (still just a
    // flat color per scattered dot/sparkle, not part of the window renderer above) advances
    // smoothly by how far the pointer actually traveled this move, not by event count.
    if (rainbowMode && tool !== 'eraser' && tool !== 'bucket') {
      rainbowDistance += Math.hypot(x - lastX, y - lastY);
    }
    if (tool === 'spray') {
      lastX = x;
      lastY = y;
      scatterSpray(x, y);
    } else if (tool === 'glitter') {
      scatterGlitter(x, y);
      lastX = x;
      lastY = y;
    } else if (straightLineMode) {
      drawStraightLinePreview(x, y);
    } else {
      strokeTo(x, y);
    }
    expandStrokeBBox(x, y);
  }

  function onPointerUp(evt) {
    downPointerIds.delete(evt.pointerId);

    if (panPointerIds.includes(evt.pointerId)) {
      panPointerIds = panPointerIds.filter((id) => id !== evt.pointerId);
      panPositions.delete(evt.pointerId);
      // Once fewer than two fingers remain, stop panning -- don't let whichever finger is still
      // down suddenly start drawing; wait for every finger to lift before a fresh gesture starts.
      return;
    }

    if (evt.pointerId !== soloPointerId) return;

    if (holdoffTimer) {
      // Lifted before the hold-off even finished -- a genuine instantaneous tap. Fire the
      // draw/fill right now instead of waiting out the rest of the window, which would
      // otherwise make quick taps feel laggy.
      clearTimeout(holdoffTimer);
      holdoffTimer = null;
      beginDraw(evt.pointerId, soloClientX, soloClientY);
    }

    // Bake the finished RainbowGL/paint-effect overlay into the real canvas before the before/
    // after crop below reads it -- from here on this stroke is just pixels, same as every other
    // tool. Only one of these two is ever actually active -- both are safe no-ops otherwise.
    finishRainbowGLStroke();
    finishPaintEffectStroke();

    if (drawing && strokeOriginal) {
      const bbox = clampBBox(strokeMinX, strokeMinY, strokeMaxX, strokeMaxY);
      if (bbox) {
        try {
          const before = cropRegion(strokeOriginal.data, canvas.width, bbox);
          const after = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
          commitPatch(bbox.x, bbox.y, bbox.w, bbox.h, before, after);
          soloCommitted = true;
        } catch (err) {
          console.warn('Stroke could not be saved for undo (likely out of memory); keeping the drawing anyway:', err);
        }
      }
    }
    strokeOriginal = null;
    rainbowWindowPoints = null;
    stopSprayLoop();
    drawing = false;
    // Lifting the finger fires almost immediately after a bucket tap, well before a multi-frame
    // chunked fill finishes -- don't release the lock out from under it (beginDraw's own
    // completion callback will, once the fill actually finishes).
    if (!fillPending) {
      soloPointerId = null;
      soloCommitted = false;
      activePointerId = null;
    }
  }

  // Scanline flood fill. Compares against the tapped pixel's own starting color (not a fixed
  // "white"), so tapping an already-filled region recolors it too -- not just the original
  // template background.
  //
  // Time-sliced across animation frames: a Coloring Book template region is small and finishes
  // in one slice, but Free Draw's bucket tool can be asked to fill the *entire* canvas (full
  // device-pixel-ratio screen resolution, potentially millions of pixels) in one tap. Doing that
  // synchronously blocked the main thread long enough for the browser to flag the page as
  // unresponsive, so the stack is drained in small time-boxed chunks via requestAnimationFrame
  // instead of a single while loop.
  function colorsClose(data, idx, r, g, b, tol) {
    return (
      Math.abs(data[idx] - r) <= tol &&
      Math.abs(data[idx + 1] - g) <= tol &&
      Math.abs(data[idx + 2] - b) <= tol
    );
  }

  // Dark enough to count as line art when the picture first loads. Measured ink stays under 10
  // and the lightest anti-aliasing pixels we want to protect alongside it run up to ~100 (see
  // TOLERANCE's own measurements below), so 120 comfortably covers all of it while staying well
  // under the ~155 cutoff the fill is allowed to touch. Only ever used to build inkMask once, at
  // load time -- never to judge a pixel's current color later (see inkMask's own comment for why).
  const INK_THRESHOLD = 120;

  function isProtectedInk(idx) {
    return protectInk && inkMask !== null && inkMask[idx / 4] === 1;
  }

  // Flood fill can check isProtectedInk before writing each pixel, but strokes/eraser/spray/
  // glitter all paint through the Canvas 2D path API (stroke/fill/arc), not direct pixel writes --
  // there's no single chokepoint to guard there. Instead, every draw call below paints normally
  // and then calls this right after, over just the small area it touched, stamping any protected
  // ink pixels back to solid black. The result is the same guarantee flood fill has: no stylus,
  // including the eraser, can ever visibly remove the original line art.
  function protectInkInRegion(minX, minY, maxX, maxY) {
    if (!protectInk || !inkMask) return; // Free Draw, no template loaded, or admin editing -- nothing to protect
    const bbox = clampBBox(minX, minY, maxX, maxY);
    if (!bbox) return;
    let imageData;
    try {
      imageData = ctx.getImageData(bbox.x, bbox.y, bbox.w, bbox.h);
    } catch {
      return; // best effort -- skipping one correction is better than throwing mid-stroke
    }
    const data = imageData.data;
    let touched = false;
    for (let row = 0; row < bbox.h; row++) {
      const maskRowBase = (bbox.y + row) * canvas.width + bbox.x;
      const dataRowBase = row * bbox.w;
      for (let col = 0; col < bbox.w; col++) {
        if (inkMask[maskRowBase + col] !== 1) continue;
        const i = (dataRowBase + col) * 4;
        if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 255) {
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
          touched = true;
        }
      }
    }
    if (touched) ctx.putImageData(imageData, bbox.x, bbox.y);
  }

  // Collapses the blurry black-to-white ramp a template's edges arrive with (the source PNG's own
  // alpha anti-aliasing, plus more blur from scaling the art up to canvas size) into pure black or
  // pure white. Run once, right after a template is drawn, before computeInkMask ever sees it --
  // without this, pixels in the middle of that ramp are too light to count as protected ink but
  // too dark to match a same-color fill from the white background, and just sit there forever as
  // a gray/white fringe hugging every line, no matter how the ink/fill thresholds are tuned.
  function hardenLineArt() {
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('[CanvasEngine] failed to harden template edges (likely out of memory); anti-aliasing fringe may remain visible:', err);
      return;
    }
    const data = imageData.data;
    const CUTOFF = 160; // measured ramps run roughly black -> ~100 -> ~174 before reaching pure
                         // white background; splitting above that range pushes every fringe pixel
                         // solidly to one side instead of leaving it stranded in between.
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const v = avg < CUTOFF ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Captures which pixels are the picture's original line art, right after it's drawn. Must run
  // every time the canvas is (re)loaded with a template, and inkMask must be cleared (not
  // recomputed) whenever it's reset to blank -- a blank canvas has no "original picture" to
  // protect, and computing one from live Free Draw content would re-introduce the exact bug this
  // replaced (today's dark paint becoming tomorrow's permanently unfillable "ink").
  function computeInkMask() {
    let data;
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    } catch (err) {
      console.warn('[CanvasEngine] failed to compute protected line-art mask (likely out of memory); line art will not be protected this session:', err);
      inkMask = null;
      return;
    }
    const total = canvas.width * canvas.height;
    const mask = new Uint8Array(total);
    for (let p = 0, i = 0; p < total; p++, i += 4) {
      if (data[i] <= INK_THRESHOLD && data[i + 1] <= INK_THRESHOLD && data[i + 2] <= INK_THRESHOLD) {
        mask[p] = 1;
      }
    }
    inkMask = mask;
  }

  const FILL_CHUNK_BUDGET_MS = 12;

  function floodFillAt(startX, startY, onDone) {
    if (startX < 0 || startY < 0 || startX >= canvas.width || startY >= canvas.height) { onDone(false); return; }
    const w = canvas.width, h = canvas.height;
    // Must not throw -- an uncaught failure here (e.g. out of memory on a big canvas) would skip
    // onDone entirely, leaving fillPending/activePointerId stuck and silently freezing every
    // future tap and the undo/redo/clear buttons along with it.
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, w, h);
    } catch (err) {
      console.error('[CanvasEngine] flood fill failed to read the canvas (likely out of memory):', err);
      onDone(false);
      return;
    }
    const data = imageData.data;
    const startIdx = (startY * w + startX) * 4;
    const startR = data[startIdx], startG = data[startIdx + 1], startB = data[startIdx + 2];
    console.log('[CanvasEngine] tapped pixel', { startR, startG, startB });

    if (isProtectedInk(startIdx)) {
      console.log('[CanvasEngine] no-op: tapped pixel is the original picture\'s line art');
      onDone(false); // tapped the line art itself -- nothing to fill, and never paint over it
      return;
    }

    const fillRgb = hexToRgb(color);
    // Anti-aliased line art blends from black ink to white background over a few pixels (measured
    // as wide as ~850->852 going 46 -> 100 -> 174 on one of the newer mammal images). A tolerance
    // of 42 only matches down to 213, leaving that whole ramp as an unfilled white fringe/"dots"
    // hugging every curve. 100 (matching down to 155) clears that with room to spare while staying
    // nowhere near actual ink, which measured under 10 on every sampled image -- no risk of the
    // fill leaking through a line just because this is more permissive.
    const TOLERANCE = 100;
    if (Math.abs(startR - fillRgb[0]) <= 4 && Math.abs(startG - fillRgb[1]) <= 4 && Math.abs(startB - fillRgb[2]) <= 4) {
      console.log('[CanvasEngine] no-op: tapped pixel already matches the selected fill color');
      onDone(false); // already (close enough to) this color -- no-op
      return;
    }

    // Pristine copy of the untouched pixels, held only for this one fill, so the eventual undo
    // patch only needs to persist the small bounding box that actually changed -- not the whole
    // canvas. Freed as soon as the small patch below is cropped out of it. This allocation is the
    // same size as the canvas and runs before the chunk loop (and its own catch-all) even starts,
    // so a failure here must be caught right here, or it skips onDone and locks up the same way.
    let original;
    try {
      original = new Uint8ClampedArray(data);
    } catch (err) {
      console.error('[CanvasEngine] failed to allocate fill undo buffer -- releasing the lock anyway:', err);
      onDone(false);
      return;
    }
    let minX = startX, minY = startY, maxX = startX, maxY = startY;

    // Explicit visited tracker, one byte per pixel: the algorithm's termination must not depend
    // on the fill color being different enough from the background to stop matching once
    // painted. Several palette colors (e.g. the pale pink/magenta pastels) land within TOLERANCE
    // of white, so a pixel just painted with one of those still "matched" white on the next
    // check -- it kept getting re-added to the stack forever.
    let visited;
    try {
      visited = new Uint8Array(w * h);
    } catch (err) {
      console.error('[CanvasEngine] failed to allocate fill tracking buffer -- releasing the lock anyway:', err);
      onDone(false);
      return;
    }

    const matches = (idx) => !visited[idx / 4] && !isProtectedInk(idx) && colorsClose(data, idx, startR, startG, startB, TOLERANCE);
    const setPixel = (idx, x, y) => {
      visited[idx / 4] = 1;
      data[idx] = fillRgb[0];
      data[idx + 1] = fillRgb[1];
      data[idx + 2] = fillRgb[2];
      data[idx + 3] = 255;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    const stack = [[startX, startY]];
    const gen = engineGen; // abandon if the screen/canvas changes mid-fill
    const startContentGen = canvasContentGen; // abandon if undo/redo/clear touches the canvas mid-fill
    const runChunk = () => {
      if (gen !== engineGen) return;
      if (canvasContentGen !== startContentGen) { onDone(false); return; }
      // The whole chunk is wrapped: whatever throws in here (pixel-scanning loop, cropping,
      // putImageData, anything), onDone must still fire. This function runs detached, via
      // requestAnimationFrame, across possibly many frames -- an uncaught exception here doesn't
      // crash the page, it just silently abandons this callback, which skips onDone and leaves
      // fillPending/activePointerId locked forever, freezing every future tap.
      try {
        const chunkStart = performance.now();
        while (stack.length && (performance.now() - chunkStart) < FILL_CHUNK_BUDGET_MS) {
          let [x, y] = stack.pop();
          let idx = (y * w + x) * 4;
          while (x >= 0 && matches(idx)) { x--; idx -= 4; }
          x++; idx += 4;
          let spanAbove = false, spanBelow = false;
          while (x < w && matches(idx)) {
            setPixel(idx, x, y);
            if (y > 0) {
              const aboveMatches = matches(idx - w * 4);
              if (!spanAbove && aboveMatches) { stack.push([x, y - 1]); spanAbove = true; }
              else if (spanAbove && !aboveMatches) spanAbove = false;
            }
            if (y < h - 1) {
              const belowMatches = matches(idx + w * 4);
              if (!spanBelow && belowMatches) { stack.push([x, y + 1]); spanBelow = true; }
              else if (spanBelow && !belowMatches) spanBelow = false;
            }
            x++; idx += 4;
          }
        }
        if (stack.length) {
          requestAnimationFrame(runChunk);
          return;
        }
        const bbox = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
        console.log('[CanvasEngine] fill region done', { bbox, canvasW: w, canvasH: h });
        try {
          const beforePatch = cropRegion(original, w, bbox);
          const afterPatch = cropRegion(data, w, bbox);
          ctx.putImageData(afterPatch, bbox.x, bbox.y);
          commitPatch(bbox.x, bbox.y, bbox.w, bbox.h, beforePatch, afterPatch);
          console.log('[CanvasEngine] patch committed, undo depth now', undoStack.length);
        } catch (err) {
          console.warn('Flood fill result could not be saved for undo (likely out of memory); applying it anyway:', err);
          try {
            ctx.putImageData(imageData, 0, 0);
            canvasContentGen++;
          } catch (err2) {
            console.warn('Flood fill failed to apply at all (likely out of memory):', err2);
          }
        }
        onDone(true);
      } catch (err) {
        console.error('[CanvasEngine] flood fill chunk crashed -- releasing the lock anyway:', err);
        onDone(false);
      }
    };
    runChunk();
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }

  function attachListeners() {
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  function init(canvasEl) {
    engineGen++;
    canvas = canvasEl;
    undoStack = [];
    redoStack = [];
    undoBytes = 0;
    minScale = 0;
    editCount = 0;
    drawing = false;
    activePointerId = null;
    fillPending = false;
    strokeOriginal = null;
    rainbowWindowPoints = null;
    rainbowGLActive = false;
    rainbowGLPoints = null;
    paintEffectActive = false;
    paintEffectPoints = null;
    inkMask = null;
    protectInk = true; // every fresh screen starts protected; only loadForAdmin ever turns it off
    downPointerIds = new Set();
    soloPointerId = null;
    soloCommitted = false;
    if (holdoffTimer) { clearTimeout(holdoffTimer); holdoffTimer = null; }
    panPointerIds = [];
    panPositions = new Map();
    stopSprayLoop();
    resetZoom();
    fitCanvasToStage();
    attachListeners();
  }

  function renderBlankOnto(onDrawn) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    inkMask = null; // blank canvas -- nothing is "original line art" here
    onDrawn();
  }

  function renderTemplateOnto(templateId, onDrawn) {
    const tpl = findTemplate(templateId);
    if (!tpl) return;
    backgroundColor = '#ffffff'; // Coloring Book has no Neon Mode -- always white, regardless of whatever Free Draw last left this as
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gen = engineGen;
    RasterArt.load(tpl.src).then(({ img, bbox }) => {
      if (gen !== engineGen) return; // navigated away before the image finished loading
      ensureScaleFor(bbox, 0.07, MAX_KID_PIXELS);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      RasterArt.drawFitted(ctx, img, bbox, canvas.width, canvas.height, 0.07);
      hardenLineArt();
      computeInkMask(); // fix the protected line art now, before any fill can touch it
      onDrawn();
    }).catch((err) => console.error('[CanvasEngine] template failed to load:', err));
  }

  // Initial setup for a fresh screen (openCanvas) -- no prior content exists yet, so there's
  // nothing to make undoable; just establishes the starting state.
  function loadBlank() {
    renderBlankOnto(() => { canvasContentGen++; });
  }

  function loadTemplate(templateId) {
    renderTemplateOnto(templateId, () => { canvasContentGen++; });
  }

  // Admin template editor: loads an arbitrary image (an existing template's own src, or an
  // object URL from a freshly uploaded file) through the exact same draw-fitted + harden +
  // ink-mask pipeline a normal template load uses -- so what gets edited here matches production
  // exactly -- but turns off ink protection afterward so the stylus tools can actually touch the
  // line art instead of being blocked by it.
  function loadForAdmin(src, onDrawn) {
    backgroundColor = '#ffffff'; // Admin/Sticker editors have no Neon Mode -- always white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const gen = engineGen;
    RasterArt.load(src).then(({ img, bbox }) => {
      if (gen !== engineGen) return;
      ensureScaleFor(bbox, 0.07, MAX_ADMIN_PIXELS);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      RasterArt.drawFitted(ctx, img, bbox, canvas.width, canvas.height, 0.07);
      hardenLineArt();
      computeInkMask();
      protectInk = false;
      canvasContentGen++;
      onDrawn();
    }).catch((err) => {
      console.error('[CanvasEngine] admin image load failed:', err);
    });
  }

  // Admin template editor export: the inverse of hardenLineArt -- same brightness cutoff, but
  // instead of forcing the background to solid white, it becomes fully transparent, producing a
  // PNG in exactly the format every template asset already uses (transparent background, opaque
  // black ink), ready to drop straight into assets/templates/.
  function exportTransparentPng() {
    const CUTOFF = 160;
    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.error('[CanvasEngine] export failed to read the canvas:', err);
      return Promise.resolve(null);
    }
    const data = imageData.data;
    const out = ctx.createImageData(canvas.width, canvas.height);
    const od = out.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (avg < CUTOFF) {
        od[i] = 0; od[i + 1] = 0; od[i + 2] = 0; od[i + 3] = 255;
      } else {
        od[i] = 0; od[i + 1] = 0; od[i + 2] = 0; od[i + 3] = 0;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext('2d').putImageData(out, 0, 0);
    return new Promise((resolve) => tmp.toBlob(resolve, 'image/png'));
  }

  // "Keep Coloring" on a saved gallery piece -- another fresh load (nothing to undo back past),
  // just one whose starting pixels come from a previous session's save instead of a blank canvas
  // or an untouched template.
  function loadSavedArtwork(dataUrl, templateId) {
    // Re-opening a gallery piece doesn't know whether it was painted in Neon Mode (that's not
    // saved with it), so this always defaults back to a normal white background/eraser -- a Neon
    // piece's own saved pixels still display correctly, just without the black-background
    // identity carrying back over for further edits.
    backgroundColor = '#ffffff';
    const gen = engineGen;
    const paintSavedImageOnTop = () => {
      const img = new Image();
      img.onload = () => {
        if (gen !== engineGen) return;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvasContentGen++;
      };
      img.onerror = (err) => console.error('[CanvasEngine] failed to load saved artwork:', err);
      img.src = dataUrl;
    };

    const tpl = templateId ? findTemplate(templateId) : null;
    if (tpl) {
      // Reload the PRISTINE template first -- not to display it, just to (re)compute inkMask at
      // full resolution, the same as a fresh open of this picture. The saved (already-colored)
      // image is painted on top of that as the actual visible content, so continuing to color
      // still can't paint over the original line art, same guarantee a never-before-opened
      // picture gets.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      RasterArt.load(tpl.src).then(({ img, bbox }) => {
        if (gen !== engineGen) return;
        ensureScaleFor(bbox, 0.07, MAX_KID_PIXELS); // same size as when it was first colored
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        RasterArt.drawFitted(ctx, img, bbox, canvas.width, canvas.height, 0.07);
        hardenLineArt();
        computeInkMask();
        paintSavedImageOnTop();
      });
    } else {
      // Free Draw save, or an older save from before templateId was recorded -- no line art to
      // (re)establish protection for, so just restore the pixels directly.
      inkMask = null;
      paintSavedImageOnTop();
    }
  }

  // Clear button, mid-session -- unlike the load*/ functions above, this replaces real work the
  // player already did, so it's recorded as a (full-canvas) undoable patch.
  function clearToBlank() {
    if (fillPending) return; // a chunked flood fill is still catching up -- let it finish first
    let before;
    try {
      before = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('Clear failed to snapshot the canvas (likely out of memory):', err);
      before = null;
    }
    renderBlankOnto(() => {
      if (!before) { canvasContentGen++; return; }
      const [r, g, b] = hexToRgbTriple(backgroundColor); // white normally, black in Neon Mode
      const after = makeSolidImageData(canvas.width, canvas.height, r, g, b);
      commitPatch(0, 0, canvas.width, canvas.height, before, after);
      editCount = 0; // a cleared canvas starts over for coin purposes
    });
  }

  function clearToTemplate(templateId) {
    if (fillPending) return; // a chunked flood fill is still catching up -- let it finish first
    let before;
    try {
      before = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('Clear failed to snapshot the canvas (likely out of memory):', err);
      before = null;
    }
    renderTemplateOnto(templateId, () => {
      if (!before) { canvasContentGen++; return; }
      let after;
      try {
        after = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (err) {
        console.warn('Clear failed to snapshot the result (likely out of memory):', err);
        after = null;
      }
      if (after) commitPatch(0, 0, canvas.width, canvas.height, before, after);
      else canvasContentGen++;
      editCount = 0; // a cleared canvas starts over for coin purposes
    });
  }

  function undo() {
    if (fillPending) return; // a chunked flood fill is still catching up -- let it finish first
    if (!undoStack.length) return;
    const patch = undoStack.pop();
    undoBytes -= patchBytes(patch);
    editCount = Math.max(0, editCount - 1);
    canvasContentGen++;
    try {
      ctx.putImageData(patch.before, patch.x, patch.y);
    } catch (err) {
      console.warn('Undo failed to apply (likely out of memory):', err);
    }
    redoStack.push(patch);
  }

  function redo() {
    if (fillPending) return; // a chunked flood fill is still catching up -- let it finish first
    if (!redoStack.length) return;
    const patch = redoStack.pop();
    canvasContentGen++;
    try {
      ctx.putImageData(patch.after, patch.x, patch.y);
    } catch (err) {
      console.warn('Redo failed to apply (likely out of memory):', err);
    }
    undoStack.push(patch);
    undoBytes += patchBytes(patch);
    editCount++;
  }

  function setColor(c) { color = c; }
  function setTool(t) { stopSprayLoop(); tool = t; }
  function setBrushSize(size) { brushSize = size; }
  function getCanvas() { return canvas; }
  function getTool() { return tool; }

  return {
    init, loadBlank, loadTemplate, loadSavedArtwork, clearToBlank, clearToTemplate,
    undo, redo, setColor, setTool, getTool, setBrushSize, getCanvas,
    zoomIn, zoomOut, resetZoom, isZoomedOrPanned, getZoomScale, isAtMinZoom, isAtMaxZoom, setOnZoomChange,
    setOnColorPicked,
    getEditCount: () => editCount,
    loadForAdmin, exportTransparentPng, setProtectInk, getProtectInk,
    stampShape,
    stampPolygon,
    extractLassoCutout,
    clearLassoRegion,
    stampImage,
    setBackgroundColor: (hex) => { backgroundColor = hex; },
    getBackgroundColor: () => backgroundColor,
    setStraightLineMode: (v) => { straightLineMode = v; },
    getStraightLineMode: () => straightLineMode,
    setRainbowMode: (v) => { rainbowMode = v; },
    getRainbowMode: () => rainbowMode,
    setPaintEffect: (v) => { paintEffect = v; },
    getPaintEffect: () => paintEffect,
    handleResize: fitCanvasToStage,
  };
})();
