#!/usr/bin/env node
/**
 * Thungara - Zero-Dependency Linter & Syntax Guard
 * Validates JavaScript syntax, JSON data integrity, and project hygiene
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

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
console.log('   THUNGARA ZERO-DEPENDENCY LINTER & INTEGRITY GUARD');
console.log('======================================================================\n');

// --- 1. JavaScript Syntax Checks ---
console.log('--- Phase 1: JavaScript V8 Syntax Verification (node --check) ---');

const jsFiles = [
  'app/search-worker.js',
  'app/sw.js',
  'tests/run_all.js',
  'tests/test_full_system.js',
  'tests/test_search.js',
  'tests/lint.js'
];

// Include optional test suites if they exist
if (fs.existsSync(path.join(ROOT_DIR, 'tests/benchmark.js'))) {
  jsFiles.push('tests/benchmark.js');
}
if (fs.existsSync(path.join(ROOT_DIR, 'tests/audit_data.js'))) {
  jsFiles.push('tests/audit_data.js');
}
if (fs.existsSync(path.join(ROOT_DIR, 'tests/test_pwa.js'))) {
  jsFiles.push('tests/test_pwa.js');
}
if (fs.existsSync(path.join(ROOT_DIR, 'tests/audit_a11y.js'))) {
  jsFiles.push('tests/audit_a11y.js');
}

for (const relPath of jsFiles) {
  const absPath = path.join(ROOT_DIR, relPath);
  check(`JavaScript Syntax: ${relPath}`, () => {
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${relPath}`);
    }
    // Run node --check
    execFileSync(process.execPath, ['--check', absPath], { stdio: 'pipe' });
  });
}

// --- 2. JSON Syntax & Schema Integrity ---
console.log('\n--- Phase 2: JSON Syntax & Schema Integrity ---');

const jsonFiles = [
  'data/data.json',
  'data/youtube_ids.json',
  'app/manifest.json',
  'vercel.json',
  'package.json',
  'jsconfig.json'
];

for (const relPath of jsonFiles) {
  const absPath = path.join(ROOT_DIR, relPath);
  check(`JSON Syntax: ${relPath}`, () => {
    if (!fs.existsSync(absPath)) {
      throw new Error(`File not found: ${relPath}`);
    }
    const content = fs.readFileSync(absPath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      throw new Error('File contains UTF-8 BOM');
    }
    JSON.parse(content);
  });
}

// Deep schema checks
check('Schema: data/data.json structure (songs, vocab, vectors)', () => {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/data.json'), 'utf8'));
  if (!Array.isArray(data.songs) || data.songs.length !== 1500) {
    throw new Error(`Expected exactly 1,500 songs, got ${data.songs ? data.songs.length : 0}`);
  }
  if (!Array.isArray(data.vocab) || data.vocab.length < 5000) {
    throw new Error(`Expected at least 5,000 vocab entries, got ${data.vocab ? data.vocab.length : 0}`);
  }
  if (!data.vectors || typeof data.vectors !== 'object') {
    throw new Error('Expected vectors object');
  }
});

check('Schema: data/youtube_ids.json structure (> 1,400 mappings)', () => {
  const yt = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'data/youtube_ids.json'), 'utf8'));
  const keys = Object.keys(yt);
  if (keys.length < 1400) {
    throw new Error(`Expected > 1,400 mapped YouTube IDs, got ${keys.length}`);
  }
});

check('Schema: app/manifest.json PWA attributes', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'app/manifest.json'), 'utf8'));
  const required = ['name', 'short_name', 'start_url', 'display', 'icons'];
  for (const field of required) {
    if (!manifest[field]) {
      throw new Error(`Missing required manifest field: ${field}`);
    }
  }
  if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
    throw new Error('Manifest icons array is empty');
  }
});

check('Schema: vercel.json rewrites and security headers', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
  if (!Array.isArray(vercel.rewrites) || vercel.rewrites.length === 0) {
    throw new Error('Missing rewrites in vercel.json');
  }
  if (!Array.isArray(vercel.headers) || vercel.headers.length === 0) {
    throw new Error('Missing security headers in vercel.json');
  }
});

check('Schema: jsconfig.json type-checking configuration', () => {
  const jsconfig = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'jsconfig.json'), 'utf8'));
  if (!jsconfig.compilerOptions || !jsconfig.compilerOptions.checkJs) {
    throw new Error('jsconfig.json missing compilerOptions.checkJs');
  }
});

// --- 3. Zero-Dependency & Project Hygiene ---
console.log('\n--- Phase 3: Zero-Dependency & Project Hygiene ---');

check('Hygiene: package.json has 0 dependencies & 0 devDependencies', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const deps = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
  const devDeps = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0;
  if (deps !== 0 || devDeps !== 0) {
    throw new Error(`Detected external dependencies! deps=${deps}, devDeps=${devDeps}`);
  }
});

check('Hygiene: .gitignore protects internal scripts and sensitive data', () => {
  const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
  if (!gitignore.includes('*.csv')) throw new Error('.gitignore missing *.csv rule');
  if (!gitignore.includes('scripts/')) throw new Error('.gitignore missing scripts/ rule');
});

// --- Summary ---
console.log('\n======================================================================');
console.log('   LINT & INTEGRITY SUMMARY');
console.log('======================================================================');
console.log(`  Total Checks  : ${totalChecks}`);
console.log(`  Passed        : ${passedChecks}`);
console.log(`  Failed        : ${failedChecks}`);
console.log(`  Status        : ${failedChecks === 0 ? 'CLEAN (100% OK)' : 'FAILED'}`);
console.log('======================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
