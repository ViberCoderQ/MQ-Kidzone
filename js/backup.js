// Backup and Restore for one device. A backup is one .json file holding everything this app
// keeps on the iPad: kids, coins and their history, chores done, store requests, savings goals,
// levels and scores, the parent PIN (as its hash) and every saved drawing. Restoring replaces
// what's on the device with the file's contents -- on the same iPad or a new one.
const Backup = (() => {
  const FORMAT = 'learn-and-play-backup';
  const PREFIXES = ['coloring-app.', 'family-app.'];
  const LAST_KEY = 'family-app.last-backup';

  function ourKeys() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    return keys;
  }

  async function allArtworks() {
    const db = await openGalleryDb();
    const store = db.transaction(ARTWORK_STORE, 'readonly').objectStore(ARTWORK_STORE);
    return idbRequest(store.getAll());
  }

  async function build() {
    await galleryReady;
    const data = {};
    ourKeys().forEach((k) => { data[k] = localStorage.getItem(k); });
    const artworks = await allArtworks();
    return {
      format: FORMAT,
      version: 1,
      createdAt: new Date().toISOString(),
      kids: loadProfiles().map((p) => p.name),
      localStorage: data,
      artworks,
    };
  }

  function fileName() {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const who = loadProfiles().map((p) => nameLetters(p.name)).join('-') || 'device';
    return `learn-and-play-backup-${who}-${stamp}.json`;
  }

  // Saves the backup file. On an iPad this opens the Share sheet (Save to Files, AirDrop,
  // iCloud Drive...); elsewhere it downloads the file. Returns 'shared', 'downloaded' or 'cancelled'.
  async function save() {
    const backup = await build();
    const json = JSON.stringify(backup);
    const name = fileName();
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Learn & Play backup' });
        markSaved();
        return { result: 'shared', bytes: json.length, drawings: backup.artworks.length };
      } catch (err) {
        if (err && err.name === 'AbortError') return { result: 'cancelled' };
        console.warn('[Backup] share failed, downloading instead:', err);
      }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    markSaved();
    return { result: 'downloaded', bytes: json.length, drawings: backup.artworks.length };
  }

  function markSaved() {
    setData(LAST_KEY, new Date().toISOString());
  }

  function lastBackupAt() {
    return getData(LAST_KEY, null);
  }

  // Reads and checks a backup file without changing anything. Throws a friendly Error if it's not one.
  async function read(file) {
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (err) {
      throw new Error("That file isn't a Learn & Play backup (it couldn't be read).");
    }
    if (!parsed || parsed.format !== FORMAT || typeof parsed.localStorage !== 'object' || !Array.isArray(parsed.artworks)) {
      throw new Error("That file isn't a Learn & Play backup.");
    }
    return parsed;
  }

  // Replaces everything on this device with the backup, then reloads the app.
  async function restore(backup) {
    // Drawings first: if this fails, nothing else has been touched yet.
    const db = await openGalleryDb();
    const tx = db.transaction(ARTWORK_STORE, 'readwrite');
    const store = tx.objectStore(ARTWORK_STORE);
    store.clear();
    backup.artworks.forEach((a) => { if (a && a.id && a.dataUrl) store.put(a); });
    await txDone(tx);

    ourKeys().forEach((k) => localStorage.removeItem(k));
    Object.entries(backup.localStorage).forEach(([k, v]) => {
      if (PREFIXES.some((p) => k.startsWith(p)) && typeof v === 'string') localStorage.setItem(k, v);
    });
    markSaved(); // what's on the device now matches a backup file
    localStorage.removeItem('coloring-app.active-profile-id'); // start at the sign-in screen
  }

  return { save, read, restore, lastBackupAt };
})();
