// Small helpers shared by TV renderers.

/** Blend x/y of entities (matched by id) between two snapshots. */
export function lerpById(prevList = [], curList = [], alpha) {
  const prev = new Map(prevList.map((e) => [e.id, e]));
  return curList.map((e) => {
    const p = prev.get(e.id);
    return p ? { ...e, x: p.x + (e.x - p.x) * alpha, y: p.y + (e.y - p.y) * alpha } : e;
  });
}

export function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

export function text(ctx, str, x, y, { size = 26, weight = 600, color = '#f2f4f8', align = 'center', baseline = 'alphabetic' } = {}) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(str, x, y);
}
