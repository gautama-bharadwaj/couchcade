// How-to-play pictures for Tint & Tell (steps in server/games/tint.js).

import { INK, PLAYER_COLORS, circle, ease, label, lerp, pawn, phone, rrect, seg, text } from './kit.js';

// The same wheel as the game: 24 hue spokes by 6 rings, palest in the middle (server/games/tint.js).
const HUES = 24;
const RINGS = 6;
const HUE_DEG = [0, 12, 24, 34, 44, 52, 60, 75, 95, 120, 145, 165, 180, 192, 204, 216, 230, 250, 268, 282, 295, 310, 325, 340];
const RING_L = [87, 76, 64, 51, 39, 27];
const RING_S = [80, 86, 90, 86, 80, 72];
const color = (h, r) => `hsl(${HUE_DEG[h]}, ${RING_S[r]}%, ${RING_L[r]}%)`;
const TARGET = [4, 2]; // hue, ring: a ripe orange-yellow

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ wheel, clue1, clue2, score }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

const R0 = 30;
const RW = 30;
function cellCenter(x, y, h, r) {
  const a = (h / HUES) * Math.PI * 2 - Math.PI / 2;
  const rr = R0 + (r + 0.5) * RW;
  return [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
}
function drawWheel(ctx, x, y, { dimExcept = null, glow = null } = {}) {
  for (let r = 0; r < RINGS; r++) {
    for (let h = 0; h < HUES; h++) {
      const a0 = ((h - 0.5) / HUES) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((h + 0.5) / HUES) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(x, y, R0 + (r + 1) * RW, a0, a1);
      ctx.arc(x, y, R0 + r * RW, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = color(h, r);
      ctx.globalAlpha = dimExcept && !(dimExcept[0] === h && dimExcept[1] === r) ? 0.25 : 1;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0d0f14';
      ctx.stroke();
    }
  }
  circle(ctx, x, y, R0, '#0d0f14');
  if (glow) {
    const [h, r] = glow;
    const a0 = ((h - 0.5) / HUES) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((h + 0.5) / HUES) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(x, y, R0 + (r + 1) * RW, a0, a1);
    ctx.arc(x, y, R0 + r * RW, a1, a0, true);
    ctx.closePath();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
}

function pin(ctx, x, y, c) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 26);
  ctx.stroke();
  circle(ctx, x, y - 32, 12, INK);
  circle(ctx, x, y - 32, 9, c);
  ctx.restore();
}

function bubble(ctx, str, x, y, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.font = '900 40px system-ui, -apple-system, sans-serif';
  const w = ctx.measureText(str).width + 60;
  rrect(ctx, x - w / 2, y - 40, w, 76, 30);
  ctx.fillStyle = '#fff7e6';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 50, y + 30);
  ctx.lineTo(x - 70, y + 60);
  ctx.lineTo(x - 20, y + 34);
  ctx.fill();
  text(ctx, str, x, y + 12, { size: 40, weight: 900, color: INK });
  ctx.restore();
}

// The wheel, and the Teller's phone with the secret swatch.
function wheel(ctx, t, cx, cy) {
  const wx = cx - 180;
  drawWheel(ctx, wx, cy, { glow: t > 2.4 ? TARGET : null });
  pawn(ctx, cx + 240, cy + 120, PLAYER_COLORS[3], { r: 34, crown: false });
  label(ctx, 'Teller', cx + 240, cy + 185, seg(t, 0.4, 0.8), '#ffc93c', 24);
  phone(ctx, cx + 380, cy - 20, 0.95, (g, w, h) => {
    text(g, 'Your secret color', w / 2, 34, { size: 15, weight: 800, color: '#8a93a8' });
    const k = seg(t, 1.2, 1.6);
    g.globalAlpha = k;
    rrect(g, 16, 50, w - 32, 120, 12);
    g.fillStyle = color(...TARGET);
    g.fill();
    g.globalAlpha = 1;
  });
  label(ctx, 'Somewhere on this wheel', wx, cy + 205, seg(t, 2.4, 2.8), '#d5d9e4', 22);
}

// Guess pins land after the one-word clue.
const FIRST = [
  [4, 3, 0],
  [5, 1, 1],
  [2, 2, 2],
];
const SECOND = [
  [4, 2, 0],
  [4, 1, 1],
  [3, 2, 2],
];
const GUESSERS = [PLAYER_COLORS[0], PLAYER_COLORS[1], PLAYER_COLORS[4]];
function clue1(ctx, t, cx, cy) {
  const wx = cx - 140;
  drawWheel(ctx, wx, cy);
  bubble(ctx, '“Mango”', cx + 330, cy - 120, seg(t, 0.3, 0.7));
  label(ctx, 'Not allowed: orange, red, yellow…', cx + 330, cy + 10, seg(t, 1.4, 1.8), '#ff8c8c', 22);
  FIRST.forEach(([h, r, who], i) => {
    const k = ease(seg(t, 2.4 + i * 0.5, 2.9 + i * 0.5));
    if (k <= 0) return;
    const [x, y] = cellCenter(wx, cy, h, r);
    pin(ctx, x, lerp(y - 60, y, k), GUESSERS[who]);
  });
  label(ctx, 'Tap your guess on your phone', cx + 330, cy + 120, seg(t, 2.6, 3.0), '#d5d9e4', 24);
}

// After the two-word clue some pins move closer, one stays put.
function clue2(ctx, t, cx, cy) {
  const wx = cx - 140;
  drawWheel(ctx, wx, cy);
  bubble(ctx, '“Ripe mango”', cx + 330, cy - 120, seg(t, 0.3, 0.7));
  FIRST.forEach(([h, r, who], i) => {
    const [nh, nr] = SECOND[i];
    const k = ease(seg(t, 1.6 + i * 0.4, 2.4 + i * 0.4));
    const [x0, y0] = cellCenter(wx, cy, h, r);
    const [x1, y1] = cellCenter(wx, cy, nh, nr);
    pin(ctx, lerp(x0, x1, k), lerp(y0, y1, k) - Math.sin(k * Math.PI) * 30, GUESSERS[who]);
  });
  label(ctx, 'Move your pin, or keep it', cx + 330, cy + 20, seg(t, 1.4, 1.8), '#d5d9e4', 24);
  label(ctx, 'Kept a close first guess? +1', cx + 330, cy + 80, seg(t, 3.4, 3.8), '#ffc93c', 24);
}

// The answer lights up with the scoring steps around it.
function score(ctx, t, cx, cy) {
  const wx = cx - 140;
  drawWheel(ctx, wx, cy, { dimExcept: t > 0.6 ? TARGET : null, glow: TARGET });
  const [tx, ty] = cellCenter(wx, cy, ...TARGET);
  const pts = [4, 3, 2, 1];
  pts.forEach((p, d) => {
    const k = seg(t, 0.8 + d * 0.5, 1.2 + d * 0.5);
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.strokeStyle = ['#fff', '#ffe08a', '#ffb347', '#ff8c8c'][d];
    ctx.lineWidth = 3;
    ctx.setLineDash(d ? [8, 6] : []);
    ctx.beginPath();
    ctx.arc(tx, ty, 14 + d * 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
    label(ctx, `${d === 0 ? 'Bullseye' : `${d} step${d > 1 ? 's' : ''}`}: ${p}`, cx + 330, cy - 120 + d * 50, k, ['#fff', '#ffe08a', '#ffb347', '#ff8c8c'][d], 28);
  });
  SECOND.forEach(([h, r, who]) => {
    const [x, y] = cellCenter(wx, cy, h, r);
    pin(ctx, x, y, GUESSERS[who]);
  });
  label(ctx, 'Teller scores the best guess', cx + 330, cy + 120, seg(t, 3.4, 3.8), '#d5d9e4', 24);
}
