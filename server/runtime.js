// How Couchcade was started: from source (npm run dev), or as a packaged app (the downloadable
// .exe / .app / Linux binary, built by scripts/build-release.mjs as a Node single executable).
// A packaged app has no folder to write logs into and nobody watching a terminal, so a few
// defaults differ: logs go to the OS log folder and the TV page opens by itself.

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// node:sea exists from Node 20.12; on older versions the require throws and we're simply not packaged.
// createRequire instead of `import`, so an old Node doesn't refuse to load this file at all.
let sea = null;
try {
  const req = createRequire(import.meta.url);
  const mod = req('node:sea');
  if (mod.isSea()) sea = mod;
} catch {}

/** The node:sea module when running as a single executable, else null. Static files come from here then. */
export const SEA = sea;

/** True for the downloadable apps. COUCHCADE_PACKAGED=1 fakes it, to try the packaged defaults from source. */
export const PACKAGED = Boolean(sea) || process.env.COUCHCADE_PACKAGED === '1';

/** Open a URL in the default browser. Best effort: a headless machine just doesn't open anything. */
export function openBrowser(url) {
  const [cmd, args, extra] =
    process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', `"${url}"`], { windowsVerbatimArguments: true }]
    : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true, ...extra });
    child.on('error', () => {}); // no xdg-open (a server, Docker): the banner still shows the URL
    child.unref();
  } catch {}
}
