// Fuse TV: the workshop. The crate (draw pile) and the odds in the middle, the last card played,
// a burning fuse as the turn timer, and everyone's bomb-buddy along the bottom.
// Hands and peeks stay on the phones. Rules are in server/games/fuse.js.

import { circle, text } from './util.js';

const CARD = {
  bomb: { name: 'Bomb', color: '#ff4d3d' },
  decoy: { name: 'Decoy', color: '#ff4d3d' },
  bucket: { name: 'Bucket', color: '#38b6ff' },
  scope: { name: 'Periscope', color: '#a77bff' },
  nudge: { name: 'Nudge', color: '#c48bff' },
  duck: { name: 'Duck', color: '#3ddc84' },
  potato: { name: 'Hot Potato', color: '#ff9f1c' },
  boomerang: { name: 'Boomerang', color: '#ffd23f' },
  stir: { name: 'Stir', color: '#2ee6d6' },
  backdoor: { name: 'Back Door', color: '#7bd389' },
  swipe: { name: 'Swipe', color: '#ff6fd8' },
  xray: { name: 'X-Ray', color: '#8fd3ff' },
};
const WIRE_COLORS = { red: '#ff4d3d', blue: '#38b6ff', yellow: '#ffd23f' };

const DECK = { x: 560, y: 420 };
const PILE = { x: 820, y: 420 };
const GAUGE = { x: 1160, y: 410 };
const SEAT_Y = 760;

// ---- Effects state (TV-local) -------------------------------------------------------
let parts = []; // particles
let flights = []; // cards flying between deck, seats and the pile
let lastSeq = 0;
let lastNow = 0;
let shakeUntil = 0;
let flashAt = -1e9;
let banner = null; // { text, color, at, dur, size }
let boomAt = -1e9;
let pileBumpAt = 0;
let embers = [];

const rnd = (a, b) => a + Math.random() * (b - a);

function burst(x, y, n, { colors, speed = [100, 500], life = [0.5, 1.2], size = [3, 8], gravity = 300, drag = 0.9, kind = 'dot' }) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = rnd(...speed);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(...life), size: rnd(...size), color: colors[i % colors.length], gravity, drag, kind });
  }
}

function seatPos(s, id) {
  const n = s.players.length;
  const slot = Math.min(180, 1440 / n);
  const i = s.players.findIndex((p) => p.id === id);
  return { x: 800 - (slot * (n - 1)) / 2 + i * slot, y: SEAT_Y };
}

function onEvent(s, e, now) {
  const by = e.by && seatPos(s, e.by);
  const name = s.players.find((p) => p.id === e.by)?.name ?? '';
  switch (e.kind) {
    case 'play':
      flights.push({ kind: e.card, face: true, from: by, to: PILE, at: now, dur: 380 });
      pileBumpAt = now + 380;
      if (e.card === 'stir') for (let i = 0; i < 5; i++) flights.push({ back: true, from: { x: DECK.x + rnd(-120, 120), y: DECK.y + rnd(-90, 90) }, to: DECK, at: now + i * 70, dur: 300 });
      if (e.card === 'potato') burst(by.x, by.y - 40, 26, { colors: ['#ff9f1c', '#ffd23f', '#ff4d3d'], speed: [60, 240], gravity: -200, life: [0.4, 0.9] });
      break;
    case 'draw':
    case 'fizzle':
      flights.push({ back: true, from: { x: DECK.x, y: DECK.y + (e.bottom ? 40 : 0) }, to: by, at: now, dur: 420 });
      if (e.kind === 'fizzle') {
        burst(DECK.x, DECK.y - 30, 30, { colors: ['#ff6fd8', '#ffd23f', '#3ddc84', '#38b6ff'], speed: [150, 420], life: [0.8, 1.6], kind: 'confetti' });
        burst(DECK.x, DECK.y - 30, 14, { colors: ['#8a8f9c'], speed: [20, 90], gravity: -60, size: [16, 30], life: [0.8, 1.5], kind: 'smoke' });
        banner = { text: 'pop! just a Decoy', color: '#ffd23f', at: now, dur: 1800, size: 64 };
      }
      break;
    case 'bomb':
      banner = { text: `${name} drew a BOMB!`, color: '#ff4d3d', at: now, dur: 2200, size: 72 };
      flashAt = now;
      break;
    case 'douse':
      burst(800, 420, 70, { colors: ['#38b6ff', '#8fd3ff', '#ffffff'], speed: [200, 650], gravity: 900, life: [0.6, 1.2], size: [4, 9] });
      burst(800, 420, 18, { colors: ['#d8e2ee'], speed: [20, 100], gravity: -80, size: [20, 40], life: [1, 2], kind: 'smoke' });
      banner = { text: 'Doused!', color: '#38b6ff', at: now, dur: 1400, size: 72 };
      break;
    case 'hide':
      flights.push({ kind: 'bomb', face: true, from: { x: 800, y: 420 }, to: DECK, at: now, dur: 500 });
      break;
    case 'defused':
      burst(800, 420, 40, { colors: ['#3ddc84', '#ffd23f', '#ffffff'], speed: [150, 480], life: [0.6, 1.3], kind: 'confetti' });
      banner = { text: 'PHEW! Defused', color: '#3ddc84', at: now, dur: 2000, size: 76 };
      break;
    case 'boom': {
      const at = by ?? { x: 800, y: 420 };
      boomAt = now;
      flashAt = now;
      shakeUntil = now + 900;
      burst(800, 420, 120, { colors: ['#ffd23f', '#ff9f1c', '#ff4d3d', '#ffffff'], speed: [250, 1100], life: [0.5, 1.4], size: [4, 12], gravity: 500 });
      burst(800, 420, 40, { colors: ['#3a3340', '#5a5262', '#2a2530'], speed: [40, 260], gravity: -40, size: [30, 70], life: [1.5, 3], kind: 'smoke' });
      burst(at.x, at.y, 30, { colors: ['#ff9f1c', '#ffd23f'], speed: [100, 400], life: [0.4, 0.9] });
      burst(at.x, at.y, 12, { colors: ['#4a4450'], speed: [10, 60], gravity: -50, size: [18, 34], life: [1.5, 3], kind: 'smoke' });
      banner = { text: 'KABOOM!', sub: `${name} is out`, color: '#ffd23f', at: now, dur: 2400, size: 150 };
      break;
    }
  }
}

// ---- Sounds and narration -------------------------------------------------------------
export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const name = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    if (!prev) {
      sfx.shuffle(6);
      say(pick(['Welcome to the workshop. Somewhere in that crate, a bomb is waiting.', 'Draw carefully. Last one standing wins.', "Mind the crate. It's full of surprises."]), { delay: 0.8 });
      return;
    }
    const e = s.event;
    if (e && e.seq !== prev.event?.seq) {
      switch (e.kind) {
        case 'play':
          sfx.swish();
          ({
            stir: () => sfx.shuffle(6),
            potato: () => {
              sfx.whoosh();
              sfx.sizzle();
              say(`Hot potato! ${name(s.turn)} owes ${s.owed}.`, { rate: 1.1 });
            },
            boomerang: () => {
              sfx.whoosh();
              setTimeout(sfx.whoosh, 250);
              say(`Boomerang! Right back at ${name(s.turn)}.`, { rate: 1.1 });
            },
            duck: () => setTimeout(sfx.quack, 100),
            scope: () => setTimeout(sfx.chime, 100),
            xray: () => setTimeout(sfx.zap, 100),
            swipe: () => setTimeout(sfx.pickup, 100),
            nudge: () => setTimeout(sfx.click, 100),
            backdoor: () => setTimeout(sfx.doorCreak, 100),
          })[e.card]?.();
          break;
        case 'draw':
          sfx.shuffle(1);
          break;
        case 'fizzle':
          sfx.shuffle(1);
          setTimeout(sfx.fizzle, 150);
          say(pick(['Pop! Just a decoy.', 'A dud! Breathe.', 'Decoy! Nice try, crate.']), { delay: 0.6 });
          break;
        case 'bomb':
          sfx.alarm();
          setTimeout(sfx.sting, 350);
          say(`${name(e.by)} drew a bomb!`, { interrupt: true, rate: 1.05, delay: 0.3 });
          break;
        case 'douse':
          sfx.splash();
          break;
        case 'hide':
          sfx.whoosh();
          say(pick(['The bomb is back in the crate. Only one of you knows where.', 'Hidden. Somewhere.', 'Back in the crate it goes.']), { delay: 0.3 });
          break;
        case 'gamble':
          sfx.drumroll(1.2);
          say('Going for the wires!', { interrupt: true });
          break;
        case 'defused':
          sfx.snip();
          setTimeout(sfx.jingle, 250);
          say(pick(['Phew! Right wire.', 'Defused! Lucky.', 'Steady hands!']), { interrupt: true, delay: 0.4 });
          break;
        case 'wrongwire':
          sfx.snip();
          break;
        case 'boom':
          sfx.boom();
          setTimeout(() => sfx.thud(1), 120);
          if (!s.winner) say(pick([`${name(e.by)} is toast.`, `Goodbye, ${name(e.by)}.`, `${name(e.by)} has left the workshop. Rapidly.`]), { delay: 1.4 });
          break;
      }
    }
    // The fuse hisses louder as the timer runs down; heartbeats while someone holds a live bomb.
    if (s.turn && s.left !== prev.left) {
      if (s.phase === 'wires' || s.phase === 'bomb') sfx.heartbeat(s.left <= 5 ? 1 : 0.5);
      else if (s.left <= 5 && s.left > 0) sfx.tick();
      else if (s.phase === 'play') sfx.fuseHiss(Math.min(1, s.bombs / Math.max(1, s.deck)) * 2);
    }
    if (s.turn && s.turn !== prev.turn && e?.seq === prev.event?.seq) sfx.click();
    if (s.winner && !prev.winner) {
      setTimeout(sfx.fanfare, 1500);
      say(`${name(s.winner)} is the last one standing!`, { delay: 2.2 });
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const dt = Math.min(0.05, (now - (lastNow || now)) / 1000);
    lastNow = now;
    if (s.event && s.event.seq !== lastSeq) {
      if (lastSeq || s.event.seq <= 1) onEvent(s, s.event, now);
      lastSeq = s.event.seq;
    }
    const risk = s.deck ? s.bombs / s.deck : 0;

    ctx.save();
    if (now < shakeUntil) {
      const k = (shakeUntil - now) / 900;
      ctx.translate(rnd(-1, 1) * 22 * k, rnd(-1, 1) * 22 * k);
    }

    background(ctx, W, H, risk, now, dt);

    // Title with a little spark.
    text(ctx, 'FUSE', 80, 96, { size: 58, weight: 900, align: 'left', color: '#ffe8c2' });
    spark(ctx, 236, 58, now, 1);

    timerFuse(ctx, s, now, dt);

    // Log, newest first.
    [...s.log].reverse().forEach((line, i) => {
      text(ctx, line, 80, 150 + i * 30, { size: i === 0 ? 22 : 18, weight: i === 0 ? 700 : 500, align: 'left', color: i === 0 ? '#ffe8c2' : '#7d7486' });
    });

    // Turn banner.
    const turnP = s.players.find((p) => p.id === s.turn);
    const bannerUp = banner && now - banner.at < banner.dur;
    if (turnP && !bannerUp && !['bomb', 'wires', 'hide'].includes(s.phase)) {
      const msg = s.phase === 'target' ? `${turnP.name} is picking a victim…` : s.phase === 'nudge' ? `${turnP.name} is nudging the crate…` : `${turnP.name}'s turn`;
      text(ctx, msg, W / 2, 252, { size: 44, weight: 900, color: turnP.color });
      if (s.owed > 1) text(ctx, `owes ${s.owed} draws`, W / 2, 288, { size: 26, weight: 800, color: '#ff9f1c' });
    }

    crate(ctx, s, now);
    pile(ctx, s, now);
    gauge(ctx, s, now);

    s.players.forEach((p) => seat(ctx, p, seatPos(s, p.id), s, now));

    drawFlights(ctx, now);
    overlay(ctx, s, W, H, now);
    drawParts(ctx, dt);

    // Banner text over everything.
    if (banner && now - banner.at < banner.dur) {
      const t = (now - banner.at) / banner.dur;
      const pop = Math.min(1, (now - banner.at) / 160);
      const scale = 0.6 + 0.4 * pop + 0.08 * Math.sin(Math.min(1, t * 3) * Math.PI);
      ctx.save();
      ctx.globalAlpha = t > 0.8 ? (1 - t) / 0.2 : 1;
      ctx.translate(W / 2, banner.size > 100 ? 230 : 150);
      ctx.scale(scale, scale);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#1a0f12';
      ctx.font = `900 ${banner.size}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeText(banner.text, 0, 0);
      text(ctx, banner.text, 0, 0, { size: banner.size, weight: 900, color: banner.color });
      if (banner.sub) text(ctx, banner.sub, 0, 56, { size: 36, weight: 800, color: '#ffe8c2' });
      ctx.restore();
    }
    ctx.restore();

    // White flash on a bang.
    const f = 1 - (now - flashAt) / 350;
    if (f > 0) {
      ctx.fillStyle = `rgba(255,240,210,${f * 0.85})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (s.winner) {
      const w = s.players.find((p) => p.id === s.winner);
      if (now - boomAt > 1400) {
        if (Math.random() < 0.25) burst(rnd(200, 1400), rnd(120, 400), 24, { colors: ['#ffd23f', '#ff6fd8', '#38b6ff', '#3ddc84', '#ff9f1c'], speed: [80, 300], life: [0.8, 1.6], gravity: 120 });
        ctx.fillStyle = 'rgba(10,6,10,.6)';
        ctx.fillRect(0, 190, W, 160);
        text(ctx, `${w?.name} survives!`, W / 2, 290, { size: 80, weight: 900, color: w?.color ?? '#ffd23f' });
      }
    }
  },
};

// ---- Pieces -------------------------------------------------------------------------
function background(ctx, W, H, risk, now, dt) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#16111c');
  g.addColorStop(1, '#2a1712');
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, W + 80, H + 80);
  // Workbench planks.
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(-40, 600, W + 80, H);
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.lineWidth = 3;
  for (let y = 640; y < H + 40; y += 46) {
    ctx.beginPath();
    ctx.moveTo(-40, y);
    ctx.lineTo(W + 40, y);
    ctx.stroke();
  }
  // Warm lamp glow over the crate, redder as the odds get worse.
  const glow = ctx.createRadialGradient(800, 380, 40, 800, 380, 700);
  const hot = Math.min(1, risk * 3);
  glow.addColorStop(0, `rgba(${255},${Math.round(170 - 110 * hot)},${Math.round(80 - 40 * hot)},${0.22 + 0.12 * hot + 0.04 * Math.sin(now / 300) * hot})`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Drifting embers.
  if (Math.random() < 0.15 + hot * 0.4) embers.push({ x: rnd(0, W), y: H + 10, vy: rnd(-40, -110), vx: rnd(-15, 15), life: rnd(5, 10), t: 0, r: rnd(1.5, 3.5) });
  embers = embers.filter((e) => (e.t += dt) < e.life);
  for (const e of embers) {
    e.x += (e.vx + 20 * Math.sin(now / 900 + e.r * 3)) * dt;
    e.y += e.vy * dt;
    ctx.globalAlpha = Math.min(1, (e.life - e.t) / 2) * 0.7;
    circle(ctx, e.x, e.y, e.r, '#ffb35c');
  }
  ctx.globalAlpha = 1;
}

function spark(ctx, x, y, now, size) {
  const r = (6 + 3 * Math.sin(now / 40)) * size;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
  g.addColorStop(0, 'rgba(255,255,220,1)');
  g.addColorStop(0.3, 'rgba(255,200,80,.8)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 2 * size;
  for (let i = 0; i < 6; i++) {
    const a = now / 90 + i * 1.05 + Math.sin(now / 37 + i);
    const l = r * (1.5 + Math.random());
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
}

// The turn timer is a fuse burning from right to left along the top.
function timerFuse(ctx, s, now, dt) {
  if (!s.turn) return;
  const x0 = 520;
  const x1 = 1500;
  const y = 70;
  const frac = Math.max(0, Math.min(1, s.left / (s.limit || 30)));
  const xe = x0 + (x1 - x0) * frac;
  const wave = (x) => y + 7 * Math.sin(x / 38);
  // Burnt part.
  ctx.strokeStyle = '#2a2328';
  ctx.lineWidth = 6;
  ctx.setLineDash([4, 8]);
  ctx.beginPath();
  for (let x = xe; x <= x1; x += 8) ctx.lineTo(x, wave(x));
  ctx.stroke();
  ctx.setLineDash([]);
  // Unburnt rope.
  ctx.strokeStyle = s.left <= 5 ? '#e0a46a' : '#c98d55';
  ctx.lineWidth = 9;
  ctx.beginPath();
  for (let x = x0; x <= xe; x += 6) ctx.lineTo(x, wave(x));
  ctx.stroke();
  ctx.strokeStyle = 'rgba(80,40,20,.6)';
  ctx.lineWidth = 2;
  for (let x = x0 + 6; x < xe; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x - 4, wave(x) - 4);
    ctx.lineTo(x + 4, wave(x) + 4);
    ctx.stroke();
  }
  // Little bomb at the end of the fuse.
  bombIcon(ctx, x0 - 26, y + 6, 0.55, now, false);
  spark(ctx, xe, wave(xe), now, 1.1);
  if (Math.random() < 0.6) parts.push({ x: xe, y: wave(xe), vx: rnd(-60, 60), vy: rnd(-120, 10), t: 0, life: rnd(0.2, 0.5), size: rnd(1.5, 3), color: '#ffd23f', gravity: 400, drag: 0.95, kind: 'dot' });
  text(ctx, `${Math.max(0, s.left)}`, x1 + 36, y + 12, { size: 34, weight: 900, color: s.left <= 5 ? '#ff6b5e' : '#e9cfa8' });
}

function crate(ctx, s, now) {
  const { x, y } = DECK;
  const danger = s.bombs / Math.max(1, s.deck);
  const wob = s.phase === 'play' ? Math.sin(now / (120 - 80 * Math.min(1, danger * 3))) * 2 * Math.min(1, danger * 4) : 0;
  const layers = Math.min(6, Math.ceil(s.deck / 6));
  for (let i = layers; i >= 0; i--) cardBack(ctx, x + i * 3 + wob, y - i * 3, 1);
  text(ctx, `${s.deck} cards`, x, y + 150, { size: 24, weight: 700, color: '#bfae9a' });
  text(ctx, 'THE CRATE', x, y - 130 - layers * 3, { size: 18, weight: 900, color: '#8a7a6a' });
}

function cardBack(ctx, x, y, scale) {
  const w = 150 * scale;
  const h = 214 * scale;
  ctx.save();
  ctx.translate(x, y);
  roundRect(ctx, -w / 2, -h / 2, w, h, 14 * scale);
  ctx.fillStyle = '#7a3b1e';
  ctx.fill();
  ctx.lineWidth = 6 * scale;
  ctx.strokeStyle = '#ffd9a0';
  ctx.stroke();
  // Wooden crate slats.
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 3 * scale;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 8 * scale, (i * h) / 6);
    ctx.lineTo(w / 2 - 8 * scale, (i * h) / 6);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,217,160,.35)';
  ctx.lineWidth = 8 * scale;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + 16 * scale, -h / 2 + 16 * scale);
  ctx.lineTo(w / 2 - 16 * scale, h / 2 - 16 * scale);
  ctx.stroke();
  ctx.rotate(-0.25);
  ctx.fillStyle = '#1a0f12';
  roundRect(ctx, -54 * scale, -22 * scale, 108 * scale, 44 * scale, 6 * scale);
  ctx.fill();
  text(ctx, 'FUSE', 0, 13 * scale, { size: 34 * scale, weight: 900, color: '#ffb35c' });
  ctx.restore();
}

function pile(ctx, s, now) {
  const { x, y } = PILE;
  roundRect(ctx, x - 80, y - 112, 160, 224, 16);
  ctx.strokeStyle = 'rgba(255,232,194,.15)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  if (!s.discard) return;
  const t = (now - pileBumpAt) / 260;
  const pop = t > 0 && t < 1 ? Math.sin(t * Math.PI) * 0.12 : 0;
  cardFace(ctx, s.discard, x, y, 1 + pop, now);
}

// The odds: a dial from safe (green) to doom (red), plus "N Bombs in M cards".
function gauge(ctx, s, now) {
  const { x, y } = GAUGE;
  const risk = s.deck ? s.bombs / s.deck : 0;
  const r = 110;
  const a0 = Math.PI * 0.8;
  const a1 = Math.PI * 2.2;
  const seg = 40;
  for (let i = 0; i < seg; i++) {
    const t = i / seg;
    ctx.strokeStyle = `hsl(${120 - 120 * t}, 75%, ${45 + (t <= risk ? 10 : -20)}%)`;
    ctx.globalAlpha = t <= Math.min(1, risk * 2) ? 1 : 0.25;
    ctx.lineWidth = 22;
    ctx.beginPath();
    ctx.arc(x, y, r, a0 + ((a1 - a0) * i) / seg, a0 + ((a1 - a0) * (i + 0.9)) / seg);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Needle (full scale is a 50% chance), with a nervous jitter.
  const jit = Math.sin(now / 60) * 0.02 * Math.min(1, risk * 4);
  const na = a0 + (a1 - a0) * Math.min(1, risk * 2) + jit;
  ctx.strokeStyle = '#ffe8c2';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(na) * (r - 24), y + Math.sin(na) * (r - 24));
  ctx.stroke();
  circle(ctx, x, y, 12, '#ffe8c2');
  text(ctx, `${Math.round(risk * 100)}%`, x, y + 66, { size: 44, weight: 900, color: risk > 0.25 ? '#ff6b5e' : risk > 0.12 ? '#ffd23f' : '#3ddc84' });
  text(ctx, 'chance of a Bomb', x, y + 96, { size: 20, weight: 700, color: '#bfae9a' });
  text(ctx, `${s.bombs} Bomb${s.bombs === 1 ? '' : 's'} in the crate`, x, y - r - 26, { size: 22, weight: 800, color: '#ff9f8c' });
}

// Each player is a little round "bomb buddy" in their color, with a card count.
function seat(ctx, p, { x, y }, s, now) {
  const isTurn = s.turn === p.id;
  const bob = isTurn ? -Math.abs(Math.sin(now / 220)) * 14 : 0;
  ctx.globalAlpha = p.connected ? 1 : 0.5;
  if (!p.alive) {
    // Scorch mark, X eyes and a wisp of smoke.
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.beginPath();
    ctx.ellipse(x, y + 30, 56, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    circle(ctx, x, y, 34, '#2a2528');
    ctx.strokeStyle = '#6b6370';
    ctx.lineWidth = 4;
    for (const ex of [-12, 12]) {
      ctx.beginPath();
      ctx.moveTo(x + ex - 6, y - 10);
      ctx.lineTo(x + ex + 6, y + 2);
      ctx.moveTo(x + ex + 6, y - 10);
      ctx.lineTo(x + ex - 6, y + 2);
      ctx.stroke();
    }
    if (Math.random() < 0.05) parts.push({ x: x + rnd(-10, 10), y: y - 30, vx: rnd(-8, 8), vy: -30, t: 0, life: 2, size: rnd(10, 18), color: '#5a5262', gravity: -10, drag: 0.98, kind: 'smoke' });
    text(ctx, p.name, x, y + 66, { size: 22, weight: 600, color: '#6b6370' });
    text(ctx, placeName(p.place), x, y - 48, { size: 18, weight: 800, color: '#6b6370' });
    ctx.globalAlpha = 1;
    return;
  }
  if (isTurn) {
    const g = ctx.createRadialGradient(x, y + bob, 20, x, y + bob, 80);
    g.addColorStop(0, p.color + '88');
    g.addColorStop(1, p.color + '00');
    ctx.fillStyle = g;
    ctx.fillRect(x - 90, y - 90 + bob, 180, 180);
  }
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 36, 34 - bob * 0.6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  const yy = y + bob;
  // little fuse on top
  ctx.strokeStyle = '#c98d55';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 10, yy - 32);
  ctx.quadraticCurveTo(x + 22, yy - 52, x + 14, yy - 58);
  ctx.stroke();
  if (isTurn) spark(ctx, x + 14, yy - 58, now, 0.6);
  circle(ctx, x, yy, 34, p.color);
  circle(ctx, x - 11, yy - 12, 8, 'rgba(255,255,255,.35)');
  // Eyes look at the crate; wide when it's their turn.
  const look = Math.max(-1, Math.min(1, (DECK.x - x) / 500));
  for (const ex of [-11, 11]) {
    circle(ctx, x + ex, yy - 4, isTurn ? 9 : 7, '#fff');
    circle(ctx, x + ex + look * 3, yy - 4 - (isTurn ? 2 : 1), isTurn ? 4.5 : 3.5, '#1a0f12');
  }
  // Card count badge.
  circle(ctx, x + 30, yy + 22, 16, '#1a0f12');
  text(ctx, String(p.cards), x + 30, yy + 29, { size: 20, weight: 900, color: '#ffe8c2' });
  text(ctx, p.name, x, y + 66, { size: 22, weight: isTurn ? 900 : 600, color: s.winner === p.id ? '#ffd23f' : '#ffe8c2' });
  if (isTurn && s.owed > 1) text(ctx, `×${s.owed}`, x - 40, yy - 30, { size: 26, weight: 900, color: '#ff9f1c' });
  ctx.globalAlpha = 1;
}

const placeName = (n) => (n ? ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][n] : '');

// Big moments: holding a live Bomb, the wires, hiding it again.
function overlay(ctx, s, W, H, now) {
  if (!['bomb', 'wires', 'hide'].includes(s.phase)) return;
  const p = s.players.find((q) => q.id === s.turn);
  ctx.fillStyle = 'rgba(10,6,10,.84)';
  ctx.fillRect(-40, -40, W + 80, H + 80);
  const cx = 800;
  const cy = 470;
  if (s.phase === 'hide') {
    text(ctx, `${p?.name} is hiding the Bomb…`, cx, 260, { size: 52, weight: 900, color: p?.color });
    text(ctx, 'Only they will know where it went.', cx, 304, { size: 26, weight: 600, color: '#bfae9a' });
    bombIcon(ctx, cx, cy, 1.4, now, false, true);
    return;
  }
  const shake = s.phase === 'wires' && s.left <= 5 ? rnd(-3, 3) : rnd(-1, 1);
  if (s.phase === 'wires') {
    text(ctx, `${p?.name}: cut a wire!`, cx, 255, { size: 56, weight: 900, color: p?.color });
    text(ctx, 'One in three defuses it.', cx, 298, { size: 28, weight: 700, color: '#ffe8c2' });
    wires(ctx, cx, cy, s.wires?.cut, now);
    bombIcon(ctx, cx + shake, cy, 1.4, now, true);
  } else {
    text(ctx, `${p?.name} is holding a live Bomb!`, cx, 255, { size: 52, weight: 900, color: p?.color });
    text(ctx, 'Bucket, or gamble on the wires?', cx, 298, { size: 28, weight: 700, color: '#ffe8c2' });
    bombIcon(ctx, cx + shake, cy + 20, 1.8, now, true);
  }
  const pulse = s.left <= 5 ? 1 + 0.12 * Math.abs(Math.sin(now / 160)) : 1;
  text(ctx, `${Math.max(0, s.left)}`, 1250, cy + 30, { size: 110 * pulse, weight: 900, color: s.left <= 5 ? '#ff4d3d' : '#ffe8c2' });
}

function wires(ctx, cx, cy, cut, now) {
  const ids = ['red', 'blue', 'yellow'];
  ids.forEach((id, i) => {
    const ex = cx - 330 + i * 330;
    const ey = cy + 150;
    const sx = cx + (i - 1) * 36;
    const sy = cy + 55;
    ctx.strokeStyle = WIRE_COLORS[id];
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    if (cut === id) {
      // Snipped in the middle, ends drooping.
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo((sx + ex) / 2, sy + 30, (sx + ex) / 2 - 10, sy + 90);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.quadraticCurveTo((sx + ex) / 2 + 30, ey, (sx + ex) / 2 + 12, ey - 40);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.bezierCurveTo(sx, sy + 90, ex, ey - 90 + 6 * Math.sin(now / 200 + i), ex, ey);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = '#4a4450';
    ctx.fillRect(ex - 26, ey, 52, 26);
  });
}

function bombIcon(ctx, x, y, scale, now, lit, wet = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const g = ctx.createRadialGradient(-14, -14, 4, 0, 0, 46);
  g.addColorStop(0, wet ? '#5a6878' : '#4a4450');
  g.addColorStop(1, '#0e0a10');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2328';
  ctx.fillRect(-12, -56, 24, 16);
  ctx.strokeStyle = '#c98d55';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -56);
  ctx.quadraticCurveTo(10, -78, 26, -74);
  ctx.stroke();
  circle(ctx, -16, -16, 9, 'rgba(255,255,255,.25)');
  ctx.restore();
  if (lit) spark(ctx, x + 26 * scale, y - 74 * scale, now, scale * 0.8);
  if (wet) for (let i = 0; i < 3; i++) circle(ctx, x - 30 + i * 30, y + 60 * scale + ((now / 8 + i * 40) % 60), 5, '#38b6ff');
}

// Card faces: a dark card with a colored band, the name, and a vector icon.
function cardFace(ctx, kind, x, y, scale, now) {
  const c = CARD[kind] ?? CARD.bomb;
  const w = 150 * scale;
  const h = 214 * scale;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  roundRect(ctx, -75, -107, 150, 214, 14);
  ctx.fillStyle = '#1b1520';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = c.color;
  ctx.stroke();
  ctx.save();
  roundRect(ctx, -75, -107, 150, 214, 14);
  ctx.clip();
  ctx.fillStyle = c.color;
  ctx.fillRect(-75, 62, 150, 50);
  // Halftone dots behind the icon.
  for (let gx = -66; gx < 70; gx += 14) for (let gy = -98; gy < 60; gy += 14) circle(ctx, gx + (Math.round(gy / 14) & 1) * 7, gy, 3, c.color + "22");
  ctx.restore();
  icon(ctx, kind, 0, -18, now);
  text(ctx, c.name.toUpperCase(), 0, 93, { size: c.name.length > 8 ? 17 : 21, weight: 900, color: '#1a0f12' });
  ctx.restore();
  void w;
  void h;
}

function icon(ctx, kind, x, y, now) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const W = '#ffe8c2';
  switch (kind) {
    case 'bomb':
    case 'decoy':
      ctx.restore();
      bombIcon(ctx, x + 0, y + 12, 0.85, now, kind === 'bomb');
      if (kind === 'decoy') {
        ctx.fillStyle = '#ff6fd8';
        ctx.fillRect(x + 10, y - 60, 46, 26);
        text(ctx, 'POP', x + 33, y - 41, { size: 16, weight: 900, color: '#1a0f12' });
      }
      return;
    case 'bucket':
      ctx.fillStyle = '#38b6ff';
      ctx.beginPath();
      ctx.moveTo(-38, -20);
      ctx.lineTo(38, -20);
      ctx.lineTo(28, 40);
      ctx.lineTo(-28, 40);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = W;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, -20, 38, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = '#8fd3ff';
      ctx.fillRect(-38, -24, 76, 8);
      for (const [dx, dy] of [[-48, -44], [50, -36], [44, -60]]) {
        ctx.beginPath();
        ctx.arc(dx, dy, 6, 0, Math.PI);
        ctx.lineTo(dx, dy - 12);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'scope':
      ctx.strokeStyle = '#a77bff';
      ctx.lineWidth = 18;
      ctx.beginPath();
      ctx.moveTo(-20, 48);
      ctx.lineTo(-20, -30);
      ctx.lineTo(28, -30);
      ctx.stroke();
      circle(ctx, 38, -30, 16, W);
      circle(ctx, 38, -30, 9, '#3a2a60');
      circle(ctx, 34, -34, 3, '#fff');
      break;
    case 'nudge':
      for (let i = 0; i < 3; i++) {
        roundRect(ctx, -30 + i * 4, -40 + i * 16, 60, 34, 6);
        ctx.fillStyle = i === 0 ? '#c48bff' : '#4a3a5a';
        ctx.fill();
      }
      ctx.strokeStyle = W;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(42, -24);
      ctx.quadraticCurveTo(66, 10, 44, 50);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(32, 40);
      ctx.lineTo(44, 52);
      ctx.lineTo(56, 38);
      ctx.stroke();
      break;
    case 'duck': {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.ellipse(0, 22, 42, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(ctx, 20, -16, 22, '#ffd23f');
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.moveTo(38, -16);
      ctx.lineTo(60, -10);
      ctx.lineTo(38, -4);
      ctx.fill();
      circle(ctx, 26, -22, 4, '#1a0f12');
      ctx.strokeStyle = '#e0b020';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(-6, 18, 16, 0.2, 2.2);
      ctx.stroke();
      break;
    }
    case 'potato': {
      const flick = Math.sin(now / 80) * 4;
      ctx.fillStyle = '#ff4d3d';
      ctx.beginPath();
      ctx.moveTo(-20, -18);
      ctx.quadraticCurveTo(-26, -50, -6, -62 + flick);
      ctx.quadraticCurveTo(0, -40, 8, -54 - flick);
      ctx.quadraticCurveTo(26, -34, 20, -18);
      ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(-10, -18);
      ctx.quadraticCurveTo(-10, -40, 0, -46 + flick);
      ctx.quadraticCurveTo(12, -34, 10, -18);
      ctx.fill();
      ctx.fillStyle = '#c98d55';
      ctx.beginPath();
      ctx.ellipse(0, 14, 46, 32, -0.2, 0, Math.PI * 2);
      ctx.fill();
      for (const [dx, dy] of [[-18, 6], [10, 22], [20, 0], [-4, 30]]) circle(ctx, dx, dy, 3.5, '#7a4b2a');
      break;
    }
    case 'boomerang':
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(-44, 30);
      ctx.quadraticCurveTo(0, -60, 44, 30);
      ctx.stroke();
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 4;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.arc(0, 20, 58, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.setLineDash([]);
      break;
    case 'stir':
      ctx.strokeStyle = '#2ee6d6';
      ctx.lineWidth = 8;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 5; a += 0.15) {
        const r = 4 + a * 3.2;
        const t = a + now / 400;
        ctx.lineTo(Math.cos(t) * r, Math.sin(t) * r);
      }
      ctx.stroke();
      break;
    case 'backdoor':
      ctx.fillStyle = '#7bd389';
      roundRect(ctx, -30, -50, 60, 96, 6);
      ctx.fill();
      ctx.fillStyle = '#3a6a44';
      ctx.fillRect(-22, -42, 44, 36);
      ctx.fillRect(-22, 0, 44, 38);
      circle(ctx, 18, 0, 5, '#ffd23f');
      ctx.strokeStyle = W;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(-56, 30);
      ctx.lineTo(-56, 56);
      ctx.lineTo(-38, 56);
      ctx.stroke();
      break;
    case 'swipe':
      // Horseshoe magnet.
      ctx.strokeStyle = '#ff6fd8';
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.arc(0, 0, 32, Math.PI, 0, true);
      ctx.moveTo(-32, 0);
      ctx.lineTo(-32, -36);
      ctx.moveTo(32, 0);
      ctx.lineTo(32, -36);
      ctx.stroke();
      ctx.fillStyle = '#d8dde6';
      ctx.fillRect(-44, -56, 24, 18);
      ctx.fillRect(20, -56, 24, 18);
      ctx.strokeStyle = W;
      ctx.lineWidth = 3;
      for (const dx of [-32, 32]) {
        ctx.beginPath();
        ctx.moveTo(dx - 8, -66);
        ctx.lineTo(dx, -76);
        ctx.lineTo(dx + 8, -66);
        ctx.stroke();
      }
      break;
    case 'xray':
      ctx.fillStyle = W;
      ctx.beginPath();
      ctx.moveTo(-50, 0);
      ctx.quadraticCurveTo(0, -44, 50, 0);
      ctx.quadraticCurveTo(0, 44, -50, 0);
      ctx.fill();
      circle(ctx, 0, 0, 18, '#8fd3ff');
      circle(ctx, 0, 0, 8, '#1a0f12');
      ctx.strokeStyle = '#8fd3ff';
      ctx.lineWidth = 4;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 18, -34);
        ctx.lineTo(i * 26, -54);
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}

function drawFlights(ctx, now) {
  flights = flights.filter((f) => now - f.at < f.dur);
  for (const f of flights) {
    const t = (now - f.at) / f.dur;
    if (t < 0) continue;
    const e = 1 - Math.pow(1 - t, 3);
    const x = f.from.x + (f.to.x - f.from.x) * e;
    const y = f.from.y + (f.to.y - f.from.y) * e - Math.sin(t * Math.PI) * 120;
    const sc = f.face ? 1 : 0.55 + 0.45 * (1 - t);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((1 - t) * 0.6 * (f.to.x > f.from.x ? -1 : 1));
    if (f.face) cardFace(ctx, f.kind, 0, 0, 0.8, now);
    else cardBack(ctx, 0, 0, sc * 0.8);
    ctx.restore();
  }
}

function drawParts(ctx, dt) {
  parts = parts.filter((p) => (p.t += dt) < p.life);
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  for (const p of parts) {
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = 1 - p.t / p.life;
    if (p.kind === 'smoke') {
      ctx.globalAlpha = k * 0.5;
      circle(ctx, p.x, p.y, p.size * (1.6 - k * 0.6), p.color);
    } else if (p.kind === 'confetti') {
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.t * 10 + p.size);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
      ctx.restore();
    } else {
      ctx.globalAlpha = k;
      circle(ctx, p.x, p.y, p.size * (0.4 + 0.6 * k), p.color);
    }
  }
  ctx.globalAlpha = 1;
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
