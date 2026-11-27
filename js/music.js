// Music (Beta 1): opens the Music Room / Piano / Drums / Recording Studio package (music/*.html)
// in an iframe. Those files are self-contained (own CSS/JS/embedded assets) and reach back into
// this app directly -- top.getActiveProfile() for identity, top.AppBridge.openPinPad() to gate
// Studio's parent settings -- since the iframe is same-origin, not srcdoc. This module only owns
// getting in and out of that iframe from Home; everything else lives in music/*.html.
(() => {
  const frame = document.getElementById('music-frame');
  let loaded = false;

  function open() {
    if (!loaded) {
      frame.src = 'music/index.html';
      loaded = true;
    }
    AppBridge.showScreen('music-screen');
  }

  document.getElementById('kz-music-home').addEventListener('click', () => AppBridge.enterHome());

  window.Music = { open };
})();
