// How-to-play pictures for Midnight Gala (steps in server/games/gala.js).

import { INK, PLAYER_COLORS, arrow, burst, circle, ease, label, lerp, pawn, phone, rrect, seg, text } from './kit.js';

const ROOMS = [
  ['Library', '#b36bff'],
  ['Ballroom', '#ffc93c'],
  ['Conservatory', '#4cd97b'],
  ['Wine Cellar', '#ff8c42'],
];
const THIEF = '#ff5a5f';

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ roles, night, clues, powers, vote, win }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

function gem(ctx, x, y, s, color = '#7fe3ff') {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.beginPath();
  ctx.moveTo(-20, -8);
  ctx.lineTo(-10, -20);
  ctx.lineTo(10, -20);
  ctx.lineTo(20, -8);
  ctx.lineTo(0, 22);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-20, -8);
  ctx.lineTo(20, -8);
  ctx.moveTo(-6, -8);
  ctx.lineTo(0, 22);
  ctx.lineTo(6, -8);
  ctx.stroke();
  ctx.restore();
}

// A domino mask over a pawn's eyes.
function mask(ctx, x, y, r = 34) {
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.ellipse(x - r * 0.3, y - r * 0.05, r * 0.28, r * 0.2, 0, 0, Math.PI * 2);
  ctx.ellipse(x + r * 0.3, y - r * 0.05, r * 0.28, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x - r * 0.1, y - r * 0.1, r * 0.2, r * 0.08);
  circle(ctx, x - r * 0.3, y - r * 0.05, r * 0.08, '#fff');
  circle(ctx, x + r * 0.3, y - r * 0.05, r * 0.08, '#fff');
}

function tag(ctx, str, color, x, y, w = 130) {
  rrect(ctx, x - w / 2, y - 18, w, 36, 18);
  ctx.fillStyle = color;
  ctx.fill();
  text(ctx, str, x, y + 7, { size: 18, weight: 900, color: INK });
}

// Six guests; two of them are Thieves, which only their own phones know.
function roles(ctx, t, cx, cy) {
  const thieves = [1, 4];
  const showAt = 2.2;
  PLAYER_COLORS.forEach((c, i) => {
    const x = cx - 420 + i * 120;
    const y = cy - 40 + Math.sin(t * 2 + i) * 4;
    pawn(ctx, x, y, c);
    if (thieves.includes(i) && t > showAt) {
      ctx.save();
      ctx.globalAlpha = seg(t, showAt, showAt + 0.4) * (0.6 + 0.4 * Math.sin(t * 4));
      mask(ctx, x, y);
      ctx.restore();
    } else if (t < showAt) label(ctx, '?', x, y - 50, seg(t, 0.3 + i * 0.1, 0.6 + i * 0.1), '#8a93a8', 30);
  });
  phone(ctx, cx + 400, cy - 10, 0.95, (g, w, h) => {
    text(g, 'Your role', w / 2, 40, { size: 17, weight: 800, color: '#8a93a8' });
    const k = seg(t, 3.2, 3.6);
    g.globalAlpha = k;
    tag(g, 'Thief', THIEF, w / 2, 80, 100);
    text(g, 'Steal the gems.', w / 2, 130, { size: 15, weight: 600, color: '#d5d9e4' });
    text(g, "Don't get caught.", w / 2, 152, { size: 15, weight: 600, color: '#d5d9e4' });
    g.globalAlpha = 1;
  });
  label(ctx, 'Only you see your role', cx + 400, cy + 180, seg(t, 3.4, 3.8), '#d5d9e4', 22);
}

function roomsAt(cx, cy) {
  return ROOMS.map(([name, color], i) => ({ name, color, x: cx - 375 + i * 250, y: cy + 10 }));
}
function drawRooms(ctx, rooms) {
  for (const r of rooms) {
    rrect(ctx, r.x - 110, r.y - 120, 220, 240, 18);
    ctx.fillStyle = r.color + '22';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = r.color;
    ctx.stroke();
    text(ctx, r.name, r.x, r.y - 88, { size: 22, weight: 900, color: r.color });
  }
}

// Guests drift into rooms; in the Ballroom a gem vanishes.
function night(ctx, t, cx, cy) {
  ctx.fillStyle = 'rgba(20,24,60,.45)';
  ctx.fillRect(cx - 500, cy - 215, 1000, 430);
  const rooms = roomsAt(cx, cy);
  drawRooms(ctx, rooms);
  const dest = [0, 1, 1, 2, 3, 3];
  const slot = [0, 0, 1, 0, 0, 1];
  const k = ease(seg(t, 0.5, 2.2));
  PLAYER_COLORS.forEach((c, i) => {
    const r = rooms[dest[i]];
    const x = lerp(cx - 300 + i * 120, r.x + (slot[i] ? 45 : -45), k);
    const y = lerp(cy + 180, r.y + 50, k);
    pawn(ctx, x, y, c, { r: 28 });
    if (i === 1 && t > 2.4) mask(ctx, x, y, 28);
  });
  const ball = rooms[1];
  const gone = seg(t, 3.0, 3.6);
  if (gone < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - gone;
    gem(ctx, ball.x, ball.y - 25 - gone * 30, 1.1);
    ctx.restore();
  }
  burst(ctx, ball.x, ball.y - 25, seg(t, 3.0, 3.8), '#7fe3ff', 60);
  label(ctx, 'A gem is gone!', ball.x, cy - 150, seg(t, 3.4, 3.8), '#7fe3ff', 26);
}

// The phone's notebook: who you were with, and a fuzzy clue.
function clues(ctx, t, cx, cy) {
  phone(ctx, cx - 250, cy, 1.4, (g, w, h) => {
    text(g, 'Your notes', w / 2, 34, { size: 18, weight: 900, color: '#f2f4f8' });
    const note = (y, title, sub, color, a) => {
      if (a <= 0) return;
      g.save();
      g.globalAlpha = a;
      rrect(g, 10, y, w - 20, 66, 10);
      g.fillStyle = '#1c212c';
      g.fill();
      g.fillStyle = color;
      g.fillRect(10, y, 6, 66);
      text(g, title, 26, y + 26, { size: 15, weight: 900, color, align: 'left' });
      text(g, sub, 26, y + 50, { size: 14, weight: 600, color: '#d5d9e4', align: 'left' });
      g.restore();
    };
    note(56, 'Night 1: Ballroom', 'With Red and Blue', '#ffc93c', seg(t, 0.4, 0.8));
    note(134, 'A gem vanished here!', 'It was Blue or Gold', '#7fe3ff', seg(t, 2.4, 2.8));
  });
  pawn(ctx, cx + 200, cy - 20, PLAYER_COLORS[1], { r: 44, ring: seg(t, 3, 3.3) > 0 ? '#7fe3ff' : null });
  pawn(ctx, cx + 360, cy - 20, PLAYER_COLORS[3], { r: 44, ring: seg(t, 3, 3.3) > 0 ? '#7fe3ff' : null });
  label(ctx, '?', cx + 280, cy - 10, seg(t, 3.2, 3.6), '#7fe3ff', 60);
  label(ctx, 'One of them did it', cx + 280, cy + 90, seg(t, 3.4, 3.8), '#d5d9e4', 24);
}

// Three role badges, each with what it does.
function powers(ctx, t, cx, cy) {
  const list = [
    ['Detective', '#3fa7ff', 'Checks a guest', '🔍'],
    ['Bodyguard', '#2ee6d6', 'Guards a room', '🛡'],
    ['Gossip', '#ff6fd8', 'Posts anonymous notes', '💬'],
  ];
  list.forEach(([name, color, what, icon], i) => {
    const a = seg(t, 0.3 + i * 1.4, 0.8 + i * 1.4);
    if (a <= 0) return;
    const x = cx + (i - 1) * 320;
    ctx.save();
    ctx.globalAlpha = a;
    const y = cy - 40 + (1 - ease(a)) * 30;
    pawn(ctx, x, y, color, { r: 52 });
    text(ctx, icon, x + 46, y - 34, { size: 40 });
    tag(ctx, name, color, x, y + 92, 150);
    text(ctx, what, x, y + 145, { size: 22, weight: 700, color: '#d5d9e4' });
    ctx.restore();
  });
}

// Votes fly at one guest; they're escorted out and their role is shown.
function vote(ctx, t, cx, cy) {
  const target = 1;
  const xs = PLAYER_COLORS.map((_, i) => cx - 375 + i * 150);
  const y = cy + 20;
  const reveal = seg(t, 3.4, 3.8);
  PLAYER_COLORS.forEach((c, i) => {
    const out = i === target && t > 3.4;
    pawn(ctx, xs[i], y + (out ? reveal * 20 : 0), c, { r: 36, sad: out });
    if (out) {
      mask(ctx, xs[i], y + reveal * 20, 36);
      ctx.globalAlpha = reveal;
      tag(ctx, 'Thief!', THIEF, xs[i], y + 90, 100);
      ctx.globalAlpha = 1;
    }
  });
  [0, 2, 3, 4].forEach((v, j) => {
    const k = seg(t, 0.6 + j * 0.45, 1.2 + j * 0.45);
    arrow(ctx, xs[v], y - 45, xs[target] + (j - 1.5) * 10, y - 45, { bend: 70 + Math.abs(v - target) * 20, k, color: PLAYER_COLORS[v] });
  });
  label(ctx, 'Most votes is escorted out', cx, cy - 160, seg(t, 2.6, 3.0));
  label(ctx, 'Wrong guess? Its voters skip the next vote.', cx, cy + 180, seg(t, 4.4, 4.8), '#8a93a8', 24);
}

// Two finish lines: the gem count for the Thieves, sunrise for the Guests' deadline.
function win(ctx, t, cx, cy) {
  // Guests: every thief caught.
  const lx = cx - 250;
  pawn(ctx, lx - 60, cy - 20, PLAYER_COLORS[2], { r: 40, crown: t > 1.2 });
  pawn(ctx, lx + 60, cy - 20, PLAYER_COLORS[0], { r: 40, crown: t > 1.2 });
  label(ctx, 'Guests: catch every Thief', lx, cy + 90, seg(t, 0.3, 0.7), '#3fa7ff', 28);
  // Thieves: gems or dawn.
  const rx = cx + 250;
  const got = Math.min(3, Math.floor(seg(t, 2.4, 4.4) * 4));
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.globalAlpha = i < got ? 1 : 0.25;
    gem(ctx, rx - 80 + i * 80, cy - 40, 1.3);
    ctx.restore();
  }
  label(ctx, 'Thieves: steal enough gems', rx, cy + 60, seg(t, 2.2, 2.6), THIEF, 28);
  // Dawn rises behind.
  const sun = seg(t, 4.6, 6);
  if (sun > 0) {
    ctx.save();
    ctx.globalAlpha = sun;
    circle(ctx, rx, cy + 190 - sun * 40, 30, '#ffb347');
    ctx.restore();
    label(ctx, '…or last until dawn', rx, cy + 120, sun, '#ffb347', 24);
  }
}
