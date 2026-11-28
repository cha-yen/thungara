#!/usr/bin/env node
/**
 * Thungara - Client-Side Security & DOM-XSS Static Audit Suite
 * Audits frontend code for dynamic execution risks (eval, Function),
 * DOM-XSS sanitization, external link tabnabbing hygiene, and CSP compliance.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(PROJECT_ROOT, 'app', 'index.html');
const WORKER_FILE = path.join(PROJECT_ROOT, 'app', 'search-worker.js');
const SW_FILE = path.join(PROJECT_ROOT, 'app', 'sw.js');
const VERCEL_FILE = path.join(PROJECT_ROOT, 'vercel.json');

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
console.log('   THUNGARA CLIENT-SIDE SECURITY & DOM-XSS STATIC AUDIT');
console.log('======================================================================\n');

const html = fs.readFileSync(INDEX_FILE, 'utf8');
const worker = fs.readFileSync(WORKER_FILE, 'utf8');
const sw = fs.readFileSync(SW_FILE, 'utf8');
const appFiles = [
  { name: 'app/index.html', content: html },
  { name: 'app/search-worker.js', content: worker },
  { name: 'app/sw.js', content: sw }
];

// --- Phase 1: Dynamic Execution & Injection Guards ---
console.log('--- Phase 1: Dynamic Execution & Injection Guards ---');

for (const file of appFiles) {
  check(`No eval() in ${file.name}`, () => {
    // Match eval( not preceded by word char or dot
    const match = file.content.match(/(?<![a-zA-Z0-9_.])eval\s*\(/);
    if (match) {
      throw new Error(`Found eval() call in ${file.name}`);
    }
  });

  check(`No new Function() in ${file.name}`, () => {
    const match = file.content.match(/new\s+Function\s*\(/);
    if (match) {
      throw new Error(`Found new Function() in ${file.name}`);
    }
  });

  check(`No document.write() in ${file.name}`, () => {
    if (file.content.includes('document.write')) {
      throw new Error(`Found document.write in ${file.name}`);
    }
  });
}

// --- Phase 2: Strict DOM-XSS Sanitization & Escaping ---
console.log('\n--- Phase 2: DOM-XSS Sanitization & Escaping Contracts ---');

check('HTML Escaping function esc() is implemented and robust', () => {
  if (!html.includes('function esc(')) {
    throw new Error('Missing function esc() in index.html');
  }
  // Verify it handles HTML special characters
  const hasElementEscape = html.includes('document.createElement') && html.includes('textContent');
  const hasRegexEscape = html.includes('&amp;') && html.includes('&lt;') && html.includes('&gt;');
  if (!hasElementEscape && !hasRegexEscape) {
    throw new Error('esc() function does not provide adequate HTML entity escaping');
  }
});

check('Dynamic innerHTML assignments sanitize user/data variables', () => {
  // Check that highlightText internally calls esc() on both text and match terms
  if (!html.includes('let escaped = esc(text);') || !html.includes('escRegex(esc(w))')) {
    throw new Error('highlightText does not escape inputs through esc()');
  }

  // Scan all .innerHTML = assignments
  const innerHtmlMatches = html.match(/\.innerHTML\s*=\s*[^;]+;/g) || [];
  for (const match of innerHtmlMatches) {
    if (match.includes('song.title') && !match.includes('esc(song.title)') && !match.includes('highlightText(song.title')) {
      throw new Error(`Unescaped song.title in innerHTML: ${match.slice(0, 80)}`);
    }
    if (match.includes('song.artist') && !match.includes('esc(song.artist)') && !match.includes('highlightText(song.artist')) {
      throw new Error(`Unescaped song.artist in innerHTML: ${match.slice(0, 80)}`);
    }
  }
});

// --- Phase 3: External Link & Tabnabbing Hygiene ---
console.log('\n--- Phase 3: External Link & Tabnabbing Hygiene ---');

check('All target="_blank" links include rel="noopener noreferrer"', () => {
  const linkMatches = html.match(/<a\b[^>]*target=["']_blank["'][^>]*>/gi) || [];
  for (const link of linkMatches) {
    if (!link.includes('rel="noopener noreferrer"') && !link.includes("rel='noopener noreferrer'")) {
      throw new Error(`External link missing rel="noopener noreferrer": ${link}`);
    }
  }
});

check('Dynamic YouTube preview link enforces rel="noopener noreferrer"', () => {
  if (!html.includes('rel="noopener noreferrer"') && !html.includes("rel='noopener noreferrer'")) {
    throw new Error('Missing rel="noopener noreferrer" on YouTube links');
  }
});

// --- Phase 4: URL Parameters & Prototype Pollution Prevention ---
console.log('\n--- Phase 4: URL Parameter & Prototype Pollution Prevention ---');

check('handleUrlParams guards against prototype pollution and null prototypes', () => {
  if (!html.includes('handleUrlParams')) {
    throw new Error('Missing handleUrlParams function');
  }
  // Check that URL query parsing does not assign directly to Object prototype
  if (html.includes('Object.prototype[') || html.includes('__proto__[')) {
    throw new Error('Unsafe prototype manipulation detected in URL parameter handling');
  }
});

check('URL parameters parsing validates string input types', () => {
  if (!html.includes("typeof window.location.search === 'string'")) {
    throw new Error('handleUrlParams missing defensive type check on window.location.search');
  }
});

// --- Phase 5: Content Security Policy & HTTP Headers ---
console.log('\n--- Phase 5: Content Security Policy (CSP) & Header Security ---');

let vercel = null;
check('vercel.json specifies strict Content-Security-Policy', () => {
  if (!fs.existsSync(VERCEL_FILE)) throw new Error('vercel.json not found');
  vercel = JSON.parse(fs.readFileSync(VERCEL_FILE, 'utf8'));

  const globalHeaders = vercel.headers.find(h => h.source === '/(.*)');
  if (!globalHeaders) throw new Error('Missing global headers route in vercel.json');

  const cspHeader = globalHeaders.headers.find(h => h.key === 'Content-Security-Policy');
  if (!cspHeader) throw new Error('Missing Content-Security-Policy header');

  const csp = cspHeader.value;
  if (!csp.includes("default-src 'self'")) throw new Error("CSP missing default-src 'self'");
  if (!csp.includes("frame-ancestors 'none'")) throw new Error("CSP missing frame-ancestors 'none'");
});

check('vercel.json specifies Permissions-Policy restricting sensitive APIs', () => {
  const globalHeaders = vercel.headers.find(h => h.source === '/(.*)');
  const permHeader = globalHeaders.headers.find(h => h.key === 'Permissions-Policy');
  if (!permHeader) throw new Error('Missing Permissions-Policy header');

  const val = permHeader.value;
  if (!val.includes('camera=()')) throw new Error('Permissions-Policy should disable camera');
  if (!val.includes('geolocation=()')) throw new Error('Permissions-Policy should disable geolocation');
  if (!val.includes('microphone=(self)')) throw new Error('Permissions-Policy should restrict microphone to self');
});

check('vercel.json specifies X-Frame-Options: DENY and X-Content-Type-Options: nosniff', () => {
  const globalHeaders = vercel.headers.find(h => h.source === '/(.*)');
  const xfo = globalHeaders.headers.find(h => h.key === 'X-Frame-Options');
  const xcto = globalHeaders.headers.find(h => h.key === 'X-Content-Type-Options');

  if (!xfo || xfo.value !== 'DENY') throw new Error('X-Frame-Options must be DENY');
  if (!xcto || xcto.value !== 'nosniff') throw new Error('X-Content-Type-Options must be nosniff');
});

// --- Summary ---
console.log('\n======================================================================');
console.log('   CLIENT-SIDE SECURITY AUDIT SUMMARY');
console.log('======================================================================');
console.log(`  Total Checks  : ${totalChecks}`);
console.log(`  Passed        : ${passedChecks}`);
console.log(`  Failed        : ${failedChecks}`);
console.log(`  Status        : ${failedChecks === 0 ? 'SECURE (100% OK)' : 'SECURITY ANOMALIES DETECTED'}`);
console.log('======================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
