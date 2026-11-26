// How-to-play pictures for Hot Potato Pileup (steps in server/games/potato.js).

import { INK, PLAYER_COLORS, burst, circle, ease, label, lerp, pad, pawn, rrect, seg, text } from './kit.js';

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ bomb, dodge, score }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

function yard(ctx, x, y, w, h) {
  rrect(ctx, x - w / 2, y - h / 2, w, h, 24);
  ctx.fillStyle = '#2d4a2a';
  ctx.fill();
  ctx.strokeStyle = '#6b8f4e';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function bombIcon(ctx, x, y, t, s = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  circle(ctx, 0, 0, 18, INK);
  circle(ctx, 0, 0, 15, '#3a3f4d');
  circle(ctx, -5, -5, 5, '#ffffff55');
  ctx.strokeStyle = '#c9ad7a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(8, -12);
  ctx.quadraticCurveTo(16, -24, 24, -20);
  ctx.stroke();
  circle(ctx, 24, -20, 4 + Math.sin(t * 20) * 2, '#ffd23f');
  ctx.restore();
}

// Red holds the bomb, tackles blue, and the bomb jumps over; blue is dizzy.
function bomb(ctx, t, cx, cy) {
  const loop = t % 5;
  const tackle = loop > 1.4 && loop < 1.7;
  pad(ctx, cx - 300, cy + 20, { stick: loop < 1.6 ? [1, 0] : [0, 0], press: { a: tackle ? 1 : 0 }, labels: { a: 'Tackle', b: 'Dodge' }, s: 0.9 });
  const px = cx + 200;
  yard(ctx, px, cy + 20, 560, 340);
  const run = ease(seg(loop, 0.2, 1.4));
  const dash = ease(seg(loop, 1.4, 1.7));
  const rx = lerp(px - 220, px - 90, run) + dash * 70;
  const passed = loop > 1.7;
  const bx = px + 40 + ease(seg(loop, 1.7, 2.3)) * 60;
  pawn(ctx, rx, cy + 20, PLAYER_COLORS[0], { r: 32 });
  pawn(ctx, bx, cy + 20, PLAYER_COLORS[1], { r: 32, sad: passed });
  if (passed && loop < 3.6) {
    for (let i = 0; i < 3; i++) {
      const a = loop * 6 + i * 2.1;
      text(ctx, '★', bx + Math.cos(a) * 30, cy - 22 + Math.sin(a) * 8, { size: 18, color: '#ffd23f' });
    }
  }
  const k = ease(seg(loop, 1.7, 2.1));
  bombIcon(ctx, lerp(rx + 26, bx + 26, k), cy - 6 - Math.sin(k * Math.PI) * 60, loop);
  burst(ctx, (rx + bx) / 2, cy + 20, seg(loop, 1.65, 2.2), '#ffd23f', 50);
  label(ctx, passed ? 'Tackled: the bomb is theirs!' : 'Holding the bomb? Tackle with A', px, cy - 180, 1, '#ffe8c2', 26);
}

// Blue hops (B) and the tackle whiffs; the fuse keeps burning.
function dodge(ctx, t, cx, cy) {
  const loop = t % 5;
  const hopping = loop > 1.2 && loop < 1.8;
  pad(ctx, cx - 300, cy + 20, { press: { b: hopping ? 1 : 0 }, labels: { a: 'Tackle', b: 'Dodge' }, s: 0.9 });
  const px = cx + 200;
  yard(ctx, px, cy + 20, 560, 340);
  const dash = ease(seg(loop, 1.3, 1.8));
  const rx = lerp(px - 150, px + 120, dash);
  const hop = Math.sin(seg(loop, 1.2, 1.8) * Math.PI);
  pawn(ctx, px + 10, cy + 20 - hop * 80, PLAYER_COLORS[1], { r: 32 });
  pawn(ctx, rx, cy + 20, PLAYER_COLORS[0], { r: 32, sad: loop > 1.8 });
  bombIcon(ctx, rx + 26, cy - 6, loop);
  label(ctx, 'B: a hop nobody can tackle', px, cy - 180, seg(loop, 0.8, 1.2), '#ffe8c2', 26);
  label(ctx, 'The fuse length is a secret', px, cy + 220, seg(loop, 2.4, 2.8), '#ff8c42', 24);
}

// Boom: the holder is out, everyone else scores a point.
function score(ctx, t, cx, cy) {
  yard(ctx, cx, cy, 800, 360);
  const spots = [
    [-260, -60],
    [-80, 80],
    [140, -70],
    [260, 60],
  ];
  const boom = seg(t, 1.2, 2.0);
  spots.forEach(([dx, dy], i) => {
    const holder = i === 1;
    if (holder && t > 1.2) return;
    const push = holder ? 0 : boom * 40;
    pawn(ctx, cx + dx + Math.sign(dx + 80) * push, cy + dy + Math.sign(dy - 80) * push * 0.5, PLAYER_COLORS[i], { r: 32 });
    if (!holder && t > 2.2) label(ctx, '+1', cx + dx + Math.sign(dx + 80) * 40, cy + dy - 50, seg(t, 2.2, 2.6), '#4cd97b', 30);
  });
  if (t < 1.2) bombIcon(ctx, cx - 54, cy + 54, t, 1 + Math.sin(t * 18) * 0.08 * t);
  burst(ctx, cx - 80, cy + 80, boom, '#ff8c42', 160);
  burst(ctx, cx - 80, cy + 80, seg(t, 1.35, 2.2), '#ffd23f', 110);
  label(ctx, 'Last one standing: +2. Most points after 3 rounds wins.', cx, cy + 215, seg(t, 3.4, 3.8), '#ffe8c2', 24);
}
