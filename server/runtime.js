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

// The Mac app's menu bar icon. A Node single executable can't draw any UI itself, and a .app
// that shows nothing leaves people unsure whether it's running and with no way to quit it. So
// when the app is opened from Finder, a small menu bar item (JavaScript for Automation run by
// the osascript that ships with macOS) stays up while it runs: the phone address, "Open TV Page",
// "Copy Phone Link" and "Quit Couchcade". It never takes focus or blocks the screen.
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

const children = new Set();
process.on('exit', () => children.forEach((c) => c.kill()));

/** Start osascript with a script and string arguments (passed as argv, so nothing needs escaping). Null if it can't start. */
function osascript(flags, script, args) {
  let child;
  try {
    child = spawn('osascript', [...flags, '-e', script, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
  children.add(child);
  child.on('exit', () => children.delete(child));
  return child;
}

/** Run an AppleScript to the end. Resolves to its output, or null on error. */
function appleScript(lines, args) {
  return new Promise((resolve) => {
    const child = osascript([], ['on run argv', ...lines, 'end run'].join('\n'), args);
    if (!child) return resolve(null);
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', () => resolve(null));
    child.on('exit', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

// The menu bar item. It reports back one word per line on stdout: "ready" once the icon is up,
// then "open" or "quit" when those menu items are picked. Copying the link happens in the script.
const MENU_BAR_SCRIPT = `
function run(argv) {
  ObjC.import('Cocoa');
  const joinUrl = argv[0];
  const out = $.NSFileHandle.fileHandleWithStandardOutput;
  const say = (word) => out.writeData($(word + '\\n').dataUsingEncoding($.NSUTF8StringEncoding));
  const app = $.NSApplication.sharedApplication;
  app.setActivationPolicy($.NSApplicationActivationPolicyAccessory); // no Dock icon, never steals focus

  ObjC.registerSubclass({
    name: 'CouchcadeMenuTarget',
    methods: {
      'openTV:': { types: ['void', ['id']], implementation: () => say('open') },
      'copyLink:': {
        types: ['void', ['id']],
        implementation: () => {
          const board = $.NSPasteboard.generalPasteboard;
          board.clearContents;
          board.setStringForType($(joinUrl), $.NSPasteboardTypeString);
        },
      },
      'quit:': { types: ['void', ['id']], implementation: () => say('quit') },
    },
  });
  const target = $.CouchcadeMenuTarget.alloc.init;

  const item = $.NSStatusBar.systemStatusBar.statusItemWithLength($.NSVariableStatusItemLength);
  let icon = null;
  try { icon = $.NSImage.imageWithSystemSymbolNameAccessibilityDescription('gamecontroller.fill', 'Couchcade'); } catch (e) {}
  if (icon && !icon.isNil()) {
    icon.setTemplate(true);
    item.button.image = icon;
  } else {
    item.button.title = 'Couchcade';
  }
  item.button.toolTip = 'Couchcade is running';

  const menu = $.NSMenu.alloc.init;
  menu.autoenablesItems = false;
  const add = (title, action, key) => {
    const entry = $.NSMenuItem.alloc.initWithTitleActionKeyEquivalent(title, action || null, key || '');
    if (action) entry.target = target;
    else entry.enabled = false;
    menu.addItem(entry);
  };
  add('Couchcade is running');
  add('Phones join: ' + joinUrl);
  menu.addItem($.NSMenuItem.separatorItem);
  add('Open TV Page', 'openTV:', 't');
  add('Copy Phone Link', 'copyLink:', 'c');
  menu.addItem($.NSMenuItem.separatorItem);
  add('Quit Couchcade', 'quit:', 'q');
  item.menu = menu;

  say('ready');
  app.run;
}
`;

/**
 * Show the menu bar icon until the person quits. If it can't start (osascript missing, or a
 * macOS that won't run it), fall back to a one-time dialog that can be dismissed for good.
 * If the icon goes away without Quit (osascript killed), it's put back, a few times at most.
 */
export async function showMacWindow({ tvUrl, joinUrl, onQuit }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await new Promise((resolve) => {
      const child = osascript(['-l', 'JavaScript'], MENU_BAR_SCRIPT, [joinUrl]);
      if (!child) return resolve('failed');
      let ready = false;
      let buffer = '';
      child.stdout.on('data', (d) => {
        buffer += d;
        let nl;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const word = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (word === 'ready') ready = true;
          else if (word === 'open') openBrowser(tvUrl);
          else if (word === 'quit') return resolve('quit');
        }
      });
      child.on('error', () => resolve('failed'));
      child.on('exit', () => resolve(ready ? 'gone' : 'failed'));
    });
    if (result === 'quit') return onQuit();
    if (result === 'failed') break;
  }
  await showFallbackDialog({ tvUrl, joinUrl, onQuit });
}

/** The fallback: one dialog with the addresses. "Keep Running" closes it; the server goes on. */
async function showFallbackDialog({ tvUrl, joinUrl, onQuit }) {
  const message = `Couchcade is running.\n\nTV screen: ${tvUrl}\nPhones join: ${joinUrl}\n(scan the QR code on the TV; same Wi-Fi)\n\nQuitting ends the games for everyone. To quit later, open Activity Monitor and quit "couchcade".`;
  const answer = await appleScript(
    [
      'display dialog (item 1 of argv) with title "Couchcade" buttons {"Quit Couchcade", "Keep Running"} default button "Keep Running" with icon note',
      'return button returned of result',
    ],
    [message],
  );
  if (answer === 'Quit Couchcade') onQuit();
}

/** A one-off alert, for when the Mac app can't start (nobody would see the terminal message). */
export function showMacAlert(title, message) {
  return appleScript(['activate', 'display alert (item 1 of argv) message (item 2 of argv) as critical buttons {"OK"} default button "OK"'], [title, message]);
}
