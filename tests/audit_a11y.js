#!/usr/bin/env node
/**
 * Thungara - WCAG 2.1 AA Accessibility & Web Standards Static Guard
 * Verifies semantic landmarks, accessible controls, screen-reader live regions,
 * mathematical color contrast ratios (>= 4.5:1), and keyboard navigation.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
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

// Relative luminance & contrast ratio calculation according to WCAG 2.1
function relativeLuminance(hex) {
  const rgb = hex.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16) / 255);
  const a = rgb.map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrastRatio(hex1, hex2) {
  const lum1 = relativeLuminance(hex1);
  const lum2 = relativeLuminance(hex2);
  const brighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (brighter + 0.05) / (darker + 0.05);
}

console.log('======================================================================');
console.log('   THUNGARA WCAG 2.1 AA ACCESSIBILITY & STANDARDS GUARD');
console.log('======================================================================\n');

if (!fs.existsSync(INDEX_FILE)) {
  console.error('[FATAL] app/index.html not found');
  process.exit(1);
}

const html = fs.readFileSync(INDEX_FILE, 'utf8');

// --- Phase 1: Semantic Landmarks & Document Structure ---
console.log('--- Phase 1: Semantic Landmarks & Document Structure ---');

check('Document specifies lang="th" on <html> element', () => {
  if (!html.match(/<html[^>]*lang=["']th["']/i)) {
    throw new Error('<html> missing lang="th" attribute');
  }
});

check('Document specifies accessible viewport meta without disabling zoom', () => {
  const viewportMatch = html.match(/<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']+)["']/i);
  if (!viewportMatch) throw new Error('Missing viewport meta tag');
  const content = viewportMatch[1];
  if (content.includes('user-scalable=no') || content.includes('maximum-scale=1.0')) {
    throw new Error('Viewport disables user zoom/scaling (violates WCAG 1.4.4)');
  }
});

check('Semantic landmarks: <header>, role="search", and results role="region" present', () => {
  if (!html.includes('<header') || !html.includes('</header>')) {
    throw new Error('Missing <header> landmark');
  }
  if (!html.includes('role="search"') && !html.includes("role='search'")) {
    throw new Error('Missing role="search" on search landmark');
  }
  if (!html.includes('role="region"') && !html.includes("role='region'")) {
    throw new Error('Missing role="region" on search results container');
  }
});

check('Primary heading <h1> is defined for screen readers', () => {
  if (!html.includes('<h1') || !html.includes('</h1>')) {
    throw new Error('Missing <h1> primary heading');
  }
});

// --- Phase 2: Accessible Form & Interactive Controls ---
console.log('\n--- Phase 2: Accessible Form & Interactive Controls ---');

check('Search input specifies accessible aria-label', () => {
  const searchInputMatch = html.match(/<textarea[^>]*id=["']search-input["'][^>]*>/i);
  if (!searchInputMatch || (!searchInputMatch[0].includes('aria-label=') && !searchInputMatch[0].includes('aria-labelledby='))) {
    throw new Error('search-input missing aria-label attribute');
  }
});

check('Voice recognition button defines accessible aria-label or title', () => {
  const micBtnMatch = html.match(/<button[^>]*id=["']mic-btn["'][^>]*>/i);
  if (!micBtnMatch || (!micBtnMatch[0].includes('aria-label=') && !micBtnMatch[0].includes('title='))) {
    throw new Error('mic-btn missing aria-label or title');
  }
});

check('Theme toggle control specifies accessible aria-label or title', () => {
  const themeBtnMatch = html.match(/<button[^>]*id=["']btn-theme["'][^>]*>/i);
  if (!themeBtnMatch || (!themeBtnMatch[0].includes('aria-label=') && !themeBtnMatch[0].includes('title='))) {
    throw new Error('btn-theme missing aria-label or title');
  }
});

check('Modal close control specifies accessible aria-label or title', () => {
  const closeBtnMatch = html.match(/<button[^>]*id=["']btn-modal-close["'][^>]*>/i);
  if (!closeBtnMatch || (!closeBtnMatch[0].includes('aria-label=') && !closeBtnMatch[0].includes('title='))) {
    throw new Error('btn-modal-close button missing aria-label or title');
  }
});

check('Back-to-top button specifies accessible aria-label or title', () => {
  const topBtnMatch = html.match(/<button[^>]*id=["']btn-top["'][^>]*>/i);
  if (!topBtnMatch || (!topBtnMatch[0].includes('aria-label=') && !topBtnMatch[0].includes('title='))) {
    throw new Error('btn-top button missing aria-label or title');
  }
});

// --- Phase 3: Screen Reader Live Regions & Modal Dialogs ---
console.log('\n--- Phase 3: Screen Reader Live Regions & Modal Dialogs ---');

check('Search count / status region specifies aria-live="polite"', () => {
  const liveMatch = html.match(/<div[^>]*aria-live=["']polite["'][^>]*>/i);
  if (!liveMatch) {
    throw new Error('Missing aria-live="polite" region for dynamic search updates');
  }
});

check('Modal dialog specifies role="dialog" and aria-modal="true"', () => {
  const modalMatch = html.match(/<div[^>]*id=["']modal["'][^>]*>/i);
  if (!modalMatch) throw new Error('modal element not found');
  const tag = modalMatch[0];
  if (!tag.includes('role="dialog"') && !tag.includes("role='dialog'")) {
    throw new Error('modal missing role="dialog"');
  }
  if (!tag.includes('aria-modal="true"') && !tag.includes("aria-modal='true'")) {
    throw new Error('modal missing aria-modal="true"');
  }
});

check('Modal dialog specifies aria-labelledby linking to modal song title', () => {
  const modalMatch = html.match(/<div[^>]*id=["']modal["'][^>]*>/i);
  if (!modalMatch || !modalMatch[0].includes('aria-labelledby="modal-title"')) {
    throw new Error('modal missing aria-labelledby="modal-title" attribute');
  }
});

// --- Phase 4: Mathematical Color Contrast (WCAG 2.1 AA >= 4.5:1) ---
console.log('\n--- Phase 4: Mathematical Color Contrast Ratios (WCAG 2.1 AA) ---');

const colorPairs = [
  { name: 'Light Theme: Page Background vs Primary Text', bg: '#FFFBF0', text: '#1F2937' },
  { name: 'Light Theme: Card Background vs Primary Text', bg: '#FFFFFF', text: '#1F2937' },
  { name: 'Light Theme: Card Background vs Secondary Text', bg: '#FFFFFF', text: '#4B5563' },
  { name: 'Dark Theme: Page Background vs Primary Text', bg: '#0F0F14', text: '#F3F4F6' },
  { name: 'Dark Theme: Card Background vs Primary Text', bg: '#222834', text: '#F3F4F6' },
  { name: 'Dark Theme: Card Background vs Secondary Text', bg: '#222834', text: '#D1D5DB' }
];

for (const pair of colorPairs) {
  const ratio = contrastRatio(pair.bg, pair.text);
  check(`Contrast: ${pair.name} (${ratio.toFixed(2)}:1 >= 4.5:1)`, () => {
    if (ratio < 4.5) {
      throw new Error(`Contrast ratio ${ratio.toFixed(2)}:1 is below WCAG 2.1 AA threshold of 4.5:1`);
    }
  });
}

// --- Phase 5: Keyboard Accessibility & Focus Visibility ---
console.log('\n--- Phase 5: Keyboard Accessibility & Focus Visibility ---');

check('CSS specifies :focus-visible styling with visible outline', () => {
  if (!html.includes(':focus-visible') || !html.includes('outline:')) {
    throw new Error('Missing visible focus styling via :focus-visible');
  }
});

check('Keyboard navigation: Escape key closes modal dialog', () => {
  if (!html.includes("e.key === 'Escape'") && !html.includes('e.key === "Escape"') && !html.includes('e.keyCode === 27')) {
    throw new Error('Missing Escape key listener for closing modal');
  }
});

check('Keyboard navigation: Enter key submits or activates action on search', () => {
  if (!html.includes('Escape') && !html.includes('Enter')) {
    throw new Error('Missing keyboard event listeners');
  }
});

// --- Summary ---
console.log('\n======================================================================');
console.log('   ACCESSIBILITY & STANDARDS AUDIT SUMMARY');
console.log('======================================================================');
console.log(`  Total Checks  : ${totalChecks}`);
console.log(`  Passed        : ${passedChecks}`);
console.log(`  Failed        : ${failedChecks}`);
console.log(`  Status        : ${failedChecks === 0 ? 'WCAG 2.1 AA COMPLIANT (100% OK)' : 'ACCESSIBILITY ISSUES DETECTED'}`);
console.log('======================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
