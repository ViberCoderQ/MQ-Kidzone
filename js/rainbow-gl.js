// WebGL ribbon-mesh renderer for the Rainbow Trail paint effect, used by canvas-engine.js's
// non-textured brushes. Replaces the old CPU approach (restore a growing window from a snapshot,
// re-stroke every point in it, every single pointermove) with what it actually needed to be: one
// triangle-strip "ribbon" per stroke, each vertex carrying its own RGB, so the GPU's own
// rasterizer does the color interpolation and antialiasing instead of a hand-rolled per-segment
// gradient. Cost per redraw no longer grows with how many points the stroke has accumulated --
// one draw call, however long the strip is.
//
// Knows nothing about rainbow color math or canvas-pixel coordinate conversion -- the caller
// (canvas-engine.js) hands it points already in canvas-pixel space with an RGB triple (0..1)
// already resolved per point. Purely a colored-ribbon renderer.
const RainbowGL = (() => {
  let canvas = null;
  let gl = null;
  let program = null;
  let buffer = null;
  let posLoc, colorLoc, resLoc;
  let ready = false;

  const VERTEX_SRC = `
    attribute vec2 a_position;
    attribute vec3 a_color;
    uniform vec2 u_resolution;
    varying vec3 v_color;
    void main() {
      vec2 p = a_position / u_resolution * 2.0 - 1.0;
      gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
      v_color = a_color;
    }
  `;
  const FRAGMENT_SRC = `
    precision mediump float;
    varying vec3 v_color;
    void main() {
      gl_FragColor = vec4(v_color, 1.0);
    }
  `;

  function compile(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error(info);
    }
    return s;
  }

  // Safe to call more than once (every CanvasEngine.init()) -- only actually creates the GL
  // context and compiles shaders the first time; iOS Safari allows a limited number of live
  // WebGL contexts per page, so later calls just confirm it's already ready.
  function init(canvasEl) {
    if (ready && canvas === canvasEl) return true;
    canvas = canvasEl;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    } catch (err) {
      gl = null;
    }
    if (!gl) { ready = false; return false; }
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SRC));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      posLoc = gl.getAttribLocation(program, 'a_position');
      colorLoc = gl.getAttribLocation(program, 'a_color');
      resLoc = gl.getUniformLocation(program, 'u_resolution');
      buffer = gl.createBuffer();
    } catch (err) {
      console.warn('[RainbowGL] init failed:', err);
      ready = false;
      return false;
    }
    ready = true;
    return true;
  }

  function isReady() { return ready; }
  function getCanvas() { return canvas; }

  function resize(w, h) {
    if (!ready) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, w, h);
  }

  function pushVertex(out, x, y, rgb) {
    out.push(x, y, rgb[0], rgb[1], rgb[2]);
  }

  // A filled circle fan -- used for a stroke that hasn't moved yet, and shared by buildMesh for
  // the true start/end caps (as a half fan, see addCap).
  function addCircle(out, cx, cy, radius, rgb) {
    const steps = 24;
    for (let j = 0; j < steps; j++) {
      const a = (j * Math.PI * 2) / steps;
      const b = ((j + 1) * Math.PI * 2) / steps;
      pushVertex(out, cx, cy, rgb);
      pushVertex(out, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, rgb);
      pushVertex(out, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, rgb);
    }
  }

  // Half-disc fan bulging toward `angle`, centered at (cx,cy) -- rounds off a true stroke
  // endpoint the same way a round line cap would.
  function addCap(out, cx, cy, angle, radius, rgb) {
    const steps = 16;
    for (let j = 0; j < steps; j++) {
      const a = angle - Math.PI / 2 + (j * Math.PI) / steps;
      const b = angle - Math.PI / 2 + ((j + 1) * Math.PI) / steps;
      pushVertex(out, cx, cy, rgb);
      pushVertex(out, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, rgb);
      pushVertex(out, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, rgb);
    }
  }

  // points: [{x, y, r, g, b}, ...] already in canvas-pixel space, color already resolved per
  // point. Builds one left/right ribbon strip with mitered-ish per-point normals (averaged from
  // the segment before and after, same technique the prototype used) plus round caps at the two
  // true endpoints only -- never at the interior samples, which is what kept the old per-segment
  // round-capped stroke() calls looking beaded on a sharply curving path.
  function buildMesh(points, halfWidth) {
    const out = [];
    if (!points.length) return out;
    if (points.length === 1) {
      addCircle(out, points[0].x, points[0].y, halfWidth, [points[0].r, points[0].g, points[0].b]);
      return out;
    }
    const left = [], right = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      left.push({ x: points[i].x + nx * halfWidth, y: points[i].y + ny * halfWidth });
      right.push({ x: points[i].x - nx * halfWidth, y: points[i].y - ny * halfWidth });
    }
    for (let i = 1; i < points.length; i++) {
      const ca = [points[i - 1].r, points[i - 1].g, points[i - 1].b];
      const cb = [points[i].r, points[i].g, points[i].b];
      pushVertex(out, left[i - 1].x, left[i - 1].y, ca);
      pushVertex(out, right[i - 1].x, right[i - 1].y, ca);
      pushVertex(out, left[i].x, left[i].y, cb);
      pushVertex(out, right[i - 1].x, right[i - 1].y, ca);
      pushVertex(out, right[i].x, right[i].y, cb);
      pushVertex(out, left[i].x, left[i].y, cb);
    }
    const first = points[0], second = points[1];
    const startAngle = Math.atan2(first.y - second.y, first.x - second.x); // points away from the stroke
    addCap(out, first.x, first.y, startAngle, halfWidth, [first.r, first.g, first.b]);
    const last = points[points.length - 1], prev = points[points.length - 2];
    const endAngle = Math.atan2(last.y - prev.y, last.x - prev.x); // points away from the stroke, the other direction
    addCap(out, last.x, last.y, endAngle, halfWidth, [last.r, last.g, last.b]);
    return out;
  }

  function renderStroke(points, halfWidth) {
    if (!ready) return;
    gl.useProgram(program);
    // Vertex attrib array bindings are global GL context state, not per-program -- re-bind our
    // own buffer/pointers every call rather than relying on init()'s one-time setup, since the
    // effects program below (shared context) reconfigures the same attribute slots for its own
    // draws in between.
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(colorLoc);
    gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 20, 8);
    gl.disable(gl.BLEND); // one opaque mesh per stroke on a freshly-cleared transparent layer -- nothing to blend
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(resLoc, canvas.width, canvas.height);
    const data = buildMesh(points, halfWidth);
    if (!data.length) return;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
  }

  function clear() {
    if (!ready) return;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  // ---- Shader paint effects (Fire, Candy Stripe, Hollow Outline, Sparkle) ----
  // A second program on the SAME context/canvas (a canvas can only ever have one WebGL context --
  // this reuses the one `init` already created, never calls getContext again). Computes color
  // per-FRAGMENT instead of per-vertex: each vertex only carries how far along the stroke it is
  // (a_dist) and where it sits across the stroke's width (a_side, -1 left rail .. 0 centerline ..
  // 1 right rail), and the fragment shader derives each effect's pattern from those -- noise,
  // stripes, a discarded hollow center -- the same way the ported prototype did.
  let effectProgram = null;
  let effectBuffer = null;
  let effPosLoc, effDistLoc, effSideLoc, effResLoc, effEffectLoc, effWidthLoc, effColorLoc;
  let effectsReady = false;

  const EFFECT_VERTEX_SRC = `
    attribute vec2 a_pos;
    attribute float a_dist;
    attribute float a_side;
    uniform vec2 u_res;
    varying float v_dist;
    varying float v_side;
    void main() {
      vec2 p = a_pos / u_res * 2.0 - 1.0;
      gl_Position = vec4(p.x, -p.y, 0.0, 1.0);
      v_dist = a_dist;
      v_side = a_side;
    }
  `;
  // Effect ids: 0 = Fire, 1 = Candy Stripe, 2 = Hollow Outline, 3 = Rainbow Ribbon, 4 = Sparkle.
  const EFFECT_FRAGMENT_SRC = `
    precision highp float;
    varying float v_dist;
    varying float v_side;
    uniform float u_effect;
    uniform float u_width;
    uniform vec3 u_color;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 rainbow(float t) {
      float h = fract(t);
      vec3 k = abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0;
      return clamp(k, 0.0, 1.0);
    }
    void main() {
      float s = v_side, d = v_dist, edge = abs(s);
      vec3 col = vec3(1.0);
      if (u_effect < 0.5) {
        // Fire: red/orange edges, hot yellow core, gentle flicker along the stroke.
        float flicker = 0.5 + 0.5 * sin(d * 0.09 + s * 11.0);
        float heat = 1.0 - edge * 0.75 + 0.13 * flicker;
        col = mix(vec3(0.82, 0.08, 0.01), vec3(1.0, 0.53, 0.01), smoothstep(0.25, 0.8, heat));
        col = mix(col, vec3(1.0, 0.96, 0.16), smoothstep(0.78, 1.07, heat));
      } else if (u_effect < 1.5) {
        // Candy Stripe: diagonal red/white bands running the length of the stroke.
        float stripes = step(0.5, fract(d / 28.0 + s * 1.3));
        col = mix(vec3(1.0, 0.98, 0.94), vec3(1.0, 0.17, 0.36), stripes);
      } else if (u_effect < 2.5) {
        // Hollow Outline: colored border only -- genuinely transparent center, so whatever's
        // already on the canvas (or crossed earlier in this same stroke) stays visible through it.
        float border = 0.23;
        if (edge < 1.0 - border) discard;
        col = u_color;
      } else if (u_effect < 3.5) {
        // Rainbow Ribbon: seven fixed parallel colored lanes running the whole length of the
        // stroke -- unlike Rainbow (which cycles ONE color by distance traveled), every lane
        // keeps its own fixed hue the entire stroke; only which lane you're looking at changes,
        // across the stroke's width.
        float lane = floor((s + 1.0) * 3.5);
        col = rainbow((6.0 - clamp(lane, 0.0, 6.0)) / 7.0);
      } else {
        // Sparkle: u_color paint with dense stable glitter flecks, anchored to stroke distance/
        // width so the pattern doesn't shimmer or re-roll as the mesh redraws every frame.
        vec2 uv = vec2(d / 5.0, (s + 1.0) * u_width / 5.0);
        vec2 cell = floor(uv), f = fract(uv) - 0.5;
        float h = hash(cell);
        float r = length(f - vec2(hash(cell + 3.1) - 0.5, hash(cell + 7.7) - 0.5) * 0.36);
        float sparkle = 1.0 - smoothstep(0.06, 0.22, r);
        float bright = step(0.73, h) * sparkle;
        float dark = step(0.35, h) * step(h, 0.55) * sparkle;
        col = mix(u_color * 0.77, u_color * 1.08, 0.5 + 0.5 * sin(d * 0.21 + s * 13.0));
        col = mix(col, vec3(1.0, 0.98, 0.93), bright * 0.97);
        col = mix(col, u_color * 0.35, dark * 0.7);
        vec2 big = vec2(d / 25.0, (s + 1.0) * u_width / 25.0);
        vec2 bc = floor(big), bp = fract(big) - 0.5;
        float starSeed = hash(bc + 19.0);
        vec2 center = vec2(hash(bc + 2.0) - 0.5, hash(bc + 4.0) - 0.5) * 0.6;
        vec2 v = abs(bp - center);
        float sparkleCross = min(v.x * 0.55 + v.y * 2.8, v.y * 0.55 + v.x * 2.8);
        float star = (1.0 - smoothstep(0.025, 0.095, sparkleCross)) * step(0.76, starSeed);
        col = mix(col, vec3(1.0, 1.0, 0.94), star * 0.95);
        col = clamp(col, 0.0, 1.0);
      }
      // Every rasterized fragment here is fully opaque -- Hollow Outline's hollow center and its
      // ring's own true edges are handled entirely by discard above (a fragment that's discarded
      // is never written at all, not blended), the same way Rainbow Trail's own shader works.
      // An earlier version faded alpha smoothly near edge=1.0 for softer silhouettes, relying on
      // the browser to correctly composite a premultipliedAlpha WebGL canvas with partial-alpha
      // edge pixels into the 2D canvas via drawImage -- that compositing path is a known source of
      // cross-browser/GPU inconsistency, and is what caused painted strokes to render partially
      // transparent and show whatever was underneath instead of replacing it. Letting hardware MSAA
      // (antialias: true) be the only source of edge softening, same as Rainbow Trail already does
      // successfully, avoids relying on that path at all.
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  // Lazily compiles the effects program the first time any of the 4 new effects is actually
  // used -- most sessions never touch them, so there's no reason to pay for a second shader
  // compile on every canvas screen open.
  function initEffects() {
    if (effectsReady) return true;
    if (!ready) return false;
    try {
      effectProgram = gl.createProgram();
      gl.attachShader(effectProgram, compile(gl.VERTEX_SHADER, EFFECT_VERTEX_SRC));
      gl.attachShader(effectProgram, compile(gl.FRAGMENT_SHADER, EFFECT_FRAGMENT_SRC));
      gl.linkProgram(effectProgram);
      if (!gl.getProgramParameter(effectProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(effectProgram));
      effPosLoc = gl.getAttribLocation(effectProgram, 'a_pos');
      effDistLoc = gl.getAttribLocation(effectProgram, 'a_dist');
      effSideLoc = gl.getAttribLocation(effectProgram, 'a_side');
      effResLoc = gl.getUniformLocation(effectProgram, 'u_res');
      effEffectLoc = gl.getUniformLocation(effectProgram, 'u_effect');
      effWidthLoc = gl.getUniformLocation(effectProgram, 'u_width');
      effColorLoc = gl.getUniformLocation(effectProgram, 'u_color');
      effectBuffer = gl.createBuffer();
    } catch (err) {
      console.warn('[RainbowGL] initEffects failed:', err);
      effectsReady = false;
      return false;
    }
    effectsReady = true;
    return true;
  }

  function effectsAreReady() { return effectsReady; }

  function pushEffectVertex(out, x, y, dist, side) {
    out.push(x, y, dist, side);
  }

  // Same left/right-rail ribbon technique as buildMesh above, but each vertex carries
  // (distance-along-stroke, side-across-stroke) instead of a resolved color -- the fragment
  // shader above turns that into Fire/Candy Stripe/Hollow Outline/Sparkle per pixel.
  function buildEffectMesh(points, halfWidth) {
    const out = [];
    if (!points.length) return out;
    if (points.length === 1) {
      // A tap with no movement -- the ported prototype draws nothing at all here, but Rainbow
      // Trail's own single-point case draws a dot, so match that instead for a consistent tap
      // response: a small fan with side 0 (center) .. 1 (rim), same distance throughout.
      const p = points[0];
      const steps = 24;
      for (let j = 0; j < steps; j++) {
        const a = (j * Math.PI * 2) / steps, b = ((j + 1) * Math.PI * 2) / steps;
        pushEffectVertex(out, p.x, p.y, p.distance, 0);
        pushEffectVertex(out, p.x + Math.cos(a) * halfWidth, p.y + Math.sin(a) * halfWidth, p.distance, 1);
        pushEffectVertex(out, p.x + Math.cos(b) * halfWidth, p.y + Math.sin(b) * halfWidth, p.distance, 1);
      }
      return out;
    }
    const left = [], right = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(points.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      left.push({ x: points[i].x + nx * halfWidth, y: points[i].y + ny * halfWidth });
      right.push({ x: points[i].x - nx * halfWidth, y: points[i].y - ny * halfWidth });
    }
    for (let i = 1; i < points.length; i++) {
      const da = points[i - 1].distance, db = points[i].distance;
      pushEffectVertex(out, left[i - 1].x, left[i - 1].y, da, -1);
      pushEffectVertex(out, right[i - 1].x, right[i - 1].y, da, 1);
      pushEffectVertex(out, left[i].x, left[i].y, db, -1);
      pushEffectVertex(out, right[i - 1].x, right[i - 1].y, da, 1);
      pushEffectVertex(out, right[i].x, right[i].y, db, 1);
      pushEffectVertex(out, left[i].x, left[i].y, db, -1);
    }
    const first = points[0], second = points[1];
    const startAngle = Math.atan2(first.y - second.y, first.x - second.x);
    addEffectCap(out, first.x, first.y, first.distance, startAngle, halfWidth);
    const last = points[points.length - 1], prev = points[points.length - 2];
    const endAngle = Math.atan2(last.y - prev.y, last.x - prev.x);
    addEffectCap(out, last.x, last.y, last.distance, endAngle, halfWidth);
    return out;
  }

  function addEffectCap(out, cx, cy, dist, angle, radius) {
    const steps = 16;
    for (let j = 0; j < steps; j++) {
      const t0 = -Math.PI / 2 + (j * Math.PI) / steps;
      const t1 = -Math.PI / 2 + ((j + 1) * Math.PI) / steps;
      const a0 = angle + t0, a1 = angle + t1;
      pushEffectVertex(out, cx, cy, dist, 0);
      pushEffectVertex(out, cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius, dist, Math.sin(t0));
      pushEffectVertex(out, cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius, dist, Math.sin(t1));
    }
  }

  // points: [{x, y, distance}, ...] in canvas-pixel space. effectId: 0=Fire, 1=Candy Stripe,
  // 2=Hollow Outline, 3=Rainbow Ribbon, 4=Sparkle. colorRgb: [r,g,b] 0..1, only used by Hollow
  // Outline/Sparkle.
  function renderEffectStroke(points, halfWidth, effectId, colorRgb) {
    if (!effectsReady) return;
    gl.useProgram(effectProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, effectBuffer);
    gl.enableVertexAttribArray(effPosLoc);
    gl.vertexAttribPointer(effPosLoc, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(effDistLoc);
    gl.vertexAttribPointer(effDistLoc, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(effSideLoc);
    gl.vertexAttribPointer(effSideLoc, 1, gl.FLOAT, false, 16, 12);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    // Every rasterized fragment is fully opaque (see the shader) -- Hollow Outline's hollow center
    // is a discard, not a blended see-through fill, so no blending is needed here at all, same as
    // Rainbow Trail's own renderStroke().
    gl.disable(gl.BLEND);
    gl.uniform2f(effResLoc, canvas.width, canvas.height);
    gl.uniform1f(effEffectLoc, effectId);
    gl.uniform1f(effWidthLoc, halfWidth * 2);
    gl.uniform3f(effColorLoc, colorRgb[0], colorRgb[1], colorRgb[2]);
    const data = buildEffectMesh(points, halfWidth);
    if (!data.length) return;
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 4);
    // No need to restore BLEND/buffer state here -- renderStroke() above always re-binds and
    // re-configures everything it needs itself before drawing, rather than assuming leftover state.
  }

  return { init, isReady, getCanvas, resize, renderStroke, clear, initEffects, effectsAreReady, renderEffectStroke };
})();
