// How-to-play pictures for Shed! (steps in server/games/shed.js).

import { INK, button, ease, label, lerp, phone, rrect, seg, text } from './kit.js';

const HEX = { red: '#e8484d', blue: '#2f8fe6', green: '#2fb866', yellow: '#e6a817' };
const WILD_BARS = [HEX.red, HEX.blue, HEX.green, HEX.yellow];

export default function drawRules(ctx, art, t, box) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ match, draw, specials, stack, last }[art] ?? (() => {}))(ctx, t, cx, cy);
  ctx.restore();
}

// A face like the table's: dark body, colored frame, big symbol. color null = a wild.
function card(ctx, x, y, s, labelStr, color, { rot = 0, dim = false, glow = false, small = null } = {}) {
  const w = 150 * s;
  const h = 214 * s;
  const ink = color ? HEX[color] : '#f2f4f8';
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha *= dim ? 0.4 : 1;
  if (glow) {
    ctx.shadowColor = '#ffe8a0';
    ctx.shadowBlur = 30;
  }
  rrect(ctx, -w / 2, -h / 2, w, h, 14 * s);
  ctx.fillStyle = '#141824';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 10 * s;
  ctx.strokeStyle = ink;
  ctx.stroke();
  if (!color) {
    const bw = (w - 44 * s) / 4;
    WILD_BARS.forEach((bar, i) => {
      ctx.fillStyle = bar;
      ctx.fillRect(-w / 2 + 22 * s + i * bw, h / 2 - 50 * s, bw - 4 * s, 18 * s);
    });
  }
  text(ctx, labelStr, 0, 26 * s, { size: 78 * s, weight: 900, color: ink });
  text(ctx, labelStr, -w / 2 + 24 * s, -h / 2 + 42 * s, { size: 22 * s, weight: 900, color: ink, align: 'left' });
  if (small) text(ctx, small.toUpperCase(), 0, 62 * s, { size: 15 * s, weight: 800, color: ink });
  ctx.restore();
}

function back(ctx, x, y, s, rot = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  rrect(ctx, -75 * s, -107 * s, 150 * s, 214 * s, 16 * s);
  ctx.fillStyle = '#1b2230';
  ctx.fill();
  ctx.lineWidth = 6 * s;
  ctx.strokeStyle = '#f2f4f8';
  ctx.stroke();
  text(ctx, 'SHED!', 0, 10 * s, { size: 34 * s, weight: 900, color: '#ffc93c' });
  ctx.restore();
}

// The top card is a red 7. The blue 7 and the red 2 fit; the green 4 doesn't. Blue 7 goes down.
function match(ctx, t, cx, cy) {
  const pile = { x: cx + 250, y: cy - 10 };
  card(ctx, pile.x, pile.y, 0.85, '7', 'red', { rot: -0.05 });
  label(ctx, 'Top card', pile.x, pile.y + 140, 1, '#8a93a8', 24);
  const hand = [
    ['4', 'green'],
    ['7', 'blue'],
    ['2', 'red'],
    ['★', null],
  ];
  const fits = seg(t, 1, 1.4);
  const play = ease(seg(t, 3.2, 4.1));
  hand.forEach(([l, c], i) => {
    const hx = cx - 420 + i * 120;
    const hy = cy + 20 + Math.abs(i - 1.5) * 12;
    const ok = c !== 'green';
    if (i === 1) {
      const x = lerp(hx, pile.x + 14, play);
      const y = lerp(hy, pile.y + 6, play) - Math.sin(play * Math.PI) * 110;
      card(ctx, x, y, 0.8, l, c, { rot: lerp((i - 1.5) * 0.12, 0.06, play), glow: fits > 0 && play < 1 });
    } else card(ctx, hx, hy, 0.8, l, c, { rot: (i - 1.5) * 0.12, dim: fits > 0.5 && !ok, glow: fits > 0.5 && ok });
  });
  label(ctx, 'Same color, same number, or a Wild', cx - 240, cy + 175, seg(t, 1, 1.5));
  if (t > 4.4) label(ctx, 'Now blue is on top', pile.x, pile.y - 140, seg(t, 4.4, 4.8), HEX.blue, 26);
}

// Nothing fits, so draw one. It fits! Play it, or keep it and pass.
function draw(ctx, t, cx, cy) {
  const deckAt = { x: cx - 330, y: cy - 10 };
  const pile = { x: cx + 330, y: cy - 10 };
  for (let i = 3; i >= 0; i--) back(ctx, deckAt.x + i * 4, deckAt.y - i * 4, 0.8);
  card(ctx, pile.x, pile.y, 0.8, '5', 'yellow');
  const d = ease(seg(t, 0.6, 1.5));
  const flip = seg(t, 1.5, 2.0);
  const go = ease(seg(t, 3.4, 4.2));
  const x = t < 3.4 ? lerp(deckAt.x, cx, d) : lerp(cx, pile.x + 12, go);
  const y = (t < 3.4 ? lerp(deckAt.y, cy + 10, d) : lerp(cy + 10, pile.y + 6, go)) - Math.sin((t < 3.4 ? d : go) * Math.PI) * 80;
  if (t > 0.6) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(Math.max(0.03, Math.abs(Math.cos(flip * Math.PI))), 1);
    if (flip < 0.5) back(ctx, 0, 0, 0.8);
    else card(ctx, 0, 0, 0.8, '5', 'blue', { glow: t > 2 && t < 3.4 });
    ctx.restore();
  }
  label(ctx, '1. Draw one', deckAt.x, cy + 170, seg(t, 0.3, 0.7));
  label(ctx, '2. It fits? Play it', cx, cy + 170, seg(t, 2.2, 2.6));
  label(ctx, 'If not, keep it and pass', pile.x, cy + 170, seg(t, 4.6, 5.0), '#8a93a8', 24);
}

// Skip, Reverse and Draw 2, one after another, each acting on a ring of pawns.
function specials(ctx, t, cx, cy) {
  const items = [
    ['⦸', 'red', 'Skip', 'Next player is skipped'],
    ['⇄', 'green', 'Reverse', 'Play turns around'],
    ['+2', 'blue', 'Draw 2', 'Next draws 2, is skipped'],
  ];
  items.forEach(([l, c, small, what], i) => {
    const a = seg(t, 0.4 + i * 1.6, 0.9 + i * 1.6);
    if (a <= 0) return;
    const x = cx + (i - 1) * 330;
    ctx.save();
    ctx.globalAlpha = a;
    card(ctx, x, cy - 30 + (1 - ease(a)) * 40, 0.9, l, c, { small });
    ctx.restore();
    label(ctx, what, x, cy + 150, seg(t, 0.8 + i * 1.6, 1.2 + i * 1.6), '#d5d9e4', 26);
  });
}

// +2 lands, then another +2, then a +4: the total grows and passes on.
function stack(ctx, t, cx, cy) {
  const plays = [
    ['+2', 'red', 0.4, 2],
    ['+2', 'yellow', 1.8, 4],
    ['+4', null, 3.2, 8],
  ];
  let total = 0;
  plays.forEach(([l, c, at, sum], i) => {
    const k = ease(seg(t, at, at + 0.6));
    if (k <= 0) return;
    const fromX = cx - 520 + i * 40;
    card(ctx, lerp(fromX, cx - 120 + i * 18, k), lerp(cy + 200, cy - 10 + i * 4, k), 0.85, l, c, { rot: (i - 1) * 0.12 * k });
    if (k >= 1) total = sum;
  });
  if (total) {
    const pop = 1 + 0.25 * Math.max(0, 1 - (t - plays.find((p) => p[3] === total)[2] - 0.6) * 3);
    ctx.save();
    ctx.translate(cx + 260, cy - 10);
    ctx.scale(pop, pop);
    text(ctx, `+${total}`, 0, 30, { size: 110, weight: 900, color: total >= 8 ? '#ff6b5e' : '#ffc93c' });
    ctx.restore();
    label(ctx, 'and growing…', cx + 260, cy + 80, 1, '#8a93a8', 24);
  }
  label(ctx, '+2 or +4 on a +2 · +4 on a +4', cx - 100, cy + 175, seg(t, 4.2, 4.6));
}

// One card left: the phone's "Last card!" button pulses and gets tapped.
function last(ctx, t, cx, cy) {
  const tap = t > 2.2;
  phone(ctx, cx - 220, cy, 1.15, (g, w, h) => {
    text(g, 'Your hand', w / 2, 36, { size: 18, weight: 800, color: '#8a93a8' });
    card(g, w / 2, 120, 0.55, '9', 'green');
    const pulse = tap ? 0 : 0.5 + 0.5 * Math.sin(t * 6);
    button(g, tap ? 'Said it!' : 'Last card!', w / 2, h - 50, w - 30, 46, { color: tap ? '#4cd97b' : '#ffc93c', glow: pulse });
  });
  // A finger taps the button.
  const f = ease(seg(t, 1.4, 2.2));
  ctx.save();
  ctx.globalAlpha = seg(t, 1.2, 1.5) * (1 - seg(t, 3, 3.4));
  ctx.fillStyle = '#f0c8a0';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(lerp(cx - 90, cx - 210, f), lerp(cy + 220, cy + 130, f), 22, 30, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  label(ctx, 'Tap it in time…', cx + 230, cy - 40, seg(t, 0.4, 0.8), '#ffc93c', 32);
  label(ctx, '…or anyone can catch you:', cx + 230, cy + 20, seg(t, 3.4, 3.8), '#d5d9e4', 26);
  label(ctx, 'draw 2', cx + 230, cy + 70, seg(t, 3.8, 4.2), '#ff6b5e', 40);
}
