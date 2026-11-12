import { randomUUID } from 'node:crypto';

// Up to 8 players, each with a fixed colour slot.
export const COLORS = ['#ff5a5f', '#3fa7ff', '#ffc93c', '#4cd97b', '#b36bff', '#ff8c42', '#2ee6d6', '#ff6fd8'];
export const MAX_PLAYERS = COLORS.length;

// How long a disconnected player keeps their slot (phone locked, Wi-Fi blip).
const RECONNECT_GRACE_MS = 60_000;

export class Lobby {
  constructor() {
    /** @type {Map<string, Player>} */
    this.players = new Map();
    this.nextId = 1;
  }

  /**
   * Join or rejoin. A known token gets the same player back.
   * Returns { player } or { error }.
   */
  join(name, token) {
    if (token) {
      const existing = [...this.players.values()].find((p) => p.token === token);
      if (existing) {
        existing.connected = true;
        existing.lastSeen = Date.now();
        if (name) existing.name = cleanName(name);
        return { player: existing, rejoined: true };
      }
    }

    if (this.players.size >= MAX_PLAYERS) return { error: 'full' };

    const usedColors = new Set([...this.players.values()].map((p) => p.colorIndex));
    const colorIndex = COLORS.findIndex((_, i) => !usedColors.has(i));

    const player = {
      id: String(this.nextId++),
      token: randomUUID(),
      name: cleanName(name) || `Player ${this.players.size + 1}`,
      colorIndex,
      color: COLORS[colorIndex],
      connected: true,
      lastSeen: Date.now(),
      input: { x: 0, y: 0, a: false, b: false },
    };
    this.players.set(player.id, player);
    return { player, rejoined: false };
  }

  disconnect(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = false;
    p.lastSeen = Date.now();
    p.input = { x: 0, y: 0, a: false, b: false };
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p) return;
    p.input = {
      x: clamp(Number(input.x) || 0, -1, 1),
      y: clamp(Number(input.y) || 0, -1, 1),
      a: !!input.a,
      b: !!input.b,
    };
    p.lastSeen = Date.now();
  }

  /** Drop players who have been gone longer than the grace period. Returns removed ids. */
  prune() {
    const now = Date.now();
    const removed = [];
    for (const p of this.players.values()) {
      if (!p.connected && now - p.lastSeen > RECONNECT_GRACE_MS) {
        this.players.delete(p.id);
        removed.push(p.id);
      }
    }
    return removed;
  }

  /** Host = the earliest-joined player who is still connected. Picks and starts games. */
  hostId() {
    for (const p of this.players.values()) if (p.connected) return p.id;
    return null;
  }

  connectedCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.connected) n++;
    return n;
  }

  /** Public view of the lobby (no tokens). */
  summary() {
    return [...this.players.values()].map(({ id, name, color, connected }) => ({ id, name, color, connected }));
  }
}

function cleanName(name) {
  return String(name ?? '').replace(/[^\p{L}\p{N} _.'-]/gu, '').trim().slice(0, 16);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
