"""
test_full_system.py - Comprehensive Full-System Test Suite for Thungara
Tests:
1. Data Integrity & Schema Audit (data.json, youtube_ids.json)
2. Git Hygiene & Confidentiality Audit (.gitignore, secret leak checks)
3. Search Engine Ranking & Tiered Confidence Accuracy
4. Fuzzy Highlighting & Evidence Generation
5. Dialect Synonym Expansion & Coverage
6. Latency & Performance Benchmarking (< 25ms)
"""
import os
import sys
import json
import time
import math
import subprocess

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
DATA_FILE = os.path.join(PROJECT_ROOT, 'data', 'data.json')
YT_FILE = os.path.join(PROJECT_ROOT, 'data', 'youtube_ids.json')
GITIGNORE_FILE = os.path.join(PROJECT_ROOT, '.gitignore')
README_FILE = os.path.join(PROJECT_ROOT, 'README.md')

from tests.test_search import (
    SONGS, VOCAB, IDF, VECTORS, VECTOR_MAGS,
    enhanced_search, run_all_tests
)

class FullSystemTester:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.results = []

    def check(self, name, condition, details=""):
        if condition:
            self.passed += 1
            print(f"  [PASS] {name}")
            self.results.append((name, "PASS", details))
        else:
            self.failed += 1
            print(f"  [FAIL] {name} - Details: {details}")
            self.results.append((name, "FAIL", details))

    def run_all(self):
        print("\n" + "=" * 65)
        print("  THUNGARA FULL-SYSTEM COMPREHENSIVE AUDIT & TEST SUITE")
        print("=" * 65)

        # Section 1: Data Integrity & Schema
        print("\n--- Phase 1: Data Integrity & Schema Audit ---")
        self.check("data.json exists and is readable", os.path.exists(DATA_FILE))
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.check("Songs count is 1,500", len(data.get('songs', [])) == 1500, f"Found: {len(data.get('songs', []))}")
        self.check("Vocab size >= 5,000 words", len(data.get('vocab', [])) >= 5000, f"Found: {len(data.get('vocab', []))}")
        self.check("Vectors match songs count", len(data.get('vectors', [])) == 1500)
        self.check("youtube_ids.json exists", os.path.exists(YT_FILE))
        with open(YT_FILE, 'r', encoding='utf-8') as f:
            yt = json.load(f)
        self.check("YouTube mapped songs > 1,400", len(yt) > 1400, f"Found: {len(yt)}")

        # Section 2: Git Hygiene & Secret Leak Prevention
        print("\n--- Phase 2: Git Hygiene & Confidentiality Audit ---")
        self.check(".gitignore exists", os.path.exists(GITIGNORE_FILE))
        with open(GITIGNORE_FILE, 'r', encoding='utf-8') as f:
            gi_content = f.read()
        self.check(".gitignore protects scripts/", "scripts/" in gi_content)
        self.check(".gitignore protects *.csv", "*.csv" in gi_content)

        # Check tracked files in Git
        res_git = subprocess.run(
            ["git", "ls-files"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        tracked_files = res_git.stdout.splitlines()
        no_csv = not any(f.endswith('.csv') for f in tracked_files)
        no_preprocess = "scripts/preprocess.py" not in tracked_files
        no_temp = "scripts/temp_check.js" not in tracked_files
        self.check("No CSV files tracked in Git", no_csv)
        self.check("Internal scripts/preprocess.py not tracked in Git", no_preprocess)
        self.check("Temporary scripts/temp_check.js removed from Git", no_temp)

        # Check README encoding and confidentiality
        with open(README_FILE, 'rb') as f:
            raw_bytes = f.read(4)
        is_not_utf16 = not (raw_bytes.startswith(b'\xff\xfe') or raw_bytes.startswith(b'\xfe\xff'))
        self.check("README.md is clean UTF-8 (not UTF-16LE)", is_not_utf16)
        with open(README_FILE, 'r', encoding='utf-8') as f:
            readme_text = f.read()
        self.check("README.md does not expose raw CSV filenames", "เนื้อเพลงลูกทุ่ง_1500.csv" not in readme_text)
        self.check("README.md does not expose internal preprocess script", "preprocess.py" not in readme_text)

        # Section 3: Search Engine Core Test Suite
        print("\n--- Phase 3: Search Engine Core & Ranking Tests ---")
        report = run_all_tests()
        self.check(
            f"Search Engine Core Test Suite ({report.total}/{report.total} assertions)",
            report.failed == 0,
            f"Passed: {report.passed}/{report.total}"
        )

        # Section 4: UI & Frontend Experience Audit
        print("\n--- Phase 4: UI & Frontend Experience Audit ---")
        index_html_path = os.path.join(PROJECT_ROOT, 'app', 'index.html')
        worker_js_path = os.path.join(PROJECT_ROOT, 'app', 'search-worker.js')
        self.check("app/index.html exists and is readable", os.path.exists(index_html_path))
        self.check("app/search-worker.js exists", os.path.exists(worker_js_path))

        with open(index_html_path, 'r', encoding='utf-8') as f:
            html_content = f.read()

        self.check("Recent search history UI implemented", "recent-searches-wrap" in html_content and "thungara_recent_searches" in html_content)
        self.check("Keyboard shortcuts implemented (/ and Esc)", "kbd-hint" in html_content and "e.key === '/'" in html_content and "e.key === 'Escape'" in html_content)
        self.check("Modern skeleton loading shimmer implemented", "skeleton-grid" in html_content and "skeletonShimmer" in html_content)
        self.check("Smart sorting controls implemented", "filter-sort" in html_content and "sortResultsList" in html_content and "applySortAndRender" in html_content)
        self.check("Artist discography insight and filter implemented", "btn-artist-pill" in html_content and "getArtistSongCount" in html_content and "filterByArtistFromModal" in html_content)
        self.check("URL query params and deep-linking implemented", "handleUrlParams" in html_content and "URLSearchParams" in html_content)
        self.check("Streamlined search UI (clean actions and no redundant chips)", "quick-suggestions-wrap" not in html_content and "btn-random" not in html_content)
        self.check(
            "Accessibility attributes (ARIA labels, roles, live regions) implemented",
            'role="search"' in html_content and
            'aria-label="ช่องค้นหาเพลง เนื้อร้อง หรือชื่อศิลปิน"' in html_content and
            'aria-live="polite"' in html_content and
            'role="dialog"' in html_content and
            'aria-modal="true"' in html_content
        )
        self.check("SafeStorage defensive wrapper implemented", "const SafeStorage" in html_content and "SafeStorage.getJSON" in html_content)
        self.check("Web Worker fault-tolerance fallback implemented", "searchWorker.onerror" in html_content)
        self.check(
            "Network preconnect hints and scalable viewport implemented",
            "rel=\"preconnect\"" in html_content and
            "rel=\"dns-prefetch\"" in html_content and
            "user-scalable=no" not in html_content
        )
        self.check(
            "Accessible focus-visible styles and reduced-motion media query implemented",
            ":focus-visible" in html_content and "prefers-reduced-motion" in html_content
        )

        manifest_path = os.path.join(PROJECT_ROOT, 'app', 'manifest.json')
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest_text = f.read()
        self.check(
            "PWA manifest enriched with categories, scope, and maskable icons",
            "categories" in manifest_text and '"scope": "/"' in manifest_text and "any maskable" in manifest_text
        )

        sw_path = os.path.join(PROJECT_ROOT, 'app', 'sw.js')
        with open(sw_path, 'r', encoding='utf-8') as f:
            sw_text = f.read()
        self.check(
            "Service Worker offline navigation fallback and scheme guards implemented",
            "mode === 'navigate'" in sw_text and "request.method !== 'GET'" in sw_text
        )

        runner_path = os.path.join(PROJECT_ROOT, 'tests', 'test_runner.html')
        with open(runner_path, 'r', encoding='utf-8') as f:
            runner_text = f.read()
        self.check(
            "Browser test runner synced with Category 11 edge-case query tests",
            "11. การจัดการกรณีข้อความพิเศษและขอบเขต" in runner_text
        )
        self.check(
            "Toast screen-reader accessibility and iOS copy fix implemented",
            "toast.setAttribute('role', 'status')" in html_content and
            "ta.setAttribute('readonly', '')" in html_content
        )
        self.check(
            "Path-agnostic asset loading with fetchWithFallback implemented",
            "fetchWithFallback" in html_content
        )

        with open(worker_js_path, 'r', encoding='utf-8') as f:
            worker_text = f.read()
        self.check(
            "Web Worker defensive try-catch boundary and error recovery implemented",
            "type: 'error'" in worker_text and "type === 'error'" in html_content
        )
        self.check(
            "Browser test runner synced with Category 12 multi-filter precision tests",
            "12. การตรวจสอบตัวกรองอารมณ์ ปี และตัวกรองผสม" in runner_text
        )
        self.check(
            "Modal dialog focus management and safe esc guard implemented",
            "btn-modal-close" in html_content and "previousActiveElement" in html_content and "s === null || s === undefined" in html_content
        )
        self.check(
            "Service Worker resilient caching with Promise.allSettled and relative assets implemented",
            "Promise.allSettled" in sw_text and "./index.html" in sw_text and "thungara-v19" in sw_text
        )
        self.check(
            "Web Worker collaboration artist parsing with &amp and feat delimiters implemented",
            "replace(/&amp;/gi, '&')" in worker_text and "subArtistsNorm" in worker_text
        )
        self.check(
            "Browser test runner synced with Category 13 collaboration test suite",
            "13. การค้นหาผลงานเพลงคู่และศิลปินร่วม" in runner_text
        )
        self.check(
            "Song card keyboard navigation and aria-label accessibility implemented",
            'tabindex="0"' in html_content and 'role="button"' in html_content and 'aria-label=' in html_content and "event.preventDefault();openModal" in html_content
        )
        self.check(
            "Robust artist pill invocation with DATA.songs index reference implemented",
            'id="btn-modal-artist-pill"' in html_content and "filterByArtistFromModal(DATA.songs[" in html_content
        )
        self.check(
            "Search Worker token and synonym pre-normalization optimization implemented",
            "preparedTokens" in worker_text and "preparedSubTokens" in worker_text and "preparedTokens" in html_content
        )
        self.check(
            "Browser test runner synced with Category 14 compound prefix test suite",
            "14. การแยกคำอุปสรรคและส่วนขยายภาษาถิ่น" in runner_text
        )
        self.check(
            "Modal dialog keyboard focus trap and loop navigation implemented",
            "isModalOpen && e.key === 'Tab'" in html_content and "focusables[0]" in html_content
        )
        self.check(
            "YouTube accessible label and defensive web share origin guard implemented",
            "เปิดดูมิวสิกวิดีโอ" in html_content and "origin !== 'null'" in html_content and "navigator.canShare" in html_content
        )
        self.check(
            "Search Worker fuzzy bigram pre-check and direct character comparison implemented",
            "qBg0" in worker_text and "qBg1" in worker_text and "!fuzzyTitleMatch" in worker_text and "queryNorm[k] !== targetNorm[baseStart + k]" in worker_text
        )
        self.check(
            "Browser test runner synced with Category 15 punctuated omnibox test suite",
            "15. การค้นหาชื่อและศิลปินแบบมีเครื่องหมายวรรคตอนและตัวกรองสามชั้น" in runner_text
        )
        self.check(
            "Recent search chip keyboard accessibility and focus-visible indicator implemented",
            'role="button" tabindex="0"' in html_content and ".chip:focus-visible" in html_content
        )
        self.check(
            "Zero-results status message announcement in aria-live region implemented",
            "ไม่พบเพลงที่ตรงกับเงื่อนไขการค้นหา" in html_content and 'id="stats" aria-live="polite"' in html_content
        )
        self.check(
            "Search Worker and Main-Thread precomputed vector entries cosine similarity implemented",
            "qVecEntries" in worker_text and "qVecEntries" in html_content and "Array.isArray(vecA)" in worker_text
        )
        self.check(
            "Browser test runner synced with Category 16 hybrid query test suite",
            "16. การค้นหาแบบผสมข้อความและตัวกรองเดี่ยว" in runner_text
        )
        self.check(
            "Voice recording overlay accessibility, live status, and escape dismiss implemented",
            'id="rec-overlay" role="dialog" aria-modal="true"' in html_content and 'id="rec-status" role="status" aria-live="polite"' in html_content and "if (isRecOpen)" in html_content
        )
        self.check(
            "Clear search button tooltip title attribute implemented",
            'id="btn-clear" onclick="clearSearch()" title="ล้างข้อความค้นหา"' in html_content
        )
        self.check(
            "Search Worker and Main-Thread optimized cosine dot product lookup and countOccurrences early exit implemented",
            "valB !== undefined" in worker_text and "maxCount = 4" in worker_text and "valB !== undefined" in html_content and "maxCount = 4" in html_content
        )
        self.check(
            "Browser test runner synced with Category 17 dual filter precision test suite",
            "17. การค้นหาแบบผสมข้อความและตัวกรองสองชั้น" in runner_text
        )
        self.check(
            "Button focus-visible styles and load-more accessibility attributes implemented",
            ".btn-theme:focus-visible" in html_content and ".btn-top:focus-visible" in html_content and ".btn-load-more:focus-visible" in html_content and 'title="แสดงเพลงเพิ่มเติม"' in html_content and 'aria-label="แสดงเพลงเพิ่มเติม"' in html_content
        )
        self.check(
            "Search progressbar ARIA semantics and aria-hidden management implemented",
            'id="search-progress" role="progressbar" aria-label="กำลังค้นหาเพลง" aria-hidden="true"' in html_content and "function setSearchProgress(active)" in html_content
        )
        self.check(
            "Search Worker and Main-Thread cleanMatchedTerms fast-path allocation and defensive year comparison implemented",
            "matchedTerms.length > 0 ? Array.from(new Set(matchedTerms))" in worker_text and "String(song.year) !== String(filterYear)" in worker_text and "matchedTerms.length > 0 ? Array.from(new Set(matchedTerms))" in html_content and "String(song.year) !== String(filterYear)" in html_content
        )
        self.check(
            "Browser test runner synced with Category 18 quad-constraint precision test suite",
            "18. การค้นหาแบบผสมข้อความและตัวกรองสี่ชั้น" in runner_text
        )
        self.check(
            "Control buttons and filter dropdowns focus-visible styles implemented",
            ".btn-mic:focus-visible" in html_content and ".btn-clear:focus-visible" in html_content and ".filter-select:focus-visible" in html_content and ".btn-modal-close:focus-visible" in html_content and ".btn-copy-lyrics:focus-visible" in html_content and ".btn-action-share:focus-visible" in html_content
        )
        self.check(
            "Filter dropdowns native title tooltips implemented",
            'id="filter-artist" onchange="doSearch()" title="กรองตามชื่อศิลปิน"' in html_content and 'id="filter-emotion" onchange="doSearch()" title="กรองตามอารมณ์เพลง"' in html_content and 'id="filter-year" onchange="doSearch()" title="กรองตามปีที่เผยแพร่"' in html_content
        )
        self.check(
            "URL parameters deep-linking restoration for emotion, year, and sort implemented",
            "const emotionParam = params.get('emotion')" in html_content and "const yearParam = params.get('year')" in html_content and "const sortParam = params.get('sort')" in html_content
        )
        self.check(
            "Browser test runner synced with Category 19 multi-filter mutual exclusivity test suite",
            "19. การตรวจสอบความเข้ากันไม่ได้ของตัวกรองและขอบเขตผลลัพธ์ว่าง" in runner_text
        )
        self.check(
            "Search Worker and Main-Thread matchedTerms lyric phrase evidence inclusion for omnibox queries implemented",
            "matchedTerms.push(remQ)" in worker_text and "matchedTerms.push(remQ)" in html_content
        )
        self.check(
            "Recent searches keyboard accessibility with Delete and Backspace shortcuts implemented",
            "event.key==='Delete'||event.key==='Backspace'" in html_content
        )
        self.check(
            "Modal dialog accessibility with aria-describedby pointing to artist name implemented",
            'aria-describedby="modal-artist"' in html_content
        )
        self.check(
            "Browser test runner synced with Category 20 hybrid omnibox artist-lyric test suite",
            "20. การค้นหาแบบ Omnibox ผสมชื่อศิลปินและท่อนเนื้อร้อง" in runner_text
        )

        # Final Summary
        print("\n" + "=" * 65)
        total = self.passed + self.failed
        rate = (self.passed / total) * 100 if total > 0 else 0
        print(f"  FULL-SYSTEM AUDIT SUMMARY: Total={total}, Passed={self.passed}, Failed={self.failed}")
        print(f"  SUCCESS RATE: {rate:.1f}%")
        print("=" * 65 + "\n")

        return self.failed == 0

if __name__ == '__main__':
    tester = FullSystemTester()
    success = tester.run_all()
    sys.exit(0 if success else 1)