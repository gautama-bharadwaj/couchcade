// Midnight Gala TV: the mansion at night, cut open like a doll's house so the four rooms show,
// each with its jewel on a pedestal. The guests stand on the lawn below. Shows only public
// information; secrets live on each phone. Rules are in server/games/gala.js; all drawing of
// guests, role cards, rooms and gems is in public/art/gala.js.
//
// Key moments get a little show: role cards are dealt to everyone at the start, the lights go out
// at night and the moon climbs, stolen gems fly out of their shattered cases at dawn, votes drop
// into a ballot box, and the guest who is escorted out has their role card turned over.

import { text } from './util.js';
import {
  GOLD, GOLD_DARK, ROLE_COLOR, ROLE_LABEL, SERIF,
  drawCardBack, drawEnvelope, drawGem, drawGlove, drawGuest, drawMagnifier, drawMoonDisc,
  drawRoleCard, drawRoom, drawShield, rgba, roomIcon, seedOf, shade, sparkle,
} from '../../art/gala.js';

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

// Narration: a dramatic host reads out what happened. Lines are random so games don't repeat.
const LINES = {
  intro: [
    'Welcome, honored guests, to the Midnight Gala. Check your phones… and keep them hidden.',
    'Good evening. Tonight, someone at this party is not who they claim to be.',
    'Welcome to the Midnight Gala. The jewels are on display. Some of you are here to take them.',
  ],
  night: [
    'Night falls on the mansion. Choose your room… and trust no one.',
    'The lights go out. Slip away to a room of your choosing.',
    'Midnight. The halls are dark, and somewhere a door creaks open.',
    'Darkness falls. Pick your room quietly.',
  ],
  quiet: ['Morning comes, and every gem is accounted for. Suspicious.', 'A quiet night. Too quiet.', 'Dawn breaks. Nothing was taken… this time.'],
  talk: ['Discuss. Who among you is lying?', 'Speak up. Share what you saw, or what you want them to think you saw.', 'The floor is open. Accuse, defend, deceive.'],
  vote: ['The time for talk is over. Cast your votes.', 'Vote now. Choose wisely.', 'Lock in your votes. They will all be revealed together.'],
  nobody: ['Nobody leaves tonight.', 'The guests cannot agree. Everyone stays.', 'No one is escorted out. The thieves breathe easier.'],
};

// Layout on the 1600 x 900 canvas.
const ROOM_W = 500;
const ROOM_H = 205;
const MX = 800 - ROOM_W - 8; // mansion's left inner edge
const TOP_Y = 262;
const ROW2_Y = TOP_Y + ROOM_H + 14;
const GROUND = ROW2_Y + ROOM_H;
const ROSTER_Y = 790;
const FLIP_AT = 2400; // ms into the verdict when the card turns (matches the drumroll)

// Animation state (TV only).
let lastSpokenTick = -1;
let phaseAt = 0; // when the current phase started (performance.now)
let phaseTotal = 1; // seconds the current phase started with, for the clock hand
let lightLevel = 1; // eased towards the phase's lighting
let flights = []; // gems flying from a room to the counter: { from: [x, y], slot, at }
let drops = []; // envelopes falling into the ballot box: { from: [x, y], at }
let parts = []; // sparkles and confetti: { x, y, vx, vy, at, life, color, size }
let lastDone = 0;
let lastNow = 0;

const ease = (q) => 1 - (1 - q) ** 3;
const clamp01 = (q) => Math.max(0, Math.min(1, q));

function roomRect(i) {
  return { x: MX + (i % 2) * (ROOM_W + 16), y: i < 2 ? TOP_Y : ROW2_Y, w: ROOM_W, h: ROOM_H };
}

function rosterPos(s, i) {
  const n = s.players.length;
  const slot = Math.min(170, 1320 / n);
  return [800 - (slot * (n - 1)) / 2 + i * slot, ROSTER_Y];
}

function gemSlot(s, i) {
  const gap = 58;
  return [800 - ((s.gemsToWin - 1) * gap) / 2 + i * gap, 84];
}

function burst(x, y, n, color, { speed = 5, up = 2, life = 900, size = 4 } = {}) {
  const at = performance.now();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random());
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, at, life: life * (0.6 + Math.random() * 0.6), color, size: size * (0.6 + Math.random() * 0.8) });
  }
}

function serif(ctx, str, x, y, size, color, align = 'center') {
  ctx.font = `900 ${size}px ${SERIF}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(str, x, y);
}

function fitSize(ctx, str, size, maxW, font = 'system-ui, sans-serif', weight = 800) {
  ctx.font = `${weight} ${size}px ${font}`;
  const w = ctx.measureText(str).width;
  return w > maxW ? Math.floor((size * maxW) / w) : size;
}

export default {
  drawRules,

  // Sounds and narration for state changes (see public/tv/audio.js).
  onSnapshot(prev, s, audio) {
    const { sfx, say, pick } = audio;
    const name = (id) => s.players.find((p) => p.id === id)?.name ?? 'Someone';
    const room = (id) => s.rooms.find((r) => r.id === id)?.label ?? id;
    const entered = !prev || prev.phase !== s.phase;
    const now = performance.now();

    // Countdown ticks in the last 10 seconds of timed choices.
    if (prev && s.left !== prev.left && s.left <= 10 && s.left > 0 && ['night', 'vote', 'lastGuess', 'talk'].includes(s.phase) && s.left !== lastSpokenTick) {
      lastSpokenTick = s.left;
      sfx.tick();
    }

    // Votes dropping into the box.
    if (s.phase === 'vote') {
      const done = s.players.filter((p) => p.done);
      if (!entered && done.length > lastDone) {
        for (const p of done.slice(lastDone)) drops.push({ from: rosterPos(s, s.players.indexOf(p)), at: now });
        sfx.drop();
      }
      lastDone = done.length;
    }

    if (!entered) {
      if (s.gossip.length > (prev.gossip?.length ?? 0)) {
        sfx.whisper();
        say(`A whisper: ${s.gossip.at(-1)}`, { rate: 0.85, pitch: 1.2, delay: 0.4 });
      }
      return;
    }

    phaseAt = now;
    phaseTotal = Math.max(1, s.left);
    lastDone = 0;
    drops = [];
    if (!prev) {
      flights = [];
      parts = [];
    }
    audio.ambience(s.phase === 'night' || s.phase === 'intro' ? 'night' : null);

    switch (s.phase) {
      case 'intro':
        sfx.clockChime();
        say(pick(LINES.intro), { delay: 1.5 });
        setTimeout(() => sfx.shuffle?.(Math.min(8, s.players.length)), 300);
        break;
      case 'night':
        sfx.doorCreak();
        say(s.night === s.maxNights ? 'The final night. Dawn is coming. Choose your room.' : pick(LINES.night), { interrupt: true, delay: 0.3 });
        break;
      case 'reveal': {
        const last = s.last;
        const lines = [];
        if (last?.stolen.length) {
          sfx.sting();
          // Each stolen gem flies from its room to the counter.
          last.stolen.forEach((rid, k) => {
            const i = s.rooms.findIndex((r) => r.id === rid);
            const r = roomRect(i);
            flights.push({ from: [r.x + r.w / 2, r.y + r.h * 0.8 - r.h * 0.34], slot: s.gems - last.stolen.length + k, at: now + 900 + k * 450, color: s.rooms[i]?.color ?? '#ff5a5f' });
          });
          const rooms = [...new Set(last.stolen)].map(room);
          lines.push(`Morning. ${last.stolen.length === 1 ? 'A gem is' : `${last.stolen.length} gems are`} missing from the ${rooms.join(' and the ')}.`);
          if (s.gems >= s.gemsToWin - 1) lines.push('The thieves are one gem away.');
        } else {
          sfx.chime();
          lines.push(pick(LINES.quiet));
        }
        for (const f of last?.foiled ?? []) lines.push(`A theft was foiled in the ${room(f)}. Someone is getting sloppy.`);
        if (last?.evidence) lines.push('And someone found a glove…');
        say(lines.join(' '), { interrupt: true, delay: 0.5 });
        break;
      }
      case 'talk':
        say(pick(LINES.talk), { delay: 0.2 });
        break;
      case 'vote':
        sfx.beep();
        say(pick(LINES.vote), { interrupt: true });
        break;
      case 'verdict': {
        const v = s.verdict;
        if (!v || v.nobody) {
          sfx.buzz();
          say(pick(LINES.nobody), { interrupt: true });
          break;
        }
        sfx.drumroll(2.2);
        say(`${name(v.id)} is escorted out…`, { interrupt: true });
        const role = s.roleInfo[v.role]?.label ?? v.role;
        const article = ['thief', 'guest'].includes(v.role) ? 'a' : 'the';
        setTimeout(() => {
          if (v.wasThief) sfx.sting();
          else sfx.sadTrombone();
          burst(1110, 470, 40, ROLE_COLOR[v.role] ?? '#fff', { speed: 7, size: 5 });
        }, FLIP_AT);
        say(v.wasThief ? `…and was ${article} ${role}! Well done.` : `…and was ${article} ${role}. Oops.`, { delay: 2.6, pitch: v.wasThief ? 0.8 : 1 });
        break;
      }
      case 'lastGuess':
        sfx.sting();
        say(`${name(s.lastGuessBy)} was the last thief. But if they can name the Detective, the thieves still win.`, { interrupt: true });
        break;
      case 'end':
        if (s.winner === 'thieves') sfx.evil();
        else sfx.fanfare();
        say(`${s.winner === 'thieves' ? 'The thieves win.' : 'The guests win!'} ${s.winReason}`, { interrupt: true, delay: 1 });
        break;
    }
  },

  draw(ctx, { cur: s, arena, now }) {
    const W = arena.w;
    const H = arena.h;
    const tnow = performance.now();
    const dt = Math.min(0.1, (tnow - (lastNow || tnow)) / 1000);
    lastNow = tnow;
    const T = tnow / 1000;
    const since = tnow - phaseAt;
    const day = ['reveal', 'talk', 'vote', 'verdict'].includes(s.phase);
    const target = s.phase === 'night' ? 0.08 : s.phase === 'intro' || s.phase === 'end' ? 1 : s.phase === 'lastGuess' ? 0.35 : 0.85;
    lightLevel += (target - lightLevel) * Math.min(1, dt * 2.2);

    sky(ctx, s, W, T, day);
    mansion(ctx, s, T);
    lawn(ctx, s, W, H, T);

    header(ctx, s, W, now, tnow);
    if (PHASE_LABEL[s.phase]) ribbon(ctx, phaseLine(s), 800, 176);

    switch (s.phase) {
      case 'intro':
        introOverlay(ctx, s, since, T);
        break;
      case 'talk':
        gossip(ctx, s, T);
        break;
      case 'vote':
        ballot(ctx, s, tnow, T);
        break;
      case 'verdict':
        verdict(ctx, s, since, T);
        break;
      case 'lastGuess':
        lastGuess(ctx, s, T);
        break;
      case 'end':
        ending(ctx, s, since, T);
        break;
    }

    roster(ctx, s, T, since);
    drawFlights(ctx, s, tnow);
    drawParts(ctx, tnow);
  },
};

function phaseLine(s) {
  if (s.phase === 'reveal') {
    const stolen = s.last?.stolen.length ?? 0;
    const parts = [stolen ? `${stolen} gem${stolen > 1 ? 's' : ''} stolen in the night!` : 'Nothing was stolen last night.'];
    if (s.last?.foiled?.length) parts.push('A theft was foiled.');
    if (s.last?.evidence) parts.push('Someone found evidence…');
    return parts.join(' ');
  }
  if (s.phase === 'lastGuess') {
    const p = s.players.find((x) => x.id === s.lastGuessBy);
    return `${p?.name ?? 'The Thief'} can still win by naming the Detective`;
  }
  return PHASE_LABEL[s.phase];
}

// ---- Scenery ----------------------------------------------------------------------------------

function sky(ctx, s, W, T, day) {
  const k = clamp01(lightLevel);
  const end = s.phase === 'end';
  const bg = ctx.createLinearGradient(0, 0, 0, GROUND);
  if (day) {
    bg.addColorStop(0, '#2c3d74');
    bg.addColorStop(0.6, '#8a6a9a');
    bg.addColorStop(1, '#f0a878');
  } else if (end && s.winner === 'guests') {
    bg.addColorStop(0, '#0d1236');
    bg.addColorStop(1, '#3a2a5a');
  } else {
    bg.addColorStop(0, '#05071a');
    bg.addColorStop(1, '#161b45');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, GROUND + 4);
  // stars
  if (!day) {
    for (let i = 0; i < 90; i++) {
      const x = (i * 337) % W;
      const y = (i * 151) % (GROUND - 40);
      const a = 0.35 + 0.35 * Math.sin(T * 1.5 + i);
      ctx.fillStyle = `rgba(255,250,230,${a * (1.1 - k * 0.5)})`;
      ctx.fillRect(x, y, i % 7 ? 2 : 3, i % 7 ? 2 : 3);
    }
  }
  // the moon climbs night by night; the sun rises in the morning
  if (day) {
    const glow = ctx.createRadialGradient(1460, 330, 10, 1460, 330, 220);
    glow.addColorStop(0, 'rgba(255,230,160,.9)');
    glow.addColorStop(0.25, 'rgba(255,200,120,.5)');
    glow.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(1240, 110, 440, 440);
    ctx.fillStyle = '#fff1c4';
    ctx.beginPath();
    ctx.arc(1460, 330, 44, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const n = Math.max(1, s.night || 1);
    const q = (n - 1) / Math.max(1, s.maxNights - 1);
    drawMoonDisc(ctx, 150, 400 - q * 170, 40, 0.22);
  }
}

function mansion(ctx, s, T) {
  const x0 = MX - 30;
  const x1 = MX + ROOM_W * 2 + 16 + 30;
  // chimneys and roof
  ctx.fillStyle = '#231b2e';
  ctx.fillRect(MX + 60, 196, 40, 50);
  ctx.fillRect(x1 - 130, 190, 40, 56);
  ctx.fillStyle = '#3a2c44';
  ctx.beginPath();
  ctx.moveTo(x0 - 20, TOP_Y - 6);
  ctx.lineTo(x0 + 90, 222);
  ctx.lineTo(x1 - 90, 222);
  ctx.lineTo(x1 + 20, TOP_Y - 6);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, 222, 0, TOP_Y);
  rg.addColorStop(0, '#4a3a58');
  rg.addColorStop(1, '#2a2034');
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = '#120e18';
  ctx.lineWidth = 3;
  ctx.stroke();
  // slate lines
  ctx.strokeStyle = 'rgba(0,0,0,.25)';
  ctx.lineWidth = 2;
  for (let y = 230; y < TOP_Y - 6; y += 10) {
    ctx.beginPath();
    const f = (y - 222) / (TOP_Y - 6 - 222);
    ctx.moveTo(x0 + 90 - 110 * f, y);
    ctx.lineTo(x1 - 90 + 110 * f, y);
    ctx.stroke();
  }
  // walls
  ctx.fillStyle = '#2a2131';
  ctx.fillRect(x0, TOP_Y - 8, x1 - x0, GROUND - TOP_Y + 12);
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 3;
  ctx.strokeRect(x0, TOP_Y - 8, x1 - x0, GROUND - TOP_Y + 12);
  // cornice between floors
  ctx.fillStyle = '#3a2e44';
  ctx.fillRect(x0 - 10, ROW2_Y - 12, x1 - x0 + 20, 10);
  // columns at the sides
  for (const cx of [x0 + 14, x1 - 14]) {
    const cg = ctx.createLinearGradient(cx - 12, 0, cx + 12, 0);
    cg.addColorStop(0, '#d8cfc0');
    cg.addColorStop(1, '#8a8070');
    ctx.fillStyle = cg;
    ctx.fillRect(cx - 11, TOP_Y - 4, 22, GROUND - TOP_Y + 4);
  }
  // rooms
  const last = s.phase === 'reveal' ? s.last : null;
  const stolenRooms = new Set(s.phase === 'reveal' ? s.last?.stolen ?? [] : []);
  s.rooms.forEach((r, i) => {
    const R = roomRect(i);
    const stolen = last?.stolen.filter((id) => id === r.id).length ?? 0;
    const foiled = last?.foiled.includes(r.id);
    drawRoom(ctx, r.id, R.x, R.y, R.w, R.h, { light: lightLevel, t: T + i, gem: stolenRooms.has(r.id) ? 'gone' : foiled ? 'safe' : 'gem' });
    // alarm glow
    if (stolen) {
      const a = 0.2 + 0.15 * Math.sin(T * 8);
      ctx.fillStyle = `rgba(255,60,70,${a})`;
      ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    ctx.strokeStyle = stolen ? '#ff5a5f' : foiled ? '#2ee6d6' : '#120e18';
    ctx.lineWidth = stolen || foiled ? 6 : 4;
    ctx.strokeRect(R.x, R.y, R.w, R.h);
    // brass name plate
    const label = r.label;
    ctx.font = `900 22px ${SERIF}`;
    const tw = ctx.measureText(label).width + 56;
    const px = R.x + 16;
    const py = R.y + 14;
    ctx.fillStyle = 'rgba(12,10,18,.82)';
    ctx.beginPath();
    ctx.roundRect(px, py, tw, 36, 18);
    ctx.fill();
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    roomIcon(ctx, r.id, px + 19, py + 18, 26, false);
    serif(ctx, label, px + 36, py + 26, 22, r.color, 'left');
    if (stolen) stamp(ctx, stolen > 1 ? `${stolen} GEMS STOLEN` : 'GEM STOLEN', R.x + R.w - 120, R.y + 40, '#ff5a5f');
    else if (foiled) stamp(ctx, 'FOILED', R.x + R.w - 100, R.y + 40, '#2ee6d6');
  });
}

function stamp(ctx, str, x, y, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.08);
  ctx.font = '900 22px system-ui, sans-serif';
  const w = ctx.measureText(str).width + 24;
  ctx.fillStyle = 'rgba(12,10,18,.85)';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -18, w, 36, 6);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(str, 0, 1);
  ctx.restore();
}

function lawn(ctx, s, W, H, T) {
  const lg = ctx.createLinearGradient(0, GROUND, 0, H);
  lg.addColorStop(0, lightLevel > 0.5 ? '#2a4a2e' : '#14241a');
  lg.addColorStop(1, '#0a120c');
  ctx.fillStyle = lg;
  ctx.fillRect(0, GROUND, W, H - GROUND);
  // front steps
  ctx.fillStyle = '#8a8070';
  for (let i = 0; i < 3; i++) ctx.fillRect(700 - i * 20, GROUND + i * 7, 200 + i * 40, 7);
  // hedges and lamp posts at the sides
  for (const [x, flip] of [[150, 1], [1450, -1]]) {
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = k % 2 ? '#1e3a24' : '#24452a';
      ctx.beginPath();
      ctx.ellipse(x + flip * (k * 50 - 70), GROUND - 10, 40, 34, 0, Math.PI, 0);
      ctx.fill();
    }
    // tall cypress
    ctx.fillStyle = '#16301c';
    ctx.beginPath();
    ctx.ellipse(x + flip * 70, GROUND - 120, 28, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    // lamp
    const lx = x - flip * 20;
    ctx.fillStyle = '#1a1820';
    ctx.fillRect(lx - 3, GROUND - 150, 6, 150);
    ctx.fillRect(lx - 12, GROUND - 160, 24, 14);
    const on = lightLevel < 0.6 ? 1 : 0.5;
    const glow = ctx.createRadialGradient(lx, GROUND - 168, 2, lx, GROUND - 168, 70);
    glow.addColorStop(0, `rgba(255,210,120,${0.6 * on})`);
    glow.addColorStop(1, 'rgba(255,210,120,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lx - 70, GROUND - 238, 140, 140);
    ctx.fillStyle = '#ffe2a0';
    ctx.beginPath();
    ctx.roundRect(lx - 8, GROUND - 180, 16, 20, 4);
    ctx.fill();
  }
}

// ---- Header: title, gems, clock ---------------------------------------------------------------

function header(ctx, s, W, now, tnow) {
  serif(ctx, 'Midnight Gala', 80, 84, 46, GOLD, 'left');
  const sub = s.phase === 'intro' ? `${s.players.length} guests` : s.phase === 'end' ? 'The party is over' : `Night ${s.night} of ${s.maxNights}`;
  text(ctx, sub, 82, 120, { size: 24, weight: 700, align: 'left', color: '#b8b0d0' });

  // Gem counter: a velvet tray; stolen gems glow red.
  const inFlight = flights.filter((f) => tnow < f.at + 1100).length;
  const shown = s.gems - inFlight;
  const [ax] = gemSlot(s, 0);
  const [bx] = gemSlot(s, s.gemsToWin - 1);
  ctx.fillStyle = '#3a0f1c';
  ctx.beginPath();
  ctx.roundRect(ax - 40, 50, bx - ax + 80, 70, 35);
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 3;
  ctx.stroke();
  for (let i = 0; i < s.gemsToWin; i++) {
    const [x, y] = gemSlot(s, i);
    if (i < shown) drawGem(ctx, x, y, 42, '#ff5a5f', 0.5 + 0.5 * Math.sin(tnow / 300 + i));
    else {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.beginPath();
      ctx.ellipse(x, y + 4, 18, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      drawGem(ctx, x, y, 34, '#c8c0d8', 0);
      ctx.globalAlpha = 1;
    }
  }
  text(ctx, `stolen · Thieves need ${s.gemsToWin}`, 800, 142, { size: 18, weight: 700, color: '#b8b0d0' });

  if (s.phase !== 'end' && s.phase !== 'reveal' && s.phase !== 'verdict') clock(ctx, W - 130, 92, s.left, now);
}

function clock(ctx, x, y, left, now) {
  const urgent = left <= 10;
  const r = 50;
  ctx.save();
  ctx.fillStyle = GOLD_DARK;
  ctx.fillRect(x - 6, y - r - 16, 12, 14);
  ctx.beginPath();
  ctx.arc(x, y - r - 20, 9, 0, Math.PI * 2);
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 4;
  ctx.stroke();
  const face = ctx.createRadialGradient(x - 12, y - 12, 4, x, y, r);
  face.addColorStop(0, '#fffaf0');
  face.addColorStop(1, urgent ? `rgb(255,${190 + 40 * Math.sin(now / 120)},${190 + 40 * Math.sin(now / 120)})` : '#e8dcc0');
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.strokeStyle = '#2a2034';
  ctx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * r * 0.78, y + Math.sin(a) * r * 0.78);
    ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
    ctx.stroke();
  }
  // the hand sweeps down as time runs out
  const frac = clamp01(left / phaseTotal);
  const a = -Math.PI / 2 + (1 - frac) * Math.PI * 2;
  ctx.strokeStyle = urgent ? '#c8283a' : '#2a2034';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
  ctx.stroke();
  ctx.restore();
  text(ctx, String(left), x, y + 34, { size: 22, weight: 900, color: urgent ? '#c8283a' : '#2a2034' });
}

function ribbon(ctx, str, x, y) {
  const size = fitSize(ctx, str, 30, 980, SERIF, 900);
  ctx.font = `900 ${size}px ${SERIF}`;
  const w = Math.max(460, ctx.measureText(str).width + 100);
  ctx.save();
  ctx.fillStyle = '#5a1426';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + d * (w / 2 - 10), y - 18);
    ctx.lineTo(x + d * (w / 2 + 36), y - 18);
    ctx.lineTo(x + d * (w / 2 + 18), y + 4);
    ctx.lineTo(x + d * (w / 2 + 36), y + 26);
    ctx.lineTo(x + d * (w / 2 - 10), y + 26);
    ctx.closePath();
    ctx.fill();
  }
  const rg = ctx.createLinearGradient(0, y - 28, 0, y + 22);
  rg.addColorStop(0, '#a8283e');
  rg.addColorStop(1, '#6a1426');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 28, w, 50, 6);
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
  serif(ctx, str, x, y + 8, size, '#fff3dc');
}

// ---- Guests on the lawn -----------------------------------------------------------------------

function roster(ctx, s, T, since) {
  const showDone = ['intro', 'night', 'talk', 'vote'].includes(s.phase);
  const n = s.players.length;
  const size = n > 6 ? 80 : 92;
  s.players.forEach((p, i) => {
    const [x, y] = rosterPos(s, i);
    ctx.save();
    ctx.globalAlpha = p.connected ? 1 : 0.55;
    // a little bob, like they're mingling
    const bob = p.out ? 0 : Math.sin(T * 2 + i * 1.3) * 2;
    // spotlight on the guest being escorted out, and on the last thief
    const spot = (s.phase === 'verdict' && s.verdict?.id === p.id) || (s.phase === 'lastGuess' && s.lastGuessBy === p.id);
    if (spot) {
      const sg = ctx.createRadialGradient(x, y, 10, x, y, 110);
      sg.addColorStop(0, 'rgba(255,240,200,.45)');
      sg.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(x - 110, y - 110, 220, 220);
    }
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.5, size * 0.42, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    drawGuest(ctx, x, y + bob, size, p.color, seedOf(p.id), { out: p.out });
    // the role card of someone who is out (or everyone, at the end)
    if (p.role && s.phase !== 'end') {
      ctx.save();
      ctx.translate(x + size * 0.42, y - size * 0.18);
      ctx.rotate(0.15);
      drawRoleCard(ctx, p.role, 0, 0, 40, 58);
      ctx.restore();
    }
    // a card dealt to everyone at the start
    if (s.phase === 'intro') {
      const q = clamp01((since - 400 - i * 140) / 600);
      if (q > 0) {
        const sx = 800;
        const sy = 470;
        const ex = x + size * 0.42;
        const ey = y - size * 0.2;
        const k = ease(q);
        ctx.save();
        ctx.translate(sx + (ex - sx) * k, sy + (ey - sy) * k - Math.sin(k * Math.PI) * 120);
        ctx.rotate((1 - k) * 4 + 0.15);
        drawCardBack(ctx, 0, 0, 40, 58);
        ctx.restore();
      }
    }
    if (showDone && p.done) {
      ctx.fillStyle = '#4cd97b';
      ctx.beginPath();
      ctx.arc(x - size * 0.4, y - size * 0.32, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0d0f14';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x - size * 0.4 - 7, y - size * 0.32);
      ctx.lineTo(x - size * 0.4 - 2, y - size * 0.32 + 6);
      ctx.lineTo(x - size * 0.4 + 8, y - size * 0.32 - 6);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = p.out ? 0.6 : 1;
    text(ctx, p.name, x, y + size * 0.5 + 30, { size: 24, weight: 800, color: '#f2f4f8' });
    let sub = null;
    if (p.role && s.phase !== 'end') sub = [s.roleInfo[p.role]?.label ?? p.role, ROLE_COLOR[p.role]];
    else if (!p.connected) sub = ['reconnecting', '#8a93a8'];
    else if (p.noVote && s.phase === 'vote') sub = ['no vote', '#8a93a8'];
    if (sub) text(ctx, sub[0], x, y + size * 0.5 + 54, { size: 18, weight: 800, color: sub[1] });
    ctx.globalAlpha = 1;
  });
}

// ---- Phase overlays ---------------------------------------------------------------------------

function panel(ctx, x, y, w, h, a = 0.86) {
  ctx.fillStyle = `rgba(14,10,22,${a})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 22);
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 3;
  ctx.stroke();
}

function introOverlay(ctx, s, since, T) {
  panel(ctx, 380, 300, 840, 300);
  // a fan of role cards, face down, with the Thief's peeking
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i - (n - 1) / 2) * 0.16;
    ctx.save();
    ctx.translate(800 + (i - 2) * 46, 520);
    ctx.rotate(a);
    drawCardBack(ctx, 0, -40, 96, 138, T + i);
    ctx.restore();
  }
  serif(ctx, `${s.thieves === 1 ? 'One Thief is' : `${s.thieves} Thieves are`} hiding among you`, 800, 352, 36, '#fff3dc');
  text(ctx, `They need ${s.gemsToWin} gems before dawn. Keep your screen hidden!`, 800, 580, { size: 24, weight: 700, color: '#c8c0d8' });
}

function gossip(ctx, s, T) {
  if (!s.gossip.length) {
    panel(ctx, 470, 370, 660, 150, 0.8);
    serif(ctx, 'Share what you saw… or bluff.', 800, 430, 34, '#fff3dc');
    text(ctx, 'Tap "Ready to vote" on your phone when you are done', 800, 478, { size: 22, weight: 700, color: '#c8c0d8' });
    return;
  }
  // Anonymous notes, pinned up like calling cards.
  const notes = s.gossip.slice(-3);
  const w = 900;
  notes.forEach((g, i) => {
    const y = 290 + i * 128;
    const rot = ((i % 2 ? 1 : -1) * 0.018);
    ctx.save();
    ctx.translate(800 + (i % 2 ? 30 : -30), y + 50);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,.4)';
    ctx.fillRect(-w / 2 + 6, -46, w, 104);
    const pg = ctx.createLinearGradient(0, -50, 0, 50);
    pg.addColorStop(0, '#fbf2dc');
    pg.addColorStop(1, '#e8d6b0');
    ctx.fillStyle = pg;
    ctx.fillRect(-w / 2, -52, w, 104);
    ctx.strokeStyle = 'rgba(160,110,60,.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2 + 8, -44, w - 16, 88);
    // a hat pin
    ctx.fillStyle = ROLE_COLOR.gossip;
    ctx.beginPath();
    ctx.arc(-w / 2 + 30, -38, 9, 0, Math.PI * 2);
    ctx.fill();
    const str = `“${g}”`;
    const size = fitSize(ctx, str, 34, w - 120, SERIF, 700);
    ctx.font = `italic 700 ${size}px ${SERIF}`;
    ctx.fillStyle = '#3a2418';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, 0, 2);
    ctx.restore();
  });
  text(ctx, 'Anonymous whispers', 800, 268, { size: 22, weight: 900, color: '#ffd6f3' });
}

function ballot(ctx, s, tnow, T) {
  panel(ctx, 440, 280, 720, 380, 0.88);
  const voters = s.players.filter((p) => !p.out && !p.noVote);
  const done = voters.filter((p) => p.done).length;
  // box
  const bx = 800;
  const by = 520;
  const bw = 230;
  const bh = 150;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath();
  ctx.ellipse(bx, by + bh / 2 + 6, bw * 0.6, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  const wg = ctx.createLinearGradient(bx - bw / 2, 0, bx + bw / 2, 0);
  wg.addColorStop(0, '#7a4a24');
  wg.addColorStop(1, '#4a2a12');
  ctx.fillStyle = wg;
  ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
  // top and side faces, a little in perspective
  ctx.fillStyle = '#9a6a38';
  ctx.beginPath();
  ctx.moveTo(bx - bw / 2, by - bh / 2);
  ctx.lineTo(bx - bw / 2 + 30, by - bh / 2 - 30);
  ctx.lineTo(bx + bw / 2 + 30, by - bh / 2 - 30);
  ctx.lineTo(bx + bw / 2, by - bh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#3a200c';
  ctx.beginPath();
  ctx.moveTo(bx + bw / 2, by - bh / 2);
  ctx.lineTo(bx + bw / 2 + 30, by - bh / 2 - 30);
  ctx.lineTo(bx + bw / 2 + 30, by + bh / 2 - 30);
  ctx.lineTo(bx + bw / 2, by + bh / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.strokeRect(bx - bw / 2, by - bh / 2, bw, bh);
  ctx.fillStyle = '#1a0e06';
  ctx.fillRect(bx - 40, by - bh / 2 - 19, 110, 9);
  // gold diamond emblem
  drawGem(ctx, bx, by + 6, 56, '#ff5a5f', 0.3 + 0.3 * Math.sin(T * 2));
  // envelopes falling in
  for (const d of drops) {
    const q = clamp01((tnow - d.at) / 800);
    if (q >= 1) continue;
    const k = ease(q);
    const [sx, sy] = d.from;
    const ex = bx + 5;
    const ey = by - bh / 2 - 22;
    ctx.save();
    ctx.translate(sx + (ex - sx) * k, sy + (ey - sy) * k - Math.sin(k * Math.PI) * 160);
    ctx.rotate((1 - k) * 2);
    drawEnvelope(ctx, 0, 0, 56);
    ctx.restore();
  }
  serif(ctx, `${done} of ${voters.length} votes cast`, 800, 336, 38, '#fff3dc');
  text(ctx, 'Two or more votes and the most votes is escorted out. Ties: nobody leaves.', 800, 638, { size: 19, weight: 700, color: '#c8c0d8' });
}

function verdict(ctx, s, since, T) {
  ctx.fillStyle = 'rgba(8,6,14,.9)';
  ctx.fillRect(0, 200, 1600, GROUND - 200 + 10);
  const byId = new Map(s.players.map((p) => [p.id, p]));
  // Votes: voter → target, revealed together.
  const rows = s.votes ?? [];
  serif(ctx, 'How everyone voted', 400, 262, 28, GOLD);
  rows.forEach((v, i) => {
    const col = rows.length > 6 ? i % 2 : 0;
    const row = rows.length > 6 ? Math.floor(i / 2) : i;
    const x = 110 + col * 410;
    const y = 304 + row * 64;
    const q = clamp01((since - i * 120) / 300);
    ctx.globalAlpha = q;
    const a = byId.get(v.voter);
    const t = v.target === 'nobody' ? null : byId.get(v.target);
    drawGuest(ctx, x, y, 48, a?.color ?? '#888', seedOf(v.voter));
    text(ctx, a?.name ?? '?', x + 32, y + 8, { size: 22, weight: 800, align: 'left' });
    drawEnvelope(ctx, x + 200, y, 30);
    if (t) {
      drawGuest(ctx, x + 250, y, 48, t.color, seedOf(t.id));
      text(ctx, t.name, x + 282, y + 8, { size: 22, weight: 800, align: 'left' });
    } else text(ctx, 'Nobody', x + 232, y + 8, { size: 22, weight: 800, align: 'left', color: '#8a93a8' });
    ctx.globalAlpha = 1;
  });

  const v = s.verdict;
  const cx = 1110;
  const cy = 470;
  // spotlight
  const sg = ctx.createRadialGradient(cx, cy, 20, cx, cy, 300);
  sg.addColorStop(0, 'rgba(255,240,200,.22)');
  sg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(cx - 300, cy - 300, 600, 600);
  if (!v || v.nobody) {
    serif(ctx, 'Nobody is escorted out', cx, cy - 10, 44, '#fff3dc');
    if (v?.reason) text(ctx, v.reason, cx, cy + 40, { size: 24, weight: 700, color: '#c8c0d8' });
    return;
  }
  const p = byId.get(v.id);
  const role = s.roleInfo[v.role];
  serif(ctx, `${p?.name} is escorted out…`, cx, 262, 34, '#fff3dc');
  // the card shakes during the drumroll, then turns over
  const q = clamp01((since - FLIP_AT + 250) / 500);
  const w = 230;
  const h = 330;
  ctx.save();
  ctx.translate(cx, cy + 10);
  if (q === 0) ctx.rotate(Math.sin(since / 40) * 0.02 * clamp01(since / 1500));
  const sx = Math.abs(Math.cos(q * Math.PI));
  ctx.scale(Math.max(0.02, sx), 1);
  if (q < 0.5) drawCardBack(ctx, 0, 0, w, h, T);
  else drawRoleCard(ctx, v.role, 0, 0, w, h, { seed: seedOf(v.id) });
  ctx.restore();
  if (q >= 1) {
    const art = ['thief', 'guest'].includes(v.role) ? 'a' : 'the';
    serif(ctx, `${art === 'a' ? 'A' : 'The'} ${role.label}!`, cx, cy + 222, 46, role.color);
    text(ctx, v.wasThief ? 'Well caught!' : 'An innocent guest…', cx, cy + 256, { size: 22, weight: 700, color: '#c8c0d8' });
    for (let i = 0; i < 4; i++) sparkle(ctx, cx + Math.cos(T * 1.5 + i * 1.6) * 150, cy + Math.sin(T * 1.5 + i * 1.6) * 190, 10 + 5 * Math.sin(T * 4 + i), shade(role.color, 0.5));
  }
}

function lastGuess(ctx, s, T) {
  const p = s.players.find((x) => x.id === s.lastGuessBy);
  panel(ctx, 440, 290, 720, 360);
  if (p) {
    drawGuest(ctx, 640, 470, 190, p.color, seedOf(p.id));
    ctx.save();
    ctx.translate(640 + 110, 470 - 40);
    ctx.rotate(0.12);
    drawRoleCard(ctx, 'thief', 0, 0, 90, 130);
    ctx.restore();
  }
  // the magnifying glass searches for the Detective
  drawMagnifier(ctx, 1000 + Math.cos(T * 1.3) * 60, 460 + Math.sin(T * 2.1) * 40, 150);
  serif(ctx, `${p?.name ?? 'The Thief'} was the last Thief…`, 800, 340, 32, '#fff3dc');
  text(ctx, 'Name the Detective and the Thieves still win.', 800, 620, { size: 24, weight: 700, color: '#c8c0d8' });
}

function ending(ctx, s, since, T) {
  const thieves = s.winner === 'thieves';
  ctx.fillStyle = 'rgba(8,6,14,.88)';
  ctx.fillRect(0, 160, 1600, GROUND - 160 + 10);
  // fireworks for the guests, a getaway under the moon for the thieves
  if (!thieves && Math.random() < 0.06) burst(300 + Math.random() * 1000, 200 + Math.random() * 120, 40, ['#ffc93c', '#3fa7ff', '#ff6fd8', '#4cd97b'][Math.floor(Math.random() * 4)], { speed: 6, up: 0, life: 1300, size: 4 });
  serif(ctx, thieves ? 'The Thieves win!' : 'The guests win!', 800, 250, 76, thieves ? '#ff5a5f' : '#7cc4ff');
  text(ctx, s.winReason, 800, 296, { size: 26, weight: 700, color: '#f2f4f8' });
  // everyone's card, turning over one by one
  const n = s.players.length;
  const w = Math.min(150, 1300 / n - 16);
  const h = w * 1.42;
  s.players.forEach((p, i) => {
    const x = 800 + (i - (n - 1) / 2) * (w + 16);
    const y = 480;
    const q = clamp01((since - 1200 - i * 260) / 450);
    ctx.save();
    ctx.translate(x, y);
    const sx = Math.abs(Math.cos(q * Math.PI));
    ctx.scale(Math.max(0.02, sx), 1);
    if (q < 0.5 || !p.role) drawCardBack(ctx, 0, 0, w, h, T + i);
    else drawRoleCard(ctx, p.role, 0, 0, w, h, { seed: seedOf(p.id), label: p.name });
    ctx.restore();
    if (q >= 1 && p.role) {
      const won = (p.role === 'thief') === thieves;
      text(ctx, ROLE_LABEL[p.role] ?? p.role, x, y + h / 2 + 30, { size: 20, weight: 800, color: ROLE_COLOR[p.role] });
      if (won) text(ctx, '★', x, y - h / 2 - 12, { size: 26, weight: 900, color: GOLD });
    }
  });
}

// ---- Flying things ----------------------------------------------------------------------------

function drawFlights(ctx, s, tnow) {
  flights = flights.filter((f) => tnow < f.at + 1300);
  for (const f of flights) {
    const q = clamp01((tnow - f.at) / 1100);
    if (q <= 0) {
      // the gem trembles in its case before it goes
      drawGem(ctx, f.from[0] + Math.sin(tnow / 30) * 2, f.from[1], 30, '#ff5a5f', 1);
      continue;
    }
    if (q >= 1) {
      if (!f.landed) {
        f.landed = true;
        const [x, y] = gemSlot(s, f.slot);
        burst(x, y, 20, '#ff8c8c', { speed: 4, size: 3 });
      }
      continue;
    }
    const [sx, sy] = f.from;
    const [ex, ey] = gemSlot(s, f.slot);
    const k = ease(q);
    const x = sx + (ex - sx) * k;
    const y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 140;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(q * 6);
    drawGem(ctx, 0, 0, 30 + 14 * k, '#ff5a5f', 1);
    ctx.restore();
    if (Math.random() < 0.5) parts.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: Math.random(), at: tnow, life: 400, color: '#ffb3b3', size: 3 });
  }
}

function drawParts(ctx, tnow) {
  parts = parts.filter((p) => tnow - p.at < p.life);
  for (const p of parts) {
    const age = (tnow - p.at) / 16.7;
    const x = p.x + p.vx * age;
    const y = p.y + p.vy * age + 0.06 * age * age;
    ctx.globalAlpha = 1 - (tnow - p.at) / p.life;
    sparkle(ctx, x, y, p.size * 1.6, p.color);
  }
  ctx.globalAlpha = 1;
}

// ---- How-to-play pictures (art keys in server/games/gala.js rules) ----------------------------
// These win over public/tv/games/rules/gala.js, so the intro matches the drawn mansion.

function drawRules(ctx, art, t, box, now) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const T = now / 1000;
  ctx.save();
  if (art === 'roles') {
    const roles = ['guest', 'detective', 'thief', 'bodyguard', 'gossip'];
    roles.forEach((r, i) => {
      const q = clamp01((t - i * 0.25) / 0.5);
      ctx.save();
      ctx.translate(cx + (i - 2) * 175, cy + 10 - (r === 'thief' ? 20 + Math.sin(T * 3) * 6 : 0));
      ctx.rotate((i - 2) * 0.05);
      const sx = Math.abs(Math.cos(q * Math.PI));
      ctx.scale(Math.max(0.02, sx), 1);
      if (q < 0.5) drawCardBack(ctx, 0, 0, 150, 216, T);
      else drawRoleCard(ctx, r, 0, 0, 150, 216);
      ctx.restore();
    });
  } else if (art === 'night') {
    const ids = ['library', 'ballroom', 'conservatory', 'cellar'];
    ids.forEach((id, i) => drawRoom(ctx, id, box.x + 20 + i * 245, cy - 110, 230, 190, { light: 0.15, t: T + i }));
    // guests slip into the rooms
    const colors = ['#ff5a5f', '#3fa7ff', '#4cd97b', '#ffc93c', '#b36bff'];
    colors.forEach((c, i) => {
      const room = [0, 2, 2, 3, 1][i];
      const q = ease(clamp01((t - 0.3 - i * 0.2) / 0.9));
      const sx = cx + (i - 2) * 90;
      const sy = cy + 160;
      const ex = box.x + 20 + room * 245 + 50 + (i % 2) * 120;
      const ey = cy + 30;
      drawGuest(ctx, sx + (ex - sx) * q, sy + (ey - sy) * q - Math.sin(q * Math.PI) * 60, 70, c, i * 7 + 3);
    });
  } else if (art === 'steal') {
    drawRoom(ctx, 'ballroom', cx - 300, cy - 150, 600, 300, { light: 0.2, t: T, gem: (t % 3) > 1.2 ? 'gone' : 'gem' });
    const q = clamp01(((t % 3) - 1.2) / 1);
    if (q > 0 && q < 1) drawGem(ctx, cx + 400 * ease(q), cy + 20 - Math.sin(q * Math.PI) * 160, 40, '#ffc93c', 1);
    drawGuest(ctx, cx - 160, cy + 80, 120, '#25222c', 5, { role: 'thief' });
    drawGuest(ctx, cx + 170, cy + 80, 110, '#3fa7ff', 9);
  } else if (art === 'powers') {
    const roles = [['detective', 'magnifier'], ['bodyguard', 'shield'], ['gossip', 'note']];
    roles.forEach(([r, icon], i) => {
      const x = cx + (i - 1) * 320;
      drawRoleCard(ctx, r, x, cy - 10, 160, 230);
      const bob = Math.sin(T * 3 + i) * 8;
      if (icon === 'magnifier') drawMagnifier(ctx, x + 100, cy + 100 + bob, 90);
      else if (icon === 'shield') drawShield(ctx, x + 100, cy + 100 + bob, 80, ROLE_COLOR.bodyguard);
      else {
        ctx.save();
        ctx.translate(x + 100, cy + 100 + bob);
        ctx.rotate(0.1);
        ctx.fillStyle = '#fbf2dc';
        ctx.fillRect(-50, -30, 100, 60);
        ctx.fillStyle = '#3a2418';
        ctx.font = `italic 700 22px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.fillText('“psst…”', 0, 8);
        ctx.restore();
      }
    });
  } else if (art === 'morning' || art === 'clues') {
    drawRoom(ctx, 'library', cx - 470, cy - 120, 440, 220, { light: 0.9, t: T, gem: 'gone' });
    drawRoom(ctx, 'conservatory', cx + 30, cy - 120, 440, 220, { light: 0.9, t: T, gem: 'safe' });
    stamp(ctx, 'GEM STOLEN', cx - 250, cy - 80, '#ff5a5f');
    stamp(ctx, 'FOILED', cx + 250, cy - 80, '#2ee6d6');
    drawGlove(ctx, cx, cy + 150 + Math.sin(T * 2) * 6, 70, '#ffe2a0');
  } else if (art === 'vote') {
    const colors = ['#ff5a5f', '#3fa7ff', '#4cd97b', '#ffc93c', '#b36bff'];
    colors.forEach((c, i) => {
      const x = cx + (i - 2) * 170;
      drawGuest(ctx, x, cy + 130, 90, c, i * 7 + 3);
      const q = clamp01(((t * 0.8 + i * 0.15) % 1.6) / 1);
      if (q < 1) drawEnvelope(ctx, x + (cx - x) * ease(q), cy + 60 + (-70 - 60) * ease(q) - Math.sin(q * Math.PI) * 80, 44);
    });
    ctx.fillStyle = '#6a3a1c';
    ctx.fillRect(cx - 90, cy - 80, 180, 110);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 90, cy - 80, 180, 110);
    ctx.fillStyle = '#1a0e06';
    ctx.fillRect(cx - 45, cy - 80, 90, 8);
  } else if (art === 'win') {
    for (let i = 0; i < 3; i++) drawGem(ctx, cx - 380 + i * 70, cy - 20, 56, '#ff5a5f', 0.5 + 0.5 * Math.sin(T * 3 + i));
    serif(ctx, 'Thieves', cx - 310, cy + 90, 34, '#ff5a5f');
    drawMoonDisc(ctx, cx - 120, cy - 100, 30, 0.2);
    const q = clamp01(((t % 4) - 1) / 0.5);
    ctx.save();
    ctx.translate(cx + 300, cy);
    ctx.scale(Math.max(0.02, Math.abs(Math.cos(q * Math.PI))), 1);
    if (q < 0.5) drawCardBack(ctx, 0, 0, 160, 230, T);
    else drawRoleCard(ctx, 'thief', 0, 0, 160, 230);
    ctx.restore();
    serif(ctx, 'Guests', cx + 300, cy + 160, 34, '#7cc4ff');
  }
  ctx.restore();
}
