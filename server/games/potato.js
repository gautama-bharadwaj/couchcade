// Hot Potato Pileup: top-down brawl for 2–8 where someone always holds a ticking bomb.
//
// Joystick runs, A tackles (a short dash), B dodges (a quick hop that can't be tackled).
// The only way to get rid of the bomb is to tackle someone while you hold it; they're dizzy
// for a moment and can't tackle it straight back to you. The fuse keeps burning across
// passes and its length is secret. When it blows, the holder is out and everyone nearby is
// flung away. Everyone still standing scores a point per blast, and the last one standing
// gets a bonus. Rounds rotate through three yards; the most points after ROUNDS wins.
//
// All rules live here; the TV (public/tv/games/potato.js) only draws snapshot().

const ROUNDS = 3;
const SURVIVE_PTS = 1; // per blast you live through
const WIN_PTS = 2; // last one standing

// Bodies (arena units = TV pixels at 1600x900)
const R = 30;
const FIELD = { x0: 70, y0: 150, x1: 1530, y1: 840 }; // the strip above holds the HUD

// Movement
const ACCEL = 2400;
const MAX_SPEED = 370;
const HOLDER_SPEED = 410; // a little faster with the bomb, so you can catch people
const FRICTION = 3.2;
const ICE = { accel: 1000, friction: 0.7 };
const RESTITUTION = 0.75;

// Moves
const TACKLE_V = 860;
const TACKLE_S = 0.24; // how long a tackle counts
const TACKLE_CD = 0.9;
const HOLDER_TACKLE_CD = 0.55;
const TACKLE_SHOVE = 560;
const DIZZY_S = 0.45;
const NO_TAGBACK_S = 1.3; // the new holder can't hand it straight back
const DODGE_S = 0.36;
const DODGE_V = 320;
const DODGE_CD = 1.6;

// Bomb
const FUSE = [9, 15]; // seconds, picked at random and never shown
const BLAST_R = 240;
const BLAST_V = 1000;
const NEXT_BOMB_S = 2.2; // pause between a blast and the next bomb

const COUNTDOWN_S = 3;
const ROUNDOVER_S = 3.5;

// ---- Yards -----------------------------------------------------------------------------
// Obstacles: { kind: 'post', x, y, r, bouncy? } or { kind: 'box', x, y, w, h }
const LAYOUTS = [
  {
    id: 'yard',
    title: 'Backyard',
    obstacles: [
      { kind: 'post', x: 470, y: 340, r: 46 },
      { kind: 'post', x: 1130, y: 340, r: 46 },
      { kind: 'post', x: 470, y: 660, r: 46 },
      { kind: 'post', x: 1130, y: 660, r: 46 },
    ],
  },
  {
    id: 'kitchen',
    title: 'Kitchen',
    obstacles: [
      { kind: 'box', x: 640, y: 445, w: 320, h: 100 },
      { kind: 'post', x: 300, y: 495, r: 38 },
      { kind: 'post', x: 1300, y: 495, r: 38 },
    ],
  },
  {
    id: 'rink',
    title: 'Ice Rink',
    ice: true,
    obstacles: [{ kind: 'post', x: 800, y: 495, r: 58, bouncy: true }],
  },
];

export default {
  id: 'potato',
  title: 'Hot Potato Pileup',
  description: 'Tackle someone to pass the ticking bomb before it blows. 2–8 players.',
  tab: 'arcade',
  icon: '🥔',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { buttons: [{ id: 'a', label: 'Tackle' }, { id: 'b', label: 'Dodge' }] },
  // How to play, shown on the TV at the start (host can skip). Pictures: public/tv/games/rules/potato.js.
  rules: [
    { art: 'bomb', title: 'Pass the bomb', text: 'Someone always holds a ticking bomb. Tackle someone with A to hand it over.' },
    { art: 'dodge', title: 'Dodge with B', text: 'A quick hop nobody can tackle. And nobody knows how long the fuse is!' },
    { art: 'score', title: 'Survive the blasts', text: 'Each blast you live through is a point. Last one standing gets 2 more. Most points after 3 rounds wins.' },
  ],

  create({ players }) {
    const bodies = new Map(); // id -> body
    let layoutIdx = Math.floor(Math.random() * LAYOUTS.length);
    let L = LAYOUTS[0];
    let phase = 'countdown';
    let timer = COUNTDOWN_S;
    let clock = 0; // seconds into the round's play
    let round = 0;
    let roundWinner = null;
    let matchDone = false;
    let bomb = null; // { holder, from, noBackUntil, fuse, fuseMax } or null between blasts
    let nextBombIn = 0;
    let lastBlast = null; // { x, y } for the TV
    let fx = newFx();

    function newFx() {
      return { tackles: [], passes: [], dodges: 0, booms: [], bonks: 0, drops: [] };
    }

    startRound();

    // ---- Round flow ---------------------------------------------------------------
    function startRound() {
      round++;
      L = LAYOUTS[layoutIdx % LAYOUTS.length];
      layoutIdx++;
      for (const p of players.values()) if (!bodies.has(p.id)) bodies.set(p.id, { score: 0 });
      for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);

      const entrants = shuffle([...players.values()].filter((p) => p.connected));
      const cx = (FIELD.x0 + FIELD.x1) / 2;
      const cy = (FIELD.y0 + FIELD.y1) / 2;
      entrants.forEach((p, i) => {
        const a = (i / entrants.length) * Math.PI * 2 + Math.PI / 8;
        const b = Object.assign(bodies.get(p.id), {
          x: cx + Math.cos(a) * 590, y: cy + Math.sin(a) * 270, vx: 0, vy: 0, fx: Math.cos(a + Math.PI), fy: Math.sin(a + Math.PI),
          alive: true, inRound: true, tackleT: 0, tackleCd: 0, tackled: new Set(), dodgeT: 0, dodgeCd: 0, dizzyT: 0,
          prevA: false, prevB: false, outAt: null, bot: null,
        });
        pushOutOfObstacles(b);
      });
      for (const [id, b] of bodies) if (!entrants.some((p) => p.id === id)) Object.assign(b, { inRound: false, alive: false });

      phase = 'countdown';
      timer = COUNTDOWN_S;
      clock = 0;
      roundWinner = null;
      lastBlast = null;
      bomb = null;
      giveBomb(); // shown during the countdown so everyone knows who to run from
    }

    function giveBomb() {
      const alive = [...bodies.entries()].filter(([, b]) => b.alive);
      if (alive.length < 2) return;
      const [id] = pick(alive);
      const fuse = FUSE[0] + Math.random() * (FUSE[1] - FUSE[0]);
      bomb = { holder: id, from: null, noBackUntil: 0, fuse, fuseMax: fuse };
      fx.drops.push({ id });
    }

    function update(dt) {
      for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);
      if (bomb && !bodies.get(bomb.holder)?.alive) bomb = null; // holder left: next bomb soon
      if (phase === 'countdown') {
        timer -= dt;
        if (timer <= 0) phase = 'play';
        if (!bomb) giveBomb();
        return;
      }
      if (phase === 'roundover') {
        timer -= dt;
        step(dt, true);
        if (timer <= 0) {
          if (round >= ROUNDS) matchDone = true;
          else startRound();
        }
        return;
      }
      clock += dt;
      step(dt, false);

      if (bomb) {
        bomb.fuse -= dt;
        if (bomb.fuse <= 0) explode();
      } else {
        nextBombIn -= dt;
        if (nextBombIn <= 0) giveBomb();
      }

      const alive = [...bodies.entries()].filter(([, b]) => b.alive);
      if (alive.length <= 1) {
        if (alive.length === 1) {
          const [id, b] = alive[0];
          b.score += WIN_PTS;
          roundWinner = players.get(id)?.name ?? '?';
        }
        bomb = null;
        phase = 'roundover';
        timer = ROUNDOVER_S;
      }
    }

    function explode() {
      const holder = bodies.get(bomb.holder);
      const { x, y } = holder;
      holder.alive = false;
      holder.outAt = clock;
      holder.vx = holder.vy = 0;
      fx.booms.push({ id: bomb.holder, x: Math.round(x), y: Math.round(y) });
      lastBlast = { x: Math.round(x), y: Math.round(y) };
      for (const b of bodies.values()) {
        if (!b.alive) continue;
        b.score += SURVIVE_PTS;
        const dx = b.x - x;
        const dy = b.y - y;
        const d = Math.hypot(dx, dy);
        if (d > BLAST_R) continue;
        const k = 1 - d / BLAST_R;
        const n = d || 1;
        b.vx += (dx / n) * BLAST_V * (0.4 + 0.6 * k);
        b.vy += (dy / n) * BLAST_V * (0.4 + 0.6 * k);
        b.dizzyT = Math.max(b.dizzyT, 0.3 + 0.6 * k);
      }
      bomb = null;
      nextBombIn = NEXT_BOMB_S;
    }

    // ---- Physics -----------------------------------------------------------------
    function step(dt, frozenInput) {
      const ice = !!L.ice;
      const accel = ice ? ICE.accel : ACCEL;
      const friction = ice ? ICE.friction : FRICTION;
      const live = [...bodies.entries()].filter(([, b]) => b.alive);

      for (const [id, b] of live) {
        const p = players.get(id);
        const input = frozenInput ? IDLE : p?.bot ? botInput(id, b) : p?.input ?? IDLE;
        b.tackleT = Math.max(0, b.tackleT - dt);
        b.tackleCd = Math.max(0, b.tackleCd - dt);
        b.dodgeT = Math.max(0, b.dodgeT - dt);
        b.dodgeCd = Math.max(0, b.dodgeCd - dt);
        b.dizzyT = Math.max(0, b.dizzyT - dt);
        const holding = bomb?.holder === id;

        let ix = input.x;
        let iy = input.y;
        const mag = Math.hypot(ix, iy);
        if (mag > 1) (ix /= mag), (iy /= mag);
        if (mag > 0.2) (b.fx = ix / Math.max(mag, 1e-6)), (b.fy = iy / Math.max(mag, 1e-6));
        const canAct = b.dizzyT === 0 && phase === 'play';

        if (canAct) {
          b.vx += ix * accel * dt;
          b.vy += iy * accel * dt;
          // Tackle: a burst along the stick (or the way you're facing).
          if (input.a && !b.prevA && b.tackleCd === 0) {
            b.vx = b.fx * TACKLE_V;
            b.vy = b.fy * TACKLE_V;
            b.tackleT = TACKLE_S;
            b.tackleCd = holding ? HOLDER_TACKLE_CD : TACKLE_CD;
            b.tackled = new Set();
          }
          // Dodge: a hop you can't be tackled out of.
          if (input.b && !b.prevB && b.dodgeCd === 0) {
            b.dodgeT = DODGE_S;
            b.dodgeCd = DODGE_CD;
            b.vx += b.fx * DODGE_V;
            b.vy += b.fy * DODGE_V;
            fx.dodges++;
          }
        }
        b.prevA = input.a;
        b.prevB = input.b;

        b.vx *= Math.exp(-friction * dt);
        b.vy *= Math.exp(-friction * dt);
        const max = holding ? HOLDER_SPEED : MAX_SPEED;
        const sp = Math.hypot(b.vx, b.vy);
        if (b.tackleT === 0 && sp > max) {
          // Ease back to running speed instead of snapping (keeps shoves and blasts readable).
          const k = Math.max(max / sp, Math.exp(-5 * dt));
          b.vx *= k;
          b.vy *= k;
        }
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }

      // Body vs body
      for (let i = 0; i < live.length; i++) {
        for (let j = i + 1; j < live.length; j++) collide(live[i], live[j]);
      }
      // World
      for (const [, b] of live) {
        pushOutOfObstacles(b, true);
        walls(b);
      }
    }

    function collide([ia, a], [ib, b]) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d >= R * 2 || d === 0) return;
      const nx = dx / d;
      const ny = dy / d;
      const push = (R * 2 - d) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rel < 0) {
        const j = (-(1 + RESTITUTION) * rel) / 2;
        a.vx -= j * nx;
        a.vy -= j * ny;
        b.vx += j * nx;
        b.vy += j * ny;
      }
      tackleHit(ia, a, ib, b, nx, ny);
      tackleHit(ib, b, ia, a, -nx, -ny);
    }

    /** t tackles v along (nx, ny), if t is mid-tackle and hasn't hit v already. */
    function tackleHit(tid, t, vid, v, nx, ny) {
      if (t.tackleT === 0 || t.tackled.has(vid) || phase !== 'play') return;
      t.tackled.add(vid);
      if (v.dodgeT > 0) return; // dodged it
      v.vx += nx * TACKLE_SHOVE;
      v.vy += ny * TACKLE_SHOVE;
      v.dizzyT = Math.max(v.dizzyT, DIZZY_S);
      t.vx *= 0.35;
      t.vy *= 0.35;
      t.tackleT = 0;
      const passed = bomb?.holder === tid && !(bomb.from === vid && clock < bomb.noBackUntil);
      fx.tackles.push({ x: Math.round((t.x + v.x) / 2), y: Math.round((t.y + v.y) / 2), pass: passed });
      if (passed) {
        bomb.holder = vid;
        bomb.from = tid;
        bomb.noBackUntil = clock + NO_TAGBACK_S;
        fx.passes.push({ from: tid, to: vid });
      }
    }

    function pushOutOfObstacles(b, bounce = false) {
      for (const o of L.obstacles) {
        let nx;
        let ny;
        let depth;
        if (o.kind === 'post') {
          const dx = b.x - o.x;
          const dy = b.y - o.y;
          const d = Math.hypot(dx, dy);
          if (d >= o.r + R) continue;
          nx = d ? dx / d : 1;
          ny = d ? dy / d : 0;
          depth = o.r + R - d;
        } else {
          const cx = clamp(b.x, o.x, o.x + o.w);
          const cy = clamp(b.y, o.y, o.y + o.h);
          const dx = b.x - cx;
          const dy = b.y - cy;
          const d = Math.hypot(dx, dy);
          if (d >= R) continue;
          if (d > 0) {
            nx = dx / d;
            ny = dy / d;
            depth = R - d;
          } else {
            // Center inside the box: leave by the nearest side.
            const sides = [[b.x - o.x, -1, 0], [o.x + o.w - b.x, 1, 0], [b.y - o.y, 0, -1], [o.y + o.h - b.y, 0, 1]].sort((p, q) => p[0] - q[0]);
            [, nx, ny] = sides[0];
            depth = sides[0][0] + R;
          }
        }
        b.x += nx * depth;
        b.y += ny * depth;
        if (!bounce) continue;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          const e = o.bouncy ? 1.5 : 0.6;
          b.vx -= (1 + e) * vn * nx;
          b.vy -= (1 + e) * vn * ny;
          if (vn < -300 || o.bouncy) fx.bonks++;
        }
      }
    }

    function walls(b) {
      const hit = (v) => {
        if (Math.abs(v) > 380) fx.bonks++;
        return -v * 0.65;
      };
      if (b.x < FIELD.x0 + R) (b.x = FIELD.x0 + R), (b.vx = b.vx < 0 ? hit(b.vx) : b.vx);
      if (b.x > FIELD.x1 - R) (b.x = FIELD.x1 - R), (b.vx = b.vx > 0 ? hit(b.vx) : b.vx);
      if (b.y < FIELD.y0 + R) (b.y = FIELD.y0 + R), (b.vy = b.vy < 0 ? hit(b.vy) : b.vy);
      if (b.y > FIELD.y1 - R) (b.y = FIELD.y1 - R), (b.vy = b.vy > 0 ? hit(b.vy) : b.vy);
    }

    // ---- Bots --------------------------------------------------------------------
    // With the bomb: chase the nearest fair target and tackle when close.
    // Without: run from the holder (away from walls), hop over incoming tackles, and now and
    // then shove a neighbour toward the bomb.
    function botInput(id, b) {
      if (!b.bot) b.bot = { thinkAt: 0, out: IDLE, dodgeSkill: 0.45 + Math.random() * 0.35 };
      const st = b.bot;
      if (clock < st.thinkAt) return { ...st.out, a: false, b: false }; // presses last one tick
      st.thinkAt = clock + 0.1 + Math.random() * 0.14;
      const out = { x: 0, y: 0, a: false, b: false };
      const others = [...bodies.entries()].filter(([oid, o]) => oid !== id && o.alive);
      if (!others.length || phase !== 'play') return (st.out = out);

      if (bomb?.holder === id) {
        const fair = others.filter(([oid]) => !(bomb.from === oid && clock < bomb.noBackUntil));
        const [, t] = (fair.length ? fair : others).sort((p, q) => dist(b, p[1]) - dist(b, q[1]))[0];
        const lead = 0.18;
        const gx = t.x + t.vx * lead - b.x;
        const gy = t.y + t.vy * lead - b.y;
        const g = Math.hypot(gx, gy) || 1;
        out.x = gx / g;
        out.y = gy / g;
        if (g < 175 && b.tackleCd === 0 && t.dodgeT === 0 && Math.random() < 0.75) out.a = true;
      } else if (bomb) {
        const h = bodies.get(bomb.holder);
        const dx = b.x - h.x;
        const dy = b.y - h.y;
        const d = Math.hypot(dx, dy) || 1;
        let vx = (dx / d) * (420 / Math.max(d, 120));
        let vy = (dy / d) * (420 / Math.max(d, 120));
        // Keep off walls and out of corners: steer back toward open floor.
        const margin = 170;
        if (b.x - FIELD.x0 < margin) vx += 1.4 * (1 - (b.x - FIELD.x0) / margin);
        if (FIELD.x1 - b.x < margin) vx -= 1.4 * (1 - (FIELD.x1 - b.x) / margin);
        if (b.y - FIELD.y0 < margin) vy += 1.4 * (1 - (b.y - FIELD.y0) / margin);
        if (FIELD.y1 - b.y < margin) vy -= 1.4 * (1 - (FIELD.y1 - b.y) / margin);
        // Circle around the chaser rather than straight away from it.
        const side = (id.charCodeAt(id.length - 1) % 2) * 2 - 1;
        vx += (-dy / d) * 0.35 * side;
        vy += (dx / d) * 0.35 * side;
        const v = Math.hypot(vx, vy) || 1;
        out.x = vx / v;
        out.y = vy / v;
        // Hop over a tackle that's coming at me.
        const closing = -((h.vx - b.vx) * dx + (h.vy - b.vy) * dy) / d;
        if (h.tackleT > 0 && d < 190 && closing > 200 && b.dodgeCd === 0 && Math.random() < st.dodgeSkill) out.b = true;
        else if (d < 120 && b.dodgeCd === 0 && Math.random() < st.dodgeSkill * 0.4) out.b = true;
        // Pileup: shove a neighbour who's closer to the bomb than me.
        if (b.tackleCd === 0 && Math.random() < 0.12) {
          const near = others.find(([oid, o]) => oid !== bomb.holder && dist(b, o) < 110 && dist(o, h) < d);
          if (near) {
            const o = near[1];
            const n = dist(b, o) || 1;
            out.x = (o.x - b.x) / n;
            out.y = (o.y - b.y) / n;
            out.a = true;
          }
        }
      } else {
        // Between bombs: drift toward open floor, apart from the others.
        const cx = (FIELD.x0 + FIELD.x1) / 2;
        const cy = (FIELD.y0 + FIELD.y1) / 2;
        let vx = (cx - b.x) / 600;
        let vy = (cy - b.y) / 300;
        for (const [, o] of others) {
          const d = dist(b, o) || 1;
          if (d < 260) (vx += ((b.x - o.x) / d) * 0.8), (vy += ((b.y - o.y) / d) * 0.8);
        }
        const v = Math.hypot(vx, vy);
        if (v > 0.15) (out.x = vx / v), (out.y = vy / v);
      }
      // Steer around posts and tables in the way.
      for (const o of L.obstacles) {
        const ox = o.kind === 'post' ? o.x : clamp(b.x, o.x, o.x + o.w);
        const oy = o.kind === 'post' ? o.y : clamp(b.y, o.y, o.y + o.h);
        const reach = (o.kind === 'post' ? o.r : 0) + R + 50;
        const d = Math.hypot(b.x - ox, b.y - oy) || 1;
        if (d < reach && !out.a) {
          out.x += ((b.x - ox) / d) * 0.8;
          out.y += ((b.y - oy) / d) * 0.8;
          const m = Math.hypot(out.x, out.y) || 1;
          out.x /= m;
          out.y /= m;
        }
      }
      st.out = { ...out, a: false, b: false };
      return out;
    }

    // ---- Snapshot / views -------------------------------------------------------
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
        const holder = bomb ? bodies.get(bomb.holder) : null;
        return {
          fx: events,
          phase,
          timer: Math.max(0, Math.ceil(timer)),
          round,
          rounds: ROUNDS,
          layout: { id: L.id, title: L.title, ice: !!L.ice },
          field: FIELD,
          obstacles: L.obstacles,
          // heat (0..1) is how far the fuse has burned, coarsely, so the TV can speed up the
          // ticking without giving away the exact second.
          bomb: bomb && holder
            ? { holder: bomb.holder, x: Math.round(holder.x), y: Math.round(holder.y), heat: Math.round((1 - bomb.fuse / bomb.fuseMax) * 20) / 20, noBack: clock < bomb.noBackUntil ? bomb.from : null, burning: phase === 'play' }
            : null,
          nextBomb: !bomb && phase === 'play' ? Math.max(0, Math.round(nextBombIn * 10) / 10) : null,
          lastBlast,
          roundWinner,
          players: [...bodies.entries()]
            .filter(([, b]) => b.inRound)
            .map(([id, b]) => ({
              id, name: players.get(id)?.name ?? '?', color: players.get(id)?.color ?? '#888', connected: !!players.get(id)?.connected,
              x: Math.round(b.x), y: Math.round(b.y), vx: Math.round(b.vx), vy: Math.round(b.vy),
              fx: Math.round(b.fx * 100) / 100, fy: Math.round(b.fy * 100) / 100,
              alive: b.alive, tackling: b.tackleT > 0, dodging: b.dodgeT > 0, dizzy: b.dizzyT > 0, score: b.score,
            })),
          scores: standings(),
        };
      },

      playerView(id) {
        const b = bodies.get(id);
        if (!b?.inRound) return { status: 'Next round…' };
        if (!b.alive) return { status: `Boom! You're out · ${b.score} pts` };
        if (bomb?.holder === id) return { status: '💣 You have the bomb! Tackle someone!' };
        if (b.dizzyT > 0) return { status: 'Dizzy!' };
        if (!bomb) return { status: `Phew · ${b.score} pts` };
        return { status: `Run! ${players.get(bomb.holder)?.name ?? '?'} has the bomb · ${b.score} pts` };
      },

      isOver: () => matchDone,

      results() {
        const s = standings();
        const top = s.filter((p) => p.score === s[0]?.score);
        const title = !s.length ? 'Match ended' : top.length > 1 ? `${top.map((p) => p.name).join(' and ')} tie!` : `${s[0].name} wins!`;
        return { title, standings: s };
      },
    };
  },
};

const IDLE = { x: 0, y: 0, a: false, b: false };

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
