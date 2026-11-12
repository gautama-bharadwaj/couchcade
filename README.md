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

TV keyboard shortcuts: **↑/↓** pick a game, **Enter** start, **Esc** end the game or skip the results, **F** full screen, **J** show a join QR code during a game.

### Testing without phones

Open `http://localhost:3000/` in a few **different browsers or private windows**. Each one is a player: WASD or the arrow keys move, Space is A, Shift is B. Two normal tabs in the same browser share a player.

## Games

| Game | Controls | Notes |
| --- | --- | --- |
| **Bumper Arena** | Joystick + Dash | Shove others off a shrinking platform. Last one standing wins the round; first to 3 wins. One player = practice mode. |
| **Midnight Gala** | Phone screens | Hidden roles for 4–8. Secret Thieves steal gems at night; everyone picks rooms, compares alibis and evidence, and votes people out. Roles: Thief, Detective, Bodyguard (5+), Gossip (6+), Guest. |
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
2. `public/tv/games/<id>.js`: export `{ draw(ctx, { prev, cur, alpha, arena, now }) }`.
3. Register it in `server/games/index.js` and `public/tv/games/index.js`.

Turn-based or hidden-information games use `controller: { type: 'screens' }` instead of buttons. The phone then shows whatever `playerView(id).screen` describes (title, role badge, info cards, a list to pick from, a text box, buttons) and taps come back to the game's `onAction(id, { key, value })`. See "Phone screens" in `server/games/index.js`; Midnight Gala is the example.

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
- [ ] Next game: color-matching card game (shedding cards, hands on phones)
- [ ] M4 Polish: sounds, keep phones awake, Draw & Guess
- [ ] M5 Raspberry Pi
