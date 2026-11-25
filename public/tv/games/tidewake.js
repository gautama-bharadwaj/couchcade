// Tidewake TV: the island on the left (tiles, numbers, harbors, everyone's trails and buildings,
// the Ash Cloud), the crews and their points on the right, dice and the open trade offer on top
// of the sea. Hands stay on the phones. Rules are in server/games/tidewake.js.

import { circle, text } from './util.js';

const S3 = Math.sqrt(3);
const RES = {
  wood: { icon: '🪵', name: 'Driftwood', tile: '#9a6a3c', light: '#c58c55' },
  coco: { icon: '🥥', name: 'Coconut', tile: '#3f9a4a', light: '#62c26a' },
  fish: { icon: '🐟', name: 'Fish', tile: '#2a8fb8', light: '#4fb8de' },
  shell: { icon: '🐚', name: 'Shell', tile: '#e0a48c', light: '#f3c6b0' },
  stone: { icon: '🪨', name: 'Stone', tile: '#5d6474', light: '#7f8798' },
};
const ORDER = ['wood', 'coco', 'fish', 'shell', 'stone'];
const COSTS = [
  ['🪢 Trail', '🪵🥥'],
  ['🛖 Hut · 1 pt', '🪵🥥🐟🐚'],
  ['🗼 Lighthouse · 2 pts', '🪨🪨🪨🐚🐚'],
  ['🍾 Bottle', '🐟🐚🪨'],
];
const BOARD = { x: 60, y: 108, w: 1080, h: 742 };
const PANEL_X = 1170;

let pops = []; // { x, y, color, at }
let floats = []; // { text, x, y, at }
let lastSeq = 0;
let rollAt = -1e9;
let lastRoll = 0;
let shakeUntil = 0;
let flashAt = -1e9;
let banner = null; // { text, color, at }

const fmt = (h) => ORDER.filter((r) => h?.[r] > 0).map((r) => RES[r].icon.repeat(Math.min(h[r], 5)) + (h[r] > 5 ? `×${h[r]}` : '')).join(' ');
const pipCount = (n) => 6 - Math.abs(7 - n);

function layout(s) {
  const xs = s.tiles.map((t) => t.x);
  const ys = s.tiles.map((t) => t.y);
  const w = Math.max(...xs) - Math.min(...xs) + 2 + 1.4;
  const h = Math.max(...ys) - Math.min(...ys) + 2 + 1.4;
  const k = Math.min(BOARD.w / w, BOARD.h / h);
  const cx = BOARD.x + BOARD.w / 2;
  const cy = BOARD.y + BOARD.h / 2;
  return { k, X: (x) => cx + x * k, Y: (y) => cy + y * k };
}

function hexPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    const now = performance.now();
    if (!prev) {
      say(pick(['Welcome to Tidewake. Claim your corner of the island.', 'A new island rises from the sea. Time to settle it.']), { delay: 0.4 });
      lastSeq = s.event?.seq ?? 0;
      lastRoll = s.rollSeq;
      return;
    }
    if (s.rollSeq !== lastRoll) {
      lastRoll = s.rollSeq;
      rollAt = now;
      sfx.shuffle(5);
    }
    if (s.turn !== prev.turn && s.turn && s.phase === 'roll') {
      sfx.click();
      say(`${nameOf(s.turn)}'s turn.`, { delay: 0.2 });
    }
    if (s.phase === 'setup' && (s.turn !== prev.turn || s.step !== prev.step) && s.step === 'hut' && s.turn) sfx.ding();
    if (s.highlight && JSON.stringify(s.highlight) !== JSON.stringify(prev.highlight)) sfx.tick();

    const e = s.event;
    if (!e || e.seq === lastSeq) return;
    lastSeq = e.seq;
    const L = layout(s);
    const col = s.players.find((p) => p.id === e.by)?.color ?? '#fff';
    switch (e.kind) {
      case 'build': {
        let x;
        let y;
        if (e.what === 'trail') {
          const [a, b] = s.edges[e.spot];
          x = (s.verts[a][0] + s.verts[b][0]) / 2;
          y = (s.verts[a][1] + s.verts[b][1]) / 2;
        } else [x, y] = s.verts[e.spot];
        pops.push({ x: L.X(x), y: L.Y(y), color: col, at: now });
        if (e.what === 'trail') sfx.thud(0.3);
        else {
          sfx.thud(0.6);
          sfx.pickup();
        }
        if (e.what === 'light') say(`${nameOf(e.by)} raised a Lighthouse!`, { delay: 0.2 });
        break;
      }
      case 'roll':
        setTimeout(() => {
          if (e.blocked) sfx.buzz();
          else sfx.ding();
          say(String(e.sum), { interrupt: true });
        }, 700);
        // "+🪵" floats over each crew in the panel.
        setTimeout(() => {
          s.players.forEach((p, i) => {
            const g = s.gains?.[p.id];
            if (g) floats.push({ text: `+${fmt(g)}`, x: PANEL_X + 290, y: 150 + i * (s.players.length <= 4 ? 96 : 78), at: performance.now() });
          });
        }, 800);
        break;
      case 'erupt':
        setTimeout(() => {
          sfx.boom();
          shakeUntil = performance.now() + 900;
          flashAt = performance.now();
          banner = { text: '🌋 ERUPTION!', color: '#ff5a3c', at: performance.now() };
          say(pick(['Seven! The volcano erupts!', 'Eruption! Hold on to your coconuts.', 'Seven. Here comes the ash!']), { interrupt: true });
          const lost = Object.entries(e.lost ?? {});
          lost.forEach(([pid, k]) => {
            const i = s.players.findIndex((p) => p.id === pid);
            floats.push({ text: `−${k} cards`, x: PANEL_X + 290, y: 150 + i * (s.players.length <= 4 ? 96 : 78), at: performance.now(), color: '#ff8c8c' });
          });
        }, 700);
        break;
      case 'ash':
        sfx.whoosh();
        break;
      case 'steal':
        sfx.swish();
        say(`${nameOf(e.by)} steals from ${nameOf(e.from)}.`);
        break;
      case 'offer':
        sfx.swish();
        break;
      case 'deal':
        sfx.jingle();
        banner = { text: `🤝 ${nameOf(e.by)} and ${nameOf(e.with)} made a deal`, color: '#3ddc84', at: now };
        break;
      case 'bank':
        sfx.click();
        break;
      case 'buyBottle':
        sfx.pickup();
        break;
      case 'bottle':
        sfx.chime();
        break;
      case 'monkey':
        sfx.evil();
        say(`Monkey business! ${nameOf(e.by)} grabs ${e.got}.`);
        break;
      case 'award':
        sfx.fanfare();
        banner = { text: e.award === 'explorer' ? `🧭 ${nameOf(e.by)} is the Explorer (+2)` : `🤝 ${nameOf(e.by)} is the Trader (+1)`, color: col, at: now };
        say(e.award === 'explorer' ? `${nameOf(e.by)} is the Explorer.` : `${nameOf(e.by)} is the island's top Trader.`, { delay: 0.3 });
        break;
      case 'setupDone':
        sfx.chime();
        say('The island is settled. Let the harvest begin!', { delay: 0.5 });
        break;
      case 'win':
        sfx.fanfare();
        banner = { text: `👑 ${nameOf(e.by)} wins!`, color: col, at: now, long: true };
        say(`${nameOf(e.by)} rules the island!`, { delay: 0.5, interrupt: true });
        break;
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    // Sea.
    const sea = ctx.createRadialGradient(600, 460, 120, 600, 460, 900);
    sea.addColorStop(0, '#1f6f96');
    sea.addColorStop(1, '#0b2236');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (now < shakeUntil) ctx.translate((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);

    const L = layout(s);
    const { k, X, Y } = L;
    const rolled = s.dice && now - rollAt > 700 ? s.dice[0] + s.dice[1] : null;
    const playerById = new Map(s.players.map((p) => [p.id, p]));

    // Waves.
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      const y = 60 + i * 95 + Math.sin(now / 1400 + i) * 8;
      ctx.beginPath();
      for (let x = 0; x <= 1140; x += 20) ctx.lineTo(x, y + Math.sin(x / 70 + now / 900 + i) * 6);
      ctx.stroke();
    }

    // Beach rim under every tile, then the tiles.
    for (const t of s.tiles) {
      hexPath(ctx, X(t.x), Y(t.y), k * 1.08);
      ctx.fillStyle = '#e9d7a5';
      ctx.fill();
    }
    s.tiles.forEach((t, i) => {
      const x = X(t.x);
      const y = Y(t.y);
      hexPath(ctx, x, y, k * 0.97);
      if (t.res) {
        const g = ctx.createLinearGradient(x, y - k, x, y + k);
        g.addColorStop(0, RES[t.res].light);
        g.addColorStop(1, RES[t.res].tile);
        ctx.fillStyle = g;
      } else {
        const g = ctx.createRadialGradient(x, y, 4, x, y, k);
        g.addColorStop(0, '#ff7a3c');
        g.addColorStop(0.35, '#7a2f22');
        g.addColorStop(1, '#3a201c');
        ctx.fillStyle = g;
      }
      ctx.fill();
      // The rolled number glows.
      if (rolled && t.num === rolled && i !== s.ash) {
        const a = 0.5 + 0.5 * Math.sin(now / 120);
        ctx.lineWidth = 6;
        ctx.strokeStyle = `rgba(255,235,140,${0.5 + 0.5 * a})`;
        ctx.stroke();
      }
      ctx.font = `${Math.round(k * (t.res ? 0.5 : 0.8))}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t.res ? RES[t.res].icon : '🌋', x, y - (t.num ? k * 0.34 : 0));
      if (t.num) {
        circle(ctx, x, y + k * 0.24, k * 0.3, '#f6ecd2');
        const hot = t.num === 6 || t.num === 8;
        text(ctx, String(t.num), x, y + k * 0.22, { size: Math.round(k * 0.32), weight: 900, color: hot ? '#d6302a' : '#1b1f2a', baseline: 'middle' });
        const dots = pipCount(t.num);
        for (let d = 0; d < dots; d++) circle(ctx, x + (d - (dots - 1) / 2) * k * 0.08, y + k * 0.42, k * 0.025, hot ? '#d6302a' : '#1b1f2a');
      }
    });

    // Harbors: a little dock to both corners and a sign.
    for (const h of s.harbors) {
      const [a, b] = s.edges[h.e];
      for (const v of [a, b]) {
        ctx.beginPath();
        ctx.moveTo(X(h.x), Y(h.y));
        ctx.lineTo(X(s.verts[v][0]), Y(s.verts[v][1]));
        ctx.strokeStyle = '#8a6a44';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
      circle(ctx, X(h.x), Y(h.y), k * 0.34, '#f4ead2');
      if (h.kind === 'any') text(ctx, '3:1', X(h.x), Y(h.y) + 1, { size: Math.round(k * 0.27), weight: 900, color: '#1b1f2a', baseline: 'middle' });
      else {
        text(ctx, RES[h.kind].icon, X(h.x), Y(h.y) - k * 0.08, { size: Math.round(k * 0.26), baseline: 'middle' });
        text(ctx, '2:1', X(h.x), Y(h.y) + k * 0.19, { size: Math.round(k * 0.17), weight: 900, color: '#1b1f2a', baseline: 'middle' });
      }
    }

    // Ash Cloud.
    {
      const t = s.tiles[s.ash];
      const x = X(t.x);
      const y = Y(t.y);
      hexPath(ctx, x, y, k * 0.97);
      ctx.fillStyle = 'rgba(30,30,36,0.55)';
      ctx.fill();
      const bob = Math.sin(now / 600) * 4;
      for (const [dx, dy, r] of [[-0.3, -0.05, 0.3], [0.05, -0.2, 0.36], [0.35, -0.02, 0.28], [0, 0.12, 0.3]]) circle(ctx, x + dx * k, y + dy * k + bob, r * k, 'rgba(120,120,130,0.92)');
      text(ctx, 'ASH', x, y + bob, { size: Math.round(k * 0.22), weight: 900, color: '#22232a', baseline: 'middle' });
    }

    // Trails, then buildings.
    ctx.lineCap = 'round';
    for (const tr of s.trails) {
      const [a, b] = s.edges[tr.e];
      const [x1, y1] = s.verts[a];
      const [x2, y2] = s.verts[b];
      const ax = X(x1 + (x2 - x1) * 0.14);
      const ay = Y(y1 + (y2 - y1) * 0.14);
      const bx = X(x1 + (x2 - x1) * 0.86);
      const by = Y(y1 + (y2 - y1) * 0.86);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = k * 0.17;
      ctx.stroke();
      ctx.strokeStyle = playerById.get(tr.owner)?.color ?? '#fff';
      ctx.lineWidth = k * 0.11;
      ctx.stroke();
    }
    for (const b of s.buildings) {
      const [vx, vy] = s.verts[b.v];
      drawBuilding(ctx, X(vx), Y(vy), k, b.kind, playerById.get(b.owner)?.color ?? '#fff');
    }

    // What the current player is pointing at on their phone.
    if (s.highlight && s.turn) {
      const c = playerById.get(s.turn)?.color ?? '#fff';
      const a = 0.5 + 0.5 * Math.sin(now / 150);
      ctx.strokeStyle = c;
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.6 + 0.4 * a;
      const h = s.highlight;
      if (h.kind === 'tile') {
        const t = s.tiles[h.id];
        hexPath(ctx, X(t.x), Y(t.y), k * 0.9);
        ctx.lineWidth = 8;
        ctx.stroke();
      } else if (h.kind === 'edge') {
        const [p, q] = s.edges[h.id];
        ctx.beginPath();
        ctx.moveTo(X(s.verts[p][0]), Y(s.verts[p][1]));
        ctx.lineTo(X(s.verts[q][0]), Y(s.verts[q][1]));
        ctx.lineWidth = k * 0.16;
        ctx.setLineDash([k * 0.12, k * 0.1]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.beginPath();
        ctx.arc(X(s.verts[h.id][0]), Y(s.verts[h.id][1]), k * (0.22 + 0.06 * a), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Pops when something is built.
    pops = pops.filter((p) => now - p.at < 700);
    for (const p of pops) {
      const t = (now - p.at) / 700;
      ctx.beginPath();
      ctx.arc(p.x, p.y, k * (0.2 + t * 0.8), 0, Math.PI * 2);
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    drawTop(ctx, s, now, playerById);
    drawPanel(ctx, s, now);

    // Floating gains / losses over the panel.
    floats = floats.filter((f) => now - f.at < 2200);
    for (const f of floats) {
      const t = (now - f.at) / 2200;
      ctx.globalAlpha = 1 - t * t;
      text(ctx, f.text, f.x, f.y - t * 40, { size: 28, weight: 900, color: f.color ?? '#fff', align: 'right' });
      ctx.globalAlpha = 1;
    }

    if (now - flashAt < 500) {
      ctx.fillStyle = `rgba(255,90,40,${0.35 * (1 - (now - flashAt) / 500)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (banner) {
      const age = now - banner.at;
      const dur = banner.long ? 9000 : 2600;
      if (age > dur) banner = null;
      else {
        const a = Math.min(1, age / 200, (dur - age) / 300);
        ctx.globalAlpha = a;
        roundRect(ctx, 600 - 440, 380, 880, 110, 24, 'rgba(10,14,22,0.88)', banner.color);
        text(ctx, banner.text, 600, 452, { size: 52, weight: 900, color: banner.color });
        ctx.globalAlpha = 1;
      }
    }
  },
};

function drawBuilding(ctx, x, y, k, kind, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#111';
  ctx.fillStyle = color;
  if (kind === 'light') {
    // A tapered tower with a lamp.
    const w = k * 0.2;
    const h = k * 0.5;
    ctx.beginPath();
    ctx.moveTo(-w, h * 0.45);
    ctx.lineTo(w, h * 0.45);
    ctx.lineTo(w * 0.6, -h * 0.4);
    ctx.lineTo(-w * 0.6, -h * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe680';
    ctx.beginPath();
    ctx.arc(0, -h * 0.55, w * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-w * 0.75, -h * 0.05, w * 1.5, h * 0.12);
  } else {
    // A hut: box with a peaked roof.
    const w = k * 0.17;
    ctx.beginPath();
    ctx.moveTo(-w, w * 0.9);
    ctx.lineTo(w, w * 0.9);
    ctx.lineTo(w, -w * 0.1);
    ctx.lineTo(0, -w * 1.1);
    ctx.lineTo(-w, -w * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawDie(ctx, x, y, size, v) {
  roundRect(ctx, x - size / 2, y - size / 2, size, size, size * 0.18, '#f6f1e6', '#1b1f2a');
  const spots = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v];
  for (const [dx, dy] of spots) circle(ctx, x + dx * size * 0.26, y + dy * size * 0.26, size * 0.09, '#1b1f2a');
}

function drawTop(ctx, s, now, playerById) {
  const p = playerById.get(s.turn);
  const nm = p?.name ?? '';
  let msg = '';
  if (s.phase === 'setup') msg = `${nm} is placing a ${s.step === 'hut' ? 'Hut 🛖' : 'Trail 🪢'}`;
  else if (s.phase === 'roll') msg = `${nm}'s turn · roll the dice`;
  else if (s.phase === 'ash' || s.phase === 'steal') msg = `${nm} is drifting the Ash Cloud`;
  else if (s.phase === 'main') {
    const m = { build: 'is building', calm: 'is laying free Trails', trade: 'is putting together an offer', offer: 'wants to trade', bank: 'is trading with the bank', bottles: 'is opening a Bottle', current: 'rides a Lucky Current', monkey: 'is up to Monkey Business' }[s.mode];
    msg = `${nm} ${m ?? "'s turn"}`.replace(" 's", "'s");
  } else if (s.phase === 'end') msg = `👑 ${s.players.find((q) => q.id === s.winner)?.name ?? ''} rules the island!`;
  if (msg) {
    roundRect(ctx, 70, 34, 760, 60, 16, 'rgba(10,14,22,0.75)');
    const who = p ?? playerById.get(s.winner);
    if (who) circle(ctx, 104, 64, 13, who.color);
    text(ctx, msg, 128, 75, { size: 30, weight: 800, align: 'left' });
    // Turn timer.
    if (s.limit && s.left >= 0) {
      const f = Math.max(0, Math.min(1, s.left / s.limit));
      ctx.fillStyle = f < 0.2 ? '#ff5a5f' : 'rgba(255,255,255,0.5)';
      ctx.fillRect(86, 88, 728 * f, 4);
    }
  }
  // Dice.
  if (s.dice) {
    const rolling = now - rollAt < 700;
    const [a, b] = rolling ? [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)] : s.dice;
    const wob = rolling ? Math.sin(now / 30) * 6 : 0;
    drawDie(ctx, 900, 64 + wob, 58, a);
    drawDie(ctx, 970, 64 - wob, 58, b);
    if (!rolling) text(ctx, `= ${s.dice[0] + s.dice[1]}`, 1010, 78, { size: 40, weight: 900, align: 'left', color: s.dice[0] + s.dice[1] === 7 ? '#ff7a5c' : '#fff' });
  }
}

function drawPanel(ctx, s, now) {
  const TOP = 30;
  const BOTTOM = 860;
  roundRect(ctx, PANEL_X - 20, TOP, 420, BOTTOM - TOP, 24, 'rgba(10,14,22,0.82)');
  text(ctx, 'TIDEWAKE', PANEL_X, 80, { size: 36, weight: 900, align: 'left', color: '#ffd27a' });
  text(ctx, `first to ${s.goal} points`, PANEL_X + 375, 80, { size: 20, weight: 600, align: 'right', color: '#8a93a8' });
  const n = s.players.length;
  const rowH = n <= 4 ? 96 : 78;
  const of = s.offer;
  s.players.forEach((p, i) => {
    const y = 104 + i * rowH;
    const turn = p.id === s.turn;
    const big = rowH > 90;
    roundRect(ctx, PANEL_X - 6, y, 392, rowH - 10, 16, turn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)', turn ? p.color : null);
    circle(ctx, PANEL_X + 22, y + (big ? 30 : 24), big ? 14 : 12, p.color);
    let nm = p.name;
    ctx.font = '800 26px system-ui, sans-serif';
    while (ctx.measureText(nm).width > 220 && nm.length > 3) nm = nm.slice(0, -2) + '…';
    text(ctx, nm, PANEL_X + 46, y + (big ? 40 : 33), { size: big ? 26 : 24, weight: 800, align: 'left', color: p.connected ? '#f2f4f8' : '#8a93a8' });
    text(ctx, String(p.vp), PANEL_X + 372, y + (big ? 52 : 46), { size: big ? 48 : 40, weight: 900, align: 'right', color: '#ffd27a' });
    const bits = [`🃏 ${p.cards}`, `🍾 ${p.bottles}`, `🛖 ${p.huts}`, `🗼 ${p.lights}`];
    text(ctx, bits.join('   '), PANEL_X + 14, y + (big ? 74 : 60), { size: big ? 19 : 17, weight: 600, align: 'left', color: p.cards > 7 ? '#ffb3a0' : '#c3c9d6' });
    const badges = [];
    if (s.explorer === p.id) badges.push('🧭');
    if (s.trader === p.id) badges.push('🤝');
    // During an offer, everyone's answer sits next to their name.
    if (of && p.id !== of.from) {
      const r = of.replies[p.id];
      badges.push(r === 'yes' ? '✅' : r === 'no' ? '❌' : r === 'counter' ? '🔁' : '💭');
    }
    if (badges.length) text(ctx, badges.join(''), PANEL_X + 318, y + (big ? 46 : 40), { size: 26, align: 'right' });
  });
  let y = 104 + n * rowH + 8;
  const costTop = BOTTOM - 22 - COSTS.length * 28;

  if (of) {
    const from = s.players.find((p) => p.id === of.from);
    const h = 112;
    roundRect(ctx, PANEL_X - 6, y, 392, h, 16, 'rgba(255,210,122,0.1)', from?.color);
    text(ctx, `🤝 ${from?.name ?? ''} offers`, PANEL_X + 10, y + 32, { size: 22, weight: 800, align: 'left' });
    text(ctx, fmt(of.give) || '–', PANEL_X + 10, y + 74, { size: 30, align: 'left' });
    text(ctx, '⇄', PANEL_X + 193, y + 74, { size: 30, weight: 900, color: '#ffd27a' });
    text(ctx, fmt(of.want) || '–', PANEL_X + 376, y + 74, { size: 30, align: 'right' });
    text(ctx, 'gives', PANEL_X + 10, y + 100, { size: 15, weight: 700, align: 'left', color: '#8a93a8' });
    text(ctx, 'wants', PANEL_X + 376, y + 100, { size: 15, weight: 700, align: 'right', color: '#8a93a8' });
    y += h + 16;
  }

  if (y + 50 < costTop) {
    const ex = s.players.find((p) => p.id === s.explorer);
    const tr = s.players.find((p) => p.id === s.trader);
    text(ctx, `🧭 Explorer +2: ${ex ? ex.name : 'most tiles reached, 7+'}`, PANEL_X, y + 20, { size: 18, weight: 700, align: 'left', color: '#c3c9d6' });
    text(ctx, `🤝 Trader +1: ${tr ? tr.name : 'most deals, 3+'}`, PANEL_X, y + 46, { size: 18, weight: 700, align: 'left', color: '#c3c9d6' });
    y += 66;
  }

  // What just happened, newest at the bottom, in whatever room is left.
  const room = Math.floor((costTop - 16 - y) / 25);
  const log = room > 0 ? s.log.slice(-Math.min(4, room)) : [];
  ctx.font = '600 18px system-ui, sans-serif';
  log.forEach((line, i) => {
    let l = line;
    while (ctx.measureText(l).width > 375 && l.length > 4) l = l.slice(0, -2);
    if (l !== line) l += '…';
    text(ctx, l, PANEL_X, y + 22 + i * 25, { size: 18, weight: 600, align: 'left', color: `rgba(242,244,248,${0.4 + 0.6 * ((i + 1) / log.length)})` });
  });

  COSTS.forEach(([what, cost], i) => {
    text(ctx, what, PANEL_X, costTop + 22 + i * 28, { size: 19, weight: 700, align: 'left', color: '#8a93a8' });
    text(ctx, cost, PANEL_X + 375, costTop + 22 + i * 28, { size: 19, align: 'right' });
  });
}
