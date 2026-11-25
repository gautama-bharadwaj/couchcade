// Dragon Hoard TV: a torch-lit cave. The 5x5 board of carved word stones fills the middle, each
// team's crest and gems sit on top with the current clue hanging between them on a wooden sign,
// and the dragon sleeps along the bottom on its gold. Rules are in server/games/hoard.js; all
// drawing of tiles, gems, crests and the dragon is in public/art/hoard.js.
//
// Words flip over when a team agrees on them: a gem flies up to its team's crest, dust puffs out,
// and the dragon wakes up, lifts its head and breathes fire across the board.

import { text } from './util.js';
import {
  TEAM_COLOR, drawCoins, drawCrest, drawDragonHead, drawDust, drawGem, drawGemSlot, drawLantern,
  drawSleepingDragon, drawTile, drawTorch, sparkle,
} from '../../art/hoard.js';

const COLS = 5;
const TW = 232;
const TH = 100;
const GAP = 12;
const BX = (1600 - (COLS * TW + (COLS - 1) * GAP)) / 2;
const BY = 216;
const FLIP_MS = 560;
const SERIF = 'Georgia, "Times New Roman", serif';
const INK = '#2b2418';
const DRAGON = { hx: 128, hy: 838, tail: 1470, s: 190, lift: 290 };

// Animation state (TV only).
const flips = new Map(); // tile index -> when it started turning over
let lastSeen = null;
let wakeAt = null; // when the dragon woke (performance.now), or null
let shakeUntil = 0;
let flights = []; // gems flying to a crest: { team, from: [x, y], slot, at }
let parts = []; // { x, y, vx, vy, at, life, color, size, kind: 'spark' | 'puff' | 'fire', grav }
let lastNow = 0;

const ease = (q) => 1 - (1 - q) ** 3;
const clamp01 = (q) => Math.max(0, Math.min(1, q));
const tileXY = (i) => [BX + (i % COLS) * (TW + GAP) + TW / 2, BY + Math.floor(i / COLS) * (TH + GAP) + TH / 2];

function slotXY(s, key, i) {
  return crestSide(s, key) === 'left' ? [188 + i * 32, 138] : [1412 - i * 32, 138];
}
// Ember always on the left, Frost on the right.
const crestSide = (s, key) => (s.mode === 'coop' || key === 'ember' ? 'left' : 'right');

function emit(x, y, n, color, o = {}) {
  const at = performance.now();
  for (let i = 0; i < n; i++) {
    const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.spread ?? 0.4) : Math.random() * Math.PI * 2;
    const v = (o.speed ?? 5) * (0.5 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (o.up ?? 0), at: at + (o.delay ?? 0) * Math.random(), life: (o.life ?? 800) * (0.6 + Math.random() * 0.6), color, size: (o.size ?? 4) * (0.6 + Math.random() * 0.8), kind: o.kind ?? 'spark', grav: o.grav ?? 0.05 });
  }
}

function serif(ctx, str, x, y, size, color, align = 'center') {
  ctx.font = `900 ${size}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function fit(ctx, str, size, maxW, font = 'system-ui, -apple-system, sans-serif') {
  ctx.font = `900 ${size}px ${font}`;
  const w = ctx.measureText(str).width;
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default {
  drawRules,

  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const team = (k) => s.teams.find((t) => t.key === k);
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    if (!prev) {
      flips.clear();
      flights = [];
      parts = [];
      lastSeen = s.last?.seq ?? null;
      // Joining mid-game with the dragon already up: it stays up.
      wakeAt = s.tiles.some((t) => t.revealed && t.owner === 'dragon') ? -1e9 : null;
      sfx.whoosh();
      say(
        s.mode === 'coop'
          ? `Dragon Hoard! ${nameOf(s.teams[0].keeper)} is the Keeper. Find every gem, and don't wake the dragon.`
          : pick([`Dragon Hoard! Keepers, check your phones. ${team(s.turnTeam).name} goes first.`, `Welcome to the dragon's cave. ${team(s.turnTeam).name} starts.`]),
        { delay: 0.4 },
      );
      return;
    }
    if (s.phase === 'clue' && prev.phase !== 'clue' && prev.phase !== 'brief' && s.mode === 'teams') say(`${team(s.turnTeam).name}'s turn.`, { delay: 0.6 });
    if (s.clue && s.phase === 'guess' && prev.phase !== 'guess') {
      sfx.jingle();
      say(`${s.mode === 'coop' ? 'The' : team(s.clue.team).name} clue is: ${s.clue.word}, ${s.clue.n}.`, { delay: 0.3, interrupt: true });
    }
    if (s.votes.length > prev.votes.length) sfx.click();
    if (s.last && s.last.seq !== lastSeen) {
      lastSeen = s.last.seq;
      const now = performance.now();
      flips.set(s.last.tile, now);
      const { owner, team: by, tile } = s.last;
      const [x, y] = tileXY(tile);
      if (owner === 'ember' || owner === 'frost') {
        const t = team(owner);
        flights.push({ team: owner, from: [x, y - 10], slot: Math.max(0, (t?.found ?? 1) - 1), at: now + FLIP_MS / 2 + 250 });
      }
      setTimeout(() => {
        if (owner === 'dragon') {
          wakeAt = performance.now();
          shakeUntil = wakeAt + 1400;
          sfx.boom();
          sfx.evil();
          say(pick(['The dragon wakes!', 'Roar! The dragon is awake!']), { interrupt: true, delay: 0.3 });
        } else if (owner === 'dust') {
          sfx.thud(0.4);
          emit(x, y + 20, 26, '#b9ab8c', { speed: 2.5, up: 1.2, life: 1200, size: 10, kind: 'puff', grav: -0.01 });
          say(pick(['Just dust.', 'Dust.', 'Nothing but dust.']), { delay: 0.2 });
        } else if (owner === by) {
          sfx.chime();
          emit(x, y - 10, 30, TEAM_COLOR[owner], { speed: 6, size: 5 });
          if (s.phase !== 'end' && Math.random() < 0.5) say(pick(['A gem!', 'Shiny!', 'Got one!']), { delay: 0.2 });
        } else {
          sfx.buzz();
          emit(x, y - 10, 20, TEAM_COLOR[owner] ?? '#fff', { speed: 4, size: 4 });
          say(`Oops, that's ${team(owner)?.name ?? 'their'} gem.`, { delay: 0.2 });
        }
      }, FLIP_MS / 2);
    }
    if (s.phase === 'end' && prev.phase !== 'end') {
      setTimeout(() => {
        if (s.mode === 'coop') {
          if (s.reason === 'gems') {
            sfx.fanfare();
            celebrate('ember');
            say('You found the whole hoard!');
          } else if (s.reason === 'clues') {
            sfx.sadTrombone();
            say('Out of clues. The dragon keeps its gold.');
          }
        } else {
          sfx.fanfare();
          celebrate(s.winner);
          say(`${team(s.winner).name} wins!`, { delay: s.reason === 'dragon' ? 1.5 : 0.2 });
        }
      }, 900);
    }
    if ((s.phase === 'guess' || s.phase === 'clue') && s.left !== prev.left && s.left <= 10 && s.left > 0) sfx.tick();
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const tnow = performance.now();
    lastNow = tnow;
    const T = tnow / 1000;
    const woke = s.tiles.some((t) => t.revealed && t.owner === 'dragon');
    if (woke && wakeAt == null) wakeAt = -1e9;
    if (!woke) wakeAt = null;
    // The flip shows the dragon tile first; the beast wakes on the next beat.
    const wake = wakeAt == null ? 0 : ease(clamp01((tnow - wakeAt) / 700));

    ctx.save();
    if (tnow < shakeUntil) {
      const k = (shakeUntil - tnow) / 1400;
      ctx.translate((Math.random() - 0.5) * 16 * k, (Math.random() - 0.5) * 16 * k);
    }
    cave(ctx, W, H, T, wake);
    drawSleepingDragon(ctx, DRAGON.hx, DRAGON.hy, DRAGON.tail, DRAGON.s, T, wake, DRAGON.lift);

    const byId = new Map(s.players.map((p) => [p.id, p]));
    const team = (k) => s.teams.find((t) => t.key === k);
    const at = team(s.turnTeam);

    // ---- Team banners ----
    if (s.mode === 'coop') {
      teamBanner(ctx, s, s.teams[0], 'left', byId, true, tnow);
      const x = W - 80;
      serif(ctx, 'Clues left', x, 84, 26, '#e8d8b8', 'right');
      const n = s.cluesTotal;
      const gap = Math.min(40, 360 / n);
      for (let i = 0; i < n; i++) drawLantern(ctx, x - 14 - i * gap, 128, 34, i < s.cluesLeft, T + i);
      text(ctx, `${s.cluesLeft} of ${n}`, x, 192, { size: 24, weight: 900, align: 'right', color: '#f2e9d8' });
    } else {
      for (const t of s.teams) teamBanner(ctx, s, t, crestSide(s, t.key), byId, t.key === s.turnTeam, tnow);
    }

    // ---- Middle: title, clue sign, status ----
    const mid = W / 2;
    serif(ctx, 'DRAGON HOARD', mid, 46, 22, '#c89a4c');
    if (s.phase === 'guess' && s.clue) {
      const c = team(s.clue.team);
      clueSign(ctx, s.clue.word.toUpperCase(), s.clue.n, c.color, mid, 106, T);
      const stops = s.votes.filter((v) => v.tile === -1).length;
      const left = `${s.guessesLeft} guess${s.guessesLeft === 1 ? '' : 'es'} left · ${s.need === 1 ? '1 vote turns' : `${s.need} votes turn`} a word${stops ? ` · ${stops} want to stop` : ''} · ${s.left}s`;
      text(ctx, left, mid, 196, { size: 20, weight: 700, color: '#c8b89a' });
    } else if (s.phase === 'clue') {
      clueSign(ctx, `${byId.get(at.keeper)?.name ?? 'The Keeper'} is thinking${'.'.repeat(Math.floor(now / 400) % 4)}`, null, at.color, mid, 106, T, true);
      text(ctx, `Keepers: one word and a number · ${s.left}s`, mid, 196, { size: 20, weight: 700, color: '#c8b89a' });
    } else if (s.phase === 'end') {
      const title = s.mode === 'coop' ? (s.reason === 'gems' ? 'The hoard is yours!' : s.reason === 'dragon' ? 'The dragon woke!' : 'Out of clues!') : `${team(s.winner).name} wins!`;
      serif(ctx, title, mid, 130, fit(ctx, title, 60, 560, SERIF), s.winner ? team(s.winner).color : '#ff8f8f');
      const why = { gems: 'Every gem found', 'gems-other': 'Their last gem was found for them', dragon: s.mode === 'coop' ? 'Somebody poked the dragon' : `${team(s.winner === 'ember' ? 'frost' : 'ember')?.name} woke the dragon`, clues: `${s.teams[0].found} of ${s.teams[0].total} gems found` }[s.reason];
      text(ctx, `${why} · here's the whole key`, mid, 180, { size: 22, weight: 700, color: '#c8b89a' });
    }

    // ---- Board ----
    const votes = new Map();
    for (const v of s.votes) votes.set(v.tile, [...(votes.get(v.tile) ?? []), v.id]);
    s.tiles.forEach((tile, i) => {
      const [cx, cy] = tileXY(i);
      const x = cx - TW / 2;
      const y = cy - TH / 2;
      const started = flips.get(i);
      let k = 1; // 1 = fully shown
      if (started != null) k = Math.min(1, (tnow - started) / FLIP_MS);
      const showFace = tile.revealed && k >= 0.5;
      const sx = tile.revealed && k < 1 ? Math.abs(Math.cos(k * Math.PI)) : 1;
      const lift = tile.revealed && k < 1 ? Math.sin(k * Math.PI) * 14 : 0;
      ctx.save();
      ctx.translate(cx, cy - lift);
      ctx.scale(Math.max(0.02, sx), 1 + lift / 200);
      const w = tile.word.toUpperCase();
      if (showFace) {
        drawTile(ctx, tile.owner, 0, 0, TW, TH, { seed: i, t: T });
        const dark = tile.owner !== 'dust';
        text(ctx, w, 0, TH / 2 - 12, { size: fit(ctx, w, tile.owner === 'dust' ? 26 : 20, TW - (tile.owner === 'dust' ? 110 : 24)), weight: 900, color: dark ? '#fff6e0' : '#c8bca2', align: tile.owner === 'dust' ? 'center' : 'center' });
      } else {
        const key = s.phase === 'end' ? tile.owner : null;
        drawTile(ctx, 'hidden', 0, 0, TW, TH, { seed: i, t: T, key });
        text(ctx, w, 0, 12, { size: fit(ctx, w, 34, TW - 40), weight: 900, color: key === 'dragon' ? '#ffd2d2' : INK });
      }
      ctx.restore();

      // Votes on this word
      const v = votes.get(i);
      if (v && !tile.revealed) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = at.color;
        ctx.beginPath();
        ctx.roundRect(x - 4, y - 4, TW + 8, TH + 8, 16);
        ctx.stroke();
        v.forEach((id, j) => {
          const p = byId.get(id);
          const px = x + 26 + j * 30;
          const py = y + TH - 20;
          ctx.fillStyle = '#140d0a';
          ctx.beginPath();
          ctx.arc(px, py, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = p?.color ?? '#888';
          ctx.beginPath();
          ctx.arc(px, py, 12, 0, Math.PI * 2);
          ctx.fill();
          text(ctx, (p?.name ?? '?').charAt(0).toUpperCase(), px, py + 6, { size: 16, weight: 900, color: '#140d0a' });
        });
        text(ctx, `${v.length}/${s.need}`, x + TW - 14, y + TH - 12, { size: 20, weight: 900, align: 'right', color: '#6b5a3e' });
      }
    });

    // Once awake, its head rises in front of the board.
    if (wake > 0) drawDragonHead(ctx, DRAGON.hx, DRAGON.hy - DRAGON.lift * wake, DRAGON.s * 0.9, wake, T);

    // ---- The dragon's fire, over the board ----
    if (wakeAt != null && tnow - wakeAt < 2600 && tnow - wakeAt > 300) {
      const hs = DRAGON.s * 0.9;
      const headY = DRAGON.hy - DRAGON.lift * wake;
      const mx = DRAGON.hx + hs * 0.62;
      const my = headY + hs * 0.12;
      const q = (tnow - wakeAt - 300) / 2300;
      const aim = -0.55 + q * 0.6; // sweeps across the board
      for (let i = 0; i < 6; i++) emit(mx, my, 1, ['#ff6a2a', '#ffb040', '#fff1b0'][i % 3], { angle: aim, spread: 0.35, speed: 16, life: 1100, size: 16, kind: 'fire', grav: -0.02 });
      ctx.fillStyle = `rgba(255,80,30,${0.18 * Math.sin(Math.min(1, q) * Math.PI)})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawFlights(ctx, s, tnow);
    drawParts(ctx, tnow);
    ctx.restore();

    if (s.phase === 'brief') drawBrief(ctx, s, byId, W, H, T);
  },
};

function celebrate(teamKey) {
  const c = TEAM_COLOR[teamKey] ?? '#ffc457';
  for (let i = 0; i < 6; i++) emit(300 + Math.random() * 1000, 260 + Math.random() * 300, 24, i % 2 ? c : '#ffd76a', { speed: 6, size: 6, life: 1400, delay: i * 250 });
}

// ---- Scenery ----------------------------------------------------------------------------------

function cave(ctx, W, H, T, wake) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#120c0a');
  bg.addColorStop(0.7, '#1c1310');
  bg.addColorStop(1, '#2a1a10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // rock texture
  ctx.fillStyle = 'rgba(255,230,200,.025)';
  for (let i = 0; i < 40; i++) {
    const x = (i * 397) % W;
    const y = (i * 173) % H;
    ctx.beginPath();
    ctx.ellipse(x, y, 60 + (i % 5) * 20, 26 + (i % 3) * 10, (i % 7) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // warm glow from the hoard (redder once the dragon is up)
  const glow = ctx.createRadialGradient(W / 2, H * 0.95, 60, W / 2, H * 0.9, W * 0.7);
  glow.addColorStop(0, wake > 0 ? `rgba(255,90,40,${0.18 + 0.1 * wake})` : 'rgba(255,170,60,.16)');
  glow.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // stalactites
  ctx.fillStyle = '#0c0807';
  for (let i = 0; i < 22; i++) {
    const x = (i * 83 + 20) % W;
    const len = 18 + ((i * 37) % 40);
    ctx.beginPath();
    ctx.moveTo(x - 14, 0);
    ctx.lineTo(x + 14, 0);
    ctx.lineTo(x + 2, len);
    ctx.closePath();
    ctx.fill();
  }
  drawTorch(ctx, 68, 330, 34, T);
  drawTorch(ctx, W - 68, 330, 34, T + 1.7);
  // gold under the dragon
  drawCoins(ctx, 1480, 905, 300, 4, T);
  drawCoins(ctx, 720, 912, 360, 9, T);
  drawCoins(ctx, 160, 910, 260, 2, T);
  for (const [x, y, t] of [[1380, 880, 'ember'], [1560, 870, 'frost'], [600, 892, 'frost'], [860, 896, 'ember']]) drawGem(ctx, x, y, 26, t, 0.5 + 0.5 * Math.sin(T * 2 + x));
}

function teamBanner(ctx, s, t, side, byId, active, tnow) {
  const left = side === 'left';
  const x = left ? 80 : 1520;
  const dir = left ? 1 : -1;
  const keeper = byId.get(t.keeper);
  ctx.save();
  ctx.globalAlpha = active || s.phase === 'end' || s.phase === 'brief' ? 1 : 0.55;
  if (active && (s.phase === 'clue' || s.phase === 'guess') && s.mode === 'teams') {
    const g = ctx.createRadialGradient(x + dir * 30, 110, 10, x + dir * 30, 110, 120);
    g.addColorStop(0, `${t.color}55`);
    g.addColorStop(1, `${t.color}00`);
    ctx.fillStyle = g;
    ctx.fillRect(x + dir * 30 - 120, -10, 240, 240);
  }
  drawCrest(ctx, t.key, x + dir * 30, 104, 74);
  serif(ctx, s.mode === 'coop' ? 'Your team' : t.name, x + dir * 84, 100, 42, t.color, left ? 'left' : 'right');
  // Gems: found ones in their settings; flights still in the air don't count yet.
  const flying = flights.filter((f) => f.team === t.key && tnow < f.at + 900).length;
  const found = t.found - flying;
  for (let i = 0; i < t.total; i++) {
    const gx = x + dir * (108 + i * 32);
    if (i < found) drawGem(ctx, gx, 138, 26, t.key, 0);
    else drawGemSlot(ctx, gx, 138, 22);
  }
  text(ctx, `Keeper: ${keeper?.name ?? '?'}`, x + dir * 84, 180, { size: 20, weight: 800, align: left ? 'left' : 'right', color: '#f2e9d8' });
  const seekers = t.members.filter((id) => id !== t.keeper).map((id) => byId.get(id)?.name ?? '?');
  text(ctx, clip(seekers.join(', '), 34), x + dir * 84, 202, { size: 16, weight: 600, align: left ? 'left' : 'right', color: '#a99f8f' });
  ctx.restore();
}

/** A wooden sign hanging on chains, with the clue burnt into it. */
function clueSign(ctx, word, n, color, x, y, T, thinking = false) {
  const sw = Math.sin(T * 1.2) * 0.012;
  ctx.save();
  ctx.translate(x, 0);
  ctx.rotate(sw);
  ctx.strokeStyle = '#6a6a72';
  ctx.lineWidth = 3;
  for (const d of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(d * 200, 10 + k * 10, 3, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  const w = 540;
  const h = 86;
  const top = y - h / 2;
  const wg = ctx.createLinearGradient(0, top, 0, top + h);
  wg.addColorStop(0, '#8a5a30');
  wg.addColorStop(1, '#5a3618');
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 3, top + 6, w, h, 10);
  ctx.fill();
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.roundRect(-w / 2, top, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = '#2a180a';
  ctx.lineWidth = 3;
  ctx.stroke();
  // wood grain
  ctx.strokeStyle = 'rgba(40,20,8,.35)';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 10, top + (i * h) / 4);
    ctx.bezierCurveTo(-w / 6, top + (i * h) / 4 + 4, w / 6, top + (i * h) / 4 - 4, w / 2 - 10, top + (i * h) / 4);
    ctx.stroke();
  }
  ctx.fillStyle = '#c8c0b0';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(d * 200, top + 10, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (thinking) {
    const size = fit(ctx, word, 34, w - 60, SERIF);
    serif(ctx, word, 0, y + 12, size, '#f6e6c8');
  } else {
    const size = fit(ctx, word, 56, w - 160);
    ctx.font = `900 ${size}px system-ui, -apple-system, sans-serif`;
    ctx.fillStyle = '#fff3dc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(word, -36, y + 3);
    // the number on a medallion in the team's colour
    const mx = w / 2 - 52;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(mx, y, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#2a180a';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#1a120c';
    ctx.font = '900 40px system-ui, -apple-system, sans-serif';
    ctx.fillText(String(n), mx, y + 2);
  }
  ctx.restore();
}

// ---- Flying things ----------------------------------------------------------------------------

function drawFlights(ctx, s, tnow) {
  flights = flights.filter((f) => tnow < f.at + 1100);
  for (const f of flights) {
    const q = clamp01((tnow - f.at) / 900);
    if (q <= 0) continue;
    const [sx, sy] = f.from;
    const [ex, ey] = slotXY(s, f.team, f.slot);
    if (q >= 1) {
      if (!f.landed) {
        f.landed = true;
        emit(ex, ey, 16, TEAM_COLOR[f.team], { speed: 3, size: 3 });
      }
      continue;
    }
    const k = ease(q);
    const x = sx + (ex - sx) * k;
    const y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 120;
    drawGem(ctx, x, y, 44 - 18 * k, f.team, 1);
    if (Math.random() < 0.6) parts.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: Math.random(), at: tnow, life: 400, color: TEAM_COLOR[f.team], size: 3, kind: 'spark', grav: 0.05 });
  }
}

function drawParts(ctx, tnow) {
  parts = parts.filter((p) => tnow - p.at < p.life);
  for (const p of parts) {
    if (tnow < p.at) continue;
    const q = (tnow - p.at) / p.life;
    const age = (tnow - p.at) / 16.7;
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age + p.grav * age * age;
    ctx.globalAlpha = 1 - q;
    if (p.kind === 'puff') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (0.6 + q * 1.4), 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'fire') {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(x, y, p.size * (0.5 + q * 1.6), 0, Math.PI * 2);
      ctx.fill();
    } else sparkle(ctx, x, y, p.size * 1.6, p.color);
  }
  ctx.globalAlpha = 1;
}

// ---- Teams overlay before the first clue ------------------------------------------------------

function drawBrief(ctx, s, byId, W, H, T) {
  ctx.fillStyle = 'rgba(15,12,11,.8)';
  ctx.fillRect(0, 0, W, H);
  const x = 280;
  const w = W - 2 * x;
  const top = 130;
  const h = 620;
  // a parchment scroll
  const pg = ctx.createLinearGradient(0, top, 0, top + h);
  pg.addColorStop(0, '#f2e6c8');
  pg.addColorStop(1, '#d8c49a');
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(x + 8, top + 12, w, h);
  ctx.fillStyle = pg;
  ctx.fillRect(x, top, w, h);
  for (const yy of [top, top + h]) {
    ctx.fillStyle = '#8a5a30';
    ctx.beginPath();
    ctx.roundRect(x - 24, yy - 16, w + 48, 32, 16);
    ctx.fill();
    ctx.strokeStyle = '#3a2410';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  drawDragonHead(ctx, W / 2 - 250, top + 82, 90, 0, T);
  serif(ctx, 'Dragon Hoard', W / 2 + 40, top + 100, 60, '#3a2418');
  const coop = s.mode === 'coop';
  const lines = coop
    ? [`Find all ${s.teams[0].total} gems in ${s.cluesTotal} clues.`, 'Dust ends the clue. The dragon ends the game!']
    : ['Each team finds its own gems. Dust or their gem ends your turn.', 'Whoever turns over the dragon loses!'];
  lines.forEach((l, i) => text(ctx, l, W / 2, top + 170 + i * 40, { size: 26, weight: 700, color: '#4a3420' }));
  const ty = top + 300;
  s.teams.forEach((t, i) => {
    const cx = coop ? W / 2 : W / 2 + (i === 0 ? -250 : 250);
    drawCrest(ctx, t.key, cx, ty, 90);
    serif(ctx, coop ? 'Your team' : `${t.name}${i === 0 ? ' · goes first' : ''}`, cx, ty + 90, 32, coop ? '#3a2418' : t.key === 'ember' ? '#b8501a' : '#1f6fa8');
    text(ctx, `Keeper: ${byId.get(t.keeper)?.name ?? '?'}`, cx, ty + 128, { size: 24, weight: 800, color: '#3a2418' });
    const seekers = t.members.filter((id) => id !== t.keeper).map((id) => byId.get(id)?.name ?? '?');
    text(ctx, clip(seekers.join(', '), 40), cx, ty + 160, { size: 20, weight: 600, color: '#6a5034' });
  });
  const waiting = s.players.filter((p) => !p.bot && p.connected && !s.ready.includes(p.id)).length;
  text(ctx, `Tap "Got it" on your phone · ${waiting} still reading · ${s.left}s`, W / 2, top + h - 30, { size: 22, weight: 800, color: '#8a5a30' });
}

// ---- How-to-play pictures (art keys in server/games/hoard.js rules) ---------------------------

function drawRules(ctx, art, t, box, now) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const T = now / 1000;
  ctx.save();
  const tile = (x, y, kind, word, key, w = 220, h = 96) => {
    drawTile(ctx, kind, x, y, w, h, { seed: Math.round(x + y), t: T, key });
    if (kind === 'hidden') text(ctx, word, x, y + 11, { size: fit(ctx, word, 32, w - 40), weight: 900, color: key === 'dragon' ? '#ffd2d2' : INK });
    else text(ctx, word, x, y + h / 2 - 12, { size: 20, weight: 900, color: kind === 'dust' ? '#c8bca2' : '#fff6e0' });
  };
  if (art === 'board') {
    // stones turning over one after another
    const kinds = ['ember', 'frost', 'dust', 'dragon'];
    const words = ['ANCHOR', 'COMET', 'SOCK', 'TOWER'];
    kinds.forEach((k, i) => {
      const x = cx + (i - 1.5) * 245;
      const q = clamp01((t - 0.4 - i * 0.6) / 0.5);
      ctx.save();
      ctx.translate(x, cy - 30);
      ctx.scale(Math.max(0.02, Math.abs(Math.cos(q * Math.PI))), 1);
      if (q < 0.5) tile(0, 0, 'hidden', words[i]);
      else tile(0, 0, k, words[i]);
      ctx.restore();
      const label = ['Ember gem', 'Frost gem', 'Dust', 'The dragon!'][i];
      if (q >= 1) text(ctx, label, x, cy + 60, { size: 26, weight: 800, color: k === 'dragon' ? '#ff8f8f' : k === 'dust' ? '#c8bca2' : TEAM_COLOR[k] });
    });
    drawCoins(ctx, cx, cy + 200, 300, 5, T);
  } else if (art === 'keeper') {
    // the Keeper's phone shows the key; the clue goes on the sign
    ctx.fillStyle = '#1b1f2a';
    ctx.beginPath();
    ctx.roundRect(cx - 420, cy - 190, 260, 400, 30);
    ctx.fill();
    ctx.strokeStyle = '#5a6278';
    ctx.lineWidth = 4;
    ctx.stroke();
    const keys = ['ember', 'dust', 'frost', 'ember', 'dragon', 'ember', 'frost', 'dust', 'ember', 'frost', 'dust', 'ember'];
    keys.forEach((k, i) => drawTile(ctx, 'hidden', cx - 372 + (i % 3) * 76, cy - 130 + Math.floor(i / 3) * 70, 70, 60, { key: k, seed: i }));
    clueSign(ctx, 'OCEAN', 3, TEAM_COLOR.ember, cx + 160, cy - 20, T);
    text(ctx, 'One word and a number', cx + 160, cy + 80, { size: 28, weight: 800, color: '#e8d8b8' });
  } else if (art === 'vote') {
    tile(cx - 240, cy - 40, 'hidden', 'WHALE');
    tile(cx + 0, cy - 40, 'hidden', 'SAND');
    tile(cx + 240, cy - 40, 'hidden', 'PIANO');
    ctx.strokeStyle = TEAM_COLOR.ember;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(cx - 354, cy - 92, 228, 104, 16);
    ctx.stroke();
    const n = Math.min(3, Math.floor(t * 1.2));
    ['#ff5a5f', '#4cd97b', '#ffc93c'].slice(0, n).forEach((c, j) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx - 330 + j * 30, cy - 4, 12, 0, Math.PI * 2);
      ctx.fill();
    });
    text(ctx, `${n}/3`, cx - 140, cy + 2, { size: 20, weight: 900, align: 'right', color: '#6b5a3e' });
    text(ctx, 'Most of the team agrees, and it turns over', cx, cy + 110, { size: 28, weight: 800, color: '#e8d8b8' });
  } else if (art === 'turn') {
    tile(cx - 260, cy - 30, 'ember', 'WHALE');
    tile(cx, cy - 30, 'ember', 'TIDE');
    tile(cx + 260, cy - 30, 'dust', 'PIANO');
    text(ctx, 'Keep going', cx - 130, cy + 70, { size: 26, weight: 800, color: TEAM_COLOR.ember });
    text(ctx, 'Turn over', cx + 260, cy + 70, { size: 26, weight: 800, color: '#c8bca2' });
    drawGem(ctx, cx - 130, cy - 120 + Math.sin(T * 3) * 6, 50, 'ember', 1);
  } else if (art === 'dragon') {
    const q = clamp01(((t % 4) - 0.8) / 0.8);
    drawSleepingDragon(ctx, cx - 300, cy + 140, cx + 420, 170, T, q, 160);
    if (q > 0.6) {
      const hs = 170 * 0.9;
      const headY = cy + 140 - 160 * q;
      for (let i = 0; i < 3; i++) emit(cx - 300 + hs * 0.62, headY + hs * 0.12, 1, ['#ff6a2a', '#ffb040', '#fff1b0'][i], { angle: -0.2, spread: 0.3, speed: 12, life: 700, size: 12, kind: 'fire', grav: -0.02 });
    }
    drawParts(ctx, performance.now());
  } else if (art === 'coop') {
    tile(cx - 150, cy - 40, 'ember', 'MOON');
    drawDust(ctx, cx + 120, cy - 30, 100, 2);
    for (let i = 0; i < 8; i++) drawLantern(ctx, cx - 210 + i * 60, cy + 120, 44, i < 5, T + i);
  }
  ctx.restore();
}
