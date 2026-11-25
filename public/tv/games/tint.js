// Tint & Tell TV: a painter's studio. The color wheel sits in a turned-wood rim on the left, with a
// closed paint tin in the middle and everyone's push pins on it; the clues are paper notes taped to
// the panel on the right, above the scores. All the drawn pieces are in public/art/tint.js.
//
// Things that happen get a little show: a ribbon names each new Teller, clues slap onto the panel,
// pins drop in and bounce. At the reveal the tin rattles through a drumroll, the lid pops off and the
// secret color splashes out, the scoring zone ripples out around it, and the points fly from each
// pin to its owner's row. The wheel's swatches are always drawn in their exact colors.

import { text } from './util.js';
import { drawBlob, drawBrush, drawCheck, drawChip, drawPalette, drawSplat, drawTube, rng, wheelMiddle, wheelPin, wheelRim } from '../../art/tint.js';

const CX = 540;
const CY = 468;
const R = 350;
const R0 = R * 0.22;
const REVEAL_DELAY = 1300; // ms of drumroll before the answer shows
const PANEL = { x: 1000, y: 40, w: 550, h: 820 };
const SERIF = 'Georgia, "Times New Roman", serif';
const GOLD = '#ffd27a';
const PIN = 28;

// Animation state (TV only).
let revealSeq = -1;
let revealAt = 0;
const pinAt = new Map(); // `${id}:${cell}` -> when that pin landed
const clueAt = []; // when each clue appeared
let banner = null; // { text, color, at }
let bannerTurn = { turn: 0, left: null }; // the turn whose ribbon has shown (or is waiting for the clock)
let parts = []; // paint droplets: { x, y, vx, vy, at, life, color, size }
let splashed = -1; // the reveal seq that has splashed
let seqTotal = { seq: -1, left: 1 }; // the phase's full time, for the timer ring
let lastTurn = 0;
let bgCache = null;
let wheelCache = null; // offscreen canvas of the wheel itself
let lastColors = null; // for the rules pictures

const ease = (q) => 1 - (1 - q) ** 3;
const clamp01 = (q) => Math.max(0, Math.min(1, q));
const bounce = (q) => {
  if (q >= 1) return 1;
  const a = ease(q);
  return a + Math.sin(q * Math.PI) * 0.18;
};

export default {
  drawRules, // the how-to-play pictures; the steps themselves are in server/games/tint.js

  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    // The how-to-play intro pauses snapshots, so announce each Teller the first time we see their turn.
    if (s.turn < lastTurn) lastTurn = 0; // a new game
    if (s.phase === 'pick' && s.turn !== lastTurn) {
      const first = lastTurn === 0;
      lastTurn = s.turn;
      sfx.chime();
      say(first ? pick([`Tint and Tell! ${nameOf(s.teller)} goes first.`, `Eyes on the wheel. ${nameOf(s.teller)} is the first Teller.`]) : `${nameOf(s.teller)} is the Teller.`, { delay: 0.3 });
    }
    if (!prev) return;
    if (s.clues.length > prev.clues.length) {
      sfx.jingle();
      say(s.clues.length === 1 ? `The clue is: ${s.clues[0]}.` : `Second clue: ${s.clues[1]}.`, { delay: 0.4, interrupt: true });
    }
    if (s.locked.length > prev.locked.length) sfx.click();
    if ((s.phase === 'guess1' || s.phase === 'guess2') && s.left !== prev.left && s.left <= 5 && s.left > 0) sfx.tick();
    if (s.phase === 'reveal' && prev.phase !== 'reveal' && s.reveal) {
      sfx.drumroll(REVEAL_DELAY / 1000);
      const rows = s.reveal.rows.filter((r) => r.cell != null);
      const bulls = rows.filter((r) => r.steps === 0);
      setTimeout(() => {
        sfx.splash();
        if (bulls.length) {
          sfx.fanfare();
          say(bulls.length > 1 ? `${bulls.length} bullseyes!` : `Bullseye for ${nameOf(bulls[0].id)}!`);
        } else if (rows.some((r) => r.pts > 0)) {
          sfx.chime();
          const best = [...rows].sort((a, b) => a.steps - b.steps)[0];
          say(pick([`Closest: ${nameOf(best.id)}.`, `${nameOf(best.id)} was nearest.`]));
        } else {
          sfx.sadTrombone();
          say(pick(['Nobody even close!', 'Way off, everyone.']));
        }
      }, REVEAL_DELAY + 100);
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    lastColors = s.colors;
    // A ribbon for each new Teller, once the turn's clock starts (it stands still under the rules).
    // Done here, not in onSnapshot, which only runs once sound is on.
    if (s.turn < bannerTurn.turn) bannerTurn = { turn: 0, left: null };
    if (s.phase === 'pick' && s.turn !== bannerTurn.turn) {
      if (bannerTurn.left == null || bannerTurn.pending !== s.turn) bannerTurn = { turn: bannerTurn.turn, left: s.left, pending: s.turn };
      else if (s.left !== bannerTurn.left) {
        bannerTurn = { turn: s.turn, left: null };
        const p = s.players.find((x) => x.id === s.teller);
        banner = { text: `${p?.name ?? 'Someone'} is the Teller`, color: p?.color ?? '#fff', at: now };
      }
    }
    ctx.drawImage(background(W, H), 0, 0, W, H);

    const byId = new Map(s.players.map((p) => [p.id, p]));
    const teller = byId.get(s.teller);
    const geo = geometry(s, CX, CY, R, R0);
    if (s.phase === 'reveal' && s.seq !== revealSeq) {
      revealSeq = s.seq;
      revealAt = now;
    }
    if (s.seq !== seqTotal.seq) seqTotal = { seq: s.seq, left: Math.max(1, s.left) };
    const sinceReveal = s.phase === 'reveal' ? now - revealAt : -1;
    const revealed = s.phase === 'reveal' && s.target != null && sinceReveal > REVEAL_DELAY;
    const rt = revealed ? (sinceReveal - REVEAL_DELAY) / 1000 : 0; // seconds since the answer showed

    // Clue timings, for the slap-in.
    while (clueAt.length > s.clues.length) clueAt.pop();
    while (clueAt.length < s.clues.length) clueAt.push(now);

    // ---- The wheel ----
    wheelRim(ctx, CX, CY, R + 2);
    if (!wheelCache || wheelCache.key !== s.colors.join()) wheelCache = buildWheel(s);
    ctx.drawImage(wheelCache.canvas, CX - R - 4, CY - R - 4);

    // The scoring zone ripples out from the answer: 1, 2 and 3 steps away, one ring at a time.
    if (revealed) {
      for (let c = 0; c < s.hues * s.rings; c++) {
        const d = steps(s, c, s.target);
        if (d > 3 || d === 0) continue;
        const a = clamp01((rt - 0.15 * d) * 4);
        if (a <= 0) continue;
        geo.path(ctx, c);
        ctx.fillStyle = `rgba(255,255,255,${(0.36 - d * 0.08) * a})`;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
        ctx.stroke();
      }
    }

    // Middle: the closed tin until the reveal; then the lid pops and the color is there.
    const wobble = s.phase === 'reveal' && !revealed ? clamp01(sinceReveal / REVEAL_DELAY) : s.phase === 'pick' ? 0.25 + 0.1 * Math.sin(now / 300) : 0;
    const shakeT = s.phase === 'reveal' && !revealed ? now / 1000 : now / 4000;
    if (revealed) {
      const grow = ease(clamp01(rt * 3));
      wheelMiddle(ctx, CX, CY, (R0 - 6) * (0.4 + 0.6 * grow), s.colors[s.target], { lid: clamp01(rt * 1.8) });
      if (splashed !== revealSeq) {
        splashed = revealSeq;
        splash(CX, CY, s.colors[s.target], now);
      }
      if (rt < 0.6) wheelMiddle(ctx, CX, CY, R0 - 6, null, { lid: clamp01(rt * 1.8) });
    } else wheelMiddle(ctx, CX, CY, R0 - 6, null, { wobble: wobble * (0.6 + 0.4 * Math.sin(shakeT * 7)) });

    // First pins (a dashed ring in the player's color) during the second guess, if they've moved since.
    const pins = new Map(s.pins.map((p) => [p.id, p.cell]));
    for (const f of s.phase === 'guess2' ? s.firsts : []) {
      if (pins.get(f.id) === f.cell) continue;
      const [x, y] = geo.centre(f.cell);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = byId.get(f.id)?.color ?? '#888';
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // The answer's outline, pulsing (under the pins so they stay readable).
    if (revealed) {
      geo.path(ctx, s.target);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#0d0f14';
      ctx.stroke();
      ctx.lineWidth = 5 + 1.5 * Math.sin(now / 160);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }

    // Pins drop in and bounce, spread out a little when they share a swatch.
    const perCell = new Map();
    for (const p of s.pins) perCell.set(p.cell, [...(perCell.get(p.cell) ?? []), p.id]);
    const pinPos = new Map();
    for (const [cell, ids] of perCell) {
      const [cx, cy] = geo.centre(cell);
      ids.forEach((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
        const off = ids.length > 1 ? 12 : 0;
        const key = `${id}:${cell}`;
        if (!pinAt.has(key)) pinAt.set(key, now);
        const q = clamp01((now - pinAt.get(key)) / 380);
        const x = cx + Math.cos(a) * off;
        const y = cy + Math.sin(a) * off;
        pinPos.set(id, [x, y]);
        const p = byId.get(id);
        ctx.globalAlpha = clamp01(q * 3);
        wheelPin(ctx, x, y - (1 - bounce(q)) * 70, PIN, p?.color ?? '#888', (p?.name ?? '?').charAt(0).toUpperCase());
        ctx.globalAlpha = 1;
      });
    }
    if (pinAt.size > 400) pinAt.clear();

    // Paint droplets from the splash.
    drawParts(ctx, now);

    // Points pop over each pin, then fly to the scoreboard.
    // During the reveal the rows keep their order from before the points, so nothing jumps mid-flight.
    const before = new Map((s.reveal?.rows ?? []).map((r) => [r.id, r.pts + r.bonus]));
    if (s.reveal) before.set(s.teller, s.reveal.tellerPts);
    const order = (p) => p.score - (s.phase === 'reveal' ? (before.get(p.id) ?? 0) : 0);
    const rowsSorted = [...s.players].sort((a, b) => order(b) - order(a));
    const rowH = Math.min(48, 300 / Math.max(1, rowsSorted.length));
    const rowYOf = (id) => 520 + rowsSorted.findIndex((p) => p.id === id) * rowH;
    const flying = new Map(); // id -> landed (for the row flash)
    if (revealed) {
      for (const r of s.reveal.rows) {
        if (r.cell == null || !(r.pts + r.bonus)) continue;
        const pos = pinPos.get(r.id);
        if (!pos) continue;
        const pts = r.pts + r.bonus;
        const p = byId.get(r.id);
        const q = clamp01((rt - 1.6) / 0.7);
        const pop = clamp01((rt - 0.5) * 5);
        if (pop <= 0) continue;
        const sx = pos[0] - 10;
        const sy = pos[1] - 54;
        const ex = PANEL.x + PANEL.w - 110;
        const ey = rowYOf(r.id);
        const e = ease(q);
        const x = sx + (ex - sx) * e;
        const y = sy + (ey - sy) * e - Math.sin(q * Math.PI) * 80;
        if (q < 1) pointsBadge(ctx, x, y, `+${pts}`, p?.color ?? '#fff', 0.7 + 0.3 * bounce(pop) - q * 0.3);
        flying.set(r.id, q >= 1 ? rt - 2.3 : -1);
        if (r.steps === 0) starBurst(ctx, pos[0] - 9, pos[1] - 17, rt, p?.color ?? '#fff');
      }
      // The Teller's share flies from the tin.
      if (s.reveal.tellerPts) {
        const q = clamp01((rt - 1.9) / 0.7);
        if (q < 1 && rt > 0.6) {
          const e = ease(q);
          const ey = rowYOf(s.teller);
          pointsBadge(ctx, CX + (PANEL.x + PANEL.w - 110 - CX) * e, CY - 40 + (ey - CY + 40) * e - Math.sin(q * Math.PI) * 120, `+${s.reveal.tellerPts}`, teller?.color ?? '#fff', 0.9);
        }
        flying.set(s.teller, q >= 1 ? rt - 2.6 : -1);
      }
    }

    // ---- Panel ----
    drawPanel(ctx, s, now, { byId, teller, revealed, rt, rowsSorted, rowH, flying, sinceReveal });

    // ---- New Teller ribbon ----
    if (banner) {
      const t = (now - banner.at) / 1000;
      if (t > 2.6) banner = null;
      else ribbon(ctx, banner, t);
    }
  },
};

// ---- Panel ---------------------------------------------------------------------------------------

function drawPanel(ctx, s, now, { byId, teller, revealed, rt, rowsSorted, rowH, flying, sinceReveal }) {
  const { x: X0, y: Y0, w: PW, h: PH } = PANEL;
  const X = X0 + 30;
  const XR = X0 + PW - 30;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.roundRect(X0 + 6, Y0 + 10, PW, PH, 26);
  ctx.fill();
  ctx.fillStyle = 'rgba(22,18,24,.94)';
  ctx.beginPath();
  ctx.roundRect(X0, Y0, PW, PH, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,210,122,.18)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  serif(ctx, 'TINT & TELL', X, Y0 + 62, 38, GOLD);
  text(ctx, `Turn ${s.turn} of ${s.turns}`, XR, Y0 + 58, { size: 22, weight: 700, align: 'right', color: '#a69ba8' });

  if (teller) {
    drawBrush(ctx, X + 20, Y0 + 112, 34, -0.7, teller.color);
    text(ctx, `${teller.name} is the Teller`, X + 50, Y0 + 116, { size: 28, weight: 800, align: 'left', color: teller.color });
  }

  // Clues: paper notes, taped on. The latest is the big one.
  const clueTop = Y0 + 150;
  if (!s.clues.length) {
    const wait = s.phase === 'pick' ? 'Choosing a secret color' : 'Thinking of one word';
    dashedNote(ctx, X, clueTop, PW - 60, 92, wait + '.'.repeat(Math.floor(now / 400) % 4));
  }
  let y = clueTop;
  s.clues.forEach((c, i) => {
    const latest = i === s.clues.length - 1;
    const h = latest ? 116 : 76;
    const age = (now - (clueAt[i] ?? 0)) / 1000;
    note(ctx, X, y, PW - 60, h, `“${cap(c)}”`, latest ? 58 : 36, i === 0 ? -0.018 : 0.012, age, i === 0 ? 'One word' : 'Two words', teller?.color);
    y += h + 18;
  });
  if (s.phase === 'clue2') dashedNote(ctx, X, y, PW - 60, 76, 'Two words coming' + '.'.repeat(Math.floor(now / 400) % 4));

  // Status + timer ring.
  const status = {
    pick: '',
    clue1: '',
    guess1: 'Tap your phone to place a pin',
    clue2: '',
    guess2: 'Move your pin, or keep it for +1',
    reveal: revealed ? (s.reveal.rows.some((r) => r.steps === 0) ? 'Bullseye!' : 'Here it is!') : 'And the color is…',
  }[s.phase];
  text(ctx, status, X, 472, { size: 26, weight: 800, align: 'left', color: '#ffc93c' });
  if (s.phase !== 'reveal') timerRing(ctx, XR - 26, 462, 24, s.left, seqTotal.left);

  // Scoreboard, best first. During a guess, a tick shows who's locked in.
  const locked = new Set(s.locked);
  const gained = new Map((s.reveal?.rows ?? []).map((r) => [r.id, r.pts + r.bonus]));
  if (s.reveal) gained.set(s.teller, s.reveal.tellerPts);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(X, 496);
  ctx.lineTo(XR, 496);
  ctx.stroke();
  rowsSorted.forEach((p, i) => {
    const ry = 520 + i * rowH;
    ctx.globalAlpha = p.connected ? 1 : 0.5;
    const land = flying.get(p.id) ?? -1;
    if (p.id === s.teller || land >= 0) {
      const flash = land >= 0 && land < 0.6 ? 1 - land / 0.6 : 0;
      ctx.fillStyle = flash ? `rgba(255,210,122,${0.08 + flash * 0.3})` : 'rgba(255,255,255,.06)';
      ctx.beginPath();
      ctx.roundRect(X - 12, ry - rowH / 2 + 2, PW - 36, rowH - 4, 10);
      ctx.fill();
    }
    const r = Math.min(16, rowH * 0.36);
    drawBlob(ctx, X + 14, ry, r, p.color, p.name.charAt(0).toUpperCase(), i * 13 + 5);
    ctx.font = `700 ${Math.min(26, rowH * 0.6)}px system-ui, sans-serif`;
    text(ctx, fit(ctx, p.name, 250), X + 40, ry + 9, { size: Math.min(26, rowH * 0.6), weight: 700, align: 'left' });
    let note = '';
    if (p.id === s.teller) note = revealed && rt > 2.6 ? `Teller +${s.reveal.tellerPts}` : 'Teller';
    else if ((s.phase === 'guess1' || s.phase === 'guess2') && locked.has(p.id)) drawCheck(ctx, X + 330, ry, Math.min(24, rowH * 0.6));
    else if (revealed && land >= 0 && gained.get(p.id)) note = `+${gained.get(p.id)}`;
    text(ctx, note, X + 318, ry + 8, { size: 20, weight: 800, align: 'left', color: note.startsWith('+') ? GOLD : '#a69ba8' });
    // The score ticks up when the points land.
    const shown = revealed && land < 0 && gained.get(p.id) ? p.score - gained.get(p.id) : p.score;
    const bump = land >= 0 && land < 0.3 ? 1 + 0.35 * Math.sin((land / 0.3) * Math.PI) : 1;
    serif(ctx, String(shown), XR, ry + 12 * bump, Math.min(34, rowH * 0.8) * bump, GOLD, 'right');
    ctx.globalAlpha = 1;
  });

  // How scoring works, under the board: little chips fading out with distance.
  const ly = Y0 + PH - 72;
  ['#fff', 'rgba(255,255,255,.7)', 'rgba(255,255,255,.45)', 'rgba(255,255,255,.25)'].forEach((c, i) => {
    const cx = X + 12 + i * 124;
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.roundRect(cx - 10, ly - 12, 20, 20, 4);
    ctx.fill();
    text(ctx, `${i} away = ${4 - i}`, cx + 16, ly + 4, { size: 16, weight: 700, align: 'left', color: '#8f8494' });
  });
  text(ctx, 'The Teller scores the best guess', X, ly + 30, { size: 16, weight: 600, align: 'left', color: '#6f6574' });
  void sinceReveal;
}

/** A paper note taped to the panel; it slaps down when it first appears. */
function note(ctx, x, y, w, h, str, size, tilt, age, caption, color) {
  const q = clamp01(age / 0.35);
  const sc = 1 + (1 - ease(q)) * 0.5;
  ctx.save();
  ctx.globalAlpha = clamp01(q * 2.5);
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt + (1 - q) * 0.12);
  ctx.scale(sc, sc);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(-w / 2 + 5, -h / 2 + 7, w, h);
  const pg = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
  pg.addColorStop(0, '#fbf4e2');
  pg.addColorStop(1, '#efe2c4');
  ctx.fillStyle = pg;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // a stripe of the Teller's color down the side, like a brush stroke
  if (color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 10, -h / 2 + 10);
    ctx.quadraticCurveTo(-w / 2 + 16, 0, -w / 2 + 11, h / 2 - 10);
    ctx.lineTo(-w / 2 + 20, h / 2 - 12);
    ctx.quadraticCurveTo(-w / 2 + 24, 0, -w / 2 + 19, -h / 2 + 12);
    ctx.closePath();
    ctx.fill();
  }
  // tape
  ctx.fillStyle = 'rgba(255,240,190,.55)';
  ctx.rotate(-0.06);
  ctx.fillRect(-46, -h / 2 - 11, 92, 22);
  ctx.rotate(0.06);
  ctx.font = `italic 900 ${size}px ${SERIF}`;
  const fitSize = Math.min(size, (size * (w - 70)) / Math.max(1, ctx.measureText(str).width));
  ctx.font = `italic 900 ${fitSize}px ${SERIF}`;
  ctx.fillStyle = '#2a1f16';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, -w / 2 + 36, 4);
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(42,31,22,.5)';
  ctx.textAlign = 'right';
  ctx.fillText(caption.toUpperCase(), w / 2 - 12, -h / 2 + 16);
  ctx.restore();
}

function dashedNote(ctx, x, y, w, h, str) {
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.restore();
  text(ctx, str, x + 24, y + h / 2 + 10, { size: 28, weight: 700, align: 'left', color: '#8f8494' });
}

function timerRing(ctx, x, y, r, left, total) {
  const f = clamp01(left / total);
  const warn = left <= 5;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,.1)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = warn ? '#ff8c8c' : GOLD;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
  ctx.stroke();
  ctx.restore();
  text(ctx, String(left), x, y + 8, { size: 22, weight: 900, color: warn ? '#ff8c8c' : '#f2f4f8' });
}

function pointsBadge(ctx, x, y, label, color, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  drawSplat(ctx, 0, 0, 30, color, 11, false);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(13,15,20,.7)';
  ctx.font = `900 30px ${SERIF}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(label, 0, 2);
  ctx.fillStyle = '#fff';
  ctx.fillText(label, 0, 2);
  ctx.restore();
}

function starBurst(ctx, x, y, rt, color) {
  const q = clamp01((rt - 0.3) / 1.2);
  if (q <= 0 || q >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - q;
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r0 = 24 + q * 40;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
    ctx.lineTo(x + Math.cos(a) * (r0 + 16), y + Math.sin(a) * (r0 + 16));
    ctx.stroke();
  }
  ctx.restore();
}

/** A ribbon across the wheel naming the new Teller, sliding in and out. */
function ribbon(ctx, b, t) {
  const inQ = ease(clamp01(t / 0.45));
  const outQ = clamp01((t - 2.1) / 0.5);
  const y = CY + 2;
  const w = 640;
  const x = CX - w / 2 + (1 - inQ) * -300 + outQ * 300;
  ctx.save();
  ctx.globalAlpha = inQ * (1 - outQ);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(x + 6, y - 40, w, 92);
  // ribbon ends
  ctx.fillStyle = '#6a2a1a';
  for (const [ex, dir] of [[x - 30, 1], [x + w + 30, -1]]) {
    ctx.beginPath();
    ctx.moveTo(ex, y - 26);
    ctx.lineTo(ex + dir * 46, y - 26);
    ctx.lineTo(ex + dir * 46, y + 50);
    ctx.lineTo(ex, y + 50);
    ctx.lineTo(ex + dir * 18, y + 12);
    ctx.closePath();
    ctx.fill();
  }
  const rg = ctx.createLinearGradient(0, y - 44, 0, y + 44);
  rg.addColorStop(0, '#f7ecd2');
  rg.addColorStop(1, '#e2cfa4');
  ctx.fillStyle = rg;
  ctx.fillRect(x, y - 44, w, 88);
  ctx.fillStyle = b.color;
  ctx.fillRect(x, y - 44, w, 8);
  ctx.fillRect(x, y + 36, w, 8);
  drawBrush(ctx, x + 70, y + 6, 70, -0.6, b.color);
  ctx.font = `900 42px ${SERIF}`;
  const size = Math.min(42, (42 * (w - 170)) / Math.max(1, ctx.measureText(b.text).width));
  serif(ctx, b.text, x + w / 2 + 40, y + 16, size, '#2a1f16', 'center');
  ctx.restore();
}

// ---- Paint droplets ------------------------------------------------------------------------------

function splash(x, y, color, now) {
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 3 + Math.random() * 9;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, at: now, life: 700 + Math.random() * 600, color, size: 4 + Math.random() * 9 });
  }
}

function drawParts(ctx, now) {
  parts = parts.filter((p) => now - p.at < p.life);
  for (const p of parts) {
    const t = (now - p.at) / 16.7;
    const x = p.x + p.vx * t;
    const y = p.y + p.vy * t + 0.18 * t * t;
    ctx.globalAlpha = 1 - (now - p.at) / p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---- Still layers ------------------------------------------------------------------------------

/** The studio: a dark painted wall, old paint splats, and brushes and tubes around the wheel. */
function background(W, H) {
  if (bgCache) return bgCache;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const bg = g.createRadialGradient(CX, CY, 200, CX, CY, 1100);
  bg.addColorStop(0, '#2a2330');
  bg.addColorStop(1, '#120f15');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // canvas weave
  g.strokeStyle = 'rgba(255,255,255,.018)';
  g.lineWidth = 1;
  for (let i = 0; i < W; i += 4) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, H);
    g.stroke();
  }
  for (let i = 0; i < H; i += 4) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(W, i);
    g.stroke();
  }
  // old splats, faint
  const rand = rng(42);
  const pal = ['#ff5a5f', '#ffc93c', '#4cd97b', '#3fa7ff', '#b96bff', '#ff8ad8', '#ff9a4a'];
  for (let i = 0; i < 26; i++) {
    const x = rand() * W;
    const y = rand() * H;
    g.globalAlpha = 0.06 + rand() * 0.08;
    drawSplat(g, x, y, 10 + rand() * 40, pal[i % pal.length], i + 3);
  }
  g.globalAlpha = 1;
  // studio things in the corners around the wheel
  drawTube(g, 120, 118, 110, 0.5, '#3fa7ff');
  drawTube(g, 88, 210, 96, -0.3, '#ffc93c');
  drawPalette(g, 110, 780, 150);
  drawBrush(g, 200, 850, 150, -0.25, '#ff5a5f');
  drawBrush(g, 905, 845, 120, -2.6, '#4cd97b');
  drawTube(g, 930, 90, 90, 2.4, '#b96bff');
  bgCache = c;
  return c;
}

function buildWheel(s) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (R + 4) * 2;
  const g = canvas.getContext('2d');
  const o = R + 4;
  const geo = geometry(s, o, o, R, R0);
  g.beginPath();
  g.arc(o, o, R + 1, 0, Math.PI * 2);
  g.fillStyle = '#0d0f14';
  g.fill();
  for (let c = 0; c < s.hues * s.rings; c++) {
    geo.path(g, c);
    g.fillStyle = s.colors[c];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#0d0f14';
    g.stroke();
  }
  return { key: s.colors.join(), canvas };
}

function geometry(s, cx, cy, R, R0) {
  const band = (R - R0) / s.rings;
  const step = (Math.PI * 2) / s.hues;
  const angleOf = (h) => -Math.PI / 2 + h * step;
  return {
    band,
    centre(c) {
      const rad = R0 + band * (Math.floor(c / s.hues) + 0.5);
      const a = angleOf(c % s.hues);
      return [cx + Math.cos(a) * rad, cy + Math.sin(a) * rad];
    },
    path(ctx, c) {
      const h = c % s.hues;
      const r = Math.floor(c / s.hues);
      ctx.beginPath();
      ctx.arc(cx, cy, R0 + band * (r + 1), angleOf(h) - step / 2, angleOf(h) + step / 2);
      ctx.arc(cx, cy, R0 + band * r, angleOf(h) + step / 2, angleOf(h) - step / 2, true);
      ctx.closePath();
    },
  };
}

function steps(s, a, b) {
  const dh = Math.abs((a % s.hues) - (b % s.hues));
  return Math.min(dh, s.hues - dh) + Math.abs(Math.floor(a / s.hues) - Math.floor(b / s.hues));
}

function serif(ctx, str, x, y, size, color, align = 'left') {
  ctx.font = `900 ${size}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function fit(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  while (str.length > 1 && ctx.measureText(`${str}…`).width > maxW) str = str.slice(0, -1);
  return `${str}…`;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

// ---- How-to-play pictures (the steps are in server/games/tint.js) ------------------------------
// box = { x, y, w, h } on the TV; t = seconds into the step.

/** A small wheel for the pictures: the game's own colors once we've seen them, else a stand-in. */
function miniWheel(ctx, cx, cy, r) {
  const hues = 24;
  const rings = 6;
  const s = { hues, rings };
  const colors = lastColors ?? Array.from({ length: hues * rings }, (_, c) => `hsl(${(c % hues) * 15}, 85%, ${85 - Math.floor(c / hues) * 11}%)`);
  const geo = geometry(s, cx, cy, r, r * 0.22);
  wheelRim(ctx, cx, cy, r + 1);
  for (let c = 0; c < hues * rings; c++) {
    geo.path(ctx, c);
    ctx.fillStyle = colors[c];
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0d0f14';
    ctx.stroke();
  }
  return { geo, colors, s };
}

function drawRules(ctx, art, t, box, now) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const WR = 190;
  const SECRET = 3 * 24 + 15; // a rich blue
  ctx.save();
  if (art === 'wheel') {
    const wx = cx + 170;
    const { geo, colors } = miniWheel(ctx, wx, cy, WR);
    wheelMiddle(ctx, wx, cy, WR * 0.22 - 4, null, { wobble: 0.3 * Math.sin(now / 200) });
    // The Teller's three chips; the middle one rises and its swatch glows on the wheel.
    const offers = [1 * 24 + 3, SECRET, 4 * 24 + 9];
    offers.forEach((c, i) => {
      const up = i === 1 ? ease(clamp01((t - 0.8) / 0.5)) * 30 : 0;
      drawChip(ctx, cx - 330 + i * 92, cy + 20 - up, 110, colors[c]);
    });
    text(ctx, 'Only the Teller sees these', cx - 238, cy + 120, { size: 24, weight: 800, color: '#ffc93c' });
    if (t > 1.2) {
      geo.path(ctx, SECRET);
      ctx.lineWidth = 5 + 1.5 * Math.sin(now / 160);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
  } else if (art === 'clue') {
    drawBrush(ctx, cx - 300, cy - 70, 90, -0.6, '#3fa7ff');
    note(ctx, cx - 220, cy - 150, 440, 100, '“Lagoon”', 56, -0.02, t - 0.4, 'One word', '#3fa7ff');
    if (t > 2.2) note(ctx, cx - 220, cy + 10, 440, 100, '“Deep lagoon”', 56, 0.015, t - 2.2, 'Two words', '#3fa7ff');
    if (t > 0.4) {
      ctx.save();
      ctx.globalAlpha = clamp01((t - 3.2) * 2);
      text(ctx, 'No color names like red or blue', cx, cy + 180, { size: 26, weight: 800, color: '#ff8c8c' });
      ctx.restore();
    }
  } else if (art === 'pins') {
    const { geo } = miniWheel(ctx, cx, cy, WR);
    wheelMiddle(ctx, cx, cy, WR * 0.22 - 4, null);
    const pins = [
      ['#ff5a5f', 'M', 3 * 24 + 14, 0.3],
      ['#4cd97b', 'T', 2 * 24 + 16, 0.9],
      ['#ffc93c', 'B', 4 * 24 + 13, 1.5],
    ];
    for (const [color, letter, cell, at] of pins) {
      let c = cell;
      if (letter === 'T' && t > 3) c = 3 * 24 + 16; // moves after the second clue
      const q = clamp01((t - at) / 0.38);
      if (q <= 0) continue;
      const [x, y] = geo.centre(c);
      wheelPin(ctx, x, y - (1 - bounce(q)) * 60, 24, color, letter);
    }
    if (t > 3) text(ctx, 'Move it after the second clue, or keep it for +1', cx, cy + WR + 50, { size: 24, weight: 800, color: '#ffc93c' });
  } else if (art === 'score') {
    const { geo, colors, s } = miniWheel(ctx, cx - 120, cy, WR);
    const rt = t - 0.6;
    wheelMiddle(ctx, cx - 120, cy, WR * 0.22 - 4, rt > 0 ? colors[SECRET] : null, { lid: clamp01(rt * 1.8) });
    for (let c = 0; c < 144 && rt > 0; c++) {
      const d = steps(s, c, SECRET);
      if (d > 3 || d === 0) continue;
      const a = clamp01((rt - 0.15 * d) * 4);
      geo.path(ctx, c);
      ctx.fillStyle = `rgba(255,255,255,${(0.36 - d * 0.08) * a})`;
      ctx.fill();
    }
    if (rt > 0) {
      geo.path(ctx, SECRET);
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }
    [[3 * 24 + 15, '#ff5a5f', 'M', 4], [3 * 24 + 16, '#4cd97b', 'T', 3], [4 * 24 + 13, '#ffc93c', 'B', 1]].forEach(([c, color, l, pts], i) => {
      const [x, y] = geo.centre(c);
      const off = i === 0 ? -8 : 0;
      wheelPin(ctx, x + off, y, 22, color, l);
      if (rt > 0.6 + i * 0.2) pointsBadge(ctx, x + off - 8, y - 50, `+${pts}`, color, 0.7);
    });
    // The table of points, on the right.
    const tx = cx + 170;
    ['Bullseye', '1 step away', '2 steps', '3 steps'].forEach((label, i) => {
      const ty = cy - 110 + i * 62;
      ctx.globalAlpha = clamp01((t - 0.4 - i * 0.25) * 3);
      ctx.fillStyle = `rgba(255,255,255,${0.9 - i * 0.2})`;
      ctx.beginPath();
      ctx.roundRect(tx, ty - 20, 30, 30, 6);
      ctx.fill();
      text(ctx, label, tx + 46, ty + 4, { size: 26, weight: 700, align: 'left', color: '#d5d9e4' });
      serif(ctx, String(4 - i), tx + 290, ty + 8, 36, GOLD, 'right');
      ctx.globalAlpha = 1;
    });
    ctx.globalAlpha = clamp01((t - 1.6) * 3);
    text(ctx, 'Teller = the best guess', tx, cy + 150, { size: 24, weight: 800, align: 'left', color: '#ffc93c' });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
