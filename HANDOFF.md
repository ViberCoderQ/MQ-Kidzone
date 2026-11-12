# Learn & Play: handoff

A learning and rewards app for three boys (K, 6, first grade; twins F and J, 4). It runs as a
Home Screen web app on each boy's own iPad. The boys earn coins from coloring, chores, math and
reading, and spend them in a store their parents run. "Learn & Play" is a placeholder name.

This file is the starting point. The details are in:

| File | What's in it |
| --- | --- |
| `docs/ARCHITECTURE.md` | How the code is organized, every file, the screen flow, and the shared engines |
| `docs/DATA.md` | Everything stored on a device, every storage key, and the `data/settings.json` format |
| `docs/HOW-TO.md` | Step-by-step recipes for common changes (new level, new game, new section, etc.) |
| `AGENTS.md` | Rules for an AI coding assistant working in this repo (also in `.cursor/rules/`) |
| `tests/README.md` | How to run the browser tests |

## What the app does

**Kids (each on his own iPad)**
- **Sign-in:** an ABC-order keyboard where he types his name. Letters speak themselves, and a
  "spelling helper" makes the next letter of his name glow.
- **Home:** five picture tiles (Coloring, Chores, Math, Reading, Store), his coin counter, and a
  savings-goal bar. Every button has a 🔊 read-aloud button, because none of the boys can read yet.
- **Coloring:** the original coloring app (Free Draw, Coloring Book, My Gallery). A saved picture
  earns coins.
- **Chores:** today's chores for him. He taps Done, and a parent approves before coins are paid.
- **Math / Reading:** Practice plus games, at a level a parent sets for each boy.
  - Math: Practice, Memory Match, War, Hidden Pictures (levels 1 to 7).
  - Reading: Practice, Memory Match with a word step, Letter Snap, Hidden Pictures, Mystery Animal
    (a gentle hangman) (levels 1 to 6).
- **Store:** he buys rewards, and the coins are set aside until a parent marks the purchase
  Paid. He can pin one item as a savings goal.

**Parents**
- **Grown-ups area on each iPad** (behind a 4-digit PIN):
  - Approve chores, and mark purchases Paid or Declined.
  - Add or remove kids, add or take away coins, set each boy's levels, and turn the spelling
    helper and read-aloud on or off.
  - Back up and restore the device, check for setup updates, and change the PIN.
- **Setup on the central computer:** edit chores, store items, pictures, coin rules and the boys'
  names. "Save for Netlify" writes `data/settings.json` into the project folder.
- **Photo editor on the central computer:** turns a photo into a coloring page, or touches up an
  existing one. It writes into `assets/templates/` and `js/templates.js`.

## How it runs and deploys

- **No build step.** The app is plain HTML, CSS and JavaScript, loaded as classic `<script>`
  tags. There's no framework, bundler or npm dependency to run it.
- **Deploy:** the family drags the whole app folder onto Netlify (manual drag-and-drop deploy).
  There's no Git-based deploy and no server code.
- **Local use on the central computer:** run `Launch Coloring App.bat` (Windows). It starts
  `serve.js`, a tiny Node static server on http://localhost:8791, and opens the browser. The photo
  editor and Setup need Chrome or Edge, because they use the File System Access API to write into
  the project folder.
- **iPads:** open the Netlify URL in Safari, then use Share → Add to Home Screen. Always launch
  from that icon. A service worker (`sw.js`) caches files network-first, so the app works offline.

## Where data lives

- **Shared setup** (chores, store, coin rules, names): `data/settings.json`, deployed with the
  site. Every iPad fetches it when the app opens and keeps a copy for offline use.
- **Everything else** lives only on each iPad, in localStorage plus IndexedDB for drawings:
  - kids, coins and their history
  - approvals and purchases
  - levels and scores
  - the PIN hash

  Nothing goes to a server. Backup and Restore (grown-ups area) moves it all as one .json file.
- The Netlify site is public to anyone with the link, including `data/settings.json` and uploaded
  pictures. The PIN is never put there.

See `docs/DATA.md`.

## Status

Done (phases 1–7 of the original plan):
1. App shell, read-aloud, parent PIN, IndexedDB gallery, Home Screen install, offline support.
2. ABC-keyboard sign-in, coins and history, coloring coins with a daily limit.
3. Setup on the computer and the shared settings file.
4. Chores, parent approvals, store, Paid/Decline, savings goal.
5. Math (Practice, Memory Match, War, Hidden Pictures).
6. Reading (Practice, Memory Match plus word step, Letter Snap, Hidden Pictures, Mystery Animal).
7. Backup and Restore. Also: first-run setup flow, and full-resolution coloring and photo-editor
   saves.

Not done or open:
- **App name and icon.** The family hasn't picked a name; ideas are in the plan doc. Change it in
  `js/config.js` (`APP_NAME`), `manifest.json`, the `<title>` and `apple-mobile-web-app-title` in
  `index.html`, and `icons/`.
- **Testing on a real iPad.** All testing so far ran in desktop Chromium at iPad screen sizes.
  Things to check on hardware:
  - Safari speech voices
  - the Share sheet for backups
  - Add to Home Screen behavior
  - bucket-fill speed on full-resolution coloring pages
  - memory use on older iPads

## Known limitations

- **Letter sounds** (Reading level 2) use the built-in speech voice ("buh", "mmm") and can sound
  off. Recorded audio clips would be better.
- **Pictures are emoji,** so they look different per device. Hidden Pictures "scenes" are emoji
  scattered over a faint coloring page, not hand-drawn scenes.
- **One device per boy, no sync.** Parents approve on each boy's iPad, and settings travel only
  through Netlify deploys. Parent phones would need a backend (e.g. Supabase or Firebase, or
  Netlify functions with a database).
- **The PIN is a child gate, not real security.** It's a 4-digit SHA-256 hash in localStorage.
- **The photo editor patches `js/templates.js` with regexes.** It keeps a `templates.js.bak`
  backup first.
- `js/templates.js` includes a "Pikachu" coloring page (a trademarked character) the family added
  themselves. It's fine for private use, but don't ship it more widely.

## Version 2 ideas (agreed with the family, not started)

- Tracing numbers and letters with the coloring brush.
- More games: Soccer Shootout, Touchdown Drive, Critter Count, More or Less, Letter Balloons,
  Sound Match, Sight Word Goal, Word Builder.
- Story Time: read-aloud picture stories with word highlighting.
- Themed worlds with an animal guide, and swipe-through game menus (the boys like Kiddopia).
- Jigsaw puzzles made from the boys' own coloring pages.
- A pet to care for, with treats bought with coins.
- Sorting games.
- Parent phones / multi-device sync (needs a backend, see above).
- Recorded letter sounds; hand-drawn Hidden Pictures scenes.
