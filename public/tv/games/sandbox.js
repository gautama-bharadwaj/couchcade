import { lerpById, circle, text } from './util.js';

export default {
  draw(ctx, { prev, cur, alpha, arena }) {
    ctx.fillStyle = '#141824';
    ctx.fillRect(0, 0, arena.w, arena.h);
    ctx.strokeStyle = '#1e2433';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 100; x < arena.w; x += 100) (ctx.moveTo(x, 0), ctx.lineTo(x, arena.h));
    for (let y = 100; y < arena.h; y += 100) (ctx.moveTo(0, y), ctx.lineTo(arena.w, y));
    ctx.stroke();

    for (const p of lerpById(prev.players, cur.players, alpha)) {
      ctx.globalAlpha = p.connected ? 1 : 0.35;
      if (p.boosting) circle(ctx, p.x, p.y, p.r + 10, p.color + '55');
      circle(ctx, p.x, p.y, p.r, p.color);
      text(ctx, p.name, p.x, p.y - p.r - 12);
      ctx.globalAlpha = 1;
    }
    text(ctx, 'Sandbox · host ends it from their phone (or Esc)', 80, 860, { size: 22, weight: 400, color: '#6c7590', align: 'left' });
  },
};
