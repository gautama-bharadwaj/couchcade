// Tidewake: an island trading board game for 2–6. Rival crews land on a newly risen volcanic
// island, harvest what it grows, trade with each other and build their way to 8 points.
// The TV shows the island; each phone is a private hand with build, trade and bottle buttons.
//
// The island is a hex map (19 tiles for up to 4 players, 30 with two volcanoes for 5–6), shuffled
// every game, volcanoes included.
// Each land tile grows one resource and carries a number; the volcano grows nothing.
//   • Setup: in turn order and back again, everyone places a Hut and a Trail next to it.
//     The second Hut pays out one of each resource around it.
//   • Each turn: roll two dice. Every tile with that number pays its resource to each Hut (1)
//     or Lighthouse (2) on its corners. Then trade and build in any order, and end the turn.
//   • A 7 erupts the volcano: anyone holding more than 7 cards loses half (picked at random, so
//     nobody waits), and the roller drifts the Ash Cloud onto a tile (it grows nothing while
//     covered) and steals a random card from someone with a building there.
//   • Build: Trail (edge, must join your network), Hut (corner, 1 point, no Hut on a
//     neighbouring corner, must touch your trail), Lighthouse (upgrade a Hut, 2 points,
//     harvests double), Bottle (a random Message in a Bottle card, played on a later turn).
//   • Trade: offer any cards to the table for any cards; others accept, decline or counter, and
//     you pick who to deal with. Or trade with the bank at 4:1, or better at a harbor (3:1 any,
//     2:1 one resource) where you have a building.
//   • Awards: Explorer (2 points) for the longest single connected Trail, at least 5 long.
//     Another player's building cuts a trail. Ties keep the current Explorer.
//     Trader (1 point) for the most deals done with other players, at least 3.
//   • First to 8 points on their own turn wins (Treasure bottles count, but stay secret till then).
// Bots (lobby "Add bot") place, build, bank-trade, offer simple deals and answer offers.

const S3 = Math.sqrt(3);
const GOAL = 8;

// Resources and the tiles that grow them. Change the theme here; the rest only uses the ids.
export const RES = ['wood', 'coco', 'fish', 'shell', 'stone'];
export const RINFO = {
  wood: { name: 'Driftwood', icon: '🪵', color: '#c98b4f', tile: 'Driftwood Shore', tileColor: '#9a6a3c' },
  coco: { name: 'Coconut', icon: '🥥', color: '#7fcf5a', tile: 'Palm Grove', tileColor: '#3f9a4a' },
  fish: { name: 'Fish', icon: '🐟', color: '#4fb3ff', tile: 'Lagoon', tileColor: '#2a8fb8' },
  shell: { name: 'Shell', icon: '🐚', color: '#ff9fbf', tile: 'Tide Pools', tileColor: '#e0a48c' },
  stone: { name: 'Stone', icon: '🪨', color: '#a3adc2', tile: 'Basalt Cliffs', tileColor: '#5d6474' },
};
export const COST = {
  trail: { wood: 1, coco: 1 },
  hut: { wood: 1, coco: 1, fish: 1, shell: 1 },
  light: { stone: 3, shell: 2 },
  bottle: { fish: 1, shell: 1, stone: 1 },
};
const LIMIT = { trail: 15, hut: 5, light: 4 };
const BUILD = {
  trail: { name: 'Trail', icon: '🪢' },
  hut: { name: 'Hut', icon: '🛖' },
  light: { name: 'Lighthouse', icon: '🗼' },
  bottle: { name: 'Bottle', icon: '🍾' },
};
const BOTTLES = {
  treasure: { name: 'Buried Treasure', icon: '💰', text: 'Worth 1 secret point. Kept hidden until it wins you the game.', count: 5 },
  spyglass: { name: 'Spyglass', icon: '🔭', text: 'Drift the Ash Cloud to any tile and steal a card from someone there.', count: 8 },
  current: { name: 'Lucky Current', icon: '🌊', text: 'Take any 2 resources from the bank.', count: 3 },
  calm: { name: 'Calm Seas', icon: '⛵', text: 'Build 2 Trails for free.', count: 3 },
  monkey: { name: 'Monkey Business', icon: '🐒', text: 'Name a resource. Every other player hands you 1 of it, if they have any.', count: 3 },
};

const EXPLORER_MIN = 5;
const TRADER_MIN = 3;

const SETUP_SECONDS = 60;
const ROLL_SECONDS = 20;
const TURN_SECONDS = 150;
const CHOICE_SECONDS = 25;
const AWAY_SECONDS = 5;
const END_SECONDS = 10;

export default {
  id: 'tidewake',
  title: 'Tidewake',
  tab: 'board',
  icon: '🌋',
  description: 'Harvest a volcanic island, trade with everyone and build to 8 points.',
  minPlayers: 2,
  maxPlayers: 6,
  controller: { type: 'screens' },
  // How to play, shown on the TV at the start (host can skip).
  rules: [
    { title: 'First to 8 points wins', art: 'goal', text: 'Huts are worth 1 point and Lighthouses 2. Build them on the corners of the island tiles.' },
    { title: 'Roll, harvest, build', art: 'harvest', text: 'Each turn, roll the dice. Every tile showing that number pays its resource to each building on its corners.' },
    { title: 'Build on your phone', art: 'build', text: 'Tap a glowing spot on your phone’s map, then confirm. Huts must touch your Trail and can’t sit right next to another Hut.' },
    { title: 'Trade out loud', art: 'trade', text: 'Offer any cards to the table. Others accept, pass or counter, and you pick the deal. Or trade with the bank at 4 for 1, better at a harbor.' },
    { title: 'Seven erupts the volcano', art: 'erupt', text: 'Anyone holding more than 7 cards loses half. The roller drifts the Ash Cloud onto a tile and steals a card from someone there.' },
    { title: 'Bottles and awards', art: 'bottles', text: 'Buy a Message in a Bottle for a surprise. Explorer is worth 2 points for the longest unbroken Trail, Trader 1 point for the most deals.' },
  ],

  create({ players }) {
    const order = shuffle([...players.values()].filter((p) => p.connected).map((p) => p.id));
    const n = order.length;
    const name = (id) => players.get(id)?.name ?? '?';
    const color = (id) => players.get(id)?.color ?? '#888';
    const isBot = (id) => !!players.get(id)?.bot;

    const board = makeBoard(n >= 5);
    const { tiles, verts, edges } = board;

    // ---- Players ------------------------------------------------------------------
    const P = new Map(
      order.map((id) => [id, {
        hand: Object.fromEntries(RES.map((r) => [r, 0])),
        bottles: [], // { kind, turn } turn = the turn number it was bought on
        huts: 0, lights: 0, trails: 0,
        deals: 0, // trades done with other players
        played: false, // played a bottle this turn
      }]),
    );
    let deck = [];
    const scale = n >= 5 ? 1.4 : 1;
    for (const [kind, b] of Object.entries(BOTTLES)) for (let i = 0; i < Math.round(b.count * scale); i++) deck.push(kind);
    deck = shuffle(deck);

    let clock = 0;
    const setupOrder = [...order, ...[...order].reverse()];
    const st = {
      phase: 'setup', // setup | roll | main | ash | steal | end
      step: 'hut', // setup: hut | trail
      setupIdx: 0,
      turn: 0, // index into order (after setup)
      turnNo: 0,
      left: SETUP_SECONDS,
      dice: null,
      rollSeq: 0,
      ash: board.volcanoes[0],
      lastHut: null, // setup: the hut the trail must touch
      mode: null, // the current player's open screen: { kind, ... }
      offer: null, // { from, give, want, replies: Map, counters: Map, seq }
      drafts: new Map(), // id -> { give, want } a counter-offer being put together
      explorer: null,
      trader: null,
      winner: null,
      over: false,
      log: [],
      event: null,
      eseq: 0,
      gains: new Map(), // id -> { res: n } what the last roll paid them (shown on their phone)
      guide: new Set(),
      fromRoll: null, // last roll's payouts for the TV { id: { res: n } }
      freeTrails: 0,
      stolen: null,
    };
    let offerSeq = 0;

    const current = () => (st.phase === 'setup' ? setupOrder[st.setupIdx] : order[st.turn]);
    const say = (line) => {
      st.log.push(line);
      if (st.log.length > 5) st.log.shift();
    };
    const fx = (kind, extra = {}) => (st.event = { kind, seq: ++st.eseq, ...extra });
    const count = (h) => RES.reduce((s, r) => s + (h[r] || 0), 0);
    const canPay = (id, cost) => RES.every((r) => P.get(id).hand[r] >= (cost[r] || 0));
    const pay = (id, cost) => RES.forEach((r) => (P.get(id).hand[r] -= cost[r] || 0));
    const gain = (id, res, k = 1) => (P.get(id).hand[res] += k);

    const publicVp = (id) => {
      const p = P.get(id);
      return p.huts + 2 * p.lights + (st.explorer === id ? 2 : 0) + (st.trader === id ? 1 : 0);
    };
    const secretVp = (id) => P.get(id).bottles.filter((b) => b.kind === 'treasure').length;
    const vp = (id) => publicVp(id) + secretVp(id);

    // ---- Board rules -----------------------------------------------------------------
    const hutOk = (v, id, setup) => {
      if (verts[v].owner) return false;
      if (verts[v].adj.some((a) => verts[a].owner)) return false;
      if (setup) return true;
      return verts[v].edges.some((e) => edges[e].owner === id);
    };
    const trailOk = (e, id) => {
      const ed = edges[e];
      if (ed.owner) return false;
      if (st.phase === 'setup') return ed.v.includes(st.lastHut);
      return ed.v.some((v) => verts[v].owner === id || (!verts[v].owner && verts[v].edges.some((x) => x !== e && edges[x].owner === id)));
    };
    const spots = (id, what) => {
      const setup = st.phase === 'setup';
      if (what === 'hut') return verts.filter((v) => hutOk(v.id, id, setup)).map((v) => v.id);
      if (what === 'trail') return edges.filter((e) => trailOk(e.id, id)).map((e) => e.id);
      if (what === 'light') return verts.filter((v) => v.owner === id && v.kind === 'hut').map((v) => v.id);
      if (what === 'ash') return tiles.filter((t) => t.id !== st.ash).map((t) => t.id);
      return [];
    };
    const rate = (id, res) => {
      let r = 4;
      for (const v of verts) if (v.owner === id && v.harbor) r = Math.min(r, v.harbor === 'any' ? 3 : v.harbor === res ? 2 : 4);
      return r;
    };
    const canBuild = (id, what) => {
      const p = P.get(id);
      if (!canPay(id, COST[what])) return false;
      if (what === 'bottle') return deck.length > 0;
      if (what === 'trail' && p.trails >= LIMIT.trail) return false;
      if (what === 'hut' && p.huts >= LIMIT.hut) return false;
      if (what === 'light' && p.lights >= LIMIT.light) return false;
      return spots(id, what).length > 0;
    };
    const victims = (id) =>
      [...new Set(tiles[st.ash].v.map((v) => verts[v].owner).filter((o) => o && o !== id && count(P.get(o).hand) > 0))];

    // ---- Awards ----------------------------------------------------------------------
    function checkAwards() {
      const holder = st.explorer;
      const next = nextExplorer(holder, new Map(order.map((id) => [id, longestTrail(board, id)])));
      if (next !== holder) {
        st.explorer = next;
        if (next) {
          say(`${name(next)} is now the Explorer (+2)`);
          fx('award', { by: next, award: 'explorer' });
        } else {
          say(`${name(holder)} is no longer the Explorer`);
        }
      }
      const holderDeals = st.trader ? P.get(st.trader).deals : 0;
      for (const id of order) {
        const d = P.get(id).deals;
        if (id !== st.trader && d >= TRADER_MIN && d > holderDeals) {
          st.trader = id;
          say(`${name(id)} is now the Trader (+1)`);
          fx('award', { by: id, award: 'trader' });
          break;
        }
      }
    }
    function checkWin() {
      if (st.winner || st.phase === 'setup') return;
      const id = current();
      if (vp(id) >= GOAL) {
        st.winner = id;
        st.phase = 'end';
        st.mode = null;
        st.offer = null;
        st.left = END_SECONDS;
        const t = secretVp(id);
        say(`${name(id)} wins with ${vp(id)} points${t ? ` (${t} from Buried Treasure)` : ''}!`);
        fx('win', { by: id });
      }
    }

    // ---- Turn flow --------------------------------------------------------------------
    let botWait = rand(1.5, 2.5);
    const botNext = (a = 0.9, b = 1.6) => (botWait = clock + rand(a, b));

    function place(id, what, spot) {
      const p = P.get(id);
      if (what === 'hut') {
        verts[spot].owner = id;
        verts[spot].kind = 'hut';
        p.huts++;
        say(`${name(id)} built a Hut`);
      } else if (what === 'light') {
        verts[spot].kind = 'light';
        p.huts--;
        p.lights++;
        say(`${name(id)} raised a Lighthouse`);
      } else if (what === 'trail') {
        edges[spot].owner = id;
        p.trails++;
        say(`${name(id)} laid a Trail`);
      }
      fx('build', { by: id, what, spot });
      checkAwards();
    }

    function setupPlace(id, spot) {
      if (st.step === 'hut') {
        if (!hutOk(spot, id, true)) return;
        place(id, 'hut', spot);
        st.lastHut = spot;
        if (st.setupIdx >= n) {
          // Second hut: one of each resource around it.
          for (const t of verts[spot].tiles) if (tiles[t].res) gain(id, tiles[t].res);
        }
        st.step = 'trail';
        st.mode = null;
        st.left = SETUP_SECONDS;
        botNext();
        return;
      }
      if (!trailOk(spot, id)) return;
      place(id, 'trail', spot);
      st.step = 'hut';
      st.lastHut = null;
      st.mode = null;
      st.setupIdx++;
      st.left = SETUP_SECONDS;
      botNext(1.2, 2);
      if (st.setupIdx >= setupOrder.length) {
        st.phase = 'roll';
        st.turn = 0;
        st.turnNo = 1;
        st.left = ROLL_SECONDS;
        say(`The island is settled. ${name(order[0])} rolls first.`);
        fx('setupDone');
      }
    }

    function roll(id) {
      checkWin(); // an award won on someone else's turn may have put them over the line
      if (st.winner) return;
      const a = 1 + Math.floor(Math.random() * 6);
      const b = 1 + Math.floor(Math.random() * 6);
      st.dice = [a, b];
      st.rollSeq++;
      const sum = a + b;
      st.gains = new Map();
      st.fromRoll = {};
      if (sum === 7) {
        // Eruption: big hands lose half, then the roller moves the Ash Cloud.
        const lost = {};
        for (const pid of order) {
          const h = P.get(pid).hand;
          const total = count(h);
          if (total <= 7) continue;
          const drop = Math.floor(total / 2);
          const pool = RES.flatMap((r) => Array(h[r]).fill(r));
          const gone = shuffle(pool).slice(0, drop);
          for (const r of gone) h[r]--;
          lost[pid] = drop;
          say(`${name(pid)} lost ${drop} cards in the eruption`);
        }
        fx('erupt', { by: id, lost });
        say(`${name(id)} rolled 7. The volcano erupts!`);
        st.phase = 'ash';
        st.mode = null;
        st.left = CHOICE_SECONDS;
        st.afterAsh = 'main';
        botNext(1.5, 2.5);
        return;
      }
      for (const t of tiles) {
        if (t.num !== sum || t.id === st.ash || !t.res) continue;
        for (const v of t.v) {
          const o = verts[v].owner;
          if (!o) continue;
          const k = verts[v].kind === 'light' ? 2 : 1;
          gain(o, t.res, k);
          const g = st.gains.get(o) ?? {};
          g[t.res] = (g[t.res] || 0) + k;
          st.gains.set(o, g);
        }
      }
      st.fromRoll = Object.fromEntries(st.gains);
      const blocked = tiles.find((t) => t.id === st.ash && t.num === sum);
      fx('roll', { by: id, sum, blocked: !!blocked });
      say(`${name(id)} rolled ${sum}${st.gains.size ? '' : '. Nothing grows.'}`);
      st.phase = 'main';
      st.left = TURN_SECONDS;
      botNext(1.4, 2.2);
    }

    function moveAsh(id, tile) {
      if (tile === st.ash || !tiles[tile]) return;
      st.ash = tile;
      fx('ash', { by: id, tile });
      say(`${name(id)} drifted the Ash Cloud`);
      const vs = victims(id);
      if (vs.length === 0) return afterSteal();
      if (vs.length === 1) return steal(id, vs[0]);
      st.phase = 'steal';
      st.left = CHOICE_SECONDS;
      botNext();
    }
    function steal(id, from) {
      const h = P.get(from).hand;
      const pool = RES.flatMap((r) => Array(h[r]).fill(r));
      if (pool.length) {
        const r = pool[Math.floor(Math.random() * pool.length)];
        h[r]--;
        gain(id, r);
        st.stolen = { by: id, from, res: r, seq: st.eseq + 1 };
        fx('steal', { by: id, from });
        say(`${name(id)} stole a card from ${name(from)}`);
      }
      afterSteal();
    }
    function afterSteal() {
      st.phase = 'main';
      st.mode = null;
      st.left = Math.max(st.left, st.afterAsh === 'main' && st.turnLeft ? st.turnLeft : TURN_SECONDS);
      st.turnLeft = null;
      botNext();
      checkWin();
    }

    function endTurn() {
      st.offer = null;
      st.drafts.clear();
      st.mode = null;
      st.freeTrails = 0;
      P.get(current()).played = false;
      st.turn = (st.turn + 1) % n;
      st.turnNo++;
      st.phase = 'roll';
      st.dice = null;
      st.left = ROLL_SECONDS;
      st.gains = new Map();
      botNext(1.2, 2.2);
    }

    // ---- Trading -----------------------------------------------------------------------
    const empty = () => Object.fromEntries(RES.map((r) => [r, 0]));
    const canGive = (id, give) => RES.every((r) => P.get(id).hand[r] >= (give[r] || 0));
    const fmt = (h) => RES.filter((r) => h[r] > 0).map((r) => `${RINFO[r].icon}${h[r] > 1 ? `×${h[r]}` : ''}`).join(' ') || 'nothing';

    function openOffer(id, give, want) {
      if (count(give) === 0 || count(want) === 0 || !canGive(id, give)) return;
      st.offer = { from: id, give: { ...give }, want: { ...want }, replies: new Map(), counters: new Map(), seq: ++offerSeq };
      st.mode = { kind: 'offer' };
      st.drafts.clear();
      say(`${name(id)} offers ${fmt(give)} for ${fmt(want)}`);
      fx('offer', { by: id });
      for (const pid of order) if (pid !== id && isBot(pid)) botReplyAt.set(pid, clock + rand(1.5, 4));
    }
    // Swap: `a` gives aGive and gets aGet from `b`.
    function deal(a, b, aGive, aGet) {
      if (!canGive(a, aGive) || !canGive(b, aGet)) return false;
      for (const r of RES) {
        P.get(a).hand[r] += (aGet[r] || 0) - (aGive[r] || 0);
        P.get(b).hand[r] += (aGive[r] || 0) - (aGet[r] || 0);
      }
      P.get(a).deals++;
      P.get(b).deals++;
      say(`${name(a)} traded ${fmt(aGive)} to ${name(b)} for ${fmt(aGet)}`);
      fx('deal', { by: a, with: b, give: aGive, get: aGet });
      st.offer = null;
      st.drafts.clear();
      st.mode = null;
      checkAwards();
      checkWin();
      return true;
    }

    // ---- Bottles -------------------------------------------------------------------------
    const playable = (id) => {
      const p = P.get(id);
      if (p.played || st.phase !== 'main') return [];
      return [...new Set(p.bottles.filter((b) => b.kind !== 'treasure' && b.turn < st.turnNo).map((b) => b.kind))];
    };
    function useBottle(id, kind) {
      const p = P.get(id);
      const i = p.bottles.findIndex((b) => b.kind === kind && b.turn < st.turnNo);
      if (i < 0 || p.played) return false;
      p.bottles.splice(i, 1);
      p.played = true;
      say(`${name(id)} opened a bottle: ${BOTTLES[kind].name}`);
      fx('bottle', { by: id, bottle: kind });
      return true;
    }

    // ---- Phone actions ----------------------------------------------------------------------
    function onAction(id, { key, value }) {
      if (!P.has(id) || st.phase === 'end') return;
      if (key === 'guide') return void st.guide.add(id);
      if (key === 'back') return void st.guide.delete(id);

      // Answering someone else's offer (any time it's open).
      const of = st.offer;
      if (of && of.from !== id) {
        if (key === 'accept' && canGive(id, of.want)) return void of.replies.set(id, 'yes');
        if (key === 'decline') {
          of.replies.set(id, 'no');
          st.drafts.delete(id);
          return;
        }
        if (key === 'counter') return void st.drafts.set(id, { give: { ...of.want }, want: { ...of.give } });
        if (key === 'tally' && st.drafts.has(id)) return void tallyStep(st.drafts.get(id), value, id);
        if (key === 'sendCounter' && st.drafts.has(id)) {
          const d = st.drafts.get(id);
          if (count(d.give) && count(d.want) && canGive(id, d.give)) {
            of.counters.set(id, { give: { ...d.give }, want: { ...d.want } });
            of.replies.set(id, 'counter');
            st.drafts.delete(id);
            say(`${name(id)} made a counter-offer`);
          }
          return;
        }
        if (key === 'cancelCounter') return void st.drafts.delete(id);
      }

      if (id !== current()) return;
      const p = P.get(id);

      if (st.phase === 'setup') {
        if (key === 'spot') st.mode = { kind: 'place', sel: Number(value) };
        if (key === 'build' && st.mode?.sel != null) setupPlace(id, st.mode.sel);
        return;
      }
      if (st.phase === 'roll') {
        if (key === 'roll') roll(id);
        return;
      }
      if (st.phase === 'ash') {
        if (key === 'spot') st.mode = { kind: 'ash', sel: Number(value) };
        if (key === 'build' && st.mode?.sel != null && spots(id, 'ash').includes(st.mode.sel)) moveAsh(id, st.mode.sel);
        return;
      }
      if (st.phase === 'steal') {
        if (key === 'victim' && victims(id).includes(value)) steal(id, value);
        return;
      }
      if (st.phase !== 'main') return;

      const mode = st.mode;
      if (key === 'cancel') {
        if (mode?.kind === 'offer') st.offer = null;
        if (mode?.kind === 'calm') st.freeTrails = 0;
        st.mode = null;
        return;
      }
      if (key === 'end') return endTurn();

      if (!mode) {
        if (key === 'pick') {
          if (value === 'bottle') {
            if (!canBuild(id, 'bottle')) return;
            pay(id, COST.bottle);
            const kind = deck.pop();
            p.bottles.push({ kind, turn: st.turnNo });
            say(`${name(id)} bought a bottle`);
            fx('buyBottle', { by: id });
            st.mode = { kind: 'gotBottle', bottle: kind };
            checkWin();
            return;
          }
          if (BUILD[value] && canBuild(id, value)) st.mode = { kind: 'build', what: value, sel: null };
          return;
        }
        if (key === 'trade') return void (st.mode = { kind: 'trade', give: empty(), want: empty() });
        if (key === 'bank') return void (st.mode = { kind: 'bank', give: null });
        if (key === 'bottles' && playable(id).length) return void (st.mode = { kind: 'bottles' });
        return;
      }

      switch (mode.kind) {
        case 'gotBottle':
          if (key === 'ok') st.mode = null;
          return;
        case 'build':
        case 'calm': {
          const what = mode.kind === 'calm' ? 'trail' : mode.what;
          if (key === 'spot') {
            const s = Number(value);
            if (spots(id, what).includes(s)) mode.sel = s;
            return;
          }
          if (key !== 'build' || mode.sel == null || !spots(id, what).includes(mode.sel)) return;
          if (mode.kind === 'calm') {
            if (p.trails >= LIMIT.trail) return void (st.mode = null);
            place(id, 'trail', mode.sel);
            mode.sel = null;
            if (--st.freeTrails <= 0 || !spots(id, 'trail').length) st.mode = null;
          } else {
            if (!canBuild(id, what)) return void (st.mode = null);
            pay(id, COST[what]);
            place(id, what, mode.sel);
            st.mode = null;
          }
          checkWin();
          return;
        }
        case 'trade':
          if (key === 'tally') return tallyStep(mode, value, id);
          if (key === 'offer') return openOffer(id, mode.give, mode.want);
          return;
        case 'offer': {
          if (!of) return void (st.mode = null);
          if (key === 'with') {
            const [kind, who] = String(value).split(':');
            if (kind === 'yes' && of.replies.get(who) === 'yes') deal(id, who, of.give, of.want);
            if (kind === 'counter' && of.counters.has(who)) {
              const c = of.counters.get(who);
              deal(id, who, c.want, c.give);
            }
          }
          return;
        }
        case 'bank':
          if (key === 'give' && RES.includes(value) && p.hand[value] >= rate(id, value)) mode.give = value;
          if (key === 'get' && RES.includes(value) && mode.give && value !== mode.give && p.hand[mode.give] >= rate(id, mode.give)) {
            const k = rate(id, mode.give);
            p.hand[mode.give] -= k;
            gain(id, value);
            say(`${name(id)} traded ${k} ${RINFO[mode.give].icon} with the bank for ${RINFO[value].icon}`);
            fx('bank', { by: id });
            if (p.hand[mode.give] < rate(id, mode.give)) mode.give = null;
          }
          return;
        case 'bottles':
          if (key !== 'use' || !playable(id).includes(value)) return;
          if (value === 'spyglass') {
            if (!useBottle(id, 'spyglass')) return;
            st.turnLeft = st.left;
            st.phase = 'ash';
            st.afterAsh = 'main';
            st.left = CHOICE_SECONDS;
            st.mode = null;
            return;
          }
          if (value === 'calm') {
            if (!spots(id, 'trail').length || p.trails >= LIMIT.trail || !useBottle(id, 'calm')) return;
            st.freeTrails = 2;
            st.mode = { kind: 'calm', sel: null };
            return;
          }
          if (value === 'current') {
            if (!useBottle(id, 'current')) return;
            st.mode = { kind: 'current', left: 2 };
            return;
          }
          if (value === 'monkey') {
            if (!useBottle(id, 'monkey')) return;
            st.mode = { kind: 'monkey' };
          }
          return;
        case 'current':
          if (key === 'res' && RES.includes(value)) {
            gain(id, value);
            if (--mode.left <= 0) st.mode = null;
          }
          return;
        case 'monkey':
          if (key === 'res' && RES.includes(value)) {
            let got = 0;
            for (const o of order) {
              if (o === id || P.get(o).hand[value] <= 0) continue;
              P.get(o).hand[value]--;
              gain(id, value);
              got++;
            }
            say(`${name(id)}'s monkeys grabbed ${got} ${RINFO[value].icon}`);
            fx('monkey', { by: id, res: value, got });
            st.mode = null;
          }
          return;
      }
    }

    // value = 'give:wood:+' etc.
    function tallyStep(d, value, id) {
      const [side, res, dir] = String(value).split(':');
      if (!['give', 'want'].includes(side) || !RES.includes(res)) return;
      const h = d[side];
      if (dir === '+') {
        if (side === 'give' && h[res] >= P.get(id).hand[res]) return;
        if (h[res] >= 9) return;
        h[res]++;
        d[side === 'give' ? 'want' : 'give'][res] = 0; // no giving and wanting the same thing
      } else if (dir === '-' && h[res] > 0) h[res]--;
    }

    // ---- Auto moves (timeouts, away players) ---------------------------------------------------
    function autoMove() {
      const id = current();
      if (st.phase === 'setup') {
        const best = st.step === 'hut' ? bestHutSpot(id, spots(id, 'hut')) : bestTrailSpot(id, spots(id, 'trail'));
        if (best != null) setupPlace(id, best);
        return;
      }
      if (st.phase === 'roll') return roll(id);
      if (st.phase === 'ash') return moveAsh(id, bestAshTile(id));
      if (st.phase === 'steal') return steal(id, victims(id)[0]);
      if (st.phase === 'main') return endTurn();
    }

    // ---- Bots ------------------------------------------------------------------------------
    const pips = (num) => (num ? 6 - Math.abs(7 - num) : 0);
    function vertexValue(id, v) {
      const vt = verts[v];
      let s = 0;
      const have = new Set();
      for (const vv of verts) if (vv.owner === id) for (const t of vv.tiles) if (tiles[t].res) have.add(tiles[t].res);
      for (const t of vt.tiles) {
        const tl = tiles[t];
        if (!tl.res) continue;
        s += pips(tl.num) * (t === st.ash ? 0.3 : 1);
        if (!have.has(tl.res)) s += 1.2;
        if (tl.res === 'stone' || tl.res === 'shell') s += 0.4;
      }
      if (vt.harbor) s += vt.harbor === 'any' ? 0.8 : 0.5;
      return s + Math.random() * 0.5;
    }
    function bestHutSpot(id, list) {
      let best = null;
      let bs = -1;
      for (const v of list) {
        const s = vertexValue(id, v);
        if (s > bs) [best, bs] = [v, s];
      }
      return best;
    }
    // A trail heading toward the best place for a future hut (looks two steps ahead).
    function bestTrailSpot(id, list) {
      let best = null;
      let bs = -1e9;
      for (const e of list) {
        let s = Math.random() * 0.3;
        for (const v of edges[e].v) {
          if (verts[v].owner) continue;
          if (hutOk(v, id, true)) s = Math.max(s, vertexValue(id, v));
          for (const e2 of verts[v].edges) {
            if (e2 === e || edges[e2].owner) continue;
            for (const v2 of edges[e2].v) if (v2 !== v && hutOk(v2, id, true)) s = Math.max(s, vertexValue(id, v2) * 0.7);
          }
        }
        if (s > bs) [best, bs] = [e, s];
      }
      return best;
    }
    function bestAshTile(id) {
      let best = null;
      let bs = -1e9;
      const leader = [...order].filter((o) => o !== id).sort((a, b) => publicVp(b) - publicVp(a))[0];
      for (const t of tiles) {
        if (t.id === st.ash) continue;
        let s = pips(t.num);
        for (const v of t.v) {
          const o = verts[v].owner;
          if (!o) continue;
          s += o === id ? -20 : (o === leader ? 3 : 1.5) * (verts[v].kind === 'light' ? 2 : 1);
        }
        s += Math.random();
        if (s > bs) [best, bs] = [t.id, s];
      }
      return best;
    }

    // What the bot is saving for right now.
    function botGoal(id) {
      const p = P.get(id);
      if (p.huts > 0 && p.lights < LIMIT.light) {
        const h = p.hand;
        if (h.stone >= 2 || (h.stone >= 1 && h.shell >= 2)) return 'light';
      }
      if (p.huts + p.lights < LIMIT.hut + LIMIT.light && spots(id, 'hut').length) return 'hut';
      if (p.huts > 0 && p.lights < LIMIT.light) return 'light';
      if (spots(id, 'trail').length && p.trails < LIMIT.trail) return 'trail';
      return 'bottle';
    }
    const need = (id, what) => {
      const h = P.get(id).hand;
      const c = COST[what];
      return Object.fromEntries(RES.map((r) => [r, Math.max(0, (c[r] || 0) - h[r])]));
    };
    function surplus(id, goal) {
      const h = P.get(id).hand;
      const c = COST[goal];
      return Object.fromEntries(RES.map((r) => [r, Math.max(0, h[r] - (c[r] || 0))]));
    }

    const botReplyAt = new Map();
    function botReplies() {
      const of = st.offer;
      if (!of) return;
      for (const [bid, at] of botReplyAt) {
        if (clock < at || of.replies.has(bid)) continue;
        botReplyAt.delete(bid);
        if (!canGive(bid, of.want)) {
          of.replies.set(bid, 'no');
          continue;
        }
        const goal = botGoal(bid);
        const nd = need(bid, goal);
        const sp = surplus(bid, goal);
        const value = (h, sign) => RES.reduce((s, r) => s + (h[r] || 0) * (sign > 0 ? (nd[r] > 0 ? 2 : 1) : sp[r] >= (h[r] || 0) ? 0.7 : 1.6), 0);
        const good = value(of.give, 1) >= value(of.want, -1) && publicVp(of.from) < GOAL - 2;
        of.replies.set(bid, good || Math.random() < 0.08 ? 'yes' : 'no');
      }
    }

    function botThink() {
      const id = current();
      if (!isBot(id) || clock < botWait) return;
      botNext();
      const p = P.get(id);
      const act = (key, value) => onAction(id, { key, value });

      if (st.phase === 'setup') {
        const list = spots(id, st.step);
        const s = st.step === 'hut' ? bestHutSpot(id, list) : bestTrailSpot(id, list);
        if (s == null) return;
        act('spot', String(s));
        return act('build');
      }
      if (st.phase === 'roll') {
        // Sometimes open a Spyglass first if our best tile is under ash: not before rolling, keep simple.
        return act('roll');
      }
      if (st.phase === 'ash') {
        act('spot', String(bestAshTile(id)));
        return act('build');
      }
      if (st.phase === 'steal') {
        const vs = victims(id).sort((a, b) => publicVp(b) - publicVp(a));
        return act('victim', vs[0]);
      }
      if (st.phase !== 'main') return;

      const m = st.mode;
      if (m?.kind === 'gotBottle') return act('ok');
      if (m?.kind === 'offer') {
        const of = st.offer;
        const waited = clock - (st.offerAt ?? clock);
        const yes = [...of.replies].filter(([, r]) => r === 'yes').map(([w]) => w);
        if (yes.length) return act('with', `yes:${yes[0]}`);
        const everyone = order.filter((o) => o !== id).every((o) => of.replies.has(o));
        if (everyone || waited > 12) {
          st.botTraded = true;
          return act('cancel');
        }
        botWait = clock + 1;
        return;
      }
      if (m?.kind === 'current') {
        const nd = need(id, botGoal(id));
        return act('res', RES.find((r) => nd[r] > 0) ?? 'stone');
      }
      if (m?.kind === 'monkey') {
        const nd = need(id, botGoal(id));
        return act('res', RES.find((r) => nd[r] > 0) ?? RES[Math.floor(Math.random() * 5)]);
      }
      if (m?.kind === 'calm') {
        const s = bestTrailSpot(id, spots(id, 'trail'));
        if (s == null) return act('cancel');
        act('spot', String(s));
        return act('build');
      }
      if (m) return act('cancel');

      // 1. Build what we can, best first.
      for (const what of ['light', 'hut']) {
        if (canBuild(id, what)) {
          act('pick', what);
          const list = spots(id, what);
          const s = what === 'light' ? bestHutSpot(id, list) : bestHutSpot(id, list);
          act('spot', String(s));
          return act('build');
        }
      }
      const goal = botGoal(id);
      // 2. Play a bottle.
      const pl = playable(id);
      if (pl.length) {
        const kind = pl.includes('current') ? 'current' : pl.includes('monkey') ? 'monkey' : pl.includes('calm') && spots(id, 'trail').length ? 'calm' : pl.includes('spyglass') && (Math.random() < 0.5 || tiles[st.ash].v.some((v) => verts[v].owner === id)) ? 'spyglass' : null;
        if (kind) {
          act('bottles');
          return act('use', kind);
        }
      }
      // 3. Trails when there's nowhere to put a hut (or wood and coconut to spare).
      if (canBuild(id, 'trail') && (goal === 'trail' || (goal === 'hut' && !spots(id, 'hut').length) || (p.hand.wood >= 2 && p.hand.coco >= 2 && p.trails < 10))) {
        act('pick', 'trail');
        act('spot', String(bestTrailSpot(id, spots(id, 'trail'))));
        return act('build');
      }
      if (goal === 'hut' && !spots(id, 'hut').length && canBuild(id, 'trail')) {
        act('pick', 'trail');
        act('spot', String(bestTrailSpot(id, spots(id, 'trail'))));
        return act('build');
      }
      // 4. Bank trade a big surplus toward the goal.
      const nd = need(id, goal === 'trail' && !canPay(id, COST.trail) ? 'trail' : goal);
      const missing = RES.filter((r) => nd[r] > 0);
      if (missing.length) {
        const sp = surplus(id, goal);
        const give = RES.find((r) => sp[r] >= rate(id, r) && !missing.includes(r));
        if (give) {
          act('bank');
          act('give', give);
          return act('get', missing[0]);
        }
        // 5. Offer the table a simple 1-for-1 (once a turn).
        if (!st.botTraded) {
          st.botTraded = true;
          const spare = RES.filter((r) => sp[r] > 0 && !missing.includes(r)).sort((a, b) => sp[b] - sp[a])[0];
          if (spare && Math.random() < 0.55) {
            act('trade');
            st.mode.give[spare] = 1;
            st.mode.want[missing[0]] = 1;
            st.offerAt = clock;
            return act('offer');
          }
        }
      }
      // 6. A bottle with leftovers.
      if (canBuild(id, 'bottle') && (goal === 'bottle' || count(p.hand) > 6)) return act('pick', 'bottle');
      st.botTraded = false;
      return act('end');
    }

    // ---- Phone screens ------------------------------------------------------------------------
    function mapView(id, pick) {
      // pick = { kind: 'vertex'|'edge'|'tile', list: [ids], sel }
      const m = {
        key: 'spot',
        tiles: tiles.map((t) => ({ x: r2(t.x), y: r2(t.y), color: t.res ? RINFO[t.res].tileColor : '#4a2a26', label: t.res ? RINFO[t.res].icon : '🌋', art: t.res ?? 'volcano', num: t.num || null, hot: t.num === 6 || t.num === 8, dim: t.id === st.ash })),
        roads: edges.filter((e) => e.owner).map((e) => ({ x1: r2(verts[e.v[0]].x), y1: r2(verts[e.v[0]].y), x2: r2(verts[e.v[1]].x), y2: r2(verts[e.v[1]].y), color: color(e.owner) })),
        buildings: verts.filter((v) => v.owner).map((v) => ({ x: r2(v.x), y: r2(v.y), color: color(v.owner), kind: v.kind === 'light' ? 'tower' : 'hut', art: v.kind })),
        harbors: board.harbors.map((h) => ({ x: r2(h.x), y: r2(h.y), label: h.kind === 'any' ? '3:1' : `2:1${RINFO[h.kind].icon}`, art: h.kind })),
        spots: [],
        selected: pick?.sel != null ? String(pick.sel) : null,
      };
      if (pick) {
        for (const s of pick.list) {
          if (pick.kind === 'vertex') m.spots.push({ id: String(s), x: r2(verts[s].x), y: r2(verts[s].y) });
          else if (pick.kind === 'edge') {
            const [a, b] = edges[s].v;
            m.spots.push({ id: String(s), x: r2((verts[a].x + verts[b].x) / 2), y: r2((verts[a].y + verts[b].y) / 2), x1: r2(verts[a].x), y1: r2(verts[a].y), x2: r2(verts[b].x), y2: r2(verts[b].y) });
          } else m.spots.push({ id: String(s), x: r2(tiles[s].x), y: r2(tiles[s].y), tile: true });
        }
      }
      return m;
    }

    // Phones draw resources and pieces from public/art/tidewake.js (`art` fields); the emoji
    // labels are only a fallback until it loads.
    const handRows = (h) => RES.map((r) => ({ id: r, label: RINFO[r].icon, art: r, sub: RINFO[r].name, color: RINFO[r].color, value: h[r] }));
    const words = (h) => RES.filter((r) => h[r] > 0).map((r) => `${h[r]} ${RINFO[r].name}`).join(', ') || 'nothing';
    const icons = (h) => RES.flatMap((r) => Array(Math.min(h[r] || 0, 8)).fill(r));
    const costList = (w) => Object.entries(COST[w]).flatMap(([r, k]) => Array(k).fill(r));
    const short = (id, w) => words(Object.fromEntries(RES.map((r) => [r, Math.max(0, (COST[w][r] || 0) - P.get(id).hand[r])])));
    const timer = () => `${Math.max(0, st.left)}s`;

    function screenFor(id) {
      const p = P.get(id);
      const me = current() === id && st.phase !== 'end';
      const s = { art: 'tidewake', title: '', lines: [], cards: [], actions: [] };
      const mine = { key: 'none', locked: true, groups: [{ id: 'hand', title: `Your hand · ${vp(id)} point${vp(id) === 1 ? '' : 's'}${secretVp(id) ? ` (${secretVp(id)} secret)` : ''}`, rows: handRows(p.hand) }] };
      const who = name(current());

      if (st.phase === 'end') {
        s.title = st.winner === id ? 'You win!' : `${name(st.winner)} wins`;
        s.lines.push(`You finished with ${vp(id)} point${vp(id) === 1 ? '' : 's'}.`);
        s.tally = mine;
        return s;
      }

      if (st.guide.has(id)) {
        s.title = 'How to play';
        s.lines = [
          `First to ${GOAL} points wins. Huts are 1 point, Lighthouses 2.`,
          'Each turn: roll the dice. Every tile showing that number pays its resource to each building on its corners (Lighthouses get 2).',
          'Then trade and build as much as you like, and end your turn.',
          'A 7 erupts the volcano: anyone holding more than 7 cards loses half, and the roller drifts the Ash Cloud onto a tile (it grows nothing) and steals a card from someone there.',
          'Huts can’t sit right next to another Hut, and must touch one of your Trails.',
          `Awards: Explorer (+2) for the longest unbroken Trail (at least ${EXPLORER_MIN}; another player’s building cuts it). Trader (+1) for the most deals with other players (at least ${TRADER_MIN}).`,
          'Harbors on the coast let you trade with the bank at 3:1 or 2:1 instead of 4:1.',
        ];
        for (const w of ['trail', 'hut', 'light', 'bottle']) s.cards.push({ label: BUILD[w].name, art: w, artColor: color(id), icons: costList(w), sub: BUILD_TEXT[w] });
        for (const [k, b] of Object.entries(BOTTLES)) s.cards.push({ label: b.name, art: 'bottle', sub: b.text });
        s.actions = [{ key: 'back', label: 'Back', style: 'primary' }];
        return s;
      }

      // Someone else's offer to the table.
      const of = st.offer;
      if (of && of.from !== id) {
        const draft = st.drafts.get(id);
        if (draft) {
          s.title = `Counter ${name(of.from)}`;
          s.lines.push('What would you give, and what do you want back?');
          s.tally = {
            key: 'tally',
            groups: [
              { id: 'give', title: 'You give', rows: handRows(draft.give).map((r) => ({ ...r, max: p.hand[r.id] })) },
              { id: 'want', title: 'You get', rows: handRows(draft.want) },
            ],
          };
          s.cards.push({ label: 'You have', icons: icons(p.hand) });
          s.actions = [
            { key: 'sendCounter', label: 'Send counter-offer', style: 'primary', disabled: !count(draft.give) || !count(draft.want) || !canGive(id, draft.give) },
            { key: 'cancelCounter', label: 'Back', style: 'secondary' },
          ];
          s.footer = timer();
          return s;
        }
        const reply = of.replies.get(id);
        s.title = `${name(of.from)} wants to trade`;
        s.cards.push({ label: 'You get', icons: icons(of.give), sub: words(of.give), color: '#3ddc84' }, { label: 'You give', icons: icons(of.want), sub: words(of.want), color: '#ff8c42' });
        if (reply === 'yes') s.lines.push(`You said yes. ${name(of.from)} picks who to trade with.`);
        else if (reply === 'no') s.lines.push('You passed.');
        else if (reply === 'counter') s.lines.push(`Counter-offer sent: you give ${words(of.counters.get(id).give)} for ${words(of.counters.get(id).want)}.`);
        const can = canGive(id, of.want);
        if (reply !== 'yes') s.actions.push({ key: 'accept', label: can ? 'Accept' : "Accept (you don't have it)", style: 'primary', disabled: !can });
        if (reply !== 'no') s.actions.push({ key: 'decline', label: 'No thanks', style: 'secondary' });
        s.actions.push({ key: 'counter', label: 'Counter-offer', style: 'secondary' });
        s.tally = mine;
        return s;
      }

      if (!me) {
        s.title = 'Tidewake';
        s.lines.push(statusLine(who));
        const g = st.gains.get(id);
        if (g) s.cards.push({ label: 'The roll paid you', icons: icons(g), color: '#3ddc84' });
        if (st.stolen && st.stolen.from === id && st.event?.kind === 'steal') s.cards.push({ label: `${name(st.stolen.by)} stole your ${RINFO[st.stolen.res].name}!`, art: st.stolen.res, color: '#ff8c8c' });
        s.tally = mine;
        bottleCards(id, s);
        s.actions.push({ key: 'guide', label: 'How to play', style: 'secondary' });
        return s;
      }

      // ---- My turn ----
      s.footer = timer();
      if (st.phase === 'setup') {
        const what = st.step;
        const list = spots(id, what);
        s.title = what === 'hut' ? `Place your ${st.setupIdx >= n ? 'second' : 'first'} Hut` : 'Place a Trail';
        s.lines.push(what === 'hut' ? (st.setupIdx >= n ? 'This one pays you a resource from each tile around it. Tap a glowing corner.' : 'Pick a corner touching good numbers (6 and 8 roll most). Tap a glowing corner.') : 'Lay a Trail from the Hut you just placed.');
        s.hexmap = mapView(id, { kind: what === 'hut' ? 'vertex' : 'edge', list, sel: st.mode?.sel });
        s.actions.push({ key: 'build', label: what === 'hut' ? 'Build Hut here' : 'Lay Trail here', style: 'primary', disabled: st.mode?.sel == null });
        return s;
      }
      if (st.phase === 'roll') {
        s.title = 'Your turn';
        s.tally = mine;
        bottleCards(id, s);
        s.actions.push({ key: 'roll', label: 'Roll the dice', style: 'primary' });
        s.actions.push({ key: 'guide', label: 'How to play', style: 'secondary' });
        return s;
      }
      if (st.phase === 'ash') {
        s.title = 'Drift the Ash Cloud';
        s.lines.push('Pick a tile to cover. It grows nothing until the cloud moves, and you steal a card from someone with a building there.');
        s.hexmap = mapView(id, { kind: 'tile', list: spots(id, 'ash'), sel: st.mode?.kind === 'ash' ? st.mode.sel : null });
        s.actions.push({ key: 'build', label: 'Cover this tile', style: 'primary', disabled: st.mode?.kind !== 'ash' || st.mode.sel == null });
        return s;
      }
      if (st.phase === 'steal') {
        s.title = 'Steal from who?';
        s.choose = { key: 'victim', options: victims(id).map((o) => ({ id: o, label: name(o), sub: `${count(P.get(o).hand)} cards`, color: color(o) })) };
        return s;
      }

      // Main phase.
      const m = st.mode;
      const rolled = st.dice ? `· rolled ${st.dice[0] + st.dice[1]}` : '';
      if (!m) {
        s.title = `Your turn ${rolled}`;
        const g = st.gains.get(id);
        if (g) s.cards.push({ label: 'The roll paid you', icons: icons(g), color: '#3ddc84' });
        s.tally = mine;
        s.choose = {
          key: 'pick',
          options: ['trail', 'hut', 'light', 'bottle'].map((w) => ({
            id: w,
            label: w === 'bottle' ? 'Buy a Bottle' : `Build a ${BUILD[w].name}`,
            art: w,
            artColor: color(id),
            costs: costList(w),
            sub: canBuild(id, w) ? 'Ready' : whyNot(id, w),
            disabled: !canBuild(id, w),
          })),
        };
        bottleCards(id, s);
        s.actions.push({ key: 'trade', label: 'Trade with players', style: 'secondary', disabled: count(p.hand) === 0 });
        s.actions.push({ key: 'bank', label: 'Trade with the bank', style: 'secondary', disabled: !RES.some((r) => p.hand[r] >= rate(id, r)) });
        if (playable(id).length) s.actions.push({ key: 'bottles', label: 'Open a Bottle', style: 'secondary' });
        s.actions.push({ key: 'end', label: 'End turn', style: 'primary' });
        s.actions.push({ key: 'guide', label: 'How to play', style: 'secondary' });
        return s;
      }
      if (m.kind === 'gotBottle') {
        const b = BOTTLES[m.bottle];
        s.title = b.name;
        s.cards.push({ label: 'Message in a Bottle', art: 'bottle', color: '#8fd3ff' });
        s.lines.push(b.text, m.bottle === 'treasure' ? 'It counts for you right away, and nobody else knows.' : 'You can open it on a later turn.');
        s.actions.push({ key: 'ok', label: 'Got it', style: 'primary' });
        return s;
      }
      if (m.kind === 'build' || m.kind === 'calm') {
        const what = m.kind === 'calm' ? 'trail' : m.what;
        s.title = m.kind === 'calm' ? `Free Trail (${st.freeTrails} left)` : `Build a ${BUILD[what].name}`;
        s.lines.push(what === 'trail' ? 'Tap a glowing edge, then confirm.' : what === 'light' ? 'Tap one of your Huts to upgrade.' : 'Tap a glowing corner, then confirm.');
        s.hexmap = mapView(id, { kind: what === 'trail' ? 'edge' : 'vertex', list: spots(id, what), sel: m.sel });
        s.actions.push({ key: 'build', label: 'Build here', style: 'primary', disabled: m.sel == null });
        s.actions.push({ key: 'cancel', label: m.kind === 'calm' ? 'Skip the rest' : 'Cancel', style: 'secondary' });
        return s;
      }
      if (m.kind === 'trade') {
        s.title = 'Make an offer';
        s.lines.push('Set what you give and what you want. Everyone else can accept, pass or counter.');
        s.tally = {
          key: 'tally',
          groups: [
            { id: 'give', title: 'You give', rows: handRows(m.give).map((r) => ({ ...r, max: p.hand[r.id] })) },
            { id: 'want', title: 'You want', rows: handRows(m.want) },
          ],
        };
        s.cards.push({ label: 'You have', icons: icons(p.hand) });
        s.actions.push({ key: 'offer', label: 'Offer to everyone', style: 'primary', disabled: !count(m.give) || !count(m.want) });
        s.actions.push({ key: 'cancel', label: 'Cancel', style: 'secondary' });
        return s;
      }
      if (m.kind === 'offer' && of) {
        s.title = 'Your offer';
        s.cards.push({ label: 'You give', icons: icons(of.give), sub: words(of.give), color: '#ff8c42' }, { label: 'You get', icons: icons(of.want), sub: words(of.want), color: '#3ddc84' });
        const opts = [];
        for (const o of order) {
          if (o === id) continue;
          const r = of.replies.get(o);
          if (r === 'yes') opts.push({ id: `yes:${o}`, label: `Trade with ${name(o)}`, sub: 'Accepted your offer', color: color(o), disabled: !canGive(id, of.give) });
          if (r === 'counter') {
            const c = of.counters.get(o);
            opts.push({ id: `counter:${o}`, label: `${name(o)}'s counter`, sub: `You give ${words(c.want)}, you get ${words(c.give)}`, color: color(o), disabled: !canGive(id, c.want) || !canGive(o, c.give) });
          }
        }
        if (opts.length) s.choose = { key: 'with', options: opts };
        const waiting = order.filter((o) => o !== id && !of.replies.has(o)).map(name);
        const passed = order.filter((o) => of.replies.get(o) === 'no').map(name);
        if (waiting.length) s.lines.push(`Waiting for ${waiting.join(', ')}…`);
        if (passed.length) s.lines.push(`Passed: ${passed.join(', ')}`);
        if (!opts.length && !waiting.length) s.lines.push('Nobody took it. Try a different offer?');
        s.actions.push({ key: 'cancel', label: 'Withdraw offer', style: 'secondary' });
        return s;
      }
      if (m.kind === 'bank') {
        s.title = 'Trade with the bank';
        s.tally = mine;
        if (!m.give) {
          s.lines.push('What will you hand over?');
          s.choose = { key: 'give', options: RES.map((r) => ({ id: r, label: `Give ${rate(id, r)} ${RINFO[r].name}`, art: r, sub: `you have ${p.hand[r]}`, color: RINFO[r].color, disabled: p.hand[r] < rate(id, r) })) };
        } else {
          s.lines.push(`Give ${rate(id, m.give)} ${RINFO[m.give].name}. What do you want for it?`);
          s.choose = { key: 'get', options: RES.filter((r) => r !== m.give).map((r) => ({ id: r, label: `Get 1 ${RINFO[r].name}`, art: r, color: RINFO[r].color })) };
        }
        s.actions.push({ key: 'cancel', label: 'Done', style: 'secondary' });
        return s;
      }
      if (m.kind === 'bottles') {
        s.title = 'Open a Bottle';
        s.lines.push('One bottle a turn, and not one you bought this turn.');
        s.choose = {
          key: 'use',
          options: playable(id).map((k) => ({ id: k, label: BOTTLES[k].name, art: 'bottle', sub: BOTTLES[k].text, disabled: k === 'calm' && !spots(id, 'trail').length })),
        };
        s.actions.push({ key: 'cancel', label: 'Cancel', style: 'secondary' });
        return s;
      }
      if (m.kind === 'current' || m.kind === 'monkey') {
        s.title = m.kind === 'current' ? `Take ${m.left} from the bank` : 'Which resource?';
        s.lines.push(m.kind === 'current' ? 'Pick a resource. You can pick the same one twice.' : 'Every other player hands you 1 of it, if they have any.');
        s.choose = { key: 'res', options: RES.map((r) => ({ id: r, label: RINFO[r].name, art: r, color: RINFO[r].color })) };
        s.tally = mine;
        return s;
      }
      st.mode = null;
      s.title = 'Your turn';
      return s;
    }

    function bottleCards(id, s) {
      const p = P.get(id);
      if (!p.bottles.length) return;
      const counts = {};
      for (const b of p.bottles) counts[b.kind] = (counts[b.kind] || 0) + 1;
      for (const [k, c] of Object.entries(counts)) s.cards.push({ label: `${BOTTLES[k].name}${c > 1 ? ` ×${c}` : ''}`, art: 'bottle', sub: BOTTLES[k].text, color: '#8fd3ff' });
    }

    function whyNot(id, w) {
      const p = P.get(id);
      if (w === 'bottle' && !deck.length) return 'None left';
      if (!canPay(id, COST[w])) return `Need ${short(id, w)}`;
      if (w === 'hut' && p.huts >= LIMIT.hut) return 'All built';
      if (w === 'light' && p.lights >= LIMIT.light) return 'All built';
      if (w === 'light') return 'No Hut to upgrade';
      if (w === 'hut') return 'No open spot on your Trails';
      if (w === 'trail' && p.trails >= LIMIT.trail) return 'All built';
      return 'Nowhere to build';
    }

    function statusLine(who) {
      if (st.phase === 'setup') return `${who} is placing a ${st.step === 'hut' ? 'Hut' : 'Trail'}.`;
      if (st.phase === 'roll') return `${who} is about to roll.`;
      if (st.phase === 'ash' || st.phase === 'steal') return `${who} is drifting the Ash Cloud.`;
      return `${who}'s turn.`;
    }

    // ---- Contract ----------------------------------------------------------------------
    let acc = 0;
    return {
      update(dt) {
        clock += dt;
        if (st.phase !== 'end') {
          botReplies();
          botThink();
        }
        acc += dt;
        while (acc >= 1) {
          acc -= 1;
          st.left--;
        }
        if (st.phase === 'end') {
          if (st.left <= 0) st.over = true;
          return;
        }
        if (!players.get(current())?.connected) st.left = Math.min(st.left, AWAY_SECONDS);
        if (st.left <= 0) autoMove();
      },

      onAction,

      snapshot() {
        const of = st.offer;
        const sel = st.mode?.sel;
        let highlight = null;
        if (sel != null && st.phase !== 'end') {
          const kind = st.phase === 'ash' ? 'tile' : st.mode.kind === 'calm' || (st.phase === 'setup' ? st.step === 'trail' : st.mode.what === 'trail') ? 'edge' : 'vertex';
          const what = kind === 'tile' ? 'ash' : kind === 'edge' ? 'trail' : st.phase === 'setup' ? 'hut' : st.mode.what;
          highlight = { kind, id: sel, what };
        }
        return {
          phase: st.phase,
          step: st.step,
          turn: st.phase === 'end' ? null : current(),
          left: st.left,
          limit: st.phase === 'setup' ? SETUP_SECONDS : st.phase === 'roll' ? ROLL_SECONDS : st.phase === 'main' ? TURN_SECONDS : st.phase === 'end' ? END_SECONDS : CHOICE_SECONDS,
          goal: GOAL,
          // Full rounds played since setup; the TV turns day into dusk and night with it.
          round: Math.max(0, Math.floor((st.turnNo - 1) / order.length)),
          dice: st.dice,
          rollSeq: st.rollSeq,
          tiles: tiles.map((t) => ({ x: t.x, y: t.y, res: t.res, num: t.num })),
          verts: verts.map((v) => [r2(v.x), r2(v.y)]),
          edges: edges.map((e) => e.v),
          harbors: board.harbors,
          buildings: verts.filter((v) => v.owner).map((v) => ({ v: v.id, owner: v.owner, kind: v.kind })),
          trails: edges.filter((e) => e.owner).map((e) => ({ e: e.id, owner: e.owner })),
          ash: st.ash,
          highlight,
          mode: st.mode?.kind ?? null,
          offer: of ? { from: of.from, give: of.give, want: of.want, replies: Object.fromEntries(of.replies) } : null,
          gains: st.fromRoll,
          explorer: st.explorer,
          trader: st.trader,
          log: st.log,
          event: st.event,
          winner: st.winner,
          deck: deck.length,
          players: order.map((id) => {
            const p = P.get(id);
            return {
              id, name: name(id), color: color(id), connected: players.get(id)?.connected ?? false,
              vp: st.phase === 'end' ? vp(id) : publicVp(id), cards: count(p.hand), bottles: p.bottles.length,
              huts: p.huts, lights: p.lights, trails: p.trails, deals: p.deals, longest: longestTrail(board, id),
            };
          }),
        };
      },

      playerView(id) {
        if (!P.has(id)) return { status: 'Watching', screen: { title: 'Tidewake', lines: ['This game started without you. Watch the TV!'] } };
        return { status: '', screen: screenFor(id) };
      },

      isOver: () => st.over,

      results() {
        const ranked = [...order].sort((a, b) => vp(b) - vp(a) || (b === st.winner) - (a === st.winner));
        return {
          title: st.winner ? `${name(st.winner)} rules the island!` : 'Game ended',
          standings: ranked.map((id) => ({ id, name: name(id), color: color(id), score: `${vp(id)} pts` })),
        };
      },

      // For tests only.
      _debug: { st, P, board, order, spots, onAction, vp },
    };
  },
};

const BUILD_TEXT = {
  trail: 'An edge joined to your Trails or buildings. Huts must touch one.',
  hut: '1 point. On a corner touching your Trail, never right next to another Hut.',
  light: '2 points. Upgrades one of your Huts; it harvests 2 instead of 1.',
  bottle: 'A random Message in a Bottle card. Open it on a later turn.',
};

// ---- Longest trail -------------------------------------------------------------------
// The most of a player's Trails you can walk in one go without using a Trail twice. Corners can be
// revisited (loops count), but you can't walk through a corner holding someone else's building.
export function longestTrail({ verts, edges }, id) {
  const mine = edges.filter((e) => e.owner === id);
  const blocked = (v) => verts[v].owner && verts[v].owner !== id;
  const used = new Set();
  let best = 0;
  const walk = (v, len) => {
    best = Math.max(best, len);
    if (len > 0 && blocked(v)) return;
    for (const e of verts[v].edges) {
      if (edges[e].owner !== id || used.has(e)) continue;
      used.add(e);
      walk(edges[e].v[0] === v ? edges[e].v[1] : edges[e].v[0], len + 1);
      used.delete(e);
    }
  };
  for (const e of mine) for (const v of e.v) walk(v, 0);
  return best;
}

// Who holds Explorer, given each player's longest trail. The holder keeps it on a tie; if their
// trail is cut and someone else is now strictly longest, it moves; if nobody leads alone, nobody
// holds it.
export function nextExplorer(holder, lengths) {
  const best = Math.max(0, ...lengths.values());
  if (holder && lengths.get(holder) >= EXPLORER_MIN && lengths.get(holder) === best) return holder;
  const leaders = [...lengths.keys()].filter((id) => lengths.get(id) === best);
  return best >= EXPLORER_MIN && leaders.length === 1 ? leaders[0] : null;
}

// ---- Island generation ------------------------------------------------------------------
// Pointy-top hexes of radius 1 laid out in centred rows. Vertices and edges are found by
// position and shared between neighbouring tiles.
export function makeBoard(big) {
  const rows = big ? [3, 4, 5, 6, 5, 4, 3] : [3, 4, 5, 4, 3];
  const tiles = [];
  rows.forEach((len, i) => {
    for (let j = 0; j < len; j++) tiles.push({ id: tiles.length, x: (j - (len - 1) / 2) * S3, y: (i - (rows.length - 1) / 2) * 1.5, v: [], res: null, num: 0 });
  });
  const verts = [];
  const vmap = new Map();
  const edges = [];
  const emap = new Map();
  for (const t of tiles) {
    for (let k = 0; k < 6; k++) {
      const a = (-90 + 60 * k) * (Math.PI / 180);
      const x = t.x + Math.cos(a);
      const y = t.y + Math.sin(a);
      const key = `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
      let v = vmap.get(key);
      if (v == null) {
        v = verts.length;
        vmap.set(key, v);
        verts.push({ id: v, x, y, tiles: [], adj: [], edges: [], owner: null, kind: null, harbor: null });
      }
      verts[v].tiles.push(t.id);
      t.v.push(v);
    }
    for (let k = 0; k < 6; k++) {
      const a = t.v[k];
      const b = t.v[(k + 1) % 6];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      let e = emap.get(key);
      if (e == null) {
        e = edges.length;
        emap.set(key, e);
        edges.push({ id: e, v: [a, b], tiles: [], owner: null });
        verts[a].adj.push(b);
        verts[b].adj.push(a);
        verts[a].edges.push(e);
        verts[b].edges.push(e);
      }
      edges[e].tiles.push(t.id);
    }
  }

  // The volcano lands anywhere (two on the big island, never side by side); everything else grows
  // something.
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < S3 + 0.01;
  const [first, ...rest] = shuffle(tiles);
  const volcanoes = big ? [first.id, rest.find((t) => !near(t, first)).id] : [first.id];
  const land = tiles.filter((t) => !volcanoes.includes(t.id));
  const resCounts = big ? { wood: 6, coco: 6, fish: 6, shell: 5, stone: 5 } : { wood: 4, coco: 4, fish: 4, shell: 3, stone: 3 };
  const nums = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12, ...(big ? [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] : [])];
  for (let tries = 0; tries < 400; tries++) {
    const res = shuffle(Object.entries(resCounts).flatMap(([r, k]) => Array(k).fill(r)));
    const ns = shuffle(nums);
    land.forEach((t, i) => {
      t.res = res[i];
      t.num = ns[i];
    });
    // No two red numbers (6, 8) side by side, and no three of a resource in a clump.
    const hot = land.filter((t) => t.num === 6 || t.num === 8);
    const hotOk = hot.every((a) => hot.every((b) => a === b || !near(a, b)));
    const clumpOk = land.every((t) => land.filter((o) => o !== t && o.res === t.res && near(o, t)).length < 2);
    if (hotOk && (clumpOk || tries > 300)) break;
  }

  // Harbors on evenly spread coastal edges.
  const coast = edges.filter((e) => e.tiles.length === 1);
  const angle = (e) => {
    const a = verts[e.v[0]];
    const b = verts[e.v[1]];
    return Math.atan2((a.y + b.y) / 2, (a.x + b.x) / 2);
  };
  coast.sort((a, b) => angle(a) - angle(b));
  const nh = big ? 11 : 9;
  const kinds = shuffle([...RES, ...Array(nh - RES.length).fill('any')]);
  const step = coast.length / nh;
  const off = Math.random() * step;
  const harbors = [];
  for (let i = 0; i < nh; i++) {
    const e = coast[Math.floor(off + i * step) % coast.length];
    const t = tiles[e.tiles[0]];
    const a = verts[e.v[0]];
    const b = verts[e.v[1]];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = mx - t.x;
    const dy = my - t.y;
    const d = Math.hypot(dx, dy);
    for (const v of e.v) verts[v].harbor = kinds[i];
    harbors.push({ kind: kinds[i], e: e.id, x: r2(mx + (dx / d) * 0.55), y: r2(my + (dy / d) * 0.55) });
  }
  return { tiles, verts, edges, harbors, volcanoes };
}

function r2(v) {
  return Math.round(v * 100) / 100;
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
