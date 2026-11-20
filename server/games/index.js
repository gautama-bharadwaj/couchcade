// Game registry. To add a game:
//   1. server/games/<id>.js     — rules (see the contract below)
//   2. public/tv/games/<id>.js  — how the TV draws its snapshots
//   3. register both (here and in public/tv/games/index.js)
//
// Server game contract:
//   export default {
//     id, title, description,
//     category: 'action',   // picker tab: action | party | cards | extras, or any new word (shown capitalized)
//     icon: '🚗',           // one emoji for the picker tile (optional; the first letter is used otherwise)
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
//     hand: {                              // tappable playing cards; sends { key, value: card.id }
//       key: 'play', cards: [{ id, label, color, small?, playable?, dim?, selected? }],
//       // playable:false = dimmed, not tappable; dim:true = dimmed but still tappable; selected:true = raised
//     },
//     input: { key: 'msg', placeholder, maxLength, submitLabel },  // text box; sends { key, value: text }
//     actions: [{ key: 'ready', label: 'Ready', style?: 'primary' | 'secondary', disabled? }], // sends { key }
//     footer: 'Waiting for 3 more…',       // small muted text
//   }
// The phone re-renders only when the screen changes, and gets a fresh view right after any action.
// Never trust an action: check the phase, the player and the value in onAction.

import bumper from './bumper.js';
import gala from './gala.js';
import shed from './shed.js';
import stickup from './stickup.js';
import sumo from './sumo.js';
import fuse from './fuse.js';
import potato from './potato.js';
import pillowfort from './pillowfort.js';
import sandbox from './sandbox.js';

export const GAMES = [bumper, stickup, sumo, gala, shed, fuse, potato, pillowfort, sandbox];

export const gamesById = new Map(GAMES.map((g) => [g.id, g]));

/**
 * What the TV and phones need to show a game picker. Games are grouped by category, in the order
 * each category first appears in GAMES (so a new category needs no change here); a game without
 * one goes under "Other". The order is the same on the TV and every phone, so arrow keys match.
 */
export function gameList() {
  const list = GAMES.map(({ id, title, description, icon, category, minPlayers, maxPlayers }) => ({
    id, title, description, icon: icon ?? null, category: String(category || 'other').toLowerCase(), minPlayers, maxPlayers,
  }));
  const order = [...new Set(list.map((g) => g.category))];
  return list.sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category)); // stable sort
}
