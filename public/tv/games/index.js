// TV renderer registry. Each renderer exports default { draw(ctx, frame) } where
//   frame = { prev, cur, alpha, arena, now }
//   prev/cur = the game's snapshot() from the server, alpha = 0..1 between them.
// Register new games here with the same id as server/games/<id>.js.

import bumper from './bumper.js';
import gala from './gala.js';
import sandbox from './sandbox.js';

export const renderers = { bumper, gala, sandbox };
