// How-to-play pictures for Stickup (steps in server/games/stickup.js). Text only, no narrator.

import { INK, burst, ease, label, lerp, pad, rrect, seg, text } from './kit.js';

const RED = '#ff5a5f';
const BLUE = '#3fa7ff';

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ move, weapons, win }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

/** A stick figure, feet at x, y. pose: { run: phase, punch: 0..1, air: bool, gun: bool, face: ±1, tilt } */
function fighter(ctx, x, y, color, { run = 0, punch = 0, air = false, gun = false, face = 1, tilt = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt);
  ctx.scale(face * 1.5, 1.5);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  const hip = [0, -34];
  const neck = [0, -62];
  const legA = air ? 0.6 : Math.sin(run) * 0.6;
  ctx.beginPath();
  ctx.moveTo(...hip);
  ctx.lineTo(Math.sin(legA) * 30, -34 + Math.cos(legA) * 34);
  ctx.moveTo(...hip);
  ctx.lineTo(Math.sin(-legA) * 30, -34 + Math.cos(legA) * 34 - (air ? 10 : 0));
  ctx.moveTo(...hip);
  ctx.lineTo(...neck);
  // arms
  ctx.moveTo(0, -56);
  ctx.lineTo(-16, -38);
  ctx.moveTo(0, -56);
  ctx.lineTo(14 + punch * 22, -54 + (1 - punch) * 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -74, 11, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  if (gun) {
    ctx.fillStyle = '#d5d9e4';
    ctx.fillRect(26 + punch * 22, -58, 26, 7);
    ctx.fillRect(26 + punch * 22, -58, 7, 14);
  }
  ctx.restore();
}

function ledge(ctx, x0, x1, y) {
  rrect(ctx, x0, y, x1 - x0, 18, 6);
  ctx.fillStyle = '#3d4663';
  ctx.fill();
  ctx.fillStyle = '#5b6788';
  ctx.fillRect(x0 + 6, y, x1 - x0 - 12, 4);
}

// The pad on the left; a fighter on the right runs, double-jumps and punches.
function move(ctx, t, cx, cy) {
  const loop = t % 5;
  const jump1 = seg(loop, 1.4, 2.0);
  const jump2 = seg(loop, 2.0, 2.7);
  const hit = loop > 3.4 && loop < 4.0 ? Math.sin(seg(loop, 3.4, 4.0) * Math.PI) : 0;
  const stick = loop < 1.4 ? [1, 0] : [0, 0];
  pad(ctx, cx - 280, cy + 30, { stick, press: { a: (loop > 1.4 && loop < 1.6) || (loop > 2.0 && loop < 2.2) ? 1 : 0, b: hit > 0 ? 1 : 0 }, labels: { a: 'Jump', b: 'Hit' } });
  const groundY = cy + 150;
  ledge(ctx, cx + 30, cx + 480, groundY);
  const x = cx + 80 + Math.min(1, loop / 1.4) * 180;
  const up = Math.sin(jump1 * Math.PI) * 110 + Math.sin(jump2 * Math.PI) * 140 * (jump1 >= 1 ? 1 : 0);
  fighter(ctx, x, groundY - up, RED, { run: loop * 12 * (loop < 1.4 ? 1 : 0), air: up > 1, punch: hit });
  fighter(ctx, cx + 400, groundY, BLUE, { face: -1, tilt: hit * 0.15 });
  burst(ctx, cx + 380, groundY - 60, seg(loop, 3.6, 4.2), '#ffd23f', 40);
  label(ctx, loop < 1.4 ? 'Stick: run and aim' : loop < 3.0 ? 'A: jump, A again: double jump' : 'B: hit', cx + 255, cy - 170, 1, '#ffe8c2', 26);
}

// A crate floats down on a parachute; a fighter walks into it and comes out armed.
function weapons(ctx, t, cx, cy) {
  const groundY = cy + 150;
  ledge(ctx, cx - 450, cx + 450, groundY);
  const fall = ease(seg(t, 0.2, 2.2));
  const crateX = cx + 60;
  const crateY = lerp(cy - 200, groundY - 30, fall);
  const grabbed = t > 3.0;
  if (!grabbed) {
    if (fall < 1) {
      ctx.strokeStyle = '#d5d9e4';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(crateX - 26, crateY - 28);
      ctx.lineTo(crateX - 50, crateY - 90);
      ctx.moveTo(crateX + 26, crateY - 28);
      ctx.lineTo(crateX + 50, crateY - 90);
      ctx.stroke();
      ctx.fillStyle = '#ff8c42';
      ctx.beginPath();
      ctx.arc(crateX, crateY - 90, 60, Math.PI, 0);
      ctx.fill();
    }
    rrect(ctx, crateX - 30, crateY - 30, 60, 60, 6);
    ctx.fillStyle = '#8a5a2b';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    text(ctx, '?', crateX, crateY + 12, { size: 34, weight: 900, color: '#ffd23f' });
  }
  const walk = seg(t, 2.0, 3.0);
  fighter(ctx, lerp(cx - 300, crateX, walk), groundY, RED, { run: t * 12 * (walk > 0 && walk < 1 ? 1 : 0), gun: grabbed });
  burst(ctx, crateX, groundY - 40, seg(t, 3.0, 3.6), '#ffd23f', 50);
  // Headshot.
  if (t > 3.8) {
    const shot = seg(t, 3.8, 4.3);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(lerp(crateX + 50, cx + 330, shot), groundY - 60, 18, 4);
    fighter(ctx, cx + 350, groundY, BLUE, { face: -1, tilt: shot >= 1 ? 0.2 : 0 });
    if (shot >= 1) label(ctx, 'Headshot! ×1.5', cx + 350, groundY - 120, seg(t, 4.3, 4.6), '#ff6b5e', 30);
  }
  label(ctx, 'Walk into a crate to grab it', cx - 200, cy - 150, seg(t, 1.8, 2.2), '#ffe8c2', 28);
}

// Knocked off the ledge: out of the round. Win 5 rounds.
function win(ctx, t, cx, cy) {
  const groundY = cy + 80;
  ledge(ctx, cx - 300, cx + 200, groundY);
  ctx.fillStyle = '#ff5a1f55';
  ctx.fillRect(cx - 500, cy + 180, 1000, 35);
  const hit = seg(t, 1.0, 1.2);
  fighter(ctx, cx - 40, groundY, RED, { punch: hit > 0 && hit < 1 ? 1 : 0 });
  const fly = seg(t, 1.2, 2.6);
  fighter(ctx, lerp(cx + 40, cx + 320, fly), groundY - Math.sin(fly * Math.PI * 0.6) * 120 + fly * fly * 200, BLUE, { face: -1, tilt: fly * 4, air: true });
  burst(ctx, cx + 30, groundY - 60, seg(t, 1.0, 1.6), '#ffd23f', 50);
  label(ctx, 'Off the edge or 0 health: out', cx + 280, cy - 120, seg(t, 2.4, 2.8), '#ff6b5e', 28);
  // Five round pips.
  for (let i = 0; i < 5; i++) {
    const on = i < Math.floor(seg(t, 3.4, 5.4) * 5 + 0.001);
    ctx.beginPath();
    ctx.arc(cx - 260 + i * 50, cy - 140, 16, 0, Math.PI * 2);
    ctx.fillStyle = on ? RED : '#2f3647';
    ctx.fill();
  }
  label(ctx, 'First to 5 rounds', cx - 160, cy - 90, seg(t, 3.2, 3.6), '#ffe8c2', 26);
}
