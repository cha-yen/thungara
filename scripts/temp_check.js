
let DATA = null;
let vocabSet = null;
let wordToIndex = null;
let maxWordLen = 0;
let NORM_SONGS = [];
let isRecording = false;
let recognition = null;
let currentQuery = '';
let debounceTimer = null;
let searchWorker = null;
let currentResults = [];
let displayedCount = 0;
const PAGE_SIZE = 30;
let YOUTUBE_MAP = {};

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

async function loadData() {
  try {
    const res = await fetch('../data/data.json');
    DATA = await res.json();
    try {
      const ytRes = await fetch('../data/youtube_ids.json?v=' + Date.now());
      if (ytRes.ok) YOUTUBE_MAP = await ytRes.json();
    } catch (e) {}
    vocabSet = new Set(DATA.vocab);
    wordToIndex = new Map();
    DATA.vocab.forEach((w, i) => wordToIndex.set(w, i));
    maxWordLen = DATA.maxWordLen || 15;

    NORM_SONGS = DATA.songs.map(song => ({
      normTitle: normalizeText(song.title),
      normArtist: normalizeText(song.artist),
      normLyrics: normalizeText(song.lyrics),
    }));

    populateFilters();

    if (window.Worker) {
      searchWorker = new Worker('../app/search-worker.js?v=' + Date.now());
      searchWorker.postMessage({ type: 'init', payload: DATA });
      searchWorker.onmessage = function(e) {
        if (e.data.type === 'results') {
          document.getElementById('search-progress').classList.remove('active');
          renderResults(e.data.payload, e.data.query);
        }
      };
    }

    document.getElementById('loading').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
    document.getElementById('stats').textContent = DATA.songs.length + ' เพลงพร้อมค้นหา';
  } catch (e) {
    document.getElementById('loading').innerHTML =
      '<p style="color:var(--mic-recording)">โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรช</p>';
  }
}

function populateFilters() {
  const fArtist = document.getElementById('filter-artist');
  const fEmotion = document.getElementById('filter-emotion');
  const fYear = document.getElementById('filter-year');
  DATA.artists.forEach(a => {
    fArtist.insertAdjacentHTML('beforeend', '<option value="'+esc(a)+'">'+esc(a)+'</option>');
  });
  DATA.emotions.forEach(e => {
    fEmotion.insertAdjacentHTML('beforeend', '<option value="'+esc(e)+'">'+esc(e)+'</option>');
  });
  DATA.years.forEach(y => {
    fYear.insertAdjacentHTML('beforeend', '<option value="'+esc(y)+'">'+esc(y)+'</option>');
  });
}

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
        if (diff <= maxDiff) return true;
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

function search(query) {
  if (!DATA) return [];
  const rawQ = (query || '').trim();
  const filterArtist = document.getElementById('filter-artist').value;
  const filterEmotion = document.getElementById('filter-emotion').value;
  const filterYear = document.getElementById('filter-year').value;

  if (!rawQ && !filterArtist && !filterEmotion && !filterYear) return [];

  const normQ = normalizeText(rawQ);
  const tokens = tokenizeQuery(rawQ);

  const expandedTokens = [...tokens];
  for (const t of tokens) {
    if (SYNONYMS[t]) expandedTokens.push(...SYNONYMS[t]);
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
        if (count > 1) score += 0.1 * Math.min(count - 1, 3);
      }

      if (!exactLyricsMatch && !exactTitleMatch && normQ.length >= 3) {
        if (fuzzyMatchWindow(normQ, ns.normTitle, 1)) score += 0.8;
        if (fuzzyMatchWindow(normQ, ns.normLyrics, 1)) score += 0.35;
      }

      if (normExpandedTokens.length > 0) {
        let matched = 0;
        for (const nt of normExpandedTokens) {
          if (ns.normLyrics.includes(nt)) matched++;
        }
        if (matched > 0) score += 0.25 * (matched / normExpandedTokens.length);
      }

      if (hasVector) {
        const cos = cosineSim(qVec, DATA.vectors[i]);
        score += 0.35 * cos;
      }
    }

    const minThreshold = normQ ? 0.20 : 0.01;
    if (score >= minThreshold) {
      results.push({ idx: i, score: score, exactMatch: exactLyricsMatch || exactTitleMatch });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

function renderResults(results, query) {
  const container = document.getElementById('results');
  const emptyState = document.getElementById('empty-state');
  const stats = document.getElementById('stats');

  currentResults = results || [];
  displayedCount = 0;

  if (currentResults.length === 0 && query.trim()) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.innerHTML = '<div class="icon">&#x1F50D;</div>'
      + '<p class="not-found-title">ไม่พบเพลงที่ตรงกับ "' + esc(query) + '"</p>'
      + '<div class="search-tips">'
      + '<p class="tips-title">ลองวิธีนี้ดู</p>'
      + '<ul>'
      + '<li>พิมพ์เนื้อเพลงสั้นลง เช่น วลีที่จำได้</li>'
      + '<li>ตรวจสอบตัวสะกดอีกครั้ง</li>'
      + '<li>ลองร้องผ่านไมค์แทนการพิมพ์</li>'
      + '<li>ลองเอาตัวกรองศิลปิน/อารมณ์/ปี ออก</li>'
      + '</ul></div>';
    stats.textContent = '';
    return;
  }

  if (currentResults.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    emptyState.innerHTML = '<div class="icon">&#x1F3B5;</div><p>พิมพ์เนื้อเพลงหรือกดไมค์ร้องเพลง<br>แล้วระบบจะหาเพลงให้</p>';
    stats.textContent = DATA ? DATA.songs.length + ' เพลงพร้อมค้นหา' : '';
    return;
  }

  emptyState.style.display = 'none';
  container.style.display = 'block';
  container.innerHTML = '<div id="song-cards-wrap"></div><div class="load-more-wrap" id="load-more-wrap" style="display:none"><button class="btn-load-more" id="btn-load-more" onclick="loadMore()">แสดงเพลงเพิ่มเติม</button></div>';

  appendNextBatch(query);
}

function appendNextBatch(query) {
  const cardsWrap = document.getElementById('song-cards-wrap');
  const loadMoreWrap = document.getElementById('load-more-wrap');
  const btnLoadMore = document.getElementById('btn-load-more');
  const stats = document.getElementById('stats');

  if (!cardsWrap) return;

  const nextBatch = currentResults.slice(displayedCount, displayedCount + PAGE_SIZE);
  let html = '';

  for (let i = 0; i < nextBatch.length; i++) {
    const r = nextBatch[i];
    const song = DATA.songs[r.idx];
    const pct = Math.min(100, Math.max(1, Math.round(r.score * 100)));
    const preview = highlightText(getPreview(song.lyrics, query), query);
    const delay = Math.min(i * 0.03, 0.4);

    html += '<div class="song-card" style="animation-delay:'+delay+'s" onclick="openModal('+r.idx+')">'
      + '<div class="card-header">'
      + '<div class="song-title">' + highlightText(song.title, query) + '</div>'
      + '<div class="match-score">' + pct + '%</div>'
      + '</div>'
      + '<div class="song-artist">' + highlightText(song.artist, query) + '</div>'
      + '<div class="song-meta">'
      + (song.year ? '<span class="badge">' + esc(song.year) + '</span>' : '')
      + (song.emotion ? '<span class="badge">' + esc(song.emotion) + '</span>' : '')
      + '</div>'
      + '<div class="lyrics-preview">' + preview + '</div>'
      + '</div>';
  }

  cardsWrap.insertAdjacentHTML('beforeend', html);
  displayedCount += nextBatch.length;

  const label = (query && query.trim()) ? 'พบเพลงที่เกี่ยวข้อง ' : 'พบเพลงตามเงื่อนไข ';
  if (currentResults.length > displayedCount) {
    stats.textContent = label + currentResults.length + ' เพลง (กำลังแสดง ' + displayedCount + ' เพลงแรก)';
    const remaining = currentResults.length - displayedCount;
    const nextCount = Math.min(PAGE_SIZE, remaining);
    btnLoadMore.innerHTML = '<span>📥</span> แสดงเพลงที่เกี่ยวข้องเพิ่มเติม (+อีก ' + nextCount + ' เพลง)';
    loadMoreWrap.style.display = 'block';
  } else {
    stats.textContent = label + currentResults.length + ' เพลง' + (currentResults.length > PAGE_SIZE ? ' (แสดงครบทั้งหมดแล้ว)' : '');
    loadMoreWrap.style.display = 'none';
  }
}

function loadMore() {
  appendNextBatch(currentQuery);
}

function getPreview(lyrics, query) {
  if (!query || !query.trim()) return lyrics.substring(0, 120) + (lyrics.length > 120 ? '...' : '');
  const rawQ = query.trim();

  let idx = lyrics.toLowerCase().indexOf(rawQ.toLowerCase());
  if (idx >= 0) {
    const start = Math.max(0, idx - 40);
    const end = Math.min(lyrics.length, idx + rawQ.length + 80);
    return (start > 0 ? '...' : '') + lyrics.substring(start, end) + (end < lyrics.length ? '...' : '');
  }

  const tokens = tokenizeQuery(rawQ);
  const candidates = [...tokens];
  for (const t of tokens) {
    if (SYNONYMS[t]) candidates.push(...SYNONYMS[t]);
  }
  candidates.sort((a, b) => b.length - a.length);

  for (const c of candidates) {
    if (c.length >= 2) {
      idx = lyrics.toLowerCase().indexOf(c.toLowerCase());
      if (idx >= 0) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(lyrics.length, idx + c.length + 80);
        return (start > 0 ? '...' : '') + lyrics.substring(start, end) + (end < lyrics.length ? '...' : '');
      }
    }
  }

  const normQ = normalizeText(rawQ);
  if (normQ.length >= 3) {
    const normLyrics = normalizeText(lyrics);
    const nIdx = normLyrics.indexOf(normQ);
    if (nIdx >= 0) {
      let normCount = 0, origIdx = 0;
      for (let i = 0; i < lyrics.length; i++) {
        const ch = lyrics[i].toLowerCase();
        if (/[฀-๿a-z0-9]/.test(ch)) {
          if (normCount === nIdx) { origIdx = i; break; }
          normCount++;
        }
      }
      const start = Math.max(0, origIdx - 40);
      const end = Math.min(lyrics.length, origIdx + rawQ.length + 80);
      return (start > 0 ? '...' : '') + lyrics.substring(start, end) + (end < lyrics.length ? '...' : '');
    }
  }

  return lyrics.substring(0, 120) + (lyrics.length > 120 ? '...' : '');
}

function highlightText(text, query) {
  if (!query || !query.trim() || !text) return esc(text);
  const rawQ = query.trim();
  const tokens = tokenizeQuery(rawQ);
  const wordsToHighlight = [rawQ, ...tokens];

  for (const t of tokens) {
    if (SYNONYMS[t]) wordsToHighlight.push(...SYNONYMS[t]);
  }

  const uniqueWords = Array.from(new Set(wordsToHighlight))
    .filter(w => w && w.length >= 2)
    .sort((a, b) => b.length - a.length);

  if (uniqueWords.length === 0) return esc(text);

  let escaped = esc(text);
  const pattern = uniqueWords.map(w => escRegex(esc(w))).join('|');
  const regex = new RegExp('(' + pattern + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function openModal(idx) {
  if (!DATA || !DATA.songs || !DATA.songs[idx]) return;
  const song = DATA.songs[idx];
  const query = (document.getElementById('search-input') ? document.getElementById('search-input').value.trim() : '') || currentQuery || '';

  document.getElementById('modal-title').innerHTML = highlightText(song.title, query);
  document.getElementById('modal-artist').innerHTML = highlightText(song.artist, query);

  let meta = '';
  if (song.year) meta += '<span class="badge">' + esc(song.year) + '</span>';
  if (song.emotion) meta += '<span class="badge">' + esc(song.emotion) + '</span>';
  document.getElementById('modal-meta').innerHTML = meta;

  renderVideoPreview(song, idx);
  renderModalActions(song, idx);

  const lyricsHtml = highlightText(song.lyrics, query);
  document.getElementById('modal-lyrics').innerHTML = lyricsHtml;

  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
}

function renderVideoPreview(song, idx) {
  const container = document.getElementById('modal-video-wrap');
  if (!container) return;
  const ytId = song.yt || YOUTUBE_MAP[song.id] || YOUTUBE_MAP[String(song.id)] || YOUTUBE_MAP[String(idx)];

  if (ytId) {
    container.style.display = 'block';
    container.innerHTML = '<div class="video-preview-thumb" onclick="playModalVideo(\'' + ytId + '\')" title="แตะเพื่อเล่นคลิปเพลง">'
      + '<img src="https://img.youtube.com/vi/' + ytId + '/hqdefault.jpg" alt="' + esc(song.title) + '" loading="lazy">'
      + '<div class="video-badge">'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#FF0000"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>'
      + 'YouTube MV'
      + '</div>'
      + '<div class="video-preview-overlay">'
      + '<div class="video-play-btn"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>'
      + '<span class="video-play-text">แตะเพื่อเล่นคลิปเพลง</span>'
      + '</div>'
      + '</div>';
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

function playModalVideo(ytId) {
  const container = document.getElementById('modal-video-wrap');
  if (!container) return;
  container.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + ytId + '?autoplay=1&rel=0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
}

function renderModalActions(song, idx) {
  const actionsWrap = document.getElementById('modal-actions');
  if (!actionsWrap) return;
  const ytId = song.yt || YOUTUBE_MAP[song.id] || YOUTUBE_MAP[String(song.id)] || YOUTUBE_MAP[String(idx)];
  const ytUrl = ytId 
    ? 'https://www.youtube.com/watch?v=' + ytId
    : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(song.title + ' ' + song.artist);

  actionsWrap.innerHTML = '<a href="' + ytUrl + '" target="_blank" rel="noopener noreferrer" class="btn-action-yt" title="เปิดดูบน YouTube โดยตรง">'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z"/></svg>'
    + 'ไปที่ YouTube เพลงนี้'
    + '</a>'
    + '<button class="btn-action-share" onclick="shareSong(' + idx + ')" title="แชร์เพลงนี้ไปยังแอปต่างๆ">'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
    + 'แชร์เพลงนี้'
    + '</button>'
    + '<button class="btn-action-copy" onclick="copyLyrics(' + idx + ')" title="คัดลอกเนื้อเพลงทั้งหมด">'
    + '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
    + 'คัดลอกเนื้อเพลง'
    + '</button>';
}

async function shareSong(idx) {
  if (!DATA || !DATA.songs || !DATA.songs[idx]) return;
  const song = DATA.songs[idx];
  const ytId = song.yt || YOUTUBE_MAP[song.id] || YOUTUBE_MAP[String(song.id)] || YOUTUBE_MAP[String(idx)];
  const ytUrl = ytId ? 'https://youtu.be/' + ytId : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(song.title + ' ' + song.artist);
  
  const snippet = song.lyrics.split('\n').filter(l => l.trim()).slice(0, 3).join('\n');
  const shareText = '🎵 เพลง: ' + song.title + '\n🎤 ศิลปิน: ' + song.artist + '\n\n"' + snippet + '..."\n\nฟังเพลง: ' + ytUrl;

  if (navigator.share) {
    try {
      await navigator.share({
        title: song.title + ' - ' + song.artist,
        text: shareText,
        url: ytUrl,
      });
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        copyToClipboard(shareText, 'คัดลอกข้อมูลเพลงเรียบร้อยแล้ว!');
      }
    }
  } else {
    copyToClipboard(shareText, 'คัดลอกข้อมูลเพลงและลิงก์ YouTube แล้ว!');
  }
}

function copyLyrics(idx) {
  if (!DATA || !DATA.songs || !DATA.songs[idx]) return;
  const song = DATA.songs[idx];
  const fullText = 'เพลง: ' + song.title + '\nศิลปิน: ' + song.artist + '\n\n' + song.lyrics;
  copyToClipboard(fullText, 'คัดลอกเนื้อเพลงทั้งหมดเรียบร้อย!');
}

function copyToClipboard(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg);
    }).catch(() => {
      fallbackCopy(text, successMsg);
    });
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch (e) {
    showToast('ไม่สามารถคัดลอกได้');
  }
  document.body.removeChild(ta);
}

let toastTimer = null;
function showToast(msg) {
  let toast = document.getElementById('toast-msg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast-msg';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22C55E" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> ' + esc(msg);
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function closeModalDirect() {
  const overlay = document.getElementById('modal-overlay');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
  const videoWrap = document.getElementById('modal-video-wrap');
  if (videoWrap) videoWrap.innerHTML = '';
}

function closeModal(e) {
  if (e.target === document.getElementById('modal-overlay') || e.target.closest('.modal-handle') || e.target.closest('.btn-modal-close')) {
    closeModalDirect();
  }
}

function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('mic-btn').classList.add('unavailable');
    return;
  }

  recognition = new SR();
  recognition.lang = 'th-TH';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalTranscript = '';
  const micBtn = document.getElementById('mic-btn');
  const recOverlay = document.getElementById('rec-overlay');
  const recStatus = document.getElementById('rec-status');
  const recTranscript = document.getElementById('rec-transcript');

  recognition.onstart = function() {
    isRecording = true;
    finalTranscript = '';
    micBtn.classList.add('recording');
    recOverlay.classList.add('show');
    recStatus.textContent = 'กำลังฟัง...';
    recTranscript.innerHTML = '<span class="interim">ร้องหรือพูดเนื้อเพลงได้เลย</span>';
  };

  recognition.onresult = function(event) {
    let interim = '';
    finalTranscript = '';
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    let html = '';
    if (finalTranscript) html += esc(finalTranscript);
    if (interim) html += '<span class="interim">' + esc(interim) + '</span>';
    recTranscript.innerHTML = html || '<span class="interim">ร้องหรือพูดเนื้อเพลงได้เลย</span>';
    if (finalTranscript || interim) recStatus.textContent = 'กำลังจับเสียง...';
  };

  recognition.onend = function() {
    isRecording = false;
    micBtn.classList.remove('recording');
    if (finalTranscript.trim()) {
      recStatus.textContent = 'กำลังค้นหา...';
      setTimeout(() => {
        recOverlay.classList.remove('show');
        document.getElementById('search-input').value = finalTranscript.trim();
        var el = document.getElementById('search-input');
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 150) + 'px';
        currentQuery = finalTranscript.trim();
        doSearch();
      }, 500);
    } else {
      recStatus.textContent = 'ไม่ได้ยินเสียง';
      recTranscript.textContent = 'ลองใหม่อีกครั้ง หรือแตะเพื่อปิด';
      setTimeout(() => { recOverlay.classList.remove('show'); }, 2000);
    }
  };

  recognition.onerror = function(event) {
    isRecording = false;
    micBtn.classList.remove('recording');
    const msg = event.error === 'no-speech' ? 'ไม่ได้ยินเสียง ลองใหม่อีกครั้ง'
      : event.error === 'not-allowed' ? 'กรุณาอนุญาตการใช้ไมโครโฟน'
      : 'เกิดข้อผิดพลาด: ' + event.error;
    recStatus.textContent = msg;
    recTranscript.textContent = '';
    setTimeout(() => { recOverlay.classList.remove('show'); }, 2500);
  };
}

function toggleRecording() {
  if (!recognition) return;
  if (isRecording) {
    recognition.stop();
  } else {
    try { recognition.start(); }
    catch(e) { recognition.stop(); setTimeout(() => recognition.start(), 200); }
  }
}

function doSearch() {
  const query = document.getElementById('search-input').value.trim();
  currentQuery = query;
  document.getElementById('btn-clear').classList.toggle('show', query.length > 0);
  if (!DATA) return;
  if (!query && !document.getElementById('filter-artist').value
      && !document.getElementById('filter-emotion').value
      && !document.getElementById('filter-year').value) {
    document.getElementById('search-progress').classList.remove('active');
    renderResults([], '');
    return;
  }
  const fa = document.getElementById('filter-artist').value;
  const fe = document.getElementById('filter-emotion').value;
  const fy = document.getElementById('filter-year').value;

  if (searchWorker) {
    document.getElementById('search-progress').classList.add('active');
    searchWorker.postMessage({ type: 'search', payload: { query: query || '  ', filterArtist: fa, filterEmotion: fe, filterYear: fy } });
  } else {
    const results = search(query || '  ');
    document.getElementById('search-progress').classList.remove('active');
    renderResults(results, query);
  }
}

function clearSearch() {
  var el = document.getElementById('search-input');
  el.value = '';
  el.style.height = 'auto';
  currentQuery = '';
  document.getElementById('btn-clear').classList.remove('show');
  document.getElementById('filter-artist').value = '';
  document.getElementById('filter-emotion').value = '';
  document.getElementById('filter-year').value = '';
  renderResults([], '');
  el.focus();
}

function getTheme() {
  try { return localStorage.getItem('theme') || 'auto'; } catch { return 'auto'; }
}
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
  }
  updateThemeIcon();
}
function toggleTheme() {
  const isDark = isDarkActive();
  const next = isDark ? 'light' : 'dark';
  try { localStorage.setItem('theme', next); } catch {}
  applyTheme(next);
}
function isDarkActive() {
  const theme = getTheme();
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function updateThemeIcon() {
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = isDarkActive() ? '☀️' : '🌙';
}
applyTheme(getTheme());

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function escRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

document.getElementById('search-input').addEventListener('input', function() {
  autoResize(this);
  clearTimeout(debounceTimer);
  if (this.value.trim()) {
    document.getElementById('search-progress').classList.add('active');
  } else {
    document.getElementById('filter-artist').value = '';
    document.getElementById('filter-emotion').value = '';
    document.getElementById('filter-year').value = '';
  }
  debounceTimer = setTimeout(doSearch, 300);
  document.getElementById('btn-clear').classList.toggle('show', this.value.length > 0);
});

document.getElementById('search-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); clearTimeout(debounceTimer); doSearch(); }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.getElementById('modal-overlay').classList.remove('show');
    document.body.style.overflow = '';
  }
});

window.addEventListener('scroll', function() {
  document.getElementById('btn-top').classList.toggle('show', window.scrollY > 400);
}, { passive: true });

if ('caches' in window) {
  caches.keys().then(keys => {
    keys.forEach(k => {
      if (k !== 'thungara-v10') caches.delete(k);
    });
  });
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('../app/sw.js').then(reg => {
    reg.update();
  }).catch(() => {});
}

initSpeechRecognition();
loadData();
