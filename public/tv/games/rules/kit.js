// Small drawing kit for the how-to-play pictures in this folder: timing helpers, a phone, a
// joystick-and-buttons pad, little player pawns and labels. Each picture gets t (seconds into
// the step) and draws inside the box the rules overlay gives it (1000 x 430 on the 1600 x 900 TV).

import { circle, text } from '../util.js';

export { circle, text };

/** 0..1 as t goes from a to b. */
export const seg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
export const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
export const lerp = (a, b, k) => a + (b - a) * k;
export const INK = '#1a1410';

export const PLAYER_COLORS = ['#ff5a5f', '#3fa7ff', '#4cd97b', '#ffc93c', '#b36bff', '#ff8c42'];

export function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** A caption under a picture, faded in by alpha. */
export function label(ctx, str, x, y, alpha = 1, color = '#ffe8c2', size = 28) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= Math.min(1, alpha);
  text(ctx, str, x, y, { size, weight: 800, color });
  ctx.restore();
}

/** A round pawn with a face, outlined like a drawn token. */
export function pawn(ctx, x, y, color, { r = 34, out = false, crown = false, sad = false, ring = null } = {}) {
  ctx.save();
  ctx.globalAlpha *= out ? 0.35 : 1;
  if (ring) {
    ctx.strokeStyle = ring;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, r + 9, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.95, r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x, y, r, INK);
  circle(ctx, x, y, r - 4, color);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  circle(ctx, x - r * 0.3, y - r * 0.05, r * 0.11, INK);
  circle(ctx, x + r * 0.3, y - r * 0.05, r * 0.11, INK);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (sad) ctx.arc(x, y + r * 0.45, r * 0.25, Math.PI * 1.15, Math.PI * 1.85);
  else ctx.arc(x, y + r * 0.2, r * 0.25, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  if (crown) {
    const cy = y - r - 4;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = INK;
    ctx.beginPath();
    ctx.moveTo(x - 22, cy);
    ctx.lineTo(x - 24, cy - 24);
    ctx.lineTo(x - 11, cy - 12);
    ctx.lineTo(x, cy - 28);
    ctx.lineTo(x + 11, cy - 12);
    ctx.lineTo(x + 24, cy - 24);
    ctx.lineTo(x + 22, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * A phone, centred at x, y (160 x 290 at s = 1). screen(ctx, w, h) draws inside it, with the
 * origin at the top-left of the screen.
 */
export function phone(ctx, x, y, s, screen) {
  const w = 160 * s;
  const h = 290 * s;
  ctx.save();
  ctx.translate(x - w / 2, y - h / 2);
  rrect(ctx, 0, 0, w, h, 22 * s);
  ctx.fillStyle = '#20242e';
  ctx.fill();
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = '#4a5266';
  ctx.stroke();
  const pad = 10 * s;
  rrect(ctx, pad, pad * 2, w - pad * 2, h - pad * 4, 10 * s);
  ctx.fillStyle = '#0f1218';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.translate(pad, pad * 2);
  screen?.(ctx, w - pad * 2, h - pad * 4);
  ctx.restore();
  ctx.restore();
}

/** A tappable button on a phone screen, centred at x, y. */
export function button(ctx, str, x, y, w, h, { color = '#ffc93c', ink = INK, glow = 0, size = 18 } = {}) {
  ctx.save();
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 24 * glow;
  }
  rrect(ctx, x - w / 2, y - h / 2, w, h, h / 2.6);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  text(ctx, str, x, y + size * 0.35, { size, weight: 900, color: ink });
}

/**
 * The phone controller as a pad: a joystick on the left and up to two buttons on the right.
 * stick = [dx, dy] in -1..1; press = { a: 0..1, b: 0..1 } (how pressed); labels = { a, b }.
 */
export function pad(ctx, x, y, { stick = [0, 0], press = {}, labels = {}, s = 1 } = {}) {
  const w = 420 * s;
  const h = 200 * s;
  ctx.save();
  ctx.translate(x, y);
  rrect(ctx, -w / 2, -h / 2, w, h, 40 * s);
  ctx.fillStyle = '#20242e';
  ctx.fill();
  ctx.lineWidth = 4 * s;
  ctx.strokeStyle = '#4a5266';
  ctx.stroke();
  // Joystick
  const jx = -w / 2 + 105 * s;
  circle(ctx, jx, 0, 66 * s, '#151922');
  ctx.strokeStyle = '#3a4255';
  ctx.lineWidth = 3 * s;
  ctx.beginPath();
  ctx.arc(jx, 0, 66 * s, 0, Math.PI * 2);
  ctx.stroke();
  circle(ctx, jx + stick[0] * 36 * s, stick[1] * 36 * s, 32 * s, '#8a93a8');
  circle(ctx, jx + stick[0] * 36 * s - 8 * s, stick[1] * 36 * s - 8 * s, 10 * s, 'rgba(255,255,255,.3)');
  // Buttons
  const btns = [
    ['b', w / 2 - 175 * s, 30 * s, '#3fa7ff'],
    ['a', w / 2 - 75 * s, -20 * s, '#ff5a5f'],
  ];
  for (const [id, bx, by, color] of btns) {
    if (!labels[id]) continue;
    const p = press[id] ?? 0;
    ctx.save();
    if (p > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 30 * p * s;
    }
    circle(ctx, bx, by + p * 4 * s, 42 * s, p > 0 ? color : color + 'aa');
    ctx.restore();
    text(ctx, id.toUpperCase(), bx, by + 12 * s + p * 4 * s, { size: 34 * s, weight: 900, color: INK });
    text(ctx, labels[id], bx, by + 72 * s, { size: 20 * s, weight: 800, color: '#d5d9e4' });
  }
  ctx.restore();
}

/** A curved arrow from (x1, y1) to (x2, y2), bowed up by bend, drawn up to k (0..1). */
export function arrow(ctx, x1, y1, x2, y2, { bend = 60, color = '#ffe8c2', width = 5, k = 1 } = {}) {
  if (k <= 0) return;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - bend;
  const at = (u) => [(1 - u) ** 2 * x1 + 2 * (1 - u) * u * mx + u * u * x2, (1 - u) ** 2 * y1 + 2 * (1 - u) * u * my + u * u * y2];
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [px, py] = at((i / 24) * k);
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
  ctx.stroke();
  const [ex, ey] = at(k);
  const [bx, by] = at(Math.max(0, k - 0.05));
  const a = Math.atan2(ey - by, ex - bx);
  ctx.translate(ex, ey);
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-10, -10);
  ctx.lineTo(-10, 10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** A burst of rays, for hits, wins and blasts. k = 0..1 through the burst. */
export function burst(ctx, x, y, k, color = '#ffd23f', r = 70) {
  if (k <= 0 || k >= 1) return;
  ctx.save();
  ctx.globalAlpha *= 1 - k;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r0 = r * (0.3 + k * 0.6);
    const r1 = r * (0.6 + k * 0.8);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
}
