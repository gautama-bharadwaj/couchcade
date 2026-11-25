// Tune In: a co-op radio-dial party game for 2–8. The TV shows an old radio tuner. Each card is a
// band between two opposite ideas (Bland ↔ Spicy). Somewhere on it is a secret station.
//
// Each turn one player is the DJ. Their phone shows where the station is; they pick one of two
// cards for it and give a clue: something that sits at that spot between the two ideas
// ("Salsa" for a bit past the middle of Bland ↔ Spicy). Everyone else is a Listener and tunes their
// own needle on their phone. The big needle on the TV is the crowd needle: the average of every
// Listener's needle, so the couch has to talk it out. When everyone locks in (or time runs out),
// the station is revealed.
//
// Scoring, by how far the crowd needle is from the station (the band runs 0–100):
//   within 3 = Crystal clear, 4 · within 8 = Clear, 3 · within 13 = Crackly, 2 · further = Static, 0
// Those points go to the whole crew (the crew score), and to the DJ's own score. Each Listener's
// own needle is scored the same way for their own score: the "sharpest ear" wins the results.
// Everyone is DJ the same number of times. Cards don't repeat until the whole deck has been used.
// Bots (lobby "Add bot") give plain clues like "Leaning: Spicy" and follow the crowd when guessing.

import { DECK } from './tunein-deck.js';

export const ZONES = [
  { within: 3, pts: 4, label: 'Crystal clear' },
  { within: 8, pts: 3, label: 'Clear' },
  { within: 13, pts: 2, label: 'Crackly' },
];
export function zoneFor(d) {
  return ZONES.find((z) => d <= z.within) ?? { within: Infinity, pts: 0, label: 'Static' };
}

const T = { pick: 25, clue: 75, tune: 60, reveal: 10 };
const AWAY_S = 4; // a DJ whose phone dropped gets an automatic clue after this long
const MAX_CLUE = 40;

// Cards are dealt from one shuffled pile for as long as the server runs, so a group playing
// several games in an evening doesn't see a card again until the whole deck has gone round.
let pile = [];
function drawCard() {
  if (!pile.length) pile = shuffle(DECK.map((c, i) => i));
  return DECK[pile.pop()];
}

export default {
  id: 'tunein',
  title: 'Tune In',
  tab: 'board',
  icon: '📻',
  description: 'The DJ clues a secret station between two ideas. Tune the dial together.',
  minPlayers: 2,
  maxPlayers: 8,
  controller: { type: 'screens' },
  // How to play, shown on the TV at the start (host can skip). Drawn by drawRules in public/tv/games/tunein.js.
  rules: [
    { art: 'band', title: 'Find the secret station', text: 'Each card is a band between two opposite ideas. Each turn one player is the DJ, and only the DJ sees where the station is.' },
    { art: 'clue', title: 'The DJ gives a clue', text: 'Something that sits right at that spot. "Salsa" might be just past the middle of Bland to Spicy. No numbers!' },
    { art: 'needles', title: 'Everyone else tunes in', text: "Drag your own needle on your phone. The red needle is everyone's average, so talk it out, then lock in." },
    { art: 'score', title: 'Closer is better', text: 'Crystal clear 4, Clear 3, Crackly 2. The whole crew shares the points, and your own needle scores for you.' },
  ],

  create({ players }) {
    const roster = shuffle([...players.values()].filter((p) => p.connected).map((p) => p.id));
    const n = roster.length;
    const rounds = n === 2 ? 3 : n <= 4 ? 2 : 1;
    const djs = Array.from({ length: rounds }, () => roster).flat();
    const score = new Map(roster.map((id) => [id, 0]));
    const name = (id) => players.get(id)?.name ?? '?';
    const color = (id) => players.get(id)?.color ?? '#888';
    const isBot = (id) => !!players.get(id)?.bot;
    const connected = (id) => !!players.get(id)?.connected;

    let clock = 0;
    let acc = 0;
    const st = {
      turn: -1,
      phase: 'pick', // (pick → clue → tune → reveal) × turns
      left: 0,
      phaseAt: 0,
      seq: 0,
      dj: null,
      offers: [], // two cards the DJ can choose between
      card: null,
      station: null, // 0–100
      clue: null,
      error: null,
      needle: new Map(), // listener -> 0–100 (only once they've touched it)
      locked: new Set(),
      crew: 0,
      history: [], // { pts } per turn, for the TV's signal meter
      reveal: null, // { crowd, d, zone, rows: [{ id, value, pts }] }
      over: false,
    };
    const listeners = () => roster.filter((id) => id !== st.dj);

    /** The crowd needle: the average of every Listener needle that has been set. */
    function crowd() {
      const vals = listeners().filter((id) => st.needle.has(id)).map((id) => st.needle.get(id));
      return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 50;
    }

    function setPhase(phase) {
      st.phase = phase;
      st.left = T[phase];
      st.phaseAt = clock;
      st.seq++;
      scheduleBots();
    }

    function nextTurn() {
      st.turn++;
      if (st.turn >= djs.length) {
        st.over = true;
        return;
      }
      st.dj = djs[st.turn];
      st.offers = [drawCard(), drawCard()];
      st.card = null;
      // Not right at the ends, so every zone fits on the band.
      st.station = 4 + Math.floor(Math.random() * 93);
      st.clue = null;
      st.error = null;
      st.needle = new Map();
      st.locked = new Set();
      st.reveal = null;
      setPhase('pick');
    }

    function choose(i) {
      st.card = st.offers[i];
      setPhase('clue');
    }

    /** Returns an error string, or null if the clue was taken. */
    function giveClue(text, { trusted = false } = {}) {
      const clue = String(text).replace(/\s+/g, ' ').trim().slice(0, MAX_CLUE);
      if (!clue) return 'Type a clue.';
      if (!trusted) {
        if (/\d/.test(clue)) return 'No numbers. Name a thing, not a spot on the dial.';
        const low = clue.toLowerCase().replace(/[^a-z ]/g, '');
        if (st.card.some((side) => side.toLowerCase().replace(/[^a-z ]/g, '') === low)) return 'That is one of the two ends. Try something in between.';
      }
      st.clue = clue;
      st.error = null;
      setPhase('tune');
      return null;
    }

    function finishTune() {
      const c = crowd();
      const d = Math.abs(c - st.station);
      const zone = zoneFor(d);
      const rows = listeners().map((id) => {
        if (!st.needle.has(id)) return { id, value: null, pts: 0 };
        const pts = zoneFor(Math.abs(st.needle.get(id) - st.station)).pts;
        return { id, value: st.needle.get(id), pts };
      });
      for (const r of rows) score.set(r.id, score.get(r.id) + r.pts);
      score.set(st.dj, score.get(st.dj) + zone.pts);
      st.crew += zone.pts;
      st.history.push({ pts: zone.pts });
      st.reveal = { crowd: c, d: Math.round(d * 10) / 10, zone: zone.label, pts: zone.pts, rows };
      setPhase('reveal');
    }

    // ---- Bots ---------------------------------------------------------------------
    const botAt = new Map(); // id -> when it next acts
    function scheduleBots() {
      const [lo, hi] = { pick: [2, 4], clue: [3, 6], tune: [3, 10], reveal: [99, 99] }[st.phase];
      for (const id of roster) if (isBot(id)) botAt.set(id, clock + lo + Math.random() * (hi - lo));
    }

    function botThink() {
      for (const id of roster) {
        if (!isBot(id) || clock < (botAt.get(id) ?? Infinity)) continue;
        botAt.set(id, Infinity);
        const dj = id === st.dj;
        if (dj && st.phase === 'pick') api.onAction(id, { key: 'pick', value: String(Math.floor(Math.random() * 2)) });
        else if (dj && st.phase === 'clue') giveClue(botClue(st.card, st.station), { trusted: true });
        else if (!dj && st.phase === 'tune') {
          if (!st.needle.has(id)) {
            api.onAction(id, { key: 'dial', value: String(botGuess(id)) });
            botAt.set(id, clock + 2 + Math.random() * 5); // then lock in a bit later
          } else api.onAction(id, { key: 'lock' });
        }
      }
    }

    /** Bots read bot clues exactly (with a wobble); for a human clue they lean toward the humans. */
    function botGuess(id) {
      const read = readBotClue(st.clue, st.card);
      if (read != null) return clamp(Math.round(read + (Math.random() - 0.5) * 16), 0, 100);
      const humans = listeners().filter((g) => !isBot(g) && st.needle.has(g)).map((g) => st.needle.get(g));
      const base = humans.length ? humans.reduce((a, b) => a + b, 0) / humans.length : 20 + Math.random() * 60;
      return clamp(Math.round(base + (Math.random() - 0.5) * 24), 0, 100);
    }

    // ---- Phone screens ------------------------------------------------------------
    const dial = (extra) => ({ key: 'dial', left: st.card?.[0] ?? '', right: st.card?.[1] ?? '', ...extra });
    const others = (id) => listeners().filter((g) => g !== id && st.needle.has(g)).map((g) => ({ value: st.needle.get(g), color: color(g) }));
    const clueCard = () => (st.clue ? [{ label: `“${st.clue}”`, sub: `${name(st.dj)}'s clue`, color: color(st.dj) }] : []);

    function screenFor(id) {
      if (!score.has(id)) return { title: 'Game in progress', lines: ['You can join the next game. Watch the TV!'] };
      const isDj = id === st.dj;
      const head = `Turn ${st.turn + 1} of ${djs.length}`;
      const timer = `${head} · ${st.left}s`;

      if (st.phase === 'reveal') {
        const r = st.reveal.rows.find((x) => x.id === id);
        const mine = isDj ? `As the DJ you get the crew's ${st.reveal.pts}.` : r?.value == null ? 'You didn\'t tune in, so no points for you.' : `Your own needle: ${zoneFor(Math.abs(r.value - st.station)).label}, +${r.pts}.`;
        return {
          title: `${st.reveal.zone}!`,
          dial: dial({ target: st.station, crowd: st.reveal.crowd, value: isDj ? null : (r?.value ?? null), pins: others(id), locked: true }),
          lines: [`The crew scores ${st.reveal.pts}.`, mine],
          cards: [{ label: `Crew score ${st.crew}`, sub: `Your score ${score.get(id)}`, color: color(id) }],
          footer: head,
        };
      }

      if (isDj) {
        const tag = { label: 'You are the DJ', color: color(id) };
        if (st.phase === 'pick') {
          return {
            title: 'Pick a band',
            tag,
            lines: ['The station is at the white mark. Pick the card that makes it easiest to clue.'],
            choose: { key: 'pick', options: st.offers.map((c, i) => ({ id: String(i), label: `${c[0]}  ↔  ${c[1]}`, sub: describe(st.station, c) })) },
            dial: dial({ left: 'Left idea', right: 'Right idea', target: st.station, locked: true, small: true }),
            footer: timer,
          };
        }
        if (st.phase === 'clue') {
          return {
            title: 'Give a clue',
            tag,
            dial: dial({ target: st.station, locked: true }),
            lines: [`Name something that sits right there between “${st.card[0]}” and “${st.card[1]}”. A word or a short phrase, no numbers.`, ...(st.error ? [`⚠ ${st.error}`] : [])],
            input: { key: 'clue', placeholder: 'Your clue', maxLength: MAX_CLUE, submitLabel: 'Send' },
            footer: timer,
          };
        }
        return {
          title: 'They\'re tuning in',
          tag,
          dial: dial({ target: st.station, crowd: crowd(), pins: others(id), locked: true }),
          cards: clueCard(),
          lines: ['No hints now! Watch them argue on the TV.'],
          footer: `${listeners().filter((g) => st.locked.has(g)).length} of ${listeners().length} locked in · ${st.left}s`,
        };
      }

      // Listener
      if (st.phase === 'pick' || st.phase === 'clue') {
        return {
          title: `${name(st.dj)} is the DJ`,
          lines: [st.phase === 'pick' ? `${name(st.dj)} is choosing a card.` : `${name(st.dj)} is thinking of a clue for “${st.card[0]}” to “${st.card[1]}”.`],
          footer: timer,
        };
      }
      const locked = st.locked.has(id);
      return {
        title: locked ? 'Locked in' : 'Tune in!',
        cards: clueCard(),
        dial: dial({ value: st.needle.get(id) ?? null, crowd: crowd(), pins: others(id), locked }),
        lines: [locked ? 'Changed your mind? You can unlock until everyone is in.' : 'Drag your needle. The red one is everyone\'s average.'],
        actions: locked ? [{ key: 'unlock', label: 'Unlock', style: 'secondary' }] : [{ key: 'lock', label: 'Lock it in' }],
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
        const djAway = st.dj && !connected(st.dj) && clock - st.phaseAt > AWAY_S;
        switch (st.phase) {
          case 'pick':
            if (st.left <= 0 || djAway) choose(Math.floor(Math.random() * 2));
            break;
          case 'clue':
            if (st.left <= 0 || djAway) giveClue(botClue(st.card, st.station), { trusted: true });
            break;
          case 'tune': {
            const need = listeners().filter(connected);
            if (st.left <= 0 || (need.length && need.every((g) => st.locked.has(g)))) finishTune();
            break;
          }
          case 'reveal':
            if (st.left <= 0) nextTurn();
            break;
        }
      },

      onAction(id, { key, value }) {
        if (st.over || !score.has(id)) return;
        if (id === st.dj) {
          if (key === 'pick' && st.phase === 'pick' && (value === '0' || value === '1')) choose(Number(value));
          else if (key === 'clue' && st.phase === 'clue' && value) st.error = giveClue(value);
          return;
        }
        if (st.phase !== 'tune') return;
        if (key === 'dial' && !st.locked.has(id)) {
          const v = Number(value);
          if (Number.isFinite(v)) st.needle.set(id, clamp(Math.round(v), 0, 100));
        } else if (key === 'lock') {
          if (!st.needle.has(id)) st.needle.set(id, 50); // locking without moving: the middle
          st.locked.add(id);
        }
        else if (key === 'unlock') st.locked.delete(id);
      },

      snapshot() {
        return {
          phase: st.phase,
          seq: st.seq,
          turn: st.turn + 1,
          turns: djs.length,
          left: st.left,
          dj: st.dj,
          card: st.card,
          clue: st.clue,
          station: st.phase === 'reveal' ? st.station : null,
          crowd: st.phase === 'tune' || st.phase === 'reveal' ? (st.reveal?.crowd ?? crowd()) : null,
          needles: [...st.needle].map(([id, value]) => ({ id, value })),
          locked: [...st.locked],
          crew: st.crew,
          maxCrew: djs.length * ZONES[0].pts,
          history: st.history.map((h) => h.pts),
          reveal: st.reveal,
          zones: ZONES,
          players: roster.map((id) => ({ id, name: name(id), color: color(id), connected: connected(id), score: score.get(id) })),
        };
      },

      playerView(id) {
        return { screen: screenFor(id) };
      },

      isOver: () => st.over,

      results() {
        const standings = roster.map((id) => ({ id, name: name(id), color: color(id), score: score.get(id) })).sort((a, b) => b.score - a.score);
        return { title: `Crew score ${st.crew}: ${crewRating(st.crew / Math.max(1, djs.length * ZONES[0].pts))}`, standings };
      },
    };

    nextTurn();
    return api;
  },
};

export function crewRating(frac) {
  if (frac >= 0.75) return 'Crystal-clear crew!';
  if (frac >= 0.55) return 'Great reception!';
  if (frac >= 0.35) return 'A little fuzzy';
  return 'Mostly static';
}

// ---- Bot clues -------------------------------------------------------------------------
// Plain directions a person can read too. Each band of the dial has a phrase; bots reading a
// bot clue aim for the middle of that band.
const BANDS = [
  [0, 8, 'Totally: {L}'],
  [8, 20, 'Very: {L}'],
  [20, 34, 'Leaning: {L}'],
  [34, 45, 'A little: {L}'],
  [45, 55, 'Right in the middle'],
  [55, 66, 'A little: {R}'],
  [66, 80, 'Leaning: {R}'],
  [80, 92, 'Very: {R}'],
  [92, 101, 'Totally: {R}'],
];
function botClue(card, station) {
  const [, , phrase] = BANDS.find(([lo, hi]) => station >= lo && station < hi);
  return fill(phrase, card);
}
const fill = (phrase, card) => phrase.replace('{L}', () => card[0]).replace('{R}', () => card[1]);
function readBotClue(clue, card) {
  for (const [lo, hi, phrase] of BANDS) if (fill(phrase, card) === clue) return (lo + Math.min(100, hi)) / 2;
  return null;
}

/** A word for where the station sits, for the DJ's card choice. */
function describe(v, card) {
  if (v < 15) return `Very ${card[0].toLowerCase()}`;
  if (v < 40) return `Toward ${card[0].toLowerCase()}`;
  if (v <= 60) return 'Near the middle';
  if (v <= 85) return `Toward ${card[1].toLowerCase()}`;
  return `Very ${card[1].toLowerCase()}`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
