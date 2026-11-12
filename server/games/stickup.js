// Stickup: side-view stick-figure brawler for 2–8.
//
// Joystick moves and aims, A jumps (double jump in the air; hold down + A to drop through
// thin ledges), B attacks with whatever you hold. Everyone has 100 health; knockback grows
// as you get hurt. You're out at 0 health or if you fall off the arena. Last one standing
// wins the round; first to WIN_SCORE wins the match. Rounds rotate through three arenas.
//
// Weapons drop from the sky in parachute crates; walk into one with bare fists to grab it.
// Empty weapons are tossed automatically. Headshots do 1.5x damage.
//
// All rules live here; the TV (public/tv/games/stickup.js) only draws snapshot().

const WIN_SCORE = 5;

// Fighter body (feet at x,y). The head box is the top HEAD_H of the body.
const W = 26;
const H = 72;
const HEAD_H = 22;

// Movement (arena units = TV pixels at 1600x900)
const GRAVITY = 2300;
const RUN = 430;
const ACCEL_GROUND = 4200;
const ACCEL_AIR = 2400;
const FRICTION_GROUND = 12;
const JUMP_V = 900;
const DOUBLE_JUMP_V = 760;
const MAX_FALL = 1400;

const COUNTDOWN_S = 3;
const ROUNDOVER_S = 3.5;
const SUDDEN_DEATH_S = 75; // after this, everyone slowly loses health so rounds end
const SPAWN_SHIELD_S = 1.2;
const CRATE_EVERY = [3.5, 7]; // seconds between drops
const MAX_CRATES = 3;

export const WEAPONS = {
  fists: { label: 'Fists', kind: 'melee', cooldown: 0.32, damage: 8, knock: 330, reach: 46, ammo: Infinity },
  bat: { label: 'Bat', kind: 'melee', cooldown: 0.55, damage: 18, knock: 820, reach: 78, ammo: 10 },
  pistol: { label: 'Pistol', kind: 'gun', cooldown: 0.26, damage: 12, knock: 220, speed: 1500, life: 0.9, pellets: 1, spread: 0.03, ammo: 12 },
  shotgun: { label: 'Shotgun', kind: 'gun', cooldown: 0.8, damage: 9, knock: 300, speed: 1300, life: 0.32, pellets: 5, spread: 0.32, ammo: 6 },
  grenade: { label: 'Grenade', kind: 'throw', cooldown: 0.7, damage: 48, knock: 1000, radius: 150, fuse: 1.5, ammo: 3 },
  railgun: { label: 'Railgun', kind: 'rail', cooldown: 1.0, charge: 0.55, damage: 45, knock: 700, ammo: 3 },
};
const DROPS = ['bat', 'pistol', 'pistol', 'shotgun', 'shotgun', 'grenade', 'railgun'];

// ---- Arenas -------------------------------------------------------------------------
// Platforms: { x, y, w, h, type: 'solid' | 'oneway' | 'crumble', move?: { dx, period } }
const ARENAS = [
  {
    id: 'rooftops',
    title: 'Rooftops',
    platforms: [
      { x: 0, y: 560, w: 430, h: 340, type: 'solid' },
      { x: 560, y: 650, w: 480, h: 250, type: 'solid' },
      { x: 1170, y: 530, w: 430, h: 370, type: 'solid' },
      { x: 300, y: 516, w: 64, h: 44, type: 'solid' }, // AC unit
      { x: 1250, y: 486, w: 80, h: 44, type: 'solid' },
      { x: 120, y: 390, w: 190, h: 14, type: 'oneway' },
      { x: 690, y: 450, w: 220, h: 14, type: 'oneway' },
      { x: 1300, y: 330, w: 190, h: 14, type: 'oneway' },
      { x: 460, y: 300, w: 140, h: 14, type: 'oneway' },
      { x: 1000, y: 260, w: 140, h: 14, type: 'oneway' },
    ],
    spawns: [[150, 560], [390, 516], [700, 650], [900, 650], [1300, 486], [1500, 530], [790, 450], [1390, 330]],
  },
  {
    id: 'factory',
    title: 'Factory',
    platforms: [
      { x: 0, y: 760, w: 600, h: 140, type: 'solid' },
      { x: 1000, y: 760, w: 600, h: 140, type: 'solid' },
      { x: 620, y: 700, w: 160, h: 18, type: 'solid', move: { dx: 200, period: 5 } },
      { x: 180, y: 540, w: 260, h: 14, type: 'oneway' },
      { x: 1160, y: 540, w: 260, h: 14, type: 'oneway' },
      { x: 640, y: 440, w: 320, h: 14, type: 'oneway' },
      { x: 0, y: 330, w: 170, h: 14, type: 'oneway' },
      { x: 1430, y: 330, w: 170, h: 14, type: 'oneway' },
      { x: 560, y: 690, w: 40, h: 70, type: 'solid' }, // pit edge posts
      { x: 1000, y: 690, w: 40, h: 70, type: 'solid' },
    ],
    crushers: [{ x: 230, w: 170, floor: 760 }, { x: 1200, w: 170, floor: 760 }],
    spawns: [[100, 760], [480, 760], [1120, 760], [1500, 760], [310, 540], [1290, 540], [800, 440], [80, 330]],
  },
  {
    id: 'lava',
    title: 'Lava Pit',
    platforms: [
      { x: 80, y: 700, w: 300, h: 16, type: 'oneway' },
      { x: 1220, y: 700, w: 300, h: 16, type: 'oneway' },
      { x: 600, y: 760, w: 400, h: 140, type: 'solid' },
      { x: 330, y: 560, w: 160, h: 14, type: 'crumble' },
      { x: 1110, y: 560, w: 160, h: 14, type: 'crumble' },
      { x: 700, y: 520, w: 200, h: 14, type: 'oneway' },
      { x: 120, y: 420, w: 200, h: 14, type: 'oneway' },
      { x: 1280, y: 420, w: 200, h: 14, type: 'oneway' },
      { x: 520, y: 330, w: 140, h: 14, type: 'crumble' },
      { x: 940, y: 330, w: 140, h: 14, type: 'crumble' },
      { x: 720, y: 200, w: 160, h: 14, type: 'oneway' },
    ],
    lava: { start: 900, top: 470, delay: 12, rate: 9 },
    spawns: [[180, 700], [320, 700], [1280, 700], [1420, 700], [700, 760], [900, 760], [800, 520], [220, 420]],
  },
];

export default {
  id: 'stickup',
  title: 'Stickup',
  description: 'Stick-figure brawl with weapon drops and deadly arenas. 2–8 players.',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { buttons: [{ id: 'a', label: 'Jump' }, { id: 'b', label: 'Hit' }] },

  create({ players, arena: size }) {
    const fighters = new Map(); // id -> fighter
    let arenaIdx = Math.floor(Math.random() * ARENAS.length);
    let A = null; // current arena (with live platform state)
    let phase = 'countdown';
    let timer = COUNTDOWN_S;
    let clock = 0; // seconds into the round's play
    let round = 0;
    let roundWinner = null;
    let matchWinnerId = null;
    let matchDone = false;
    let lastRound = false;
    let nextCrate = 2;
    let seq = 0;
    let bullets = [];
    let grenades = [];
    let beams = []; // railgun flashes { x1, y1, x2, y2, t }
    let explosions = []; // { x, y, r, t }
    let crates = [];
    let fx = newFx();
    let lavaY = 2000;

    function newFx() {
      return { hits: [], shots: [], booms: [], pickups: [], deaths: [], jumps: 0, crates: 0, charge: [], crush: 0, lava: 0 };
    }

    startRound();

    // ---- Round flow -------------------------------------------------------------
    function startRound() {
      round++;
      A = structuredClone(ARENAS[arenaIdx % ARENAS.length]);
      arenaIdx++;
      for (const p of A.platforms) {
        p.baseX = p.x;
        p.dx = 0;
        if (p.type === 'crumble') Object.assign(p, { touchedAt: null, goneUntil: 0 });
      }
      for (const c of A.crushers ?? []) Object.assign(c, { y: -40, h: 0, state: 'idle', t: 2 + Math.random() * 3 });
      lavaY = A.lava ? A.lava.start : 2000;

      for (const p of players.values()) if (!fighters.has(p.id)) fighters.set(p.id, { score: 0 });
      for (const id of fighters.keys()) if (!players.has(id)) fighters.delete(id);
      const entrants = [...players.values()].filter((p) => p.connected);
      const spawns = shuffle(A.spawns);
      entrants.forEach((p, i) => {
        const [x, y] = spawns[i % spawns.length];
        Object.assign(fighters.get(p.id), {
          x, y: y - 1, vx: 0, vy: 0, hp: 100, alive: true, inRound: true, grounded: false, jumpsLeft: 1,
          facing: x < size.w / 2 ? 1 : -1, aim: 0, weapon: 'fists', ammo: Infinity, cooldown: 0,
          charging: 0, swingT: 0, hurtT: 0, shield: SPAWN_SHIELD_S, prevA: false, prevB: false, dropUntil: 0,
          standingOn: null, lastHitBy: null, diedAt: null,
        });
      });
      for (const [id, f] of fighters) if (!entrants.some((p) => p.id === id)) Object.assign(f, { inRound: false, alive: false });

      bullets = [];
      grenades = [];
      beams = [];
      explosions = [];
      crates = [];
      phase = 'countdown';
      timer = COUNTDOWN_S;
      clock = 0;
      nextCrate = 1.5;
      roundWinner = null;
    }

    function update(dt) {
      for (const id of fighters.keys()) if (!players.has(id)) fighters.delete(id);
      if (phase === 'countdown') {
        timer -= dt;
        if (timer <= 0) phase = 'play';
        return;
      }
      if (phase === 'roundover') {
        timer -= dt;
        stepWorld(dt, true); // let bodies settle and effects finish
        if (timer <= 0) {
          if (lastRound) matchDone = true;
          else startRound();
        }
        return;
      }
      clock += dt;
      stepWorld(dt, false);

      const alive = [...fighters.entries()].filter(([, f]) => f.alive);
      if (alive.length <= 1) {
        if (alive.length === 1) {
          const [id, f] = alive[0];
          f.score++;
          roundWinner = players.get(id)?.name ?? '?';
          if (f.score >= WIN_SCORE) matchWinnerId = id;
        }
        lastRound = !!matchWinnerId;
        phase = 'roundover';
        timer = ROUNDOVER_S;
      }
    }

    // ---- World step --------------------------------------------------------------
    function stepWorld(dt, frozenInput) {
      const now = clock;
      // Moving and crumbling platforms
      for (const p of A.platforms) {
        if (p.move) {
          const nx = p.baseX + (Math.sin((now / p.move.period) * Math.PI * 2) * 0.5 + 0.5) * p.move.dx;
          p.dx = nx - p.x;
          p.x = nx;
        }
        if (p.type === 'crumble') {
          if (p.touchedAt != null && now - p.touchedAt > 0.8 && !p.goneUntil) p.goneUntil = now + 6;
          if (p.goneUntil && now > p.goneUntil) Object.assign(p, { goneUntil: 0, touchedAt: null });
        }
      }
      // Crushers: idle -> warn -> slam -> hold -> rise
      for (const c of A.crushers ?? []) {
        c.t -= dt;
        if (c.t > 0) continue;
        const next = { idle: ['warn', 1.1], warn: ['slam', 0.18], slam: ['hold', 0.6], hold: ['rise', 1.2], rise: ['idle', 4 + Math.random() * 3] }[c.state];
        c.state = next[0];
        c.t = next[1];
        if (c.state === 'slam') fx.crush++;
      }
      for (const c of A.crushers ?? []) {
        const full = c.floor;
        if (c.state === 'slam') c.h = full * (1 - c.t / 0.18);
        else if (c.state === 'hold') c.h = full;
        else if (c.state === 'rise') c.h = full * (c.t / 1.2);
        else c.h = c.state === 'warn' ? 30 : 0;
      }
      // Lava
      if (A.lava && now > A.lava.delay) lavaY = Math.max(A.lava.top, A.lava.start - (now - A.lava.delay) * A.lava.rate);

      for (const [id, f] of fighters) {
        if (!f.alive) continue;
        const p = players.get(id);
        const input = frozenInput ? { x: 0, y: 0, a: false, b: false } : p?.bot ? botInput(id, f) : p?.input ?? { x: 0, y: 0, a: false, b: false };
        stepFighter(id, f, input, dt);
      }
      stepBullets(dt);
      stepGrenades(dt);
      stepCrates(dt);
      beams = beams.filter((b) => (b.t -= dt) > 0);
      explosions = explosions.filter((e) => (e.t -= dt) > 0);

      // Sudden death keeps rounds from stalling.
      if (!frozenInput && now > SUDDEN_DEATH_S) for (const [id, f] of fighters) if (f.alive) hurt(id, f, 4 * dt, 0, 0, null, false, true);
    }

    function solids() {
      return A.platforms.filter((p) => !(p.type === 'crumble' && p.goneUntil));
    }

    function stepFighter(id, f, input, dt) {
      f.cooldown = Math.max(0, f.cooldown - dt);
      f.swingT = Math.max(0, f.swingT - dt);
      f.hurtT = Math.max(0, f.hurtT - dt);
      f.shield = Math.max(0, f.shield - dt);

      // Aim: stick direction, or straight ahead.
      const mag = Math.hypot(input.x, input.y);
      if (Math.abs(input.x) > 0.25) f.facing = Math.sign(input.x);
      f.aim = mag > 0.35 ? Math.atan2(input.y, input.x) : f.facing > 0 ? 0 : Math.PI;
      if (mag > 0.35 && Math.sign(Math.cos(f.aim)) !== 0) f.facing = Math.cos(f.aim) >= 0 ? 1 : -1;

      // Run
      const target = Math.abs(input.x) > 0.15 ? input.x * RUN : 0;
      const accel = f.grounded ? ACCEL_GROUND : ACCEL_AIR;
      if (target) f.vx += clamp(target - f.vx, -accel * dt, accel * dt);
      else if (f.grounded) f.vx *= Math.exp(-FRICTION_GROUND * dt);
      else f.vx *= Math.exp(-1.5 * dt);

      // Jump / double jump / drop through
      const jumpPress = input.a && !f.prevA;
      if (jumpPress) {
        if (f.grounded && input.y > 0.6 && f.standingOn && f.standingOn.type !== 'solid') {
          f.dropUntil = clock + 0.25;
          f.grounded = false;
        } else if (f.grounded) {
          f.vy = -JUMP_V;
          f.grounded = false;
          fx.jumps++;
        } else if (f.jumpsLeft > 0) {
          f.vy = -DOUBLE_JUMP_V;
          f.jumpsLeft--;
          fx.jumps++;
        }
      }
      f.prevA = input.a;

      // Attack (press for melee/throw; hold to keep firing guns; railgun charges while held)
      const w = WEAPONS[f.weapon];
      const pressed = input.b && !f.prevB;
      if (w.kind === 'rail') {
        if (input.b && f.cooldown === 0) {
          if (!f.charging) fx.charge.push(id);
          f.charging += dt;
          if (f.charging >= w.charge) {
            fireRail(id, f, w);
            f.charging = 0;
          }
        } else f.charging = 0;
      } else if (f.cooldown === 0 && (pressed || (w.kind === 'gun' && input.b))) attack(id, f, w);
      f.prevB = input.b;

      // Gravity, carry on moving platforms
      f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * dt);
      if (f.grounded && f.standingOn?.dx) f.x += f.standingOn.dx;

      // Move X, resolve against solid blocks
      f.x += f.vx * dt;
      for (const p of solids()) {
        if (p.type !== 'solid') continue;
        if (overlap(f.x - W / 2, f.y - H, W, H, p)) {
          if (f.vx > 0 || f.x < p.x + p.w / 2) f.x = p.x - W / 2 - 0.01;
          else f.x = p.x + p.w + W / 2 + 0.01;
          f.vx = 0;
        }
      }
      f.x = clamp(f.x, W / 2, size.w - W / 2);

      // Move Y, land on tops (one-way only from above)
      const prevY = f.y;
      f.y += f.vy * dt;
      f.grounded = false;
      f.standingOn = null;
      for (const p of solids()) {
        if (!overlap(f.x - W / 2, f.y - H, W, H, p)) continue;
        if (p.type === 'solid') {
          if (f.vy >= 0 && prevY <= p.y + 1) land(f, p);
          else if (f.vy < 0) {
            f.y = p.y + p.h + H;
            f.vy = 0;
          }
        } else if (f.vy >= 0 && prevY <= p.y + 1 && clock > f.dropUntil) land(f, p);
      }

      // Crushers and lava
      for (const c of A.crushers ?? []) {
        if ((c.state === 'slam' || c.state === 'hold') && f.x + W / 2 > c.x && f.x - W / 2 < c.x + c.w && f.y - H < c.h) {
          hurt(id, f, 999, 0, 0, null, false, true);
          fx.crush++;
        }
      }
      if (f.y > lavaY) {
        hurt(id, f, 70 * dt, 0, 0, null, false, true);
        f.vy = -700;
        f.jumpsLeft = 1;
        fx.lava++;
      }

      if (f.y > size.h + 160) die(id, f);
    }

    function land(f, p) {
      f.y = p.y;
      f.vy = 0;
      f.grounded = true;
      f.jumpsLeft = 1;
      f.standingOn = p;
      if (p.type === 'crumble' && p.touchedAt == null) p.touchedAt = clock;
    }

    // ---- Combat ------------------------------------------------------------------
    function attack(id, f, w) {
      f.cooldown = w.cooldown;
      const hand = handPos(f);
      if (w.kind === 'melee') {
        f.swingT = 0.18;
        fx.shots.push({ id, weapon: f.weapon });
        for (const [oid, o] of fighters) {
          if (oid === id || !o.alive) continue;
          const cx = o.x;
          const cy = o.y - H / 2;
          const dx = cx - hand.x;
          const dy = cy - hand.y;
          const d = Math.hypot(dx, dy);
          const ang = Math.abs(angleDiff(Math.atan2(dy, dx), f.aim));
          if (d < w.reach + 26 && (ang < 1.2 || d < 30)) {
            const head = o.y - H + HEAD_H > hand.y;
            hurt(oid, o, w.damage * (head ? 1.25 : 1), Math.cos(f.aim) * w.knock, -260 - Math.max(0, -Math.sin(f.aim)) * w.knock * 0.4, id, head);
          }
        }
        if (f.weapon !== 'fists') useAmmo(f);
      } else if (w.kind === 'gun') {
        for (let i = 0; i < w.pellets; i++) {
          const a = f.aim + (Math.random() - 0.5) * w.spread * 2;
          bullets.push({ id: ++seq, owner: id, x: hand.x, y: hand.y, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed, life: w.life, weapon: f.weapon });
        }
        f.vx -= Math.cos(f.aim) * (f.weapon === 'shotgun' ? 260 : 60); // recoil
        fx.shots.push({ id, weapon: f.weapon });
        useAmmo(f);
      } else if (w.kind === 'throw') {
        grenades.push({ id: ++seq, owner: id, x: hand.x, y: hand.y, vx: Math.cos(f.aim) * 760 + f.vx * 0.4, vy: Math.sin(f.aim) * 760 - 280, fuse: w.fuse });
        fx.shots.push({ id, weapon: f.weapon });
        useAmmo(f);
      }
    }

    function fireRail(id, f, w) {
      f.cooldown = w.cooldown;
      const hand = handPos(f);
      const dx = Math.cos(f.aim);
      const dy = Math.sin(f.aim);
      const len = 2400;
      beams.push({ x1: hand.x, y1: hand.y, x2: hand.x + dx * len, y2: hand.y + dy * len, t: 0.35 });
      fx.shots.push({ id, weapon: 'railgun' });
      // Goes through walls and everyone in the line.
      for (const [oid, o] of fighters) {
        if (oid === id || !o.alive) continue;
        const hit = segBox(hand.x, hand.y, hand.x + dx * len, hand.y + dy * len, o.x - W / 2, o.y - H, W, H);
        if (hit) {
          const head = segBox(hand.x, hand.y, hand.x + dx * len, hand.y + dy * len, o.x - W / 2, o.y - H, W, HEAD_H);
          hurt(oid, o, w.damage * (head ? 1.5 : 1), dx * w.knock, dy * w.knock - 200, id, head);
        }
      }
      useAmmo(f);
    }

    function useAmmo(f) {
      f.ammo--;
      if (f.ammo <= 0) {
        f.weapon = 'fists';
        f.ammo = Infinity;
      }
    }

    function stepBullets(dt) {
      const sol = solids().filter((p) => p.type === 'solid');
      bullets = bullets.filter((b) => {
        b.life -= dt;
        if (b.life <= 0) return false;
        const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / 10);
        for (let s = 0; s < steps; s++) {
          b.x += (b.vx * dt) / steps;
          b.y += (b.vy * dt) / steps;
          if (b.x < -50 || b.x > size.w + 50 || b.y < -200 || b.y > size.h + 50) return false;
          if (sol.some((p) => b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h)) return false;
          for (const [oid, o] of fighters) {
            if (oid === b.owner || !o.alive) continue;
            if (b.x > o.x - W / 2 && b.x < o.x + W / 2 && b.y > o.y - H && b.y < o.y) {
              const w = WEAPONS[b.weapon];
              const head = b.y < o.y - H + HEAD_H;
              const n = Math.hypot(b.vx, b.vy);
              hurt(oid, o, w.damage * (head ? 1.5 : 1), (b.vx / n) * w.knock, (b.vy / n) * w.knock * 0.5 - 120, b.owner, head);
              return false;
            }
          }
        }
        return true;
      });
    }

    function stepGrenades(dt) {
      const sol = solids();
      grenades = grenades.filter((g) => {
        g.fuse -= dt;
        g.vy += GRAVITY * 0.8 * dt;
        const nx = g.x + g.vx * dt;
        const ny = g.y + g.vy * dt;
        for (const p of sol) {
          if (nx > p.x && nx < p.x + p.w && ny > p.y && ny < p.y + p.h) {
            if (p.type !== 'solid' && (g.vy < 0 || g.y > p.y)) continue;
            const fromSide = g.x <= p.x || g.x >= p.x + p.w;
            if (fromSide) g.vx *= -0.5;
            else {
              g.vy *= -0.45;
              g.vx *= 0.7;
            }
            return g.fuse > 0 ? true : explode(g);
          }
        }
        g.x = clamp(nx, 5, size.w - 5);
        g.y = ny;
        if (g.fuse <= 0) return explode(g);
        return g.y < size.h + 100;
      });
    }

    function explode(g) {
      const w = WEAPONS.grenade;
      explosions.push({ x: g.x, y: g.y, r: w.radius, t: 0.45 });
      fx.booms.push({ x: Math.round(g.x), y: Math.round(g.y) });
      for (const [oid, o] of fighters) {
        if (!o.alive) continue;
        const dx = o.x - g.x;
        const dy = o.y - H / 2 - g.y;
        const d = Math.hypot(dx, dy);
        if (d > w.radius) continue;
        const k = 1 - d / w.radius;
        const n = d || 1;
        hurt(oid, o, w.damage * (0.35 + 0.65 * k), (dx / n) * w.knock * k, Math.min(-300, (dy / n) * w.knock * k) - 200 * k, g.owner, false);
      }
      return false;
    }

    function hurt(id, f, dmg, kx, ky, by, head, silent = false) {
      if (!f.alive || phase !== 'play' || (f.shield > 0 && !silent)) return;
      f.hp -= dmg;
      // Knockback grows as you get hurt.
      const scale = 1 + (1 - Math.max(0, f.hp) / 100) * 0.9;
      f.vx += kx * scale;
      f.vy += ky * scale;
      if (ky < 0) f.grounded = false;
      if (!silent) {
        f.hurtT = 0.2;
        f.lastHitBy = by;
        fx.hits.push({ x: Math.round(f.x), y: Math.round(f.y - (head ? H - 10 : H / 2)), dmg: Math.round(dmg), head });
      }
      if (f.hp <= 0) die(id, f);
    }

    function die(id, f) {
      if (!f.alive || phase !== 'play') return; // the round's result is already decided
      f.alive = false;
      f.hp = Math.max(0, f.hp);
      f.diedAt = clock;
      fx.deaths.push({ id, by: f.lastHitBy, fell: f.y > size.h });
      // Drop what you were holding.
      if (f.weapon !== 'fists' && f.y < size.h) crates.push({ id: ++seq, x: f.x, y: f.y - 40, vy: 0, weapon: f.weapon, ammo: f.ammo, landed: false, age: 0, chute: false });
    }

    // ---- Crates ------------------------------------------------------------------
    function stepCrates(dt) {
      nextCrate -= dt;
      if (phase === 'play' && nextCrate <= 0 && crates.length < MAX_CRATES) {
        nextCrate = CRATE_EVERY[0] + Math.random() * (CRATE_EVERY[1] - CRATE_EVERY[0]);
        const weapon = pick(DROPS);
        // Drop over something to land on (not into a pit).
        const ledges = solids().filter((p) => p.y < (A.lava ? lavaY - 40 : size.h) && p.w >= 60);
        const ledge = pick(ledges.length ? ledges : A.platforms);
        crates.push({ id: ++seq, x: clamp(ledge.x + 20 + Math.random() * (ledge.w - 40), 40, size.w - 40), y: -40, vy: 0, weapon, ammo: WEAPONS[weapon].ammo, landed: false, age: 0, chute: true });
        fx.crates++;
      }
      const sol = solids();
      crates = crates.filter((c) => {
        c.age += dt;
        if (c.age > 22 || c.y > size.h + 60 || c.y > lavaY) return false;
        if (!c.landed) {
          c.vy = c.chute ? 140 : Math.min(900, c.vy + GRAVITY * dt);
          const ny = c.y + c.vy * dt;
          const under = sol.find((p) => c.x > p.x && c.x < p.x + p.w && c.y <= p.y && ny >= p.y);
          if (under) {
            c.y = under.y;
            c.landed = true;
            c.on = under;
          } else c.y = ny;
        } else if (c.on) {
          c.x += c.on.dx ?? 0;
          if (c.on.type === 'crumble' && c.on.goneUntil) {
            c.landed = false;
            c.chute = false;
          }
        }
        for (const [id, f] of fighters) {
          if (!f.alive || f.weapon !== 'fists') continue;
          if (Math.abs(f.x - c.x) < W / 2 + 18 && c.y > f.y - H - 10 && c.y - 30 < f.y) {
            f.weapon = c.weapon;
            f.ammo = c.ammo;
            f.cooldown = 0.15;
            fx.pickups.push({ id, weapon: c.weapon });
            return false;
          }
        }
        return true;
      });
    }

    // ---- Bots --------------------------------------------------------------------
    // Hunt the nearest rival, grab weapons when bare-handed, stay above lava, avoid crushers.
    function botInput(id, f) {
      if (!f.bot) f.bot = { thinkAt: 0, out: { x: 0, y: 0, a: false, b: false }, jumpHeld: false };
      const st = f.bot;
      if (clock < st.thinkAt) {
        // Release jump between thoughts so the next press registers.
        return { ...st.out, a: st.jumpHeld ? (st.jumpHeld = false, true) : false };
      }
      st.thinkAt = clock + 0.12 + Math.random() * 0.15;
      const foes = [...fighters.entries()].filter(([oid, o]) => oid !== id && o.alive);
      if (!foes.length) return (st.out = { x: 0, y: 0, a: false, b: false });
      const [, foe] = foes.sort((p, q) => dist(f, p[1]) - dist(f, q[1]))[0];
      let goal = foe;
      if (f.weapon === 'fists') {
        const crate = crates.filter((c) => c.landed || c.y > 200).sort((p, q) => dist(f, p) - dist(f, q))[0];
        if (crate && dist(f, crate) < dist(f, foe) * 1.4) goal = crate;
      }
      const dx = goal.x - f.x;
      const dy = goal.y - f.y;
      const out = { x: Math.abs(dx) > 20 ? Math.sign(dx) : 0, y: 0, a: false, b: false };

      // Jump up toward higher goals, over walls, and across gaps.
      const ahead = f.x + Math.sign(out.x || f.facing) * 40;
      const groundAhead = solids().some((p) => ahead > p.x && ahead < p.x + p.w && p.y >= f.y - 2 && p.y < f.y + 220);
      const wallAhead = solids().some((p) => p.type === 'solid' && ahead > p.x && ahead < p.x + p.w && p.y < f.y - 5 && p.y + p.h > f.y - H);
      if (f.grounded && (dy < -70 || wallAhead || (!groundAhead && out.x))) out.a = true;
      else if (!f.grounded && f.vy > 200 && (dy < -40 || !groundAhead) && f.jumpsLeft > 0) out.a = true;

      // Danger: lava rising or crusher coming.
      if (A.lava && f.y > lavaY - 140 && f.grounded) out.a = true;
      for (const c of A.crushers ?? []) {
        if (c.state === 'warn' && f.x > c.x - 30 && f.x < c.x + c.w + 30) out.x = f.x < c.x + c.w / 2 ? -1 : 1;
      }

      // Fight
      const w = WEAPONS[f.weapon];
      const fd = dist(f, foe);
      const aimAt = Math.atan2(foe.y - H / 2 - (f.y - H * 0.6), foe.x - f.x);
      if (goal === foe) {
        if (w.kind === 'melee' && fd < w.reach + 30) {
          out.x = Math.sign(foe.x - f.x) * 0.3;
          out.b = Math.random() < 0.6;
        } else if (w.kind === 'gun' && fd < (f.weapon === 'shotgun' ? 380 : 900) && Math.abs(foe.y - f.y) < 140 && clearShot(f, foe)) {
          out.x = Math.cos(aimAt) * 0.5;
          out.y = Math.sin(aimAt) * 0.5;
          out.b = Math.random() < 0.7;
        } else if (w.kind === 'throw' && fd < 600) {
          out.x = Math.cos(aimAt - 0.5);
          out.y = Math.sin(aimAt - 0.5);
          out.b = Math.random() < 0.3;
        } else if (w.kind === 'rail' && fd < 1200) {
          out.x = Math.cos(aimAt) * 0.6;
          out.y = Math.sin(aimAt) * 0.6;
          out.b = true;
        }
      }
      st.jumpHeld = out.a;
      st.out = { ...out, a: false };
      return out;
    }

    function clearShot(f, o) {
      const h = handPos(f);
      return !solids().some((p) => p.type === 'solid' && segBox(h.x, h.y, o.x, o.y - H / 2, p.x, p.y, p.w, p.h));
    }

    // ---- Snapshot / views -------------------------------------------------------
    function standings() {
      return [...fighters.entries()]
        .map(([id, f]) => ({ id, name: players.get(id)?.name ?? '?', color: players.get(id)?.color ?? '#888', score: f.score }))
        .sort((x, y) => y.score - x.score);
    }

    return {
      update,

      snapshot() {
        const events = fx;
        fx = newFx();
        return {
          fx: events,
          phase,
          timer: Math.max(0, Math.ceil(timer)),
          round,
          winScore: WIN_SCORE,
          clock: Math.round(clock * 10) / 10,
          suddenDeath: clock > SUDDEN_DEATH_S,
          arena: { id: A.id, title: A.title },
          platforms: A.platforms.map(({ x, y, w, h, type, goneUntil, touchedAt }) => ({ x: Math.round(x), y, w, h, type, gone: !!goneUntil, shaking: type === 'crumble' && touchedAt != null && !goneUntil })),
          crushers: (A.crushers ?? []).map(({ x, w, h, state }) => ({ x, w, h: Math.round(h), state })),
          lavaY: A.lava ? Math.round(lavaY) : null,
          roundWinner,
          matchWinner: matchWinnerId ? players.get(matchWinnerId)?.name ?? null : null,
          players: [...fighters.entries()]
            .filter(([, f]) => f.inRound)
            .map(([id, f]) => ({
              id, name: players.get(id)?.name ?? '?', color: players.get(id)?.color ?? '#888', connected: !!players.get(id)?.connected,
              x: Math.round(f.x), y: Math.round(f.y), vx: Math.round(f.vx), vy: Math.round(f.vy), facing: f.facing, aim: Math.round(f.aim * 100) / 100,
              hp: Math.max(0, Math.round(f.hp)), alive: f.alive, grounded: f.grounded, weapon: f.weapon, ammo: f.ammo === Infinity ? null : f.ammo,
              swing: f.swingT > 0, hurt: f.hurtT > 0, shield: f.shield > 0, charging: Math.round((f.charging / WEAPONS.railgun.charge) * 100) / 100, score: f.score,
            })),
          bullets: bullets.map((b) => ({ id: b.id, x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy), weapon: b.weapon })),
          grenades: grenades.map((g) => ({ id: g.id, x: Math.round(g.x), y: Math.round(g.y), fuse: Math.round(g.fuse * 10) / 10 })),
          beams: beams.map((b) => ({ ...b, x1: Math.round(b.x1), y1: Math.round(b.y1), x2: Math.round(b.x2), y2: Math.round(b.y2) })),
          explosions: explosions.map((e) => ({ x: Math.round(e.x), y: Math.round(e.y), r: e.r, t: e.t })),
          crates: crates.map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), weapon: c.weapon, landed: c.landed, chute: c.chute && !c.landed })),
          scores: standings(),
          weapons: Object.fromEntries(Object.entries(WEAPONS).map(([k, w]) => [k, w.label])),
        };
      },

      playerView(id) {
        const f = fighters.get(id);
        if (!f?.inRound) return { status: 'Next round…' };
        if (!f.alive) return { status: 'Out! Watch the TV' };
        const w = WEAPONS[f.weapon];
        return { status: `${Math.max(0, Math.round(f.hp))} HP · ${w.label}${f.ammo !== Infinity ? ` (${f.ammo})` : ''}` };
      },

      isOver: () => matchDone,

      results() {
        return { title: matchWinnerId ? `${players.get(matchWinnerId)?.name ?? '?'} wins!` : 'Match ended', standings: standings() };
      },
    };
  },
};

// ---- Helpers ------------------------------------------------------------------------
function handPos(f) {
  return { x: f.x + Math.cos(f.aim) * 18, y: f.y - H * 0.6 + Math.sin(f.aim) * 18 };
}

function overlap(x, y, w, h, p) {
  return x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y;
}

/** Does the segment (x1,y1)-(x2,y2) cross the box? */
function segBox(x1, y1, x2, y2, bx, by, bw, bh) {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - bx], [dx, bx + bw - x1], [-dy, y1 - by], [dy, by + bh - y1]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function pick(a) {
  return a[Math.floor(Math.random() * a.length)];
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
