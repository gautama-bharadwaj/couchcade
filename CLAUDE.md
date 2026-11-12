# Couchcade: notes for Claude

Home-only party game platform. A browser on a computer connected to the TV over HDMI shows the game; phones on the same Wi-Fi are the controllers. It runs on the MacBook for now and moves to a Raspberry Pi later. It will never be published, has no internet play, and has no Roku app.

## Principles

- **Many games, one platform.** Every game plugs into the same lobby → playing → results flow (`server/session.js`). Games never handle joining, hosting or reconnects.
- **The server is authoritative.** Game rules run only in `server/games/<id>.js`. TV renderers (`public/tv/games/<id>.js`) only draw snapshots. Phones only send `{x, y, a, b}` input.
- **No build step.** Use plain ES modules, Node 20+, and only the `ws` and `qrcode` dependencies. Keep it that way so the Pi deploy is just copying the folder. Ask before adding a framework or bundler.
- **The TV is a 1600x900 logical canvas** (`server/arena.js`), scaled to fit. Keep HUD elements about 5% from the edges because of TV overscan.

## Adding a game

Read the contract at the top of `server/games/index.js`, then add `server/games/<id>.js` and `public/tv/games/<id>.js` and register both. The phone layout comes from the game's `controller.buttons`: a joystick plus up to two buttons with ids `a` and `b`.

## Running and testing

- `npm run dev`, then open `/tv` and `/` (as the controller) in separate browser profiles; the keyboard works as a controller.
- After changes, check: the lobby shows the game, the host can start, rounds play, results show, and it returns to the lobby. Also check that only the host and the TV can `select`, `start` or `end`.
