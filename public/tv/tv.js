// TV core: connection, lobby/results screens, and the render loop.
// Each game's drawing lives in /tv/games/<id>.js — this file has no game-specific code.
//
// Keys (Mac keyboard / later a keyboard on the Pi):
//   ↑/↓ pick a game · B add bot (Shift+B remove) · Enter start · M mute · N narrator on/off · L latency overlay · Esc end game / skip results · F full screen · J join card during a game · I switch join address

import { renderers } from './games/index.js';
import audio from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const statusEl = $('status');

let arena = { w: 1600, h: 900 };
let phase = null; // latest {t:'phase', ...} message
let joinUrl = '';
let joinCandidates = []; // this machine's other addresses, for "Wrong address? Switch"
let joinIndex = 0;

// Snapshot buffer for interpolation: render ~1.5 ticks in the past and blend the two
// snapshots around that moment, so updates look smooth at any frame rate. This delay is part
// of the press-to-screen time, so it follows the server's tick rate (60/s → 25 ms).
let renderDelayMs = 1.5 * (1000 / 60);
const snapshots = [];
let net = null; // latest {t:'net'} latency stats
let showNet = false;

// --- Join info -----------------------------------------------------------------
fetch('/api/join-info')
  .then((r) => r.json())
  .then((info) => {
    arena = info.arena;
    if (info.tickHz) renderDelayMs = 1.5 * (1000 / info.tickHz);
    showJoin(info);
    joinCandidates = info.candidates ?? [];
    joinIndex = Math.max(0, joinCandidates.findIndex((c) => c.address === info.address));
    $('switchIp').hidden = joinCandidates.length < 2;
    resize();
  });

function showJoin(info) {
  joinUrl = info.url.replace(/\/$/, '');
  $('qr').innerHTML = info.qrSvg;
  $('qrSmall').innerHTML = info.qrSvg;
  $('url').textContent = joinUrl;
}

// A machine with VPNs, VMs or two networks can guess the wrong address for the QR code.
// Cycle through the others; the server draws the code (and only for its own addresses).
async function switchJoinAddress() {
  if (joinCandidates.length < 2) return showToast('No other network addresses found (HOST_IP sets one)');
  const i = (joinIndex + 1) % joinCandidates.length;
  const c = joinCandidates[i];
  const info = await fetch(`/api/join-info?ip=${encodeURIComponent(c.address)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!info) return showToast('Could not switch address; reload the page');
  joinIndex = i;
  showJoin(info);
  showToast(`Join address ${i + 1}/${joinCandidates.length}: ${c.address} (${c.name})`);
}
$('switchIp').addEventListener('click', switchJoinAddress);

// --- WebSocket -----------------------------------------------------------------
let ws;
let pingMs = null;

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', role: 'tv' }));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'state') {
      const prevSnap = snapshots.at(-1);
      onSnapshot(msg, prevSnap?.gameId === msg.gameId ? prevSnap.data : null);
      snapshots.push({ at: performance.now(), gameId: msg.gameId, data: msg.data, pads: msg.pads });
      if (snapshots.length > 20) snapshots.shift();
    } else if (msg.t === 'phase') {
      onPhase(msg);
    } else if (msg.t === 'net') {
      net = msg;
    } else if (msg.t === 'pong') {
      pingMs = Math.round(performance.now() - msg.at);
    }
  };
  ws.onclose = () => {
    statusEl.textContent = 'Disconnected — retrying…';
    setTimeout(connect, 1000);
  };
}
connect();
setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: 'ping', at: performance.now() })), 2000);

// Script errors go to the server log (a few per minute at most), so a TV problem shows up in
// logs/couchcade.log instead of only in a console nobody has open.
let errorsSent = 0;
setInterval(() => (errorsSent = 0), 60_000);
function reportError(message) {
  if (errorsSent++ >= 5) return;
  sendCmd({ t: 'clientError', message: String(message).slice(0, 500) });
}
window.addEventListener('error', (e) => reportError(`${e.message} at ${e.filename?.split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => reportError(`unhandled rejection: ${e.reason?.stack ?? e.reason}`));

function sendCmd(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// --- Phase screens -------------------------------------------------------------
function onPhase(msg) {
  const prevPhase = phase?.phase;
  const prevCount = phase?.players.length ?? 0;
  phase = msg;
  phaseSounds(prevPhase, msg, prevCount);
  if (msg.phase === 'playing' && prevPhase !== 'playing') snapshots.length = 0;

  $('lobby').classList.toggle('show', msg.phase === 'lobby');
  $('results').classList.toggle('show', msg.phase === 'results');
  if (msg.phase !== 'playing') $('joinSmall').classList.remove('show');

  renderGames(msg);
  renderPlayers(msg);
  if (msg.phase === 'results' && msg.results) renderResults(msg.results);
}

function renderGames(msg) {
  const list = $('games');
  list.innerHTML = '';
  for (const g of msg.games) {
    const li = document.createElement('li');
    if (g.id === msg.gameId) li.className = 'sel';
    li.innerHTML = '<div class="t"></div><div class="d"></div>';
    li.querySelector('.t').textContent = g.title;
    li.querySelector('.d').textContent = g.description;
    list.append(li);
  }
  const host = msg.players.find((p) => p.id === msg.hostId);
  const sel = msg.games.find((g) => g.id === msg.gameId);
  $('hint').textContent = host ? `${host.name} picks the game and presses Start on their phone.` : 'Scan the code to join.';
  if (sel && host && msg.players.filter((p) => p.connected).length < sel.minPlayers) {
    $('hint').textContent = `${sel.title} needs ${sel.minPlayers}+ players.`;
  }
}

function renderPlayers(msg) {
  const list = $('players');
  list.innerHTML = '';
  for (const p of msg.players) {
    const li = document.createElement('li');
    if (!p.connected) li.className = 'off';
    li.innerHTML = `<span class="dot" style="background:${p.color}"></span>${p.id === msg.hostId ? '<span class="host">HOST</span>' : ''}<span></span>`;
    li.lastChild.textContent = p.connected ? p.name : `${p.name} (reconnecting)`;
    list.append(li);
  }
}

function renderResults(results) {
  $('resultsTitle').textContent = results.title;
  const list = $('standings');
  list.innerHTML = '';
  for (const s of results.standings) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${s.color}"></span><span></span><span class="score">${s.score}</span>`;
    li.children[1].textContent = s.name;
    list.append(li);
  }
}

// --- Rendering -------------------------------------------------------------------
// The canvas is drawn at most 1.6x the 1600x900 arena (2560x1440 pixels). A 4K TV on a Mac
// would otherwise get a 3840x2160 canvas: 2.25x the pixels to fill every frame, for detail
// nobody sees from the couch, and enough to drop frames on a Raspberry Pi. The browser
// stretches it to fill the screen. /tv?res=2 raises the cap, /tv?res=1 lowers it for slow machines.
const MAX_RES = Number(new URLSearchParams(location.search).get('res')) || 1.6;
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(window.innerWidth / arena.w, window.innerHeight / arena.h);
  const px = Math.min(scale * dpr, MAX_RES);
  canvas.style.width = `${arena.w * scale}px`;
  canvas.style.height = `${arena.h * scale}px`;
  canvas.width = Math.round(arena.w * px);
  canvas.height = Math.round(arena.h * px);
  ctx.setTransform(px, 0, 0, px, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/** Two snapshots around (now - delay) and how far between them we are. */
function sample() {
  if (snapshots.length === 0) return null;
  const renderAt = performance.now() - renderDelayMs;
  for (let i = snapshots.length - 1; i > 0; i--) {
    const a = snapshots[i - 1];
    const b = snapshots[i];
    if (a.at <= renderAt && renderAt <= b.at) return { prev: a.data, cur: b.data, alpha: (renderAt - a.at) / (b.at - a.at || 1), gameId: b.gameId, pads: b.pads };
  }
  const last = snapshots.at(-1);
  return { prev: last.data, cur: last.data, alpha: 1, gameId: last.gameId, pads: last.pads };
}

function frame() {
  requestAnimationFrame(frame); // first, so one bad frame can't stop the TV for good
  const s = sample();
  const renderer = s && renderers[s.gameId];
  if (phase?.phase !== 'lobby' && renderer) {
    try {
      renderer.draw(ctx, { prev: s.prev, cur: s.cur, alpha: s.alpha, arena, now: performance.now() });
    } catch (err) {
      console.error(err);
      reportError(`${s.gameId} draw: ${err?.stack ?? err}`);
      resize(); // also resets the canvas state the renderer may have left half-changed
    }
    if (showNet) drawNet(s.pads);
  } else {
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, arena.w, arena.h);
  }

  const connected = ws?.readyState === WebSocket.OPEN;
  const status = connected ? `Connected${pingMs != null ? ` · ${pingMs} ms` : ''}` : statusEl.textContent;
  if (statusEl.textContent !== status) statusEl.textContent = status; // no DOM write per frame
}
requestAnimationFrame(frame);

// --- Latency overlay (L) ------------------------------------------------------------
// Per phone: round trip to the server, the worst Wi-Fi stall this second, and an estimate of
// press-to-screen time. The light next to each name turns on when the server sees that phone
// hold a button, drawn through the same buffer as the game. Film the phone and TV together in
// slow motion and count frames between the button lighting on the phone and here: that is the
// true number, including the TV's own picture processing, which no code can see.
function drawNet(pads) {
  const rows = net?.players ?? [];
  const x = 80;
  const y = 110; // below the game's own title line
  const w = 800;
  const rowH = 40;
  const h = 82 + Math.max(1, rows.length) * rowH + 60;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 16, 0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e8ecf5';
  ctx.fillText('Latency  (L to hide)', x + 20, y + 26);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#8b93a8';
  const tickMs = 1000 / (net?.tickHz ?? 60);
  ctx.fillText(`Server ${net?.tickHz ?? '?'} ticks/s, slowest ${net?.tickMaxMs ?? '?'} ms · TV buffer ${Math.round(renderDelayMs)} ms`, x + 20, y + 54);
  ctx.fillText('ping (worst)', x + 300, y + 82);
  ctx.fillText('Wi-Fi stall', x + 480, y + 82);
  ctx.fillText('press → screen*', x + 640, y + 82);
  if (!rows.length) ctx.fillText('No phones sending input yet.', x + 20, y + 82 + rowH);
  rows.forEach((p, i) => {
    const ry = y + 82 + (i + 1) * rowH;
    const held = pads?.[p.id];
    ctx.fillStyle = held ? p.color : 'rgba(255,255,255,0.08)';
    ctx.fillRect(x + 20, ry - 14, 28, 28);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 20, ry - 14, 28, 28);
    ctx.fillStyle = '#e8ecf5';
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText(p.name.slice(0, 14), x + 62, ry);
    ctx.font = '18px system-ui, sans-serif';
    const est = p.rtt == null ? null : Math.round(p.rtt / 2 + tickMs / 2 + renderDelayMs + 8);
    ctx.fillStyle = latColor(p.rttMax, 30, 80);
    ctx.fillText(p.rtt == null ? '…' : `${p.rtt} ms (${p.rttMax})`, x + 300, ry);
    ctx.fillStyle = latColor(p.gapMax, 50, 120);
    ctx.fillText(`${p.gapMax} ms`, x + 480, ry);
    ctx.fillStyle = '#e8ecf5';
    ctx.fillText(est == null ? '…' : `≈ ${est} ms`, x + 640, ry);
  });
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#6b7390';
  ctx.fillText('* code + Wi-Fi only. Add the TV\'s own lag (often 15–30 ms in Game mode, 50–150 ms without).', x + 20, y + h - 14);
  ctx.restore();
}

function latColor(ms, ok, bad) {
  if (ms == null) return '#8b93a8';
  return ms <= ok ? '#4cd97b' : ms <= bad ? '#ffc93c' : '#ff5a5f';
}

// --- Sound ---------------------------------------------------------------------------
// Renderers may export onSnapshot(prev, cur, audio) to play sounds when the game state changes.
function onSnapshot(msg, prevData) {
  const renderer = renderers[msg.gameId];
  if (!renderer?.onSnapshot || !audio.isUnlocked()) return;
  try {
    renderer.onSnapshot(prevData, msg.data, audio);
  } catch (err) {
    console.error('sound hook failed', err);
    reportError(`${msg.gameId} sound hook: ${err?.message}`);
  }
}

function phaseSounds(prevPhase, msg, prevCount) {
  if (msg.phase !== 'playing') audio.ambience(null);
  if (msg.phase === 'playing' && prevPhase !== 'playing') audio.sfx.whoosh();
  if (msg.phase === 'results' && prevPhase !== 'results' && msg.results) {
    audio.sfx.jingle(); // games announce their own winners
  }
  if (msg.phase === 'lobby' && msg.players.length > prevCount && prevPhase) audio.sfx.chime();
}

function unlockSound() {
  if (audio.isUnlocked()) return;
  audio.unlock();
  $('soundHint').classList.add('hide');
  showToast(audio.isMuted() ? 'Sound is muted (M to unmute)' : 'Sound on · M mute · N narrator');
}
window.addEventListener('pointerdown', unlockSound);

let toastTimer = 0;
function showToast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// --- Keys --------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  unlockSound();
  if (key === 'm') showToast(audio.toggleMute() ? 'Sound muted' : 'Sound on');
  if (key === 'l') showToast((showNet = !showNet) ? 'Latency overlay on' : 'Latency overlay off');
  if (key === 'n') showToast(audio.toggleNarrator() ? 'Narrator on' : 'Narrator off');
  if (key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  if (key === 'j' && phase?.phase === 'playing') $('joinSmall').classList.toggle('show');
  if (key === 'i' && !e.repeat) switchJoinAddress();
  if (!phase) return;
  if (phase.phase === 'lobby' && (key === 'arrowdown' || key === 'arrowup')) {
    const i = phase.games.findIndex((g) => g.id === phase.gameId);
    const next = phase.games.at((i + (key === 'arrowdown' ? 1 : -1)) % phase.games.length);
    sendCmd({ t: 'select', gameId: next.id });
  }
  if (phase.phase === 'lobby' && key === 'enter') sendCmd({ t: 'start' });
  if (phase.phase === 'lobby' && key === 'b') sendCmd({ t: e.shiftKey ? 'removeBot' : 'addBot' });
  if (key === 'escape') sendCmd({ t: 'end' });
});
