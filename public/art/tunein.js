// Tune In art, drawn in code on a 2D canvas: an old wooden valve radio. The backlit glass band,
// needles, bakelite knobs, speaker cloth, the green "magic eye" tuning tube, a microphone and
// musical notes. Shared by the TV renderer (public/tv/games/tunein.js) and the phones (the
// controller loads it for `art: 'tunein'` screens; see "Drawn art" in server/games/index.js).
// Everything takes a canvas context and a position + size, and leaves the context as it found it.

const SERIF = 'Georgia, "Times New Roman", serif';

/** Small deterministic random numbers, so the wood grain looks the same every frame. */
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

export function inkOn(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  if (Number.isNaN(n)) return '#fff';
  const l = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? '#1a1410' : '#fff';
}

// ---- Wood ---------------------------------------------------------------------------------------

/** A walnut panel with grain, as a rounded rectangle. */
export function drawWood(g, x, y, w, h, r, seed = 3, tone = 0) {
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  const base = g.createLinearGradient(0, y, 0, y + h);
  base.addColorStop(0, shade('#8a5530', tone));
  base.addColorStop(0.55, shade('#6a3c20', tone));
  base.addColorStop(1, shade('#43230f', tone));
  g.fillStyle = base;
  g.fill();
  g.clip();
  const rand = rng(seed);
  // Long wavy grain lines.
  for (let i = 0; i < Math.max(8, h / 9); i++) {
    const yy = y + rand() * h;
    const amp = 2 + rand() * 6;
    const ph = rand() * 6;
    g.strokeStyle = rand() < 0.5 ? 'rgba(40,18,6,.28)' : 'rgba(200,140,80,.12)';
    g.lineWidth = 0.8 + rand() * 1.8;
    g.beginPath();
    for (let xx = x; xx <= x + w; xx += 24) {
      const py = yy + Math.sin(xx / 90 + ph) * amp + Math.sin(xx / 23 + ph * 2) * amp * 0.25;
      xx === x ? g.moveTo(xx, py) : g.lineTo(xx, py);
    }
    g.stroke();
  }
  // A couple of knots.
  for (let i = 0; i < 2; i++) {
    const kx = x + w * (0.15 + rand() * 0.7);
    const ky = y + h * (0.2 + rand() * 0.6);
    g.strokeStyle = 'rgba(40,18,6,.3)';
    g.lineWidth = 1.2;
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.ellipse(kx, ky, 6 * k, 2.4 * k, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Varnish shine along the top.
  const sh = g.createLinearGradient(0, y, 0, y + Math.min(60, h * 0.3));
  sh.addColorStop(0, 'rgba(255,220,170,.22)');
  sh.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = sh;
  g.fillRect(x, y, w, Math.min(60, h * 0.3));
  g.restore();
}

// ---- The glass band ----------------------------------------------------------------------------

/**
 * The backlit glass: warm amber, a frequency scale, a little glare. xOf maps 0..100 to x.
 * glow 0..1 brightens the lamp behind it.
 */
export function drawGlass(g, x, y, w, h, xOf, { glow = 0.6, numbers = true, small = false } = {}) {
  g.save();
  const r = Math.min(12, h * 0.18);
  // brass bezel
  const bz = g.createLinearGradient(0, y - 4, 0, y + h + 4);
  bz.addColorStop(0, '#f4d98c');
  bz.addColorStop(0.5, '#b8862e');
  bz.addColorStop(1, '#6e4a14');
  g.fillStyle = bz;
  g.beginPath();
  g.roundRect(x - 4, y - 4, w + 8, h + 8, r + 3);
  g.fill();
  const gl = g.createLinearGradient(0, y, 0, y + h);
  gl.addColorStop(0, '#fff2c4');
  gl.addColorStop(0.55, '#f1d48a');
  gl.addColorStop(1, '#d9ae5c');
  g.fillStyle = gl;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
  g.clip();
  // lamp glow behind the glass
  const lamp = g.createRadialGradient(x + w / 2, y + h * 0.6, 4, x + w / 2, y + h * 0.6, w * 0.6);
  lamp.addColorStop(0, `rgba(255,250,220,${0.25 + glow * 0.45})`);
  lamp.addColorStop(1, 'rgba(255,250,220,0)');
  g.fillStyle = lamp;
  g.fillRect(x, y, w, h);
  // scale
  const ink = 'rgba(70,40,18,.7)';
  g.strokeStyle = ink;
  for (let v = 0; v <= 100; v += 2.5) {
    const px = xOf(v);
    const big = v % 10 === 0;
    const mid = v % 5 === 0;
    g.lineWidth = big ? 2 : 1;
    g.beginPath();
    g.moveTo(px, y + h - (big ? h * 0.24 : mid ? h * 0.15 : h * 0.09));
    g.lineTo(px, y + h - 2);
    g.stroke();
  }
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 4, y + h - 2.5);
  g.lineTo(x + w - 4, y + h - 2.5);
  g.stroke();
  if (numbers) {
    g.fillStyle = 'rgba(70,40,18,.72)';
    // Fewer numbers on a narrow (phone) band, and none hard against the ends.
    const narrow = w < 600;
    g.font = `700 ${small ? 10 : narrow ? 13 : Math.round(Math.min(20, h * 0.15))}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let v = narrow ? 10 : 0; v <= (narrow ? 90 : 100); v += small ? 40 : narrow ? 20 : 10) g.fillText(String(88 + v / 5), xOf(v), y + (small ? 3 : h * 0.12));
  }
  // glare
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x + w * 0.22, y);
  g.lineTo(x + w * 0.12, y + h);
  g.lineTo(x, y + h);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.12)';
  g.beginPath();
  g.moveTo(x + w * 0.26, y);
  g.lineTo(x + w * 0.31, y);
  g.lineTo(x + w * 0.21, y + h);
  g.lineTo(x + w * 0.16, y + h);
  g.closePath();
  g.fill();
  // inner shadow at the top
  const sh = g.createLinearGradient(0, y, 0, y + h * 0.2);
  sh.addColorStop(0, 'rgba(60,30,10,.35)');
  sh.addColorStop(1, 'rgba(60,30,10,0)');
  g.fillStyle = sh;
  g.fillRect(x, y, w, h * 0.2);
  g.restore();
}

/** The red tuning needle (the crowd's average), full height of the glass, with a pointer below. */
export function drawNeedle(g, x, top, h, { tip = true, width = 4 } = {}) {
  g.save();
  g.fillStyle = 'rgba(60,20,10,.3)';
  g.fillRect(x - width / 2 + 2, top - 4, width, h + 8);
  const ng = g.createLinearGradient(x - width, 0, x + width, 0);
  ng.addColorStop(0, '#b3121a');
  ng.addColorStop(0.5, '#ff4a3a');
  ng.addColorStop(1, '#b3121a');
  g.fillStyle = ng;
  g.fillRect(x - width / 2, top - 6, width, h + 12);
  if (tip) {
    g.fillStyle = '#e02a22';
    g.strokeStyle = '#5a0a08';
    g.lineWidth = Math.max(1, width * 0.3);
    g.beginPath();
    g.moveTo(x - width * 2.6, top + h + width * 5);
    g.lineTo(x + width * 2.6, top + h + width * 5);
    g.lineTo(x, top + h + width * 1.2);
    g.closePath();
    g.fill();
    g.stroke();
  }
  g.restore();
}

/** A listener's marker: a round enamel tab on a brass stem, in their color, with an initial. */
export function drawTab(g, x, y, r, color, letter, stemTo) {
  g.save();
  if (stemTo != null) {
    g.strokeStyle = '#c9a25a';
    g.lineWidth = Math.max(1.5, r * 0.16);
    g.beginPath();
    g.moveTo(x, y + r * 0.8);
    g.lineTo(x, stemTo);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.arc(x + r * 0.12, y + r * 0.18, r, 0, Math.PI * 2);
  g.fill();
  const b = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  b.addColorStop(0, shade(color, 0.5));
  b.addColorStop(0.6, color);
  b.addColorStop(1, shade(color, -0.35));
  g.fillStyle = b;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#e8c878';
  g.lineWidth = Math.max(1.5, r * 0.16);
  g.stroke();
  if (letter) {
    g.fillStyle = inkOn(color);
    g.font = `900 ${Math.round(r * 1.2)}px system-ui, -apple-system, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(letter, x, y + r * 0.06);
  }
  g.restore();
}

// ---- Phone dial hooks (see "Drawn art" in server/games/index.js) -------------------------------

export function dialFace(g, x, y, w, h, xOf) {
  drawWood(g, x - 6, y - 6, w + 12, h + 12, 14, 5);
  drawGlass(g, x, y, w, h, xOf, { small: h < 60, glow: 0.7 });
}
export function dialNeedle(g, x, top, h) {
  drawNeedle(g, x, top, h, { width: 4, tip: h > 50 });
}
export function dialPin(g, x, top, color) {
  drawTab(g, x, top - 11, 6, color, null, top + 2);
}
/** Your own needle on the phone: a brass pointer with a knob in your color. */
export function dialMine(g, x, top, h, color) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.fillRect(x - 1, top + 2, 5, h - 2);
  const bg = g.createLinearGradient(x - 3, 0, x + 3, 0);
  bg.addColorStop(0, '#8a6420');
  bg.addColorStop(0.5, '#ffe7a0');
  bg.addColorStop(1, '#8a6420');
  g.fillStyle = bg;
  g.fillRect(x - 2.5, top, 5, h);
  const r = Math.min(13, h * 0.14);
  drawTab(g, x, top + h - r - 2, r, color);
  g.restore();
}

// ---- Cabinet parts (TV) ------------------------------------------------------------------------

/** Speaker cloth: a woven panel behind brass slats. pulse 0..1 makes it breathe (sound playing). */
export function drawGrille(g, x, y, w, h, pulse = 0) {
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.fillStyle = '#3a2a1c';
  g.fill();
  g.clip();
  const cloth = g.createRadialGradient(x + w / 2, y + h / 2, 4, x + w / 2, y + h / 2, w * 0.6);
  cloth.addColorStop(0, `rgb(${168 + pulse * 30},${136 + pulse * 20},${92 + pulse * 10})`);
  cloth.addColorStop(1, '#6e5436');
  g.fillStyle = cloth;
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(60,40,20,.35)';
  g.lineWidth = 1;
  for (let i = 0; i < w + h; i += 5) {
    g.beginPath();
    g.moveTo(x + i, y);
    g.lineTo(x + i - h, y + h);
    g.stroke();
    g.beginPath();
    g.moveTo(x + i - h, y);
    g.lineTo(x + i, y + h);
    g.stroke();
  }
  // slats
  const n = Math.max(3, Math.round(w / 70));
  for (let i = 1; i < n; i++) {
    const sx = x + (w * i) / n;
    const sg = g.createLinearGradient(sx - 5, 0, sx + 5, 0);
    sg.addColorStop(0, '#6a4410');
    sg.addColorStop(0.5, '#f0cf7a');
    sg.addColorStop(1, '#6a4410');
    g.fillStyle = sg;
    g.fillRect(sx - 4, y, 8, h);
  }
  g.restore();
  g.save();
  g.strokeStyle = '#c9a25a';
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y, w, h, 14);
  g.stroke();
  g.restore();
}

/** A bakelite knob, turned by rot radians, with a brass skirt and a pointer line. */
export function drawKnob(g, x, y, r, rot = 0, label) {
  g.save();
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.beginPath();
  g.arc(x + r * 0.12, y + r * 0.18, r * 1.08, 0, Math.PI * 2);
  g.fill();
  const skirt = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.2, x, y, r * 1.1);
  skirt.addColorStop(0, '#ffe7a0');
  skirt.addColorStop(1, '#7a5216');
  g.fillStyle = skirt;
  g.beginPath();
  g.arc(x, y, r * 1.06, 0, Math.PI * 2);
  g.fill();
  // ridged edge
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = '#2a1a10';
  g.beginPath();
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rr = i % 2 ? r * 0.86 : r * 0.92;
    i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  const face = g.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r * 0.8);
  face.addColorStop(0, '#7a4a2a');
  face.addColorStop(1, '#2a160a');
  g.fillStyle = face;
  g.beginPath();
  g.arc(0, 0, r * 0.74, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#f6e7b8';
  g.lineWidth = Math.max(2, r * 0.1);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(0, -r * 0.2);
  g.lineTo(0, -r * 0.66);
  g.stroke();
  g.restore();
  if (label) {
    g.save();
    g.fillStyle = '#e8c878';
    g.font = `700 ${Math.round(r * 0.32)}px ${SERIF}`;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    g.fillText(label, x, y + r * 1.18);
    g.restore();
  }
}

/**
 * The green "magic eye" tuning tube. open 0..1: 1 = a wide dark wedge (no signal), 0 = the green
 * closes completely (locked on the station).
 */
export function drawMagicEye(g, x, y, r, open = 1, glow = 1) {
  g.save();
  const bz = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r * 1.25);
  bz.addColorStop(0, '#ffe7a0');
  bz.addColorStop(1, '#6e4a14');
  g.fillStyle = bz;
  g.beginPath();
  g.arc(x, y, r * 1.22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#071008';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  const gr = g.createRadialGradient(x, y, r * 0.15, x, y, r);
  gr.addColorStop(0, `rgba(190,255,170,${0.95 * glow})`);
  gr.addColorStop(0.6, `rgba(60,230,110,${0.85 * glow})`);
  gr.addColorStop(1, `rgba(20,120,60,${0.7 * glow})`);
  const wedge = Math.max(0.02, open) * Math.PI * 0.9;
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, r * 0.94, -Math.PI / 2 + wedge / 2, -Math.PI / 2 - wedge / 2 + Math.PI * 2);
  g.closePath();
  g.fill();
  g.fillStyle = '#1a1a14';
  g.beginPath();
  g.arc(x, y, r * 0.28, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.25)';
  g.beginPath();
  g.ellipse(x - r * 0.35, y - r * 0.45, r * 0.28, r * 0.14, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** A ribbon microphone on a stand, for the DJ. */
export function drawMic(g, x, y, s, color = '#ff5a5f') {
  g.save();
  g.translate(x, y);
  g.lineCap = 'round';
  // stand
  g.strokeStyle = '#8a8f9c';
  g.lineWidth = s * 0.08;
  g.beginPath();
  g.moveTo(0, s * 0.1);
  g.lineTo(0, s * 0.42);
  g.stroke();
  g.fillStyle = '#5a5f6c';
  g.beginPath();
  g.ellipse(0, s * 0.45, s * 0.24, s * 0.06, 0, 0, Math.PI * 2);
  g.fill();
  // yoke
  g.strokeStyle = '#c9ced8';
  g.lineWidth = s * 0.06;
  g.beginPath();
  g.arc(0, -s * 0.12, s * 0.27, 0.1, Math.PI - 0.1);
  g.stroke();
  // head
  const hg = g.createLinearGradient(-s * 0.2, 0, s * 0.2, 0);
  hg.addColorStop(0, '#6a707e');
  hg.addColorStop(0.5, '#f2f4f8');
  hg.addColorStop(1, '#6a707e');
  g.fillStyle = hg;
  g.beginPath();
  g.roundRect(-s * 0.19, -s * 0.48, s * 0.38, s * 0.56, s * 0.18);
  g.fill();
  g.strokeStyle = 'rgba(40,44,54,.6)';
  g.lineWidth = Math.max(1, s * 0.025);
  for (let i = 1; i < 6; i++) {
    g.beginPath();
    g.moveTo(-s * 0.17, -s * 0.48 + i * s * 0.09);
    g.lineTo(s * 0.17, -s * 0.48 + i * s * 0.09);
    g.stroke();
  }
  g.fillStyle = color;
  g.fillRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.08);
  g.restore();
}

/** A musical note (eighth note), for good reception. */
export function drawNote(g, x, y, s, color = '#ffe7a0', double = false) {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = s * 0.1;
  g.lineCap = 'round';
  const head = (hx) => {
    g.beginPath();
    g.ellipse(hx, y + s * 0.3, s * 0.2, s * 0.14, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(hx + s * 0.17, y + s * 0.27);
    g.lineTo(hx + s * 0.17, y - s * 0.4);
    g.stroke();
  };
  head(x);
  if (double) {
    head(x + s * 0.42);
    g.lineWidth = s * 0.14;
    g.beginPath();
    g.moveTo(x + s * 0.17, y - s * 0.4);
    g.lineTo(x + s * 0.59, y - s * 0.48);
    g.stroke();
  } else {
    g.beginPath();
    g.moveTo(x + s * 0.17, y - s * 0.4);
    g.quadraticCurveTo(x + s * 0.45, y - s * 0.2, x + s * 0.4, y + s * 0.02);
    g.stroke();
  }
  g.restore();
}

/** A tiny tabletop radio, for icons. */
export function drawRadio(g, x, y, s) {
  g.save();
  drawWood(g, x - s * 0.45, y - s * 0.3, s * 0.9, s * 0.6, s * 0.12, 9);
  g.fillStyle = '#f1d48a';
  g.beginPath();
  g.roundRect(x - s * 0.35, y - s * 0.2, s * 0.42, s * 0.16, s * 0.04);
  g.fill();
  g.fillStyle = '#e02a22';
  g.fillRect(x - s * 0.17, y - s * 0.2, s * 0.03, s * 0.16);
  g.fillStyle = '#a8885a';
  g.beginPath();
  g.roundRect(x - s * 0.35, y + s * 0.02, s * 0.42, s * 0.18, s * 0.04);
  g.fill();
  g.restore();
  drawKnob(g, x + s * 0.25, y - s * 0.08, s * 0.09);
  drawKnob(g, x + s * 0.25, y + s * 0.13, s * 0.07);
  g.save();
  g.strokeStyle = '#c9ced8';
  g.lineWidth = Math.max(1, s * 0.03);
  g.beginPath();
  g.moveTo(x + s * 0.1, y - s * 0.3);
  g.lineTo(x + s * 0.3, y - s * 0.5);
  g.stroke();
  g.restore();
}

/** Signal bars, filled up to n of 4. */
export function drawBars(g, x, y, s, n, color = '#ffd166') {
  g.save();
  for (let i = 0; i < 4; i++) {
    const bh = s * (0.25 + i * 0.22);
    const bx = x - s * 0.45 + i * s * 0.25;
    g.fillStyle = i < n ? color : 'rgba(255,255,255,.18)';
    g.beginPath();
    g.roundRect(bx, y + s * 0.45 - bh, s * 0.17, bh, s * 0.04);
    g.fill();
  }
  g.restore();
}

/** Icons by name, for the phones' cards and options. */
export function drawNamed(g, name, x, y, s, color = '#ff5a5f') {
  if (name === 'mic') drawMic(g, x, y, s * 0.9, color);
  else if (name === 'radio') drawRadio(g, x, y, s);
  else if (name === 'note') drawNote(g, x - s * 0.15, y, s * 0.8, color, true);
  else if (name === 'bars') drawBars(g, x, y, s, 4, color);
  else if (name === 'eye') drawMagicEye(g, x, y, s * 0.38, 0.4);
  else if (name === 'tab') drawTab(g, x, y, s * 0.36, color);
}

/** A drawn tick mark in a disc (locked in). */
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

/** An "ON AIR" studio lamp; lit 0..1. */
export function drawOnAir(g, x, y, w, h, lit) {
  g.save();
  if (lit > 0) {
    const glow = g.createRadialGradient(x, y, 4, x, y, w * 0.9);
    glow.addColorStop(0, `rgba(255,60,50,${0.35 * lit})`);
    glow.addColorStop(1, 'rgba(255,60,50,0)');
    g.fillStyle = glow;
    g.fillRect(x - w, y - w, w * 2, w * 2);
  }
  g.fillStyle = '#2a1a14';
  g.beginPath();
  g.roundRect(x - w / 2 - 5, y - h / 2 - 5, w + 10, h + 10, 10);
  g.fill();
  const lg = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  lg.addColorStop(0, lit > 0 ? '#ff6a5a' : '#4a2a26');
  lg.addColorStop(1, lit > 0 ? '#c3170f' : '#2e1a18');
  g.globalAlpha = 1;
  g.fillStyle = lg;
  g.beginPath();
  g.roundRect(x - w / 2, y - h / 2, w, h, 7);
  g.fill();
  g.fillStyle = lit > 0 ? `rgba(255,245,235,${0.6 + 0.4 * lit})` : 'rgba(255,255,255,.25)';
  g.font = `900 ${Math.round(h * 0.55)}px system-ui, -apple-system, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('ON AIR', x, y + 1);
  g.restore();
}
