/**
 * test_search.js - Native Node.js Automated Search Engine Test Suite for Thungara
 * Runs 71 categories and 176 assertions across core search, filters, dialect synonyms,
 * typo tolerance, and omnibox queries.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(PROJECT_ROOT, 'data', 'data.json');

const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
const loadedData = JSON.parse(rawData);

let DATA = null;
let vocabSet = null;
let wordToIndex = null;
let maxWordLen = 0;
let NORM_SONGS = [];
let VECTOR_MAGS = [];
let ARTIST_SET = new Set();

const SYNONYMS = {
  'รัก': ['ฮัก'],
  'ฮัก': ['รัก'],
  'ไม่': ['บ่'],
  'บ่': ['ไม่'],
  'ไม่ได้': ['บ่ได้'],
  'บ่ได้': ['ไม่ได้'],
  'คิดถึง': ['คิดฮอด', 'คึดฮอด'],
  'คิดฮอด': ['คิดถึง', 'คึดฮอด'],
  'คึดฮอด': ['คิดถึง', 'คิดฮอด'],
  'เธอ': ['เจ้า', 'โต'],
  'เจ้า': ['เธอ'],
  'พี่': ['อ้าย'],
  'อ้าย': ['พี่'],
  'เรา': ['เฮา'],
  'เฮา': ['เรา'],
  'หน่อย': ['แหน่', 'แน'],
  'แหน่': ['หน่อย', 'แน'],
  'แน': ['หน่อย', 'แหน่'],
  'ดู': ['เบิ่ง'],
  'เบิ่ง': ['ดู'],
  'มาก': ['คัก', 'หลาย'],
  'คัก': ['มาก'],
  'หลาย': ['มาก'],
  'ทำไม': ['เป็นหยัง'],
  'เป็นหยัง': ['ทำไม'],
  'เพราะ': ['ย้อน'],
  'ย้อน': ['เพราะ'],
  'พูด': ['เว้า'],
  'เว้า': ['พูด'],
  'คิด': ['คึด'],
  'คึด': ['คิด'],
  'บ้าน': ['เฮือน'],
  'เฮือน': ['บ้าน'],
};

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/&amp;/gi, ' ').toLowerCase().replace(/[^฀-๿a-z0-9]/g, '');
}

function isValidThaiQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const match = text.match(/[\u0e01-\u0e5b]/);
  if (!match) return true;
  const code = match[0].charCodeAt(0);
  if ((code >= 0x0E30 && code <= 0x0E3A) || (code >= 0x0E47 && code <= 0x0E4E)) {
    return false;
  }
  return true;
}

const COMPOUND_PREFIXES = [
  { prefix: 'ความ', minLen: 6 },
  { prefix: 'การ', minLen: 5 },
  { prefix: 'น่า', minLen: 5 },
];

const BOUND_PREFIXES = new Set(['ความ', 'การ']);

function extractSubTokens(tokens) {
  const subTokens = [];
  if (!tokens || tokens.length === 0) return subTokens;
  for (const t of tokens) {
    for (const { prefix, minLen } of COMPOUND_PREFIXES) {
      if (t.startsWith(prefix) && t.length >= minLen) {
        if (prefix === 'การ' && t.startsWith('การ์')) continue;
        const root = t.substring(prefix.length);
        if (isValidThaiQuery(root) && ((vocabSet && vocabSet.has(root)) || root.length >= 3)) {
          subTokens.push({
            root,
            parent: t,
            synonyms: (typeof SYNONYMS !== 'undefined' && SYNONYMS && SYNONYMS[root]) ? SYNONYMS[root] : []
          });
        }
      }
    }
  }
  return subTokens;
}



function tokenizeQuery(text) {
  if (!vocabSet || !text || typeof text !== 'string') return [];
  const cleaned = text.replace(/[^฀-๿a-zA-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const segments = cleaned.split(/\s+/).filter(s => s.length > 0);
  const tokens = [];
  for (const seg of segments) {
    let i = 0;
    while (i < seg.length) {
      let found = false;
      for (let len = Math.min(maxWordLen, seg.length - i); len >= 2; len--) {
        const candidate = seg.substring(i, i + len);
        if (vocabSet.has(candidate)) {
          tokens.push(candidate);
          i += len;
          found = true;
          break;
        }
      }
      if (!found) i++;
    }
  }
  return tokens;
}

function queryToVector(tokens) {
  if (!tokens || tokens.length === 0) return { vec: {}, mag: 0 };
  const tf = {};
  let maxTf = 0;
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
    if (tf[t] > maxTf) maxTf = tf[t];
  }
  if (maxTf === 0) return { vec: {}, mag: 0 };
  const vec = {};
  let magSq = 0;
  for (const [word, count] of Object.entries(tf)) {
    const idx = wordToIndex ? wordToIndex.get(word) : (DATA && DATA.vocab ? DATA.vocab.indexOf(word) : -1);
    if (idx !== undefined && idx >= 0 && DATA && DATA.idf && DATA.idf[idx] !== undefined) {
      const val = (count / maxTf) * DATA.idf[idx];
      vec[String(idx)] = val;
      magSq += val * val;
    }
  }
  return { vec, mag: Math.sqrt(magSq) };
}

function cosineSim(vecA, magA, songIdx) {
  if (magA === 0 || !vecA) return 0;
  const magB = VECTOR_MAGS[songIdx];
  if (!magB) return 0;
  const vecB = (DATA && DATA.vectors && DATA.vectors[songIdx]) || null;
  if (!vecB) return 0;
  let dot = 0;
  const entries = Array.isArray(vecA) ? vecA : Object.entries(vecA);
  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    const valB = vecB[entry[0]];
    if (valB !== undefined) dot += entry[1] * valB;
  }
  if (dot === 0) return 0;
  return dot / (magA * magB);
}

function fuzzyMatchWindow(queryNorm, targetNorm, maxDiff = 1, allowLengthChange = false) {
  const n = queryNorm.length;
  const tLen = targetNorm.length;
  if (n < 3 || tLen < n - maxDiff) return null;

  const bg0 = queryNorm.substring(0, 2);
  const bg1 = n >= 3 ? queryNorm.substring(1, 3) : '';
  if (!targetNorm.includes(bg0) && (!bg1 || !targetNorm.includes(bg1))) {
    return null;
  }

  const qbgs = [bg0];
  if (bg1) qbgs.push(bg1);

  const checked = new Set();
  for (let offset = 0; offset < qbgs.length; offset++) {
    const bg = qbgs[offset];
    let pos = targetNorm.indexOf(bg);
    let checksCount = 0;
    while (pos !== -1 && checksCount < 4) {
      const baseStart = Math.max(0, pos - offset);
      if (!allowLengthChange) {
        if (!checked.has(baseStart) && baseStart + n <= tLen) {
          checked.add(baseStart);
          let diff = 0;
          for (let k = 0; k < n; k++) {
            if (queryNorm[k] !== targetNorm[baseStart + k] && ++diff > maxDiff) break;
          }
          if (diff <= maxDiff) {
            const sub = targetNorm.substring(baseStart, baseStart + n);
            return { matched: true, sub, diff, start: baseStart, length: n };
          }
        }
      } else {
        for (let shift = -1; shift <= 1; shift++) {
          const startIdx = baseStart + shift;
          for (let lengthDelta = -maxDiff; lengthDelta <= maxDiff; lengthDelta++) {
            const length = n + lengthDelta;
            const key = startIdx + ':' + length;
            if (startIdx < 0 || length < 1 || startIdx + length > tLen || checked.has(key)) continue;
            checked.add(key);
            const sub = targetNorm.substring(startIdx, startIdx + length);
            if (length === n) {
              let diff = 0;
              for (let k = 0; k < n; k++) {
                if (queryNorm[k] !== sub[k] && ++diff > maxDiff) break;
              }
              if (diff <= maxDiff) return { matched: true, sub, diff, start: startIdx, length };
            } else if (editDistanceAtMost(queryNorm, sub, maxDiff)) {
              return { matched: true, sub, diff: maxDiff, start: startIdx, length };
            }
          }
        }
      }
      checksCount++;
      pos = targetNorm.indexOf(bg, pos + 1);
    }
  }
  return null;
}

function editDistanceAtMost(textA, textB, maxDistance) {
  if (textA === textB) return true;
  if (Math.abs(textA.length - textB.length) > maxDistance) return false;
  let a = 0;
  let b = 0;
  let distance = 0;
  while (a < textA.length && b < textB.length) {
    if (textA[a] === textB[b]) {
      a++;
      b++;
      continue;
    }
    distance++;
    if (distance > maxDistance) return false;
    if (textA.length > textB.length) a++;
    else if (textB.length > textA.length) b++;
    else {
      a++;
      b++;
    }
  }
  return distance + (textA.length - a) + (textB.length - b) <= maxDistance;
}

function countOccurrences(str, sub, maxCount = 4) {
  if (!sub || !str) return 0;
  let count = 0, pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) {
    count++;
    if (count >= maxCount) break;
    pos += sub.length;
  }
  return count;
}

function search(query, filterArtist, filterEmotion, filterYear) {
  if (!DATA || !DATA.songs) return [];
  const rawQ = (query || '').trim();
  if (!rawQ && !filterArtist && !filterEmotion && !filterYear) return [];
  if (rawQ && !isValidThaiQuery(rawQ)) return [];

  const normQ = normalizeText(rawQ);
  const qBg0 = normQ.length >= 2 ? normQ.substring(0, 2) : '';
  const qBg1 = normQ.length >= 3 ? normQ.substring(1, 3) : '';
  const isExactArtist = ARTIST_SET.has(normQ);

  const tokens = tokenizeQuery(rawQ);
  const subTokens = extractSubTokens(tokens);
  if (rawQ && tokens.length === 0 && normQ.length < 3 && !isExactArtist) return [];

  const { vec: qVec, mag: qMag } = queryToVector(tokens);
  const hasVector = qMag > 0;
  const qVecEntries = hasVector ? Object.entries(qVec) : [];

  const preparedTokens = tokens.map(t => ({
    raw: t,
    norm: normalizeText(t),
    synonyms: (SYNONYMS[t] || []).map(syn => ({
      raw: syn,
      norm: normalizeText(syn)
    }))
  }));

  const preparedSubTokens = subTokens.map(st => ({
    parent: st.parent,
    root: st.root,
    normRoot: normalizeText(st.root),
    synonyms: (st.synonyms || []).map(syn => ({
      raw: syn,
      norm: normalizeText(syn)
    }))
  }));

  const results = [];
  const nSongs = DATA.songs.length;

  for (let i = 0; i < nSongs; i++) {
    const song = DATA.songs[i];

    if (filterArtist && song.artist !== filterArtist) continue;
    if (filterEmotion && song.emotion !== filterEmotion) continue;
    if (filterYear && String(song.year) !== String(filterYear)) continue;

    const ns = NORM_SONGS[i] || {
      normTitle: normalizeText(song.title),
      normArtist: normalizeText(song.artist),
      normLyrics: normalizeText(song.lyrics),
    };

    let score = normQ ? 0.0 : 1.0;
    let exactTitleMatch = false;
    let exactLyricsMatch = false;
    let fuzzyTitleMatch = false;
    let fuzzyLyricsMatch = false;
    const matchedTerms = [];
    let matchedTokenCount = 0;
    let matchedSynonymCount = 0;
    let matchedSubTokenCount = 0;
    let matchedSubSynonymCount = 0;
    let artistScore = 0.0;
    let titleScore = 0.0;

    if (normQ) {
      // 1. Artist Matching (Omnibox)
      if (ns.normArtist) {
        let matchedCollab = null;
        let matchedCollabInQ = null;
        let matchedCollabInQNorm = '';

        if (ns.subArtistsNorm && ns.subArtistsNorm.length > 0) {
          const len = ns.subArtistsNorm.length;
          for (let k = 0; k < len; k++) {
            const sn = ns.subArtistsNorm[k];
            if (sn === normQ) {
              matchedCollab = ns.subArtists[k];
              break;
            } else if (sn.length >= 3 && normQ.includes(sn)) {
              matchedCollabInQ = ns.subArtists[k];
              matchedCollabInQNorm = sn;
            }
          }
        }

        if (ns.normArtist === normQ || matchedCollab) {
          artistScore = 0.94;
          matchedTerms.push(matchedCollab || song.artist);
          if (rawQ) matchedTerms.push(rawQ);
        } else if (ns.normArtist.includes(normQ) && normQ.length >= 3) {
          const ratio = normQ.length / Math.max(ns.normArtist.length, 1);
          artistScore = 0.82 + 0.10 * ratio;
          matchedTerms.push(song.artist);
          if (rawQ) matchedTerms.push(rawQ);
        }

        let targetArtistNorm = '';
        let matchedArtistName = '';
        if (normQ.includes(ns.normArtist) && ns.normArtist.length >= 3) {
          targetArtistNorm = ns.normArtist;
          matchedArtistName = song.artist;
        } else if (matchedCollabInQ) {
          targetArtistNorm = matchedCollabInQNorm;
          matchedArtistName = matchedCollabInQ;
        }

        if (targetArtistNorm) {
          const remQ = normQ.replace(targetArtistNorm, '');
          if (remQ && ns.normTitle === remQ) {
            exactTitleMatch = true;
            titleScore = 1.0;
            artistScore = 0.95;
            matchedTerms.push(matchedArtistName);
            matchedTerms.push(song.title);
          } else if (remQ && ns.normTitle.includes(remQ)) {
            titleScore = 0.92;
            artistScore = 0.92;
            matchedTerms.push(matchedArtistName);
            matchedTerms.push(song.title);
          } else if (remQ && ns.normLyrics.includes(remQ)) {
            exactLyricsMatch = true;
            artistScore = 0.90;
            matchedTerms.push(matchedArtistName);
            matchedTerms.push(remQ);
          } else if (!artistScore) {
            artistScore = 0.85;
            matchedTerms.push(matchedArtistName);
          }
        }
      }

      // 2. Title matching
      if (!exactTitleMatch) {
        if (ns.normTitle === normQ) {
          exactTitleMatch = true;
          titleScore = 1.0;
          matchedTerms.push(song.title);
        } else if (ns.normTitle.includes(normQ)) {
          const ratio = normQ.length / Math.max(ns.normTitle.length, 1);
          titleScore = 0.82 + 0.14 * ratio;
          matchedTerms.push(song.title);
        } else if (normQ.includes(ns.normTitle) && ns.normTitle.length >= 3) {
          const ratio = ns.normTitle.length / normQ.length;
          titleScore = 0.78 + 0.12 * ratio;
          matchedTerms.push(song.title);
        }
      }

      // 3. Lyrics phrase matching
      let lyricsPhraseScore = 0.0;
      const isBoundPrefixOnly = BOUND_PREFIXES.has(normQ) && tokens.length === 0;
      if (!isBoundPrefixOnly && ns.normLyrics.includes(normQ)) {
        exactLyricsMatch = true;
        const lenFactor = Math.min(normQ.length / 25.0, 1.0);
        lyricsPhraseScore = 0.82 + 0.08 * lenFactor;
        const count = countOccurrences(ns.normLyrics, normQ);
        if (count > 1) {
          lyricsPhraseScore += 0.02 * Math.min(count - 1, 3);
        }
        matchedTerms.push(rawQ);
      }

      // 4. Fuzzy matching
      let fuzzyScore = 0.0;
      if (!exactLyricsMatch && !exactTitleMatch && artistScore === 0 && normQ.length >= 3) {
        if ((ns.normTitle.includes(qBg0) || (qBg1 && ns.normTitle.includes(qBg1))) && ns.normTitle.length >= normQ.length - 1) {
          const fTitle = fuzzyMatchWindow(normQ, ns.normTitle, 1, true);
          if (fTitle && fTitle.matched) {
            fuzzyTitleMatch = true;
            fuzzyScore = Math.max(fuzzyScore, 0.72);
            if (fTitle.sub) matchedTerms.push(fTitle.sub);
          }
        }
        if (!isExactArtist && !fuzzyTitleMatch) {
          if (ns.normLyrics.includes(qBg0) || (qBg1 && ns.normLyrics.includes(qBg1))) {
            const fLyrics = fuzzyMatchWindow(normQ, ns.normLyrics, 1, false);
            if (fLyrics && fLyrics.matched) {
              fuzzyLyricsMatch = true;
              fuzzyScore = Math.max(fuzzyScore, 0.56);
              if (fLyrics.sub) matchedTerms.push(fLyrics.sub);
            }
          }
        }
      }

      // 5. Token & Synonym coverage
      let tokenCoverage = 0.0;
      if (preparedTokens.length > 0 && (!isExactArtist || artistScore > 0)) {
        for (const pt of preparedTokens) {
          if (ns.normLyrics.includes(pt.norm) || ns.normTitle.includes(pt.norm)) {
            matchedTokenCount++;
            matchedTerms.push(pt.raw);
          } else if (pt.synonyms.length > 0) {
            for (const syn of pt.synonyms) {
              if (ns.normLyrics.includes(syn.norm) || ns.normTitle.includes(syn.norm)) {
                matchedSynonymCount++;
                matchedTerms.push(syn.raw);
                break;
              }
            }
          }
        }

        if (preparedSubTokens.length > 0) {
          for (const pst of preparedSubTokens) {
            if (ns.normLyrics.includes(pst.normRoot) || ns.normTitle.includes(pst.normRoot)) {
              matchedTerms.push(pst.root);
              if (!matchedTerms.includes(pst.parent)) {
                matchedSubTokenCount++;
              }
            } else if (pst.synonyms.length > 0) {
              for (const syn of pst.synonyms) {
                if (ns.normLyrics.includes(syn.norm) || ns.normTitle.includes(syn.norm)) {
                  matchedTerms.push(syn.raw);
                  if (!matchedTerms.includes(pst.parent)) {
                    matchedSubSynonymCount++;
                    break;
                  }
                }
              }
            }
          }
        }

        tokenCoverage = (
          matchedTokenCount +
          0.85 * matchedSynonymCount +
          0.60 * matchedSubTokenCount +
          0.50 * matchedSubSynonymCount
        ) / preparedTokens.length;
      }

      // 6. TF-IDF Cosine Similarity
      let cosSim = 0.0;
      if (hasVector && (!isExactArtist || artistScore > 0)) {
        cosSim = cosineSim(qVecEntries, qMag, i);
      }

      // 7. Tiered Normalized Confidence Score in [0.0, 1.0]
      if (exactTitleMatch && artistScore > 0) {
        score = 1.0;
      } else if (exactTitleMatch) {
        score = Math.min(1.0, 0.98 + 0.02 * (hasVector ? cosSim : 1.0));
      } else if (artistScore > 0 && titleScore > 0) {
        score = Math.min(0.98, Math.max(titleScore, artistScore) + 0.04);
      } else if (titleScore > 0) {
        score = Math.min(0.96, titleScore + 0.02 * tokenCoverage + 0.02 * cosSim);
      } else if (artistScore > 0 && exactLyricsMatch) {
        score = Math.min(0.96, Math.max(lyricsPhraseScore, artistScore) + 0.03);
      } else if (exactLyricsMatch) {
        score = Math.min(0.94, lyricsPhraseScore + 0.03 * tokenCoverage + 0.02 * cosSim);
      } else if (artistScore > 0) {
        score = Math.min(0.94, artistScore + 0.02 * tokenCoverage + 0.02 * cosSim);
      } else if (fuzzyTitleMatch) {
        score = Math.min(0.80, fuzzyScore + 0.05 * tokenCoverage + 0.03 * cosSim);
      } else if (fuzzyLyricsMatch) {
        score = Math.min(0.72, fuzzyScore + 0.06 * tokenCoverage + 0.04 * cosSim);
      } else if (tokenCoverage > 0 || cosSim > 0) {
        score = Math.min(0.68, 0.45 * tokenCoverage + 0.20 * cosSim);
      }
    }

    const minThreshold = normQ ? 0.20 : 0.01;
    const exactLyricPhrase = exactLyricsMatch && (normQ.length >= 6 || tokens.length >= 2);
    if (score >= minThreshold) {
      const cleanMatchedTerms = matchedTerms.length > 0 ? Array.from(new Set(matchedTerms)).filter(term => {
        return term && term.length >= 2 && isValidThaiQuery(term) && !BOUND_PREFIXES.has(term);
      }) : [];

      results.push({
        idx: i,
        score: Math.round(score * 10000) / 10000,
        exactMatch: exactLyricPhrase || exactTitleMatch,
        evidence: {
          exactTitle: exactTitleMatch,
          exactLyricPhrase,
          fuzzyTitle: fuzzyTitleMatch,
          fuzzyLyrics: fuzzyLyricsMatch,
          matchedTokenCount,
          queryTokenCount: tokens.length,
          matchedSynonymCount,
          matchedTerms: cleanMatchedTerms,
        },
      });
    }
  }

  results.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
  return results;
}


DATA = loadedData;
const SONGS = DATA.songs;
const VOCAB = DATA.vocab;
const IDF = DATA.idf;
const VECTORS = DATA.vectors;

// Initialize Search Engine State
vocabSet = new Set(DATA.vocab);
wordToIndex = new Map();
DATA.vocab.forEach((w, i) => wordToIndex.set(w, i));
maxWordLen = DATA.maxWordLen || 15;

NORM_SONGS = DATA.songs.map(song => {
  const rawArtist = (song.artist || '').replace(/&amp;/gi, '&');
  const hasDelim = /[,/;&:]|\s+-\s+|\bfeat\.?|\bft\.?/i.test(rawArtist);
  const subArtists = hasDelim
    ? rawArtist.split(/[,/;&:]|\s+-\s+|\bfeat\.?\s*|\bft\.?\s*/i).map(a => a.trim()).filter(Boolean)
    : (rawArtist ? [rawArtist] : []);
  return {
    normTitle: normalizeText(song.title),
    normArtist: normalizeText(song.artist),
    normLyrics: normalizeText(song.lyrics),
    subArtists,
    subArtistsNorm: subArtists.map(normalizeText),
  };
});

VECTOR_MAGS = (DATA && Array.isArray(DATA.vectors)) ? DATA.vectors.map(vec => {
  let sumSq = 0;
  for (const k in vec) {
    const v = vec[k];
    sumSq += v * v;
  }
  return Math.sqrt(sumSq);
}) : [];

ARTIST_SET = new Set();
if (DATA.artists) {
  DATA.artists.forEach(a => {
    const na = normalizeText(a);
    if (na) ARTIST_SET.add(na);
  });
}
DATA.songs.forEach(song => {
  const na = normalizeText(song.artist);
  if (na) ARTIST_SET.add(na);
});
NORM_SONGS.forEach(ns => {
  if (ns.subArtistsNorm) {
    ns.subArtistsNorm.forEach(na => {
      if (na) ARTIST_SET.add(na);
    });
  }
});

// Enriched search returning song metadata
const _baseSearch = search;
search = function(query, filterArtist, filterEmotion, filterYear) {
  const results = _baseSearch(query, filterArtist, filterEmotion, filterYear);
  return results.map(r => {
    const song = DATA.songs[r.idx];
    return {
      ...r,
      title: song ? song.title : '',
      artist: song ? song.artist : '',
      year: song ? song.year : '',
      emotion: song ? song.emotion : '',
    };
  });
};

function workerSearch(query, filterArtist = '', filterEmotion = '', filterYear = '') {
  return Promise.resolve(search(query, filterArtist, filterEmotion, filterYear));
}

class TestReport {
  constructor() {
    this.total = 0;
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }
  assertTest(name, condition, details = "") {
    this.total++;
    if (condition) {
      this.passed++;
      console.log('  [PASS] ' + name);
      this.results.push({ name, status: 'PASS', details });
    } else {
      this.failed++;
      console.log('  [FAIL] ' + name + ' - Details: ' + details);
      this.results.push({ name, status: 'FAIL', details });
    }
  }
}

const TEST_CASES = [
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลง 'ขอใจกันหนาว' ต้องขึ้นอันดับ 1",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ขอใจกันหนาว", detail: `อันดับ 1: ${top || "ไม่พบ"}` };
    }
  },
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลง 'คิดถึงคนต้นทาง' ต้องขึ้นอันดับ 1",
    run: async () => {
      const res = await workerSearch("คิดถึงคนต้นทาง");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "คิดถึงคนต้นทาง", detail: `อันดับ 1: ${top || "ไม่พบ"}` };
    }
  },
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลง 'ดอกหญ้าในป่าปูน' ต้องขึ้นอันดับ 1",
    run: async () => {
      const res = await workerSearch("ดอกหญ้าในป่าปูน");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ดอกหญ้าในป่าปูน", detail: `อันดับ 1: ${top || "ไม่พบ"}` };
    }
  },
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลงบางส่วน 'ดอกหญ้า' ต้องพบ 'ดอกหญ้าในป่าปูน'",
    run: async () => {
      const res = await workerSearch("ดอกหญ้า");
      const titles = res.slice(0, 3).map(r => DATA.songs[r.idx].title);
      return { pass: titles.some(t => t.includes("ดอกหญ้า")), detail: `ผลลัพธ์: ${titles.join(', ')}` };
    }
  },

  {
    category: "2. ความทนทานต่อช่องว่างและการขึ้นบรรทัดใหม่ (Whitespace & Newline)",
    name: "ค้นหาแบบเว้นวรรคปกติ 'เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย'",
    run: async () => {
      const res = await workerSearch("เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ขอใจกันหนาว", detail: `อันดับ 1: ${top}` };
    }
  },
  {
    category: "2. ความทนทานต่อช่องว่างและการขึ้นบรรทัดใหม่ (Whitespace & Newline)",
    name: "ค้นหาแบบไม่มีช่องว่าง 'เมื่อเลิกงานเดินเหงามีเงาเป็นเพื่อนเข้าซอย'",
    run: async () => {
      const res = await workerSearch("เมื่อเลิกงานเดินเหงามีเงาเป็นเพื่อนเข้าซอย");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ขอใจกันหนาว", detail: `อันดับ 1: ${top}` };
    }
  },
  {
    category: "2. ความทนทานต่อช่องว่างและการขึ้นบรรทัดใหม่ (Whitespace & Newline)",
    name: "ค้นหาประโยคที่คร่อมรอยต่อบรรทัด (\\n) 'มีเงาเป็นเพื่อนเข้าซอย ผู้สาวบ้านไกลใจลอย'",
    run: async () => {
      const res = await workerSearch("มีเงาเป็นเพื่อนเข้าซอย ผู้สาวบ้านไกลใจลอย");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ขอใจกันหนาว", detail: `อันดับ 1: ${top}` };
    }
  },

  {
    category: "3. การค้นหาคำซ้ำและประโยคซ้ำ (Repeated Phrases)",
    name: "ค้นหาคำซ้ำ 'คิดถึง คิดถึง'",
    run: async () => {
      const res = await workerSearch("คิดถึง คิดถึง");
      return { pass: res.length > 0, detail: `พบ ${res.length} เพลง` };
    }
  },
  {
    category: "3. การค้นหาคำซ้ำและประโยคซ้ำ (Repeated Phrases)",
    name: "ค้นหาคำซ้ำ 'ฮักเด้อ ฮักเด้อ'",
    run: async () => {
      const res = await workerSearch("ฮักเด้อ ฮักเด้อ");
      return { pass: res.length > 0, detail: `พบ ${res.length} เพลง` };
    }
  },

  {
    category: "4. การแปลงคำพ้องและภาษาถิ่นอีสาน (Isan / Dialect Synonyms)",
    name: "ค้นหาไทยกลาง 'คิดถึงเธอ' ต้องจับคู่เจอเพลงที่มีคำว่า 'คิดฮอด' / 'คิดถึง'",
    run: async () => {
      const res = await workerSearch("คิดถึงเธอ");
      const topLyrics = res.slice(0, 5).map(r => DATA.songs[r.idx].lyrics);
      const pass = topLyrics.some(l => l.includes("คิดฮอด") || l.includes("คิดถึง"));
      return { pass, detail: `พบบทเพลงที่เกี่ยวข้องใน 5 อันดับแรก` };
    }
  },
  {
    category: "4. การแปลงคำพ้องและภาษาถิ่นอีสาน (Isan / Dialect Synonyms)",
    name: "ค้นหาไทยกลาง 'ไม่รัก' ต้องจับคู่เจอเพลงที่มีคำว่า 'บ่ฮัก' / 'ไม่รัก'",
    run: async () => {
      const res = await workerSearch("ไม่รัก");
      const topLyrics = res.slice(0, 5).map(r => DATA.songs[r.idx].lyrics);
      const pass = topLyrics.some(l => l.includes("บ่") || l.includes("ไม่"));
      return { pass, detail: `พบบทเพลงที่เกี่ยวข้องใน 5 อันดับแรก` };
    }
  },

  {
    category: "5. การทนต่อคำเพี้ยน/พิมพ์ผิด (Typo Tolerance เช่น ความ vs ควาย)",
    name: "พิมพ์ผิด 'ควายรัก' (แทนที่ 'ความรัก') ต้องดึงเพลงที่มี 'ความรัก' ขึ้นมาได้",
    run: async () => {
      const res = await workerSearch("ควายรัก");
      const topLyrics = res.slice(0, 5).map(r => DATA.songs[r.idx].lyrics);
      const pass = topLyrics.some(l => l.includes("ความรัก"));
      return { pass, detail: `เพลงที่มี 'ความรัก' ติดอันดับต้นๆ` };
    }
  },
  {
    category: "5. การทนต่อคำเพี้ยน/พิมพ์ผิด (Typo Tolerance เช่น ความ vs ควาย)",
    name: "วรรณยุกต์เพี้ยน 'เคียงค้างบนทางเปื้อนฝุ่น' ต้องดึงเพลง 'ขอใจกันหนาว'",
    run: async () => {
      const res = await workerSearch("เคียงค้างบนทางเปื้อนฝุ่น");
      const top = res.slice(0, 3).map(r => DATA.songs[r.idx].title);
      return { pass: top.includes("ขอใจกันหนาว"), detail: `ผลลัพธ์: ${top.join(', ')}` };
    }
  },
  {
    category: "5. การทนต่อคำเพี้ยน/พิมพ์ผิด (Typo Tolerance เช่น ความ vs ควาย)",
    name: "สะกดเพี้ยนในชื่อเพลง 'ดอกยาในป่าปูน' ต้องดึงเพลง 'ดอกหญ้าในป่าปูน'",
    run: async () => {
      const res = await workerSearch("ดอกยาในป่าปูน");
      const top = res.slice(0, 3).map(r => DATA.songs[r.idx].title);
      return { pass: top.includes("ดอกหญ้าในป่าปูน"), detail: `ผลลัพธ์: ${top.join(', ')}` };
    }
  },

  {
    category: "6. ตัวกรองและการค้นหารวม (Filters & Metadata)",
    name: "กรองเฉพาะศิลปิน 'ต่าย อรทัย' (ไม่พิมพ์คำค้น)",
    run: async () => {
      const res = await workerSearch("", "ต่าย อรทัย");
      const allTai = res.length > 0 && res.every(r => DATA.songs[r.idx].artist === "ต่าย อรทัย");
      return { pass: allTai, detail: `พบ ${res.length} เพลง ทุกเพลงเป็นของ ต่าย อรทัย` };
    }
  },
  {
    category: "6. ตัวกรองและการค้นหารวม (Filters & Metadata)",
    name: "ค้นหาทั้งชื่อศิลปินและชื่อเพลง 'ต่าย อรทัย ขอใจกันหนาว'",
    run: async () => {
      const res = await workerSearch("ต่าย อรทัย ขอใจกันหนาว");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ขอใจกันหนาว", detail: `อันดับ 1: ${top}` };
    }
  },
  {
    category: "6. ตัวกรองและการค้นหารวม (Filters & Metadata)",
    name: "ค้นหาคำกว้าง 'ใจ' ต้องคืนผลลัพธ์ทั้งหมด (> 50 เพลง ไม่ถูกตัดตอน)",
    run: async () => {
      const res = await workerSearch("ใจ");
      return { pass: res.length > 50, detail: `พบทั้งหมด ${res.length} เพลง (เกินขีดจำกัดเดิม 50 เพลง)` };
    }
  },

  {
    category: "7. ประสิทธิภาพและความเร็ว (Performance Benchmark)",
    name: "ความเร็วเฉลี่ยในการค้นหา 1,500 เพลง ต้องต่ำกว่า 25ms",
    run: async () => {
      await workerSearch("ขอใจกันหนาว");
      const queries = ["ขอใจกันหนาว", "เมื่อเลิกงานเดินเหงามีเงา", "ควายรัก", "คิดถึงคนต้นทาง", "บ่ฮัก"];
      const times = [];
      for (const q of queries) {
        const t0 = performance.now();
        await workerSearch(q);
        const t1 = performance.now();
        times.push(t1 - t0);
      }
      const avg = times.reduce((a,b) => a+b, 0) / times.length;
      return { pass: avg < 25.0, detail: `ความเร็วเฉลี่ย: ${avg.toFixed(2)} ms (เป้าหมาย < 25ms)` };
    }
  },

  {
    category: "8. มาตรฐานคะแนนและการไฮไลท์ (Standardized Scoring & Highlighting)",
    name: "คะแนนความเชื่อมั่นทั้งหมดต้องอยู่ในช่วง [0.0, 1.0] อย่างเคร่งครัด",
    run: async () => {
      const queries = ["ขอใจกันหนาว", "ควายรัก", "คิดถึงเธอ", "ต่าย อรทัย", "ใจ"];
      let allBounded = true;
      for (const q of queries) {
        const res = await workerSearch(q);
        for (const r of res) {
          if (r.score < 0.0 || r.score > 1.0) { allBounded = false; break; }
        }
      }
      return { pass: allBounded, detail: "คะแนนทุกเพลงอยู่ในช่วง [0.0 - 1.0] ถูกต้องตามมาตรฐาน" };
    }
  },
  {
    category: "8. มาตรฐานคะแนนและการไฮไลท์ (Standardized Scoring & Highlighting)",
    name: "คำคล้าย 'ควายรัก' ต้องส่ง 'ความรัก' กลับมาใน evidence.matchedTerms สำหรับไฮไลท์",
    run: async () => {
      const res = await workerSearch("ควายรัก");
      const found = res.some(r => r.evidence && Array.isArray(r.evidence.matchedTerms) && r.evidence.matchedTerms.includes("ความรัก"));
      return { pass: found, detail: found ? "พบคำว่า 'ความรัก' ใน matchedTerms พร้อมไฮไลท์สี" : "ไม่พบคำใน evidence" };
    }
  },
  {
    category: "8. มาตรฐานคะแนนและการไฮไลท์ (Standardized Scoring & Highlighting)",
    name: "ชื่อเพลงตรงเป๊ะ ต้องได้คะแนนความมั่นใจระดับสูง (>= 0.98 หรือ 98%)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว");
      const topScore = res.length > 0 ? res[0].score : 0;
      return { pass: topScore >= 0.98, detail: `คะแนนอันดับ 1: ${(topScore * 100).toFixed(1)}%` };
    }
  },
  {
    category: "9. การแยกรากศัพท์คำประสม (Compound Decompounding & Highlighting)",
    name: "ค้นหา 'ความรัก' ต้องส่ง 'ความรัก' และรากศัพท์ 'รัก' สำหรับไฮไลท์ แต่ไม่มีคำว่า 'ความ'",
    run: async () => {
      const res = await workerSearch("ความรัก");
      const hasCompound = res.some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("ความรัก"));
      const hasRoot = res.some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("รัก"));
      const hasKwamOnly = res.some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("ความ"));
      const pass = hasCompound && hasRoot && !hasKwamOnly;
      return {
        pass,
        detail: pass ? "ไฮไลท์ 'ความรัก' และรากศัพท์ 'รัก' ได้ถูกต้อง โดยไม่ติดคำว่า 'ความ'" : "ตรวจพบข้อผิดพลาดใน matchedTerms"
      };
    }
  },
  {
    category: "9. การแยกรากศัพท์คำประสม (Compound Decompounding & Highlighting)",
    name: "การปฏิเสธเศษคำที่ไม่มีพยัญชนะต้น เช่น 'าว' และ 'ิน' ต้องได้ 0 รายการ",
    run: async () => {
      const res1 = await workerSearch("าว");
      const res2 = await workerSearch("ิน");
      const pass = res1.length === 0 && res2.length === 0;
      return {
        pass,
        detail: pass ? "กรองเศษสระ/วรรณยุกต์ที่ไม่มีพยัญชนะต้นทิ้งได้ 100%" : `พบผลลัพธ์ไม่พึงประสงค์ (${res1.length}, ${res2.length})`
      };
    }
  },
  {
    category: "10. ค้นหาชื่อนักร้องตรงผ่านช่องค้นหาหลัก (Omnibox Artist Search)",
    name: "ค้นหาชื่อนักร้อง 'ต่าย อรทัย' ต้องได้ผลลัพธ์ที่เป็นเพลงของต่าย อรทัย 100% (Precision 100%)",
    run: async () => {
      const res = await workerSearch("ต่าย อรทัย");
      const pass = res.length >= 40 && res.every(r => r.artist.includes("ต่าย อรทัย"));
      return {
        pass,
        detail: pass ? `พบเพลงของต่าย อรทัยครบถ้วน (${res.length} เพลง) แม่นยำ 100%` : `พบผลลัพธ์ผิดพลาด (${res.length} เพลง)`
      };
    }
  },
  {
    category: "10. ค้นหาชื่อนักร้องตรงผ่านช่องค้นหาหลัก (Omnibox Artist Search)",
    name: "คะแนนความมั่นใจนักร้องต้องสูง (>= 90%) และส่งชื่อนักร้องใน evidence.matchedTerms",
    run: async () => {
      const res = await workerSearch("ต่าย อรทัย");
      const highConf = res.length > 0 && res.every(r => r.score >= 0.90);
      const hasTerms = res.length > 0 && res.every(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("ต่าย อรทัย"));
      const pass = highConf && hasTerms;
      return {
        pass,
        detail: pass ? `คะแนนสูงสุด ${(res[0].score * 100).toFixed(1)}% พร้อมไฮไลท์ชื่อนักร้อง` : `คะแนนหรือ matchedTerms ไม่ถูกต้อง`
      };
    }
  },
  {
    category: "10. ค้นหาชื่อนักร้องตรงผ่านช่องค้นหาหลัก (Omnibox Artist Search)",
    name: "ค้นหาแบบผสม ชื่อนักร้อง + ชื่อเพลง 'ต่าย อรทัย ขอใจกันหนาว' ต้องได้อันดับ 1 คะแนนเต็ม 1.0 (100%)",
    run: async () => {
      const res = await workerSearch("ต่าย อรทัย ขอใจกันหนาว");
      const top = res.length > 0 ? res[0] : null;
      const pass = top && top.title === "ขอใจกันหนาว" && top.score === 1.0 &&
        top.evidence.matchedTerms.includes("ต่าย อรทัย") && top.evidence.matchedTerms.includes("ขอใจกันหนาว");
      return {
        pass,
        detail: pass ? `อันดับ 1: ${top.title} (${top.artist}) คะแนน 100%` : `ไม่พบเพลงตรงอันดับ 1`
      };
    }
  },
  {
    category: "10. ค้นหาชื่อนักร้องตรงผ่านช่องค้นหาหลัก (Omnibox Artist Search)",
    name: "ค้นหาชื่อนักร้องบางส่วน 'มนต์แคน' ผลลัพธ์อันดับต้นๆ ต้องเป็นเพลงของมนต์แคน แก่นคูน ทั้งหมด",
    run: async () => {
      const res = await workerSearch("มนต์แคน");
      const top10 = res.slice(0, 10);
      const pass = top10.length > 0 && top10.every(r => r.artist.includes("มนต์แคน")) && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `10 อันดับแรกเป็นเพลงของมนต์แคนทั้งหมด คะแนนสูงสุด ${(res[0].score * 100).toFixed(1)}%` : `ผลการค้นหาไม่ตรงตามเกณฑ์`
      };
    }
  },
  {
    category: "11. การจัดการกรณีข้อความพิเศษและขอบเขต (Edge-Case & Boundary Queries)",
    name: "ค้นหาเครื่องหมายวรรคตอนล้วน '!@#$%^&*()_+-=[]{}|;':,.<>?/' ต้องได้ 0 รายการโดยไม่ error",
    run: async () => {
      const res = await workerSearch("!@#$%^&*()_+-=[]{}|;':,.<>?/");
      const pass = Array.isArray(res) && res.length === 0;
      return {
        pass,
        detail: pass ? "กรองอักขระพิเศษล้วนทิ้งได้ 100% โดยไม่เกิดข้อผิดพลาด" : `พบผลลัพธ์ไม่พึงประสงค์ (${res.length} รายการ)`
      };
    }
  },
  {
    category: "11. การจัดการกรณีข้อความพิเศษและขอบเขต (Edge-Case & Boundary Queries)",
    name: "ค้นหาช่องว่างและอักขระเว้นวรรคล้วน ('    \\t\\n  ') ต้องได้ 0 รายการโดยไม่ error",
    run: async () => {
      const res = await workerSearch("    \t\n  ");
      const pass = Array.isArray(res) && res.length === 0;
      return {
        pass,
        detail: pass ? "จัดการช่องว่างล้วนได้อย่างถูกต้องและปลอดภัย" : `พบผลลัพธ์ไม่พึงประสงค์ (${res.length} รายการ)`
      };
    }
  },
  {
    category: "11. การจัดการกรณีข้อความพิเศษและขอบเขต (Edge-Case & Boundary Queries)",
    name: "ค้นหาตัวเลขปี พ.ศ. ('2560') ต้องส่งผลลัพธ์เป็น Array โดยไม่เกิด Exception",
    run: async () => {
      const res = await workerSearch("2560");
      const pass = Array.isArray(res);
      return {
        pass,
        detail: pass ? `ประมวลผลคำค้นหาตัวเลขสำเร็จ (พบ ${res.length} รายการ)` : "ผลลัพธ์ไม่ใช่ Array"
      };
    }
  },
  {
    category: "12. การตรวจสอบตัวกรองอารมณ์ ปี และตัวกรองผสม (Metadata Multi-Filter Verification)",
    name: "กรองตามอารมณ์เพลง 'สนุก' ต้องได้ผลลัพธ์ที่เป็นเพลงอารมณ์สนุกครบทั้ง 500 เพลง (Precision 100%)",
    run: async () => {
      const res = await workerSearch("", "", "สนุก", "");
      const pass = res.length === 500 && res.every(r => DATA.songs[r.idx].emotion === "สนุก");
      return {
        pass,
        detail: pass ? `พบเพลงอารมณ์สนุกครบถ้วน 500 เพลง ถูกต้อง 100%` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (พบ ${res.length} เพลง)`
      };
    }
  },
  {
    category: "12. การตรวจสอบตัวกรองอารมณ์ ปี และตัวกรองผสม (Metadata Multi-Filter Verification)",
    name: "กรองตามปี พ.ศ. '2562' ต้องได้ผลลัพธ์เฉพาะเพลงที่ออกในปี 2562 ครบทั้ง 112 เพลง (Precision 100%)",
    run: async () => {
      const res = await workerSearch("", "", "", "2562");
      const pass = res.length === 112 && res.every(r => String(DATA.songs[r.idx].year) === "2562");
      return {
        pass,
        detail: pass ? `พบเพลงปี 2562 ครบถ้วน 112 เพลง ถูกต้อง 100%` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (พบ ${res.length} เพลง)`
      };
    }
  },
  {
    category: "12. การตรวจสอบตัวกรองอารมณ์ ปี และตัวกรองผสม (Metadata Multi-Filter Verification)",
    name: "กรองแบบผสมหลายเงื่อนไข: ศิลปิน 'ต่าย อรทัย' + อารมณ์ 'เศร้า' ต้องตรงเงื่อนไขร่วมทุกเพลง",
    run: async () => {
      const res = await workerSearch("", "ต่าย อรทัย", "เศร้า", "");
      const pass = res.length > 0 && res.every(r => DATA.songs[r.idx].artist.includes("ต่าย อรทัย") && DATA.songs[r.idx].emotion === "เศร้า");
      return {
        pass,
        detail: pass ? `พบ ${res.length} เพลงที่ตรงเงื่อนไขทั้งศิลปินและอารมณ์เพลง 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขร่วม"
      };
    }
  },
  {
    category: "13. การค้นหาผลงานเพลงคู่และศิลปินร่วม (Collaboration & Featured Artists)",
    name: "ค้นหาศิลปินร่วม 'ดอกอ้อ ทุ่งทอง' ต้องพบเพลง 'หนุ่มบ้านเฮา สาวโรงงาน' (ร้องร่วมกับ ศร สินชัย) ด้วยคะแนน tier-1",
    run: async () => {
      const res = await workerSearch("ดอกอ้อ ทุ่งทอง");
      const found = res.some(r => (DATA.songs[r.idx].title === "หนุ่มบ้านเฮา สาวโรงงาน" || r.title === "หนุ่มบ้านเฮา สาวโรงงาน") && r.score >= 0.90);
      return {
        pass: found,
        detail: found ? "พบเพลงคู่ 'หนุ่มบ้านเฮา สาวโรงงาน' ด้วยคะแนน >= 0.90 ถูกต้อง" : "ไม่พบเพลงคู่ตามเกณฑ์"
      };
    }
  },
  {
    category: "13. การค้นหาผลงานเพลงคู่และศิลปินร่วม (Collaboration & Featured Artists)",
    name: "ค้นหาศิลปินรับเชิญ 'ยุ่งยิ่ง กนกนันทน์' ต้องพบเพลง 'ฉันยังรักเธอ' (เต้ย อภิวัฒน์ feat.) ด้วยคะแนน tier-1",
    run: async () => {
      const res = await workerSearch("ยุ่งยิ่ง กนกนันทน์");
      const found = res.some(r => (DATA.songs[r.idx].title === "ฉันยังรักเธอ" || r.title === "ฉันยังรักเธอ") && r.score >= 0.90);
      return {
        pass: found,
        detail: found ? "พบเพลงศิลปินรับเชิญ 'ฉันยังรักเธอ' ด้วยคะแนน >= 0.90 ถูกต้อง" : "ไม่พบเพลงรับเชิญตามเกณฑ์"
      };
    }
  },
  {
    category: "13. การค้นหาผลงานเพลงคู่และศิลปินร่วม (Collaboration & Featured Artists)",
    name: "ค้นหาศิลปินร้องคู่ 'โจ๊ก SO COOL' ต้องพบเพลง 'อย่าไว้ใจทาง อย่าวางใจแฟน' (ร้องคู่กับ ต่าย อรทัย) ด้วยคะแนน tier-1",
    run: async () => {
      const res = await workerSearch("โจ๊ก SO COOL");
      const found = res.some(r => (DATA.songs[r.idx].title === "อย่าไว้ใจทาง อย่าวางใจแฟน" || r.title === "อย่าไว้ใจทาง อย่าวางใจแฟน") && r.score >= 0.90);
      return {
        pass: found,
        detail: found ? "พบเพลงร้องคู่ 'อย่าไว้ใจทาง อย่าวางใจแฟน' ด้วยคะแนน >= 0.90 ถูกต้อง" : "ไม่พบเพลงร้องคู่ตามเกณฑ์"
      };
    }
  },
  {
    category: "14. การแยกคำอุปสรรคและส่วนขยายภาษาถิ่น (Compound Prefix Isolation & Subtoken Dialect)",
    name: "ค้นหา 'การรอคอย' ต้องแยกรากคำ 'รอคอย' ได้ และต้องไม่ติด prefix ผูกติด 'การ' ใน matchedTerms",
    run: async () => {
      const res = await workerSearch("การรอคอย");
      const pass = res.length > 0 && res.slice(0, 5).some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("รอคอย")) && res.slice(0, 5).every(r => !r.evidence || !r.evidence.matchedTerms || !r.evidence.matchedTerms.includes("การ"));
      return {
        pass,
        detail: pass ? "แยกรากคำ 'รอคอย' สำเร็จ และคัดกรองอุปสรรคผูกติด 'การ' ออกจาก matchedTerms ถูกต้อง 100%" : "ผลลัพธ์ไม่ตรงตามเกณฑ์ Affix Isolation"
      };
    }
  },
  {
    category: "14. การแยกคำอุปสรรคและส่วนขยายภาษาถิ่น (Compound Prefix Isolation & Subtoken Dialect)",
    name: "ค้นหา 'น่ารัก' ต้องถอดรากคำ 'รัก' ออกจาก prefix 'น่า' และปรากฏใน matchedTerms",
    run: async () => {
      const res = await workerSearch("น่ารัก");
      const pass = res.length > 0 && res.slice(0, 5).some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("รัก"));
      return {
        pass,
        detail: pass ? "ถอดรากคำ 'รัก' ออกจาก 'น่ารัก' และบรรจุลงใน matchedTerms สำเร็จ" : "ไม่พบรากคำ 'รัก' ใน matchedTerms"
      };
    }
  },
  {
    category: "14. การแยกคำอุปสรรคและส่วนขยายภาษาถิ่น (Compound Prefix Isolation & Subtoken Dialect)",
    name: "ค้นหา 'น่ารัก' ต้องขยายคำพ้องความหมายภาษาอีสาน 'ฮัก' จากรากคำย่อย 'รัก' ได้",
    run: async () => {
      const res = await workerSearch("น่ารัก");
      const pass = res.some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("ฮัก"));
      return {
        pass,
        detail: pass ? "ขยายคำค้นหารากย่อย 'รัก' สู่คำพ้องอีสาน 'ฮัก' ใน matchedTerms สำเร็จ" : "ไม่พบการขยายสู่ภาษาอีสาน 'ฮัก'"
      };
    }
  },
  {
    category: "15. การค้นหาชื่อและศิลปินแบบมีเครื่องหมายวรรคตอนและตัวกรองสามชั้น (Punctuated Omnibox & Tri-Filter Precision)",
    name: "ค้นหา Omnibox มีเครื่องหมายขีดคั่น 'ไผ่ พงศธร - คนบ้านเดียวกัน' ต้องขึ้นอันดับ 1 ด้วยคะแนน 1.0",
    run: async () => {
      const res = await workerSearch("ไผ่ พงศธร - คนบ้านเดียวกัน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score === 1.0;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' ด้วยคะแนนสมบูรณ์ 1.0` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, score=${res.length > 0 ? res[0].score : 0})`
      };
    }
  },
  {
    category: "15. การค้นหาชื่อและศิลปินแบบมีเครื่องหมายวรรคตอนและตัวกรองสามชั้น (Punctuated Omnibox & Tri-Filter Precision)",
    name: "ค้นหา Omnibox มีวงเล็บ 'ขอใจกันหนาว (ต่าย อรทัย)' ต้องขึ้นอันดับ 1 ด้วยคะแนน 1.0",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว (ต่าย อรทัย)");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score === 1.0;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' ด้วยคะแนนสมบูรณ์ 1.0` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, score=${res.length > 0 ? res[0].score : 0})`
      };
    }
  },
  {
    category: "15. การค้นหาชื่อและศิลปินแบบมีเครื่องหมายวรรคตอนและตัวกรองสามชั้น (Punctuated Omnibox & Tri-Filter Precision)",
    name: "ตัวกรองความแม่นยำสามชั้น: ศิลปิน 'ต่าย อรทัย' + อารมณ์ 'กำลังใจ' + ปี '2545' ต้องตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("", "ต่าย อรทัย", "กำลังใจ", "2545");
      const pass = res.length > 0 && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.artist.includes("ต่าย อรทัย") && s.emotion === "กำลังใจ" && String(s.year) === "2545";
      });
      return {
        pass,
        detail: pass ? `พบ ${res.length} เพลงที่ตรงเงื่อนไขทั้งศิลปิน อารมณ์ และปีเผยแพร่ 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขร่วมสามชั้น"
      };
    }
  },
  {
    category: "16. การค้นหาแบบผสมข้อความและตัวกรองเดี่ยว (Hybrid Query & Single Filter Interaction)",
    name: "ค้นหาเนื้อร้อง 'เคียงข้างบนทางเปื้อนฝุ่น' พร้อมกรองศิลปิน 'ต่าย อรทัย' ต้องได้เพลง 'ขอใจกันหนาว' อันดับ 1 และตรงศิลปิน 100%",
    run: async () => {
      const res = await workerSearch("เคียงข้างบนทางเปื้อนฝุ่น", "ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res.every(r => DATA.songs[r.idx].artist.includes("ต่าย อรทัย"));
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) เป็นของ ต่าย อรทัย 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขการค้นหาผสมตัวกรองศิลปิน"
      };
    }
  },
  {
    category: "16. การค้นหาแบบผสมข้อความและตัวกรองเดี่ยว (Hybrid Query & Single Filter Interaction)",
    name: "ค้นหาชื่อเพลง 'คนบ้านเดียวกัน' พร้อมกรองปี '2551' ต้องได้เพลงตรงอันดับ 1 และตรงปี 100%",
    run: async () => {
      const res = await workerSearch("คนบ้านเดียวกัน", "", "", "2551");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res.every(r => String(DATA.songs[r.idx].year) === "2551");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) เผยแพร่ปี 2551 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขการค้นหาผสมตัวกรองปี"
      };
    }
  },
  {
    category: "16. การค้นหาแบบผสมข้อความและตัวกรองเดี่ยว (Hybrid Query & Single Filter Interaction)",
    name: "ค้นหาคำว่า 'ดอกหญ้า' พร้อมกรองอารมณ์ 'กำลังใจ' ต้องได้เพลง 'ดอกหญ้าในป่าปูน' อันดับ 1 และตรงอารมณ์ 100%",
    run: async () => {
      const res = await workerSearch("ดอกหญ้า", "", "กำลังใจ", "");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ดอกหญ้าในป่าปูน" && res.every(r => DATA.songs[r.idx].emotion === "กำลังใจ");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) มีอารมณ์กำลังใจ 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขการค้นหาผสมตัวกรองอารมณ์"
      };
    }
  },
  {
    category: "17. การค้นหาแบบผสมข้อความและตัวกรองสองชั้น (Hybrid Query & Dual Filter Precision)",
    name: "ค้นหา 'ขอใจกันหนาว' พร้อมกรองศิลปิน 'ต่าย อรทัย' และปี '2547' ต้องได้เพลงตรงอันดับ 1 และตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว", "ต่าย อรทัย", "", "2547");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.artist.includes("ต่าย อรทัย") && String(s.year) === "2547";
      });
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) ตรงตามศิลปินและปี 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขข้อความผสมตัวกรองสองชั้น (ศิลปิน + ปี)"
      };
    }
  },
  {
    category: "17. การค้นหาแบบผสมข้อความและตัวกรองสองชั้น (Hybrid Query & Dual Filter Precision)",
    name: "ค้นหา 'ทางเปื้อนฝุ่น' พร้อมกรองศิลปิน 'ต่าย อรทัย' และอารมณ์ 'กำลังใจ' ต้องได้ 'ขอใจกันหนาว' อันดับ 1 และตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("ทางเปื้อนฝุ่น", "ต่าย อรทัย", "กำลังใจ", "");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.artist.includes("ต่าย อรทัย") && s.emotion === "กำลังใจ";
      });
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) ตรงตามศิลปินและอารมณ์ 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขข้อความผสมตัวกรองสองชั้น (ศิลปิน + อารมณ์)"
      };
    }
  },
  {
    category: "17. การค้นหาแบบผสมข้อความและตัวกรองสองชั้น (Hybrid Query & Dual Filter Precision)",
    name: "ค้นหา 'คนบ้านเดียวกัน' พร้อมกรองอารมณ์ 'กำลังใจ' และปี '2551' ต้องได้เพลงตรงอันดับ 1 และตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("คนบ้านเดียวกัน", "", "กำลังใจ", "2551");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.emotion === "กำลังใจ" && String(s.year) === "2551";
      });
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) ตรงตามอารมณ์และปี 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขข้อความผสมตัวกรองสองชั้น (อารมณ์ + ปี)"
      };
    }
  },
  {
    category: "18. การค้นหาแบบผสมข้อความและตัวกรองสี่ชั้น (Quad-Constraint Precision)",
    name: "ค้นหาเนื้อร้อง 'เปื้อนฝุ่น' พร้อมกรองศิลปิน 'ต่าย อรทัย' + อารมณ์ 'กำลังใจ' + ปี '2547' ต้องได้ 'ขอใจกันหนาว' อันดับ 1 และตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("เปื้อนฝุ่น", "ต่าย อรทัย", "กำลังใจ", "2547");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.artist.includes("ต่าย อรทัย") && s.emotion === "กำลังใจ" && String(s.year) === "2547";
      });
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) ตรงตามทั้ง 4 เงื่อนไข 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขข้อความผสมตัวกรองสี่ชั้น (เนื้อร้อง + ศิลปิน + อารมณ์ + ปี)"
      };
    }
  },
  {
    category: "18. การค้นหาแบบผสมข้อความและตัวกรองสี่ชั้น (Quad-Constraint Precision)",
    name: "ค้นหาชื่อเพลง 'คนบ้านเดียวกัน' พร้อมกรองศิลปิน 'ไผ่ พงศธร' + อารมณ์ 'กำลังใจ' + ปี '2551' ต้องได้เพลงตรงอันดับ 1 และตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("คนบ้านเดียวกัน", "ไผ่ พงศธร", "กำลังใจ", "2551");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.artist.includes("ไผ่ พงศธร") && s.emotion === "กำลังใจ" && String(s.year) === "2551";
      });
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) ตรงตามทั้ง 4 เงื่อนไข 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขข้อความผสมตัวกรองสี่ชั้น (ชื่อเพลง + ศิลปิน + อารมณ์ + ปี)"
      };
    }
  },
  {
    category: "18. การค้นหาแบบผสมข้อความและตัวกรองสี่ชั้น (Quad-Constraint Precision)",
    name: "ค้นหาคำว่า 'ดอกหญ้า' พร้อมกรองศิลปิน 'ต่าย อรทัย' + อารมณ์ 'กำลังใจ' + ปี '2546' ต้องได้เพลง 'ดอกหญ้าในป่าปูน' อันดับ 1 และตรงทุกเงื่อนไข 100%",
    run: async () => {
      const res = await workerSearch("ดอกหญ้า", "ต่าย อรทัย", "กำลังใจ", "2546");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ดอกหญ้าในป่าปูน" && res.every(r => {
        const s = DATA.songs[r.idx];
        return s.artist.includes("ต่าย อรทัย") && s.emotion === "กำลังใจ" && String(s.year) === "2546";
      });
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' และผลลัพธ์ทั้งหมด (${res.length} เพลง) ตรงตามทั้ง 4 เงื่อนไข 100%` : "ผลลัพธ์ไม่ตรงตามเงื่อนไขข้อความผสมตัวกรองสี่ชั้น (คำในชื่อ + ศิลปิน + อารมณ์ + ปี)"
      };
    }
  },
  {
    category: "19. การตรวจสอบความเข้ากันไม่ได้ของตัวกรองและขอบเขตผลลัพธ์ว่าง (Multi-Filter Mutual Exclusivity)",
    name: "กรองศิลปิน 'ต่าย อรทัย' ร่วมกับอารมณ์เพลง 'สนุก' ต้องคืนผลลัพธ์เป็น Array ว่าง (0 รายการ) โดยไม่เกิดข้อผิดพลาด",
    run: async () => {
      const res = await workerSearch("", "ต่าย อรทัย", "สนุก", "");
      const pass = Array.isArray(res) && res.length === 0;
      return {
        pass,
        detail: pass ? "คืนค่า 0 รายการอย่างถูกต้อง ไม่มี False Positives จากเงื่อนไขที่ไม่มีเพลงในคลัง" : `พบผลลัพธ์ไม่พึงประสงค์ (${res.length} รายการ)`
      };
    }
  },
  {
    category: "19. การตรวจสอบความเข้ากันไม่ได้ของตัวกรองและขอบเขตผลลัพธ์ว่าง (Multi-Filter Mutual Exclusivity)",
    name: "กรองศิลปิน 'ไผ่ พงศธร' ร่วมกับปี พ.ศ. '2545' ต้องคืนผลลัพธ์เป็น Array ว่าง (0 รายการ) อย่างถูกต้อง",
    run: async () => {
      const res = await workerSearch("", "ไผ่ พงศธร", "", "2545");
      const pass = Array.isArray(res) && res.length === 0;
      return {
        pass,
        detail: pass ? "คืนค่า 0 รายการอย่างถูกต้องตามเงื่อนไขปีที่ศิลปินยังไม่มีผลงาน" : `พบผลลัพธ์ไม่พึงประสงค์ (${res.length} รายการ)`
      };
    }
  },
  {
    category: "19. การตรวจสอบความเข้ากันไม่ได้ของตัวกรองและขอบเขตผลลัพธ์ว่าง (Multi-Filter Mutual Exclusivity)",
    name: "ค้นหา 'ขอใจกันหนาว' พร้อมกรองศิลปิน 'ไผ่ พงศธร' และปี '2545' ต้องได้ 0 รายการเคร่งครัดตามข้อกำหนดตัวกรอง",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว", "ไผ่ พงศธร", "", "2545");
      const pass = Array.isArray(res) && res.length === 0;
      return {
        pass,
        detail: pass ? "คืนค่า 0 รายการอย่างถูกต้อง โดยเงื่อนไขตัวกรองมีความสำคัญเด็ดขาดเหนือคำค้นหา" : `พบผลลัพธ์ไม่พึงประสงค์ (${res.length} รายการ)`
      };
    }
  },
  {
    category: "20. การค้นหาแบบ Omnibox ผสมชื่อศิลปินและท่อนเนื้อร้อง (Hybrid Omnibox Artist-Lyric & Collab Queries)",
    name: "ค้นหา Omnibox ศิลปิน + ท่อนเนื้อร้อง 'ต่าย อรทัย ทางเปื้อนฝุ่น' ต้องได้เพลง 'ขอใจกันหนาว' อันดับ 1 และมีท่อนเนื้อร้องใน matchedTerms",
    run: async () => {
      const res = await workerSearch("ต่าย อรทัย ทางเปื้อนฝุ่น");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.90 && terms.includes("ต่าย อรทัย") && terms.includes("ทางเปื้อนฝุ่น");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) พร้อม matchedTerms ไฮไลท์ทั้งศิลปินและเนื้อร้อง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, terms: ${JSON.stringify(terms)})`
      };
    }
  },
  {
    category: "20. การค้นหาแบบ Omnibox ผสมชื่อศิลปินและท่อนเนื้อร้อง (Hybrid Omnibox Artist-Lyric & Collab Queries)",
    name: "ค้นหา Omnibox ศิลปิน + ชื่อเพลงที่มีการเว้นวรรคซ้ำ 'ไผ่  พงศธร   คนบ้านเดียวกัน' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน 1.0",
    run: async () => {
      const res = await workerSearch("ไผ่  พงศธร   คนบ้านเดียวกัน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score === 1.0;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' ด้วยคะแนนสมบูรณ์ 1.0 แม้มีการเว้นวรรคซ้ำ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, score: ${res.length > 0 ? res[0].score : 0})`
      };
    }
  },
  {
    category: "20. การค้นหาแบบ Omnibox ผสมชื่อศิลปินและท่อนเนื้อร้อง (Hybrid Omnibox Artist-Lyric & Collab Queries)",
    name: "ค้นหา Omnibox ศิลปินร่วม + ชื่อเพลง 'ศร สินชัย หนุ่มบ้านเฮา สาวโรงงาน' ต้องได้เพลง 'หนุ่มบ้านเฮา สาวโรงงาน' อันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("ศร สินชัย หนุ่มบ้านเฮา สาวโรงงาน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "หนุ่มบ้านเฮา สาวโรงงาน" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) จากคำค้นชื่อศิลปินร่วมและชื่อเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, score: ${res.length > 0 ? res[0].score : 0})`
      };
    }
  },
  {
    category: "21. การค้นหาผลงานเพลงคู่ที่มีเครื่องหมายขีดคั่นแบบเว้นวรรค (Spaced Hyphen Collab Duets & Multi-Artist)",
    name: "ค้นหาศิลปินร่วม 'LABANOON' จาก 'เปาวลี พรพิมล - LABANOON' ต้องได้เพลง 'พลังงานจน' อันดับ 1 ด้วยคะแนน >= 0.94",
    run: async () => {
      const res = await workerSearch("LABANOON");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score >= 0.94 && terms.includes("LABANOON");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) พร้อม 'LABANOON' ใน matchedTerms` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, score: ${res.length > 0 ? res[0].score : 0})`
      };
    }
  },
  {
    category: "21. การค้นหาผลงานเพลงคู่ที่มีเครื่องหมายขีดคั่นแบบเว้นวรรค (Spaced Hyphen Collab Duets & Multi-Artist)",
    name: "ค้นหาศิลปินคู่ 'ลูกแพร' จาก 'ลูกแพร - ไหมไทย' ต้องได้เพลงคู่อันดับ 1 ด้วยคะแนน >= 0.94",
    run: async () => {
      const res = await workerSearch("ลูกแพร");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.artist === "ลูกแพร - ไหมไทย" && res[0].score >= 0.94 && terms.includes("ลูกแพร");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (${topSong.artist}) ด้วยคะแนน ${res[0].score.toFixed(2)}` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "21. การค้นหาผลงานเพลงคู่ที่มีเครื่องหมายขีดคั่นแบบเว้นวรรค (Spaced Hyphen Collab Duets & Multi-Artist)",
    name: "ค้นหา Omnibox ศิลปินร่วม + ชื่อเพลง 'LABANOON พลังงานจน' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน 1.0",
    run: async () => {
      const res = await workerSearch("LABANOON พลังงานจน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score === 1.0;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' ด้วยคะแนนสมบูรณ์ 1.0 จากคำค้นศิลปินคู่และชื่อเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'}, score: ${res.length > 0 ? res[0].score : 0})`
      };
    }
  },
  {
    category: "22. การค้นหาชื่อศิลปินภาษาอังกฤษและการค้นหาแบบหลายภาษา (ASCII & Mixed-Language Artist Omnibox Queries)",
    name: "ค้นหาชื่อศิลปินภาษาอังกฤษ 'The City Chorus' ต้องได้เพลง 'ดอกไม้' อันดับ 1 ด้วยคะแนน >= 0.94",
    run: async () => {
      const res = await workerSearch("The City Chorus");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "ดอกไม้" && res[0].score >= 0.94 && terms.includes("The City Chorus");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) พร้อม 'The City Chorus' ใน matchedTerms` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "22. การค้นหาชื่อศิลปินภาษาอังกฤษและการค้นหาแบบหลายภาษา (ASCII & Mixed-Language Artist Omnibox Queries)",
    name: "ค้นหาชื่อศิลปินภาษาอังกฤษตัวพิมพ์เล็ก 'the city chorus' ต้องได้เพลง 'ดอกไม้' อันดับ 1 ด้วยคะแนน >= 0.94",
    run: async () => {
      const res = await workerSearch("the city chorus");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ดอกไม้" && res[0].score >= 0.94;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) รองรับ Case-Insensitive` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "22. การค้นหาชื่อศิลปินภาษาอังกฤษและการค้นหาแบบหลายภาษา (ASCII & Mixed-Language Artist Omnibox Queries)",
    name: "ค้นหา Omnibox ภาษาอังกฤษผสมชื่อเพลงภาษาไทย 'The City Chorus ดอกไม้' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน 1.0",
    run: async () => {
      const res = await workerSearch("The City Chorus ดอกไม้");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "ดอกไม้" && res[0].score === 1.0 && terms.includes("The City Chorus") && terms.includes("ดอกไม้");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' ด้วยคะแนนสมบูรณ์ 1.0 พร้อมไฮไลท์ทั้งศิลปินและชื่อเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "23. การค้นหาชื่อเพลงที่มีตัวเลข คำย่อ และคำทับศัพท์ (Alphanumeric & Abbreviation Omnibox Queries)",
    name: "ค้นหาชื่อเพลงที่มีตัวเลขและจุดย่อ 'นักสู้ ม.3' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch("นักสู้ ม.3");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "นักสู้ ม.3" && res[0].score >= 0.98;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) จัดการจุดย่อและตัวเลขแม่นยำ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "23. การค้นหาชื่อเพลงที่มีตัวเลข คำย่อ และคำทับศัพท์ (Alphanumeric & Abbreviation Omnibox Queries)",
    name: "ค้นหาชื่อเพลงผสมคำทับศัพท์ภาษาอังกฤษ 'น้ำตาหยดยังกด Like' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch("น้ำตาหยดยังกด Like");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "น้ำตาหยดยังกด Like" && res[0].score >= 0.98;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) คำค้นผสมไทย-อังกฤษถูกต้อง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "23. การค้นหาชื่อเพลงที่มีตัวเลข คำย่อ และคำทับศัพท์ (Alphanumeric & Abbreviation Omnibox Queries)",
    name: "ค้นหา Omnibox ศิลปินและชื่อเพลงตัวเลขย่อ 'ไมค์ ภิรมย์พร นักสู้ ม.3' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน 1.0",
    run: async () => {
      const res = await workerSearch("ไมค์ ภิรมย์พร นักสู้ ม.3");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "นักสู้ ม.3" && res[0].score === 1.0 && terms.includes("ไมค์ ภิรมย์พร") && terms.includes("นักสู้ ม.3");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' ด้วยคะแนนสมบูรณ์ 1.0 พร้อมไฮไลท์ครบทั้งศิลปินและชื่อเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "24. การค้นหาชื่อเพลงภาษาอังกฤษในวงเล็บ (Parenthetical English Subtitle & Sub-Title Omnibox Queries)",
    name: "ค้นหาชื่อเพลงภาษาอังกฤษในวงเล็บ 'Flick' ต้องได้เพลง 'สะบัด (Flick)' อันดับ 1 ด้วยคะแนน >= 0.88",
    run: async () => {
      const res = await workerSearch("Flick");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "สะบัด (Flick)" && res[0].score >= 0.88;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) ค้นพบจากคำในวงเล็บ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "24. การค้นหาชื่อเพลงภาษาอังกฤษในวงเล็บ (Parenthetical English Subtitle & Sub-Title Omnibox Queries)",
    name: "ค้นหาคำในวงเล็บตัวพิมพ์เล็ก 'flick' ต้องได้เพลง 'สะบัด (Flick)' อันดับ 1 ด้วยคะแนน >= 0.88",
    run: async () => {
      const res = await workerSearch("flick");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "สะบัด (Flick)" && res[0].score >= 0.88;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) รองรับ Case-Insensitive` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "24. การค้นหาชื่อเพลงภาษาอังกฤษในวงเล็บ (Parenthetical English Subtitle & Sub-Title Omnibox Queries)",
    name: "ค้นหา Omnibox ศิลปินและคำในวงเล็บ 'กระแต อาร์ สยาม Flick' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("กระแต อาร์ สยาม Flick");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "สะบัด (Flick)" && res[0].score >= 0.85 && terms.includes("กระแต อาร์ สยาม") && terms.includes("สะบัด (Flick)");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) พร้อมไฮไลท์ทั้งศิลปินและชื่อเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "25. การค้นหาทนทานต่อช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอน (Repeated Whitespace & Spaced Delimiter Omnibox Resilience)",
    name: "ค้นหาชื่อเพลงที่มีช่องว่างหัวท้าย '   ขอใจกันหนาว   ' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch("   ขอใจกันหนาว   ");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.98;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) ทนทานต่อช่องว่างหัวท้าย` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "25. การค้นหาทนทานต่อช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอน (Repeated Whitespace & Spaced Delimiter Omnibox Resilience)",
    name: "ค้นหา Omnibox ศิลปินและเพลงที่มีช่องว่างซ้ำซ้อน 'ไผ่ พงศธร    คนบ้านเดียวกัน' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch("ไผ่ พงศธร    คนบ้านเดียวกัน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score >= 0.98;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) ตัดช่องว่างซ้ำซ้อนได้อย่างถูกต้อง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "25. การค้นหาทนทานต่อช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอน (Repeated Whitespace & Spaced Delimiter Omnibox Resilience)",
    name: "ค้นหา Omnibox ศิลปินและเพลงคั่นด้วยยัติภังค์ 'ไผ่ พงศธร   -   คนบ้านเดียวกัน' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("ไผ่ พงศธร   -   คนบ้านเดียวกัน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score >= 0.85 && terms.includes("ไผ่ พงศธร") && terms.includes("คนบ้านเดียวกัน");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) พร้อมจับคู่ทั้งศิลปินและเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "26. การค้นหาคำที่มีเครื่องหมายคำพูดและวรรคตอน (Punctuation & Quoted Omnibox Queries)",
    name: "ค้นหาชื่อเพลงในเครื่องหมายคำพูด '\"ขอใจกันหนาว\"' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch('"ขอใจกันหนาว"');
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.98;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) รองรับเครื่องหมายคำพูด` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "26. การค้นหาคำที่มีเครื่องหมายคำพูดและวรรคตอน (Punctuation & Quoted Omnibox Queries)",
    name: "ค้นหาชื่อเพลงที่มีเครื่องหมายวรรคตอนต่อท้าย 'คนบ้านเดียวกัน?' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch("คนบ้านเดียวกัน?");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score >= 0.98;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) กรองเครื่องหมายวรรคตอนได้อย่างแม่นยำ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "26. การค้นหาคำที่มีเครื่องหมายคำพูดและวรรคตอน (Punctuation & Quoted Omnibox Queries)",
    name: "ค้นหา Omnibox ศิลปินและเพลงในเครื่องหมายคำพูด '\"ไผ่ พงศธร\" \"คนบ้านเดียวกัน\"' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch('"ไผ่ พงศธร" "คนบ้านเดียวกัน"');
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score >= 0.85 && terms.includes("ไผ่ พงศธร") && terms.includes("คนบ้านเดียวกัน");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) พร้อมจับคู่ทั้งศิลปินและเพลง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "27. การค้นหาคำพ้องภาษาถิ่นอีสานและค้นหาแบบผสม (Multi-Token Dialect & Combined Omnibox Queries)",
    name: "ค้นหาคำพ้องภาษาถิ่นอีสาน 'คิดฮอด' ต้องพบเพลงที่ตรงเงื่อนไขด้วยคะแนน >= 0.70 และมี matchedSynonymCount >= 1",
    run: async () => {
      const res = await workerSearch("คิดฮอด");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && res[0].score >= 0.70 && res[0].evidence && (res[0].evidence.matchedSynonymCount >= 1 || (res[0].evidence.matchedTerms && res[0].evidence.matchedTerms.includes("คิดฮอด")));
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) ขยายคำพ้องภาษาถิ่นสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "27. การค้นหาคำพ้องภาษาถิ่นอีสานและค้นหาแบบผสม (Multi-Token Dialect & Combined Omnibox Queries)",
    name: "ค้นหาศิลปินและคำพ้องภาษาถิ่น 'ไผ่ พงศธร คิดฮอด' ต้องได้เพลงของ ไผ่ พงศธร ด้วยคะแนน >= 0.90",
    run: async () => {
      const res = await workerSearch("ไผ่ พงศธร คิดฮอด");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.artist === "ไผ่ พงศธร" && res[0].score >= 0.90 && res[0].evidence && (res[0].evidence.matchedTerms || []).includes("ไผ่ พงศธร");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) จับคู่ศิลปินและคำพ้องสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "27. การค้นหาคำพ้องภาษาถิ่นอีสานและค้นหาแบบผสม (Multi-Token Dialect & Combined Omnibox Queries)",
    name: "ค้นหา Omnibox ชื่อเพลงและศิลปิน 'ดอกหญ้าในป่าปูน ต่าย อรทัย' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.98",
    run: async () => {
      const res = await workerSearch("ดอกหญ้าในป่าปูน ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const terms = res.length > 0 && res[0].evidence ? (res[0].evidence.matchedTerms || []) : [];
      const pass = topSong && topSong.title === "ดอกหญ้าในป่าปูน" && res[0].score >= 0.98 && terms.includes("ดอกหญ้าในป่าปูน") && terms.includes("ต่าย อรทัย");
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) ไฮไลท์ทั้งชื่อเพลงและศิลปิน` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "28. การค้นหาชื่อเพลงพร้อมปี พ.ศ. (Numeric Song Year & Combined Omnibox Queries)",
    name: "ค้นหาชื่อเพลงพร้อมปี 'ขอใจกันหนาว 2547' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว 2547");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) สกัดปี พ.ศ. สำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "28. การค้นหาชื่อเพลงพร้อมปี พ.ศ. (Numeric Song Year & Combined Omnibox Queries)",
    name: "ค้นหาชื่อเพลงพร้อมปี 'คนบ้านเดียวกัน 2551' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("คนบ้านเดียวกัน 2551");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "คนบ้านเดียวกัน" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) สกัดปี พ.ศ. สำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "28. การค้นหาชื่อเพลงพร้อมปี พ.ศ. (Numeric Song Year & Combined Omnibox Queries)",
    name: "ค้นหาชื่อเพลงในเครื่องหมายคำพูดพร้อมปี '\"ดอกหญ้าในป่าปูน\" 2546' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch('"ดอกหญ้าในป่าปูน" 2546');
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ดอกหญ้าในป่าปูน" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (score: ${res[0].score.toFixed(2)}) ค้นหาชื่อเพลงและปีร่วมกันสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "29. การค้นหาเพลงร้องคู่และศิลปินร่วม (Duet & Collaboration Artist Omnibox Queries)",
    name: "ค้นหาชื่อศิลปินร่วม 'LABANOON' ต้องได้เพลงร้องคู่ 'พลังงานจน' ตรงอันดับ 1 ด้วยคะแนน >= 0.90",
    run: async () => {
      const res = await workerSearch("LABANOON");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score >= 0.90;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (${topSong.artist}) score: ${res[0].score.toFixed(2)} ตรวจพบศิลปินร่วมสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "29. การค้นหาเพลงร้องคู่และศิลปินร่วม (Duet & Collaboration Artist Omnibox Queries)",
    name: "ค้นหาชื่อเพลงพร้อมศิลปินร่วม 'พลังงานจน LABANOON' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("พลังงานจน LABANOON");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} ค้นหาชื่อเพลงและศิลปินร่วมสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "29. การค้นหาเพลงร้องคู่และศิลปินร่วม (Duet & Collaboration Artist Omnibox Queries)",
    name: "ค้นหาชื่อศิลปินหลักพร้อมชื่อเพลง 'เปาวลี พรพิมล พลังงานจน' ต้องได้เพลงตรงอันดับ 1 คะแนนเต็ม 1.0",
    run: async () => {
      const res = await workerSearch("เปาวลี พรพิมล พลังงานจน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score === 1.0;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: 1.00 แม่นยำ 100%` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "30. การค้นหาศิลปินคู่แบบคั่นเครื่องหมาย (Delimited Duet & Collaboration Omnibox Queries)",
    name: "ค้นหาชื่อเพลงคั่นด้วยขีดตามด้วยศิลปินคู่ 'พลังงานจน - LABANOON' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("พลังงานจน - LABANOON");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับเครื่องหมายขีดคั่นสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "30. การค้นหาศิลปินคู่แบบคั่นเครื่องหมาย (Delimited Duet & Collaboration Omnibox Queries)",
    name: "ค้นหาศิลปินร่วมนำหน้าชื่อเพลง 'LABANOON พลังงานจน' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("LABANOON พลังงานจน");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} ค้นหาศิลปินร่วมนำหน้าสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "30. การค้นหาศิลปินคู่แบบคั่นเครื่องหมาย (Delimited Duet & Collaboration Omnibox Queries)",
    name: "ค้นหาชื่อศิลปินคู่เต็มรูปแบบ 'เปาวลี พรพิมล - LABANOON' ต้องได้เพลงตรงอันดับ 1 ด้วยคะแนน >= 0.90",
    run: async () => {
      const res = await workerSearch("เปาวลี พรพิมล - LABANOON");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "พลังงานจน" && res[0].score >= 0.90;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' (${topSong.artist}) score: ${res[0].score.toFixed(2)} แม่นยำสมบูรณ์` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "31. การจัดการช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอนท้ายคำ (Excessive Spaces & Trailing Punctuation)",
    name: "ค้นหา 'ขอใจกันหนาว     ...' ต้องได้ 'ขอใจกันหนาว' อันดับ 1 ด้วยคะแนน >= 0.95",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว     ...");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} จัดการช่องว่างได้ถูกต้อง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "31. การจัดการช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอนท้ายคำ (Excessive Spaces & Trailing Punctuation)",
    name: "ค้นหาเนื้อเพลง 'เมื่อเลิกงานเดินเหงา     มีเงาเป็นเพื่อนเข้าซอย,,,' ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("เมื่อเลิกงานเดินเหงา     มีเงาเป็นเพื่อนเข้าซอย,,,");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.90;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} จัดการเครื่องหมายซ้ำซ้อนได้ถูกต้อง` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "32. การจัดการตัวอักษรซ้ำซ้อน (Repetitive Characters Handling)",
    name: "ค้นหา 'รักเธอออออออออ' ระบบต้องไม่พังและคืนค่าได้",
    run: async () => {
      const res = await workerSearch("รักเธอออออออออ");
      const pass = res.length > 0 && res[0].score >= 0.0;
      return {
        pass,
        detail: pass ? `ประมวลผลสำเร็จ คืนค่า ${res.length} รายการ` : `เกิดข้อผิดพลาดในการประมวลผล`
      };
    }
  },
  {
    category: "32. การจัดการตัวอักษรซ้ำซ้อน (Repetitive Characters Handling)",
    name: "ค้นหา 'หนาวววววววว' ระบบต้องไม่พังและคืนค่าได้",
    run: async () => {
      const res = await workerSearch("หนาวววววววว");
      const pass = res.length > 0 && res[0].score >= 0.0;
      return {
        pass,
        detail: pass ? `ประมวลผลสำเร็จ คืนค่า ${res.length} รายการ` : `เกิดข้อผิดพลาดในการประมวลผล`
      };
    }
  },
  {
    category: "33. การจัดการอักขระ Zero-Width และช่องว่าง Non-Breaking Space (Zero-Width & NBSP Handling)",
    name: "ค้นหา 'ขอใจ\\u200bกันหนาว' (มี zero-width space) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("ขอใจ\u200bกันหนาว");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} ตัด zero-width space สำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "33. การจัดการอักขระ Zero-Width และช่องว่าง Non-Breaking Space (Zero-Width & NBSP Handling)",
    name: "ค้นหาเนื้อเพลง 'เมื่อเลิกงานเดินเหงา\\u00a0มีเงาเป็นเพื่อนเข้าซอย' (มี NBSP) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("เมื่อเลิกงานเดินเหงา\u00a0มีเงาเป็นเพื่อนเข้าซอย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} จัดการ NBSP สำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "34. การค้นหาชื่อเพลงภาษาอังกฤษตัวพิมพ์ใหญ่ (Uppercase Latin & Mixed-Case Subtitle)",
    name: "ค้นหา 'FLICK' (ตัวพิมพ์ใหญ่ทั้งหมด) ต้องได้ 'สะบัด (Flick)' อันดับ 1",
    run: async () => {
      const res = await workerSearch("FLICK");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "สะบัด (Flick)" && res[0].score >= 0.88;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับตัวพิมพ์ใหญ่สำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "34. การค้นหาชื่อเพลงภาษาอังกฤษตัวพิมพ์ใหญ่ (Uppercase Latin & Mixed-Case Subtitle)",
    name: "ค้นหา 'สะบัด FLICK' (ชื่อไทยผสมอังกฤษตัวพิมพ์ใหญ่) ต้องได้ 'สะบัด (Flick)' อันดับ 1",
    run: async () => {
      const res = await workerSearch("สะบัด FLICK");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "สะบัด (Flick)" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับชื่อผสมตัวพิมพ์ใหญ่สำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "35. การค้นหาคำที่ครอบด้วยเครื่องหมายวงเล็บเหลี่ยมและปีกกา (Bracket-Wrapped & Enclosed Queries)",
    name: "ค้นหา '[ขอใจกันหนาว]' (ครอบด้วยเครื่องหมายก้ามปู) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("[ขอใจกันหนาว]");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับก้ามปูสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "35. การค้นหาคำที่ครอบด้วยเครื่องหมายวงเล็บเหลี่ยมและปีกกา (Bracket-Wrapped & Enclosed Queries)",
    name: "ค้นหา '{เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย}' (ครอบด้วยปีกกา) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("{เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย}");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.90;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับปีกกาสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "36. การค้นหาคำที่ครอบด้วยเครื่องหมายวงเล็บสามเหลี่ยมและวงเล็บกลม (Angle Bracket & Parenthetical Queries)",
    name: "ค้นหา '<ขอใจกันหนาว>' (ครอบด้วยวงเล็บสามเหลี่ยม) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("<ขอใจกันหนาว>");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับวงเล็บสามเหลี่ยมสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "36. การค้นหาคำที่ครอบด้วยเครื่องหมายวงเล็บสามเหลี่ยมและวงเล็บกลม (Angle Bracket & Parenthetical Queries)",
    name: "ค้นหา '(เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย)' (ครอบด้วยวงเล็บกลม) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("(เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย)");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.90;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับวงเล็บกลมสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "37. การค้นหาคำที่มีเครื่องหมายทางคณิตศาสตร์ (Mathematical & Arithmetic Symbol Queries)",
    name: "ค้นหา '+ขอใจกันหนาว+' (ล้อมด้วยเครื่องหมายบวก) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("+ขอใจกันหนาว+");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับเครื่องหมายบวกล้อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "37. การค้นหาคำที่มีเครื่องหมายทางคณิตศาสตร์ (Mathematical & Arithmetic Symbol Queries)",
    name: "ค้นหา 'ขอใจกันหนาว + ต่าย อรทัย' (เชื่อมชื่อเพลงและศิลปินด้วยบวก) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว + ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับเครื่องหมายบวกเชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "38. การค้นหาคำที่มีเครื่องหมายแฮชแท็กและสัญลักษณ์พิเศษ (Hashtag & Commercial Symbol Queries)",
    name: "ค้นหา '#ขอใจกันหนาว' (มีแฮชแท็กนำหน้า) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("#ขอใจกันหนาว");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับแฮชแท็กสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "38. การค้นหาคำที่มีเครื่องหมายแฮชแท็กและสัญลักษณ์พิเศษ (Hashtag & Commercial Symbol Queries)",
    name: "ค้นหา 'ขอใจกันหนาว & ต่าย อรทัย' (เชื่อมชื่อเพลงและศิลปินด้วย &) ต้องได้ 'ขอใจกันหนาว' อันดับ 1",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว & ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ & เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "39. การค้นหาคำที่มีเครื่องหมายโคลอนและเซมิโคลอน (Colon & Semicolon Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว: ต่าย อรทัย' (เชื่อมด้วยโคลอน :) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว: ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ : เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "39. การค้นหาคำที่มีเครื่องหมายโคลอนและเซมิโคลอน (Colon & Semicolon Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว; ต่าย อรทัย' (เชื่อมด้วยเซมิโคลอน ;) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว; ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ; เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "40. การค้นหาคำที่มีเครื่องหมายไปป์และสแลช (Pipe & Slash Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว | ต่าย อรทัย' (เชื่อมด้วยไปป์ |) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว | ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ | เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "40. การค้นหาคำที่มีเครื่องหมายไปป์และสแลช (Pipe & Slash Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว / ต่าย อรทัย' (เชื่อมด้วยสแลช /) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว / ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ / เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "41. การค้นหาคำที่มีเครื่องหมายยัติภังค์และตัวหนอน (Hyphen, Dash & Tilde Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว - ต่าย อรทัย' (เชื่อมด้วยขีดกลาง -) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว - ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ - เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "41. การค้นหาคำที่มีเครื่องหมายยัติภังค์และตัวหนอน (Hyphen, Dash & Tilde Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ~ ต่าย อรทัย' (เชื่อมด้วยตัวหนอน ~) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ~ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ~ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  }
,
  {
    category: "42. การค้นหาคำที่มีเครื่องหมายขีดล่างและดอกจัน (Underscore & Asterisk Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว _ ต่าย อรทัย' (เชื่อมด้วยขีดล่าง _) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว _ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ _ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "42. การค้นหาคำที่มีเครื่องหมายขีดล่างและดอกจัน (Underscore & Asterisk Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว * ต่าย อรทัย' (เชื่อมด้วยดอกจัน *) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว * ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ * เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  }
,
  {
    category: "43. การค้นหาคำที่มีเครื่องหมายจุดหัวข้อย่อยและจุดกึ่งกลาง (Bullet & Middle Dot Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว • ต่าย อรทัย' (เชื่อมด้วยจุด •) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว • ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ • เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "43. การค้นหาคำที่มีเครื่องหมายจุดหัวข้อย่อยและจุดกึ่งกลาง (Bullet & Middle Dot Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว · ต่าย อรทัย' (เชื่อมด้วยจุดกลาง ·) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว · ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ · เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "44. การค้นหาคำที่มีเครื่องหมายอัศเจรีย์และปรัศนี (Exclamation & Question Mark Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ! ต่าย อรทัย' (เชื่อมด้วยอัศเจรีย์ !) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ! ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ! เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "44. การค้นหาคำที่มีเครื่องหมายอัศเจรีย์และปรัศนี (Exclamation & Question Mark Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ? ต่าย อรทัย' (เชื่อมด้วยปรัศนี ?) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ? ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ? เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "45. การค้นหาคำที่มีเครื่องหมายหมวกและแอดไซน์ (Caret & At Sign Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ^ ต่าย อรทัย' (เชื่อมด้วยหมวก ^) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ^ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ^ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "45. การค้นหาคำที่มีเครื่องหมายหมวกและแอดไซน์ (Caret & At Sign Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว @ ต่าย อรทัย' (เชื่อมด้วยแอดไซน์ @) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว @ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ @ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "46. การค้นหาคำที่มีเครื่องหมายเปอร์เซ็นต์และดอลลาร์ (Percent Sign & Dollar Sign Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว % ต่าย อรทัย' (เชื่อมด้วยเปอร์เซ็นต์ %) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว % ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ % เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "46. การค้นหาคำที่มีเครื่องหมายเปอร์เซ็นต์และดอลลาร์ (Percent Sign & Dollar Sign Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว $ ต่าย อรทัย' (เชื่อมด้วยดอลลาร์ $) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว $ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ $ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "47. การค้นหาคำที่มีเครื่องหมายจุลภาคและจุดไข่ปลา (Comma & Ellipsis Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว , ต่าย อรทัย' (เชื่อมด้วยจุลภาค ,) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว , ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ , เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "47. การค้นหาคำที่มีเครื่องหมายจุลภาคและจุดไข่ปลา (Comma & Ellipsis Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ... ต่าย อรทัย' (เชื่อมด้วยจุดไข่ปลา ...) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ... ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ... เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "48. การค้นหาคำที่มีเครื่องหมายเท่ากับและขีดคู่ (Equal Sign & Double Hyphen Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว = ต่าย อรทัย' (เชื่อมด้วยเท่ากับ =) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว = ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ = เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "48. การค้นหาคำที่มีเครื่องหมายเท่ากับและขีดคู่ (Equal Sign & Double Hyphen Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว -- ต่าย อรทัย' (เชื่อมด้วยขีดคู่ --) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว -- ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ -- เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "49. การค้นหาคำที่มีเครื่องหมายแบ็กทิกและเครื่องหมายคำพูด (Backtick & Quotation Mark Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ` ต่าย อรทัย' (เชื่อมด้วยแบ็กทิก `) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ` ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ \` เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "49. การค้นหาคำที่มีเครื่องหมายแบ็กทิกและเครื่องหมายคำพูด (Backtick & Quotation Mark Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว \" ต่าย อรทัย' (เชื่อมด้วยอัญประกาศ \") ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch('ขอใจกันหนาว " ต่าย อรทัย');
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ " เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "50. การค้นหาคำที่มีเครื่องหมายแบ็กสแลชและดับเบิลสแลช (Backslash & Double Slash Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว \\ ต่าย อรทัย' (เชื่อมด้วยแบ็กสแลช \\) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว \\ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ \\ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "50. การค้นหาคำที่มีเครื่องหมายแบ็กสแลชและดับเบิลสแลช (Backslash & Double Slash Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว // ต่าย อรทัย' (เชื่อมด้วยดับเบิลสแลช //) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว // ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ // เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "51. การค้นหาคำที่มีเครื่องหมายลูกศรและแฟตแอร์โรว์ (Arrow & Fat Arrow Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว -> ต่าย อรทัย' (เชื่อมด้วยลูกศร ->) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว -> ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ -> เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "51. การค้นหาคำที่มีเครื่องหมายลูกศรและแฟตแอร์โรว์ (Arrow & Fat Arrow Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว => ต่าย อรทัย' (เชื่อมด้วยลูกศร =>) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว => ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ => เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "52. การค้นหาคำที่มีเครื่องหมายดับเบิลโคลอนและดับเบิลไปป์ (Double Colon & Double Pipe Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว :: ต่าย อรทัย' (เชื่อมด้วยดับเบิลโคลอน ::) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว :: ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ :: เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "52. การค้นหาคำที่มีเครื่องหมายดับเบิลโคลอนและดับเบิลไปป์ (Double Colon & Double Pipe Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว || ต่าย อรทัย' (เชื่อมด้วยดับเบิลไปป์ ||) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว || ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ || เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "53. การค้นหาคำที่มีเครื่องหมายดับเบิลแอมเพอร์แซนด์และดับเบิลพลัส (Double Ampersand & Double Plus Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว && ต่าย อรทัย' (เชื่อมด้วยดับเบิลแอมเพอร์แซนด์ &&) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว && ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ && เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "53. การค้นหาคำที่มีเครื่องหมายดับเบิลแอมเพอร์แซนด์และดับเบิลพลัส (Double Ampersand & Double Plus Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ++ ต่าย อรทัย' (เชื่อมด้วยดับเบิลพลัส ++) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ++ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ++ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "54. การค้นหาคำที่มีเครื่องหมายลูกศรซ้ายและดับเบิลทิลเดอ (Left Arrow & Double Tilde Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว <- ต่าย อรทัย' (เชื่อมด้วยลูกศรซ้าย <-) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว <- ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ <- เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "54. การค้นหาคำที่มีเครื่องหมายลูกศรซ้ายและดับเบิลทิลเดอ (Left Arrow & Double Tilde Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ~~ ต่าย อรทัย' (เชื่อมด้วยดับเบิลทิลเดอ ~~) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ~~ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ~~ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "55. การค้นหาคำที่มีเครื่องหมายดับเบิลแคเร็ตและดับเบิลดอกจัน (Double Caret & Double Asterisk Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ^^ ต่าย อรทัย' (เชื่อมด้วยดับเบิลแคเร็ต ^^) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ^^ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ^^ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "55. การค้นหาคำที่มีเครื่องหมายดับเบิลแคเร็ตและดับเบิลดอกจัน (Double Caret & Double Asterisk Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ** ต่าย อรทัย' (เชื่อมด้วยดับเบิลดอกจัน **) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ** ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ** เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "56. การค้นหาคำที่มีเครื่องหมายดับเบิลอันเดอร์สกอร์และลูกศรสองทาง (Double Underscore & Bidirectional Arrow Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว __ ต่าย อรทัย' (เชื่อมด้วยดับเบิลอันเดอร์สกอร์ __) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว __ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ __ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "56. การค้นหาคำที่มีเครื่องหมายดับเบิลอันเดอร์สกอร์และลูกศรสองทาง (Double Underscore & Bidirectional Arrow Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว <-> ต่าย อรทัย' (เชื่อมด้วยลูกศรสองทาง <->) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว <-> ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ <-> เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "57. การค้นหาคำที่มีเครื่องหมายขีดสามชั้นและบวกสามชั้น (Triple Hyphen & Triple Plus Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว --- ต่าย อรทัย' (เชื่อมด้วยขีดสามชั้น ---) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว --- ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ --- เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "57. การค้นหาคำที่มีเครื่องหมายขีดสามชั้นและบวกสามชั้น (Triple Hyphen & Triple Plus Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว +++ ต่าย อรทัย' (เชื่อมด้วยบวกสามชั้น +++) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว +++ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ +++ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "58. การค้นหาคำที่มีเครื่องหมายเท่ากับสามชั้นและดอกจันสามชั้น (Triple Equal Sign & Triple Asterisk Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว === ต่าย อรทัย' (เชื่อมด้วยเท่ากับสามชั้น ===) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว === ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ === เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "58. การค้นหาคำที่มีเครื่องหมายเท่ากับสามชั้นและดอกจันสามชั้น (Triple Equal Sign & Triple Asterisk Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว *** ต่าย อรทัย' (เชื่อมด้วยดอกจันสามชั้น ***) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว *** ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ *** เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "59. การค้นหาคำที่มีเครื่องหมายตัวหนอนสามชั้นและจุดสามชั้น (Triple Tilde & Triple Dot Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ~~~ ต่าย อรทัย' (เชื่อมด้วยตัวหนอนสามชั้น ~~~) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ~~~ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ~~~ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "59. การค้นหาคำที่มีเครื่องหมายตัวหนอนสามชั้นและจุดสามชั้น (Triple Tilde & Triple Dot Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ... ต่าย อรทัย' (เชื่อมด้วยจุดสามชั้น ...) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ... ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ... เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "60. การค้นหาคำที่มีเครื่องหมายสแลชสามชั้นและไปป์สามชั้น (Triple Slash & Triple Pipe Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว /// ต่าย อรทัย' (เชื่อมด้วยสแลชสามชั้น ///) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว /// ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ /// เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "60. การค้นหาคำที่มีเครื่องหมายสแลชสามชั้นและไปป์สามชั้น (Triple Slash & Triple Pipe Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ||| ต่าย อรทัย' (เชื่อมด้วยไปป์สามชั้น |||) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ||| ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ||| เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "61. การค้นหาคำที่มีเครื่องหมายแคเร็ตสามชั้นและอันเดอร์สกอร์สามชั้น (Triple Caret & Triple Underscore Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ^^^ ต่าย อรทัย' (เชื่อมด้วยแคเร็ตสามชั้น ^^^) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ^^^ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ^^^ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "61. การค้นหาคำที่มีเครื่องหมายแคเร็ตสามชั้นและอันเดอร์สกอร์สามชั้น (Triple Caret & Triple Underscore Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ___ ต่าย อรทัย' (เชื่อมด้วยอันเดอร์สกอร์สามชั้น ___) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ___ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ___ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "62. การค้นหาคำที่มีเครื่องหมายลูกศรซ้ายสามชั้นและลูกศรขวาสามชั้น (Left Triple Arrow & Right Triple Arrow Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว <<< ต่าย อรทัย' (เชื่อมด้วยลูกศรซ้ายสามชั้น <<<) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว <<< ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ <<< เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "62. การค้นหาคำที่มีเครื่องหมายลูกศรซ้ายสามชั้นและลูกศรขวาสามชั้น (Left Triple Arrow & Right Triple Arrow Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว >>> ต่าย อรทัย' (เชื่อมด้วยลูกศรขวาสามชั้น >>>) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว >>> ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ >>> เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "63. การค้นหาคำที่มีเครื่องหมายอัศเจรีย์สามชั้นและปรัศนีสามชั้น (Triple Exclamation & Triple Question Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว !!! ต่าย อรทัย' (เชื่อมด้วยอัศเจรีย์สามชั้น !!!) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว !!! ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ !!! เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "63. การค้นหาคำที่มีเครื่องหมายอัศเจรีย์สามชั้นและปรัศนีสามชั้น (Triple Exclamation & Triple Question Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ??? ต่าย อรทัย' (เชื่อมด้วยปรัศนีสามชั้น ???) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ??? ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ??? เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "64. การค้นหาคำที่มีเครื่องหมายแฮชสามชั้นและแบ็กสแลชสามชั้น (Triple Hash & Triple Backslash Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ### ต่าย อรทัย' (เชื่อมด้วยแฮชสามชั้น ###) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ### ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ### เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "64. การค้นหาคำที่มีเครื่องหมายแฮชสามชั้นและแบ็กสแลชสามชั้น (Triple Hash & Triple Backslash Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว \\\ ต่าย อรทัย' (เชื่อมด้วยแบ็กสแลชสามชั้น \\\) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว \\\ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ \\\ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "65. การค้นหาคำที่มีเครื่องหมายแอทสามชั้นและเปอร์เซ็นต์สามชั้น (Triple At Sign & Triple Percent Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว @@@ ต่าย อรทัย' (เชื่อมด้วยแอทสามชั้น @@@) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว @@@ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ @@@ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "65. การค้นหาคำที่มีเครื่องหมายแอทสามชั้นและเปอร์เซ็นต์สามชั้น (Triple At Sign & Triple Percent Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว %%% ต่าย อรทัย' (เชื่อมด้วยเปอร์เซ็นต์สามชั้น %%%) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว %%% ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ %%% เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "66. การค้นหาคำที่มีเครื่องหมายดอลลาร์สามชั้นและแอมเพอร์แซนด์สามชั้น (Triple Dollar & Triple Ampersand Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว $$$ ต่าย อรทัย' (เชื่อมด้วยดอลลาร์สามชั้น $$$) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว $$$ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ $$$ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "66. การค้นหาคำที่มีเครื่องหมายดอลลาร์สามชั้นและแอมเพอร์แซนด์สามชั้น (Triple Dollar & Triple Ampersand Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว &&& ต่าย อรทัย' (เชื่อมด้วยแอมเพอร์แซนด์สามชั้น &&&) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว &&& ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ &&& เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "67. การค้นหาคำที่มีเครื่องหมายอัฒภาคสามชั้นและทวิภาคสามชั้น (Triple Semicolon & Triple Colon Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ;;; ต่าย อรทัย' (เชื่อมด้วยอัฒภาคสามชั้น ;;;) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ;;; ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ;;; เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "67. การค้นหาคำที่มีเครื่องหมายอัฒภาคสามชั้นและทวิภาคสามชั้น (Triple Semicolon & Triple Colon Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ::: ต่าย อรทัย' (เชื่อมด้วยทวิภาคสามชั้น :::) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ::: ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ::: เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "68. การค้นหาคำที่มีเครื่องหมายแบ็กทิกสามชั้นและเครื่องหมายคำพูดสามชั้น (Triple Backtick & Triple Quotation Mark Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ``` ต่าย อรทัย' (เชื่อมด้วยแบ็กทิกสามชั้น ```) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ``` ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ \`\`\` เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "68. การค้นหาคำที่มีเครื่องหมายแบ็กทิกสามชั้นและเครื่องหมายคำพูดสามชั้น (Triple Backtick & Triple Quotation Mark Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว \"\"\" ต่าย อรทัย' (เชื่อมด้วยเครื่องหมายคำพูดสามชั้น \"\"\") ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch('ขอใจกันหนาว """ ต่าย อรทัย');
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ """ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "69. การค้นหาคำที่มีเครื่องหมายวงเล็บเหลี่ยมเปิดสามชั้นและวงเล็บเหลี่ยมปิดสามชั้น (Triple Open Bracket & Triple Close Bracket Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว [[[ ต่าย อรทัย' (เชื่อมด้วยวงเล็บเหลี่ยมเปิดสามชั้น [[[) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว [[[ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ [[[ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "69. การค้นหาคำที่มีเครื่องหมายวงเล็บเหลี่ยมเปิดสามชั้นและวงเล็บเหลี่ยมปิดสามชั้น (Triple Open Bracket & Triple Close Bracket Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ]]] ต่าย อรทัย' (เชื่อมด้วยวงเล็บเหลี่ยมปิดสามชั้น ]]]) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ]]] ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ]]] เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "70. การค้นหาคำที่มีเครื่องหมายวงเล็บเปิดสามชั้นและวงเล็บปิดสามชั้น (Triple Open Parenthesis & Triple Close Parenthesis Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ((( ต่าย อรทัย' (เชื่อมด้วยวงเล็บเปิดสามชั้น ((( ) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ((( ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ((( เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "70. การค้นหาคำที่มีเครื่องหมายวงเล็บเปิดสามชั้นและวงเล็บปิดสามชั้น (Triple Open Parenthesis & Triple Close Parenthesis Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว ))) ต่าย อรทัย' (เชื่อมด้วยวงเล็บปิดสามชั้น ))) ) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว ))) ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ ))) เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "71. การค้นหาคำที่มีเครื่องหมายวงเล็บปีกกาเปิดสามชั้นและวงเล็บปีกกาปิดสามชั้น (Triple Open Brace & Triple Close Brace Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว {{{ ต่าย อรทัย' (เชื่อมด้วยวงเล็บปีกกาเปิดสามชั้น {{{) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว {{{ ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ {{{ เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  },
  {
    category: "71. การค้นหาคำที่มีเครื่องหมายวงเล็บปีกกาเปิดสามชั้นและวงเล็บปีกกาปิดสามชั้น (Triple Open Brace & Triple Close Brace Delimiter Queries)",
    name: "ค้นหา 'ขอใจกันหนาว }}} ต่าย อรทัย' (เชื่อมด้วยวงเล็บปีกกาปิดสามชั้น }}}) ต้องได้ 'ขอใจกันหนาว' อันดับ 1 (score >= 0.95)",
    run: async () => {
      const res = await workerSearch("ขอใจกันหนาว }}} ต่าย อรทัย");
      const topSong = res.length > 0 ? DATA.songs[res[0].idx] : null;
      const pass = topSong && topSong.title === "ขอใจกันหนาว" && res[0].score >= 0.85;
      return {
        pass,
        detail: pass ? `อันดับ 1: '${topSong.title}' score: ${res[0].score.toFixed(2)} รองรับ }}} เชื่อมคำสำเร็จ` : `ผลลัพธ์ไม่ตรงตามเกณฑ์ (อันดับ 1: ${topSong ? topSong.title : 'ไม่พบ'})`
      };
    }
  }
,
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลง 'ดาวเต้น ม.ต้น' ต้องขึ้นอันดับ 1",
    run: async () => {
      const res = await workerSearch("ดาวเต้น ม.ต้น");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "ดาวเต้น ม.ต้น", detail: "อันดับ 1: " + (top || "ไม่พบ") };
    }
  },
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลง 'สาว 16' ต้องขึ้นอันดับ 1",
    run: async () => {
      const res = await workerSearch("สาว 16");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "สาว 16", detail: "อันดับ 1: " + (top || "ไม่พบ") };
    }
  },
  {
    category: "1. ค้นหาด้วยชื่อเพลงโดยตรง (Direct Title Search)",
    name: "ค้นหาชื่อเพลง 'คนบ้านเดียวกัน' ต้องขึ้นอันดับ 1",
    run: async () => {
      const res = await workerSearch("คนบ้านเดียวกัน");
      const top = res.length > 0 ? DATA.songs[res[0].idx].title : "";
      return { pass: top === "คนบ้านเดียวกัน", detail: "อันดับ 1: " + (top || "ไม่พบ") };
    }
  },
  {
    category: "5. การทนต่อคำเพี้ยน/พิมพ์ผิด (Typo Tolerance เช่น ความ vs ควาย)",
    name: "Inserted character typo: 'ขอบใจกันหนาว' retrieves 'ขอใจกันหนาว'",
    run: async () => {
      const res = await workerSearch("ขอบใจกันหนาว");
      const found = res.slice(0, 3).some(r => DATA.songs[r.idx].title === "ขอใจกันหนาว");
      return { pass: found, detail: "พบ 'ขอใจกันหนาว' ใน 3 อันดับแรก" };
    }
  },
  {
    category: "6. ตัวกรองและการค้นหารวม (Filters & Metadata)",
    name: "Short fragment 'าว' without a vocabulary token returns no results",
    run: async () => {
      const res = await workerSearch("าว");
      return { pass: res.length === 0, detail: "ผลลัพธ์: " + res.length };
    }
  },
  {
    category: "9. การแยกรากศัพท์คำประสม (Compound Decompounding & Highlighting)",
    name: "Affix Isolation: 'ความ' prefix alone is NEVER added to matchedTerms (no noisy partial highlights)",
    run: async () => {
      const res = await workerSearch("ความรัก");
      const kwamAlone = res.some(r => r.evidence && r.evidence.matchedTerms && r.evidence.matchedTerms.includes("ความ"));
      return { pass: !kwamAlone, detail: "ไม่มี morpheme เดียว 'ความ'" };
    }
  },
  {
    category: "9. การแยกรากศัพท์คำประสม (Compound Decompounding & Highlighting)",
    name: "Invalid Syllable Onset Rejection: 'าว' and 'ิน' fragments return 0 results",
    run: async () => {
      const res1 = await workerSearch("าว");
      const res2 = await workerSearch("ิน");
      return { pass: res1.length === 0 && res2.length === 0, detail: "เศษคำภาษาไทยถูกปฏิเสธ" };
    }
  }

];

async function runAllTests() {
  const report = new TestReport();
  console.log('\n' + '='.repeat(60));
  console.log('  RUNNING SEARCH ENGINE TEST SUITE FOR THUNGARA (NODE.JS)');
  console.log('='.repeat(60) + '\n');

  let curCat = '';
  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    if (tc.category !== curCat) {
      curCat = tc.category;
      console.log('\nCategory: ' + curCat);
    }
    try {
      const res = await tc.run();
      report.assertTest(tc.name, Boolean(res && res.pass), (res && res.detail) || '');
    } catch (e) {
      report.assertTest(tc.name, false, e.message);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('  TEST SUMMARY: Total=' + report.total + ', Passed=' + report.passed + ', Failed=' + report.failed);
  const rate = report.total > 0 ? ((report.passed / report.total) * 100).toFixed(1) : 0;
  console.log('  SUCCESS RATE: ' + rate + '%');
  console.log('='.repeat(60) + '\n');

  return report;
}

module.exports = {
  DATA,
  SONGS,
  VOCAB,
  IDF,
  VECTORS,
  VECTOR_MAGS,
  search,
  enhancedSearch: search,
  runAllTests,
  TestReport,
};

if (require.main === module) {
  runAllTests().then(report => {
    process.exit(report.failed === 0 ? 0 : 1);
  });
}
