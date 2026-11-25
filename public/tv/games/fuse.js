// Fuse TV: the workshop. The crate (draw pile) and the odds in the middle, the last card played,
// a burning fuse as the turn timer, and everyone's bomb-buddy along the bottom.
// Hands and peeks stay on the phones. Rules are in server/games/fuse.js.

import { circle, text } from './util.js';
import { bombIcon, cardBack, drawFace, drawNamed, spark } from '../../art/fuse.js';

// Card faces come from the shared art module (the phones draw the same ones).
const cardFace = (ctx, kind, x, y, scale, now, wet = false) => drawFace(ctx, kind, x, y, 150 * scale, 214 * scale, now, { wet });

// short: the card legend on the left. text: the caption under the pile when someone plays it.
const CARD = {
  bomb: { name: 'Bomb', color: '#ff4d3d', short: "you're out, unless saved" },
  decoy: { name: 'Decoy', color: '#ff4d3d', short: 'a fake Bomb, harmless' },
  bucket: { name: 'Bucket', color: '#38b6ff', short: 'survive a drawn Bomb' },
  scope: { name: 'Periscope', color: '#a77bff', short: 'peek at the top 3', text: 'They secretly saw the top 3 cards of the crate.' },
  nudge: { name: 'Nudge', color: '#c48bff', short: 'see top card, may bury it', text: 'They saw the top card and may bury it at the bottom.' },
  duck: { name: 'Duck', color: '#3ddc84', short: 'skip one draw', text: 'One draw skipped.' },
  potato: { name: 'Hot Potato', color: '#ff9f1c', short: 'skip; next player draws +1', text: 'Turn over without drawing. The next player owes all those draws, plus one.' },
  boomerang: { name: 'Boomerang', color: '#ffd23f', short: 'throw a Hot Potato back', text: 'All the owed draws fly straight back to whoever passed the Hot Potato.' },
  stir: { name: 'Stir', color: '#2ee6d6', short: 'shuffle the crate', text: 'The crate is shuffled. Whatever anyone peeked at is lost.' },
  backdoor: { name: 'Back Door', color: '#7bd389', short: 'draw from the bottom', text: 'They draw from the bottom of the crate instead of the top.' },
  swipe: { name: 'Swipe', color: '#ff6fd8', short: 'steal a random card', text: 'They take a random card from another player.' },
  xray: { name: 'X-Ray', color: '#8fd3ff', short: "see someone's hand", text: "They get to look at another player's whole hand." },
};
const LEGEND = ['bomb', 'decoy', 'bucket', 'scope', 'nudge', 'duck', 'potato', 'boomerang', 'stir', 'backdoor', 'swipe', 'xray'];
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
let rings = []; // shockwaves: { x, y, at, color, size }
let played = null; // { kind, by, color, at } the last card played, for the caption and legend glow

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
      played = { kind: e.card, by: name, color: s.players.find((p) => p.id === e.by)?.color ?? '#ffe8c2', at: now };
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
      rings.push({ x: 800, y: 420, at: now, color: '#8fd3ff', size: 380, dur: 600 });
      break;
    case 'hide':
      flights.push({ kind: 'bomb', face: true, from: { x: 800, y: 420 }, to: DECK, at: now, dur: 500 });
      break;
    case 'defused':
      burst(800, 420, 40, { colors: ['#3ddc84', '#ffd23f', '#ffffff'], speed: [150, 480], life: [0.6, 1.3], kind: 'confetti' });
      banner = { text: 'PHEW! Defused', color: '#3ddc84', at: now, dur: 2000, size: 76 };
      rings.push({ x: 800, y: 470, at: now, color: '#3ddc84', size: 420, dur: 700 });
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
      rings.push({ x: 800, y: 420, at: now, color: '#fff0c8', size: 1100, dur: 650 });
      rings.push({ x: 800, y: 420, at: now + 120, color: '#ff9f1c', size: 800, dur: 800 });
      break;
    }
  }
}

// ---- Sounds and narration -------------------------------------------------------------
export default {
  drawRules, // the how-to-play pictures; the steps themselves are in server/games/fuse.js

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

    legend(ctx, now);
    crate(ctx, s, now);
    pile(ctx, s, now);
    caption(ctx, now);
    gauge(ctx, s, now);

    s.players.forEach((p) => seat(ctx, p, seatPos(s, p.id), s, now));

    drawFlights(ctx, now);
    overlay(ctx, s, W, H, now);
    drawRings(ctx, now);
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

// ---- How to play ----------------------------------------------------------------------
// One little animation per rules step, drawn by the TV's rules overlay (public/tv/rules.js).
// Everything is a function of t (seconds into the step), so stepping back replays it exactly.
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const ease = (k) => 1 - Math.pow(1 - k, 3);
const lerp = (a, b, k) => a + (b - a) * k;
const BUDDIES = ['#ff6fd8', '#3ddc84', '#38b6ff', '#ffd23f'];

function drawRules(ctx, art, t, box, now) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  ctx.save();
  ({ goal: artGoal, turn: artTurn, bucket: artBucket, wires: artWires, dodge: artDodge, peek: artPeek, phone: artPhone }[art] ?? (() => {}))(ctx, t, cx, cy, now);
  ctx.restore();
}

// Bombs drop on three bomb-buddies one by one; the last one left wins.
function artGoal(ctx, t, cx, cy, now) {
  cardBack(ctx, cx, cy - 120, 0.5);
  const blasts = [[0, 0.8], [3, 2.0], [2, 3.2]]; // [buddy, time it blows]
  BUDDIES.forEach((color, i) => {
    const x = cx + (i - 1.5) * 230;
    const y = cy + 110;
    const b = blasts.find(([j]) => j === i);
    const fall = b ? seg(t, b[1] - 0.6, b[1]) : 0;
    if (fall > 0 && fall < 1) bombIcon(ctx, lerp(cx, x, fall), lerp(cy - 90, y - 40, ease(fall)), 0.4, now, true);
    const gone = b && t >= b[1];
    const won = !b && t > 4.2;
    buddy(ctx, x, y - (won ? Math.abs(Math.sin((t - 4.2) * 5)) * 24 : 0), color, now, { dead: gone, crown: won });
    if (gone) blast(ctx, x, y, seg(t, b[1], b[1] + 0.8));
  });
  if (t > 4.4) text(ctx, 'WINNER', cx - 0.5 * 230, cy + 225, { size: 30, weight: 900, color: '#ffd23f' });
}

// Play two cards onto the pile, then draw one from the crate.
function artTurn(ctx, t, cx, cy, now) {
  const hand = { x: cx - 380, y: cy + 20 };
  const pileAt = { x: cx, y: cy };
  const crateAt = { x: cx + 380, y: cy };
  roundRect(ctx, pileAt.x - 60, pileAt.y - 84, 120, 168, 12);
  ctx.strokeStyle = 'rgba(255,232,194,.2)';
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 3; i >= 0; i--) cardBack(ctx, crateAt.x + i * 3, crateAt.y - i * 3, 0.75);
  const kinds = ['scope', 'duck', 'stir'];
  const plays = { scope: 0.6, stir: 1.8 };
  kinds.forEach((kind, i) => {
    const home = { x: hand.x + (i - 1) * 80, y: hand.y + Math.abs(i - 1) * 10, r: (i - 1) * 0.18 };
    const k = plays[kind] == null ? 0 : ease(seg(t, plays[kind], plays[kind] + 0.7));
    ctx.save();
    ctx.translate(lerp(home.x, pileAt.x, k), lerp(home.y, pileAt.y, k) - Math.sin(k * Math.PI) * 90);
    ctx.rotate(lerp(home.r, 0, k));
    cardFace(ctx, kind, 0, 0, 0.72, now);
    ctx.restore();
  });
  const d = ease(seg(t, 3.4, 4.3));
  if (t > 3.4) {
    ctx.save();
    ctx.translate(lerp(crateAt.x, hand.x + 40, d), lerp(crateAt.y, hand.y - 20, d) - Math.sin(d * Math.PI) * 100);
    ctx.rotate(-0.3 * d);
    cardBack(ctx, 0, 0, 0.75);
    ctx.restore();
  }
  ruleLabel(ctx, 'Your hand', hand.x, cy + 170, 1);
  ruleLabel(ctx, '1. Play any cards', pileAt.x, cy + 170, seg(t, 0.3, 0.8));
  ruleLabel(ctx, '2. Draw one. Turn over.', crateAt.x, cy + 170, seg(t, 3.0, 3.5));
}

// A Bomb comes out of the crate, a Bucket douses it, and it goes back in somewhere.
function artBucket(ctx, t, cx, cy, now) {
  const crateAt = { x: cx - 380, y: cy };
  for (let i = 3; i >= 0; i--) cardBack(ctx, crateAt.x + i * 3, crateAt.y - i * 3, 0.75);
  const out = ease(seg(t, 0, 0.7));
  const back = ease(seg(t, 4.2, 5.2));
  const flip = seg(t, 0.7, 1.1);
  const flipBack = seg(t, 3.8, 4.2);
  const wet = t > 3.2;
  const shake = t > 1.1 && t < 3.2 ? Math.sin(now / 30) * 4 : 0;
  const x = t < 4.2 ? lerp(crateAt.x, cx, out) : lerp(cx, crateAt.x, back);
  const y = (t < 4.2 ? -Math.sin(out * Math.PI) * 80 : -Math.sin(back * Math.PI) * 80) + cy;
  if (back < 1) {
    ctx.save();
    ctx.translate(x + shake, y);
    const sx = t < 3.8 ? Math.abs(Math.cos(flip * Math.PI)) : Math.abs(Math.cos(flipBack * Math.PI));
    ctx.scale(Math.max(0.02, sx), 1);
    const faceUp = t < 3.8 ? flip >= 0.5 : flipBack < 0.5;
    if (faceUp) cardFace(ctx, 'bomb', 0, 0, 0.9, now, wet);
    else cardBack(ctx, 0, 0, 0.9);
    ctx.restore();
  }
  // The Bucket swings in from your hand and pours.
  const swing = ease(seg(t, 1.9, 2.6));
  const leave = seg(t, 3.6, 4.0);
  if (t > 1.9 && leave < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - leave;
    ctx.translate(lerp(cx + 420, cx + 110, swing), lerp(cy + 40, cy - 150, swing));
    ctx.rotate(-0.9 * swing);
    cardFace(ctx, 'bucket', 0, 0, 0.6, now);
    ctx.restore();
    if (t > 2.6) {
      for (let i = 0; i < 9; i++) {
        const k = ((t - 2.6) * 1.6 + i / 9) % 1;
        circle(ctx, cx + 40 - (i % 3) * 30 + Math.sin(i) * 8, cy - 140 + k * 180, 6, `rgba(56,182,255,${(1 - leave) * (1 - k)})`);
      }
    }
  }
  ruleLabel(ctx, t < 3.2 ? 'BOMB!' : t < 4.2 ? 'Doused' : 'Hidden back in the crate', t < 4.2 ? cx : crateAt.x, cy + 170, seg(t, 0.9, 1.2), t < 3.2 ? '#ff6b5e' : '#8fd3ff');
}

// Scissors hover over the wires and snip one.
function artWires(ctx, t, cx, cy, now) {
  const by = cy - 90;
  const cut = t > 3.4 ? 'blue' : null;
  wires(ctx, cx, by, cut, now);
  bombIcon(ctx, cx, by, 1.2, now, !cut, false);
  const stops = [0, 1, 2, 1];
  const hover = Math.min(3, Math.floor(seg(t, 0.4, 3.4) * 4));
  const i = cut ? 1 : stops[hover];
  const sx = cx + (i - 1) * 36;
  const ex = cx - 330 + i * 330;
  const wx = (sx + ex) / 2;
  const wy = by + 120 - (cut ? 0 : Math.abs(Math.sin(now / 200)) * 8);
  if (t < 3.9) scissors(ctx, wx + 46, wy - 10, cut ? 0.05 : 0.5);
  if (cut) {
    text(ctx, 'DEFUSED', cx, by - 110, { size: 40, weight: 900, color: '#3ddc84' });
    ['red', 'blue', 'yellow'].forEach((id, j) => {
      const reveal = seg(t, 4.2 + j * 0.3, 4.5 + j * 0.3);
      ctx.globalAlpha = reveal;
      text(ctx, id === 'blue' ? 'SAFE' : 'BOOM', cx - 330 + j * 330, by + 218, { size: 30, weight: 900, color: id === 'blue' ? '#3ddc84' : '#ff6b5e' });
      ctx.globalAlpha = 1;
    });
  }
}

// Three ways out of drawing.
function artDodge(ctx, t, cx, cy, now) {
  [['duck', 'No draw'], ['potato', 'No draw. Next player draws 2'], ['boomerang', 'Hot Potato? Send it back']].forEach(([kind, label], i) => {
    const k = ease(seg(t, 0.3 + i * 1.3, 0.9 + i * 1.3));
    if (k <= 0) return;
    const x = cx + (i - 1) * 360;
    ctx.globalAlpha = k;
    cardFace(ctx, kind, x, cy - 20 - (1 - k) * 60, 0.95, now);
    ctx.font = '700 24px system-ui, -apple-system, sans-serif';
    wrapText(ctx, label, 300).forEach((line, j) => text(ctx, line, x, cy + 150 + j * 30, { size: 24, weight: 700, color: '#ffe8c2' }));
    ctx.globalAlpha = 1;
  });
}

// A Periscope shows the top three; the "Bomb" among them turns out to be a Decoy.
function artPeek(ctx, t, cx, cy, now) {
  cardFace(ctx, 'scope', cx - 440, cy - 10, 0.8, now);
  ruleLabel(ctx, 'Peek at the top 3', cx - 440, cy + 150, 1);
  const crateAt = { x: cx - 160, y: cy - 10 };
  for (let i = 3; i >= 0; i--) cardBack(ctx, crateAt.x + i * 3, crateAt.y - i * 3, 0.7);
  ['duck', 'bomb', 'swipe'].forEach((kind, i) => {
    const k = ease(seg(t, 0.6 + i * 0.25, 1.3 + i * 0.25));
    const x = lerp(crateAt.x, cx + 110 + i * 170, k);
    const sx = Math.abs(Math.cos(seg(t, 1.3 + i * 0.25, 1.7 + i * 0.25) * Math.PI));
    const up = t > 1.5 + i * 0.25;
    const decoy = kind === 'bomb' && t > 3.4;
    const pop = decoy ? seg(t, 3.4, 3.8) : 0;
    ctx.save();
    ctx.translate(x, cy - 10 - Math.sin(k * Math.PI) * 50 - Math.sin(pop * Math.PI) * 20);
    ctx.scale(Math.max(0.02, up ? Math.max(sx, t > 1.7 + i * 0.25 ? 1 : 0) : sx), 1);
    if (up) cardFace(ctx, decoy ? 'decoy' : kind, 0, 0, 0.7, now);
    else cardBack(ctx, 0, 0, 0.7);
    ctx.restore();
  });
  ruleLabel(ctx, t > 3.4 ? 'A Decoy! Just goes pop' : 'A Bomb? Or a Decoy?', cx + 280, cy + 150, seg(t, 2.0, 2.4), t > 3.4 ? '#ff6fd8' : '#ff6b5e');
}

// A phone with your hand; a tap picks a card. The TV's card list sits on the left.
function artPhone(ctx, t, cx, cy, now) {
  const px = cx + 170;
  const w = 260;
  const h = 430;
  roundRect(ctx, px - w / 2, cy - h / 2, w, h, 34);
  ctx.fillStyle = '#0d0f14';
  ctx.fill();
  ctx.strokeStyle = '#4a4450';
  ctx.lineWidth = 8;
  ctx.stroke();
  text(ctx, 'Your hand', px, cy - 150, { size: 20, weight: 800, color: '#ffe8c2' });
  const kinds = ['bucket', 'duck', 'potato', 'scope'];
  const picked = t > 1.4;
  kinds.forEach((kind, i) => {
    const x = px - 75 + (i % 2) * 150 - 0;
    const lift = picked && i === 1 ? -12 : 0;
    cardFace(ctx, kind, px + (i % 2 ? 50 : -50), cy - 60 + Math.floor(i / 2) * 120 + lift, 0.46, now);
    void x;
  });
  if (picked) {
    roundRect(ctx, px - 100, cy + 150, 200, 44, 12);
    ctx.fillStyle = '#3ddc84';
    ctx.fill();
    text(ctx, 'Play Duck', px, cy + 180, { size: 20, weight: 900, color: '#0d0f14' });
  }
  // A fingertip taps the Duck card.
  const tap = seg(t, 0.8, 1.4);
  if (t > 0.4) {
    const fx = px + 50;
    const fy = cy - 60;
    const r = 26 - 6 * Math.sin(tap * Math.PI);
    circle(ctx, fx + 30, fy + 50, r, 'rgba(255,232,194,.55)');
    if (tap > 0.4 && tap < 1) {
      ctx.strokeStyle = `rgba(255,232,194,${1 - tap})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(fx + 30, fy + 50, 30 + 40 * tap, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // A mini card list, like the one on the left of the board.
  const lx = cx - 480;
  const show = seg(t, 2.2, 2.8);
  ctx.globalAlpha = show;
  text(ctx, 'ON THE TV', lx, cy - 120, { size: 18, weight: 900, align: 'left', color: '#8a7a6a' });
  ['bomb', 'bucket', 'duck', 'potato', 'scope', 'swipe'].forEach((k, i) => {
    const y = cy - 100 + i * 38;
    ctx.fillStyle = CARD[k].color;
    roundRect(ctx, lx, y + 6, 14, 20, 3);
    ctx.fill();
    text(ctx, CARD[k].name, lx + 26, y + 24, { size: 22, weight: 800, align: 'left', color: CARD[k].color });
  });
  ctx.globalAlpha = 1;
}

function ruleLabel(ctx, str, x, y, alpha, color = '#ffe8c2') {
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  text(ctx, str, x, y, { size: 28, weight: 800, color });
  ctx.globalAlpha = 1;
}

function buddy(ctx, x, y, color, now, { dead = false, crown = false } = {}) {
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 52, 50, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  if (dead) {
    circle(ctx, x, y + 10, 40, '#2a2528');
    ctx.strokeStyle = '#6b6370';
    ctx.lineWidth = 5;
    for (const ex of [-14, 14]) {
      ctx.beginPath();
      ctx.moveTo(x + ex - 7, y);
      ctx.lineTo(x + ex + 7, y + 14);
      ctx.moveTo(x + ex + 7, y);
      ctx.lineTo(x + ex - 7, y + 14);
      ctx.stroke();
    }
    return;
  }
  ctx.strokeStyle = '#c98d55';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x + 14, y - 44);
  ctx.quadraticCurveTo(x + 30, y - 70, x + 20, y - 78);
  ctx.stroke();
  circle(ctx, x, y, 48, color);
  circle(ctx, x - 16, y - 16, 11, 'rgba(255,255,255,.35)');
  for (const ex of [-15, 15]) {
    circle(ctx, x + ex, y - 5, 11, '#fff');
    circle(ctx, x + ex, y - 7, 5, '#1a0f12');
  }
  if (crown) {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(x - 30, y - 50);
    ctx.lineTo(x - 30, y - 82);
    ctx.lineTo(x - 15, y - 64);
    ctx.lineTo(x, y - 90);
    ctx.lineTo(x + 15, y - 64);
    ctx.lineTo(x + 30, y - 82);
    ctx.lineTo(x + 30, y - 50);
    ctx.closePath();
    ctx.fill();
  }
}

/** An explosion at k = 0..1: a flash, a ring and flying sparks. */
function blast(ctx, x, y, k) {
  if (k <= 0 || k >= 1) return;
  const a = 1 - k;
  circle(ctx, x, y, 30 + 90 * k, `rgba(255,240,200,${Math.max(0, 1 - k * 3)})`);
  ctx.strokeStyle = `rgba(255,140,60,${a})`;
  ctx.lineWidth = 10 * a;
  ctx.beginPath();
  ctx.arc(x, y, 40 + 140 * k, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + i;
    const r = 40 + 170 * ease(k) * (0.7 + 0.3 * Math.sin(i * 7));
    circle(ctx, x + Math.cos(ang) * r, y + Math.sin(ang) * r, 7 * a, i % 2 ? '#ffd23f' : '#ff4d3d');
  }
}

function scissors(ctx, x, y, open) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.6);
  ctx.strokeStyle = '#e8e2ea';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-60, s * 60 * open * 0.5);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(26, s * 16, 14, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff9f1c';
    ctx.stroke();
    ctx.strokeStyle = '#e8e2ea';
    ctx.lineWidth = 7;
  }
  ctx.restore();
}

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

// What every card does, always on screen. The card just played glows.
function legend(ctx, now) {
  const x = 80;
  const y0 = 340;
  const row = 27;
  text(ctx, 'THE CARDS', x, y0 - 14, { size: 18, weight: 900, align: 'left', color: '#8a7a6a' });
  LEGEND.forEach((k, i) => {
    const c = CARD[k];
    const y = y0 + i * row;
    const glow = played?.kind === k ? Math.max(0, 1 - (now - played.at) / 4000) : 0;
    if (glow > 0) {
      ctx.globalAlpha = 0.25 * glow;
      ctx.fillStyle = c.color;
      roundRect(ctx, x - 8, y - 2, 380, row - 2, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    drawNamed(ctx, k, x + 8, y + 12, 24);
    text(ctx, c.name, x + 26, y + 19, { size: 17, weight: 800, align: 'left', color: c.color });
    text(ctx, c.short, x + 132, y + 19, { size: 16, weight: 500, align: 'left', color: glow > 0 ? '#ffe8c2' : '#a8998a' });
  });
}

// "Sam played Hot Potato" and what it did, under the pile, for a few seconds.
function caption(ctx, now) {
  if (!played || !CARD[played.kind]?.text) return;
  const t = (now - played.at) / 5000;
  if (t >= 1) return;
  ctx.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : Math.min(1, (now - played.at) / 250);
  const x = PILE.x;
  text(ctx, `${played.by} played ${CARD[played.kind].name}`, x, 598, { size: 26, weight: 900, color: played.color });
  wrapText(ctx, CARD[played.kind].text, 600).forEach((line, i) => text(ctx, line, x, 628 + i * 26, { size: 21, weight: 600, color: '#ffe8c2' }));
  ctx.globalAlpha = 1;
}

function wrapText(ctx, str, maxW) {
  ctx.font = '600 21px system-ui, -apple-system, sans-serif';
  const lines = [''];
  for (const w of str.split(' ')) {
    const tryLine = lines.at(-1) ? `${lines.at(-1)} ${w}` : w;
    if (ctx.measureText(tryLine).width > maxW && lines.at(-1)) lines.push(w);
    else lines[lines.length - 1] = tryLine;
  }
  return lines;
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

// Shockwaves: a ring that races outward and thins as it goes.
function drawRings(ctx, now) {
  rings = rings.filter((r) => now - r.at < r.dur);
  for (const r of rings) {
    const t = (now - r.at) / r.dur;
    if (t < 0) continue;
    const k = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 40 * (1 - t) + 2;
    ctx.beginPath();
    ctx.arc(r.x, r.y, 20 + r.size * k, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
