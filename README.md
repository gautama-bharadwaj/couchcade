# Couchcade

Party games on the big screen, with your phone as the controller. Any computer connected to the TV (or any big screen with a browser) shows the game; phones on the same Wi-Fi join by scanning a QR code. Nobody installs anything on their phone, and nothing goes over the internet.

Couchcade runs on macOS, Windows and Linux. Pick whichever way of starting it suits you; all of them run a small server on that computer and show you where to point the TV and the phones.

## Run it

### Download (easiest)

Get the file for your computer from the [Releases page](https://github.com/gautama-bharadwaj/couchcade/releases/latest):

| Computer | File | Then |
| --- | --- | --- |
| Mac with Apple silicon (M1 or newer) | `Couchcade-macos-arm64.zip` | Unzip and open **Couchcade.app**. |
| Windows | `Couchcade-windows-x64.exe` | Double-click it. A console window shows the addresses; close it to stop. |
| Linux (x64, or arm64 such as a 64-bit Raspberry Pi) | `couchcade-linux-x64` / `couchcade-linux-arm64` | `chmod +x couchcade-linux-*` and run it. |

The app opens the TV page in your default browser by itself. The downloads aren't signed yet, so the first launch needs one extra click; see [Unsigned downloads](#unsigned-downloads). The Mac app has no window of its own: to stop it, use **Force Quit** (⌥⌘Esc) or Activity Monitor. On an Intel Mac, use `npx` or run it from source.

### With Node.js: `npx couchcade`

Once Couchcade is published to npm, any computer with [Node.js](https://nodejs.org) 20 or newer can run:

```bash
npx couchcade          # add --open to open the TV page in your browser
```

### From source

```bash
git clone https://github.com/gautama-bharadwaj/couchcade.git
cd couchcade
npm install
npm run dev            # restarts automatically when you edit server files
```

`npm start` runs it without the auto-restart and takes the options below (`npm start -- --open`).

### Docker

```bash
docker build -t couchcade .
docker run --rm -p 3000:3000 -e HOST_IP=192.168.1.50 couchcade   # HOST_IP = this computer's LAN address
docker run --rm --network host couchcade                         # Linux only: finds the address itself
```

Phones can't reach a container's own address, so with `-p` the QR code needs `HOST_IP`. With `--network host` (Linux) the container uses the host's network and finds the right address itself.

### Then

- **TV:** open `http://localhost:3000/tv` on the computer connected to the TV, then press **F** for full screen. The startup message shows the exact address: if port 3000 is already taken by another app, Couchcade uses the next free one (3001 to 3010).
- **Phones:** scan the QR code on the TV. If phones can't open it, the computer may have picked the wrong network address (common with VPNs, Docker or virtual machines): click **Wrong address? Switch** under the code or press **I** on the TV to cycle through this computer's other addresses. See also [Troubleshooting](#troubleshooting).
- The first time it runs, your firewall may ask whether to allow incoming connections. Allow them on **private** networks, or phones can't connect.

### Options

| Flag | Environment variable | What it does |
| --- | --- | --- |
| `--port 3100` | `PORT=3100` | Use exactly this port (and stop if it's busy). Without it: 3000, or the next free one up to 3010. |
| `--host-ip 192.168.1.50` | `HOST_IP=192.168.1.50` | The address to put in the QR code, if the one it finds is wrong. |
| `--open` / `--no-open` | `OPEN_BROWSER=1` / `0` | Open the TV page in the default browser once running. The downloads do this by default; `npm run dev` and `npx` don't. |
| | `LOG_LEVEL=debug` | More detail in the log; see [Logging](#logging). |
| | `LOG_FILE=off` or a path | Don't write a log file, or write it there. |
| | `DISABLE_LOG_API=1` | Turn off `/api/logs` (handy on a network shared with strangers). |
| | `TICK_HZ=30` | Halve the server's work on a very slow machine. |

Flags work with the downloads, `npx couchcade` and `npm start --`; `couchcade --help` lists them. Environment variables work everywhere, including `npm run dev` (`PORT=3100 npm run dev`).

### Playing

1. Everyone scans the code and types a name. The first person to join is the **host**.
2. The host picks a game on their phone and taps **Start**.
3. When the game ends, everyone sees the results, then it goes back to the lobby.

TV keyboard shortcuts: **arrow keys** pick a game (or click a tile), **B** add a bot (**Shift+B** removes one), **Enter** start, **M** mute, **N** narrator on/off, **Esc** end the game or skip the results, **F** full screen, **J** show a join QR code during a game, **L** latency overlay, **I** switch the join address (when the computer has more than one).

### Sound

The TV plays synthesized sound effects and a narrator using the browser's built-in voice; there are no audio files. Browsers only allow sound after you interact, so press any key or click on the TV page once. **M** mutes, **N** turns the narrator on or off (remembered per browser). The narrator sounds best in Chrome, Edge or Safari on macOS and Windows; Chromium on Linux (a Raspberry Pi especially) may have only a robotic voice or none.

### Playing with bots

The host can tap **+ Add bot** / **− Remove bot** in the lobby (or press **B** / **Shift+B** on the TV) to fill seats with computer players. Bots play every game (in Fuse they peek before risky draws and love hiding Bombs on top for the next player; in Bumper Arena they chase and shove, in Stickup they grab weapons and fight, in Sumo Spin they charge, lunge and sometimes dodge; in Hot Potato Pileup they chase with the bomb, flee, hop over tackles and shove each other toward it; in Pillow Fort Siege they ferry cushions into a stepped fort, then lob pillows at the other teddy while one stays home to patch the walls; in Tidewake they build toward good numbers, trade with the bank, make simple one-for-one offers and answer yours; in Tint & Tell they clue and guess from a list of about 100 everyday words like "lagoon" or "deep plum", so they may miss your more creative clues; in Sandbox they stand still).

### Testing without phones

Open `http://localhost:3000/` in a few **different browsers or private windows**. Each one is a player: WASD or the arrow keys move, Space is A, Shift is B. Two normal tabs in the same browser share a player.

## Games

| Game | Controls | Notes |
| --- | --- | --- |
| **Bumper Arena** | Joystick + Dash | Shove others off a shrinking platform. Last one standing wins the round; first to 3 wins. One player = practice mode. |
| **Stickup** | Joystick + Jump + Hit | Side-view stick-figure brawl for 2–8. 100 health each, headshots hurt more, and knockback grows as you get hurt. Weapons parachute in (bat, pistol, shotgun, grenades, railgun); walk into a crate bare-handed to grab one. Arenas rotate: Rooftops, Factory (moving platform, crushers) and Lava Pit (rising lava, crumbling ledges). Last one standing wins the round; first to 5. Push the stick down and jump to drop through thin ledges; aim with the stick. Sound effects only, no narrator. |
| **Sumo Spin** | Joystick + Charge + Dodge | Push everyone off a round ring that spins (carrying you around, fastest at the edge) and tilts more and more toward a wandering low side. Hold Charge to brace and power up, let go to lunge. Dodge is a tiny sidestep that lets a lunge pass through you; dodge just before it lands for a perfect dodge, which sends the lunger stumbling and gives you a free full charge. The edge crumbles after 45 s. Last one on wins the round; first to 3, up to 8 players. One player = practice mode. |
| **Hot Potato Pileup** | Joystick + Tackle + Dodge | Top-down brawl for 2–8 where someone always holds a ticking bomb. Tackle someone while you hold it to pass it (no instant tag-backs); Dodge is a hop that can't be tackled. The fuse is secret and keeps burning across passes; the blast knocks out the holder and flings everyone nearby. +1 per blast survived, +2 for the last one standing, most points after 3 rounds wins. Yards rotate: Backyard, Kitchen and a slippery Ice Rink. |
| **Midnight Gala** | Phone screens | Hidden roles for 4–8. Secret Thieves steal gems at night; everyone picks rooms, compares alibis and evidence, and votes people out. Roles: Thief, Detective, Bodyguard (5+), Gossip (6+), Guest. |
| **Fuse** | Phone screens | Push-your-luck card game for 2–8 in a fireworks workshop. Play cards from your hand, then draw from the crate; draw a Bomb and you're out unless you douse it with a Bucket (then secretly hide it back in the crate) or cut the right one of three wires (1 in 3). Decoys look like Bombs when you peek but just go pop. Cards: Bucket, Periscope (see top 3), Nudge (see the top card, bury it), Duck (skip your draw), Hot Potato (next player owes your draws + 1), Boomerang (send a Hot Potato back), Stir, Back Door (draw from the bottom), Swipe (steal a random card), X-Ray (see a hand). The TV shows the odds of a Bomb and a burning fuse as the turn timer. Last one standing wins. |
| **Shed!** | Phone screens | Color-matching card game for 2–8. Your hand is on your phone; match the top card's color or number, use Skip / Reverse / Draw 2 / Wilds, stack +2s and +4s to pass the penalty along, and tap "Last card!" before someone catches you. 108-card deck, 7 each. |
| **Pillow Fort Siege** | Joystick + Jump + Grab/Throw | Two teams (2–8 players) and a teddy bear in each fort. **Build** (35 s): grab cushions from the laundry pile in the middle and press B to stack one on the column in front of you (the TV shows where it'll land). **Siege** (75 s): hold B to wind up a pillow, aim with the stick (the TV draws the arc) and let go. Two pillows knock a cushion out and the stack above drops; a carried cushion hurled from outside your fort knocks one out at once. Pillows fly through your own fort and bonk enemies, making them drop what they carry. Hit the other teddy to win the round, or have the bigger fort when time runs out. First team to 2 rounds. Sound effects only. |
| **Tint & Tell** | Phone screens | Color-clue party game for 2–8 around a big color wheel (24 hues by 6 rings, palest in the middle). The Teller picks one of three secret swatches on their phone and gives a one-word clue (no color names); everyone taps a swatch on their phone's wheel and locks in. Then a two-word clue, and everyone can move their pin or keep it. Score by steps away (one swatch around or one ring in/out): on it 4, 1 step 3, 2 steps 2, 3 steps 1, plus 1 for keeping your first pin and landing within a step. The Teller scores the best guess. Everyone tells once (twice with 2–3 players). |
| **Tidewake** | Phone screens | Island trading board game for 2–6 (a bigger island with twin volcanoes for 5–6). Rival crews settle a volcanic island of hex tiles that grow Driftwood, Coconut, Fish, Shell and Stone. Each turn: roll the dice, every tile with that number pays the Huts (1) and Lighthouses (2) on its corners, then trade and build. Tap a spot on your phone's mini map to build a Trail, Hut (1 point) or Lighthouse (2 points), or buy a Message in a Bottle. Trading: set what you give and want on your phone and offer it to the table; everyone else can accept, pass or counter, and you pick who to deal with; or trade with the bank at 4:1 (3:1 or 2:1 at a harbor). A 7 erupts the volcano: hands over 7 cards lose half, and the roller drifts the Ash Cloud over a tile and steals a card. Explorer (+2, trails touching the most tiles) and Trader (+1, most deals) awards. First to 8 points. |
| Sandbox | Joystick + Boost | Steer a dot around. For testing controllers and latency. |

## Architecture

```
phones ──input on every press (+30/s)──▶  server  ──state up to 60/s──▶  TV page (canvas, 60 fps)
                         │
                         ├─ lobby.js     players, colours, host, reconnect tokens
                         ├─ session.js   lobby → playing → results → lobby
                         └─ games/       one file per game (rules only)
```

The server is the only place game logic runs. The TV just draws snapshots, and phones just send inputs.

### Latency

Press **L** on the TV during an action game to see, per phone: the round trip to the server, the longest Wi-Fi stall in the last second, and an estimate of press-to-screen time. A square next to each name lights up when the server sees that phone hold a button. To measure the true end-to-end delay, film the phone and the TV together in slow motion and count frames between the phone's button lighting and the square. The code path adds about 35 ms (send on press, a 60 Hz tick, a 25 ms smoothing buffer on the TV); the rest is Wi-Fi and the TV's own picture processing, so switch the TV to **Game mode**. Phones send presses the instant they happen, and the server holds a quick tap for at least one tick so it is never missed.

```
bin/couchcade.js      command-line entry (npx couchcade, the downloads): flags → environment variables
server/
  index.js            HTTP (pages + QR) and WebSocket hub, 60 Hz loop, startup (port, banner)
  address.js          which LAN address goes in the QR code, and the alternatives
  runtime.js          packaged app or source? (node:sea), opening the browser
  log.js              buffered, leveled logging (see Logging)
  lobby.js            who's here
  session.js          shared game flow (pick, start, results)
  arena.js            1600x900 logical canvas shared by all games
  games/index.js      game registry + the game contract (read this first)
  games/bumper.js
  games/sumo.js
  games/potato.js
  games/sandbox.js
public/
  tv/tv.js            TV core: lobby/results screens, interpolation, render loop
  tv/games/index.js   TV renderer registry
  tv/games/<id>.js    how each game is drawn
  controller/         phone UI: join, lobby, pad (buttons come from the game), results
scripts/
  smoke.mjs           npm run check: starts the server and tests it from outside
  build-release.mjs   npm run build:release: the downloadable apps (see Releases)
```

### Adding a game

1. `server/games/<id>.js`: export `{ id, title, description, category, icon, minPlayers, maxPlayers, controller, create }`. `category` (such as `action`, `party` or `cards`) puts the game under that tab in the phone's game picker, and `icon` is one emoji for its tile on the TV and phone. The contract is documented at the top of `server/games/index.js`.
2. `public/tv/games/<id>.js`: export `{ draw(ctx, { prev, cur, alpha, arena, now }) }`, and optionally `onSnapshot(prev, cur, audio)` for sound effects and narration (see `public/tv/audio.js`).
3. Register it in `server/games/index.js` and `public/tv/games/index.js`.

Turn-based or hidden-information games use `controller: { type: 'screens' }` instead of buttons. The phone then shows whatever `playerView(id).screen` describes (title, role badge, info cards, a list to pick from, a text box, buttons) and taps come back to the game's `onAction(id, { key, value })`. See "Phone screens" in `server/games/index.js`; Midnight Gala and Shed! are the examples.

The lobby, joining, reconnects, host controls, phone layout and results screen all come for free.

### Messages

| Direction | Message |
| --- | --- |
| phone → server | `hello {role:'player', name, token?}`, `input {x, y, a, b}` (on every press, plus 30/s), `act {key, value?}` (screens games) |
| phone / TV → server | `clientError {message}` (script errors, a few per minute at most, for the server log) |
| host phone / TV → server | `select {gameId}`, `start`, `end` |
| TV → server | `hello {role:'tv'}` |
| server → everyone | `phase {phase, gameId, games, controller, hostId, players, results}` |
| server → TV | `state {gameId, tick, pads, data}` (up to 60/s; a snapshot identical to the last one is skipped, with a repeat every second) |
| server → phone | `welcome {id, token, name, color}`, `you {data}` (up to 10/s, only when it changed, and right after any tap), `error`, `full` |

### Smooth with 8 players

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

## Troubleshooting

- **Phones can't open the page.**
  - They must be on the same network as the computer. **Guest, office, school and hotel Wi-Fi** usually has "client isolation", which stops devices on it from reaching each other; Couchcade can't work around that. Use a home network, or turn on your phone's hotspot and connect the computer and the other phones to it.
  - **Firewall.** Windows Defender Firewall asks the first time: allow Couchcade on **private** networks. If you clicked Cancel, go to Windows Security > Firewall & network protection > Allow an app through firewall, and tick **Private** for Couchcade (or Node.js). Windows also blocks it if your Wi-Fi is set to Public: Settings > Network & internet > Wi-Fi > your network > **Private network**. On macOS, check System Settings > Network > Firewall > Options and allow Couchcade (or `node`). On Linux with ufw: `sudo ufw allow 3000/tcp`.
  - A **VPN** on the computer can grab the network; try with it off.
- **Wrong address in the QR code.** Press **I** on the TV (or click **Wrong address? Switch**) to try this computer's other addresses. To fix it for good, start with `--host-ip 192.168.1.50` (or `HOST_IP=...`) using the address of the computer's Wi-Fi or Ethernet connection. Under WSL or in Docker the detected address is the virtual one: set `HOST_IP` to the Windows/host machine's address.
- **"Port 3000 is already in use".** Without `--port`, Couchcade moves to 3001-3010 by itself. With `--port`/`PORT` it uses exactly that port, so pick another or close the other copy of Couchcade.
- **Something went wrong during a game.** Look at the log file (its path is in the startup message; see [Logging](#logging)) or `/api/logs` for `WARN` and `ERROR` lines around that time. For lag, the `[stats]` lines show whether the server kept up (tick work, longest gap); press **L** on the TV to see whether it's the Wi-Fi.

### Unsigned downloads

The downloads aren't signed or notarized yet, so the OS warns about them the first time:

- **macOS:** "Apple could not verify Couchcade..." Click **Done**, then open System Settings > **Privacy & Security**, scroll to Security, and click **Open Anyway** next to the message about Couchcade. Confirm, and it opens normally from then on.
- **Windows:** SmartScreen says "Windows protected your PC". Click **More info**, then **Run anyway**.
- **Linux:** browsers drop the executable bit on downloads, so run `chmod +x couchcade-linux-*` first.

## Releases

The downloads are built by `.github/workflows/release.yml`. Push a tag to build every platform, smoke test each binary and publish a GitHub Release with the files:

```bash
npm version minor        # bumps package.json and tags v0.2.0
git push origin main --follow-tags
```

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
- [ ] M4 Polish: sounds, keep phones awake, Draw & Guess
- [x] M5 Portable: any OS with a browser; downloads for macOS, Windows and Linux, `npx`, Docker; smarter QR address
- [ ] M6 Signed and notarized downloads, publish to npm

## License

MIT. See [LICENSE](LICENSE).
