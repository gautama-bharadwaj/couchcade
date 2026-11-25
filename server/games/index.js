// Game registry. To add a game:
//   1. server/games/<id>.js     — rules (see the contract below)
//   2. public/tv/games/<id>.js  — how the TV draws its snapshots
//   3. register both (here and in public/tv/games/index.js)
//
// Server game contract:
//   export default {
//     id, title, description,
//     tab: 'board',         // picker tab: 'board' (Board & Card) or 'arcade' (Arcade). Optional: games with
//                           //   controller.type 'screens' default to 'board', joystick games to 'arcade'.
//     icon: '🚗',           // one emoji for the picker tile (optional; the first letter is used otherwise)
//     minPlayers, maxPlayers,
//     controller: { buttons: [{ id: 'a', label: 'Dash' }] },   // phone layout: joystick + up to 2 buttons (a, b)
//              or { type: 'screens' },                          // phone shows the game's own screens (see below)
//     create(ctx) -> instance,                                 // ctx = { players: Map<id, Player>, arena }
//     rules?: [{ title, text, art?, seconds? }],               // how-to-play intro (see "Rules" below)
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
//     swatch: { color, label? },           // a big block of one color (a secret color, say)
//     hero: { art, flip?, small?, key? }, // a big illustrated card drawn by the art module's drawHero
//                                          //   (a secret role, say); flip = turn over from drawHeroBack
//                                          //   the first time it shows (per key, default art).
//                                          //   Needs `art` on the screen.
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
//     wheel: {                             // tappable color wheel; sends { key, value: String(cell) }
//       key: 'cell', hues: 24, rings: 6,   // cell = ring * hues + hue; ring 0 is the middle, hue 0 at the top
//       colors: ['#…', …],                 // hues * rings colors, in cell order
//       selected?, target?, first?,        // outlined cells (your pick, the answer, an earlier dashed pick)
//       pins?: [{ cell, color }],          // other players' markers
//       locked?: true, small?: true,       // locked = view only; small = a little reference copy
//     },                                   // (drawn after input, before actions; arrow keys nudge the pick)
//     tally: {                             // counters with − / + buttons; sends { key, value: 'group:row:+' } (or '-')
//       key: 'offer', locked?: true,       // locked = just show the numbers (a hand of resources, say)
//       groups: [{ id: 'give', title?, rows: [{ id: 'wood', label: '🪵', sub?, color?, value, max? }] }],
//     },
//     hexmap: {                            // a hex board; tap a glowing spot, sends { key, value: spot.id }
//       key: 'spot',                       // pointy-top hexes of radius 1, in map units (any origin)
//       tiles: [{ x, y, color, label?, num?, hot?, dim? }],   // num = a number token, hot = red number
//       roads: [{ x1, y1, x2, y2, color }], buildings: [{ x, y, color, kind: 'hut' | 'tower' }],
//       harbors?: [{ x, y, label }],
//       spots: [{ id, x, y, x1?, y1?, x2?, y2?, tile? }],     // a corner; an edge (with ends); or a whole tile
//       selected?, locked?,
//     },                                   // (tally is drawn right after lines; hexmap after input)
//     dial: {                              // a 0–100 band between two ideas; sends { key, value: String(0–100) }
//       key: 'dial', left: 'Bland', right: 'Spicy',
//       value?,                            // your own needle (null = not set yet)
//       crowd?, pins?: [{ value, color }], // a red shared needle, and other players' markers
//       target?,                           // a white mark with scoring zones around it
//       locked?: true, small?: true,       // locked = view only; small = a short reference copy
//     },                                   // (drawn after cards, before choose; ←/→ nudge 1, ↑/↓ nudge 5)
//                                          // changes to value / crowd / pins redraw in place, so drags aren't cut off
//     grid: {                              // tappable word/tile grid; sends { key, value: cell.id }
//       key: 'tile', cols: 5, locked?,     // locked = view only
//       cells: [{ id, label, color?, ink?, // ink = text color
//                 mark?, dots?: [color],   // mark = small caption; dots = little voter markers
//                 ring?, dim?, disabled?,  // ring = outline color (your pick)
//                 art? }],                 // art = a drawn tile behind the word (art module's drawCell)
//     },                                   // (drawn after input, before the wheel)
//     actions: [{ key: 'ready', label: 'Ready', style?: 'primary' | 'secondary', disabled? }], // sends { key }
//     footer: 'Waiting for 3 more…',       // small muted text
//     art: 'tidewake',                     // drawn art for this screen (see below)
//   }
//
// Drawn art (optional): `art` names a module in public/art/<name>.js that the phone loads and uses
// to draw pictures instead of plain labels. Its exports are all optional:
//   drawNamed(g, name, x, y, size, color?)   an icon centred in a size x size square
//   drawCard(g, name, x, y, w, h, count)     a playing card (a locked tally shows these)
//   drawHero(g, name, x, y, w, h), drawHeroBack(g, x, y, w, h)   the big card of `hero`
//   drawCell(g, art, w, h, cell)             a grid cell's background, w x h from (0, 0)
//   mapTile(g, art, x, y, r, seed), mapPiece(g, art, x, y, k, color), mapRoad(g, x1, y1, x2, y2,
//   color, k), mapHarbor(g, x, y, k, art), mapCover(g, x, y, r)   pictures for the hexmap
// Then these fields draw with it: tally rows `art`; choose options `art`, `artColor`, and
// `costs: [names]` (a row of icons); cards `art`, `artColor`, `icons: [names]`; hexmap tiles,
// buildings and harbors `art`. Until the module loads (or if it fails) the labels show, so keep
// them readable. The TV renderer can import the same module for a matching look.
//
// Rules (optional): a short how-to-play intro, played on the TV when the game starts, for about
// 30–60 s in all. Each step is a title and a sentence or two (the narrator reads them, the phones
// show them too). `seconds` defaults to reading time. The game is paused while it plays; the host
// can skip it or step through it, and replay it mid-game (phone "Rules" button, R on the TV).
// `art` is a name passed to the TV renderer's optional drawRules(ctx, art, t, box) to animate the
// step (t = seconds into the step, box = { x, y, w, h } to draw in); without it, text only.
//
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
import tint from './tint.js';
import hoard from './hoard.js';
import tunein from './tunein.js';
import tidewake from './tidewake.js';
import sandbox from './sandbox.js';

// Order within each tab is the order here. The first Board & Card game is picked when the server starts.
export const GAMES = [shed, fuse, gala, tint, hoard, tunein, tidewake, stickup, bumper, sumo, potato, pillowfort, sandbox];

export const gamesById = new Map(GAMES.map((g) => [g.id, g]));

/**
 * The picker's two tabs, in order. Board & Card is the main focus and comes first; Arcade holds
 * the real-time joystick games. Add a tab here (and set `tab` on its games) to make another.
 */
export const TABS = [
  { id: 'board', label: 'Board & Card' },
  { id: 'arcade', label: 'Arcade' },
];

/** A game's tab: its own `tab` if it names one of TABS, else from its controller type. */
export function tabOf(game) {
  if (TABS.some((t) => t.id === game.tab)) return game.tab;
  return game.controller?.type === 'screens' ? 'board' : 'arcade';
}

/**
 * What the TV and phones need to show a game picker: games grouped by tab (in TABS order, then
 * GAMES order). The order is the same on the TV and every phone, so arrow keys match.
 */
export function gameList() {
  const list = GAMES.map((g) => ({
    id: g.id, title: g.title, description: g.description, icon: g.icon ?? null, tab: tabOf(g), minPlayers: g.minPlayers, maxPlayers: g.maxPlayers,
  }));
  const order = TABS.map((t) => t.id);
  return list.sort((a, b) => order.indexOf(a.tab) - order.indexOf(b.tab)); // stable sort
}
