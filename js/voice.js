// Read-aloud for kids who can't read yet. Uses the device's built-in voice (speechSynthesis),
// which works offline on iPads. iPads only allow speech to start from a tap, which is always the
// case here since every call comes from a button press.
const Voice = (() => {
  const PREFERRED = ['Samantha', 'Karen', 'Moira', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira'];
  let chosen = null;

  function pickVoice() {
    if (!('speechSynthesis' in window)) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices.length) return null;
    for (const name of PREFERRED) {
      const v = voices.find((x) => x.name.startsWith(name));
      if (v) return v;
    }
    return voices.find((v) => /^en[-_]US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || null;
  }

  if ('speechSynthesis' in window) {
    chosen = pickVoice();
    speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', () => { chosen = pickVoice(); });
  }

  function speak(text) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel(); // a new tap interrupts whatever was being said
    const u = new SpeechSynthesisUtterance(text);
    if (!chosen) chosen = pickVoice();
    if (chosen) u.voice = chosen;
    u.lang = (chosen && chosen.lang) || 'en-US';
    u.rate = 0.9; // a little slower for little ears
    u.pitch = 1.05;
    speechSynthesis.speak(u);
  }

  // A small 🔊 button that says `text` when tapped. It stops the tap from also pressing the
  // card it sits on.
  function button(text, extraClass) {
    const btn = document.createElement('span');
    btn.className = 'voice-btn' + (extraClass ? ` ${extraClass}` : '');
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', `Say "${text}"`);
    btn.textContent = '🔊';
    const say = (e) => {
      e.preventDefault();
      e.stopPropagation();
      speak(text);
      btn.classList.remove('speaking');
      void btn.offsetWidth; // restart the pulse animation
      btn.classList.add('speaking');
    };
    btn.addEventListener('click', say);
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    return btn;
  }

  return { speak, button, isAvailable: () => 'speechSynthesis' in window };
})();
