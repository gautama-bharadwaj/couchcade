// Session = the flow every game shares:
//
//   lobby ──start──▶ playing ──game.isOver()──▶ results ──(8 s or host)──▶ lobby
//     ▲                 │
//     └──── host ends ──┘
//
// Games never deal with joining, picking or starting. They only implement the contract in games/index.js.
//
// How-to-play intro: a game with `rules` (see games/index.js) opens with them. The game is
// created but paused (no update(), no taps) while the TV plays the steps; the host or TV can
// skip, step back and forth, or replay them later in the game.

import { ARENA } from './arena.js';
import { GAMES, gamesById, gameList } from './games/index.js';
import { log } from './log.js';

const RESULTS_MS = 8000;
// How long a rules step stays up when it doesn't say: about the time the narrator takes to read
// the text, plus a beat to look at the picture.
const stepMs = (step) => 1000 * (step.seconds ?? Math.min(14, 2.5 + 0.4 * String(step.text).split(/\s+/).length));

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
    this.intro = null; // { step, stepAt } while the rules play; the game is paused meanwhile
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
      rules: this.phase === 'playing' ? this.def.rules ?? null : null,
      // msLeft is for this step, as of sending; the TV counts down from when it arrives.
      intro: this.intro ? { step: this.intro.step, id: this.intro.stepAt, msLeft: Math.max(0, Math.round(this.intro.stepAt + stepMs(this.def.rules[this.intro.step]) - Date.now())) } : null,
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
    this.startedAt = Date.now();
    this.intro = this.def.rules?.length ? { step: 0, stepAt: Date.now() } : null;
    log.info('session', `${this.def.title} started with ${n} players`, this.lobby.summary().map((p) => `${p.name}${p.connected ? '' : ' (away)'}`));
    this.changed();
    return {};
  }

  addBot() {
    if (this.phase !== 'lobby') return { error: 'Add bots in the lobby' };
    const r = this.lobby.addBot();
    if (!r.error) this.changed();
    return r;
  }

  removeBot() {
    if (this.phase !== 'lobby') return { error: 'Remove bots in the lobby' };
    const r = this.lobby.removeBot();
    if (!r.error) this.changed();
    return r;
  }

  /**
   * Host or TV controls for the rules: 'show' (replay from the start, mid-game), 'next', 'back',
   * 'skip'. Next on the last step, or skip, unpauses the game.
   */
  rulesCmd(what) {
    const steps = this.def.rules;
    if (this.phase !== 'playing' || !steps?.length) return { error: 'No rules to show now' };
    if (what === 'show') this.intro = { step: 0, stepAt: Date.now() };
    else if (!this.intro) return {};
    else if (what === 'skip') this.intro = null;
    else if (what === 'next') this.goStep(this.intro.step + 1);
    else if (what === 'back') this.goStep(Math.max(0, this.intro.step - 1));
    else return { error: 'unknown rules command' };
    this.changed();
    return {};
  }

  goStep(i) {
    if (i >= this.def.rules.length) this.intro = null;
    else this.intro = { step: i, stepAt: Date.now() };
  }

  /** Host ends the current game early, or skips the results screen. */
  end() {
    if (this.phase === 'playing') {
      this.results = this.game.results();
      this.game = null;
      log.info('session', `${this.def.title} ended early by the host after ${this.minutes()}`);
      this.toLobby();
    } else if (this.phase === 'results') {
      this.toLobby();
    }
  }

  /** A game threw. Drop it and go back to the lobby so everyone can keep playing something. */
  abort(title) {
    if (this.phase !== 'playing') return;
    let standings = [];
    try {
      standings = this.game?.results()?.standings ?? [];
    } catch {}
    this.results = { title, standings };
    log.warn('session', `${this.def.title} aborted after ${this.minutes()}`);
    this.game = null;
    this.intro = null;
    this.phase = 'results'; // show what happened, then back to the lobby as usual
    this.resultsUntil = Date.now() + RESULTS_MS;
    this.changed();
  }

  minutes() {
    const s = Math.round((Date.now() - (this.startedAt ?? Date.now())) / 1000);
    return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
  }

  toLobby() {
    this.phase = 'lobby';
    this.game = null;
    this.intro = null;
    this.changed();
  }

  /** Called every server tick. Returns the TV state message, or null. */
  tick(dt) {
    if (this.phase === 'playing' && this.intro) {
      // Paused for the rules: the TV still gets the board (drawn under the rules), nothing moves.
      if (Date.now() >= this.intro.stepAt + stepMs(this.def.rules[this.intro.step])) {
        this.goStep(this.intro.step + 1);
        this.changed();
      }
      return { t: 'state', gameId: this.selectedId, data: this.game.snapshot() };
    }
    if (this.phase === 'playing') {
      this.game.update(dt);
      this.lobby.afterTick();
      if (this.game.isOver()) {
        this.results = this.game.results();
        this.phase = 'results';
        log.info('session', `${this.def.title} finished after ${this.minutes()}: ${this.results?.title ?? ''}`);
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

  /** A tap from a phone on a screens game. Returns true if the game took it. */
  action(id, action) {
    if (this.phase !== 'playing' || this.intro || !this.game?.onAction) return false;
    const player = this.lobby.players.get(id);
    if (!player || typeof action?.key !== 'string') return false;
    this.game.onAction(id, { key: action.key.slice(0, 40), value: typeof action.value === 'string' ? action.value.slice(0, 200) : undefined });
    return true;
  }

  playerView(id) {
    return this.phase === 'playing' && !this.intro && this.game?.playerView ? this.game.playerView(id) : null;
  }
}
