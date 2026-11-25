// Fuse art, drawn in code: the card faces and their icons, the crate's card back, the bomb, the
// bomb buddies and the wires. Shared by the TV renderer (public/tv/games/fuse.js) and the phones
// (screens with art: 'fuse'; see "Drawn art" in server/games/index.js), in the drawn card style of
// public/art/cards.js. Icons are drawn about 120 units across at scale 1; `now` (ms) animates the
// flickers and sparks, and a still picture just passes 0.

import { CREAM, INK, cardBody, darken, lighten, outlined, roundRect } from './cards.js';

/** Every card: its name, colour, and the one-liner shown in the legend and the card guide. */
export const CARDS = {
  bomb: { name: 'Bomb', color: '#ff4d3d', short: "you're out, unless saved" },
  decoy: { name: 'Decoy', color: '#ff4d3d', short: 'a fake Bomb, harmless' },
  bucket: { name: 'Bucket', color: '#38b6ff', short: 'survive a drawn Bomb' },
  scope: { name: 'Periscope', color: '#a77bff', short: 'peek at the top 3' },
  nudge: { name: 'Nudge', color: '#c48bff', short: 'see top card, may bury it' },
  duck: { name: 'Duck', color: '#3ddc84', short: 'skip one draw' },
  potato: { name: 'Hot Potato', color: '#ff9f1c', short: 'skip; next player draws +1' },
  boomerang: { name: 'Boomerang', color: '#ffd23f', short: 'throw a Hot Potato back' },
  stir: { name: 'Stir', color: '#2ee6d6', short: 'shuffle the crate' },
  backdoor: { name: 'Back Door', color: '#7bd389', short: 'draw from the bottom' },
  swipe: { name: 'Swipe', color: '#ff6fd8', short: 'steal a random card' },
  xray: { name: 'X-Ray', color: '#8fd3ff', short: "see someone's hand" },
};

function circle(g, x, y, r, fill) {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill;
  g.fill();
}

function text(g, str, x, y, { size = 26, weight = 600, color = '#f2f4f8', align = 'center' } = {}) {
  g.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'alphabetic';
  g.fillText(str, x, y);
}

export function spark(g, x, y, now, size) {
  const r = (6 + 3 * Math.sin(now / 40)) * size;
  const grd = g.createRadialGradient(x, y, 0, x, y, r * 3);
  grd.addColorStop(0, 'rgba(255,255,220,1)');
  grd.addColorStop(0.3, 'rgba(255,200,80,.8)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r * 3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffe9a8';
  g.lineWidth = 2 * size;
  for (let i = 0; i < 6; i++) {
    const a = now / 90 + i * 1.05 + Math.sin(now / 37 + i);
    const l = r * (1.5 + Math.random());
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

export function bombIcon(g, x, y, scale, now, lit, wet = false) {
  g.save();
  g.translate(x, y);
  g.scale(scale, scale);
  const grd = g.createRadialGradient(-14, -14, 4, 0, 0, 46);
  grd.addColorStop(0, wet ? '#5a6878' : '#4a4450');
  grd.addColorStop(1, '#0e0a10');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(0, 0, 44, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a2328';
  g.fillRect(-12, -56, 24, 16);
  g.strokeStyle = '#c98d55';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, -56);
  g.quadraticCurveTo(10, -78, 26, -74);
  g.stroke();
  circle(g, -16, -16, 9, 'rgba(255,255,255,.25)');
  g.restore();
  if (lit) spark(g, x + 26 * scale, y - 74 * scale, now, scale * 0.8);
  if (wet) for (let i = 0; i < 3; i++) circle(g, x - 30 + i * 30, y + 60 * scale + ((now / 8 + i * 40) % 60), 5, '#38b6ff');
}

export function icon(g, kind, x, y, now, wet = false) {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const W = '#ffe8c2';
  switch (kind) {
    case 'bomb':
    case 'decoy':
      g.restore();
      bombIcon(g, x + 0, y + 12, 0.85, now, kind === 'bomb' && !wet, wet);
      if (kind === 'decoy') {
        g.fillStyle = '#ff6fd8';
        g.fillRect(x + 10, y - 60, 46, 26);
        text(g, 'POP', x + 33, y - 41, { size: 16, weight: 900, color: '#1a0f12' });
      }
      return;
    case 'bucket':
      g.fillStyle = '#38b6ff';
      g.beginPath();
      g.moveTo(-38, -20);
      g.lineTo(38, -20);
      g.lineTo(28, 40);
      g.lineTo(-28, 40);
      g.closePath();
      g.fill();
      g.strokeStyle = W;
      g.lineWidth = 4;
      g.beginPath();
      g.arc(0, -20, 38, Math.PI, 0);
      g.stroke();
      g.fillStyle = '#8fd3ff';
      g.fillRect(-38, -24, 76, 8);
      for (const [dx, dy] of [[-48, -44], [50, -36], [44, -60]]) {
        g.beginPath();
        g.arc(dx, dy, 6, 0, Math.PI);
        g.lineTo(dx, dy - 12);
        g.closePath();
        g.fill();
      }
      break;
    case 'scope':
      g.strokeStyle = '#a77bff';
      g.lineWidth = 18;
      g.beginPath();
      g.moveTo(-20, 48);
      g.lineTo(-20, -30);
      g.lineTo(28, -30);
      g.stroke();
      circle(g, 38, -30, 16, W);
      circle(g, 38, -30, 9, '#3a2a60');
      circle(g, 34, -34, 3, '#fff');
      break;
    case 'nudge':
      for (let i = 0; i < 3; i++) {
        roundRect(g, -30 + i * 4, -40 + i * 16, 60, 34, 6);
        g.fillStyle = i === 0 ? '#c48bff' : '#4a3a5a';
        g.fill();
      }
      g.strokeStyle = W;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(42, -24);
      g.quadraticCurveTo(66, 10, 44, 50);
      g.stroke();
      g.beginPath();
      g.moveTo(32, 40);
      g.lineTo(44, 52);
      g.lineTo(56, 38);
      g.stroke();
      break;
    case 'duck': {
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.ellipse(0, 22, 42, 26, 0, 0, Math.PI * 2);
      g.fill();
      circle(g, 20, -16, 22, '#ffd23f');
      g.fillStyle = '#ff9f1c';
      g.beginPath();
      g.moveTo(38, -16);
      g.lineTo(60, -10);
      g.lineTo(38, -4);
      g.fill();
      circle(g, 26, -22, 4, '#1a0f12');
      g.strokeStyle = '#e0b020';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(-6, 18, 16, 0.2, 2.2);
      g.stroke();
      break;
    }
    case 'potato': {
      const flick = Math.sin(now / 80) * 4;
      g.fillStyle = '#ff4d3d';
      g.beginPath();
      g.moveTo(-20, -18);
      g.quadraticCurveTo(-26, -50, -6, -62 + flick);
      g.quadraticCurveTo(0, -40, 8, -54 - flick);
      g.quadraticCurveTo(26, -34, 20, -18);
      g.fill();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.moveTo(-10, -18);
      g.quadraticCurveTo(-10, -40, 0, -46 + flick);
      g.quadraticCurveTo(12, -34, 10, -18);
      g.fill();
      g.fillStyle = '#c98d55';
      g.beginPath();
      g.ellipse(0, 14, 46, 32, -0.2, 0, Math.PI * 2);
      g.fill();
      for (const [dx, dy] of [[-18, 6], [10, 22], [20, 0], [-4, 30]]) circle(g, dx, dy, 3.5, '#7a4b2a');
      break;
    }
    case 'boomerang':
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 20;
      g.beginPath();
      g.moveTo(-44, 30);
      g.quadraticCurveTo(0, -60, 44, 30);
      g.stroke();
      g.strokeStyle = '#ff9f1c';
      g.lineWidth = 4;
      g.setLineDash([6, 8]);
      g.beginPath();
      g.arc(0, 20, 58, Math.PI * 0.15, Math.PI * 0.85);
      g.stroke();
      g.setLineDash([]);
      break;
    case 'stir':
      g.strokeStyle = '#2ee6d6';
      g.lineWidth = 8;
      g.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.15) {
        const r = 4 + a * 3.2;
        const t = a + now / 400;
        g.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
      g.stroke();
      break;
    case 'backdoor':
      g.fillStyle = '#7bd389';
      roundRect(g, -30, -50, 60, 96, 6);
      g.fill();
      g.fillStyle = '#3a6a44';
      g.fillRect(-22, -42, 44, 36);
      g.fillRect(-22, 0, 44, 38);
      circle(g, 18, 0, 5, '#ffd23f');
      g.strokeStyle = W;
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(-56, 30);
      g.lineTo(-56, 56);
      g.lineTo(-38, 56);
      g.stroke();
      break;
    case 'swipe':
      // Horseshoe magnet.
      g.strokeStyle = '#ff6fd8';
      g.lineWidth = 24;
      g.beginPath();
      g.arc(0, 0, 32, Math.PI, 0, true);
      g.moveTo(-32, 0);
      g.lineTo(-32, -36);
      g.moveTo(32, 0);
      g.lineTo(32, -36);
      g.stroke();
      g.fillStyle = '#d8dde6';
      g.fillRect(-44, -56, 24, 18);
      g.fillRect(20, -56, 24, 18);
      g.strokeStyle = W;
      g.lineWidth = 3;
      for (const dx of [-32, 32]) {
        g.beginPath();
        g.moveTo(dx - 8, -66);
        g.lineTo(dx, -76);
        g.lineTo(dx + 8, -66);
        g.stroke();
      }
      break;
    case 'xray':
      g.fillStyle = W;
      g.beginPath();
      g.moveTo(-50, 0);
      g.quadraticCurveTo(0, -44, 50, 0);
      g.quadraticCurveTo(0, 44, -50, 0);
      g.fill();
      circle(g, 0, 0, 18, '#8fd3ff');
      circle(g, 0, 0, 8, '#1a0f12');
      g.strokeStyle = '#8fd3ff';
      g.lineWidth = 4;
      for (let i = -2; i <= 2; i++) {
        g.beginPath();
        g.moveTo(i * 18, -34);
        g.lineTo(i * 26, -54);
        g.stroke();
      }
      break;
  }
  g.restore();
}

export function cardBack(g, x, y, scale) {
  const w = 150 * scale;
  const h = 214 * scale;
  g.save();
  g.translate(x, y);
  roundRect(g, -w / 2, -h / 2, w, h, 14 * scale);
  g.fillStyle = '#7a3b1e';
  g.fill();
  g.lineWidth = 6 * scale;
  g.strokeStyle = '#ffd9a0';
  g.stroke();
  // Wooden crate slats.
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 3 * scale;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(-w / 2 + 8 * scale, (i * h) / 6);
    g.lineTo(w / 2 - 8 * scale, (i * h) / 6);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,217,160,.35)';
  g.lineWidth = 8 * scale;
  g.beginPath();
  g.moveTo(-w / 2 + 16 * scale, -h / 2 + 16 * scale);
  g.lineTo(w / 2 - 16 * scale, h / 2 - 16 * scale);
  g.stroke();
  g.rotate(-0.25);
  g.fillStyle = '#1a0f12';
  roundRect(g, -54 * scale, -22 * scale, 108 * scale, 44 * scale, 6 * scale);
  g.fill();
  text(g, 'FUSE', 0, 13 * scale, { size: 34 * scale, weight: 900, color: '#ffb35c' });
  g.restore();
}


/**
 * A card face, w x h, centred on (x, y): the card's colour as a gradient with a cream edge, its
 * icon in a dark porthole, and the name on a dark band. wet = a doused Bomb.
 */
export function drawFace(g, kind, x, y, w, h, now = 0, { rot = 0, wet = false, glow = null, shadow = true } = {}) {
  const c = CARDS[kind] ?? CARDS.bomb;
  const danger = kind === 'bomb' || kind === 'decoy';
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  const k = w / 150;
  cardBody(g, w, h, {
    top: danger ? '#ff6a4d' : lighten(c.color, 0.15),
    bottom: danger ? '#8a1c14' : darken(c.color, 0.35),
    shadow,
    glow,
    inside(g2, iw, ih) {
      // Hazard stripes for the dangerous ones, little rivets for the rest.
      if (danger) {
        g2.fillStyle = 'rgba(26,20,32,.22)';
        for (let i = -8; i <= 8; i++) {
          g2.beginPath();
          g2.moveTo(i * 26 * k - 20 * k, -ih / 2);
          g2.lineTo(i * 26 * k, -ih / 2);
          g2.lineTo(i * 26 * k + ih, ih / 2);
          g2.lineTo(i * 26 * k - 20 * k + ih, ih / 2);
          g2.fill();
        }
      } else {
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) circle(g2, sx * (iw / 2 - 9 * k), sy * (ih / 2 - 9 * k) - (sy > 0 ? 36 * k : 0), 3 * k, 'rgba(26,20,32,.3)');
      }
      // The name band.
      g2.fillStyle = 'rgba(26,20,32,.82)';
      g2.fillRect(-iw / 2, ih / 2 - 40 * k, iw, 40 * k);
    },
  });
  // The porthole.
  const py = -18 * k;
  const pr = 52 * k;
  circle(g, 0, py, pr + 5 * k, CREAM);
  circle(g, 0, py, pr + 1.5 * k, INK);
  const pg = g.createRadialGradient(-pr * 0.3, py - pr * 0.35, pr * 0.1, 0, py, pr);
  pg.addColorStop(0, '#3a2f40');
  pg.addColorStop(1, '#140e18');
  g.fillStyle = pg;
  g.beginPath();
  g.arc(0, py, pr, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.beginPath();
  g.arc(0, py, pr, 0, Math.PI * 2);
  g.clip();
  g.translate(0, py + 4 * k);
  g.scale(k * 0.72, k * 0.72);
  icon(g, kind, 0, 0, now, wet);
  g.restore();
  // Glint on the glass.
  g.strokeStyle = 'rgba(255,255,255,.22)';
  g.lineWidth = 4 * k;
  g.beginPath();
  g.arc(0, py, pr - 8 * k, Math.PI * 1.1, Math.PI * 1.45);
  g.stroke();
  const name = c.name.toUpperCase();
  outlined(g, name, 0, h / 2 - 27 * k, { size: (name.length > 8 ? 17 : 21) * k, color: lighten(c.color, 0.35), stroke: INK, weight: 900, line: 4 * k });
  g.restore();
}

/** The crate's card back at any size (w x h, centred). */
export function drawBack(g, x, y, w, h, { rot = 0 } = {}) {
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.scale(w / 150, h / 214);
  cardBack(g, 0, 0, 1);
  g.restore();
}

/** A round bomb buddy in a player's colour (phones show these for picking a player). */
export function drawBuddy(g, x, y, r, color, { dead = false } = {}) {
  g.save();
  g.strokeStyle = '#c98d55';
  g.lineWidth = Math.max(1.5, r * 0.12);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x + r * 0.3, y - r * 0.9);
  g.quadraticCurveTo(x + r * 0.65, y - r * 1.5, x + r * 0.4, y - r * 1.7);
  g.stroke();
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  grd.addColorStop(0, dead ? '#4a4248' : lighten(color, 0.3));
  grd.addColorStop(1, dead ? '#211c22' : darken(color, 0.2));
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, r * 0.08);
  g.stroke();
  for (const ex of [-0.32, 0.32]) {
    circle(g, x + ex * r, y - r * 0.1, r * 0.24, '#fff');
    circle(g, x + ex * r + r * 0.05, y - r * 0.12, r * 0.11, INK);
  }
  g.restore();
}

/** A wire in colour c, with a pair of open snips hovering over it. */
export function drawWire(g, x, y, s, c) {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  g.strokeStyle = INK;
  g.lineWidth = s * 0.22;
  g.beginPath();
  g.moveTo(-s * 0.45, s * 0.2);
  g.bezierCurveTo(-s * 0.15, -s * 0.25, s * 0.15, s * 0.45, s * 0.45, 0);
  g.stroke();
  g.strokeStyle = c;
  g.lineWidth = s * 0.14;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.45)';
  g.lineWidth = s * 0.04;
  g.beginPath();
  g.moveTo(-s * 0.4, s * 0.12);
  g.bezierCurveTo(-s * 0.15, -s * 0.28, s * 0.1, s * 0.3, s * 0.4, -s * 0.06);
  g.stroke();
  g.restore();
}

/** A cartoon blast: spiky star in orange and yellow. */
export function drawBlast(g, x, y, s) {
  g.save();
  g.translate(x, y);
  for (const [r, col] of [[0.5, '#ff4d3d'], [0.36, '#ff9f1c'], [0.22, '#ffd23f']]) {
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr = i % 2 ? r * 0.62 : r;
      g.lineTo(Math.cos(a) * rr * s, Math.sin(a) * rr * s);
    }
    g.closePath();
    g.fillStyle = col;
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, s * 0.025);
    g.stroke();
  }
  g.restore();
}

// ---- For the phone's generic `art` support (see "Drawn art" in server/games/index.js) ----------

/** Phone hand card: c = { art: kind } from server/games/fuse.js. */
export function drawHandCard(g, c, w, h) {
  drawFace(g, c.art, w / 2, h / 2, w - 4, h - 6, 0, { shadow: false });
}

/** A card icon by kind; or 'wire' / 'buddy' in colour c; 'boom'; 'doused' (a wet Bomb). */
export function drawNamed(g, name, x, y, s, c) {
  if (name === 'wire') return drawWire(g, x, y, s, c ?? '#ff4d3d');
  if (name === 'buddy') return drawBuddy(g, x, y + s * 0.12, s * 0.34, c ?? '#ff5a5f');
  if (name === 'boom') return drawBlast(g, x, y, s);
  g.save();
  g.translate(x, y + s * 0.06);
  g.scale(s / 130, s / 130);
  icon(g, name === 'doused' ? 'bomb' : name, 0, 0, 0, name === 'doused');
  g.restore();
}
