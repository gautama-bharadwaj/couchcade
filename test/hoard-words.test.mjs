// Dragon Hoard: the word list is clean, and boards don't repeat words until the whole list is used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, THEME_WORDS } from '../server/games/hoard-words.js';
import { drawWords } from '../server/games/hoard.js';

test('word list is big, one word each, lower case', () => {
  assert.ok(WORDS.length >= 1500, `only ${WORDS.length} words`);
  for (const w of WORDS) assert.match(w, /^[a-z][a-z-]*$/, w);
  for (const t of THEME_WORDS.keys()) assert.match(t, /^[a-z]+$/, `theme ${t}`);
});

test('no word comes back until the whole list has been dealt', () => {
  // This file's first draw starts a fresh pile.
  const games = Math.floor(WORDS.length / 25);
  const used = new Set();
  for (let g = 0; g < games; g++) {
    for (const w of drawWords(25)) {
      assert.ok(!used.has(w), `"${w}" came back in game ${g + 1}`);
      used.add(w);
    }
  }
  // The board that runs off the end of the pile still has 25 different words.
  for (let g = 0; g < games * 2; g++) assert.equal(new Set(drawWords(25)).size, 25);
});
