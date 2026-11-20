import { circle, text } from './util.js';

// Sumo Spin TV renderer: the spinning, tilting ring and the wrestlers on it.
// Sparks, afterimages and the "Perfect!" pop are client-side decoration driven by the
// snapshot's fx events; the server decides everything that matters.

const FALL_MS = 650;
const fallStarted = new Map(); // id -> { t, dx, dy } when we first saw them fall
let lastRound = 0;
let lastCur = null;
let particles = []; // { x, y, vx, vy, born, max, color, size, text? }
let trails = []; // lunge afterimages { x, y, r, color, born }
let shake = 0;
let nextBeatAt = 0;
let lastPerfectSay = 0;

export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const t = performance.now();

    if (s.phase === 'countdown' && (!prev || prev.phase !== 'countdown' || s.timer !== prev.timer) && s.timer > 0) {
      sfx.beep();
      if (!prev || prev.phase !== 'countdown') say(s.round === 1 ? 'Into the ring!' : `Round ${s.round}!`, { rate: 1.1, interrupt: true });
    }
    if (s.phase === 'play' && prev?.phase === 'countdown') {
      sfx.beep(true);
      say('Spin!', { rate: 1.2, interrupt: true });
    }
    if (!prev) return;
    const fx = s.fx ?? {};

    const bumps = fx.bumps ?? [];
    if (bumps.length) sfx.thud(Math.max(...bumps.map((b) => b.power)));
    if (fx.lunges?.length) sfx.whoosh();
    if (fx.dodges) sfx.swish();
    if (fx.perfects?.length) {
      sfx.ding();
      if (t - lastPerfectSay > 4000) {
        lastPerfectSay = t;
        const p = s.players.find((q) => q.id === fx.perfects[0].id);
        if (p) say(pick([`Perfect dodge, ${p.name}!`, `${p.name} slips away!`, 'Ole!']), { rate: 1.15 });
      }
    }
    if (fx.flip && s.phase === 'play') sfx.doorCreak();
    if (s.platform.crumbling && !prev.platform.crumbling) {
      sfx.alarm();
      say('The edge is crumbling!', { rate: 1.1 });
    }
    for (const f of fx.falls ?? []) {
      sfx.fall();
      const p = s.players.find((q) => q.id === f.id);
      if (p && !s.solo) say(pick([`${p.name} is out!`, `${p.name} flies off!`, `So long, ${p.name}!`]), { rate: 1.1 });
    }

    // Heartbeat while the edge crumbles: faster as the ring gets small.
    if (s.phase === 'play' && s.platform.crumbling && t >= nextBeatAt) {
      const danger = 1 - s.platform.r / s.platform.full;
      sfx.heartbeat(danger);
      nextBeatAt = t + 1000 - 650 * danger;
    }

    if (s.phase === 'roundover' && prev.phase !== 'roundover') {
      if (s.matchWinner) {
        sfx.fanfare();
        say(`${s.matchWinner} wins the match!`, { delay: 0.8 });
      } else if (s.roundWinner) {
        sfx.jingle();
        say(`${s.roundWinner} wins the round!`, { delay: 0.8 });
      } else if (!s.solo) {
        sfx.buzz();
        say('Everyone fell. A draw!', { delay: 0.8 });
      }
    }
  },

  draw(ctx, { prev, cur, alpha, arena, now }) {
    if (cur.round !== lastRound) {
      fallStarted.clear();
      particles = [];
      trails = [];
      lastRound = cur.round;
    }
    if (cur !== lastCur) {
      consumeFx(cur, now);
      lastCur = cur;
    }
    particles = particles.filter((p) => now - p.born < p.max);
    trails = trails.filter((t) => now - t.born < 220);

    const pl = {
      ...cur.platform,
      r: lerp(prev.platform.r, cur.platform.r, alpha),
      angle: lerpAngle(prev.platform.angle, cur.platform.angle, alpha),
      tiltDir: lerpAngle(prev.platform.tiltDir, cur.platform.tiltDir, alpha),
      tilt: lerp(prev.platform.tilt, cur.platform.tilt, alpha),
    };

    ctx.fillStyle = '#0c0b10';
    ctx.fillRect(0, 0, arena.w, arena.h);
    const vg = ctx.createRadialGradient(pl.x, pl.y, 100, pl.x, pl.y, 900);
    vg.addColorStop(0, '#1d1826');
    vg.addColorStop(1, '#0c0b10');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, arena.w, arena.h);

    shake *= 0.88;
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    drawPlatform(ctx, pl, cur, now);

    const prevById = new Map(prev.players.map((p) => [p.id, p]));
    const bodies = cur.players.map((p) => {
      const q = prevById.get(p.id);
      return q ? { ...p, x: lerp(q.x, p.x, alpha), y: lerp(q.y, p.y, alpha), facing: lerpAngle(q.facing, p.facing, alpha) } : p;
    });
    for (const p of bodies) if (p.lunging && p.alive) trails.push({ x: p.x, y: p.y, r: p.r, color: p.color, born: now });
    for (const t of trails) {
      ctx.globalAlpha = 0.25 * (1 - (now - t.born) / 220);
      circle(ctx, t.x, t.y, t.r, t.color);
    }
    ctx.globalAlpha = 1;
    // Fallen ones first, so they drop "below" the ring's edge.
    for (const p of bodies) if (!p.alive) drawFalling(ctx, p, pl, now);
    for (const p of bodies) if (p.alive) drawWrestler(ctx, p, now);
    drawParticles(ctx, now);
    for (const p of bodies) if (p.alive) text(ctx, p.name, p.x, p.y - p.r - 16, { size: 24 });
    ctx.restore();

    drawScoreboard(ctx, cur);
    drawBanner(ctx, cur, arena);
  },
};

// ---- Ring ------------------------------------------------------------------------------
function drawPlatform(ctx, pl, s, now) {
  const { x: cx, y: cy, r, angle, tilt, tiltDir } = pl;
  const ux = Math.cos(tiltDir);
  const uy = Math.sin(tiltDir);

  // Where the ring started, once the edge crumbles.
  if (r < pl.full - 1) {
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = '#2a2433';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, pl.full, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (r <= 0) return;

  // Shadow falls toward the low side, deeper as it tilts.
  circle(ctx, cx + ux * (10 + 26 * tilt), cy + uy * (14 + 26 * tilt), r + 6, 'rgba(0,0,0,.5)');

  // Clay surface, lit on the high side.
  const g = ctx.createRadialGradient(cx - ux * r * 0.45 * tilt, cy - uy * r * 0.45 * tilt, r * 0.1, cx, cy, r * 1.1);
  g.addColorStop(0, '#d9b98a');
  g.addColorStop(0.7, '#b89566');
  g.addColorStop(1, '#8c6c48');
  circle(ctx, cx, cy, r, g);

  // Darken the low side so the tilt reads at a glance.
  if (tilt > 0.02) {
    const lg = ctx.createLinearGradient(cx - ux * r, cy - uy * r, cx + ux * r, cy + uy * r);
    lg.addColorStop(0, 'rgba(255,240,210,0)');
    lg.addColorStop(0.55, 'rgba(40,20,10,0)');
    lg.addColorStop(1, `rgba(40,20,10,${0.55 * tilt})`);
    circle(ctx, cx, cy, r, lg);
  }

  // Markings turn with the ring.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 8;
  for (const sx of [-60, 60]) {
    ctx.beginPath();
    ctx.moveTo(sx, -38);
    ctx.lineTo(sx, 38);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(90,60,30,.35)';
  ctx.lineWidth = 4;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * pl.full * 0.72, Math.sin(a) * pl.full * 0.72);
    ctx.lineTo(Math.cos(a) * pl.full * 0.9, Math.sin(a) * pl.full * 0.9);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(0, 0, pl.full * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Rope rim, and a red glow on the low side.
  ctx.lineWidth = 14;
  ctx.strokeStyle = s.platform.crumbling ? `rgba(255,90,95,${0.6 + 0.35 * Math.sin(now / 140)})` : '#6b4f2e';
  ctx.beginPath();
  ctx.arc(cx, cy, r - 7, 0, Math.PI * 2);
  ctx.stroke();
  if (tilt > 0.05) {
    ctx.strokeStyle = `rgba(255,80,60,${0.25 + 0.55 * tilt})`;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 7, tiltDir - 0.7, tiltDir + 0.7);
    ctx.stroke();
    // Downhill chevrons near the low edge.
    ctx.save();
    ctx.translate(cx + ux * r * 0.8, cy + uy * r * 0.8);
    ctx.rotate(tiltDir);
    ctx.strokeStyle = `rgba(255,255,255,${0.15 + 0.4 * tilt})`;
    ctx.lineWidth = 5;
    const off = ((now / 400) % 1) * 14;
    for (let i = 0; i < 3; i++) {
      const x = -28 + i * 14 + off;
      ctx.beginPath();
      ctx.moveTo(x - 10, -14);
      ctx.lineTo(x, 0);
      ctx.lineTo(x - 10, 14);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Spin arrows outside the rim, faster spin = bolder.
  const dir = Math.sign(s.platform.spin) || 1;
  ctx.strokeStyle = `rgba(255,201,60,${0.25 + 0.6 * Math.min(1, Math.abs(s.platform.spin))})`;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    const a0 = angle + (i / 4) * Math.PI * 2;
    const a1 = a0 + 0.35 * dir;
    const rr = r + 22;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, Math.min(a0, a1), Math.max(a0, a1));
    ctx.stroke();
    const hx = cx + Math.cos(a1) * rr;
    const hy = cy + Math.sin(a1) * rr;
    const tx = -Math.sin(a1) * dir;
    const ty = Math.cos(a1) * dir;
    ctx.beginPath();
    ctx.moveTo(hx + tx * 12, hy + ty * 12);
    ctx.lineTo(hx - tx * 2 + Math.cos(a1) * 9, hy - ty * 2 + Math.sin(a1) * 9);
    ctx.lineTo(hx - tx * 2 - Math.cos(a1) * 9, hy - ty * 2 - Math.sin(a1) * 9);
    ctx.closePath();
    ctx.fill();
  }
}

// ---- Wrestlers -----------------------------------------------------------------------
function drawWrestler(ctx, p, now) {
  const fade = p.connected ? 1 : 0.5;
  ctx.globalAlpha = fade * (p.dodging ? 0.45 : 1);
  if (p.counter) circle(ctx, p.x, p.y, p.r + 12 + 3 * Math.sin(now / 90), 'rgba(255,214,90,.35)');
  circle(ctx, p.x, p.y + 7, p.r, 'rgba(0,0,0,.35)');
  circle(ctx, p.x, p.y, p.r, p.color);

  // Belt across the body, square to where they face.
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.facing);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(-7, -p.r, 10, p.r * 2);
  ctx.restore();
  circle(ctx, p.x - p.r * 0.3, p.y - p.r * 0.35, p.r * 0.26, 'rgba(255,255,255,.3)');

  // Eyes look where they face.
  const fx = Math.cos(p.facing);
  const fy = Math.sin(p.facing);
  for (const side of [-1, 1]) {
    const ex = p.x + fx * p.r * 0.45 - fy * side * 9;
    const ey = p.y + fy * p.r * 0.45 + fx * side * 9;
    circle(ctx, ex, ey, 6, '#fff');
    circle(ctx, ex + fx * 2, ey + fy * 2, 3, '#111');
  }

  // Charge meter around the body.
  if (p.charge > 0) {
    const full = p.charge >= 1;
    ctx.lineWidth = 6;
    ctx.strokeStyle = full ? (Math.floor(now / 90) % 2 ? '#fff' : '#ffc93c') : '#ffc93c';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 9, -Math.PI / 2, -Math.PI / 2 + p.charge * Math.PI * 2);
    ctx.stroke();
  }
  if (p.stumbling) {
    for (let i = 0; i < 3; i++) {
      const a = now / 160 + (i / 3) * Math.PI * 2;
      circle(ctx, p.x + Math.cos(a) * 24, p.y - p.r - 4 + Math.sin(a) * 7, 4, '#ffe08a');
    }
  }
  ctx.globalAlpha = 1;
}

function drawFalling(ctx, p, pl, now) {
  if (!fallStarted.has(p.id)) {
    const d = Math.hypot(p.x - pl.x, p.y - pl.y) || 1;
    fallStarted.set(p.id, { t: now, dx: (p.x - pl.x) / d, dy: (p.y - pl.y) / d });
  }
  const f = fallStarted.get(p.id);
  const k = Math.min(1, (now - f.t) / FALL_MS);
  if (k >= 1) return;
  const s = 1 - k * 0.8;
  ctx.globalAlpha = (1 - k) * (p.connected ? 1 : 0.5);
  circle(ctx, p.x + f.dx * 60 * k, p.y + f.dy * 60 * k + 40 * k * k, p.r * s, p.color);
  ctx.globalAlpha = 1;
}

// ---- fx -> particles -------------------------------------------------------------------
function consumeFx(s, now) {
  const fx = s.fx ?? {};
  for (const b of fx.bumps ?? []) {
    const n = 4 + Math.round(b.power * 12);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 80 + Math.random() * 280 * (0.4 + b.power);
      particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, max: 300 + Math.random() * 250, color: '#f3dcb0', size: 3 + Math.random() * 4 });
    }
    shake = Math.max(shake, b.power * 14);
  }
  for (const p of fx.perfects ?? []) {
    particles.push({ x: p.x, y: p.y - 50, vx: 0, vy: -70, born: now, max: 900, color: '#ffd23c', text: 'PERFECT!', size: 34 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      particles.push({ x: p.x, y: p.y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, born: now, max: 380, color: '#ffd23c', size: 4 });
    }
  }
  if (particles.length > 500) particles = particles.slice(-500);
}

function drawParticles(ctx, now) {
  for (const p of particles) {
    const t = (now - p.born) / 1000;
    const x = p.x + p.vx * t;
    const y = p.y + p.vy * t;
    ctx.globalAlpha = Math.max(0, 1 - (now - p.born) / p.max);
    if (p.text) {
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.font = `900 ${p.size}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.strokeText(p.text, x, y);
      text(ctx, p.text, x, y, { size: p.size, weight: 900, color: p.color });
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(x - p.size / 2, y - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

// ---- HUD -------------------------------------------------------------------------------
function drawScoreboard(ctx, s) {
  const x = 80;
  let y = 70;
  text(ctx, s.solo ? `Practice · round ${s.round} of ${s.winScore}` : `Round ${s.round} · first to ${s.winScore}`, x, y, { size: 24, weight: 700, color: '#8a93a8', align: 'left' });
  if (!s.solo) {
    y += 16;
    for (const p of s.scores) {
      y += 38;
      circle(ctx, x + 10, y - 8, 10, p.color);
      text(ctx, p.name, x + 32, y, { size: 24, align: 'left' });
      for (let i = 0; i < s.winScore; i++) {
        const filled = i < p.score;
        ctx.beginPath();
        ctx.arc(x + 230 + i * 26, y - 8, 8, 0, Math.PI * 2);
        ctx.fillStyle = filled ? p.color : 'transparent';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = filled ? p.color : '#3a425a';
        ctx.stroke();
      }
    }
  }
  // Controls reminder, bottom-left, for the first rounds.
  if (s.round <= 2 && s.phase !== 'roundover') {
    text(ctx, 'Hold Charge, let go to lunge · Dodge just before a lunge hits', x, 900 - 60, { size: 22, color: '#8a93a8', align: 'left' });
  }
}

function drawBanner(ctx, s, arena) {
  const cx = arena.w / 2;
  const cy = arena.h / 2;
  if (s.phase === 'countdown') {
    text(ctx, String(s.timer || 'GO'), cx, cy + 40, { size: 160, weight: 900, color: '#ffc93c' });
  } else if (s.phase === 'roundover') {
    let line;
    if (s.matchWinner) line = `${s.matchWinner} wins the match!`;
    else if (s.solo) line = 'Out of the ring!';
    else line = s.roundWinner ? `${s.roundWinner} wins the round` : 'Draw!';
    ctx.fillStyle = 'rgba(12, 11, 16, .72)';
    ctx.fillRect(0, cy - 70, arena.w, 120);
    text(ctx, line, cx, cy + 14, { size: 64, weight: 900 });
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
