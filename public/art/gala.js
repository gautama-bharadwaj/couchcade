// Midnight Gala art, drawn in code on a 2D canvas: masked party guests, the five role cards, the
// mansion's four rooms with their jewel cases, gems, and the little icons the phones use. Shared
// by the TV renderer (public/tv/games/gala.js) and the phones (the controller loads it for `art`
// fields; see "Drawn art" in server/games/index.js). Everything takes a canvas context and a
// centre + size, and leaves the context as it found it.

export const GOLD = '#e9c46a';
export const GOLD_DARK = '#9a7426';
export const INK = '#0c0a12';
export const SERIF = 'Georgia, "Times New Roman", serif';

export const ROLE_COLOR = { thief: '#ff5a5f', detective: '#3fa7ff', bodyguard: '#2ee6d6', gossip: '#ff6fd8', guest: '#8a93a8' };
export const ROLE_LABEL = { thief: 'Thief', detective: 'Detective', bodyguard: 'Bodyguard', gossip: 'Gossip', guest: 'Guest' };
export const ROOM_COLOR = { library: '#b36bff', ballroom: '#ffc93c', conservatory: '#4cd97b', cellar: '#ff8c42' };

const SKINS = ['#f1c8a5', '#e0a878', '#c68652', '#8d5a36', '#5e3a22', '#f6d9c0'];

/** Small deterministic random numbers, so a picture looks the same every frame. */
export function rng(seed) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** A stable number from a string (a player id, say). */
export function seedOf(str) {
  let h = 7;
  for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/** Mix a #rrggbb colour toward black (k < 0) or white (k > 0). */
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

function outline(g, s) {
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, s * 0.03);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}

function ell(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

// ---- Gems -------------------------------------------------------------------------------------

/** A cut gem, about s across, pointing down. shine 0..1 adds a sparkle. */
export function drawGem(g, x, y, s, color = '#ff5a5f', shine = 0) {
  g.save();
  g.translate(x, y);
  const r = s / 2;
  const top = -r * 0.55;
  const girdle = -r * 0.1;
  const pts = [[-r, girdle], [-r * 0.55, top], [r * 0.55, top], [r, girdle], [0, r * 0.95]];
  const grd = g.createLinearGradient(-r, top, r, r);
  grd.addColorStop(0, shade(color, 0.45));
  grd.addColorStop(0.5, color);
  grd.addColorStop(1, shade(color, -0.45));
  g.fillStyle = grd;
  g.beginPath();
  pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b)));
  g.closePath();
  g.fill();
  outline(g, s * 1.1);
  // facets
  g.strokeStyle = rgba('#ffffff', 0.45);
  g.lineWidth = Math.max(1, s * 0.025);
  g.beginPath();
  g.moveTo(-r, girdle);
  g.lineTo(r, girdle);
  g.moveTo(-r * 0.55, top);
  g.lineTo(-r * 0.25, girdle);
  g.lineTo(0, top);
  g.lineTo(r * 0.25, girdle);
  g.lineTo(r * 0.55, top);
  g.moveTo(-r * 0.25, girdle);
  g.lineTo(0, r * 0.95);
  g.lineTo(r * 0.25, girdle);
  g.stroke();
  g.fillStyle = rgba('#ffffff', 0.5);
  g.beginPath();
  g.moveTo(-r * 0.5, top + 2);
  g.lineTo(-r * 0.15, top + 2);
  g.lineTo(-r * 0.35, girdle - 1);
  g.closePath();
  g.fill();
  if (shine > 0) sparkle(g, r * 0.55, top, s * 0.45 * shine);
  g.restore();
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

// ---- Guests -----------------------------------------------------------------------------------

/**
 * A masked party guest from the chest up, s tall, centred on (x, y), dressed in `color`.
 * o.role swaps the outfit for that role's portrait; o.style picks the hat (otherwise from seed);
 * o.out greys them (escorted out).
 */
export function drawGuest(g, x, y, s, color, seed = 1, o = {}) {
  const R = rng(seed + 3);
  const skin = SKINS[Math.floor(R() * SKINS.length)];
  const hairC = ['#2a1a12', '#5a3418', '#c9a15a', '#1a1a22', '#8a3a1a', '#d8d4cc'][Math.floor(R() * 6)];
  const role = o.role;
  const style = role === 'thief' ? 'beanie' : role === 'detective' ? 'deer' : role === 'bodyguard' ? 'crop' : role === 'gossip' ? 'bun' : role === 'guest' ? 'tophat' : (o.style ?? ['tophat', 'bun', 'feather', 'bowler', 'crop'][Math.floor(R() * 5)]);
  const suit = role === 'thief' ? '#25222c' : role === 'bodyguard' ? '#1c1f27' : color;
  g.save();
  g.translate(x, y);
  if (o.out) g.filter = 'grayscale(0.85) brightness(0.7)';

  // Body
  const bw = s * 0.9;
  const top = s * 0.1;
  const bot = s * 0.5;
  const bg = g.createLinearGradient(0, top, 0, bot);
  bg.addColorStop(0, shade(suit, 0.12));
  bg.addColorStop(1, shade(suit, -0.35));
  g.fillStyle = bg;
  g.beginPath();
  g.moveTo(-bw / 2, bot);
  g.bezierCurveTo(-bw / 2, top + s * 0.06, -bw * 0.32, top, 0, top);
  g.bezierCurveTo(bw * 0.32, top, bw / 2, top + s * 0.06, bw / 2, bot);
  g.closePath();
  g.fill();
  outline(g, s);
  if (role === 'thief') {
    // striped jumper
    g.save();
    g.clip();
    g.fillStyle = '#e8e4dc';
    for (let i = 0; i < 4; i++) g.fillRect(-bw / 2, top + s * 0.1 + i * s * 0.1, bw, s * 0.045);
    g.restore();
  } else {
    // shirt front and lapels
    g.fillStyle = '#f4efe6';
    g.beginPath();
    g.moveTo(-s * 0.1, top + s * 0.005);
    g.lineTo(s * 0.1, top + s * 0.005);
    g.lineTo(0, top + s * 0.24);
    g.closePath();
    g.fill();
    g.strokeStyle = shade(suit, -0.5);
    g.lineWidth = Math.max(1, s * 0.02);
    g.beginPath();
    g.moveTo(-s * 0.1, top + s * 0.01);
    g.lineTo(-s * 0.02, top + s * 0.3);
    g.moveTo(s * 0.1, top + s * 0.01);
    g.lineTo(s * 0.02, top + s * 0.3);
    g.stroke();
    if (style === 'bun' || style === 'feather') {
      // pearls
      g.fillStyle = '#fffaf0';
      for (let i = -3; i <= 3; i++) {
        ell(g, i * s * 0.035, top + s * 0.04 + Math.cos(i / 2.5) * -s * 0.025 + s * 0.03, s * 0.018, s * 0.018);
        g.fill();
      }
    } else {
      // bow tie
      g.fillStyle = role === 'bodyguard' ? '#0c0c10' : INK;
      g.beginPath();
      g.moveTo(0, top + s * 0.04);
      g.lineTo(-s * 0.07, top + s * 0.0);
      g.lineTo(-s * 0.07, top + s * 0.08);
      g.closePath();
      g.moveTo(0, top + s * 0.04);
      g.lineTo(s * 0.07, top + s * 0.0);
      g.lineTo(s * 0.07, top + s * 0.08);
      g.closePath();
      g.fill();
    }
  }

  // Neck and head
  const hy = -s * 0.16;
  const hr = s * 0.2;
  g.fillStyle = shade(skin, -0.12);
  g.fillRect(-s * 0.06, hy + hr * 0.6, s * 0.12, s * 0.16);
  g.fillStyle = skin;
  ell(g, 0, hy, hr * 0.92, hr);
  g.fill();
  outline(g, s);

  // Hair under hats
  g.fillStyle = hairC;
  if (style === 'bun' || style === 'feather') {
    g.beginPath();
    g.ellipse(0, hy - hr * 0.25, hr * 0.98, hr * 0.8, 0, Math.PI, 0);
    g.fill();
    if (style === 'bun') {
      ell(g, 0, hy - hr * 1.05, hr * 0.45, hr * 0.38);
      g.fill();
      outline(g, s * 0.7);
    }
  } else if (style === 'crop') {
    g.beginPath();
    g.ellipse(0, hy - hr * 0.35, hr * 0.94, hr * 0.68, 0, Math.PI, 0);
    g.fill();
  }

  // Mask (or glasses)
  const my = hy - hr * 0.05;
  if (role === 'bodyguard') {
    g.fillStyle = '#0c0c12';
    g.beginPath();
    g.roundRect(-hr * 0.8, my - hr * 0.2, hr * 0.7, hr * 0.38, hr * 0.15);
    g.roundRect(hr * 0.1, my - hr * 0.2, hr * 0.7, hr * 0.38, hr * 0.15);
    g.fill();
    g.fillRect(-hr * 0.15, my - hr * 0.1, hr * 0.3, hr * 0.08);
    g.fillStyle = rgba('#ffffff', 0.5);
    g.fillRect(-hr * 0.68, my - hr * 0.12, hr * 0.2, hr * 0.06);
    g.fillRect(hr * 0.22, my - hr * 0.12, hr * 0.2, hr * 0.06);
    // earpiece
    g.strokeStyle = '#d8dde8';
    g.lineWidth = Math.max(1, s * 0.012);
    g.beginPath();
    g.moveTo(hr * 0.9, hy + hr * 0.1);
    g.quadraticCurveTo(hr * 1.1, hy + hr * 0.8, hr * 0.7, top + s * 0.05);
    g.stroke();
  } else {
    const mc = role === 'thief' ? '#0d0c10' : role === 'detective' ? null : style === 'feather' || style === 'bun' ? color : '#15121c';
    if (mc) {
      g.fillStyle = mc;
      g.beginPath();
      g.moveTo(-hr * 1.02, my - hr * 0.05);
      g.bezierCurveTo(-hr * 0.9, my - hr * 0.45, -hr * 0.15, my - hr * 0.35, 0, my - hr * 0.12);
      g.bezierCurveTo(hr * 0.15, my - hr * 0.35, hr * 0.9, my - hr * 0.45, hr * 1.02, my - hr * 0.05);
      g.bezierCurveTo(hr * 0.9, my + hr * 0.35, hr * 0.2, my + hr * 0.3, 0, my + hr * 0.12);
      g.bezierCurveTo(-hr * 0.2, my + hr * 0.3, -hr * 0.9, my + hr * 0.35, -hr * 1.02, my - hr * 0.05);
      g.fill();
      g.strokeStyle = role === 'thief' ? '#3a3640' : GOLD;
      g.lineWidth = Math.max(1, s * 0.014);
      g.stroke();
      if (role === 'thief') {
        // mask ties
        g.strokeStyle = '#0d0c10';
        g.lineWidth = Math.max(1, s * 0.02);
        g.beginPath();
        g.moveTo(-hr * 1.0, my);
        g.quadraticCurveTo(-hr * 1.3, my + hr * 0.2, -hr * 1.35, my + hr * 0.5);
        g.stroke();
      }
    }
    // eyes
    g.fillStyle = '#fff';
    for (const d of [-1, 1]) {
      ell(g, d * hr * 0.42, my, hr * 0.16, hr * 0.11);
      g.fill();
    }
    g.fillStyle = INK;
    for (const d of [-1, 1]) {
      ell(g, d * hr * 0.42 + (role === 'thief' ? hr * 0.07 : 0), my + hr * 0.01, hr * 0.075, hr * 0.075);
      g.fill();
    }
  }
  // mouth
  g.strokeStyle = shade(skin, -0.5);
  g.lineWidth = Math.max(1, s * 0.012);
  g.beginPath();
  if (role === 'thief') {
    g.moveTo(-hr * 0.25, hy + hr * 0.52);
    g.quadraticCurveTo(hr * 0.05, hy + hr * 0.62, hr * 0.3, hy + hr * 0.42);
  } else if (role === 'gossip') {
    ell(g, 0, hy + hr * 0.52, hr * 0.12, hr * 0.09);
    g.fillStyle = '#c2304f';
    g.fill();
  } else {
    g.arc(0, hy + hr * 0.3, hr * 0.3, 0.35 * Math.PI, 0.65 * Math.PI);
  }
  g.stroke();

  // Hats
  if (style === 'tophat') {
    g.fillStyle = '#16141c';
    g.beginPath();
    g.roundRect(-hr * 0.62, hy - hr * 1.95, hr * 1.24, hr * 1.2, hr * 0.08);
    g.fill();
    outline(g, s * 0.8);
    g.fillStyle = shade(color, -0.1);
    g.fillRect(-hr * 0.62, hy - hr * 1.0, hr * 1.24, hr * 0.2);
    g.fillStyle = '#16141c';
    ell(g, 0, hy - hr * 0.78, hr * 1.12, hr * 0.17);
    g.fill();
    outline(g, s * 0.8);
  } else if (style === 'bowler') {
    g.fillStyle = '#2a211c';
    g.beginPath();
    g.ellipse(0, hy - hr * 0.72, hr * 0.78, hr * 0.7, 0, Math.PI, 0);
    g.fill();
    outline(g, s * 0.8);
    ell(g, 0, hy - hr * 0.72, hr * 1.1, hr * 0.15);
    g.fill();
    outline(g, s * 0.8);
  } else if (style === 'beanie') {
    g.fillStyle = '#2b2830';
    g.beginPath();
    g.ellipse(0, hy - hr * 0.35, hr * 0.98, hr * 0.95, 0, Math.PI, 0);
    g.fill();
    outline(g, s * 0.8);
    g.fillStyle = '#3a3640';
    g.beginPath();
    g.roundRect(-hr * 1.0, hy - hr * 0.5, hr * 2, hr * 0.3, hr * 0.12);
    g.fill();
    outline(g, s * 0.8);
  } else if (style === 'deer') {
    const plaid = g.createLinearGradient(-hr, 0, hr, 0);
    plaid.addColorStop(0, '#8a6a3e');
    plaid.addColorStop(1, '#6a4e2a');
    g.fillStyle = plaid;
    g.beginPath();
    g.ellipse(0, hy - hr * 0.45, hr * 0.98, hr * 0.85, 0, Math.PI, 0);
    g.fill();
    outline(g, s * 0.8);
    g.strokeStyle = rgba('#3a2814', 0.6);
    g.lineWidth = Math.max(1, s * 0.01);
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * hr * 0.35, hy - hr * 0.45);
      g.lineTo(i * hr * 0.3, hy - hr * 1.2);
      g.stroke();
    }
    // brims front and back
    g.fillStyle = '#6a4e2a';
    g.beginPath();
    g.ellipse(-hr * 0.85, hy - hr * 0.42, hr * 0.42, hr * 0.14, 0.25, 0, Math.PI * 2);
    g.ellipse(hr * 0.85, hy - hr * 0.42, hr * 0.42, hr * 0.14, -0.25, 0, Math.PI * 2);
    g.fill();
  } else if (style === 'feather') {
    g.fillStyle = color;
    g.fillRect(-hr * 0.95, hy - hr * 0.62, hr * 1.9, hr * 0.16);
    g.save();
    g.translate(hr * 0.5, hy - hr * 0.7);
    g.rotate(0.45);
    const fg = g.createLinearGradient(0, -hr * 1.3, 0, 0);
    fg.addColorStop(0, shade(color, 0.6));
    fg.addColorStop(1, shade(color, -0.2));
    g.fillStyle = fg;
    ell(g, 0, -hr * 0.65, hr * 0.2, hr * 0.7);
    g.fill();
    g.strokeStyle = rgba('#000', 0.35);
    g.lineWidth = Math.max(1, s * 0.01);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -hr * 1.3);
    g.stroke();
    g.restore();
  }

  // Role props
  if (role === 'thief') {
    // a sack over the shoulder with a gem peeking out
    g.save();
    g.translate(bw * 0.42, top + s * 0.06);
    g.fillStyle = '#b08a5a';
    ell(g, 0, 0, s * 0.17, s * 0.15);
    g.fill();
    outline(g, s * 0.8);
    drawGem(g, -s * 0.02, -s * 0.13, s * 0.14, '#ff5a5f', 0.6);
    g.restore();
  } else if (role === 'detective') {
    g.save();
    g.translate(bw * 0.3, top + s * 0.2);
    g.rotate(-0.5);
    g.fillStyle = '#4a2f1a';
    g.beginPath();
    g.roundRect(-s * 0.025, s * 0.06, s * 0.05, s * 0.2, s * 0.02);
    g.fill();
    g.beginPath();
    g.arc(0, 0, s * 0.11, 0, Math.PI * 2);
    g.fillStyle = 'rgba(190,230,255,.55)';
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = Math.max(1.5, s * 0.03);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.75)';
    ell(g, -s * 0.04, -s * 0.04, s * 0.03, s * 0.018, -0.7);
    g.fill();
    g.restore();
  } else if (role === 'bodyguard') {
    // shield badge on the chest
    g.save();
    g.translate(-bw * 0.22, top + s * 0.18);
    g.fillStyle = ROLE_COLOR.bodyguard;
    g.beginPath();
    g.moveTo(0, -s * 0.06);
    g.lineTo(s * 0.05, -s * 0.04);
    g.lineTo(s * 0.045, s * 0.02);
    g.quadraticCurveTo(s * 0.03, s * 0.05, 0, s * 0.07);
    g.quadraticCurveTo(-s * 0.03, s * 0.05, -s * 0.045, s * 0.02);
    g.lineTo(-s * 0.05, -s * 0.04);
    g.closePath();
    g.fill();
    outline(g, s * 0.6);
    g.restore();
  } else if (role === 'gossip') {
    // a feather fan
    g.save();
    g.translate(bw * 0.3, top + s * 0.22);
    for (let i = -3; i <= 3; i++) {
      g.save();
      g.rotate(i * 0.22 - 0.4);
      g.fillStyle = i % 2 ? shade(ROLE_COLOR.gossip, 0.35) : ROLE_COLOR.gossip;
      ell(g, 0, -s * 0.13, s * 0.04, s * 0.13);
      g.fill();
      g.restore();
    }
    g.fillStyle = GOLD;
    ell(g, 0, 0, s * 0.03, s * 0.03);
    g.fill();
    g.restore();
  } else if (role === 'guest') {
    // champagne coupe
    g.save();
    g.translate(bw * 0.3, top + s * 0.2);
    g.strokeStyle = '#e8eef8';
    g.lineWidth = Math.max(1, s * 0.015);
    g.fillStyle = 'rgba(255,220,120,.75)';
    g.beginPath();
    g.moveTo(-s * 0.08, -s * 0.06);
    g.quadraticCurveTo(0, s * 0.04, s * 0.08, -s * 0.06);
    g.closePath();
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(0, -s * 0.01);
    g.lineTo(0, s * 0.1);
    g.moveTo(-s * 0.05, s * 0.1);
    g.lineTo(s * 0.05, s * 0.1);
    g.stroke();
    g.restore();
  }
  g.restore();
}

// ---- Role cards -------------------------------------------------------------------------------

function decoFrame(g, w, h, color) {
  // A gold double border with fans in the corners.
  g.strokeStyle = GOLD;
  g.lineWidth = Math.max(1.5, w * 0.012);
  g.beginPath();
  g.roundRect(-w / 2 + w * 0.05, -h / 2 + w * 0.05, w * 0.9, h - w * 0.1, w * 0.04);
  g.stroke();
  g.lineWidth = Math.max(1, w * 0.005);
  g.beginPath();
  g.roundRect(-w / 2 + w * 0.08, -h / 2 + w * 0.08, w * 0.84, h - w * 0.16, w * 0.025);
  g.stroke();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * (w / 2 - w * 0.08);
    const cy = sy * (h / 2 - w * 0.08);
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      g.moveTo(cx, cy);
      g.lineTo(cx - sx * Math.cos(a) * w * 0.11, cy - sy * Math.sin(a) * w * 0.11);
    }
    g.stroke();
  }
  if (color) {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, -h / 2 + w * 0.02);
    g.lineTo(w * 0.04, -h / 2 + w * 0.06);
    g.lineTo(0, -h / 2 + w * 0.1);
    g.lineTo(-w * 0.04, -h / 2 + w * 0.06);
    g.closePath();
    g.fill();
  }
}

/** The face of a role card, w x h, centred on (x, y). */
export function drawRoleCard(g, role, x, y, w, h, o = {}) {
  const color = ROLE_COLOR[role] ?? '#8a93a8';
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.roundRect(-w / 2 + w * 0.02, -h / 2 + w * 0.04, w, h, w * 0.07);
  g.fill();
  const bg = g.createLinearGradient(0, -h / 2, 0, h / 2);
  bg.addColorStop(0, shade(color, -0.55));
  bg.addColorStop(0.6, '#14111d');
  bg.addColorStop(1, '#0d0b14');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, w * 0.07);
  g.fill();
  // sunburst behind the portrait
  g.save();
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, w * 0.07);
  g.clip();
  const py = -h * 0.1;
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    g.fillStyle = i % 2 ? rgba(color, 0.12) : rgba('#ffffff', 0.03);
    g.beginPath();
    g.moveTo(0, py);
    g.arc(0, py, h, a, a + Math.PI / 18);
    g.closePath();
    g.fill();
  }
  const glow = g.createRadialGradient(0, py, 0, 0, py, w * 0.5);
  glow.addColorStop(0, rgba(color, 0.45));
  glow.addColorStop(1, rgba(color, 0));
  g.fillStyle = glow;
  g.fillRect(-w / 2, -h / 2, w, h);
  g.restore();
  drawGuest(g, 0, py + w * 0.02, w * 0.62, color, o.seed ?? 11, { role });
  decoFrame(g, w, h, color);
  // name ribbon
  const ry = h * 0.33;
  g.fillStyle = shade(color, -0.25);
  g.beginPath();
  g.moveTo(-w * 0.46, ry - h * 0.06);
  g.lineTo(w * 0.46, ry - h * 0.06);
  g.lineTo(w * 0.4, ry);
  g.lineTo(w * 0.46, ry + h * 0.06);
  g.lineTo(-w * 0.46, ry + h * 0.06);
  g.lineTo(-w * 0.4, ry);
  g.closePath();
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = Math.max(1, w * 0.008);
  g.stroke();
  const label = (o.label ?? ROLE_LABEL[role] ?? role).toUpperCase();
  let fs = w * 0.12;
  g.font = `900 ${fs}px ${SERIF}`;
  const tw = g.measureText(label).width;
  if (tw > w * 0.78) fs *= (w * 0.78) / tw;
  g.font = `900 ${fs}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff6dc';
  g.fillText(label, 0, ry + fs * 0.05);
  g.restore();
}

/** The back of a role card: the gala's diamond crest. */
export function drawCardBack(g, x, y, w, h, t = 0) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.roundRect(-w / 2 + w * 0.02, -h / 2 + w * 0.04, w, h, w * 0.07);
  g.fill();
  const bg = g.createLinearGradient(0, -h / 2, 0, h / 2);
  bg.addColorStop(0, '#2a1640');
  bg.addColorStop(1, '#120a20');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, w * 0.07);
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = rgba(GOLD, 0.16);
  g.lineWidth = Math.max(1, w * 0.006);
  const step = w * 0.12;
  for (let i = -12; i <= 12; i++) {
    g.beginPath();
    g.moveTo(i * step - h, -h / 2);
    g.lineTo(i * step + h, h / 2 + h);
    g.moveTo(i * step + h, -h / 2);
    g.lineTo(i * step - h, h / 2 + h);
    g.stroke();
  }
  g.restore();
  decoFrame(g, w, h, null);
  // crest
  g.fillStyle = '#1a0f2a';
  ell(g, 0, 0, w * 0.27, w * 0.27);
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = Math.max(1.5, w * 0.012);
  g.stroke();
  drawGem(g, 0, -w * 0.02, w * 0.3, '#ff5a5f', 0.5 + 0.5 * Math.sin(t * 3));
  g.font = `900 ${w * 0.085}px ${SERIF}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = GOLD;
  g.fillText('MIDNIGHT GALA', 0, h * 0.34);
  g.restore();
}

// ---- Rooms ------------------------------------------------------------------------------------

/**
 * One room of the mansion, w x h, top-left at (x, y). o.light 0..1 (0 = lights out),
 * o.gem: 'gem' | 'gone' | 'safe' (the jewel case), o.t seconds for flickers.
 */
export function drawRoom(g, id, x, y, w, h, o = {}) {
  const light = o.light ?? 1;
  const t = o.t ?? 0;
  const color = ROOM_COLOR[id] ?? '#888';
  const R = rng(seedOf(id));
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  const floorY = y + h * 0.8;
  // wall
  const wall = g.createLinearGradient(0, y, 0, floorY);
  const wallC = { library: '#3a2552', ballroom: '#4a3420', conservatory: '#173a2c', cellar: '#3a2418' }[id] ?? '#333';
  wall.addColorStop(0, shade(wallC, 0.08));
  wall.addColorStop(1, shade(wallC, -0.25));
  g.fillStyle = wall;
  g.fillRect(x, y, w, h);
  // wallpaper stripes / bricks
  if (id === 'cellar') {
    g.strokeStyle = rgba('#000', 0.25);
    g.lineWidth = 2;
    const bh = h * 0.08;
    for (let r = 0; y + r * bh < floorY; r++) {
      g.beginPath();
      g.moveTo(x, y + r * bh);
      g.lineTo(x + w, y + r * bh);
      g.stroke();
      for (let c = (r % 2) * 0.5; c * bh * 2 < w; c++) {
        g.beginPath();
        g.moveTo(x + c * bh * 2, y + r * bh);
        g.lineTo(x + c * bh * 2, y + (r + 1) * bh);
        g.stroke();
      }
    }
    // arches
    g.fillStyle = rgba('#000', 0.25);
    for (const ax of [0.18, 0.82]) {
      g.beginPath();
      g.moveTo(x + w * ax - w * 0.13, floorY);
      g.lineTo(x + w * ax - w * 0.13, y + h * 0.35);
      g.arc(x + w * ax, y + h * 0.35, w * 0.13, Math.PI, 0);
      g.lineTo(x + w * ax + w * 0.13, floorY);
      g.fill();
    }
  } else if (id !== 'conservatory') {
    g.fillStyle = rgba('#ffffff', 0.035);
    for (let i = 0; i < w / 24; i++) if (i % 2) g.fillRect(x + i * 24, y, 12, floorY - y);
  }
  // floor
  if (id === 'ballroom') {
    const n = 14;
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < 3; j++) {
        g.fillStyle = (i + j) % 2 ? '#e8dcc0' : '#2a2018';
        g.fillRect(x + i * cw, floorY + j * ((h - (floorY - y)) / 3), cw + 1, (h - (floorY - y)) / 3 + 1);
      }
    }
  } else {
    const fl = g.createLinearGradient(0, floorY, 0, y + h);
    const fc = { library: '#5a3a22', conservatory: '#9a8a70', cellar: '#3a3230' }[id] ?? '#444';
    fl.addColorStop(0, fc);
    fl.addColorStop(1, shade(fc, -0.4));
    g.fillStyle = fl;
    g.fillRect(x, floorY, w, h);
    g.strokeStyle = rgba('#000', 0.2);
    g.lineWidth = 1.5;
    for (let i = 1; i < 6; i++) {
      g.beginPath();
      g.moveTo(x, floorY + (i * (y + h - floorY)) / 6);
      g.lineTo(x + w, floorY + (i * (y + h - floorY)) / 6);
      g.stroke();
    }
  }
  g.fillStyle = rgba('#000', 0.35);
  g.fillRect(x, floorY - 4, w, 6);

  if (id === 'library') {
    for (const sx of [x + w * 0.04, x + w * 0.7]) {
      const sw = w * 0.26;
      const sy = y + h * 0.12;
      const sh = floorY - sy;
      g.fillStyle = '#4a2c16';
      g.fillRect(sx, sy, sw, sh);
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.strokeRect(sx, sy, sw, sh);
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const ry = sy + 6 + (r * (sh - 8)) / rows;
        const rh = (sh - 8) / rows - 6;
        let bx = sx + 5;
        while (bx < sx + sw - 8) {
          const bwid = 5 + R() * 7;
          const bh = rh * (0.7 + R() * 0.3);
          g.fillStyle = ['#a8323a', '#2f6b8a', '#d8a83a', '#3a7a4a', '#7a3a8a', '#c8b89a'][Math.floor(R() * 6)];
          g.fillRect(bx, ry + rh - bh, Math.min(bwid, sx + sw - 5 - bx), bh);
          bx += bwid + 1;
        }
        g.fillStyle = '#2a1608';
        g.fillRect(sx, ry + rh, sw, 4);
      }
    }
    // green banker's lamp
    const lx = x + w * 0.5 + w * 0.13;
    g.fillStyle = '#4a2c16';
    g.fillRect(lx - w * 0.05, floorY - h * 0.2, w * 0.1, h * 0.2);
    g.fillStyle = '#2f8a4a';
    g.beginPath();
    g.ellipse(lx, floorY - h * 0.26, w * 0.04, h * 0.03, 0, Math.PI, 0);
    g.fill();
  } else if (id === 'ballroom') {
    // curtains
    for (const d of [0, 1]) {
      const cx = d ? x + w : x;
      const cg = g.createLinearGradient(cx, 0, cx + (d ? -w * 0.14 : w * 0.14), 0);
      cg.addColorStop(0, '#7a1020');
      cg.addColorStop(1, '#b8283a');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(cx, y);
      g.lineTo(cx + (d ? -w * 0.16 : w * 0.16), y);
      g.quadraticCurveTo(cx + (d ? -w * 0.06 : w * 0.06), y + h * 0.5, cx + (d ? -w * 0.1 : w * 0.1), floorY);
      g.lineTo(cx, floorY);
      g.fill();
    }
    // chandelier
    const sway = Math.sin(t * 0.8) * 0.03;
    g.save();
    g.translate(x + w / 2, y);
    g.rotate(sway);
    g.strokeStyle = GOLD_DARK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, h * 0.14);
    g.stroke();
    g.strokeStyle = GOLD;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(0, h * 0.2, w * 0.12, h * 0.04, 0, 0, Math.PI);
    g.stroke();
    for (let i = -2; i <= 2; i++) {
      const cx = i * w * 0.055;
      const cy = h * 0.2 + Math.cos((i / 2.4) * 1.2) * h * 0.035;
      g.fillStyle = '#fff3c8';
      g.fillRect(cx - 2, cy - 12, 4, 10);
      if (light > 0.3) {
        g.fillStyle = `rgba(255,200,90,${0.8 * light})`;
        ell(g, cx, cy - 15, 3, 5 + Math.sin(t * 9 + i) * 1);
        g.fill();
      }
      g.fillStyle = rgba('#dff4ff', 0.7);
      ell(g, cx, cy + 8, 2.5, 4);
      g.fill();
    }
    g.restore();
  } else if (id === 'conservatory') {
    // arched glass windows with the night sky
    const n = 3;
    const ww = w * 0.24;
    for (let i = 0; i < n; i++) {
      const wx = x + w * 0.08 + i * (w * 0.84 - ww) / (n - 1);
      const wy = y + h * 0.14;
      const wh = floorY - wy - h * 0.06;
      g.beginPath();
      g.moveTo(wx, wy + wh);
      g.lineTo(wx, wy + ww / 2);
      g.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
      g.lineTo(wx + ww, wy + wh);
      g.closePath();
      const sky = g.createLinearGradient(0, wy, 0, wy + wh);
      sky.addColorStop(0, light > 0.6 ? '#7ab8e8' : '#1a2650');
      sky.addColorStop(1, light > 0.6 ? '#cfe6f6' : '#2a3a6a');
      g.fillStyle = sky;
      g.fill();
      g.strokeStyle = '#d8e8e0';
      g.lineWidth = 3;
      g.stroke();
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(wx + ww / 2, wy);
      g.lineTo(wx + ww / 2, wy + wh);
      g.moveTo(wx, wy + wh * 0.55);
      g.lineTo(wx + ww, wy + wh * 0.55);
      g.stroke();
      if (light <= 0.6 && i === 1) {
        g.fillStyle = '#fff6d8';
        ell(g, wx + ww * 0.7, wy + ww * 0.45, ww * 0.12, ww * 0.12);
        g.fill();
      }
    }
    // plants
    for (const [px, ps] of [[0.06, 1], [0.5, 0.8], [0.94, 1.1]]) {
      const bx = x + w * px;
      g.fillStyle = '#9a5a32';
      g.beginPath();
      g.moveTo(bx - w * 0.04, floorY - h * 0.12);
      g.lineTo(bx + w * 0.04, floorY - h * 0.12);
      g.lineTo(bx + w * 0.03, floorY + 2);
      g.lineTo(bx - w * 0.03, floorY + 2);
      g.fill();
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.38 + Math.sin(t * 0.7 + k) * 0.03;
        g.save();
        g.translate(bx, floorY - h * 0.12);
        g.rotate(a + Math.PI / 2);
        g.fillStyle = k % 2 ? '#2f8a4a' : '#4cbf6a';
        ell(g, 0, -h * 0.17 * ps, w * 0.018, h * 0.17 * ps);
        g.fill();
        g.restore();
      }
    }
  } else if (id === 'cellar') {
    // wine rack and barrels
    const rx = x + w * 0.62;
    const ry = y + h * 0.22;
    const rw = w * 0.32;
    const rh = floorY - ry;
    g.fillStyle = '#3a2214';
    g.fillRect(rx, ry, rw, rh);
    g.strokeStyle = '#6a4224';
    g.lineWidth = 3;
    g.strokeRect(rx, ry, rw, rh);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        g.fillStyle = R() < 0.8 ? (R() < 0.5 ? '#5a1426' : '#1e3a20') : '#1a0e08';
        ell(g, rx + rw * (0.12 + c * 0.19), ry + rh * (0.15 + r * 0.23), rw * 0.06, rw * 0.06);
        g.fill();
      }
    }
    for (const [bx, by, br] of [[0.12, 0, 0.11], [0.32, 0, 0.11], [0.22, -0.2, 0.1]]) {
      const cx = x + w * bx;
      const cy = floorY - h * 0.13 + h * by;
      g.fillStyle = '#8a5a2c';
      ell(g, cx, cy, w * br * 0.8, h * 0.13);
      g.fill();
      outline(g, 60);
      g.strokeStyle = '#3a2a1a';
      g.lineWidth = 3;
      ell(g, cx, cy, w * br * 0.55, h * 0.09);
      g.stroke();
      g.fillStyle = '#b07a42';
      ell(g, cx, cy, w * br * 0.25, h * 0.04);
      g.fill();
    }
  }

  // The jewel case, centre stage.
  const cx = x + w * (id === 'library' ? 0.5 : id === 'cellar' ? 0.48 : 0.5);
  drawCase(g, cx, floorY, h * 0.5, o.gem ?? 'gem', color, t);

  // Lights out: dark blue wash, with a little window or lamp glow.
  if (light < 1) {
    g.fillStyle = `rgba(6,8,26,${0.72 * (1 - light)})`;
    g.fillRect(x, y, w, h);
    const glow = g.createRadialGradient(cx, floorY - h * 0.3, 0, cx, floorY - h * 0.3, w * 0.35);
    glow.addColorStop(0, `rgba(255,200,110,${(0.22 + 0.04 * Math.sin(t * 7 + x)) * (1 - light)})`);
    glow.addColorStop(1, 'rgba(255,200,110,0)');
    g.fillStyle = glow;
    g.fillRect(x, y, w, h);
  }
  g.restore();
}

/** A jewel on a pedestal under a glass dome, standing on (x, floorY), about s tall. */
export function drawCase(g, x, floorY, s, state = 'gem', color = '#ff5a5f', t = 0) {
  g.save();
  g.translate(x, floorY);
  // pedestal
  g.fillStyle = '#d8d0c0';
  g.beginPath();
  g.moveTo(-s * 0.18, 0);
  g.lineTo(s * 0.18, 0);
  g.lineTo(s * 0.12, -s * 0.08);
  g.lineTo(s * 0.08, -s * 0.48);
  g.lineTo(s * 0.16, -s * 0.54);
  g.lineTo(-s * 0.16, -s * 0.54);
  g.lineTo(-s * 0.08, -s * 0.48);
  g.lineTo(-s * 0.12, -s * 0.08);
  g.closePath();
  const pg = g.createLinearGradient(-s * 0.18, 0, s * 0.18, 0);
  pg.addColorStop(0, '#f2ece0');
  pg.addColorStop(1, '#9a9080');
  g.fillStyle = pg;
  g.fill();
  outline(g, s);
  // velvet cushion
  g.fillStyle = '#7a1428';
  ell(g, 0, -s * 0.57, s * 0.14, s * 0.04);
  g.fill();
  if (state !== 'gone') drawGem(g, 0, -s * 0.68, s * 0.18, color, 0.5 + 0.5 * Math.sin(t * 2.5 + x));
  // glass dome
  const dy = -s * 0.56;
  g.beginPath();
  g.moveTo(-s * 0.15, dy);
  g.lineTo(-s * 0.15, dy - s * 0.22);
  g.arc(0, dy - s * 0.22, s * 0.15, Math.PI, 0);
  g.lineTo(s * 0.15, dy);
  if (state === 'gone') {
    // shattered: only jagged stumps remain
    g.closePath();
    g.save();
    g.clip();
    g.fillStyle = 'rgba(200,230,255,.12)';
    g.beginPath();
    g.moveTo(-s * 0.15, dy);
    g.lineTo(-s * 0.15, dy - s * 0.12);
    g.lineTo(-s * 0.08, dy - s * 0.05);
    g.lineTo(-s * 0.02, dy - s * 0.16);
    g.lineTo(s * 0.06, dy - s * 0.04);
    g.lineTo(s * 0.15, dy - s * 0.14);
    g.lineTo(s * 0.15, dy);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(220,240,255,.8)';
    g.lineWidth = 1.5;
    g.stroke();
    g.restore();
    // shards on the floor
    g.fillStyle = 'rgba(220,240,255,.7)';
    for (const [a, b] of [[-0.3, -0.02], [0.28, -0.01], [0.38, -0.03], [-0.42, -0.015]]) {
      g.beginPath();
      g.moveTo(a * s, b * s);
      g.lineTo(a * s + 5, b * s - 3);
      g.lineTo(a * s + 2, b * s + 2);
      g.fill();
    }
  } else {
    g.fillStyle = 'rgba(200,230,255,.13)';
    g.fill();
    g.strokeStyle = 'rgba(220,240,255,.7)';
    g.lineWidth = 1.5;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, dy - s * 0.22, s * 0.1, Math.PI * 1.1, Math.PI * 1.4);
    g.stroke();
  }
  if (state === 'safe') {
    // the Bodyguard's shield in front of the case
    drawShield(g, 0, -s * 0.38, s * 0.3, ROLE_COLOR.bodyguard);
  }
  g.restore();
}

export function drawShield(g, x, y, s, color) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(0, -s * 0.5);
  g.quadraticCurveTo(s * 0.28, -s * 0.38, s * 0.45, -s * 0.42);
  g.quadraticCurveTo(s * 0.48, s * 0.15, 0, s * 0.5);
  g.quadraticCurveTo(-s * 0.48, s * 0.15, -s * 0.45, -s * 0.42);
  g.quadraticCurveTo(-s * 0.28, -s * 0.38, 0, -s * 0.5);
  const sg = g.createLinearGradient(0, -s / 2, 0, s / 2);
  sg.addColorStop(0, shade(color, 0.35));
  sg.addColorStop(1, shade(color, -0.35));
  g.fillStyle = sg;
  g.fill();
  outline(g, s * 1.4);
  g.strokeStyle = rgba('#ffffff', 0.7);
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.moveTo(-s * 0.15, 0);
  g.lineTo(-s * 0.02, s * 0.14);
  g.lineTo(s * 0.2, -s * 0.14);
  g.stroke();
  g.restore();
}

// ---- Small icons (phones and TV) --------------------------------------------------------------

function drawGlove(g, x, y, s, color = '#f2efe8') {
  g.save();
  g.translate(x, y);
  g.rotate(-0.3);
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(-s * 0.22, -s * 0.05, s * 0.44, s * 0.42, s * 0.1);
  for (let i = 0; i < 4; i++) g.roundRect(-s * 0.22 + i * s * 0.115, -s * 0.42 + Math.abs(i - 1.5) * s * 0.05, s * 0.1, s * 0.42, s * 0.05);
  g.roundRect(s * 0.14, -s * 0.05, s * 0.28, s * 0.1, s * 0.05);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, s * 0.04);
  g.stroke();
  g.fillStyle = '#c8b8a0';
  g.fillRect(-s * 0.22, s * 0.28, s * 0.44, s * 0.08);
  g.restore();
}

function drawMoon(g, x, y, s) {
  g.save();
  g.fillStyle = '#fff2c8';
  g.beginPath();
  g.arc(x, y, s * 0.36, 0.25 * Math.PI, 1.62 * Math.PI);
  g.bezierCurveTo(x - s * 0.05, y - s * 0.3, x - s * 0.1, y + s * 0.15, x + s * 0.25, y + s * 0.26);
  g.closePath();
  g.fill();
  g.fillStyle = '#c8d4ff';
  g.font = `900 ${s * 0.24}px ${SERIF}`;
  g.textAlign = 'center';
  g.fillText('z', x + s * 0.22, y - s * 0.08);
  g.font = `900 ${s * 0.17}px ${SERIF}`;
  g.fillText('z', x + s * 0.36, y - s * 0.26);
  g.restore();
}

function drawEye(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.moveTo(-s * 0.45, 0);
  g.quadraticCurveTo(0, -s * 0.38, s * 0.45, 0);
  g.quadraticCurveTo(0, s * 0.38, -s * 0.45, 0);
  g.fillStyle = '#fff';
  g.fill();
  outline(g, s * 1.2);
  g.fillStyle = '#3a7ad8';
  ell(g, 0, 0, s * 0.15, s * 0.15);
  g.fill();
  g.fillStyle = INK;
  ell(g, 0, 0, s * 0.07, s * 0.07);
  g.fill();
  g.restore();
}

function drawMagnifier(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.7);
  g.fillStyle = '#5a3a1e';
  g.beginPath();
  g.roundRect(-s * 0.06, s * 0.18, s * 0.12, s * 0.32, s * 0.04);
  g.fill();
  g.beginPath();
  g.arc(0, -s * 0.06, s * 0.24, 0, Math.PI * 2);
  g.fillStyle = 'rgba(180,225,255,.6)';
  g.fill();
  g.strokeStyle = GOLD;
  g.lineWidth = Math.max(2, s * 0.07);
  g.stroke();
  g.restore();
}

function drawEnvelope(g, x, y, s, color = '#f4ead4') {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(-s * 0.45, -s * 0.3, s * 0.9, s * 0.6, s * 0.05);
  g.fill();
  outline(g, s);
  g.beginPath();
  g.moveTo(-s * 0.45, -s * 0.28);
  g.lineTo(0, s * 0.05);
  g.lineTo(s * 0.45, -s * 0.28);
  g.strokeStyle = rgba('#000', 0.35);
  g.lineWidth = Math.max(1, s * 0.03);
  g.stroke();
  g.fillStyle = '#b8283a';
  ell(g, 0, s * 0.05, s * 0.08, s * 0.08);
  g.fill();
  g.restore();
}

function drawStealHand(g, x, y, s) {
  g.save();
  g.translate(x, y);
  drawGem(g, s * 0.12, -s * 0.18, s * 0.42, '#ff5a5f', 0.6);
  // a gloved hand reaching in from below-left
  g.fillStyle = '#1e1b24';
  g.beginPath();
  g.moveTo(-s * 0.5, s * 0.5);
  g.lineTo(-s * 0.2, s * 0.05);
  g.quadraticCurveTo(-s * 0.08, -s * 0.05, s * 0.05, s * 0.05);
  g.lineTo(s * 0.25, s * 0.1);
  g.quadraticCurveTo(s * 0.3, s * 0.18, s * 0.18, s * 0.2);
  g.lineTo(-s * 0.05, s * 0.18);
  g.lineTo(-s * 0.2, s * 0.5);
  g.closePath();
  g.fill();
  g.strokeStyle = '#4a4552';
  g.lineWidth = Math.max(1, s * 0.03);
  g.stroke();
  g.restore();
}

/** A room's emblem on a little tile: books, a chandelier, a palm, a barrel. */
export function roomIcon(g, id, x, y, s, tile = true) {
  const color = ROOM_COLOR[id] ?? '#888';
  g.save();
  g.translate(x, y);
  if (tile) {
    const bg = g.createLinearGradient(0, -s / 2, 0, s / 2);
    bg.addColorStop(0, shade(color, -0.35));
    bg.addColorStop(1, shade(color, -0.7));
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(-s / 2, -s / 2, s, s, s * 0.2);
    g.fill();
    g.strokeStyle = color;
    g.lineWidth = Math.max(1.5, s * 0.05);
    g.stroke();
  }
  const k = s * 0.8;
  g.lineJoin = 'round';
  if (id === 'library') {
    const books = [['#a8323a', 0.16, 0.62], ['#2f6b8a', 0.14, 0.7], ['#d8a83a', 0.15, 0.56]];
    let bx = -k * 0.36;
    for (const [c, bw, bh] of books) {
      g.fillStyle = c;
      g.fillRect(bx, k * 0.34 - bh * k, bw * k, bh * k);
      g.strokeStyle = INK;
      g.lineWidth = Math.max(1, k * 0.03);
      g.strokeRect(bx, k * 0.34 - bh * k, bw * k, bh * k);
      g.fillStyle = 'rgba(255,255,255,.5)';
      g.fillRect(bx + bw * k * 0.2, k * 0.34 - bh * k * 0.8, bw * k * 0.6, k * 0.04);
      bx += bw * k + k * 0.01;
    }
    g.save();
    g.translate(bx + k * 0.02, k * 0.34);
    g.rotate(0.35);
    g.fillStyle = '#3a7a4a';
    g.fillRect(0, -k * 0.6, k * 0.14, k * 0.6);
    g.strokeRect(0, -k * 0.6, k * 0.14, k * 0.6);
    g.restore();
    g.fillStyle = '#5a3a22';
    g.fillRect(-k * 0.44, k * 0.34, k * 0.88, k * 0.07);
  } else if (id === 'ballroom') {
    g.strokeStyle = GOLD;
    g.lineWidth = Math.max(1.5, k * 0.05);
    g.beginPath();
    g.moveTo(0, -k * 0.45);
    g.lineTo(0, -k * 0.12);
    g.stroke();
    g.beginPath();
    g.ellipse(0, -k * 0.05, k * 0.38, k * 0.13, 0, 0, Math.PI);
    g.stroke();
    for (let i = -2; i <= 2; i++) {
      const cx = i * k * 0.17;
      const cy = -k * 0.05 + Math.cos((i / 2.4) * 1.2) * k * 0.11;
      g.fillStyle = '#fff3c8';
      g.fillRect(cx - k * 0.025, cy - k * 0.14, k * 0.05, k * 0.12);
      g.fillStyle = '#ffb84a';
      ell(g, cx, cy - k * 0.18, k * 0.035, k * 0.06);
      g.fill();
      g.fillStyle = 'rgba(220,240,255,.9)';
      ell(g, cx, cy + k * 0.08, k * 0.03, k * 0.06);
      g.fill();
    }
  } else if (id === 'conservatory') {
    g.fillStyle = '#9a5a32';
    g.beginPath();
    g.moveTo(-k * 0.18, k * 0.12);
    g.lineTo(k * 0.18, k * 0.12);
    g.lineTo(k * 0.13, k * 0.42);
    g.lineTo(-k * 0.13, k * 0.42);
    g.closePath();
    g.fill();
    outline(g, k);
    for (let i = 0; i < 7; i++) {
      g.save();
      g.translate(0, k * 0.12);
      g.rotate((i - 3) * 0.42);
      g.fillStyle = i % 2 ? '#2f8a4a' : '#5ccf7a';
      ell(g, 0, -k * 0.26, k * 0.07, k * 0.26);
      g.fill();
      g.restore();
    }
  } else if (id === 'cellar') {
    g.fillStyle = '#9a6430';
    ell(g, -k * 0.08, k * 0.06, k * 0.3, k * 0.34);
    g.fill();
    outline(g, k);
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = Math.max(1.5, k * 0.05);
    for (const dy of [-0.18, 0.3]) {
      g.beginPath();
      g.moveTo(-k * 0.36, k * dy);
      g.quadraticCurveTo(-k * 0.08, k * dy + k * 0.06, k * 0.2, k * dy);
      g.stroke();
    }
    g.fillStyle = '#2a5a2a';
    g.beginPath();
    g.roundRect(k * 0.22, -k * 0.12, k * 0.16, k * 0.52, k * 0.05);
    g.roundRect(k * 0.265, -k * 0.34, k * 0.07, k * 0.26, k * 0.02);
    g.fill();
    outline(g, k);
    g.fillStyle = '#f4ead4';
    g.fillRect(k * 0.24, k * 0.08, k * 0.12, k * 0.12);
  }
  g.restore();
}

/**
 * Named icons for phone screens (see "Drawn art" in server/games/index.js): 'room:<id>',
 * 'role:<role>', 'guest' (in `color`), 'steal', 'lie', 'plant', 'nobody', 'eye', 'glove',
 * 'magnifier', 'shield', 'gem', 'vote'.
 */
export function drawNamed(g, name, x, y, s, color = '#8a93a8') {
  const [kind, arg] = String(name).split(':');
  if (kind === 'room') return roomIcon(g, arg, x, y, s);
  if (kind === 'role') return drawGuest(g, x, y + s * 0.05, s * 0.95, ROLE_COLOR[arg] ?? color, 11, { role: arg });
  if (kind === 'guest') return drawGuest(g, x, y + s * 0.05, s * 0.95, color, seedOf(arg ?? color));
  if (kind === 'steal') return drawStealHand(g, x, y, s);
  if (kind === 'lie') return drawMoon(g, x, y, s);
  if (kind === 'plant') return drawGlove(g, x, y + s * 0.05, s * 0.8);
  if (kind === 'glove') return drawGlove(g, x, y + s * 0.05, s * 0.8, '#ffe2a0');
  if (kind === 'eye') return drawEye(g, x, y, s);
  if (kind === 'magnifier') return drawMagnifier(g, x, y, s);
  if (kind === 'shield') return drawShield(g, x, y, s * 0.8, ROLE_COLOR.bodyguard);
  if (kind === 'gem') return drawGem(g, x, y, s * 0.7, color, 0.6);
  if (kind === 'vote') return drawEnvelope(g, x, y, s * 0.9);
  if (kind === 'nobody') {
    g.save();
    g.strokeStyle = '#8a93a8';
    g.lineWidth = Math.max(2, s * 0.08);
    g.beginPath();
    g.arc(x, y, s * 0.32, 0, Math.PI * 2);
    g.moveTo(x - s * 0.22, y + s * 0.22);
    g.lineTo(x + s * 0.22, y - s * 0.22);
    g.stroke();
    g.restore();
  }
}

/** The phone's big card (screen.hero): a role card. name = 'role:<role>' (or just the role). */
export function drawHero(g, name, x, y, w, h) {
  const role = String(name).replace(/^role:/, '');
  drawRoleCard(g, role, x, y, w, h);
}
export function drawHeroBack(g, x, y, w, h) {
  drawCardBack(g, x, y, w, h);
}

// ---- TV helpers -------------------------------------------------------------------------------

export function drawMoonDisc(g, x, y, r, glowA = 0.25) {
  g.save();
  const glow = g.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2);
  glow.addColorStop(0, `rgba(255,240,200,${glowA})`);
  glow.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = glow;
  g.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
  const mg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  mg.addColorStop(0, '#fffbea');
  mg.addColorStop(1, '#e8dcb0');
  g.fillStyle = mg;
  ell(g, x, y, r, r);
  g.fill();
  g.fillStyle = 'rgba(180,165,120,.35)';
  for (const [a, b, c] of [[-0.3, -0.2, 0.18], [0.25, 0.1, 0.14], [-0.1, 0.35, 0.1]]) {
    ell(g, x + a * r, y + b * r, c * r, c * r);
    g.fill();
  }
  g.restore();
}

export { drawGlove, drawEnvelope, drawMagnifier, drawEye };
