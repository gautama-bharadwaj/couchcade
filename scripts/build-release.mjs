// Builds the downloadable app for the OS this runs on, as a Node single executable application
// (https://nodejs.org/api/single-executable-applications.html): one file with Node, the server
// and the web pages inside, so players need nothing installed.
//
//   npm run build:release        needs Node 25.5+ (for --build-sea); CI pins the exact version
//
// Output in dist/release/:
//   macOS    Couchcade-macos-<arch>.zip      a Couchcade.app (ad-hoc signed, not notarized)
//   Windows  Couchcade-windows-<arch>.exe    unsigned
//   Linux    couchcade-linux-<arch>
//
// This is the only build step in the project, and only for releases. Development runs the
// source files directly; esbuild is a devDependency used here and nowhere else.
//
// How it fits together:
//   1. esbuild bundles bin/couchcade.js with server/ and ws/qrcode into one ES module, because
//      a single executable can't load files from node_modules.
//   2. Everything under public/ is embedded as an asset keyed by its path under public/
//      ("tv/tv.js"); server/index.js serves those through node:sea when packaged.
//   3. node --build-sea writes the executable; the platform steps below wrap and sign it.

import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(DIST, 'release');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const { platform, arch } = process;

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 25 || (major === 25 && minor < 5)) {
  console.error(`build-release needs Node 25.5 or newer for --build-sea (this is ${process.version}).`);
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. One ES module. The banner gives bundled CommonJS packages (ws, qrcode) a real `require`
//    for Node built-ins; inside the executable, require() can only load built-ins anyway.
const bundle = path.join(DIST, 'couchcade.mjs');
await build({
  entryPoints: [path.join(ROOT, 'bin', 'couchcade.js')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: `node${major}`,
  // ws tries these optional native speed-ups and carries on without them.
  external: ['bufferutil', 'utf-8-validate'],
  define: { 'process.env.COUCHCADE_VERSION': JSON.stringify(pkg.version) },
  banner: { js: "import { createRequire as __ccRequire } from 'node:module'; const require = __ccRequire(import.meta.url);" },
  logLevel: 'warning',
});

// 2. The web pages, as assets.
const assets = {};
(function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name !== '.DS_Store') assets[path.relative(path.join(ROOT, 'public'), full).split(path.sep).join('/')] = full;
  }
})(path.join(ROOT, 'public'));

// 3. The executable. On macOS, inject into an unsigned copy of node: injecting into a signed
//    binary leaves a broken signature that macOS refuses to run. It's re-signed (ad hoc) below.
const exe = path.join(DIST, platform === 'win32' ? 'couchcade.exe' : 'couchcade');
let baseNode = process.execPath;
if (platform === 'darwin') {
  baseNode = path.join(DIST, 'node-unsigned');
  copyFileSync(process.execPath, baseNode);
  chmodSync(baseNode, 0o755);
  execFileSync('codesign', ['--remove-signature', baseNode], { stdio: 'inherit' });
}
// TODO(windows-signing): node.exe's Authenticode signature is invalid after injection. When a
// code-signing certificate exists, strip it first (`signtool remove /s`) and sign the result
// in the workflow (see .github/workflows/release.yml). Unsigned, it runs after SmartScreen's
// "More info" > "Run anyway".
const seaConfig = path.join(DIST, 'sea-config.json');
writeFileSync(
  seaConfig,
  JSON.stringify(
    {
      main: bundle,
      mainFormat: 'module',
      executable: baseNode,
      output: exe,
      disableExperimentalSEAWarning: true,
      // Code cache and snapshots are tied to the exact build machine; skip them to keep this simple.
      useSnapshot: false,
      useCodeCache: false,
      // A player's NODE_OPTIONS (meant for their own Node projects) shouldn't change how the app runs.
      execArgvExtension: 'none',
      assets,
    },
    null,
    2,
  ),
);
execFileSync(process.execPath, ['--build-sea', seaConfig], { stdio: 'inherit' });

// 4. Package per platform.
let artifact;
if (platform === 'darwin') {
  artifact = path.join(OUT, `Couchcade-macos-${arch}.zip`);
  makeMacApp(exe, artifact);
} else if (platform === 'win32') {
  artifact = path.join(OUT, `Couchcade-windows-${arch}.exe`);
  copyFileSync(exe, artifact);
} else {
  artifact = path.join(OUT, `couchcade-${platform}-${arch}`);
  copyFileSync(exe, artifact);
  chmodSync(artifact, 0o755);
}
console.log(`\nBuilt ${path.relative(ROOT, artifact)} (Couchcade ${pkg.version}, Node ${process.version}, ${Object.keys(assets).length} embedded files)`);
console.log(`Smoke test it with: node scripts/smoke.mjs --cmd ${path.relative(ROOT, platform === 'darwin' ? path.join(DIST, 'Couchcade.app', 'Contents', 'MacOS', 'couchcade') : artifact)}`);

/**
 * A minimal .app: Info.plist plus the executable. It has no window of its own; double-clicking
 * starts the server and opens the TV page in the default browser (see server/runtime.js).
 * NSAppSleepDisabled: with no window, macOS's App Nap would otherwise slow its timers once the
 * browser is in front, and the game's ticks and turn timers would stutter.
 */
function makeMacApp(binary, zipPath) {
  const app = path.join(DIST, 'Couchcade.app');
  const macos = path.join(app, 'Contents', 'MacOS');
  mkdirSync(macos, { recursive: true });
  copyFileSync(binary, path.join(macos, 'couchcade'));
  chmodSync(path.join(macos, 'couchcade'), 0o755);
  writeFileSync(
    path.join(app, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Couchcade</string>
  <key>CFBundleDisplayName</key><string>Couchcade</string>
  <key>CFBundleIdentifier</key><string>io.github.gautama-bharadwaj.couchcade</string>
  <key>CFBundleExecutable</key><string>couchcade</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${pkg.version}</string>
  <key>CFBundleVersion</key><string>${pkg.version}</string>
  <key>LSMinimumSystemVersion</key><string>13.5</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppSleepDisabled</key><true/>
</dict>
</plist>
`,
  );
  // Ad-hoc signature: enough for Apple silicon to run it. Downloaded copies still need
  // System Settings > Privacy & Security > Open Anyway until the app is notarized.
  // TODO(apple-notarization): with a Developer ID certificate, sign with
  //   codesign --force --options runtime --timestamp --sign "Developer ID Application: ..." Couchcade.app
  // (plus an entitlements file allowing JIT for V8), then `xcrun notarytool submit --wait` the
  // zip and `xcrun stapler staple Couchcade.app`. The release workflow has the matching TODO.
  execFileSync('codesign', ['--force', '--sign', '-', path.join(macos, 'couchcade')], { stdio: 'inherit' });
  execFileSync('codesign', ['--force', '--sign', '-', app], { stdio: 'inherit' });
  // ditto keeps the bundle's permissions and signature intact, which plain zip tools may not.
  execFileSync('ditto', ['-c', '-k', '--keepParent', app, zipPath], { stdio: 'inherit' });
}
