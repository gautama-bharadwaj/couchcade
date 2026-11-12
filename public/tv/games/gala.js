// Midnight Gala TV: the shared "board". Shows only public information;
// secrets live on each phone. Rules are in server/games/gala.js.

import { circle, text } from './util.js';

const PHASE_LABEL = {
  intro: 'Check your phone for your secret role',
  night: 'Night falls… choose a room on your phone',
  reveal: 'Morning: here is what happened',
  talk: 'Discuss! Who are the Thieves?',
  vote: 'Vote on your phone',
  verdict: 'The votes are in',
  lastGuess: 'Last guess!',
  end: '',
};

export default {
  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;

    // Background: dark mansion night, warmer in the day phases.
    const day = ['reveal', 'talk', 'vote', 'verdict'].includes(s.phase);
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, day ? '#1b1a2a' : '#0a0c16');
    bg.addColorStop(1, day ? '#2a1f2a' : '#11142a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Header
    text(ctx, 'Midnight Gala', 80, 92, { size: 46, weight: 900, align: 'left', color: '#ffc93c' });
    const sub = s.phase === 'intro' || s.phase === 'end' ? '' : `Night ${s.night} of ${s.maxNights}`;
    text(ctx, sub, 80, 128, { size: 24, weight: 600, align: 'left', color: '#8a93a8' });
    if (s.phase !== 'end' && s.phase !== 'reveal' && s.phase !== 'verdict') timer(ctx, W - 130, 92, s.left, now);

    gems(ctx, W / 2, 92, s.gems, s.gemsToWin);

    if (PHASE_LABEL[s.phase]) text(ctx, PHASE_LABEL[s.phase], W / 2, 200, { size: 40, weight: 800 });

    const mid = { x: W / 2, y: 470 };
    switch (s.phase) {
      case 'intro':
        text(ctx, `${s.thieves === 1 ? 'One Thief is' : `${s.thieves} Thieves are`} hiding among you.`, mid.x, 330, { size: 34, color: '#f2f4f8' });
        text(ctx, `They need ${s.gemsToWin} gems before dawn. Keep your screen hidden.`, mid.x, 380, { size: 28, color: '#8a93a8' });
        rooms(ctx, s, mid, { dim: true });
        break;
      case 'night':
        rooms(ctx, s, mid, { dim: true, now });
        break;
      case 'reveal':
        rooms(ctx, s, mid, { last: s.last });
        revealLine(ctx, s, W / 2, 680);
        break;
      case 'talk':
        gossip(ctx, s, mid);
        break;
      case 'vote': {
        const voters = s.players.filter((p) => !p.out && !p.noVote);
        text(ctx, `${voters.filter((p) => p.done).length} of ${voters.length} votes locked in`, mid.x, 420, { size: 44, weight: 800 });
        text(ctx, 'Plurality with 2+ votes escorts someone out. Ties mean nobody leaves.', mid.x, 480, { size: 26, color: '#8a93a8' });
        break;
      }
      case 'verdict':
        verdict(ctx, s, mid);
        break;
      case 'lastGuess': {
        const p = s.players.find((x) => x.id === s.lastGuessBy);
        text(ctx, `${p?.name ?? 'The Thief'} was the last Thief…`, mid.x, 400, { size: 44, weight: 800 });
        text(ctx, 'but if they can name the Detective, the Thieves still win.', mid.x, 460, { size: 30, color: '#8a93a8' });
        break;
      }
      case 'end':
        ending(ctx, s, W, H);
        break;
    }

    roster(ctx, s, W, H);
  },
};

function timer(ctx, x, y, left, now) {
  const urgent = left <= 10;
  circle(ctx, x, y - 12, 44, urgent ? `rgba(255,90,95,${0.25 + 0.15 * Math.sin(now / 120)})` : '#1f2436');
  text(ctx, String(left), x, y, { size: 38, weight: 900, color: urgent ? '#ff8c8c' : '#f2f4f8' });
}

function gems(ctx, cx, y, have, need) {
  const gap = 56;
  const x0 = cx - ((need - 1) * gap) / 2;
  for (let i = 0; i < need; i++) {
    const x = x0 + i * gap;
    ctx.beginPath();
    ctx.moveTo(x, y - 34);
    ctx.lineTo(x + 20, y - 16);
    ctx.lineTo(x, y + 8);
    ctx.lineTo(x - 20, y - 16);
    ctx.closePath();
    ctx.fillStyle = i < have ? '#ff5a5f' : '#2a3142';
    ctx.fill();
  }
  text(ctx, 'gems stolen', cx, y + 36, { size: 18, color: '#8a93a8' });
}

function rooms(ctx, s, mid, { dim, last, now = 0 }) {
  const w = 300;
  const h = 190;
  const gap = 30;
  const x0 = mid.x - (s.rooms.length * w + (s.rooms.length - 1) * gap) / 2;
  s.rooms.forEach((r, i) => {
    const x = x0 + i * (w + gap);
    const y = mid.y - h / 2 + 20;
    const stolen = last?.stolen.filter((id) => id === r.id).length ?? 0;
    const foiled = last?.foiled.includes(r.id);
    ctx.fillStyle = '#161a2a';
    ctx.strokeStyle = stolen ? '#ff5a5f' : foiled ? '#2ee6d6' : r.color + (dim ? '55' : 'aa');
    ctx.lineWidth = stolen || foiled ? 6 : 3;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();
    // a little window light that flickers at night
    if (dim) {
      const a = 0.35 + 0.15 * Math.sin(now / 400 + i * 1.7);
      ctx.fillStyle = `rgba(255, 201, 60, ${a})`;
      roundRect(ctx, x + w / 2 - 22, y + 36, 44, 56, 8);
      ctx.fill();
    }
    text(ctx, r.label, x + w / 2, y + h - 34, { size: 30, weight: 800, color: r.color });
    if (stolen) text(ctx, stolen > 1 ? `${stolen} gems stolen!` : 'Gem stolen!', x + w / 2, y + 80, { size: 30, weight: 900, color: '#ff8c8c' });
    else if (foiled) text(ctx, 'Theft foiled!', x + w / 2, y + 80, { size: 30, weight: 900, color: '#2ee6d6' });
    else if (last) text(ctx, 'Quiet', x + w / 2, y + 80, { size: 26, color: '#5a6278' });
  });
}

function revealLine(ctx, s, x, y) {
  const parts = [];
  const stolen = s.last?.stolen.length ?? 0;
  parts.push(stolen ? `${stolen} gem${stolen > 1 ? 's' : ''} stolen last night.` : 'Nothing was stolen last night.');
  if (s.last?.evidence) parts.push('Someone found evidence…');
  text(ctx, parts.join(' '), x, y, { size: 32, weight: 700 });
  text(ctx, 'Check your phone for what you saw.', x, y + 44, { size: 24, color: '#8a93a8' });
}

function gossip(ctx, s, mid) {
  if (!s.gossip.length) {
    text(ctx, 'Share what you saw, or bluff.', mid.x, 400, { size: 34, color: '#8a93a8' });
    text(ctx, 'Tap "Ready to vote" on your phone when you are done.', mid.x, 450, { size: 28, color: '#5a6278' });
    return;
  }
  text(ctx, 'Anonymous whispers', mid.x, 300, { size: 26, weight: 800, color: '#ff6fd8' });
  s.gossip.slice(-3).forEach((g, i) => {
    const y = 340 + i * 110;
    ctx.fillStyle = '#2a1f33';
    roundRect(ctx, mid.x - 560, y, 1120, 86, 18);
    ctx.fill();
    text(ctx, `“${g}”`, mid.x, y + 54, { size: 34, weight: 700, color: '#ffd6f3' });
  });
}

function verdict(ctx, s, mid) {
  const byId = new Map(s.players.map((p) => [p.id, p]));
  // Votes: voter → target, revealed together.
  const rows = s.votes ?? [];
  const colW = 520;
  rows.forEach((v, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = mid.x - colW + col * colW + 40;
    const y = 280 + row * 56;
    const a = byId.get(v.voter);
    const t = v.target === 'nobody' ? { name: 'Nobody', color: '#5a6278' } : byId.get(v.target);
    circle(ctx, x, y - 10, 12, a?.color ?? '#888');
    text(ctx, `${a?.name ?? '?'}  →`, x + 22, y, { size: 28, align: 'left' });
    ctx.font = '600 28px system-ui, -apple-system, sans-serif';
    const off = ctx.measureText(`${a?.name ?? '?'}  →`).width + 34;
    circle(ctx, x + off + 12, y - 10, 12, t?.color ?? '#888');
    text(ctx, t?.name ?? '?', x + off + 32, y, { size: 28, weight: 800, align: 'left' });
  });
  const v = s.verdict;
  const y = 560;
  if (!v || v.nobody) {
    text(ctx, 'Nobody is escorted out.', mid.x, y + 40, { size: 44, weight: 900 });
    if (v?.reason) text(ctx, v.reason, mid.x, y + 90, { size: 28, color: '#8a93a8' });
  } else {
    const p = byId.get(v.id);
    const role = s.roleInfo[v.role];
    text(ctx, `${p?.name} is escorted out…`, mid.x, y + 30, { size: 40, weight: 800 });
    text(ctx, `They were ${['thief', 'guest'].includes(v.role) ? 'a' : 'the'} ${role.label}!`, mid.x, y + 92, { size: 52, weight: 900, color: role.color });
  }
}

function ending(ctx, s, W) {
  const thieves = s.winner === 'thieves';
  text(ctx, thieves ? 'The Thieves win!' : 'The guests win!', W / 2, 300, { size: 80, weight: 900, color: thieves ? '#ff5a5f' : '#3fa7ff' });
  text(ctx, s.winReason, W / 2, 370, { size: 32, color: '#f2f4f8' });
}

function roster(ctx, s, W, H) {
  const n = s.players.length;
  const slot = Math.min(180, (W - 160) / n);
  const x0 = W / 2 - (slot * (n - 1)) / 2;
  const y = H - 130;
  const showDone = ['intro', 'night', 'talk', 'vote'].includes(s.phase);
  s.players.forEach((p, i) => {
    const x = x0 + i * slot;
    ctx.globalAlpha = p.out ? 0.4 : p.connected ? 1 : 0.6;
    circle(ctx, x, y, 30, p.color);
    if (showDone && p.done) {
      circle(ctx, x + 24, y - 24, 14, '#4cd97b');
      text(ctx, '✓', x + 24, y - 16, { size: 20, weight: 900, color: '#0d0f14' });
    }
    text(ctx, p.name, x, y + 60, { size: 24, weight: 700 });
    if (p.role) {
      const r = s.roleInfo[p.role];
      text(ctx, r.label, x, y + 88, { size: 20, weight: 800, color: r.color });
    } else if (!p.connected) {
      text(ctx, 'reconnecting', x, y + 88, { size: 18, color: '#8a93a8' });
    } else if (p.noVote && s.phase === 'vote') {
      text(ctx, 'no vote', x, y + 88, { size: 18, color: '#8a93a8' });
    }
    ctx.globalAlpha = 1;
  });
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
