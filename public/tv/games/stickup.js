import { lerpById, circle, text } from './util.js';

// Stickup TV renderer: draws the arena, stick fighters, weapons and effects from snapshots.
// Hit sparks, damage numbers, screen shake and death ragdolls are client-side decoration
// driven by the snapshot's fx events; the server decides everything that matters.

const H = 72; // must match server body height
const HEAD_R = 11;

const THEMES = {
  rooftops: { sky: ['#141a33', '#2a2448'], solid: '#262c40', solidTop: '#3d4663', ledge: '#5b6788' },
  factory: { sky: ['#15171c', '#23262e'], solid: '#2c2f36', solidTop: '#555b66', ledge: '#7a808c' },
  lava: { sky: ['#1a0d0d', '#36130e'], solid: '#2e2020', solidTop: '#5a3a30', ledge: '#7a5446' },
};

let lastCur = null;
let lastRound = 0;
let particles = []; // { x, y, vx, vy, life, max, color, size, text? }
let shake = 0;
const deadAt = new Map(); // id -> { t, x, y, facing, color, fell }
let stars = null;

export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;

    if (s.phase === 'countdown' && (!prev || prev.phase !== 'countdown' || s.timer !== prev.timer) && s.timer > 0) {
      sfx.beep();
      if (!prev || prev.phase !== 'countdown' || prev.round !== s.round) {
        say(s.round === 1 ? `Get ready! ${s.arena.title}.` : `Round ${s.round}. ${s.arena.title}!`, { rate: 1.1, interrupt: true });
      }
    }
    if (s.phase === 'play' && prev?.phase === 'countdown') {
      sfx.beep(true);
      say('Fight!', { rate: 1.2, interrupt: true });
    }
    if (!prev) return;
    const fx = s.fx ?? {};
    const name = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';

    for (const shot of fx.shots ?? []) {
      if (shot.weapon === 'fists' || shot.weapon === 'bat') sfx.swing();
      else if (shot.weapon === 'pistol') sfx.pistol();
      else if (shot.weapon === 'shotgun') sfx.shotgun();
      else if (shot.weapon === 'grenade') sfx.toss();
      else if (shot.weapon === 'railgun') sfx.zap();
    }
    if (fx.charge?.length) sfx.charge();
    const hits = fx.hits ?? [];
    if (hits.length) {
      const big = Math.max(...hits.map((h) => h.dmg));
      sfx.punch(big >= 18);
      if (hits.some((h) => h.head && h.dmg >= 12)) sfx.ding();
    }
    if (fx.booms?.length) sfx.boom();
    if (fx.pickups?.length) sfx.pickup();
    if (fx.crates) {
      sfx.drop();
      if (Math.random() < 0.35) say(pick(['Supply drop!', 'Weapon incoming!', 'Crate!']), { rate: 1.15 });
    }
    if (fx.crush) sfx.slam();
    if (fx.lava) sfx.sizzle();

    for (const d of fx.deaths ?? []) {
      const who = name(d.id);
      sfx.fall();
      let line;
      if (d.by && d.by !== d.id) line = pick([`${name(d.by)} takes out ${who}!`, `${who} is out, thanks to ${name(d.by)}!`, `${name(d.by)} gets ${who}!`]);
      else if (d.fell) line = pick([`${who} falls!`, `Bye bye, ${who}!`, `${who} takes a dive!`]);
      else line = pick([`${who} is out!`, `${who} is done!`]);
      say(line, { rate: 1.15 });
    }

    if (s.suddenDeath && !prev.suddenDeath && s.phase === 'play') {
      sfx.alarm();
      say('Sudden death! Everyone is losing health!', { rate: 1.1 });
    }
    if (s.lavaY != null && prev.lavaY != null && prev.lavaY >= 895 && s.lavaY < 895) say('The lava is rising!', { rate: 1.1 });

    if (s.phase === 'roundover' && prev.phase !== 'roundover') {
      if (s.matchWinner) {
        sfx.fanfare();
        say(`${s.matchWinner} wins the match!`, { delay: 0.8 });
      } else if (s.roundWinner) {
        sfx.jingle();
        say(`${s.roundWinner} wins the round!`, { delay: 0.8 });
      } else {
        sfx.buzz();
        say('Nobody left standing. A draw!', { delay: 0.8 });
      }
    }
  },

  draw(ctx, { prev, cur, alpha, arena, now }) {
    if (cur.round !== lastRound) {
      deadAt.clear();
      particles = [];
      lastRound = cur.round;
    }
    if (cur !== lastCur) {
      consumeFx(cur, now);
      lastCur = cur;
    }
    const theme = THEMES[cur.arena.id] ?? THEMES.rooftops;
    stepParticles(now);

    // Screen shake decays over time.
    shake *= 0.9;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;

    drawBackground(ctx, cur, theme, arena, now);
    ctx.save();
    ctx.translate(sx, sy);

    drawPlatforms(ctx, prev, cur, alpha, theme, now);
    drawCrushers(ctx, cur, now);
    drawCrates(ctx, prev, cur, alpha, now);

    // Fighters
    const players = lerpById(prev.players, cur.players, alpha);
    for (const p of players) {
      if (p.alive) drawFighter(ctx, p, cur, now);
      else drawDead(ctx, p, now);
    }

    drawProjectiles(ctx, prev, cur, alpha, now);
    drawLava(ctx, prev, cur, alpha, arena, now);
    drawParticles(ctx, now);
    for (const p of players) if (p.alive) drawTag(ctx, p);

    ctx.restore();
    drawHud(ctx, cur, arena);
    drawBanner(ctx, cur, arena);
  },
};

// ---- fx -> particles -----------------------------------------------------------------
function consumeFx(s, now) {
  const fx = s.fx ?? {};
  for (const h of fx.hits ?? []) {
    const n = 6 + Math.min(14, h.dmg / 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 120 + Math.random() * 320;
      particles.push({ x: h.x, y: h.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, born: now, max: 350 + Math.random() * 250, color: h.head ? '#ffd23c' : '#ff5a5f', size: 3 + Math.random() * 3 });
    }
    particles.push({ x: h.x, y: h.y - 20, vx: 0, vy: -90, born: now, max: 800, color: h.head ? '#ffd23c' : '#ffffff', text: h.head ? `${h.dmg}!` : String(h.dmg), size: h.head ? 34 : 26 });
    shake = Math.max(shake, Math.min(16, h.dmg * 0.35));
  }
  for (const b of fx.booms ?? []) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 150 + Math.random() * 500;
      particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, born: now, max: 500 + Math.random() * 400, color: pickC(['#ffb03c', '#ff6b3c', '#ffe08a', '#777']), size: 4 + Math.random() * 5 });
    }
    shake = 30;
  }
  if (fx.crush) shake = Math.max(shake, 18);
  for (const d of fx.deaths ?? []) {
    const p = s.players.find((q) => q.id === d.id);
    if (p && !deadAt.has(p.id)) deadAt.set(p.id, { t: now, x: p.x, y: p.y, facing: p.facing, color: p.color, fell: d.fell });
  }
  if (fx.lava) {
    for (const p of s.players) {
      if (!p.alive || s.lavaY == null || p.y < s.lavaY - 30) continue;
      for (let i = 0; i < 3; i++) particles.push({ x: p.x + (Math.random() - 0.5) * 30, y: s.lavaY, vx: (Math.random() - 0.5) * 120, vy: -200 - Math.random() * 200, born: now, max: 500, color: '#ffb03c', size: 4 });
    }
  }
  if (particles.length > 600) particles = particles.slice(-600);
}

function stepParticles(now) {
  particles = particles.filter((p) => now - p.born < p.max);
}

function drawParticles(ctx, now) {
  for (const p of particles) {
    const t = (now - p.born) / 1000;
    const k = 1 - (now - p.born) / p.max;
    const x = p.x + p.vx * t;
    const y = p.y + p.vy * t + (p.text ? 0 : 900 * t * t);
    ctx.globalAlpha = Math.max(0, k);
    if (p.text) {
      ctx.lineWidth = 5;
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

// ---- World -----------------------------------------------------------------------------
function drawBackground(ctx, s, theme, arena, now) {
  const g = ctx.createLinearGradient(0, 0, 0, arena.h);
  g.addColorStop(0, theme.sky[0]);
  g.addColorStop(1, theme.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, arena.w, arena.h);

  if (s.arena.id === 'rooftops') {
    if (!stars) stars = Array.from({ length: 70 }, () => [Math.random() * arena.w, Math.random() * 420, Math.random()]);
    for (const [x, y, k] of stars) {
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(now / 900 + k * 10));
      ctx.fillStyle = '#cfd8ff';
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    circle(ctx, 1380, 140, 46, '#e8e4c8');
    circle(ctx, 1364, 130, 46, theme.sky[0]);
    // Far skyline
    ctx.fillStyle = '#1b2036';
    for (let i = 0; i < 16; i++) {
      const w = 70 + ((i * 37) % 60);
      const h = 160 + ((i * 53) % 200);
      ctx.fillRect(i * 105 - 20, arena.h - h - 260, w, h + 260);
    }
  } else if (s.arena.id === 'factory') {
    ctx.strokeStyle = '#2b2f38';
    ctx.lineWidth = 10;
    for (let x = 100; x < arena.w; x += 260) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, arena.h);
      ctx.stroke();
    }
    // Pit glow
    const pg = ctx.createLinearGradient(0, 760, 0, 900);
    pg.addColorStop(0, 'rgba(0,0,0,0)');
    pg.addColorStop(1, 'rgba(0,0,0,.6)');
    ctx.fillStyle = pg;
    ctx.fillRect(600, 760, 400, 140);
  } else if (s.arena.id === 'lava') {
    ctx.fillStyle = 'rgba(255,90,40,.06)';
    for (let i = 0; i < 6; i++) circle(ctx, (i * 311 + now / 40) % arena.w, 200 + ((i * 97) % 400), 90, 'rgba(255,90,40,.04)');
  }
}

function drawPlatforms(ctx, prev, cur, alpha, theme, now) {
  cur.platforms.forEach((p, i) => {
    if (p.gone) return;
    const pp = prev.platforms?.[i];
    let x = pp && prev.arena?.id === cur.arena.id ? pp.x + (p.x - pp.x) * alpha : p.x;
    let y = p.y;
    if (p.shaking) {
      x += Math.sin(now / 25) * 3;
      y += Math.cos(now / 31) * 2;
    }
    if (p.type === 'solid') {
      ctx.fillStyle = theme.solid;
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = theme.solidTop;
      ctx.fillRect(x, y, p.w, Math.min(8, p.h));
      if (cur.arena.id === 'rooftops' && p.h > 100) {
        // Windows
        ctx.fillStyle = 'rgba(255, 214, 120, .18)';
        for (let wx = x + 30; wx < x + p.w - 40; wx += 70) for (let wy = y + 50; wy < y + p.h; wy += 80) ctx.fillRect(wx, wy, 26, 34);
      }
      if (cur.arena.id === 'factory' && p.h < 30) {
        ctx.fillStyle = '#e0b030';
        for (let sx = x; sx < x + p.w; sx += 24) ctx.fillRect(sx, y + 2, 12, 6);
      }
    } else {
      const col = p.type === 'crumble' ? (p.shaking ? '#c06040' : '#8a5a48') : theme.ledge;
      ctx.fillStyle = col;
      ctx.fillRect(x, y, p.w, p.h);
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.fillRect(x, y, p.w, 3);
      if (p.type === 'crumble') {
        ctx.strokeStyle = 'rgba(0,0,0,.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let cx = x + 25; cx < x + p.w; cx += 40) {
          ctx.moveTo(cx, y);
          ctx.lineTo(cx + 8, y + p.h);
        }
        ctx.stroke();
      }
    }
  });
}

function drawCrushers(ctx, s, now) {
  for (const c of s.crushers ?? []) {
    const h = Math.max(36, c.h);
    // Piston rod and block
    ctx.fillStyle = '#3a3e48';
    ctx.fillRect(c.x + c.w / 2 - 12, 0, 24, h);
    const warn = c.state === 'warn';
    ctx.fillStyle = warn && Math.floor(now / 120) % 2 ? '#ff5a5f' : '#5c6270';
    ctx.fillRect(c.x, h - 60, c.w, 60);
    ctx.fillStyle = '#e0b030';
    for (let sx = c.x; sx < c.x + c.w; sx += 28) ctx.fillRect(sx, h - 14, 14, 10);
    if (warn) {
      // Danger zone on the floor
      ctx.fillStyle = `rgba(255, 90, 95, ${0.25 + 0.2 * Math.sin(now / 60)})`;
      ctx.fillRect(c.x, h, c.w, 760 - h);
    }
  }
}

function drawLava(ctx, prev, cur, alpha, arena, now) {
  if (cur.lavaY == null) return;
  const y = prev.lavaY != null ? prev.lavaY + (cur.lavaY - prev.lavaY) * alpha : cur.lavaY;
  if (y >= arena.h) return;
  const g = ctx.createLinearGradient(0, y, 0, arena.h);
  g.addColorStop(0, '#ff8a2a');
  g.addColorStop(0.2, '#e8431c');
  g.addColorStop(1, '#7a1308');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, arena.h);
  for (let x = 0; x <= arena.w; x += 20) ctx.lineTo(x, y + Math.sin(x / 60 + now / 300) * 6);
  ctx.lineTo(arena.w, arena.h);
  ctx.closePath();
  ctx.fill();
  // Bubbles
  for (let i = 0; i < 8; i++) {
    const bx = (i * 211 + now / 20) % arena.w;
    const k = ((now / 700 + i * 0.37) % 1);
    circle(ctx, bx, y + 8 - k * 14, 4 + k * 4, `rgba(255, 220, 120, ${1 - k})`);
  }
}

function drawCrates(ctx, prev, cur, alpha, now) {
  for (const c of lerpById(prev.crates, cur.crates, alpha)) {
    const sway = c.chute ? Math.sin(now / 300 + c.id) * 0.15 : 0;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(sway);
    if (c.chute) {
      ctx.strokeStyle = '#cfd5e0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-18, -34);
      ctx.lineTo(-44, -96);
      ctx.moveTo(18, -34);
      ctx.lineTo(44, -96);
      ctx.stroke();
      ctx.fillStyle = '#e85a4f';
      ctx.beginPath();
      ctx.arc(0, -96, 48, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#f2f4f8';
      ctx.beginPath();
      ctx.arc(0, -96, 48, Math.PI * 1.33, Math.PI * 1.66);
      ctx.lineTo(0, -96);
      ctx.fill();
    }
    ctx.fillStyle = '#9a6a38';
    ctx.fillRect(-18, -34, 36, 34);
    ctx.strokeStyle = '#5e3e1e';
    ctx.lineWidth = 3;
    ctx.strokeRect(-18, -34, 36, 34);
    ctx.beginPath();
    ctx.moveTo(-18, -34);
    ctx.lineTo(18, 0);
    ctx.stroke();
    ctx.restore();
    // Weapon icon above landed crates
    if (c.landed) {
      const bob = Math.sin(now / 250 + c.id) * 4;
      ctx.save();
      ctx.translate(c.x, c.y - 56 + bob);
      drawWeapon(ctx, c.weapon, 1.3);
      ctx.restore();
    }
  }
}

function drawProjectiles(ctx, prev, cur, alpha, now) {
  for (const b of lerpById(prev.bullets, cur.bullets, alpha)) {
    const n = Math.hypot(b.vx, b.vy) || 1;
    const len = b.weapon === 'shotgun' ? 14 : 22;
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = b.weapon === 'shotgun' ? 3 : 4;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - (b.vx / n) * len, b.y - (b.vy / n) * len);
    ctx.stroke();
  }
  for (const g of lerpById(prev.grenades, cur.grenades, alpha)) {
    circle(ctx, g.x, g.y, 9, '#4b6b3a');
    const blink = g.fuse < 0.6 ? Math.floor(now / 80) % 2 : Math.floor(now / 250) % 2;
    circle(ctx, g.x + 3, g.y - 8, 3, blink ? '#ff5a5f' : '#444');
  }
  for (const b of cur.beams) {
    const k = b.t / 0.35;
    ctx.globalAlpha = k;
    ctx.strokeStyle = '#7fe8ff';
    ctx.lineWidth = 14 * k;
    ctx.beginPath();
    ctx.moveTo(b.x1, b.y1);
    ctx.lineTo(b.x2, b.y2);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 * k;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  for (const e of cur.explosions) {
    const k = 1 - e.t / 0.45; // 0 -> 1
    ctx.globalAlpha = 1 - k;
    circle(ctx, e.x, e.y, e.r * (0.4 + 0.6 * k), '#ff8a2a');
    circle(ctx, e.x, e.y, e.r * (0.25 + 0.4 * k), '#ffe08a');
    ctx.globalAlpha = 1;
  }
}

// ---- Fighters ---------------------------------------------------------------------------
function drawFighter(ctx, p, s, now) {
  const { x, y } = p;
  const fade = p.connected ? 1 : 0.5;
  ctx.globalAlpha = fade;
  const color = p.hurt ? '#ffffff' : p.color;
  const shoulderY = y - H + 30;
  const hipY = y - 30;

  if (p.shield) circle(ctx, x, y - H / 2, 52, `rgba(140, 200, 255, ${0.12 + 0.08 * Math.sin(now / 80)})`);

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 7;

  // Legs: run cycle when moving on the ground, tucked in the air.
  const running = p.grounded && Math.abs(p.vx) > 40;
  const ph = running ? now / 70 : 0;
  const legs = p.grounded
    ? [Math.sin(ph) * (running ? 16 : 7), -Math.sin(ph) * (running ? 16 : 7)]
    : [10 * p.facing, -6 * p.facing];
  ctx.beginPath();
  for (const off of legs) {
    const kneeX = x + off * 0.6 + (p.grounded ? 0 : 6 * p.facing);
    const kneeY = p.grounded ? hipY + 16 : hipY + 12;
    ctx.moveTo(x, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(x + off, p.grounded ? y - 2 : y - 8);
  }
  // Body
  ctx.moveTo(x, hipY);
  ctx.lineTo(x, y - H + 2 * HEAD_R);
  ctx.stroke();

  // Head
  circle(ctx, x, y - H + HEAD_R, HEAD_R, color);
  // Eye shows facing
  circle(ctx, x + p.facing * 5, y - H + HEAD_R - 2, 2.5, '#0b0d12');

  // Arms: front arm reaches to the hand along the aim (matches the server's hand position).
  let aim = p.aim;
  if (p.swing) aim += -p.facing * 0.9 * Math.sin(now / 30);
  const handX = x + Math.cos(aim) * 26;
  const handY = shoulderY + Math.sin(aim) * 26;
  ctx.beginPath();
  ctx.moveTo(x, shoulderY);
  ctx.lineTo(handX, handY);
  // Back arm
  ctx.moveTo(x, shoulderY);
  ctx.lineTo(x - p.facing * 12 + (running ? Math.sin(ph) * 8 : 0), shoulderY + 22);
  ctx.stroke();

  // Weapon in hand
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(aim);
  if (Math.cos(aim) < 0) ctx.scale(1, -1);
  drawWeapon(ctx, p.weapon, 1, p.swing);
  if (p.charging > 0) {
    circle(ctx, 30, 0, 4 + p.charging * 12, `rgba(127, 232, 255, ${0.4 + 0.5 * p.charging})`);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawTag(ctx, p) {
  const y = p.y - H - 26;
  // Health bar
  const w = 64;
  ctx.fillStyle = 'rgba(0,0,0,.55)';
  ctx.fillRect(p.x - w / 2 - 2, y - 2, w + 4, 11);
  ctx.fillStyle = p.hp > 50 ? '#46d17a' : p.hp > 25 ? '#ffc93c' : '#ff5a5f';
  ctx.fillRect(p.x - w / 2, y, (w * p.hp) / 100, 7);
  text(ctx, p.name, p.x, y - 10, { size: 20, weight: 700, color: p.color });
  if (p.weapon !== 'fists' && p.ammo != null) text(ctx, String(p.ammo), p.x + w / 2 + 14, y + 8, { size: 16, color: '#cfd5e0' });
}

function drawDead(ctx, p, now) {
  const d = deadAt.get(p.id);
  if (!d || d.fell) return;
  const t = (now - d.t) / 1000;
  if (t > 2.2) return;
  ctx.globalAlpha = Math.max(0, 1 - t / 2.2);
  ctx.save();
  // Topple over where they fell.
  ctx.translate(d.x, d.y);
  ctx.rotate(-d.facing * Math.min(1, t * 3) * (Math.PI / 2));
  ctx.strokeStyle = d.color;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10, 0);
  ctx.lineTo(0, -30);
  ctx.lineTo(10, 0);
  ctx.moveTo(0, -30);
  ctx.lineTo(0, -H + 2 * HEAD_R);
  ctx.moveTo(0, -H + 30);
  ctx.lineTo(-18, -H + 48);
  ctx.moveTo(0, -H + 30);
  ctx.lineTo(18, -H + 48);
  ctx.stroke();
  circle(ctx, 0, -H + HEAD_R, HEAD_R, d.color);
  ctx.strokeStyle = '#0b0d12';
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    // X eyes
    ctx.beginPath();
    ctx.moveTo(s * 4 - 2, -H + HEAD_R - 4);
    ctx.lineTo(s * 4 + 2, -H + HEAD_R);
    ctx.moveTo(s * 4 + 2, -H + HEAD_R - 4);
    ctx.lineTo(s * 4 - 2, -H + HEAD_R);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Draw a weapon pointing along +x from the origin (the hand). */
function drawWeapon(ctx, weapon, scale = 1, swing = false) {
  ctx.save();
  ctx.scale(scale, scale);
  if (weapon === 'fists') {
    circle(ctx, 2, 0, swing ? 8 : 6, swing ? '#ffe08a' : 'rgba(255,255,255,.0)');
  } else if (weapon === 'bat') {
    ctx.fillStyle = '#c08a4a';
    ctx.beginPath();
    ctx.moveTo(-4, -3);
    ctx.lineTo(44, -7);
    ctx.lineTo(46, 7);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    if (swing) {
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 50, -0.9, 0.9);
      ctx.stroke();
    }
  } else if (weapon === 'pistol') {
    ctx.fillStyle = '#c9ced8';
    ctx.fillRect(-2, -6, 24, 8);
    ctx.fillStyle = '#6a707c';
    ctx.fillRect(-2, 0, 8, 12);
  } else if (weapon === 'shotgun') {
    ctx.fillStyle = '#8a5a30';
    ctx.fillRect(-14, -4, 18, 10);
    ctx.fillStyle = '#9aa0ac';
    ctx.fillRect(2, -5, 38, 6);
    ctx.fillRect(2, 2, 30, 4);
  } else if (weapon === 'grenade') {
    circle(ctx, 6, 0, 8, '#4b6b3a');
    ctx.fillStyle = '#9aa0ac';
    ctx.fillRect(3, -12, 6, 5);
  } else if (weapon === 'railgun') {
    ctx.fillStyle = '#3a4a6a';
    ctx.fillRect(-10, -7, 46, 12);
    ctx.fillStyle = '#7fe8ff';
    ctx.fillRect(0, -3, 38, 4);
    ctx.fillStyle = '#2a3446';
    ctx.fillRect(-4, 3, 8, 12);
  }
  ctx.restore();
}

// ---- HUD ------------------------------------------------------------------------------------
function drawHud(ctx, s, arena) {
  // Top bar, inside the TV's safe margin.
  const x = 80;
  const y = 64;
  text(ctx, `${s.arena.title} · Round ${s.round} · first to ${s.winScore}`, x, y, { size: 24, weight: 700, color: '#aab3c8', align: 'left' });
  if (s.suddenDeath && s.phase === 'play') text(ctx, 'SUDDEN DEATH', arena.w - 80, y, { size: 26, weight: 900, color: '#ff5a5f', align: 'right' });

  // Score chips along the bottom.
  const chips = s.scores.filter((p) => s.players.some((q) => q.id === p.id));
  const chipW = 200;
  let cx = arena.w / 2 - (chips.length * chipW) / 2;
  const by = arena.h - 50;
  for (const p of chips) {
    const f = s.players.find((q) => q.id === p.id);
    ctx.globalAlpha = f?.alive ? 1 : 0.4;
    ctx.fillStyle = 'rgba(11, 13, 18, .65)';
    ctx.fillRect(cx + 4, by - 26, chipW - 8, 40);
    circle(ctx, cx + 22, by - 6, 9, p.color);
    text(ctx, p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name, cx + 38, by + 1, { size: 20, weight: 700, align: 'left' });
    text(ctx, String(p.score), cx + chipW - 18, by + 2, { size: 24, weight: 900, color: '#ffc93c', align: 'right' });
    ctx.globalAlpha = 1;
    cx += chipW;
  }
}

function drawBanner(ctx, s, arena) {
  const cx = arena.w / 2;
  const cy = arena.h / 2;
  if (s.phase === 'countdown') {
    ctx.fillStyle = 'rgba(11, 13, 18, .45)';
    ctx.fillRect(0, cy - 150, arena.w, 220);
    text(ctx, s.arena.title, cx, cy - 80, { size: 44, weight: 800, color: '#aab3c8' });
    text(ctx, String(s.timer || 'FIGHT'), cx, cy + 40, { size: 140, weight: 900, color: '#ffc93c' });
  } else if (s.phase === 'roundover') {
    const line = s.matchWinner ? `${s.matchWinner} wins the match!` : s.roundWinner ? `${s.roundWinner} wins the round` : 'Draw!';
    ctx.fillStyle = 'rgba(11, 13, 18, .7)';
    ctx.fillRect(0, cy - 70, arena.w, 120);
    text(ctx, line, cx, cy + 14, { size: 64, weight: 900 });
  }
}

function pickC(a) {
  return a[Math.floor(Math.random() * a.length)];
}
