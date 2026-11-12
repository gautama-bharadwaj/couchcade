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
//              or { type: 'screens' },                          // phone shows the game's own screens (see below)
//     create(ctx) -> instance,                                 // ctx = { players: Map<id, Player>, arena }
//   }
//   instance = {
//     update(dt),            // advance the simulation; read player.input {x, y, a, b}
//     snapshot(),            // plain JSON sent to the TV every tick
//     playerView?(id),       // optional small JSON sent to that player's phone ~10/s ({ status, ... })
//                            //   screens games return { status?, screen } (see "Phone screens" below)
//     onAction?(id, action), // screens games only: a tap from a phone, { key, value }
//     isOver(),              // true when the game should end
//     results(),             // { title, standings: [{ id, name, color, score }] }
//   }

//
// Phone screens (controller.type === 'screens'), for turn-based / hidden-info games.
// playerView(id).screen is plain JSON; every field is optional and drawn top to bottom:
//   {
//     title: 'Night 2',                    // big heading
//     tag: { label: 'Thief', color },      // badge, e.g. a secret role
//     lines: ['You are in the Library.'],  // paragraphs
//     cards: [{ label, sub?, color? }],    // read-only info tiles (clues, who you saw…)
//     choose: {                            // pick one option; sends { key, value: option.id }
//       key: 'room', options: [{ id, label, sub?, color?, disabled? }],
//       selected: 'library',               // highlight the current pick
//       locked: false,                     // true = shown but not tappable
//     },
//     input: { key: 'msg', placeholder, maxLength, submitLabel },  // text box; sends { key, value: text }
//     actions: [{ key: 'ready', label: 'Ready', style?: 'primary' | 'secondary', disabled? }], // sends { key }
//     footer: 'Waiting for 3 more…',       // small muted text
//   }
// The phone re-renders only when the screen changes, and gets a fresh view right after any action.
// Never trust an action: check the phase, the player and the value in onAction.

import bumper from './bumper.js';
import gala from './gala.js';
import sandbox from './sandbox.js';

export const GAMES = [bumper, gala, sandbox];

export const gamesById = new Map(GAMES.map((g) => [g.id, g]));

/** What the TV and phones need to show a game picker. */
export function gameList() {
  return GAMES.map(({ id, title, description, minPlayers, maxPlayers }) => ({ id, title, description, minPlayers, maxPlayers }));
}
