import { lerpById, circle, text } from './util.js';

// Hot Potato Pileup TV renderer: a top-down yard of wobbly blobs, one carrying a bomb.
// Sparks, the blast flash, scorch marks and screen shake are client-side decoration driven
// by the snapshot's fx events; the server decides everything that matters.

const R = 30; // must match the server's body radius
const BLAST_R = 240;

const THEMES = {
  yard: { outside: '#0f1a12', floor: ['#2f6b35', '#2a6230'], line: '#3f7f44', fence: '#8a6a44' },
  kitchen: { outside: '#17120f', floor: ['#d9d2c3', '#bdb4a2'], line: '#a59b88', fence: '#5a4636' },
  rink: { outside: '#0c1420', floor: ['#dbeaf5', '#cfe2f0'], line: '#e05561', fence: '#5c7a96' },
};

let lastCur = null;
let lastRound = 0;
let particles = []; // { x, y, vx, vy, born, max, color, size, text? }
let flashes = []; // { x, y, born }
let scorches = []; // { x, y }
let shake = 0;
const outAt = new Map(); // id -> { t, x, y, color }
let nextTickAt = 0;
let lastBonkAt = 0;

export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const t = performance.now();
    const name = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';

    if (s.phase === 'countdown' && (!prev || prev.phase !== 'countdown' || s.timer !== prev.timer) && s.timer > 0) {
      sfx.beep();
      if ((!prev || prev.phase !== 'countdown') && s.bomb) say(`${name(s.bomb.holder)} has the bomb!`, { rate: 1.1, interrupt: true, delay: 0.3 });
    }
    if (s.phase === 'play' && prev?.phase === 'countdown') sfx.beep(true);
    if (!prev) return;
    const fx = s.fx ?? {};

    // Ticking speeds up as the fuse burns down (heat is coarse on purpose).
    if (s.phase === 'play' && s.bomb?.burning && t >= nextTickAt) {
      const heat = s.bomb.heat;
      sfx.tick();
      if (heat >= 0.8) sfx.fuseHiss(heat);
      nextTickAt = t + 620 - 500 * heat;
    }

    for (const p of fx.passes ?? []) {
      sfx.swish();
      sfx.punch(true);
      if (Math.random() < 0.35) say(pick([`${name(p.to)}, it's yours!`, `Over to ${name(p.to)}!`, 'Hot potato!']), { rate: 1.2, interrupt: true });
    }
    const plain = (fx.tackles ?? []).filter((k) => !k.pass);
    if (plain.length) sfx.punch(false);
    if (fx.dodges) sfx.hop();
    if (fx.bonks && t - lastBonkAt > 120) {
      sfx.thud(0.35);
      lastBonkAt = t;
    }
    for (const b of fx.booms ?? []) {
      sfx.boom();
      say(pick([`Boom! ${name(b.id)} is out!`, `${name(b.id)} got toasted!`, `Kaboom! Bye, ${name(b.id)}!`]), { rate: 1.1, delay: 0.5 });
    }
    if (fx.drops?.length && s.phase === 'play') {
      sfx.pickup();
      say(`New bomb! ${name(fx.drops[0].id)} has it!`, { rate: 1.15, delay: 0.1 });
    }

    if (s.phase === 'roundover' && prev.phase !== 'roundover') {
      const last = s.round >= s.rounds;
      if (last) sfx.fanfare();
      else if (s.roundWinner) sfx.jingle();
      else sfx.buzz();
      if (s.roundWinner) say(`${s.roundWinner} survives the round!`, { delay: 1.6 });
    }
  },

  draw(ctx, { prev, cur, alpha, arena, now }) {
    if (cur.round !== lastRound) {
      outAt.clear();
      particles = [];
      flashes = [];
      scorches = [];
      lastRound = cur.round;
    }
    if (cur !== lastCur) {
      consumeFx(cur, now);
      lastCur = cur;
    }
    const theme = THEMES[cur.layout.id] ?? THEMES.yard;
    stepParticles(now);

    shake *= 0.88;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;

    ctx.fillStyle = theme.outside;
    ctx.fillRect(0, 0, arena.w, arena.h);
    ctx.save();
    ctx.translate(sx, sy);

    drawFloor(ctx, cur, theme);
    for (const s of scorches) circle(ctx, s.x, s.y, 55, 'rgba(20, 14, 10, .22)');
    drawObstacles(ctx, cur, now);
    drawBlastRing(ctx, cur, now);

    const bodies = lerpById(prev.players, cur.players, alpha);
    const holderId = cur.bomb?.holder;
    for (const p of bodies) if (!p.alive) drawOut(ctx, p, now);
    // Lower bodies first so overlaps look right.
    for (const p of [...bodies].filter((p) => p.alive).sort((a, b) => a.y - b.y)) drawBlob(ctx, p, cur, p.id === holderId, now);
    drawParticles(ctx, now);
    drawFlashes(ctx, now);
    for (const p of bodies) if (p.alive) nameTag(ctx, p.name, p.x, p.y - R - (p.id === holderId ? 62 : 16), p.id === holderId ? '#ffb347' : '#f2f4f8');

    ctx.restore();
    drawHud(ctx, cur, arena);
    drawBanner(ctx, cur, arena);
  },
};

// ---- fx -> decoration ------------------------------------------------------------------
function consumeFx(s, now) {
  const fx = s.fx ?? {};
  for (const k of fx.tackles ?? []) {
    const n = k.pass ? 18 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 260;
      particles.push({ x: k.x, y: k.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, max: 300 + Math.random() * 200, color: k.pass ? '#ffb347' : '#ffffff', size: 3 + Math.random() * 3 });
    }
    if (k.pass) particles.push({ x: k.x, y: k.y - 30, vx: 0, vy: -70, born: now, max: 800, color: '#ffd23c', text: 'PASS!', size: 34 });
    shake = Math.max(shake, k.pass ? 8 : 4);
  }
  for (const b of fx.booms ?? []) {
    flashes.push({ x: b.x, y: b.y, born: now });
    scorches.push({ x: b.x, y: b.y });
    const color = s.players.find((p) => p.id === b.id)?.color ?? '#888';
    if (!outAt.has(b.id)) outAt.set(b.id, { t: now, x: b.x, y: b.y, color });
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 200 + Math.random() * 700;
      particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, max: 500 + Math.random() * 600, color: pickC(['#ffd23c', '#ff8a3c', '#ff5a3c', '#5a5a5a', color]), size: 4 + Math.random() * 6 });
    }
    shake = 26;
  }
}

function stepParticles(now) {
  particles = particles.filter((p) => now - p.born < p.max);
  flashes = flashes.filter((f) => now - f.born < 600);
}

function drawParticles(ctx, now) {
  for (const p of particles) {
    const t = (now - p.born) / 1000;
    const k = 1 - (now - p.born) / p.max;
    const drag = Math.exp(-2.5 * t);
    const x = p.x + p.vx * (1 - drag) / 2.5;
    const y = p.y + p.vy * (1 - drag) / 2.5;
    ctx.globalAlpha = Math.max(0, k);
    if (p.text) text(ctx, p.text, x, y, { size: p.size, weight: 900, color: p.color });
    else circle(ctx, x, y, p.size * (0.4 + 0.6 * k), p.color);
  }
  ctx.globalAlpha = 1;
}

function drawFlashes(ctx, now) {
  for (const f of flashes) {
    const k = (now - f.born) / 600;
    ctx.globalAlpha = Math.max(0, 1 - k);
    circle(ctx, f.x, f.y, BLAST_R * (0.3 + 0.8 * k), 'rgba(255, 220, 140, .55)');
    circle(ctx, f.x, f.y, BLAST_R * 0.45 * (1 - k * 0.5), 'rgba(255, 255, 230, .8)');
    ctx.lineWidth = 10 * (1 - k) + 2;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(f.x, f.y, BLAST_R * (0.2 + k), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ---- World -----------------------------------------------------------------------------
function drawFloor(ctx, s, theme) {
  const { x0, y0, x1, y1 } = s.field;
  const w = x1 - x0;
  const h = y1 - y0;
  ctx.fillStyle = theme.fence;
  roundRect(ctx, x0 - 14, y0 - 14, w + 28, h + 28, 18);
  ctx.fill();
  ctx.save();
  roundRect(ctx, x0, y0, w, h, 8);
  ctx.clip();
  ctx.fillStyle = theme.floor[0];
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = theme.floor[1];
  if (s.layout.id === 'yard') {
    for (let x = x0; x < x1; x += 120) ctx.fillRect(x, y0, 60, h); // mowed stripes
  } else if (s.layout.id === 'kitchen') {
    const t = 64;
    for (let y = y0; y < y1; y += t) for (let x = x0 + (((y - y0) / t) % 2) * t; x < x1; x += t * 2) ctx.fillRect(x, y, t, t);
  } else {
    // Ice: scuffs and rink markings
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 14; i++) ctx.fillRect(x0 + ((i * 397) % w), y0 + ((i * 241) % h), 140, 3);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo((x0 + x1) / 2, y0);
    ctx.lineTo((x0 + x1) / 2, y1);
    ctx.stroke();
    ctx.strokeStyle = '#4f86c6';
    for (const x of [x0 + w * 0.3, x0 + w * 0.7]) {
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawObstacles(ctx, s, now) {
  for (const o of s.obstacles) {
    if (o.kind === 'box') {
      // Kitchen table
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      roundRect(ctx, o.x + 8, o.y + 12, o.w, o.h, 12);
      ctx.fill();
      ctx.fillStyle = '#8b5a33';
      roundRect(ctx, o.x, o.y, o.w, o.h, 12);
      ctx.fill();
      ctx.fillStyle = '#a06a3f';
      roundRect(ctx, o.x + 8, o.y + 8, o.w - 16, o.h - 16, 8);
      ctx.fill();
      circle(ctx, o.x + o.w * 0.3, o.y + o.h / 2, 16, '#f2f4f8'); // plates
      circle(ctx, o.x + o.w * 0.7, o.y + o.h / 2, 16, '#f2f4f8');
    } else if (o.bouncy) {
      const pulse = 1 + 0.03 * Math.sin(now / 160);
      circle(ctx, o.x + 6, o.y + 8, o.r, 'rgba(0,0,0,.25)');
      circle(ctx, o.x, o.y, o.r * pulse, '#e05561');
      circle(ctx, o.x, o.y, o.r * 0.7 * pulse, '#f2f4f8');
      circle(ctx, o.x, o.y, o.r * 0.4 * pulse, '#e05561');
    } else if (s.layout.id === 'yard') {
      // Tree, seen from above
      circle(ctx, o.x + 10, o.y + 12, o.r + 6, 'rgba(0,0,0,.28)');
      circle(ctx, o.x, o.y, o.r + 6, '#1f4d24');
      circle(ctx, o.x - 10, o.y - 8, o.r * 0.7, '#2d6a32');
      circle(ctx, o.x + 12, o.y + 6, o.r * 0.5, '#2a6230');
    } else {
      // Potted plant
      circle(ctx, o.x + 6, o.y + 8, o.r, 'rgba(0,0,0,.25)');
      circle(ctx, o.x, o.y, o.r, '#b4643c');
      circle(ctx, o.x, o.y, o.r * 0.78, '#3d2a1e');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(ctx, o.x + Math.cos(a) * o.r * 0.35, o.y + Math.sin(a) * o.r * 0.35, o.r * 0.4, '#3f8a46');
      }
    }
  }
}

/** A faint danger ring around the holder once the fuse is getting short. */
function drawBlastRing(ctx, s, now) {
  const b = s.bomb;
  if (!b?.burning || b.heat < 0.6) return;
  const p = s.players.find((q) => q.id === b.holder);
  if (!p) return;
  ctx.setLineDash([12, 12]);
  ctx.lineDashOffset = -now / 30;
  ctx.lineWidth = 3;
  ctx.strokeStyle = `rgba(255, 90, 60, ${0.2 + 0.5 * (b.heat - 0.6) / 0.4})`;
  ctx.beginPath();
  ctx.arc(p.x, p.y, BLAST_R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ---- Players ---------------------------------------------------------------------------
function drawBlob(ctx, p, s, holding, now) {
  const fade = p.connected ? 1 : 0.5;
  const speed = Math.hypot(p.vx, p.vy);
  const lift = p.dodging ? 16 : 0;
  // Squash and stretch along the direction of travel: the wobbly-body look.
  const stretch = Math.min(0.28, speed / 2400);
  const wob = Math.sin(now / 90 + p.x * 0.01) * Math.min(0.05, speed / 8000);
  const ang = Math.atan2(p.vy, p.vx);

  ctx.globalAlpha = fade;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(p.x + 4, p.y + 8, R * (p.dodging ? 0.8 : 1), R * (p.dodging ? 0.6 : 0.8), 0, 0, Math.PI * 2);
  ctx.fill();

  // Tackle streaks
  if (p.tackling) {
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = 4;
    for (const off of [-16, 0, 16]) {
      const px = -Math.sin(ang) * off;
      const py = Math.cos(ang) * off;
      ctx.beginPath();
      ctx.moveTo(p.x + px - Math.cos(ang) * (R + 4), p.y + py - Math.sin(ang) * (R + 4));
      ctx.lineTo(p.x + px - Math.cos(ang) * (R + 50), p.y + py - Math.sin(ang) * (R + 50));
      ctx.stroke();
    }
  }

  // Holder glow pulses faster as the fuse burns.
  const heat = holding ? s.bomb.heat : 0;
  if (holding) {
    const k = 0.5 + 0.5 * Math.sin(now / (220 - 160 * heat));
    circle(ctx, p.x, p.y - lift, R + 10 + 6 * k, `rgba(255, ${Math.round(120 - 80 * heat)}, 60, ${0.25 + 0.35 * k})`);
  }
  // Can't be handed the bomb back right now
  if (s.bomb?.noBack === p.id) {
    ctx.strokeStyle = 'rgba(255,255,255,.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y - lift, R + 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Body
  ctx.save();
  ctx.translate(p.x, p.y - lift);
  ctx.rotate(ang);
  ctx.scale(1 + stretch + wob, 1 - stretch * 0.6 - wob);
  circle(ctx, 0, 0, R, p.color);
  ctx.restore();
  circle(ctx, p.x - R * 0.35, p.y - lift - R * 0.4, R * 0.25, 'rgba(255,255,255,.3)');

  // Eyes look where you're heading
  const fx = p.fx || 1;
  const fy = p.fy || 0;
  const ex = p.x + fx * R * 0.35;
  const ey = p.y - lift + fy * R * 0.35;
  for (const side of [-1, 1]) {
    const ox = -fy * side * 10;
    const oy = fx * side * 10;
    if (p.dizzy) {
      text(ctx, '×', ex + ox, ey + oy + 7, { size: 22, weight: 900, color: '#1a1a1a' });
    } else {
      circle(ctx, ex + ox, ey + oy, 7, '#ffffff');
      circle(ctx, ex + ox + fx * 3, ey + oy + fy * 3, 3.5, '#1a1a1a');
    }
  }
  if (p.dizzy) {
    for (let i = 0; i < 3; i++) {
      const a = now / 200 + (i / 3) * Math.PI * 2;
      text(ctx, '★', p.x + Math.cos(a) * 26, p.y - lift - R - 6 + Math.sin(a) * 8, { size: 18, color: '#ffd23c' });
    }
  }
  if (holding) drawBomb(ctx, p.x, p.y - lift - R - 20, heat, s.bomb.burning, now);
  ctx.globalAlpha = 1;
}

function drawBomb(ctx, x, y, heat, burning, now) {
  const throb = 1 + (burning ? 0.06 + 0.1 * heat : 0) * Math.max(0, Math.sin(now / (200 - 150 * heat)));
  const r = 20 * throb;
  const red = Math.round(30 + 200 * heat * (0.6 + 0.4 * Math.sin(now / 90)));
  circle(ctx, x, y, r, `rgb(${red}, 28, 28)`);
  circle(ctx, x - r * 0.35, y - r * 0.35, r * 0.28, 'rgba(255,255,255,.35)');
  // Cap and fuse
  ctx.fillStyle = '#555';
  ctx.fillRect(x + r * 0.35, y - r - 2, 10, 8);
  ctx.strokeStyle = '#c9a36b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + r * 0.35 + 5, y - r - 2);
  ctx.quadraticCurveTo(x + r + 8, y - r - 14, x + r + 2, y - r - 22);
  ctx.stroke();
  if (burning) {
    const sx = x + r + 2;
    const sy = y - r - 22;
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * 9;
      circle(ctx, sx + Math.cos(a) * d, sy + Math.sin(a) * d, 2 + Math.random() * 2, pickC(['#ffd23c', '#ff8a3c', '#ffffff']));
    }
  }
}

function drawOut(ctx, p, now) {
  const d = outAt.get(p.id);
  if (!d) return;
  const t = (now - d.t) / 1000;
  if (t > 3) return;
  // A sooty little ghost floats up from the blast.
  ctx.globalAlpha = Math.max(0, 1 - t / 3) * 0.7;
  const y = d.y - t * 50;
  circle(ctx, d.x, y, R * 0.8, '#3a3a3a');
  text(ctx, '× ×', d.x, y + 6, { size: 18, weight: 900, color: '#f2f4f8' });
  ctx.globalAlpha = 1;
}

// ---- HUD -------------------------------------------------------------------------------
function drawHud(ctx, s, arena) {
  text(ctx, `Round ${s.round} of ${s.rounds} · ${s.layout.title}`, 80, 62, { size: 26, weight: 800, color: '#c8cfdc', align: 'left' });
  const holder = s.bomb && s.players.find((p) => p.id === s.bomb.holder);
  if (holder) text(ctx, `💣 ${holder.name}`, arena.w - 80, 62, { size: 28, weight: 900, color: '#ffb347', align: 'right' });
  else if (s.nextBomb != null) text(ctx, 'Next bomb…', arena.w - 80, 62, { size: 26, weight: 800, color: '#8a93a8', align: 'right' });

  // Score chips, left to right by score
  const alive = new Map(s.players.map((p) => [p.id, p.alive]));
  const w = Math.min(180, (arena.w - 160) / Math.max(1, s.scores.length));
  s.scores.forEach((p, i) => {
    const x = 80 + i * w;
    ctx.globalAlpha = alive.get(p.id) === false ? 0.4 : 1;
    circle(ctx, x + 10, 103, 10, p.color);
    const short = p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name;
    text(ctx, short, x + 26, 111, { size: 21, align: 'left' });
    text(ctx, String(p.score), x + w - 18, 111, { size: 22, weight: 800, color: '#ffd23c', align: 'right' });
    ctx.globalAlpha = 1;
  });
}

function drawBanner(ctx, s, arena) {
  const cx = arena.w / 2;
  const cy = arena.h / 2;
  if (s.phase === 'countdown') {
    ctx.fillStyle = 'rgba(11, 13, 18, .55)';
    ctx.fillRect(0, cy - 120, arena.w, 220);
    text(ctx, String(s.timer || 'GO'), cx, cy + 30, { size: 150, weight: 900, color: '#ffc93c' });
    const holder = s.bomb && s.players.find((p) => p.id === s.bomb.holder);
    if (holder) text(ctx, `${holder.name} starts with the bomb. Tackle (A) to pass it, Dodge (B) to hop.`, cx, cy + 85, { size: 28, weight: 700 });
  } else if (s.phase === 'roundover') {
    const last = s.round >= s.rounds;
    const line = s.roundWinner ? `${s.roundWinner} survives! +2` : 'Nobody left standing!';
    ctx.fillStyle = 'rgba(11, 13, 18, .7)';
    ctx.fillRect(0, cy - 80, arena.w, 150);
    text(ctx, line, cx, cy + 10, { size: 60, weight: 900 });
    text(ctx, last ? 'Final scores coming up' : `Next: round ${s.round + 1} of ${s.rounds}`, cx, cy + 52, { size: 26, color: '#c8cfdc' });
  }
}

// ---- Helpers ---------------------------------------------------------------------------
/** A name with a dark outline, readable on grass, tiles and ice alike. */
function nameTag(ctx, str, x, y, color) {
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(10, 12, 18, .85)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
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

function pickC(a) {
  return a[Math.floor(Math.random() * a.length)];
}
