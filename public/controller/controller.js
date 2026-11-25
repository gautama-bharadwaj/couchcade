// Phone controller. Screens follow the server's phase:
//   join → lobby (host picks + starts) → pad (joystick + the game's buttons) → results → lobby
// Turn-based games (controller.type 'screens') show the game's own screen instead of the pad;
// see "Phone screens" in server/games/index.js.
// Keeps a token in localStorage so a locked phone rejoins as the same player.
//
// Desktop testing: open http://localhost:3000 and use WASD / arrows to move,
// Space = A, Shift = B. Use different browsers/private windows for more players.

const $ = (id) => document.getElementById(id);
const HEARTBEAT_HZ = 30; // resend the current input at least this often (keeps Wi-Fi awake too)
const STICK_MIN_MS = 15; // joystick moves are sent at most ~60/s; button changes go out at once
const PING_MS = 1000;
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
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  $('conn').textContent = 'connecting…';

  ws.onopen = () => {
    $('conn').textContent = '';
    ws.send(JSON.stringify({ t: 'hello', role: 'player', name: localStorage.getItem('cc.name') ?? '', token: localStorage.getItem('cc.token') }));
    rtt = null;
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
      case 'pong':
        rtt = Math.round(performance.now() - msg.at);
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

// Script errors go to the server log (a few per minute at most) so phone problems can be debugged
// without plugging the phone into a computer.
let errorsSent = 0;
setInterval(() => (errorsSent = 0), 60_000);
function reportError(message) {
  if (errorsSent++ >= 5) return;
  cmd({ t: 'clientError', message: `${String(message).slice(0, 400)} (${navigator.userAgent.slice(0, 80)})` });
}
window.addEventListener('error', (e) => reportError(`${e.message} at ${e.filename?.split('/').pop()}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => reportError(`unhandled rejection: ${e.reason?.stack ?? e.reason}`));

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
  document.body.classList.toggle('hasRules', phase.phase === 'playing' && !!phase.rules?.length);
  if (phase.phase !== 'playing' || phase.intro) $('rulesSheet').classList.remove('show');

  if (phase.phase === 'lobby') {
    show('lobby');
    renderLobby(isHost);
  } else if (phase.phase === 'playing' && phase.intro && phase.rules) {
    renderIntro(isHost);
    show('intro');
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

  renderPicker(isHost);
  $('startBtn').style.display = isHost ? '' : 'none';
  $('botRow').style.display = isHost ? 'flex' : 'none';
  $('removeBotBtn').disabled = !phase.players.some((p) => p.bot);
  $('addBotBtn').disabled = phase.players.length >= 8;
}

// Game picker. Only the host sees the tabs and tiles; everyone sees the selected game in the footer.
// Tabs come from the server (Board & Card, then Arcade). The open tab is always the selected
// game's tab, so the TV follows along; tapping a tab selects the game last picked there (or its first).
const lastPick = {}; // tab id -> game id
function renderPicker(isHost) {
  const games = phase.games;
  const players = phase.players.filter((p) => p.connected).length;
  const open = games.find((g) => g.id === phase.gameId)?.tab ?? phase.tabs[0]?.id;
  lastPick[open] = phase.gameId;

  const tabs = $('tabs');
  tabs.innerHTML = '';
  tabs.style.display = isHost ? '' : 'none';
  for (const t of phase.tabs) {
    const inTab = games.filter((g) => g.tab === t.id);
    if (!inTab.length) continue;
    const b = document.createElement('button');
    b.textContent = t.label;
    if (t.id === open) b.className = 'on';
    b.addEventListener('click', () => {
      const id = inTab.some((g) => g.id === lastPick[t.id]) ? lastPick[t.id] : inTab[0].id;
      if (id !== phase.gameId) cmd({ t: 'select', gameId: id });
    });
    tabs.append(b);
  }

  const list = $('gameList');
  list.innerHTML = '';
  list.style.display = isHost ? '' : 'none';
  for (const g of games) {
    if (g.tab !== open) continue;
    const b = document.createElement('button');
    if (g.id === phase.gameId) b.className = 'sel';
    b.innerHTML = '<span class="icon"></span><div><div class="t"></div><div class="m"></div></div>';
    b.querySelector('.icon').textContent = g.icon || g.title[0];
    b.querySelector('.t').textContent = g.title;
    const short = players < g.minPlayers;
    const m = b.querySelector('.m');
    m.textContent = short ? `needs ${g.minPlayers}+` : `${playerRange(g)} players`;
    m.classList.toggle('short', short);
    b.addEventListener('click', () => cmd({ t: 'select', gameId: g.id }));
    list.append(b);
  }

  const sel = games.find((g) => g.id === phase.gameId);
  $('pickFoot').classList.toggle('guest', !isHost);
  $('gameDetail').querySelector('.t').textContent = sel ? `${isHost ? '' : 'Up next: '}${sel.icon ? `${sel.icon} ` : ''}${sel.title}` : '';
  $('gameDetail').querySelector('.d').textContent = sel
    ? `${sel.description}${players < sel.minPlayers ? ` Needs ${sel.minPlayers}+ players.` : ''}`
    : '';
}

const playerRange = (g) => (g.minPlayers === g.maxPlayers ? `${g.minPlayers}` : `${g.minPlayers}–${g.maxPlayers}`);

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
$('addBotBtn').addEventListener('click', () => cmd({ t: 'addBot' }));
$('removeBotBtn').addEventListener('click', () => cmd({ t: 'removeBot' }));
$('endBtn').addEventListener('click', () => cmd({ t: 'end' }));

// --- How to play ------------------------------------------------------------------
// While the TV plays a game's rules, every phone shows the same step; the host can step or skip.
function gameTitle() {
  return phase.games.find((g) => g.id === phase.gameId)?.title ?? '';
}

function renderIntro(isHost) {
  const { step } = phase.intro;
  const steps = phase.rules;
  const host = phase.players.find((p) => p.id === phase.hostId);
  $('introKicker').textContent = `How to play ${gameTitle()} · ${step + 1} of ${steps.length}`;
  $('introDots').innerHTML = steps.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('');
  $('introTitle').textContent = steps[step].title;
  $('introText').textContent = steps[step].text;
  $('introGuest').textContent = isHost ? '' : `Watch the TV. ${host?.name ?? 'The host'} can skip ahead.`;
  $('introHost').style.display = isHost ? '' : 'none';
  $('introBack').disabled = step === 0;
  $('introNext').textContent = step === steps.length - 1 ? 'Done ›' : 'Next ›';
}
$('introBack').addEventListener('click', () => cmd({ t: 'rules', do: 'back' }));
$('introNext').addEventListener('click', () => cmd({ t: 'rules', do: 'next' }));
$('introSkip').addEventListener('click', () => cmd({ t: 'rules', do: 'skip' }));

// Anyone can read the rules again mid-game on their own phone; the host can replay them on the TV.
$('rulesBtn').addEventListener('click', () => {
  if (!phase?.rules) return;
  $('rulesSheetTitle').textContent = `How to play ${gameTitle()}`;
  const list = $('rulesList');
  list.innerHTML = '';
  for (const r of phase.rules) {
    const li = document.createElement('li');
    li.append(Object.assign(document.createElement('b'), { textContent: r.title }), Object.assign(document.createElement('span'), { textContent: r.text }));
    list.append(li);
  }
  $('rulesSheet').classList.add('show');
});
$('rulesClose').addEventListener('click', () => $('rulesSheet').classList.remove('show'));
$('rulesTvBtn').addEventListener('click', () => cmd({ t: 'rules', do: 'show' }));

// --- Game screens (turn-based games) ---------------------------------------------
// Rebuilt only when the screen JSON changes, so a half-typed message survives the 10/s updates.
let lastScreen = null;
let lastRest = null;
let dialDragging = false;
let pendingScreen;
let lastTitle = null;
function renderScreen(screen) {
  // The footer (often a countdown) updates in place, so ticking timers don't rebuild the
  // buttons under someone's thumb.
  $('screenFooter').textContent = screen?.footer ?? '';
  const json = JSON.stringify(screen ? { ...screen, footer: undefined } : null);
  if (json === lastScreen) return;
  // A dial that's the only thing that changed (someone else moved, or the server echoed our own
  // needle) is redrawn in place, so a drag in progress isn't interrupted.
  const rest = JSON.stringify(screen ? { ...screen, footer: undefined, dial: screen.dial ? { ...screen.dial, value: 0, crowd: 0, pins: 0 } : undefined } : null);
  if (screen?.dial && dialUpdate && rest === lastRest) {
    lastScreen = json;
    return dialUpdate(screen.dial);
  }
  // Never rebuild under a finger that's dragging a dial: wait until it lifts.
  if (dialDragging) return void (pendingScreen = screen);
  pendingScreen = undefined;
  lastScreen = json;
  lastRest = rest;
  // A gentle buzz when a new screen appears (your turn, a new night…). Android only.
  if (screen?.title && screen.title !== lastTitle) navigator.vibrate?.(35);
  lastTitle = screen?.title;
  const body = $('screenBody');
  const typed = body.querySelector('input')?.value ?? '';
  const typedKey = body.querySelector('input')?.dataset.key;
  body.innerHTML = '';
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
  if (screen.swatch) {
    const sw = el('div', 'swatch');
    sw.style.background = screen.swatch.color;
    if (screen.swatch.label) sw.append(el('span', '', screen.swatch.label));
    wrap.append(sw);
  }
  for (const line of screen.lines ?? []) wrap.append(el('p', '', line));
  if (screen.tally) wrap.append(buildTally(screen.tally, el));

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

  if (screen.dial) wrap.append(buildDial(screen.dial, el));
  else dialUpdate = dialNudge = null;

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

  if (screen.hand) {
    const { key, cards = [] } = screen.hand;
    const hand = el('div', 'hand');
    for (const c of cards) {
      const b = el('button', `pcard${c.color ? '' : ' wild'}${c.dim ? ' dim' : ''}${c.selected ? ' sel' : ''}`);
      if (c.color) b.style.setProperty('--card', c.color);
      b.append(document.createTextNode(c.label));
      if (c.small) b.append(el('small', '', c.small));
      b.disabled = c.playable === false;
      b.addEventListener('click', () => act(key, c.id));
      hand.append(b);
    }
    wrap.append(hand);
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

  if (screen.hexmap) wrap.append(buildHexmap(screen.hexmap, el));
  if (screen.grid) {
    const { key, cols = 5, cells = [], locked } = screen.grid;
    const grid = el('div', `grid${locked ? ' locked' : ''}`);
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (const c of cells) {
      const b = el('button', `gcell${c.dim ? ' dim' : ''}${c.ring ? ' ring' : ''}`);
      b.style.background = c.color ?? '';
      if (c.ink) b.style.color = c.ink;
      if (c.ring) b.style.outlineColor = c.ring;
      const label = el('span', 'w', c.label);
      if (c.label?.length > 6) label.style.fontSize = `${Math.max(0.46, 0.78 - (c.label.length - 6) * 0.06)}rem`;
      b.append(label);
      if (c.mark) b.append(el('span', 'm', c.mark));
      if (c.dots?.length) {
        const dots = el('span', 'dots');
        for (const color of c.dots) dots.append(Object.assign(el('i'), { style: `background:${color}` }));
        b.append(dots);
      }
      b.disabled = !!c.disabled;
      if (!locked && !c.disabled) b.addEventListener('click', () => act(key, c.id));
      grid.append(b);
    }
    wrap.append(grid);
  }

  if (screen.wheel) wrap.append(buildWheel(screen.wheel, el));
  else wheelNudge = null;

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

// Counters (see "tally" in server/games/index.js): groups of resource-style chips, each with
// − and + buttons unless locked. Sends { key, value: 'group:row:+' } (or '-').
function buildTally(t, el) {
  const { key, groups = [], locked = false } = t;
  const box = el('div', 'tally');
  for (const g of groups) {
    if (g.title) box.append(el('div', 'tt', g.title));
    const row = el('div', 'trow');
    for (const r of g.rows ?? []) {
      const cell = el('div', `tcell${r.value ? '' : ' zero'}`);
      if (r.color) cell.style.setProperty('--c', r.color);
      const mk = (dir, label, disabled) => {
        const b = el('button', 'tbtn', label);
        b.disabled = disabled;
        b.addEventListener('click', () => act(key, `${g.id}:${r.id}:${dir}`));
        return b;
      };
      if (!locked) cell.append(mk('+', '+', r.max != null && r.value >= r.max));
      const face = el('div', 'tface');
      face.append(el('span', 'ti', r.label), el('b', '', String(r.value ?? 0)));
      if (r.sub) face.append(el('small', '', r.sub));
      cell.append(face);
      if (!locked) cell.append(mk('-', '−', !r.value));
      row.append(cell);
    }
    box.append(row);
  }
  return box;
}

// Hex map (see "hexmap" in server/games/index.js): pointy-top hexes of radius 1 in map units,
// fitted to the screen width. Tap near a glowing spot to pick it; the pick is drawn at once and
// sent as { key, value: spot.id }, and the server echoes it back as `selected`.
function buildHexmap(m, el) {
  const { key, tiles = [], roads = [], buildings = [], harbors = [], spots = [], locked = false } = m;
  let sel = m.selected ?? null;
  const box = el('div', 'hexmap');
  const canvas = el('canvas');
  const xs = [...tiles.map((t) => t.x), ...harbors.map((h) => h.x)];
  const ys = [...tiles.map((t) => t.y), ...harbors.map((h) => h.y)];
  const minX = Math.min(...xs) - 1.05, maxX = Math.max(...xs) + 1.05;
  const minY = Math.min(...ys) - 1.1, maxY = Math.max(...ys) + 1.1;
  const W = Math.min(520, (document.getElementById('screenBody').clientWidth || 340) - 2);
  const k = W / (maxX - minX);
  const H = Math.round((maxY - minY) * k);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const X = (x) => (x - minX) * k;
  const Y = (y) => (y - minY) * k;
  const g = canvas.getContext('2d');
  const font = (px, w = 800) => `${w} ${Math.round(px)}px system-ui, sans-serif`;

  function hex(x, y, r) {
    g.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = ((-90 + 60 * i) * Math.PI) / 180;
      const px = X(x) + Math.cos(a) * r * k;
      const py = Y(y) + Math.sin(a) * r * k;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
  }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#123b5c';
    g.fillRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const h of harbors) {
      g.fillStyle = '#e8eef8';
      g.font = font(k * 0.3);
      g.fillText(h.label, X(h.x), Y(h.y));
    }
    for (const t of tiles) {
      hex(t.x, t.y, 0.98);
      g.fillStyle = t.color;
      g.fill();
      g.font = font(k * 0.42, 400);
      g.globalAlpha = t.num ? 0.9 : 1;
      g.fillText(t.label ?? '', X(t.x), Y(t.y) - (t.num ? k * 0.28 : 0));
      g.globalAlpha = 1;
      if (t.num) {
        g.beginPath();
        g.arc(X(t.x), Y(t.y) + k * 0.25, k * 0.26, 0, Math.PI * 2);
        g.fillStyle = '#f4ead2';
        g.fill();
        g.fillStyle = t.hot ? '#d6302a' : '#1b1f2a';
        g.font = font(k * 0.3);
        g.fillText(String(t.num), X(t.x), Y(t.y) + k * 0.26);
      }
      if (t.dim) {
        hex(t.x, t.y, 0.98);
        g.fillStyle = 'rgba(40,40,48,.72)';
        g.fill();
        g.font = font(k * 0.5, 400);
        g.fillText('☁️', X(t.x), Y(t.y));
      }
    }
    g.lineCap = 'round';
    for (const r of roads) {
      g.beginPath();
      g.moveTo(X(r.x1), Y(r.y1));
      g.lineTo(X(r.x2), Y(r.y2));
      g.lineWidth = Math.max(4, k * 0.16);
      g.strokeStyle = '#0d0f14';
      g.stroke();
      g.lineWidth = Math.max(2.5, k * 0.1);
      g.strokeStyle = r.color;
      g.stroke();
    }
    for (const b of buildings) {
      const r = k * (b.kind === 'tower' ? 0.26 : 0.19);
      g.beginPath();
      if (b.kind === 'tower') g.rect(X(b.x) - r * 0.7, Y(b.y) - r, r * 1.4, r * 2);
      else g.arc(X(b.x), Y(b.y), r, 0, Math.PI * 2);
      g.fillStyle = b.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#0d0f14';
      g.stroke();
    }
    // Choices glow soft white; your pick is solid white with a dark outline (never a player colour).
    for (const s of spots) {
      const on = s.id === sel;
      if (s.tile) {
        hex(s.x, s.y, 0.86);
        g.lineWidth = on ? 6 : 2;
        g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.75)';
        g.stroke();
      } else if (s.x1 != null) {
        g.beginPath();
        g.moveTo(X(s.x1 + (s.x2 - s.x1) * 0.2), Y(s.y1 + (s.y2 - s.y1) * 0.2));
        g.lineTo(X(s.x1 + (s.x2 - s.x1) * 0.8), Y(s.y1 + (s.y2 - s.y1) * 0.8));
        if (on) {
          g.lineWidth = k * 0.26;
          g.strokeStyle = '#0d0f14';
          g.stroke();
        }
        g.lineWidth = on ? k * 0.16 : k * 0.1;
        g.strokeStyle = on ? '#fff' : 'rgba(255,255,255,.6)';
        g.stroke();
      } else {
        g.beginPath();
        g.arc(X(s.x), Y(s.y), k * (on ? 0.24 : 0.15), 0, Math.PI * 2);
        g.fillStyle = on ? '#fff' : 'rgba(255,255,255,.3)';
        g.fill();
        g.lineWidth = on ? 4 : 2;
        g.strokeStyle = on ? '#0d0f14' : 'rgba(255,255,255,.95)';
        g.stroke();
      }
    }
  }
  if (!locked && spots.length) {
    canvas.addEventListener('pointerdown', (e) => {
      const b = canvas.getBoundingClientRect();
      const x = (e.clientX - b.left) / k + minX;
      const y = (e.clientY - b.top) / k + minY;
      let best = null;
      let bd = 0.75;
      for (const s of spots) {
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) [best, bd] = [s, d];
      }
      if (!best || best.id === sel) return;
      sel = best.id;
      draw();
      act(key, best.id);
    });
  }
  draw();
  box.append(canvas);
  return box;
}

// Color wheel (see "wheel" in server/games/index.js): rings from the middle out, hue spokes
// clockwise from the top. Tap a swatch or nudge with the buttons / arrow keys; the pick is drawn
// at once and sent to the server, which echoes it back as `selected`.
let wheelNudge = null; // (dHue, dRing) for the arrow keys, while a wheel can be picked from
function buildWheel(w, el) {
  const { key, hues, rings, colors, pins = [], target = null, first = null, locked = false, small = false } = w;
  let sel = w.selected ?? null;
  const box = el('div', 'wheel');
  const canvas = el('canvas');
  const size = Math.min(small ? 200 : 380, (document.getElementById('screenBody').clientWidth || 340) - 4);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.width = canvas.style.height = `${size}px`;
  const R = size / 2 - 3;
  const r0 = R * 0.24;
  const band = (R - r0) / rings;
  const step = (Math.PI * 2) / hues;
  const angleOf = (h) => -Math.PI / 2 + h * step; // centre of a spoke
  const centre = (c) => {
    const h = c % hues;
    const r = Math.floor(c / hues);
    const rad = r0 + band * (r + 0.5);
    return [size / 2 + Math.cos(angleOf(h)) * rad, size / 2 + Math.sin(angleOf(h)) * rad];
  };
  const g = canvas.getContext('2d');

  function cellPath(c) {
    const h = c % hues;
    const r = Math.floor(c / hues);
    const a0 = angleOf(h) - step / 2;
    const a1 = angleOf(h) + step / 2;
    g.beginPath();
    g.arc(size / 2, size / 2, r0 + band * (r + 1), a0, a1);
    g.arc(size / 2, size / 2, r0 + band * r, a1, a0, true);
    g.closePath();
  }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    for (let c = 0; c < hues * rings; c++) {
      cellPath(c);
      g.fillStyle = colors[c];
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = '#0d0f14';
      g.stroke();
    }
    // The middle previews the swatch you picked (or the secret one), big enough to judge.
    const preview = sel ?? target;
    g.beginPath();
    g.arc(size / 2, size / 2, r0 - 4, 0, Math.PI * 2);
    g.fillStyle = preview != null ? colors[preview] : '#141824';
    g.fill();
    if (preview == null) {
      g.fillStyle = '#8a93a8';
      g.font = `800 ${Math.round(r0 * 0.5)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('?', size / 2, size / 2);
    }
    if (first != null && first !== sel) ring(first, '#f2f4f8', [4, 3]);
    for (const p of pins) {
      const [x, y] = centre(p.cell);
      g.beginPath();
      g.arc(x, y, Math.max(4, band * 0.28), 0, Math.PI * 2);
      g.fillStyle = p.color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#fff';
      g.stroke();
    }
    if (target != null) ring(target, '#fff', null, 4, '#0d0f14');
    if (sel != null) ring(sel, '#fff', null, 4, '#0d0f14');
  }
  function ring(c, color, dash, width = 3, under) {
    if (under) {
      cellPath(c);
      g.lineWidth = width + 3;
      g.strokeStyle = under;
      g.stroke();
    }
    cellPath(c);
    g.setLineDash(dash ?? []);
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
    g.setLineDash([]);
  }

  function choose(c) {
    if (c == null || c === sel) return;
    sel = c;
    draw();
    act(key, String(c));
  }
  if (!locked) {
    canvas.addEventListener('pointerdown', (e) => {
      const b = canvas.getBoundingClientRect();
      const x = e.clientX - b.left - size / 2;
      const y = e.clientY - b.top - size / 2;
      const d = Math.hypot(x, y);
      if (d < r0 || d > R + 6) return;
      const r = Math.min(rings - 1, Math.floor((d - r0) / band));
      const h = Math.round((Math.atan2(y, x) + Math.PI / 2) / step + hues) % hues;
      choose(r * hues + h);
    });
    wheelNudge = (dh, dr) => {
      if (sel == null) return choose(Math.floor(rings / 2) * hues);
      const h = (((sel % hues) + dh) % hues + hues) % hues;
      const r = Math.max(0, Math.min(rings - 1, Math.floor(sel / hues) + dr));
      choose(r * hues + h);
    };
  } else wheelNudge = null;

  draw();
  box.append(canvas);
  if (!locked) {
    const nudges = el('div', 'nudges');
    for (const [label, dh, dr] of [['⟲', -1, 0], ['Lighter', 0, -1], ['Darker', 0, 1], ['⟳', 1, 0]]) {
      const b = el('button', 'secondaryBtn', label);
      b.addEventListener('click', () => wheelNudge?.(dh, dr));
      nudges.append(b);
    }
    box.append(nudges);
  }
  return box;
}

// Dial (see "dial" in server/games/index.js): a band from 0 (left idea) to 100 (right idea).
// Drag anywhere on it or use the nudge buttons; while dragging, moves go out ~12 times a second
// and the server's echo of our own needle is ignored until the finger lifts.
let dialUpdate = null; // (dial) redraws in place with new pins / crowd / value
let dialNudge = null; // (delta) for the arrow keys, while the dial can be moved
const DIAL_SEND_MS = 80;
function buildDial(d0, el) {
  let d = d0;
  let val = d.value ?? null;
  let dragging = false;
  let lastSent = 0;
  let sendTimer = null;
  const box = el('div', 'dial');
  const canvas = el('canvas');
  const W = Math.min(420, (document.getElementById('screenBody').clientWidth || 340) - 4);
  const H = d.small ? 70 : 140;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d');
  const PAD = 14;
  const bandTop = d.small ? 10 : 26;
  const bandH = H - bandTop - (d.small ? 10 : 22);
  const xOf = (v) => PAD + ((W - PAD * 2) * v) / 100;
  const ZONES = [[13, '#ffd166'], [8, '#ff9a4a'], [3, '#ff5a5f']]; // same as the TV: crackly, clear, crystal clear

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // The band: cool on the left, warm on the right.
    const grad = g.createLinearGradient(PAD, 0, W - PAD, 0);
    grad.addColorStop(0, '#2c6e8f');
    grad.addColorStop(0.5, '#3b3f4f');
    grad.addColorStop(1, '#a0522d');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect(PAD - 8, bandTop, W - PAD * 2 + 16, bandH, 10);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 1;
    for (let v = 0; v <= 100; v += 5) {
      const x = xOf(v);
      const long = v % 25 === 0;
      g.beginPath();
      g.moveTo(x, bandTop + bandH - (long ? 16 : 8));
      g.lineTo(x, bandTop + bandH);
      g.stroke();
    }
    if (d.target != null) {
      for (const [w, c] of ZONES) {
        g.fillStyle = c;
        const x0 = xOf(Math.max(0, d.target - w));
        g.fillRect(x0, bandTop, xOf(Math.min(100, d.target + w)) - x0, bandH);
      }
      g.fillStyle = '#fff';
      g.fillRect(xOf(d.target) - 1.5, bandTop - 4, 3, bandH + 8);
    }
    for (const p of d.pins ?? []) {
      g.beginPath();
      g.arc(xOf(p.value), bandTop - 9, 6, 0, Math.PI * 2);
      g.fillStyle = p.color;
      g.fill();
    }
    if (d.crowd != null) {
      const x = xOf(d.crowd);
      g.fillStyle = '#ff3b3b';
      g.fillRect(x - 2, bandTop - 2, 4, bandH + 4);
      g.beginPath();
      g.moveTo(x - 8, bandTop + bandH + 12);
      g.lineTo(x + 8, bandTop + bandH + 12);
      g.lineTo(x, bandTop + bandH + 2);
      g.fill();
    }
    if (val != null) {
      const x = xOf(val);
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#fff';
      g.lineWidth = 3;
      g.strokeStyle = '#0d0f14';
      g.fillStyle = accent;
      g.beginPath();
      g.roundRect(x - 9, bandTop + 4, 18, bandH - 8, 7);
      g.fill();
      g.stroke();
    }
  }

  function send(force) {
    clearTimeout(sendTimer);
    const wait = DIAL_SEND_MS - (performance.now() - lastSent);
    if (!force && wait > 0) return void (sendTimer = setTimeout(() => send(true), wait));
    lastSent = performance.now();
    cmd({ t: 'act', key: d.key, value: String(val) });
  }
  function setVal(v, force) {
    v = Math.max(0, Math.min(100, Math.round(v)));
    if (v === val && !force) return;
    val = v;
    draw();
    send(force);
  }
  const valAt = (e) => {
    const b = canvas.getBoundingClientRect();
    return ((e.clientX - b.left - PAD) / (W - PAD * 2)) * 100;
  };
  if (!d.locked) {
    canvas.addEventListener('pointerdown', (e) => {
      dragging = dialDragging = true;
      canvas.setPointerCapture(e.pointerId);
      navigator.vibrate?.(10);
      setVal(valAt(e));
    });
    canvas.addEventListener('pointermove', (e) => dragging && setVal(valAt(e)));
    const up = () => {
      if (!dragging) return;
      dragging = dialDragging = false;
      send(true);
      if (pendingScreen !== undefined) {
        const next = pendingScreen;
        pendingScreen = undefined;
        renderScreen(next);
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    dialNudge = (delta) => setVal((val ?? 50) + delta, true);
  } else dialNudge = null;

  dialUpdate = (nd) => {
    d = nd;
    if (!dragging && nd.value != null && performance.now() - lastSent > 400) val = nd.value;
    draw();
  };

  const labels = el('div', 'dialLabels');
  labels.append(el('span', 'l', `◀ ${d.left}`), el('span', 'r', `${d.right} ▶`));
  box.append(canvas, labels);
  draw();
  if (!d.locked) {
    const nudges = el('div', 'nudges');
    for (const [label, delta] of [['◀◀', -5], ['◀', -1], ['▶', 1], ['▶▶', 5]]) {
      const b = el('button', 'secondaryBtn', label);
      b.addEventListener('click', () => dialNudge?.(delta));
      nudges.append(b);
    }
    box.append(nudges);
  }
  return box;
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
      el.classList.toggle('down', down);
      if (state[id] === down) return;
      state[id] = down;
      sendInput(); // a press goes out now, not on the next heartbeat
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
  sendStickSoon();
}, { passive: false });

const endStick = (e) => {
  if (![...e.changedTouches].some((t) => t.identifier === stickTouchId)) return;
  stickTouchId = null;
  state.x = state.y = 0;
  sendInput();
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
  const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.code];
  if (nudge && wheelNudge && phase?.controller?.type === 'screens') {
    e.preventDefault();
    return wheelNudge(...nudge);
  }
  if (nudge && dialNudge && phase?.controller?.type === 'screens') {
    e.preventDefault();
    return dialNudge(nudge[0] || -nudge[1] * 5);
  }
  if (e.repeat) return;
  keys.add(e.code);
  sendInput();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  sendInput();
});
window.addEventListener('blur', () => keys.clear());

function keyboardInput() {
  const x = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  const y = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len, a: keys.has('Space'), b: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}

// --- Sending input ---------------------------------------------------------------------
// Button presses and releases are sent the moment they happen. Joystick moves are sent as they
// happen too, at most once per STICK_MIN_MS. A heartbeat resends the current state so the server
// always has fresh input, and so the phone's Wi-Fi radio doesn't doze off between presses.
let lastSentAt = 0;
let stickTimer = 0;
let rtt = null;

function sendInput() {
  clearTimeout(stickTimer);
  stickTimer = 0;
  if (ws?.readyState !== WebSocket.OPEN || phase?.phase !== 'playing' || phase.controller?.type === 'screens') return;
  const k = keyboardInput();
  const out = k.x || k.y || k.a || k.b ? k : state;
  ws.send(JSON.stringify({ t: 'input', x: +out.x.toFixed(3), y: +out.y.toFixed(3), a: out.a, b: out.b }));
  lastSentAt = performance.now();
}

function sendStickSoon() {
  const wait = STICK_MIN_MS - (performance.now() - lastSentAt);
  if (wait <= 0) sendInput();
  else if (!stickTimer) stickTimer = setTimeout(sendInput, wait);
}

setInterval(() => {
  if (performance.now() - lastSentAt >= 1000 / HEARTBEAT_HZ - 2) sendInput();
}, 1000 / HEARTBEAT_HZ / 2);

// Round-trip time to the server. The last one rides along so the TV's latency overlay (L) can show it.
setInterval(() => {
  if (ws?.readyState === WebSocket.OPEN && me) ws.send(JSON.stringify({ t: 'ping', at: performance.now(), rtt }));
}, PING_MS);
