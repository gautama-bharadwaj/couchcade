// Explorer award in Tidewake: the longest single connected trail, cut by other players' buildings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBoard, longestTrail, nextExplorer } from '../server/games/tidewake.js';

// A simple path of `n` free edges from corner `start` that never revisits a corner or touches
// `avoid` (found by backtracking, so it works on any shuffle of the island).
function path(board, start, n, avoid = new Set()) {
  const seen = new Set([start]);
  const out = [];
  const go = (v) => {
    if (out.length === n) return true;
    for (const e of board.verts[v].edges) {
      const ed = board.edges[e];
      const w = ed.v[0] === v ? ed.v[1] : ed.v[0];
      if (ed.owner || seen.has(w) || avoid.has(w)) continue;
      seen.add(w);
      out.push(e);
      if (go(w)) return true;
      out.pop();
      seen.delete(w);
    }
    return false;
  };
  assert.ok(go(start), 'no room for a test path');
  const corners = [start];
  for (const e of out) {
    const [x, y] = board.edges[e].v;
    corners.push(corners.at(-1) === x ? y : x);
  }
  return { edges: out, corners };
}
const own = (board, list, id) => list.forEach((e) => (board.edges[e].owner = id));
// Far-apart corners: the top-left and bottom-right of the island.
const ends = (board) => {
  const vs = [...board.verts].sort((a, b) => a.x + a.y - (b.x + b.y));
  return [vs[0].id, vs[vs.length - 1].id];
};

test('separate trail pieces are not added together', () => {
  const board = makeBoard(false);
  const [a, b] = ends(board);
  own(board, path(board, a, 4).edges, 'p1');
  own(board, path(board, b, 4).edges, 'p1');
  assert.equal(longestTrail(board, 'p1'), 4);
});

test('one long trail beats scattered pieces that reach more tiles', () => {
  const board = makeBoard(false);
  const [a, b] = ends(board);
  const p1a = path(board, a, 4);
  own(board, p1a.edges, 'scattered');
  own(board, path(board, b, 4).edges, 'scattered');
  // The long trail stays clear of the scattered pieces.
  const near = new Set();
  for (const e of board.edges) if (e.owner) for (const v of e.v) [v, ...board.verts[v].adj].forEach((w) => near.add(w));
  const startLong = board.verts.find((v) => !near.has(v.id) && v.adj.length === 3).id;
  own(board, path(board, startLong, 6, near).edges, 'long');
  const reach = (id) => new Set(board.edges.filter((e) => e.owner === id).flatMap((e) => e.tiles)).size;
  assert.ok(reach('scattered') > reach('long'), 'the old tile count would have picked the scattered player');
  const len = new Map([['scattered', longestTrail(board, 'scattered')], ['long', longestTrail(board, 'long')]]);
  assert.equal(len.get('long'), 6);
  assert.equal(nextExplorer('scattered', len), 'long');
});

test('a fork counts its two longest arms through the junction', () => {
  const board = makeBoard(false);
  const [a] = ends(board);
  const main = path(board, a, 6);
  own(board, main.edges, 'p1');
  // A one-edge spur off the middle corner doesn't lengthen the trail.
  const mid = main.corners[3];
  const spur = board.verts[mid].edges.find((e) => !board.edges[e].owner);
  if (spur != null) board.edges[spur].owner = 'p1';
  assert.equal(longestTrail(board, 'p1'), 6);
});

test("another player's hut cuts the trail", () => {
  const board = makeBoard(false);
  const [a] = ends(board);
  const p = path(board, a, 7);
  own(board, p.edges, 'p1');
  assert.equal(longestTrail(board, 'p1'), 7);
  board.verts[p.corners[3]].owner = 'p2'; // after the 3rd edge: pieces of 3 and 4
  assert.equal(longestTrail(board, 'p1'), 4);
  board.verts[p.corners[3]].owner = 'p1'; // your own hut doesn't cut it
  assert.equal(longestTrail(board, 'p1'), 7);
});

test('a loop counts every edge once', () => {
  const board = makeBoard(false);
  const t = board.tiles[9]; // the middle tile
  for (let k = 0; k < 6; k++) {
    const [x, y] = [t.v[k], t.v[(k + 1) % 6]];
    board.edges.find((e) => e.v.includes(x) && e.v.includes(y)).owner = 'p1';
  }
  assert.equal(longestTrail(board, 'p1'), 6);
});

test('award rules: minimum, ties keep the holder, cut holder loses it', () => {
  const m = (o) => new Map(Object.entries(o));
  assert.equal(nextExplorer(null, m({ a: 4, b: 3 })), null); // below 5
  assert.equal(nextExplorer(null, m({ a: 5, b: 3 })), 'a');
  assert.equal(nextExplorer(null, m({ a: 6, b: 6 })), null); // tie, nobody yet
  assert.equal(nextExplorer('a', m({ a: 6, b: 6 })), 'a'); // tie keeps holder
  assert.equal(nextExplorer('a', m({ a: 6, b: 7 })), 'b');
  assert.equal(nextExplorer('a', m({ a: 3, b: 6, c: 6 })), null); // cut, others tied
  assert.equal(nextExplorer('a', m({ a: 3, b: 4 })), null); // cut below the minimum
});
