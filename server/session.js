// Session = the flow every game shares:
//
//   lobby ──start──▶ playing ──game.isOver()──▶ results ──(8 s or host)──▶ lobby
//     ▲                 │
//     └──── host ends ──┘
//
// Games never deal with joining, picking or starting. They only implement the contract in games/index.js.

import { ARENA } from './arena.js';
import { GAMES, gamesById, gameList } from './games/index.js';

const RESULTS_MS = 8000;

export class Session {
  /**
   * @param {import('./lobby.js').Lobby} lobby
   * @param {(msg: object) => void} onPhaseChange  called with the public phase message whenever it changes
   */
  constructor(lobby, onPhaseChange) {
    this.lobby = lobby;
    this.onPhaseChange = onPhaseChange;
    this.phase = 'lobby';
    this.selectedId = GAMES[0].id;
    this.game = null; // running instance
    this.results = null;
    this.resultsUntil = 0;
  }

  get def() {
    return gamesById.get(this.selectedId);
  }

  /** Message every client gets on connect and on any change. */
  phaseMessage() {
    return {
      t: 'phase',
      phase: this.phase,
      gameId: this.selectedId,
      games: gameList(),
      controller: this.def.controller,
      hostId: this.lobby.hostId(),
      players: this.lobby.summary(),
      results: this.results,
    };
  }

  changed() {
    this.onPhaseChange(this.phaseMessage());
  }

  select(gameId) {
    if (this.phase !== 'lobby' || !gamesById.has(gameId)) return { error: 'cannot select now' };
    this.selectedId = gameId;
    this.changed();
    return {};
  }

  start() {
    if (this.phase !== 'lobby') return { error: 'already playing' };
    const n = this.lobby.connectedCount();
    if (n < this.def.minPlayers) return { error: `${this.def.title} needs at least ${this.def.minPlayers} player(s)` };
    this.game = this.def.create({ players: this.lobby.players, arena: ARENA });
    this.results = null;
    this.phase = 'playing';
    this.changed();
    return {};
  }

  /** Host ends the current game early, or skips the results screen. */
  end() {
    if (this.phase === 'playing') {
      this.results = this.game.results();
      this.game = null;
      this.toLobby();
    } else if (this.phase === 'results') {
      this.toLobby();
    }
  }

  toLobby() {
    this.phase = 'lobby';
    this.game = null;
    this.changed();
  }

  /** Called every server tick. Returns the TV state message, or null. */
  tick(dt) {
    if (this.phase === 'playing') {
      this.game.update(dt);
      if (this.game.isOver()) {
        this.results = this.game.results();
        this.phase = 'results';
        this.resultsUntil = Date.now() + RESULTS_MS;
        this.game = null;
        this.changed();
        return null;
      }
      return { t: 'state', gameId: this.selectedId, data: this.game.snapshot() };
    }
    if (this.phase === 'results' && Date.now() > this.resultsUntil) this.toLobby();
    return null;
  }

  playerView(id) {
    return this.phase === 'playing' && this.game?.playerView ? this.game.playerView(id) : null;
  }
}
