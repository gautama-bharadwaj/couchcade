// Tune In TV: an old walnut valve radio on a shelf. The backlit glass band runs between the card's
// two ideas; brass-stemmed tabs above it are each Listener's needle, the red needle is their
// average, and the tuning knob turns with it. All the drawn pieces are in public/art/tunein.js.
//
// Things that happen get a little show: each new DJ gets a card that slides in, the radio warms up
// at the start of a turn, the ON AIR lamp lights and the clue types itself out. At the reveal the
// glass fills with static, then the station and its zones sweep open, the magic eye closes as far as
// the signal is good, notes (or sparks) pour out of the speaker, and the points fly to the players.

import { text } from './util.js';
import { drawBars, drawCheck, drawGlass, drawGrille, drawKnob, drawMagicEye, drawMic, drawNeedle, drawNote, drawOnAir, drawRadio, drawTab, drawWood, rng } from '../../art/tunein.js';

const BX0 = 170; // band 0..100 maps to BX0..BX1
const BX1 = 1430;
const GY0 = 372; // glass top / bottom
const GY1 = 508;
const CAB = { x: 90, y: 296, w: 1420, h: 364 };
const REVEAL_DELAY = 1500; // ms of static before the station shows
const xOf = (v) => BX0 + ((BX1 - BX0) * v) / 100;
const ZONE_COLORS = ['#ff5a5f', '#ff9a4a', '#ffd166']; // crystal clear, clear, crackly
const SERIF = 'Georgia, "Times New Roman", serif';
const GOLD = '#ffd27a';
const PLAYER_Y = 776;

let shown = 50; // crowd needle as drawn, eased toward the real one
let lastNow = 0;
let revealSeq = -1;
let revealAt = 0;
let speckle = null;
let announced = 0; // the turn whose DJ the narrator last announced
let turnAt = 0; // when this turn started (the radio warms up)
let clueAt = 0; // when the clue arrived (it types itself out)
let lastClue = null;
let banner = null; // { name, color, at }
let bannerTurn = { turn: 0, left: null }; // the turn whose card has shown (or is waiting for the clock)
let notes = []; // things floating out of the speaker: { x, y, vx, vy, at, life, color, kind, size }
let emitted = -1; // the reveal seq that has sent its notes
let bgCache = null;

const ease = (q) => 1 - (1 - q) ** 3;
const clamp01 = (q) => Math.max(0, Math.min(1, q));

export default {
  drawRules, // the how-to-play pictures; the steps themselves are in server/games/tunein.js

  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    // The how-to-play intro pauses snapshots, so announce each DJ the first time we see their turn.
    if (s.turn < announced) announced = 0; // a new game
    if (s.phase === 'pick' && s.turn !== announced) {
      announced = s.turn;
      if (s.turn === 1) sfx.static(0.8);
      sfx.chime();
      say(s.turn === 1 ? `${nameOf(s.dj)} is the first DJ.` : pick([`${nameOf(s.dj)} is the DJ.`, `Over to ${nameOf(s.dj)}.`, `${nameOf(s.dj)}, you're on the air.`]), { delay: 0.3 });
    }
    if (!prev) return;
    if (s.clue && !prev.clue) {
      sfx.jingle();
      say(`From ${s.card[0]} to ${s.card[1]}. The clue is: ${s.clue}.`, { delay: 0.4, interrupt: true });
    }
    if (s.locked.length > prev.locked.length) sfx.click();
    if (s.phase === 'tune' && s.left !== prev.left && s.left <= 5 && s.left > 0) sfx.tick();
    if (s.phase === 'reveal' && prev.phase !== 'reveal' && s.reveal) {
      sfx.static(REVEAL_DELAY / 1000);
      const r = s.reveal;
      setTimeout(() => {
        sfx.tuneIn();
        if (r.pts === 4) {
          setTimeout(() => sfx.fanfare(), 500);
          say(pick(['Crystal clear!', 'Dead on. Crystal clear!', 'Perfect reception!']), { delay: 0.6 });
        } else if (r.pts > 0) say(`${r.zone}. ${r.pts} points.`, { delay: 0.6 });
        else {
          setTimeout(() => sfx.sadTrombone(), 500);
          say(pick(['Nothing but static.', 'Lost the signal!', 'Way off the dial.']), { delay: 0.6 });
        }
      }, REVEAL_DELAY);
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const dt = Math.min(0.1, (now - (lastNow || now)) / 1000);
    lastNow = now;
    const byId = new Map(s.players.map((p) => [p.id, p]));
    const dj = byId.get(s.dj);
    // A card for each new DJ, once the turn's clock starts (it stands still under the rules).
    // Done here, not in onSnapshot, which only runs once sound is on.
    if (s.turn < bannerTurn.turn) bannerTurn = { turn: 0, left: null };
    if (s.phase === 'pick' && s.turn !== bannerTurn.turn) {
      if (bannerTurn.left == null || bannerTurn.pending !== s.turn) bannerTurn = { turn: bannerTurn.turn, left: s.left, pending: s.turn };
      else if (s.left !== bannerTurn.left) {
        bannerTurn = { turn: s.turn, left: null };
        banner = { name: dj?.name ?? 'Someone', color: dj?.color ?? '#fff', at: now };
        turnAt = now;
      }
    }
    if (s.clue !== lastClue) {
      lastClue = s.clue;
      clueAt = now;
    }
    if (s.phase === 'reveal' && s.seq !== revealSeq) {
      revealSeq = s.seq;
      revealAt = now;
    }
    const sinceReveal = s.phase === 'reveal' ? now - revealAt : -1;
    const revealed = s.phase === 'reveal' && s.station != null && sinceReveal > REVEAL_DELAY;
    const rt = revealed ? (sinceReveal - REVEAL_DELAY) / 1000 : 0;
    const pts = s.reveal?.pts ?? 0;

    ctx.drawImage(background(W, H), 0, 0, W, H);

    // ---- Header ----
    drawRadio(ctx, 128, 92, 70);
    serif(ctx, 'TUNE IN', 182, 108, 44, GOLD);
    if (dj) {
      drawMic(ctx, 116, 158, 40, dj.color);
      text(ctx, `${dj.name} is the DJ`, 146, 168, { size: 28, weight: 800, align: 'left', color: dj.color });
    }
    if (s.turn > 0) text(ctx, `Turn ${s.turn} of ${s.turns}`, 1510, 76, { size: 24, weight: 700, align: 'right', color: '#b8a99a' });
    crewMeter(ctx, s, 1510, 128, revealed ? rt : -1);

    // The clue, typed out under a lit ON AIR lamp.
    drawOnAir(ctx, 800, 74, 150, 44, s.clue ? 0.75 + 0.25 * Math.sin(now / 260) : 0);
    if (s.clue) {
      const shownChars = Math.max(1, Math.floor((now - clueAt) / 45));
      const full = `“${s.clue}”`;
      ctx.font = `italic 900 76px ${SERIF}`;
      const size = Math.min(76, (76 * 1080) / Math.max(1, ctx.measureText(full).width));
      const part = full.slice(0, shownChars);
      ctx.font = `italic 900 ${size}px ${SERIF}`;
      const fullW = ctx.measureText(full).width;
      ctx.fillStyle = '#fbf1dc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.shadowColor = 'rgba(255,190,120,.35)';
      ctx.shadowBlur = 18;
      ctx.fillText(part, 800 - fullW / 2, 250);
      ctx.shadowBlur = 0;
    } else if (s.phase === 'pick' || s.phase === 'clue') {
      const wait = s.phase === 'pick' ? 'Picking a card' : 'Thinking of a clue';
      text(ctx, wait + '.'.repeat(Math.floor(now / 400) % 4), W / 2, 238, { size: 38, weight: 700, color: '#b8a99a' });
    }

    // ---- The radio ----
    if (s.crowd != null) shown += (s.crowd - shown) * Math.min(1, dt * 7);
    else shown = 50;
    const warm = clamp01((now - turnAt) / 1500);
    radio(ctx, s, now, { warm, sinceReveal, revealed, rt, pts });

    // Listener tabs above the glass, stacked when they're close.
    const listeners = s.needles.filter((n) => n.id !== s.dj).sort((a, b) => a.value - b.value);
    const placed = [];
    const tabPos = new Map();
    for (const n of listeners) {
      const x = xOf(n.value);
      let level = 0;
      while (placed.some((p) => p.level === level && Math.abs(p.x - x) < 36)) level++;
      placed.push({ x, level });
      const y = GY0 - 40 - level * 34;
      const p = byId.get(n.id);
      drawTab(ctx, x, y + Math.sin(now / 400 + x) * 1.5, 16, p?.color ?? '#888', (p?.name ?? '?').charAt(0).toUpperCase(), GY0 - 6);
      if (s.locked.includes(n.id)) drawCheck(ctx, x + 17, y - 12, 18);
      tabPos.set(n.id, [x, y]);
    }

    // Crowd needle, eased.
    if (s.crowd != null) drawNeedle(ctx, xOf(shown), GY0, GY1 - GY0, { width: 6 });

    // Notes or sparks out of the speaker.
    drawNotes(ctx, now);

    // ---- Status line + timer ----
    const status = {
      pick: '',
      clue: '',
      tune: 'Drag your needle on your phone. Talk it out!',
      reveal: revealed ? `${s.reveal.zone}! The crew scores ${pts}` : 'Searching for the station…',
    }[s.phase];
    text(ctx, status, 90, 722, { size: 28, weight: 800, align: 'left', color: s.phase === 'reveal' && revealed ? (ZONE_COLORS[4 - pts] ?? '#b8a99a') : '#ffc93c' });
    if (s.phase !== 'reveal') {
      const f = clamp01(s.left / ({ pick: 25, clue: 75, tune: 60 }[s.phase] ?? 60));
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(255,255,255,.1)';
      ctx.beginPath();
      ctx.arc(1488, 712, 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = s.left <= 5 ? '#ff8c8c' : GOLD;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(1488, 712, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
      ctx.stroke();
      ctx.restore();
      text(ctx, `${s.left}`, 1488, 720, { size: 20, weight: 900, color: s.left <= 5 ? '#ff8c8c' : '#f2f4f8' });
    }

    // ---- Players, in seat order ----
    const n = s.players.length;
    const cw = Math.min(260, 1420 / n);
    const gained = new Map((s.reveal?.rows ?? []).map((r) => [r.id, r.pts]));
    if (s.reveal) gained.set(s.dj, s.reveal.pts);
    const landAt = 2.0; // seconds after the reveal that points land
    s.players.forEach((p, i) => {
      const x = 90 + i * cw;
      const y = PLAYER_Y;
      const g = gained.get(p.id) ?? 0;
      const land = revealed && g ? rt - landAt : -1;
      const flash = land >= 0 && land < 0.6 ? 1 - land / 0.6 : 0;
      ctx.globalAlpha = p.connected ? 1 : 0.45;
      ctx.fillStyle = flash ? `rgba(255,210,122,${0.1 + flash * 0.3})` : p.id === s.dj ? 'rgba(255,230,190,.1)' : 'rgba(0,0,0,.3)';
      ctx.beginPath();
      ctx.roundRect(x, y - 38, cw - 12, 76, 14);
      ctx.fill();
      ctx.strokeStyle = p.id === s.dj ? 'rgba(232,200,120,.7)' : 'rgba(232,200,120,.18)';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawTab(ctx, x + 26, y - 6, 13, p.color, p.name.charAt(0).toUpperCase());
      ctx.font = '700 23px system-ui, -apple-system, sans-serif';
      text(ctx, fit(ctx, p.name, cw - 112), x + 48, y + 2, { size: 23, weight: 700, align: 'left' });
      const shownScore = revealed && land < 0 && g ? p.score - g : p.score;
      const bump = land >= 0 && land < 0.3 ? 1 + 0.35 * Math.sin((land / 0.3) * Math.PI) : 1;
      serif(ctx, String(shownScore), x + cw - 26, y + 10 * bump, 32 * bump, GOLD, 'right');
      let note = '';
      if (p.id === s.dj) {
        drawMic(ctx, x + 56, y + 22, 18, p.color);
        note = revealed && land >= 0 ? `DJ +${s.reveal.pts}` : 'DJ';
        text(ctx, note, x + 70, y + 28, { size: 17, weight: 800, align: 'left', color: '#b8a99a' });
      } else {
        if (s.phase === 'tune') note = s.locked.includes(p.id) ? 'locked in' : s.needles.some((q) => q.id === p.id) ? 'tuning…' : '';
        else if (revealed && land >= 0 && g) note = `+${g}`;
        if (note === 'locked in') drawCheck(ctx, x + 56, y + 22, 16);
        text(ctx, note, x + (note === 'locked in' ? 70 : 48), y + 28, { size: 17, weight: 800, align: 'left', color: note.startsWith('+') ? GOLD : '#b8a99a' });
      }
      ctx.globalAlpha = 1;

      // Points fly from the needle (or the speaker, for the DJ) down to the player.
      if (revealed && g && land < 0) {
        const from = p.id === s.dj ? [800, 600] : tabPos.get(p.id);
        if (from) {
          const pop = clamp01((rt - 0.7) * 5);
          const q = clamp01((rt - 1.3) / 0.7);
          const e = ease(q);
          const ex = x + cw - 40;
          const ey = y - 34;
          const bx = from[0] + (ex - from[0]) * e;
          const by = from[1] - 30 + (ey - from[1] + 30) * e - Math.sin(q * Math.PI) * 90;
          if (pop > 0) badge(ctx, bx, by, `+${g}`, p.color, 0.6 + 0.4 * pop);
        }
      }
    });

    text(ctx, 'Crystal clear 4 · Clear 3 · Crackly 2 · the crew shares the points, your own needle scores for you', W / 2, 850, { size: 19, weight: 600, color: '#8a7a6e' });

    // ---- New DJ card ----
    if (banner) {
      const t = (now - banner.at) / 1000;
      if (t > 2.6) banner = null;
      else djCard(ctx, banner, t);
    }
  },
};

// ---- The radio --------------------------------------------------------------------------------

function radio(ctx, s, now, { warm, sinceReveal, revealed, rt, pts }) {
  const { x, y, w, h } = CAB;
  // Shadow on the wall, the cabinet, a brass inlay.
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 16, w, h, 34);
  ctx.fill();
  drawWood(ctx, x, y, w, h, 34, 17);
  ctx.strokeStyle = '#c9a25a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x + 18, y + 16, w - 36, h - 32, 22);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(40,20,8,.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x + 24, y + 22, w - 48, h - 44, 18);
  ctx.stroke();
  // Feet
  for (const fx of [x + 90, x + w - 130]) {
    ctx.fillStyle = '#2a160a';
    ctx.beginPath();
    ctx.roundRect(fx, y + h - 4, 40, 18, 6);
    ctx.fill();
  }

  // The glass: dim while the radio warms up, flickering in the static, bright at the reveal.
  const inStatic = s.phase === 'reveal' && !revealed;
  const glow = s.phase === 'pick' ? 0.15 + 0.45 * warm : inStatic ? 0.3 + Math.random() * 0.4 : revealed ? 0.85 + 0.15 * Math.sin(now / 120) : 0.6 + 0.05 * Math.sin(now / 700);
  drawGlass(ctx, BX0 - 26, GY0, BX1 - BX0 + 52, GY1 - GY0, xOf, { glow });

  // Reveal: static, then the zones sweep open from the station.
  if (s.phase === 'reveal' && s.station != null) {
    if (!revealed) staticOver(ctx, now);
    else {
      const open = ease(clamp01(rt / 0.6));
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(BX0 - 26, GY0, BX1 - BX0 + 52, GY1 - GY0, 12);
      ctx.clip();
      [...s.zones].reverse().forEach((z, i) => {
        const half = z.within * open;
        const x0 = xOf(Math.max(0, s.station - half));
        const x1 = xOf(Math.min(100, s.station + half));
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = ZONE_COLORS[s.zones.length - 1 - i];
        ctx.fillRect(x0, GY0 + 4, x1 - x0, GY1 - GY0 - 8);
      });
      ctx.globalAlpha = clamp01((rt - 0.4) * 3);
      s.zones.forEach((z, i) => {
        const mid = i === 0 ? 0 : (s.zones[i - 1].within + z.within) / 2;
        for (const side of i === 0 ? [0] : [-1, 1]) {
          const v = s.station + side * mid;
          if (v >= 0 && v <= 100) serif(ctx, String(z.pts), xOf(v) + (i === 0 ? 22 : 0), GY1 - 26, 28, '#3a1a10', 'center');
        }
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 14;
      ctx.fillRect(xOf(s.station) - 2, GY0 - 6, 4, GY1 - GY0 + 12);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  } else if (s.phase === 'pick') staticOver(ctx, now, 0.3 * (1 - warm) + 0.08);

  // Under the glass: the two ideas on brass-framed plaques, the speaker, the knobs and the eye.
  const [left, right] = s.card ?? ['?', '?'];
  plaque(ctx, BX0 - 26, 528, 400, 104, left, '#8fd3f0', 'left');
  plaque(ctx, BX1 + 26 - 400, 528, 400, 104, right, '#ffb27a', 'right');
  const pulse = revealed && pts > 0 ? 0.5 + 0.5 * Math.sin(now / 90) : now - clueAt < 1200 && s.clue ? 0.5 + 0.5 * Math.sin(now / 70) : 0;
  drawGrille(ctx, 590, 528, 420, 104, pulse * 0.8);
  const jiggle = inStatic ? (Math.random() - 0.5) * 0.3 : 0;
  drawKnob(ctx, 642, 580, 40, -0.8 + jiggle);
  drawKnob(ctx, 958, 580, 40, ((s.crowd != null ? shown : 50) / 100) * Math.PI * 3 - Math.PI * 1.5);
  let eyeOpen = 0.7 + 0.08 * Math.sin(now / 300);
  if (s.phase === 'pick') eyeOpen = 1 - warm * 0.3;
  if (inStatic) eyeOpen = 0.4 + Math.random() * 0.6;
  if (revealed) eyeOpen = 0.7 + (1 - pts / 4 - 0.7) * ease(clamp01(rt / 0.8));
  drawMagicEye(ctx, 800, 580, 32, eyeOpen, 0.35 + 0.65 * (s.phase === 'pick' ? warm : 1));

  // Notes (good reception) or sparks (none) pour out of the speaker once.
  if (revealed && emitted !== revealSeq) {
    emitted = revealSeq;
    const count = pts ? pts * 5 : 14;
    for (let i = 0; i < count; i++) {
      notes.push({
        x: 640 + Math.random() * 320,
        y: 560 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 2.4,
        vy: -(1.6 + Math.random() * 2.2),
        at: now + i * (pts ? 90 : 40),
        life: 1500 + Math.random() * 900,
        color: pts ? ZONE_COLORS[4 - pts] : '#c9ced8',
        kind: pts ? 'note' : 'spark',
        size: 22 + Math.random() * 16,
      });
    }
  }
}

function plaque(ctx, x, y, w, h, str, color, align) {
  ctx.save();
  ctx.fillStyle = 'rgba(20,10,4,.75)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = '#c9a25a';
  ctx.lineWidth = 2;
  ctx.stroke();
  // a little drawn arrow pointing off its end of the band
  const ax = align === 'left' ? x + 24 : x + w - 24;
  const dir = align === 'left' ? -1 : 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(ax + dir * 10, y + h / 2);
  ctx.lineTo(ax - dir * 8, y + h / 2 - 13);
  ctx.lineTo(ax - dir * 8, y + h / 2 + 13);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  const tx = align === 'left' ? x + 48 : x + w - 48;
  wrapText(ctx, str, tx, y + h / 2, w - 70, { size: 34, weight: 900, align, color });
}

function staticOver(ctx, now, alpha = 0.9) {
  if (!speckle) {
    speckle = document.createElement('canvas');
    speckle.width = 640;
    speckle.height = 70;
  }
  const g = speckle.getContext('2d');
  const img = g.createImageData(speckle.width, speckle.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v * 0.92;
    img.data[i + 2] = v * 0.78;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(now / 50));
  ctx.imageSmoothingEnabled = false;
  ctx.beginPath();
  ctx.roundRect(BX0 - 26, GY0, BX1 - BX0 + 52, GY1 - GY0, 12);
  ctx.clip();
  ctx.drawImage(speckle, BX0 - 26, GY0, BX1 - BX0 + 52, GY1 - GY0);
  ctx.restore();
}

function drawNotes(ctx, now) {
  notes = notes.filter((n) => now - n.at < n.life);
  for (const n of notes) {
    const age = now - n.at;
    if (age < 0) continue;
    const t = age / 16.7;
    const x = n.x + n.vx * t + Math.sin(t / 8) * 10;
    const y = n.y + n.vy * t;
    ctx.globalAlpha = clamp01(1 - age / n.life) * clamp01(age / 150);
    if (n.kind === 'note') drawNote(ctx, x, y, n.size, n.color, n.size > 30);
    else {
      ctx.strokeStyle = n.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 8, y - 8);
      ctx.lineTo(x + 2, y - 12);
      ctx.lineTo(x + 10, y - 22);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/** Signal bars for every turn played, height = points, and the crew score (ticking up at the reveal). */
function crewMeter(ctx, s, xr, y, rt) {
  const pts = s.reveal?.pts ?? 0;
  const landed = rt >= 2.0 || rt < 0;
  const crew = landed ? s.crew : s.crew - pts;
  const bump = rt >= 2.0 && rt < 2.3 ? 1 + 0.35 * Math.sin(((rt - 2.0) / 0.3) * Math.PI) : 1;
  serif(ctx, `Crew ${crew}`, xr, y + 10, 34 * bump, GOLD, 'right');
  const bars = s.history.slice(-12);
  ctx.font = `900 34px ${SERIF}`;
  const textW = ctx.measureText(`Crew ${crew}`).width;
  bars.forEach((p, i) => {
    const bx = xr - textW - 30 - (bars.length - i) * 18;
    if (!landed && i === bars.length - 1 && s.phase === 'reveal') return;
    ctx.fillStyle = 'rgba(255,255,255,.1)';
    ctx.beginPath();
    ctx.roundRect(bx, y - 22, 12, 32, 3);
    ctx.fill();
    if (p) {
      ctx.fillStyle = ZONE_COLORS[4 - p];
      ctx.beginPath();
      ctx.roundRect(bx, y + 10 - (32 * p) / 4, 12, (32 * p) / 4, 3);
      ctx.fill();
    }
  });
  if (!bars.length) drawBars(ctx, xr - textW - 40, y - 6, 34, 0);
}

function badge(ctx, x, y, label, color, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = 'rgba(20,10,4,.85)';
  ctx.beginPath();
  ctx.roundRect(-34, -22, 68, 44, 22);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = `900 30px ${SERIF}`;
  ctx.fillStyle = GOLD;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, 2);
  ctx.restore();
}

/** "Over to <name>": a card with a microphone that slides over the radio. */
function djCard(ctx, b, t) {
  const inQ = ease(clamp01(t / 0.45));
  const outQ = clamp01((t - 2.1) / 0.5);
  const w = 620;
  const h = 130;
  const x = 800 - w / 2;
  const y = 380 + (1 - inQ) * 60 - outQ * 40;
  ctx.save();
  ctx.globalAlpha = inQ * (1 - outQ);
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath();
  ctx.roundRect(x + 8, y + 12, w, h, 20);
  ctx.fill();
  const cg = ctx.createLinearGradient(0, y, 0, y + h);
  cg.addColorStop(0, '#fbf1dc');
  cg.addColorStop(1, '#e9d6b0');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 20);
  ctx.fill();
  ctx.strokeStyle = b.color;
  ctx.lineWidth = 6;
  ctx.stroke();
  drawMic(ctx, x + 80, y + h / 2 + 6, 90, b.color);
  text(ctx, 'NOW ON THE AIR', x + 150, y + 46, { size: 20, weight: 900, align: 'left', color: '#8a6a4a' });
  ctx.font = `900 50px ${SERIF}`;
  const size = Math.min(50, (50 * (w - 180)) / Math.max(1, ctx.measureText(b.name).width));
  serif(ctx, b.name, x + 150, y + 100, size, '#2a1a10');
  ctx.restore();
}

/** The wall behind the radio: striped wallpaper, a lamp's glow and a wooden shelf. */
function background(W, H) {
  if (bgCache) return bgCache;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#1e1619';
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 56) {
    g.fillStyle = 'rgba(255,220,180,.03)';
    g.fillRect(x, 0, 28, H);
    g.fillStyle = 'rgba(255,220,180,.05)';
    g.fillRect(x + 27, 0, 2, H);
  }
  // little diamonds on the wallpaper
  const rand = rng(8);
  g.fillStyle = 'rgba(255,210,122,.05)';
  for (let x = 14; x < W; x += 56) {
    for (let y = 30 + (x % 112 ? 28 : 0); y < H; y += 56) {
      g.beginPath();
      g.moveTo(x, y - 6);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 6);
      g.lineTo(x - 5, y);
      g.closePath();
      g.fill();
    }
  }
  void rand;
  const lamp = g.createRadialGradient(800, 380, 80, 800, 380, 900);
  lamp.addColorStop(0, 'rgba(255,190,120,.16)');
  lamp.addColorStop(1, 'rgba(0,0,0,.55)');
  g.fillStyle = lamp;
  g.fillRect(0, 0, W, H);
  // the shelf the radio sits on
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.fillRect(40, 684, W - 80, 16);
  drawWood(g, 40, 668, W - 80, 20, 4, 31, -0.15);
  bgCache = c;
  return c;
}

function serif(ctx, str, x, y, size, color, align = 'left') {
  ctx.font = `900 ${size}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

// ---- How-to-play pictures (the steps are in server/games/tunein.js) ---------------------
// box = { x, y, w, h } on the TV; t = seconds into the step.
function drawRules(ctx, art, t, box, now) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const w = box.w - 120;
  const x0 = cx - w / 2;
  const at = (v) => x0 + (w * v) / 100;
  const y0 = cy - 20;
  const y1 = cy + 70;
  const STATION = 62;
  ctx.save();
  drawWood(ctx, x0 - 40, y0 - 30, w + 80, y1 - y0 + 150, 24, 4);
  drawGlass(ctx, x0 - 10, y0, w + 20, y1 - y0, at, { glow: 0.7 });
  plaque(ctx, x0 - 10, y1 + 16, 300, 70, 'Bland', '#8fd3f0', 'left');
  plaque(ctx, x0 + w + 10 - 300, y1 + 16, 300, 70, 'Spicy', '#ffb27a', 'right');

  const zones = (alpha, open = 1) => {
    ctx.globalAlpha = alpha;
    [[13, ZONE_COLORS[2]], [8, ZONE_COLORS[1]], [3, ZONE_COLORS[0]]].forEach(([d, c]) => {
      ctx.fillStyle = c;
      ctx.fillRect(at(STATION - d * open), y0 + 3, at(STATION + d * open) - at(STATION - d * open), y1 - y0 - 6);
    });
    for (const [v, pts] of [[STATION, 4], [STATION - 5.5, 3], [STATION + 5.5, 3], [STATION - 10.5, 2], [STATION + 10.5, 2]]) serif(ctx, String(pts), at(v), y1 - 14, 24, '#3a1a10', 'center');
    ctx.fillStyle = '#fff';
    ctx.fillRect(at(STATION) - 2, y0 - 4, 4, y1 - y0 + 8);
    ctx.globalAlpha = 1;
  };

  if (art === 'band') {
    // The station and its zones, which only the DJ gets to see.
    zones(0.35 + 0.25 * Math.sin(now / 300));
    text(ctx, 'Only the DJ sees this', at(STATION), y0 - 50, { size: 26, weight: 800, color: '#ffc93c' });
  } else if (art === 'clue') {
    drawOnAir(ctx, cx - 230, y0 - 100, 130, 40, t > 0.4 ? 1 : 0);
    const shownChars = Math.max(0, Math.floor((t - 0.4) / 0.08));
    serif(ctx, '“Salsa”'.slice(0, shownChars), cx - 140, y0 - 82, 54, '#fbf1dc');
    drawMic(ctx, cx + 220, y0 - 90, 70, '#ff5a5f');
  } else if (art === 'needles') {
    const ms = [
      [40 + 22 * Math.sin(t * 1.3), '#ff5a5f', 'M'],
      [75 + 10 * Math.sin(t * 1.7 + 1), '#3fa7ff', 'T'],
      [58 + 18 * Math.sin(t * 1.1 + 2), '#4cd97b', 'B'],
    ];
    ms.forEach(([v, c, l], i) => drawTab(ctx, at(v), y0 - 36 - i * 34, 16, c, l, y0 - 4));
    const avg = ms.reduce((a, m) => a + m[0], 0) / ms.length;
    drawNeedle(ctx, at(avg), y0, y1 - y0, { width: 6 });
    text(ctx, 'average', at(avg), y1 + 104, { size: 22, weight: 800, color: '#ff8c8c' });
  } else if (art === 'score') {
    const slide = Math.min(1, t / 1.4);
    const v = 30 + (58.5 - 30) * (1 - (1 - slide) ** 3);
    if (t > 1.6) zones(1, ease(clamp01((t - 1.6) / 0.6)));
    drawNeedle(ctx, at(v), y0, y1 - y0, { width: 6 });
    if (t > 2.1) {
      serif(ctx, '+3 Clear!', at(v), y0 - 46, 36, ZONE_COLORS[1], 'center');
      for (let i = 0; i < 4; i++) {
        const q = ((t - 2.1) * 0.6 + i * 0.25) % 1;
        ctx.globalAlpha = 1 - q;
        drawNote(ctx, cx - 120 + i * 80, y1 + 90 - q * 120, 30, ZONE_COLORS[1], i % 2 === 0);
      }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

/** Up to two lines, vertically centred on y. */
function wrapText(ctx, str, x, y, maxW, opts) {
  let size = opts.size;
  let lines;
  for (;;) {
    ctx.font = `${opts.weight} ${size}px system-ui, -apple-system, sans-serif`;
    const words = String(str).split(' ');
    lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = t;
    }
    lines.push(line);
    if ((lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= maxW)) || size <= 18) break;
    size -= 2;
  }
  lines = lines.slice(0, 2);
  const lh = size + 6;
  lines.forEach((l, i) => text(ctx, l, x, y + size * 0.36 + (i - (lines.length - 1) / 2) * lh, { ...opts, size }));
}

function fit(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  while (str.length > 1 && ctx.measureText(`${str}…`).width > maxW) str = str.slice(0, -1);
  return `${str}…`;
}
