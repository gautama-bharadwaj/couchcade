// Tint & Tell TV: the color wheel on the left with everyone's pins, the clues and the scores on
// the right. The secret swatch shows only at the reveal, after a short drumroll.

import { circle, text } from './util.js';

const CX = 560;
const CY = 478;
const R = 372;
const R0 = R * 0.22;
const REVEAL_DELAY = 1300; // ms of drumroll before the answer shows

let revealSeq = -1;
let revealAt = 0;
const pinPop = new Map(); // player id -> when their pin landed (for the pop-in)
let wheelCache = null; // offscreen canvas of the wheel itself

export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    if (!prev || s.turn !== prev.turn) {
      if (s.phase === 'pick') {
        sfx.chime();
        say(prev ? `${nameOf(s.teller)} is the Teller.` : pick([`Tint and Tell! ${nameOf(s.teller)} goes first.`, `Eyes on the wheel. ${nameOf(s.teller)} is the first Teller.`]), { delay: 0.3 });
      }
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
    ctx.fillStyle = '#101218';
    ctx.fillRect(0, 0, W, H);
    const bg = ctx.createRadialGradient(CX, CY, R * 0.6, CX, CY, R * 1.6);
    bg.addColorStop(0, '#1b1f2b');
    bg.addColorStop(1, '#10121800');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const byId = new Map(s.players.map((p) => [p.id, p]));
    const teller = byId.get(s.teller);
    if (s.phase === 'reveal' && s.seq !== revealSeq) {
      revealSeq = s.seq;
      revealAt = now;
    }
    const revealed = s.phase === 'reveal' && s.target != null && now - revealAt > REVEAL_DELAY;
    const rt = revealed ? Math.min(1, (now - revealAt - REVEAL_DELAY) / 400) : 0;

    // The wheel
    if (!wheelCache || wheelCache.key !== s.colors.join()) wheelCache = buildWheel(s);
    ctx.drawImage(wheelCache.canvas, CX - R - 4, CY - R - 4);
    const geo = geometry(s);

    // Scoring zone around the answer: everything within 3 steps glows a little.
    if (revealed) {
      for (let c = 0; c < s.hues * s.rings; c++) {
        const d = steps(s, c, s.target);
        if (d > 3 || d === 0) continue;
        geo.path(ctx, c);
        ctx.fillStyle = `rgba(255,255,255,${(0.32 - d * 0.08) * rt})`;
        ctx.fill();
      }
    }

    // Middle: "?" until the reveal, then the secret color itself.
    circle(ctx, CX, CY, R0 - 6, revealed ? s.colors[s.target] : '#141824');
    if (!revealed) text(ctx, '?', CX, CY + 26, { size: 76, weight: 900, color: '#3a4256' });

    // First pins (dashed) during the second guess, if they've moved since.
    const pins = new Map(s.pins.map((p) => [p.id, p.cell]));
    for (const f of s.phase === 'guess2' ? s.firsts : []) {
      if (pins.get(f.id) === f.cell) continue;
      const [x, y] = geo.centre(f.cell);
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = byId.get(f.id)?.color ?? '#888';
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Pins, spread out a little when they share a swatch.
    const perCell = new Map();
    for (const p of s.pins) perCell.set(p.cell, [...(perCell.get(p.cell) ?? []), p.id]);
    for (const [cell, ids] of perCell) {
      const [cx, cy] = geo.centre(cell);
      ids.forEach((id, i) => {
        const a = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
        const off = ids.length > 1 ? 13 : 0;
        if (!pinPop.has(`${id}:${cell}`)) pinPop.set(`${id}:${cell}`, now);
        const pop = Math.max(0, 1 - (now - pinPop.get(`${id}:${cell}`)) / 220);
        pin(ctx, byId.get(id), cx + Math.cos(a) * off, cy + Math.sin(a) * off, 1 + pop * 0.6);
      });
    }
    if (pinPop.size > 400) pinPop.clear();

    // The answer's outline, pulsing.
    if (revealed) {
      geo.path(ctx, s.target);
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#0d0f14';
      ctx.stroke();
      ctx.lineWidth = 5 + 1.5 * Math.sin(now / 160);
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      // Points next to each pin.
      for (const r of s.reveal.rows) {
        if (r.cell == null || !r.pts) continue;
        const [x, y] = geo.centre(r.cell);
        const label = `+${r.pts + r.bonus}`;
        const ly = y - 30 - 8 * rt;
        ctx.globalAlpha = rt;
        ctx.fillStyle = 'rgba(13,15,20,.85)';
        ctx.beginPath();
        ctx.roundRect(x + 8, ly - 17, 16 + 15 * label.length, 32, 16);
        ctx.fill();
        text(ctx, label, x + 16, ly + 8, { size: 24, weight: 900, color: byId.get(r.id)?.color ?? '#fff', align: 'left' });
        ctx.globalAlpha = 1;
      }
    }

    // ---- Right panel ----
    const X = 1010;
    const RW = 1530 - X;
    text(ctx, 'Tint & Tell', X, 96, { size: 46, weight: 900, align: 'left' });
    text(ctx, `Turn ${s.turn} of ${s.turns}`, 1530, 96, { size: 26, weight: 700, align: 'right', color: '#8a93a8' });

    if (teller) {
      circle(ctx, X + 16, 150, 14, teller.color);
      text(ctx, `${teller.name} is the Teller`, X + 42, 160, { size: 30, weight: 800, align: 'left', color: teller.color });
    }

    // Clues, big.
    const clueY = 250;
    if (!s.clues.length) {
      const wait = s.phase === 'pick' ? 'Choosing a secret color…' : 'Thinking of one word…';
      text(ctx, wait + '.'.repeat(Math.floor(now / 400) % 3), X, clueY, { size: 34, weight: 700, align: 'left', color: '#8a93a8' });
    }
    s.clues.forEach((c, i) => {
      const latest = i === s.clues.length - 1;
      text(ctx, `“${cap(c)}”`, X, clueY + i * 84, { size: latest ? 66 : 44, weight: 900, align: 'left', color: latest ? '#f2f4f8' : '#8a93a8' });
    });
    if (s.phase === 'clue2') text(ctx, 'Two words coming…', X, clueY + 84, { size: 32, weight: 700, align: 'left', color: '#8a93a8' });

    // Status + timer
    const status = {
      pick: '',
      clue1: '',
      guess1: 'Tap your phone to place a pin',
      clue2: '',
      guess2: 'Move your pin, or keep it for +1',
      reveal: revealed ? 'Here it is!' : 'And the color is…',
    }[s.phase];
    text(ctx, status, X, 450, { size: 28, weight: 700, align: 'left', color: '#ffc93c' });
    if (s.phase !== 'reveal') text(ctx, `${s.left}s`, 1530, 450, { size: 34, weight: 900, align: 'right', color: s.left <= 5 ? '#ff8c8c' : '#8a93a8' });

    // Scoreboard, best first. During a guess, a tick shows who's locked in.
    const rows = [...s.players].sort((a, b) => b.score - a.score);
    const rowH = Math.min(46, 340 / Math.max(1, rows.length));
    const locked = new Set(s.locked);
    const gained = new Map((s.reveal?.rows ?? []).map((r) => [r.id, r.pts + r.bonus]));
    if (s.reveal) gained.set(s.teller, s.reveal.tellerPts);
    rows.forEach((p, i) => {
      const y = 510 + i * rowH;
      ctx.globalAlpha = p.connected ? 1 : 0.5;
      if (p.id === s.teller) {
        ctx.fillStyle = 'rgba(255,255,255,.06)';
        ctx.fillRect(X - 10, y - rowH / 2, RW + 20, rowH);
      }
      circle(ctx, X + 12, y, 11, p.color);
      text(ctx, p.name, X + 34, y + 9, { size: 26, weight: 700, align: 'left' });
      let note = '';
      if (p.id === s.teller) note = 'Teller';
      else if ((s.phase === 'guess1' || s.phase === 'guess2') && locked.has(p.id)) note = '✓ locked';
      else if (revealed && gained.has(p.id)) note = gained.get(p.id) ? `+${gained.get(p.id)}` : '';
      if (revealed && p.id === s.teller) note = `Teller +${s.reveal.tellerPts}`;
      text(ctx, note, X + 330, y + 8, { size: 22, weight: 800, align: 'left', color: note.startsWith('✓') ? '#4cd97b' : '#8a93a8' });
      text(ctx, String(p.score), 1530, y + 10, { size: 30, weight: 900, align: 'right' });
      ctx.globalAlpha = 1;
    });

    // How scoring works, in one line under the board.
    text(ctx, 'Steps away: 0 = 4 pts · 1 = 3 · 2 = 2 · 3 = 1', X, H - 112, { size: 20, weight: 600, align: 'left', color: '#5d6578' });
    text(ctx, 'The Teller scores the best guess', X, H - 82, { size: 20, weight: 600, align: 'left', color: '#5d6578' });
  },
};

function pin(ctx, p, x, y, scale) {
  const r = 15 * scale;
  ctx.beginPath();
  ctx.arc(x, y + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fill();
  circle(ctx, x, y, r, p?.color ?? '#888');
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  text(ctx, (p?.name ?? '?').charAt(0).toUpperCase(), x, y + 7 * scale, { size: 19 * scale, weight: 900, color: '#0d0f14' });
}

function geometry(s) {
  const band = (R - R0) / s.rings;
  const step = (Math.PI * 2) / s.hues;
  const angleOf = (h) => -Math.PI / 2 + h * step;
  return {
    centre(c) {
      const rad = R0 + band * (Math.floor(c / s.hues) + 0.5);
      const a = angleOf(c % s.hues);
      return [CX + Math.cos(a) * rad, CY + Math.sin(a) * rad];
    },
    path(ctx, c, ox = CX, oy = CY) {
      const h = c % s.hues;
      const r = Math.floor(c / s.hues);
      ctx.beginPath();
      ctx.arc(ox, oy, R0 + band * (r + 1), angleOf(h) - step / 2, angleOf(h) + step / 2);
      ctx.arc(ox, oy, R0 + band * r, angleOf(h) + step / 2, angleOf(h) - step / 2, true);
      ctx.closePath();
    },
  };
}

function buildWheel(s) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = (R + 4) * 2;
  const g = canvas.getContext('2d');
  const geo = geometry(s);
  const o = R + 4;
  g.beginPath();
  g.arc(o, o, R + 4, 0, Math.PI * 2);
  g.fillStyle = '#0d0f14';
  g.fill();
  for (let c = 0; c < s.hues * s.rings; c++) {
    geo.path(g, c, o, o);
    g.fillStyle = s.colors[c];
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#0d0f14';
    g.stroke();
  }
  return { key: s.colors.join(), canvas };
}

function steps(s, a, b) {
  const dh = Math.abs((a % s.hues) - (b % s.hues));
  return Math.min(dh, s.hues - dh) + Math.abs(Math.floor(a / s.hues) - Math.floor(b / s.hues));
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
