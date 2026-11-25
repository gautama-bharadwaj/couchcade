// Dragon Hoard art, drawn in code on a 2D canvas: carved stone word tiles, Ember and Frost gems,
// dust, the dragon (a head for tiles, and the whole sleeping beast for the TV), team crests and
// lanterns. Shared by the TV renderer (public/tv/games/hoard.js) and the phones (the controller
// loads it for `art` fields; see "Drawn art" in server/games/index.js). Everything takes a canvas
// context and a centre + size (or a box), and leaves the context as it found it.

export const TEAM_COLOR = { ember: '#ff8a3d', frost: '#4cb8ff' };
export const INK = '#2b2418';
const OUT = '#140d0a';

/** Small deterministic random numbers, so a tile looks the same every frame. */
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < 4; i++) next();
  return next;
}

export function shade(hex, k) {
  const n = parseInt(String(hex).slice(1, 7), 16) || 0;
  const t = k < 0 ? 0 : 255;
  const a = Math.abs(k);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (t - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function rgba(hex, a) {
  const n = parseInt(String(hex).slice(1, 7), 16) || 0;
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

function ell(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

function outline(g, s, c = OUT) {
  g.strokeStyle = c;
  g.lineWidth = Math.max(1, s * 0.035);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}

export function sparkle(g, x, y, s, color = '#fffbe8') {
  if (s <= 0.5) return;
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x, y - s);
  g.quadraticCurveTo(x, y, x + s, y);
  g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y);
  g.quadraticCurveTo(x, y, x, y - s);
  g.fill();
  g.restore();
}

// ---- Gems, coins, dust ------------------------------------------------------------------------

const GEM = {
  ember: ['#ffd08a', '#ff6a2a', '#a8240e'],
  frost: ['#e6f8ff', '#4cb8ff', '#1a4a9a'],
};

/** A cut gem, about s across: an Ember fire-opal or a Frost sapphire. shine 0..1 adds a glint. */
export function drawGem(g, x, y, s, team = 'ember', shine = 0) {
  const [hi, mid, lo] = GEM[team] ?? GEM.ember;
  g.save();
  g.translate(x, y);
  const r = s / 2;
  // an octagonal crown seen from above, with a table in the middle
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.86]);
  }
  const grd = g.createLinearGradient(-r, -r, r, r);
  grd.addColorStop(0, hi);
  grd.addColorStop(0.45, mid);
  grd.addColorStop(1, lo);
  g.fillStyle = grd;
  g.beginPath();
  pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
  g.closePath();
  g.fill();
  outline(g, s);
  const tbl = pts.map(([a, b]) => [a * 0.52, b * 0.52]);
  g.fillStyle = rgba('#ffffff', 0.22);
  g.beginPath();
  tbl.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
  g.closePath();
  g.fill();
  g.strokeStyle = rgba('#ffffff', 0.5);
  g.lineWidth = Math.max(1, s * 0.025);
  g.stroke();
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    g.moveTo(tbl[i][0], tbl[i][1]);
    g.lineTo(pts[i][0], pts[i][1]);
  }
  g.stroke();
  // a dark facet or two for depth
  g.fillStyle = rgba('#000000', 0.18);
  g.beginPath();
  g.moveTo(tbl[0][0], tbl[0][1]);
  g.lineTo(pts[0][0], pts[0][1]);
  g.lineTo(pts[1][0], pts[1][1]);
  g.lineTo(tbl[1][0], tbl[1][1]);
  g.closePath();
  g.fill();
  g.fillStyle = rgba('#ffffff', 0.55);
  g.beginPath();
  g.moveTo(tbl[4][0], tbl[4][1]);
  g.lineTo(pts[4][0], pts[4][1]);
  g.lineTo(pts[5][0], pts[5][1]);
  g.lineTo(tbl[5][0], tbl[5][1]);
  g.closePath();
  g.fill();
  if (team === 'ember') {
    // a little flame inside
    g.fillStyle = rgba('#fff3b0', 0.75);
    g.beginPath();
    g.moveTo(0, r * 0.3);
    g.quadraticCurveTo(-r * 0.25, 0, 0, -r * 0.32);
    g.quadraticCurveTo(r * 0.25, 0, 0, r * 0.3);
    g.fill();
  } else {
    // a frost star inside
    g.strokeStyle = rgba('#ffffff', 0.8);
    g.lineWidth = Math.max(1, s * 0.03);
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      g.moveTo(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3);
      g.lineTo(-Math.cos(a) * r * 0.3, -Math.sin(a) * r * 0.3);
    }
    g.stroke();
  }
  if (shine > 0) sparkle(g, r * 0.45, -r * 0.5, s * 0.35 * shine);
  g.restore();
}

/** An empty gem setting, for gems still to find. */
export function drawGemSlot(g, x, y, s) {
  g.save();
  g.translate(x, y);
  const r = s / 2;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.cos(a) * r;
    const py = Math.sin(a) * r * 0.86;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fill();
  g.strokeStyle = 'rgba(242,233,216,.35)';
  g.lineWidth = Math.max(1, s * 0.06);
  g.stroke();
  g.restore();
}

export function drawCoin(g, x, y, s, tilt = 0.45) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#a8761c';
  ell(g, 0, s * 0.08, s / 2, (s / 2) * tilt);
  g.fill();
  const cg = g.createLinearGradient(-s / 2, 0, s / 2, 0);
  cg.addColorStop(0, '#ffe58a');
  cg.addColorStop(1, '#d8a030');
  g.fillStyle = cg;
  ell(g, 0, 0, s / 2, (s / 2) * tilt);
  g.fill();
  g.strokeStyle = '#8a5a10';
  g.lineWidth = Math.max(1, s * 0.06);
  g.stroke();
  ell(g, 0, 0, s * 0.3, s * 0.3 * tilt);
  g.stroke();
  g.restore();
}

/** A heap of gold coins, w wide, sitting on (x, y). */
export function drawCoins(g, x, y, w, seed = 1, t = 0) {
  const R = rng(seed);
  g.save();
  const hg = g.createRadialGradient(x, y, 2, x, y, w * 0.6);
  hg.addColorStop(0, '#d8a030');
  hg.addColorStop(1, '#7a4a10');
  g.fillStyle = hg;
  g.beginPath();
  g.ellipse(x, y, w / 2, w * 0.22, 0, Math.PI, 0);
  g.fill();
  const n = Math.round(w / 9);
  for (let i = 0; i < n; i++) {
    const a = R() * Math.PI;
    const d = Math.sqrt(R());
    const cx = x + Math.cos(a) * d * w * 0.44;
    const cy = y - Math.sin(a) * d * w * 0.19 + 2;
    drawCoin(g, cx, cy, w * (0.1 + R() * 0.05), 0.35 + R() * 0.3);
  }
  for (let i = 0; i < 3; i++) {
    const tw = Math.sin(t * 2.2 + i * 2.1 + seed);
    if (tw > 0.6) sparkle(g, x + (R() - 0.5) * w * 0.7, y - R() * w * 0.16, w * 0.05 * (tw - 0.6) * 2.5);
  }
  g.restore();
}

export function drawDust(g, x, y, s, seed = 3) {
  const R = rng(seed);
  g.save();
  g.translate(x, y);
  const dg = g.createLinearGradient(0, -s * 0.3, 0, s * 0.2);
  dg.addColorStop(0, '#c8bca2');
  dg.addColorStop(1, '#7a7060');
  g.fillStyle = dg;
  g.beginPath();
  g.moveTo(-s * 0.5, s * 0.2);
  g.quadraticCurveTo(-s * 0.3, -s * 0.05, -s * 0.12, -s * 0.12);
  g.quadraticCurveTo(0, -s * 0.32, s * 0.14, -s * 0.12);
  g.quadraticCurveTo(s * 0.3, -s * 0.05, s * 0.5, s * 0.2);
  g.closePath();
  g.fill();
  outline(g, s, '#3a3428');
  g.fillStyle = 'rgba(60,52,40,.45)';
  for (let i = 0; i < 9; i++) {
    ell(g, (R() - 0.5) * s * 0.7, R() * s * 0.25 - s * 0.05, s * 0.02, s * 0.015);
    g.fill();
  }
  // a little bone
  g.save();
  g.translate(s * 0.18, s * 0.12);
  g.rotate(-0.4);
  g.fillStyle = '#efe6d0';
  g.fillRect(-s * 0.1, -s * 0.018, s * 0.2, s * 0.036);
  for (const d of [-1, 1]) {
    ell(g, d * s * 0.1, -s * 0.022, s * 0.026, s * 0.026);
    g.fill();
    ell(g, d * s * 0.1, s * 0.022, s * 0.026, s * 0.026);
    g.fill();
  }
  g.restore();
  // puffs
  g.fillStyle = 'rgba(200,190,170,.35)';
  for (const [a, b, r] of [[-0.3, -0.2, 0.1], [0.25, -0.28, 0.08], [0.05, -0.42, 0.06]]) {
    ell(g, a * s, b * s, r * s, r * s);
    g.fill();
  }
  g.restore();
}

function cobweb(g, x, y, s, dir = 1) {
  g.save();
  g.strokeStyle = 'rgba(230,225,210,.35)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= 4; i++) {
    const a = (i / 4) * (Math.PI / 2);
    g.moveTo(x, y);
    g.lineTo(x + dir * Math.cos(a) * s, y + Math.sin(a) * s);
  }
  for (const k of [0.35, 0.65, 0.95]) {
    for (let i = 0; i < 4; i++) {
      const a1 = (i / 4) * (Math.PI / 2);
      const a2 = ((i + 1) / 4) * (Math.PI / 2);
      g.moveTo(x + dir * Math.cos(a1) * s * k, y + Math.sin(a1) * s * k);
      g.quadraticCurveTo(x + dir * Math.cos((a1 + a2) / 2) * s * k * 0.85, y + Math.sin((a1 + a2) / 2) * s * k * 0.85, x + dir * Math.cos(a2) * s * k, y + Math.sin(a2) * s * k);
    }
  }
  g.stroke();
  g.restore();
}

// ---- The dragon ------------------------------------------------------------------------------

const SCALE = '#8a1c22';
const SCALE_DARK = '#4a0a10';
const BELLY = '#e8a860';

/**
 * A dragon's head in profile, facing right, about s long, centred on (x, y).
 * wake 0..1: 0 = asleep (eye shut, smoke curling), 1 = awake (eye glowing, jaws open).
 */
export function drawDragonHead(g, x, y, s, wake = 0, t = 0, flip = false) {
  g.save();
  g.translate(x, y);
  if (flip) g.scale(-1, 1);
  const k = s / 100;
  g.scale(k, k);
  g.lineJoin = 'round';
  // horns
  g.fillStyle = '#e8dcc0';
  for (const [hx, hy, len, rot] of [[-30, -24, 46, -2.6], [-18, -30, 40, -2.3]]) {
    g.save();
    g.translate(hx, hy);
    g.rotate(rot);
    g.beginPath();
    g.moveTo(0, -6);
    g.quadraticCurveTo(len * 0.6, -8, len, 6);
    g.quadraticCurveTo(len * 0.5, 2, 0, 6);
    g.closePath();
    g.fill();
    g.strokeStyle = OUT;
    g.lineWidth = 3;
    g.stroke();
    g.restore();
  }
  const jaw = wake * 0.42;
  // lower jaw
  g.save();
  g.translate(-14, 10);
  g.rotate(jaw);
  g.fillStyle = SCALE_DARK;
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(64, 0);
  g.quadraticCurveTo(70, 8, 60, 12);
  g.lineTo(4, 16);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = BELLY;
  g.beginPath();
  g.moveTo(6, 14);
  g.lineTo(58, 11);
  g.lineTo(56, 14);
  g.lineTo(8, 18);
  g.closePath();
  g.fill();
  if (wake > 0.2) {
    g.fillStyle = '#fff6e0';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(18 + i * 12, -3);
      g.lineTo(22 + i * 12, -12);
      g.lineTo(26 + i * 12, -3);
      g.fill();
    }
  }
  g.restore();
  // mouth glow when awake
  if (wake > 0.3) {
    const mg = g.createRadialGradient(40, 14, 2, 40, 14, 40);
    mg.addColorStop(0, `rgba(255,220,120,${wake})`);
    mg.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = mg;
    ell(g, 40, 14, 40, 22);
    g.fill();
  }
  // skull and snout
  const hg = g.createLinearGradient(0, -36, 0, 18);
  hg.addColorStop(0, '#c0303a');
  hg.addColorStop(1, SCALE);
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(-46, 0);
  g.quadraticCurveTo(-46, -34, -14, -34);
  g.quadraticCurveTo(10, -34, 24, -18);
  g.lineTo(66, -12);
  g.quadraticCurveTo(80, -10, 78, 2);
  g.quadraticCurveTo(76, 10, 64, 10);
  g.lineTo(-10, 12);
  g.quadraticCurveTo(-46, 22, -46, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 3.5;
  g.stroke();
  // brow ridge and scales
  g.fillStyle = SCALE_DARK;
  g.beginPath();
  g.moveTo(-6, -30);
  g.quadraticCurveTo(14, -32, 22, -20);
  g.quadraticCurveTo(10, -24, -4, -22);
  g.closePath();
  g.fill();
  g.strokeStyle = rgba('#000000', 0.25);
  g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(-34 + i * 10, -12 + (i % 2) * 8, 5, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  // nostril
  g.fillStyle = OUT;
  ell(g, 68, -5, 4, 2.5, -0.3);
  g.fill();
  // eye
  if (wake < 0.25) {
    g.strokeStyle = OUT;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(4, -18, 8, 0.2, Math.PI - 0.2);
    g.stroke();
  } else {
    const glow = g.createRadialGradient(4, -18, 1, 4, -18, 22);
    glow.addColorStop(0, `rgba(255,230,80,${0.8 * wake})`);
    glow.addColorStop(1, 'rgba(255,200,40,0)');
    g.fillStyle = glow;
    ell(g, 4, -18, 22, 22);
    g.fill();
    g.fillStyle = '#ffe14a';
    ell(g, 4, -18, 9, 7 * Math.min(1, wake * 1.5));
    g.fill();
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = OUT;
    ell(g, 5, -18, 2, 6 * Math.min(1, wake * 1.5));
    g.fill();
  }
  // smoke from the nostril while asleep
  if (wake < 0.5) {
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.35 + i / 3) % 1;
      g.fillStyle = `rgba(200,190,180,${0.35 * (1 - q) * (1 - wake * 2)})`;
      ell(g, 74 + q * 24 + Math.sin(q * 6 + i) * 4, -10 - q * 40, 4 + q * 10, 4 + q * 10);
      g.fill();
    }
  }
  g.restore();
}

/**
 * The whole dragon, asleep along the bottom of the cave: head on the left at (hx, hy), its body
 * winding right to the tail at x = tailX. wake 0..1 lifts the head (to lift px higher) and opens
 * its eye. breath 0..1 is its slow breathing.
 */
export function drawSleepingDragon(g, hx, hy, tailX, s, t = 0, wake = 0, lift = 0) {
  const breath = Math.sin(t * 1.1);
  const N = 60;
  const x0 = hx + s * 0.25;
  const spine = [];
  for (let i = 0; i <= N; i++) {
    const q = i / N;
    const x = x0 + (tailX - x0) * q;
    const y = hy + s * 0.15 + Math.sin(q * Math.PI * 2.2 + 0.4) * s * 0.12 - q * s * 0.05;
    spine.push([x, y]);
  }
  const thick = (q) => s * (0.34 * (1 - q) ** 0.8 + 0.03) * (1 + breath * 0.035 * (1 - q));
  const top = [];
  const bot = [];
  for (let i = 0; i <= N; i++) {
    const [x, y] = spine[i];
    const [ax, ay] = spine[Math.max(0, i - 1)];
    const [bx, by] = spine[Math.min(N, i + 1)];
    let nx = -(by - ay);
    let ny = bx - ax;
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    const th = thick(i / N);
    top.push([x - nx * th, y - ny * th]);
    bot.push([x + nx * th, y + ny * th]);
  }
  g.save();
  g.lineJoin = 'round';
  // folded wing, rising behind the body
  const wx = x0 + (tailX - x0) * 0.28;
  const wy = hy + s * 0.05;
  g.fillStyle = '#5a0e16';
  g.beginPath();
  g.moveTo(wx - s * 0.3, wy);
  g.lineTo(wx - s * 0.05, wy - s * 0.55 - breath * 3);
  g.lineTo(wx + s * 0.2, wy - s * 0.42);
  g.quadraticCurveTo(wx + s * 0.15, wy - s * 0.2, wx + s * 0.4, wy - s * 0.05);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 3;
  g.stroke();
  g.strokeStyle = '#2a0408';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(wx - s * 0.05, wy - s * 0.55);
  g.lineTo(wx - s * 0.02, wy);
  g.moveTo(wx - s * 0.05, wy - s * 0.55);
  g.lineTo(wx + s * 0.18, wy - s * 0.04);
  g.stroke();
  // body
  const bg = g.createLinearGradient(0, hy - s * 0.3, 0, hy + s * 0.5);
  bg.addColorStop(0, '#b02a34');
  bg.addColorStop(1, SCALE_DARK);
  g.fillStyle = bg;
  g.beginPath();
  top.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = N; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 3.5;
  g.stroke();
  // belly plates
  g.fillStyle = BELLY;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const [x, y] = bot[i];
    const [sx, sy] = spine[i];
    const px = x + (sx - x) * 0.35;
    const py = y + (sy - y) * 0.35;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  for (let i = N; i >= 0; i--) g.lineTo(bot[i][0], bot[i][1]);
  g.closePath();
  g.fill();
  g.strokeStyle = rgba('#7a4a20', 0.6);
  g.lineWidth = 1.5;
  for (let i = 2; i < N; i += 2) {
    const [x, y] = bot[i];
    const [sx, sy] = spine[i];
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (sx - x) * 0.35, y + (sy - y) * 0.35);
    g.stroke();
  }
  // scales
  g.strokeStyle = rgba('#000000', 0.22);
  g.lineWidth = 2;
  for (let i = 3; i < N - 4; i += 2) {
    const [sx, sy] = spine[i];
    const r = thick(i / N) * 0.3;
    g.beginPath();
    g.arc(sx, sy - r * 0.6, r, 0.2, Math.PI - 0.2);
    g.stroke();
  }
  // spikes along the back
  g.fillStyle = '#e8dcc0';
  for (let i = 2; i < N - 2; i += 3) {
    const [x, y] = top[i];
    const [sx, sy] = spine[i];
    const dx = x - sx;
    const dy = y - sy;
    const l = Math.hypot(dx, dy) || 1;
    const h = s * 0.12 * (1 - i / N) + 4;
    g.beginPath();
    g.moveTo(x - (dy / l) * h * 0.4, y + (dx / l) * h * 0.4);
    g.lineTo(x + (dx / l) * h, y + (dy / l) * h);
    g.lineTo(x + (dy / l) * h * 0.4, y - (dx / l) * h * 0.4);
    g.closePath();
    g.fill();
    g.strokeStyle = OUT;
    g.lineWidth = 2;
    g.stroke();
  }
  // tail tip
  const [tx, ty] = spine[N];
  g.fillStyle = SCALE_DARK;
  g.beginPath();
  g.moveTo(tx - 6, ty - 6);
  g.lineTo(tx + 26, ty - 14);
  g.lineTo(tx + 8, ty + 8);
  g.closePath();
  g.fill();
  g.strokeStyle = OUT;
  g.lineWidth = 2.5;
  g.stroke();
  // neck up to the head: a thick curve, outlined
  const headY = hy - lift * wake;
  const nx0 = spine[2][0];
  const ny0 = spine[2][1];
  const neck = () => {
    g.beginPath();
    g.moveTo(nx0, ny0);
    g.bezierCurveTo(nx0 - s * 0.15, ny0, hx + s * 0.05, headY + s * 0.25, hx - s * 0.12, headY + s * 0.02);
  };
  g.lineCap = 'round';
  neck();
  g.strokeStyle = OUT;
  g.lineWidth = s * 0.3 + 7;
  g.stroke();
  neck();
  g.strokeStyle = '#9a2430';
  g.lineWidth = s * 0.3;
  g.stroke();
  // front claw
  g.fillStyle = SCALE_DARK;
  ell(g, x0 + s * 0.2, hy + s * 0.42, s * 0.14, s * 0.06);
  g.fill();
  g.fillStyle = '#e8dcc0';
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(x0 + s * 0.3 + i * 6, hy + s * 0.4);
    g.lineTo(x0 + s * 0.38 + i * 6, hy + s * 0.46);
    g.lineTo(x0 + s * 0.3 + i * 6, hy + s * 0.47);
    g.fill();
  }
  drawDragonHead(g, hx, headY, s * 0.9, wake, t, false);
  // Zzz while asleep
  if (wake < 0.1) {
    for (let i = 0; i < 3; i++) {
      const q = (t * 0.25 + i / 3) % 1;
      g.fillStyle = `rgba(232,220,192,${0.7 * Math.sin(q * Math.PI)})`;
      g.font = `900 ${Math.round(s * (0.1 + q * 0.12))}px Georgia, serif`;
      g.textAlign = 'center';
      g.fillText('z', hx + s * 0.2 + q * s * 0.3, headY - s * 0.3 - q * s * 0.5);
    }
  }
  g.restore();
}

// ---- Tiles -----------------------------------------------------------------------------------

/**
 * A word tile's background, w x h, centred on (x, y). No words: the caller writes them.
 * kind: 'hidden' (a carved stone, face down); 'ember' | 'frost' | 'dust' | 'dragon' (turned
 * over). key (optional, with 'hidden'): what's underneath, shown as a tint and a corner mark
 * (the Keeper's view, and the end of the game).
 */
export function drawTile(g, kind, x, y, w, h, o = {}) {
  const seed = o.seed ?? 1;
  const t = o.t ?? 0;
  const R = rng(seed + 11);
  const r = Math.min(w, h) * 0.12;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath();
  g.roundRect(-w / 2 + 2, -h / 2 + 5, w, h, r);
  g.fill();
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, r);
  if (kind === 'hidden') {
    const sg = g.createLinearGradient(0, -h / 2, 0, h / 2);
    sg.addColorStop(0, '#efe5cc');
    sg.addColorStop(1, '#cdbf9e');
    g.fillStyle = sg;
    g.fill();
    g.save();
    g.clip();
    // speckles and a crack or two
    g.fillStyle = 'rgba(90,70,40,.12)';
    for (let i = 0; i < 14; i++) {
      ell(g, (R() - 0.5) * w, (R() - 0.5) * h, 1 + R() * 2, 1 + R() * 2);
      g.fill();
    }
    g.strokeStyle = 'rgba(90,70,40,.25)';
    g.lineWidth = 1;
    g.beginPath();
    let cx = (R() > 0.5 ? 1 : -1) * w / 2;
    let cy = (R() - 0.5) * h * 0.6;
    g.moveTo(cx, cy);
    for (let i = 0; i < 3; i++) {
      cx -= Math.sign(cx) * w * (0.05 + R() * 0.06);
      cy += (R() - 0.5) * h * 0.2;
      g.lineTo(cx, cy);
    }
    g.stroke();
    if (o.key) {
      g.fillStyle = o.key === 'dust' ? 'rgba(120,110,90,.38)' : o.key === 'dragon' ? 'rgba(110,10,20,.82)' : rgba(TEAM_COLOR[o.key], 0.5);
      g.fillRect(-w / 2, -h / 2, w, h);
    }
    g.restore();
    // bevel
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = Math.max(1, h * 0.03);
    g.beginPath();
    g.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r * 0.8);
    g.stroke();
    g.strokeStyle = 'rgba(110,85,50,.4)';
    g.lineWidth = Math.max(1, h * 0.02);
    g.beginPath();
    g.roundRect(-w / 2 + h * 0.08, -h / 2 + h * 0.08, w - h * 0.16, h - h * 0.16, r * 0.6);
    g.stroke();
    // rune notches in the corners
    g.strokeStyle = 'rgba(110,85,50,.45)';
    g.lineWidth = Math.max(1, h * 0.025);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const ax = sx * (w / 2 - h * 0.17);
      const ay = sy * (h / 2 - h * 0.17);
      g.beginPath();
      g.moveTo(ax, ay - sy * h * 0.06);
      g.lineTo(ax, ay);
      g.lineTo(ax - sx * h * 0.06, ay);
      g.stroke();
    }
    if (o.key) {
      const m = h * 0.26;
      const mx = w / 2 - m * 0.75;
      const my = -h / 2 + m * 0.75;
      if (o.key === 'dust') drawDust(g, mx, my + m * 0.1, m * 1.1, seed);
      else if (o.key === 'dragon') drawDragonHead(g, mx - m * 0.15, my + m * 0.05, m * 1.2, 0, t);
      else drawGem(g, mx, my, m, o.key, 0);
    }
  } else if (kind === 'ember' || kind === 'frost') {
    const c = TEAM_COLOR[kind];
    const vg = g.createRadialGradient(0, -h * 0.1, 4, 0, 0, w * 0.6);
    vg.addColorStop(0, shade(c, -0.15));
    vg.addColorStop(1, shade(c, -0.6));
    g.fillStyle = vg;
    g.fill();
    g.save();
    g.clip();
    // rays behind the gem
    g.fillStyle = rgba('#ffffff', 0.08);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + t * 0.2;
      g.beginPath();
      g.moveTo(0, -h * 0.12);
      g.arc(0, -h * 0.12, w, a, a + 0.18);
      g.closePath();
      g.fill();
    }
    drawCoins(g, -w * 0.3, h / 2 + 2, w * 0.42, seed, t);
    drawCoins(g, w * 0.32, h / 2 + 4, w * 0.36, seed + 5, t);
    g.restore();
    const gs = Math.min(h * 0.58, w * 0.4) * (1 + 0.04 * Math.sin(t * 3 + seed));
    drawGem(g, 0, -h * 0.12, gs, kind, 0.5 + 0.5 * Math.sin(t * 2 + seed));
    g.strokeStyle = rgba('#fff3d0', 0.6);
    g.lineWidth = Math.max(1, h * 0.03);
    g.beginPath();
    g.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r * 0.8);
    g.stroke();
  } else if (kind === 'dust') {
    const dg = g.createLinearGradient(0, -h / 2, 0, h / 2);
    dg.addColorStop(0, '#4e463c');
    dg.addColorStop(1, '#2e2924');
    g.fillStyle = dg;
    g.fill();
    g.save();
    g.clip();
    cobweb(g, -w / 2, -h / 2, h * 0.55, 1);
    cobweb(g, w / 2, -h / 2, h * 0.4, -1);
    g.restore();
    drawDust(g, -w * 0.3, h * 0.05, Math.min(h * 0.6, w * 0.32), seed);
  } else if (kind === 'dragon') {
    const fg = g.createLinearGradient(0, -h / 2, 0, h / 2);
    fg.addColorStop(0, '#6a0c16');
    fg.addColorStop(1, '#1d0508');
    g.fillStyle = fg;
    g.fill();
    g.save();
    g.clip();
    // embers rising
    for (let i = 0; i < 10; i++) {
      const q = (t * 0.4 + i / 10) % 1;
      g.fillStyle = `rgba(255,${140 + i * 10},60,${0.8 * (1 - q)})`;
      ell(g, ((i * 53) % w) - w / 2, h / 2 - q * h, 2, 2);
      g.fill();
    }
    g.restore();
    drawDragonHead(g, -w * 0.08, -h * 0.04, Math.min(h * 0.95, w * 0.55), 1, t);
    g.strokeStyle = '#ff5a3a';
    g.lineWidth = Math.max(1, h * 0.03);
    g.beginPath();
    g.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, r * 0.8);
    g.stroke();
  }
  g.restore();
}

// ---- Crests and lanterns ---------------------------------------------------------------------

/** A team's shield: Ember's flame, Frost's snowflake. */
export function drawCrest(g, team, x, y, s) {
  const c = TEAM_COLOR[team] ?? '#888';
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(-s * 0.42, -s * 0.44);
  g.lineTo(s * 0.42, -s * 0.44);
  g.lineTo(s * 0.42, s * 0.02);
  g.quadraticCurveTo(s * 0.38, s * 0.34, 0, s * 0.5);
  g.quadraticCurveTo(-s * 0.38, s * 0.34, -s * 0.42, s * 0.02);
  g.closePath();
  const sg = g.createLinearGradient(0, -s / 2, 0, s / 2);
  sg.addColorStop(0, shade(c, 0.1));
  sg.addColorStop(1, shade(c, -0.45));
  g.fillStyle = sg;
  g.fill();
  outline(g, s * 1.4);
  g.strokeStyle = 'rgba(255,240,210,.7)';
  g.lineWidth = Math.max(1, s * 0.04);
  g.beginPath();
  g.moveTo(-s * 0.34, -s * 0.36);
  g.lineTo(s * 0.34, -s * 0.36);
  g.lineTo(s * 0.34, s * 0.0);
  g.quadraticCurveTo(s * 0.3, s * 0.27, 0, s * 0.4);
  g.quadraticCurveTo(-s * 0.3, s * 0.27, -s * 0.34, s * 0.0);
  g.closePath();
  g.stroke();
  if (team === 'ember') {
    g.fillStyle = '#fff1c8';
    g.beginPath();
    g.moveTo(0, s * 0.3);
    g.quadraticCurveTo(-s * 0.24, s * 0.2, -s * 0.16, -s * 0.02);
    g.quadraticCurveTo(-s * 0.1, s * 0.06, -s * 0.06, s * 0.04);
    g.quadraticCurveTo(-s * 0.08, -s * 0.16, s * 0.04, -s * 0.3);
    g.quadraticCurveTo(s * 0.02, -s * 0.12, s * 0.12, -s * 0.06);
    g.quadraticCurveTo(s * 0.26, s * 0.12, 0, s * 0.3);
    g.fill();
    g.fillStyle = '#ffb040';
    g.beginPath();
    g.moveTo(0, s * 0.26);
    g.quadraticCurveTo(-s * 0.1, s * 0.16, -s * 0.02, s * 0.02);
    g.quadraticCurveTo(s * 0.12, s * 0.14, 0, s * 0.26);
    g.fill();
  } else {
    g.strokeStyle = '#f0fbff';
    g.lineWidth = Math.max(1.5, s * 0.06);
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + Math.PI / 2;
      const dx = Math.cos(a) * s * 0.26;
      const dy = Math.sin(a) * s * 0.26;
      g.moveTo(-dx, -dy);
      g.lineTo(dx, dy);
      for (const d of [-1, 1]) {
        const ex = d * dx;
        const ey = d * dy;
        const bx = ex * 0.6;
        const by = ey * 0.6;
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a + d * 0.0 + 0.7) * s * 0.08 * d, by + Math.sin(a + 0.7) * s * 0.08 * d);
        g.moveTo(bx, by);
        g.lineTo(bx + Math.cos(a - 0.7) * s * 0.08 * d, by + Math.sin(a - 0.7) * s * 0.08 * d);
      }
    }
    g.stroke();
  }
  g.restore();
}

/** A hanging lantern: one per clue left in the co-op game. lit = still has its flame. */
export function drawLantern(g, x, y, s, lit, t = 0) {
  g.save();
  g.translate(x, y);
  if (lit) {
    const gl = g.createRadialGradient(0, 0, 2, 0, 0, s * 1.2);
    gl.addColorStop(0, `rgba(255,200,90,${0.45 + 0.08 * Math.sin(t * 6 + x)})`);
    gl.addColorStop(1, 'rgba(255,200,90,0)');
    g.fillStyle = gl;
    g.fillRect(-s * 1.2, -s * 1.2, s * 2.4, s * 2.4);
  }
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.moveTo(0, -s * 0.7);
  g.lineTo(0, -s * 0.48);
  g.stroke();
  g.fillStyle = lit ? '#ffcf6a' : '#3a312a';
  g.beginPath();
  g.roundRect(-s * 0.28, -s * 0.36, s * 0.56, s * 0.66, s * 0.12);
  g.fill();
  g.strokeStyle = '#2a1e12';
  g.lineWidth = Math.max(1.5, s * 0.08);
  g.stroke();
  g.beginPath();
  g.moveTo(0, -s * 0.36);
  g.lineTo(0, s * 0.3);
  g.stroke();
  g.fillStyle = '#2a1e12';
  g.fillRect(-s * 0.34, -s * 0.48, s * 0.68, s * 0.12);
  g.fillRect(-s * 0.3, s * 0.3, s * 0.6, s * 0.1);
  if (lit) {
    g.fillStyle = '#fff6d0';
    ell(g, 0, s * 0.02, s * 0.08, s * 0.14 + Math.sin(t * 9 + x) * s * 0.02);
    g.fill();
  }
  g.restore();
}

/** A burning wall torch, for the cave. */
export function drawTorch(g, x, y, s, t = 0) {
  g.save();
  g.translate(x, y);
  const gl = g.createRadialGradient(0, -s * 0.5, 2, 0, -s * 0.5, s * 3);
  gl.addColorStop(0, 'rgba(255,170,60,.35)');
  gl.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = gl;
  g.fillRect(-s * 3, -s * 3.5, s * 6, s * 6);
  g.fillStyle = '#4a2e1a';
  g.beginPath();
  g.moveTo(-s * 0.12, -s * 0.2);
  g.lineTo(s * 0.12, -s * 0.2);
  g.lineTo(s * 0.06, s * 0.6);
  g.lineTo(-s * 0.06, s * 0.6);
  g.closePath();
  g.fill();
  g.fillStyle = '#6a6a72';
  g.fillRect(-s * 0.18, -s * 0.28, s * 0.36, s * 0.12);
  for (const [c, k] of [['#ff6a2a', 1], ['#ffb040', 0.7], ['#fff1b0', 0.4]]) {
    const f = Math.sin(t * 11 + k * 5) * 0.08;
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(-s * 0.2 * k, -s * 0.3);
    g.quadraticCurveTo(-s * 0.25 * k, -s * (0.7 + f) * k - s * 0.3, f * s, -s * (1.1 + f) * k - s * 0.3);
    g.quadraticCurveTo(s * 0.25 * k, -s * (0.7 - f) * k - s * 0.3, s * 0.2 * k, -s * 0.3);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// ---- Phones ----------------------------------------------------------------------------------

/**
 * Named icons for phone screens: 'gem:ember' | 'gem:frost', 'crest:ember' | 'crest:frost',
 * 'dust', 'dragon', 'lantern'.
 */
export function drawNamed(g, name, x, y, s) {
  const [kind, arg] = String(name).split(':');
  if (kind === 'gem') return drawGem(g, x, y, s * 0.8, arg, 0.6);
  if (kind === 'crest') return drawCrest(g, arg, x, y, s * 0.92);
  if (kind === 'dust') return drawDust(g, x, y + s * 0.1, s);
  if (kind === 'dragon') return drawDragonHead(g, x - s * 0.08, y + s * 0.05, s * 0.9, 1, 0);
  if (kind === 'lantern') return drawLantern(g, x, y + s * 0.1, s * 0.9, true, 0);
}

/**
 * A grid cell's background on the phone (see "grid" in server/games/index.js): `art` is
 * 'hidden', 'key:<owner>' (the Keeper's view), or '<owner>' for a word that has turned over.
 */
export function drawCell(g, art, w, h, cell) {
  const [a, b] = String(art).split(':');
  const seed = Number(cell?.id ?? 0) + 1;
  // Words sit in the middle on the phone, so turned-over tiles keep their picture small.
  if (a === 'key') drawTile(g, 'hidden', w / 2, h / 2, w - 2, h - 4, { key: b, seed });
  else if (a === 'hidden') drawTile(g, 'hidden', w / 2, h / 2, w - 2, h - 4, { seed });
  else drawTile(g, a, w / 2, h / 2, w - 2, h - 4, { seed });
}
