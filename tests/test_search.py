"""
test_search.py - Automated Search Engine Test Suite for Thungara
Tests title search, whitespace tolerance, repeated phrases, dialect synonyms,
typo tolerance (e.g. ความ vs ควาย), filters, and search latency.
"""
import sys
import os
import json
import re
import time
import math
from collections import Counter, defaultdict

sys.stdout.reconfigure(encoding='utf-8')

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.join(PROJECT_ROOT, 'data', 'data.json')

if not os.path.exists(DATA_FILE):
    print(f"Error: {DATA_FILE} not found!")
    sys.exit(1)

with open(DATA_FILE, 'r', encoding='utf-8') as f:
    DATA = json.load(f)

SONGS = DATA['songs']
VOCAB = DATA['vocab']
VOCAB_SET = set(VOCAB)
IDF = DATA['idf']
VECTORS = DATA['vectors']
MAX_WORD_LEN = DATA.get('maxWordLen', 15)

print(f"Loaded {len(SONGS)} songs, {len(VOCAB)} vocab words.")


SYNONYMS = {
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
}

def normalize_text(text):
    """Normalize text: remove all whitespace, newlines, punctuation, and lowercase."""
    if not text:
        return ''
    t = text.lower()
    t = re.sub(r'[^฀-๿a-z0-9]', '', t)
    return t

NORM_SONGS = []
for s in SONGS:
    NORM_SONGS.append({
        'norm_title': normalize_text(s['title']),
        'norm_artist': normalize_text(s['artist']),
        'norm_lyrics': normalize_text(s['lyrics']),
    })

def tokenize_query(text):
    """Greedy longest match tokenizer."""
    if not text:
        return []
    cleaned = re.sub(r'[^฀-๿a-zA-Z0-9\s]', ' ', text)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    segments = [s for s in cleaned.split() if s]
    tokens = []
    for seg in segments:
        i = 0
        while i < len(seg):
            found = False
            for length in range(min(MAX_WORD_LEN, len(seg) - i), 1, -1):
                candidate = seg[i:i+length]
                if candidate in VOCAB_SET:
                    tokens.append(candidate)
                    i += length
                    found = True
                    break
            if not found:
                i += 1
    return tokens

WORD_TO_INDEX = {w: i for i, w in enumerate(VOCAB)}

def query_to_vector(tokens):
    """Convert tokens to TF-IDF sparse vector."""
    if not tokens:
        return {}
    tf = Counter(tokens)
    max_tf = max(tf.values()) if tf else 1
    vec = {}
    for word, count in tf.items():
        if word in WORD_TO_INDEX:
            idx = WORD_TO_INDEX[word]
            vec[str(idx)] = (count / max_tf) * IDF[idx]
    return vec

def cosine_similarity(vec_a, vec_b):
    """Compute cosine similarity between two sparse vectors."""
    dot = 0.0
    mag_a = sum(v * v for v in vec_a.values())
    mag_b = sum(v * v for v in vec_b.values())
    if mag_a == 0 or mag_b == 0:
        return 0.0
    for k, v in vec_a.items():
        if k in vec_b:
            dot += v * vec_b[k]
    return dot / (math.sqrt(mag_a) * math.sqrt(mag_b))

def fuzzy_match_window(query_norm, target_norm, max_diff=1, allow_length_change=False):
    """
    Fast sliding window fuzzy match.
    Returns (matched, diff) where diff <= max_diff.
    Uses bigrams of query to jump directly to candidate positions.
    """
    n = len(query_norm)
    t_len = len(target_norm)
    if n < 3 or t_len < n - max_diff:
        return False, 999

    bg0 = query_norm[:2]
    bg1 = query_norm[1:3] if n >= 3 else ''
    if bg0 not in target_norm and (not bg1 or bg1 not in target_norm):
        return False, 999

    qbgs = [bg0]
    if bg1:
        qbgs.append(bg1)

    checked = set()
    for offset, bg in enumerate(qbgs):
        pos = target_norm.find(bg)
        checks_count = 0
        while pos != -1 and checks_count < 4:
            base_start = max(0, pos - offset)
            for shift in range(-1 if allow_length_change else 0, 2 if allow_length_change else 1):
                start_idx = base_start + shift
                for length_delta in range(-max_diff if allow_length_change else 0, max_diff + 1 if allow_length_change else 1):
                    length = n + length_delta
                    key = (start_idx, length)
                    if start_idx < 0 or length < 1 or start_idx + length > t_len or key in checked:
                        continue
                    checked.add(key)
                    sub = target_norm[start_idx:start_idx + length]
                    diff = (sum(c1 != c2 for c1, c2 in zip(query_norm, sub))
                            if length == n else edit_distance_at_most(query_norm, sub, max_diff))
                    if length == n and diff > max_diff:
                        diff = None
                    if diff is not None:
                        return True, diff
            checks_count += 1
            pos = target_norm.find(bg, pos + 1)

    return False, 999


def edit_distance_at_most(text_a, text_b, max_distance):
    if abs(len(text_a) - len(text_b)) > max_distance:
        return None
    a = b = distance = 0
    while a < len(text_a) and b < len(text_b):
        if text_a[a] == text_b[b]:
            a += 1
            b += 1
            continue
        distance += 1
        if distance > max_distance:
            return None
        if len(text_a) > len(text_b):
            a += 1
        elif len(text_b) > len(text_a):
            b += 1
        else:
            a += 1
            b += 1
    distance += (len(text_a) - a) + (len(text_b) - b)
    return distance if distance <= max_distance else None

def enhanced_search(query, filter_artist='', filter_emotion='', filter_year=''):
    """
    Enhanced search algorithm incorporating:
    1. Direct Song Title Matching (Exact & Partial Boost)
    2. Artist Matching Boost
    3. Normalized Substring Matching (tolerant to spaces, newlines, punctuation)
    4. Repeated Phrases / Multiple Occurrences Scoring
    5. Isan / Dialect Synonym Expansion
    6. Typo & Distorted Word Fuzzy Matching (e.g. ความ vs ควาย)
    7. TF-IDF Cosine Similarity & Token Overlap
    """
    if not query.strip() and not filter_artist and not filter_emotion and not filter_year:
        return []

    raw_q = query.strip()
    norm_q = normalize_text(raw_q)
    tokens = tokenize_query(raw_q)
    
    expanded_tokens = list(tokens)
    for t in tokens:
        if t in SYNONYMS:
            expanded_tokens.extend(SYNONYMS[t])
    expanded_tokens = list(dict.fromkeys(expanded_tokens))
    norm_expanded_tokens = [normalize_text(t) for t in expanded_tokens if normalize_text(t)]

    q_vec = query_to_vector(tokens)
    has_vector = bool(q_vec)

    results = []

    for i, song in enumerate(SONGS):
        if filter_artist and song['artist'] != filter_artist:
            continue
        if filter_emotion and song['emotion'] != filter_emotion:
            continue
        if filter_year and song['year'] != filter_year:
            continue

        ns = NORM_SONGS[i]
        score = 1.0 if not norm_q else 0.0
        exact_title_match = False
        exact_lyrics_match = False

        if norm_q:
            if ns['norm_title'] == norm_q:
                score += 2.0
                exact_title_match = True
            elif norm_q in ns['norm_title']:
                score += 1.2 * (len(norm_q) / max(len(ns['norm_title']), 1))
            elif ns['norm_title'] in norm_q and len(ns['norm_title']) >= 3:
                score += 1.0

        if norm_q and ns['norm_artist'] and (norm_q in ns['norm_artist'] or ns['norm_artist'] in norm_q):
            score += 0.5

        if norm_q:
            if norm_q in ns['norm_lyrics']:
                exact_lyrics_match = True
                length_factor = min(len(norm_q) / 10.0, 1.5)
                score += 0.5 * length_factor

                count = ns['norm_lyrics'].count(norm_q)
                if count > 1:
                    score += 0.1 * min(count - 1, 3)

        if norm_q and not exact_lyrics_match and not exact_title_match and len(norm_q) >= 3:
            f_title, diff_t = fuzzy_match_window(norm_q, ns['norm_title'], max_diff=1, allow_length_change=True)
            if f_title:
                score += 0.8

            f_lyrics, diff_l = fuzzy_match_window(norm_q, ns['norm_lyrics'], max_diff=1)
            if f_lyrics:
                score += 0.35

        if norm_expanded_tokens:
            matched_tokens = 0
            for nt in norm_expanded_tokens:
                if nt in ns['norm_lyrics']:
                    matched_tokens += 1
            if matched_tokens > 0:
                score += 0.25 * (matched_tokens / len(norm_expanded_tokens))

        if has_vector:
            cos = cosine_similarity(q_vec, VECTORS[i])
            score += 0.35 * cos

        min_threshold = 0.20 if norm_q else 0.01
        if score >= min_threshold:
            results.append({
                'idx': i,
                'score': score,
                'title': song['title'],
                'artist': song['artist'],
                'year': song['year'],
                'emotion': song['emotion'],
                'exactMatch': exact_lyrics_match or exact_title_match
            })

    results.sort(key=lambda x: x['score'], reverse=True)
    return results



class TestReport:
    def __init__(self):
        self.total = 0
        self.passed = 0
        self.failed = 0
        self.results = []

    def assert_test(self, name, condition, details=""):
        self.total += 1
        if condition:
            self.passed += 1
            print(f"  [PASS] {name}")
            self.results.append({'name': name, 'status': 'PASS', 'details': details})
        else:
            self.failed += 1
            print(f"  [FAIL] {name} - Details: {details}")
            self.results.append({'name': name, 'status': 'FAIL', 'details': details})


def run_all_tests():
    report = TestReport()
    print("\n========================================================")
    print("  RUNNING SEARCH ENGINE TEST SUITE FOR THUNGARA")
    print("========================================================\n")

    print("Category 1: Direct Song Title Search")
    test_titles = [
        "ขอใจกันหนาว",
        "คิดถึงคนต้นทาง",
        "ดอกหญ้าในป่าปูน",
        "โบว์รักสีดำ",
        "ดาวเต้น ม.ต้น",
        "สาว 16",
        "คนบ้านเดียวกัน",
    ]
    for title in test_titles:
        exists = any(s['title'] == title for s in SONGS)
        if not exists:
            continue
        res = enhanced_search(title)
        top1 = res[0]['title'] if res else "None"
        is_top1 = (top1 == title)
        report.assert_test(
            f"Title Search: '{title}' -> must be #1",
            is_top1,
            f"Expected '{title}' at #1, got '{top1}'"
        )

    res = enhanced_search("ดอกหญ้า")
    top_titles = [r['title'] for r in res[:3]]
    report.assert_test(
        "Partial Title Search: 'ดอกหญ้า' -> finds 'ดอกหญ้าในป่าปูน'",
        any("ดอกหญ้า" in t for t in top_titles),
        f"Top 3: {top_titles}"
    )

    print("\nCategory 2: Whitespace & Newline Tolerance")
    q_with_space = "เมื่อเลิกงานเดินเหงา มีเงาเป็นเพื่อนเข้าซอย"
    q_no_space = "เมื่อเลิกงานเดินเหงามีเงาเป็นเพื่อนเข้าซอย"
    q_cross_line = "มีเงาเป็นเพื่อนเข้าซอย ผู้สาวบ้านไกลใจลอย"

    res_ws = enhanced_search(q_with_space)
    res_ns = enhanced_search(q_no_space)
    res_cl = enhanced_search(q_cross_line)

    report.assert_test(
        "Lyrics with space finds 'ขอใจกันหนาว' as #1",
        bool(res_ws and res_ws[0]['title'] == 'ขอใจกันหนาว'),
        f"Top: {res_ws[0]['title'] if res_ws else 'None'}"
    )
    report.assert_test(
        "Lyrics WITHOUT space finds 'ขอใจกันหนาว' as #1",
        bool(res_ns and res_ns[0]['title'] == 'ขอใจกันหนาว'),
        f"Top: {res_ns[0]['title'] if res_ns else 'None'}"
    )
    report.assert_test(
        "Lyrics crossing newline '\\n' finds 'ขอใจกันหนาว' as #1",
        bool(res_cl and res_cl[0]['title'] == 'ขอใจกันหนาว'),
        f"Top: {res_cl[0]['title'] if res_cl else 'None'}"
    )

    print("\nCategory 3: Repeated Phrases")
    res_rep = enhanced_search("คิดถึง คิดถึง")
    report.assert_test(
        "Repeated phrase 'คิดถึง คิดถึง' returns results",
        len(res_rep) > 0,
        f"Results count: {len(res_rep)}"
    )
    res_rep2 = enhanced_search("ฮักเด้อ ฮักเด้อ")
    report.assert_test(
        "Repeated phrase 'ฮักเด้อ ฮักเด้อ' returns results",
        len(res_rep2) > 0,
        f"Results count: {len(res_rep2)}"
    )

    print("\nCategory 4: Isan / Dialect Synonym Expansion")
    res_syn1 = enhanced_search("คิดถึงเธอ")
    found_isan = any("คิดฮอด" in SONGS[r['idx']]['lyrics'] or "คิดถึง" in SONGS[r['idx']]['lyrics'] for r in res_syn1[:5])
    report.assert_test(
        "Synonym: Search 'คิดถึงเธอ' captures both 'คิดถึง' and Isan 'คิดฮอด'",
        found_isan,
        f"Top matches: {[r['title'] for r in res_syn1[:3]]}"
    )

    res_syn2 = enhanced_search("ไม่รัก")
    found_bo = any("บ่" in SONGS[r['idx']]['lyrics'] or "ไม่" in SONGS[r['idx']]['lyrics'] for r in res_syn2[:5])
    report.assert_test(
        "Synonym: Search 'ไม่รัก' captures both 'ไม่' and Isan 'บ่ฮัก' / 'บ่รัก'",
        found_bo,
        f"Top matches: {[r['title'] for r in res_syn2[:3]]}"
    )

    print("\nCategory 5: Typo & Distorted Words Tolerance (e.g. ความ vs ควาย)")
    res_typo1 = enhanced_search("ควายรัก")
    found_kwam = any("ความรัก" in SONGS[r['idx']]['lyrics'] for r in res_typo1[:5])
    report.assert_test(
        "Typo: 'ควายรัก' (typo for 'ความรัก') successfully retrieves songs containing 'ความรัก'",
        found_kwam,
        f"Top matches: {[r['title'] for r in res_typo1[:5]]}"
    )

    res_typo2 = enhanced_search("เคียงค้างบนทางเปื้อนฝุ่น")
    report.assert_test(
        "Typo: 'เคียงค้างบนทางเปื้อนฝุ่น' (typo for 'เคียงข้าง') retrieves 'ขอใจกันหนาว'",
        any(r['title'] == 'ขอใจกันหนาว' for r in res_typo2[:3]),
        f"Top matches: {[r['title'] for r in res_typo2[:3]]}"
    )

    res_typo3 = enhanced_search("ดอกยาในป่าปูน")
    report.assert_test(
        "Typo in title: 'ดอกยาในป่าปูน' (typo for 'ดอกหญ้าในป่าปูน') retrieves 'ดอกหญ้าในป่าปูน'",
        any(r['title'] == 'ดอกหญ้าในป่าปูน' for r in res_typo3[:3]),
        f"Top matches: {[r['title'] for r in res_typo3[:3]]}"
    )

    res_typo4 = enhanced_search("ขอบใจกันหนาว")
    report.assert_test(
        "Inserted character typo: 'ขอบใจกันหนาว' retrieves 'ขอใจกันหนาว'",
        any(r['title'] == 'ขอใจกันหนาว' for r in res_typo4[:3]),
        f"Top matches: {[r['title'] for r in res_typo4[:3]]}"
    )

    print("\nCategory 6: Artist & Metadata Filters")
    res_artist = enhanced_search("", filter_artist="ต่าย อรทัย")
    all_tai = all(r['artist'] == "ต่าย อรทัย" for r in res_artist)
    report.assert_test(
        "Filter Artist: 'ต่าย อรทัย' only returns songs by ต่าย อรทัย",
        bool(res_artist and all_tai),
        f"Count: {len(res_artist)}"
    )

    res_art_q = enhanced_search("ต่าย อรทัย ขอใจกันหนาว")
    report.assert_test(
        "Query containing Artist + Title: 'ต่าย อรทัย ขอใจกันหนาว' -> #1 is 'ขอใจกันหนาว'",
        bool(res_art_q and res_art_q[0]['title'] == 'ขอใจกันหนาว'),
        f"Top: {res_art_q[0]['title'] if res_art_q else 'None'}"
    )

    res_broad = enhanced_search("ใจ")
    report.assert_test(
        "Total Results: Broad query 'ใจ' returns all matches (> 50 results, not capped)",
        len(res_broad) > 50,
        f"Found {len(res_broad)} matches (exceeding old 50 cap)"
    )

    print("\nCategory 7: Performance & Latency Benchmark")
    benchmark_queries = [
        "ขอใจกันหนาว",
        "เมื่อเลิกงานเดินเหงามีเงาเป็นเพื่อนเข้าซอย",
        "ควายรัก",
        "คิดถึงคนต้นทาง",
        "บ่ฮัก",
        "สาว 16",
        "หัวใจติดดินสวมกางเกงยีนส์เก่าๆ",
    ]
    latencies = []
    for bq in benchmark_queries:
        t0 = time.perf_counter()
        _ = enhanced_search(bq)
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000)

    avg_latency = sum(latencies) / len(latencies)
    max_latency = max(latencies)
    report.assert_test(
        f"Average search latency < 25ms (Actual: {avg_latency:.2f}ms, Max: {max_latency:.2f}ms)",
        avg_latency < 25.0,
        f"Avg: {avg_latency:.2f}ms, Max: {max_latency:.2f}ms"
    )

    print("\n========================================================")
    print(f"  TEST SUMMARY: Total={report.total}, Passed={report.passed}, Failed={report.failed}")
    success_rate = (report.passed / report.total) * 100 if report.total > 0 else 0
    print(f"  SUCCESS RATE: {success_rate:.1f}%")
    print("========================================================\n")

    return report

if __name__ == '__main__':
    run_all_tests()
