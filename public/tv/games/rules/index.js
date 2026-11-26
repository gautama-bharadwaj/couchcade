// How-to-play pictures kept out of the game renderers: one module per game, each exporting
// drawRules(ctx, art, t, box, now) as the contract in server/games/index.js describes. The rules
// overlay (public/tv/rules.js) uses these when a renderer has no drawRules of its own.

import shed from './shed.js';
import gala from './gala.js';
import tint from './tint.js';
import hoard from './hoard.js';
import stickup from './stickup.js';
import bumper from './bumper.js';
import sumo from './sumo.js';
import potato from './potato.js';
import pillowfort from './pillowfort.js';

export const rulesArt = { shed, gala, tint, hoard, stickup, bumper, sumo, potato, pillowfort };
