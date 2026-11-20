# Couchcade: notes for Claude

Living-room party game platform. A browser on whatever computer is connected to the TV shows the game; phones on the same network are the controllers, joining by QR code. Anyone can run it on their own network: a download from GitHub Releases (macOS .app, Windows .exe, Linux binary), `npx couchcade`, from source, or Docker. There is no internet play and no account.

## Principles

- **Runs anywhere.** Couchcade must run on any OS with only a browser and one command or a download; never assume a particular host machine, interface name, or install path. Packaged apps have no folder of their own: pages come from `node:sea` assets and logs go to the OS log folder (`server/runtime.js`, `server/log.js`), so anything new that reads or writes files must handle that too. The QR address comes from `server/address.js`, never from a hard-coded interface.
- **Many games, one platform.** Every game plugs into the same lobby → playing → results flow (`server/session.js`). Games never handle joining, hosting or reconnects.
- **The server is authoritative.** Game rules run only in `server/games/<id>.js`. TV renderers (`public/tv/games/<id>.js`) only draw snapshots. Phones only send `{x, y, a, b}` input.
- **No build step for development.** Use plain ES modules, Node 20+, and only the `ws` and `qrcode` runtime dependencies, so running from source is `npm install` and `npm run dev`. The release build (`scripts/build-release.mjs`: esbuild plus Node's single executable applications) is the only build step; source must never depend on it, and esbuild stays a devDependency used only there. Ask before adding a framework, bundler or runtime dependency.
- **Sound lives on the TV.** `public/tv/audio.js` synthesizes effects (Web Audio) and narrates with speech synthesis; no audio files. Renderers react to state changes in `onSnapshot(prev, cur, audio)`. If a sound needs an event the snapshot doesn't show (like a collision), add it to the snapshot (see `fx` in Bumper Arena).
- **The TV is a 1600x900 logical canvas** (`server/arena.js`), scaled to fit. Keep HUD elements about 5% from the edges because of TV overscan.

## Adding a game

Read the contract at the top of `server/games/index.js`, then add `server/games/<id>.js` and `public/tv/games/<id>.js` and register both. The phone layout comes from the game's `controller.buttons`: a joystick plus up to two buttons with ids `a` and `b`.

## Running and testing

- `npm run dev`, then open `/tv` and `/` (as the controller) in separate browser profiles; the keyboard works as a controller.
- `npm run check` runs the smoke test (`scripts/smoke.mjs`): it starts the server and checks pages, join info, WebSockets, a game round and the port fallback. CI runs it on Linux, macOS and Windows. `node scripts/smoke.mjs --cmd <binary>` tests a release build.
- After changes, check: the lobby shows the game, the host can start, rounds play, results show, and it returns to the lobby. Also check that only the host and the TV can `select`, `start` or `end`.
