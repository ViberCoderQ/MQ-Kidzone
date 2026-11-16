/* Bind the existing Kid Zone home-screen buttons to the exact hit areas measured off
   icons/home-background.png (1670 x 941). Does NOT add a new navigation system: app.js
   still owns every click handler, config.js still owns the SECTIONS list -- this only
   moves the existing #section-grid buttons to sit on top of the matching artwork. */
(() => {
  const W = 1670, H = 941;
  const rects = {
    games: [47, 419, 257, 221], coloring: [310, 419, 256, 221],
    reading: [572, 419, 253, 221], math: [832, 419, 254, 221],
    puzzles: [1090, 419, 254, 221], music: [1350, 419, 255, 221],
    chores: [196, 700, 612, 140], store: [830, 700, 621, 140],
  };
  const labels = {
    games: 'Games', coloring: 'Coloring', reading: 'Reading', math: 'Math',
    puzzles: 'Puzzles', music: 'Music', chores: 'My Chores', store: 'Rewards Store',
  };

  const home = document.getElementById('home-screen');
  const grid = document.getElementById('section-grid');
  if (!home || !grid) return;
  home.classList.add('kz-art-home');

  const apply = () => {
    for (const btn of grid.querySelectorAll('button[data-section]')) {
      const id = btn.dataset.section;
      const r = rects[id];
      if (!r) continue;
      const [x, y, w, h] = r;
      Object.assign(btn.style, {
        left: (x / W * 100) + '%', top: (y / H * 100) + '%',
        width: (w / W * 100) + '%', height: (h / H * 100) + '%',
      });
      const label = labels[id] || id;
      btn.setAttribute('aria-label', label);
      btn.title = label;
    }
  };

  // renderSectionGrid() (js/app.js) clears and rebuilds these buttons every time the kid
  // enters the home screen, so re-apply positions whenever that happens.
  new MutationObserver(apply).observe(grid, { childList: true });
  apply();
})();
