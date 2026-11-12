// Midnight Gala: hidden-role social deduction for 4–8 players.
//
// Guests at a mansion party; 1–2 of them are secretly Thieves. Each round:
//   night   → everyone secretly picks a room; Thieves choose Steal / Lie low / Plant evidence;
//             the Detective investigates someone; the Bodyguard guards a room.
//   reveal  → the TV shows what happened (gems stolen, thefts foiled). Each phone privately
//             shows who you were with, plus any evidence you found.
//   talk    → discuss out loud. The Gossip can post anonymous messages on the TV.
//   vote    → everyone votes at once; votes are revealed together. Plurality (2+ votes, no tie)
//             escorts that person out and reveals their role. Voting out an innocent
//             costs everyone who voted for them their vote next round.
// Thieves win by stealing enough gems or lasting until dawn. Guests win by catching every Thief,
// unless the last Thief caught names the Detective ("last guess").
//
// All rules live here; the TV (public/tv/games/gala.js) only draws snapshot().

const ROOMS = [
  { id: 'library', label: 'Library', color: '#b36bff' },
  { id: 'ballroom', label: 'Ballroom', color: '#ffc93c' },
  { id: 'conservatory', label: 'Conservatory', color: '#4cd97b' },
  { id: 'cellar', label: 'Wine Cellar', color: '#ff8c42' },
];
const roomById = new Map(ROOMS.map((r) => [r.id, r]));

const ROLES = {
  thief: { label: 'Thief', team: 'thieves', color: '#ff5a5f', blurb: 'Steal the gems without getting caught. Other Thieves are shown to you.' },
  detective: { label: 'Detective', team: 'guests', color: '#3fa7ff', blurb: 'Every other night, secretly learn whether one guest is a Thief. Stay hidden: a caught Thief gets one guess at who you are.' },
  bodyguard: { label: 'Bodyguard', team: 'guests', color: '#2ee6d6', blurb: 'Each night, guard a room. Any theft there is foiled.' },
  gossip: { label: 'Gossip', team: 'guests', color: '#ff6fd8', blurb: 'During the talk, post anonymous messages on the TV.' },
  guest: { label: 'Guest', team: 'guests', color: '#8a93a8', blurb: 'Watch who you share rooms with and find the Thieves.' },
};

// Phase lengths in seconds. A phase ends early once everyone still in the game is done.
const TIMES = { intro: 25, night: 45, reveal: 12, talk: 120, vote: 35, verdict: 10, lastGuess: 30 };
const MAX_NIGHTS = 5; // dawn
const DETECTIVE_EVERY = 2; // detective can investigate on nights 1, 3, 5
const GOSSIP_MAX_PER_TALK = 2;

export default {
  id: 'gala',
  title: 'Midnight Gala',
  description: 'Hidden roles. Find the jewel thieves before dawn. 4–8 players.',
  minPlayers: 4,
  maxPlayers: 8,
  controller: { type: 'screens' },

  create({ players }) {
    // Roster is fixed at the start; people who join mid-game watch until the next game.
    const roster = [...players.values()].filter((p) => p.connected).map((p) => p.id);
    const n = roster.length;
    const roles = assignRoles(roster);
    const gemsToWin = n >= 6 ? 4 : 3;

    const st = {
      phase: 'intro',
      left: TIMES.intro,
      night: 0,
      gems: 0,
      out: new Set(), // escorted out
      ready: new Set(), // done with the current phase
      noVote: new Set(), // lost their vote this round
      room: new Map(), // night picks
      move: new Map(), // thief: 'steal' | 'lie' | 'plant:<id>'
      investigate: new Map(), // detective -> target id
      guard: new Map(), // bodyguard -> room id
      votes: new Map(),
      lastVotes: null, // [{ voter, target }] shown at the verdict
      verdict: null, // { id, role, wasThief } | { nobody: true }
      nightLog: [], // public, per night: { night, stolen: [room], foiled: [room] }
      gossip: [], // public anonymous messages this talk
      gossipCount: 0,
      privateNotes: new Map(roster.map((id) => [id, []])), // what each phone remembers, newest first
      lastSeen: new Map(), // id -> names you were with last night
      lastGuessBy: null,
      winner: null, // 'thieves' | 'guests'
      winReason: '',
      over: false,
    };

    const name = (id) => players.get(id)?.name ?? '?';
    const color = (id) => players.get(id)?.color ?? '#888';
    const inGame = () => roster.filter((id) => !st.out.has(id));
    const thievesLeft = () => inGame().filter((id) => roles.get(id) === 'thief');
    const note = (id, label, sub, c) => st.privateNotes.get(id)?.unshift({ label, sub, color: c });
    const detectiveCanAct = () => (st.night - 1) % DETECTIVE_EVERY === 0;

    function enter(phase) {
      st.phase = phase;
      st.left = TIMES[phase];
      st.ready.clear();
      if (phase === 'night') {
        st.night++;
        st.room.clear();
        st.move.clear();
        st.investigate.clear();
        st.guard.clear();
      }
      if (phase === 'talk') {
        st.gossip = [];
        st.gossipCount = 0;
      }
      if (phase === 'vote') st.votes.clear();
    }

    // Who has to act before the phase can end early.
    function needed() {
      if (st.phase === 'intro' || st.phase === 'talk') return inGame();
      if (st.phase === 'night') return inGame();
      if (st.phase === 'vote') return inGame().filter((id) => !st.noVote.has(id));
      if (st.phase === 'lastGuess') return [st.lastGuessBy];
      return [];
    }

    function nightDone(id) {
      if (!st.room.has(id)) return false;
      const role = roles.get(id);
      if (role === 'thief') return st.move.has(id);
      if (role === 'detective' && detectiveCanAct()) return st.investigate.has(id);
      if (role === 'bodyguard') return st.guard.has(id);
      return true;
    }

    function isDone(id) {
      if (st.phase === 'night') return nightDone(id);
      if (st.phase === 'vote') return st.votes.has(id);
      return st.ready.has(id);
    }

    // ---- Resolving phases ---------------------------------------------------
    function resolveNight() {
      // Fill in anyone who didn't choose in time.
      for (const id of inGame()) {
        if (!st.room.has(id)) st.room.set(id, pick(ROOMS).id);
        if (roles.get(id) === 'thief' && !st.move.has(id)) st.move.set(id, 'lie');
      }
      const guarded = new Set(st.guard.values());
      const log = { night: st.night, stolen: [], foiled: [] };

      // Who was where (each phone learns only its own room).
      for (const id of inGame()) {
        const others = inGame().filter((o) => o !== id && st.room.get(o) === st.room.get(id));
        st.lastSeen.set(id, others.map(name));
        const r = roomById.get(st.room.get(id));
        note(id, `Night ${st.night}: ${r.label}`, others.length ? `With ${others.map(name).join(', ')}` : 'You were alone.', r.color);
      }

      for (const id of thievesLeft()) {
        const move = st.move.get(id);
        const roomId = st.room.get(id);
        const r = roomById.get(roomId);
        if (move === 'steal') {
          if (guarded.has(roomId)) {
            log.foiled.push(roomId);
            note(id, 'Foiled!', `The ${r.label} was guarded. No gem.`, ROLES.thief.color);
            continue;
          }
          st.gems++;
          log.stolen.push(roomId);
          // Witnesses: guests in the same room get a fuzzy clue (the thief + one decoy).
          const witnesses = inGame().filter((o) => o !== id && st.room.get(o) === roomId && roles.get(o) !== 'thief');
          for (const w of witnesses) {
            const decoys = inGame().filter((o) => o !== id && o !== w);
            const pair = shuffle([id, pick(decoys)].filter(Boolean));
            note(w, 'Evidence: a gem vanished in your room', `It was ${pair.map(name).join(' or ')}.`, '#ffc93c');
          }
          // Nobody saw it: a random guest finds a dropped glove instead (true evidence).
          if (!witnesses.length) glove(id);
        } else if (move.startsWith('plant:')) {
          const target = move.slice(6);
          if (inGame().includes(target)) {
            glove(target); // looks exactly like real evidence
            // glove() flags it for the TV exactly like real evidence
          }
        }
      }

      // Detective
      for (const [det, target] of st.investigate) {
        const thief = roles.get(target) === 'thief';
        note(det, `Investigation: ${name(target)}`, thief ? 'is a THIEF.' : 'is not a Thief.', thief ? ROLES.thief.color : ROLES.detective.color);
      }
      for (const [bg, roomId] of st.guard) note(bg, `You guarded the ${roomById.get(roomId).label}`, log.foiled.includes(roomId) ? 'You stopped a theft!' : 'Quiet night.', ROLES.bodyguard.color);

      st.nightLog.push(log);
      if (st.gems >= gemsToWin) return win('thieves', `The Thieves stole ${st.gems} gems.`);
      enter('reveal');
    }

    function glove(ofId) {
      const finders = inGame().filter((o) => o !== ofId && roles.get(o) !== 'thief');
      const finder = pick(finders);
      if (!finder) return;
      note(finder, 'Evidence: you found a glove', `It belongs to ${name(ofId)}.`, '#ffc93c');
      st.gloveFound = true; // the TV says "evidence turned up", never whether it was planted
    }

    function resolveVote() {
      st.lastVotes = [...st.votes].map(([voter, target]) => ({ voter, target }));
      const tally = new Map();
      for (const t of st.votes.values()) if (t !== 'nobody') tally.set(t, (tally.get(t) ?? 0) + 1);
      const sorted = [...tally].sort((a, b) => b[1] - a[1]);
      const top = sorted[0];
      const tie = sorted[1] && sorted[1][1] === top?.[1];
      st.noVote.clear();
      if (!top || top[1] < 2 || tie) {
        st.verdict = { nobody: true, reason: !top ? 'Nobody was accused.' : tie ? 'The vote was tied.' : 'Not enough votes.' };
      } else {
        const [id] = top;
        st.out.add(id);
        const wasThief = roles.get(id) === 'thief';
        st.verdict = { id, role: roles.get(id), wasThief };
        if (!wasThief) for (const [voter, t] of st.votes) if (t === id) st.noVote.add(voter);
        if (!wasThief) for (const voter of st.noVote) note(voter, 'You accused an innocent', 'You lose your vote next round.', '#8a93a8');
      }
      enter('verdict');
    }

    function afterVerdict() {
      const v = st.verdict;
      if (v && !v.nobody && v.wasThief && thievesLeft().length === 0) {
        if (roster.some((id) => roles.get(id) === 'detective')) {
          st.lastGuessBy = v.id;
          return enter('lastGuess');
        }
        return win('guests', 'Every Thief was caught.');
      }
      if (thievesLeft().length >= inGame().length - thievesLeft().length) return win('thieves', 'The Thieves outnumber the guests.');
      if (st.night >= MAX_NIGHTS) return win('thieves', 'Dawn broke and the Thieves slipped away.');
      enter('night');
    }

    function resolveLastGuess() {
      const g = st.guess;
      if (g && roles.get(g) === 'detective') win('thieves', `${name(st.lastGuessBy)} unmasked the Detective (${name(g)}) on the way out!`);
      else win('guests', g ? `Every Thief was caught. The last guess (${name(g)}) was wrong.` : 'Every Thief was caught.');
    }

    function win(team, reason) {
      st.winner = team;
      st.winReason = reason;
      st.phase = 'end';
      st.left = 9;
    }

    function advance() {
      switch (st.phase) {
        case 'intro': return enter('night');
        case 'night': st.gloveFound = false; return resolveNight();
        case 'reveal': return enter('talk');
        case 'talk': return enter('vote');
        case 'vote': return resolveVote();
        case 'verdict': return afterVerdict();
        case 'lastGuess': return resolveLastGuess();
        case 'end': st.over = true;
      }
    }

    // ---- Phone screens ----------------------------------------------------
    function roleTag(id) {
      const r = ROLES[roles.get(id)];
      return { label: r.label, color: r.color };
    }

    function notesCards(id, max = 4) {
      return st.privateNotes.get(id).slice(0, max);
    }

    function others(id) {
      return inGame().filter((o) => o !== id).map((o) => ({ id: o, label: name(o), color: color(o) }));
    }

    function screenFor(id) {
      if (!roster.includes(id)) return { title: 'Game in progress', lines: ['You can join the next game. Watch the TV!'] };
      const role = roles.get(id);
      const tag = roleTag(id);
      const out = st.out.has(id);
      const waiting = () => {
        const left = needed().filter((o) => !isDone(o)).length;
        return left ? `Waiting for ${left} more…` : '';
      };

      if (st.phase === 'end') {
        const won = ROLES[role].team === st.winner;
        return { title: won ? 'You won!' : 'You lost', tag, lines: [st.winReason] };
      }

      if (st.phase === 'intro') {
        const lines = [ROLES[role].blurb];
        if (role === 'thief') {
          const mates = roster.filter((o) => o !== id && roles.get(o) === 'thief').map(name);
          lines.push(mates.length ? `Your partner: ${mates.join(', ')}.` : 'You work alone.');
        }
        lines.push(`Thieves need ${gemsToWin} gems. Dawn comes after night ${MAX_NIGHTS}.`, 'Keep your screen hidden!');
        return {
          title: 'Your secret role', tag, lines,
          actions: [{ key: 'ready', label: st.ready.has(id) ? 'Ready ✓' : "Got it, I'm ready", disabled: st.ready.has(id) }],
          footer: waiting(),
        };
      }

      if (st.phase === 'lastGuess') {
        if (id === st.lastGuessBy) {
          return { title: 'Last guess!', tag, lines: ['Name the Detective. Get it right and the Thieves win.'], choose: { key: 'guess', options: roster.filter((o) => o !== id && !st.out.has(o)).map((o) => ({ id: o, label: name(o), color: color(o) })) }, footer: `${st.left}s` };
        }
        return { title: 'Last guess…', tag, lines: [`${name(st.lastGuessBy)} is guessing who the Detective is. Poker face!`] };
      }
      if (out) {
        return { title: 'Escorted out', tag, lines: ['You can watch, but no talking about your role!'], cards: notesCards(id), footer: '' };
      }

      if (st.phase === 'night') {
        // Step 1: room. Step 2: your role's move.
        if (!st.room.has(id)) {
          return {
            title: `Night ${st.night}`, tag,
            lines: ['Where do you spend the night?'],
            choose: { key: 'room', options: ROOMS.map((r) => ({ id: r.id, label: r.label, color: r.color })) },
            footer: `${st.left}s`,
          };
        }
        const here = roomById.get(st.room.get(id)).label;
        const back = { key: 'changeRoom', label: `Change room (${here})`, style: 'secondary' };
        if (role === 'thief' && !st.move.has(id)) {
          return {
            title: `Night ${st.night}`, tag, lines: [`You're in the ${here}. What's the plan?`],
            choose: {
              key: 'move',
              options: [
                { id: 'steal', label: 'Steal a gem', sub: 'Anyone in your room may notice. Fails if the room is guarded.' },
                { id: 'lie', label: 'Lie low', sub: 'Do nothing suspicious tonight.' },
                ...others(id).filter((o) => roles.get(o.id) !== 'thief').map((o) => ({ id: `plant:${o.id}`, label: `Plant evidence on ${o.label}`, sub: 'A guest finds "their" glove.', color: o.color })),
              ],
            },
            actions: [back],
          };
        }
        if (role === 'detective' && detectiveCanAct() && !st.investigate.has(id)) {
          return { title: `Night ${st.night}`, tag, lines: [`You're in the ${here}. Who do you investigate?`], choose: { key: 'investigate', options: others(id) }, actions: [back] };
        }
        if (role === 'bodyguard' && !st.guard.has(id)) {
          return { title: `Night ${st.night}`, tag, lines: [`You're in the ${here}. Which room do you guard?`], choose: { key: 'guard', options: ROOMS.map((r) => ({ id: r.id, label: r.label, color: r.color })) }, actions: [back] };
        }
        const extra = role === 'detective' && !detectiveCanAct() ? ' You rest tonight (you investigate every other night).' : '';
        return { title: `Night ${st.night}`, tag, lines: [`You're in the ${here}. Sleep tight.${extra}`], actions: [back], footer: waiting() };
      }

      if (st.phase === 'reveal') {
        return { title: 'Morning', tag, lines: ['What you know:'], cards: notesCards(id), footer: 'Look at the TV' };
      }

      if (st.phase === 'talk') {
        const s = { title: 'Discuss!', tag, lines: ['Share what you saw (or lie about it).'], cards: notesCards(id, 6) };
        if (role === 'gossip') {
          const leftMsgs = GOSSIP_MAX_PER_TALK - st.gossipCount;
          s.lines.push(leftMsgs > 0 ? `Anonymous messages left today: ${leftMsgs}` : 'No anonymous messages left today.');
          if (leftMsgs > 0) s.input = { key: 'gossip', placeholder: 'Post anonymously on the TV', maxLength: 80, submitLabel: 'Post' };
        }
        s.actions = [{ key: 'ready', label: st.ready.has(id) ? 'Waiting to vote ✓' : 'Ready to vote', disabled: st.ready.has(id) }];
        s.footer = waiting();
        return s;
      }

      if (st.phase === 'vote') {
        if (st.noVote.has(id)) return { title: 'Vote', tag, lines: ['You lost your vote this round.'], footer: waiting() };
        return {
          title: 'Vote', tag, lines: ['Who should be escorted out? Votes are revealed together.'],
          choose: { key: 'vote', selected: st.votes.get(id), options: [...others(id), { id: 'nobody', label: 'Nobody', sub: 'Skip this round' }] },
          footer: waiting(),
        };
      }

      if (st.phase === 'verdict') {
        const v = st.verdict;
        return { title: v.nobody ? 'Nobody leaves' : `${name(v.id)} is out`, tag, lines: [v.nobody ? v.reason : `${name(v.id)} was ${['thief', 'guest'].includes(v.role) ? 'a' : 'the'} ${ROLES[v.role].label}.`] };
      }

      return { title: '…', tag };
    }

    let acc = 0;
    return {
      update(dt) {
        acc += dt;
        while (acc >= 1) {
          acc -= 1;
          st.left = Math.max(0, st.left - 1);
        }
        if (st.over) return;
        const need = needed();
        const allDone = need.length > 0 && need.every(isDone);
        if (st.left <= 0 || allDone) advance();
      },

      onAction(id, { key, value }) {
        if (!roster.includes(id) || st.phase === 'end') return;
        const role = roles.get(id);
        const out = st.out.has(id);
        const isOther = (t) => t !== id && inGame().includes(t);

        if (key === 'ready' && ['intro', 'talk'].includes(st.phase) && (st.phase === 'intro' || !out)) st.ready.add(id);
        // The caught Thief is already out, but still makes the last guess.
        if (st.phase === 'lastGuess' && key === 'guess' && id === st.lastGuessBy && roster.includes(value) && value !== id && !st.out.has(value)) {
          st.guess = value;
          resolveLastGuess();
        }
        if (out) return;

        if (st.phase === 'night') {
          if (key === 'room' && roomById.has(value)) st.room.set(id, value);
          if (key === 'changeRoom') st.room.delete(id);
          if (key === 'move' && role === 'thief') {
            const ok = value === 'steal' || value === 'lie' || (value?.startsWith('plant:') && isOther(value.slice(6)) && roles.get(value.slice(6)) !== 'thief');
            if (ok) st.move.set(id, value);
          }
          if (key === 'investigate' && role === 'detective' && detectiveCanAct() && isOther(value)) st.investigate.set(id, value);
          if (key === 'guard' && role === 'bodyguard' && roomById.has(value)) st.guard.set(id, value);
          if (key === 'changeRoom') {
            st.move.delete(id);
            st.investigate.delete(id);
            st.guard.delete(id);
          }
        }
        if (st.phase === 'talk' && key === 'gossip' && role === 'gossip' && value && st.gossipCount < GOSSIP_MAX_PER_TALK) {
          st.gossip.push(value.slice(0, 80));
          st.gossipCount++;
        }
        if (st.phase === 'vote' && key === 'vote' && !st.noVote.has(id) && (value === 'nobody' || isOther(value))) st.votes.set(id, value);
      },

      snapshot() {
        const done = new Set(needed().filter(isDone));
        const nightLog = st.nightLog.at(-1);
        return {
          phase: st.phase,
          left: st.left,
          night: st.night,
          maxNights: MAX_NIGHTS,
          gems: st.gems,
          gemsToWin,
          thieves: roster.filter((id) => roles.get(id) === 'thief').length,
          rooms: ROOMS,
          players: roster.map((id) => ({
            id, name: name(id), color: color(id), connected: players.get(id)?.connected ?? false,
            out: st.out.has(id),
            role: st.out.has(id) || st.phase === 'end' ? roles.get(id) : null,
            done: done.has(id),
            noVote: st.noVote.has(id),
          })),
          last: st.phase === 'reveal' && nightLog ? { ...nightLog, evidence: !!st.gloveFound } : null,
          gossip: st.gossip,
          votes: ['verdict'].includes(st.phase) ? st.lastVotes : null,
          verdict: ['verdict', 'lastGuess'].includes(st.phase) ? st.verdict : null,
          lastGuessBy: st.phase === 'lastGuess' ? st.lastGuessBy : null,
          winner: st.winner,
          winReason: st.winReason,
          roleInfo: Object.fromEntries(Object.entries(ROLES).map(([k, r]) => [k, { label: r.label, color: r.color }])),
        };
      },

      playerView(id) {
        return { status: '', screen: screenFor(id) };
      },

      isOver: () => st.over,

      results() {
        const label = st.winner === 'thieves' ? 'The Thieves win!' : st.winner === 'guests' ? 'The guests win!' : 'Game ended';
        return {
          title: label,
          standings: roster
            .map((id) => ({ id, name: name(id), color: color(id), won: ROLES[roles.get(id)].team === st.winner, role: ROLES[roles.get(id)].label }))
            .sort((a, b) => b.won - a.won)
            .map(({ id, name, color, won, role }) => ({ id, name: `${name} · ${role}`, color, score: won ? 'Won' : '' })),
        };
      },
    };
  },
};

function assignRoles(ids) {
  const n = ids.length;
  const deck = ['thief', 'detective'];
  if (n >= 6) deck.push('thief');
  if (n >= 5) deck.push('bodyguard');
  if (n >= 6) deck.push('gossip');
  while (deck.length < n) deck.push('guest');
  const shuffled = shuffle(deck);
  return new Map(ids.map((id, i) => [id, shuffled[i]]));
}

function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(a) {
  return a.length ? a[Math.floor(Math.random() * a.length)] : undefined;
}
