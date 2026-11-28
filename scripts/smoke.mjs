// Smoke test: starts Couchcade for real and pokes it from outside, the way a TV and a phone would.
// No test framework and no extra dependencies, so it runs anywhere Couchcade runs.
//
//   npm run check                                    the source tree (node bin/couchcade.js)
//   node scripts/smoke.mjs --cmd dist/release/couchcade-linux-x64   a packaged build
//   node scripts/smoke.mjs --port 3200               if 3123 is taken on your machine
//
// Checks: pages and game scripts are served (and nothing outside public/), join info and the
// address switch, /api/logs, a TV and a phone over WebSocket, a game's how-to-play intro, a busy PORT stops with a clear
// message, and without PORT a busy 3000 falls back to the next free port.

import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const CMD = opt('--cmd') ? [path.resolve(opt('--cmd'))] : [process.execPath, path.join(ROOT, 'bin', 'couchcade.js')];
const TEST_PORT = Number(opt('--port') ?? 3123);
const NOT_OURS = '203.0.113.250'; // TEST-NET-3: never one of this machine's addresses

const running = new Set();
let failures = 0;

function ok(cond, what, detail = '') {
  if (cond) console.log(`ok    ${what}`);
  else {
    failures++;
    console.log(`FAIL  ${what}${detail ? `: ${detail}` : ''}`);
  }
}

/** Start Couchcade with these env overrides (undefined deletes a variable) and arguments. */
function launch(envOverrides = {}, args = []) {
  const env = { ...process.env, LOG_FILE: 'off', OPEN_BROWSER: '0', ...envOverrides };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete env[k];
  const child = spawn(CMD[0], [...CMD.slice(1), ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (d) => (output += d));
  child.stderr.on('data', (d) => (output += d));
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  running.add(child);
  exited.then(() => running.delete(child));
  return { child, exited, output: () => output };
}

/** The port from the startup banner, or throws with the output so far. */
async function bannerPort(proc, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const m = proc.output().match(/TV screen:\s+http:\/\/localhost:(\d+)\/tv/);
    if (m) return Number(m[1]);
    if (proc.child.exitCode !== null) break;
    await sleep(100);
  }
  throw new Error(`server didn't start. Output:\n${proc.output()}`);
}

async function stop(proc) {
  if (proc.child.exitCode !== null) return;
  proc.child.kill();
  await Promise.race([proc.exited, sleep(5000)]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with the path sent exactly as given (fetch would tidy up "/../"). */
function get(port, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: urlPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => (body += d));
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'] ?? '', body }));
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error(`GET ${urlPath} timed out`)));
  });
}

/** A WebSocket client: send(obj), and next(type) resolves with the next message of that type. */
async function wsClient(port) {
  const WS = globalThis.WebSocket ?? (await import('ws')).default; // Node 20 has no global WebSocket
  const ws = new WS(`ws://127.0.0.1:${port}/ws`);
  const waiting = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    const i = waiting.findIndex((w) => w.type === msg.t);
    if (i !== -1) waiting.splice(i, 1)[0].resolve(msg);
  };
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(new Error(`websocket error: ${e.message ?? e.type}`));
  });
  return {
    send: (obj) => ws.send(JSON.stringify(obj)),
    next: (type, ms = 5000) =>
      new Promise((resolve, reject) => {
        const w = { type, resolve };
        waiting.push(w);
        setTimeout(() => {
          if (waiting.includes(w)) reject(new Error(`no '${type}' message within ${ms / 1000} s`));
        }, ms);
      }),
    close: () => ws.close(),
  };
}

/** Hold a port like another app would. Resolves to a close function, or null if it's already taken. */
function occupy(port) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', () => resolve(null));
    s.listen(port, '0.0.0.0', () => resolve(() => new Promise((r) => s.close(r))));
  });
}

async function main() {
  console.log(`Smoke testing: ${CMD.map((c) => (c === process.execPath ? 'node' : path.relative(ROOT, c))).join(' ')}\n`);

  // --help prints usage and exits without starting anything.
  const help = launch({}, ['--help']);
  ok((await help.exited) === 0 && /Usage/.test(help.output()), '--help prints usage');

  // A normal run on an explicit port.
  const main = launch({ PORT: String(TEST_PORT) });
  const port = await bannerPort(main);
  ok(port === TEST_PORT, `listens on PORT=${TEST_PORT}`, `got ${port}`);

  for (const [p, type, contains] of [
    ['/', 'text/html', 'controller'],
    ['/tv', 'text/html', '/tv/tv.js'],
    ['/tv/tv.js', 'text/javascript', 'renderers'],
    ['/tv/games/bumper.js', 'text/javascript', ''],
    ['/controller/controller.js', 'text/javascript', 'WebSocket'],
  ]) {
    const r = await get(port, p);
    ok(r.status === 200 && r.type.startsWith(type) && r.body.includes(contains), `GET ${p}`, `${r.status} ${r.type}`);
  }
  ok((await get(port, '/no-such-file.js')).status === 404, 'missing file is 404');
  for (const p of ['/../package.json', '/tv/../../server/index.js', '/%2e%2e/package.json']) {
    ok((await get(port, p)).status === 404, `nothing outside public/ (${p})`);
  }

  const infoRes = await get(port, '/api/join-info');
  const info = JSON.parse(infoRes.body);
  ok(infoRes.status === 200 && info.url.endsWith(`:${port}/`) && info.qrSvg.startsWith('<svg') && Array.isArray(info.candidates), '/api/join-info', infoRes.body.slice(0, 120));
  console.log(`      join address ${info.address}; candidates: ${info.candidates.map((c) => `${c.address} (${c.name})`).join(', ') || 'none'}`);
  const last = info.candidates.at(-1);
  if (last) {
    const r = await get(port, `/api/join-info?ip=${encodeURIComponent(last.address)}`);
    ok(r.status === 200 && JSON.parse(r.body).url === last.url, `/api/join-info?ip=${last.address} switches the QR`);
  } else console.log('skip  /api/join-info?ip= (no network address on this machine)');
  ok((await get(port, `/api/join-info?ip=${NOT_OURS}`)).status === 400, '/api/join-info?ip= refuses other hosts');
  ok((await get(port, '/api/logs')).status === 200, '/api/logs');

  const tv = await wsClient(port);
  let next = tv.next('phase');
  tv.send({ t: 'hello', role: 'tv' });
  const phase = await next;
  ok(phase.phase === 'lobby' && phase.games.length > 0, 'TV websocket gets the lobby');
  ok(phase.tabs?.length > 0 && phase.games.every((g) => phase.tabs.some((t) => t.id === g.tab)), 'every game is in a picker tab');

  // A phone opening https:// on the http port: the TV is told so it can explain the fix.
  next = tv.next('httpsTried');
  const secure = tls.connect({ port, host: '127.0.0.1', rejectUnauthorized: false });
  secure.on('error', () => {});
  ok(await Promise.race([next.then(() => true), sleep(5000).then(() => false)]), 'an https:// attempt tells the TV');
  secure.destroy();
  ok((await get(port, '/')).status === 200, 'plain http still works after it');

  const phone = await wsClient(port);
  next = phone.next('welcome');
  phone.send({ t: 'hello', role: 'player', name: 'Smoke' });
  const welcome = await next;
  ok(welcome.name === 'Smoke' && welcome.token, 'phone websocket joins');

  // One round of Bumper Arena with a bot, driven from the TV: proves the game code and the
  // tick loop run (in a packaged build too), then end it again.
  tv.send({ t: 'addBot' });
  tv.send({ t: 'select', gameId: 'bumper' });
  tv.send({ t: 'start' });
  const state = await tv.next('state');
  ok(state.gameId === 'bumper' && state.data, 'a game starts and the TV gets snapshots');
  next = tv.next('phase');
  tv.send({ t: 'end' });
  ok((await next).phase !== 'playing', 'the TV can end the game');

  // A game with rules opens with them, paused; only the host or TV can step or skip them.
  const guest = await wsClient(port);
  next = guest.next('welcome');
  guest.send({ t: 'hello', role: 'player', name: 'Guest' });
  await next;
  await sleep(200); // let the join's phase message pass
  tv.send({ t: 'select', gameId: 'fuse' });
  await sleep(200);
  next = tv.next('phase');
  tv.send({ t: 'start' });
  let p = await next;
  ok(p.phase === 'playing' && p.intro?.step === 0 && p.rules?.length > 0, 'a game with rules opens with them');
  next = guest.next('error');
  guest.send({ t: 'rules', do: 'skip' });
  ok(/host/.test((await next).message), 'a guest cannot skip the rules');
  next = tv.next('phase');
  phone.send({ t: 'rules', do: 'next' });
  ok((await next).intro?.step === 1, 'the host steps through the rules');
  next = tv.next('phase');
  phone.send({ t: 'rules', do: 'skip' });
  p = await next;
  ok(p.phase === 'playing' && !p.intro, 'the host skips the rules');
  next = tv.next('phase');
  tv.send({ t: 'rules', do: 'show' });
  ok((await next).intro?.step === 0, 'the TV replays the rules mid-game');
  next = tv.next('phase');
  tv.send({ t: 'end' });
  ok((await next).phase !== 'playing', 'ending during the rules works');
  guest.close();
  tv.close();
  phone.close();

  // An explicit PORT that's busy stops with a message instead of picking another.
  const clash = launch({ PORT: String(TEST_PORT) });
  const clashCode = await Promise.race([clash.exited, sleep(15_000).then(() => 'timeout')]);
  ok(clashCode === 1 && /already in use/.test(clash.output()), 'busy PORT exits with a clear message', `exit ${clashCode}: ${clash.output().trim()}`);
  await stop(clash);
  await stop(main);

  // No PORT and 3000 taken: it moves up to the next free port. DISABLE_LOG_API rides along.
  const release = await occupy(3000);
  const fallback = launch({ PORT: undefined, DISABLE_LOG_API: '1' });
  try {
    const fp = await bannerPort(fallback);
    ok(fp > 3000 && fp <= 3010, 'busy 3000 falls back to 3001-3010', `got ${fp}`);
    ok(/was busy/.test(fallback.output()), 'banner says the port moved');
    ok((await get(fp, '/api/logs')).status === 404, 'DISABLE_LOG_API=1 turns off /api/logs');
    ok(JSON.parse((await get(fp, '/api/join-info')).body).url.endsWith(`:${fp}/`), 'join URL uses the port it got');
  } finally {
    await stop(fallback);
    await release?.();
  }
}

try {
  await main();
} catch (err) {
  failures++;
  console.log(`FAIL  ${err.stack ?? err}`);
} finally {
  for (const child of running) child.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
