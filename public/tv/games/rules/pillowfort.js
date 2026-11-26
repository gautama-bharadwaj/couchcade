// How-to-play pictures for Pillow Fort Siege (steps in server/games/pillowfort.js).

import { INK, burst, circle, ease, label, lerp, rrect, seg, text } from './kit.js';

const TEAM = ['#ff5a5f', '#3fa7ff'];
const CUSHION = ['#ffb3b5', '#a8d4ff'];

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ build, siege, win }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

const C = 40; // cushion size

function cushion(ctx, x, y, color) {
  rrect(ctx, x - C / 2 + 1, y - C / 2 + 1, C - 2, C - 2, 10);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  circle(ctx, x, y, 3, INK);
}

function teddy(ctx, x, y, { hit = false } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (hit) ctx.rotate(-0.6);
  circle(ctx, -14, -46, 9, '#8a5a2b');
  circle(ctx, 14, -46, 9, '#8a5a2b');
  circle(ctx, 0, -34, 18, '#b07a45');
  circle(ctx, 0, -6, 22, '#b07a45');
  circle(ctx, -6, -36, 3, INK);
  circle(ctx, 6, -36, 3, INK);
  circle(ctx, 0, -28, 4, '#3b2a1c');
  ctx.restore();
}

function kid(ctx, x, y, color, { carry = null, arm = 0 } = {}) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x - 10, y);
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x + 10, y);
  ctx.moveTo(x, y - 30);
  ctx.lineTo(x, y - 58);
  ctx.moveTo(x, y - 52);
  ctx.lineTo(x + Math.cos(arm) * 22, y - 52 - Math.sin(arm) * 22);
  ctx.stroke();
  circle(ctx, x, y - 70, 12, color);
  if (carry) cushion(ctx, x, y - 104, carry);
}

/** A fort: columns of cushion heights, from the left edge x0, sitting on y. */
function fort(ctx, x0, y, heights, color) {
  heights.forEach((h, c) => {
    for (let r = 0; r < h; r++) cushion(ctx, x0 + c * C + C / 2, y - r * C - C / 2, color);
  });
}

function floor(ctx, cx, y) {
  ctx.fillStyle = '#3b2f45';
  ctx.fillRect(cx - 500, y, 1000, 12);
}

// A kid grabs a cushion from the pile in the middle, runs home and stacks it.
function build(ctx, t, cx, cy) {
  const y = cy + 170;
  floor(ctx, cx, y);
  const loop = t % 5;
  const stacked = loop > 3.6;
  fort(ctx, cx - 460, y, [2, 1, stacked ? 3 : 2, 1], CUSHION[0]);
  teddy(ctx, cx - 440, y - 2 * C);
  fort(ctx, cx + 300, y, [1, 2, 2, 1], CUSHION[1]);
  teddy(ctx, cx + 440, y - C);
  // Laundry pile.
  for (let i = 0; i < 5; i++) cushion(ctx, cx - 40 + (i % 3) * 36, y - C / 2 - Math.floor(i / 3) * 34, ['#ffe08a', '#c9f2c7', '#e0c8ff'][i % 3]);
  label(ctx, 'Laundry pile', cx, y - 120, seg(loop, 0, 0.4), '#8a93a8', 22);
  const toPile = ease(seg(loop, 0.2, 1.2));
  const home = ease(seg(loop, 1.6, 3.2));
  const x = loop < 1.6 ? lerp(cx - 200, cx - 60, toPile) : lerp(cx - 60, cx - 340, home);
  const carrying = loop > 1.3 && !stacked;
  kid(ctx, x, y, TEAM[0], { carry: carrying ? '#ffe08a' : null, arm: carrying ? 1.4 : -0.6 });
  label(ctx, loop < 1.6 ? 'B: grab a cushion' : loop < 3.6 ? 'Carry it home…' : '…B again: stack it', cx - 200, cy - 180, 1, '#ffe8c2', 28);
}

// Wind up (hold B), the arc shows, let go: two hits knock a cushion out.
function siege(ctx, t, cx, cy) {
  const y = cy + 170;
  floor(ctx, cx, y);
  const loop = t % 5;
  const knocked = loop > 3.4;
  fort(ctx, cx - 460, y, [2, 2, 3, 2], CUSHION[0]);
  teddy(ctx, cx - 440, y - 2 * C);
  fort(ctx, cx + 260, y, [2, knocked ? 1 : 2, 3, 2], CUSHION[1]);
  teddy(ctx, cx + 440, y - 2 * C);
  const kx = cx - 240;
  const wind = loop > 0.4 && loop < 1.8;
  kid(ctx, kx, y, TEAM[0], { arm: wind ? 2.6 : 0.6 });
  // The aiming arc.
  const sx = kx + 10;
  const sy = y - 70;
  const tx = cx + 260 + C * 1.5;
  const ty = y - C * 1.5;
  const arcAt = (u) => [lerp(sx, tx, u), lerp(sy, ty, u) - Math.sin(u * Math.PI) * 220];
  if (wind) {
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = '#ffe8c288';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const [px, py] = arcAt(i / 20);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }
  for (const [at, n] of [
    [1.8, 0],
    [2.7, 1],
  ]) {
    const u = seg(loop, at, at + 0.7);
    if (u > 0 && u < 1) {
      const [px, py] = arcAt(u);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(u * 8);
      rrect(ctx, -22, -14, 44, 28, 10);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    burst(ctx, tx, ty, seg(loop, at + 0.7, at + 1.2), '#ffe08a', 50);
    if (n === 1 && knocked) label(ctx, 'Knocked loose!', tx, y - 4 * C, seg(loop, 3.4, 3.8), '#ffd23f', 24);
  }
  label(ctx, wind ? 'Hold B to aim' : loop < 0.4 ? ' ' : 'Let go to throw', cx - 120, cy - 180, 1, '#ffe8c2', 28);
}

// A pillow sails over the wall and bops the teddy.
function win(ctx, t, cx, cy) {
  const y = cy + 170;
  floor(ctx, cx, y);
  fort(ctx, cx - 460, y, [2, 2, 3, 2], CUSHION[0]);
  teddy(ctx, cx - 440, y - 2 * C);
  fort(ctx, cx + 260, y, [1, 0, 1, 2], CUSHION[1]);
  const hit = t > 2.0;
  teddy(ctx, cx + 340, y, { hit });
  const u = seg(t, 1.0, 2.0);
  if (u > 0 && u < 1) {
    const px = lerp(cx - 260, cx + 340, u);
    const py = lerp(y - 80, y - 30, u) - Math.sin(u * Math.PI) * 220;
    rrect(ctx, px - 22, py - 14, 44, 28, 10);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  burst(ctx, cx + 340, y - 30, seg(t, 2.0, 2.8), '#ffd23f', 80);
  kid(ctx, cx - 260, y, TEAM[0], { arm: t > 1 ? 0.6 : 2.6 });
  label(ctx, 'Bop their teddy: you win the round!', cx, cy - 180, seg(t, 2.2, 2.6), '#ffd23f', 30);
  label(ctx, 'Time up? Most cushions standing wins', cx, cy - 130, seg(t, 4.0, 4.4), '#d5d9e4', 24);
}
