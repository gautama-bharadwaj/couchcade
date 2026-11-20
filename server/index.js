import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocketServer } from 'ws';
import { log } from './log.js';
import { joinAddresses } from './address.js';
import { PACKAGED, SEA, openBrowser } from './runtime.js';
import { Lobby, MAX_PLAYERS } from './lobby.js';
import { Session } from './session.js';
import { ARENA } from './arena.js';

// PORT set: use exactly that port (and stop if it's busy). Not set: 3000, or if another app
// already has it, the first free one of 3001-3010, so a double-click never just fails.
const PORT_SET = Boolean(process.env.PORT);
const PORT = Number(process.env.PORT) || 3000;
const PORT_TRIES = PORT_SET ? 1 : 11;
// The downloads open the TV page themselves (nobody reads a terminal after a double-click).
// From source only with --open / OPEN_BROWSER=1, so npm run dev doesn't pop a tab per restart.
const OPEN_BROWSER = process.env.OPEN_BROWSER === '1' || (PACKAGED && process.env.OPEN_BROWSER !== '0');
// 60 ticks a second: an input waits at most ~17 ms for the next tick (it was ~33 ms at 30).
// TICK_HZ=30 npm start halves the CPU work if a small machine struggles.
const TICK_HZ = Number(process.env.TICK_HZ) || 60;
const VIEW_HZ = 10; // phone status updates
// A TV that falls this far behind (a frozen or throttled tab) skips frames instead of queueing
// them, so it catches up to the present the moment it recovers. Same idea for phones, smaller.
const TV_BACKLOG_BYTES = 64 * 1024;
const PHONE_BACKLOG_BYTES = 16 * 1024;
// Turn-based games often don't change for many ticks; the TV then gets a repeat at least this often.
const TV_KEEPALIVE_MS = 1000;
// On a shared network (office, dorm) you may not want the log readable by everyone on it.
const LOG_API_OFF = process.env.DISABLE_LOG_API === '1';
const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Phones join at http://<LAN address>:<port>/. The address is worked out per request (see
// address.js), so reloading the TV after the machine changes networks shows the right code.
let port = PORT; // the port actually bound, once listening
const joinUrlFor = (address) => `http://${address}:${port}/`;

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
      // ?ip= picks another of this machine's addresses (the TV's "Switch" control). Only real
      // candidates are accepted, so the TV can never be made to show a code for some other host.
      const { primary, candidates } = await joinAddresses();
      const ip = url.searchParams.get('ip');
      if (ip && !candidates.some((c) => c.address === ip)) return sendJson(res, { error: 'Not an address of this machine' }, 400);
      const address = ip || primary;
      const joinUrl = joinUrlFor(address);
      const qrSvg = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, color: { dark: '#000', light: '#fff' } });
      return sendJson(res, {
        url: joinUrl,
        address,
        qrSvg,
        candidates: candidates.map((c) => ({ ...c, url: joinUrlFor(c.address) })),
        maxPlayers: MAX_PLAYERS,
        arena: ARENA,
        tickHz: TICK_HZ,
      });
    }
    if (url.pathname === '/api/logs' && !LOG_API_OFF) {
      // Recent log lines plus live numbers, for debugging from any browser on the Wi-Fi.
      // Anyone on the network can read it (player names, addresses), hence DISABLE_LOG_API=1.
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(`${statsLine()}\n\nLog level: ${log.level} · file: ${log.file ?? 'off'}\n\n${log.recent()}`);
    }

    const rel = ROUTES[url.pathname] ?? url.pathname;
    const body = SEA ? embeddedFile(rel) : await diskFile(rel);
    if (!body) return notFound(res);

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(rel)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store', // dev-friendly: always serve the latest file
    });
    res.end(body);
  } catch (err) {
    log.error('http', `${req.method} ${req.url} failed`, err);
    res.writeHead(500).end('Server error');
  }
});

/** A file under public/, or null. Never anything outside it, whatever the URL says. */
async function diskFile(rel) {
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) return null;
  const info = await stat(filePath).catch(() => null);
  return info?.isFile() ? readFile(filePath) : null;
}

/**
 * The same file from inside the packaged app, where public/ is embedded as assets keyed by
 * their path under public/ ("tv/tv.js"; see scripts/build-release.mjs). Only embedded files
 * exist there, but normalize anyway so "/a/../b" finds "b" like it would on disk.
 */
function embeddedFile(rel) {
  const key = path.posix.normalize(rel).replace(/^\/+/, '');
  if (!key || key.startsWith('../')) return null;
  try {
    return Buffer.from(SEA.getRawAsset(key)); // a view, not a copy; never written to
  } catch {
    return null; // getRawAsset throws for a key that isn't there
  }
}

function sendJson(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
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
//                     {t:'clientError', message}            TV or phone script error, for the server log
//   server -> player  {t:'welcome', id, token, name, color} | {t:'full'}
//                     {t:'you', data}                       game's playerView, ~10/s, only when it changed
//   server -> all     {t:'phase', phase, gameId, games, controller, hostId, players, results}
//   server -> tv      {t:'state', gameId, data, pads}       game snapshot, up to TICK_HZ (unchanged ones are skipped,
//                                                           with a repeat every TV_KEEPALIVE_MS); pads = buttons held
//   server -> tv      {t:'net', tickHz, tickMaxMs, players}  latency stats, 1/s (the TV's L overlay)
//   server -> any     {t:'pong', at} | {t:'error', message}
// ---------------------------------------------------------------------------
// Small, frequent messages: no compression (it costs CPU and adds delay). ws already turns off
// Nagle's algorithm (TCP_NODELAY) on every socket, so a press is never held back to batch it.
const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false, maxPayload: 16 * 1024 });
// ws re-emits the http server's errors (like EADDRINUSE while trying ports). Without a listener
// that would throw; start() and the server's own handler below already report them.
wss.on('error', () => {});
const lobby = new Lobby();
const session = new Session(lobby, (msg) => {
  // A phase change can swap the phone's screen; make sure every phone gets a fresh view after it.
  for (const c of wss.clients) c.lastView = null;
  broadcastAll(msg);
  if (msg.phase === 'playing') queueViews();
});
const tvs = new Set();

wss.on('connection', (ws, req) => {
  ws.role = null;
  ws.playerId = null;
  ws.isAlive = true;
  ws.lastView = null; // last 'you' JSON sent, so unchanged views aren't resent
  const addr = req.socket.remoteAddress;
  ws.on('pong', () => (ws.isAlive = true));
  ws.on('error', (err) => log.warn('ws', `socket error from ${addr}`, err.message));

  ws.on('message', (raw) => {
    stats.msgsIn++;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      if (log.every('bad-json', 10_000)) log.warn('ws', `unreadable message from ${addr}`);
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    try {
      onMessage(ws, msg, addr);
    } catch (err) {
      // A bug in a game's onAction or the lobby must not take the whole server down mid-party.
      const n = log.every(`msg-error:${msg.t}`, 5000);
      if (n) log.error('ws', `handling '${msg.t}' failed${n > 1 ? ` (${n - 1} more since last report)` : ''}`, err);
    }
  });

  ws.on('close', (code) => {
    if (ws.role === 'tv') {
      tvs.delete(ws);
      log.info('tv', `TV disconnected (${addr}, code ${code})`);
    }
    if (ws.role === 'player' && ws.playerId) {
      // Only mark offline if no newer socket took over this player.
      const stillConnected = [...wss.clients].some((c) => c !== ws && c.playerId === ws.playerId);
      if (!stillConnected) {
        const p = lobby.players.get(ws.playerId);
        log.info('lobby', `Disconnected: ${p?.name ?? '?'} (#${ws.playerId}, code ${code})`);
        lobby.disconnect(ws.playerId);
        session.changed();
      }
    }
  });
});

function onMessage(ws, msg, addr) {
  switch (msg.t) {
    case 'hello':
      if (ws.role) return; // one hello per socket; a second could leave a ghost player behind
      if (msg.role === 'tv') {
        ws.role = 'tv';
        tvs.add(ws);
        lastTvSentAt = 0; // the new TV needs a snapshot now, even if the game hasn't changed
        send(ws, session.phaseMessage());
        log.info('tv', `TV connected (${addr})`);
      } else if (msg.role === 'player') {
        const result = lobby.join(msg.name, msg.token);
        if (result.error) {
          log.info('lobby', `Turned away ${addr}: the game is full`);
          return send(ws, { t: 'full' });
        }
        const p = result.player;
        // If this player was connected on another socket (old tab), close it.
        for (const other of wss.clients) {
          if (other !== ws && other.playerId === p.id) other.close(4000, 'replaced');
        }
        ws.role = 'player';
        ws.playerId = p.id;
        send(ws, { t: 'welcome', id: p.id, token: p.token, name: p.name, color: p.color });
        session.changed(); // everyone sees the new player list
        log.info('lobby', `${result.rejoined ? 'Rejoined' : 'Joined'}: ${p.name} (#${p.id}) from ${addr}`);
      }
      break;

    case 'input':
      if (ws.role === 'player') {
        lobby.setInput(ws.playerId, msg);
        noteInput(ws);
      }
      break;

    case 'act':
      if (log.debugOn) log.debug('act', `#${ws.playerId} ${String(msg.key).slice(0, 40)}`, msg.value === undefined ? undefined : String(msg.value).slice(0, 40));
      if (ws.role === 'player' && session.action(ws.playerId, msg)) queueViews();
      break;

    case 'select':
    case 'start':
    case 'end':
    case 'addBot':
    case 'removeBot': {
      const isHost = ws.role === 'tv' || (ws.role === 'player' && ws.playerId === lobby.hostId());
      if (!isHost) {
        log.debug('host', `refused '${msg.t}' from non-host #${ws.playerId ?? '?'}`);
        return send(ws, { t: 'error', message: 'Only the host can do that' });
      }
      const r =
        msg.t === 'select' ? session.select(msg.gameId)
        : msg.t === 'start' ? session.start()
        : msg.t === 'addBot' ? session.addBot()
        : msg.t === 'removeBot' ? session.removeBot()
        : session.end();
      if (r?.error) send(ws, { t: 'error', message: r.error });
      else if (log.debugOn) log.debug('host', `${msg.t}${msg.t === 'select' ? ` ${msg.gameId}` : ''} by ${ws.role === 'tv' ? 'TV' : `#${ws.playerId}`}`);
      break;
    }

    case 'ping':
      send(ws, { t: 'pong', at: msg.at });
      if (ws.role === 'player' && Number.isFinite(msg.rtt)) noteRtt(ws, msg.rtt);
      break;

    case 'clientError': {
      // Script errors from the TV page or a phone. Sampled, so a page throwing every frame can't flood the log.
      const who = ws.role === 'tv' ? 'TV' : ws.role === 'player' ? `#${ws.playerId}` : addr;
      const n = log.every(`client-error:${who}`, 10_000);
      if (n) log.warn('client', `${who}: ${String(msg.message).slice(0, 500)}${n > 1 ? ` (${n - 1} more since last report)` : ''}`);
      break;
    }
  }
}

function rawSend(ws, data) {
  ws.send(data);
  stats.msgsOut++;
  stats.bytesOut += data.length;
}

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) rawSend(ws, JSON.stringify(obj));
}

function broadcastTv(obj) {
  const data = JSON.stringify(obj);
  for (const tv of tvs) if (tv.readyState === tv.OPEN) rawSend(tv, data);
}

function broadcastAll(obj) {
  const data = JSON.stringify(obj);
  for (const c of wss.clients) if (c.role && c.readyState === c.OPEN) rawSend(c, data);
}

// TV snapshots. Card games change a few times a second at most, so most ticks would resend the
// same JSON; skip those (with a repeat now and then, in case anything was missed).
let lastTvData = '';
let lastTvSentAt = 0;
function sendTvState(state) {
  if (!tvs.size) return;
  const body = JSON.stringify(state.data);
  const now = performance.now();
  if (body === lastTvData && now - lastTvSentAt < TV_KEEPALIVE_MS) return;
  lastTvData = body;
  lastTvSentAt = now;
  // Built by hand so the snapshot is stringified once, not once for the check and again to send.
  const data = `{"t":"state","gameId":${JSON.stringify(state.gameId)},"tick":${tick},"pads":${JSON.stringify(pads())},"data":${body}}`;
  for (const tv of tvs) {
    if (tv.readyState !== tv.OPEN) continue;
    if (tv.bufferedAmount > TV_BACKLOG_BYTES) {
      stats.tvSkipped++;
      continue;
    }
    rawSend(tv, data);
  }
}

// ---------------------------------------------------------------------------
// Game loop: the server is the only source of truth.
// ---------------------------------------------------------------------------
let tick = 0;
let last = performance.now();
let tickMaxMs = 0; // longest gap between ticks this second: shows if the machine can't keep up
setInterval(() => {
  const now = performance.now();
  const gap = now - last;
  tickMaxMs = Math.max(tickMaxMs, gap);
  stats.gapMax = Math.max(stats.gapMax, gap);
  const dt = Math.min(gap / 1000, 0.1);
  last = now;
  tick++;

  let state = null;
  try {
    state = session.tick(dt);
  } catch (err) {
    // A game bug ends that game (back to the lobby) instead of crashing the server for everyone.
    log.error('game', `${session.selectedId} crashed during a tick; ending it`, err);
    session.abort('Game stopped after an error');
    return;
  }
  if (state) sendTvState(state);

  // Per-player phone updates at ~10/s.
  if (state && tick % Math.max(1, Math.round(TICK_HZ / VIEW_HZ)) === 0) pushViews();

  const work = performance.now() - now;
  stats.ticks++;
  stats.workSum += work;
  if (work > stats.workMax) stats.workMax = work;
  if (work > 8) {
    const n = log.every('slow-tick', 5000);
    if (n) log.warn('tick', `slow tick: ${work.toFixed(1)} ms of work in ${session.selectedId}${n > 1 ? ` (${n - 1} more since last report)` : ''}`);
  }
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

// Phone views. Only changed views go out: in card games most phones' screens don't change
// between updates, and every message costs Wi-Fi airtime that the other phones' presses need.
function pushViews() {
  viewsQueued = false;
  for (const c of wss.clients) {
    if (c.role !== 'player' || c.readyState !== c.OPEN) continue;
    let data;
    try {
      data = session.playerView(c.playerId);
    } catch (err) {
      const n = log.every('view-error', 5000);
      if (n) log.error('game', `${session.selectedId} playerView failed`, err);
      continue;
    }
    if (!data) continue;
    const json = JSON.stringify({ t: 'you', data });
    if (json === c.lastView) continue;
    // Wi-Fi is stalled for this phone: leave lastView alone so the newest view goes out once it drains.
    if (c.bufferedAmount > PHONE_BACKLOG_BYTES) {
      stats.viewsSkipped++;
      continue;
    }
    c.lastView = json;
    rawSend(c, json);
  }
}

// After a tap, everyone's view is refreshed right away, but taps that arrive together (bots
// acting in the same tick, several phones at once) share one refresh.
let viewsQueued = false;
function queueViews() {
  if (viewsQueued) return;
  viewsQueued = true;
  setImmediate(pushViews);
}

// ---------------------------------------------------------------------------
// Server health, for the log and /api/logs. Plain counters: no work per message beyond an add.
// ---------------------------------------------------------------------------
const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();
const stats = { since: performance.now(), msgsIn: 0, msgsOut: 0, bytesOut: 0, ticks: 0, workSum: 0, workMax: 0, gapMax: 0, tvSkipped: 0, viewsSkipped: 0 };

function statsLine() {
  const secs = Math.max(0.001, (performance.now() - stats.since) / 1000);
  const phones = [...wss.clients].filter((c) => c.role === 'player').length;
  const players = lobby.players.size;
  const bots = [...lobby.players.values()].filter((p) => p.bot).length;
  return (
    `${session.phase}${session.phase === 'lobby' ? '' : ` ${session.selectedId}`} · players ${players} (${phones} phones, ${bots} bots), TVs ${tvs.size} · ` +
    `tick work avg ${(stats.workSum / Math.max(1, stats.ticks)).toFixed(2)} ms, max ${stats.workMax.toFixed(1)} ms, longest gap ${Math.round(stats.gapMax)} ms · ` +
    // The histogram samples every 10 ms and includes that interval, so subtract it to get the actual stall.
    `event loop stall p99 ${Math.max(0, loopDelay.percentile(99) / 1e6 - 10).toFixed(1)} ms · ` +
    `in ${Math.round(stats.msgsIn / secs)}/s, out ${Math.round(stats.msgsOut / secs)}/s (${(stats.bytesOut / secs / 1024).toFixed(1)} KB/s) · ` +
    `skipped TV frames ${stats.tvSkipped}, phone views ${stats.viewsSkipped} · ` +
    `memory ${Math.round(process.memoryUsage().rss / 1048576)} MB`
  );
}

// Every 10 s at debug level; at info level once a minute, and only while a game is on.
const STATS_EVERY_S = log.debugOn ? 10 : 60;
setInterval(() => {
  if (log.debugOn || session.phase === 'playing') log.info('stats', statsLine());
  Object.assign(stats, { since: performance.now(), msgsIn: 0, msgsOut: 0, bytesOut: 0, ticks: 0, workSum: 0, workMax: 0, gapMax: 0, tvSkipped: 0, viewsSkipped: 0 });
  loopDelay.reset();
}, STATS_EVERY_S * 1000).unref();

// Housekeeping: drop long-gone players, kill dead sockets.
setInterval(() => {
  // Mid-game, keep everyone's seat (long turn-based games), so prune only outside games.
  if (session.phase !== 'playing') {
    const gone = lobby.prune();
    if (gone.length) {
      log.info('lobby', `Removed after a minute away: #${gone.join(', #')}`);
      session.changed();
    }
  }
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      log.info('ws', `No answer to ping from ${ws.role ?? 'unknown'}${ws.playerId ? ` #${ws.playerId}` : ''}; closing`);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 5000);

function listenOn(p) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(p, '0.0.0.0');
  });
}

async function start() {
  const { primary } = await joinAddresses();
  for (let i = 0; i < PORT_TRIES; i++) {
    try {
      await listenOn(PORT + i);
      port = PORT + i;
      break;
    } catch (err) {
      if (err.code === 'EADDRINUSE' && i < PORT_TRIES - 1) continue;
      const why =
        err.code !== 'EADDRINUSE' ? `can't listen on port ${PORT + i}: ${err.message}`
        : PORT_SET ? `port ${PORT} is already in use (is Couchcade already running?). Close that or pick another port, e.g. --port 3100.`
        : `ports ${PORT}-${PORT + PORT_TRIES - 1} are all in use (is Couchcade already running?). Close that or pick a port, e.g. --port 3100.`;
      log.error('server', why);
      return exitAfterStartupError();
    }
  }
  server.on('error', (err) => {
    log.error('server', `server error: ${err.message}`, err);
  });

  const joinUrl = joinUrlFor(primary);
  const tvUrl = `http://localhost:${port}/tv`;
  const lines = [
    '',
    '  Couchcade is running',
    '',
    `  TV screen:   ${tvUrl}${OPEN_BROWSER ? '   (opening it in your browser)' : ''}`,
    '               Open it on the computer connected to the TV, then press F for full screen.',
    `  Phones join: ${joinUrl}   (scan the QR code on the TV)`,
  ];
  if (port !== PORT) lines.push(`  Note:        port ${PORT} was busy, so this uses ${port}.`);
  if (primary === 'localhost') lines.push("  Warning:     no network address found, so phones can't join. Connect to Wi-Fi or set HOST_IP.");
  else if (!process.env.HOST_IP && existsSync('/.dockerenv')) {
    lines.push("  Warning:     in Docker the container's own address isn't reachable from phones.");
    lines.push('               Set HOST_IP to this computer\'s LAN address, or use --network host (Linux).');
  }
  lines.push(
    `  Logs:        ${log.file ?? 'terminal only'} (level ${log.level}; LOG_LEVEL=debug for more)${LOG_API_OFF ? '' : ` · http://localhost:${port}/api/logs`}`,
    '  Quit:        press Ctrl+C, or close this window.',
    '',
  );
  console.log(lines.join('\n'));
  log.info('server', `started on ${joinUrl} at ${TICK_HZ} ticks/s, node ${process.version}${PACKAGED ? ' (packaged)' : ''}`);
  if (OPEN_BROWSER) openBrowser(tvUrl);
}
start().catch((err) => {
  log.error('server', 'startup failed', err);
  exitAfterStartupError();
});

function exitAfterStartupError() {
  log.flushSync();
  // A double-clicked .exe closes its console window on exit, taking the reason with it.
  if (PACKAGED && process.stdin.isTTY) {
    console.log('\n  Press Enter to close this window.');
    process.stdin.once('data', () => process.exit(1));
    return;
  }
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  log.error('server', 'uncaught exception; stopping', err);
  log.flushSync();
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  const n = log.every('unhandled-rejection', 10_000);
  if (n) log.error('server', 'unhandled promise rejection', err instanceof Error ? err : String(err));
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log.info('server', `stopping (${sig})`);
    log.flushSync();
    process.exit(0);
  });
}
