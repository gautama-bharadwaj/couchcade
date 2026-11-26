// How-to-play pictures for Dragon Hoard (steps in server/games/hoard.js).

import { INK, PLAYER_COLORS, burst, circle, ease, label, lerp, pawn, phone, rrect, seg, text } from './kit.js';

const EMBER = '#ff8a3d';
const FROST = '#4cb8ff';
const DUST = '#b9ab8c';
const DRAGON = '#3a0d12';
const PARCHMENT = '#efe6d0';

// A small board: 5 x 3 words, with what hides under each.
const WORDS = ['WAVE', 'CROWN', 'SHELL', 'MOON', 'ANCHOR', 'CASTLE', 'TIDE', 'SPARK', 'CAVE', 'PEARL', 'TORCH', 'FROST', 'SAIL', 'BELL', 'ROPE'];
const KEY = ['E', 'F', 'E', 'F', 'E', 'F', 'D', 'X', 'D', 'E', 'D', 'F', 'D', 'F', 'D']; // Ember, Frost, Dust, dragon (X)
const fill = { E: EMBER, F: FROST, D: DUST, X: DRAGON };

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ board, keeper, seekers, dragon, coop }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

/** One word tile; flip 0..1 turns it over to show what hides under it. */
function tile(ctx, x, y, w, h, word, kind, flip = 0, { dots = [], glow = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  const sx = Math.abs(Math.cos(flip * Math.PI));
  ctx.scale(Math.max(0.03, sx), 1);
  const up = flip >= 0.5;
  if (glow) {
    ctx.shadowColor = '#ffe08a';
    ctx.shadowBlur = 24;
  }
  rrect(ctx, -w / 2, -h / 2, w, h, 10);
  ctx.fillStyle = up ? fill[kind] : PARCHMENT;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  if (!up) text(ctx, word, 0, 9, { size: Math.min(26, w / 5), weight: 900, color: INK });
  else if (kind === 'X') drawDragon(ctx, 0, 0, h / 110);
  else if (kind === 'D') text(ctx, 'dust', 0, 9, { size: 22, weight: 800, color: '#6b5d40' });
  else gemIcon(ctx, 0, 0, h / 90);
  ctx.restore();
  dots.forEach((c, i) => circle(ctx, x - w / 2 + 16 + i * 18, y + h / 2 - 12, 7, c));
}

function gemIcon(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-18, -6);
  ctx.lineTo(-9, -18);
  ctx.lineTo(9, -18);
  ctx.lineTo(18, -6);
  ctx.lineTo(0, 20);
  ctx.closePath();
  ctx.fillStyle = '#fff6';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

function drawDragon(ctx, x, y, s, open = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#c0392b';
  ctx.strokeStyle = '#ffb3a0';
  ctx.lineWidth = 3;
  // head
  ctx.beginPath();
  ctx.moveTo(-34, -10);
  ctx.quadraticCurveTo(-20, -34, 14, -26);
  ctx.lineTo(40, -8 - open * 6);
  ctx.lineTo(16, -2);
  ctx.lineTo(40, 6 + open * 10);
  ctx.quadraticCurveTo(0, 26, -30, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // horn and eye
  ctx.beginPath();
  ctx.moveTo(-16, -26);
  ctx.lineTo(-30, -44);
  ctx.lineTo(-4, -28);
  ctx.fill();
  ctx.stroke();
  circle(ctx, 0, -12, open > 0 ? 6 : 2, '#ffd23f');
  ctx.restore();
}

function grid(ctx, cx, cy, { flips = {}, dots = {}, glow = {}, w = 170, h = 80, gap = 14 } = {}) {
  WORDS.forEach((word, i) => {
    const c = i % 5;
    const r = Math.floor(i / 5);
    const x = cx + (c - 2) * (w + gap);
    const y = cy + (r - 1) * (h + gap);
    tile(ctx, x, y, w, h, word, KEY[i], flips[i] ?? 0, { dots: dots[i] ?? [], glow: glow[i] });
  });
}

// The words, then a peek at what hides under a few of them.
function board(ctx, t, cx, cy) {
  const flips = {};
  [0, 1, 6, 7].forEach((i, j) => {
    const k = seg(t, 1.4 + j * 0.6, 1.8 + j * 0.6) - seg(t, 4.6, 5.0);
    flips[i] = k;
  });
  grid(ctx, cx, cy - 30, { flips });
  const legend = [
    ['Ember gem', EMBER],
    ['Frost gem', FROST],
    ['Dust', DUST],
    ['Dragon', '#c0392b'],
  ];
  legend.forEach(([str, c], i) => {
    const x = cx - 330 + i * 220;
    circle(ctx, x - 60, cy + 180, 12, c);
    text(ctx, str, x - 40, cy + 188, { size: 22, weight: 800, color: '#d5d9e4', align: 'left' });
  });
}

// The Keeper's phone shows the key; their clue appears.
function keeper(ctx, t, cx, cy) {
  phone(ctx, cx - 330, cy, 1.4, (g, w, h) => {
    text(g, 'The key (secret)', w / 2, 30, { size: 15, weight: 800, color: '#8a93a8' });
    WORDS.forEach((word, i) => {
      const c = i % 3;
      const r = Math.floor(i / 3);
      const tw = (w - 24) / 3;
      rrect(g, 8 + c * (tw + 4), 44 + r * 48, tw, 42, 6);
      g.fillStyle = fill[KEY[i]];
      g.fill();
      text(g, word, 8 + c * (tw + 4) + tw / 2, 44 + r * 48 + 26, { size: 11, weight: 900, color: KEY[i] === 'X' ? '#ffb3a0' : INK });
    });
  });
  pawn(ctx, cx - 80, cy + 120, EMBER, { r: 38 });
  label(ctx, 'Keeper', cx - 80, cy + 190, 1, EMBER, 24);
  const k = ease(seg(t, 1.6, 2.2));
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(cx + 220, cy - 40);
  ctx.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
  rrect(ctx, -170, -60, 340, 120, 40);
  ctx.fillStyle = '#fff7e6';
  ctx.fill();
  text(ctx, 'OCEAN  3', 0, 18, { size: 52, weight: 900, color: INK });
  ctx.restore();
  label(ctx, 'One word, one number', cx + 220, cy + 80, seg(t, 2.6, 3.0), '#d5d9e4', 26);
  label(ctx, '(3 of our words go with “ocean”)', cx + 220, cy + 120, seg(t, 3.2, 3.6), '#8a93a8', 22);
}

// Seekers' votes gather on a word; it flips to an Ember gem, then the next flips to dust.
function seekers(ctx, t, cx, cy) {
  const voters = [EMBER, '#ffb37a', '#ffd0a8'];
  const dots = {};
  const n1 = Math.min(3, Math.floor(seg(t, 0.4, 1.6) * 4));
  dots[0] = voters.slice(0, n1);
  const n2 = Math.min(3, Math.floor(seg(t, 3.2, 4.2) * 4));
  if (t > 3.2) dots[6] = voters.slice(0, n2);
  const flips = { 0: seg(t, 1.8, 2.3), 6: seg(t, 4.4, 4.9) };
  grid(ctx, cx, cy - 30, { flips, dots, glow: { 0: t > 1.6 && t < 1.8, 6: t > 4.2 && t < 4.4 } });
  label(ctx, t < 4.9 ? 'Your gem: keep going!' : 'Dust: turn over', cx, cy + 190, seg(t, 2.3, 2.7), t < 4.9 ? EMBER : DUST, 30);
}

// The dragon wakes.
function dragon(ctx, t, cx, cy) {
  const flip = seg(t, 0.8, 1.4);
  const x = cx - 160;
  tile(ctx, x, cy - 20, 300, 170, 'SPARK', 'X', flip);
  if (t > 1.4) {
    const wake = seg(t, 1.4, 2.0);
    drawDragon(ctx, x, cy - 20, 1.4 + wake * 0.4, wake);
    burst(ctx, x, cy - 20, seg(t, 1.6, 2.6), '#ff6b5e', 200);
  }
  label(ctx, 'Dragon: your team loses', cx + 250, cy - 40, seg(t, 2.0, 2.4), '#ff6b5e', 34);
  label(ctx, 'All your gems found: you win', cx + 250, cy + 40, seg(t, 3.6, 4.0), '#ffd23f', 30);
}

// Two or three pawns huddle on one side; the clue counter ticks down.
function coop(ctx, t, cx, cy) {
  const k = ease(seg(t, 0.3, 1.3));
  [PLAYER_COLORS[0], PLAYER_COLORS[1], PLAYER_COLORS[2]].forEach((c, i) => {
    pawn(ctx, lerp(cx - 420 + i * 260, cx - 330 + i * 90, k), cy, c, { r: 40 });
  });
  label(ctx, 'One team', cx - 240, cy + 90, seg(t, 1.2, 1.6), '#d5d9e4', 28);
  drawDragon(ctx, cx + 330, cy - 20, 2.2, 0.3 + 0.3 * Math.sin(t * 3));
  label(ctx, 'vs', cx + 60, cy + 10, seg(t, 1.4, 1.8), '#8a93a8', 40);
  const left = 8 - Math.min(3, Math.floor(seg(t, 2.4, 4.8) * 4));
  label(ctx, `Clues left: ${left}`, cx + 330, cy + 120, seg(t, 2.0, 2.4), '#ffc93c', 30);
}
