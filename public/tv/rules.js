// How-to-play overlay on the TV. Games list their steps in `rules` (server/games/<id>.js); the
// server pauses the game and says which step is up (phase.intro). This draws the step over the
// board: the game's own picture (its renderer's optional drawRules), the title and text, a
// progress bar per step, and how to skip. Nothing here is game-specific.

import { text } from './games/util.js';

const ART = { x: 300, y: 150, w: 1000, h: 430 }; // where the game draws its picture

/**
 * @param {object} o
 * @param {Array} o.steps      the game's rules
 * @param {number} o.step      index of the step showing
 * @param {number} o.t         seconds into this step
 * @param {number} o.frac      0..1, how much of this step's time has passed
 * @param {string} o.title     the game's title
 * @param {object} [o.renderer] the game's TV renderer
 * @param {Function} [o.art]   pictures for games whose renderer has no drawRules (public/tv/games/rules/)
 * @param {string} [o.hostName]
 */
export function drawRulesOverlay(ctx, { steps, step, t, frac, title, renderer, art, hostName, now, arena }) {
  const W = arena.w;
  const cur = steps[step];
  if (!cur) return;
  ctx.save();
  ctx.fillStyle = 'rgba(9, 8, 13, 0.95)';
  ctx.fillRect(0, 0, W, arena.h);

  text(ctx, `HOW TO PLAY ${title.toUpperCase()}`, W / 2, 78, { size: 22, weight: 900, color: '#8a93a8' });
  // One dot per step; the current one is a pill.
  const gap = 26;
  let x = W / 2 - ((steps.length - 1) * gap) / 2;
  for (let i = 0; i < steps.length; i++, x += gap) {
    ctx.fillStyle = i === step ? '#ffc93c' : i < step ? '#6b7390' : '#2f3647';
    ctx.beginPath();
    if (i === step) ctx.roundRect(x - 14, 98, 28, 10, 5);
    else ctx.arc(x, 103, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const drawArt = renderer?.drawRules ?? art;
  if (cur.art && drawArt) {
    try {
      drawArt(ctx, cur.art, t, ART, now);
    } catch (err) {
      console.error('rules art failed', err);
    }
  }

  // Fade the words in with the step.
  ctx.globalAlpha = Math.min(1, t * 3);
  text(ctx, cur.title, W / 2, 660, { size: 58, weight: 900, color: '#f2f4f8' });
  ctx.font = '500 32px system-ui, -apple-system, sans-serif';
  wrap(ctx, cur.text, 1200).forEach((line, i) => text(ctx, line, W / 2, 712 + i * 42, { size: 32, weight: 500, color: '#d5d9e4' }));
  ctx.globalAlpha = 1;

  // This step's time.
  const bw = 420;
  ctx.fillStyle = '#232a3b';
  ctx.fillRect(W / 2 - bw / 2, 790, bw, 6);
  ctx.fillStyle = '#ffc93c';
  ctx.fillRect(W / 2 - bw / 2, 790, bw * Math.max(0, Math.min(1, frac)), 6);

  const who = hostName ? `${hostName} can skip on their phone` : 'The host can skip on their phone';
  text(ctx, `${who}  ·  S skip  ·  ← → step`, W / 2, 840, { size: 22, weight: 600, color: '#6b7390' });
  ctx.restore();
}

function wrap(ctx, str, maxW) {
  const lines = [];
  let line = '';
  for (const word of String(str).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}
