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

// The Mac app's window. A Node single executable can't draw a window itself, and a .app that
// shows nothing leaves people unsure whether it's running and with no way to quit it. So when
// the app is opened from Finder, a small native dialog (AppleScript, via the osascript that
// ships with macOS) stays up while it runs: the addresses, "Open TV Page" and "Quit".
const BUNDLE_ID = 'io.github.gautama-bharadwaj.couchcade'; // keep in step with scripts/build-release.mjs

/**
 * True when this is the Mac app opened from Finder or the Dock, rather than its binary run from
 * a terminal or CI. LaunchServices sets __CFBundleIdentifier to the app's own id; a terminal
 * passes on its own (com.apple.Terminal and so on). COUCHCADE_WINDOW=1 / 0 forces it.
 */
export const MAC_WINDOW =
  process.env.COUCHCADE_WINDOW === '1' ||
  (process.env.COUCHCADE_WINDOW !== '0' && process.platform === 'darwin' && Boolean(sea) &&
    (process.env.__CFBundleIdentifier === BUNDLE_ID || (process.ppid === 1 && !process.stdout.isTTY)));

/** Run an AppleScript with string arguments (passed as argv, so nothing needs escaping). Resolves to its output, or null on error. */
function appleScript(lines, args) {
  return new Promise((resolve) => {
    const flags = ['on run argv', ...lines, 'end run'].flatMap((l) => ['-e', l]);
    let out = '';
    let child;
    try {
      child = spawn('osascript', [...flags, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return resolve(null);
    }
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve(null));
    child.on('exit', (code) => resolve(code === 0 ? out.trim() : null));
    windowChild = child;
  });
}
let windowChild = null;
process.on('exit', () => windowChild?.kill());

/**
 * Show the running-app dialog until the person quits. "Open TV Page" reopens the browser and
 * shows the dialog again. If osascript is missing or keeps failing, the server just keeps
 * running without it (the TV page is already open).
 */
export async function showMacWindow({ tvUrl, joinUrl, onQuit }) {
  const message = `Couchcade is running.\n\nTV screen: ${tvUrl}\nPhones join: ${joinUrl}\n(scan the QR code on the TV; same Wi-Fi)\n\nKeep this window open while you play. Quitting ends the games for everyone.`;
  let failures = 0;
  while (failures < 3) {
    const started = Date.now();
    const answer = await appleScript(
      [
        'activate',
        'display dialog (item 1 of argv) with title "Couchcade" buttons {"Quit Couchcade", "Open TV Page"} default button "Open TV Page" with icon note',
        'return button returned of result',
      ],
      [message],
    );
    if (answer === 'Quit Couchcade') return onQuit();
    if (answer === 'Open TV Page') openBrowser(tvUrl);
    else if (Date.now() - started < 5000) failures++; // failed straight away; don't spin
  }
}

/** A one-off alert, for when the Mac app can't start (nobody would see the terminal message). */
export function showMacAlert(title, message) {
  return appleScript(['activate', 'display alert (item 1 of argv) message (item 2 of argv) as critical buttons {"OK"} default button "OK"'], [title, message]);
}
