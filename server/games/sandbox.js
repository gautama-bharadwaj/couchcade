// Sandbox: every player is a dot they can steer around. A is a speed boost.
// Useful for testing controllers and latency. It never ends on its own —
// the host ends it from their phone (or Esc on the TV).

const RADIUS = 28;
const SPEED = 420;
const BOOST = 2.2;

export default {
  id: 'sandbox',
  title: 'Sandbox',
  description: 'Steer a dot around. For testing controllers.',
  minPlayers: 1,
  maxPlayers: 8,
  controller: { buttons: [{ id: 'a', label: 'Boost' }] },

  create({ players, arena }) {
    const bodies = new Map();

    return {
      update(dt) {
        for (const p of players.values()) {
          let b = bodies.get(p.id);
          if (!b) bodies.set(p.id, (b = spawn(p.colorIndex, arena)));
          const speed = SPEED * (p.input.a ? BOOST : 1);
          b.x = clamp(b.x + p.input.x * speed * dt, RADIUS, arena.w - RADIUS);
          b.y = clamp(b.y + p.input.y * speed * dt, RADIUS, arena.h - RADIUS);
        }
        for (const id of bodies.keys()) if (!players.has(id)) bodies.delete(id);
      },

      snapshot() {
        return {
          players: [...players.values()].map((p) => {
            const b = bodies.get(p.id) ?? spawn(p.colorIndex, arena);
            return { id: p.id, name: p.name, color: p.color, connected: p.connected, boosting: p.input.a, x: Math.round(b.x), y: Math.round(b.y), r: RADIUS };
          }),
        };
      },

      playerView() {
        return { status: 'Move around. A = boost.' };
      },

      isOver: () => false,

      results() {
        return { title: 'Sandbox ended', standings: [...players.values()].map(({ id, name, color }) => ({ id, name, color, score: 0 })) };
      },
    };
  },
};

function spawn(slot, arena) {
  const angle = (slot / 8) * Math.PI * 2;
  return { x: arena.w / 2 + Math.cos(angle) * 250, y: arena.h / 2 + Math.sin(angle) * 250 };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
