# Notes for AI coding assistants

Read `HANDOFF.md` first, then `docs/ARCHITECTURE.md` and `docs/DATA.md`.

## Ground rules
- **No build step, no frameworks, no npm runtime dependencies.** Plain ES2020 JavaScript in
  classic `<script>` tags. The family deploys by dragging the folder onto Netlify, so the folder
  must work as-is. Node is only for `serve.js` and the Playwright tests.
- **Shared global scope.** Every `js/*.js` file is a classic script. Mind name collisions and load
  order (`index.html`). Files after `app.js` reach app internals only through `window.AppBridge`.
- **Every change ships with:**
  - bumped `?v=NN` on the script and CSS tags in `index.html`
  - bumped `CACHE` in `sw.js`
  - new files added to `CORE` in `sw.js`

  Otherwise iPads keep running cached files.
- **Run the tests:** `node tests/run-all.js` (needs `npm install --no-save playwright` and
  `npx playwright install chromium`). The tests run against a temp copy of the app.

## Product rules
- **The kids can't read yet** (ages 4, 4 and 6):
  - Every kid-facing control needs a picture and a 🔊 `Voice.button(...)`.
  - Questions read themselves aloud via `Learning.autoSay` (respects the per-kid setting).
  - Kid UI is big, colorful and gentle. Wrong answers say "Try again!" and never punish.
- **Parents control coins:**
  - Chores pay only on parent Approve.
  - Store coins are set aside until parent Paid.
  - Everything earned respects the section and overall daily limits (`earnCoins`).
- **One iPad per kid; data stays on the device.**
  - Never put personal data or the PIN in `data/settings.json` (it's public on Netlify).
  - New device data must use a `family-app.` key so Backup includes it.
- **Setup and the photo editor run only on the central computer** (`window.showDirectoryPicker`).
  Keep them hidden on iPads.
- **Keep chore and store `id`s stable.** Kid history and requests keep copies of name, picture
  and price.
- **Avoid trademarked characters** in new built-in content. Use generic animals, soccer and
  football.

## Target platform
- iPad Safari, as a Home Screen web app. Test layouts at 1024×768 and 768×1024.
- No hover-only UI.
- Keep the coloring canvas within the pixel caps in `canvas-engine.js` (iOS canvas memory
  limits).
