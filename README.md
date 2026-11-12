# Couchcade

Party games on the big screen, with your phone as the controller. The TV shows the game in a full-screen browser on a computer plugged in over HDMI (the MacBook now, a Raspberry Pi later). Phones join over home Wi-Fi by scanning a QR code; nobody installs anything.

## Run it

You need Node.js 20 or newer (`node -v`; install with `brew install node` if it's missing).

```bash
cd ~/Documents/couchcade
npm install
npm run dev        # restarts automatically when you edit server files
```

- **TV:** open `http://localhost:3000/tv` on the Mac, then press **F** for full screen.
- **Phones:** scan the QR code on the TV, which opens `http://<mac-ip>:3000/`.
- The first time it runs, allow incoming connections for `node` if macOS asks.

### Playing

1. Everyone scans the code and types a name. The first person to join is the **host**.
2. The host picks a game on their phone and taps **Start**.
3. When the game ends, everyone sees the results, then it goes back to the lobby.

TV keyboard shortcuts: **↑/↓** pick a game, **B** add a bot (**Shift+B** removes one), **Enter** start, **M** mute, **N** narrator on/off, **Esc** end the game or skip the results, **F** full screen, **J** show a join QR code during a game.

### Sound

The TV plays synthesized sound effects and a narrator using the browser's built-in voice; there are no audio files. Browsers only allow sound after you interact, so press any key or click on the TV page once. **M** mutes, **N** turns the narrator on or off (remembered per browser). The narrator sounds best in Chrome or Safari on the Mac; Chromium on a Raspberry Pi may have only a robotic voice or none.

### Playing with bots

The host can tap **+ Add bot** / **− Remove bot** in the lobby (or press **B** / **Shift+B** on the TV) to fill seats with computer players. Bots play every game (in Bumper Arena they chase and shove, in Stickup they grab weapons and fight; in Sandbox they stand still).

### Testing without phones

Open `http://localhost:3000/` in a few **different browsers or private windows**. Each one is a player: WASD or the arrow keys move, Space is A, Shift is B. Two normal tabs in the same browser share a player.

## Games

| Game | Controls | Notes |
| --- | --- | --- |
| **Bumper Arena** | Joystick + Dash | Shove others off a shrinking platform. Last one standing wins the round; first to 3 wins. One player = practice mode. |
| **Stickup** | Joystick + Jump + Hit | Side-view stick-figure brawl for 2–8. 100 health each, headshots hurt more, and knockback grows as you get hurt. Weapons parachute in (bat, pistol, shotgun, grenades, railgun); walk into a crate bare-handed to grab one. Arenas rotate: Rooftops, Factory (moving platform, crushers) and Lava Pit (rising lava, crumbling ledges). Last one standing wins the round; first to 5. Push the stick down and jump to drop through thin ledges; aim with the stick. |
| **Midnight Gala** | Phone screens | Hidden roles for 4–8. Secret Thieves steal gems at night; everyone picks rooms, compares alibis and evidence, and votes people out. Roles: Thief, Detective, Bodyguard (5+), Gossip (6+), Guest. |
| **Shed!** | Phone screens | Color-matching card game for 2–8. Your hand is on your phone; match the top card's color or number, use Skip / Reverse / Draw 2 / Wilds, stack +2s and +4s to pass the penalty along, and tap "Last card!" before someone catches you. 108-card deck, 7 each. |
| Sandbox | Joystick + Boost | Steer a dot around. For testing controllers and latency. |

## Architecture

```
phones ──input 30/s──▶  server  ──state 30/s──▶  TV page (canvas, 60 fps)
                         │
                         ├─ lobby.js     players, colours, host, reconnect tokens
                         ├─ session.js   lobby → playing → results → lobby
                         └─ games/       one file per game (rules only)
```

The server is the only place game logic runs. The TV just draws snapshots, and phones just send inputs.

```
server/
  index.js            HTTP (pages + QR) and WebSocket hub, 30 Hz loop
  lobby.js            who's here
  session.js          shared game flow (pick, start, results)
  arena.js            1600x900 logical canvas shared by all games
  games/index.js      game registry + the game contract (read this first)
  games/bumper.js
  games/sandbox.js
public/
  tv/tv.js            TV core: lobby/results screens, interpolation, render loop
  tv/games/index.js   TV renderer registry
  tv/games/<id>.js    how each game is drawn
  controller/         phone UI: join, lobby, pad (buttons come from the game), results
```

### Adding a game

1. `server/games/<id>.js`: export `{ id, title, description, minPlayers, maxPlayers, controller, create }`. The contract is documented at the top of `server/games/index.js`.
2. `public/tv/games/<id>.js`: export `{ draw(ctx, { prev, cur, alpha, arena, now }) }`, and optionally `onSnapshot(prev, cur, audio)` for sound effects and narration (see `public/tv/audio.js`).
3. Register it in `server/games/index.js` and `public/tv/games/index.js`.

Turn-based or hidden-information games use `controller: { type: 'screens' }` instead of buttons. The phone then shows whatever `playerView(id).screen` describes (title, role badge, info cards, a list to pick from, a text box, buttons) and taps come back to the game's `onAction(id, { key, value })`. See "Phone screens" in `server/games/index.js`; Midnight Gala and Shed! are the examples.

The lobby, joining, reconnects, host controls, phone layout and results screen all come for free.

### Messages

| Direction | Message |
| --- | --- |
| phone → server | `hello {role:'player', name, token?}`, `input {x, y, a, b}` (30/s), `act {key, value?}` (screens games) |
| host phone / TV → server | `select {gameId}`, `start`, `end` |
| TV → server | `hello {role:'tv'}` |
| server → everyone | `phase {phase, gameId, games, controller, hostId, players, results}` |
| server → TV | `state {gameId, tick, data}` (30/s) |
| server → phone | `welcome {id, token, name, color}`, `you {data}` (10/s), `error`, `full` |

## Troubleshooting

- **Phone can't load the page.** Make sure the phone is on the same Wi-Fi as the Mac (not a guest network) and check the macOS firewall setting for `node`.
- **Wrong IP in the QR code.** Run `HOST_IP=192.168.1.50 npm run dev` with the Mac's actual Wi-Fi address.

## Milestones

- [x] M0 Setup
- [x] M1 Plumbing: server, QR join, joystick
- [x] M2 Lobby: host, game picker, start/end, results, reconnect
- [x] M3 Bumper Arena (first version; tune feel on real phones)
- [x] Phone screens for turn-based games; players keep their seat for the whole game
- [x] Midnight Gala (first version; needs a real game night to tune)
- [x] Shed! (color-matching card game)
- [x] Stickup (stick-figure brawler; tune weapons and arenas on real phones)
- [ ] M4 Polish: sounds, keep phones awake, Draw & Guess
- [ ] M5 Raspberry Pi

## License

MIT. See [LICENSE](LICENSE).
