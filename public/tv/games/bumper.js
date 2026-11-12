import { lerpById, circle, text } from './util.js';

const FALL_MS = 600;
const fallStarted = new Map(); // id -> time we first saw them fall (client-side animation)
let lastRound = 0;

let nextBeatAt = 0;

export default {
  // Sounds and narration for state changes (see public/tv/audio.js).
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const t = performance.now();

    // Countdown: 3, 2, 1 beeps, then GO.
    if (s.phase === 'countdown' && (!prev || prev.phase !== 'countdown' || s.timer !== prev.timer) && s.timer > 0) {
      sfx.beep();
      if (!prev || prev.phase !== 'countdown') say(s.round === 1 ? 'Get ready!' : `Round ${s.round}!`, { rate: 1.1, interrupt: true });
    }
    if (s.phase === 'play' && prev?.phase === 'countdown') {
      sfx.beep(true);
      say('Go!', { rate: 1.2, interrupt: true });
    }
    if (!prev) return;

    // Hits and dashes.
    const bumps = s.fx?.bumps ?? [];
    if (bumps.length) sfx.thud(Math.max(...bumps.map((b) => b.power)));
    if (s.fx?.dashes) sfx.whoosh();

    // Falling off.
    const was = new Map(prev.players.map((p) => [p.id, p.alive]));
    const fell = s.players.filter((p) => !p.alive && was.get(p.id));
    for (const p of fell) {
      sfx.fall();
      if (s.phase === 'play' || s.phase === 'roundover') say(pick([`${p.name} is out!`, `Bye bye, ${p.name}!`, `${p.name} takes a dive!`]), { rate: 1.1 });
    }

    // Heartbeat as the platform shrinks: faster and louder near the end.
    if (s.phase === 'play' && s.platform.r < 330 && t >= nextBeatAt) {
      const danger = 1 - s.platform.r / 330; // 0..1
      sfx.heartbeat(danger);
      nextBeatAt = t + 1000 - 650 * danger;
    }

    // Round and match winners.
    if (s.phase === 'roundover' && prev.phase !== 'roundover') {
      if (s.matchWinner) {
        sfx.fanfare();
        say(`${s.matchWinner} wins the match!`, { delay: 0.8 });
      } else if (s.roundWinner) {
        sfx.jingle();
        say(`${s.roundWinner} wins the round!`, { delay: 0.8 });
      } else if (!s.solo) {
        sfx.buzz();
        say('Nobody survives. A draw!', { delay: 0.8 });
      }
    }
  },

  draw(ctx, { prev, cur, alpha, arena, now }) {
    if (cur.round !== lastRound) {
      fallStarted.clear();
      lastRound = cur.round;
    }

    // Background
    ctx.fillStyle = '#0b0d12';
    ctx.fillRect(0, 0, arena.w, arena.h);

    // Platform: interpolate radius too, so the shrink is smooth.
    const pr = prev.platform.r + (cur.platform.r - prev.platform.r) * alpha;
    const { x: cx, y: cy } = cur.platform;
    const shrinking = cur.phase === 'play' && cur.platform.r < 410;

    // Where the platform started (faint ring)
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = '#1c2130';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 410, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (pr > 0) {
      const g = ctx.createRadialGradient(cx, cy, pr * 0.2, cx, cy, pr);
      g.addColorStop(0, '#2a3146');
      g.addColorStop(1, '#1d2232');
      circle(ctx, cx, cy, pr, g);
      // Danger edge pulses while shrinking
      ctx.lineWidth = 8;
      ctx.strokeStyle = shrinking ? `rgba(255, 90, 95, ${0.55 + 0.35 * Math.sin(now / 150)})` : '#3a425a';
      ctx.beginPath();
      ctx.arc(cx, cy, pr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Players
    for (const p of lerpById(prev.players, cur.players, alpha)) {
      let scale = 1;
      let fade = p.connected ? 1 : 0.5;
      if (!p.alive) {
        if (!fallStarted.has(p.id)) fallStarted.set(p.id, now);
        const t = Math.min(1, (now - fallStarted.get(p.id)) / FALL_MS);
        if (t >= 1) continue; // gone
        scale = 1 - t * 0.85;
        fade *= 1 - t;
      }
      ctx.globalAlpha = fade;
      if (p.dashing) circle(ctx, p.x, p.y, (p.r + 14) * scale, p.color + '66');
      circle(ctx, p.x, p.y + 6 * scale, p.r * scale, 'rgba(0,0,0,.35)'); // shadow
      circle(ctx, p.x, p.y, p.r * scale, p.color);
      circle(ctx, p.x - p.r * 0.3 * scale, p.y - p.r * 0.35 * scale, p.r * 0.28 * scale, 'rgba(255,255,255,.35)'); // shine
      if (p.alive) text(ctx, p.name, p.x, p.y - p.r - 14, { size: 24 });
      ctx.globalAlpha = 1;
    }

    drawScoreboard(ctx, cur);
    drawBanner(ctx, cur, arena);
  },
};

function drawScoreboard(ctx, s) {
  // Top-left, inside the TV's safe margin.
  const x = 80;
  let y = 70;
  text(ctx, s.solo ? `Practice · round ${s.round} of ${s.winScore}` : `Round ${s.round} · first to ${s.winScore}`, x, y, { size: 24, weight: 700, color: '#8a93a8', align: 'left' });
  if (s.solo) return;
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

function drawBanner(ctx, s, arena) {
  const cx = arena.w / 2;
  const cy = arena.h / 2;
  if (s.phase === 'countdown') {
    text(ctx, String(s.timer || 'GO'), cx, cy + 40, { size: 160, weight: 900, color: '#ffc93c' });
  } else if (s.phase === 'roundover') {
    let line;
    if (s.matchWinner) line = `${s.matchWinner} wins the match!`;
    else if (s.solo) line = 'Splash!';
    else line = s.roundWinner ? `${s.roundWinner} wins the round` : 'Draw!';
    ctx.fillStyle = 'rgba(11, 13, 18, .7)';
    ctx.fillRect(0, cy - 70, arena.w, 120);
    text(ctx, line, cx, cy + 14, { size: 64, weight: 900 });
  }
}
