// How-to-play pictures for Bumper Arena (steps in server/games/bumper.js).

import { PLAYER_COLORS, burst, circle, ease, label, lerp, pad, pawn, seg } from './kit.js';

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ move, shrink }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

function platform(ctx, x, y, r) {
  ctx.save();
  ctx.fillStyle = '#1c2233';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2f3a55';
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffc93c88';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

// Red rolls over, dashes into blue, and blue flies off the edge.
function move(ctx, t, cx, cy) {
  const loop = t % 4.5;
  const dash = loop > 1.4 && loop < 1.7;
  pad(ctx, cx - 300, cy + 20, { stick: loop < 1.8 ? [1, 0] : [0, 0], press: { a: dash ? 1 : 0 }, labels: { a: 'Dash' }, s: 0.9 });
  const px = cx + 200;
  platform(ctx, px, cy + 20, 260);
  const roll = ease(seg(loop, 0.2, 1.4));
  const d = ease(seg(loop, 1.4, 1.8));
  const rx = lerp(px - 200, px - 90, roll) + d * 80;
  const fly = seg(loop, 1.75, 3.0);
  const bx = lerp(px + 30, px + 330, ease(fly));
  const by = cy + 20 + fly * fly * 140;
  if (dash) {
    ctx.fillStyle = PLAYER_COLORS[0] + '55';
    for (let i = 1; i <= 3; i++) circle(ctx, rx - i * 22, cy + 20, 30 - i * 4, PLAYER_COLORS[0] + '44');
  }
  pawn(ctx, bx, by, PLAYER_COLORS[1], { r: 32, sad: fly > 0 });
  pawn(ctx, rx, cy + 20, PLAYER_COLORS[0], { r: 32 });
  burst(ctx, px, cy + 10, seg(loop, 1.72, 2.3), '#ffd23f', 60);
  label(ctx, loop < 1.4 ? 'Stick: roll' : 'A: dash, hits harder', px, cy - 170, 1, '#ffe8c2', 28);
}

// The platform shrinks; the last one on wins.
function shrink(ctx, t, cx, cy) {
  const r = lerp(340, 150, ease(seg(t, 0.4, 4)));
  platform(ctx, cx, cy + 20, r);
  const spots = [
    [-0.8, 0],
    [0.5, -0.3],
    [0.1, 0.4],
    [-0.2, -0.5],
  ];
  spots.forEach(([fx, fy], i) => {
    const x = cx + fx * 300;
    const y = cy + 20 + fy * 150;
    const off = Math.hypot((x - cx) / r, (y - cy - 20) / (r * 0.55)) > 1;
    if (off && i !== 2) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      pawn(ctx, x, y + 40, PLAYER_COLORS[i], { r: 26, sad: true });
      ctx.restore();
    } else pawn(ctx, x, y, PLAYER_COLORS[i], { r: 30, crown: i === 2 && t > 4.2 });
  });
  label(ctx, 'Last one on wins the round', cx, cy - 160, seg(t, 3.6, 4.0), '#ffd23f', 30);
}
