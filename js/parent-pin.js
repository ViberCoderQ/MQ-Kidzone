// The parent PIN. Only a hash of it is stored, on this device only (never in the files that go
// to Netlify, where anyone could read them).
const PIN_HASH_KEY = 'family-app.parent-pin-hash';
const PIN_LENGTH = 4;

async function hashPin(pin) {
  const text = `family-app-pin:${pin}`;
  if (window.crypto && crypto.subtle) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for the rare browser without crypto.subtle (it needs https or localhost).
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return `djb2-${h.toString(16)}`;
}

function hasParentPin() {
  return !!getData(PIN_HASH_KEY, null);
}

async function setParentPin(pin) {
  setData(PIN_HASH_KEY, await hashPin(pin));
}

async function checkParentPin(pin) {
  const stored = getData(PIN_HASH_KEY, null);
  return !!stored && stored === (await hashPin(pin));
}
