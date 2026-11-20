#!/usr/bin/env node
// Command-line entry: `npx couchcade`, `couchcade --port 3100`, and the downloadable apps.
// Flags only set the same environment variables `npm start` reads, then start the server, so
// there's one way to configure everything. No argument library: four flags don't need one.

import { readFileSync } from 'node:fs';

const HELP = `Couchcade: party games on the big screen, phones as controllers.

Usage: couchcade [options]

  --port <n>         Port to use (default 3000, or the next free one up to 3010)
  --host-ip <addr>   Address for the QR code, if the one it finds is wrong
  --open             Open the TV page in your browser once it's running
  --no-open          Don't (the downloadable apps open it by default)
  -h, --help         Show this help
  -v, --version      Show the version

Then open http://localhost:<port>/tv on the computer connected to the TV,
and scan the QR code with your phones (same Wi-Fi).

Environment variables work too: PORT, HOST_IP, OPEN_BROWSER=1, LOG_LEVEL,
LOG_FILE, DISABLE_LOG_API=1, TICK_HZ. See the README for details.`;

function version() {
  // The release build bakes the version in; the packaged app has no package.json beside it.
  if (process.env.COUCHCADE_VERSION) return process.env.COUCHCADE_VERSION;
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

function fail(message) {
  console.error(`couchcade: ${message}\nRun couchcade --help for the options.`);
  process.exit(2);
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg.startsWith('-psn_')) continue; // older macOS passes a process serial number to apps opened from Finder
  const eq = arg.indexOf('=');
  const name = eq > 0 ? arg.slice(0, eq) : arg;
  const value = () => {
    const v = eq > 0 ? arg.slice(eq + 1) : args[++i];
    if (v === undefined || v === '') fail(`${name} needs a value`);
    return v;
  };
  switch (name) {
    case '--port': {
      const v = value();
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 65535) fail(`--port must be a number from 1 to 65535, not "${v}"`);
      process.env.PORT = String(n);
      break;
    }
    case '--host-ip':
      process.env.HOST_IP = value();
      break;
    case '--open':
      process.env.OPEN_BROWSER = '1';
      break;
    case '--no-open':
      process.env.OPEN_BROWSER = '0';
      break;
    case '-h':
    case '--help':
      console.log(HELP);
      process.exit(0);
    case '-v':
    case '--version':
      console.log(version());
      process.exit(0);
    default:
      fail(`unknown option ${arg}`);
  }
}

// After the flags are in the environment: the server reads its settings when it loads.
import('../server/index.js');
