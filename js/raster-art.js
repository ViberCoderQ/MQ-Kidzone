// Loads/caches the Coloring Book line-art PNGs and trims each one down to its actual ink
// bounding box. The source PNGs are 1024x1024 with the art itself only covering ~15-25% of
// that canvas, so without trimming the animal would render tiny in a sea of transparent
// padding -- both in the small picker thumbnails and on the full coloring canvas. Loaded once
// per src and cached for the life of the page (every screen that shows a given template reuses
// the same decoded image + bbox).
const RasterArt = (() => {
  const cache = new Map(); // src -> Promise<{ img, bbox }>
  const bustStamps = new Map(); // src -> timestamp, forces one fresh network fetch after invalidate

  function computeBBox(img) {
    const off = document.createElement('canvas');
    off.width = img.naturalWidth;
    off.height = img.naturalHeight;
    const octx = off.getContext('2d');
    octx.drawImage(img, 0, 0);
    // Reading pixels back out can throw ("tainted canvas") when the page is opened as a local
    // file (file://) instead of through a dev server -- Chromium treats that as cross-origin.
    // Falling back to the untrimmed full image still draws correctly (drawFitted only ever calls
    // drawImage, which isn't blocked), just without the nice auto-crop-to-content optimization.
    let data;
    try {
      ({ data } = octx.getImageData(0, 0, off.width, off.height));
    } catch (err) {
      console.warn('[RasterArt] could not inspect image pixels (likely opened via file:// instead of a server); skipping auto-crop:', err);
      return { x: 0, y: 0, w: off.width, h: off.height };
    }
    let minX = off.width, minY = off.height, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < off.height; y++) {
      const rowBase = y * off.width;
      for (let x = 0; x < off.width; x++) {
        if (data[(rowBase + x) * 4 + 3] > 10) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return { x: 0, y: 0, w: off.width, h: off.height };
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }

  function load(src) {
    if (!cache.has(src)) {
      // A src that was just invalidated gets one forced-fresh network fetch via a unique query
      // param -- the dev server's own HTTP caching headers are unknown/out of our control, and a
      // plain re-request of the exact same URL could still be satisfied from the browser's HTTP
      // cache even though this JS-level cache entry was dropped. Appending a value that changes
      // every time makes that impossible: it's a URL the browser has never seen before.
      const bust = bustStamps.get(src);
      const networkSrc = bust ? `${src}${src.includes('?') ? '&' : '?'}_b=${bust}` : src;
      const promise = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ img, bbox: computeBBox(img) });
        img.onerror = reject;
        img.src = networkSrc;
      });
      cache.set(src, promise);
    }
    return cache.get(src);
  }

  // Admin template editor: after overwriting a template's PNG on disk, its old decoded Image is
  // still sitting in this cache under the same src key -- without dropping it, every screen that
  // shows this template (category/template pickers, the coloring canvas itself) would keep
  // showing the pre-edit art for the rest of the session even though the file on disk changed.
  function invalidate(src) {
    cache.delete(src);
    bustStamps.set(src, Date.now());
  }

  // Draws the bbox-cropped art into destW x destH, scaled up (preserving aspect ratio) and
  // centered, with paddingFrac reserved as margin on the shorter dimension.
  function drawFitted(ctx, img, bbox, destW, destH, paddingFrac) {
    const pad = Math.min(destW, destH) * paddingFrac;
    const availW = Math.max(1, destW - pad * 2);
    const availH = Math.max(1, destH - pad * 2);
    let scale = Math.min(availW / bbox.w, availH / bbox.h);
    // Within a few percent of the picture's own size: draw it exactly 1:1 on whole pixels, so
    // the line art keeps every original pixel instead of being resampled (which blurs edges).
    if (Math.abs(scale - 1) < 0.04) scale = 1;
    const drawW = bbox.w * scale;
    const drawH = bbox.h * scale;
    const dx = Math.round((destW - drawW) / 2);
    const dy = Math.round((destH - drawH) / 2);
    ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, dx, dy, drawW, drawH);
  }

  return { load, drawFitted, invalidate };
})();
