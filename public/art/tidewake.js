// Tidewake art, drawn in code on a 2D canvas: resource icons, island tiles, pieces, harbor boats,
// crew crests and dice. Shared by the TV renderer (public/tv/games/tidewake.js) and the phones
// (the controller loads it for `art` fields; see "Drawn art" in server/games/index.js).
// Everything takes a canvas context and a centre + size, and leaves the context as it found it.

const lerp = (a, b, t) => a + (b - a) * t;

/** Small deterministic random numbers, so a tile looks the same every frame. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

export function hexPath(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = ((-90 + 60 * i) * Math.PI) / 180;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

// ---- Resource icons --------------------------------------------------------------------------

/** One resource icon centred on (x, y), about s across. kind: wood | coco | fish | shell | stone. */
export function drawIcon(g, kind, x, y, s) {
  g.save();
  g.translate(x, y);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (kind === 'wood') {
    g.rotate(-0.35);
    const w = s * 1.25;
    const h = s * 0.52;
    const grd = g.createLinearGradient(0, -h / 2, 0, h / 2);
    grd.addColorStop(0, '#c98b4f');
    grd.addColorStop(1, '#7a4a22');
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, h / 2);
    g.fill();
    g.strokeStyle = '#4a2a10';
    g.lineWidth = Math.max(1, s * 0.06);
    g.stroke();
    g.fillStyle = '#e8c08a';
    g.beginPath();
    g.ellipse(w / 2 - h * 0.18, 0, h * 0.28, h / 2 - 1, 0, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.strokeStyle = '#a8763e';
    g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath();
    g.ellipse(w / 2 - h * 0.18, 0, h * 0.13, h * 0.24, 0, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(60,30,10,.5)';
    for (const dx of [-0.3, 0, 0.22]) {
      g.beginPath();
      g.moveTo(dx * w - h * 0.3, -h * 0.2);
      g.lineTo(dx * w + h * 0.2, -h * 0.2);
      g.stroke();
    }
  } else if (kind === 'coco') {
    const grd = g.createRadialGradient(-s * 0.2, -s * 0.25, s * 0.05, 0, 0, s * 0.55);
    grd.addColorStop(0, '#a0673a');
    grd.addColorStop(1, '#4a2a14');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, s * 0.04, s * 0.46, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#2a160a';
    g.lineWidth = Math.max(1, s * 0.06);
    g.stroke();
    g.fillStyle = '#2a160a';
    for (const [dx, dy] of [[-0.13, -0.14], [0.13, -0.14], [0, 0.06]]) {
      g.beginPath();
      g.arc(dx * s, dy * s, s * 0.065, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#5fbf4a';
    g.beginPath();
    g.ellipse(s * 0.3, -s * 0.4, s * 0.26, s * 0.09, -0.6, 0, Math.PI * 2);
    g.fill();
  } else if (kind === 'fish') {
    const grd = g.createLinearGradient(0, -s * 0.35, 0, s * 0.35);
    grd.addColorStop(0, '#5ec8ff');
    grd.addColorStop(1, '#1f6fb0');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(-s * 0.6, 0);
    g.quadraticCurveTo(-s * 0.1, -s * 0.48, s * 0.38, -s * 0.04);
    g.lineTo(s * 0.66, -s * 0.32);
    g.lineTo(s * 0.58, 0);
    g.lineTo(s * 0.66, s * 0.32);
    g.lineTo(s * 0.38, s * 0.04);
    g.quadraticCurveTo(-s * 0.1, s * 0.48, -s * 0.6, 0);
    g.fill();
    g.strokeStyle = '#0e3b66';
    g.lineWidth = Math.max(1, s * 0.06);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(-s * 0.33, -s * 0.07, s * 0.09, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0e3b66';
    g.beginPath();
    g.arc(-s * 0.31, -s * 0.07, s * 0.045, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.45)';
    g.lineWidth = Math.max(1, s * 0.04);
    for (const dx of [-0.08, 0.05, 0.18]) {
      g.beginPath();
      g.arc(dx * s, 0, s * 0.17, -0.9, 0.9);
      g.stroke();
    }
  } else if (kind === 'shell') {
    const grd = g.createRadialGradient(0, s * 0.35, s * 0.05, 0, 0, s * 0.7);
    grd.addColorStop(0, '#fff3ea');
    grd.addColorStop(1, '#ff9fbf');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, s * 0.42);
    const r = s * 0.52;
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      g.quadraticCurveTo(Math.cos(a - 0.26) * r * 1.08, Math.sin(a - 0.26) * r * 1.03 + s * 0.04, Math.cos(a) * r, Math.sin(a) * r * 0.95 + s * 0.04);
    }
    g.closePath();
    g.fill();
    g.strokeStyle = '#b8557a';
    g.lineWidth = Math.max(1, s * 0.06);
    g.stroke();
    g.lineWidth = Math.max(1, s * 0.035);
    for (let i = 1; i < 6; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      g.beginPath();
      g.moveTo(0, s * 0.38);
      g.lineTo(Math.cos(a) * s * 0.46, Math.sin(a) * s * 0.44 + s * 0.04);
      g.stroke();
    }
    g.fillStyle = '#f4b8cc';
    g.beginPath();
    g.roundRect(-s * 0.15, s * 0.33, s * 0.3, s * 0.13, 2);
    g.fill();
    g.stroke();
  } else if (kind === 'stone') {
    const pts = [[-0.5, 0.2], [-0.36, -0.25], [-0.04, -0.46], [0.38, -0.3], [0.52, 0.12], [0.25, 0.4], [-0.2, 0.42]];
    const grd = g.createLinearGradient(-s * 0.4, -s * 0.4, s * 0.4, s * 0.4);
    grd.addColorStop(0, '#c3cad8');
    grd.addColorStop(1, '#4b5262');
    g.fillStyle = grd;
    g.beginPath();
    pts.forEach(([a, b], i) => (i ? g.lineTo(a * s, b * s) : g.moveTo(a * s, b * s)));
    g.closePath();
    g.fill();
    g.strokeStyle = '#262a33';
    g.lineWidth = Math.max(1, s * 0.06);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath();
    g.moveTo(-0.36 * s, -0.25 * s);
    g.lineTo(-0.04 * s, -0.04 * s);
    g.lineTo(0.38 * s, -0.3 * s);
    g.moveTo(-0.04 * s, -0.04 * s);
    g.lineTo(0.04 * s, 0.38 * s);
    g.stroke();
    g.fillStyle = 'rgba(120,220,255,.85)';
    g.beginPath();
    g.moveTo(0.17 * s, 0.04 * s);
    g.lineTo(0.25 * s, -0.08 * s);
    g.lineTo(0.32 * s, 0.07 * s);
    g.closePath();
    g.fill();
  }
  g.restore();
}

// Card colours for each resource (phone hand cards, TV tokens).
export const CARD = {
  wood: ['#d9a66a', '#8a5a2c'],
  coco: ['#7fcf5a', '#2f7a34'],
  fish: ['#6fd4ff', '#1f6fb0'],
  shell: ['#ffd0de', '#d07090'],
  stone: ['#b8c0cf', '#4b5262'],
};

/** A resource as a little playing card (phone hand). w x h, centred. */
export function drawCard(g, kind, x, y, w, h, count) {
  g.save();
  g.translate(x, y);
  const [a, b] = CARD[kind] ?? ['#888', '#444'];
  const cg = g.createLinearGradient(0, -h / 2, 0, h / 2);
  cg.addColorStop(0, a);
  cg.addColorStop(1, b);
  g.fillStyle = cg;
  g.strokeStyle = '#f6ecd2';
  g.lineWidth = Math.max(2, w * 0.05);
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, w * 0.16);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.beginPath();
  g.arc(0, -h * 0.1, w * 0.34, 0, Math.PI * 2);
  g.fill();
  drawIcon(g, kind, 0, -h * 0.1, w * 0.5);
  if (count != null) {
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,.45)';
    g.lineWidth = 3;
    g.font = `900 ${Math.round(w * 0.32)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.strokeText(`×${count}`, 0, h * 0.33);
    g.fillText(`×${count}`, 0, h * 0.33);
  }
  g.restore();
}

// ---- Tiles -------------------------------------------------------------------------------------

const BASE = {
  wood: ['#f0d9a0', '#cfa865'],
  coco: ['#6fcf5c', '#2f8a3e'],
  fish: ['#4fd0e8', '#167aa8'],
  shell: ['#f8dcc8', '#e2a88c'],
  stone: ['#7d8596', '#3e4452'],
};

/**
 * The still part of a tile (kind = a resource, or null for the volcano) in a hex of radius r.
 * Things that move (ripples, the jumping fish, sparkles, lava glow, smoke) are in drawTileLife.
 */
export function drawTile(g, kind, x, y, r, seed = 1) {
  const R = rng(seed * 97 + 13);
  g.save();
  hexPath(g, x, y, r);
  g.clip();
  if (!kind) {
    drawVolcano(g, x, y, r, 0);
    g.restore();
    return;
  }
  const [a, b] = BASE[kind] ?? ['#888', '#555'];
  const grd = g.createLinearGradient(x, y - r, x, y + r);
  grd.addColorStop(0, a);
  grd.addColorStop(1, b);
  g.fillStyle = grd;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.05})`;
    g.beginPath();
    g.arc(x + (R() - 0.5) * 2 * r, y + (R() - 0.5) * 2 * r, Math.max(0.6, (1 + R() * 2.5) * (r / 80)), 0, Math.PI * 2);
    g.fill();
  }
  if (kind === 'wood') {
    g.fillStyle = 'rgba(80,170,200,.45)';
    g.beginPath();
    g.ellipse(x - r * 0.2, y - r * 0.95, r * 1.2, r * 0.38, 0.15, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = Math.max(1, r * 0.035);
    g.beginPath();
    g.ellipse(x - r * 0.2, y - r * 0.95, r * 1.2, r * 0.42, 0.15, 0.2, Math.PI - 0.2);
    g.stroke();
    for (const [dx, dy, s] of [[-0.38, 0.0, 0.4], [0.32, -0.08, 0.34], [-0.02, -0.36, 0.28]]) drawIcon(g, 'wood', x + dx * r, y + dy * r, s * r);
  } else if (kind === 'coco') {
    for (const [dx, dy, s] of [[-0.42, 0.0, 1], [0.38, -0.1, 0.9], [-0.02, -0.4, 0.8]]) drawPalm(g, x + dx * r, y + dy * r, r * 0.42 * s, 0);
  } else if (kind === 'fish') {
    g.fillStyle = '#3aa45a';
    g.beginPath();
    g.arc(x + r * 0.5, y - r * 0.4, r * 0.1, 0.4, Math.PI * 2 - 0.2);
    g.lineTo(x + r * 0.5, y - r * 0.4);
    g.fill();
    g.beginPath();
    g.arc(x - r * 0.55, y + r * 0.05, r * 0.07, 1.2, Math.PI * 2 + 0.8);
    g.lineTo(x - r * 0.55, y + r * 0.05);
    g.fill();
  } else if (kind === 'shell') {
    for (const [dx, dy, w, h] of [[-0.35, -0.3, 0.32, 0.18], [0.35, -0.2, 0.26, 0.16], [0.05, -0.55, 0.22, 0.12]]) {
      const pg = g.createRadialGradient(x + dx * r, y + dy * r, 1, x + dx * r, y + dy * r, w * r);
      pg.addColorStop(0, '#9fe8ff');
      pg.addColorStop(1, '#3a9cc8');
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(x + dx * r, y + dy * r, w * r, h * r, 0.2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.6)';
      g.lineWidth = Math.max(1, r * 0.025);
      g.stroke();
    }
    drawIcon(g, 'shell', x - r * 0.5, y + r * 0.05, r * 0.28);
    drawIcon(g, 'shell', x + r * 0.45, y + r * 0.12, r * 0.24);
    drawStar(g, x + r * 0.05, y - r * 0.02, r * 0.14, '#ff8a3c');
  } else if (kind === 'stone') {
    const cols = [[-0.45, -0.25, 1.2], [-0.15, -0.42, 1.6], [0.18, -0.3, 1.3], [0.45, -0.15, 0.9], [-0.3, 0.08, 0.7], [0.3, 0.1, 0.8]];
    for (const [dx, dy, hgt] of cols) {
      const cx = x + dx * r;
      const cy = y + dy * r;
      const w = r * 0.16;
      g.fillStyle = '#353b48';
      g.fillRect(cx - w, cy, w * 2, hgt * r * 0.25);
      g.fillStyle = '#2a2f3a';
      g.fillRect(cx, cy, w, hgt * r * 0.25);
      hexPath(g, cx, cy, w * 1.12);
      g.fillStyle = '#9aa3b5';
      g.fill();
      g.strokeStyle = '#262a33';
      g.lineWidth = Math.max(1, r * 0.018);
      g.stroke();
    }
  }
  g.restore();
}

/** The moving bits of a tile, drawn every frame on top of drawTile. t = seconds. */
export function drawTileLife(g, kind, x, y, r, t, seed = 1) {
  const ph0 = (seed * 0.37) % 1;
  g.save();
  hexPath(g, x, y, r);
  g.clip();
  if (!kind) drawVolcano(g, x, y, r, t, true);
  else if (kind === 'wood') {
    g.strokeStyle = 'rgba(255,255,255,.7)';
    g.lineWidth = Math.max(1, r * 0.03);
    g.beginPath();
    g.ellipse(x - r * 0.2, y - r * 0.95, r * 1.2, r * (0.47 + 0.04 * Math.sin(t * 1.4 + seed)), 0.15, 0.3, Math.PI - 0.3);
    g.stroke();
  } else if (kind === 'fish') {
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = Math.max(1, r * 0.025);
    for (let i = 0; i < 3; i++) {
      const ph = (t / 2.4 + i / 3 + ph0) % 1;
      g.globalAlpha = 1 - ph;
      g.beginPath();
      g.ellipse(x + (i - 1) * r * 0.3, y - r * 0.32 + (i % 2) * r * 0.12, r * (0.1 + ph * 0.35), r * (0.04 + ph * 0.14), 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
    // A fish jumps now and then.
    const jp = (t / 4 + ph0) % 1;
    if (jp < 0.45) {
      const q = jp / 0.45;
      const fx = x + lerp(-r * 0.45, r * 0.1, q);
      const fy = y - r * 0.05 - Math.sin(q * Math.PI) * r * 0.45;
      g.save();
      g.translate(fx, fy);
      g.rotate(lerp(-0.8, 0.8, q));
      drawIcon(g, 'fish', 0, 0, r * 0.34);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(x - r * 0.45 + i * r * 0.07, y - r * 0.05 - i * r * 0.04 - q * r * 0.1, Math.max(1, r * 0.025), 0, Math.PI * 2);
        g.fill();
      }
    } else {
      g.save();
      g.globalAlpha = 0.55;
      drawIcon(g, 'fish', x + r * 0.1 + Math.sin(t + seed) * r * 0.15, y - r * 0.32, r * 0.26);
      g.restore();
    }
  } else if (kind === 'shell') {
    const sp = (Math.sin(t * 3.3 + seed) + 1) / 2;
    sparkle(g, x - r * 0.35, y - r * 0.34, r * 0.09 * (0.5 + sp), sp);
    sparkle(g, x + r * 0.3, y - r * 0.22, r * 0.07 * (1.5 - sp), 1 - sp);
  } else if (kind === 'coco') {
    // A coconut drops now and then.
    const dp = (t / 5 + ph0) % 1;
    if (dp < 0.12) {
      const q = dp / 0.12;
      g.fillStyle = '#5a3416';
      g.beginPath();
      g.arc(x + r * 0.4, y - r * 0.25 + q * q * r * 0.35, r * 0.05, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

function sparkle(g, x, y, s, a) {
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.moveTo(x, y - s);
  g.lineTo(x + s * 0.25, y - s * 0.25);
  g.lineTo(x + s, y);
  g.lineTo(x + s * 0.25, y + s * 0.25);
  g.lineTo(x, y + s);
  g.lineTo(x - s * 0.25, y + s * 0.25);
  g.lineTo(x - s, y);
  g.lineTo(x - s * 0.25, y - s * 0.25);
  g.closePath();
  g.fill();
}

export function drawPalm(g, x, y, s, sway = 0) {
  g.save();
  g.strokeStyle = '#7a4a22';
  g.lineWidth = s * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y + s * 0.9);
  g.quadraticCurveTo(x + s * 0.25, y + s * 0.3, x + s * 0.1 + sway * s, y - s * 0.2);
  g.stroke();
  g.strokeStyle = '#5a3416';
  g.lineWidth = s * 0.05;
  for (let i = 0; i < 4; i++) {
    const q = i / 4;
    g.beginPath();
    g.moveTo(x + s * (0.05 + 0.12 * q) - s * 0.07, y + s * (0.8 - q * 0.9));
    g.lineTo(x + s * (0.05 + 0.12 * q) + s * 0.07, y + s * (0.78 - q * 0.9));
    g.stroke();
  }
  const tx = x + s * 0.1 + sway * s;
  const ty = y - s * 0.2;
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.6 + sway;
    g.fillStyle = i % 2 ? '#3f9a3a' : '#5cc24e';
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a - 0.4) * s * 0.7, ty + Math.sin(a - 0.4) * s * 0.7 - s * 0.1, tx + Math.cos(a) * s * 0.95, ty + Math.sin(a) * s * 0.75 + s * 0.25);
    g.quadraticCurveTo(tx + Math.cos(a + 0.3) * s * 0.5, ty + Math.sin(a + 0.3) * s * 0.5, tx, ty);
    g.fill();
  }
  g.fillStyle = '#5a3416';
  for (const dx of [-0.08, 0.06]) {
    g.beginPath();
    g.arc(tx + dx * s, ty + s * 0.08, s * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function drawStar(g, x, y, r, c) {
  g.fillStyle = c;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    i ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = '#b85a1c';
  g.lineWidth = Math.max(1, r * 0.1);
  g.stroke();
}

/** The volcano: the cone (still) or, with life = true, just the glowing lava on top. heat 0..1 brightens it. */
export function drawVolcano(g, x, y, r, t, life = false, heat = 0) {
  if (!life) {
    const grd = g.createRadialGradient(x, y, 4, x, y, r);
    grd.addColorStop(0, '#5a2c22');
    grd.addColorStop(1, '#241513');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    const cg = g.createLinearGradient(x - r * 0.7, 0, x + r * 0.7, 0);
    cg.addColorStop(0, '#6b4033');
    cg.addColorStop(0.5, '#8a5644');
    cg.addColorStop(1, '#4a2a22');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(x - r * 0.78, y + r * 0.55);
    g.lineTo(x - r * 0.2, y - r * 0.28);
    g.lineTo(x + r * 0.2, y - r * 0.28);
    g.lineTo(x + r * 0.78, y + r * 0.55);
    g.closePath();
    g.fill();
    return;
  }
  const glow = Math.min(1, 0.6 + 0.4 * Math.sin(t * 2.5) + heat);
  g.strokeStyle = `rgba(255,${Math.round(110 + 60 * glow)},40,${0.7 + 0.3 * glow})`;
  g.lineWidth = Math.max(1.5, r * 0.05);
  g.lineCap = 'round';
  for (const [sx, ex, ey] of [[-0.1, -0.35, 0.5], [0.05, 0.22, 0.45], [0.12, 0.5, 0.52]]) {
    g.beginPath();
    g.moveTo(x + sx * r, y - r * 0.26);
    g.quadraticCurveTo(x + (sx + ex) * 0.5 * r + r * 0.07, y + r * 0.1, x + ex * r, y + ey * r);
    g.stroke();
  }
  const cr = g.createRadialGradient(x, y - r * 0.28, 1, x, y - r * 0.28, r * (0.35 + heat * 0.3));
  cr.addColorStop(0, `rgba(255,220,120,${glow})`);
  cr.addColorStop(1, 'rgba(255,80,20,0)');
  g.fillStyle = cr;
  g.beginPath();
  g.arc(x, y - r * 0.28, r * (0.35 + heat * 0.3), 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#ff7a2c';
  g.beginPath();
  g.ellipse(x, y - r * 0.28, r * 0.2, r * 0.06, 0, 0, Math.PI * 2);
  g.fill();
}

/** Smoke rising from the volcano's crater. heat 0..1 makes it thicker. */
export function drawSmoke(g, x, y, r, t, heat = 0) {
  const n = 7 + Math.round(heat * 6);
  for (let i = 0; i < n; i++) {
    const ph = (t / 3 + i / n) % 1;
    g.fillStyle = `rgba(${90 + heat * 40},90,100,${(0.5 + heat * 0.3) * (1 - ph)})`;
    g.beginPath();
    g.arc(x + Math.sin(ph * 4 + i) * r * 0.15 + ph * r * 0.4, y - r * 0.35 - ph * r * 1.3, r * (0.12 + ph * (0.3 + heat * 0.2)), 0, Math.PI * 2);
    g.fill();
  }
}

/** The Ash Cloud over a tile. */
export function drawAsh(g, x, y, r, t) {
  const bob = Math.sin(t * 1.6) * r * 0.04;
  g.save();
  hexPath(g, x, y, r * 0.96);
  g.fillStyle = 'rgba(25,25,32,0.5)';
  g.fill();
  for (const [dx, dy, rr, c] of [[-0.32, 0.02, 0.32, '#6d6d78'], [0.05, -0.18, 0.38, '#7d7d88'], [0.36, 0.0, 0.3, '#6d6d78'], [0, 0.14, 0.32, '#5d5d68'], [-0.12, -0.05, 0.26, '#8a8a94']]) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(x + dx * r + Math.sin(t + dx * 5) * r * 0.03, y + dy * r + bob, rr * r, 0, Math.PI * 2);
    g.fill();
  }
  // falling ash specks
  g.fillStyle = 'rgba(60,60,70,.8)';
  for (let i = 0; i < 6; i++) {
    const ph = (t * 0.5 + i / 6) % 1;
    g.beginPath();
    g.arc(x + (i - 2.5) * r * 0.15, y + r * 0.25 + ph * r * 0.45, Math.max(1, r * 0.025), 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

// ---- Pieces --------------------------------------------------------------------------------

/** A thatched hut in a crew colour, standing on (x, y). */
export function drawHut(g, x, y, s, c) {
  g.save();
  g.translate(x, y);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.ellipse(0, s * 0.55, s * 0.7, s * 0.18, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c;
  g.strokeStyle = '#1a1208';
  g.lineWidth = Math.max(1.5, s * 0.08);
  g.beginPath();
  g.rect(-s * 0.5, -s * 0.05, s, s * 0.58);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2410';
  g.fillRect(-s * 0.12, s * 0.15, s * 0.24, s * 0.38);
  const rg = g.createLinearGradient(0, -s * 0.75, 0, 0);
  rg.addColorStop(0, '#f2d27a');
  rg.addColorStop(1, '#b8892f');
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(-s * 0.72, s * 0.05);
  g.lineTo(0, -s * 0.75);
  g.lineTo(s * 0.72, s * 0.05);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = 'rgba(110,70,20,.7)';
  g.lineWidth = Math.max(1, s * 0.05);
  for (let i = -3; i <= 3; i++) {
    g.beginPath();
    g.moveTo(i * s * 0.18, s * 0.03);
    g.lineTo(i * s * 0.08, -s * 0.5);
    g.stroke();
  }
  g.restore();
}

/** A lighthouse in a crew colour; lit = 0..1 turns on the lamp and its sweeping beam. */
export function drawLighthouse(g, x, y, s, c, t = 0, lit = 0) {
  g.save();
  g.translate(x, y);
  if (lit > 0) {
    const a = t * 0.9 + x * 0.01;
    const beam = g.createRadialGradient(0, -s * 1.05, 2, 0, -s * 1.05, s * 9);
    beam.addColorStop(0, `rgba(255,240,170,${0.6 * lit})`);
    beam.addColorStop(1, 'rgba(255,240,170,0)');
    g.fillStyle = beam;
    g.beginPath();
    g.moveTo(0, -s * 1.05);
    g.arc(0, -s * 1.05, s * 9, a - 0.24, a + 0.24);
    g.closePath();
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.ellipse(0, s * 0.6, s * 0.55, s * 0.16, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a1208';
  g.lineWidth = Math.max(1.5, s * 0.08);
  const body = () => {
    g.beginPath();
    g.moveTo(-s * 0.42, s * 0.6);
    g.lineTo(s * 0.42, s * 0.6);
    g.lineTo(s * 0.26, -s * 0.8);
    g.lineTo(-s * 0.26, -s * 0.8);
    g.closePath();
  };
  body();
  g.fillStyle = '#f4f1ea';
  g.fill();
  g.save();
  g.clip();
  g.fillStyle = c;
  for (const yy of [0.2, -0.4]) g.fillRect(-s, yy * s, s * 2, s * 0.22);
  g.restore();
  body();
  g.stroke();
  g.fillStyle = '#2a2f3a';
  g.fillRect(-s * 0.34, -s * 0.86, s * 0.68, s * 0.1);
  g.fillStyle = lit > 0 ? '#fff6b0' : '#ffe680';
  g.beginPath();
  g.rect(-s * 0.18, -s * 1.22, s * 0.36, s * 0.36);
  g.fill();
  g.stroke();
  if (lit > 0) {
    const lg = g.createRadialGradient(0, -s * 1.05, 1, 0, -s * 1.05, s * 0.7);
    lg.addColorStop(0, `rgba(255,250,210,${lit})`);
    lg.addColorStop(1, 'rgba(255,220,90,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.arc(0, -s * 1.05, s * 0.7, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = c;
  g.beginPath();
  g.moveTo(-s * 0.26, -s * 1.22);
  g.lineTo(0, -s * 1.45);
  g.lineTo(s * 0.26, -s * 1.22);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

/** A plank path with rope rails in a crew colour, along a hex edge. k = hex radius in pixels. */
export function drawTrail(g, x1, y1, x2, y2, c, k) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const a = 0.16;
  const b = 0.84;
  const ax = lerp(x1, x2, a);
  const ay = lerp(y1, y2, a);
  const bx = lerp(x1, x2, b);
  const by = lerp(y1, y2, b);
  g.save();
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = k * 0.34;
  g.beginPath();
  g.moveTo(ax + k * 0.02, ay + k * 0.03);
  g.lineTo(bx + k * 0.02, by + k * 0.03);
  g.stroke();
  const n = 7;
  for (let i = 0; i < n; i++) {
    const q = lerp(a, b, (i + 0.5) / n);
    const px = lerp(x1, x2, q);
    const py = lerp(y1, y2, q);
    g.strokeStyle = i % 2 ? '#b0773f' : '#c88a4c';
    g.lineWidth = k * 0.07;
    g.beginPath();
    g.moveTo(px + nx * k * 0.15, py + ny * k * 0.15);
    g.lineTo(px - nx * k * 0.15, py - ny * k * 0.15);
    g.stroke();
  }
  for (const side of [1, -1]) {
    g.strokeStyle = c;
    g.lineWidth = Math.max(1.5, k * 0.05);
    g.beginPath();
    g.moveTo(ax + nx * k * 0.16 * side, ay + ny * k * 0.16 * side);
    g.lineTo(bx + nx * k * 0.16 * side, by + ny * k * 0.16 * side);
    g.stroke();
  }
  g.restore();
}

/**
 * A little sailboat at a harbor with a sign under it: '3:1', or '2:1' plus a resource icon.
 * `sign` scales the sign alone (the TV makes it bigger so it reads from the couch).
 */
export function drawBoat(g, x, y, s, kind, t = 0, sign = 1) {
  const bob = Math.sin(t * 2 + x) * s * 0.06;
  g.save();
  g.translate(x, y + bob);
  g.rotate(Math.sin(t * 1.4 + y) * 0.05);
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.beginPath();
  g.ellipse(0, s * 0.35, s * 0.75, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a4a22';
  g.strokeStyle = '#2a160a';
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.moveTo(-s * 0.65, s * 0.05);
  g.lineTo(s * 0.65, s * 0.05);
  g.lineTo(s * 0.42, s * 0.33);
  g.lineTo(-s * 0.42, s * 0.33);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(0, s * 0.05);
  g.lineTo(0, -s * 0.85);
  g.stroke();
  g.fillStyle = '#f6f1e6';
  g.beginPath();
  g.moveTo(s * 0.04, -s * 0.82);
  g.quadraticCurveTo(s * 0.75, -s * 0.4, s * 0.05, -s * 0.02);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  if (kind == null) return; // just the boat
  const text = kind === 'any' ? '3:1' : '2:1';
  g.save();
  y += s * 0.5 * (1 - sign); // keep the sign's top just under the hull
  s *= sign;
  g.font = `900 ${Math.round(s * 0.38)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const w = g.measureText(text).width + (kind !== 'any' ? s * 0.6 : 0) + s * 0.4;
  g.fillStyle = 'rgba(10,14,22,.88)';
  g.beginPath();
  g.roundRect(x - w / 2, y + s * 0.5 + bob, w, s * 0.55, s * 0.18);
  g.fill();
  g.fillStyle = '#f6ecd2';
  if (kind !== 'any') {
    drawIcon(g, kind, x - w / 2 + s * 0.42, y + s * 0.78 + bob, s * 0.42);
    g.fillText(text, x + s * 0.22, y + s * 0.8 + bob);
  } else g.fillText(text, x, y + s * 0.8 + bob);
  g.restore();
}

// ---- Crews -------------------------------------------------------------------------------------

export const CRESTS = ['anchor', 'wave', 'star', 'palm', 'sun', 'shell'];

/** A small shield in a crew colour with a white emblem. */
export function drawCrest(g, x, y, s, c, kind) {
  g.save();
  g.translate(x, y);
  g.fillStyle = c;
  g.strokeStyle = '#0d0f14';
  g.lineWidth = Math.max(1.5, s * 0.12);
  g.beginPath();
  g.moveTo(-s, -s);
  g.lineTo(s, -s);
  g.lineTo(s, s * 0.4);
  g.quadraticCurveTo(s, s * 0.9, 0, s * 1.2);
  g.quadraticCurveTo(-s, s * 0.9, -s, s * 0.4);
  g.closePath();
  g.fill();
  g.stroke();
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineWidth = s * 0.16;
  g.lineCap = 'round';
  g.beginPath();
  if (kind === 'anchor') {
    g.moveTo(0, -s * 0.6);
    g.lineTo(0, s * 0.6);
    g.moveTo(-s * 0.35, -s * 0.25);
    g.lineTo(s * 0.35, -s * 0.25);
    g.moveTo(-s * 0.5, s * 0.25);
    g.quadraticCurveTo(0, s * 0.9, s * 0.5, s * 0.25);
    g.stroke();
  } else if (kind === 'wave') {
    for (let i = 0; i < 3; i++) {
      const yy = -s * 0.35 + i * s * 0.35;
      g.moveTo(-s * 0.6, yy);
      g.quadraticCurveTo(-s * 0.3, yy - s * 0.25, 0, yy);
      g.quadraticCurveTo(s * 0.3, yy + s * 0.25, s * 0.6, yy);
    }
    g.stroke();
  } else if (kind === 'star') {
    g.restore();
    g.save();
    g.translate(x, y);
    drawStar(g, 0, 0, s * 0.6, '#fff');
  } else if (kind === 'palm') {
    g.moveTo(0, s * 0.7);
    g.lineTo(0, -s * 0.2);
    for (const a of [-2.6, -2, -1.1, -0.5]) {
      g.moveTo(0, -s * 0.2);
      g.quadraticCurveTo(Math.cos(a) * s * 0.4, -s * 0.2 + Math.sin(a) * s * 0.5, Math.cos(a) * s * 0.65, -s * 0.05 + Math.sin(a) * s * 0.3);
    }
    g.stroke();
  } else if (kind === 'sun') {
    g.arc(0, 0, s * 0.28, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.moveTo(Math.cos(a) * s * 0.42, Math.sin(a) * s * 0.42);
      g.lineTo(Math.cos(a) * s * 0.62, Math.sin(a) * s * 0.62);
    }
    g.stroke();
  } else if (kind === 'shell') {
    g.restore();
    g.save();
    g.translate(x, y);
    g.beginPath();
    g.moveTo(0, s * 0.5);
    for (let i = 0; i <= 4; i++) {
      const a = Math.PI + (i / 4) * Math.PI;
      g.lineTo(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.5 + s * 0.05);
    }
    g.closePath();
    g.fillStyle = '#fff';
    g.fill();
  }
  g.restore();
}

/** A die face, centred, rotated by rot. */
export function drawDie(g, x, y, s, v, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.roundRect(-s / 2 + s * 0.08, -s / 2 + s * 0.1, s, s, s * 0.2);
  g.fill();
  const dg = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
  dg.addColorStop(0, '#fffdf6');
  dg.addColorStop(1, '#e2d8c2');
  g.fillStyle = dg;
  g.strokeStyle = '#3a2a14';
  g.lineWidth = Math.max(1.5, s * 0.04);
  g.beginPath();
  g.roundRect(-s / 2, -s / 2, s, s, s * 0.2);
  g.fill();
  g.stroke();
  const spots = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] }[v] ?? [];
  g.fillStyle = v === 1 ? '#d6302a' : '#2a1d10';
  for (const [dx, dy] of spots) {
    g.beginPath();
    g.arc(dx * s * 0.26, dy * s * 0.26, s * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A small bottle (Message in a Bottle). */
export function drawBottle(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.3);
  g.fillStyle = 'rgba(120,210,160,.85)';
  g.strokeStyle = '#1d4a33';
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.roundRect(-s * 0.22, -s * 0.2, s * 0.44, s * 0.62, s * 0.12);
  g.fill();
  g.stroke();
  g.beginPath();
  g.rect(-s * 0.1, -s * 0.45, s * 0.2, s * 0.26);
  g.fill();
  g.stroke();
  g.fillStyle = '#a0673a';
  g.fillRect(-s * 0.1, -s * 0.55, s * 0.2, s * 0.12);
  g.fillStyle = '#f6ecd2';
  g.beginPath();
  g.roundRect(-s * 0.13, -s * 0.05, s * 0.26, s * 0.3, 2);
  g.fill();
  g.restore();
}

// ---- For the phone's generic `art` support (see "Drawn art" in server/games/index.js) ----------

/** A named icon centred in a square of size s: a resource, or a piece in colour c. */
export function drawNamed(g, name, x, y, s, c = '#ff5a5f') {
  if (CARD[name]) return drawIcon(g, name, x, y, s * 0.92);
  if (name === 'trail') return drawTrail(g, x - s * 0.42, y + s * 0.3, x + s * 0.42, y - s * 0.3, c, s * 0.85);
  if (name === 'hut') return drawHut(g, x, y + s * 0.08, s * 0.52, c);
  if (name === 'light') return drawLighthouse(g, x, y + s * 0.12, s * 0.34, c);
  if (name === 'bottle') return drawBottle(g, x, y + s * 0.05, s * 0.8);
  if (name === 'bank') return drawBoat(g, x, y - s * 0.05, s * 0.5, null);
}

// Map hooks for the phone's hexmap (tiles carry `art`: a resource, or 'volcano').
export const mapTile = (g, kind, x, y, r, seed) => drawTile(g, kind === 'volcano' ? null : kind, x, y, r, seed);
export const mapPiece = (g, kind, x, y, k, c) => (kind === 'light' ? drawLighthouse(g, x, y - k * 0.05, k * 0.36, c) : drawHut(g, x, y, k * 0.34, c));
export const mapRoad = (g, x1, y1, x2, y2, c, k) => drawTrail(g, x1, y1, x2, y2, c, k);
export const mapHarbor = (g, x, y, k, kind) => drawBoat(g, x, y - k * 0.12, k * 0.42, kind);
export const mapCover = (g, x, y, r) => drawAsh(g, x, y, r, 0);
