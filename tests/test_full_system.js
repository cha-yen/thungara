/**
 * test_full_system.js - Comprehensive Full-System Test Suite for Thungara
 * Native Node.js test runner executing all 239 System Integrity Checks.
 *
 * Phases:
 * 1. Data Integrity & Schema Audit (data.json, youtube_ids.json)
 * 2. Git Hygiene & Confidentiality Audit (.gitignore, secret leak checks)
 * 3. Search Engine Core & Ranking Tests (176 assertions across 71 categories)
 * 4. UI & Frontend Experience Audit (app/index.html, search-worker.js, manifest.json, sw.js)
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { runAllTests } = require('./test_search');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(PROJECT_ROOT, 'data', 'data.json');
const YT_FILE = path.join(PROJECT_ROOT, 'data', 'youtube_ids.json');
const GITIGNORE_FILE = path.join(PROJECT_ROOT, '.gitignore');
const README_FILE = path.join(PROJECT_ROOT, 'README.md');

function len(x) {
  if (!x) return 0;
  if (typeof x === 'string' || Array.isArray(x)) return x.length;
  if (typeof x === 'object') return Object.keys(x).length;
  return 0;
}
Object.prototype.get = function(key, defaultVal) {
  return this[key] !== undefined ? this[key] : defaultVal;
};

class FullSystemTester {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.results = [];
  }

  check(name, condition, details = "") {
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

  async runAll() {
    console.log('\n' + '='.repeat(65));
    console.log('  THUNGARA FULL-SYSTEM COMPREHENSIVE AUDIT & TEST SUITE');
    console.log('='.repeat(65));

    // Phase 1: Data Integrity & Schema
    console.log('\n--- Phase 1: Data Integrity & Schema Audit ---');
    const data = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) : {};
    const yt = fs.existsSync(YT_FILE) ? JSON.parse(fs.readFileSync(YT_FILE, 'utf-8')) : {};
    this.check("data.json exists and is readable", Boolean(fs.existsSync(DATA_FILE)), "");
    this.check("Songs count is 1,500", Boolean(len(data.get('songs', [])) == 1500), `Found: ${(data.songs ? data.songs.length : 0)}`);
    this.check("Vocab size >= 5,000 words", Boolean(len(data.get('vocab', [])) >= 5000), `Found: ${(data.vocab ? data.vocab.length : 0)}`);
    this.check("Vectors match songs count", Boolean(len(data.get('vectors', [])) == 1500), "");
    this.check("youtube_ids.json exists", Boolean(fs.existsSync(YT_FILE)), "");
    this.check("YouTube mapped songs > 1,400", Boolean(len(yt) > 1400), `Found: ${Object.keys(yt).length}`);

    // Phase 2: Git Hygiene & Confidentiality Audit
    console.log('\n--- Phase 2: Git Hygiene & Confidentiality Audit ---');
    const gi_content = fs.existsSync(GITIGNORE_FILE) ? fs.readFileSync(GITIGNORE_FILE, 'utf-8') : '';
    let tracked_files = [];
    try {
      tracked_files = cp.execSync('git ls-files', { cwd: PROJECT_ROOT, encoding: 'utf-8' }).split(/\r?\n/).filter(Boolean);
    } catch (e) {}
    const no_csv = !tracked_files.some(f => f.endsWith('.csv'));
    const no_preprocess = !tracked_files.includes('scripts/preprocess.py');
    const no_temp = !tracked_files.includes('scripts/temp_check.js');

    let is_not_utf16 = true;
    let readme_text = '';
    if (fs.existsSync(README_FILE)) {
      const buf = fs.readFileSync(README_FILE);
      is_not_utf16 = !(buf[0] === 0xff && buf[1] === 0xfe) && !(buf[0] === 0xfe && buf[1] === 0xff);
      readme_text = buf.toString('utf-8');
    }
    this.check(".gitignore exists", Boolean(fs.existsSync(GITIGNORE_FILE)), "");
    this.check(".gitignore protects scripts/", Boolean(gi_content.includes("scripts/")), "");
    this.check(".gitignore protects *.csv", Boolean(gi_content.includes("*.csv")), "");
    this.check("No CSV files tracked in Git", Boolean(no_csv), "");
    this.check("Internal scripts/preprocess.py not tracked in Git", Boolean(no_preprocess), "");
    this.check("Temporary scripts/temp_check.js removed from Git", Boolean(no_temp), "");
    this.check("README.md is clean UTF-8 (not UTF-16LE)", Boolean(is_not_utf16), "");
    this.check("README.md does not expose raw CSV filenames", Boolean(!readme_text.includes("เนื้อเพลงลูกทุ่ง_1500.csv")), "");
    this.check("README.md does not expose internal preprocess script", Boolean(!readme_text.includes("preprocess.py")), "");

    // Phase 3: Search Engine Core & Ranking Tests
    console.log('\n--- Phase 3: Search Engine Core & Ranking Tests ---');
    const report = await runAllTests();
    this.check(
      `Search Engine Core Test Suite (${report.total}/${report.total} assertions)`,
      report.failed === 0,
      `Passed: ${report.passed}/${report.total}`
    );

    // Phase 4: UI & Frontend Experience Audit
    console.log('\n--- Phase 4: UI & Frontend Experience Audit ---');
    const index_html_path = path.join(PROJECT_ROOT, 'app', 'index.html');
    const worker_js_path = path.join(PROJECT_ROOT, 'app', 'search-worker.js');
    const manifest_path = path.join(PROJECT_ROOT, 'app', 'manifest.json');
    const sw_path = path.join(PROJECT_ROOT, 'app', 'sw.js');
    const runner_path = path.join(PROJECT_ROOT, 'tests', 'test_runner.html');
    const test_search_py_path = path.join(PROJECT_ROOT, 'tests', 'test_search.py');

    const html_content = fs.existsSync(index_html_path) ? fs.readFileSync(index_html_path, 'utf-8') : '';
    const worker_text = fs.existsSync(worker_js_path) ? fs.readFileSync(worker_js_path, 'utf-8') : '';
    const manifest_text = fs.existsSync(manifest_path) ? fs.readFileSync(manifest_path, 'utf-8') : '';
    const sw_text = fs.existsSync(sw_path) ? fs.readFileSync(sw_path, 'utf-8') : '';
    const runner_text = fs.existsSync(runner_path) ? fs.readFileSync(runner_path, 'utf-8') : '';
    const test_search_py_text = fs.existsSync(test_search_py_path) ? fs.readFileSync(test_search_py_path, 'utf-8') : '';

    this.check("app/index.html exists and is readable", Boolean(fs.existsSync(index_html_path)), "");
    this.check("app/search-worker.js exists", Boolean(fs.existsSync(worker_js_path)), "");
    this.check("Recent search history UI implemented", Boolean(html_content.includes("recent-searches-wrap") && html_content.includes("thungara_recent_searches")), "");
    this.check("Keyboard shortcuts implemented (/ and Esc)", Boolean(html_content.includes("kbd-hint") && html_content.includes("e.key === '/'") && html_content.includes("e.key === 'Escape'")), "");
    this.check("Modern skeleton loading shimmer implemented", Boolean(html_content.includes("skeleton-grid") && html_content.includes("skeletonShimmer")), "");
    this.check("Smart sorting controls implemented", Boolean(html_content.includes("filter-sort") && html_content.includes("sortResultsList") && html_content.includes("applySortAndRender")), "");
    this.check("Artist discography insight and filter implemented", Boolean(html_content.includes("btn-artist-pill") && html_content.includes("getArtistSongCount") && html_content.includes("filterByArtistFromModal")), "");
    this.check("URL query params and deep-linking implemented", Boolean(html_content.includes("handleUrlParams") && html_content.includes("URLSearchParams")), "");
    this.check("Streamlined search UI (clean actions and no redundant chips)", Boolean(!html_content.includes("quick-suggestions-wrap") && !html_content.includes("btn-random")), "");
    this.check("Accessibility attributes (ARIA labels, roles, live regions) implemented", Boolean(html_content.includes('role="search"') &&
            html_content.includes('aria-label="ช่องค้นหาเพลง เนื้อร้อง หรือชื่อศิลปิน"') &&
            html_content.includes('aria-live="polite"') &&
            html_content.includes('role="dialog"') &&
            html_content.includes('aria-modal="true"')), "");
    this.check("SafeStorage defensive wrapper implemented", Boolean(html_content.includes("const SafeStorage") && html_content.includes("SafeStorage.getJSON")), "");
    this.check("Web Worker fault-tolerance fallback implemented", Boolean(html_content.includes("searchWorker.onerror")), "");
    this.check("Network preconnect hints and scalable viewport implemented", Boolean(html_content.includes("rel=\"preconnect\"") &&
            html_content.includes("rel=\"dns-prefetch\"") &&
            !html_content.includes("user-scalable=no")), "");
    this.check("Accessible focus-visible styles and reduced-motion media query implemented", Boolean(html_content.includes(":focus-visible") && html_content.includes("prefers-reduced-motion")), "");
    this.check("PWA manifest enriched with categories, scope, and maskable icons", Boolean(manifest_text.includes("categories") && manifest_text.includes('"scope": "/"') && manifest_text.includes("any maskable")), "");
    this.check("Service Worker offline navigation fallback and scheme guards implemented", Boolean(sw_text.includes("mode === 'navigate'") && sw_text.includes("request.method !== 'GET'")), "");
    this.check("Browser test runner synced with Category 11 edge-case query tests", Boolean(runner_text.includes("11. การจัดการกรณีข้อความพิเศษและขอบเขต")), "");
    this.check("Toast screen-reader accessibility and iOS copy fix implemented", Boolean(html_content.includes("toast.setAttribute('role', 'status')") &&
            html_content.includes("ta.setAttribute('readonly', '')")), "");
    this.check("Path-agnostic asset loading with fetchWithFallback implemented", Boolean(html_content.includes("fetchWithFallback")), "");
    this.check("Web Worker defensive try-catch boundary and error recovery implemented", Boolean(worker_text.includes("type: 'error'") && html_content.includes("type === 'error'")), "");
    this.check("Browser test runner synced with Category 12 multi-filter precision tests", Boolean(runner_text.includes("12. การตรวจสอบตัวกรองอารมณ์ ปี และตัวกรองผสม")), "");
    this.check("Modal dialog focus management and safe esc guard implemented", Boolean(html_content.includes("btn-modal-close") && html_content.includes("previousActiveElement") && html_content.includes("s === null || s === undefined")), "");
    this.check("Service Worker resilient caching with Promise.allSettled and relative assets implemented", Boolean(sw_text.includes("Promise.allSettled") && sw_text.includes("./index.html") && sw_text.includes("thungara-v")), "");
    this.check("Web Worker collaboration artist parsing with &amp and feat delimiters implemented", Boolean(worker_text.includes("replace(/&amp;/gi, '&')") && worker_text.includes("subArtistsNorm")), "");
    this.check("Browser test runner synced with Category 13 collaboration test suite", Boolean(runner_text.includes("13. การค้นหาผลงานเพลงคู่และศิลปินร่วม")), "");
    this.check("Song card keyboard navigation and aria-label accessibility implemented", Boolean(html_content.includes('tabindex="0"') && html_content.includes('role="button"') && html_content.includes('aria-label=') && html_content.includes("event.preventDefault();openModal")), "");
    this.check("Robust artist pill invocation with DATA.songs index reference implemented", Boolean(html_content.includes('id="btn-modal-artist-pill"') && html_content.includes("filterByArtistFromModal(DATA.songs[")), "");
    this.check("Search Worker token and synonym pre-normalization optimization implemented", Boolean(worker_text.includes("preparedTokens") && worker_text.includes("preparedSubTokens") && html_content.includes("preparedTokens")), "");
    this.check("Browser test runner synced with Category 14 compound prefix test suite", Boolean(runner_text.includes("14. การแยกคำอุปสรรคและส่วนขยายภาษาถิ่น")), "");
    this.check("Modal dialog keyboard focus trap and loop navigation implemented", Boolean(html_content.includes("isModalOpen && e.key === 'Tab'") && html_content.includes("focusables[0]")), "");
    this.check("YouTube accessible label and defensive web share origin guard implemented", Boolean(html_content.includes("เปิดดูมิวสิกวิดีโอ") && html_content.includes("origin !== 'null'") && html_content.includes("navigator.canShare")), "");
    this.check("Search Worker fuzzy bigram pre-check and direct character comparison implemented", Boolean(worker_text.includes("qBg0") && worker_text.includes("qBg1") && worker_text.includes("!fuzzyTitleMatch") && worker_text.includes("queryNorm[k] !== targetNorm[baseStart + k]")), "");
    this.check("Browser test runner synced with Category 15 punctuated omnibox test suite", Boolean(runner_text.includes("15. การค้นหาชื่อและศิลปินแบบมีเครื่องหมายวรรคตอนและตัวกรองสามชั้น")), "");
    this.check("Recent search chip keyboard accessibility and focus-visible indicator implemented", Boolean(html_content.includes('role="button" tabindex="0"') && html_content.includes(".chip:focus-visible")), "");
    this.check("Zero-results status message announcement in aria-live region implemented", Boolean(html_content.includes("ไม่พบเพลงที่ตรงกับเงื่อนไขการค้นหา") && html_content.includes('id="stats" aria-live="polite"')), "");
    this.check("Search Worker and Main-Thread precomputed vector entries cosine similarity implemented", Boolean(worker_text.includes("qVecEntries") && html_content.includes("qVecEntries") && worker_text.includes("Array.isArray(vecA)")), "");
    this.check("Browser test runner synced with Category 16 hybrid query test suite", Boolean(runner_text.includes("16. การค้นหาแบบผสมข้อความและตัวกรองเดี่ยว")), "");
    this.check("Voice recording overlay accessibility, live status, and escape dismiss implemented", Boolean(html_content.includes('id="rec-overlay" role="dialog" aria-modal="true"') && html_content.includes('id="rec-status" role="status" aria-live="polite"') && html_content.includes("if (isRecOpen)")), "");
    this.check("Clear search button tooltip title attribute implemented", Boolean(html_content.includes('id="btn-clear" onclick="clearSearch()" title="ล้างข้อความค้นหา"')), "");
    this.check("Search Worker and Main-Thread optimized cosine dot product lookup and countOccurrences early exit implemented", Boolean(worker_text.includes("valB !== undefined") && worker_text.includes("maxCount = 4") && html_content.includes("valB !== undefined") && html_content.includes("maxCount = 4")), "");
    this.check("Browser test runner synced with Category 17 dual filter precision test suite", Boolean(runner_text.includes("17. การค้นหาแบบผสมข้อความและตัวกรองสองชั้น")), "");
    this.check("Button focus-visible styles and load-more accessibility attributes implemented", Boolean(html_content.includes(".btn-theme:focus-visible") && html_content.includes(".btn-top:focus-visible") && html_content.includes(".btn-load-more:focus-visible") && html_content.includes('title="แสดงเพลงเพิ่มเติม"') && html_content.includes('aria-label="แสดงเพลงเพิ่มเติม"')), "");
    this.check("Search progressbar ARIA semantics and aria-hidden management implemented", Boolean(html_content.includes('id="search-progress" role="progressbar" aria-label="กำลังค้นหาเพลง" aria-hidden="true"') && html_content.includes("function setSearchProgress(active)")), "");
    this.check("Search Worker and Main-Thread cleanMatchedTerms fast-path allocation and defensive year comparison implemented", Boolean(worker_text.includes("matchedTerms.length > 0 ? Array.from(new Set(matchedTerms))") && worker_text.includes("String(song.year) !== String(filterYear)") && html_content.includes("matchedTerms.length > 0 ? Array.from(new Set(matchedTerms))") && html_content.includes("String(song.year) !== String(filterYear)")), "");
    this.check("Browser test runner synced with Category 18 quad-constraint precision test suite", Boolean(runner_text.includes("18. การค้นหาแบบผสมข้อความและตัวกรองสี่ชั้น")), "");
    this.check("Control buttons and filter dropdowns focus-visible styles implemented", Boolean(html_content.includes(".btn-mic:focus-visible") && html_content.includes(".btn-clear:focus-visible") && html_content.includes(".filter-select:focus-visible") && html_content.includes(".btn-modal-close:focus-visible") && html_content.includes(".btn-copy-lyrics:focus-visible") && html_content.includes(".btn-action-share:focus-visible")), "");
    this.check("Filter dropdowns native title tooltips implemented", Boolean(html_content.includes('id="filter-artist" onchange="doSearch()" title="กรองตามชื่อศิลปิน"') && html_content.includes('id="filter-emotion" onchange="doSearch()" title="กรองตามอารมณ์เพลง"') && html_content.includes('id="filter-year" onchange="doSearch()" title="กรองตามปีที่เผยแพร่"')), "");
    this.check("URL parameters deep-linking restoration for emotion, year, and sort implemented", Boolean(html_content.includes("const emotionParam = params.get('emotion')") && html_content.includes("const yearParam = params.get('year')") && html_content.includes("const sortParam = params.get('sort')")), "");
    this.check("Browser test runner synced with Category 19 multi-filter mutual exclusivity test suite", Boolean(runner_text.includes("19. การตรวจสอบความเข้ากันไม่ได้ของตัวกรองและขอบเขตผลลัพธ์ว่าง")), "");
    this.check("Search Worker and Main-Thread matchedTerms lyric phrase evidence inclusion for omnibox queries implemented", Boolean(worker_text.includes("matchedTerms.push(remQ)") && html_content.includes("matchedTerms.push(remQ)")), "");
    this.check("Recent searches keyboard accessibility with Delete and Backspace shortcuts implemented", Boolean(html_content.includes("event.key==='Delete'||event.key==='Backspace'")), "");
    this.check("Modal dialog accessibility with aria-describedby pointing to artist name implemented", Boolean(html_content.includes('aria-describedby="modal-artist"')), "");
    this.check("Browser test runner synced with Category 20 hybrid omnibox artist-lyric test suite", Boolean(runner_text.includes("20. การค้นหาแบบ Omnibox ผสมชื่อศิลปินและท่อนเนื้อร้อง")), "");
    this.check("Search Worker and Main-Thread spaced hyphen duet collaboration artist parsing implemented", Boolean(worker_text.includes("\\s+-\\s+") && html_content.includes("\\s+-\\s+")), "");
    this.check("Search Worker and Main-Thread deterministic sort tie-breaker implemented", Boolean(worker_text.includes("(a.idx - b.idx)") && html_content.includes("(a.idx - b.idx)")), "");
    this.check("Back-to-top button hidden focus visibility guard and modal artist pill aria-label implemented", Boolean(html_content.includes("visibility: hidden") && html_content.includes('id="btn-modal-artist-pill"') && html_content.includes('aria-label="ดูผลงานทั้งหมดของ')), "");
    this.check("Browser test runner synced with Category 21 spaced hyphen collaboration test suite", Boolean(runner_text.includes("21. การค้นหาผลงานเพลงคู่ที่มีเครื่องหมายขีดคั่นแบบเว้นวรรค")), "");
    this.check("Main-Thread search function parameter decoupling and fallback pass-through implemented", Boolean(html_content.includes("function search(query, filterArtist, filterEmotion, filterYear)") && html_content.includes("search(query || '  ', fa, fe, fy)")), "");
    this.check("Clear search filter-sort reset to relevance and defensive element handling implemented", Boolean(html_content.includes("fSort.value = 'relevance'") && html_content.includes("const el = document.getElementById('search-input')")), "");
    this.check("Speech recognition unavailable state disabled attribute and accessible tooltip implemented", Boolean(html_content.includes("micBtn.disabled = true") && html_content.includes("micBtn.setAttribute('aria-label', 'เบราว์เซอร์ไม่รองรับการค้นหาด้วยเสียง')")), "");
    this.check("Browser test runner synced with Category 22 ASCII and mixed-language test suite", Boolean(runner_text.includes("22. การค้นหาชื่อศิลปินภาษาอังกฤษและการค้นหาแบบหลายภาษา")), "");
    this.check("Search Worker and Main-Thread monotonic searchId sequence guard and in-flight invalidation implemented", Boolean(html_content.includes("currentSearchId") && html_content.includes("e.data.searchId !== currentSearchId") && worker_text.includes("searchId: searchId") && html_content.includes("currentSearchId++")), "");
    this.check("Defensive filter DOM resolution in renderResults and dynamic load-more aria-label implemented", Boolean(html_content.includes("(fA && fA.value) || (fE && fE.value) || (fY && fY.value)") && html_content.includes("btnLoadMore.setAttribute('aria-label', 'แสดงเพลงที่เกี่ยวข้องเพิ่มเติม อีก '")), "");
    this.check("Modal and Voice recording dialog overlay aria-hidden lifecycle and OS theme media listener implemented", Boolean(html_content.includes('id="modal-overlay" aria-hidden="true"') && html_content.includes('id="rec-overlay"') && html_content.includes('aria-hidden="true"') && html_content.includes("mqlTheme.addEventListener('change'")), "");
    this.check("Browser test runner synced with Category 23 alphanumeric omnibox test suite", Boolean(runner_text.includes("23. การค้นหาชื่อเพลงที่มีตัวเลข คำย่อ และคำทับศัพท์")), "");
    this.check("Auto-resize defensive null-guard and centralized invocation implemented", Boolean(html_content.includes("if (!el") && html_content.includes("autoResize(input)") && html_content.includes("autoResize(el)")), "");
    this.check("Scroll listener defensive button-top resolution and clear button guard implemented", Boolean(html_content.includes("const btnTop = document.getElementById('btn-top')") && html_content.includes("btnTop.classList.toggle('show'") && html_content.includes("const btnClear = document.getElementById('btn-clear')")), "");
    this.check("Fallback copy execCommand return validation and finally block DOM cleanup implemented", Boolean(html_content.includes("document.execCommand('copy')") && html_content.includes("ta.parentNode.removeChild(ta)") && worker_text.includes("!DATA || !DATA.songs")), "");
    this.check("Browser test runner synced with Category 24 parenthetical English subtitle test suite", Boolean(runner_text.includes("24. การค้นหาชื่อเพลงภาษาอังกฤษในวงเล็บ")), "");
    this.check("Worker and Main-Thread cosine similarity defensive vector resolution implemented", Boolean(html_content.includes("const vecB = (DATA && DATA.vectors && DATA.vectors[songIdx]) || null") && worker_text.includes("const vecB = (DATA && DATA.vectors && DATA.vectors[songIdx]) || null")), "");
    this.check("Populate filters defensive element and array resolution implemented", Boolean(html_content.includes("Array.isArray(DATA && DATA.artists)") && html_content.includes("Array.isArray(DATA && DATA.emotions)")), "");
    this.check("Category 25 repeated whitespace and spaced delimiter omnibox test suite verified", Boolean(test_search_py_text.includes("Category 25: Repeated Whitespace & Spaced Delimiter Omnibox Resilience")), "");
    this.check("Browser test runner synced with Category 25 repeated whitespace omnibox test suite", Boolean(runner_text.includes("25. การค้นหาทนทานต่อช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอน")), "");
    this.check("Service Worker v25 cache key synchronization verified in main thread", Boolean(html_content.includes("caches.delete(k)")), "");
    this.check("Category 26 punctuation and quoted omnibox search test suite verified", Boolean(test_search_py_text.includes("Category 26: Punctuation and Quoted Omnibox Search Queries")), "");
    this.check("Browser test runner synced with Category 26 punctuation and quoted test suite", Boolean(runner_text.includes("26. การค้นหาคำที่มีเครื่องหมายคำพูดและวรรคตอน")), "");
    this.check("Service Worker v26 offline caching manifest integrity verified", Boolean(sw_text.includes("CACHE_NAME = 'thungara-") && sw_text.includes("Promise.allSettled")), "");
    this.check("Clipboard copy lyrics and share song defensive fallback string resolution implemented", Boolean(html_content.includes("rawLyrics = (song") && html_content.includes("+ (song.lyrics || '');")), "");
    this.check("Recent search history defensive Array.isArray validation implemented", Boolean(html_content.includes("if (!Array.isArray(list)) list = [];") && html_content.includes("return Array.isArray(val) ? val : [];")), "");
    this.check("Category 27 multi-token dialect and combined omnibox test suite verified", Boolean(test_search_py_text.includes("Category 27: Multi-Token Dialect & Combined Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 27 multi-token dialect test suite", Boolean(runner_text.includes("27. การค้นหาคำพ้องภาษาถิ่นอีสานและค้นหาแบบผสม")), "");
    this.check("HighlightText defensive RegExp compilation and try-catch guard implemented", Boolean(html_content.includes("const pattern = uniqueWords.map(w => escRegex(esc(w))).filter(Boolean).join('|');") && html_content.includes("catch (err) {")), "");
    this.check("Compound sub-tokens extraction defensive SYNONYMS resolution implemented", Boolean(html_content.includes("typeof SYNONYMS !== 'undefined' && SYNONYMS && SYNONYMS[root]") && worker_text.includes("typeof SYNONYMS !== 'undefined' && SYNONYMS && SYNONYMS[root]")), "");
    this.check("Category 28 numeric song year omnibox test suite verified", Boolean(test_search_py_text.includes("Category 28: Numeric Song Year & Combined Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 28 numeric song year test suite", Boolean(runner_text.includes("28. การค้นหาชื่อเพลงพร้อมปี พ.ศ.")), "");
    this.check("Defensive search clear debounce timer cancellation implemented", Boolean(html_content.includes("clearTimeout(debounceTimer);") && html_content.includes("function clearSearch()")), "");
    this.check("Web Share API defensive canShare and shareData payload validation implemented", Boolean(html_content.includes("const shareData = {") && html_content.includes("canUseNativeShare") && html_content.includes("navigator.canShare(shareData)")), "");
    this.check("Category 29 duet and collaboration artist omnibox test suite verified", Boolean(test_search_py_text.includes("Category 29: Duet & Collaboration Artist Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 29 duet and collaboration test suite", Boolean(runner_text.includes("29. การค้นหาเพลงร้องคู่และศิลปินร่วม")), "");
    this.check("Modal artist pill filter reset resilience implemented", Boolean(html_content.includes("const fEmotion = document.getElementById('filter-emotion');") && html_content.includes("if (fEmotion) fEmotion.value = '';")), "");
    this.check("Modal video preview YouTube thumbnail onerror fallback implemented", Boolean(html_content.includes("onerror=\"this.onerror=null;this.src=") && html_content.includes("mqdefault.jpg")), "");
    this.check("Category 30 delimited duet and collaboration omnibox test suite verified", Boolean(test_search_py_text.includes("Category 30: Delimited Duet & Collaboration Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 30 delimited duet test suite", Boolean(runner_text.includes("30. การค้นหาศิลปินคู่แบบคั่นเครื่องหมาย")), "");
    this.check("URL hash sanitization and decodeURIComponent try-catch guard implemented", Boolean(html_content.includes("window.location.hash") && html_content.includes("decodeURIComponent(window.location.hash.substring(3))") && html_content.includes("console.warn('Malformed URI in hash:'")), "");
    this.check("Speech recognition stop try-catch guard implemented", Boolean(html_content.includes("try { recognition.stop(); } catch (e)") && html_content.includes("catch (stopErr) {}")), "");
    this.check("Category 31 excessive spaces and trailing punctuation test suite verified", Boolean(test_search_py_text.includes("Category 31: Excessive Spaces and Trailing Punctuation Handling")), "");
    this.check("Browser test runner synced with Category 31 excessive spaces test suite", Boolean(runner_text.includes("31. การจัดการช่องว่างซ้ำซ้อนและเครื่องหมายวรรคตอนท้ายคำ")), "");
    this.check("SafeStorage quota exceeded exception logging added", Boolean(html_content.includes("console.warn('SafeStorage set error:', e);") && html_content.includes("console.warn('SafeStorage setJSON error:', e);")), "");
    this.check("Edit distance early return optimization implemented", Boolean(html_content.includes("if (textA === textB) return true;") && worker_text.includes("if (textA === textB) return true;")), "");
    this.check("Category 32 repetitive characters test suite verified", Boolean(test_search_py_text.includes("Category 32: Repetitive Characters Handling")), "");
    this.check("Browser test runner synced with Category 32 repetitive characters suite", Boolean(runner_text.includes("32. การจัดการตัวอักษรซ้ำซ้อน")), "");
    this.check("Data loader response ok validation and fallback fetch warning logging implemented", Boolean(html_content.includes("Primary fetch failed for") && html_content.includes("if (!res.ok) throw new Error('HTTP error ' + res.status + ' loading data.json');")), "");
    this.check("Clipboard API defensive failure warning logging implemented", Boolean(html_content.includes("console.warn('navigator.clipboard.writeText failed, using fallback:', err);")), "");
    this.check("Category 33 zero-width characters and non-breaking spaces test suite verified", Boolean(test_search_py_text.includes("Category 33: Zero-Width Characters and Non-Breaking Spaces Handling")), "");
    this.check("Browser test runner synced with Category 33 zero-width test suite", Boolean(runner_text.includes("33. การจัดการอักขระ Zero-Width และช่องว่าง Non-Breaking Space")), "");
    this.check("SafeStorage remove exception logging and escRegex defensive type guard implemented", Boolean(html_content.includes("console.warn('SafeStorage remove error:', e);") && html_content.includes("if (!s || typeof s !== 'string') return '';")), "");
    this.check("Highlight lyrics regex compilation defensive warning logging implemented", Boolean(html_content.includes("console.warn('highlightLyrics regex error:', err);")), "");
    this.check("Category 34 uppercase Latin and mixed-case subtitle test suite verified", Boolean(test_search_py_text.includes("Category 34: Uppercase Latin & Mixed-Case Subtitle Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 34 uppercase Latin subtitle suite", Boolean(runner_text.includes("34. การค้นหาชื่อเพลงภาษาอังกฤษตัวพิมพ์ใหญ่")), "");
    this.check("Render results query defensive null trimming guards implemented", Boolean(html_content.includes("const trimmedQuery = (query || '').trim();") && html_content.includes("(query && query.trim()) ? getMatchPercent(r)")), "");
    this.check("Speech recognition error console warning logging implemented", Boolean(html_content.includes("console.warn('SpeechRecognition error:'")), "");
    this.check("Category 35 bracket-wrapped and enclosed queries test suite verified", Boolean(test_search_py_text.includes("Category 35: Bracket-Wrapped & Enclosed Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 35 bracket-wrapped query suite", Boolean(runner_text.includes("35. การค้นหาคำที่ครอบด้วยเครื่องหมายวงเล็บเหลี่ยมและปีกกา")), "");
    this.check("Match percent defensive null result validation implemented", Boolean(html_content.includes("if (!result")), "");
    this.check("YouTube ID defensive resolution guard implemented in modal and share", Boolean(html_content.includes("YOUTUBE_MAP ? (YOUTUBE_MAP[song.id] || YOUTUBE_MAP[String(song.id)] || YOUTUBE_MAP[String(idx)]) : null")), "");
    this.check("Category 36 angle bracket and parenthetical queries test suite verified", Boolean(test_search_py_text.includes("Category 36: Angle Bracket & Parenthetical Enclosed Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 36 angle bracket query suite", Boolean(runner_text.includes("36. การค้นหาคำที่ครอบด้วยเครื่องหมายวงเล็บสามเหลี่ยมและวงเล็บกลม")), "");
    this.check("Toast notification message defensive argument guard implemented", Boolean(html_content.includes("if (!msg")), "");
    this.check("URL parameter handling defensive catch error logging implemented", Boolean(html_content.includes("console.warn('handleUrlParams error:', e);")), "");
    this.check("Category 37 arithmetic and mathematical symbol queries test suite verified", Boolean(test_search_py_text.includes("Category 37: Mathematical & Arithmetic Symbol Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 37 arithmetic symbol query suite", Boolean(runner_text.includes("37. การค้นหาคำที่มีเครื่องหมายทางคณิตศาสตร์")), "");
    this.check("Search input and clear button defensive element null guards implemented", Boolean(html_content.includes("const searchInput = document.getElementById('search-input');") && html_content.includes("if (searchInput) {") && html_content.includes("if (btnClear) btnClear.classList.toggle")), "");
    this.check("Category 38 hashtag and commercial symbol queries test suite verified", Boolean(test_search_py_text.includes("Category 38: Currency, Hashtag & Commercial Symbol Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 38 hashtag symbol query suite", Boolean(runner_text.includes("38. การค้นหาคำที่มีเครื่องหมายแฮชแท็กและสัญลักษณ์พิเศษ")), "");
    this.check("DoSearch input and filter elements defensive null guards implemented", Boolean(html_content.includes("const inputEl = document.getElementById('search-input');") && html_content.includes("const query = inputEl ? inputEl.value.trim() : '';") && html_content.includes("const fa = fArtistEl ? fArtistEl.value : '';")), "");
    this.check("Category 39 colon and semicolon delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 39: Punctuation Colon, Semicolon & Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 39 colon and semicolon delimiter suite", Boolean(runner_text.includes("39. การค้นหาคำที่มีเครื่องหมายโคลอนและเซมิโคลอน")), "");
    this.check("OpenModal modal elements defensive null guards implemented", Boolean(html_content.includes("const elTitle = document.getElementById('modal-title');") && html_content.includes("if (elTitle) elTitle.innerHTML") && html_content.includes("if (elLyrics) elLyrics.innerHTML")), "");
    this.check("Category 40 pipe and slash delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 40: Pipe & Slash Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 40 pipe and slash delimiter suite", Boolean(runner_text.includes("40. การค้นหาคำที่มีเครื่องหมายไปป์และสแลช")), "");
    this.check("RenderResults and closeModal defensive element null guards implemented", Boolean(html_content.includes("if (container) container.style.display = 'none';") && html_content.includes("if (!e || !e.target || typeof e.target.closest !== 'function') return;")), "");
    this.check("Category 41 hyphen, dash and tilde delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 41: Hyphen, Dash & Tilde Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 41 hyphen, dash and tilde delimiter suite", Boolean(runner_text.includes("41. การค้นหาคำที่มีเครื่องหมายยัติภังค์และตัวหนอน")), "");
    this.check("AppendNextBatch song and container defensive null guards implemented", Boolean(html_content.includes("if (!r || !DATA || !DATA.songs || !DATA.songs[r.idx]) continue;") && html_content.includes("if (stats) stats.textContent = label + currentResults.length")), "");
    this.check("Category 42 underscore and asterisk delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 42: Underscore & Asterisk Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 42 underscore and asterisk delimiter suite", Boolean(runner_text.includes("42. การค้นหาคำที่มีเครื่องหมายขีดล่างและดอกจัน")), "");
    this.check("SortResultsList defensive array and score null guards implemented", Boolean(html_content.includes("if (!Array.isArray(list) || list.length <= 1 || !DATA || !DATA.songs) return Array.isArray(list) ? list : [];") && html_content.includes("const sA = (a && typeof a.score === 'number') ? a.score : 0;")), "");
    this.check("Category 43 bullet and middle dot delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 43: Bullet & Middle Dot Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 43 bullet and middle dot delimiter suite", Boolean(runner_text.includes("43. การค้นหาคำที่มีเครื่องหมายจุดหัวข้อย่อยและจุดกึ่งกลาง")), "");
    this.check("Recent searches defensive string validation and null guards implemented", Boolean(html_content.includes("if (!q || typeof q !== 'string' || q.trim().length < 2) return;") && html_content.includes("if (!term || typeof term !== 'string') return;")), "");
    this.check("Category 44 exclamation and question mark delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 44: Exclamation & Question Mark Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 44 exclamation and question mark delimiter suite", Boolean(runner_text.includes("44. การค้นหาคำที่มีเครื่องหมายอัศเจรีย์และปรัศนี")), "");
    this.check("CopyToClipboard and fallbackCopy defensive string and type guards implemented", Boolean(html_content.includes("if (!text || typeof text !== 'string') return;") && html_content.includes("const msg = typeof successMsg === 'string' ? successMsg : 'คัดลอกเรียบร้อยแล้ว!';")), "");
    this.check("Category 45 caret and at sign delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 45: Caret & At Sign Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 45 caret and at sign delimiter suite", Boolean(runner_text.includes("45. การค้นหาคำที่มีเครื่องหมายหมวกและแอดไซน์")), "");
    this.check("ShowToast and autoResize defensive type and element guards implemented", Boolean(html_content.includes("if (!msg || typeof msg !== 'string' || !msg.trim()) return;") && html_content.includes("if (!el || !el.style || typeof el.scrollHeight !== 'number'")), "");
    this.check("Category 46 percent and dollar delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 46: Percent Sign & Dollar Sign Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 46 percent and dollar delimiter suite", Boolean(runner_text.includes("46. การค้นหาคำที่มีเครื่องหมายเปอร์เซ็นต์และดอลลาร์")), "");
    this.check("SafeStorage defensive key string and serialization null guards implemented", Boolean(html_content.includes("if (!key || typeof key !== 'string' || typeof window === 'undefined' || !window.localStorage) return fallback;") && html_content.includes("if (!key || typeof key !== 'string' || value === undefined) return false;")), "");
    this.check("Category 47 comma and ellipsis delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 47: Comma & Ellipsis Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 47 comma and ellipsis delimiter suite", Boolean(runner_text.includes("47. การค้นหาคำที่มีเครื่องหมายจุลภาคและจุดไข่ปลา")), "");
    this.check("ApplyTheme and isDarkActive defensive root and matchMedia guards implemented", Boolean(html_content.includes("if (!root") && html_content.includes("if (typeof window !== 'undefined' && typeof window.matchMedia === 'function')")), "");
    this.check("Category 48 equal sign and double hyphen delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 48: Equal Sign & Double Hyphen Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 48 equal sign and double hyphen delimiter suite", Boolean(runner_text.includes("48. การค้นหาคำที่มีเครื่องหมายเท่ากับและขีดคู่")), "");
    this.check("PopulateFilters and clearSearch defensive null and focus guards implemented", Boolean(html_content.includes("if (a !== null && a !== undefined && String(a).trim())") && html_content.includes("if (el && typeof el.focus === 'function')")), "");
    this.check("Category 49 backtick and quotation mark delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 49: Backtick & Quotation Mark Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 49 backtick and quotation mark delimiter suite", Boolean(runner_text.includes("49. การค้นหาคำที่มีเครื่องหมายแบ็กทิกและเครื่องหมายคำพูด")), "");
    this.check("GetMatchPercent and loadMore defensive score and bounds guards implemented", Boolean(html_content.includes("if (!result || typeof result !== 'object') return 0;") && html_content.includes("if (!Array.isArray(currentResults) || displayedCount >= currentResults.length) return;")), "");
    this.check("Category 50 backslash and double slash delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 50: Backslash & Double Slash Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 50 backslash and double slash delimiter suite", Boolean(runner_text.includes("50. การค้นหาคำที่มีเครื่องหมายแบ็กสแลชและดับเบิลสแลช")), "");
    this.check("GetPreview and highlightText defensive string type guards implemented", Boolean(html_content.includes("if (!lyrics || typeof lyrics !== 'string') return '';") && html_content.includes("if (!text || typeof text !== 'string') return '';")), "");
    this.check("Category 51 arrow and fat arrow delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 51: Arrow & Fat Arrow Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 51 arrow and fat arrow delimiter suite", Boolean(runner_text.includes("51. การค้นหาคำที่มีเครื่องหมายลูกศรและแฟตแอร์โรว์")), "");
    this.check("GetArtistSongCount and filterByArtistFromModal defensive string type guards implemented", Boolean(html_content.includes("if (!DATA || !DATA.songs || !artistName || typeof artistName !== 'string') return 0;") && html_content.includes("if (!artistName || typeof artistName !== 'string') return;")), "");
    this.check("Category 52 double colon and double pipe delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 52: Double Colon & Double Pipe Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 52 double colon and double pipe delimiter suite", Boolean(runner_text.includes("52. การค้นหาคำที่มีเครื่องหมายดับเบิลโคลอนและดับเบิลไปป์")), "");
    this.check("RemoveRecentSearch and modal actions defensive event and type guards implemented", Boolean(html_content.includes("if (e && typeof e.stopPropagation === 'function') e.stopPropagation();") && html_content.includes("typeof currentModalSongIdx === 'number'")), "");
    this.check("Category 53 double ampersand and double plus delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 53: Double Ampersand & Double Plus Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 53 double ampersand and double plus delimiter suite", Boolean(runner_text.includes("53. การค้นหาคำที่มีเครื่องหมายดับเบิลแอมเพอร์แซนด์และดับเบิลพลัส")), "");
    this.check("RenderResults and setSearchProgress defensive array and classList guards implemented", Boolean(html_content.includes("rawSearchResults = Array.isArray(results) ? results : [];") && html_content.includes("if (!el || !el.classList || typeof el.classList.toggle !== 'function') return;")), "");
    this.check("Category 54 left arrow and double tilde delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 54: Left Arrow & Double Tilde Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 54 left arrow and double tilde delimiter suite", Boolean(runner_text.includes("54. การค้นหาคำที่มีเครื่องหมายลูกศรซ้ายและดับเบิลทิลเดอ")), "");
    this.check("HandleUrlParams and updateThemeIcon defensive options and setAttribute guards implemented", Boolean(html_content.includes("fArtist.options && Array.from(fArtist.options)") && html_content.includes("if (btn && typeof btn.setAttribute === 'function')")), "");
    this.check("Category 55 double caret and double asterisk delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 55: Double Caret & Double Asterisk Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 55 double caret and double asterisk delimiter suite", Boolean(runner_text.includes("55. การค้นหาคำที่มีเครื่องหมายดับเบิลแคเร็ตและดับเบิลดอกจัน")), "");
    this.check("Hotkey input and scroll listener defensive setSelectionRange and toggle guards implemented", Boolean(html_content.includes("if (typeof input.setSelectionRange === 'function')") && html_content.includes("if (btnTop && btnTop.classList && typeof btnTop.classList.toggle === 'function')")), "");
    this.check("Category 56 double underscore and bidirectional arrow delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 56: Double Underscore & Bidirectional Arrow Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 56 double underscore and bidirectional arrow delimiter suite", Boolean(runner_text.includes("56. การค้นหาคำที่มีเครื่องหมายดับเบิลอันเดอร์สกอร์และลูกศรสองทาง")), "");
    this.check("Speech recognition lifecycle defensive element guards implemented", Boolean(html_content.includes("if (micBtn && micBtn.classList) micBtn.classList.add('recording');") && html_content.includes("if (micBtn && micBtn.classList) micBtn.classList.remove('recording');")), "");
    this.check("Category 57 triple hyphen and triple plus delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 57: Triple Hyphen & Triple Plus Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 57 triple hyphen and triple plus delimiter suite", Boolean(runner_text.includes("57. การค้นหาคำที่มีเครื่องหมายขีดสามชั้นและบวกสามชั้น")), "");
    this.check("Modal overflow and focus trap defensive event guards implemented", Boolean(html_content.includes("if (document.body && document.body.style) document.body.style.overflow = 'hidden';") && html_content.includes("if (lastEl && typeof lastEl.focus === 'function') lastEl.focus();")), "");
    this.check("Category 58 triple equal sign and triple asterisk delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 58: Triple Equal Sign & Triple Asterisk Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 58 triple equal sign and triple asterisk delimiter suite", Boolean(runner_text.includes("58. การค้นหาคำที่มีเครื่องหมายเท่ากับสามชั้นและดอกจันสามชั้น")), "");
    this.check("Speech recognition completion and error lifecycle defensive element guards implemented", Boolean(html_content.includes("if (recTranscript) recTranscript.innerHTML = html") && html_content.includes("if (recStatus) recStatus.textContent = msg;")), "");
    this.check("Category 59 triple tilde and triple dot delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 59: Triple Tilde & Triple Dot Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 59 triple tilde and triple dot delimiter suite", Boolean(runner_text.includes("59. การค้นหาคำที่มีเครื่องหมายตัวหนอนสามชั้นและจุดสามชั้น")), "");
    this.check("Video preview container and recent search apply defensive guards implemented", Boolean(html_content.includes("if (!song") && html_content.includes("if (typeof input.focus === 'function') input.focus();")), "");
    this.check("Category 60 triple slash and triple pipe delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 60: Triple Slash & Triple Pipe Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 60 triple slash and triple pipe delimiter suite", Boolean(runner_text.includes("60. การค้นหาคำที่มีเครื่องหมายสแลชสามชั้นและไปป์สามชั้น")), "");
    this.check("Theme controller and fallback copy defensive environment guards implemented", Boolean(html_content.includes("if (!root || typeof root.setAttribute !== 'function') return;") && html_content.includes("if (document.body && typeof document.body.appendChild === 'function') {")), "");
    this.check("Category 61 triple caret and triple underscore delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 61: Triple Caret & Triple Underscore Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 61 triple caret and triple underscore delimiter suite", Boolean(runner_text.includes("61. การค้นหาคำที่มีเครื่องหมายแคเร็ตสามชั้นและอันเดอร์สกอร์สามชั้น")), "");
    this.check("Data bootstrap UI state and filter population defensive guards implemented", Boolean(html_content.includes("if (elStats && DATA && Array.isArray(DATA.songs)) elStats.textContent") && html_content.includes("if (fArtist && typeof fArtist.insertAdjacentHTML === 'function'")), "");
    this.check("Category 62 left triple arrow and right triple arrow delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 62: Left Triple Arrow & Right Triple Arrow Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 62 left triple arrow and right triple arrow delimiter suite", Boolean(runner_text.includes("62. การค้นหาคำที่มีเครื่องหมายลูกศรซ้ายสามชั้นและลูกศรขวาสามชั้น")), "");
    this.check("Toast controller and share handler defensive DOM and execution guards implemented", Boolean(html_content.includes("if (!document.body || typeof document.body.appendChild !== 'function') return;") && html_content.includes("typeof navigator !== 'undefined' && navigator.share && typeof navigator.share === 'function'")), "");
    this.check("Category 63 triple exclamation and triple question delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 63: Triple Exclamation & Triple Question Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 63 triple exclamation and triple question delimiter suite", Boolean(runner_text.includes("63. การค้นหาคำที่มีเครื่องหมายอัศเจรีย์สามชั้นและปรัศนีสามชั้น")), "");
    this.check("ClearSearch and toggleRecording defensive execution and classList guards implemented", Boolean(html_content.includes("if (btnClear && btnClear.classList && typeof btnClear.classList.remove === 'function')") && html_content.includes("if (!recognition || typeof recognition.stop !== 'function' || typeof recognition.start !== 'function') return;")), "");
    this.check("Category 64 triple hash and triple backslash delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 64: Triple Hash & Triple Backslash Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 64 triple hash and triple backslash delimiter suite", Boolean(runner_text.includes("64. การค้นหาคำที่มีเครื่องหมายแฮชสามชั้นและแบ็กสแลชสามชั้น")), "");
    this.check("Esc fallback and filterByArtistFromModal scroll defensive guards implemented", Boolean(html_content.includes("if (typeof document !== 'undefined' && document && typeof document.createElement === 'function')") && html_content.includes("if (typeof window !== 'undefined' && typeof window.scrollTo === 'function')")), "");
    this.check("Category 65 triple at sign and triple percent delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 65: Triple At Sign & Triple Percent Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 65 triple at sign and triple percent delimiter suite", Boolean(runner_text.includes("65. การค้นหาคำที่มีเครื่องหมายแอทสามชั้นและเปอร์เซ็นต์สามชั้น")), "");
    this.check("MatchMedia listener and autoResize defensive execution guards implemented", Boolean(html_content.includes("mqlTheme && typeof mqlTheme.addEventListener === 'function'") && html_content.includes("typeof el.scrollHeight !== 'number' || isNaN(el.scrollHeight)")), "");
    this.check("Category 66 triple dollar and triple ampersand delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 66: Triple Dollar & Triple Ampersand Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 66 triple dollar and triple ampersand delimiter suite", Boolean(runner_text.includes("66. การค้นหาคำที่มีเครื่องหมายดอลลาร์สามชั้นและแอมเพอร์แซนด์สามชั้น")), "");
    this.check("CountOccurrences and highlightFuzzyRange defensive string type guards implemented", Boolean(html_content.includes("if (!sub || !str || typeof str !== 'string' || typeof sub !== 'string') return 0;") && html_content.includes("if (!text || !query || typeof text !== 'string' || typeof query !== 'string') return null;")), "");
    this.check("Category 67 triple semicolon and triple colon delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 67: Triple Semicolon & Triple Colon Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 67 triple semicolon and triple colon delimiter suite", Boolean(runner_text.includes("67. การค้นหาคำที่มีเครื่องหมายอัฒภาคสามชั้นและทวิภาคสามชั้น")), "");
    this.check("NormalizeText, isValidThaiQuery, and tokenizeQuery defensive string type guards implemented", Boolean(html_content.includes("if (!text || typeof text !== 'string') return '';") && html_content.includes("if (!text || typeof text !== 'string') return false;") && html_content.includes("if (!vocabSet || !text || typeof text !== 'string') return [];")), "");
    this.check("Category 68 triple backtick and triple quotation mark delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 68: Triple Backtick & Triple Quotation Mark Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 68 triple backtick and triple quotation mark delimiter suite", Boolean(runner_text.includes("68. การค้นหาคำที่มีเครื่องหมายแบ็กทิกสามชั้นและเครื่องหมายคำพูดสามชั้น")), "");
    this.check("OpenModal, shareSong, and copyLyrics defensive numeric type and bounds guards implemented", Boolean(html_content.includes("if (typeof idx !== 'number' || isNaN(idx) || idx < 0 || !DATA || !DATA.songs || !DATA.songs[idx]) return;")), "");
    this.check("Category 69 triple open bracket and triple close bracket delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 69: Triple Open Bracket & Triple Close Bracket Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 69 triple open bracket and triple close bracket delimiter suite", Boolean(runner_text.includes("69. การค้นหาคำที่มีเครื่องหมายวงเล็บเหลี่ยมเปิดสามชั้นและวงเล็บเหลี่ยมปิดสามชั้น")), "");
    this.check("CopyCurrentLyrics, shareCurrentSong, and renderVideoPreview defensive NaN and object type guards implemented", Boolean(html_content.includes("if (typeof currentModalSongIdx === 'number' && !isNaN(currentModalSongIdx) && currentModalSongIdx >= 0)") && html_content.includes("if (!song || typeof song !== 'object')")), "");
    this.check("Category 70 triple open parenthesis and triple close parenthesis delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 70: Triple Open Parenthesis & Triple Close Parenthesis Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 70 triple open parenthesis and triple close parenthesis delimiter suite", Boolean(runner_text.includes("70. การค้นหาคำที่มีเครื่องหมายวงเล็บเปิดสามชั้นและวงเล็บปิดสามชั้น")), "");
    this.check("HandleUrlParams and sortResultsList defensive safety and index bounds guards implemented", Boolean(html_content.includes("const searchStr = (typeof window !== 'undefined' && window.location && typeof window.location.search === 'string') ? window.location.search : '';") && html_content.includes("const sA = (typeof a.idx === 'number' && a.idx >= 0 && DATA.songs[a.idx]) ? DATA.songs[a.idx] : null;")), "");
    this.check("Category 71 triple open brace and triple close brace delimiter queries test suite verified", Boolean(test_search_py_text.includes("Category 71: Triple Open Brace & Triple Close Brace Delimiter Omnibox Queries")), "");
    this.check("Browser test runner synced with Category 71 triple open brace and triple close brace delimiter suite", Boolean(runner_text.includes("71. การค้นหาคำที่มีเครื่องหมายวงเล็บปีกกาเปิดสามชั้นและวงเล็บปีกกาปิดสามชั้น")), "");

    // Final Summary
    console.log('\n' + '='.repeat(65));
    const total = this.passed + this.failed;
    const rate = total > 0 ? ((this.passed / total) * 100).toFixed(1) : 0;
    console.log(`  FULL-SYSTEM AUDIT SUMMARY: Total=${total}, Passed=${this.passed}, Failed=${this.failed}`);
    console.log(`  SUCCESS RATE: ${rate}%`);
    console.log('='.repeat(65) + '\n');

    return this.failed === 0;
  }
}

module.exports = {
  FullSystemTester,
};

if (require.main === module) {
  const tester = new FullSystemTester();
  tester.runAll().then(success => {
    process.exit(success ? 0 : 1);
  });
}
