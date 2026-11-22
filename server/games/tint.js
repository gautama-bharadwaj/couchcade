// Tint & Tell: a color-clue party game for 2–8. The TV shows a big color wheel: 24 hue spokes
// by 6 rings, palest in the middle and darkest at the rim (144 swatches).
//
// Each turn one player is the Teller. Their phone offers three secret swatches; they pick one and
// give a ONE-word clue. Everyone else taps the swatch they think it is and locks in. Then the Teller
// gives a TWO-word clue, and everyone may move their pin or keep it. Then the swatch is revealed.
// Basic color names (red, blue, pink, grey…) aren't allowed as clues.
//
// Scoring counts "steps" between a pin and the secret swatch: one step = one swatch around the
// wheel or one ring in or out.
//   0 steps (Bullseye) 4 · 1 step 3 · 2 steps 2 · 3 steps 1
//   Called it: +1 for keeping your first pin through the two-word clue and landing within 1 step.
//   The Teller scores as much as the best guess that turn (without bonuses).
// Everyone is Teller once (twice with 2–3 players). Most points wins.
// Bots (lobby "Add bot") give clues from a small word list and guess by looking words up in it.

export const HUES = 24;
export const RINGS = 6;
// Hue angles (HSL) for the 24 spokes: closer together through reds, oranges and yellows, where
// eyes see more difference, and further apart through the greens.
const HUE_DEG = [0, 12, 24, 34, 44, 52, 60, 75, 95, 120, 145, 165, 180, 192, 204, 216, 230, 250, 268, 282, 295, 310, 325, 340];
const RING_L = [87, 76, 64, 51, 39, 27]; // lightness, inner ring first
const RING_S = [80, 86, 90, 86, 80, 72];

export const CELL_COLORS = [];
for (let r = 0; r < RINGS; r++) for (let h = 0; h < HUES; h++) CELL_COLORS.push(hslHex(HUE_DEG[h], RING_S[r], RING_L[r]));
const cellOf = (h, r) => r * HUES + ((h % HUES) + HUES) % HUES;
const hueOf = (c) => c % HUES;
const ringOf = (c) => Math.floor(c / HUES);

/** Steps between two swatches: around the wheel (the short way) plus rings in or out. */
export function steps(a, b) {
  const dh = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(dh, HUES - dh) + Math.abs(ringOf(a) - ringOf(b));
}
const POINTS = [4, 3, 2, 1];
const pointsFor = (d) => POINTS[d] ?? 0;
const CALLED_IT = 1;

const T = { pick: 20, clue: 50, guess1: 35, guess2: 30, reveal: 10 };
const AWAY_S = 4; // a Teller whose phone dropped gets an automatic clue after this long

// Basic color words (and -ish / -y forms) can't be clues.
const BANNED = new Set(
  ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'violet', 'pink', 'brown', 'black', 'white', 'grey', 'gray', 'indigo', 'tan', 'beige', 'cyan', 'magenta', 'maroon', 'turquoise', 'lavender', 'teal']
    .flatMap((w) => [w, `${w}s`, `${w}ish`, `${w}y`, `${w}ey`, `${w.replace(/e$/, '')}ish`, `${w.replace(/e$/, '')}y`, `${w}dish`])
    .concat(['bluish', 'reddish', 'purplish', 'pinky']),
);

// ---- Bot vocabulary: word -> [hue degrees, ring] -------------------------------------
const NOUNS = {
  blush: [0, 0], rose: [345, 1], salmon: [10, 1], strawberry: [350, 2], cherry: [355, 3], blood: [0, 4], wine: [340, 5], ruby: [345, 4],
  fire: [8, 3], brick: [12, 4], peach: [24, 0], coral: [14, 1], sunset: [20, 2], rust: [20, 4], chocolate: [22, 5], tomato: [6, 2],
  apricot: [30, 1], carrot: [26, 2], pumpkin: [28, 3], cinnamon: [28, 4], coffee: [32, 5], mango: [36, 2], caramel: [36, 4],
  cream: [46, 0], sand: [42, 1], honey: [42, 2], amber: [40, 3], toffee: [44, 4], butter: [52, 0], banana: [54, 1], lemon: [56, 2],
  mustard: [50, 3], gold: [46, 3], sunflower: [52, 2], olive: [60, 4], swamp: [70, 5], pear: [72, 2], lime: [85, 2], pistachio: [90, 1],
  avocado: [80, 4], slime: [95, 2], frog: [100, 3], moss: [90, 4], leaf: [110, 3], grass: [115, 2], shamrock: [125, 3], jungle: [130, 4],
  forest: [125, 5], pine: [140, 5], mint: [150, 0], emerald: [145, 3], jade: [155, 4], seafoam: [165, 1], spruce: [165, 5],
  aqua: [180, 1], lagoon: [182, 3], ice: [192, 0], pool: [190, 2], sea: [195, 3], glacier: [200, 1], sky: [204, 1], ocean: [205, 3],
  denim: [212, 4], steel: [210, 4], cornflower: [220, 2], sapphire: [222, 4], storm: [218, 5], navy: [228, 5], cobalt: [226, 3],
  periwinkle: [235, 1], royal: [232, 3], ink: [235, 5], dusk: [255, 4], midnight: [245, 5], lilac: [270, 0], wisteria: [265, 1],
  amethyst: [272, 3], grape: [278, 4], plum: [290, 5], eggplant: [285, 5], orchid: [298, 2], thistle: [300, 0], fuchsia: [310, 3],
  bubblegum: [325, 0], flamingo: [328, 1], candy: [325, 2], raspberry: [335, 3], berry: [330, 4], beet: [335, 5],
};
const MODS = { pale: 0, soft: 1, light: 1, bright: 2, sunny: 2, rich: 3, bold: 3, deep: 4, dark: 5, shadowy: 5 };
const RING_MOD = ['pale', 'light', 'bright', 'rich', 'deep', 'dark'];
const nearestHue = (deg) => {
  let best = 0;
  for (let h = 1; h < HUES; h++) if (angleDiff(HUE_DEG[h], deg) < angleDiff(HUE_DEG[best], deg)) best = h;
  return best;
};
const angleDiff = (a, b) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
const NOUN_CELL = new Map(Object.entries(NOUNS).map(([w, [deg, r]]) => [w, cellOf(nearestHue(deg), r)]));

export default {
  id: 'tint',
  title: 'Tint & Tell',
  category: 'party',
  icon: '🎨',
  description: 'Clue a secret color in one word, then two. Pin it on the wheel.',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { type: 'screens' },

  create({ players }) {
    const roster = shuffle([...players.values()].filter((p) => p.connected).map((p) => p.id));
    const rounds = roster.length <= 3 ? 2 : 1;
    const tellers = Array.from({ length: rounds }, () => roster).flat();
    const score = new Map(roster.map((id) => [id, 0]));
    const name = (id) => players.get(id)?.name ?? '?';
    const isBot = (id) => !!players.get(id)?.bot;
    const connected = (id) => !!players.get(id)?.connected;

    let clock = 0;
    let acc = 0;
    const st = {
      turn: -1,
      phase: 'pick', // pick → clue1 → guess1 → clue2 → guess2 → reveal
      left: 0,
      phaseAt: 0,
      teller: null,
      offers: [], // three swatches the Teller can pick from
      target: null,
      clues: [], // [one word, two words]
      error: null, // last rejected clue, shown to the Teller
      sel: new Map(), // guesser -> swatch currently selected
      first: new Map(), // guesser -> pin after the one-word clue
      locked: new Set(), // guessers locked in this guess phase
      reveal: null, // { rows: [{ id, cell, steps, pts, bonus }], tellerPts }
      over: false,
      seq: 0,
    };
    const guessers = () => roster.filter((id) => id !== st.teller);

    function setPhase(phase) {
      st.phase = phase;
      st.left = T[phase.replace(/\d$/, '')] ?? T[phase];
      st.phaseAt = clock;
      st.seq++;
      scheduleBots();
    }

    function nextTurn() {
      st.turn++;
      if (st.turn >= tellers.length) {
        st.over = true;
        return;
      }
      st.teller = tellers[st.turn];
      st.offers = pickOffers();
      st.target = null;
      st.clues = [];
      st.error = null;
      st.sel = new Map();
      st.first = new Map();
      st.locked = new Set();
      st.reveal = null;
      setPhase('pick');
    }

    // Three swatches that are far apart from each other, so the choice matters.
    function pickOffers() {
      const out = [];
      for (let tries = 0; out.length < 3 && tries < 500; tries++) {
        const c = Math.floor(Math.random() * CELL_COLORS.length);
        if (out.every((o) => steps(o, c) >= 6)) out.push(c);
      }
      return out;
    }

    function choose(cell) {
      st.target = cell;
      setPhase('clue1');
    }

    /** Returns an error string, or null if the clue was taken. */
    function giveClue(text) {
      const words = String(text).trim().toLowerCase().replace(/[^a-z' -]/g, '').split(/\s+/).filter(Boolean);
      const want = st.phase === 'clue1' ? 1 : 2;
      if (!words.length) return 'Type a clue.';
      if (words.length > want) return want === 1 ? 'One word only for the first clue.' : 'Two words at most.';
      const bad = words.flatMap((w) => w.split(/[-']/)).find((w) => BANNED.has(w));
      if (bad) return `"${bad}" is a color name. Try something it reminds you of.`;
      const clue = words.join(' ');
      st.clues.push(clue);
      st.error = null;
      if (st.phase === 'clue1') setPhase('guess1');
      else {
        st.locked = new Set();
        setPhase('guess2');
      }
      return null;
    }

    function endGuess() {
      // Whatever is selected when time runs out counts.
      if (st.phase === 'guess1') {
        for (const [id, c] of st.sel) st.first.set(id, c);
        setPhase('clue2');
      } else {
        score1();
        setPhase('reveal');
      }
    }

    function score1() {
      const rows = guessers().map((id) => {
        const cell = st.sel.get(id);
        if (cell == null) return { id, cell: null, steps: null, pts: 0, bonus: 0 };
        const d = steps(cell, st.target);
        const pts = pointsFor(d);
        const bonus = st.first.get(id) === cell && d <= 1 ? CALLED_IT : 0;
        return { id, cell, steps: d, pts, bonus };
      });
      const tellerPts = Math.max(0, ...rows.map((r) => r.pts));
      for (const r of rows) score.set(r.id, score.get(r.id) + r.pts + r.bonus);
      score.set(st.teller, score.get(st.teller) + tellerPts);
      st.reveal = { rows, tellerPts };
    }

    function autoClue() {
      // Used for bots, and for a Teller whose phone dropped off or who ran out of time.
      const err = giveClue(botClue(st.target, st.phase === 'clue1' ? 1 : 2));
      if (err) giveClue(st.phase === 'clue1' ? 'mystery' : 'mystery swatch');
    }

    // ---- Bots ---------------------------------------------------------------------
    const botAt = new Map();
    function scheduleBots() {
      const [lo, hi] = { pick: [1.5, 3], clue1: [2.5, 5], clue2: [2.5, 5], guess1: [2, 7], guess2: [2, 6], reveal: [99, 99] }[st.phase];
      for (const id of roster) if (isBot(id)) botAt.set(id, clock + lo + Math.random() * (hi - lo));
    }

    function botThink() {
      for (const id of roster) {
        if (!isBot(id) || clock < botAt.get(id)) continue;
        botAt.set(id, Infinity);
        const teller = id === st.teller;
        if (teller && st.phase === 'pick') {
          // The swatch closest to a word it knows.
          const best = st.offers.map((c) => [c, Math.min(...[...NOUN_CELL.values()].map((n) => steps(n, c)))]).sort((a, b) => a[1] - b[1])[0][0];
          api.onAction(id, { key: 'pick', value: String(best) });
        } else if (teller && (st.phase === 'clue1' || st.phase === 'clue2')) {
          autoClue();
        } else if (!teller && (st.phase === 'guess1' || st.phase === 'guess2')) {
          const guess = botGuess(st.clues.at(-1), st.phase === 'guess2' ? st.first.get(id) : null);
          if (guess != null) api.onAction(id, { key: 'cell', value: String(guess) });
          api.onAction(id, { key: 'lock' });
        }
      }
    }

    // ---- Phone screens ------------------------------------------------------------
    const wheel = (extra) => ({ key: 'cell', hues: HUES, rings: RINGS, colors: CELL_COLORS, ...extra });
    const clueCards = () => st.clues.map((c, i) => ({ label: `“${cap(c)}”`, sub: i === 0 ? 'One-word clue' : 'Two-word clue', color: players.get(st.teller)?.color }));
    const pinsOf = (ids) => ids.filter((g) => st.sel.has(g)).map((g) => ({ cell: st.sel.get(g), color: players.get(g)?.color ?? '#888' }));

    function screenFor(id) {
      if (!score.has(id)) return { title: 'Game in progress', lines: ['You can join the next game. Watch the TV!'] };
      const teller = id === st.teller;
      const tellerName = name(st.teller);
      const head = `Turn ${st.turn + 1} of ${tellers.length}`;
      const timer = `${head} · ${st.left}s`;

      if (st.phase === 'reveal') {
        const r = st.reveal.rows.find((x) => x.id === id);
        const lines = teller
          ? [`Your best guesser scored ${st.reveal.tellerPts}, so you get ${st.reveal.tellerPts}.`]
          : r?.cell == null
            ? ['No pin this time, so no points.']
            : [`${r.steps === 0 ? 'Bullseye!' : `${r.steps} step${r.steps === 1 ? '' : 's'} away.`} +${r.pts}${r.bonus ? ` and +${r.bonus} for calling it` : ''}.`];
        return { title: teller ? 'Reveal' : r?.steps === 0 ? 'Bullseye!' : 'Reveal', wheel: wheel({ target: st.target, pins: pinsOf(guessers()), locked: true }), lines, cards: [{ label: `You have ${score.get(id)} points`, color: players.get(id)?.color }], footer: head };
      }

      if (teller) {
        const tag = { label: 'You are the Teller', color: players.get(id)?.color };
        if (st.phase === 'pick') {
          return {
            title: 'Pick a secret color',
            tag,
            lines: ['Only you can see these. Choose the one you can describe best.'],
            choose: { key: 'pick', options: st.offers.map((c, i) => ({ id: String(c), label: ['First', 'Second', 'Third'][i], sub: `${ringWord(ringOf(c))}`, color: CELL_COLORS[c] })) },
            footer: timer,
          };
        }
        if (st.phase === 'clue1' || st.phase === 'clue2') {
          const one = st.phase === 'clue1';
          return {
            title: one ? 'Give a one-word clue' : 'Now give two words',
            tag,
            swatch: { color: CELL_COLORS[st.target], label: 'Your secret color' },
            wheel: wheel({ target: st.target, pins: st.phase === 'clue2' ? pinsOf(guessers()) : [], locked: true, small: true }),
            lines: [one ? 'No color names like red or blue. Think of things: "lagoon", "pumpkin", "denim".' : 'Up to two words to steer everyone closer, like "dusty plum".', ...(st.error ? [`⚠ ${st.error}`] : [])],
            cards: clueCards(),
            input: { key: 'clue', placeholder: one ? 'One word' : 'Two words', maxLength: 30, submitLabel: 'Tell' },
            footer: timer,
          };
        }
        return {
          title: 'Everyone is guessing',
          tag,
          swatch: { color: CELL_COLORS[st.target], label: 'Your secret color' },
          wheel: wheel({ target: st.target, pins: pinsOf([...st.locked]), locked: true }),
          cards: clueCards(),
          footer: `${guessers().filter((g) => st.locked.has(g)).length} of ${guessers().length} locked in · ${st.left}s`,
        };
      }

      // Guesser
      if (st.phase === 'pick' || st.phase === 'clue1' || st.phase === 'clue2') {
        return {
          title: st.phase === 'clue2' ? 'Second clue coming…' : `${tellerName} is the Teller`,
          lines: [st.phase === 'pick' ? `${tellerName} is choosing a secret color.` : `${tellerName} is thinking of a ${st.phase === 'clue1' ? 'one-word' : 'two-word'} clue.`],
          cards: clueCards(),
          ...(st.sel.has(id) ? { wheel: wheel({ selected: st.sel.get(id), locked: true }) } : {}),
          footer: timer,
        };
      }
      const locked = st.locked.has(id);
      const second = st.phase === 'guess2';
      const kept = second && st.first.has(id) && st.first.get(id) === st.sel.get(id);
      return {
        title: locked ? 'Locked in' : second ? 'Move your pin or keep it' : 'Where is it?',
        cards: clueCards(),
        wheel: wheel({ selected: st.sel.get(id) ?? null, locked, first: second ? (st.first.get(id) ?? null) : null }),
        lines: locked ? ['Waiting for the others…'] : [second ? `Keep your pin and land within 1 step for a +${CALLED_IT} bonus.` : 'Tap the wheel, fine-tune with the buttons, then lock in.'],
        actions: locked ? [] : [{ key: 'lock', label: kept ? 'Keep my pin' : 'Lock it in', disabled: !st.sel.has(id) }],
        footer: timer,
      };
    }

    const api = {
      update(dt) {
        if (st.over) return;
        clock += dt;
        acc += dt;
        while (acc >= 1) {
          acc -= 1;
          st.left = Math.max(0, st.left - 1);
        }
        botThink();
        const tellerAway = !connected(st.teller) && clock - st.phaseAt > AWAY_S;
        switch (st.phase) {
          case 'pick':
            if (st.left <= 0 || tellerAway) choose(st.offers[Math.floor(Math.random() * st.offers.length)]);
            break;
          case 'clue1':
          case 'clue2':
            if (st.left <= 0 || tellerAway) autoClue();
            break;
          case 'guess1':
          case 'guess2': {
            const need = guessers().filter(connected);
            if (st.left <= 0 || need.every((g) => st.locked.has(g))) endGuess();
            break;
          }
          case 'reveal':
            if (st.left <= 0) nextTurn();
            break;
        }
      },

      onAction(id, { key, value }) {
        if (st.over || !score.has(id)) return;
        if (id === st.teller) {
          if (key === 'pick' && st.phase === 'pick') {
            const c = Number(value);
            if (st.offers.includes(c)) choose(c);
          } else if (key === 'clue' && (st.phase === 'clue1' || st.phase === 'clue2') && value) {
            st.error = giveClue(value);
          }
          return;
        }
        if (st.phase !== 'guess1' && st.phase !== 'guess2') return;
        if (st.locked.has(id)) return;
        if (key === 'cell') {
          const c = Number(value);
          if (Number.isInteger(c) && c >= 0 && c < CELL_COLORS.length) st.sel.set(id, c);
        } else if (key === 'lock' && st.sel.has(id)) {
          st.locked.add(id);
          if (st.phase === 'guess1') st.first.set(id, st.sel.get(id));
        }
      },

      snapshot() {
        return {
          hues: HUES,
          rings: RINGS,
          colors: CELL_COLORS,
          phase: st.phase,
          seq: st.seq,
          turn: st.turn + 1,
          turns: tellers.length,
          left: st.left,
          teller: st.teller,
          clues: st.clues,
          target: st.phase === 'reveal' ? st.target : null,
          // Pins show once locked in (and all of them at the reveal).
          pins: guessers()
            .filter((g) => st.sel.has(g) && (st.locked.has(g) || st.phase === 'clue2' || st.phase === 'reveal'))
            .map((g) => ({ id: g, cell: st.sel.get(g) })),
          firsts: st.phase === 'guess2' || st.phase === 'reveal' ? [...st.first].map(([g, cell]) => ({ id: g, cell })) : [],
          locked: [...st.locked],
          reveal: st.reveal,
          players: roster.map((id) => ({ id, name: name(id), color: players.get(id)?.color ?? '#888', connected: connected(id), score: score.get(id) })),
        };
      },

      playerView(id) {
        return { screen: screenFor(id) };
      },

      isOver: () => st.over,

      results() {
        const standings = roster
          .map((id) => ({ id, name: name(id), color: players.get(id)?.color ?? '#888', score: score.get(id) }))
          .sort((a, b) => b.score - a.score);
        const top = standings[0];
        const tied = standings.filter((s) => s.score === top?.score).length > 1;
        return { title: !top ? 'Tint & Tell' : tied ? "It's a tie!" : `${top.name} has the best eye!`, standings };
      },
    };

    nextTurn();
    return api;
  },
};

// ---- Bot words -----------------------------------------------------------------------
/** A clue for this swatch: the closest known word, or modifier + word for two-word clues. */
function botClue(cell, nWords) {
  const ranked = [...NOUN_CELL].map(([w, c]) => [w, steps(c, cell), hueDist(c, cell)]).sort((a, b) => a[1] - b[1] || Math.random() - 0.5);
  if (nWords === 1) return pick(ranked.filter((r) => r[1] <= ranked[0][1] + 1).slice(0, 3))[0];
  // Two words: the word with the nearest hue, plus how light or dark.
  const byHue = ranked.sort((a, b) => a[2] - b[2] || a[1] - b[1]);
  return `${RING_MOD[ringOf(cell)]} ${byHue[0][0]}`;
}
const hueDist = (a, b) => {
  const dh = Math.abs(hueOf(a) - hueOf(b));
  return Math.min(dh, HUES - dh);
};

/** Where a bot thinks a clue points, with a little wobble. Unknown words: stay put or pick at random. */
function botGuess(clue = '', stay) {
  const words = clue.toLowerCase().split(/\s+/);
  const noun = words.map((w) => NOUN_CELL.get(w) ?? NOUN_CELL.get(w.replace(/s$/, ''))).find((c) => c != null);
  const mod = words.map((w) => MODS[w]).find((r) => r != null);
  let cell = noun ?? stay;
  if (cell == null) return Math.floor(Math.random() * CELL_COLORS.length);
  if (mod != null) cell = cellOf(hueOf(cell), mod);
  if (stay != null && noun == null && mod == null) return stay;
  // Wobble: bots share a word list, so without this they'd read each other perfectly.
  const r = Math.random();
  if (r < 0.25) return cell;
  if (r < 0.7) return Math.random() < 0.7 ? cellOf(hueOf(cell) + pick([-1, 1]), ringOf(cell)) : cellOf(hueOf(cell), clamp(ringOf(cell) + pick([-1, 1]), 0, RINGS - 1));
  return cellOf(hueOf(cell) + pick([-2, -1, 1, 2]), clamp(ringOf(cell) + pick([-1, 0, 1]), 0, RINGS - 1));
}

function ringWord(r) {
  return ['Very pale', 'Light', 'Bright', 'Strong', 'Deep', 'Dark'][r];
}

function hslHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
