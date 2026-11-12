// Phone controller. Screens follow the server's phase:
//   join → lobby (host picks + starts) → pad (joystick + the game's buttons) → results → lobby
// Turn-based games (controller.type 'screens') show the game's own screen instead of the pad;
// see "Phone screens" in server/games/index.js.
// Keeps a token in localStorage so a locked phone rejoins as the same player.
//
// Desktop testing: open http://localhost:3000 and use WASD / arrows to move,
// Space = A, Shift = B. Use different browsers/private windows for more players.

const $ = (id) => document.getElementById(id);
const SEND_HZ = 30;
const STICK_RADIUS = 60; // px of knob travel for full deflection

const state = { x: 0, y: 0, a: false, b: false };
const keys = new Set();
let ws = null;
let joined = false;
let me = null; // {id, name, color}
let phase = null; // latest phase message

$('name').value = localStorage.getItem('cc.name') ?? '';
$('joinBtn').addEventListener('click', join);
$('name').addEventListener('keydown', (e) => e.key === 'Enter' && join());
if (localStorage.getItem('cc.token')) join(); // auto-rejoin after reload

function join() {
  localStorage.setItem('cc.name', $('name').value.trim());
  joined = true;
  connect();
}

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  $('conn').textContent = 'connecting…';

  ws.onopen = () => {
    $('conn').textContent = '';
    ws.send(JSON.stringify({ t: 'hello', role: 'player', name: localStorage.getItem('cc.name') ?? '', token: localStorage.getItem('cc.token') }));
  };

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    switch (msg.t) {
      case 'welcome':
        me = msg;
        localStorage.setItem('cc.token', msg.token);
        document.documentElement.style.setProperty('--accent', msg.color);
        $('meName').textContent = $('who').textContent = msg.name;
        if (phase) render();
        break;
      case 'phase':
        phase = msg;
        if (me) render();
        break;
      case 'you':
        $('hudStatus').textContent = msg.data.status ?? '';
        if (msg.data.screen !== undefined) renderScreen(msg.data.screen);
        for (const el of document.querySelectorAll('.btn[data-key="a"]')) el.classList.toggle('dim', msg.data.dashReady === false);
        break;
      case 'error':
        $('lobbyMsg').textContent = msg.message;
        setTimeout(() => ($('lobbyMsg').textContent = ''), 3000);
        break;
      case 'full':
        $('joinMsg').textContent = 'The game is full (8 players). Try again later.';
        joined = false;
        ws.close();
        break;
    }
  };

  ws.onclose = (ev) => {
    if (ev.code === 4000) return void ($('conn').textContent = 'opened on another tab/phone');
    if (!joined) return;
    $('conn').textContent = 'reconnecting…';
    setTimeout(connect, 800);
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && joined && ws?.readyState !== WebSocket.OPEN) connect();
});

function cmd(obj) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

// --- Screens -------------------------------------------------------------------
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('active', s.id === id);
  document.body.classList.toggle('playing', id === 'pad');
  document.body.classList.toggle('screens', id === 'screen');
}

function render() {
  const isHost = phase.hostId === me.id;
  document.body.classList.toggle('host', isHost);

  if (phase.phase === 'lobby') {
    show('lobby');
    renderLobby(isHost);
  } else if (phase.phase === 'playing' && phase.controller?.type === 'screens') {
    $('hudStatus').textContent = '';
    if (!document.getElementById('screen').classList.contains('active')) {
      lastScreen = null;
      $('screenBody').textContent = 'Starting…';
      $('screenFooter').textContent = '';
    }
    show('screen');
  } else if (phase.phase === 'playing') {
    buildButtons(phase.controller);
    $('hudStatus').textContent = '';
    show('pad');
    document.documentElement.requestFullscreen?.().catch(() => {}); // Android; iPhone uses Add to Home Screen
  } else if (phase.phase === 'results') {
    renderResults(phase.results);
    show('results');
  }
}

function renderLobby(isHost) {
  const host = phase.players.find((p) => p.id === phase.hostId);
  const count = phase.players.filter((p) => p.connected).length;
  $('lobbyInfo').textContent = isHost
    ? `You're the host · ${count} player${count === 1 ? '' : 's'} in. Pick a game:`
    : `${count} player${count === 1 ? '' : 's'} in. Waiting for ${host?.name ?? 'the host'} to start…`;

  const list = $('gameList');
  list.innerHTML = '';
  for (const g of phase.games) {
    const b = document.createElement('button');
    if (g.id === phase.gameId) b.className = 'sel';
    b.disabled = !isHost;
    b.innerHTML = '<div class="t"></div><div class="d"></div>';
    b.querySelector('.t').textContent = g.title;
    b.querySelector('.d').textContent = g.description;
    b.addEventListener('click', () => cmd({ t: 'select', gameId: g.id }));
    list.append(b);
  }
  $('startBtn').style.display = isHost ? '' : 'none';
}

function renderResults(results) {
  if (!results) return;
  $('resTitle').textContent = results.title;
  const list = $('resList');
  list.innerHTML = '';
  for (const s of results.standings) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="dot" style="background:${s.color}"></span><span></span><b>${s.score}</b>`;
    li.children[1].textContent = s.id === me.id ? `${s.name} (you)` : s.name;
    list.append(li);
  }
}

$('startBtn').addEventListener('click', () => cmd({ t: 'start' }));
$('endBtn').addEventListener('click', () => cmd({ t: 'end' }));

// --- Game screens (turn-based games) ---------------------------------------------
// Rebuilt only when the screen JSON changes, so a half-typed message survives the 10/s updates.
let lastScreen = null;
function renderScreen(screen) {
  const json = JSON.stringify(screen ?? null);
  if (json === lastScreen) return;
  lastScreen = json;
  const body = $('screenBody');
  const typed = body.querySelector('input')?.value ?? '';
  const typedKey = body.querySelector('input')?.dataset.key;
  body.innerHTML = '';
  $('screenFooter').textContent = screen?.footer ?? '';
  if (!screen) return;
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const wrap = el('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  body.append(wrap);

  if (screen.title) wrap.append(el('h2', '', screen.title));
  if (screen.tag) {
    const t = el('span', 'tag', screen.tag.label);
    if (screen.tag.color) t.style.background = screen.tag.color;
    wrap.append(t);
  }
  for (const line of screen.lines ?? []) wrap.append(el('p', '', line));

  if (screen.cards?.length) {
    const cards = el('div', 'cards');
    for (const c of screen.cards) {
      const card = el('div', 'card');
      if (c.color) card.style.borderLeftColor = c.color;
      card.append(el('div', 't', c.label));
      if (c.sub) card.append(el('div', 'd', c.sub));
      cards.append(card);
    }
    wrap.append(cards);
  }

  if (screen.choose) {
    const { key, options = [], selected, locked } = screen.choose;
    const opts = el('div', 'opts');
    for (const o of options) {
      const b = el('button', `opt${o.id === selected ? ' sel' : ''}${locked ? ' locked' : ''}`);
      b.disabled = !!o.disabled;
      if (o.color) b.append(Object.assign(el('span', 'dot'), { style: `background:${o.color}` }));
      const txt = el('div');
      txt.append(el('div', 't', o.label));
      if (o.sub) txt.append(el('div', 'd', o.sub));
      b.append(txt);
      if (!locked) b.addEventListener('click', () => act(key, o.id));
      opts.append(b);
    }
    wrap.append(opts);
  }

  if (screen.input) {
    const { key, placeholder = '', maxLength = 80, submitLabel = 'Send' } = screen.input;
    const row = el('div', 'row');
    const input = el('input');
    input.dataset.key = key;
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    if (typedKey === key) input.value = typed;
    const go = el('button', 'primary', submitLabel);
    const submit = () => {
      const v = input.value.trim();
      if (!v) return;
      act(key, v);
      input.value = '';
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    row.append(input, go);
    wrap.append(row);
  }

  if (screen.actions?.length) {
    const acts = el('div', 'acts');
    for (const a of screen.actions) {
      const b = el('button', a.style === 'secondary' ? 'secondaryBtn' : 'primary', a.label);
      b.disabled = !!a.disabled;
      b.addEventListener('click', () => act(a.key));
      acts.append(b);
    }
    wrap.append(acts);
  }
}

function act(key, value) {
  navigator.vibrate?.(15);
  cmd(value === undefined ? { t: 'act', key } : { t: 'act', key, value });
}

// --- Buttons from the game's controller spec ------------------------------------
let builtFor = null;
function buildButtons(controller) {
  const spec = JSON.stringify(controller);
  if (spec === builtFor) return;
  builtFor = spec;
  const wrap = $('buttons');
  wrap.innerHTML = '';
  // Secondary (b) first so the primary (a) sits under the right thumb.
  const buttons = [...(controller?.buttons ?? [])].sort((x, y) => (x.id === 'a') - (y.id === 'a'));
  for (const { id, label } of buttons) {
    const el = document.createElement('button');
    el.className = `btn${id === 'a' ? '' : ' secondary'}`;
    el.dataset.key = id;
    el.textContent = label;
    const press = (down) => (e) => {
      e.preventDefault();
      state[id] = down;
      el.classList.toggle('down', down);
      if (down) navigator.vibrate?.(15); // Android only
    };
    el.addEventListener('touchstart', press(true), { passive: false });
    el.addEventListener('touchend', press(false));
    el.addEventListener('touchcancel', press(false));
    el.addEventListener('mousedown', press(true));
    el.addEventListener('mouseup', press(false));
    el.addEventListener('mouseleave', press(false));
    wrap.append(el);
  }
}

// --- Floating joystick -----------------------------------------------------------
const zone = $('stickZone');
const base = $('stickBase');
const knob = $('stickKnob');
const hint = $('stickHint');
let stickTouchId = null;
let origin = null;

zone.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (stickTouchId !== null) return;
  const t = e.changedTouches[0];
  stickTouchId = t.identifier;
  origin = { x: t.clientX, y: t.clientY };
  placeStick(origin.x, origin.y, origin.x, origin.y);
  base.style.display = knob.style.display = 'block';
  hint.style.display = 'none';
}, { passive: false });

zone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = [...e.changedTouches].find((t) => t.identifier === stickTouchId);
  if (!t) return;
  let dx = t.clientX - origin.x;
  let dy = t.clientY - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > STICK_RADIUS) {
    dx = (dx / dist) * STICK_RADIUS;
    dy = (dy / dist) * STICK_RADIUS;
  }
  state.x = dx / STICK_RADIUS;
  state.y = dy / STICK_RADIUS;
  placeStick(origin.x, origin.y, origin.x + dx, origin.y + dy);
}, { passive: false });

const endStick = (e) => {
  if (![...e.changedTouches].some((t) => t.identifier === stickTouchId)) return;
  stickTouchId = null;
  state.x = state.y = 0;
  base.style.display = knob.style.display = 'none';
  hint.style.display = '';
};
zone.addEventListener('touchend', endStick);
zone.addEventListener('touchcancel', endStick);

function placeStick(bx, by, kx, ky) {
  const r = zone.getBoundingClientRect();
  base.style.left = `${bx - r.left}px`;
  base.style.top = `${by - r.top}px`;
  knob.style.left = `${kx - r.left}px`;
  knob.style.top = `${ky - r.top}px`;
}

document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// --- Keyboard (desktop testing) -----------------------------------------------------
window.addEventListener('keydown', (e) => {
  if (document.activeElement?.tagName === 'INPUT') return;
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function keyboardInput() {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len, a: keys.has('Space'), b: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}

// --- Send loop -------------------------------------------------------------------------
setInterval(() => {
  if (ws?.readyState !== WebSocket.OPEN || phase?.phase !== 'playing' || phase.controller?.type === 'screens') return;
  const k = keyboardInput();
  const out = k.x || k.y || k.a || k.b ? k : state;
  ws.send(JSON.stringify({ t: 'input', x: +out.x.toFixed(3), y: +out.y.toFixed(3), a: out.a, b: out.b }));
}, 1000 / SEND_HZ);
