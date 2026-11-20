// Logging that stays out of the game's way.
//
//   LOG_LEVEL=info npm run dev     error | warn | info (default) | debug | trace
//   LOG_FILE=off                   don't write a log file (default: write one, see below)
//   LOG_FILE=/some/path.log        write it there instead
//
// Where the file goes by default:
//   - From source (npm run dev): logs/couchcade.log in the project folder, as always.
//   - The downloadable apps, and npx / npm installs: the app folder may be read-only, inside
//     an app bundle or deep in npm's cache, so the per-user log folder of the OS:
//       macOS    ~/Library/Logs/Couchcade/couchcade.log
//       Windows  %LOCALAPPDATA%\Couchcade\logs\couchcade.log
//       Linux    ${XDG_STATE_HOME:-~/.local/state}/couchcade/couchcade.log
//
// Cheap by design:
//   - A call below the current level returns at once. Hot paths guard with `if (log.debugOn)` so
//     they don't even build the message.
//   - Lines are buffered and written together every 250 ms, through an async file stream, so a
//     log call never waits on the disk or the terminal during a tick.
//   - Nothing logs per frame. Repeating problems go through log.every(key, ms), which lets one
//     line through per interval and counts the ones it held back.
//   - If the buffer ever backs up (a stuck disk), new lines are dropped and counted, not queued.
//   - The file rotates at 5 MB (one old copy, couchcade.log.1).
//
// The last few hundred lines are also kept in memory for http://<server>:3000/api/logs.

import { appendFileSync, createWriteStream, mkdirSync, renameSync, statSync, writeSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { PACKAGED } from './runtime.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };
const NAMES = ['ERROR', 'WARN ', 'INFO ', 'DEBUG', 'TRACE'];
const FLUSH_MS = 250;
const MAX_PENDING = 5000; // lines; beyond this we drop rather than eat memory
const RECENT = 300; // lines kept for /api/logs
const ROTATE_BYTES = 5 * 1024 * 1024;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envLevel = String(process.env.LOG_LEVEL ?? 'info').toLowerCase();
const level = LEVELS[envLevel] ?? LEVELS.info;
const INSTALLED = PACKAGED || ROOT.split(path.sep).includes('node_modules');
const filePath =
  process.env.LOG_FILE === 'off' ? null
  : process.env.LOG_FILE ? path.resolve(INSTALLED ? process.cwd() : ROOT, process.env.LOG_FILE)
  : INSTALLED ? userLogFile()
  : path.join(ROOT, 'logs', 'couchcade.log');

function userLogFile() {
  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Logs', 'Couchcade', 'couchcade.log');
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Couchcade', 'logs', 'couchcade.log');
  }
  return path.join(process.env.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'couchcade', 'couchcade.log');
}

let pending = [];
let flushTimer = null;
let dropped = 0;
let stream = null;
let fileBytes = 0;
const recent = [];
const gates = new Map(); // key -> { next, held } for log.every

function openFile() {
  if (!filePath) return;
  try {
    mkdirSync(path.dirname(filePath), { recursive: true });
    fileBytes = statSync(filePath, { throwIfNoEntry: false })?.size ?? 0;
    stream = createWriteStream(filePath, { flags: 'a' });
    stream.on('error', (err) => {
      process.stderr.write(`log file disabled: ${err.message}\n`);
      stream = null;
    });
  } catch (err) {
    process.stderr.write(`log file disabled: ${err.message}\n`);
    stream = null;
  }
}
openFile();

function rotate() {
  try {
    stream?.end();
    renameSync(filePath, `${filePath}.1`);
  } catch {
    // Rotation is best effort; keep logging to whatever we have.
  }
  openFile();
}

function flush() {
  flushTimer = null;
  if (!pending.length && !dropped) return;
  if (dropped) {
    pending.push(format(1, 'log', `dropped ${dropped} lines (logging fell behind)`));
    dropped = 0;
  }
  const out = pending.join('');
  pending = [];
  process.stdout.write(out);
  if (stream) {
    stream.write(out);
    fileBytes += out.length;
    if (fileBytes > ROTATE_BYTES) rotate();
  }
}

/** Write everything now, synchronously. Only for shutdown and crashes. */
function flushSync() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  const out = pending.join('');
  pending = [];
  if (!out) return;
  try {
    writeSync(1, out);
  } catch {}
  if (stream) {
    try {
      // The async stream may still hold a few earlier lines, so the very last lines can land out of order. Fine for a crash note.
      appendFileSync(filePath, out);
    } catch {}
  }
}

function format(lvl, tag, msg, extra) {
  let line = `${new Date().toISOString()} ${NAMES[lvl]} [${tag}] ${msg}`;
  if (extra !== undefined) {
    if (extra instanceof Error) line += `\n${extra.stack ?? extra.message}`;
    else {
      try {
        line += ` ${JSON.stringify(extra)}`;
      } catch {
        line += ' [unserializable]';
      }
    }
  }
  return line + '\n';
}

function write(lvl, tag, msg, extra) {
  if (lvl > level) return;
  const line = format(lvl, tag, msg, extra);
  recent.push(line);
  if (recent.length > RECENT) recent.shift();
  if (pending.length >= MAX_PENDING) {
    dropped++;
    return;
  }
  pending.push(line);
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_MS);
    flushTimer.unref();
  }
}

export const log = {
  level: Object.keys(LEVELS)[level],
  file: filePath,
  /** True when debug lines are kept. Check it before building an expensive message. */
  debugOn: level >= LEVELS.debug,
  traceOn: level >= LEVELS.trace,

  error: (tag, msg, extra) => write(0, tag, msg, extra),
  warn: (tag, msg, extra) => write(1, tag, msg, extra),
  info: (tag, msg, extra) => write(2, tag, msg, extra),
  debug: (tag, msg, extra) => write(3, tag, msg, extra),
  trace: (tag, msg, extra) => write(4, tag, msg, extra),

  /**
   * Sampling for things that can repeat many times a second. Returns 0 if this key already
   * logged within the last `ms`; otherwise returns how many calls were held back plus one,
   * so the caller can say "(and 12 more)".
   *   const n = log.every('slow-tick', 5000); if (n) log.warn('tick', `slow tick (${n - 1} more)`);
   */
  every(key, ms) {
    const now = Date.now();
    const g = gates.get(key);
    if (g && now < g.next) {
      g.held++;
      return 0;
    }
    const held = g?.held ?? 0;
    gates.set(key, { next: now + ms, held: 0 });
    return held + 1;
  },

  /** The last few hundred lines, oldest first. */
  recent: () => recent.join(''),

  flushSync,
};

process.on('exit', flushSync);
