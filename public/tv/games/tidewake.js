// Tidewake TV: the island on the left (illustrated tiles that move a little, number tokens, harbor
// boats, everyone's trails, huts and lighthouses, the Ash Cloud), the crews on the right with their
// crests, points and cards, and the dice on the sea. Hands stay on the phones. Rules are in
// server/games/tidewake.js; all drawing of tiles and pieces is in public/art/tidewake.js.
//
// Things that happen get a little show: harvested resources fly from the tiles to their owner's row,
// a seven shakes the island and throws lava, the Ash Cloud drifts across, traded cards slide between
// rows, and the piece being placed shows as a ghost first. Day turns to dusk and night every few
// rounds, and the lighthouses sweep their beams in the dark.

import { text } from './util.js';
import {
  CRESTS, drawAsh, drawBoat, drawBottle, drawCrest, drawDie, drawHut, drawIcon, drawLighthouse,
  drawSmoke, drawTile, drawTileLife, drawTrail, hexPath,
} from '../../art/tidewake.js';

const ORDER = ['wood', 'coco', 'fish', 'shell', 'stone'];
const COSTS = [
  ['trail', 'Trail', ['wood', 'coco']],
  ['hut', 'Hut · 1 pt', ['wood', 'coco', 'fish', 'shell']],
  ['light', 'Lighthouse · 2 pts', ['stone', 'stone', 'stone', 'shell', 'shell']],
  ['bottle', 'Bottle', ['fish', 'shell', 'stone']],
];
const BOARD = { x: 60, y: 100, w: 1080, h: 760 };
const PANEL_X = 1170;
const SERIF = 'Georgia, "Times New Roman", serif';
const NIGHT = [0, 0.35, 0.85, 0.35]; // darkness by round, repeating: day, dusk, night, dawn

// Animation state (TV only; the server knows nothing of it).
let lastSeq = 0;
let lastRoll = 0;
let rollAt = -1e9;
let shakeUntil = 0;
let flashAt = -1e9;
let eruptAt = -1e9;
let banner = null; // { text, color, at, long }
let flights = []; // things flying across the screen: { kind, sx, sy, ex, ey, at, dur, color, fade, lift }
let floats = []; // "+2" labels over the rows: { res, n, x, y, at, color }
let parts = []; // particles: { x, y, vx, vy, at, life, color, size, grav }
let built = new Map(); // 'v12' / 'e40' -> when it was built, for the drop-in
let ashAnim = null; // { from: [x, y], to: [x, y], at }
let dark = 0;
let lastNow = 0;
let tileCache = null; // { key, canvas }

const rowH = (n) => (n <= 4 ? 104 : n === 5 ? 88 : 78);
const rowY = (n, i) => 104 + i * rowH(n);
// Where harvested tokens land: the right end of the row's card line.
const rowTarget = (n, i) => [PANEL_X + 300, rowY(n, i) + (n <= 4 ? 76 : 60)];
const EMOJI = { '🪵': 'wood', '🥥': 'coco', '🐟': 'fish', '🐚': 'shell', '🪨': 'stone' };
const pips = (n) => (n ? 6 - Math.abs(7 - n) : 0);
const ease = (q) => 1 - (1 - q) ** 3;
const clamp01 = (q) => Math.max(0, Math.min(1, q));

function layout(s) {
  const xs = s.tiles.map((t) => t.x);
  const ys = s.tiles.map((t) => t.y);
  const w = Math.max(...xs) - Math.min(...xs) + 3.4;
  const h = Math.max(...ys) - Math.min(...ys) + 3.4;
  const k = Math.min(BOARD.w / w, BOARD.h / h);
  const cx = BOARD.x + BOARD.w / 2;
  const cy = BOARD.y + BOARD.h / 2;
  return { k, X: (x) => cx + x * k, Y: (y) => cy + y * k };
}

const vxy = (s, L, v) => [L.X(s.verts[v][0]), L.Y(s.verts[v][1])];
function exy(s, L, e) {
  const [a, b] = s.edges[e];
  return [...vxy(s, L, a), ...vxy(s, L, b)];
}

/** Corners of each tile (a tile's corners are exactly 1 unit from its centre). */
function tileCorners(s) {
  return s.tiles.map((t) => s.verts.map((v, i) => [i, Math.hypot(v[0] - t.x, v[1] - t.y)]).filter(([, d]) => Math.abs(d - 1) < 0.06).map(([i]) => i));
}

function serif(ctx, str, x, y, size, color, align = 'left') {
  ctx.font = `900 ${size}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function pill(ctx, x, y, label, fill, color = '#0d0f14', size = 15) {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  const w = ctx.measureText(label).width + 16;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x - w, y - size, w, size + 10, (size + 10) / 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x - 8, y + 1);
  return w;
}

function burst(x, y, n, color, { speed = 4, up = 2, life = 700, size = 4, grav = 0.25 } = {}) {
  const at = performance.now();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, at, life: life * (0.6 + Math.random() * 0.6), color, size: size * (0.6 + Math.random() * 0.8), grav });
  }
}

/** The tiles' still art, drawn once per island into an offscreen canvas at screen resolution. */
function tileLayer(ctx, s, L) {
  const px = Math.max(1, Math.min(2.5, Math.abs(ctx.getTransform().a) || 1));
  const key = `${s.tiles.map((t) => `${t.x},${t.y},${t.res}`).join('|')}@${px.toFixed(2)}`;
  if (tileCache?.key === key) return tileCache.canvas;
  const c = document.createElement('canvas');
  c.width = Math.ceil(PANEL_X * px);
  c.height = Math.ceil(900 * px);
  const g = c.getContext('2d');
  g.scale(px, px);
  const { k, X, Y } = L;
  for (const t of s.tiles) {
    hexPath(g, X(t.x), Y(t.y), k * 1.04);
    g.fillStyle = '#ead6a2';
    g.fill();
  }
  s.tiles.forEach((t, i) => {
    drawTile(g, t.res, X(t.x), Y(t.y), k * 0.965, i + 1);
    hexPath(g, X(t.x), Y(t.y), k * 0.965);
    g.strokeStyle = 'rgba(40,25,10,.35)';
    g.lineWidth = 2;
    g.stroke();
  });
  tileCache = { key, canvas: c };
  return c;
}

function numberToken(ctx, x, y, r, num) {
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.arc(x + 2, y + 3, r, 0, Math.PI * 2);
  ctx.fill();
  const tg = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 1, x, y, r);
  tg.addColorStop(0, '#fffaf0');
  tg.addColorStop(1, '#e8dcbc');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6a3c';
  ctx.lineWidth = 2;
  ctx.stroke();
  const hot = num === 6 || num === 8;
  ctx.fillStyle = hot ? '#c8261f' : '#2a1d10';
  ctx.font = `900 ${Math.round(r * 1.1)}px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), x, y - r * 0.08);
  const dots = pips(num);
  for (let d = 0; d < dots; d++) {
    ctx.beginPath();
    ctx.arc(x + (d - (dots - 1) / 2) * r * 0.24, y + r * 0.56, r * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A small card back (hands in the panel, stolen and lost cards). */
function cardBack(ctx, x, y, s, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#f6ecd2';
  ctx.strokeStyle = '#6b5636';
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.beginPath();
  ctx.roundRect(-s * 0.5, -s * 0.7, s, s * 1.4, s * 0.2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(107,86,54,.5)';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** A token in flight: a parchment disc with the resource on it (or a card back). */
function token(ctx, kind, x, y, s, color) {
  if (kind === 'back') return cardBack(ctx, x, y, s * 0.8);
  ctx.fillStyle = 'rgba(255,250,235,.95)';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color ?? '#8a6a3c';
  ctx.lineWidth = Math.max(2, s * 0.08);
  ctx.stroke();
  drawIcon(ctx, kind, x, y, s * 0.6);
}

function bez(f, q) {
  const cx = (f.sx + f.ex) / 2;
  const cy = Math.min(f.sy, f.ey) - (f.lift ?? 200);
  return [(1 - q) ** 2 * f.sx + 2 * (1 - q) * q * cx + q * q * f.ex, (1 - q) ** 2 * f.sy + 2 * (1 - q) * q * cy + q * q * f.ey];
}

export default {
  drawRules,

  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    const idx = (id) => s.players.findIndex((p) => p.id === id);
    const n = s.players.length;
    const now = performance.now();
    if (!prev) {
      say(pick(['Welcome to Tidewake. Claim your corner of the island.', 'A new island rises from the sea. Time to settle it.']), { delay: 0.4 });
      lastSeq = s.event?.seq ?? 0;
      lastRoll = s.rollSeq;
      dark = NIGHT[(s.round ?? 0) % 4];
      return;
    }
    const L = layout(s);
    if (s.rollSeq !== lastRoll) {
      lastRoll = s.rollSeq;
      rollAt = now;
      sfx.shuffle(5);
    }
    if (s.turn !== prev.turn && s.turn && s.phase === 'roll') {
      sfx.click();
      say(`${nameOf(s.turn)}'s turn.`, { delay: 0.2 });
    }
    if ((s.round ?? 0) !== (prev.round ?? 0) && s.phase !== 'setup') {
      const d = NIGHT[s.round % 4];
      if (d > 0.7) say(pick(['Night falls on the island.', 'The lighthouses come on. Night again.']), { delay: 1.2 });
      else if (d < 0.1) say(pick(['Morning! A new day on the island.', 'The sun is up.']), { delay: 1.2 });
    }
    if (s.phase === 'setup' && (s.turn !== prev.turn || s.step !== prev.step) && s.step === 'hut' && s.turn) sfx.ding();
    if (s.highlight && JSON.stringify(s.highlight) !== JSON.stringify(prev.highlight)) sfx.tick();
    if (s.ash !== prev.ash && prev.tiles?.[prev.ash]) {
      const a = prev.tiles[prev.ash];
      const b = s.tiles[s.ash];
      ashAnim = { from: [L.X(a.x), L.Y(a.y)], to: [L.X(b.x), L.Y(b.y)], at: now };
    }

    const e = s.event;
    if (!e || e.seq === lastSeq) return;
    lastSeq = e.seq;
    const col = s.players.find((p) => p.id === e.by)?.color ?? '#fff';
    switch (e.kind) {
      case 'build': {
        const key = (e.what === 'trail' ? 'e' : 'v') + e.spot;
        built.set(key, now);
        if (e.what === 'trail') {
          const [x1, y1, x2, y2] = exy(s, L, e.spot);
          setTimeout(() => burst((x1 + x2) / 2, (y1 + y2) / 2, 10, '#d9c08a', { speed: 2.5, up: 1, size: 4 }), 250);
          sfx.thud(0.3);
        } else {
          const [x, y] = vxy(s, L, e.spot);
          setTimeout(() => {
            burst(x, y + L.k * 0.15, 16, '#e6d3a0', { speed: 3, up: 1.5, size: 5 });
            burst(x, y - L.k * 0.2, 10, col, { speed: 4, up: 3, size: 4 });
          }, 380);
          sfx.thud(0.6);
          sfx.pickup();
        }
        if (e.what === 'light') say(`${nameOf(e.by)} raised a Lighthouse!`, { delay: 0.2 });
        break;
      }
      case 'roll': {
        setTimeout(() => {
          if (e.blocked) sfx.buzz();
          else sfx.ding();
          say(String(e.sum), { interrupt: true });
        }, 700);
        // Harvest: one token per resource, from each building's corner to its owner's row.
        const corners = tileCorners(s);
        const left = Object.fromEntries(Object.entries(s.gains ?? {}).map(([pid, g]) => [pid, Object.values(g).reduce((a, b) => a + b, 0)]));
        let order = 0;
        s.tiles.forEach((t, ti) => {
          if (t.num !== e.sum || !t.res || ti === s.ash) return;
          for (const v of corners[ti]) {
            const b = s.buildings.find((q) => q.v === v);
            if (!b) continue;
            const i = idx(b.owner);
            const [sx, sy] = vxy(s, L, v);
            const [ex, ey] = rowTarget(n, i);
            const color = s.players[i]?.color;
            for (let c = 0; c < (b.kind === 'light' ? 2 : 1) && (left[b.owner] ?? 0) > 0; c++) {
              left[b.owner]--;
              flights.push({ kind: t.res, sx, sy, ex, ey, at: now + 850 + order++ * 110, dur: 950, color, land: b.owner });
            }
          }
        });
        if (order) setTimeout(() => sfx.whoosh(), 900);
        // "+N" over each row once its tokens have landed.
        Object.entries(s.gains ?? {}).forEach(([pid, g]) => {
          const i = idx(pid);
          const [x, y] = rowTarget(n, i);
          Object.entries(g).forEach(([res, k], j) => floats.push({ res, n: k, x: x - 20 - j * 66, y, at: now + 1900 + j * 120, color: s.players[i]?.color }));
        });
        break;
      }
      case 'erupt':
        setTimeout(() => {
          sfx.boom();
          shakeUntil = performance.now() + 1000;
          flashAt = performance.now();
          eruptAt = performance.now();
          banner = { text: 'ERUPTION!', color: '#ff7a4c', at: performance.now() };
          say(pick(['Seven! The volcano erupts!', 'Eruption! Hold on to your coconuts.', 'Seven. Here comes the ash!']), { interrupt: true });
          s.tiles.forEach((t) => {
            if (t.res) return;
            const x = L.X(t.x);
            const y = L.Y(t.y) - L.k * 0.28;
            burst(x, y, 50, '#ff8a2c', { speed: 7, up: 7, life: 1400, size: 6, grav: 0.35 });
            burst(x, y, 30, '#ffd36a', { speed: 5, up: 6, life: 1100, size: 4, grav: 0.3 });
          });
          // Lost cards blow off the rows into the sea.
          Object.entries(e.lost ?? {}).forEach(([pid, k]) => {
            const i = idx(pid);
            const [sx, sy] = rowTarget(n, i);
            for (let c = 0; c < Math.min(k, 8); c++) flights.push({ kind: 'back', sx: sx - 60, sy, ex: 700 + Math.random() * 400, ey: 900, at: performance.now() + 300 + c * 90, dur: 1300, fade: true, lift: 120 });
            floats.push({ text: `−${k}`, x: sx, y: sy, at: performance.now() + 300, color: '#ff8c8c' });
          });
        }, 700);
        break;
      case 'ash':
        sfx.whoosh();
        break;
      case 'steal': {
        sfx.swish();
        say(`${nameOf(e.by)} steals from ${nameOf(e.from)}.`);
        const [sx, sy] = rowTarget(n, idx(e.from));
        const [ex, ey] = rowTarget(n, idx(e.by));
        flights.push({ kind: 'back', sx: sx - 60, sy, ex: ex - 60, ey, at: now + 200, dur: 900, lift: 60 });
        break;
      }
      case 'offer':
        sfx.swish();
        break;
      case 'deal': {
        sfx.jingle();
        banner = { text: `${nameOf(e.by)} and ${nameOf(e.with)} made a deal`, color: '#3ddc84', at: now };
        const a = rowTarget(n, idx(e.by));
        const b = rowTarget(n, idx(e.with));
        const send = (from, to, h, color) => {
          let c = 0;
          for (const r of ORDER) for (let q = 0; q < (h?.[r] ?? 0) && c < 6; q++, c++) flights.push({ kind: r, sx: from[0] - 80, sy: from[1], ex: to[0] - 80, ey: to[1], at: now + 300 + c * 120, dur: 900, color, lift: 40 });
        };
        send(a, b, e.give, col);
        send(b, a, e.get, s.players[idx(e.with)]?.color);
        break;
      }
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
        banner = { text: e.award === 'explorer' ? `${nameOf(e.by)} is the Explorer · +2` : `${nameOf(e.by)} is the Trader · +1`, color: col, at: now };
        say(e.award === 'explorer' ? `${nameOf(e.by)} is the Explorer.` : `${nameOf(e.by)} is the island's top Trader.`, { delay: 0.3 });
        break;
      case 'setupDone':
        sfx.chime();
        say('The island is settled. Let the harvest begin!', { delay: 0.5 });
        break;
      case 'win': {
        sfx.fanfare();
        banner = { text: `${nameOf(e.by)} rules the island!`, color: col, at: now, long: true };
        say(`${nameOf(e.by)} rules the island!`, { delay: 0.5, interrupt: true });
        // Fireworks over the winner's buildings.
        const mine = s.buildings.filter((b) => b.owner === e.by);
        mine.forEach((b, i) => setTimeout(() => {
          const [x, y] = vxy(s, L, b.v);
          burst(x, y - 80, 40, i % 2 ? '#ffd27a' : col, { speed: 6, up: 2, life: 1300, size: 5, grav: 0.12 });
        }, 300 + i * 350));
        break;
      }
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const t = now / 1000;
    const dt = Math.min(0.1, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const target = s.phase === 'setup' ? 0 : NIGHT[(s.round ?? 0) % 4];
    dark += (target - dark) * Math.min(1, dt * 0.6);
    const heat = clamp01(1 - (now - eruptAt) / 5000);

    // Sea.
    const sea = ctx.createRadialGradient(600, 470, 100, 600, 470, 950);
    sea.addColorStop(0, '#2a8fb8');
    sea.addColorStop(1, '#0b2d48');
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const wx = (i * 337) % 1140;
      const wy = (i * 571) % 900;
      const ph = Math.sin(t * 1.1 + i);
      ctx.strokeStyle = `rgba(255,255,255,${0.06 + 0.05 * ph})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx + Math.sin(t * 0.4 + i) * 6, wy, 14, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }

    ctx.save();
    if (now < shakeUntil) {
      const a = (shakeUntil - now) / 1000;
      ctx.translate((Math.random() - 0.5) * 18 * a, (Math.random() - 0.5) * 18 * a);
    }
    const L = layout(s);
    const { k, X, Y } = L;
    const settled = s.dice && now - rollAt > 700;
    const rolled = settled ? s.dice[0] + s.dice[1] : null;
    const playerById = new Map(s.players.map((p) => [p.id, p]));
    const crestOf = new Map(s.players.map((p, i) => [p.id, CRESTS[i % CRESTS.length]]));

    // Shallow water, foam, then the island.
    for (const [rr, c] of [[1.42, 'rgba(90,210,230,.35)'], [1.22, 'rgba(160,235,240,.45)']]) {
      for (const tl of s.tiles) {
        hexPath(ctx, X(tl.x), Y(tl.y), k * rr);
        ctx.fillStyle = c;
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const tl of s.tiles) {
      hexPath(ctx, X(tl.x), Y(tl.y), k * (1.1 + Math.sin(t * 1.25) * 0.015));
      ctx.fill();
    }
    ctx.drawImage(tileLayer(ctx, s, L), 0, 0, PANEL_X, 900);
    s.tiles.forEach((tl, i) => drawTileLife(ctx, tl.res, X(tl.x), Y(tl.y), k * 0.965, t, i + 1));

    // The rolled number glows, brightest just after the roll.
    if (rolled && rolled !== 7) {
      const fresh = clamp01(1 - (now - rollAt - 700) / 4000);
      s.tiles.forEach((tl, i) => {
        if (tl.num !== rolled || i === s.ash) return;
        hexPath(ctx, X(tl.x), Y(tl.y), k * 0.93);
        ctx.strokeStyle = `rgba(255,236,150,${0.35 + 0.4 * fresh + 0.25 * Math.sin(now / 150) * fresh})`;
        ctx.lineWidth = 3 + 4 * fresh;
        ctx.stroke();
        ctx.fillStyle = `rgba(255,236,150,${0.06 + 0.14 * fresh})`;
        ctx.fill();
      });
    }
    for (const tl of s.tiles) if (tl.num) numberToken(ctx, X(tl.x), Y(tl.y) + k * 0.36, k * 0.27, tl.num);

    // Ash Cloud (drifting when it moves), smoke from the volcanoes.
    {
      const tl = s.tiles[s.ash];
      let [x, y] = [X(tl.x), Y(tl.y)];
      if (ashAnim) {
        const q = clamp01((now - ashAnim.at) / 1100);
        if (q >= 1) ashAnim = null;
        else {
          const e = ease(q);
          x = ashAnim.from[0] + (ashAnim.to[0] - ashAnim.from[0]) * e;
          y = ashAnim.from[1] + (ashAnim.to[1] - ashAnim.from[1]) * e - Math.sin(q * Math.PI) * k * 0.8;
        }
      }
      drawAsh(ctx, x, y, k, t);
    }
    for (const tl of s.tiles) if (!tl.res) drawSmoke(ctx, X(tl.x), Y(tl.y), k, t, heat);

    // Dusk and night.
    if (dark > 0.01) {
      ctx.fillStyle = `rgba(10,20,52,${0.55 * dark})`;
      ctx.fillRect(-40, -40, W + 80, H + 80);
      for (const tl of s.tiles) {
        if (tl.res) continue;
        const g = ctx.createRadialGradient(X(tl.x), Y(tl.y) - k * 0.28, 2, X(tl.x), Y(tl.y) - k * 0.28, k * 1.2);
        g.addColorStop(0, `rgba(255,120,40,${0.35 * dark})`);
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(X(tl.x) - k * 1.3, Y(tl.y) - k * 1.5, k * 2.6, k * 2.6);
      }
    }

    // Harbors: a jetty to both corners and a boat with its rate.
    for (const h of s.harbors) {
      const [a, b] = s.edges[h.e];
      ctx.strokeStyle = '#8a6a44';
      ctx.lineWidth = Math.max(3, k * 0.06);
      for (const v of [a, b]) {
        ctx.beginPath();
        ctx.moveTo(X(h.x), Y(h.y));
        ctx.lineTo(...vxy(s, L, v));
        ctx.stroke();
      }
      drawBoat(ctx, X(h.x), Y(h.y) - k * 0.15, k * 0.42, h.kind, t);
    }

    // Trails, then buildings (dropping in when new).
    for (const tr of s.trails) {
      const [x1, y1, x2, y2] = exy(s, L, tr.e);
      const q = ease(clamp01((now - (built.get(`e${tr.e}`) ?? -1e9)) / 450));
      drawTrail(ctx, x1, y1, x1 + (x2 - x1) * q, y1 + (y2 - y1) * q, playerById.get(tr.owner)?.color ?? '#fff', k);
    }
    const lit = clamp01((dark - 0.2) / 0.45);
    for (const b of s.buildings) {
      const [x, y] = vxy(s, L, b.v);
      const c = playerById.get(b.owner)?.color ?? '#fff';
      const q = clamp01((now - (built.get(`v${b.v}`) ?? -1e9)) / 420);
      const dy = -((1 - q) ** 2) * 90;
      ctx.globalAlpha = Math.min(1, 0.2 + q * 1.5);
      if (b.kind === 'light') drawLighthouse(ctx, x, y - k * 0.05 + dy, k * 0.38, c, t, lit);
      else {
        drawHut(ctx, x, y + dy, k * 0.34, c);
        if (lit > 0) {
          ctx.fillStyle = `rgba(255,205,100,${lit})`;
          ctx.fillRect(x - k * 0.34 * 0.12, y + dy + k * 0.34 * 0.15, k * 0.34 * 0.24, k * 0.34 * 0.38);
        }
      }
      ctx.globalAlpha = 1;
    }

    // A ghost of what the current player is about to place.
    if (s.highlight && s.turn) {
      const c = playerById.get(s.turn)?.color ?? '#fff';
      const h = s.highlight;
      const a = 0.45 + 0.25 * Math.sin(now / 200);
      ctx.save();
      ctx.setLineDash([k * 0.1, k * 0.08]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      if (h.kind === 'tile') {
        const tl = s.tiles[h.id];
        ctx.globalAlpha = a;
        drawAsh(ctx, X(tl.x), Y(tl.y), k, t);
        ctx.globalAlpha = 1;
        hexPath(ctx, X(tl.x), Y(tl.y), k * 0.9);
        ctx.strokeStyle = c;
        ctx.lineWidth = 5;
        ctx.stroke();
      } else if (h.kind === 'edge') {
        const [x1, y1, x2, y2] = exy(s, L, h.id);
        ctx.globalAlpha = a + 0.15;
        drawTrail(ctx, x1, y1, x2, y2, c, k);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.ellipse((x1 + x2) / 2, (y1 + y2) / 2, k * 0.55, k * 0.22, Math.atan2(y2 - y1, x2 - x1), 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const [x, y] = vxy(s, L, h.id);
        ctx.globalAlpha = a + 0.1;
        if (h.what === 'light') drawLighthouse(ctx, x, y - k * 0.05, k * 0.38, c, t, 0);
        else drawHut(ctx, x, y, k * 0.34, c);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, k * 0.36, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Particles (dust, lava, fireworks).
    parts = parts.filter((p) => now - p.at < p.life);
    for (const p of parts) {
      const age = (now - p.at) / 16.7;
      const x = p.x + p.vx * age;
      const y = p.y + p.vy * age + 0.5 * p.grav * age * age;
      ctx.globalAlpha = 1 - (now - p.at) / p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (heat > 0) {
      ctx.fillStyle = `rgba(255,90,30,${0.12 * heat})`;
      ctx.fillRect(0, 0, W, H);
    }

    drawTop(ctx, s, now, playerById, crestOf);
    drawPanel(ctx, s, now, crestOf);

    // Flying tokens and cards, over everything but the banner.
    flights = flights.filter((f) => now < f.at + f.dur);
    for (const f of flights) {
      if (now < f.at) continue;
      const q = ease((now - f.at) / f.dur);
      for (let j = 1; j < 6 && f.kind !== 'back'; j++) {
        const [qx, qy] = bez(f, Math.max(0, q - j * 0.025));
        ctx.fillStyle = `rgba(255,240,180,${0.5 - j * 0.08})`;
        ctx.beginPath();
        ctx.arc(qx, qy, 7 - j, 0, Math.PI * 2);
        ctx.fill();
      }
      const [x, y] = bez(f, q);
      ctx.globalAlpha = f.fade ? 1 - q : 1;
      token(ctx, f.kind, x, y, f.kind === 'back' ? 26 : 50 - 14 * q, f.color);
      ctx.globalAlpha = 1;
    }
    floats = floats.filter((f) => now < f.at + 2000);
    for (const f of floats) {
      if (now < f.at) continue;
      const q = (now - f.at) / 2000;
      ctx.globalAlpha = 1 - q * q;
      const y = f.y - q * 36;
      if (f.res) {
        ctx.font = '900 26px system-ui, sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(10,14,22,.8)';
        ctx.strokeText(`+${f.n}`, f.x - 4, y);
        ctx.fillStyle = '#7dffb0';
        ctx.fillText(`+${f.n}`, f.x - 4, y);
        drawIcon(ctx, f.res, f.x + 18, y, 26);
      } else text(ctx, f.text, f.x, y, { size: 28, weight: 900, color: f.color ?? '#fff', align: 'right', baseline: 'middle' });
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
        ctx.fillStyle = 'rgba(10,14,22,0.88)';
        ctx.beginPath();
        ctx.roundRect(600 - 440, 380, 880, 110, 24);
        ctx.fill();
        ctx.strokeStyle = banner.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        serif(ctx, banner.text, 600, 452, 50, banner.color, 'center');
        ctx.globalAlpha = 1;
      }
    }
  },
};

function drawTop(ctx, s, now, playerById, crestOf) {
  const p = playerById.get(s.turn);
  const nm = p?.name ?? '';
  let msg = '';
  if (s.phase === 'setup') msg = `${nm} is placing a ${s.step === 'hut' ? 'Hut' : 'Trail'}`;
  else if (s.phase === 'roll') msg = `${nm}'s turn · roll the dice`;
  else if (s.phase === 'ash' || s.phase === 'steal') msg = `${nm} is drifting the Ash Cloud`;
  else if (s.phase === 'main') {
    const m = { build: 'is building', calm: 'is laying free Trails', trade: 'is putting together an offer', offer: 'wants to trade', bank: 'is trading with the bank', bottles: 'is opening a Bottle', current: 'rides a Lucky Current', monkey: 'is up to Monkey Business' }[s.mode];
    msg = m ? `${nm} ${m}` : `${nm}'s turn`;
  } else if (s.phase === 'end') msg = `${s.players.find((q) => q.id === s.winner)?.name ?? ''} rules the island!`;
  if (msg) {
    ctx.fillStyle = 'rgba(10,14,22,0.78)';
    ctx.beginPath();
    ctx.roundRect(70, 30, 720, 62, 16);
    ctx.fill();
    const who = p ?? playerById.get(s.winner);
    if (who) drawCrest(ctx, 104, 56, 14, who.color, crestOf.get(who.id));
    ctx.font = '800 30px system-ui, sans-serif';
    let m = msg;
    while (ctx.measureText(m).width > 630 && m.length > 4) m = m.slice(0, -2);
    if (m !== msg) m += '…';
    text(ctx, m, 132, 72, { size: 30, weight: 800, align: 'left' });
    if (s.limit && s.left >= 0) {
      const f = Math.max(0, Math.min(1, s.left / s.limit));
      ctx.fillStyle = f < 0.2 ? '#ff5a5f' : 'rgba(255,255,255,0.45)';
      ctx.fillRect(86, 86, 688 * f, 4);
    }
  }
  // Dice tumble onto the sea.
  if (s.dice) {
    const q = clamp01((now - rollAt) / 700);
    const rolling = q < 1;
    const [a, b] = rolling ? [1 + Math.floor((now / 70) % 6), 1 + Math.floor((now / 90 + 3) % 6)] : s.dice;
    const spin = (1 - ease(q)) * 6;
    const hop = rolling ? -Math.abs(Math.sin(q * Math.PI * 2.5)) * 30 * (1 - q) : 0;
    drawDie(ctx, 870 - (1 - q) * 60, 66 + hop, 66, a, -0.25 + spin);
    drawDie(ctx, 950 - (1 - q) * 30, 72 + hop * 0.7, 66, b, 0.18 - spin);
    if (!rolling) {
      const sum = s.dice[0] + s.dice[1];
      serif(ctx, `${sum}`, 1010, 90, 46, sum === 7 ? '#ff7a5c' : '#fff');
    }
  }
}

function drawPanel(ctx, s, now, crestOf) {
  const TOP = 30;
  const BOTTOM = 860;
  ctx.fillStyle = 'rgba(10,14,22,0.86)';
  ctx.beginPath();
  ctx.roundRect(PANEL_X - 20, TOP, 420, BOTTOM - TOP, 24);
  ctx.fill();
  serif(ctx, 'TIDEWAKE', PANEL_X, 80, 34, '#ffd27a');
  text(ctx, `first to ${s.goal}`, PANEL_X + 375, 78, { size: 18, weight: 600, align: 'right', color: '#8a93a8' });
  const n = s.players.length;
  const rh = rowH(n);
  const big = rh > 90;
  const of = s.offer;
  s.players.forEach((p, i) => {
    const y = rowY(n, i);
    const turn = p.id === s.turn;
    ctx.fillStyle = turn ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.roundRect(PANEL_X - 6, y, 392, rh - 10, 16);
    ctx.fill();
    if (turn) {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    const cy = y + (big ? 32 : 26);
    drawCrest(ctx, PANEL_X + 24, cy - 2, big ? 16 : 13, p.color, crestOf.get(p.id));
    serif(ctx, String(p.vp), PANEL_X + 374, y + (big ? 58 : 48), big ? 48 : 40, '#ffd27a', 'right');
    // Badges left of the points: answers during an offer, else awards.
    let right = PANEL_X + 330;
    if (of && p.id !== of.from) {
      const r = of.replies[p.id];
      const [label, fill] = r === 'yes' ? ['Yes', '#3ddc84'] : r === 'no' ? ['No', '#ff6b6b'] : r === 'counter' ? ['Counter', '#ffc93c'] : ['…', '#4a5266'];
      right -= pill(ctx, right, cy + 2, label, fill, r ? '#0d0f14' : '#e3e7ef') + 6;
    } else {
      if (s.trader === p.id) right -= pill(ctx, right, cy + 2, 'Trader', '#8fd3ff') + 6;
      if (s.explorer === p.id) right -= pill(ctx, right, cy + 2, 'Explorer', '#ffd27a') + 6;
    }
    let nm = p.name;
    ctx.font = `800 ${big ? 26 : 23}px system-ui, sans-serif`;
    while (ctx.measureText(nm).width > right - (PANEL_X + 54) - 8 && nm.length > 3) nm = nm.slice(0, -2) + '…';
    text(ctx, nm, PANEL_X + 54, cy + 9, { size: big ? 26 : 23, weight: 800, align: 'left', color: p.connected ? '#f2f4f8' : '#8a93a8' });
    // The hand as a little fan of cards, then bottles.
    const by = y + (big ? 76 : 60);
    const shown = Math.min(p.cards, 12);
    for (let c = 0; c < shown; c++) cardBack(ctx, PANEL_X + 20 + c * 11, by, big ? 15 : 13, (c - shown / 2) * 0.05);
    const tx = PANEL_X + 34 + Math.max(0, shown - 1) * 11;
    text(ctx, `${p.cards} card${p.cards === 1 ? '' : 's'}`, tx, by + 6, { size: big ? 18 : 16, weight: 700, align: 'left', color: p.cards > 7 ? '#ffb3a0' : '#c3c9d6' });
    if (p.bottles) {
      ctx.font = `700 ${big ? 18 : 16}px system-ui, sans-serif`;
      const bx = tx + ctx.measureText(`${p.cards} cards`).width + 26;
      drawBottle(ctx, bx, by, big ? 26 : 22);
      text(ctx, `×${p.bottles}`, bx + 14, by + 6, { size: big ? 18 : 16, weight: 700, align: 'left', color: '#c3c9d6' });
    }
  });
  let y = rowY(n, n) + 6;
  const costTop = BOTTOM - 18 - COSTS.length * 38;

  if (of) {
    const from = s.players.find((p) => p.id === of.from);
    const h = 104;
    ctx.fillStyle = 'rgba(255,210,122,0.1)';
    ctx.beginPath();
    ctx.roundRect(PANEL_X - 6, y, 392, h, 16);
    ctx.fill();
    ctx.strokeStyle = from?.color ?? '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    text(ctx, `${from?.name ?? ''} offers a trade`, PANEL_X + 10, y + 28, { size: 21, weight: 800, align: 'left' });
    const icons = (hand, x0, dir) => {
      const list = ORDER.flatMap((r) => Array(Math.min(hand?.[r] ?? 0, 6)).fill(r)).slice(0, 6);
      if (!list.length) return text(ctx, '–', x0, y + 68, { size: 26, weight: 800, align: dir > 0 ? 'left' : 'right', color: '#8a93a8' });
      list.forEach((r, j) => drawIcon(ctx, r, x0 + dir * (14 + j * 27), y + 62, 26));
    };
    icons(of.give, PANEL_X + 4, 1);
    icons(of.want, PANEL_X + 382, -1);
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PANEL_X + 180, y + 56);
    ctx.lineTo(PANEL_X + 206, y + 56);
    ctx.lineTo(PANEL_X + 198, y + 49);
    ctx.moveTo(PANEL_X + 206, y + 68);
    ctx.lineTo(PANEL_X + 180, y + 68);
    ctx.lineTo(PANEL_X + 188, y + 75);
    ctx.stroke();
    text(ctx, 'gives', PANEL_X + 10, y + 94, { size: 14, weight: 700, align: 'left', color: '#8a93a8' });
    text(ctx, 'wants', PANEL_X + 376, y + 94, { size: 14, weight: 700, align: 'right', color: '#8a93a8' });
    y += h + 12;
  }

  if (y + 50 < costTop) {
    const ex = s.players.find((p) => p.id === s.explorer);
    const tr = s.players.find((p) => p.id === s.trader);
    text(ctx, `Explorer +2: ${ex ? ex.name : 'longest trail, 5+'}`, PANEL_X, y + 20, { size: 17, weight: 700, align: 'left', color: '#c3c9d6' });
    text(ctx, `Trader +1: ${tr ? tr.name : 'most deals, 3+'}`, PANEL_X, y + 44, { size: 17, weight: 700, align: 'left', color: '#c3c9d6' });
    y += 62;
  }

  // What just happened, newest at the bottom, in whatever room is left.
  const room = Math.floor((costTop - 12 - y) / 25);
  const log = room > 0 ? s.log.slice(-Math.min(4, room)) : [];
  log.forEach((line, i) => richLine(ctx, line, PANEL_X, y + 22 + i * 25, 375, `rgba(242,244,248,${0.4 + 0.6 * ((i + 1) / log.length)})`));

  // Building costs with drawn pieces and resources.
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PANEL_X, costTop - 4);
  ctx.lineTo(PANEL_X + 376, costTop - 4);
  ctx.stroke();
  const pc = s.players.find((p) => p.id === s.turn)?.color ?? '#c3c9d6';
  COSTS.forEach(([piece, label, res], i) => {
    const cy = costTop + 22 + i * 38;
    if (piece === 'trail') drawTrail(ctx, PANEL_X + 2, cy + 8, PANEL_X + 30, cy - 8, pc, 26);
    else if (piece === 'hut') drawHut(ctx, PANEL_X + 16, cy + 2, 14, pc);
    else if (piece === 'light') drawLighthouse(ctx, PANEL_X + 16, cy + 4, 13, pc);
    else drawBottle(ctx, PANEL_X + 16, cy, 26);
    text(ctx, label, PANEL_X + 40, cy + 7, { size: 18, weight: 700, align: 'left', color: '#9aa3b8' });
    res.forEach((r, j) => drawIcon(ctx, r, PANEL_X + 372 - (res.length - 1 - j) * 30, cy, 25));
  });
}

/** A log line with the server's resource emoji swapped for the drawn icons, cut to maxW. */
function richLine(ctx, line, x, y, maxW, color) {
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  let cx = x;
  for (const part of line.split(/(🪵|🥥|🐟|🐚|🪨)/u)) {
    if (!part) continue;
    if (EMOJI[part]) {
      if (cx + 22 > x + maxW) return void ctx.fillText('…', cx, y);
      drawIcon(ctx, EMOJI[part], cx + 10, y - 6, 20);
      cx += 22;
      continue;
    }
    let t = part;
    while (t && cx + ctx.measureText(t).width > x + maxW) t = t.slice(0, -1);
    ctx.fillStyle = color;
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t === part ? t : `${t.slice(0, -1)}…`, cx, y);
    if (t !== part) return;
    cx += ctx.measureText(t).width;
  }
}

// ---- How-to-play pictures (art keys in server/games/tidewake.js rules) ------------------------

function drawRules(ctx, art, t, box, now) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const T = now / 1000;
  ctx.save();
  if (art === 'goal') {
    drawTile(ctx, 'coco', cx - 170, cy + 40, 120, 3);
    drawTile(ctx, 'stone', cx + 170, cy + 40, 120, 5);
    drawHut(ctx, cx - 170, cy + 10, 70, '#ff5a5f');
    drawLighthouse(ctx, cx + 170, cy + 20, 70, '#3fa7ff', T, 0.6);
    serif(ctx, '1 point', cx - 170, cy + 150, 34, '#ffd27a', 'center');
    serif(ctx, '2 points', cx + 170, cy + 150, 34, '#ffd27a', 'center');
  } else if (art === 'harvest') {
    drawTile(ctx, 'fish', cx - 120, cy + 30, 130, 2);
    drawTileLife(ctx, 'fish', cx - 120, cy + 30, 130, T, 2);
    numberToken(ctx, cx - 120, cy + 80, 36, 8);
    drawHut(ctx, cx - 120, cy - 100, 46, '#ff5a5f');
    drawDie(ctx, cx - 380, cy - 40, 80, 5, -0.2 + Math.sin(T * 2) * 0.05);
    drawDie(ctx, cx - 290, cy - 20, 80, 3, 0.2);
    const q = (t * 0.6) % 1;
    const f = { sx: cx - 120, sy: cy - 100, ex: cx + 300, ey: cy, lift: 120 };
    const [x, y] = bez(f, ease(q));
    token(ctx, 'fish', x, y, 64);
    drawCrest(ctx, cx + 360, cy - 5, 40, '#ff5a5f', 'anchor');
  } else if (art === 'build') {
    drawTile(ctx, 'wood', cx - 104, cy + 20, 120, 4);
    drawTile(ctx, 'shell', cx + 104, cy + 20, 120, 6);
    const vx = cx;
    const vy = cy + 20 - 60;
    drawTrail(ctx, vx, vy + 120, vx, vy, '#4cd97b', 120);
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 5);
    drawHut(ctx, vx, vy, 50, '#4cd97b');
    ctx.globalAlpha = 1;
    ctx.setLineDash([10, 8]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(vx, vy, 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (art === 'trade') {
    drawCrest(ctx, cx - 300, cy, 50, '#ff5a5f', 'anchor');
    drawCrest(ctx, cx + 300, cy, 50, '#3fa7ff', 'wave');
    const q = ease((t * 0.5) % 1);
    for (const [kind, dir, dy] of [['wood', 1, -40], ['stone', -1, 50]]) {
      const x0 = cx - dir * 220;
      token(ctx, kind, x0 + dir * 440 * q, cy + dy - Math.sin(q * Math.PI) * 50, 80);
    }
  } else if (art === 'erupt') {
    drawTile(ctx, null, cx - 140, cy + 30, 140, 1);
    drawTileLife(ctx, null, cx - 140, cy + 30, 140, T, 1);
    drawSmoke(ctx, cx - 140, cy + 30, 140, T, 0.6);
    drawTile(ctx, 'coco', cx + 150, cy + 30, 120, 7);
    const q = Math.min(1, (t % 3) / 1.2);
    drawAsh(ctx, cx - 140 + 290 * ease(q), cy + 30 - Math.sin(q * Math.PI) * 80, 120, T);
  } else if (art === 'bottles') {
    ctx.save();
    ctx.translate(cx - 200, cy + 10);
    ctx.rotate(Math.sin(T * 1.5) * 0.15);
    drawBottle(ctx, 0, 0, 180);
    ctx.restore();
    pill(ctx, cx + 330, cy - 20, 'Explorer · +2', '#ffd27a', '#0d0f14', 34);
    pill(ctx, cx + 330, cy + 60, 'Trader · +1', '#8fd3ff', '#0d0f14', 34);
  }
  ctx.restore();
}
