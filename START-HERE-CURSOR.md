# Start here (Cursor)

This folder is the complete, working app: every line of code, the coloring pages, icons, settings, docs and tests.

1. In Cursor: **File → Open Folder** and pick this folder (`kid-zone-app`).
2. Paste this into Cursor's chat:

```
This is "Learn & Play", a learning + rewards web app for my three boys (ages 6, 4 and 4) that runs on their iPads. The full source code is in this folder. Before changing anything, read HANDOFF.md, AGENTS.md, docs/ARCHITECTURE.md, docs/DATA.md and docs/HOW-TO.md, then look through index.html and the js/ folder. Follow the rules in AGENTS.md (plain HTML/CSS/JS, no build step, bump the ?v= numbers and the sw.js CACHE on every change, every kid-facing button needs a picture and a voice button).

When you're done reading, give me a short summary of how the app is organized and what's still open, then wait for my first request. After any change, run the tests with: node tests/run-all.js
```

3. To try the app on a computer: double-click `Launch Kid Zone.bat` (needs Node.js), or run `node serve.js` and open http://localhost:8793.
4. To publish: drag this folder onto Netlify, the same as always.

## What's where

| Path | What it is |
| --- | --- |
| `index.html` | Every screen of the app |
| `style.css` | All the styling |
| `js/` | All the app code (21 files, see docs/ARCHITECTURE.md) |
| `data/settings.json` | Chores, store items, coin rules (edited with Setup in the app) |
| `assets/templates/` | The coloring pages |
| `sw.js`, `manifest.json`, `icons/` | iPad Home Screen install and offline support |
| `HANDOFF.md`, `AGENTS.md`, `docs/` | The handoff docs |
| `tests/` | Automated browser tests |
