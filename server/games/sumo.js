// Sumo Spin: push everyone off a round platform that spins and tilts under your feet.
//
// Joystick moves. Hold A to charge (you move slowly but brace against hits), let go to lunge;
// the longer the charge, the harder the lunge. B is a tiny dodge: a short sidestep that lets
// a lunge pass straight through you. Dodge in the last moment before a lunge lands
// ("perfect dodge") and the lunger stumbles on past you while your next lunge is instantly
// fully charged.
//
// The platform carries you around as it spins (the outside moves fastest), and gravity pulls
// everyone toward its low side as it tilts more and more. After a while the edge starts to
// crumble so every round ends. Last one on wins the round; first to WIN_SCORE wins the match.
//
// All rules live here; the TV (public/tv/games/sumo.js) only draws snapshot().

const WIN_SCORE = 3;

// Bodies (arena units = TV pixels at 1600x900)
const R = 30;
const ACCEL = 1500; // stick push, units/s^2
const CHARGE_MOVE = 0.35; // move this much slower while charging
const MAX_SPEED = 340; // relative to the platform under you
const GRIP = 2.8; // how fast you settle to the platform's motion, per second
const STUMBLE_GRIP = 0.6; // grip while stumbling after a dodged lunge
const BOUNCE = 0.8;
const BUMP = 120; // extra shove on every hit, so contact always matters
const BRACE = 0.6; // knockback taken while charging

// Charge + lunge
const CHARGE_S = 0.9; // hold this long for a full charge
const LUNGE_MIN = 380;
const LUNGE_MAX = 980;
const LUNGE_S = 0.28; // how long a lunge hits hard
const LUNGE_POWER = 2.2; // knockback multiplier of a full-power lunge
const LUNGE_COOLDOWN_S = 0.5;

// Dodge
const DODGE_S = 0.2; // the window where lunges pass through you
const DODGE_HOP = 260;
const DODGE_COOLDOWN_S = 1.1;
const STUMBLE_S = 0.6;
const COUNTER_S = 2.5; // how long a perfect dodge's free full charge waits for you

// Platform
const PLATFORM_R = 380;
const CALM_S = 3; // no tilt for the first seconds
const TILT_RATE = 0.012; // tilt gained per second
const TILT_MAX = 0.5;
const TILT_G = 1500; // downhill pull at tilt 1
const SPIN_START = 0.3; // rad/s
const SPIN_MAX = 0.95;
const CRUMBLE_S = 45; // after this, the edge crumbles
const CRUMBLE_RATE = 9;

const COUNTDOWN_S = 3;
const ROUNDOVER_S = 3;

export default {
  id: 'sumo',
  title: 'Sumo Spin',
  description: 'Charge and shove on a spinning, tilting ring. Time a dodge perfectly. First to 3.',
  category: 'action',
  icon: '🌀',
  minPlayers: 1, // 1 = practice mode; it's a real game from 2
  maxPlayers: 8,
  controller: { buttons: [{ id: 'a', label: 'Charge' }, { id: 'b', label: 'Dodge' }] },

  create({ players, arena }) {
    const cx = arena.w / 2;
    const cy = arena.h / 2;

    /** @type {Map<string, object>} per-player physics + match state */
    const bodies = new Map();
    let phase = 'countdown';
    let timer = COUNTDOWN_S;
    let clock = 0; // seconds into the current round's play
    let round = 0;
    let roundWinner = null;
    let matchWinnerId = null;
    let solo = false;
    let lastRound = false;
    let matchDone = false;
    // Platform state
    let radius = PLATFORM_R;
    let angle = 0;
    let spin = SPIN_START;
    let spinTarget = SPIN_START;
    let nextSpinChange = 0;
    let tilt = 0;
    let tiltDir = 0; // direction of the low side, radians
    let tiltDrift = 0.45; // rad/s the low side wanders around the ring
    let fx = newFx();

    function newFx() {
      return { bumps: [], lunges: [], dodges: 0, perfects: [], falls: [], flip: false };
    }

    startRound();

    function startRound() {
      round++;
      for (const p of players.values()) if (!bodies.has(p.id)) bodies.set(p.id, { score: 0 });
      for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);

      const entrants = [...players.values()].filter((p) => p.connected);
      solo = entrants.length <= 1;
      const spawnR = PLATFORM_R * 0.55;
      const turn = Math.random() * Math.PI * 2;
      entrants.forEach((p, i) => {
        const a = turn + (i / entrants.length) * Math.PI * 2;
        Object.assign(bodies.get(p.id), {
          x: cx + Math.cos(a) * spawnR,
          y: cy + Math.sin(a) * spawnR,
          vx: 0,
          vy: 0,
          facing: a + Math.PI, // toward the middle
          alive: true,
          inRound: true,
          fellAt: null,
          charge: 0,
          charging: false,
          lungeUntil: -1,
          lungePower: 0,
          lungeReadyAt: 0,
          dodgeUntil: -1,
          dodgeReadyAt: 0,
          stumbleUntil: -1,
          counterUntil: -1,
          passedBy: new Set(), // lunges already dodged this window (by lunger id)
          prevA: false,
          prevB: false,
          bot: null,
        });
      });
      for (const [id, b] of bodies) if (!entrants.some((p) => p.id === id)) Object.assign(b, { inRound: false, alive: false });

      phase = 'countdown';
      timer = COUNTDOWN_S;
      clock = 0;
      radius = PLATFORM_R;
      spin = spinTarget = (Math.random() < 0.5 ? -1 : 1) * SPIN_START;
      nextSpinChange = 6 + Math.random() * 3;
      tilt = 0;
      tiltDir = Math.random() * Math.PI * 2;
      tiltDrift = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.2);
      roundWinner = null;
    }

    function update(dt) {
      for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);

      if (phase === 'countdown') {
        timer -= dt;
        angle += spin * dt; // the ring already turns while you wait
        if (timer <= 0) phase = 'play';
        return;
      }
      if (phase === 'roundover') {
        timer -= dt;
        angle += spin * dt;
        if (timer <= 0) {
          if (lastRound) matchDone = true;
          else startRound();
        }
        return;
      }

      // --- play ---
      clock += dt;
      stepPlatform(dt);

      const live = [...bodies.entries()].filter(([, b]) => b.alive);
      for (const [id, b] of live) {
        const p = players.get(id);
        const input = p?.bot ? botInput(id, b, live) : p?.input ?? { x: 0, y: 0, a: false, b: false };
        stepBody(id, b, input, dt);
      }

      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) collide(live[i], live[j]);
      }

      for (const [id, b] of live) {
        if (Math.hypot(b.x - cx, b.y - cy) > radius) {
          b.alive = false;
          b.fellAt = clock;
          b.charging = false;
          fx.falls.push({ id, x: Math.round(b.x), y: Math.round(b.y) });
        }
      }

      const alive = [...bodies.entries()].filter(([, b]) => b.alive);
      if ((solo && alive.length === 0) || (!solo && alive.length <= 1)) {
        if (!solo && alive.length === 1) {
          const [winnerId, wb] = alive[0];
          wb.score++;
          roundWinner = players.get(winnerId)?.name ?? '?';
          if (wb.score >= WIN_SCORE) matchWinnerId = winnerId;
        }
        lastRound = !!matchWinnerId || (solo && round >= WIN_SCORE); // practice: 3 rounds, then results
        phase = 'roundover';
        timer = ROUNDOVER_S;
      }
    }

    function stepPlatform(dt) {
      // Spin wanders between speeds and sometimes flips direction; faster as the round goes on.
      if (clock >= nextSpinChange) {
        const top = Math.min(SPIN_MAX, 0.45 + clock * 0.012);
        const flip = Math.random() < 0.4;
        const sign = Math.sign(spinTarget || 1) * (flip ? -1 : 1);
        spinTarget = sign * (0.25 + Math.random() * (top - 0.25));
        nextSpinChange = clock + 5 + Math.random() * 4;
        if (flip) fx.flip = true;
      }
      spin += (spinTarget - spin) * Math.min(1, dt * 0.8);
      angle += spin * dt;

      // Tilt grows; the low side drifts around the ring.
      tilt = Math.min(TILT_MAX, Math.max(0, clock - CALM_S) * TILT_RATE);
      tiltDir += tiltDrift * dt;

      if (clock > CRUMBLE_S) radius = Math.max(R * 2, PLATFORM_R - (clock - CRUMBLE_S) * CRUMBLE_RATE);
    }

    function stepBody(id, b, input, dt) {
      const mag = Math.hypot(input.x, input.y);
      if (mag > 0.3) b.facing = Math.atan2(input.y, input.x);

      // Charge while A is held; lunge on release.
      if (input.a && clock >= b.lungeReadyAt) {
        if (!b.charging) {
          b.charging = true;
          b.charge = clock < b.counterUntil ? 1 : 0;
          b.counterUntil = -1;
        }
        b.charge = Math.min(1, b.charge + dt / CHARGE_S);
      }
      if (!input.a && b.charging) lunge(id, b, input, mag);
      b.prevA = input.a;

      // Dodge on the press of B.
      if (input.b && !b.prevB && clock >= b.dodgeReadyAt) {
        let dx = input.x;
        let dy = input.y;
        let len = mag;
        if (len < 0.2) {
          // No stick: hop sideways from where you face.
          dx = -Math.sin(b.facing);
          dy = Math.cos(b.facing);
          len = 1;
        }
        b.vx += (dx / len) * DODGE_HOP;
        b.vy += (dy / len) * DODGE_HOP;
        b.dodgeUntil = clock + DODGE_S;
        b.dodgeReadyAt = clock + DODGE_COOLDOWN_S;
        b.passedBy.clear();
        fx.dodges++;
      }
      b.prevB = input.b;

      // Stick, then the tilt pulling you downhill.
      const push = ACCEL * (b.charging ? CHARGE_MOVE : 1);
      b.vx += input.x * push * dt + Math.cos(tiltDir) * tilt * TILT_G * dt;
      b.vy += input.y * push * dt + Math.sin(tiltDir) * tilt * TILT_G * dt;

      // Grip: settle toward the motion of the platform under you (so it carries you around).
      const sx = -spin * (b.y - cy);
      const sy = spin * (b.x - cx);
      let rx = b.vx - sx;
      let ry = b.vy - sy;
      const grip = clock < b.stumbleUntil ? STUMBLE_GRIP : GRIP;
      const decay = Math.exp(-grip * dt);
      rx *= decay;
      ry *= decay;
      const speed = Math.hypot(rx, ry);
      if (clock > b.lungeUntil && clock > b.stumbleUntil && speed > MAX_SPEED) {
        rx = (rx / speed) * MAX_SPEED;
        ry = (ry / speed) * MAX_SPEED;
      }
      b.vx = sx + rx;
      b.vy = sy + ry;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    function lunge(id, b, input, mag) {
      const power = b.charge;
      b.charging = false;
      b.charge = 0;
      const dir = mag > 0.3 ? Math.atan2(input.y, input.x) : b.facing;
      b.facing = dir;
      const v = LUNGE_MIN + (LUNGE_MAX - LUNGE_MIN) * power;
      b.vx += Math.cos(dir) * v;
      b.vy += Math.sin(dir) * v;
      b.lungeUntil = clock + LUNGE_S;
      b.lungePower = power;
      b.lungeReadyAt = clock + LUNGE_COOLDOWN_S;
      fx.lunges.push({ id, power: Math.round(power * 100) / 100 });
    }

    function collide([aid, a], [bid, b]) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist >= R * 2) return;

      // A dodging body lets everything pass through. Dodging a lunge is a perfect dodge.
      const aDodge = clock < a.dodgeUntil;
      const bDodge = clock < b.dodgeUntil;
      if (aDodge || bDodge) {
        if (aDodge && clock < b.lungeUntil) perfect(aid, a, bid, b);
        if (bDodge && clock < a.lungeUntil) perfect(bid, b, aid, a);
        return;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const overlap = (R * 2 - dist) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) return;
      const j = ((1 + BOUNCE) * vn) / 2;
      const aPow = clock < a.lungeUntil ? 1 + (LUNGE_POWER - 1) * (0.4 + 0.6 * a.lungePower) : 1;
      const bPow = clock < b.lungeUntil ? 1 + (LUNGE_POWER - 1) * (0.4 + 0.6 * b.lungePower) : 1;
      const aTake = bPow * (a.charging ? BRACE : 1);
      const bTake = aPow * (b.charging ? BRACE : 1);
      a.vx -= nx * (j + BUMP) * aTake;
      a.vy -= ny * (j + BUMP) * aTake;
      b.vx += nx * (j + BUMP) * bTake;
      b.vy += ny * (j + BUMP) * bTake;
      // A hit spends the lunge, so one lunge can't bowl through the whole ring at full power.
      if (aPow > 1) a.lungeUntil = clock;
      if (bPow > 1) b.lungeUntil = clock;
      fx.bumps.push({ x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), power: Math.min(1, (vn * Math.max(aPow, bPow)) / 1100) });
    }

    function perfect(did, d, lid, l) {
      if (d.passedBy.has(lid)) return;
      d.passedBy.add(lid);
      l.stumbleUntil = clock + STUMBLE_S; // the lunger skids on past
      l.lungeUntil = clock; // and can't hit anyone else with it
      d.counterUntil = clock + COUNTER_S;
      fx.perfects.push({ id: did, by: lid, x: Math.round(d.x), y: Math.round(d.y) });
    }

    // ---- Bots ---------------------------------------------------------------------
    // Stay uphill and away from the edge, stalk the nearest rival, charge up and lunge when
    // lined up, and sometimes dodge an incoming lunge (not always in time).
    function botInput(id, b, live) {
      if (!b.bot) b.bot = { thinkAt: 0, out: { x: 0, y: 0, a: false, b: false }, want: 0.5 + Math.random() * 0.5 };
      const st = b.bot;
      if (clock < st.thinkAt) return { ...st.out, b: false };
      st.thinkAt = clock + 0.09 + Math.random() * 0.14;

      const out = { x: 0, y: 0, a: st.out.a, b: false };
      const fromC = Math.hypot(b.x - cx, b.y - cy);
      const foes = live.filter(([oid]) => oid !== id).map(([oid, o]) => ({ id: oid, o, d: Math.hypot(o.x - b.x, o.y - b.y) }));
      foes.sort((p, q) => p.d - q.d);

      // Incoming lunge? Try to dodge it.
      if (clock >= b.dodgeReadyAt) {
        for (const { o, d } of foes) {
          if (clock >= o.lungeUntil || d > 190) continue;
          const toward = ((b.x - o.x) * o.vx + (b.y - o.y) * o.vy) / (d * (Math.hypot(o.vx, o.vy) || 1));
          if (toward > 0.7 && Math.random() < 0.3) {
            out.b = true;
            // Sidestep across the lunge, toward the middle where possible.
            out.x = -o.vy;
            out.y = o.vx;
            if (out.x * (cx - b.x) + out.y * (cy - b.y) < 0) {
              out.x = -out.x;
              out.y = -out.y;
            }
            const len = Math.hypot(out.x, out.y) || 1;
            out.x /= len;
            out.y /= len;
            st.out = { ...out, b: false };
            return out;
          }
        }
      }

      let tx;
      let ty;
      const danger = fromC > radius * 0.68;
      if (danger) {
        // Back to the middle, leaning uphill against the tilt.
        tx = cx - b.x - Math.cos(tiltDir) * 200 * tilt;
        ty = cy - b.y - Math.sin(tiltDir) * 200 * tilt;
        out.a = false; // releasing a charge here would be a waste, but it's better than charging
      } else if (foes.length) {
        const { o, d } = foes[0];
        tx = o.x - b.x;
        ty = o.y - b.y;
        // Lean uphill a little so the tilt doesn't carry you away.
        tx -= Math.cos(tiltDir) * 120 * tilt;
        ty -= Math.sin(tiltDir) * 120 * tilt;
        if (clock >= b.lungeReadyAt) {
          if (!b.charging && d < 340 && Math.random() < 0.5) out.a = true;
          else if (b.charging && (d < 150 || b.charge >= st.want) && d < 260) {
            out.a = false; // release: lunge at them
            st.want = 0.4 + Math.random() * 0.6;
          }
        }
        if (b.charging && d > 420) out.a = false;
      } else {
        tx = cx - b.x;
        ty = cy - b.y;
        out.a = false;
      }
      const len = Math.hypot(tx, ty) || 1;
      out.x = tx / len;
      out.y = ty / len;
      st.out = out;
      return out;
    }

    function standings() {
      return [...bodies.entries()]
        .map(([id, b]) => ({ id, name: players.get(id)?.name ?? '?', color: players.get(id)?.color ?? '#888', score: b.score }))
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
          solo,
          clock: Math.round(clock * 10) / 10,
          platform: {
            x: cx,
            y: cy,
            r: Math.round(radius),
            full: PLATFORM_R,
            angle: Math.round(angle * 1000) / 1000,
            spin: Math.round(spin * 100) / 100,
            tilt: Math.round((tilt / TILT_MAX) * 100) / 100, // 0..1
            tiltDir: Math.round(tiltDir * 1000) / 1000,
            crumbling: clock > CRUMBLE_S && phase === 'play',
          },
          roundWinner,
          matchWinner: matchWinnerId ? players.get(matchWinnerId)?.name ?? null : null,
          players: [...bodies.entries()]
            .filter(([, b]) => b.inRound)
            .map(([id, b]) => {
              const p = players.get(id);
              return {
                id,
                name: p?.name ?? '?',
                color: p?.color ?? '#888',
                connected: !!p?.connected,
                x: Math.round(b.x),
                y: Math.round(b.y),
                r: R,
                facing: Math.round(b.facing * 100) / 100,
                alive: b.alive,
                charge: b.charging ? Math.round(b.charge * 100) / 100 : 0,
                lunging: clock < b.lungeUntil,
                dodging: clock < b.dodgeUntil,
                stumbling: clock < b.stumbleUntil,
                counter: clock < b.counterUntil,
                score: b.score,
              };
            }),
          scores: standings().filter((s) => bodies.get(s.id)?.inRound || s.score > 0),
        };
      },

      playerView(id) {
        const b = bodies.get(id);
        if (!b) return { status: 'Joining next round…' };
        let status;
        if (!b.inRound) status = 'You’re in next round';
        else if (phase === 'countdown') status = `Get ready… ${Math.ceil(timer)}`;
        else if (phase === 'roundover') status = roundWinner ? `${roundWinner} wins the round` : 'Draw!';
        else if (!b.alive) status = 'You fell! Watch the TV';
        else if (clock < b.counterUntil) status = 'Perfect dodge! Full charge ready';
        else if (b.charging) status = b.charge >= 1 ? 'Full power! Let go to lunge' : 'Charging…';
        else status = clock >= b.dodgeReadyAt ? 'Hold Charge, let go to lunge' : 'Dodge recharging…';
        return { status, score: b.score, dashReady: b.alive && clock >= b.lungeReadyAt };
      },

      isOver: () => matchDone,

      results() {
        const s = standings().filter((x) => bodies.get(x.id)?.inRound || x.score > 0);
        const winner = matchWinnerId ? players.get(matchWinnerId)?.name : null;
        return { title: winner ? `${winner} wins Sumo Spin!` : 'Sumo Spin', standings: s };
      },
    };
  },
};
