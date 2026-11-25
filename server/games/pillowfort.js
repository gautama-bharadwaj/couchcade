// Pillow Fort Siege: two teams build cushion forts, then pelt each other's fort with pillows.
//
// Each team has a teddy bear sitting in its fort. A round has two halves:
//   Build (35 s): cushions tumble into the laundry pile in the middle. Grab one (B), carry it
//                 home and press B again to stack it on the column in front of you.
//   Siege (75 s): hold B to wind up a pillow throw (the stick aims, the TV shows the arc),
//                 release to throw. Two pillows knock a cushion loose; a carried cushion thrown
//                 outside your fort knocks one out at once. Hit the other team's teddy to win the
//                 round. If time runs out, the fort with more cushions standing wins.
// Pillows bump enemy players back and make them drop what they carry. Your own pillows fly
// through your own fort, so you can throw from behind your walls. First team to 2 rounds wins.
//
// Forts are columns of cushions on a grid: knock one out and the ones above drop down a row.
// That keeps the physics cheap and predictable with 8 players, and it still collapses nicely.
//
// All rules live here; the TV (public/tv/games/pillowfort.js) only draws snapshot().

const WIN_ROUNDS = 2;
const COUNTDOWN_S = 3;
const BUILD_S = 35;
const SIEGE_S = 75;
const ROUNDOVER_S = 4.5;

// Layout (arena units = TV pixels at 1600x900)
const GROUND = 800;
const CELL = 44;
const COLS = 10;
const MAX_ROWS = 9;
const ZONE_X = [60, 1100]; // left edge of each team's fort area (COLS * CELL wide)
const TEDDY_COL = [1, COLS - 2]; // near the back wall
const PILE = { x0: 640, x1: 960 };

// Players
const W = 28;
const H = 64;
const GRAVITY = 2300;
const RUN = 380;
const RUN_CARRY = 300;
const ACCEL_GROUND = 3800;
const ACCEL_AIR = 2200;
const FRICTION = 12;
const JUMP_V = 830; // ~150 px: a little over three cushions
const MAX_FALL = 1400;
const REACH = CELL / 2 + W / 2 + 10;

// Throwing
const PILLOW_G = 1300;
const PILLOW_MIN = 420;
const PILLOW_MAX = 1250;
const CHARGE_S = 0.9;
const THROW_COOLDOWN = 0.35;
const HURL_SPEED = 820; // a carried cushion thrown in the siege
const CUSHION_HP = 2;
const STUN_S = 0.45;

const TEAMS = [
  { name: 'Team Moon', color: '#5aa9ff' },
  { name: 'Team Sun', color: '#ffb23c' },
];

export default {
  id: 'pillowfort',
  title: 'Pillow Fort Siege',
  description: 'Two teams build cushion forts, then pillow-bomb the other side’s teddy. 2–8 players.',
  tab: 'arcade',
  icon: '🏰',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { buttons: [{ id: 'a', label: 'Jump' }, { id: 'b', label: 'Grab / Throw' }] },

  create({ players, arena: size }) {
    const kids = new Map(); // id -> player body + team
    const teams = TEAMS.map((t) => ({ ...t, wins: 0, blocks: [], teddy: null }));
    let phase = 'countdown';
    let timer = COUNTDOWN_S;
    let clock = 0;
    let round = 0;
    let seq = 0;
    let loose = []; // cushions lying around or tumbling: { id, x, y (center), vx, vy, ang, va }
    let shots = []; // pillows and hurled cushions in flight
    let spawnT = 0;
    let roundWinner = null; // team index, -1 for a draw
    let reason = null; // 'teddy' | 'time'
    let matchWinner = null;
    let matchDone = false;
    let fx = newFx();

    function newFx() {
      return { throws: [], hits: [], knocks: [], bonks: [], pickups: 0, places: 0, drops: 0, thuds: 0, puffs: [], teddy: null };
    }

    assignTeams();
    startRound();

    // ---- Teams and rounds --------------------------------------------------------
    /** Spread humans across both teams first, then fill the smaller team with bots. */
    function assignTeams() {
      const count = [0, 0];
      for (const k of kids.values()) count[k.team]++;
      const fresh = [...players.values()].filter((p) => !kids.has(p.id));
      fresh.sort((a, b) => Number(!!a.bot) - Number(!!b.bot));
      for (const p of fresh) {
        const team = count[0] <= count[1] ? 0 : 1;
        count[team]++;
        kids.set(p.id, { team, knocks: 0, placed: 0 });
      }
    }

    function startRound() {
      round++;
      for (const id of kids.keys()) if (!players.has(id)) kids.delete(id);
      assignTeams();
      teams.forEach((t, i) => {
        t.blocks = [];
        t.teddy = { id: ++seq, team: i, col: TEDDY_COL[i], row: 0, y: GROUND - CELL, vy: 0, teddy: true, hp: Infinity };
        t.blocks.push(t.teddy);
        t.teddyFly = null;
      });
      loose = [];
      shots = [];
      spawnT = 0;
      roundWinner = null;
      reason = null;
      const perTeam = [0, 0];
      for (const [id, k] of kids) {
        const p = players.get(id);
        const slot = perTeam[k.team]++;
        // Spawn at the front of your own fort, facing the middle.
        const x = k.team === 0 ? ZONE_X[0] + COLS * CELL - 40 - slot * 36 : ZONE_X[1] + 40 + slot * 36;
        Object.assign(k, {
          x, y: GROUND, vx: 0, vy: 0, facing: k.team === 0 ? 1 : -1, grounded: true, aim: 0,
          carry: false, charge: 0, charging: false, cooldown: 0, stun: 0, prevA: false, prevB: false,
          inRound: !!p?.connected,
        });
      }
      phase = 'countdown';
      timer = COUNTDOWN_S;
      clock = 0;
    }

    function update(dt) {
      for (const id of kids.keys()) if (!players.has(id)) kids.delete(id);
      if (phase === 'countdown') {
        timer -= dt;
        if (timer <= 0) {
          phase = 'build';
          timer = BUILD_S;
        }
        return;
      }
      clock += dt;
      if (phase === 'roundover') {
        timer -= dt;
        stepWorld(dt, true);
        if (timer <= 0) {
          if (matchWinner != null) matchDone = true;
          else startRound();
        }
        return;
      }
      timer -= dt;
      stepWorld(dt, false);
      if (phase === 'build' && timer <= 0) {
        phase = 'siege';
        timer = SIEGE_S;
      } else if (phase === 'siege' && timer <= 0) {
        const [a, b] = teams.map(fortSize);
        endRound(a === b ? -1 : a > b ? 0 : 1, 'time');
      }
    }

    function endRound(winner, why) {
      if (phase === 'roundover') return;
      roundWinner = winner;
      reason = why;
      if (winner >= 0) {
        teams[winner].wins++;
        if (teams[winner].wins >= WIN_ROUNDS) matchWinner = winner;
      }
      phase = 'roundover';
      timer = ROUNDOVER_S;
    }

    const fortSize = (t) => t.blocks.length - (t.teddy && t.blocks.includes(t.teddy) ? 1 : 0);

    // ---- World step --------------------------------------------------------------
    function stepWorld(dt, frozen) {
      if (!frozen) spawnCushions(dt);
      for (const t of teams) settleFort(t, dt);
      for (const [id, k] of kids) {
        if (!k.inRound) continue;
        const p = players.get(id);
        const idle = { x: 0, y: 0, a: false, b: false };
        const input = frozen || k.stun > 0 ? idle : p?.bot ? botInput(id, k) : p?.input ?? idle;
        stepKid(id, k, input, dt);
      }
      stepLoose(dt);
      stepShots(dt);
      for (const t of teams) {
        const f = t.teddyFly;
        if (!f) continue;
        f.vy += GRAVITY * 0.6 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.ang += f.va * dt;
        if (f.y > GROUND - 20) {
          f.y = GROUND - 20;
          f.vy *= -0.35;
          f.vx *= 0.7;
          f.va *= 0.6;
        }
        if (f.x < 30 || f.x > size.w - 30) {
          f.x = clamp(f.x, 30, size.w - 30);
          f.vx *= -0.5;
        }
      }
    }

    // Cushions pour into the middle during the build, then trickle in for repairs.
    function spawnCushions(dt) {
      spawnT -= dt;
      if (spawnT > 0) return;
      const inPile = loose.filter((c) => c.x > PILE.x0 - 60 && c.x < PILE.x1 + 60).length;
      const carried = [...kids.values()].filter((k) => k.carry).length;
      const want = phase === 'build' ? 5 + kids.size : 3;
      spawnT = phase === 'build' ? 0.3 : 2.5;
      if (inPile >= want || loose.length + carried > 60) return;
      loose.push({ id: ++seq, x: PILE.x0 + Math.random() * (PILE.x1 - PILE.x0), y: -40, vx: (Math.random() - 0.5) * 120, vy: 100, ang: Math.random() * 6, va: (Math.random() - 0.5) * 6 });
    }

    /** Keep every column stacked from the ground up; blocks above a gap fall into it. */
    function settleFort(t, dt) {
      const cols = new Map();
      for (const b of t.blocks) {
        if (!cols.has(b.col)) cols.set(b.col, []);
        cols.get(b.col).push(b);
      }
      for (const list of cols.values()) {
        list.sort((p, q) => q.y - p.y); // lowest first
        list.forEach((b, i) => {
          b.row = i;
          const target = GROUND - (i + 1) * CELL;
          if (b.y < target) {
            b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
            b.y += b.vy * dt;
            if (b.y >= target) {
              if (b.vy > 350) fx.thuds++;
              b.y = target;
              b.vy = 0;
            }
          } else {
            b.y = target;
            b.vy = 0;
          }
        });
      }
    }

    function allBlocks() {
      return teams[0].blocks.concat(teams[1].blocks);
    }

    const blockX = (b) => ZONE_X[b.team] + b.col * CELL;

    /** Top of whatever is under x (a fort column or the floor). */
    function surfaceAt(x, belowY = -Infinity) {
      let top = GROUND;
      for (const b of allBlocks()) {
        const bx = blockX(b);
        if (x > bx && x < bx + CELL && b.y < top && b.y >= belowY) top = b.y;
      }
      return top;
    }

    function colHeight(team, col) {
      let n = 0;
      for (const b of teams[team].blocks) if (b.col === col) n++;
      return n;
    }

    /** The column of your own fort in front of you, or null outside it. */
    function frontCol(k) {
      const fx_ = k.x + k.facing * (W / 2 + CELL / 2 - 4);
      const col = Math.floor((fx_ - ZONE_X[k.team]) / CELL);
      return col >= 0 && col < COLS ? col : null;
    }

    // ---- Players -----------------------------------------------------------------
    function stepKid(id, k, input, dt) {
      k.cooldown = Math.max(0, k.cooldown - dt);
      k.stun = Math.max(0, k.stun - dt);
      const playing = phase === 'build' || phase === 'siege';

      const mag = Math.hypot(input.x, input.y);
      if (Math.abs(input.x) > 0.25) k.facing = Math.sign(input.x);
      k.aim = mag > 0.35 ? Math.atan2(input.y, input.x) : k.facing > 0 ? -0.6 : Math.PI + 0.6;

      // B: place / hurl / drop what you carry, else grab a cushion, else wind up a pillow.
      const pressed = input.b && !k.prevB;
      if (playing && pressed && !k.charging) {
        if (k.carry) useCarried(id, k);
        else if (!grab(id, k) && phase === 'siege' && k.cooldown === 0) {
          k.charging = true;
          k.charge = 0;
        }
      }
      if (k.charging) {
        if (phase !== 'siege') k.charging = false;
        else if (input.b) k.charge = Math.min(CHARGE_S, k.charge + dt);
        else {
          throwPillow(id, k);
          k.charging = false;
        }
      }
      k.prevB = input.b;
      if (k.charging && mag > 0.35) k.facing = Math.cos(k.aim) >= 0 ? 1 : -1;

      // Run (feet planted while winding up a throw)
      const speed = k.carry ? RUN_CARRY : RUN;
      const target = !k.charging && Math.abs(input.x) > 0.15 ? input.x * speed : 0;
      const accel = k.grounded ? ACCEL_GROUND : ACCEL_AIR;
      if (target) k.vx += clamp(target - k.vx, -accel * dt, accel * dt);
      else if (k.grounded) k.vx *= Math.exp(-FRICTION * dt);
      else k.vx *= Math.exp(-1.5 * dt);

      if (input.a && !k.prevA && k.grounded && !k.charging) {
        k.vy = -JUMP_V;
        k.grounded = false;
      }
      k.prevA = input.a;

      k.vy = Math.min(MAX_FALL, k.vy + GRAVITY * dt);
      const blocks = allBlocks();

      k.x += k.vx * dt;
      for (const b of blocks) {
        const bx = blockX(b);
        if (overlap(k.x - W / 2, k.y - H, W, H, bx, b.y, CELL, CELL)) {
          // Step up a small lip instead of stopping dead.
          if (b.y > k.y - 12 && k.grounded) {
            k.y = b.y;
            continue;
          }
          k.x = k.x < bx + CELL / 2 ? bx - W / 2 - 0.01 : bx + CELL + W / 2 + 0.01;
          k.vx = 0;
        }
      }
      k.x = clamp(k.x, W / 2 + 4, size.w - W / 2 - 4);

      const prevY = k.y;
      k.y += k.vy * dt;
      k.grounded = false;
      for (const b of blocks) {
        const bx = blockX(b);
        if (!overlap(k.x - W / 2, k.y - H, W, H, bx, b.y, CELL, CELL)) continue;
        if (k.vy >= 0 && prevY <= b.y + 14) land(k, b.y);
        else if (k.vy < 0) {
          k.y = b.y + CELL + H;
          k.vy = 0;
        }
      }
      if (k.y >= GROUND) land(k, GROUND);
    }

    function land(k, y) {
      k.y = y;
      k.vy = 0;
      k.grounded = true;
    }

    function grab(id, k) {
      let best = null;
      let bestD = Infinity;
      for (const c of loose) {
        const dx = Math.abs(c.x - k.x);
        if (dx > REACH || c.y < k.y - H - 34 || c.y > k.y + 30) continue;
        if (dx < bestD) [best, bestD] = [c, dx];
      }
      if (!best) return false;
      loose = loose.filter((c) => c !== best);
      k.carry = true;
      fx.pickups++;
      return true;
    }

    function useCarried(id, k) {
      const col = frontCol(k);
      if (col != null && colHeight(k.team, col) < MAX_ROWS) {
        place(k, col);
        kids.get(id).placed++;
      } else if (phase === 'siege') {
        const h = handPos(k);
        shots.push({ id: ++seq, kind: 'cushion', owner: id, team: k.team, x: h.x, y: h.y, vx: Math.cos(k.aim) * HURL_SPEED + k.vx * 0.3, vy: Math.sin(k.aim) * HURL_SPEED, ang: 0 });
        fx.throws.push({ kind: 'cushion' });
        k.cooldown = THROW_COOLDOWN;
      } else {
        // Outside your fort in the build: set it down in front of you.
        loose.push({ id: ++seq, x: clamp(k.x + k.facing * 30, 30, size.w - 30), y: k.y - H, vx: k.facing * 160, vy: -150, ang: 0, va: k.facing * 3 });
        fx.drops++;
      }
      k.carry = false;
    }

    function place(k, col) {
      const t = teams[k.team];
      const row = colHeight(k.team, col);
      const top = GROUND - (row + 1) * CELL;
      // Drop it in from just above the stack so it lands with a little bounce.
      const b = { id: ++seq, team: k.team, col, row, y: top - 18, vy: 0, hp: CUSHION_HP };
      t.blocks.push(b);
      fx.places++;
      // Anyone standing where it lands gets lifted on top of it.
      const bx = blockX(b);
      for (const o of kids.values()) {
        if (o.inRound && overlap(o.x - W / 2, o.y - H, W, H, bx, top, CELL, CELL)) {
          o.y = top;
          o.vy = 0;
        }
      }
    }

    function dropCarried(k, vx = 0) {
      if (!k.carry) return;
      k.carry = false;
      loose.push({ id: ++seq, x: k.x, y: k.y - H - 10, vx, vy: -260, ang: 0, va: Math.sign(vx || 1) * 5 });
      fx.drops++;
    }

    function throwPillow(id, k) {
      const power = k.charge / CHARGE_S;
      const v = PILLOW_MIN + (PILLOW_MAX - PILLOW_MIN) * power;
      const h = handPos(k);
      shots.push({ id: ++seq, kind: 'pillow', owner: id, team: k.team, x: h.x, y: h.y, vx: Math.cos(k.aim) * v, vy: Math.sin(k.aim) * v, ang: 0 });
      fx.throws.push({ kind: 'pillow', power: Math.round(power * 100) / 100 });
      k.cooldown = THROW_COOLDOWN;
      k.charge = 0;
    }

    // ---- Loose cushions and things in flight -----------------------------------
    function stepLoose(dt) {
      for (const c of loose) {
        c.vy = Math.min(MAX_FALL, c.vy + GRAVITY * 0.8 * dt);
        const prevBottom = c.y + CELL / 2;
        const nx = clamp(c.x + c.vx * dt, CELL / 2, size.w - CELL / 2);
        if (nx === CELL / 2 || nx === size.w - CELL / 2) c.vx *= -0.4;
        // Bump off the side of a taller stack.
        const surf = surfaceAt(nx);
        if (surf < prevBottom - 8) c.vx *= -0.4;
        else c.x = nx;
        c.y += c.vy * dt;
        c.ang += c.va * dt;
        const floor = surfaceAt(c.x);
        if (c.y + CELL / 2 >= floor) {
          c.y = floor - CELL / 2;
          if (c.vy > 300) {
            c.vy *= -0.3;
            fx.thuds++;
          } else c.vy = 0;
          c.vx *= Math.exp(-7 * dt);
          c.va *= Math.exp(-8 * dt);
          // Settle flat.
          const flat = Math.round(c.ang / (Math.PI / 2)) * (Math.PI / 2);
          c.ang += (flat - c.ang) * Math.min(1, 10 * dt);
        }
      }
    }

    function stepShots(dt) {
      const blocks = allBlocks();
      shots = shots.filter((s) => {
        s.vy += PILLOW_G * dt;
        s.ang += (s.vx > 0 ? 1 : -1) * 9 * dt;
        const steps = Math.ceil((Math.hypot(s.vx, s.vy) * dt) / 10);
        const r = s.kind === 'pillow' ? 13 : 18;
        for (let i = 0; i < steps; i++) {
          s.x += (s.vx * dt) / steps;
          s.y += (s.vy * dt) / steps;
          if (s.x < -60 || s.x > size.w + 60) return false;
          if (s.y >= GROUND - 4) {
            if (s.kind === 'cushion') loose.push({ id: ++seq, x: clamp(s.x, 30, size.w - 30), y: GROUND - CELL, vx: s.vx * 0.3, vy: -200, ang: s.ang, va: 4 });
            fx.puffs.push({ x: Math.round(s.x), y: GROUND });
            return false;
          }
          // Enemy players
          for (const [oid, o] of kids) {
            if (!o.inRound || o.team === s.team) continue;
            if (circleBox(s.x, s.y, r, o.x - W / 2, o.y - H, W, H)) {
              const dir = Math.sign(s.vx) || 1;
              const big = s.kind === 'cushion';
              o.vx = dir * (big ? 620 : 430);
              o.vy = big ? -520 : -380;
              o.grounded = false;
              o.stun = big ? STUN_S * 1.6 : STUN_S;
              o.charging = false;
              dropCarried(o, dir * 200);
              fx.bonks.push({ x: Math.round(o.x), y: Math.round(o.y - H / 2), id: oid, big });
              if (big) loose.push({ id: ++seq, x: s.x, y: s.y, vx: -dir * 120, vy: -300, ang: s.ang, va: -dir * 5 });
              return false;
            }
          }
          // Enemy fort (your own pillows sail through your own fort)
          for (const b of blocks) {
            if (b.team === s.team) continue;
            const bx = blockX(b);
            if (!circleBox(s.x, s.y, r - 4, bx, b.y, CELL, CELL)) continue;
            hitBlock(s, b);
            return false;
          }
        }
        return true;
      });
    }

    function hitBlock(s, b) {
      const t = teams[b.team];
      const dir = Math.sign(s.vx) || 1;
      if (b.teddy) {
        if (phase !== 'siege') return;
        t.blocks = t.blocks.filter((q) => q !== b);
        t.teddyFly = { x: blockX(b) + CELL / 2, y: b.y + CELL / 2, vx: dir * 420, vy: -700, ang: 0, va: dir * 9 };
        fx.teddy = { team: b.team, by: s.owner };
        const shooter = kids.get(s.owner);
        if (shooter) shooter.knocks += 3;
        endRound(1 - b.team, 'teddy');
        return;
      }
      const dmg = s.kind === 'cushion' ? CUSHION_HP : 1;
      b.hp -= dmg;
      fx.hits.push({ x: Math.round(s.x), y: Math.round(s.y), team: b.team });
      if (b.hp > 0) return;
      // Knocked loose: it tumbles away and the stack above drops a row.
      t.blocks = t.blocks.filter((q) => q !== b);
      const bx = blockX(b);
      loose.push({ id: ++seq, x: bx + CELL / 2, y: b.y + CELL / 2, vx: s.vx * 0.45, vy: -260 + s.vy * 0.15, ang: 0, va: dir * (4 + Math.random() * 4) });
      fx.knocks.push({ x: Math.round(bx + CELL / 2), y: Math.round(b.y + CELL / 2), team: b.team });
      const shooter = kids.get(s.owner);
      if (shooter) shooter.knocks++;
      if (s.kind === 'cushion') loose.push({ id: ++seq, x: s.x - dir * 30, y: s.y, vx: -dir * 150, vy: -250, ang: s.ang, va: -dir * 5 });
    }

    // ---- Bots --------------------------------------------------------------------
    // Build: ferry cushions from the pile and stack them in a stepped fort that roofs the teddy.
    // Siege: most bots lob pillows at the other teddy (solving the arc, with a little error);
    // one bot per team of three or more stays home to put knocked-out cushions back.
    const PLAN = [3, 5, 4, 3, 2, 2, 3, 4, 3, 2]; // wanted height per column, back wall first (teddy counts)

    function botInput(id, k) {
      if (!k.ai || k.ai.round !== round) {
        const mates = [...kids.values()].filter((o) => o.team === k.team && o.inRound);
        const teamBots = [...kids.entries()].filter(([oid, o]) => o.team === k.team && players.get(oid)?.bot);
        const keeper = mates.length >= 3 && teamBots[0]?.[0] === id;
        k.ai = { round, thinkAt: 0, out: { x: 0, y: 0, a: false, b: false }, tapB: false, holdB: false, jump: false, keeper, need: 0, lastX: k.x, stuckT: 0, err: 0 };
      }
      const ai = k.ai;
      const out = { ...ai.out };
      // Watch for being stuck while carrying a cushion.
      if (Math.abs(k.x - ai.lastX) > 25) {
        ai.lastX = k.x;
        ai.stuckT = clock;
      }

      if (k.charging) {
        // Keep the aim steady and let go once the wind-up matches the planned throw.
        out.x = ai.aimX;
        out.y = ai.aimY;
        out.b = k.charge < ai.need;
        out.a = false;
        return out;
      }
      if (clock >= ai.thinkAt) think(id, k, ai);
      const res = { ...ai.out };
      if (ai.tapB) {
        res.b = !k.prevB; // press on a fresh tick
        if (res.b) ai.tapB = false;
      }
      if (ai.holdB) res.b = true;
      if (ai.jump) {
        res.a = !k.prevA;
        if (res.a) ai.jump = false;
      }
      return res;
    }

    function think(id, k, ai) {
      ai.thinkAt = clock + 0.08 + Math.random() * 0.1;
      ai.holdB = false;
      const out = { x: 0, y: 0, a: false, b: false };
      const myZone = ZONE_X[k.team];
      const homeSide = k.team === 0 ? 1 : -1; // direction from the fort toward the middle

      const goTo = (gx, tol = 10) => {
        const dx = gx - k.x;
        if (Math.abs(dx) <= tol) return true;
        out.x = Math.sign(dx) * (Math.abs(dx) < 40 ? 0.5 : 1);
        maybeJump(k, ai, Math.sign(dx));
        return false;
      };

      if (phase === 'build' || (phase === 'siege' && ai.keeper)) {
        if (k.carry) {
          const col = pickColumn(k.team);
          if (col == null) {
            ai.tapB = true; // fort is full: drop it
          } else {
            // Stand one column toward the middle and face the target column.
            const colCenter = myZone + col * CELL + CELL / 2;
            const standX = colCenter + homeSide * (W / 2 + CELL / 2 - 4);
            if (goTo(standX, 7)) {
              out.x = -homeSide * 0.3; // turn to face it
              if (k.facing === -homeSide && frontCol(k) === col) ai.tapB = true;
            } else if (clock - ai.stuckT > 3) {
              ai.tapB = true; // can't get there: put it wherever we are
              ai.stuckT = clock;
            }
          }
        } else {
          // Fetch the nearest settled cushion (keepers stay near home).
          const cands = loose.filter((c) => Math.abs(c.vy) < 200 && (!ai.keeper || phase === 'build' || Math.abs(c.x - (myZone + (COLS * CELL) / 2)) < 420));
          const c = nearest(k, cands);
          if (c) {
            if (goTo(c.x, 14) && Math.abs(c.y - (k.y - CELL / 2)) < 60) ai.tapB = true;
            else if (c.y < k.y - H - 20 && Math.abs(c.x - k.x) < 60 && k.grounded) ai.jump = true;
          } else if (phase === 'siege') {
            goTo(myZone + (k.team === 0 ? COLS * CELL - 20 : 20), 30);
          }
        }
        ai.out = out;
        return;
      }

      if (phase !== 'siege') {
        ai.out = out;
        return;
      }
      const foe = teams[1 - k.team];
      const target = foe.teddyFly ? null : foe.teddy;
      if (!target) {
        ai.out = out;
        return;
      }
      const tx = blockX(target) + CELL / 2;
      const ty = target.y + CELL / 2;

      if (k.carry) {
        // Hurl it once we're out of our own fort and close enough.
        const inOwn = frontCol(k) != null;
        const dx = tx - k.x;
        if (!inOwn && Math.abs(dx) < 700) {
          const aim = Math.atan2(-0.55, Math.sign(dx));
          out.x = Math.cos(aim);
          out.y = Math.sin(aim);
          ai.tapB = true;
        } else goTo(k.x + Math.sign(dx) * 200, 5);
        ai.out = out;
        return;
      }
      // Grab a cushion lying right at our feet to hurl it.
      const near = nearest(k, loose.filter((c) => Math.abs(c.x - k.x) < 26 && Math.abs(c.vy) < 100 && c.y > k.y - H - 20));
      if (near && Math.random() < 0.5) {
        ai.tapB = true;
        ai.out = out;
        return;
      }
      // Find a throwing spot just outside our fort, then lob.
      const spot = k.team === 0 ? ZONE_X[0] + COLS * CELL + 60 + ((hash(id) % 5) * 30) : ZONE_X[1] - 60 - ((hash(id) % 5) * 30);
      const atSpot = Math.abs(k.x - spot) < 120 && k.grounded;
      if (!atSpot) {
        goTo(spot, 20);
        ai.out = out;
        return;
      }
      if (k.cooldown > 0) {
        ai.out = out;
        return;
      }
      const sol = solveLob(k, tx, ty);
      if (!sol) {
        goTo(k.x + Math.sign(tx - k.x) * 120, 5);
        ai.out = out;
        return;
      }
      ai.aimX = Math.cos(sol.aim);
      ai.aimY = Math.sin(sol.aim);
      ai.need = sol.charge;
      // Press B with the stick already pointing; botInput holds it until the wind-up is right.
      ai.tapB = true;
      ai.out = { x: ai.aimX, y: ai.aimY, a: false, b: false };
    }

    /** Least-built column of the plan (relative to its wanted height), back wall first. */
    function pickColumn(team) {
      let best = null;
      let bestR = Infinity;
      for (let i = 0; i < COLS; i++) {
        const col = team === 0 ? i : COLS - 1 - i;
        const h = colHeight(team, col);
        if (h >= MAX_ROWS) continue;
        const r = h / PLAN[i];
        if (r < bestR - 1e-6) [best, bestR] = [col, r];
      }
      return best;
    }

    function maybeJump(k, ai, dir) {
      if (!k.grounded) return;
      const ahead = k.x + dir * (W / 2 + 10);
      const wall = allBlocks().some((b) => {
        const bx = blockX(b);
        return ahead > bx && ahead < bx + CELL && b.y < k.y - 4 && b.y + CELL > k.y - H;
      });
      if (wall) ai.jump = true;
    }

    /** Speed and angle to land a pillow on (tx, ty), with a little human error. */
    function solveLob(k, tx, ty) {
      const dir = Math.sign(tx - k.x) || 1;
      for (const lift of [0.95, 0.8, 1.15, 0.65]) {
        const aim = dir > 0 ? -lift : Math.PI + lift;
        const h = handPos({ ...k, aim });
        const D = Math.abs(tx - h.x);
        const dy = ty - h.y;
        const denom = 2 * Math.cos(lift) ** 2 * (dy + D * Math.tan(lift));
        if (denom <= 0) continue;
        let v = Math.sqrt((PILLOW_G * D * D) / denom);
        v *= 1 + (Math.random() - 0.5) * 0.08;
        if (v < PILLOW_MIN || v > PILLOW_MAX) continue;
        return { aim: aim + (Math.random() - 0.5) * 0.05, charge: ((v - PILLOW_MIN) / (PILLOW_MAX - PILLOW_MIN)) * CHARGE_S };
      }
      return null;
    }

    function nearest(k, list) {
      let best = null;
      let bestD = Infinity;
      for (const c of list) {
        const d = Math.abs(c.x - k.x) + Math.abs(c.y - k.y) * 0.5;
        if (d < bestD) [best, bestD] = [c, d];
      }
      return best;
    }

    // ---- Snapshot / views -------------------------------------------------------
    function standings() {
      return [...kids.entries()]
        .map(([id, k]) => ({ id, name: players.get(id)?.name ?? '?', color: players.get(id)?.color ?? '#888', score: teams[k.team].wins, knocks: k.knocks, team: k.team }))
        .sort((x, y) => y.score - x.score || y.knocks - x.knocks)
        .map(({ id, name, color, score }) => ({ id, name, color, score }));
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
          winRounds: WIN_ROUNDS,
          ground: GROUND,
          cell: CELL,
          cols: COLS,
          zones: ZONE_X,
          pile: PILE,
          throwing: { g: PILLOW_G, min: PILLOW_MIN, max: PILLOW_MAX, hurl: HURL_SPEED },
          teams: teams.map((t) => ({ name: t.name, color: t.color, wins: t.wins, size: fortSize(t) })),
          blocks: allBlocks()
            .filter((b) => !b.teddy)
            .map((b) => ({ id: b.id, t: b.team, x: blockX(b), y: Math.round(b.y), hp: b.hp })),
          teddies: teams.map((t, i) => (t.teddyFly
            ? { t: i, x: Math.round(t.teddyFly.x), y: Math.round(t.teddyFly.y), ang: Math.round(t.teddyFly.ang * 100) / 100, down: true }
            : { t: i, x: blockX(t.teddy) + CELL / 2, y: Math.round(t.teddy.y + CELL / 2), ang: 0, down: false })),
          loose: loose.map((c) => ({ id: c.id, x: Math.round(c.x), y: Math.round(c.y), ang: Math.round(c.ang * 100) / 100 })),
          shots: shots.map((s) => ({ id: s.id, k: s.kind === 'pillow' ? 'p' : 'c', t: s.team, x: Math.round(s.x), y: Math.round(s.y), ang: Math.round(s.ang * 100) / 100 })),
          players: [...kids.entries()]
            .filter(([, k]) => k.inRound)
            .map(([id, k]) => {
              const p = players.get(id);
              const col = k.carry ? frontCol(k) : null;
              const place = col != null && colHeight(k.team, col) < MAX_ROWS ? { x: ZONE_X[k.team] + col * CELL, y: GROUND - (colHeight(k.team, col) + 1) * CELL } : null;
              const hand = handPos(k);
              return {
                id, name: p?.name ?? '?', color: p?.color ?? '#888', connected: !!p?.connected, t: k.team,
                x: Math.round(k.x), y: Math.round(k.y), facing: k.facing, grounded: k.grounded,
                aim: Math.round(k.aim * 100) / 100, carry: k.carry, stun: k.stun > 0,
                charge: k.charging ? Math.round((k.charge / CHARGE_S) * 100) / 100 : null,
                hand: { x: Math.round(hand.x), y: Math.round(hand.y) },
                place,
              };
            }),
          roundWinner,
          reason,
          matchWinner,
        };
      },

      playerView(id) {
        const k = kids.get(id);
        if (!k?.inRound) return { status: 'Next round…' };
        const team = teams[k.team].name;
        if (phase === 'countdown') return { status: `${team} · get ready to build` };
        if (phase === 'roundover') return { status: `${team} · round over` };
        if (k.stun > 0) return { status: `${team} · bonked!` };
        if (phase === 'build') return { status: `${team} · ${k.carry ? (frontCol(k) != null ? 'B: stack it here' : 'Carry it home') : 'Grab a cushion (B)'}` };
        if (k.carry) return { status: `${team} · ${frontCol(k) != null ? 'B: patch the fort' : 'B: hurl it!'}` };
        return { status: `${team} · ${k.charging ? 'Aim with the stick, let go!' : 'Hold B to throw'}` };
      },

      isOver: () => matchDone,

      results() {
        const title = matchWinner != null ? `${teams[matchWinner].name} wins!` : 'Match ended';
        return { title, standings: standings() };
      },
    };
  },
};

// ---- Helpers ------------------------------------------------------------------------
function handPos(k) {
  return { x: k.x + Math.cos(k.aim) * 20, y: k.y - H * 0.75 + Math.sin(k.aim) * 20 };
}

function overlap(x, y, w, h, bx, by, bw, bh) {
  return x < bx + bw && x + w > bx && y < by + bh && y + h > by;
}

function circleBox(cx, cy, r, bx, by, bw, bh) {
  const nx = clamp(cx, bx, bx + bw);
  const ny = clamp(cy, by, by + bh);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function hash(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
