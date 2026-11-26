// Dragon Hoard: a team word-clue game for 2–10. Twenty-five words lie on the TV, face down. Each
// word hides a gem for team Ember, a gem for team Frost, a pile of dust, or the sleeping dragon.
//
// Each team has a Keeper, who sees the hidden key on their phone. On their team's turn the Keeper
// types ONE word and a number, like "ocean 3": "three of our words go with ocean". The rest of the
// team (the Seekers) talk it over and vote on their phones; a word turns over when most of them
// agree. Their own gem: keep going (up to the number plus one). Dust or the other team's gem: the
// turn ends. The dragon: that team loses on the spot. First team to uncover all of its gems wins.
// The team that starts has 9 gems, the other 8.
//
// With fewer than 4 players (bots included) everyone is on one team against the dragon: 9 gems,
// 15 dust, 1 dragon, and 8 clues to find every gem (11 with a bot Keeper).
//
// Bots: a bot Keeper clues with a theme from hoard-words.js that covers its own words and none of
// the dragon. Bot Seekers only vote when no human is seeking for their team, and guess from the
// theme lists, so they won't follow a creative human clue. A team with one human and some bots
// gets a bot Keeper, so the human gets to seek.

import { WORDS, THEME_WORDS, WORD_THEMES } from './hoard-words.js';

export const TEAMS = {
  ember: { key: 'ember', name: 'Ember', color: '#ff8a3d' },
  frost: { key: 'frost', name: 'Frost', color: '#4cb8ff' },
};
const DUST = '#b9ab8c';
const DRAGON = '#3a0d12';
const PARCHMENT = '#efe6d0';
const INK = '#2b2418';

const T = { brief: 45, clue: 120, guess: 150, end: 14 };
const AWAY_S = 5; // a Keeper (or a whole team of Seekers) whose phones dropped gets moved along after this
const COOP_CLUES = 8; // with a human Keeper
const COOP_CLUES_BOT = 11; // bot Keepers mostly clue one word at a time
const MAX_NUMBER = 9;

// Who has been Keeper lately, so it rotates between games (player ids last while they keep their seat).
const keeperTimes = new Map();

export default {
  id: 'hoard',
  title: 'Dragon Hoard',
  tab: 'board',
  icon: '🐉',
  description: 'Two teams, 25 words, one sleeping dragon. Clue your team to its gems in one word.',
  minPlayers: 2,
  maxPlayers: 10,
  controller: { type: 'screens' },
  // How to play, shown on the TV at the start (host can skip). Pictures: public/tv/games/rules/hoard.js.
  rules: [
    { art: 'board', title: 'Find your gems', text: 'Two teams, 25 words. Each word hides a gem for Ember, a gem for Frost, dust, or the sleeping dragon.' },
    { art: 'keeper', title: 'The Keeper sees the key', text: "Only each team's Keeper knows what hides where. They give one word and a number, like Ocean 3." },
    { art: 'seekers', title: 'Seekers vote', text: "Everyone else votes on their phones. Your own gem? Keep going. Dust or the other team's gem ends your turn." },
    { art: 'dragon', title: 'Never wake the dragon', text: 'Turn over the dragon and your team loses at once. The first team to find all its gems wins.' },
    { art: 'coop', title: 'Just 2 or 3 of you?', text: 'Then you all play together against the dragon: find every gem before the clues run out.' },
  ],

  create({ players }) {
    const ids = [...players.values()].filter((p) => p.connected).map((p) => p.id);
    const isBot = (id) => !!players.get(id)?.bot;
    const connected = (id) => !!players.get(id)?.connected;
    const name = (id) => players.get(id)?.name ?? '?';
    const colorOf = (id) => players.get(id)?.color ?? '#888';
    const coop = ids.length < 4;

    // ---- Teams ----------------------------------------------------------------------
    const humans = shuffle(ids.filter((id) => !isBot(id)));
    const bots = shuffle(ids.filter(isBot));
    const order = coop ? ['ember'] : shuffle(['ember', 'frost']); // order[0] starts
    const teams = order.map((k) => ({ ...TEAMS[k], members: [], keeper: null, total: 0, found: 0 }));
    // Humans first, spread evenly; then bots fill the smaller team.
    [...humans, ...bots].forEach((id) => {
      const t = teams.reduce((a, b) => (b.members.length < a.members.length ? b : a));
      t.members.push(id);
    });
    for (const t of teams) {
      const hs = t.members.filter((id) => !isBot(id));
      const bs = t.members.filter(isBot);
      let pool = hs.length >= 2 ? hs : bs.length ? bs : hs;
      const least = Math.min(...pool.map((id) => keeperTimes.get(id) ?? 0));
      t.keeper = pick(pool.filter((id) => (keeperTimes.get(id) ?? 0) === least));
      keeperTimes.set(t.keeper, (keeperTimes.get(t.keeper) ?? 0) + 1);
    }
    const teamOf = new Map(teams.flatMap((t) => t.members.map((id) => [id, t])));
    const team = (key) => teams.find((t) => t.key === key);
    const other = (t) => teams.find((x) => x !== t);

    // ---- Board ----------------------------------------------------------------------
    const owners = coop ? [...rep('ember', 9), ...rep('dust', 15), 'dragon'] : [...rep(order[0], 9), ...rep(order[1], 8), ...rep('dust', 7), 'dragon'];
    const tiles = shuffle(owners).map((owner, i) => ({ word: null, owner, revealed: false, by: null, i }));
    shuffle([...WORDS])
      .slice(0, tiles.length)
      .forEach((w, i) => (tiles[i].word = w));
    for (const t of teams) t.total = tiles.filter((x) => x.owner === t.key).length;

    let clock = 0;
    let acc = 0;
    const st = {
      phase: 'brief', // brief → clue → guess → (clue → guess …) → end
      left: T.brief,
      phaseAt: 0,
      turn: 0, // index into teams
      clue: null, // { word, n, team }
      error: null, // the Keeper's last rejected clue
      guessesLeft: 0,
      guessed: 0, // words turned over this turn
      votes: new Map(), // seeker id -> tile index, or 'stop'
      ready: new Set(),
      history: [], // [{ team, word, n, found }]
      last: null, // { seq, tile, owner, team } the latest turned-over word
      winner: null, // team key, or null (co-op loss)
      reason: null, // 'gems' | 'dragon' | 'clues' | 'gems-other'
      cluesLeft: coop ? (isBot(teams[0].keeper) ? COOP_CLUES_BOT : COOP_CLUES) : null,
      over: false,
      seq: 0,
    };
    const cluesTotal = st.cluesLeft;
    const active = () => teams[st.turn];

    /** The seekers whose votes count right now: connected humans, or the team's bots if no human is seeking. */
    function voters(t) {
      const seekers = t.members.filter((id) => id !== t.keeper);
      const hs = seekers.filter((id) => !isBot(id) && connected(id));
      return hs.length ? hs : seekers.filter(isBot);
    }
    const need = (t) => Math.floor(voters(t).length / 2) + 1;

    function setPhase(phase) {
      st.phase = phase;
      st.left = T[phase];
      st.phaseAt = clock;
      st.seq++;
      st.votes = new Map();
      scheduleBots();
    }

    function startTurn() {
      st.clue = null;
      st.error = null;
      st.guessed = 0;
      setPhase('clue');
    }

    // ---- Clues ----------------------------------------------------------------------
    const boardParts = () => tiles.flatMap((t) => [t.word, ...t.word.split('-')]).map(stem);
    /** Why this word can't be a clue, or null if it can. */
    function clueProblem(word) {
      if (!/^[a-z]+$/.test(word)) return 'One word, letters only.';
      const s = stem(word);
      for (const p of boardParts()) {
        if (p === s) return `"${word}" is on the board.`;
        if (p.length >= 3 && s.length >= 3 && (p.includes(s) || s.includes(p))) return `"${word}" is too close to a word on the board.`;
      }
      return null;
    }

    /** Returns an error string, or null if the clue was taken. */
    function giveClue(text) {
      const raw = String(text).trim().toLowerCase().replace(/[’']/g, '');
      let word, num, m;
      if ((m = raw.match(/^([a-z]+)\s*(\d+)$/))) [, word, num] = m;
      else if ((m = raw.match(/^(\d+)\s*([a-z]+)$/))) [, num, word] = m;
      else if (/^[a-z]+$/.test(raw)) return `Add a number too, like "${raw} 2".`;
      else return 'Type one word and a number, like "ocean 3".';
      const n = Number(num);
      if (n < 1 || n > MAX_NUMBER) return `The number goes from 1 to ${MAX_NUMBER}.`;
      const bad = clueProblem(word);
      if (bad) return bad;
      st.clue = { word, n, team: active().key };
      st.history.push({ team: active().key, word, n, found: 0 });
      st.guessesLeft = n + 1;
      st.error = null;
      setPhase('guess');
      return null;
    }

    function autoClue() {
      const c = botClue(active());
      if (giveClue(`${c.word} ${c.n}`) && giveClue('mystery 1')) giveClue('riddle 1');
    }

    /** A theme that covers this team's words and none of the dragon. */
    function botClue(t) {
      const open = tiles.filter((x) => !x.revealed);
      let best = null;
      for (const [theme, words] of THEME_WORDS) {
        if (clueProblem(theme)) continue;
        const hits = open.filter((x) => words.includes(x.word));
        const own = hits.filter((x) => x.owner === t.key).length;
        if (!own || hits.some((x) => x.owner === 'dragon')) continue;
        const enemy = hits.filter((x) => x.owner !== t.key && x.owner !== 'dust').length;
        const dust = hits.filter((x) => x.owner === 'dust').length;
        const score = Math.min(own, 4) - 2 * enemy - 0.7 * dust + Math.random() * 0.8;
        if (!best || score > best.score) best = { word: theme, n: Math.min(own, 4), score };
      }
      if (best) return best;
      // Nothing safe: name one of our words' themes and hope.
      const mine = open.filter((x) => x.owner === t.key);
      for (const x of shuffle(mine)) for (const th of WORD_THEMES.get(x.word) ?? []) if (!clueProblem(th)) return { word: th, n: 1 };
      return { word: 'mystery', n: 1 };
    }

    // ---- Guesses --------------------------------------------------------------------
    function tally() {
      const t = active();
      const counts = new Map();
      for (const id of voters(t)) {
        const v = st.votes.get(id);
        if (v != null) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      for (const [v, n] of counts) {
        if (n < need(t)) continue;
        if (v === 'stop') return endTurn();
        return reveal(v);
      }
    }

    function reveal(i) {
      const tile = tiles[i];
      const t = active();
      tile.revealed = true;
      tile.by = t.key;
      st.votes = new Map();
      st.guessed++;
      st.last = { seq: ++st.seq, tile: i, owner: tile.owner, team: t.key };
      const h = st.history.at(-1);
      if (tile.owner === 'dragon') return finish(coop ? null : other(t).key, 'dragon');
      const owner = team(tile.owner);
      if (owner) {
        owner.found++;
        if (owner.found >= owner.total) return finish(owner.key, owner === t ? 'gems' : 'gems-other');
      }
      if (tile.owner === t.key) {
        h.found++;
        st.guessesLeft--;
        if (st.guessesLeft <= 0) return endTurn();
        scheduleBots();
        return;
      }
      endTurn();
    }

    function endTurn() {
      if (coop) {
        st.cluesLeft--;
        if (st.cluesLeft <= 0) return finish(null, 'clues');
      } else st.turn = 1 - st.turn;
      startTurn();
    }

    function finish(winner, reason) {
      st.winner = winner;
      st.reason = reason;
      setPhase('end');
    }

    // ---- Bots -----------------------------------------------------------------------
    const botAt = new Map();
    function scheduleBots() {
      const [lo, hi] = { brief: [2, 5], clue: [4, 8], guess: [2.5, 6], end: [999, 999] }[st.phase];
      for (const id of ids) if (isBot(id)) botAt.set(id, clock + lo + Math.random() * (hi - lo));
    }

    function botThink() {
      const t = active();
      for (const id of ids) {
        if (!isBot(id) || clock < (botAt.get(id) ?? Infinity)) continue;
        botAt.set(id, Infinity);
        if (st.phase === 'brief') st.ready.add(id);
        else if (st.phase === 'clue' && id === t.keeper) autoClue();
        else if (st.phase === 'guess' && voters(t).includes(id)) {
          const v = botVote(t, id);
          if (v != null && st.votes.get(id) !== v) api.onAction(id, { key: v === 'stop' ? 'stop' : 'tile', value: String(v) });
          if (st.phase === 'guess') botAt.set(id, clock + 5 + Math.random() * 4); // look again if the team is split
        }
      }
    }

    function botVote(t, id) {
      // Go along with the most popular vote so far, so bots don't split the team.
      const counts = new Map();
      for (const [vid, v] of st.votes) if (vid !== id && voters(t).includes(vid)) counts.set(v, (counts.get(v) ?? 0) + 1);
      const top = [...counts].sort((a, b) => b[1] - a[1])[0];
      if (top && Math.random() < 0.85) return top[0];
      const found = st.history.at(-1)?.found ?? 0;
      if (st.guessed > 0 && found >= st.clue.n) return 'stop';
      const open = tiles.filter((x) => !x.revealed);
      const words = THEME_WORDS.get(st.clue.word) ?? [];
      const s = stem(st.clue.word);
      let cands = open.filter((x) => words.includes(x.word) || stem(x.word).includes(s) || (WORD_THEMES.get(x.word) ?? []).includes(s));
      if (!cands.length) return st.guessed > 0 ? 'stop' : pick(open).i;
      if (Math.random() < 0.12) return pick(open).i; // bots slip up now and then
      return pick(cands).i;
    }

    // ---- Phone screens --------------------------------------------------------------
    const teamTag = (id) => {
      const t = teamOf.get(id);
      return { label: `${coop ? 'Team' : t.name} · ${id === t.keeper ? 'Keeper' : 'Seeker'}`, color: t.color };
    };
    const ownerColor = (o) => (o === 'dust' ? DUST : o === 'dragon' ? DRAGON : TEAMS[o].color);
    const initial = (id) => name(id).charAt(0).toUpperCase();
    const votesOn = (i) => [...st.votes].filter(([, v]) => v === i).map(([vid]) => vid);

    /** The board as a phone grid. key = true shows the Keeper's key; pick = this seeker can vote. */
    function grid({ key = false, pick: canPick = false, mine = null } = {}) {
      return {
        key: 'tile',
        cols: 5,
        locked: !canPick,
        cells: tiles.map((x) => {
          const show = x.revealed || key || st.phase === 'end';
          const voted = st.phase === 'guess' ? votesOn(x.i) : [];
          return {
            id: String(x.i),
            label: x.word.toUpperCase(),
            color: show ? ownerColor(x.owner) : PARCHMENT,
            ink: x.revealed ? (x.owner === 'dust' ? '#c8bca2' : '#fff6e0') : show && x.owner === 'dragon' ? '#ffd2d2' : INK,
            art: x.revealed ? x.owner : show ? `key:${x.owner}` : 'hidden',
            dim: false,
            mark: x.revealed ? (x.owner === 'dragon' ? 'DRAGON' : x.owner === 'dust' ? 'dust' : '✓ gem') : x.owner === 'dragon' && show ? 'DRAGON' : undefined, // shown only without art
            dots: voted.map(colorOf),
            ring: mine === x.i ? '#ffffff' : undefined,
            disabled: x.revealed,
          };
        }),
      };
    }

    const clueCard = () => {
      if (!st.clue) return [];
      const t = team(st.clue.team);
      return [{ art: t ? `crest:${t.key}` : undefined, label: `${st.clue.word.toUpperCase()} · ${st.clue.n}`, sub: `${t ? (coop ? 'The' : t.name) : ''} Keeper's clue · ${st.guessesLeft} guess${st.guessesLeft === 1 ? '' : 'es'} left`, color: t?.color }];
    };

    function screenFor(id) {
      const t = teamOf.get(id);
      if (!t) return { title: 'Game in progress', lines: ['You can join the next game. Watch the TV!'] };
      const keeper = id === t.keeper;
      const at = active();
      const timer = `${st.left}s`;
      const tag = teamTag(id);

      if (st.phase === 'end') {
        const won = st.winner === t.key;
        const title = coop ? (st.reason === 'gems' ? 'You found the hoard!' : st.reason === 'dragon' ? 'The dragon woke up!' : 'Out of clues!') : won ? 'You win!' : 'You lose';
        const winTeam = team(st.winner);
        const why =
          st.reason === 'gems' ? (coop ? `All ${t.total} gems found with ${st.cluesLeft} clue${st.cluesLeft === 1 ? '' : 's'} to spare.` : `${winTeam.name} found every gem.`)
          : st.reason === 'gems-other' ? `${winTeam.name}'s last gem was turned over by the other team.`
          : st.reason === 'dragon' ? (coop ? 'Somebody poked the dragon.' : `${other(winTeam).name} woke the dragon.`)
          : `${t.found} of ${t.total} gems found.`;
        return { title, tag, lines: [why, 'Here is the whole key.'], grid: grid({ key: true }), footer: '' };
      }

      if (st.phase === 'brief') {
        const lines = keeper
          ? [
              coop ? 'You are the Keeper. Only you can see which words hide gems.' : `You are ${t.name}'s Keeper. Only you and the other Keeper can see the key.`,
              'On your turn, type one word and a number, like "ocean 3": three of your words go with ocean.',
              'Never say anything else out loud. Avoid the dragon at all costs!',
            ]
          : [
              coop ? `${name(t.keeper)} is the Keeper and will give clues.` : `You are on ${t.name}. ${name(t.keeper)} is your Keeper.`,
              'When a clue comes in, talk it over and tap a word to vote. It turns over when most of your team agrees.',
              `Find your gems${coop ? ` in ${cluesTotal} clues` : ''}. Dust ends your turn. The dragon ends the game!`,
            ];
        return {
          title: 'Dragon Hoard',
          tag,
          lines,
          cards: coop ? [] : teams.map((x) => ({ art: `crest:${x.key}`, label: `${x.name}: ${x.members.map(name).join(', ')}`, sub: `Keeper ${name(x.keeper)} · ${x.total} gems${x === teams[0] ? ' · goes first' : ''}`, color: x.color })),
          ...(keeper ? { grid: grid({ key: true }) } : {}),
          actions: st.ready.has(id) ? [] : [{ key: 'ready', label: 'Got it' }],
          footer: `${humansNotReady()} still reading · ${timer}`,
        };
      }

      const mineTurn = at === t;
      if (st.phase === 'clue') {
        if (keeper && mineTurn) {
          return {
            title: 'Give a clue',
            tag,
            lines: ['One word and a number: how many of your words it points to.', ...(st.error ? [`⚠ ${st.error}`] : [])],
            input: { key: 'clue', placeholder: 'ocean 3', maxLength: 24, submitLabel: 'Send' },
            grid: grid({ key: true }),
            footer: `${coop ? 'Orange = gems' : t.key === 'ember' ? 'Orange = yours, blue = theirs' : 'Blue = yours, orange = theirs'}, tan = dust · ${timer}`,
          };
        }
        return {
          title: mineTurn ? `${name(t.keeper)} is thinking…` : `${at.name} is thinking…`,
          tag,
          lines: [mineTurn ? 'Your Keeper is choosing a clue.' : `${name(at.keeper)} is choosing a clue for ${at.name}.`],
          grid: grid({ key: keeper }),
          footer: timer,
        };
      }

      // guess
      if (mineTurn && !keeper) {
        const mine = st.votes.get(id);
        const counted = voters(t).includes(id);
        const stopVotes = [...st.votes.values()].filter((v) => v === 'stop').length;
        return {
          title: mine === 'stop' ? 'You voted to stop' : 'Pick a word',
          tag,
          cards: clueCard(),
          lines: [counted ? `Tap a word to vote. It turns over with ${need(t)} vote${need(t) === 1 ? '' : 's'}.` : 'Watching this one.'],
          grid: grid({ pick: counted, mine: typeof mine === 'number' ? mine : null }),
          actions: counted ? [{ key: 'stop', label: `Stop guessing${stopVotes ? ` (${stopVotes}/${need(t)})` : ''}`, style: 'secondary', disabled: st.guessed === 0 }] : [],
          footer: timer,
        };
      }
      return {
        title: mineTurn ? 'Your team is guessing' : `${at.name} is guessing`,
        tag,
        cards: clueCard(),
        lines: [mineTurn ? 'Keep a straight face!' : keeper ? 'You can see their votes. Fingers crossed.' : 'Wait for your turn. You may talk, but no peeking at the Keepers!'],
        grid: grid({ key: keeper }),
        footer: timer,
      };
    }

    const humansNotReady = () => ids.filter((id) => !isBot(id) && connected(id) && !st.ready.has(id)).length;

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
        const t = active();
        switch (st.phase) {
          case 'brief':
            if (st.left <= 0 || humansNotReady() === 0) startTurn();
            break;
          case 'clue':
            if (st.left <= 0 || (!connected(t.keeper) && clock - st.phaseAt > AWAY_S)) autoClue();
            break;
          case 'guess':
            if (st.left <= 0 || (!voters(t).length && clock - st.phaseAt > AWAY_S)) endTurn();
            break;
          case 'end':
            if (st.left <= 0) st.over = true;
            break;
        }
      },

      onAction(id, { key, value }) {
        const t = teamOf.get(id);
        if (st.over || !t) return;
        if (st.phase === 'brief') {
          if (key === 'ready') st.ready.add(id);
          return;
        }
        if (st.phase === 'clue' && key === 'clue' && id === active().keeper && value) {
          st.error = giveClue(value);
          return;
        }
        if (st.phase !== 'guess' || t !== active() || !voters(t).includes(id)) return;
        if (key === 'tile') {
          const i = Number(value);
          if (!Number.isInteger(i) || !tiles[i] || tiles[i].revealed) return;
          if (st.votes.get(id) === i) st.votes.delete(id);
          else st.votes.set(id, i);
          tally();
        } else if (key === 'stop' && st.guessed > 0) {
          if (st.votes.get(id) === 'stop') st.votes.delete(id);
          else st.votes.set(id, 'stop');
          tally();
        }
      },

      snapshot() {
        const end = st.phase === 'end';
        return {
          mode: coop ? 'coop' : 'teams',
          phase: st.phase,
          seq: st.seq,
          left: st.left,
          turnTeam: active().key,
          teams: teams.map((x) => ({ key: x.key, name: x.name, color: x.color, keeper: x.keeper, members: x.members, found: x.found, total: x.total })),
          // Owners only for words already turned over (and all of them once the game ends).
          tiles: tiles.map((x) => ({ word: x.word, revealed: x.revealed, owner: x.revealed || end ? x.owner : null, by: x.by })),
          votes: st.phase === 'guess' ? [...st.votes].map(([id, v]) => ({ id, tile: v === 'stop' ? -1 : v })) : [],
          need: st.phase === 'guess' ? need(active()) : 0,
          clue: st.clue,
          guessesLeft: st.guessesLeft,
          guessed: st.guessed,
          history: st.history,
          last: st.last,
          winner: st.winner,
          reason: st.reason,
          cluesLeft: st.cluesLeft,
          cluesTotal,
          ready: [...st.ready],
          players: ids.map((id) => ({ id, name: name(id), color: colorOf(id), team: teamOf.get(id).key, connected: connected(id), bot: isBot(id) })),
        };
      },

      playerView(id) {
        return { screen: { ...screenFor(id), art: 'hoard' } };
      },

      isOver: () => st.over,

      results() {
        const rank = (id) => (teamOf.get(id).key === st.winner ? 0 : 1);
        const standings = ids
          .map((id) => ({ id, name: name(id), color: colorOf(id), score: teamOf.get(id).found }))
          .sort((a, b) => rank(a.id) - rank(b.id) || b.score - a.score);
        let title = 'Dragon Hoard';
        if (coop) title = st.reason === 'gems' ? 'The hoard is yours!' : st.reason === 'dragon' ? 'The dragon woke up!' : st.reason ? 'Out of clues!' : title;
        else if (st.winner) title = `${team(st.winner).name} wins!`;
        return { title, standings };
      },
    };

    scheduleBots();
    return api;
  },
};

/** Lowercase, without a plural ending, for "too close to a board word" checks. */
function stem(w) {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && /(ches|shes|xes|ses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const rep = (v, n) => Array.from({ length: n }, () => v);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
