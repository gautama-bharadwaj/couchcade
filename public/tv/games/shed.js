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

function card(ctx, c, colors, x, y, scale, activeColor) {
  const w = 150 * scale;
  const h = 214 * scale;
  ctx.save();
  ctx.translate(x, y);
  roundRect(ctx, -w / 2, -h / 2, w, h, 16 * scale);
  if (c.color) ctx.fillStyle = colors.find((k) => k.id === c.color).hex;
  else {
    // Wilds: four quarters, with the chosen color as a ring.
    const q = ctx.createConicGradient(0, 0, 0);
    ['#e8484d', '#2f8fe6', '#2fb866', '#e6a817'].forEach((hex, i) => {
      q.addColorStop(i / 4, hex);
      q.addColorStop((i + 1) / 4 - 0.0001, hex);
    });
    ctx.fillStyle = q;
  }
  ctx.fill();
  ctx.lineWidth = 8 * scale;
  ctx.strokeStyle = !c.color && activeColor ? colors.find((k) => k.id === activeColor).hex : '#fff';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, w * 0.36, h * 0.38, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,.92)';
  ctx.fill();
  text(ctx, c.label, 0, 22 * scale, { size: 72 * scale, weight: 900, color: c.color ? colors.find((k) => k.id === c.color).hex : '#222' });
  if (c.small) text(ctx, c.small.toUpperCase(), 0, h / 2 - 16 * scale, { size: 16 * scale, weight: 800, color: '#fff' });
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
