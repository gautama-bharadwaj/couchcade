import { lerpById, circle, text } from './util.js';

// Pillow Fort Siege TV renderer: a living room at night, two cushion forts, a teddy in each,
// pajama kids, flying pillows and lots of feathers. Feathers, squish and shake are decoration
// driven by the snapshot's fx events; the server decides everything that matters.

const H = 64; // must match the server body height

let lastCur = null;
let lastRound = 0;
let particles = []; // { x, y, vx, vy, born, max, color, size, feather?, spin?, text? }
let shake = 0;
const squish = new Map(); // block id -> time it was hit

export default {
  // Sound effects only; no narrator in fast action games.
  onSnapshot(prev, s, audio) {
    const { sfx } = audio;
    if (s.phase === 'countdown' && (!prev || prev.phase !== 'countdown' || s.timer !== prev.timer) && s.timer > 0) sfx.beep();
    if (!prev) return;
    if (s.phase === 'build' && prev.phase === 'countdown') sfx.beep(true);
    if (s.phase === 'siege' && prev.phase === 'build') sfx.alarm();
    if ((s.phase === 'build' || s.phase === 'siege') && s.timer <= 5 && s.timer > 0 && s.timer !== prev.timer) sfx.tick();
    const fx = s.fx ?? {};
    for (const t of fx.throws ?? []) t.kind === 'cushion' ? sfx.whoosh() : sfx.swish();
    if (fx.hits?.length) sfx.thud(0.3);
    if (fx.knocks?.length) sfx.thud(0.8);
    if (fx.bonks?.length) {
      sfx.thud(0.5);
      sfx.hop();
    }
    if (fx.pickups) sfx.pickup();
    if (fx.places) sfx.thud(0.2);
    if (fx.puffs?.length) sfx.shuffle(1);
    if (fx.teddy) sfx.ding();
    if (s.phase === 'roundover' && prev.phase !== 'roundover') {
      if (s.matchWinner != null) sfx.fanfare();
      else if (s.roundWinner >= 0) sfx.jingle();
      else sfx.buzz();
    }
  },

  draw(ctx, { prev, cur, alpha, arena, now }) {
    if (cur.round !== lastRound) {
      particles = [];
      squish.clear();
      lastRound = cur.round;
    }
    if (cur !== lastCur) {
      consumeFx(cur, now);
      lastCur = cur;
    }
    stepParticles(now);
    shake *= 0.88;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;

    drawRoom(ctx, cur, arena, now);
    ctx.save();
    ctx.translate(sx, sy);
    drawZones(ctx, cur);

    const blocks = lerpById(prev.blocks, cur.blocks, alpha);
    for (const b of blocks) drawCushion(ctx, b.x, b.y, cur.cell, cur.teams[b.t].color, b.hp, now - (squish.get(b.id) ?? -1e9));
    for (const t of cur.teddies) {
      const pt = prev.teddies?.[t.t];
      const x = pt ? pt.x + (t.x - pt.x) * alpha : t.x;
      const y = pt ? pt.y + (t.y - pt.y) * alpha : t.y;
      drawTeddy(ctx, x, y, t.ang, cur.teams[t.t].color, t.down);
    }
    for (const c of lerpById(prev.loose, cur.loose, alpha)) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.ang);
      drawCushion(ctx, -cur.cell / 2, -cur.cell / 2, cur.cell, '#d9c8ef', 2, 1e9);
      ctx.restore();
    }

    const prevPlayers = new Map((prev.players ?? []).map((p) => [p.id, p]));
    const kids = lerpById(prev.players, cur.players, alpha);
    for (const p of kids) if (p.place && (cur.phase === 'build' || cur.phase === 'siege')) drawGhost(ctx, p.place, cur.cell, cur.teams[p.t].color, now);
    for (const p of kids) drawKid(ctx, p, prevPlayers.get(p.id), cur, now);
    for (const p of kids) if (p.charge != null) drawArc(ctx, p, cur);

    for (const s of lerpById(prev.shots, cur.shots, alpha)) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      if (s.k === 'p') drawPillow(ctx, cur.teams[s.t].color);
      else drawCushion(ctx, -cur.cell / 2, -cur.cell / 2, cur.cell, cur.teams[s.t].color, 2, 1e9);
      ctx.restore();
    }
    drawParticles(ctx, now);
    for (const p of kids) drawTag(ctx, p);
    ctx.restore();

    drawHud(ctx, cur, arena);
    drawBanner(ctx, cur, arena);
  },
};

// ---- fx -> particles ---------------------------------------------------------------
function feathers(x, y, n, now, color = '#ffffff', speed = 260) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 60 + Math.random() * speed;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, born: now, max: 1200 + Math.random() * 900, color, size: 5 + Math.random() * 4, feather: true, spin: Math.random() * 6 });
  }
}

function consumeFx(s, now) {
  const fx = s.fx ?? {};
  for (const h of fx.hits ?? []) {
    feathers(h.x, h.y, 8, now);
    // Squish the cushion that took the hit.
    const b = s.blocks.find((q) => h.x >= q.x - 8 && h.x <= q.x + s.cell + 8 && h.y >= q.y - 8 && h.y <= q.y + s.cell + 8);
    if (b) squish.set(b.id, now);
  }
  for (const k of fx.knocks ?? []) {
    feathers(k.x, k.y, 16, now, '#ffffff', 380);
    shake = Math.max(shake, 7);
  }
  for (const b of fx.bonks ?? []) {
    feathers(b.x, b.y, b.big ? 20 : 10, now);
    particles.push({ x: b.x, y: b.y - 40, vx: 0, vy: -80, born: now, max: 800, color: '#ffe08a', text: b.big ? 'WHUMP!' : 'BONK', size: b.big ? 34 : 26 });
    shake = Math.max(shake, b.big ? 10 : 4);
  }
  for (const p of fx.puffs ?? []) feathers(p.x, p.y - 6, 5, now, '#ffffff', 140);
  if (fx.teddy) {
    const t = s.teddies[fx.teddy.team];
    feathers(t.x, t.y, 40, now, '#ffffff', 520);
    for (let i = 0; i < 14; i++) feathers(t.x, t.y, 1, now, s.teams[1 - fx.teddy.team].color, 420);
    shake = 18;
  }
  if (particles.length > 700) particles = particles.slice(-700);
}

function stepParticles(now) {
  particles = particles.filter((p) => now - p.born < p.max);
}

function drawParticles(ctx, now) {
  for (const p of particles) {
    const t = (now - p.born) / 1000;
    const k = 1 - (now - p.born) / p.max;
    ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.5));
    if (p.text) {
      text(ctx, p.text, p.x, p.y + p.vy * t, { size: p.size, weight: 900, color: p.color });
    } else if (p.feather) {
      // Feathers drift: quick burst, then a slow swaying fall.
      const drag = Math.min(t, 0.35);
      const x = p.x + p.vx * drag + Math.sin(t * 4 + p.spin) * 14 * t;
      const y = p.y + p.vy * drag + Math.max(0, t - 0.35) * 70;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(t * 5 + p.spin) * 0.8);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, p.size, p.size * 0.35, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ---- Room ----------------------------------------------------------------------------
function drawRoom(ctx, s, arena, now) {
  const g = ctx.createLinearGradient(0, 0, 0, s.ground);
  g.addColorStop(0, '#1b1d3a');
  g.addColorStop(1, '#2c2547');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, arena.w, arena.h);
  // Wallpaper stripes
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  for (let x = 0; x < arena.w; x += 80) ctx.fillRect(x, 0, 40, s.ground);
  // Window with the moon, over the middle
  const wx = 640;
  const wy = 120;
  ctx.fillStyle = '#0d1430';
  ctx.fillRect(wx, wy, 320, 220);
  circle(ctx, wx + 230, wy + 70, 34, '#f4ecc2');
  circle(ctx, wx + 244, wy + 62, 30, '#0d1430');
  for (let i = 0; i < 9; i++) {
    const tw = 0.5 + 0.5 * Math.sin(now / 500 + i * 1.7);
    circle(ctx, wx + 20 + ((i * 97) % 280), wy + 20 + ((i * 53) % 180), 1.6, `rgba(255,255,255,${0.3 + 0.5 * tw})`);
  }
  ctx.strokeStyle = '#3d3560';
  ctx.lineWidth = 10;
  ctx.strokeRect(wx, wy, 320, 220);
  ctx.beginPath();
  ctx.moveTo(wx + 160, wy);
  ctx.lineTo(wx + 160, wy + 220);
  ctx.moveTo(wx, wy + 110);
  ctx.lineTo(wx + 320, wy + 110);
  ctx.stroke();
  // Floor and rug
  ctx.fillStyle = '#4a3428';
  ctx.fillRect(0, s.ground, arena.w, arena.h - s.ground);
  ctx.fillStyle = '#5a3f31';
  for (let x = 0; x < arena.w; x += 120) ctx.fillRect(x, s.ground, 2, arena.h - s.ground);
  ctx.fillStyle = '#7a3b4c';
  ctx.fillRect(560, s.ground, 480, 16);
  ctx.fillStyle = '#93506a';
  for (let x = 570; x < 1030; x += 24) ctx.fillRect(x, s.ground + 4, 12, 8);
  // Laundry pile marker
  text(ctx, 'LAUNDRY PILE', (s.pile.x0 + s.pile.x1) / 2, s.ground + 50, { size: 18, weight: 800, color: 'rgba(255,255,255,0.25)' });
}

function drawZones(ctx, s) {
  s.zones.forEach((x0, i) => {
    const w = s.cols * s.cell;
    ctx.fillStyle = hexA(s.teams[i].color, 0.06);
    ctx.fillRect(x0, s.ground - 9 * s.cell, w, 9 * s.cell);
    ctx.fillStyle = hexA(s.teams[i].color, 0.5);
    ctx.fillRect(x0, s.ground, w, 5);
  });
}

// ---- Things --------------------------------------------------------------------------
function drawCushion(ctx, x, y, size, color, hp, sinceHit) {
  // A quick squash when hit, and a dent once it's been hit once.
  const t = sinceHit / 220;
  const sq = t < 1 ? Math.sin(t * Math.PI) * 0.18 : 0;
  const w = size * (1 + sq);
  const h = size * (1 - sq);
  const cx = x + size / 2;
  const by = y + size;
  const left = cx - w / 2;
  const top = by - h;
  ctx.fillStyle = hp < 2 ? shade(color, -0.25) : color;
  ctx.beginPath();
  ctx.roundRect(left + 1, top + 1, w - 2, h - 2, 10);
  ctx.fill();
  // Puffy highlight and center button
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.roundRect(left + 6, top + 5, w - 18, h * 0.3, 6);
  ctx.fill();
  circle(ctx, cx, top + h / 2 + 2, 3, 'rgba(0, 0, 0, 0.25)');
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(left + 1, top + 1, w - 2, h - 2, 10);
  ctx.stroke();
}

function drawPillow(ctx, color) {
  ctx.fillStyle = '#f6f3ff';
  ctx.beginPath();
  ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  circle(ctx, -15, -9, 3, '#f6f3ff');
  circle(ctx, 15, 9, 3, '#f6f3ff');
}

function drawTeddy(ctx, x, y, ang, scarf, down) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  const fur = '#b07a4a';
  circle(ctx, 0, 8, 17, fur); // body
  circle(ctx, -14, 18, 7, fur); // feet
  circle(ctx, 14, 18, 7, fur);
  circle(ctx, 0, 10, 9, '#d8aa7c'); // tummy
  circle(ctx, -12, -22, 7, fur); // ears
  circle(ctx, 12, -22, 7, fur);
  circle(ctx, 0, -12, 14, fur); // head
  circle(ctx, 0, -7, 6, '#d8aa7c');
  if (down) {
    // Dizzy x-eyes
    ctx.strokeStyle = '#1b1320';
    ctx.lineWidth = 2;
    for (const ex of [-5, 5]) {
      ctx.beginPath();
      ctx.moveTo(ex - 2.5, -17);
      ctx.lineTo(ex + 2.5, -12);
      ctx.moveTo(ex + 2.5, -17);
      ctx.lineTo(ex - 2.5, -12);
      ctx.stroke();
    }
  } else {
    circle(ctx, -5, -15, 2.2, '#1b1320');
    circle(ctx, 5, -15, 2.2, '#1b1320');
  }
  circle(ctx, 0, -8, 2.4, '#1b1320');
  ctx.fillStyle = scarf;
  ctx.fillRect(-12, -2, 24, 6);
  ctx.fillRect(4, 2, 6, 10);
  ctx.restore();
}

function drawGhost(ctx, place, size, color, now) {
  ctx.globalAlpha = 0.35 + 0.2 * Math.sin(now / 120);
  ctx.strokeStyle = color;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(place.x + 2, place.y + 2, size - 4, size - 4, 10);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Dotted arc of where a pillow would go if released now (same physics as the server). */
function drawArc(ctx, p, s) {
  const { g, min, max } = s.throwing;
  const v = min + (max - min) * p.charge;
  let x = p.hand.x;
  let y = p.hand.y;
  const vx = Math.cos(p.aim) * v;
  let vy = Math.sin(p.aim) * v;
  const dt = 0.035;
  ctx.fillStyle = s.teams[p.t].color;
  for (let i = 0; i < 28; i++) {
    x += vx * dt;
    vy += g * dt;
    y += vy * dt;
    if (y > s.ground) break;
    ctx.globalAlpha = 0.85 * (1 - i / 30);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawKid(ctx, p, prev, s, now) {
  const { x, y } = p;
  const team = s.teams[p.t].color;
  ctx.globalAlpha = p.connected ? 1 : 0.5;
  const moving = prev && Math.abs(prev.x - p.x) > 1.5;
  const ph = p.grounded && moving ? now / 75 : 0;
  const lean = p.stun ? Math.sin(now / 40) * 0.25 : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(lean);

  // Legs (pajama bottoms)
  ctx.strokeStyle = shade(team, -0.2);
  ctx.lineCap = 'round';
  ctx.lineWidth = 9;
  ctx.beginPath();
  const legs = p.grounded ? [Math.sin(ph) * 9, -Math.sin(ph) * 9] : [7 * p.facing, -5 * p.facing];
  for (const off of legs) {
    ctx.moveTo(0, -22);
    ctx.lineTo(off, -3);
  }
  ctx.stroke();
  // Body (pajama top)
  ctx.fillStyle = team;
  ctx.beginPath();
  ctx.roundRect(-13, -48, 26, 30, 9);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (const by of [-42, -34, -26]) circle(ctx, 0, by, 1.8, 'rgba(255,255,255,0.5)');

  // Arms: up holding a cushion, back while winding up, or swinging
  ctx.strokeStyle = '#f1c9a5';
  ctx.lineWidth = 6;
  ctx.beginPath();
  if (p.carry) {
    ctx.moveTo(-9, -44);
    ctx.lineTo(-12, -H - 6);
    ctx.moveTo(9, -44);
    ctx.lineTo(12, -H - 6);
  } else if (p.charge != null) {
    const back = p.aim + Math.PI + 0.4 * p.facing;
    ctx.moveTo(0, -44);
    ctx.lineTo(Math.cos(back) * (16 + 8 * p.charge), -44 + Math.sin(back) * (16 + 8 * p.charge));
    ctx.moveTo(0, -42);
    ctx.lineTo(Math.cos(p.aim) * 14, -42 + Math.sin(p.aim) * 14);
  } else {
    ctx.moveTo(-10, -44);
    ctx.lineTo(-14 + Math.sin(ph) * 5, -28);
    ctx.moveTo(10, -44);
    ctx.lineTo(14 - Math.sin(ph) * 5, -28);
  }
  ctx.stroke();
  if (p.charge != null) {
    ctx.save();
    const back = p.aim + Math.PI + 0.4 * p.facing;
    ctx.translate(Math.cos(back) * (22 + 8 * p.charge), -44 + Math.sin(back) * (22 + 8 * p.charge));
    ctx.scale(0.75, 0.75);
    drawPillow(ctx, team);
    ctx.restore();
  }

  // Head with a nightcap in the player's own color
  circle(ctx, 0, -56, 11, '#f1c9a5');
  if (p.stun) {
    text(ctx, '@ @', 0, -53, { size: 11, weight: 900, color: '#1b1320' });
  } else {
    circle(ctx, 4 * p.facing - 3, -57, 1.8, '#1b1320');
    circle(ctx, 4 * p.facing + 3, -57, 1.8, '#1b1320');
  }
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.moveTo(-12, -61);
  ctx.quadraticCurveTo(0, -76, 12, -61);
  ctx.quadraticCurveTo(-p.facing * 10, -78, -p.facing * 22, -66);
  ctx.closePath();
  ctx.fill();
  circle(ctx, -p.facing * 22, -66, 4, '#ffffff');
  ctx.restore();

  if (p.carry) drawCushion(ctx, x - s.cell / 2, y - H - s.cell + 2, s.cell, '#d9c8ef', 2, 1e9);
  if (p.charge != null) {
    // Power meter under the feet
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 22, y + 6, 44, 6);
    ctx.fillStyle = p.charge > 0.9 ? '#ff6b6b' : '#ffe08a';
    ctx.fillRect(x - 22, y + 6, 44 * p.charge, 6);
  }
  ctx.globalAlpha = 1;
}

function drawTag(ctx, p) {
  const name = p.name.length > 12 ? p.name.slice(0, 11) + '…' : p.name;
  const y = p.y - H - (p.carry ? 60 : 22);
  text(ctx, name, p.x, y, { size: 17, weight: 800, color: p.color });
}

// ---- HUD -----------------------------------------------------------------------------
function drawHud(ctx, s, arena) {
  const y = 66;
  s.teams.forEach((t, i) => {
    const x = i === 0 ? 80 : arena.w - 80;
    const align = i === 0 ? 'left' : 'right';
    text(ctx, t.name, x, y, { size: 30, weight: 900, color: t.color, align });
    let stars = '';
    for (let r = 0; r < s.winRounds; r++) stars += r < t.wins ? '★' : '☆';
    text(ctx, `${stars}   ${t.size} cushions`, x, y + 32, { size: 20, weight: 700, color: '#d6d9e6', align });
  });
  if (s.phase === 'build' || s.phase === 'siege') {
    const label = s.phase === 'build' ? 'BUILD' : 'SIEGE';
    const color = s.timer <= 5 ? '#ff6b6b' : s.phase === 'build' ? '#9fe6a0' : '#ffe08a';
    text(ctx, `${label} ${fmt(s.timer)}`, arena.w / 2, y, { size: 34, weight: 900, color });
    const hint = s.phase === 'build' ? 'Grab cushions from the pile · B stacks one in front of you' : 'Hold B to wind up, aim with the stick · hit their teddy!';
    text(ctx, hint, arena.w / 2, y + 30, { size: 18, weight: 600, color: '#aab3c8' });
  }
}

function drawBanner(ctx, s, arena) {
  const cx = arena.w / 2;
  const cy = arena.h / 2;
  if (s.phase === 'countdown') {
    ctx.fillStyle = 'rgba(11, 13, 18, .5)';
    ctx.fillRect(0, cy - 150, arena.w, 230);
    text(ctx, `Round ${s.round} · build your fort!`, cx, cy - 80, { size: 44, weight: 800, color: '#d6d9e6' });
    text(ctx, String(s.timer || 'BUILD'), cx, cy + 40, { size: 130, weight: 900, color: '#9fe6a0' });
  } else if (s.phase === 'siege' && s.timer > 72) {
    text(ctx, 'PILLOW FIGHT!', cx, cy - 120, { size: 96, weight: 900, color: '#ffe08a' });
  } else if (s.phase === 'roundover') {
    const win = s.roundWinner >= 0 ? s.teams[s.roundWinner] : null;
    const line = s.matchWinner != null ? `${s.teams[s.matchWinner].name} wins the match!` : win ? `${win.name} wins the round` : 'Draw!';
    const sub = s.reason === 'teddy' ? 'Teddy down!' : 'Time! Biggest fort wins';
    ctx.fillStyle = 'rgba(11, 13, 18, .7)';
    ctx.fillRect(0, cy - 110, arena.w, 160);
    text(ctx, sub, cx, cy - 56, { size: 30, weight: 800, color: '#aab3c8' });
    text(ctx, line, cx, cy + 14, { size: 64, weight: 900, color: win?.color ?? '#f2f4f8' });
  }
}

// ---- Helpers -------------------------------------------------------------------------
function fmt(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
