# Contributing to Couchcade

Thanks for helping. This file is for people working on the code: how it fits together, running it locally, adding a game, testing and releasing. If you just want to play, the [README](README.md) has everything.

## Principles

- **Runs anywhere.** Couchcade must run on any OS with only a browser and one command or a download. Never assume a particular host machine, network interface or install path. The packaged apps have no folder of their own: pages come from `node:sea` assets and logs go to the OS log folder (`server/runtime.js`, `server/log.js`), so anything new that reads or writes files must handle that too. The QR address comes from `server/address.js`.
- **Many games, one platform.** Every game plugs into the same lobby → playing → results flow (`server/session.js`). Games never handle joining, hosting or reconnects.
- **The server is authoritative.** Game rules run only in `server/games/<id>.js`. TV renderers (`public/tv/games/<id>.js`) only draw snapshots. Phones only send `{x, y, a, b}` input, or taps on a game's phone screens.
- **No build step for development.** Plain ES modules, Node 20+, and only two runtime dependencies (`ws` and `qrcode`), so running from source is `npm install` and `npm run dev`. The release build (`scripts/build-release.mjs`, esbuild plus Node's single executable applications) is the only build step; source never depends on it. Please open an issue before adding a framework, bundler or runtime dependency.
- **Sound lives on the TV.** `public/tv/audio.js` synthesizes effects with Web Audio and narrates with the browser's speech synthesis; there are no audio files.
- **The TV is a 1600x900 logical canvas** (`server/arena.js`), scaled to fit. Keep HUD elements about 5% from the edges because of TV overscan.

## Running locally

```bash
git clone https://github.com/gautama-bharadwaj/couchcade.git
cd couchcade
npm install
npm run dev            # restarts when you edit server files; refresh the browser for public/ changes
```

Open `http://localhost:3000/tv` for the TV, and `http://localhost:3000/` in a few **different browsers or private windows** as players (two normal tabs in the same browser share a player). On a computer, WASD or the arrow keys move, Space is A and Shift is B. Press **B** on the TV to add bots, so you can play a whole game alone.

To try it on real phones, open the address the startup message prints, or scan the TV's QR code; the phones must be on the same Wi-Fi as your computer.

## How it fits together

```
phones ──input on every press (+30/s)──▶  server  ──state up to 60/s──▶  TV page (canvas, 60 fps)
                         │
                         ├─ lobby.js     players, colours, host, bots, reconnect tokens
                         ├─ session.js   lobby → (how-to-play) → playing → results → lobby
                         └─ games/       one file per game (rules only)
```

The server is the only place game logic runs. The TV just draws snapshots, and phones just send inputs or taps.

```
bin/couchcade.js        command-line entry (npx couchcade, the downloads): flags → environment variables
server/
  index.js              HTTP (pages + QR) and WebSocket hub, 60 Hz loop, startup (port, banner)
  address.js            which LAN address goes in the QR code, and the alternatives
  runtime.js            packaged app or source? (node:sea), opening the browser, the Mac app's window
  log.js                buffered, leveled logging (see Logging)
  lobby.js              who's here, including bots
  session.js            shared game flow (pick, start, how-to-play intro, results)
  arena.js              1600x900 logical canvas shared by all games
  games/index.js        game registry + the game contract (read this first)
  games/<id>.js         one per game: shed, fuse, gala, tint, hoard, tunein, tidewake,
                        stickup, bumper, sumo, potato, pillowfort, sandbox
  games/hoard-words.js, games/tunein-deck.js   word lists and cards
public/
  tv/tv.js              TV core: lobby/results screens, interpolation, render loop
  tv/audio.js           synthesized sound effects and the narrator
  tv/rules.js           the how-to-play overlay (steps come from each game's `rules`)
  tv/games/index.js     TV renderer registry
  tv/games/<id>.js      how each game is drawn
  tv/games/rules/       how-to-play pictures kept out of the renderers (kit.js has shared helpers)
  art/                  drawn art shared by the TV and phones (cards.js helpers; one module per game)
  controller/           phone UI: join, lobby, pad (buttons come from the game), phone screens, results
scripts/
  smoke.mjs             npm run check: starts the server and tests it from outside
  build-release.mjs     npm run build:release: the downloadable apps (see Releasing)
docs/screenshots/       images for the README
```

## Adding a game

1. **Rules:** `server/games/<id>.js` exports `{ id, title, description, tab, icon, minPlayers, maxPlayers, controller, rules, create }`. The full contract is documented at the top of `server/games/index.js`; read it first.
   - `tab` puts the game under **Board & Card** (`'board'`, turn-based games played on phone screens) or **Arcade** (`'arcade'`, real-time joystick games). Leave it out and phone-screen games go to Board & Card, joystick games to Arcade. `icon` is one emoji for the picker tile.
   - `controller: { buttons: [...] }` gives the phone a joystick plus up to two buttons (ids `a` and `b`). `controller: { type: 'screens' }` is for turn-based or hidden-information games: the phone shows whatever `playerView(id).screen` describes (title, role badge, cards, a hand, choices, a text box, a color wheel, a hex map, a dial, a word grid, buttons), and taps come back to the game's `onAction(id, { key, value })`. Never trust an action: check the phase, the player and the value.
2. **Drawing:** `public/tv/games/<id>.js` exports `{ draw(ctx, { prev, cur, alpha, arena, now }) }`, and optionally `onSnapshot(prev, cur, audio)` for sound effects and narration. If a sound needs an event the snapshot doesn't show (a collision, say), add it to the snapshot (see `fx` in Bumper Arena).
3. **Register** it in `server/games/index.js` (the order there is the order in the picker) and `public/tv/games/index.js`.
4. **How-to-play intro:** list `rules: [{ title, text, art?, seconds? }]`, a few short steps (30 to 60 seconds in all) that the TV plays at the start while the game waits; the narrator reads them and the phones show them too. Every game has one, and turn-based and card games need one: new players can't learn a game from card text alone. `art` names a picture drawn by the renderer's optional `drawRules(ctx, art, t, box)`, or by a module in `public/tv/games/rules/<id>.js` (registered in its `index.js`, with helpers in `kit.js`).
5. **Bots:** the lobby adds bots as ordinary players with `bot: true`; each game decides their moves. Joystick games compute an input for bot players in `update` (see `botInput` in `server/games/bumper.js`); screens games call their own `onAction` for bots after a short, human-looking delay (see the Bots section of `server/games/shed.js`). Bots should play reasonably, never stall the game, and leave the interesting decisions to humans where they can.
6. **Art (optional):** set `art: '<name>'` on a phone screen to load `public/art/<name>.js`, which can draw cards, icons, map tiles, the color wheel and dial (contract in `server/games/index.js`, "Drawn art"). The TV renderer can import the same module so both match. `public/art/cards.js` has shared helpers for the illustrated card look (cream-edged cards, outlined lettering, confetti and smoke).

The lobby, joining, reconnects, host controls, phone layout and results screen all come for free.

Before opening a pull request, check that the lobby shows the game, the host can start, rounds play, results show and it returns to the lobby, with bots and with at least two browser players. Only the host and the TV may `select`, `start` or `end`.

## Testing

`npm run check` runs the smoke test (`scripts/smoke.mjs`): it starts the server for real and checks the pages, join info, WebSockets, a game round, the how-to-play intro and the port fallback. CI runs it on Linux, macOS and Windows with Node 20 and the Node the downloads embed, plus a Linux release build. `node scripts/smoke.mjs --cmd <binary>` tests a release build.

Action games need a feel check on real phones too: the browser keyboard hides latency and how a joystick feels under your thumb.

### Measuring latency

Press **L** on the TV during an action game to see, per phone: the round trip to the server, the longest Wi-Fi stall in the last second, and an estimate of press-to-screen time. A square next to each name lights up when the server sees that phone hold a button. To measure the true end-to-end delay, film the phone and the TV together in slow motion and count frames between the phone's button lighting and the square. The code path adds about 35 ms (send on press, a 60 Hz tick, a 25 ms smoothing buffer on the TV); the rest is Wi-Fi and the TV's own picture processing, so switch the TV to **Game mode**. Phones send presses the instant they happen, and the server holds a quick tap for at least one tick so it is never missed.

## Messages

| Direction | Message |
| --- | --- |
| phone → server | `hello {role:'player', name, token?}`, `input {x, y, a, b}` (on every press, plus 30/s), `act {key, value?}` (screens games) |
| phone / TV → server | `clientError {message}` (script errors, a few per minute at most, for the server log) |
| host phone / TV → server | `select {gameId}`, `start`, `end` |
| TV → server | `hello {role:'tv'}` |
| server → everyone | `phase {phase, gameId, games, controller, hostId, players, results}` |
| server → TV | `state {gameId, tick, pads, data}` (up to 60/s; a snapshot identical to the last one is skipped, with a repeat every second) |
| server → phone | `welcome {id, token, name, color}`, `you {data}` (up to 10/s, only when it changed, and right after any tap), `error`, `full` |

## Smooth with 8 players

Measured with 8 simulated phones (`server/` CPU stays under 6% of one core in every game; a tick takes well under a millisecond):

- Phones only get a view when it changed. In the card games this cut phone traffic from up to 40 messages a second per phone to between 4 and 12, which leaves the Wi-Fi free for everyone's button presses. Taps that land together share one refresh.
- The TV skips snapshots identical to the last one (card games barely change between ticks), and a TV or phone that falls behind skips stale updates instead of queueing them, so it shows the present as soon as it catches up.
- The TV canvas is drawn at most 2560x1440 and stretched to the screen. On a 4K TV that is under half the pixels per frame. `/tv?res=2` raises the limit, `/tv?res=1` lowers it for slow machines like the Pi.
- In Shed! and Fuse, a player whose phone dropped off gets a 5-second turn instead of 30. In Midnight Gala they no longer hold a phase open until its timer runs out.
- A bug in a game ends that game with a note on the results screen, instead of crashing the server for everyone. A TV drawing error skips the frame instead of freezing the screen.

## Logging

The server logs joins, leaves, reconnects, game starts and finishes, errors (with stack traces), script errors from the TV and phones, and once a minute during a game a health line: tick time, the longest gap between ticks, event loop stalls, messages and KB per second, skipped frames and memory.

- **Where:** the terminal, and a log file that rotates at 5 MB (keeping one old copy). The startup message shows its path.
  - From source: `logs/couchcade.log` in the project folder.
  - The downloads and `npx`: macOS `~/Library/Logs/Couchcade/couchcade.log`, Windows `%LOCALAPPDATA%\Couchcade\logs\couchcade.log`, Linux `~/.local/state/couchcade/couchcade.log` (or under `$XDG_STATE_HOME`).
  - Docker: the terminal only (`docker logs`).
- **From another device:** the last 300 lines and live numbers are at `http://localhost:3000/api/logs`, viewable from any device on the Wi-Fi. `DISABLE_LOG_API=1` turns that off.
- **More detail:** `LOG_LEVEL=debug npm run dev` adds every tap in card games, host commands, and the health line every 10 seconds. Levels are `error`, `warn`, `info` (default), `debug`, `trace`. `LOG_FILE=off` skips the file; `LOG_FILE=/some/path.log` puts it elsewhere.
- **Why it doesn't cause lag:** nothing is logged per frame or per joystick message. Lines are buffered and written together four times a second through an async file stream, so a tick never waits on the disk. Repeating problems (a slow tick, a page throwing every frame) log at most once every few seconds with a count of how many were held back. A disabled level costs one comparison.

## Releasing

The downloads are built by `.github/workflows/release.yml`. Push a tag to build every platform, smoke test each binary and publish a GitHub Release with the files:

```bash
npm version minor        # bumps package.json and package-lock.json, commits, and tags v0.2.0
git push origin main --follow-tags
```

If the version was already bumped in a pull request, just tag the merged commit: `git tag v0.2.0 && git push origin v0.2.0`. A tag can also be made on GitHub without a computer: **Releases > Draft a new release**, type the new tag (`v0.2.0`), target `main`, and publish; the workflow then builds the files and adds them to that release.

The same workflow then publishes that version to npm (`npx couchcade`) by [trusted publishing](https://docs.npmjs.com/trusted-publishers): npm recognises this repository's release workflow, so there's no npm token to keep. The tag must match the version in `package.json`, which `npm version` takes care of.

The very first version had to be published by hand, because npm only lets you set up trusted publishing for a package that exists. For a new package that is: `npm login`, then `npm publish --access public` from a clean checkout of the tag; then on npmjs.com, the package's **Settings > Trusted publishing**, choose GitHub Actions and enter `gautama-bharadwaj` / `couchcade` / `release.yml`. Until that's done, the npm step skips with a warning instead of failing the release.

To build only for the machine you're on: `npm run build:release` (needs Node 25.5 or newer), which writes `dist/release/`. It bundles the server with esbuild and packs it, Node itself and `public/` into one [single executable application](https://nodejs.org/api/single-executable-applications.html). This is the only build step in the project; development never needs it. `npm run check` runs the smoke test against the source, and `node scripts/smoke.mjs --cmd <binary>` against a build.

## Milestones

- [x] M0 Setup
- [x] M1 Plumbing: server, QR join, joystick
- [x] M2 Lobby: host, game picker, start/end, results, reconnect
- [x] M3 Bumper Arena (first version; tune feel on real phones)
- [x] Phone screens for turn-based games; players keep their seat for the whole game
- [x] Midnight Gala (first version; needs a real game night to tune)
- [x] Shed! (color-matching card game)
- [x] Fuse (push-your-luck bomb card game)
- [x] Stickup (stick-figure brawler; tune weapons and arenas on real phones)
- [x] Hot Potato Pileup (bomb-passing brawl; tune fuse and tackle range on real phones)
- [x] Pillow Fort Siege (team fort building and pillow siege; tune timings on real phones)
- [x] Sumo Spin (spinning, tilting sumo ring)
- [x] Bots for every game; sound effects and a narrator on the TV
- [x] Tint & Tell, Dragon Hoard, Tune In and Tidewake (board and party games on phone screens)
- [x] Game picker tabs (Board & Card, Arcade) and a how-to-play intro for every game
- [x] Drawn art for the card and board games, shared by the TV and phones
- [x] M5 Portable: any OS with a browser; downloads for macOS, Windows and Linux, `npx`, Docker; smarter QR address; v0.1.0 on GitHub Releases and npm
- [ ] M4 Polish: keep phones awake, Draw & Guess, a more natural narrator voice
- [ ] M6 Signed and notarized downloads

