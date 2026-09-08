let DATA = null;
let vocabSet = null;
let wordToIndex = null;
let maxWordLen = 0;
let NORM_SONGS = [];
let VECTOR_MAGS = [];

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
  if (!text) return '';
  return text.toLowerCase().replace(/[^฀-๿a-z0-9]/g, '');
}

self.onmessage = function(e) {
  const { type, payload } = e.data;

  if (type === 'init') {
    DATA = payload;
    vocabSet = new Set(DATA.vocab);
    wordToIndex = new Map();
    DATA.vocab.forEach((w, i) => wordToIndex.set(w, i));
    maxWordLen = DATA.maxWordLen || 15;

    NORM_SONGS = DATA.songs.map(song => ({
      normTitle: normalizeText(song.title),
      normArtist: normalizeText(song.artist),
      normLyrics: normalizeText(song.lyrics),
    }));

    VECTOR_MAGS = DATA.vectors.map(vec => {
      let sumSq = 0;
      for (const v of Object.values(vec)) sumSq += v * v;
      return Math.sqrt(sumSq);
    });

    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'search') {
    const results = search(payload.query, payload.filterArtist, payload.filterEmotion, payload.filterYear);
    self.postMessage({ type: 'results', payload: results, query: payload.query });
  }
};

function tokenizeQuery(text) {
  if (!vocabSet || !text) return [];
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
    const idx = wordToIndex ? wordToIndex.get(word) : DATA.vocab.indexOf(word);
    if (idx !== undefined && idx >= 0) {
      const val = (count / maxTf) * DATA.idf[idx];
      vec[String(idx)] = val;
      magSq += val * val;
    }
  }
  return { vec, mag: Math.sqrt(magSq) };
}

function cosineSim(vecA, magA, songIdx) {
  if (magA === 0) return 0;
  const magB = VECTOR_MAGS[songIdx];
  if (!magB) return 0;
  const vecB = DATA.vectors[songIdx];
  let dot = 0;
  for (const [k, v] of Object.entries(vecA)) {
    if (vecB[k] !== undefined) dot += v * vecB[k];
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
      for (let shift = allowLengthChange ? -1 : 0; shift <= (allowLengthChange ? 1 : 0); shift++) {
        const startIdx = baseStart + shift;
        for (let lengthDelta = allowLengthChange ? -maxDiff : 0; lengthDelta <= (allowLengthChange ? maxDiff : 0); lengthDelta++) {
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
      checksCount++;
      pos = targetNorm.indexOf(bg, pos + 1);
    }
  }
  return null;
}

function editDistanceAtMost(textA, textB, maxDistance) {
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

function countOccurrences(str, sub) {
  if (!sub || !str) return 0;
  let count = 0, pos = 0;
  while ((pos = str.indexOf(sub, pos)) !== -1) {
    count++;
    pos += sub.length;
  }
  return count;
}

function search(query, filterArtist, filterEmotion, filterYear) {
  if (!DATA) return [];
  const rawQ = (query || '').trim();
  if (!rawQ && !filterArtist && !filterEmotion && !filterYear) return [];

  const normQ = normalizeText(rawQ);
  const tokens = tokenizeQuery(rawQ);
  if (rawQ && tokens.length === 0 && normQ.length < 3) return [];

  const { vec: qVec, mag: qMag } = queryToVector(tokens);
  const hasVector = qMag > 0;

  const results = [];
  const nSongs = DATA.songs.length;

  for (let i = 0; i < nSongs; i++) {
    const song = DATA.songs[i];

    if (filterArtist && song.artist !== filterArtist) continue;
    if (filterEmotion && song.emotion !== filterEmotion) continue;
    if (filterYear && song.year !== filterYear) continue;

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

    if (normQ) {
      // 1. Title matching
      let titleScore = 0.0;
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

      // 2. Lyrics phrase matching
      let lyricsPhraseScore = 0.0;
      if (ns.normLyrics.includes(normQ)) {
        exactLyricsMatch = true;
        const lenFactor = Math.min(normQ.length / 25.0, 1.0);
        lyricsPhraseScore = 0.82 + 0.08 * lenFactor;
        const count = countOccurrences(ns.normLyrics, normQ);
        if (count > 1) {
          lyricsPhraseScore += 0.02 * Math.min(count - 1, 3);
        }
        matchedTerms.push(rawQ);
      }

      // 3. Fuzzy matching (if not exact phrase)
      let fuzzyScore = 0.0;
      if (!exactLyricsMatch && !exactTitleMatch && normQ.length >= 3) {
        const fTitle = fuzzyMatchWindow(normQ, ns.normTitle, 1, true);
        if (fTitle && fTitle.matched) {
          fuzzyTitleMatch = true;
          fuzzyScore = Math.max(fuzzyScore, 0.72);
          if (fTitle.sub) matchedTerms.push(fTitle.sub);
        }
        const fLyrics = fuzzyMatchWindow(normQ, ns.normLyrics, 1, false);
        if (fLyrics && fLyrics.matched) {
          fuzzyLyricsMatch = true;
          fuzzyScore = Math.max(fuzzyScore, 0.56);
          if (fLyrics.sub) matchedTerms.push(fLyrics.sub);
        }
      }

      // 4. Token & Synonym coverage
      let tokenCoverage = 0.0;
      if (tokens.length > 0) {
        for (const t of tokens) {
          const nt = normalizeText(t);
          if (ns.normLyrics.includes(nt) || ns.normTitle.includes(nt)) {
            matchedTokenCount++;
            matchedTerms.push(t);
          } else if (SYNONYMS[t]) {
            for (const syn of SYNONYMS[t]) {
              const nsyn = normalizeText(syn);
              if (ns.normLyrics.includes(nsyn) || ns.normTitle.includes(nsyn)) {
                matchedSynonymCount++;
                matchedTerms.push(syn);
                break;
              }
            }
          }
        }
        tokenCoverage = (matchedTokenCount + 0.85 * matchedSynonymCount) / tokens.length;
      }

      // 5. TF-IDF Cosine Similarity
      let cosSim = 0.0;
      if (hasVector) {
        cosSim = cosineSim(qVec, qMag, i);
      }

      // 6. Artist boost
      let artistBoost = 0.0;
      if (ns.normArtist && (normQ.includes(ns.normArtist) || ns.normArtist.includes(normQ))) {
        artistBoost = 0.08;
        matchedTerms.push(song.artist);
      }

      // 7. Tiered Normalized Confidence Score in [0.0, 1.0]
      if (exactTitleMatch) {
        score = Math.min(1.0, 0.98 + 0.02 * (hasVector ? cosSim : 1.0));
      } else if (titleScore > 0) {
        score = Math.min(0.96, titleScore + 0.02 * tokenCoverage + 0.02 * cosSim);
      } else if (exactLyricsMatch) {
        score = Math.min(0.94, lyricsPhraseScore + 0.03 * tokenCoverage + 0.02 * cosSim);
      } else if (fuzzyTitleMatch) {
        score = Math.min(0.80, fuzzyScore + 0.05 * tokenCoverage + 0.03 * cosSim);
      } else if (fuzzyLyricsMatch) {
        score = Math.min(0.72, fuzzyScore + 0.06 * tokenCoverage + 0.04 * cosSim);
      } else if (tokenCoverage > 0 || cosSim > 0) {
        score = Math.min(0.68, 0.45 * tokenCoverage + 0.20 * cosSim);
      }

      if (artistBoost > 0 && score > 0) {
        score = Math.min(0.99, score + artistBoost);
      }
    }

    const minThreshold = normQ ? 0.20 : 0.01;
    const exactLyricPhrase = exactLyricsMatch && (normQ.length >= 6 || tokens.length >= 2);
    if (score >= minThreshold) {
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
          matchedTerms: Array.from(new Set(matchedTerms)),
        },
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
