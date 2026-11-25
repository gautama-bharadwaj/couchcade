// Fuse: a push-your-luck card game for 2–8 set in a fireworks workshop that's about to go up.
// Hands are private on each phone; the TV shows the crate (draw pile), the odds, whose turn it
// is and every bang.
//
// The crate holds one Bomb fewer than there are players, plus a few harmless Decoys.
// On your turn, play as many cards as you like, then draw one from the crate (that ends your turn).
// Draw a Bomb and you're out, unless you save yourself:
//   • Bucket: douse it, then slip the Bomb back into the crate anywhere you like, in secret.
//   • Cut a wire: no Bucket (or feeling lucky)? Pick one of three wires. One in three defuses it
//     and the Bomb goes back in a random spot; the other two… boom.
// Decoys look exactly like Bombs when you peek, but just go "pop" when drawn.
// Last one standing wins.
//
// Cards (counts are for 2–5 players; 6–8 players get half as many again):
//   Bucket ×2 extra (+1 dealt to everyone)  saves you from a drawn Bomb
//   Periscope ×5   secretly see the top 3 cards (Bombs and Decoys look the same)
//   Nudge ×4       see the top card, and you may bury it at the bottom
//   Duck ×5        end your turn without drawing (pays off one draw you owe)
//   Hot Potato ×5  end your turn without drawing; the next player owes your draws + 1
//   Boomerang ×3   only when a Hot Potato was passed to you: send all your draws back to its sender
//   Stir ×4        shuffle the crate
//   Back Door ×4   draw from the bottom of the crate instead
//   Swipe ×5       take a random card from someone
//   X-Ray ×3       look at someone's whole hand
// Everyone starts with 1 Bucket and 5 other cards.
// Bots (lobby "Add bot") play from the bot section below with small human-like delays.

const CARDS = {
  bomb: { name: 'Bomb', color: '#ff4d3d', text: 'Draw it and you blow up, unless you douse it with a Bucket or cut the right wire.' },
  decoy: { name: 'Decoy', color: '#ff4d3d', text: 'Looks like a Bomb. Goes pop. Harmless.' },
  bucket: { name: 'Bucket', color: '#38b6ff', text: 'Saves you when you draw a Bomb. Then hide the Bomb back in the crate.' },
  scope: { name: 'Periscope', color: '#a77bff', text: 'Secretly see the top 3 cards of the crate. Bombs and Decoys look the same!' },
  nudge: { name: 'Nudge', color: '#c48bff', text: 'See the top card. You may bury it at the bottom of the crate.' },
  duck: { name: 'Duck', color: '#3ddc84', text: 'End your turn without drawing. (Pays off one draw you owe.)' },
  potato: { name: 'Hot Potato', color: '#ff9f1c', text: 'End your turn without drawing. The next player owes your draws plus one.' },
  boomerang: { name: 'Boomerang', color: '#ffd23f', text: 'Got a Hot Potato? Send all your draws straight back to whoever passed it.' },
  stir: { name: 'Stir', color: '#2ee6d6', text: 'Shuffle the crate.' },
  backdoor: { name: 'Back Door', color: '#7bd389', text: 'Draw from the bottom of the crate instead of the top. Ends your turn.' },
  swipe: { name: 'Swipe', color: '#ff6fd8', text: 'Take a random card from another player.' },
  xray: { name: 'X-Ray', color: '#8fd3ff', text: "Look at another player's whole hand." },
};

const DECK_COUNTS = { bucket: 2, scope: 5, nudge: 4, duck: 5, potato: 5, boomerang: 3, stir: 4, backdoor: 4, swipe: 5, xray: 3 };
const DECOYS = 3;
const DEAL = 5;

const TURN_SECONDS = 30;
const AWAY_TURN_SECONDS = 5; // turn length for a player whose phone is disconnected
const CHOICE_SECONDS = 15; // Bucket or wires, where to hide the Bomb, which wire, Nudge, target
const END_SECONDS = 7;
const WIRES = [
  { id: 'red', label: 'Red wire', color: '#ff4d3d' },
  { id: 'blue', label: 'Blue wire', color: '#38b6ff' },
  { id: 'yellow', label: 'Yellow wire', color: '#ffd23f' },
];
const TARGETED = new Set(['swipe', 'xray']);
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

export default {
  id: 'fuse',
  title: 'Fuse',
  tab: 'board',
  icon: '💣',
  description: 'Draw from the crate and pray it isn’t a Bomb. Last one standing wins.',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { type: 'screens' },

  create({ players }) {
    const order = shuffle([...players.values()].filter((p) => p.connected).map((p) => p.id));
    const n = order.length;
    const name = (id) => players.get(id)?.name ?? '?';
    const isBot = (id) => !!players.get(id)?.bot;

    // ---- Deck ---------------------------------------------------------------
    let seq = 0;
    const mk = (kind) => ({ id: `k${seq++}`, kind });
    const scale = n >= 6 ? 1.5 : 1;
    let deck = [];
    for (const [kind, count] of Object.entries(DECK_COUNTS)) for (let i = 0; i < Math.round(count * scale); i++) deck.push(mk(kind));
    deck = shuffle(deck);
    const hands = new Map(order.map((id) => [id, [mk('bucket')]]));
    for (let r = 0; r < DEAL; r++) for (const id of order) hands.get(id).push(deck.pop());
    for (let i = 0; i < n - 1; i++) deck.push(mk('bomb'));
    for (let i = 0; i < DECOYS; i++) deck.push(mk('decoy'));
    deck = shuffle(deck); // deck[0] is the top of the crate

    let clock = 0;
    const st = {
      turn: 0, // index into order
      owed: 1, // draws the current player still has to make
      passedBy: null, // who passed a Hot Potato to the current player
      phase: 'play', // play | bomb | hide | wires | nudge | target | end
      left: TURN_SECONDS,
      pendingBomb: null,
      targeting: null, // card being played that needs a target
      safeWire: null,
      cutWire: null,
      nudgeCard: null,
      alive: new Set(order),
      outOrder: [], // ids in the order they exploded
      winner: null,
      log: [],
      discard: [], // kinds, newest last (TV shows the top)
      event: null, // { kind, by, target?, card?, seq } for TV animations
      eseq: 0,
      selected: new Map(), // id -> card id they tapped (to read it before playing)
      peek: new Map(), // id -> { title, cards: [kind], lines } private info shown on their phone
      guide: new Set(), // ids reading the card guide on their phone
    };
    // What each player believes the top of the crate holds (card ids, in order). Used for bots
    // and kept honest: a player only "knows" what their own cards showed them.
    const known = new Map(order.map((id) => [id, []]));

    const current = () => order[st.turn];
    const say = (line) => {
      st.log.push(line);
      if (st.log.length > 5) st.log.shift();
    };
    const fx = (kind, extra = {}) => (st.event = { kind, seq: ++st.eseq, ...extra });
    const bombsLeft = () => deck.filter((c) => c.kind === 'bomb').length;

    function forgetTop(fromPos = 0) {
      for (const k of known.values()) if (k.length > fromPos) k.length = fromPos;
    }

    function nextTurn() {
      if (st.winner) return;
      do st.turn = (st.turn + 1) % n;
      while (!st.alive.has(current()));
      st.owed = st.pendingOwed ?? 1;
      st.passedBy = st.pendingPassedBy ?? null;
      st.pendingOwed = null;
      st.pendingPassedBy = null;
      startTurn();
    }

    function startTurn() {
      st.phase = 'play';
      st.left = TURN_SECONDS;
      st.targeting = null;
      botWait = clock + rand(1.2, 2.2);
    }

    // One draw paid off (by drawing, Ducking or Back Door). The turn ends when none are owed.
    function paid() {
      st.owed--;
      if (st.owed > 0) {
        st.phase = 'play';
        st.left = TURN_SECONDS;
        botWait = clock + rand(1, 1.8);
      } else nextTurn();
    }

    function discard(id, card) {
      const hand = hands.get(id);
      hand.splice(hand.indexOf(card), 1);
      st.discard.push(card.kind);
      if (st.discard.length > 6) st.discard.shift();
      st.selected.delete(id);
    }

    function drawCard(id, fromBottom = false) {
      const card = fromBottom ? deck.pop() : deck.shift();
      if (!card) return paid();
      if (fromBottom) {
        for (const k of known.values()) if (k.length > deck.length) k.length = deck.length;
      } else for (const k of known.values()) k[0] === card.id ? k.shift() : (k.length = 0);

      if (card.kind === 'bomb') {
        st.pendingBomb = card;
        st.phase = hands.get(id).some((c) => c.kind === 'bucket') ? 'bomb' : 'wires';
        if (st.phase === 'wires') st.safeWire = WIRES[Math.floor(Math.random() * 3)].id;
        st.cutWire = null;
        st.left = CHOICE_SECONDS;
        botWait = clock + rand(1.8, 3);
        fx('bomb', { by: id, bottom: fromBottom });
        say(`${name(id)} drew a BOMB!`);
        return;
      }
      if (card.kind === 'decoy') {
        st.discard.push('decoy');
        fx('fizzle', { by: id, bottom: fromBottom });
        say(`${name(id)} drew a Decoy. Pop!`);
        return paid();
      }
      hands.get(id).push(card);
      fx('draw', { by: id, bottom: fromBottom });
      say(`${name(id)} drew a card${fromBottom ? ' from the bottom' : ''}`);
      paid();
    }

    function explode(id) {
      st.alive.delete(id);
      st.outOrder.push(id);
      const hand = hands.get(id);
      hand.length = 0;
      st.pendingBomb = null;
      st.selected.delete(id);
      st.peek.delete(id);
      fx('boom', { by: id });
      say(`KABOOM! ${name(id)} is out`);
      if (st.alive.size === 1) {
        st.winner = [...st.alive][0];
        st.phase = 'end';
        st.left = END_SECONDS;
        say(`${name(st.winner)} is the last one standing!`);
        return;
      }
      st.pendingOwed = null;
      st.pendingPassedBy = null;
      nextTurn();
    }

    function hideBomb(id, where) {
      const bomb = st.pendingBomb;
      st.pendingBomb = null;
      let pos;
      if (where === 'bottom') pos = deck.length;
      else if (where === 'random') pos = Math.floor(Math.random() * (deck.length + 1));
      else pos = Math.max(0, Math.min(deck.length, Number(where) || 0));
      deck.splice(pos, 0, bomb);
      forgetTop(Math.min(pos, deck.length));
      if (pos === 0 && where !== 'random') known.set(id, [bomb.id]);
      fx('hide', { by: id });
      say(`${name(id)} hid the Bomb back in the crate`);
      paid();
    }

    function useBucket(id) {
      const hand = hands.get(id);
      const bucket = hand.find((c) => c.kind === 'bucket');
      if (!bucket) return;
      discard(id, bucket);
      fx('douse', { by: id });
      say(`${name(id)} doused it with a Bucket!`);
      st.phase = 'hide';
      st.left = CHOICE_SECONDS;
      botWait = clock + rand(1.5, 2.5);
    }

    function cutWire(id, wire) {
      st.cutWire = wire;
      if (wire === st.safeWire) {
        const bomb = st.pendingBomb;
        st.pendingBomb = null;
        const pos = Math.floor(Math.random() * (deck.length + 1));
        deck.splice(pos, 0, bomb);
        forgetTop(pos);
        fx('defused', { by: id, wire });
        say(`${name(id)} cut the ${wire} wire… and it worked! The Bomb goes back in at random`);
        paid();
      } else {
        fx('wrongwire', { by: id, wire });
        explode(id);
      }
    }

    function playCard(id, card, target) {
      const kind = card.kind;
      discard(id, card);
      fx('play', { by: id, card: kind, target });
      const who = name(id);
      switch (kind) {
        case 'scope': {
          const top = deck.slice(0, 3);
          known.set(id, top.map((c) => c.id));
          st.peek.set(id, { title: 'Periscope: top of the crate', cards: top.map((c) => looks(c.kind)), lines: ['Top card first. Bombs and Decoys look the same.'] });
          say(`${who} peeked at the top 3 with a Periscope`);
          break;
        }
        case 'nudge': {
          st.nudgeCard = deck[0] ?? null;
          if (!st.nudgeCard) break;
          known.set(id, [st.nudgeCard.id]);
          st.phase = 'nudge';
          st.left = CHOICE_SECONDS;
          botWait = clock + rand(1, 2);
          say(`${who} played Nudge`);
          return;
        }
        case 'stir':
          deck = shuffle(deck);
          forgetTop(0);
          say(`${who} stirred the crate`);
          break;
        case 'duck':
          say(`${who} ducked`);
          return paid();
        case 'potato': {
          st.pendingOwed = st.owed + 1;
          st.pendingPassedBy = id;
          let next = st.turn;
          do next = (next + 1) % n;
          while (!st.alive.has(order[next]));
          say(`${who} passed a Hot Potato! ${name(order[next])} owes ${st.pendingOwed} draws`);
          st.owed = 0;
          return nextTurn();
        }
        case 'boomerang': {
          const back = st.passedBy;
          const owed = st.owed;
          say(`${who} threw a Boomerang! ${name(back)} owes ${owed} draws`);
          st.turn = order.indexOf(back);
          st.owed = owed;
          st.passedBy = id;
          return startTurn();
        }
        case 'backdoor':
          say(`${who} snuck through the Back Door`);
          return drawCard(id, true);
        case 'swipe': {
          const th = hands.get(target);
          const got = th.splice(Math.floor(Math.random() * th.length), 1)[0];
          hands.get(id).push(got);
          st.selected.delete(target);
          say(`${who} swiped a card from ${name(target)}`);
          st.peek.set(id, { title: `You swiped from ${name(target)}`, cards: [got.kind], lines: [] });
          break;
        }
        case 'xray':
          st.peek.set(id, { title: `${name(target)}'s hand`, cards: hands.get(target).map((c) => c.kind), lines: hands.get(target).length ? [] : ['Empty!'] });
          say(`${who} X-rayed ${name(target)}'s hand`);
          break;
      }
      st.phase = 'play';
      st.left = Math.max(st.left, 12);
    }

    function canPlay(id, card) {
      if (current() !== id || st.phase !== 'play' || st.winner) return false;
      switch (card.kind) {
        case 'bucket':
          return false;
        case 'boomerang':
          return !!st.passedBy && st.alive.has(st.passedBy) && st.passedBy !== id;
        case 'swipe':
          return targets(id, true).length > 0;
        case 'xray':
          return targets(id, true).length > 0;
        case 'scope':
        case 'nudge':
          return deck.length > 0;
        default:
          return true;
      }
    }
    const targets = (id, needCards) => order.filter((o) => o !== id && st.alive.has(o) && (!needCards || hands.get(o).length > 0));

    function autoMove() {
      const id = current();
      switch (st.phase) {
        case 'play':
          say(`${name(id)} ran out of time and had to draw`);
          return drawCard(id);
        case 'bomb':
          return useBucket(id);
        case 'hide':
          return hideBomb(id, 'random');
        case 'wires':
          return cutWire(id, WIRES[Math.floor(Math.random() * 3)].id);
        case 'nudge':
          st.phase = 'play';
          st.left = TURN_SECONDS;
          return;
        case 'target': {
          const t = targets(id, true);
          return playCard(id, st.targeting, t[Math.floor(Math.random() * t.length)]);
        }
      }
    }

    // ---- Phone screens --------------------------------------------------------
    // Every card in your hand can be tapped to read it; on your turn, ones you can't play right now are dimmed.
    const cardView = (c, dim) => ({ id: c.id, label: ICON[c.kind], small: CARDS[c.kind].name, color: CARDS[c.kind].color, dim });

    function screenFor(id) {
      if (!hands.has(id)) return { title: 'Game in progress', lines: ['You can join the next game. Watch the TV!'] };
      const hand = sortHand(hands.get(id));
      const me = current() === id;
      const s = { title: '', lines: [], cards: [], actions: [] };

      if (st.winner) {
        s.title = st.winner === id ? 'You survived!' : `${name(st.winner)} wins`;
        s.lines = [st.winner === id ? 'Last one standing. Not a scratch.' : st.alive.has(id) ? 'So close.' : `You came ${ORD[n - st.outOrder.indexOf(id)]}.`];
        return s;
      }
      if (!st.alive.has(id)) {
        s.title = '💥 You blew up';
        s.lines = ['Watch the TV and enjoy the chaos.', `${st.alive.size} still standing.`];
        return s;
      }

      const odds = deck.length ? `${bombsLeft()} Bomb${bombsLeft() === 1 ? '' : 's'} in ${deck.length} cards` : '';
      s.cards.push({ label: me ? (st.owed > 1 ? `Your turn: ${st.owed} draws to go` : 'Your turn') : `${name(current())}'s turn`, sub: odds, color: me ? '#ff9f1c' : '#3a4256' });

      // Choices that take over the screen.
      if (me && st.phase === 'bomb') {
        s.title = '💣 You drew a BOMB!';
        s.lines = ['Douse it with a Bucket and hide it back in the crate, or keep your Bucket and gamble on the wires (1 in 3 survives).'];
        s.actions = [
          { key: 'bucket', label: '🪣 Use a Bucket', style: 'primary' },
          { key: 'gamble', label: '✂️ Cut a wire instead', style: 'secondary' },
        ];
        s.footer = `${st.left}s`;
        return s;
      }
      if (me && st.phase === 'wires') {
        s.title = '✂️ Cut a wire!';
        s.lines = [hand.some((c) => c.kind === 'bucket') ? 'Feeling lucky. One wire defuses it.' : 'No Bucket! One of these defuses the Bomb. The other two…'];
        s.choose = { key: 'wire', options: WIRES.map((w) => ({ id: w.id, label: w.label, color: w.color })) };
        s.footer = `${st.left}s`;
        return s;
      }
      if (me && st.phase === 'hide') {
        s.title = 'Hide the Bomb';
        s.lines = ['Only you will know where it is.'];
        const opts = [
          { id: '0', label: 'On top', sub: 'Next player draws it' },
          { id: '1', label: '2nd from the top' },
          { id: '2', label: '3rd from the top' },
          { id: '4', label: '5th from the top' },
          { id: 'bottom', label: 'At the bottom' },
          { id: 'random', label: 'Somewhere random', sub: "Even you won't know" },
        ].filter((o) => o.id === 'bottom' || o.id === 'random' || Number(o.id) <= deck.length);
        s.choose = { key: 'hide', options: opts };
        s.footer = `${st.left}s`;
        return s;
      }
      if (me && st.phase === 'nudge') {
        s.title = 'Nudge';
        s.lines = ['The top card of the crate is:'];
        s.cards.push({ label: `${ICON[looks(st.nudgeCard.kind)]} ${CARDS[looks(st.nudgeCard.kind)].name}`, sub: looks(st.nudgeCard.kind) === 'bomb' ? 'Could be a Decoy… or not.' : '', color: CARDS[st.nudgeCard.kind].color });
        s.actions = [
          { key: 'bury', label: 'Bury it at the bottom', style: 'primary' },
          { key: 'keep', label: 'Leave it on top', style: 'secondary' },
        ];
        s.footer = `${st.left}s`;
        return s;
      }
      if (me && st.phase === 'target') {
        s.title = st.targeting.kind === 'swipe' ? 'Swipe from who?' : 'X-Ray who?';
        s.choose = { key: 'target', options: targets(id, true).map((o) => ({ id: o, label: name(o), sub: `${hands.get(o).length} cards`, color: players.get(o)?.color })) };
        s.actions = [{ key: 'cancel', label: 'Never mind', style: 'secondary' }];
        s.footer = `${st.left}s`;
        return s;
      }

      if (st.guide.has(id)) {
        s.title = '📖 What the cards do';
        s.lines = [
          'On your turn, play as many cards as you like (or none), then draw one from the crate. Drawing ends your turn.',
          "Draw a Bomb and you're out, unless you douse it with a Bucket or cut the right wire. Last one standing wins.",
        ];
        const count = (k) => hand.filter((c) => c.kind === k).length;
        // Cards in your hand first, then the rest.
        for (const k of [...KIND_ORDER].sort((x, y) => (count(y) > 0) - (count(x) > 0))) {
          const have = count(k);
          s.cards.push({ label: `${ICON[k]} ${CARDS[k].name}${have ? ` · you have ${have}` : ''}`, sub: CARDS[k].text, color: CARDS[k].color });
        }
        s.actions = [{ key: 'back', label: 'Back to my hand', style: 'primary' }];
        s.footer = me ? `${st.left}s` : '';
        return s;
      }

      const peek = st.peek.get(id);
      if (peek) {
        s.title = peek.title;
        s.lines = peek.lines;
        s.hand = { key: 'none', cards: peek.cards.map((k, i) => ({ id: `p${i}`, label: ICON[k], small: CARDS[k].name, color: CARDS[k].color, playable: true })) };
        s.actions = [{ key: 'ok', label: 'Got it', style: 'primary' }];
        s.footer = me ? `${st.left}s` : '';
        return s;
      }

      s.title = me ? (st.owed > 1 ? `Your turn ×${st.owed}` : 'Your turn') : 'Your hand';
      const sel = hand.find((c) => c.id === st.selected.get(id));
      s.hand = { key: 'sel', cards: hand.map((c) => ({ ...cardView(c, me && !canPlay(id, c)), selected: c === sel })) };
      if (sel) {
        const why = me && !canPlay(id, sel) ? WHY_NOT[sel.kind] : '';
        s.cards.push({ label: `${ICON[sel.kind]} ${CARDS[sel.kind].name}`, sub: CARDS[sel.kind].text + (why ? ` ${why}` : ''), color: CARDS[sel.kind].color });
        if (me && canPlay(id, sel)) s.actions.push({ key: 'play', label: `Play ${CARDS[sel.kind].name}`, style: 'primary' });
      } else s.lines.push(me ? 'Tap a card to read it and play it, or draw to end your turn.' : 'Tap a card to read what it does.');
      if (me) s.actions.push({ key: 'draw', label: st.owed > 1 ? `Draw (${st.owed} to go)` : 'Draw and end turn', style: sel && canPlay(id, sel) ? 'secondary' : 'primary' });
      s.actions.push({ key: 'guide', label: '📖 What do the cards do?', style: 'secondary' });
      s.footer = me ? `${st.left}s` : '';
      return s;
    }

    // ---- Bots ---------------------------------------------------------------
    let botWait = rand(2, 3);

    function botThink() {
      const id = current();
      if (!isBot(id) || clock < botWait) return;
      botWait = clock + rand(0.9, 1.6);
      const hand = hands.get(id);
      const has = (k) => hand.find((c) => c.kind === k && canPlay(id, c));
      const act = (key, value) => api.onAction(id, { key, value });
      st.peek.delete(id);

      if (st.phase === 'bomb') return act(Math.random() < 0.06 ? 'gamble' : 'bucket');
      if (st.phase === 'wires') return act('wire', WIRES[Math.floor(Math.random() * 3)].id);
      if (st.phase === 'hide') {
        // Usually set a trap for the next player; sometimes bury it deep.
        const r = Math.random();
        return act('hide', r < 0.55 ? '0' : r < 0.7 ? '1' : r < 0.85 ? 'random' : 'bottom');
      }
      if (st.phase === 'nudge') return act(isDanger(st.nudgeCard) ? 'bury' : 'keep');
      if (st.phase === 'target') {
        const t = targets(id, true).sort((a, b) => hands.get(b).length - hands.get(a).length);
        return act('target', t[0]);
      }
      if (st.phase !== 'play') return;

      const k = known.get(id);
      const topCard = k.length && deck[0]?.id === k[0] ? deck[0] : null;
      const topKnownSafe = topCard && !isDanger(topCard);
      const topKnownBad = topCard && isDanger(topCard);
      const risk = deck.length ? bombsLeft() / deck.length : 0;
      const play = (c) => {
        st.selected.set(id, c.id);
        act('play');
      };

      if (topKnownSafe) return act('draw');
      if (st.owed > 1 && has('boomerang')) return play(has('boomerang'));
      if (topKnownBad) {
        const escape = has('potato') ?? has('duck') ?? has('nudge') ?? has('stir') ?? has('backdoor');
        if (escape) return play(escape);
        return act('draw');
      }
      // Unknown top: look first if we can, more eagerly when it's risky or we have no Bucket.
      const noBucket = !hand.some((c) => c.kind === 'bucket');
      if (has('scope') && (risk > 0.12 || noBucket) && Math.random() < 0.8) return play(has('scope'));
      if (has('nudge') && (risk > 0.15 || noBucket) && Math.random() < 0.6) return play(has('nudge'));
      if (has('swipe') && Math.random() < (noBucket ? 0.7 : 0.3)) return play(has('swipe'));
      if (has('xray') && Math.random() < 0.15) return play(has('xray'));
      if ((risk > 0.25 || (noBucket && risk > 0.12)) && Math.random() < 0.75) {
        const skip = has('potato') ?? has('duck') ?? has('backdoor');
        if (skip) return play(skip);
      }
      if (st.owed > 1 && Math.random() < 0.6) {
        const skip = has('potato') ?? has('duck');
        if (skip) return play(skip);
      }
      act('draw');
    }

    let acc = 0;
    const api = {
      update(dt) {
        clock += dt;
        if (!st.winner) botThink();
        acc += dt;
        while (acc >= 1) {
          acc -= 1;
          st.left--;
        }
        if (st.winner) {
          if (st.left <= 0) st.over = true;
          return;
        }
        // Whoever's turn it is has dropped off the Wi-Fi: don't make the table wait the full timer.
        if (!players.get(current())?.connected) st.left = Math.min(st.left, AWAY_TURN_SECONDS);
        if (st.left <= 0) autoMove();
      },

      onAction(id, { key, value }) {
        if (!hands.has(id) || st.winner || !st.alive.has(id)) return;
        const hand = hands.get(id);

        if (key === 'sel') {
          if (hand.some((c) => c.id === value)) st.selected.set(id, st.selected.get(id) === value ? null : value);
          return;
        }
        if (key === 'ok') return void st.peek.delete(id);
        if (key === 'guide') return void st.guide.add(id);
        if (key === 'back') return void st.guide.delete(id);
        if (current() !== id) return;

        switch (st.phase) {
          case 'bomb':
            if (key === 'bucket') return useBucket(id);
            if (key === 'gamble') {
              st.phase = 'wires';
              st.safeWire = WIRES[Math.floor(Math.random() * 3)].id;
              st.left = CHOICE_SECONDS;
              say(`${name(id)} is going for the wires!`);
              fx('gamble', { by: id });
            }
            return;
          case 'wires':
            if (key === 'wire' && WIRES.some((w) => w.id === value)) cutWire(id, value);
            return;
          case 'hide':
            if (key === 'hide' && (['bottom', 'random'].includes(value) || /^\d$/.test(value))) hideBomb(id, value);
            return;
          case 'nudge':
            if (key === 'bury' || key === 'keep') {
              if (key === 'bury' && deck[0] === st.nudgeCard) {
                deck.push(deck.shift());
                forgetTop(0);
                say(`${name(id)} buried the top card`);
              } else say(`${name(id)} left the top card where it was`);
              st.nudgeCard = null;
              st.phase = 'play';
              st.left = Math.max(st.left, 12);
            }
            return;
          case 'target':
            if (key === 'cancel') {
              st.phase = 'play';
              st.targeting = null;
              return;
            }
            if (key === 'target' && targets(id, true).includes(value)) {
              const card = st.targeting;
              st.targeting = null;
              return playCard(id, card, value);
            }
            return;
          case 'play': {
            st.peek.delete(id);
            if (key === 'draw') return drawCard(id);
            if (key === 'play') {
              const card = hand.find((c) => c.id === (value ?? st.selected.get(id)));
              if (!card || !canPlay(id, card)) return;
              if (TARGETED.has(card.kind)) {
                st.targeting = card;
                st.phase = 'target';
                st.left = CHOICE_SECONDS;
                return;
              }
              return playCard(id, card);
            }
          }
        }
      },

      snapshot() {
        return {
          phase: st.phase,
          turn: st.winner ? null : current(),
          owed: st.owed,
          left: st.left,
          limit: st.phase === 'play' ? TURN_SECONDS : st.phase === 'end' ? END_SECONDS : CHOICE_SECONDS,
          deck: deck.length,
          bombs: bombsLeft(),
          discard: st.discard.at(-1) ?? null,
          event: st.event,
          wires: st.phase === 'wires' || st.event?.kind === 'wrongwire' || st.event?.kind === 'defused' ? { cut: st.cutWire } : null,
          log: st.log,
          winner: st.winner,
          players: order.map((id) => ({
            id, name: name(id), color: players.get(id)?.color ?? '#888', connected: players.get(id)?.connected ?? false,
            cards: hands.get(id).length, alive: st.alive.has(id),
            place: st.alive.has(id) ? 0 : n - st.outOrder.indexOf(id),
          })),
        };
      },

      playerView(id) {
        return { status: '', screen: screenFor(id) };
      },

      isOver: () => !!st.over,

      results() {
        const ranked = [...(st.winner ? [st.winner] : [...st.alive]), ...[...st.outOrder].reverse()];
        return {
          title: st.winner ? `${name(st.winner)} survives!` : 'Game ended',
          standings: ranked.map((id, i) => ({
            id, name: name(id), color: players.get(id)?.color ?? '#888',
            score: id === st.winner ? 'Survived' : st.alive.has(id) ? 'Standing' : `${ORD[i + 1]} · boom`,
          })),
        };
      },

      // For tests only.
      _debug: { st, deck: () => deck, hands, order },
    };
    return api;
  },
};

// Card faces on the phone: an icon plus the name underneath.
const ICON = { bomb: '💣', decoy: '💣', bucket: '🪣', scope: '🔭', nudge: '👉', duck: '🦆', potato: '🥔', boomerang: '🪃', stir: '🌀', backdoor: '🚪', swipe: '🧲', xray: '👁️' };

// Shown under a card you tapped on your turn but can't play right now.
const WHY_NOT = {
  bucket: "You don't play it from your hand. You get to use it the moment you draw a Bomb.",
  boomerang: 'Only after someone passes you a Hot Potato.',
  swipe: 'Nobody has a card to take.',
  xray: 'Nobody has a card to see.',
};

// Decoys are disguised as Bombs whenever someone peeks.
const looks = (kind) => (kind === 'decoy' ? 'bomb' : kind);
const isDanger = (card) => card && (card.kind === 'bomb' || card.kind === 'decoy');

const KIND_ORDER = Object.keys(CARDS);
function sortHand(hand) {
  return [...hand].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
