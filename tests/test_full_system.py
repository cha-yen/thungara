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