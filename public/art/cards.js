// Shared drawing helpers for illustrated cards and the little shows around them, in the drawn
// look Tidewake started (public/art/tidewake.js): cream-edged cards with a soft gradient body,
// outlined lettering, and confetti/sparks/smoke particles for the TV.
// Used by the card games' art modules (public/art/shed.js, public/art/fuse.js), which the TV
// renderers and the phones both load. Everything takes a canvas context and leaves it as it found it.

export const CREAM = '#f6ecd2';
export const INK = '#1a1420';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const SANS = 'system-ui, -apple-system, sans-serif';

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const lerp = (a, b, t) => a + (b - a) * t;
/** Ease out (fast, then settling). */
export const ease = (t) => 1 - (1 - clamp01(t)) ** 3;
/** Ease out with a little overshoot, for things that land or pop. */
export const easeBack = (t) => {
  const k = clamp01(t) - 1;
  return 1 + 2.7 * k ** 3 + 1.7 * k ** 2;
};
/** 0..1 over [a, b] of t. */
export const seg = (t, a, b) => clamp01((t - a) / (b - a));

/** Small deterministic random numbers, so a pattern looks the same every frame. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** Mix two #rrggbb colours (t = 0 gives a, 1 gives b). */
export function mix(a, b, t) {
  const rgb = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const pb = rgb(b);
  return `#${rgb(a).map((v, i) => Math.round(lerp(v, pb[i], t)).toString(16).padStart(2, '0')).join('')}`;
}
export const lighten = (c, t) => mix(c, '#ffffff', t);
export const darken = (c, t) => mix(c, '#000000', t);

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

/**
 * A card's body centred on (0, 0) in the current transform: a soft shadow, a cream edge and a
 * gradient face from `top` to `bottom`. Calls inside(g, iw, ih) clipped to the face (iw x ih,
 * still centred), so a card's art can't spill over the edge.
 */
export function cardBody(g, w, h, { top, bottom, edge = CREAM, shadow = true, glow = null, inside } = {}) {
  const r = w * 0.11;
  const e = Math.max(2, w * 0.055);
  if (glow) {
    g.save();
    g.shadowColor = glow;
    g.shadowBlur = w * 0.35;
    g.fillStyle = glow;
    roundRect(g, -w / 2, -h / 2, w, h, r);
    g.fill();
    g.restore();
  }
  if (shadow) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    roundRect(g, -w / 2 + w * 0.03, -h / 2 + w * 0.05, w, h, r);
    g.fill();
  }
  g.fillStyle = edge;
  roundRect(g, -w / 2, -h / 2, w, h, r);
  g.fill();
  const iw = w - e * 2;
  const ih = h - e * 2;
  const grd = g.createLinearGradient(0, -ih / 2, 0, ih / 2);
  grd.addColorStop(0, top);
  grd.addColorStop(1, bottom);
  g.save();
  roundRect(g, -iw / 2, -ih / 2, iw, ih, r - e * 0.6);
  g.fillStyle = grd;
  g.fill();
  g.clip();
  inside?.(g, iw, ih);
  // A soft sheen along the top.
  const sh = g.createLinearGradient(0, -ih / 2, 0, -ih / 2 + ih * 0.35);
  sh.addColorStop(0, 'rgba(255,255,255,.18)');
  sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(-iw / 2, -ih / 2, iw, ih * 0.35);
  g.restore();
  // Thin dark line between the edge and the face.
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = Math.max(1, w * 0.012);
  roundRect(g, -iw / 2, -ih / 2, iw, ih, r - e * 0.6);
  g.stroke();
}

/** Text with a dark outline, the way Tidewake letters its tokens and cards. */
export function outlined(g, str, x, y, { size = 24, color = '#fff', stroke = INK, weight = 900, font = SANS, align = 'center', baseline = 'middle', line } = {}) {
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  g.textAlign = align;
  g.textBaseline = baseline;
  g.lineJoin = 'round';
  g.lineWidth = line ?? Math.max(2, size * 0.16);
  g.strokeStyle = stroke;
  g.strokeText(str, x, y);
  g.fillStyle = color;
  g.fillText(str, x, y);
  g.restore();
}

/** A five-point star. */
export function star(g, x, y, r, fill, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

/** A ribbon banner with folded tails, centred on (x, y): for big announcements on the TV. */
export function ribbon(g, x, y, w, h, color) {
  g.save();
  g.translate(x, y);
  const tail = h * 0.7;
  g.fillStyle = darken(color, 0.4);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(s * (w / 2 - tail * 0.4), -h * 0.2);
    g.lineTo(s * (w / 2 + tail), -h * 0.2);
    g.lineTo(s * (w / 2 + tail * 0.6), h * 0.3);
    g.lineTo(s * (w / 2 + tail), h * 0.8);
    g.lineTo(s * (w / 2 - tail * 0.4), h * 0.8);
    g.closePath();
    g.fill();
  }
  const grd = g.createLinearGradient(0, -h / 2, 0, h / 2);
  grd.addColorStop(0, lighten(color, 0.15));
  grd.addColorStop(1, darken(color, 0.15));
  g.fillStyle = grd;
  roundRect(g, -w / 2, -h / 2, w, h, h * 0.18);
  g.fill();
  g.strokeStyle = CREAM;
  g.lineWidth = Math.max(2, h * 0.06);
  g.stroke();
  g.restore();
}

// ---- Particles (TV) -----------------------------------------------------------------------------
// One pool per renderer: const fx = particles(); fx.burst(...); fx.draw(ctx, dt) every frame.

export function particles(max = 900) {
  let list = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  return {
    /**
     * n particles from (x, y). kind: 'dot' | 'confetti' | 'smoke' | 'spark' | 'drop'.
     * speed, life, size are [min, max]; angle/spread aim them (default all around).
     */
    burst(x, y, n, { colors = ['#fff'], kind = 'dot', speed = [100, 500], life = [0.5, 1.2], size = [3, 8], gravity = 300, drag = 0.9, angle = 0, spread = Math.PI * 2, delay = 0 } = {}) {
      for (let i = 0; i < n; i++) {
        const a = angle + (Math.random() - 0.5) * spread;
        const v = rnd(...speed);
        list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: -delay, life: rnd(...life), size: rnd(...size), color: colors[i % colors.length], gravity, drag, kind, spin: rnd(-12, 12) });
      }
      if (list.length > max) list.splice(0, list.length - max);
    },
    clear() {
      list = [];
    },
    get count() {
      return list.length;
    },
    draw(g, dt) {
      list = list.filter((p) => (p.t += dt) < p.life);
      for (const p of list) {
        if (p.t < 0) continue;
        p.vx *= p.drag ** (dt * 60);
        p.vy = p.vy * p.drag ** (dt * 60) + p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const k = 1 - p.t / p.life;
        g.save();
        if (p.kind === 'smoke') {
          g.globalAlpha = k * 0.45;
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, p.y, p.size * (1.7 - k * 0.7), 0, Math.PI * 2);
          g.fill();
        } else if (p.kind === 'confetti') {
          g.globalAlpha = Math.min(1, k * 2);
          g.translate(p.x, p.y);
          g.rotate(p.t * p.spin);
          g.scale(1, Math.cos(p.t * p.spin * 0.7));
          g.fillStyle = p.color;
          g.fillRect(-p.size, -p.size / 2, p.size * 2, p.size);
        } else if (p.kind === 'spark') {
          g.globalAlpha = k;
          g.strokeStyle = p.color;
          g.lineWidth = p.size * 0.5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(p.x, p.y);
          g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          g.stroke();
        } else if (p.kind === 'drop') {
          g.globalAlpha = Math.min(1, k * 1.5);
          g.translate(p.x, p.y);
          g.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2);
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(0, 0, p.size * 0.6, 0, Math.PI);
          g.lineTo(0, -p.size * 1.4);
          g.closePath();
          g.fill();
        } else {
          g.globalAlpha = k;
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
    },
  };
}
