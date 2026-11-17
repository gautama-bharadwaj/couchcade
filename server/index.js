import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { WebSocketServer } from 'ws';
import { Lobby, MAX_PLAYERS } from './lobby.js';
import { Session } from './session.js';
import { ARENA } from './arena.js';

const PORT = Number(process.env.PORT) || 3000;
// 60 ticks a second: an input waits at most ~17 ms for the next tick (it was ~33 ms at 30).
// TICK_HZ=30 npm start halves the CPU work if a small machine struggles.
const TICK_HZ = Number(process.env.TICK_HZ) || 60;
const VIEW_HZ = 10; // phone status updates
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// ---------------------------------------------------------------------------
// LAN address: what phones will type / scan. Prefer Wi-Fi (en0 on a Mac, wlan0 on a Pi).
// Override with HOST_IP=192.168.x.y npm start if it picks the wrong one.
// ---------------------------------------------------------------------------
function lanAddress() {
  if (process.env.HOST_IP) return process.env.HOST_IP;
  const ifaces = os.networkInterfaces();
  const preferred = ['en0', 'wlan0', 'en1', 'eth0'];
  const candidates = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) candidates.push({ name, address: a.address });
    }
  }
  candidates.sort((a, b) => rank(a.name) - rank(b.name));
  return candidates[0]?.address ?? 'localhost';

  function rank(name) {
    const i = preferred.indexOf(name);
    return i === -1 ? preferred.length : i;
  }
}

const HOST_IP = lanAddress();
const JOIN_URL = `http://${HOST_IP}:${PORT}/`;

// ---------------------------------------------------------------------------
// HTTP: static files + a tiny join-info API
//   /        -> phone controller (this is what the QR code points to)
//   /tv      -> TV screen
// ---------------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

const ROUTES = { '/': '/controller/index.html', '/tv': '/tv/index.html', '/tv/': '/tv/index.html' };

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');

    if (url.pathname === '/api/join-info') {
      const qrSvg = await QRCode.toString(JOIN_URL, { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } });
      return sendJson(res, { url: JOIN_URL, qrSvg, maxPlayers: MAX_PLAYERS, arena: ARENA, tickHz: TICK_HZ });
    }

    const rel = ROUTES[url.pathname] ?? url.pathname;
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return notFound(res);

    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) return notFound(res);

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // dev-friendly: always serve the latest file
    });
    res.end(await readFile(filePath));
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('Server error');
  }
});

function sendJson(res, obj) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
}

// ---------------------------------------------------------------------------
// WebSockets
//   client -> server  {t:'hello', role:'tv'}
//                     {t:'hello', role:'player', name, token?}
//                     {t:'input', x, y, a, b}               players, ~30/s
//                     {t:'act', key, value?}                players, screens games only
//                     {t:'select', gameId} {t:'start'} {t:'end'}   host phone or TV only
//                     {t:'addBot'} {t:'removeBot'}                 host phone or TV, lobby only
//                     {t:'ping', at, rtt?}                  rtt = player's last measured round trip
//   server -> player  {t:'welcome', id, token, name, color} | {t:'full'}
//                     {t:'you', data}                       game's playerView, ~10/s
//   server -> all     {t:'phase', phase, gameId, games, controller, hostId, players, results}
//   server -> tv      {t:'state', gameId, data, pads}       game snapshot, TICK_HZ; pads = buttons held per player
//   server -> tv      {t:'net', tickHz, tickMaxMs, players}  latency stats, 1/s (the TV's L overlay)
//   server -> any     {t:'pong', at} | {t:'error', message}
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws' });
const lobby = new Lobby();
const session = new Session(lobby, (msg) => broadcastAll(msg));
const tvs = new Set();

wss.on('connection', (ws, req) => {
  ws.role = null;
  ws.playerId = null;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.t) {
      case 'hello':
        if (msg.role === 'tv') {
          ws.role = 'tv';
          tvs.add(ws);
          send(ws, session.phaseMessage());
          console.log(`TV connected (${req.socket.remoteAddress})`);
        } else if (msg.role === 'player') {
          const result = lobby.join(msg.name, msg.token);
          if (result.error) return send(ws, { t: 'full' });
          const p = result.player;
          // If this player was connected on another socket (old tab), close it.
          for (const other of wss.clients) {
            if (other !== ws && other.playerId === p.id) other.close(4000, 'replaced');
          }
          ws.role = 'player';
          ws.playerId = p.id;
          send(ws, { t: 'welcome', id: p.id, token: p.token, name: p.name, color: p.color });
          session.changed(); // everyone sees the new player list
          console.log(`${result.rejoined ? 'Rejoined' : 'Joined'}: ${p.name} (#${p.id}) from ${req.socket.remoteAddress}`);
        }
        break;

      case 'input':
        if (ws.role === 'player') {
          lobby.setInput(ws.playerId, msg);
          noteInput(ws);
        }
        break;

      case 'act':
        if (ws.role === 'player' && session.action(ws.playerId, msg)) pushViews();
        break;

      case 'select':
      case 'start':
      case 'end':
      case 'addBot':
      case 'removeBot': {
        const isHost = ws.role === 'tv' || (ws.role === 'player' && ws.playerId === lobby.hostId());
        if (!isHost) return send(ws, { t: 'error', message: 'Only the host can do that' });
        const r =
          msg.t === 'select' ? session.select(msg.gameId)
          : msg.t === 'start' ? session.start()
          : msg.t === 'addBot' ? session.addBot()
          : msg.t === 'removeBot' ? session.removeBot()
          : session.end();
        if (r?.error) send(ws, { t: 'error', message: r.error });
        break;
      }

      case 'ping':
        send(ws, { t: 'pong', at: msg.at });
        if (ws.role === 'player' && Number.isFinite(msg.rtt)) noteRtt(ws, msg.rtt);
        break;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'tv') tvs.delete(ws);
    if (ws.role === 'player' && ws.playerId) {
      // Only mark offline if no newer socket took over this player.
      const stillConnected = [...wss.clients].some((c) => c !== ws && c.playerId === ws.playerId);
      if (!stillConnected) {
        lobby.disconnect(ws.playerId);
        session.changed();
      }
    }
  });
});

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcastTv(obj) {
  const data = JSON.stringify(obj);
  for (const tv of tvs) if (tv.readyState === tv.OPEN) tv.send(data);
}

function broadcastAll(obj) {
  const data = JSON.stringify(obj);
  for (const c of wss.clients) if (c.role && c.readyState === c.OPEN) c.send(data);
}

// ---------------------------------------------------------------------------
// Game loop: the server is the only source of truth.
// ---------------------------------------------------------------------------
let tick = 0;
let last = performance.now();
let tickMaxMs = 0; // longest gap between ticks this second: shows if the machine can't keep up
setInterval(() => {
  const now = performance.now();
  tickMaxMs = Math.max(tickMaxMs, now - last);
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  tick++;

  const state = session.tick(dt);
  if (state) broadcastTv({ ...state, tick, pads: pads() });

  // Per-player phone updates at ~10/s.
  if (state && tick % Math.max(1, Math.round(TICK_HZ / VIEW_HZ)) === 0) pushViews();
}, 1000 / TICK_HZ);

/** Which buttons each phone holds right now, e.g. { '1': 'a', '2': '' }. Drives the overlay's press lights. */
function pads() {
  const out = {};
  for (const p of lobby.players.values()) if (!p.bot) out[p.id] = (p.input.a ? 'a' : '') + (p.input.b ? 'b' : '');
  return out;
}

// ---------------------------------------------------------------------------
// Latency stats for the TV overlay (press L on the TV).
//   rtt:   phone -> server -> phone round trip, as the phone measured it (last + worst of ~10 s)
//   gap:   longest silence between input messages this second. Phones send at least 30/s, so
//          anything well above ~35 ms means Wi-Fi held packets back and then delivered them in a burst.
// ---------------------------------------------------------------------------
function netOf(ws) {
  return (ws.net ??= { rtts: [], lastInputAt: 0, gapMax: 0, inputs: 0 });
}
function noteInput(ws) {
  const n = netOf(ws);
  const now = performance.now();
  // Phones only send during action games, so a long pause is the lobby, not Wi-Fi.
  if (n.lastInputAt && now - n.lastInputAt < 1000) n.gapMax = Math.max(n.gapMax, now - n.lastInputAt);
  n.lastInputAt = now;
  n.inputs++;
}
function noteRtt(ws, rtt) {
  const n = netOf(ws);
  n.rtts.push(Math.max(0, Math.min(rtt, 10_000)));
  if (n.rtts.length > 10) n.rtts.shift();
}
setInterval(() => {
  const players = [];
  for (const c of wss.clients) {
    if (c.role !== 'player' || !c.net) continue;
    const n = c.net;
    const p = lobby.players.get(c.playerId);
    players.push({
      id: c.playerId,
      name: p?.name ?? '?',
      color: p?.color ?? '#888',
      rtt: n.rtts.at(-1) ?? null,
      rttMax: n.rtts.length ? Math.max(...n.rtts) : null,
      gapMax: Math.round(n.gapMax),
      rate: n.inputs,
    });
    n.gapMax = 0;
    n.inputs = 0;
  }
  broadcastTv({ t: 'net', tickHz: TICK_HZ, tickMaxMs: Math.round(tickMaxMs), players });
  tickMaxMs = 0;
}, 1000);

function pushViews() {
  for (const c of wss.clients) {
    if (c.role !== 'player') continue;
    const data = session.playerView(c.playerId);
    if (data) send(c, { t: 'you', data });
  }
}

// Housekeeping: drop long-gone players, kill dead sockets.
setInterval(() => {
  // Mid-game, keep everyone's seat (long turn-based games), so prune only outside games.
  if (session.phase !== 'playing' && lobby.prune().length) session.changed();
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 5000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  Couchcade server running');
  console.log(`  TV screen:   http://localhost:${PORT}/tv`);
  console.log(`  Phones join: ${JOIN_URL}`);
  console.log('');
});
