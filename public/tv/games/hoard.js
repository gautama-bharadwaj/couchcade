// Dragon Hoard TV: the 5x5 word board in the middle, a banner for each team on top with its
// gems found, and the current clue between them. Words flip over when a team agrees on them:
// a gem in the team's color, a pile of dust, or the dragon.

import { circle, text } from './util.js';

const COLS = 5;
const TW = 236;
const TH = 112;
const GAP = 14;
const BX = (1600 - (COLS * TW + (COLS - 1) * GAP)) / 2;
const BY = 222;
const FLIP_MS = 520;

const DUST = '#b9ab8c';
const PARCHMENT = '#efe6d0';
const INK = '#2b2418';

const flips = new Map(); // tile index -> when it started turning over
let lastSeen = null;

export default {
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const team = (k) => s.teams.find((t) => t.key === k);
    const nameOf = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    if (!prev) {
      flips.clear();
      lastSeen = s.last?.seq ?? null;
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
      flips.set(s.last.tile, performance.now());
      const { owner, team: by } = s.last;
      setTimeout(() => {
        if (owner === 'dragon') {
          sfx.boom();
          sfx.evil();
          say(pick(['The dragon wakes!', 'Roar! The dragon is awake!']), { interrupt: true, delay: 0.3 });
        } else if (owner === 'dust') {
          sfx.thud(0.4);
          say(pick(['Just dust.', 'Dust.', 'Nothing but dust.']), { delay: 0.2 });
        } else if (owner === by) {
          sfx.chime();
          if (s.phase !== 'end' && Math.random() < 0.5) say(pick(['A gem!', 'Shiny!', 'Got one!']), { delay: 0.2 });
        } else {
          sfx.buzz();
          say(`Oops, that's ${team(owner)?.name ?? 'their'} gem.`, { delay: 0.2 });
        }
      }, FLIP_MS / 2);
    }
    if (s.phase === 'end' && prev.phase !== 'end') {
      setTimeout(() => {
        if (s.mode === 'coop') {
          if (s.reason === 'gems') {
            sfx.fanfare();
            say('You found the whole hoard!');
          } else if (s.reason === 'clues') {
            sfx.sadTrombone();
            say('Out of clues. The dragon keeps its gold.');
          }
        } else {
          sfx.fanfare();
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
    // A dark cave with a warm glow from the hoard.
    ctx.fillStyle = '#0f0c0b';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, H * 0.62, 60, W / 2, H * 0.62, W * 0.62);
    glow.addColorStop(0, 'rgba(255,170,60,.16)');
    glow.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const byId = new Map(s.players.map((p) => [p.id, p]));
    const team = (k) => s.teams.find((t) => t.key === k);
    const at = team(s.turnTeam);

    // ---- Team banners ----
    if (s.mode === 'coop') {
      teamBanner(ctx, s.teams[0], 80, 'left', s, byId, true);
      // Clues left as little lanterns
      const x = W - 80;
      text(ctx, 'Clues left', x, 78, { size: 24, weight: 800, align: 'right', color: '#a99f8f' });
      for (let i = 0; i < s.cluesTotal; i++) {
        const lit = i < s.cluesLeft;
        circle(ctx, x - 14 - i * 34, 112, 12, lit ? '#ffc457' : '#3a312a');
        if (lit) circle(ctx, x - 14 - i * 34, 112, 5, '#fff3c9');
      }
      text(ctx, `${s.cluesLeft} of ${s.cluesTotal}`, x, 168, { size: 30, weight: 900, align: 'right', color: '#f2e9d8' });
    } else {
      for (const t of s.teams) teamBanner(ctx, t, t.key === 'ember' ? 80 : W - 80, t.key === 'ember' ? 'left' : 'right', s, byId, t.key === s.turnTeam);
    }

    // ---- Middle: title, clue, status ----
    const mid = W / 2;
    text(ctx, 'DRAGON HOARD', mid, 66, { size: 24, weight: 900, color: '#a07a3c' });
    if (s.phase === 'guess' && s.clue) {
      const c = team(s.clue.team);
      text(ctx, `${s.clue.word.toUpperCase()}  ${s.clue.n}`, mid, 140, { size: fit(ctx, `${s.clue.word.toUpperCase()}  ${s.clue.n}`, 66, 470), weight: 900, color: c.color });
      const stops = s.votes.filter((v) => v.tile === -1).length;
      const left = `${s.guessesLeft} guess${s.guessesLeft === 1 ? '' : 'es'} left · ${s.need === 1 ? '1 vote turns' : `${s.need} votes turn`} a word${stops ? ` · ${stops} want to stop` : ''} · ${s.left}s`;
      text(ctx, left, mid, 184, { size: 22, weight: 700, color: '#a99f8f' });
    } else if (s.phase === 'clue') {
      text(ctx, `${byId.get(at.keeper)?.name ?? 'The Keeper'} is thinking${'.'.repeat(Math.floor(now / 400) % 4)}`, mid, 136, { size: 34, weight: 800, color: at.color });
      text(ctx, `Keepers: one word and a number · ${s.left}s`, mid, 180, { size: 22, weight: 700, color: '#a99f8f' });
    } else if (s.phase === 'end') {
      const title = s.mode === 'coop' ? (s.reason === 'gems' ? 'The hoard is yours!' : s.reason === 'dragon' ? 'The dragon woke!' : 'Out of clues!') : `${team(s.winner).name} wins!`;
      text(ctx, title, mid, 140, { size: 58, weight: 900, color: s.winner ? team(s.winner).color : '#ff8f8f' });
      const why = { gems: 'Every gem found', 'gems-other': 'Their last gem was found for them', dragon: s.mode === 'coop' ? 'Somebody poked the dragon' : `${team(s.winner === 'ember' ? 'frost' : 'ember')?.name} woke the dragon`, clues: `${s.teams[0].found} of ${s.teams[0].total} gems found` }[s.reason];
      text(ctx, `${why} · here's the whole key`, mid, 184, { size: 22, weight: 700, color: '#a99f8f' });
    }

    // ---- Board ----
    const votes = new Map();
    for (const v of s.votes) votes.set(v.tile, [...(votes.get(v.tile) ?? []), v.id]);
    s.tiles.forEach((tile, i) => {
      const x = BX + (i % COLS) * (TW + GAP);
      const y = BY + Math.floor(i / COLS) * (TH + GAP);
      const started = flips.get(i);
      let k = 1; // 1 = fully shown
      if (started != null) k = Math.min(1, (tnow - started) / FLIP_MS);
      const showFace = tile.revealed && k >= 0.5;
      const sx = tile.revealed && k < 1 ? Math.abs(Math.cos(k * Math.PI)) : 1;
      ctx.save();
      ctx.translate(x + TW / 2, y + TH / 2);
      ctx.scale(Math.max(0.02, sx), 1);
      if (showFace) drawFace(ctx, tile, team(tile.owner), now);
      else drawCard(ctx, tile, s.phase === 'end' ? tile.owner : null, team(tile.owner));
      ctx.restore();

      // Votes on this word
      const v = votes.get(i);
      if (v && !tile.revealed) {
        ctx.lineWidth = 5;
        ctx.strokeStyle = at.color;
        ctx.beginPath();
        ctx.roundRect(x - 3, y - 3, TW + 6, TH + 6, 16);
        ctx.stroke();
        v.forEach((id, j) => {
          const p = byId.get(id);
          const cx = x + 26 + j * 30;
          const cy = y + TH - 20;
          circle(ctx, cx, cy, 14, '#0f0c0b');
          circle(ctx, cx, cy, 12, p?.color ?? '#888');
          text(ctx, (p?.name ?? '?').charAt(0).toUpperCase(), cx, cy + 6, { size: 16, weight: 900, color: '#0f0c0b' });
        });
        text(ctx, `${v.length}/${s.need}`, x + TW - 12, y + TH - 10, { size: 20, weight: 900, align: 'right', color: '#6b5a3e' });
      }
    });

    if (s.phase === 'brief') drawBrief(ctx, s, byId, W, H, now);
  },
};

function teamBanner(ctx, t, x, align, s, byId, active) {
  const dir = align === 'left' ? 1 : -1;
  const keeper = byId.get(t.keeper);
  ctx.globalAlpha = active || s.phase === 'end' || s.phase === 'brief' ? 1 : 0.55;
  text(ctx, s.mode === 'coop' ? 'Your team' : t.name, x, 92, { size: 46, weight: 900, align, color: t.color });
  // Gems: filled for found, outlines for still hidden.
  for (let i = 0; i < t.total; i++) gem(ctx, x + dir * (14 + i * 30), 124, 11, i < t.found ? t.color : null);
  const seekers = t.members.filter((id) => id !== t.keeper).map((id) => byId.get(id)?.name ?? '?');
  text(ctx, `Keeper: ${keeper?.name ?? '?'}`, x, 168, { size: 22, weight: 800, align, color: '#f2e9d8' });
  text(ctx, clip(seekers.join(', '), 34), x, 196, { size: 18, weight: 600, align, color: '#a99f8f' });
  if (active && (s.phase === 'clue' || s.phase === 'guess') && s.mode === 'teams') {
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.roundRect(align === 'left' ? x : x - 120, 30, 120, 8, 4);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A word still face down (or, at the end, with its secret shown as a tint). */
function drawCard(ctx, tile, secret, team) {
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  ctx.roundRect(-TW / 2 + 2, -TH / 2 + 5, TW, TH, 14);
  ctx.fill();
  ctx.fillStyle = PARCHMENT;
  ctx.beginPath();
  ctx.roundRect(-TW / 2, -TH / 2, TW, TH, 14);
  ctx.fill();
  if (secret) {
    ctx.fillStyle = secret === 'dust' ? 'rgba(185,171,140,.55)' : secret === 'dragon' ? 'rgba(90,10,20,.85)' : hexA(team.color, 0.55);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,90,50,.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-TW / 2 + 7, -TH / 2 + 7, TW - 14, TH - 14, 9);
  ctx.stroke();
  const w = tile.word.toUpperCase();
  text(ctx, w, 0, 12, { size: fit(ctx, w, 34, TW - 30), weight: 900, color: secret === 'dragon' ? '#ffd2d2' : INK });
  if (secret === 'dragon') text(ctx, '🐉', TW / 2 - 26, -TH / 2 + 32, { size: 24 });
}

/** A word turned over. */
function drawFace(ctx, tile, team, now) {
  const w = tile.word.toUpperCase();
  ctx.beginPath();
  ctx.roundRect(-TW / 2, -TH / 2, TW, TH, 14);
  if (tile.owner === 'dragon') {
    const g = ctx.createLinearGradient(0, -TH / 2, 0, TH / 2);
    g.addColorStop(0, '#5a0d16');
    g.addColorStop(1, '#1d0508');
    ctx.fillStyle = g;
    ctx.fill();
    text(ctx, '🐉', 0, 16, { size: 64 });
    text(ctx, w, 0, TH / 2 - 10, { size: 16, weight: 800, color: '#ffb3b3' });
    return;
  }
  if (tile.owner === 'dust') {
    ctx.fillStyle = '#4a4338';
    ctx.fill();
    for (let i = 0; i < 18; i++) circle(ctx, ((i * 53) % (TW - 30)) - TW / 2 + 15, ((i * 37) % (TH - 30)) - TH / 2 + 15, 2 + (i % 3), 'rgba(185,171,140,.35)');
    text(ctx, w, 0, 10, { size: fit(ctx, w, 28, TW - 30), weight: 800, color: DUST });
    return;
  }
  ctx.fillStyle = team.color;
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath();
  ctx.roundRect(-TW / 2, TH / 2 - 30, TW, 30, [0, 0, 14, 14]);
  ctx.fill();
  const shine = 1 + 0.06 * Math.sin(now / 300);
  gem(ctx, 0, -10, 26 * shine, '#ffffff', team.color);
  text(ctx, w, 0, TH / 2 - 9, { size: fit(ctx, w, 20, TW - 20), weight: 900, color: '#1a120c' });
}

/** A cut gem: a flat-topped diamond. fill null = outline only. */
function gem(ctx, x, y, r, fill, accent) {
  ctx.beginPath();
  ctx.moveTo(x - r, y - r * 0.35);
  ctx.lineTo(x - r * 0.55, y - r * 0.85);
  ctx.lineTo(x + r * 0.55, y - r * 0.85);
  ctx.lineTo(x + r, y - r * 0.35);
  ctx.lineTo(x, y + r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = accent ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.35);
    ctx.lineTo(x + r, y - r * 0.35);
    ctx.moveTo(x - r * 0.35, y - r * 0.35);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x + r * 0.35, y - r * 0.35);
    ctx.strokeStyle = accent ? hexA(accent, 0.7) : 'rgba(0,0,0,.2)';
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(242,233,216,.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBrief(ctx, s, byId, W, H, now) {
  ctx.fillStyle = 'rgba(15,12,11,.82)';
  ctx.fillRect(0, 0, W, H);
  const x = 260;
  const w = W - 2 * x;
  ctx.fillStyle = '#1c1714';
  ctx.beginPath();
  ctx.roundRect(x, 120, w, 660, 26);
  ctx.fill();
  ctx.strokeStyle = '#a07a3c';
  ctx.lineWidth = 3;
  ctx.stroke();
  text(ctx, '🐉  Dragon Hoard', W / 2, 200, { size: 56, weight: 900, color: '#f2e9d8' });
  const coop = s.mode === 'coop';
  const lines = coop
    ? [
        `Each word hides a gem, dust, or the sleeping dragon.`,
        `Your Keeper sees which is which, and gives one word and a number: "ocean 3".`,
        `Vote for a word on your phones. Find all ${s.teams[0].total} gems in ${s.cluesTotal} clues.`,
        `Dust ends the clue. The dragon ends the game!`,
      ]
    : [
        `Each word hides an Ember gem, a Frost gem, dust, or the sleeping dragon.`,
        `Only the two Keepers can see which is which, on their phones.`,
        `On your turn your Keeper says one word and a number: "ocean 3".`,
        `Talk it over and vote on your phones. Find your own gems to keep going.`,
        `Dust or their gem ends your turn. The dragon loses you the game!`,
      ];
  lines.forEach((l, i) => text(ctx, l, W / 2, 280 + i * 46, { size: 27, weight: 600, color: '#d8cdb9' }));
  // Teams
  const ty = 280 + lines.length * 46 + 40;
  s.teams.forEach((t, i) => {
    const cx = coop ? W / 2 : W / 2 + (i === 0 ? -260 : 260);
    text(ctx, coop ? 'Your team' : `${t.name}${i === 0 ? ' · goes first' : ''}`, cx, ty, { size: 32, weight: 900, color: t.color });
    text(ctx, `Keeper: ${byId.get(t.keeper)?.name ?? '?'}`, cx, ty + 40, { size: 24, weight: 800, color: '#f2e9d8' });
    const seekers = t.members.filter((id) => id !== t.keeper).map((id) => byId.get(id)?.name ?? '?');
    text(ctx, clip(seekers.join(', '), 40), cx, ty + 74, { size: 21, weight: 600, color: '#a99f8f' });
  });
  const waiting = s.players.filter((p) => !p.bot && p.connected && !s.ready.includes(p.id)).length;
  text(ctx, `Tap "Got it" on your phone · ${waiting} still reading · ${s.left}s`, W / 2, 750, { size: 22, weight: 700, color: '#a07a3c' });
}

function fit(ctx, str, size, maxW) {
  ctx.font = `900 ${size}px system-ui, -apple-system, sans-serif`;
  const w = ctx.measureText(str).width;
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
