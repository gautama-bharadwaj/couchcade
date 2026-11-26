// Tint & Tell art, drawn in code on a 2D canvas: a painter's studio. Push pins, paint tins, paint
// chips, brushes, splats and the wooden rim around the color wheel. Shared by the TV renderer
// (public/tv/games/tint.js) and the phones (the controller loads it for `art: 'tint'` screens; see
// "Drawn art" in server/games/index.js). Everything takes a canvas context and a centre + size, and
// leaves the context as it found it.
//
// The wheel's own swatches are never drawn here: their colors must stay exactly as the server
// sends them, so the art only frames them.

/** Small deterministic random numbers, so a splat looks the same every frame. */
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** Shade a #rrggbb color: k < 0 darker, k > 0 lighter. */
export function shade(hex, k) {
  const n = parseInt(String(hex).slice(1), 16);
  if (Number.isNaN(n)) return hex;
  const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** Light or dark text for writing on top of a color. */
export function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (Number.isNaN(n)) return '#fff';
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#1a1410' : '#fff';
}

// ---- Wheel framing -----------------------------------------------------------------------------

/** A turned-wood ring with brass studs, from radius R outwards by about R * 0.075. */
export function wheelRim(g, cx, cy, R) {
  const w = Math.max(6, R * 0.075);
  g.save();
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.arc(cx + w * 0.25, cy + w * 0.5, R + w + 2, 0, Math.PI * 2);
  g.fill();
  const wood = g.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.2, cx, cy, R + w);
  wood.addColorStop(0, '#c48a52');
  wood.addColorStop(0.85, '#8a5a30');
  wood.addColorStop(1, '#5a3618');
  g.fillStyle = wood;
  g.beginPath();
  g.arc(cx, cy, R + w, 0, Math.PI * 2);
  g.arc(cx, cy, R - 1, 0, Math.PI * 2, true);
  g.fill();
  // Grain: faint rings.
  g.strokeStyle = 'rgba(70,40,15,.35)';
  g.lineWidth = Math.max(0.6, w * 0.06);
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.arc(cx, cy, R + (w * i) / 4, 0, Math.PI * 2);
    g.stroke();
  }
  // Edges
  g.strokeStyle = '#3a220e';
  g.lineWidth = Math.max(1, w * 0.12);
  g.beginPath();
  g.arc(cx, cy, R + w, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = 'rgba(255,230,190,.35)';
  g.lineWidth = Math.max(1, w * 0.1);
  g.beginPath();
  g.arc(cx, cy, R + w * 0.82, Math.PI * 1.05, Math.PI * 1.7);
  g.stroke();
  // Brass studs at the 12 hours.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(a) * (R + w * 0.5);
    const y = cy + Math.sin(a) * (R + w * 0.5);
    const r = w * 0.2;
    const b = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
    b.addColorStop(0, '#fff1b8');
    b.addColorStop(1, '#a87a22');
    g.fillStyle = b;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/**
 * The middle of the wheel. With a color: a pool of that paint (the color itself, unshaded, so it
 * can be judged), with a thin wet rim. Without: the top of a closed paint tin with a "?".
 * lid 0..1 lifts the tin's lid off (for the reveal); wobble shakes it.
 */
export function wheelMiddle(g, cx, cy, r, color, { lid = 0, wobble = 0 } = {}) {
  g.save();
  if (color) {
    g.fillStyle = '#0d0f14';
    g.beginPath();
    g.arc(cx, cy, r + 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = Math.max(1, r * 0.05);
    g.beginPath();
    g.arc(cx, cy, r * 0.86, Math.PI * 1.1, Math.PI * 1.45);
    g.stroke();
  }
  if (!color || lid > 0) {
    // The tin's top: a silver rim and a lid, which lifts and tumbles away at the reveal.
    if (!color) tinRim(g, cx, cy, r);
    if (lid < 1) {
      g.globalAlpha = 1 - lid;
      g.translate(cx + lid * r * 1.4 + Math.sin(wobble * 40) * wobble * r * 0.05, cy - lid * r * 1.6);
      g.rotate(lid * 1.2 + Math.sin(wobble * 33) * wobble * 0.08);
      tinLid(g, 0, 0, r * 0.84);
    }
  }
  g.restore();
}

function tinRim(g, x, y, r) {
  const m = g.createLinearGradient(x - r, y - r, x + r, y + r);
  m.addColorStop(0, '#eef1f6');
  m.addColorStop(0.5, '#9aa2b0');
  m.addColorStop(1, '#5a6170');
  g.fillStyle = m;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2a2e38';
  g.lineWidth = Math.max(1, r * 0.04);
  g.stroke();
}

function tinLid(g, x, y, r) {
  const m = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  m.addColorStop(0, '#f8fafc');
  m.addColorStop(0.6, '#b6bdc9');
  m.addColorStop(1, '#6d7482');
  g.fillStyle = m;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a3f4a';
  g.lineWidth = Math.max(1, r * 0.04);
  g.stroke();
  g.strokeStyle = 'rgba(40,44,54,.45)';
  g.beginPath();
  g.arc(x, y, r * 0.78, 0, Math.PI * 2);
  g.stroke();
  // A drip of mystery paint on the lid, in three colors.
  const drips = ['#ff5a5f', '#ffc93c', '#3fa7ff'];
  drips.forEach((c, i) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(x + (i - 1) * r * 0.36, y + r * 0.62, r * 0.13, r * 0.09, 0, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#3a3f4a';
  g.font = `900 ${Math.round(r * 0.95)}px Georgia, "Times New Roman", serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', x, y + r * 0.02);
}

/** A push pin seen from above at a slant: a round head in the player's color on a short steel pin. */
export function wheelPin(g, x, y, s, color, letter) {
  g.save();
  // shadow
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.ellipse(x + s * 0.28, y + s * 0.2, s * 0.55, s * 0.32, 0.4, 0, Math.PI * 2);
  g.fill();
  // needle
  g.strokeStyle = '#c9ced8';
  g.lineWidth = Math.max(1, s * 0.12);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x - s * 0.25, y - s * 0.45);
  g.stroke();
  // head
  const hx = x - s * 0.32;
  const hy = y - s * 0.62;
  const hr = s * 0.55;
  const b = g.createRadialGradient(hx - hr * 0.35, hy - hr * 0.4, hr * 0.1, hx, hy, hr);
  b.addColorStop(0, shade(color, 0.55));
  b.addColorStop(0.55, color);
  b.addColorStop(1, shade(color, -0.4));
  g.fillStyle = b;
  g.beginPath();
  g.arc(hx, hy, hr, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = Math.max(1, s * 0.1);
  g.stroke();
  if (letter) {
    g.fillStyle = inkOn(color);
    g.font = `900 ${Math.round(hr * 1.15)}px system-ui, -apple-system, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, hx, hy + hr * 0.06);
  }
  g.restore();
}

/** Where a pin's head sits, relative to its point, for labels that go over it. */
export const pinHead = (s) => [-s * 0.32, -s * 0.62];

// ---- Swatch (phone) and paint chips ------------------------------------------------------------

/** A paint-store chip: a white card, most of it the color, a punched hole and a name strip. */
export function drawSwatch(g, w, h, color, label) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.roundRect(3, 5, w - 4, h - 6, 10);
  g.fill();
  g.fillStyle = '#f7f1e3';
  g.beginPath();
  g.roundRect(1, 1, w - 6, h - 8, 10);
  g.fill();
  const strip = Math.min(30, h * 0.3);
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(7, 7, w - 52, h - 20 - strip, 6);
  g.fill();
  // punched hole
  g.fillStyle = '#0d0f14';
  g.beginPath();
  g.arc(w - 26, 20, 6, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(w - 26, 20, 7, 0, Math.PI * 2);
  g.stroke();
  if (label) {
    g.fillStyle = '#3a2e22';
    g.font = `italic 800 ${Math.round(strip * 0.55)}px Georgia, "Times New Roman", serif`;
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    g.fillText(label, 12, h - 9 - strip / 2);
  }
  g.restore();
}

/** A paint chip, tilted a little, for the Teller's three choices. */
export function drawChip(g, x, y, s, color) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.08);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath();
  g.roundRect(-s * 0.36, -s * 0.44, s * 0.76, s * 0.92, s * 0.08);
  g.fill();
  g.fillStyle = '#f7f1e3';
  g.beginPath();
  g.roundRect(-s * 0.4, -s * 0.48, s * 0.76, s * 0.92, s * 0.08);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(-s * 0.33, -s * 0.41, s * 0.62, s * 0.62, s * 0.05);
  g.fill();
  g.fillStyle = 'rgba(58,46,34,.5)';
  g.fillRect(-s * 0.3, s * 0.28, s * 0.4, s * 0.05);
  g.restore();
}

// ---- Studio odds and ends ----------------------------------------------------------------------

/** A paint splat, blobby, with a few droplets around it. */
export function drawSplat(g, x, y, r, color, seed = 1, droplets = true) {
  const rand = rng(seed);
  g.save();
  g.fillStyle = color;
  g.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.72 + rand() * 0.38);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py);
    else {
      const am = a - Math.PI / n;
      const rm = r * (0.55 + rand() * 0.3);
      g.quadraticCurveTo(x + Math.cos(am) * rm, y + Math.sin(am) * rm, px, py);
    }
  }
  g.closePath();
  g.fill();
  if (droplets) {
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const d = r * (1.1 + rand() * 0.6);
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.05 + rand() * 0.1), 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** A paintbrush lying at angle rot, bristles at (x, y) dipped in color. */
export function drawBrush(g, x, y, s, rot = 0, color = '#ff5a5f') {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.lineCap = 'round';
  // handle
  const hg = g.createLinearGradient(0, -s * 0.06, 0, s * 0.06);
  hg.addColorStop(0, '#e0a56a');
  hg.addColorStop(1, '#8a4f22');
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(s * 0.32, -s * 0.06);
  g.lineTo(s * 1.25, -s * 0.035);
  g.quadraticCurveTo(s * 1.32, 0, s * 1.25, s * 0.035);
  g.lineTo(s * 0.32, s * 0.06);
  g.closePath();
  g.fill();
  // ferrule
  const fg = g.createLinearGradient(0, -s * 0.08, 0, s * 0.08);
  fg.addColorStop(0, '#f2f4f8');
  fg.addColorStop(0.5, '#9aa2b0');
  fg.addColorStop(1, '#5a6170');
  g.fillStyle = fg;
  g.beginPath();
  g.roundRect(s * 0.12, -s * 0.08, s * 0.24, s * 0.16, s * 0.03);
  g.fill();
  // bristles
  g.fillStyle = '#d8b98a';
  g.beginPath();
  g.moveTo(s * 0.13, -s * 0.075);
  g.quadraticCurveTo(-s * 0.08, -s * 0.07, -s * 0.16, 0);
  g.quadraticCurveTo(-s * 0.08, s * 0.07, s * 0.13, s * 0.075);
  g.closePath();
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(s * 0.02, -s * 0.072);
  g.quadraticCurveTo(-s * 0.1, -s * 0.06, -s * 0.16, 0);
  g.quadraticCurveTo(-s * 0.1, s * 0.06, s * 0.02, s * 0.072);
  g.closePath();
  g.fill();
  g.restore();
}

/** A squeezed paint tube lying at angle rot. */
export function drawTube(g, x, y, s, rot, color) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const tg = g.createLinearGradient(0, -s * 0.18, 0, s * 0.18);
  tg.addColorStop(0, '#fbfbfd');
  tg.addColorStop(0.5, '#c9ced8');
  tg.addColorStop(1, '#7d8494');
  g.fillStyle = tg;
  g.beginPath();
  g.moveTo(-s * 0.5, -s * 0.2);
  g.lineTo(s * 0.3, -s * 0.15);
  g.quadraticCurveTo(s * 0.38, -s * 0.1, s * 0.4, -s * 0.06);
  g.lineTo(s * 0.4, s * 0.06);
  g.quadraticCurveTo(s * 0.38, s * 0.1, s * 0.3, s * 0.15);
  g.lineTo(-s * 0.5, s * 0.2);
  g.closePath();
  g.fill();
  g.fillStyle = color;
  g.fillRect(-s * 0.3, -s * 0.17, s * 0.38, s * 0.34);
  g.fillStyle = '#d6d9e0';
  g.fillRect(-s * 0.56, -s * 0.21, s * 0.08, s * 0.42);
  g.fillStyle = '#2a2e38';
  g.beginPath();
  g.roundRect(s * 0.4, -s * 0.07, s * 0.14, s * 0.14, s * 0.03);
  g.fill();
  // a little blob squeezed out
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(s * 0.66, 0, s * 0.1, s * 0.08, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A paint blob with the player's initial: their badge on the scoreboard. */
export function drawBlob(g, x, y, r, color, letter, seed = 7) {
  drawSplat(g, x + r * 0.08, y + r * 0.12, r, 'rgba(0,0,0,.35)', seed, false);
  drawSplat(g, x, y, r, color, seed, false);
  g.save();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.ellipse(x - r * 0.3, y - r * 0.32, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
  g.fill();
  if (letter) {
    g.fillStyle = inkOn(color);
    g.font = `900 ${Math.round(r * 0.95)}px system-ui, -apple-system, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, x, y + r * 0.06);
  }
  g.restore();
}

/** A speech bubble outline (clue icon). */
function drawBubble(g, x, y, s, color = '#f7f1e3') {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = '#3a2e22';
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.roundRect(x - s * 0.45, y - s * 0.38, s * 0.9, s * 0.6, s * 0.18);
  g.moveTo(x - s * 0.18, y + s * 0.2);
  g.lineTo(x - s * 0.28, y + s * 0.42);
  g.lineTo(x + s * 0.02, y + s * 0.2);
  g.fill();
  g.stroke();
  g.fillStyle = '#3a2e22';
  for (const dx of [-0.2, 0, 0.2]) {
    g.beginPath();
    g.arc(x + dx * s, y - s * 0.08, s * 0.055, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

/** A drawn tick mark in a disc. */
export function drawCheck(g, x, y, s, color = '#4cd97b') {
  g.save();
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, s / 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#0d0f14';
  g.lineWidth = Math.max(1.5, s * 0.14);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - s * 0.22, y);
  g.lineTo(x - s * 0.05, y + s * 0.18);
  g.lineTo(x + s * 0.24, y - s * 0.18);
  g.stroke();
  g.restore();
}

/** A painter's palette with dabs of paint. */
export function drawPalette(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.2);
  const wg = g.createLinearGradient(-s * 0.5, -s * 0.4, s * 0.5, s * 0.4);
  wg.addColorStop(0, '#e2b07a');
  wg.addColorStop(1, '#a86a36');
  g.fillStyle = wg;
  g.strokeStyle = '#5a3618';
  g.lineWidth = Math.max(1, s * 0.05);
  g.beginPath();
  g.ellipse(0, 0, s * 0.5, s * 0.38, 0, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = '#0d0f14';
  g.beginPath();
  g.ellipse(s * 0.22, s * 0.12, s * 0.08, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  [['#ff5a5f', -0.28, -0.1], ['#ffc93c', -0.1, -0.24], ['#4cd97b', 0.12, -0.22], ['#3fa7ff', 0.3, -0.05], ['#b96bff', -0.22, 0.14]].forEach(([c, dx, dy]) => {
    g.fillStyle = c;
    g.beginPath();
    g.arc(dx * s, dy * s, s * 0.08, 0, Math.PI * 2);
    g.fill();
  });
  g.restore();
}

/** An eye (for "watch the TV"). */
function drawEye(g, x, y, s) {
  g.save();
  g.fillStyle = '#f7f1e3';
  g.strokeStyle = '#3a2e22';
  g.lineWidth = Math.max(1, s * 0.06);
  g.beginPath();
  g.moveTo(x - s * 0.45, y);
  g.quadraticCurveTo(x, y - s * 0.42, x + s * 0.45, y);
  g.quadraticCurveTo(x, y + s * 0.42, x - s * 0.45, y);
  g.fill();
  g.stroke();
  g.fillStyle = '#3fa7ff';
  g.beginPath();
  g.arc(x, y, s * 0.16, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0d0f14';
  g.beginPath();
  g.arc(x, y, s * 0.07, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** Icons by name, for the phones' cards and options (see "Drawn art" in server/games/index.js). */
export function drawNamed(g, name, x, y, s, color = '#ff5a5f') {
  if (name === 'brush') drawBrush(g, x + s * 0.12, y + s * 0.25, s * 0.62, -0.75, color);
  else if (name === 'bubble') drawBubble(g, x, y, s);
  else if (name === 'chip') drawChip(g, x, y, s, color);
  else if (name === 'pin') wheelPin(g, x + s * 0.15, y + s * 0.3, s * 0.55, color);
  else if (name === 'palette') drawPalette(g, x, y, s);
  else if (name === 'blob') drawBlob(g, x, y, s * 0.4, color);
  else if (name === 'eye') drawEye(g, x, y, s);
  else if (name === 'check') drawCheck(g, x, y, s * 0.8, color);
}
