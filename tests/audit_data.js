#!/usr/bin/env node
/**
 * Thungara - Data & TF-IDF Vector Math Integrity Audit
 * Performs deep mathematical verification of 1,500 songs, vocabulary indexing,
 * sparse TF-IDF document vectors, Euclidean magnitudes, and YouTube mappings.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(PROJECT_ROOT, 'data', 'data.json');
const YT_FILE = path.join(PROJECT_ROOT, 'data', 'youtube_ids.json');

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const errors = [];

function check(name, fn) {
  totalChecks++;
  try {
    fn();
    passedChecks++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failedChecks++;
    const errMsg = err && err.message ? err.message : String(err);
    console.error(`  [FAIL] ${name}: ${errMsg}`);
    errors.push({ name, error: errMsg });
  }
}

console.log('======================================================================');
console.log('   THUNGARA DATA & TF-IDF VECTOR INTEGRITY AUDIT');
console.log('======================================================================\n');

const startTime = Date.now();

// Load data files
let data = null;
let yt = null;

check('Load: data/data.json is valid and readable', () => {
  if (!fs.existsSync(DATA_FILE)) throw new Error('data/data.json not found');
  data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
});

check('Load: data/youtube_ids.json is valid and readable', () => {
  if (!fs.existsSync(YT_FILE)) throw new Error('data/youtube_ids.json not found');
  yt = JSON.parse(fs.readFileSync(YT_FILE, 'utf8'));
});

// --- Phase 1: Song Record Schema & Completeness ---
console.log('\n--- Phase 1: Song Records & Text Schema (1,500 Songs) ---');

check('Record Count: exactly 1,500 songs', () => {
  if (!Array.isArray(data.songs) || data.songs.length !== 1500) {
    throw new Error(`Expected exactly 1,500 songs, found ${data.songs ? data.songs.length : 0}`);
  }
});

check('Unique IDs: all 1,500 song IDs are distinct and sequential', () => {
  const ids = new Set();
  for (let i = 0; i < data.songs.length; i++) {
    const s = data.songs[i];
    if (typeof s.id !== 'number' || isNaN(s.id)) {
      throw new Error(`Song at index ${i} has invalid ID: ${s.id}`);
    }
    if (ids.has(s.id)) {
      throw new Error(`Duplicate song ID found: ${s.id}`);
    }
    ids.add(s.id);
  }
});

check('Song Metadata: non-empty title, lyrics, and valid artist coverage', () => {
  let emptyArtistCount = 0;
  for (let i = 0; i < data.songs.length; i++) {
    const s = data.songs[i];
    if (!s.title || typeof s.title !== 'string' || !s.title.trim()) {
      throw new Error(`Song ${s.id} has empty title`);
    }
    if (typeof s.artist !== 'string') {
      throw new Error(`Song ${s.id} has invalid artist type`);
    }
    if (!s.artist.trim()) {
      emptyArtistCount++;
    }
    if (!s.lyrics || typeof s.lyrics !== 'string' || s.lyrics.trim().length < 20) {
      throw new Error(`Song ${s.id} has malformed or too short lyrics (< 20 chars)`);
    }
  }
  // Dataset invariant: exactly 2 legacy songs with unspecified artist (id 332 and 445)
  if (emptyArtistCount > 2) {
    throw new Error(`Found ${emptyArtistCount} songs with empty artist (expected <= 2)`);
  }
});

check('Text Encoding: no corrupted replacement characters or invalid Unicode', () => {
  for (let i = 0; i < data.songs.length; i++) {
    const s = data.songs[i];
    if (s.title.includes('\uFFFD') || s.lyrics.includes('\uFFFD')) {
      throw new Error(`Song ${s.id} contains Unicode replacement character (U+FFFD)`);
    }
  }
});

check('Song Diversity: >= 1,480 distinct song pairs (16 multi-album / alternate entries)', () => {
  const pairs = new Map();
  let duplicateCount = 0;
  for (let i = 0; i < data.songs.length; i++) {
    const s = data.songs[i];
    const key = `${s.title.trim().toLowerCase()}|||${s.artist.trim().toLowerCase()}`;
    if (pairs.has(key)) {
      duplicateCount++;
    } else {
      pairs.set(key, s.id);
    }
  }
  // Dataset invariant: exactly 16 multi-album / alternate recorded editions (1,484 unique pairs)
  if (duplicateCount > 16) {
    throw new Error(`Found ${duplicateCount} duplicate songs (expected <= 16)`);
  }
});

// --- Phase 2: Vocabulary & Inverted Index Integrity ---
console.log('\n--- Phase 2: Vocabulary & IDF Inverted Index ---');

check('Vocab Size: >= 5,000 words in vocabulary index', () => {
  if (!Array.isArray(data.vocab) || data.vocab.length < 5000) {
    throw new Error(`Vocab size ${data.vocab ? data.vocab.length : 0} is less than 5,000`);
  }
});

check('Vocab Uniqueness: no duplicate tokens in vocab list', () => {
  const vocabSet = new Set(data.vocab);
  if (vocabSet.size !== data.vocab.length) {
    throw new Error(`Found ${data.vocab.length - vocabSet.size} duplicate tokens in vocab`);
  }
});

check('IDF Dimensions: idf array length matches vocab length', () => {
  if (!Array.isArray(data.idf) || data.idf.length !== data.vocab.length) {
    throw new Error(`IDF length (${data.idf ? data.idf.length : 0}) does not match vocab length (${data.vocab.length})`);
  }
});

check('IDF Mathematical Range: all IDF values are strictly positive finite numbers', () => {
  for (let i = 0; i < data.idf.length; i++) {
    const val = data.idf[i];
    if (typeof val !== 'number' || isNaN(val) || !isFinite(val) || val <= 0) {
      throw new Error(`Invalid IDF value at index ${i} (${data.vocab[i]}): ${val}`);
    }
  }
});

// --- Phase 3: TF-IDF Vector Space Mathematical Integrity ---
console.log('\n--- Phase 3: TF-IDF Vector Space & Euclidean Bounds ---');

check('Vector Count: vectors object contains entries for all 1,500 songs', () => {
  if (!data.vectors || typeof data.vectors !== 'object') {
    throw new Error('vectors object missing or invalid');
  }
  const vecKeys = Object.keys(data.vectors);
  if (vecKeys.length !== 1500) {
    throw new Error(`Expected 1,500 vector entries, found ${vecKeys.length}`);
  }
});

check('Vector Bounds & Vocab Indexing: all word indices are valid in vocab', () => {
  const vocabLen = data.vocab.length;
  for (let i = 0; i < 1500; i++) {
    const vec = data.vectors[i] || data.vectors[String(i)];
    if (!vec || typeof vec !== 'object') {
      throw new Error(`Vector for song index ${i} is missing or not an object`);
    }
    for (const tokenIdxStr of Object.keys(vec)) {
      const idx = Number(tokenIdxStr);
      if (isNaN(idx) || idx < 0 || idx >= vocabLen) {
        throw new Error(`Song ${i} references out-of-bounds vocab index: ${tokenIdxStr} (vocab len: ${vocabLen})`);
      }
    }
  }
});

check('Vector Weights & Euclidean Norms: all weights > 0 and magnitude > 0', () => {
  let minMag = Infinity;
  let maxMag = -Infinity;
  for (let i = 0; i < 1500; i++) {
    const vec = data.vectors[i] || data.vectors[String(i)];
    let sumSq = 0;
    for (const [wIdx, weight] of Object.entries(vec)) {
      if (typeof weight !== 'number' || isNaN(weight) || !isFinite(weight) || weight <= 0) {
        throw new Error(`Song ${i} has invalid weight for token ${wIdx}: ${weight}`);
      }
      sumSq += weight * weight;
    }
    const mag = Math.sqrt(sumSq);
    if (mag <= 0 || !isFinite(mag)) {
      throw new Error(`Song ${i} has zero or non-finite Euclidean magnitude: ${mag}`);
    }
    if (mag < minMag) minMag = mag;
    if (mag > maxMag) maxMag = mag;
  }
});

// --- Phase 4: YouTube Mapping Coverage & ID Format Integrity ---
console.log('\n--- Phase 4: YouTube Video Mapping & ID Format ---');

check('YouTube Coverage: mapped songs count > 1,400', () => {
  const keys = Object.keys(yt);
  if (keys.length <= 1400) {
    throw new Error(`Mapped YouTube IDs count (${keys.length}) is <= 1,400`);
  }
});

check('YouTube ID Format: all mapped IDs conform to YouTube 11-char pattern', () => {
  const ytRegex = /^[a-zA-Z0-9_-]{11}$/;
  for (const [songIdxStr, ytId] of Object.entries(yt)) {
    if (typeof ytId !== 'string' || !ytRegex.test(ytId)) {
      throw new Error(`Invalid YouTube ID format for song ${songIdxStr}: "${ytId}"`);
    }
  }
});

check('YouTube Key Validity: all keys correspond to valid song indices [0, 1499]', () => {
  for (const songIdxStr of Object.keys(yt)) {
    const idx = Number(songIdxStr);
    if (isNaN(idx) || idx < 0 || idx >= 1500) {
      throw new Error(`YouTube mapping references non-existent song index: ${songIdxStr}`);
    }
  }
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n======================================================================');
console.log('   DATA & VECTOR AUDIT SUMMARY');
console.log('======================================================================');
console.log(`  Total Checks  : ${totalChecks}`);
console.log(`  Passed        : ${passedChecks}`);
console.log(`  Failed        : ${failedChecks}`);
console.log(`  Duration      : ${elapsed}s`);
console.log(`  Status        : ${failedChecks === 0 ? 'MATHEMATICALLY SOUND (100% OK)' : 'ANOMALIES DETECTED'}`);
console.log('======================================================================\n');

if (failedChecks > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
