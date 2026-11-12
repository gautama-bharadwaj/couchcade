// Game registry. To add a game:
//   1. server/games/<id>.js     — rules (see the contract below)
//   2. public/tv/games/<id>.js  — how the TV draws its snapshots
//   3. register both (here and in public/tv/games/index.js)
//
// Server game contract:
//   export default {
//     id, title, description,
//     minPlayers, maxPlayers,
//     controller: { buttons: [{ id: 'a', label: 'Dash' }] },   // phone layout: joystick + up to 2 buttons (a, b)
//     create(ctx) -> instance,                                 // ctx = { players: Map<id, Player>, arena }
//   }
//   instance = {
//     update(dt),            // advance the simulation; read player.input {x, y, a, b}
//     snapshot(),            // plain JSON sent to the TV every tick
//     playerView?(id),       // optional small JSON sent to that player's phone ~10/s ({ status, ... })
//     isOver(),              // true when the game should end
//     results(),             // { title, standings: [{ id, name, color, score }] }
//   }

import bumper from './bumper.js';
import sandbox from './sandbox.js';

export const GAMES = [bumper, sandbox];

export const gamesById = new Map(GAMES.map((g) => [g.id, g]));

/** What the TV and phones need to show a game picker. */
export function gameList() {
  return GAMES.map(({ id, title, description, minPlayers, maxPlayers }) => ({ id, title, description, minPlayers, maxPlayers }));
}
