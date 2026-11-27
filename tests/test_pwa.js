#!/usr/bin/env node
/**
 * Thungara - PWA & Offline Resilience Test Suite
 * Verifies W3C Web App Manifest standards, Service Worker caching lifecycle,
 * offline fallback contracts, and asset availability.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SW_FILE = path.join(PROJECT_ROOT, 'app', 'sw.js');
const MANIFEST_FILE = path.join(PROJECT_ROOT, 'app', 'manifest.json');
const INDEX_FILE = path.join(PROJECT_ROOT, 'app', 'index.html');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const errors = [];

function check(desc, fn) {
  totalChecks++;
  try {
    fn();
    passedChecks++;
    console.log(`  [PASS] ${desc}`);
  } catch (err) {
    failedChecks++;
    const errMsg = err && err.message ? err.message : String(err);
    console.error(`  [FAIL] ${desc}: ${errMsg}`);
    errors.push({ desc, error: errMsg });
  }
}

console.log('======================================================================');
console.log('   THUNGARA PWA & OFFLINE RESILIENCE TEST SUITE');
console.log('======================================================================\n');

// --- Phase 1: W3C Web App Manifest Standards ---
console.log('--- Phase 1: W3C Web App Manifest Verification ---');

let manifest = null;
check('Manifest file exists and is valid JSON', () => {
  if (!fs.existsSync(MANIFEST_FILE)) throw new Error('manifest.json does not exist');
  manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
});

check('Manifest identity: name, short_name, and description are non-empty', () => {
  if (!manifest.name || typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error('Manifest missing or empty "name"');
  }
  if (!manifest.short_name || typeof manifest.short_name !== 'string' || !manifest.short_name.trim()) {
    throw new Error('Manifest missing or empty "short_name"');
  }
  if (!manifest.description || typeof manifest.description !== 'string' || !manifest.description.trim()) {
    throw new Error('Manifest missing or empty "description"');
  }
});

check('Manifest display and orientation: standalone and valid orientation', () => {
  const validDisplays = ['standalone', 'minimal-ui', 'fullscreen', 'browser'];
  if (!validDisplays.includes(manifest.display)) {
    throw new Error(`Invalid display mode: ${manifest.display}`);
  }
  if (manifest.orientation && typeof manifest.orientation !== 'string') {
    throw new Error(`Invalid orientation: ${manifest.orientation}`);
  }
});

check('Manifest navigation: start_url and scope are properly configured', () => {
  if (!manifest.start_url || !manifest.start_url.startsWith('/')) {
    throw new Error(`start_url must be an absolute path starting with /, got: ${manifest.start_url}`);
  }
  if (!manifest.scope || !manifest.scope.startsWith('/')) {
    throw new Error(`scope must be an absolute path starting with /, got: ${manifest.scope}`);
  }
});

check('Manifest colors: theme_color and background_color are valid hex codes', () => {
  const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!manifest.theme_color || !hexPattern.test(manifest.theme_color)) {
    throw new Error(`Invalid theme_color: ${manifest.theme_color}`);
  }
  if (!manifest.background_color || !hexPattern.test(manifest.background_color)) {
    throw new Error(`Invalid background_color: ${manifest.background_color}`);
  }
});

check('Manifest icons: array contains maskable icon and exists on disk', () => {
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new Error('icons must be a non-empty array');
  }
  const hasMaskable = manifest.icons.some(icon => icon.purpose && icon.purpose.includes('maskable'));
  if (!hasMaskable) {
    throw new Error('Manifest must specify at least one maskable icon for PWA compliance');
  }

  for (const icon of manifest.icons) {
    if (!icon.src) throw new Error('Icon entry missing "src"');
    // Normalize path from root
    const iconRel = icon.src.startsWith('/') ? icon.src.slice(1) : icon.src;
    const iconPath = path.join(PROJECT_ROOT, iconRel);
    if (!fs.existsSync(iconPath)) {
      throw new Error(`Icon file not found on disk: ${iconRel} (${iconPath})`);
    }
    const iconContent = fs.readFileSync(iconPath, 'utf8');
    if (!iconContent.includes('<svg') || !iconContent.includes('</svg>')) {
      throw new Error(`Icon file ${iconRel} is not a valid SVG`);
    }
  }
});

// --- Phase 2: Service Worker Precache Contract ---
console.log('\n--- Phase 2: Service Worker Precache & Asset Integrity ---');

let swContent = '';
check('Service worker file exists and passes V8 syntax check', () => {
  if (!fs.existsSync(SW_FILE)) throw new Error('sw.js does not exist');
  execFileSync(process.execPath, ['--check', SW_FILE], { stdio: 'pipe' });
  swContent = fs.readFileSync(SW_FILE, 'utf8');
});

check('Service worker declares non-empty CACHE_NAME', () => {
  const match = swContent.match(/const\s+CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
  if (!match || !match[1]) {
    throw new Error('CACHE_NAME not found or empty in sw.js');
  }
});

check('All precache ASSETS listed in sw.js exist on disk relative to app/', () => {
  const assetsBlockMatch = swContent.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\];/);
  if (!assetsBlockMatch) throw new Error('const ASSETS array not found in sw.js');

  const assetUrls = assetsBlockMatch[1]
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);

  if (assetUrls.length < 5) {
    throw new Error(`Expected at least 5 precached assets, found ${assetUrls.length}`);
  }

  const appDir = path.dirname(SW_FILE);
  for (const assetUrl of assetUrls) {
    const resolvedPath = path.resolve(appDir, assetUrl);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Precache asset "${assetUrl}" cannot be resolved on disk: ${resolvedPath}`);
    }
  }
});

// --- Phase 3: Service Worker Lifecycle & Offline Defense ---
console.log('\n--- Phase 3: Service Worker Lifecycle & Offline Fallback ---');

check('Install event: skips waiting and caches assets', () => {
  if (!swContent.includes("addEventListener('install'")) {
    throw new Error('sw.js missing install event listener');
  }
  if (!swContent.includes('self.skipWaiting()')) {
    throw new Error('sw.js install event should call self.skipWaiting()');
  }
  if (!swContent.includes('caches.open(CACHE_NAME)')) {
    throw new Error('sw.js install event must open CACHE_NAME');
  }
});

check('Activate event: purges stale caches and claims clients', () => {
  if (!swContent.includes("addEventListener('activate'")) {
    throw new Error('sw.js missing activate event listener');
  }
  if (!swContent.includes('caches.delete')) {
    throw new Error('sw.js activate event must purge old cache versions');
  }
  if (!swContent.includes('self.clients.claim()')) {
    throw new Error('sw.js activate event should claim clients');
  }
});

check('Fetch event: handles GET requests and bypasses streaming media', () => {
  if (!swContent.includes("addEventListener('fetch'")) {
    throw new Error('sw.js missing fetch event listener');
  }
  if (!swContent.includes("event.request.method !== 'GET'")) {
    throw new Error('sw.js should only intercept GET requests');
  }
  if (!swContent.includes('youtube.com') && !swContent.includes('googlevideo.com')) {
    throw new Error('sw.js should bypass heavy streaming media from cache');
  }
});

check('Offline navigation fallback: falls back to index.html on network failure', () => {
  if (!swContent.includes("event.request.mode === 'navigate'")) {
    throw new Error('sw.js missing navigation fallback guard for offline support');
  }
  if (!swContent.includes('index.html')) {
    throw new Error('sw.js navigation fallback must target index.html');
  }
});

// --- Phase 4: HTML PWA Integration in app/index.html ---
console.log('\n--- Phase 4: HTML Document PWA Integration ---');

let indexHtml = '';
check('app/index.html links to manifest and defines theme-color meta', () => {
  if (!fs.existsSync(INDEX_FILE)) throw new Error('index.html does not exist');
  indexHtml = fs.readFileSync(INDEX_FILE, 'utf8');

  if (!indexHtml.includes('rel="manifest"') && !indexHtml.includes("rel='manifest'")) {
    throw new Error('index.html missing <link rel="manifest">');
  }
  if (!indexHtml.includes('name="theme-color"') && !indexHtml.includes("name='theme-color'")) {
    throw new Error('index.html missing <meta name="theme-color">');
  }
});

check('app/index.html contains Service Worker registration logic', () => {
  if (!indexHtml.includes('navigator.serviceWorker') || !indexHtml.includes('serviceWorker.register')) {
    throw new Error('index.html missing navigator.serviceWorker.register logic');
  }
});

check('PWA theme-color in index.html matches manifest.json theme_color', () => {
  const metaMatch = indexHtml.match(/<meta\s+name=["']theme-color["']\s+content=["']([^"']+)["']/i);
  if (!metaMatch) throw new Error('Could not parse theme-color from index.html');
  const htmlColor = metaMatch[1].toUpperCase();
  const manifestColor = manifest.theme_color.toUpperCase();
  if (htmlColor !== manifestColor) {
    throw new Error(`theme-color mismatch: index.html has ${htmlColor}, manifest has ${manifestColor}`);
  }
});

// --- Summary ---
console.log('\n======================================================================');
console.log('   PWA & OFFLINE RESILIENCE AUDIT SUMMARY');
console.log('======================================================================');
console.log(`  Total Checks  : ${totalChecks}`);
console.log(`  Passed        : ${passedChecks}`);
console.log(`  Failed        : ${failedChecks}`);
console.log(`  Status        : ${failedChecks === 0 ? '100% OFFLINE READY (PASS)' : 'PWA ANOMALIES DETECTED'}`);
console.log('======================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
