// Shed! TV: the card table. The draw pile and a messy discard pile in the middle with the
// direction of play circling them, everyone's hand as a fan of card backs along the bottom, whose
// turn it is (and the clock) top left, and the latest happenings on the right. Hands stay on the
// phones. Rules are in server/games/shed.js; the cards are drawn by public/art/shed.js.
//
// Things that happen get a little show: played cards fly from the player's seat onto the pile,
// drawn cards fly from the deck, a Skip stamps the skipped seat, a Reverse whirls the ring,
// Draw stacks grow a burning "+N" badge and land with a thud, and the winner gets confetti.

import { drawBack, drawFace, drawSymbol, pinwheel } from '../../art/shed.js';
import { CREAM, INK, SERIF, clamp01, darken, ease, easeBack, lighten, outlined, particles, ribbon, rng, roundRect, star } from '../../art/cards.js';

const CW = 156; // card size on the table
const CH = 222;
const DECK = { x: 600, y: 410 };
const PILE = { x: 860, y: 410 };
const RING = { x: 730, y: 410, rx: 360, ry: 205 };
const SEAT_Y = 790;
const PANEL = { x: 1200, y: 40, w: 340, h: 600 };

// ---- Effects state (TV-local) -------------------------------------------------------
const fx = particles();
let pile = []; // the discard pile as drawn: { card, chosen, rot, dx, dy }
let flights = []; // { card?, chosen?, from, to, at, dur, spin, onLand? }
let stamps = []; // { kind, x, y, at, color }
let bubbles = new Map(); // player id -> when they called "Last card!"
let banner = null; // { text, sub, color, at, dur }
let lastSeq = -1;
let lastNow = 0;
let shakeUntil = 0;
let shakeMag = 0;
let spinBoostAt = -1e9;
let stackBumpAt = -1e9;
let winAt = -1e9;
let feltCache = null;
let seen = null; // the last snapshot shown, to compare the next one with

const rnd = (a, b) => a + Math.random() * (b - a);
const hexOf = (s, id) => s.colors.find((c) => c.id === id)?.hex ?? null;

function seatPos(s, id) {
  const n = s.players.length;
  const slot = Math.min(180, 1420 / n);
  const i = s.players.findIndex((p) => p.id === id);
  return { x: 760 - (slot * (n - 1)) / 2 + i * slot, y: SEAT_Y };
}

function pushPile(card, chosen) {
  let h = 7;
  for (const ch of String(card.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = rng(h * 2654435761);
  r();
  pile.push({ card, chosen, rot: (r() - 0.5) * 0.5, dx: (r() - 0.5) * 26, dy: (r() - 0.5) * 18 });
  if (pile.length > 7) pile.shift();
}

function say(text, color, sub, dur = 1900) {
  banner = { text, sub, color, at: performance.now(), dur };
}

// What changed between snapshots, as shows on the table.
function onChange(prev, s, now) {
  const prevById = new Map(prev.players.map((p) => [p.id, p]));
  const played = s.lastPlayed && s.lastPlayed.seq !== prev.lastPlayed?.seq ? s.lastPlayed : null;
  if (played) {
    const from = seatPos(s, played.by);
    const card = played.card;
    const wild = !card.color;
    const chosen = wild ? hexOf(s, s.color) : null;
    const ink = hexOf(s, card.color) ?? chosen ?? CREAM;
    flights.push({
      card, chosen, from: { x: from.x, y: from.y - 70 }, to: PILE, at: now, dur: 420, spin: rnd(-1, 1) * 3,
      onLand: () => {
        pushPile(card, chosen);
        fx.burst(PILE.x, PILE.y, 22, { colors: [ink, lighten(ink, 0.4), CREAM], speed: [120, 420], life: [0.4, 0.8], size: [3, 7], gravity: 400 });
        if (wild) {
          fx.burst(PILE.x, PILE.y, 46, { colors: [chosen ?? CREAM, lighten(chosen ?? CREAM, 0.3)], kind: 'drop', speed: [200, 700], life: [0.5, 1], size: [6, 12], gravity: 900 });
          spinBoostAt = now + 420;
        }
        if (card.kind === 'draw2' || card.kind === 'wild4') {
          stackBumpAt = performance.now();
          stamps.push({ kind: card.kind, x: PILE.x, y: PILE.y, at: performance.now(), color: ink });
        }
      },
    });
    if (card.kind === 'reverse') spinBoostAt = now + 300;
    if (card.kind === 'skip' || (card.kind === 'reverse' && s.players.length === 2)) {
      // The player after the one who played lost their turn.
      const i = s.players.findIndex((p) => p.id === played.by);
      const n = s.players.length;
      const skipped = s.players[(((i + s.dir) % n) + n) % n];
      if (skipped) {
        const at = seatPos(s, skipped.id);
        stamps.push({ kind: 'skip', x: at.x, y: at.y - 40, at: now + 380, color: ink });
      }
    }
  }

  // Cards drawn: backs fly from the deck to whoever drew.
  for (const p of s.players) {
    const before = prevById.get(p.id)?.cards ?? p.cards;
    const gained = p.cards - before;
    if (gained <= 0) continue;
    const to = seatPos(s, p.id);
    for (let k = 0; k < Math.min(gained, 12); k++) flights.push({ from: DECK, to: { x: to.x + rnd(-20, 20), y: to.y - 80 }, at: now + k * 90, dur: 460, spin: rnd(-1, 1) * 2 });
    if (gained >= 4) {
      shakeUntil = now + 500 + gained * 60;
      shakeMag = Math.min(24, 6 + gained * 2);
      say(`${p.name} takes ${gained}!`, '#e8484d', gained >= 8 ? 'Brutal.' : null);
      setTimeout(() => fx.burst(to.x, to.y - 60, 30, { colors: ['#ff6b5e', '#ffd23f', CREAM], speed: [150, 500], life: [0.4, 0.9], gravity: 500 }), 400);
    }
  }

  // "Last card!" calls and catches.
  for (const p of s.players) if (p.called && !prevById.get(p.id)?.called) bubbles.set(p.id, now);
  const line = s.log.at(-1) !== prev.log.at(-1) ? s.log.at(-1) : null;
  if (line?.includes(' caught ')) say('Caught!', '#ff9f1c', line.split(' caught ')[1]?.replace(/, who draws (\d+)/, ' draws $1'));

  if (s.pending > (prev.pending ?? 0) && s.pending >= 4) stackBumpAt = now + 420;

  if (s.winner && !prev.winner) {
    winAt = now + 500;
    const at = seatPos(s, s.winner);
    for (let k = 0; k < 4; k++) fx.burst(at.x, at.y - 40, 50, { colors: ['#e8484d', '#2f8fe6', '#2fb866', '#e6a817', CREAM], kind: 'confetti', speed: [250, 800], angle: -Math.PI / 2, spread: 1.6, life: [1.4, 2.6], size: [5, 9], gravity: 500, drag: 0.94, delay: 0.5 + k * 0.25 });
  }
}

export default {
  // Sounds and narration for state changes (see public/tv/audio.js).
  onSnapshot(prev, s, audio) {
    const { sfx, say: speak, pick } = audio;
    if (!prev) {
      sfx.shuffle(6);
      speak(pick(['Shuffle up and deal!', "Cards are dealt. Let's shed!", 'Seven cards each. First to empty their hand wins.']), { delay: 0.8 });
      return;
    }
    const byId = new Map(s.players.map((p) => [p.id, p]));
    const prevById = new Map(prev.players.map((p) => [p.id, p]));

    // A card was played.
    const played = s.lastPlayed && s.lastPlayed.seq !== prev.lastPlayed?.seq ? s.lastPlayed.card : null;
    if (played) {
      sfx.swish();
      if (played.kind === 'skip') setTimeout(sfx.buzz, 120);
      if (played.kind === 'reverse') setTimeout(sfx.whoosh, 120);
      if (played.kind === 'wild') setTimeout(sfx.chime, 120);
      if (played.kind === 'draw2' || played.kind === 'wild4') {
        setTimeout(() => sfx.danger(s.pending / 2), 120);
        if (s.pending >= 6 && s.pending > (prev.pending ?? 0)) speak(s.pending >= 10 ? `Plus ${s.pending}! This is getting ugly.` : `The stack is at ${s.pending}!`, { interrupt: true });
      }
    }

    // Cards drawn (anyone's hand grew without a play); a big stack landing gets a thud.
    let drawn = 0;
    for (const p of s.players) drawn += Math.max(0, p.cards - (prevById.get(p.id)?.cards ?? p.cards));
    if (drawn) {
      sfx.shuffle(drawn);
      if (drawn >= 4) {
        sfx.thud(Math.min(1, drawn / 8));
        const victim = s.players.find((p) => p.cards - (prevById.get(p.id)?.cards ?? 0) === drawn);
        if (victim && !s.log.at(-1)?.includes('caught')) speak(`${victim.name} takes ${drawn}. Ouch.`);
      }
    }

    // "Last card!" calls and catches.
    for (const p of s.players) {
      if (p.called && !prevById.get(p.id)?.called) {
        sfx.beep(true);
        speak(`${p.name}: last card!`, { rate: 1.1, pitch: 1.1 });
      }
    }
    const newLine = s.log.at(-1) !== prev.log.at(-1) ? s.log.at(-1) : null;
    if (newLine?.includes(' caught ')) {
      sfx.alarm();
      speak(`Caught! ${newLine.split(' caught ')[1].replace(/, who draws (\d+)/, ' draws $1')}.`, { interrupt: true });
    }

    // Turn changes and the clock.
    if (s.turn && s.turn !== prev.turn) sfx.click();
    if (s.turn && s.left !== prev.left && s.left <= 5 && s.left > 0) sfx.tick();
    if (s.dir !== prev.dir && !played) sfx.whoosh();

    if (s.winner && !prev.winner) {
      sfx.fanfare();
      speak(`${byId.get(s.winner)?.name ?? 'Someone'} is out of cards and wins!`, { interrupt: true, delay: 0.4 });
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
    lastNow = now;

    // Catch up with the game: a new game resets the table, then each snapshot's changes play out.
    const seq = s.lastPlayed?.seq ?? 0;
    if (lastSeq < 0 || seq < lastSeq || !pile.length) {
      pile = [];
      flights = [];
      stamps = [];
      bubbles = new Map();
      banner = null;
      fx.clear();
      if (s.top) pushPile(s.top, !s.top.color ? hexOf(s, s.color) : null);
      winAt = s.winner ? now : -1e9;
    } else if (seen && seen !== s) onChange(seen, s, now);
    seen = s;
    lastSeq = seq;

    ctx.save();
    if (now < shakeUntil) {
      const k = (shakeUntil - now) / 700;
      ctx.translate(rnd(-1, 1) * shakeMag * Math.min(1, k), rnd(-1, 1) * shakeMag * Math.min(1, k));
    }
    felt(ctx, W, H, hexOf(s, s.color), now);
    directionRing(ctx, s, now);
    deck(ctx, s, now);
    discard(ctx, s, now);
    activeColor(ctx, s, now);
    stack(ctx, s, now);
    s.players.forEach((p) => seat(ctx, s, p, seatPos(s, p.id), now));
    drawStamps(ctx, now);
    drawFlights(ctx, s, now);
    turnPanel(ctx, s, now);
    sidePanel(ctx, s, now);
    fx.draw(ctx, dt);
    drawBanner(ctx, W, now);
    if (s.winner) winner(ctx, s, W, now);
    ctx.restore();
  },
};

// ---- The table ----------------------------------------------------------------------------------

function felt(ctx, W, H, hex, now) {
  if (!feltCache) {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(W * 0.45, H * 0.45, 80, W * 0.45, H * 0.45, W * 0.75);
    grd.addColorStop(0, '#2a7d59');
    grd.addColorStop(0.6, '#1a5c41');
    grd.addColorStop(1, '#0b2a1e');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const R = rng(7);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${0.04 + R() * 0.05})` : `rgba(255,255,255,${0.02 + R() * 0.03})`;
      g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2);
    }
    // A stitched border, like a card mat.
    g.strokeStyle = 'rgba(246,236,210,.18)';
    g.lineWidth = 3;
    g.setLineDash([14, 10]);
    roundRect(g, 26, 26, W - 52, H - 52, 40);
    g.stroke();
    g.setLineDash([]);
    feltCache = c;
  }
  ctx.drawImage(feltCache, -30, -30, W + 60, H + 60);
  // The active colour glows under the pile.
  if (hex) {
    const grd = ctx.createRadialGradient(PILE.x, PILE.y, 40, PILE.x, PILE.y, 420);
    grd.addColorStop(0, hex + '66');
    grd.addColorStop(1, hex + '00');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
  }
}

function directionRing(ctx, s, now) {
  const { x, y, rx, ry } = RING;
  const boost = Math.max(0, 1 - (now - spinBoostAt) / 1200);
  const base = (now / 2600) * s.dir;
  const phase = base + s.dir * ease(1 - boost) * Math.PI * 2 * (boost > 0 ? 1 : 0);
  ctx.save();
  ctx.strokeStyle = `rgba(246,236,210,${0.16 + boost * 0.4})`;
  ctx.lineWidth = 5 + boost * 4;
  ctx.setLineDash([2, 18]);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    const a = phase + (i * Math.PI) / 2;
    const px = x + Math.cos(a) * rx;
    const py = y + Math.sin(a) * ry;
    const tx = -Math.sin(a) * rx * s.dir;
    const ty = Math.cos(a) * ry * s.dir;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(ty, tx));
    ctx.globalAlpha = 0.45 + boost * 0.55;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -14);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function deck(ctx, s, now) {
  const layers = Math.min(6, Math.ceil(s.drawPile / 15));
  for (let i = layers; i >= 0; i--) drawBack(ctx, DECK.x + i * 2.5, DECK.y - i * 2.5, CW, CH, { shadow: i === layers });
  // Breathes a little when it's someone's turn to draw.
  outlined(ctx, `${s.drawPile} left`, DECK.x, DECK.y + CH / 2 + 34, { size: 24, color: '#cfe8da', stroke: 'rgba(0,0,0,.5)', weight: 800 });
  void now;
}

function discard(ctx, s, now) {
  pile.forEach((p, i) => {
    const top = i === pile.length - 1;
    const t = (now % 4000) / 4000;
    drawFace(ctx, p.card, hexOf(s, p.card.color), PILE.x + p.dx, PILE.y + p.dy, CW, CH, {
      rot: p.rot, chosen: p.chosen, t: top && !p.card.color ? t * Math.PI * 2 * 0.25 : 0, shadow: true,
    });
  });
}

function activeColor(ctx, s, now) {
  const c = s.colors.find((k) => k.id === s.color);
  if (!c) return;
  const y = PILE.y + CH / 2 + 34;
  ctx.save();
  ctx.fillStyle = darken(c.hex, 0.35);
  roundRect(ctx, PILE.x - 70, y - 20, 140, 40, 20);
  ctx.fill();
  ctx.strokeStyle = c.hex;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
  outlined(ctx, c.label.toUpperCase(), PILE.x, y + 1, { size: 22, color: lighten(c.hex, 0.35), stroke: INK, weight: 900 });
  void now;
}

// A burning "+N" badge while a Draw stack waits for someone.
function stack(ctx, s, now) {
  if (!s.pending) return;
  const x = PILE.x + 128;
  const y = PILE.y - 140;
  const bump = Math.max(0, 1 - (now - stackBumpAt) / 500);
  const k = 1 + 0.35 * easeBack(bump > 0 ? 1 - bump : 1) * bump + 0.04 * Math.sin(now / 130);
  const heat = Math.min(1, s.pending / 12);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  // Flames behind.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + now / 600;
    const r = 64 + 10 * Math.sin(now / 90 + i * 2) + heat * 18;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a - 0.25) * 40, Math.sin(a - 0.25) * 40);
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    ctx.lineTo(Math.cos(a + 0.25) * 40, Math.sin(a + 0.25) * 40);
    ctx.fillStyle = i % 2 ? '#ffd23f' : '#ff7a2f';
    ctx.fill();
  }
  star(ctx, 0, 0, 58, '#e8484d', 0.78);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fillStyle = darken('#e8484d', 0.25);
  ctx.fill();
  outlined(ctx, `+${s.pending}`, 0, 2, { size: s.pending >= 10 ? 40 : 48, color: CREAM, stroke: INK, weight: 900 });
  ctx.restore();
  if (Math.random() < 0.3 + heat * 0.5) fx.burst(x + rnd(-30, 30), y - 40, 1, { colors: ['#ffd23f', '#ff9f1c'], speed: [30, 90], angle: -Math.PI / 2, spread: 0.8, gravity: -120, life: [0.4, 0.9], size: [2, 4] });
}

// Each player: a fan of card backs (their hand) over a round crest with their initial.
function seat(ctx, s, p, { x, y }, now) {
  const isTurn = s.turn === p.id;
  const won = s.winner === p.id;
  const bob = isTurn ? -Math.abs(Math.sin(now / 260)) * 10 : 0;
  ctx.save();
  ctx.globalAlpha = p.connected ? 1 : 0.5;
  if (s.winner && !won) ctx.globalAlpha *= 0.6;
  if (isTurn || won) {
    const grd = ctx.createRadialGradient(x, y - 30, 10, x, y - 30, 120);
    grd.addColorStop(0, p.color + '99');
    grd.addColorStop(1, p.color + '00');
    ctx.fillStyle = grd;
    ctx.fillRect(x - 130, y - 160, 260, 260);
  }
  // The hand.
  const n = Math.min(p.cards, 12);
  const spread = Math.min(0.12, 1.1 / Math.max(1, n));
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * spread;
    ctx.save();
    ctx.translate(x, y - 10 + bob);
    ctx.rotate(a);
    drawBack(ctx, 0, -70, 40, 57, { shadow: i === 0 });
    ctx.restore();
  }
  // The crest.
  const cy = y + bob;
  ctx.beginPath();
  ctx.arc(x, cy, 30, 0, Math.PI * 2);
  const grd = ctx.createRadialGradient(x - 10, cy - 12, 4, x, cy, 32);
  grd.addColorStop(0, lighten(p.color, 0.3));
  grd.addColorStop(1, darken(p.color, 0.2));
  ctx.fillStyle = grd;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = CREAM;
  ctx.stroke();
  outlined(ctx, String(p.cards), x, cy + 2, { size: 28, color: CREAM, stroke: INK, weight: 900 });
  outlined(ctx, p.name, x, y + 52, { size: 22, color: won ? '#ffd23f' : isTurn ? '#ffffff' : '#e3efe8', stroke: 'rgba(0,0,0,.6)', weight: isTurn ? 900 : 700 });
  if (won) {
    // A little crown.
    ctx.save();
    ctx.translate(x, cy - 44);
    ctx.beginPath();
    ctx.moveTo(-20, 8);
    ctx.lineTo(-22, -12);
    ctx.lineTo(-10, -2);
    ctx.lineTo(0, -16);
    ctx.lineTo(10, -2);
    ctx.lineTo(22, -12);
    ctx.lineTo(20, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Down to one card: a speech bubble (gold if they called it, a worried red if not).
  if (p.cards === 1 && !s.winner) {
    const since = bubbles.get(p.id);
    const pop = since ? easeBack(clamp01((now - since) / 300)) : 1;
    bubble(ctx, x + 46, y - 150, p.called ? 'Last card!' : 'one card…', p.called ? '#ffd23f' : '#ff8c8c', pop);
  }
}

function bubble(ctx, x, y, str, color, k) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.font = `900 20px system-ui, -apple-system, sans-serif`;
  const w = ctx.measureText(str).width + 26;
  ctx.fillStyle = CREAM;
  roundRect(ctx, -w / 2, -20, w, 40, 14);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 14, 16);
  ctx.lineTo(-w / 2 + 4, 32);
  ctx.lineTo(-w / 2 + 28, 18);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  roundRect(ctx, -w / 2, -20, w, 40, 14);
  ctx.stroke();
  ctx.fillStyle = darken(color, 0.45);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, 0, 1);
  ctx.restore();
}

// Top left: whose turn, and the clock as a bar that drains.
function turnPanel(ctx, s, now) {
  const x = 70;
  const y = 40;
  const w = 600;
  const h = 72;
  ctx.save();
  ctx.fillStyle = 'rgba(8,20,15,.72)';
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();
  const p = s.players.find((q) => q.id === s.turn);
  if (p) {
    ctx.beginPath();
    ctx.arc(x + 40, y + h / 2, 18, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = CREAM;
    ctx.lineWidth = 3;
    ctx.stroke();
    const msg = s.choosing ? `${p.name} is picking a colour…` : s.pending ? `${p.name}: stack it or draw ${s.pending}` : `${p.name}'s turn`;
    outlined(ctx, msg, x + 72, y + h / 2 + 1, { size: 32, color: '#ffffff', stroke: 'rgba(0,0,0,.4)', align: 'left', weight: 900 });
    const frac = clamp01(s.left / 30);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    roundRect(ctx, x + 18, y + h - 10, w - 36, 5, 3);
    ctx.fill();
    ctx.fillStyle = s.left <= 5 ? (Math.floor(now / 250) % 2 ? '#ff6b5e' : '#ffd23f') : p.color;
    roundRect(ctx, x + 18, y + h - 10, (w - 36) * frac, 5, 3);
    ctx.fill();
    outlined(ctx, `${Math.max(0, s.left)}`, x + w - 24, y + h / 2 + 1, { size: 30, color: s.left <= 5 ? '#ff8c8c' : '#cfe8da', stroke: 'rgba(0,0,0,.4)', align: 'right', weight: 900 });
  } else if (s.winner) {
    outlined(ctx, 'Game over', x + 30, y + h / 2 + 1, { size: 32, color: '#ffd23f', stroke: 'rgba(0,0,0,.4)', align: 'left' });
  }
  ctx.restore();
}

// Right: the title and what just happened.
function sidePanel(ctx, s, now) {
  const { x, y, w } = PANEL;
  const lines = [...s.log].reverse().slice(0, 6);
  ctx.save();
  ctx.fillStyle = 'rgba(8,20,15,.72)';
  roundRect(ctx, x, y, w, 140 + Math.max(1, lines.length) * 36, 22);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x + 30, y + 52);
  ctx.rotate(-0.04);
  outlined(ctx, 'SHED!', 0, 0, { size: 50, color: '#f2c14e', stroke: INK, font: SERIF, align: 'left', line: 7 });
  ctx.restore();
  pinwheel(ctx, x + w - 46, y + 50, 24, now / 1400);
  outlined(ctx, 'empty your hand first', x + 32, y + 96, { size: 18, color: '#9fc4b2', stroke: 'rgba(0,0,0,0)', align: 'left', weight: 700, line: 0 });
  lines.forEach((line, i) => {
    ctx.save();
    ctx.font = `${i === 0 ? 800 : 600} ${i === 0 ? 21 : 18}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = i === 0 ? '#ffffff' : '#9fc4b2';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    let str = line;
    while (ctx.measureText(str).width > w - 60 && str.length > 4) str = str.slice(0, -2);
    ctx.fillText(str === line ? str : `${str.trimEnd()}…`, x + 32, y + 146 + i * 36);
    ctx.restore();
  });
}

// ---- Shows ------------------------------------------------------------------------------------

function drawFlights(ctx, s, now) {
  const done = [];
  for (const f of flights) {
    const t = (now - f.at) / f.dur;
    if (t < 0) continue;
    if (t >= 1) {
      done.push(f);
      continue;
    }
    const e = ease(t);
    const x = f.from.x + (f.to.x - f.from.x) * e;
    const y = f.from.y + (f.to.y - f.from.y) * e - Math.sin(t * Math.PI) * 120;
    const rot = (1 - e) * f.spin;
    if (f.card) {
      const k = 0.55 + 0.45 * e;
      drawFace(ctx, f.card, hexOf(s, f.card.color), x, y, CW * k, CH * k, { rot, chosen: f.chosen });
    } else {
      const k = 1 - 0.7 * e;
      drawBack(ctx, x, y, CW * k, CH * k, { rot });
    }
  }
  for (const f of done) f.onLand?.();
  flights = flights.filter((f) => !done.includes(f));
}

// Big symbols that slam down and fade: a Skip over the skipped seat, a +2 / +4 by the pile.
function drawStamps(ctx, now) {
  stamps = stamps.filter((st) => now - st.at < 1500);
  for (const st of stamps) {
    const t = (now - st.at) / 1500;
    if (t < 0) continue;
    const k = t < 0.15 ? 2.2 - 1.2 * easeBack(t / 0.15) : 1;
    ctx.save();
    ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
    ctx.translate(st.x, st.y);
    ctx.rotate(-0.15);
    ctx.scale(k, k);
    ctx.beginPath();
    ctx.arc(0, 0, 56, 0, Math.PI * 2);
    ctx.fillStyle = CREAM;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 46, 0, Math.PI * 2);
    ctx.fillStyle = st.color;
    ctx.fill();
    drawSymbol(ctx, st.kind, null, 0, 0, 80, CREAM);
    ctx.restore();
    if (t < 0.16 && t > 0.1 && !st.dusted) {
      st.dusted = true;
      fx.burst(st.x, st.y + 30, 16, { colors: [CREAM], kind: 'smoke', speed: [60, 200], gravity: -30, size: [8, 16], life: [0.4, 0.8] });
    }
  }
}

function drawBanner(ctx, W, now) {
  if (!banner) return;
  const t = (now - banner.at) / banner.dur;
  if (t >= 1) return void (banner = null);
  const pop = easeBack(clamp01((now - banner.at) / 260));
  ctx.save();
  ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 1;
  ctx.translate(730, 160);
  ctx.scale(pop, pop);
  ctx.font = `900 54px ${SERIF}`;
  const w = Math.max(360, ctx.measureText(banner.text).width + 90);
  ribbon(ctx, 0, 0, w, 84, banner.color);
  outlined(ctx, banner.text, 0, 2, { size: 54, color: CREAM, stroke: INK, font: SERIF, line: 8 });
  if (banner.sub) outlined(ctx, banner.sub, 0, 74, { size: 26, color: '#ffffff', stroke: INK, weight: 800, line: 6 });
  ctx.restore();
  void W;
}

function winner(ctx, s, W, now) {
  const p = s.players.find((q) => q.id === s.winner);
  if (!p || now < winAt) return;
  const t = (now - winAt) / 1000;
  const k = easeBack(clamp01(t / 0.4));
  if (Math.random() < 0.3) fx.burst(rnd(100, 1500), -20, 6, { colors: ['#e8484d', '#2f8fe6', '#2fb866', '#e6a817', CREAM], kind: 'confetti', speed: [40, 160], angle: Math.PI / 2, spread: 1, life: [2.5, 4], size: [5, 9], gravity: 120, drag: 0.97 });
  ctx.save();
  ctx.translate(730, 175);
  ctx.scale(k, k);
  ctx.font = `900 64px ${SERIF}`;
  const w = Math.max(460, ctx.measureText(`${p.name} wins!`).width + 120);
  ribbon(ctx, 0, 0, w, 100, '#b07a12');
  outlined(ctx, `${p.name} wins!`, 0, 3, { size: 64, color: CREAM, stroke: INK, font: SERIF, line: 9 });
  outlined(ctx, 'Out of cards!', 0, 88, { size: 28, color: '#ffffff', stroke: INK, weight: 800, line: 6 });
  ctx.restore();
  void W;
}
