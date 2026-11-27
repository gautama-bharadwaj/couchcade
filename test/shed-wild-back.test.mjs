// Shed!: after tapping a wild, the player still sees their hand and can back out or play another card.
import test from 'node:test';
import assert from 'node:assert/strict';
import shed from '../server/games/shed.js';

const player = (id) => ({ id, name: id, color: '#fff', connected: true, input: { x: 0, y: 0, a: false, b: false } });

// A fresh 2-player game whose current player holds a playable wild.
function gameWithWild() {
  for (let i = 0; i < 500; i++) {
    const g = shed.create({ players: new Map(['p1', 'p2'].map((id) => [id, player(id)])) });
    const id = g.snapshot().players?.find?.((p) => p.current)?.id ?? ['p1', 'p2'].find((p) => g.playerView(p).screen.title === 'Your turn');
    if (!id) continue;
    const wild = g.playerView(id).screen.hand.cards.find((c) => c.art === 'wild' && c.playable);
    if (wild) return { g, id, wild };
  }
  throw new Error('never dealt a wild');
}

test('picking a color keeps the hand in view, with the wild raised and a Back button', () => {
  const { g, id, wild } = gameWithWild();
  g.onAction(id, { key: 'play', value: wild.id });
  const s = g.playerView(id).screen;
  assert.equal(s.title, 'Pick a color');
  assert.ok(s.choose.options.length >= 4);
  assert.ok(s.hand.cards.find((c) => c.id === wild.id).selected);
  assert.ok(s.actions.some((a) => a.key === 'back'));
});

test('Back returns to the hand without playing the wild', () => {
  const { g, id, wild } = gameWithWild();
  const before = g.playerView(id).screen.hand.cards.length;
  g.onAction(id, { key: 'play', value: wild.id });
  g.onAction(id, { key: 'back' });
  const s = g.playerView(id).screen;
  assert.equal(s.title, 'Your turn');
  assert.equal(s.choose, undefined);
  assert.equal(s.hand.cards.length, before);
  assert.ok(s.hand.cards.some((c) => c.id === wild.id));
});

test('tapping the raised wild again also goes back', () => {
  const { g, id, wild } = gameWithWild();
  g.onAction(id, { key: 'play', value: wild.id });
  g.onAction(id, { key: 'play', value: wild.id });
  assert.equal(g.playerView(id).screen.title, 'Your turn');
});

test('drawing is ignored while the color picker is open', () => {
  const { g, id, wild } = gameWithWild();
  const before = g.playerView(id).screen.hand.cards.length;
  g.onAction(id, { key: 'play', value: wild.id });
  g.onAction(id, { key: 'draw' });
  const s = g.playerView(id).screen;
  assert.equal(s.title, 'Pick a color');
  assert.equal(s.hand.cards.length, before);
});

test('picking a color still plays the wild', () => {
  const { g, id, wild } = gameWithWild();
  const before = g.playerView(id).screen.hand.cards.length;
  g.onAction(id, { key: 'play', value: wild.id });
  g.onAction(id, { key: 'color', value: g.playerView(id).screen.choose.options[0].id });
  assert.equal(g.playerView(id).screen.hand.cards.length, before - 1);
});
