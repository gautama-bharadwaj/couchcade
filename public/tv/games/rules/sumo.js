// How-to-play pictures for Sumo Spin (steps in server/games/sumo.js).

import { PLAYER_COLORS, burst, circle, ease, label, lerp, pad, pawn, seg } from './kit.js';

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ charge, dodge, platform }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

function ring(ctx, x, y, r, { spin = 0, tilt = 0, crumble = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#3b2a1c';
  ctx.beginPath();
  ctx.ellipse(0, 18, r, r * 0.55, tilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8d2a6';
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.55, tilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a5a2b';
  ctx.lineWidth = 5;
  ctx.stroke();
  // Spokes show the spin.
  ctx.strokeStyle = '#c9ad7a';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.5);
    ctx.stroke();
  }
  // Crumbled bits around the edge.
  for (let i = 0; i < 14 * crumble; i++) {
    const a = i * 2.4;
    circle(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.55, 16, '#0d0f14');
  }
  ctx.restore();
}

// Hold A: a glow grows; let go: a lunge sends blue back.
function charge(ctx, t, cx, cy) {
  const loop = t % 5;
  const held = loop > 0.4 && loop < 2.2;
  const power = seg(loop, 0.4, 2.0);
  pad(ctx, cx - 300, cy + 20, { press: { a: held ? 1 : 0 }, labels: { a: 'Charge', b: 'Dodge' }, s: 0.9 });
  const px = cx + 200;
  ring(ctx, px, cy + 20, 260);
  const lunge = ease(seg(loop, 2.2, 2.6));
  const rx = px - 140 + lunge * 110;
  const hit = seg(loop, 2.55, 3.6);
  const bx = px + 30 + ease(hit) * 170;
  if (held) circle(ctx, rx, cy + 20, 34 + power * 22, `rgba(255,201,60,${0.25 + 0.3 * power})`);
  pawn(ctx, bx, cy + 20, PLAYER_COLORS[1], { r: 32, sad: hit > 0 });
  pawn(ctx, rx, cy + 20, PLAYER_COLORS[0], { r: 32 });
  burst(ctx, px - 5, cy + 15, hit, '#ffd23f', 60);
  label(ctx, held ? `Hold A to charge${power >= 1 ? ': full!' : '…'}` : loop < 0.4 ? ' ' : 'Let go: lunge!', px, cy - 170, 1, '#ffe8c2', 28);
}

// Red lunges; blue taps B at the last moment, sidesteps, and red stumbles past.
function dodge(ctx, t, cx, cy) {
  const loop = t % 5;
  const tap = loop > 1.3 && loop < 1.5;
  pad(ctx, cx - 300, cy + 20, { press: { b: tap ? 1 : 0 }, labels: { a: 'Charge', b: 'Dodge' }, s: 0.9 });
  const px = cx + 200;
  ring(ctx, px, cy + 20, 260);
  const lunge = ease(seg(loop, 1.0, 2.2));
  const rx = lerp(px - 180, px + 140, lunge);
  const side = ease(seg(loop, 1.3, 1.6)) * (1 - seg(loop, 3.4, 4));
  pawn(ctx, px + 20, cy + 20 - side * 70, PLAYER_COLORS[1], { r: 32 });
  pawn(ctx, rx, cy + 20 + Math.sin(lunge * 20) * 4 * lunge, PLAYER_COLORS[0], { r: 32, sad: lunge > 0.6 });
  label(ctx, 'Just in time: they stumble past', px, cy - 170, seg(loop, 2.0, 2.4), '#ffe8c2', 28);
}

// Spinning and tilting, then the edge crumbles.
function platform(ctx, t, cx, cy) {
  const tilt = Math.sin(t * 0.8) * 0.12 * seg(t, 1, 2);
  const crumble = seg(t, 3, 5);
  ring(ctx, cx, cy, 360 - crumble * 60, { spin: t * 0.9, tilt, crumble });
  [0, 1, 2].forEach((i) => {
    const a = t * 0.9 + i * 2.1;
    const slide = tilt * 300;
    pawn(ctx, cx + Math.cos(a) * 160 + slide, cy + Math.sin(a) * 80, PLAYER_COLORS[i], { r: 28 });
  });
  label(ctx, 'It spins…', cx - 300, cy - 170, seg(t, 0.2, 0.6), '#ffe8c2', 28);
  label(ctx, '…it tilts…', cx, cy - 170, seg(t, 1.2, 1.6), '#ffe8c2', 28);
  label(ctx, '…it crumbles', cx + 300, cy - 170, seg(t, 3.0, 3.4), '#ff8c42', 28);
}
