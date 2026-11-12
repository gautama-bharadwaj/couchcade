// Shed! TV: the table. Discard pile in the middle, players around the edge with
// their card counts, whose turn it is, and a short log. Hands stay on the phones.

import { circle, text } from './util.js';

let lastSeq = 0;
let flipAt = 0;

export default {
  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const active = s.colors.find((c) => c.id === s.color);

    // Felt table, tinted with the active color.
    ctx.fillStyle = '#0d1410';
    ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(W / 2, H / 2 - 20, 60, W / 2, H / 2 - 20, 620);
    g.addColorStop(0, (active?.hex ?? '#2a3142') + '55');
    g.addColorStop(1, '#0d141000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    text(ctx, 'Shed!', 80, 92, { size: 46, weight: 900, align: 'left', color: '#f2f4f8' });

    // Direction ring
    const cx = W / 2;
    const cy = H / 2 - 30;
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, 200, 0, Math.PI * 2);
    ctx.stroke();
    const spin = (now / 1500) * s.dir;
    for (let i = 0; i < 3; i++) arrow(ctx, cx, cy, 200, spin + (i * Math.PI * 2) / 3, s.dir);

    // Draw pile and discard
    if (s.lastPlayed && s.lastPlayed.seq !== lastSeq) {
      lastSeq = s.lastPlayed.seq;
      flipAt = now;
    }
    const pop = Math.max(0, 1 - (now - flipAt) / 250);
    cardBack(ctx, cx - 150, cy, s.drawPile);
    card(ctx, s.top, s.colors, cx + 70, cy, 1 + pop * 0.15, s.color);
    if (active) text(ctx, active.label, cx + 70, cy + 140, { size: 26, weight: 800, color: active.hex });
    if (s.pending) {
      circle(ctx, cx + 160, cy - 110, 46 + 3 * Math.sin(now / 150), '#ff5a5f');
      text(ctx, `+${s.pending}`, cx + 160, cy - 96, { size: 38, weight: 900, color: '#fff' });
    }

    // Players in a row along the bottom, in turn order.
    const n = s.players.length;
    const slot = Math.min(180, (W - 160) / n);
    const x0 = W / 2 - (slot * (n - 1)) / 2;
    s.players.forEach((p, i) => seat(ctx, p, x0 + i * slot, H - 130, s.turn === p.id, s.winner === p.id, now));

    // Turn banner + timer
    const turnP = s.players.find((p) => p.id === s.turn);
    if (s.winner) {
      const w = s.players.find((p) => p.id === s.winner);
      text(ctx, `${w?.name} wins!`, W / 2, 200, { size: 64, weight: 900, color: '#ffc93c' });
    } else if (turnP) {
      text(ctx, s.choosing ? `${turnP.name} is picking a color…` : `${turnP.name}'s turn`, W / 2, 190, { size: 44, weight: 900, color: turnP.color });
      text(ctx, `${s.left}s`, W - 100, 92, { size: 38, weight: 900, align: 'right', color: s.left <= 5 ? '#ff8c8c' : '#8a93a8' });
    }

    // Log under the title, newest first.
    [...s.log].reverse().forEach((line, i) => {
      text(ctx, line, 80, 150 + i * 32, { size: i === 0 ? 24 : 20, weight: i === 0 ? 700 : 500, align: 'left', color: i === 0 ? '#f2f4f8' : '#6b7488' });
    });
  },
};

function seat(ctx, p, x, y, isTurn, isWinner, now) {
  ctx.globalAlpha = p.connected ? 1 : 0.5;
  if (isTurn) circle(ctx, x, y, 48 + 4 * Math.sin(now / 200), p.color + '55');
  circle(ctx, x, y, 34, p.color);
  text(ctx, String(p.cards), x, y + 11, { size: 30, weight: 900, color: '#0d0f14' });
  text(ctx, p.name, x, y + 66, { size: 24, weight: isTurn ? 900 : 600, color: isWinner ? '#ffc93c' : '#f2f4f8' });
  if (p.cards === 1) text(ctx, p.called ? 'Last card!' : 'one card…', x, y - 50, { size: 20, weight: 800, color: p.called ? '#ffc93c' : '#ff8c8c' });
  ctx.globalAlpha = 1;
}

// Card face: dark body, colored frame, big centered symbol and corner indexes.
// Wilds show four color bars along the bottom and take the chosen color as their frame.
const WILD_BARS = ['#e8484d', '#2f8fe6', '#2fb866', '#e6a817'];
function card(ctx, c, colors, x, y, scale, activeColor) {
  const w = 150 * scale;
  const h = 214 * scale;
  const hex = (id) => colors.find((k) => k.id === id)?.hex;
  const ink = c.color ? hex(c.color) : '#f2f4f8';
  const frame = c.color ? ink : activeColor ? hex(activeColor) : '#f2f4f8';
  ctx.save();
  ctx.translate(x, y);
  roundRect(ctx, -w / 2, -h / 2, w, h, 14 * scale);
  ctx.fillStyle = '#141824';
  ctx.fill();
  ctx.lineWidth = 10 * scale;
  ctx.strokeStyle = frame;
  ctx.stroke();
  // inner hairline
  roundRect(ctx, -w / 2 + 14 * scale, -h / 2 + 14 * scale, w - 28 * scale, h - 28 * scale, 8 * scale);
  ctx.lineWidth = 2 * scale;
  ctx.strokeStyle = frame + '66';
  ctx.stroke();
  if (!c.color) {
    const bw = (w - 44 * scale) / 4;
    WILD_BARS.forEach((bar, i) => {
      ctx.fillStyle = bar;
      ctx.fillRect(-w / 2 + 22 * scale + i * bw, h / 2 - 50 * scale, bw - 4 * scale, 18 * scale);
    });
  }
  text(ctx, c.label, 0, 26 * scale, { size: 78 * scale, weight: 900, color: ink });
  text(ctx, c.label, -w / 2 + 24 * scale, -h / 2 + 42 * scale, { size: 22 * scale, weight: 900, color: ink, align: 'left' });
  ctx.save();
  ctx.rotate(Math.PI);
  text(ctx, c.label, -w / 2 + 24 * scale, -h / 2 + 42 * scale, { size: 22 * scale, weight: 900, color: ink, align: 'left' });
  ctx.restore();
  if (c.small && c.color) text(ctx, c.small.toUpperCase(), 0, 62 * scale, { size: 15 * scale, weight: 800, color: ink });
  if (c.small && !c.color) text(ctx, c.label === '+4' ? 'WILD DRAW 4' : 'WILD', 0, 62 * scale, { size: 15 * scale, weight: 800, color: ink });
  ctx.restore();
}

function cardBack(ctx, x, y, count) {
  for (let i = Math.min(4, Math.ceil(count / 20)); i >= 0; i--) {
    roundRect(ctx, x - 75 + i * 3, y - 107 - i * 3, 150, 214, 16);
    ctx.fillStyle = '#1b2230';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#f2f4f8';
    ctx.stroke();
  }
  text(ctx, 'SHED!', x, y + 10, { size: 34, weight: 900, color: '#ffc93c' });
  text(ctx, `${count} left`, x, y + 140, { size: 22, color: '#8a93a8' });
}

function arrow(ctx, cx, cy, r, a, dir) {
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a) * r;
  const t = a + (Math.PI / 2) * dir; // tangent
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t);
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -12);
  ctx.lineTo(-10, 12);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fill();
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
