// TV renderer registry. Each renderer exports default { draw(ctx, frame) } where
//   frame = { prev, cur, alpha, arena, now }
//   prev/cur = the game's snapshot() from the server, alpha = 0..1 between them.
// Optionally also export onSnapshot(prev, cur, audio) to play sounds and narration when the
// state changes (prev is null on the first snapshot); see public/tv/audio.js.
// Register new games here with the same id as server/games/<id>.js.

import bumper from './bumper.js';
import gala from './gala.js';
import shed from './shed.js';
import sandbox from './sandbox.js';

export const renderers = { bumper, gala, shed, sandbox };
