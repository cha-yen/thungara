let DATA = null;
let vocabSet = null;
let wordToIndex = null;
let maxWordLen = 0;
let NORM_SONGS = [];

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
  if (!tokens || tokens.length === 0) return {};
  const tf = {};
  let maxTf = 0;
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1;
    if (tf[t] > maxTf) maxTf = tf[t];
  }
  if (maxTf === 0) return {};
  const vec = {};
  for (const [word, count] of Object.entries(tf)) {
    const idx = wordToIndex ? wordToIndex.get(word) : DATA.vocab.indexOf(word);
    if (idx !== undefined && idx >= 0) {
      vec[String(idx)] = (count / maxTf) * DATA.idf[idx];
    }
  }
  return vec;
}

function cosineSim(vecA, vecB) {
  let dot = 0, magA = 0, magB = 0;
  for (const [k, v] of Object.entries(vecA)) {
    magA += v * v;
    if (vecB[k] !== undefined) dot += v * vecB[k];
  }
  for (const v of Object.values(vecB)) magB += v * v;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function fuzzyMatchWindow(queryNorm, targetNorm, maxDiff = 1) {
  const n = queryNorm.length;
  const tLen = targetNorm.length;
  if (tLen < n || n < 3) return false;

  const bg0 = queryNorm.substring(0, 2);
  const bg1 = n >= 3 ? queryNorm.substring(1, 3) : '';
  if (!targetNorm.includes(bg0) && (!bg1 || !targetNorm.includes(bg1))) {
    return false;
  }

  const qbgs = [bg0];
  if (bg1) qbgs.push(bg1);

  const checked = new Set();
  for (let offset = 0; offset < qbgs.length; offset++) {
    const bg = qbgs[offset];
    let pos = targetNorm.indexOf(bg);
    let checksCount = 0;
    while (pos !== -1 && checksCount < 4) {
      const startIdx = Math.max(0, pos - offset);
      if (!checked.has(startIdx) && startIdx + n <= tLen) {
        checked.add(startIdx);
        const sub = targetNorm.substring(startIdx, startIdx + n);
        let diff = 0;
        for (let k = 0; k < n; k++) {
          if (queryNorm.charCodeAt(k) !== sub.charCodeAt(k)) {
            diff++;
            if (diff > maxDiff) break;
          }
        }
        if (diff <= maxDiff) {
          return true;
        }
        checksCount++;
      }
      pos = targetNorm.indexOf(bg, pos + 1);
    }
  }
  return false;
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

  const expandedTokens = [...tokens];
  for (const t of tokens) {
    if (SYNONYMS[t]) {
      expandedTokens.push(...SYNONYMS[t]);
    }
  }
  const uniqueExpandedTokens = Array.from(new Set(expandedTokens));
  const normExpandedTokens = uniqueExpandedTokens
    .map(t => normalizeText(t))
    .filter(t => t.length > 0);

  const qVec = queryToVector(tokens);
  const hasVector = Object.keys(qVec).length > 0;

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

    if (normQ) {
      if (ns.normTitle === normQ) {
        score += 2.0;
        exactTitleMatch = true;
      } else if (ns.normTitle.includes(normQ)) {
        score += 1.2 * (normQ.length / Math.max(ns.normTitle.length, 1));
      } else if (normQ.includes(ns.normTitle) && ns.normTitle.length >= 3) {
        score += 1.0;
      }

      if (ns.normArtist && (ns.normArtist.includes(normQ) || normQ.includes(ns.normArtist))) {
        score += 0.5;
      }

      if (ns.normLyrics.includes(normQ)) {
        exactLyricsMatch = true;
        const lengthFactor = Math.min(normQ.length / 10.0, 1.5);
        score += 0.5 * lengthFactor;

        const count = countOccurrences(ns.normLyrics, normQ);
        if (count > 1) {
          score += 0.1 * Math.min(count - 1, 3);
        }
      }

      if (!exactLyricsMatch && !exactTitleMatch && normQ.length >= 3) {
        if (fuzzyMatchWindow(normQ, ns.normTitle, 1)) {
          score += 0.8;
        }
        if (fuzzyMatchWindow(normQ, ns.normLyrics, 1)) {
          score += 0.35;
        }
      }

      if (normExpandedTokens.length > 0) {
        let matched = 0;
        for (const nt of normExpandedTokens) {
          if (ns.normLyrics.includes(nt)) matched++;
        }
        if (matched > 0) {
          score += 0.25 * (matched / normExpandedTokens.length);
        }
      }

      if (hasVector) {
        const cos = cosineSim(qVec, DATA.vectors[i]);
        score += 0.35 * cos;
      }
    }

    const minThreshold = normQ ? 0.20 : 0.01;
    if (score >= minThreshold) {
      results.push({
        idx: i,
        score: score,
        exactMatch: exactLyricsMatch || exactTitleMatch,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
