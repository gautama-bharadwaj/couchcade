// Bumper Arena: shove everyone off a shrinking circular platform.
// Last one standing wins the round; first to WIN_SCORE rounds wins the match.
//
// Round flow: countdown (frozen) -> play -> roundover -> next round ... -> match over

const WIN_SCORE = 3;

// Tuning (arena units = TV pixels at 1600x900)
const R = 30; // player radius
const ACCEL = 1500; // stick push, units/s^2
const MAX_SPEED = 360;
const FRICTION = 2.6; // velocity decay per second
const DASH_SPEED = 720; // impulse added on dash
const DASH_MS = 260; // how long a dash counts as "dashing" (hits harder)
const DASH_COOLDOWN_MS = 1500;
const BOUNCE = 0.9; // restitution between players
const BUMP = 140; // extra shove on every hit, so contact always matters
const DASH_POWER = 1.9; // knockback multiplier when the hitter is dashing

const PLATFORM_START = 410;
const SHRINK_DELAY_S = 5;
const SHRINK_RATE = 7; // units/s; the platform keeps shrinking, so rounds always end

const COUNTDOWN_S = 3;
const ROUNDOVER_S = 3;

export default {
  id: 'bumper',
  title: 'Bumper Arena',
  description: 'Shove everyone off the shrinking platform. First to 3 wins.',
  minPlayers: 1, // 1 = practice mode; it's a real game from 2
  maxPlayers: 8,
  controller: { buttons: [{ id: 'a', label: 'Dash' }] },

  create({ players, arena }) {
    const cx = arena.w / 2;
    const cy = arena.h / 2;

    /** @type {Map<string, Body>} per-player physics + match state */
    const bodies = new Map();
    let phase = 'countdown';
    let timer = COUNTDOWN_S; // seconds left in countdown / roundover
    let elapsed = 0; // seconds into the current round's play
    let platformR = PLATFORM_START;
    let round = 1;
    let roundWinner = null; // name, or null for a draw
    let matchWinnerId = null;
    let solo = false;
    let lastRound = false; // decided when a round ends; the match ends after its roundover screen
    let matchDone = false;

    startRound();

    function startRound() {
      // Include everyone currently connected; people who joined mid-match get in here.
      for (const p of players.values()) {
        if (!bodies.has(p.id)) bodies.set(p.id, { score: 0 });
      }
      for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);

      const entrants = [...players.values()].filter((p) => p.connected);
      solo = entrants.length <= 1;
      const spawnR = PLATFORM_START * 0.6;
      entrants.forEach((p, i) => {
        const a = (i / entrants.length) * Math.PI * 2 - Math.PI / 2;
        Object.assign(bodies.get(p.id), {
          x: cx + Math.cos(a) * spawnR,
          y: cy + Math.sin(a) * spawnR,
          vx: 0,
          vy: 0,
          alive: true,
          inRound: true,
          fellAt: null,
          dashUntil: 0,
          dashReadyAt: 0,
          prevA: false,
        });
      });
      // Not connected at round start = sitting this round out.
      for (const [id, b] of bodies) if (!entrants.some((p) => p.id === id)) Object.assign(b, { inRound: false, alive: false });

      phase = 'countdown';
      timer = COUNTDOWN_S;
      elapsed = 0;
      platformR = PLATFORM_START;
      roundWinner = null;
    }

    function update(dt) {
      const now = Date.now();
      // Remove players who left the lobby for good.
      for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);

      if (phase === 'countdown') {
        timer -= dt;
        if (timer <= 0) phase = 'play';
        return;
      }

      if (phase === 'roundover') {
        timer -= dt;
        if (timer <= 0) {
          if (lastRound) matchDone = true;
          else {
            round++;
            startRound();
          }
        }
        return;
      }

      // --- play ---
      elapsed += dt;
      if (elapsed > SHRINK_DELAY_S) platformR = Math.max(0, PLATFORM_START - (elapsed - SHRINK_DELAY_S) * SHRINK_RATE);

      const live = [...bodies.entries()].filter(([, b]) => b.alive);

      // Input -> velocity
      for (const [id, b] of live) {
        const input = players.get(id)?.input ?? { x: 0, y: 0, a: false };
        b.vx += input.x * ACCEL * dt;
        b.vy += input.y * ACCEL * dt;

        // Dash on the press (not while held), if off cooldown.
        if (input.a && !b.prevA && now >= b.dashReadyAt) {
          let dx = input.x;
          let dy = input.y;
          let len = Math.hypot(dx, dy);
          if (len < 0.2) {
            // No stick direction: dash the way you're already moving.
            dx = b.vx;
            dy = b.vy;
            len = Math.hypot(dx, dy);
          }
          if (len > 0.001) {
            b.vx += (dx / len) * DASH_SPEED;
            b.vy += (dy / len) * DASH_SPEED;
            b.dashUntil = now + DASH_MS;
            b.dashReadyAt = now + DASH_COOLDOWN_MS;
          }
        }
        b.prevA = input.a;

        // Friction, then cap speed (dashing is allowed to exceed the cap).
        const decay = Math.exp(-FRICTION * dt);
        b.vx *= decay;
        b.vy *= decay;
        const speed = Math.hypot(b.vx, b.vy);
        if (now > b.dashUntil && speed > MAX_SPEED) {
          b.vx = (b.vx / speed) * MAX_SPEED;
          b.vy = (b.vy / speed) * MAX_SPEED;
        }

        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }

      // Player-vs-player collisions
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) collide(live[i][1], live[j][1], now);
      }

      // Falling off
      for (const [, b] of live) {
        if (Math.hypot(b.x - cx, b.y - cy) > platformR) {
          b.alive = false;
          b.fellAt = elapsed;
        }
      }

      // Round end?
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

    function collide(a, b, now) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist === 0 || dist >= R * 2) return;
      const nx = dx / dist;
      const ny = dy / dist;

      // Push apart so they don't overlap.
      const overlap = (R * 2 - dist) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;

      // Only bounce if they're moving toward each other.
      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) return;
      const j = ((1 + BOUNCE) * vn) / 2;
      const aPow = now < a.dashUntil ? DASH_POWER : 1;
      const bPow = now < b.dashUntil ? DASH_POWER : 1;
      // A dashing hitter knocks the other one back harder.
      a.vx -= nx * (j + BUMP) * bPow;
      a.vy -= ny * (j + BUMP) * bPow;
      b.vx += nx * (j + BUMP) * aPow;
      b.vy += ny * (j + BUMP) * aPow;
    }

    function standings() {
      return [...bodies.entries()]
        .map(([id, b]) => {
          const p = players.get(id);
          return { id, name: p?.name ?? '?', color: p?.color ?? '#888', score: b.score };
        })
        .sort((x, y) => y.score - x.score);
    }

    return {
      update,

      snapshot() {
        const now = Date.now();
        return {
          phase,
          timer: Math.max(0, Math.ceil(timer)),
          round,
          winScore: WIN_SCORE,
          solo,
          platform: { x: cx, y: cy, r: Math.round(platformR) },
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
                alive: b.alive,
                fellAt: b.fellAt,
                dashing: now < b.dashUntil,
                score: b.score,
              };
            }),
          scores: standings().filter((s) => bodies.get(s.id)?.inRound || s.score > 0),
        };
      },

      playerView(id) {
        const b = bodies.get(id);
        if (!b) return { status: 'Joining next round…' };
        const dashReady = Date.now() >= b.dashReadyAt;
        let status;
        if (!b.inRound) status = 'You’re in next round';
        else if (phase === 'countdown') status = `Get ready… ${Math.ceil(timer)}`;
        else if (phase === 'roundover') status = roundWinner ? `${roundWinner} wins the round` : 'Draw!';
        else if (!b.alive) status = 'You fell! Watch the TV';
        else status = dashReady ? 'Dash ready' : 'Dash recharging…';
        return { status, score: b.score, dashReady: b.alive && dashReady };
      },

      isOver: () => matchDone,

      results() {
        const s = standings().filter((x) => bodies.get(x.id)?.inRound || x.score > 0);
        const winner = matchWinnerId ? players.get(matchWinnerId)?.name : null;
        return { title: winner ? `${winner} wins Bumper Arena!` : 'Bumper Arena', standings: s };
      },
    };
  },
};
