// Shed!: a shedding card game for 2–8. Hands are private on each phone;
// the TV shows the discard pile, whose turn it is and how many cards everyone holds.
//
// Deck (108): four colors, each with one 0, two of 1–9, two Skip, two Reverse, two Draw 2;
// plus 4 Wild and 4 Wild Draw 4. Everyone starts with 7.
// On your turn, play a card that matches the top card's color, number or symbol, or any Wild.
// Otherwise draw one; if it fits you may play it, or pass.
//   Skip: next player loses their turn. Reverse: direction flips (with 2 players it acts as Skip).
//   Draw 2 / Wild Draw 4: next player draws and loses their turn, unless they stack:
//   a +2 or +4 on a +2, or a +4 on a +4, passes the growing total to the next player.
//   Wilds: you pick the color.
// Down to one card? Tap "Last card!" before someone catches you, or draw 2.
// First to empty their hand wins. Others score the points left in their hand (lower is better).

const COLORS = [
  { id: 'red', label: 'Red', hex: '#e8484d' },
  { id: 'blue', label: 'Blue', hex: '#2f8fe6' },
  { id: 'green', label: 'Green', hex: '#2fb866' },
  { id: 'yellow', label: 'Yellow', hex: '#e6a817' },
];
const colorById = new Map(COLORS.map((c) => [c.id, c]));

const TURN_SECONDS = 30;
const HAND_SIZE = 7;
const CATCH_PENALTY = 2;
const CATCH_GRACE_MS = 3000; // time to say "Last card!" before anyone can catch you

export default {
  id: 'shed',
  title: 'Shed!',
  description: 'Match colors and numbers, empty your hand first. 2–8 players.',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { type: 'screens' },

  create({ players }) {
    const order = shuffle([...players.values()].filter((p) => p.connected).map((p) => p.id));
    const hands = new Map(order.map((id) => [id, []]));
    let drawPile = shuffle(makeDeck());
    const discard = [];

    const st = {
      turn: 0, // index into order
      dir: 1,
      color: null, // active color (a wild's chosen color)
      left: TURN_SECONDS,
      drewThisTurn: null, // card id drawn this turn (may be played or passed)
      pending: 0, // stacked draw penalty waiting for the current player
      pendingKind: null, // 'draw2' | 'wild4': what can be stacked on it
      choosingWild: null, // card waiting for a color pick
      called: new Set(), // said "Last card!" while holding one card
      oneSince: new Map(), // id -> when they went down to one card
      log: [], // public event lines, newest last
      winner: null,
      endLeft: 0,
      over: false,
      lastPlayed: null, // { by, card } for the TV animation
      seq: 0,
    };

    const name = (id) => players.get(id)?.name ?? '?';
    // Keep "who is down to one card, since when" in step with hand sizes.
    function trackOne(id) {
      if (hands.get(id).length === 1) {
        if (!st.oneSince.has(id)) st.oneSince.set(id, Date.now());
      } else {
        st.oneSince.delete(id);
        st.called.delete(id);
      }
    }
    const catchable = (o) => hands.get(o).length === 1 && !st.called.has(o) && Date.now() - (st.oneSince.get(o) ?? Infinity) >= CATCH_GRACE_MS;
    const current = () => order[st.turn];
    const top = () => discard.at(-1);
    const say = (line) => {
      st.log.push(line);
      if (st.log.length > 4) st.log.shift();
    };

    function draw(id, n) {
      const got = [];
      for (let i = 0; i < n; i++) {
        if (!drawPile.length) {
          // Reshuffle everything under the top card.
          const keep = discard.pop();
          drawPile = shuffle(discard.splice(0));
          discard.push(keep);
          if (!drawPile.length) break; // every card is in someone's hand
        }
        const c = drawPile.pop();
        hands.get(id).push(c);
        got.push(c);
      }
      trackOne(id);
      return got;
    }

    // Deal and flip a number card to start.
    for (const id of order) draw(id, HAND_SIZE);
    let firstIdx = drawPile.findLastIndex((c) => c.kind === 'number');
    discard.push(drawPile.splice(firstIdx, 1)[0]);
    st.color = top().color;

    function playable(card) {
      const t = top();
      // Facing a stack: only another draw card (a +2 can't go on a +4).
      if (st.pending) return card.kind === 'wild4' || (card.kind === 'draw2' && st.pendingKind === 'draw2');
      if (card.kind === 'wild' || card.kind === 'wild4') return true;
      if (card.color === st.color) return true;
      if (card.kind === 'number' && t.kind === 'number' && card.value === t.value) return true;
      if (card.kind !== 'number' && card.kind === t.kind) return true;
      return false;
    }

    function step(n = 1) {
      st.turn = (st.turn + st.dir * n + order.length * 4) % order.length;
    }

    function nextTurn(skip = 0) {
      step(1 + skip);
      st.left = TURN_SECONDS;
      st.drewThisTurn = null;
      st.choosingWild = null;
    }

    function play(id, card, chosenColor) {
      const hand = hands.get(id);
      hand.splice(hand.indexOf(card), 1);
      discard.push(card);
      st.color = card.color ?? chosenColor;
      st.lastPlayed = { by: id, card, seq: ++st.seq };
      trackOne(id);

      const nextId = order[(st.turn + st.dir + order.length) % order.length];
      let skip = 0;
      let line = `${name(id)} played ${cardName(card, st.color)}`;
      if (card.kind === 'skip') {
        skip = 1;
        line += ` · ${name(nextId)} is skipped`;
      } else if (card.kind === 'reverse') {
        if (order.length === 2) skip = 1;
        else st.dir *= -1;
        line += order.length === 2 ? ` · ${name(nextId)} is skipped` : ' · direction reversed';
      } else if (card.kind === 'draw2' || card.kind === 'wild4') {
        st.pending += card.kind === 'draw2' ? 2 : 4;
        st.pendingKind = card.kind;
        line += ` · ${name(nextId)} must stack or draw ${st.pending}`;
      }
      say(line);

      if (hand.length === 0) {
        if (st.pending) {
          draw(nextId, st.pending); // the last card's penalty still lands
          say(`${name(nextId)} draws ${st.pending}`);
          st.pending = 0;
        }
        st.winner = id;
        st.endLeft = 8;
        say(`${name(id)} is out of cards!`);
        return;
      }
      nextTurn(skip);
    }

    function takePenalty(id) {
      const n = st.pending;
      st.pending = 0;
      st.pendingKind = null;
      draw(id, n);
      say(`${name(id)} draws ${n}`);
      nextTurn();
    }

    function autoMove() {
      // Time ran out: finish a pending wild with a sensible color, otherwise draw (if not yet) and pass.
      const id = current();
      if (st.choosingWild) return play(id, st.choosingWild, bestColor(hands.get(id)));
      if (st.pending) return takePenalty(id);
      if (!st.drewThisTurn) {
        draw(id, 1);
        say(`${name(id)} ran out of time and drew a card`);
      } else say(`${name(id)} passed`);
      nextTurn();
    }

    // ---- Phone screens --------------------------------------------------------
    function cardView(c, canPlay) {
      return { id: c.id, label: c.label, small: c.small, color: c.color ? colorById.get(c.color).hex : null, playable: canPlay };
    }

    function screenFor(id) {
      if (!hands.has(id)) return { title: 'Game in progress', lines: ['You can join the next game. Watch the TV!'] };
      const hand = sortHand(hands.get(id));
      const myTurn = current() === id && !st.winner;
      const t = top();
      const s = { title: '', lines: [], cards: [] };

      if (st.winner) {
        s.title = st.winner === id ? 'You won!' : `${name(st.winner)} won`;
        s.lines = [st.winner === id ? 'Nice hand.' : `You have ${hand.length} card${hand.length === 1 ? '' : 's'} left (${handPoints(hand)} points).`];
        s.hand = { key: 'none', cards: hand.map((c) => cardView(c, false)) };
        return s;
      }

      s.cards.push({ label: `Top: ${cardName(t, st.color)}`, sub: myTurn ? 'Your turn!' : `${name(current())}'s turn`, color: colorById.get(st.color).hex });

      if (myTurn && st.choosingWild) {
        s.title = 'Pick a color';
        s.choose = { key: 'color', options: COLORS.map((c) => ({ id: c.id, label: c.label, color: c.hex })) };
        s.footer = `${st.left}s`;
        return s;
      }

      s.title = myTurn ? 'Your turn' : 'Your hand';
      const canPlay = (c) => myTurn && playable(c) && (!st.drewThisTurn || c.id === st.drewThisTurn);
      s.hand = { key: 'play', cards: hand.map((c) => cardView(c, canPlay(c))) };

      s.actions = [];
      if (myTurn && st.pending) {
        const what = st.pendingKind === 'draw2' ? 'a +2 or +4' : 'a +4';
        s.title = `Stack or draw ${st.pending}`;
        s.lines.push(`Play ${what} to pass it on, or take the ${st.pending} cards.`);
        s.actions.push({ key: 'draw', label: `Draw ${st.pending}`, style: 'secondary' });
      } else if (myTurn) {
        if (!st.drewThisTurn) s.actions.push({ key: 'draw', label: 'Draw a card', style: 'secondary' });
        else s.actions.push({ key: 'pass', label: 'Keep it and pass', style: 'secondary' });
        if (st.drewThisTurn) s.lines.push(hand.some((c) => c.id === st.drewThisTurn && playable(c)) ? 'You drew a card that fits. Play it or pass.' : "The card you drew doesn't fit. Pass.");
      }
      if (hand.length === 1 && !st.called.has(id)) s.actions.unshift({ key: 'last', label: 'Last card!', style: 'primary' });
      for (const o of order) {
        if (o !== id && catchable(o)) s.actions.push({ key: `catch:${o}`, label: `Catch ${name(o)}! (+${CATCH_PENALTY})`, style: 'primary' });
      }
      s.footer = myTurn ? `${st.left}s` : '';
      return s;
    }

    let acc = 0;
    return {
      update(dt) {
        acc += dt;
        while (acc >= 1) {
          acc -= 1;
          if (st.winner) st.endLeft--;
          else st.left--;
        }
        if (st.winner) {
          if (st.endLeft <= 0) st.over = true;
          return;
        }
        if (st.left <= 0) autoMove();
      },

      onAction(id, { key, value }) {
        if (!hands.has(id) || st.winner) return;
        const hand = hands.get(id);

        if (key === 'last' && hand.length === 1 && !st.called.has(id)) {
          st.called.add(id);
          say(`${name(id)}: "Last card!"`);
          return;
        }
        if (key.startsWith('catch:')) {
          const target = key.slice(6);
          if (target !== id && hands.has(target) && catchable(target)) {
            draw(target, CATCH_PENALTY);
            say(`${name(id)} caught ${name(target)}, who draws ${CATCH_PENALTY}`);
          }
          return;
        }

        if (current() !== id) return;

        if (key === 'color' && st.choosingWild && colorById.has(value)) return play(id, st.choosingWild, value);
        if (st.choosingWild) return;

        if (key === 'play') {
          const card = hand.find((c) => c.id === value);
          if (!card || !playable(card) || (st.drewThisTurn && card.id !== st.drewThisTurn)) return;
          if (card.kind === 'wild' || card.kind === 'wild4') {
            st.choosingWild = card;
            return;
          }
          return play(id, card);
        }
        if (key === 'draw' && st.pending) return takePenalty(id);
        if (key === 'draw' && !st.drewThisTurn) {
          const [c] = draw(id, 1);
          if (!c) return nextTurn();
          st.drewThisTurn = c.id;
          if (!playable(c)) {
            say(`${name(id)} drew a card`);
            return nextTurn();
          }
          st.left = Math.max(st.left, 10);
          return;
        }
        if (key === 'pass' && st.drewThisTurn) {
          say(`${name(id)} drew and passed`);
          nextTurn();
        }
      },

      snapshot() {
        return {
          top: top(),
          color: st.color,
          colors: COLORS,
          dir: st.dir,
          drawPile: drawPile.length,
          turn: st.winner ? null : current(),
          left: st.left,
          choosing: !!st.choosingWild,
          pending: st.pending,
          log: st.log,
          lastPlayed: st.lastPlayed,
          winner: st.winner,
          players: order.map((id) => ({
            id, name: name(id), color: players.get(id)?.color ?? '#888', connected: players.get(id)?.connected ?? false,
            cards: hands.get(id).length, called: st.called.has(id),
          })),
        };
      },

      playerView(id) {
        return { status: '', screen: screenFor(id) };
      },

      isOver: () => st.over,

      results() {
        const standings = order
          .map((id) => ({ id, name: name(id), color: players.get(id)?.color ?? '#888', pts: handPoints(hands.get(id)) }))
          .sort((a, b) => a.pts - b.pts);
        return {
          title: st.winner ? `${name(st.winner)} wins!` : 'Game ended',
          standings: standings.map(({ id, name, color, pts }) => ({ id, name, color, score: id === st.winner ? 'Won' : `${pts} pts` })),
        };
      },
    };
  },
};

function makeDeck() {
  const deck = [];
  let n = 0;
  const add = (kind, color, value, label, small) => deck.push({ id: `c${n++}`, kind, color, value, label, small });
  for (const { id: color } of COLORS) {
    add('number', color, 0, '0');
    for (let v = 1; v <= 9; v++) for (let k = 0; k < 2; k++) add('number', color, v, String(v));
    for (let k = 0; k < 2; k++) {
      add('skip', color, null, '⦸', 'Skip');
      add('reverse', color, null, '⇄', 'Reverse');
      add('draw2', color, null, '+2', 'Draw 2');
    }
  }
  for (let k = 0; k < 4; k++) {
    add('wild', null, null, '★', 'Wild');
    add('wild4', null, null, '+4', 'Wild');
  }
  return deck; // 108
}

function cardName(card, activeColor) {
  const color = colorById.get(card.color ?? activeColor)?.label ?? '';
  switch (card.kind) {
    case 'number': return `${color} ${card.value}`;
    case 'skip': return `${color} Skip`;
    case 'reverse': return `${color} Reverse`;
    case 'draw2': return `${color} Draw 2`;
    case 'wild': return `Wild (${color})`;
    case 'wild4': return `Wild Draw 4 (${color})`;
  }
  return '?';
}

function handPoints(hand) {
  return hand.reduce((sum, c) => sum + (c.kind === 'number' ? c.value : c.kind.startsWith('wild') ? 50 : 20), 0);
}

const KIND_ORDER = { number: 0, skip: 1, reverse: 2, draw2: 3, wild: 4, wild4: 5 };
function sortHand(hand) {
  const ci = (c) => (c.color ? COLORS.findIndex((x) => x.id === c.color) : 9);
  return [...hand].sort((a, b) => ci(a) - ci(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.value ?? 0) - (b.value ?? 0));
}

function bestColor(hand) {
  const count = new Map();
  for (const c of hand) if (c.color) count.set(c.color, (count.get(c.color) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? COLORS[Math.floor(Math.random() * COLORS.length)].id;
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
