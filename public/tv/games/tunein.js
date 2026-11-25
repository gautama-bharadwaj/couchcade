// Tune In TV: an old wooden radio. The glass band runs between the card's two ideas; small
// markers above it are each Listener's needle, the red needle is their average. At the reveal the
// band crackles with static, then the station and its scoring zones light up.

import { circle, text } from './util.js';

const BX0 = 170; // band 0..100 maps to BX0..BX1
const BX1 = 1430;
const GY0 = 372; // glass top / bottom
const GY1 = 508;
const REVEAL_DELAY = 1500; // ms of static before the station shows
const xOf = (v) => BX0 + ((BX1 - BX0) * v) / 100;
const ZONE_COLORS = ['#ff5a5f', '#ff9a4a', '#ffd166']; // crystal clear, clear, crackly

let shown = 50; // crowd needle as drawn, eased toward the real one
let lastNow = 0;
let revealSeq = -1;
let revealAt = 0;
let speckle = null;
let announced = 0; // the turn whose DJ the narrator last announced

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

    // Room: warm, dim.
    const bg = ctx.createRadialGradient(W / 2, 430, 100, W / 2, 430, 1000);
    bg.addColorStop(0, '#2a2028');
    bg.addColorStop(1, '#0f0c10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header
    text(ctx, '📻 Tune In', 90, 96, { size: 46, weight: 900, align: 'left' });
    if (s.turn > 0) text(ctx, `Turn ${s.turn} of ${s.turns}`, 1510, 80, { size: 26, weight: 700, align: 'right', color: '#a99aa6' });
    signalMeter(ctx, s, 1510, 120);
    if (dj) {
      circle(ctx, 104, 146, 13, dj.color);
      text(ctx, `${dj.name} is the DJ`, 128, 156, { size: 30, weight: 800, align: 'left', color: dj.color });
    }

    // The clue, big.
    if (s.clue) {
      ctx.font = '900 76px system-ui, -apple-system, sans-serif';
      const size = Math.min(76, (76 * 1300) / Math.max(1, ctx.measureText(`“${s.clue}”`).width));
      text(ctx, `“${s.clue}”`, W / 2, 252, { size, weight: 900 });
    } else if (s.phase === 'pick' || s.phase === 'clue') {
      const wait = s.phase === 'pick' ? 'Picking a card' : 'Thinking of a clue';
      text(ctx, wait + '.'.repeat(Math.floor(now / 400) % 4), W / 2, 248, { size: 40, weight: 700, color: '#a99aa6' });
    }

    radio(ctx, s, now);

    // Listener markers above the glass, stacked when they're close.
    const listeners = s.needles.filter((n) => n.id !== s.dj).sort((a, b) => a.value - b.value);
    const placed = [];
    for (const n of listeners) {
      const x = xOf(n.value);
      let level = 0;
      while (placed.some((p) => p.level === level && Math.abs(p.x - x) < 34)) level++;
      placed.push({ x, level });
      const y = GY0 - 40 - level * 34;
      const p = byId.get(n.id);
      ctx.strokeStyle = p?.color ?? '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x, GY0 - 6);
      ctx.stroke();
      circle(ctx, x, y, 15, p?.color ?? '#888');
      text(ctx, (p?.name ?? '?').charAt(0).toUpperCase(), x, y + 7, { size: 19, weight: 900, color: '#0d0f14' });
      if (s.locked.includes(n.id)) text(ctx, '✓', x + 18, y - 8, { size: 18, weight: 900, color: '#4cd97b' });
    }

    // Crowd needle, eased.
    if (s.crowd != null) {
      shown += (s.crowd - shown) * Math.min(1, dt * 7);
      const x = xOf(shown);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(x - 1, GY0 - 8, 8, GY1 - GY0 + 16);
      ctx.fillStyle = '#ff2e2e';
      ctx.fillRect(x - 3, GY0 - 10, 6, GY1 - GY0 + 20);
      ctx.beginPath();
      ctx.moveTo(x - 14, GY1 + 28);
      ctx.lineTo(x + 14, GY1 + 28);
      ctx.lineTo(x, GY1 + 10);
      ctx.fill();
    } else shown = 50;

    // Status line + timer
    if (s.phase === 'reveal' && s.seq !== revealSeq) {
      revealSeq = s.seq;
      revealAt = now;
    }
    const revealed = s.phase === 'reveal' && now - revealAt > REVEAL_DELAY;
    const status = {
      pick: '',
      clue: '',
      tune: 'Drag your needle on your phone. Talk it out!',
      reveal: revealed ? `${s.reveal.zone}! The crew scores ${s.reveal.pts}` : 'Searching for the station…',
    }[s.phase];
    text(ctx, status, 90, 690, { size: 30, weight: 800, align: 'left', color: s.phase === 'reveal' && revealed ? ZONE_COLORS[4 - s.reveal.pts] ?? '#a99aa6' : '#ffc93c' });
    if (s.phase !== 'reveal') text(ctx, `${s.left}s`, 1510, 690, { size: 34, weight: 900, align: 'right', color: s.left <= 5 ? '#ff8c8c' : '#a99aa6' });

    // Players, in seat order.
    const n = s.players.length;
    const cw = Math.min(260, 1420 / n);
    const gained = new Map((s.reveal?.rows ?? []).map((r) => [r.id, r.pts]));
    if (s.reveal) gained.set(s.dj, s.reveal.pts);
    s.players.forEach((p, i) => {
      const x = 90 + i * cw;
      const y = 752;
      ctx.globalAlpha = p.connected ? 1 : 0.45;
      ctx.fillStyle = p.id === s.dj ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.04)';
      ctx.beginPath();
      ctx.roundRect(x, y - 36, cw - 12, 72, 14);
      ctx.fill();
      circle(ctx, x + 24, y - 8, 11, p.color);
      ctx.font = '700 24px system-ui, -apple-system, sans-serif';
      text(ctx, fit(ctx, p.name, cw - 110), x + 44, y, { size: 24, weight: 700, align: 'left' });
      text(ctx, String(p.score), x + cw - 26, y + 2, { size: 30, weight: 900, align: 'right' });
      let note = '';
      if (p.id === s.dj) note = revealed ? `DJ +${s.reveal.pts}` : 'DJ';
      else if (s.phase === 'tune') note = s.locked.includes(p.id) ? '✓ locked' : s.needles.some((x) => x.id === p.id) ? 'tuning…' : '';
      else if (revealed) note = gained.get(p.id) ? `+${gained.get(p.id)}` : '';
      text(ctx, note, x + 44, y + 26, { size: 18, weight: 800, align: 'left', color: note.startsWith('✓') ? '#4cd97b' : '#a99aa6' });
      ctx.globalAlpha = 1;
    });

    text(ctx, 'Crystal clear 4 · Clear 3 · Crackly 2 · the crew shares the points, your own needle scores for you', W / 2, 836, { size: 20, weight: 600, color: '#6e6470' });

  },
};

function radio(ctx, s, now) {
  // Cabinet
  const wood = ctx.createLinearGradient(0, 300, 0, 640);
  wood.addColorStop(0, '#7a4a2a');
  wood.addColorStop(0.5, '#5c3520');
  wood.addColorStop(1, '#3e2314');
  ctx.fillStyle = wood;
  ctx.beginPath();
  ctx.roundRect(90, 296, 1420, 344, 30);
  ctx.fill();
  ctx.strokeStyle = '#c9a25a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(110, 314, 1380, 308, 20);
  ctx.stroke();

  // Glass, backlit.
  const glass = ctx.createLinearGradient(0, GY0, 0, GY1);
  glass.addColorStop(0, '#f6e7b8');
  glass.addColorStop(1, '#e2c784');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.roundRect(BX0 - 26, GY0, BX1 - BX0 + 52, GY1 - GY0, 12);
  ctx.fill();

  // Frequency scale, just for looks.
  ctx.strokeStyle = 'rgba(60,35,20,.55)';
  for (let v = 0; v <= 100; v += 2.5) {
    const x = xOf(v);
    const big = v % 10 === 0;
    ctx.lineWidth = big ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, GY1 - (big ? 30 : 14));
    ctx.lineTo(x, GY1 - 2);
    ctx.stroke();
    if (big) text(ctx, String(88 + v / 5), x, GY0 + 30, { size: 18, weight: 700, color: 'rgba(60,35,20,.6)' });
  }

  // Reveal: static, then the zones.
  if (s.phase === 'reveal' && s.station != null) {
    const t = now - revealAt;
    if (t < REVEAL_DELAY) staticOver(ctx, now);
    else {
      const a = Math.min(1, (t - REVEAL_DELAY) / 400);
      ctx.globalAlpha = a;
      [...s.zones].reverse().forEach((z, i) => {
        const x0 = xOf(Math.max(0, s.station - z.within));
        const x1 = xOf(Math.min(100, s.station + z.within));
        ctx.fillStyle = ZONE_COLORS[s.zones.length - 1 - i];
        ctx.fillRect(x0, GY0 + 4, x1 - x0, GY1 - GY0 - 8);
      });
      s.zones.forEach((z, i) => {
        const mid = i === 0 ? 0 : (s.zones[i - 1].within + z.within) / 2;
        for (const side of i === 0 ? [0] : [-1, 1]) {
          const v = s.station + side * mid;
          if (v >= 0 && v <= 100) text(ctx, String(z.pts), xOf(v) + (i === 0 ? 22 : 0), GY1 - 40, { size: 26, weight: 900, color: '#3a1a10' });
        }
      });
      ctx.fillStyle = '#fff';
      ctx.fillRect(xOf(s.station) - 2, GY0 - 6, 4, GY1 - GY0 + 12);
      ctx.globalAlpha = 1;
    }
  } else if (s.phase === 'pick') {
    staticOver(ctx, now, 0.25);
  }

  // The two ends of the band.
  const [left, right] = s.card ?? ['?', '?'];
  wrapText(ctx, `◀ ${left}`, BX0 - 26, 560, 600, { size: 36, weight: 900, align: 'left', color: '#8fd3f0' });
  wrapText(ctx, `${right} ▶`, BX1 + 26, 560, 600, { size: 36, weight: 900, align: 'right', color: '#ffb27a' });
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
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
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

/** Bars like a phone's signal meter, one per turn played, height = points. */
function signalMeter(ctx, s, xr, y) {
  text(ctx, `Crew ${s.crew}`, xr, y + 6, { size: 30, weight: 900, align: 'right', color: '#ffc93c' });
  const bars = s.history.slice(-12);
  bars.forEach((pts, i) => {
    const x = xr - 150 - (bars.length - i) * 16;
    ctx.strokeStyle = '#4a3f48';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y - 24, 11, 30);
    if (pts) {
      ctx.fillStyle = ZONE_COLORS[4 - pts];
      ctx.fillRect(x + 1, y + 5 - (28 * pts) / 4, 9, (28 * pts) / 4);
    }
  });
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
  // The band itself
  const glass = ctx.createLinearGradient(0, y0, 0, y1);
  glass.addColorStop(0, '#f6e7b8');
  glass.addColorStop(1, '#e2c784');
  ctx.fillStyle = '#5c3520';
  ctx.beginPath();
  ctx.roundRect(x0 - 30, y0 - 24, w + 60, y1 - y0 + 48, 20);
  ctx.fill();
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.roundRect(x0 - 10, y0, w + 20, y1 - y0, 10);
  ctx.fill();
  text(ctx, '◀ Bland', x0 - 20, y1 + 74, { size: 34, weight: 900, align: 'left', color: '#8fd3f0' });
  text(ctx, 'Spicy ▶', x0 + w + 20, y1 + 74, { size: 34, weight: 900, align: 'right', color: '#ffb27a' });

  const marker = (v, color, letter, y = y0 - 36) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(at(v), y + 14);
    ctx.lineTo(at(v), y0 - 4);
    ctx.stroke();
    circle(ctx, at(v), y, 16, color);
    text(ctx, letter, at(v), y + 7, { size: 19, weight: 900, color: '#0d0f14' });
  };
  const needle = (v) => {
    ctx.fillStyle = '#ff2e2e';
    ctx.fillRect(at(v) - 3, y0 - 8, 6, y1 - y0 + 16);
    ctx.beginPath();
    ctx.moveTo(at(v) - 13, y1 + 26);
    ctx.lineTo(at(v) + 13, y1 + 26);
    ctx.lineTo(at(v), y1 + 9);
    ctx.fill();
  };
  const zones = (alpha) => {
    ctx.globalAlpha = alpha;
    [[13, ZONE_COLORS[2]], [8, ZONE_COLORS[1]], [3, ZONE_COLORS[0]]].forEach(([d, c]) => {
      ctx.fillStyle = c;
      ctx.fillRect(at(STATION - d), y0 + 3, at(STATION + d) - at(STATION - d), y1 - y0 - 6);
    });
    for (const [v, pts] of [[STATION, 4], [STATION - 5.5, 3], [STATION + 5.5, 3], [STATION - 10.5, 2], [STATION + 10.5, 2]]) text(ctx, String(pts), at(v), y1 - 18, { size: 24, weight: 900, color: '#3a1a10' });
    ctx.fillStyle = '#fff';
    ctx.fillRect(at(STATION) - 2, y0 - 4, 4, y1 - y0 + 8);
    ctx.globalAlpha = 1;
  };

  if (art === 'band') {
    // The station and its zones, which only the DJ gets to see.
    zones(0.35 + 0.25 * Math.sin(now / 300));
    text(ctx, 'Only the DJ sees this', at(STATION), y0 - 50, { size: 26, weight: 800, color: '#ffc93c' });
  } else if (art === 'clue') {
    const pop = Math.min(1, Math.max(0, (t - 0.4) * 3));
    if (pop > 0) {
      ctx.globalAlpha = pop;
      ctx.fillStyle = '#f2f4f8';
      ctx.beginPath();
      ctx.roundRect(cx - 150, y0 - 150, 300, 90, 24);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 20, y0 - 62);
      ctx.lineTo(cx + 20, y0 - 62);
      ctx.lineTo(cx, y0 - 36);
      ctx.fill();
      text(ctx, '“Salsa”', cx, y0 - 90, { size: 50, weight: 900, color: '#1a1420' });
      ctx.globalAlpha = 1;
    }
  } else if (art === 'needles') {
    const ms = [
      [40 + 22 * Math.sin(t * 1.3), '#ff5a5f', 'M'],
      [75 + 10 * Math.sin(t * 1.7 + 1), '#3fa7ff', 'T'],
      [58 + 18 * Math.sin(t * 1.1 + 2), '#4cd97b', 'B'],
    ];
    ms.forEach(([v, c, l], i) => marker(v, c, l, y0 - 36 - i * 34));
    needle(ms.reduce((a, m) => a + m[0], 0) / ms.length);
    text(ctx, 'average', at(ms.reduce((a, m) => a + m[0], 0) / ms.length), y1 + 58, { size: 22, weight: 800, color: '#ff8c8c' });
  } else if (art === 'score') {
    const slide = Math.min(1, t / 1.4);
    const v = 30 + (58.5 - 30) * (1 - (1 - slide) ** 3);
    if (t > 1.6) zones(Math.min(1, (t - 1.6) * 3));
    needle(v);
    if (t > 2.1) text(ctx, '+3 Clear!', at(v), y0 - 46, { size: 34, weight: 900, color: ZONE_COLORS[1] });
  }
  ctx.restore();
}

function wrapText(ctx, str, x, y, maxW, opts) {
  ctx.font = `${opts.weight} ${opts.size}px system-ui, -apple-system, sans-serif`;
  const words = str.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  lines.push(line);
  lines.slice(0, 2).forEach((l, i) => text(ctx, l, x, y + i * (opts.size + 6), opts));
}

function fit(ctx, str, maxW) {
  if (ctx.measureText(str).width <= maxW) return str;
  while (str.length > 1 && ctx.measureText(`${str}…`).width > maxW) str = str.slice(0, -1);
  return `${str}…`;
}
