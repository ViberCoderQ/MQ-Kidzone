// Catalog of stickers a kid can drop onto Free Draw: flat, vector-drawn silhouettes (not raster
// images) so they're crisp at any size and new ones are just more draw functions, no art assets
// to source. Every draw(ctx, s) function assumes ctx is already translated to the shape's center
// with no rotation, and draws roughly within a [-s/2, s/2] box -- the caller sets fillStyle (and
// strokeStyle, for the handful of shapes that stroke instead of fill) before calling, so the same
// function works for a small picker-tile preview and for the real stamped-black placement.

function starPath(ctx, outerR, innerR, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = Math.cos(angle) * r, y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const GEOMETRIC_SHAPES = [
  { id: 'circle', name: 'Circle', draw(ctx, s) { ctx.beginPath(); ctx.arc(0, 0, s / 2, 0, Math.PI * 2); ctx.fill(); } },
  { id: 'square', name: 'Square', draw(ctx, s) { ctx.fillRect(-s / 2, -s / 2, s, s); } },
  {
    id: 'triangle', name: 'Triangle', draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s / 2); ctx.lineTo(s / 2, s / 2); ctx.lineTo(-s / 2, s / 2);
      ctx.closePath(); ctx.fill();
    },
  },
  { id: 'star', name: 'Star', draw(ctx, s) { starPath(ctx, s / 2, s / 2 * 0.4, 5); ctx.fill(); } },
  {
    id: 'heart', name: 'Heart', draw(ctx, s) {
      const width = s * 0.9, height = s * 0.75;
      const y = -height / 2, top = height * 0.3;
      ctx.beginPath();
      ctx.moveTo(0, y + top);
      ctx.bezierCurveTo(0, y, -width / 2, y, -width / 2, y + top);
      ctx.bezierCurveTo(-width / 2, y + (height + top) / 2, 0, y + (height + top) / 2, 0, y + height);
      ctx.bezierCurveTo(0, y + (height + top) / 2, width / 2, y + (height + top) / 2, width / 2, y + top);
      ctx.bezierCurveTo(width / 2, y, 0, y, 0, y + top);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'diamond', name: 'Diamond', draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s / 2); ctx.lineTo(s * 0.35, 0); ctx.lineTo(0, s / 2); ctx.lineTo(-s * 0.35, 0);
      ctx.closePath(); ctx.fill();
    },
  },
  { id: 'oval', name: 'Oval', draw(ctx, s) { ctx.beginPath(); ctx.ellipse(0, 0, s / 2, s / 3, 0, 0, Math.PI * 2); ctx.fill(); } },
  {
    id: 'crescent', name: 'Moon', draw(ctx, s) {
      ctx.beginPath();
      ctx.arc(0, 0, s / 2, 0, Math.PI * 2);
      ctx.arc(s * 0.22, 0, s / 2 * 0.85, 0, Math.PI * 2, true);
      ctx.fill('evenodd');
    },
  },
  {
    id: 'arrow', name: 'Arrow', draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s / 2); ctx.lineTo(s * 0.3, -s * 0.1); ctx.lineTo(s * 0.12, -s * 0.1);
      ctx.lineTo(s * 0.12, s / 2); ctx.lineTo(-s * 0.12, s / 2); ctx.lineTo(-s * 0.12, -s * 0.1);
      ctx.lineTo(-s * 0.3, -s * 0.1);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'plus', name: 'Plus', draw(ctx, s) {
      ctx.fillRect(-s / 2, -s / 6, s, s / 3);
      ctx.fillRect(-s / 6, -s / 2, s / 3, s);
    },
  },
];

const LANDSCAPE_SHAPES = [
  {
    id: 'pine_tree', name: 'Pine Tree', draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(0, -s / 2);
      ctx.lineTo(s * 0.28, -s * 0.15); ctx.lineTo(s * 0.16, -s * 0.15);
      ctx.lineTo(s * 0.36, s * 0.1); ctx.lineTo(s * 0.2, s * 0.1);
      ctx.lineTo(s * 0.4, s * 0.32); ctx.lineTo(-s * 0.4, s * 0.32);
      ctx.lineTo(-s * 0.2, s * 0.1); ctx.lineTo(-s * 0.36, s * 0.1);
      ctx.lineTo(-s * 0.16, -s * 0.15); ctx.lineTo(-s * 0.28, -s * 0.15);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.06, s * 0.32, s * 0.12, s * 0.16);
    },
  },
  {
    id: 'round_tree', name: 'Tree', draw(ctx, s) {
      ctx.beginPath(); ctx.arc(0, -s * 0.08, s * 0.38, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(-s * 0.07, s * 0.1, s * 0.14, s * 0.35);
    },
  },
  {
    id: 'oak_tree', name: 'Oak Tree', draw(ctx, s) {
      // Each lobe is its own fill (not one combined path) -- combining overlapping arcs into a
      // single path lets the connecting line Canvas inserts between sub-paths self-intersect and
      // cut a notch out of the nonzero-winding fill; separate fills just double-paint, which is
      // invisible for a solid color.
      const lobes = [
        [-s * 0.18, -s * 0.05, s * 0.22],
        [s * 0.18, -s * 0.05, s * 0.22],
        [0, -s * 0.24, s * 0.25],
        [-s * 0.1, s * 0.12, s * 0.2],
        [s * 0.1, s * 0.12, s * 0.2],
      ];
      lobes.forEach(([x, y, r]) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      });
      ctx.fillRect(-s * 0.07, s * 0.2, s * 0.14, s * 0.3);
    },
  },
  {
    id: 'bare_tree', name: 'Winter Tree', draw(ctx, s) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = s * 0.06;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.48); ctx.lineTo(0, s * 0.05);
      ctx.stroke();
      ctx.lineWidth = s * 0.045;
      [
        [[0, s * 0.05], [-s * 0.28, -s * 0.15]],
        [[0, s * 0.05], [s * 0.25, -s * 0.1]],
        [[0, s * 0.05], [s * 0.05, -s * 0.22]],
      ].forEach(([from, to]) => {
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
      });
      ctx.lineWidth = s * 0.03;
      [
        [[-s * 0.28, -s * 0.15], [-s * 0.4, -s * 0.3]],
        [[-s * 0.28, -s * 0.15], [-s * 0.16, -s * 0.36]],
        [[s * 0.25, -s * 0.1], [s * 0.38, -s * 0.26]],
        [[s * 0.25, -s * 0.1], [s * 0.14, -s * 0.3]],
        [[s * 0.05, -s * 0.22], [s * 0.16, -s * 0.42]],
        [[s * 0.05, -s * 0.22], [-s * 0.08, -s * 0.4]],
      ].forEach(([from, to]) => {
        ctx.beginPath(); ctx.moveTo(from[0], from[1]); ctx.lineTo(to[0], to[1]); ctx.stroke();
      });
    },
  },
  {
    id: 'bush', name: 'Bush', draw(ctx, s) {
      ctx.beginPath();
      ctx.arc(-s * 0.22, s * 0.05, s * 0.28, 0, Math.PI * 2);
      ctx.arc(s * 0.22, s * 0.05, s * 0.28, 0, Math.PI * 2);
      ctx.arc(0, -s * 0.12, s * 0.3, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    id: 'flower', name: 'Flower', draw(ctx, s) {
      const petalR = s * 0.16, dist = s * 0.28;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI * 2 / 6) * i;
        ctx.moveTo(Math.cos(angle) * dist + petalR, Math.sin(angle) * dist);
        ctx.arc(Math.cos(angle) * dist, Math.sin(angle) * dist, petalR, 0, Math.PI * 2);
      }
      ctx.arc(0, 0, s * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(-s * 0.03, s * 0.15, s * 0.06, s * 0.35);
    },
  },
  {
    id: 'mountain', name: 'Mountain', draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(-s / 2, s / 2); ctx.lineTo(-s * 0.15, -s * 0.1); ctx.lineTo(s * 0.05, s * 0.1);
      ctx.lineTo(s * 0.25, -s / 2); ctx.lineTo(s / 2, s / 2);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'cloud', name: 'Cloud', draw(ctx, s) {
      ctx.beginPath();
      ctx.arc(-s * 0.22, s * 0.05, s * 0.22, 0, Math.PI * 2);
      ctx.arc(s * 0.05, -s * 0.08, s * 0.26, 0, Math.PI * 2);
      ctx.arc(s * 0.28, s * 0.05, s * 0.2, 0, Math.PI * 2);
      ctx.rect(-s * 0.4, s * 0.05, s * 0.8, s * 0.18);
      ctx.fill();
    },
  },
  {
    id: 'sun', name: 'Sun', draw(ctx, s) {
      ctx.beginPath(); ctx.arc(0, 0, s * 0.26, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((Math.PI * 2 / 8) * i);
        ctx.fillRect(-s * 0.025, -s * 0.48, s * 0.05, s * 0.16);
        ctx.restore();
      }
    },
  },
  {
    id: 'rainbow', name: 'Rainbow', draw(ctx, s) {
      ctx.beginPath();
      ctx.arc(0, s * 0.25, s * 0.48, Math.PI, 0);
      ctx.arc(0, s * 0.25, s * 0.3, 0, Math.PI, true);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'raindrop', name: 'Raindrop', draw(ctx, s) {
      const r = s * 0.25, cy = s * 0.1;
      ctx.beginPath();
      ctx.arc(0, cy, r, 0, Math.PI * 2);
      ctx.moveTo(0, -s * 0.5);
      ctx.lineTo(r * 0.8, cy * 0.3); ctx.lineTo(-r * 0.8, cy * 0.3);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'snowflake', name: 'Snowflake', draw(ctx, s) {
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((Math.PI / 3) * i);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(s * 0.04, s * 0.15); ctx.lineTo(0, s * 0.48); ctx.lineTo(-s * 0.04, s * 0.15);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, s * 0.22); ctx.lineTo(s * 0.12, s * 0.14); ctx.lineTo(s * 0.08, s * 0.2);
        ctx.lineTo(0, s * 0.28); ctx.lineTo(-s * 0.08, s * 0.2); ctx.lineTo(-s * 0.12, s * 0.14);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.06, 0, Math.PI * 2); ctx.fill();
    },
  },
  {
    id: 'lightning', name: 'Lightning', draw(ctx, s) {
      ctx.beginPath();
      ctx.moveTo(s * 0.1, -s * 0.5); ctx.lineTo(-s * 0.15, 0); ctx.lineTo(0, 0);
      ctx.lineTo(-s * 0.1, s * 0.5); ctx.lineTo(s * 0.2, -s * 0.05); ctx.lineTo(s * 0.02, -s * 0.05);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'house', name: 'House', draw(ctx, s) {
      ctx.fillRect(-s * 0.3, -s * 0.05, s * 0.6, s * 0.45);
      ctx.beginPath();
      ctx.moveTo(-s * 0.4, -s * 0.05); ctx.lineTo(0, -s * 0.45); ctx.lineTo(s * 0.4, -s * 0.05);
      ctx.closePath(); ctx.fill();
    },
  },
  {
    id: 'bird', name: 'Bird', draw(ctx, s) {
      const w = s * 0.44;
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-w, s * 0.05);
      ctx.quadraticCurveTo(-w * 0.35, -s * 0.42, 0, s * 0.05);
      ctx.quadraticCurveTo(w * 0.35, -s * 0.42, w, s * 0.05);
      ctx.stroke();
    },
  },
  {
    id: 'balloon', name: 'Balloon', draw(ctx, s) {
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.08, s * 0.28, s * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-s * 0.04, s * 0.24); ctx.lineTo(s * 0.04, s * 0.24); ctx.lineTo(0, s * 0.32);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(-s * 0.015, s * 0.32, s * 0.03, s * 0.18);
    },
  },
];

// Letters/numbers are just bold filled text -- using the platform font instead of hand-drawn
// paths for 62+ glyphs. Same silhouette guarantee (one solid filled shape) as everything else.
function drawGlyph(ctx, ch, s) {
  ctx.font = `800 ${Math.round(s * 0.85)}px 'Trebuchet MS', 'Segoe UI', Verdana, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, 0, s * 0.04);
}

const NUMBER_SHAPES = '0123456789'.split('').map((ch) => ({
  id: `num_${ch}`, name: ch, draw(ctx, s) { drawGlyph(ctx, ch, s); },
}));

const LETTER_SHAPES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  .flatMap((up) => [up, up.toLowerCase()])
  .map((ch) => ({
    id: `letter_${ch === ch.toUpperCase() ? 'u' : 'l'}${ch.toLowerCase()}`, name: ch,
    draw(ctx, s) { drawGlyph(ctx, ch, s); },
  }));

// Uploaded (raster) stickers, added through the in-app Sticker Editor -- see js/custom-stickers.js
// for the catalog data. Same draw(ctx, s) contract as every vector shape above: ctx is already
// translated + rotated to the sticker's center, so this just paints the image centered within
// roughly a size x size box, preserving its own aspect ratio. Images are loaded once and cached by
// src; until one finishes loading, draw() paints nothing for that frame -- since these are local
// files, in practice that's a one-frame flicker at most, never a lasting blank.
const _customStickerImages = new Map();
function makeImageSticker(id, name, src) {
  let img = _customStickerImages.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    _customStickerImages.set(src, img);
  }
  return {
    id, name, img, // img exposed so a one-shot picker-tile preview can redraw itself once loaded
    draw(ctx, s) {
      if (!img.complete || !img.naturalWidth) return;
      const ratio = img.naturalHeight / img.naturalWidth;
      const w = s, h = s * ratio;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
    },
  };
}
const CUSTOM_STICKER_ITEMS = (typeof CUSTOM_STICKERS !== 'undefined' ? CUSTOM_STICKERS : [])
  .map((item) => makeImageSticker(item.id, item.name, item.src));

// Built-in shapes an admin has deleted or replaced (via the Sticker Editor -- see
// js/custom-stickers.js) are filtered out here so they stop showing in Free Draw's picker, without
// needing to touch the hand-written shape catalogs above.
const _hiddenBuiltinIds = new Set(typeof HIDDEN_BUILTIN_STICKERS !== 'undefined' ? HIDDEN_BUILTIN_STICKERS : []);
function visibleBuiltins(list) {
  return _hiddenBuiltinIds.size ? list.filter((item) => !_hiddenBuiltinIds.has(item.id)) : list;
}

const STICKER_CATEGORIES = [
  { id: 'geometric', label: 'Geometric', items: visibleBuiltins(GEOMETRIC_SHAPES) },
  { id: 'landscape', label: 'Landscape', items: visibleBuiltins(LANDSCAPE_SHAPES) },
  { id: 'numbers', label: 'Numbers', items: visibleBuiltins(NUMBER_SHAPES) },
  { id: 'letters', label: 'Letters', items: visibleBuiltins(LETTER_SHAPES) },
  { id: 'custom', label: 'My Stickers', items: CUSTOM_STICKER_ITEMS },
];

function findSticker(id) {
  for (const cat of STICKER_CATEGORIES) {
    const item = cat.items.find((s) => s.id === id);
    if (item) return item;
  }
  return null;
}
