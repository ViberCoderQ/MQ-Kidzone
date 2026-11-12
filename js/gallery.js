// Per-profile saved artwork, stored in IndexedDB (the browser's built-in database). The old
// version kept these as PNG data URLs in localStorage, which caps out around 5MB -- a handful of
// drawings across three kids. IndexedDB holds far more, so pictures are now kept at a higher
// resolution too. Anything still sitting in the old localStorage keys is moved over once, on
// first run (see migrateLegacyGalleries).
//
// Every function here is async (returns a Promise).
const GALLERY_DB_NAME = 'family-app';
const GALLERY_DB_VERSION = 1;
const ARTWORK_STORE = 'artworks';

// Saved pictures keep every pixel of the canvas (lossless PNG, no shrinking). This is only a
// safety ceiling, above the largest canvas the coloring screen ever makes.
const MAX_SAVE_DIMENSION = 4096;

let galleryDbPromise = null;

function openGalleryDb() {
  if (galleryDbPromise) return galleryDbPromise;
  galleryDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(GALLERY_DB_NAME, GALLERY_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ARTWORK_STORE)) {
        const store = db.createObjectStore(ARTWORK_STORE, { keyPath: 'id' });
        store.createIndex('profileId', 'profileId', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { galleryDbPromise = null; reject(req.error); };
  });
  return galleryDbPromise;
}

function idbRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

// Newest first, matching the old gallery order.
async function loadGallery(profileId) {
  const db = await openGalleryDb();
  const store = db.transaction(ARTWORK_STORE, 'readonly').objectStore(ARTWORK_STORE);
  const list = await idbRequest(store.index('profileId').getAll(profileId));
  return list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}

async function getArtwork(artworkId) {
  const db = await openGalleryDb();
  const store = db.transaction(ARTWORK_STORE, 'readonly').objectStore(ARTWORK_STORE);
  return (await idbRequest(store.get(artworkId))) || null;
}

async function putArtwork(piece) {
  const db = await openGalleryDb();
  const tx = db.transaction(ARTWORK_STORE, 'readwrite');
  tx.objectStore(ARTWORK_STORE).put(piece);
  await txDone(tx);
}

async function deleteGalleryForProfile(profileId) {
  const db = await openGalleryDb();
  const tx = db.transaction(ARTWORK_STORE, 'readwrite');
  const store = tx.objectStore(ARTWORK_STORE);
  const keys = await idbRequest(store.index('profileId').getAllKeys(profileId));
  keys.forEach((k) => store.delete(k));
  await txDone(tx);
}

function canvasToStoredDataUrl(canvas) {
  const scale = Math.min(1, MAX_SAVE_DIMENSION / Math.max(canvas.width, canvas.height));
  if (scale >= 1) return canvas.toDataURL('image/png');
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale);
  out.height = Math.round(canvas.height * scale);
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

async function addArtworkToGallery(profileId, canvas, mode, templateId) {
  const piece = {
    id: `a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    profileId,
    dataUrl: canvasToStoredDataUrl(canvas),
    mode,
    // Lets "continue coloring" re-establish the original line-art protection from the pristine
    // template instead of guessing it from the (already-colored) saved pixels -- null for Free
    // Draw saves, which never have line-art to protect in the first place.
    templateId: templateId || null,
    createdAt: new Date().toISOString(),
  };
  await putArtwork(piece);
  return piece;
}

// Saving again after "Keep Coloring" on an existing piece updates it in place -- the kid asked
// to continue THIS picture, not to end up with an old half-finished copy next to the newer one.
async function updateArtworkInGallery(profileId, artworkId, canvas) {
  const piece = await getArtwork(artworkId);
  if (!piece || piece.profileId !== profileId) return null;
  piece.dataUrl = canvasToStoredDataUrl(canvas);
  piece.updatedAt = new Date().toISOString();
  await putArtwork(piece);
  return piece;
}

async function deleteArtworkFromGallery(profileId, artworkId) {
  const piece = await getArtwork(artworkId);
  if (!piece || piece.profileId !== profileId) return;
  const db = await openGalleryDb();
  const tx = db.transaction(ARTWORK_STORE, 'readwrite');
  tx.objectStore(ARTWORK_STORE).delete(artworkId);
  await txDone(tx);
}

// One-time move of drawings saved by the old localStorage version of the app. The old key is
// only removed after its pictures are safely written to IndexedDB.
async function migrateLegacyGalleries() {
  const prefix = 'coloring-app.gallery.';
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(prefix)) keys.push(k);
  }
  for (const key of keys) {
    const profileId = key.slice(prefix.length);
    const list = getData(key, []);
    if (Array.isArray(list) && list.length) {
      const db = await openGalleryDb();
      const tx = db.transaction(ARTWORK_STORE, 'readwrite');
      const store = tx.objectStore(ARTWORK_STORE);
      list.forEach((piece) => {
        if (piece && piece.id && piece.dataUrl) store.put({ ...piece, profileId });
      });
      await txDone(tx);
    }
    localStorage.removeItem(key);
  }
}

// Asks the browser not to clear this app's data when the device is low on space. iPads
// generally grant this for apps opened from the Home Screen.
async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (err) {
    console.warn('[Storage] persist request failed:', err);
  }
  return false;
}

const galleryReady = migrateLegacyGalleries().catch((err) => {
  console.error('[Gallery] moving old drawings into the new storage failed:', err);
});
