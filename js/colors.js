// Generates a light-to-dark shade ramp for a palette color (hue + saturation held fixed,
// lightness swept across the range) so picking a base swatch can offer finer-grained variants
// without needing a full color picker.

function hexToRgbTriple(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hue2rgbChannel(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgbChannel(p, q, h + 1 / 3);
    g = hue2rgbChannel(p, q, h);
    b = hue2rgbChannel(p, q, h - 1 / 3);
  }
  const toHex = (x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Sweeps lightness from a light tint down to a dark shade, keeping the base color's hue/
// saturation -- fixed endpoints regardless of the base color's own lightness, so black and
// white still produce a sensible grayscale ramp instead of a degenerate one.
// range optionally narrows/shifts the default 92-8 sweep -- used so hue-sharing pairs (Red/Pink,
// Orange/Brown, Black/Gray/White) each own a distinct lightness band instead of their shade
// ramps bleeding into each other.
function generateShades(baseHex, count, range) {
  const [r, g, b] = hexToRgbTriple(baseHex);
  const [h, s] = rgbToHsl(r, g, b);
  const lightest = (range && range.lightest) ?? 92;
  const darkest = (range && range.darkest) ?? 8;
  const shades = [];
  for (let i = 0; i < count; i++) {
    const l = lightest - (i * (lightest - darkest)) / (count - 1);
    shades.push(hslToHex(h, s, l));
  }
  return shades;
}
