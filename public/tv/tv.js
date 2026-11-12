// TV core: connection, lobby/results screens, and the render loop.
// Each game's drawing lives in /tv/games/<id>.js — this file has no game-specific code.
//
// Keys (Mac keyboard / later a keyboard on the Pi):
//   ↑/↓ pick a game · B add bot (Shift+B remove) · Enter start · Esc end game / skip results · F full screen · J join card during a game

import { renderers } from './games/index.js';

const $ = (id) => document.getElementById(id);
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
const statusEl = $('status');

let arena = { w: 1600, h: 900 };
let phase = null; // latest {t:'phase', ...} message
let joinUrl = '';

// Snapshot buffer for interpolation: render ~1.5 ticks in the past and blend
// the two snapshots around that moment, so 30 Hz updates look smooth at 60 fps.
const TICK_MS = 1000 / 30;
const RENDER_DELAY_MS = TICK_MS * 1.5;
const snapshots = [];

// --- Join info -----------------------------------------------------------------
fetch('/api/join-info')
  .then((r) => r.json())
  .then((info) => {
    arena = info.arena;
    joinUrl = info.url.replace(/\/$/, '');
    $('qr').innerHTML = info.qrSvg;
    $('qrSmall').innerHTML = info.qrSvg;
    $('url').textContent = joinUrl;
    resize();
  });

// --- WebSocket -----------------------------------------------------------------
let ws;
let pingMs = null;

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', role: 'tv' }));
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'state') {
      snapshots.push({ at: performance.now(), gameId: msg.gameId, data: msg.data });
      if (snapshots.length > 10) snapshots.shift();
    } else if (msg.t === 'phase') {
      onPhase(msg);
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

function sendCmd(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// --- Phase screens -------------------------------------------------------------
function onPhase(msg) {
  const prevPhase = phase?.phase;
  phase = msg;
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
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(window.innerWidth / arena.w, window.innerHeight / arena.h);
  canvas.style.width = `${arena.w * scale}px`;
  canvas.style.height = `${arena.h * scale}px`;
  canvas.width = Math.round(arena.w * scale * dpr);
  canvas.height = Math.round(arena.h * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

/** Two snapshots around (now - delay) and how far between them we are. */
function sample() {
  if (snapshots.length === 0) return null;
  const renderAt = performance.now() - RENDER_DELAY_MS;
  for (let i = snapshots.length - 1; i > 0; i--) {
    const a = snapshots[i - 1];
    const b = snapshots[i];
    if (a.at <= renderAt && renderAt <= b.at) return { prev: a.data, cur: b.data, alpha: (renderAt - a.at) / (b.at - a.at || 1), gameId: b.gameId };
  }
  const last = snapshots.at(-1);
  return { prev: last.data, cur: last.data, alpha: 1, gameId: last.gameId };
}

function frame() {
  const s = sample();
  const renderer = s && renderers[s.gameId];
  if (phase?.phase !== 'lobby' && renderer) {
    renderer.draw(ctx, { prev: s.prev, cur: s.cur, alpha: s.alpha, arena, now: performance.now() });
  } else {
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, arena.w, arena.h);
  }

  const connected = ws?.readyState === WebSocket.OPEN;
  statusEl.textContent = connected ? `Connected${pingMs != null ? ` · ${pingMs} ms` : ''}` : statusEl.textContent;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// --- Keys --------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (key === 'f') document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  if (key === 'j' && phase?.phase === 'playing') $('joinSmall').classList.toggle('show');
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
