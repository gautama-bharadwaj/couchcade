// Shed! art, drawn in code: card faces, the card back and little symbols. Shared by the TV
// renderer (public/tv/games/shed.js) and the phones (screens with art: 'shed'; see "Drawn art" in
// server/games/index.js). The face is Shed!'s own: a coloured card with a scalloped cream seal in
// the middle, drawn symbols for the action cards (a hop for Skip, a loop for Reverse, a fanned
// pair for Draw 2) and a four-colour pinwheel for the Wilds.

import { CREAM, INK, SERIF, cardBody, darken, lighten, outlined, roundRect, star } from './cards.js';

export const WILD = ['#e8484d', '#2f8fe6', '#2fb866', '#e6a817'];

/** A scalloped seal (a circle with bumps), centred on (x, y). */
function seal(g, x, y, r, fill, stroke) {
  g.beginPath();
  const n = 14;
  for (let i = 0; i <= n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.9 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = stroke;
    g.lineWidth = Math.max(1, r * 0.05);
    g.stroke();
  }
}

function arrowHead(g, x, y, a, s, fill) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.beginPath();
  g.moveTo(s, 0);
  g.lineTo(-s * 0.6, -s * 0.8);
  g.lineTo(-s * 0.6, s * 0.8);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.restore();
}

/** The four-colour pinwheel of the Wild cards, radius r, turned by `spin` radians. */
export function pinwheel(g, x, y, r, spin = 0, colors = WILD) {
  g.save();
  g.translate(x, y);
  g.rotate(spin);
  for (let i = 0; i < 4; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(r * 0.15, -r * 0.95, r * 0.75, -r * 0.75);
    g.quadraticCurveTo(r * 0.55, -r * 0.2, 0, 0);
    g.closePath();
    g.fillStyle = colors[i % colors.length];
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = Math.max(1, r * 0.07);
    g.lineJoin = 'round';
    g.stroke();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  g.fillStyle = CREAM;
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, r * 0.06);
  g.stroke();
  g.restore();
}

/**
 * A card's symbol centred on (x, y), about s across, in `ink` (the card's colour).
 * kind: number | skip | reverse | draw2 | wild | wild4; value: the number.
 */
export function drawSymbol(g, kind, value, x, y, s, ink, { t = 0, small = false } = {}) {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const line = Math.max(1.2, s * 0.06);
  if (kind === 'number') {
    const str = String(value ?? '?');
    outlined(g, str, 0, s * 0.04, { size: s * 0.82, color: ink, stroke: INK, font: SERIF, weight: 900, line: Math.max(2, s * 0.08) });
    if (str === '6' || str === '9') {
      g.fillStyle = ink;
      g.strokeStyle = INK;
      g.lineWidth = Math.max(1, s * 0.03);
      roundRect(g, -s * 0.16, s * 0.36, s * 0.32, s * 0.07, s * 0.03);
      g.fill();
      g.stroke();
    }
  } else if (kind === 'skip') {
    // A little pawn, and an arrow hopping right over its head.
    g.fillStyle = ink;
    g.strokeStyle = INK;
    g.lineWidth = line * 0.7;
    g.beginPath();
    g.arc(0, s * 0.02, s * 0.12, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(-s * 0.17, s * 0.38);
    g.quadraticCurveTo(-s * 0.15, s * 0.12, 0, s * 0.12);
    g.quadraticCurveTo(s * 0.15, s * 0.12, s * 0.17, s * 0.38);
    g.closePath();
    g.fill();
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = line * 2.2;
    g.beginPath();
    g.moveTo(-s * 0.38, s * 0.3);
    g.quadraticCurveTo(-s * 0.3, -s * 0.48, s * 0.26, -s * 0.12);
    g.stroke();
    g.strokeStyle = ink;
    g.lineWidth = line * 1.3;
    g.stroke();
    arrowHead(g, s * 0.3, -s * 0.07, 0.7, s * 0.13, INK);
    arrowHead(g, s * 0.29, -s * 0.08, 0.7, s * 0.09, ink);
  } else if (kind === 'reverse') {
    // Two arrows chasing each other round a loop.
    g.rotate(-0.5 + t);
    for (const k of [0, Math.PI]) {
      g.save();
      g.rotate(k);
      g.strokeStyle = INK;
      g.lineWidth = line * 2.4;
      g.beginPath();
      g.arc(0, 0, s * 0.3, Math.PI * 0.1, Math.PI * 0.82);
      g.stroke();
      g.strokeStyle = ink;
      g.lineWidth = line * 1.4;
      g.stroke();
      const a = Math.PI * 0.1;
      arrowHead(g, Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, a - Math.PI / 2, s * 0.15, INK);
      arrowHead(g, Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, a - Math.PI / 2, s * 0.1, ink);
      g.restore();
    }
  } else if (kind === 'draw2' || kind === 'wild4') {
    // A small fan of cards: two in the card's colour, or four in all colours for the Wild.
    const cols = kind === 'wild4' ? WILD : [ink, ink];
    const n = cols.length;
    cols.forEach((c, i) => {
      g.save();
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      g.translate(k * s * (n > 2 ? 0.5 : 0.34), -s * 0.04 + Math.abs(k) * s * 0.08);
      g.rotate(k * (n > 2 ? 0.9 : 0.6));
      g.fillStyle = CREAM;
      roundRect(g, -s * 0.17, -s * 0.25, s * 0.34, s * 0.5, s * 0.05);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = Math.max(1, s * 0.03);
      g.stroke();
      g.fillStyle = c;
      roundRect(g, -s * 0.13, -s * 0.21, s * 0.26, s * 0.42, s * 0.035);
      g.fill();
      g.restore();
    });
    if (!small) outlined(g, kind === 'wild4' ? '+4' : '+2', 0, s * 0.3, { size: s * 0.36, color: CREAM, stroke: INK, line: Math.max(2, s * 0.07) });
  } else if (kind === 'wild') {
    pinwheel(g, 0, 0, s * 0.42, t);
  }
  g.restore();
}

const SHORT = { skip: null, reverse: null, draw2: '+2', wild: null, wild4: '+4' };

/**
 * A Shed! card face, w x h, centred on (x, y). card = { kind, value } and hex = its colour (null
 * for a Wild). chosen = the colour a played Wild was given. t animates the pinwheel / loop.
 */
export function drawFace(g, card, hex, x, y, w, h, { chosen = null, t = 0, rot = 0, glow = null, shadow = true } = {}) {
  const kind = card?.kind ?? 'number';
  const wild = kind === 'wild' || kind === 'wild4';
  const ink = wild ? CREAM : hex ?? '#888888';
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  cardBody(g, w, h, {
    top: wild ? '#3a3550' : lighten(ink, 0.12),
    bottom: wild ? '#15131f' : darken(ink, 0.28),
    shadow,
    glow,
    inside(g2, iw, ih) {
      // Faint diagonal stripes.
      g2.strokeStyle = wild ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.1)';
      g2.lineWidth = iw * 0.07;
      for (let i = -6; i <= 6; i++) {
        g2.beginPath();
        g2.moveTo(i * iw * 0.22 - ih, -ih);
        g2.lineTo(i * iw * 0.22 + ih, ih);
        g2.stroke();
      }
      if (wild) {
        // Four colour bands peeking in from the corners.
        WILD.forEach((c, i) => {
          g2.fillStyle = c;
          g2.globalAlpha = 0.85;
          const sx = i % 2 ? 1 : -1;
          const sy = i < 2 ? -1 : 1;
          g2.beginPath();
          g2.arc((sx * iw) / 2, (sy * ih) / 2, iw * 0.26, 0, Math.PI * 2);
          g2.fill();
        });
        g2.globalAlpha = 1;
      }
    },
  });
  // The seal in the middle.
  const r = w * 0.36;
  seal(g, 0, 0, r, wild ? (chosen ? lighten(chosen, 0.1) : '#2a2638') : CREAM, INK);
  if (chosen && wild) {
    g.beginPath();
    g.arc(0, 0, r * 0.78, 0, Math.PI * 2);
    g.fillStyle = '#211d2e';
    g.fill();
  } else if (!wild) {
    g.beginPath();
    g.arc(0, 0, r * 0.8, 0, Math.PI * 2);
    g.strokeStyle = lighten(ink, 0.35);
    g.lineWidth = Math.max(1, w * 0.012);
    g.stroke();
  }
  drawSymbol(g, kind, card?.value, 0, 0, w * 0.58, wild ? CREAM : ink, { t });
  // Corner marks, top left and (upside down) bottom right.
  for (const flip of [0, Math.PI]) {
    g.save();
    g.rotate(flip);
    const cx = -w / 2 + w * 0.17;
    const cy = -h / 2 + w * 0.19;
    if (kind === 'number') outlined(g, String(card.value), cx, cy, { size: w * 0.2, color: CREAM, stroke: INK, font: SERIF, line: Math.max(2, w * 0.035) });
    else if (SHORT[kind]) outlined(g, SHORT[kind], cx + w * 0.02, cy, { size: w * 0.16, color: CREAM, stroke: INK, line: Math.max(2, w * 0.03) });
    else if (kind === 'wild') pinwheel(g, cx, cy, w * 0.09);
    else drawSymbol(g, kind, null, cx, cy, w * 0.24, CREAM, { small: true });
    g.restore();
  }
  g.restore();
}

/** The back of a Shed! card: deep blue, a sunburst and the name on a gold seal. */
export function drawBack(g, x, y, w, h, { rot = 0, shadow = true } = {}) {
  g.save();
  g.translate(x, y);
  if (rot) g.rotate(rot);
  cardBody(g, w, h, {
    top: '#2b3f73',
    bottom: '#121a36',
    shadow,
    inside(g2, iw, ih) {
      g2.fillStyle = 'rgba(255,255,255,.06)';
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        g2.beginPath();
        g2.moveTo(0, 0);
        g2.arc(0, 0, ih, a, a + Math.PI / 16);
        g2.closePath();
        g2.fill();
      }
      g2.strokeStyle = 'rgba(246,236,210,.25)';
      g2.lineWidth = Math.max(1, iw * 0.015);
      roundRect(g2, -iw / 2 + iw * 0.08, -ih / 2 + iw * 0.08, iw * 0.84, ih - iw * 0.16, iw * 0.06);
      g2.stroke();
    },
  });
  seal(g, 0, 0, w * 0.34, '#f2c14e', INK);
  g.beginPath();
  g.arc(0, 0, w * 0.27, 0, Math.PI * 2);
  g.fillStyle = '#e8484d';
  g.fill();
  g.strokeStyle = INK;
  g.lineWidth = Math.max(1, w * 0.015);
  g.stroke();
  g.save();
  g.rotate(-0.22);
  outlined(g, 'SHED!', 0, w * 0.01, { size: w * 0.19, color: CREAM, stroke: INK, font: SERIF, line: Math.max(2, w * 0.035) });
  g.restore();
  star(g, -w * 0.3, -h * 0.34, w * 0.05, '#f2c14e');
  star(g, w * 0.3, h * 0.34, w * 0.05, '#f2c14e');
  g.restore();
}

/** A splat of paint in colour c (the phone's colour choice for a Wild). */
export function drawPaint(g, x, y, s, c) {
  g.save();
  g.translate(x, y);
  const blobs = [[0, 0, 0.3], [0.27, -0.14, 0.12], [-0.25, 0.18, 0.11], [0.12, 0.3, 0.09], [-0.3, -0.2, 0.08], [0.38, 0.2, 0.06], [-0.05, -0.38, 0.07]];
  g.fillStyle = INK;
  for (const [bx, by, br] of blobs) {
    g.beginPath();
    g.arc(bx * s, by * s, br * s + Math.max(1, s * 0.04), 0, Math.PI * 2);
    g.fill();
  }
  const grd = g.createRadialGradient(-s * 0.1, -s * 0.12, s * 0.02, 0, 0, s * 0.45);
  grd.addColorStop(0, lighten(c, 0.3));
  grd.addColorStop(1, darken(c, 0.12));
  g.fillStyle = grd;
  for (const [bx, by, br] of blobs) {
    g.beginPath();
    g.arc(bx * s, by * s, br * s, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.ellipse(-s * 0.1, -s * 0.12, s * 0.1, s * 0.05, -0.6, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.fill();
  g.restore();
}

// ---- For the phone's generic `art` support (see "Drawn art" in server/games/index.js) ----------

/** Phone hand card: c = { art: kind, label, color } from server/games/shed.js. */
export function drawHandCard(g, c, w, h) {
  drawFace(g, { kind: c.art, value: c.label }, c.color, w / 2, h / 2, w - 4, h - 6, { shadow: false });
}

/** 'paint' (a colour choice), or a mini card named 'kind' or 'kind:value' (the top card). */
export function drawNamed(g, name, x, y, s, c) {
  if (name === 'paint') return drawPaint(g, x, y, s, c ?? '#888888');
  const [kind, value] = name.split(':');
  const wild = kind === 'wild' || kind === 'wild4';
  drawFace(g, { kind, value }, wild ? null : c, x, y, s * 0.68, s * 0.97, { chosen: wild ? c : null, shadow: false });
}
