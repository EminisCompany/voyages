# Aetheryte Companion

Phone-first, installable (PWA) FFXIV companion. Lookup-first: every answer is built from live game data, shows its source and patch, and says "No verified answer" instead of guessing. No paid AI, no API keys, no accounts, nothing touches the game client. No Square Enix art or logos are used.

## Run
Static files, no build step: `python3 -m http.server` in this folder, or deploy the folder to GitHub Pages / Cloudflare Pages.
`node tools/build-patch-index.mjs` regenerates `data/patch-index.json` (patch numbers) from Teamcraft's open data.

## Data sources (credited in the Profile tab)
- XIVAPI v2: quests (incl. objective text), items, recipes, duties. CORS enabled.
- Universalis: live prices per world / data center. CORS enabled.
- FFXIV Teamcraft open data (MIT): "added in patch" numbers, shipped as a compact static file.

## Status (tested against live APIs from the sandbox, Chromium at 390px width)
Built and verified: search; quest / item / recipe / duty cards; market price card; spoiler setting (off/light/full); duty browser by level; planner (track quests, mark done, "what this unlocks", quests starting at your level); profile with job-colored accent; offline caching (service worker + local cache).

Not verified / not built:
- Lodestone import: Lodestone has no CORS, so a browser-only app needs a proxy. Job and level are entered by hand.
- Job guides and boss strategies: no reusable-license source verified, so none are included.
- Gather nodes, drops, vendors (Teamcraft): not wired in yet.
- Service worker/offline mode and "Add to Home Screen" were not exercised on a real phone.
- Quest "added in patch" depends on Teamcraft coverage; when missing, the card says so. Teamcraft's patch list lagged XIVAPI (7.57 vs 7.58) at time of writing.
- Quest step text is the in-game objective line; player-name placeholders are stripped by the data source.
- Native wrapper: not started.
