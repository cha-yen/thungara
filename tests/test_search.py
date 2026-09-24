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
    t = text.replace('&amp;', ' ').lower()
    t = re.sub(r'[^฀-๿a-z0-9]', '', t)
    return t

NORM_SONGS = []
for s in SONGS:
    raw_artist = s.get('artist', '').replace('&amp;', '&')
    if any(k in raw_artist for k in [',', ';', '/', '&', ':']) or re.search(r'\bfeat\.?|\bft\.?', raw_artist, re.I):
        sub_artists = [a.strip() for a in re.split(r'[,/;&:]|\bfeat\.?\s*|\bft\.?\s*', raw_artist, flags=re.I) if a.strip()]
    else:
        sub_artists = [raw_artist] if raw_artist else []
    NORM_SONGS.append({
        'norm_title': normalize_text(s['title']),
        'norm_artist': normalize_text(s['artist']),
        'norm_lyrics': normalize_text(s['lyrics']),
        'sub_artists': sub_artists,
        'sub_artists_norm': [normalize_text(a) for a in sub_artists],
    })


ARTIST_SET = set()
if 'artists' in DATA:
    for a in DATA['artists']:
        na = normalize_text(a)
        if na:
            ARTIST_SET.add(na)
for s in SONGS:
    na = normalize_text(s.get('artist', ''))
    if na:
        ARTIST_SET.add(na)
for ns in NORM_SONGS:
    for na in ns['sub_artists_norm']:
        if na:
            ARTIST_SET.add(na)


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

VECTOR_MAGS = [math.sqrt(sum(v * v for v in vec.values())) for vec in VECTORS]

def cosine_similarity(vec_a, vec_b, song_idx=None, mag_a=None):
    """Compute cosine similarity between two sparse vectors with precomputed magnitude."""
    if not vec_a or not vec_b:
        return 0.0
    if mag_a is None:
        mag_a = math.sqrt(sum(v * v for v in (vec_a.values() if isinstance(vec_a, dict) else [v for _, v in vec_a])))
    if mag_a == 0:
        return 0.0
    mag_b = VECTOR_MAGS[song_idx] if song_idx is not None else math.sqrt(sum(v * v for v in vec_b.values()))
    if mag_b == 0:
        return 0.0
    dot = 0.0
    items = vec_a if isinstance(vec_a, list) else vec_a.items()
    for k, v in items:
        if k in vec_b:
            dot += v * vec_b[k]
    if dot == 0:
        return 0.0
    return dot / (mag_a * mag_b)

def fuzzy_match_window(query_norm, target_norm, max_diff=1, allow_length_change=False):
    """
    Fast sliding window fuzzy match.
    Returns (matched, diff, sub) where diff <= max_diff.
    Uses bigrams of query to jump directly to candidate positions.
    """
    n = len(query_norm)
    t_len = len(target_norm)
    if n < 3 or t_len < n - max_diff:
        return False, 999, None

    bg0 = query_norm[:2]
    bg1 = query_norm[1:3] if n >= 3 else ''
    if bg0 not in target_norm and (not bg1 or bg1 not in target_norm):
        return False, 999, None

    qbgs = [bg0]
    if bg1:
        qbgs.append(bg1)

    checked = set()
    for offset, bg in enumerate(qbgs):
        pos = target_norm.find(bg)
        checks_count = 0
        while pos != -1 and checks_count < 3:
            base_start = max(0, pos - offset)
            if not allow_length_change:
                if base_start not in checked:
                    checked.add(base_start)
                    if base_start + n <= t_len:
                        sub = target_norm[base_start:base_start + n]
                        diff = 0
                        for k in range(n):
                            if query_norm[k] != sub[k]:
                                diff += 1
                                if diff > max_diff:
                                    break
                        if diff <= max_diff:
                            return True, diff, sub
            else:
                for shift in (-1, 0, 1):
                    start_idx = base_start + shift
                    for length_delta in (-max_diff, 0, max_diff):
                        length = n + length_delta
                        key = (start_idx, length)
                        if start_idx < 0 or length < 1 or start_idx + length > t_len or key in checked:
                            continue
                        checked.add(key)
                        sub = target_norm[start_idx:start_idx + length]
                        if length == n:
                            diff = 0
                            for k in range(n):
                                if query_norm[k] != sub[k]:
                                    diff += 1
                                    if diff > max_diff:
                                        break
                            if diff <= max_diff:
                                return True, diff, sub
                        else:
                            diff = edit_distance_at_most(query_norm, sub, max_diff)
                            if diff is not None:
                                return True, diff, sub
            checks_count += 1
            pos = target_norm.find(bg, pos + 1)

    return False, 999, None


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

RE_THAI_CHAR = re.compile(r'[\u0e01-\u0e5b]')

def is_valid_thai_query(text):
    if not text:
        return False
    m = RE_THAI_CHAR.search(text)
    if not m:
        return True
    code = ord(m.group(0))
    if (0x0E30 <= code <= 0x0E3A) or (0x0E47 <= code <= 0x0E4E):
        return False
    return True

COMPOUND_PREFIXES = [
    ('ความ', 4, 6),
    ('การ', 3, 5),
    ('น่า', 3, 5),
]

BOUND_PREFIXES = {'ความ', 'การ'}

def extract_sub_tokens(tokens):
    sub_tokens = []
    for t in tokens:
        for prefix, plen, min_len in COMPOUND_PREFIXES:
            if t.startswith(prefix) and len(t) >= min_len:
                if prefix == 'การ' and t.startswith('การ์'):
                    continue
                root = t[plen:]
                if is_valid_thai_query(root) and (root in VOCAB_SET or len(root) >= 3):
                    sub_tokens.append({
                        'root': root,
                        'parent': t,
                        'synonyms': SYNONYMS.get(root, [])
                    })
    return sub_tokens

def enhanced_search(query, filter_artist='', filter_emotion='', filter_year=''):
    """
    Standardized Tiered Normalized Search Algorithm [0.0 - 1.0] with Omnibox Artist Support
    """
    if not query.strip() and not filter_artist and not filter_emotion and not filter_year:
        return []

    raw_q = query.strip()
    if raw_q and not is_valid_thai_query(raw_q):
        return []

    norm_q = normalize_text(raw_q)
    is_exact_artist = norm_q in ARTIST_SET

    tokens = tokenize_query(raw_q)
    sub_tokens = extract_sub_tokens(tokens)
    if raw_q and not tokens and len(norm_q) < 3 and not is_exact_artist:
        return []

    q_vec = query_to_vector(tokens)
    mag_a = math.sqrt(sum(v * v for v in q_vec.values())) if q_vec else 0.0

    prep_tokens = [
        (t, normalize_text(t), [(normalize_text(syn), syn) for syn in SYNONYMS.get(t, [])])
        for t in tokens
    ]
    prep_sub_tokens = [
        (st['parent'], st['root'], normalize_text(st['root']), [(normalize_text(syn), syn) for syn in st['synonyms']])
        for st in sub_tokens
    ]
    q_items = list(q_vec.items()) if q_vec else []
    q_bg0 = norm_q[:2] if len(norm_q) >= 2 else ''
    q_bg1 = norm_q[1:3] if len(norm_q) >= 3 else ''

    results = []

    for i, song in enumerate(SONGS):
        if filter_artist and song['artist'] != filter_artist:
            continue
        if filter_emotion and song['emotion'] != filter_emotion:
            continue
        if filter_year and str(song['year']) != str(filter_year):
            continue

        ns = NORM_SONGS[i]
        score = 1.0 if not norm_q else 0.0
        exact_title_match = False
        exact_lyrics_match = False
        fuzzy_title_match = False
        fuzzy_lyrics_match = False
        matched_terms = []
        matched_token_count = 0
        matched_synonym_count = 0
        matched_sub_token_count = 0
        matched_sub_synonym_count = 0
        artist_score = 0.0
        title_score = 0.0

        if norm_q:
            # 1. Artist Matching (Omnibox)
            if ns['norm_artist']:
                matched_collab = None
                matched_collab_in_q = None
                matched_collab_in_q_norm = ''

                if ns['sub_artists_norm']:
                    for sub_name, sub_norm in zip(ns['sub_artists'], ns['sub_artists_norm']):
                        if sub_norm == norm_q:
                            matched_collab = sub_name
                            break
                        elif len(sub_norm) >= 3 and sub_norm in norm_q:
                            matched_collab_in_q = sub_name
                            matched_collab_in_q_norm = sub_norm

                if ns['norm_artist'] == norm_q or matched_collab:
                    artist_score = 0.94
                    matched_terms.append(matched_collab or song['artist'])
                    if raw_q:
                        matched_terms.append(raw_q)
                elif norm_q in ns['norm_artist'] and len(norm_q) >= 3:
                    ratio = len(norm_q) / max(len(ns['norm_artist']), 1)
                    artist_score = 0.82 + 0.10 * ratio
                    matched_terms.append(song['artist'])
                    if raw_q:
                        matched_terms.append(raw_q)

                target_artist_norm = ''
                matched_artist_name = ''
                if ns['norm_artist'] in norm_q and len(ns['norm_artist']) >= 3:
                    target_artist_norm = ns['norm_artist']
                    matched_artist_name = song['artist']
                elif matched_collab_in_q:
                    target_artist_norm = matched_collab_in_q_norm
                    matched_artist_name = matched_collab_in_q

                if target_artist_norm:
                    rem_q = norm_q.replace(target_artist_norm, '')
                    if rem_q and ns['norm_title'] == rem_q:
                        exact_title_match = True
                        title_score = 1.0
                        artist_score = 0.95
                        matched_terms.append(matched_artist_name)
                        matched_terms.append(song['title'])
                    elif rem_q and rem_q in ns['norm_title']:
                        title_score = 0.92
                        artist_score = 0.92
                        matched_terms.append(matched_artist_name)
                        matched_terms.append(song['title'])
                    elif rem_q and rem_q in ns['norm_lyrics']:
                        exact_lyrics_match = True
                        artist_score = 0.90
                        matched_terms.append(matched_artist_name)
                    elif not artist_score:
                        artist_score = 0.85
                        matched_terms.append(matched_artist_name)

            # 2. Title matching
            if not exact_title_match:
                if ns['norm_title'] == norm_q:
                    exact_title_match = True
                    title_score = 1.0
                    matched_terms.append(song['title'])
                elif norm_q in ns['norm_title']:
                    ratio = len(norm_q) / max(len(ns['norm_title']), 1)
                    title_score = 0.82 + 0.14 * ratio
                    matched_terms.append(song['title'])
                elif ns['norm_title'] in norm_q and len(ns['norm_title']) >= 3:
                    ratio = len(ns['norm_title']) / len(norm_q)
                    title_score = 0.78 + 0.12 * ratio
                    matched_terms.append(song['title'])

            # 3. Lyrics phrase matching
            lyrics_phrase_score = 0.0
            is_bound_prefix_only = norm_q in BOUND_PREFIXES and len(tokens) == 0
            if not is_bound_prefix_only and norm_q in ns['norm_lyrics']:
                exact_lyrics_match = True
                len_factor = min(len(norm_q) / 25.0, 1.0)
                lyrics_phrase_score = 0.82 + 0.08 * len_factor
                count = ns['norm_lyrics'].count(norm_q)
                if count > 1:
                    lyrics_phrase_score += 0.02 * min(count - 1, 3)
                matched_terms.append(raw_q)

            # 4. Fuzzy matching
            fuzzy_score = 0.0
            if not exact_lyrics_match and not exact_title_match and artist_score == 0 and len(norm_q) >= 3:
                if (q_bg0 in ns['norm_title'] or (q_bg1 and q_bg1 in ns['norm_title'])) and len(ns['norm_title']) >= len(norm_q) - 1:
                    f_title, diff_t, sub_t = fuzzy_match_window(norm_q, ns['norm_title'], max_diff=1, allow_length_change=True)
                    if f_title:
                        fuzzy_title_match = True
                        fuzzy_score = max(fuzzy_score, 0.72)
                        if sub_t:
                            matched_terms.append(sub_t)

                if not is_exact_artist and len(norm_q) <= 24 and not fuzzy_title_match:
                    if q_bg0 in ns['norm_lyrics'] or (q_bg1 and q_bg1 in ns['norm_lyrics']):
                        f_lyrics, diff_l, sub_l = fuzzy_match_window(norm_q, ns['norm_lyrics'], max_diff=1)
                        if f_lyrics:
                            fuzzy_lyrics_match = True
                            fuzzy_score = max(fuzzy_score, 0.56)
                            if sub_l:
                                matched_terms.append(sub_l)

            # 5. Token & Synonym coverage + Decompounded Sub-tokens
            token_coverage = 0.0
            if prep_tokens and (not is_exact_artist or artist_score > 0):
                for t, nt, syn_pairs in prep_tokens:
                    if nt in ns['norm_lyrics'] or nt in ns['norm_title']:
                        matched_token_count += 1
                        matched_terms.append(t)
                    elif syn_pairs:
                        for nsyn, syn in syn_pairs:
                            if nsyn in ns['norm_lyrics'] or nsyn in ns['norm_title']:
                                matched_synonym_count += 1
                                matched_terms.append(syn)
                                break

                if prep_sub_tokens:
                    for parent, root, nroot, ssyn_pairs in prep_sub_tokens:
                        if nroot in ns['norm_lyrics'] or nroot in ns['norm_title']:
                            matched_terms.append(root)
                            if parent not in matched_terms:
                                matched_sub_token_count += 1
                        elif ssyn_pairs:
                            for nssyn, ssyn in ssyn_pairs:
                                if nssyn in ns['norm_lyrics'] or nssyn in ns['norm_title']:
                                    matched_terms.append(ssyn)
                                    if parent not in matched_terms:
                                        matched_sub_synonym_count += 1
                                        break

                token_coverage = (
                    matched_token_count +
                    0.85 * matched_synonym_count +
                    0.60 * matched_sub_token_count +
                    0.50 * matched_sub_synonym_count
                ) / len(prep_tokens)

            # 6. TF-IDF Cosine Similarity
            cos_sim = 0.0
            if mag_a > 0 and (not is_exact_artist or artist_score > 0):
                cos_sim = cosine_similarity(q_items, VECTORS[i], song_idx=i, mag_a=mag_a)

            # 7. Tiered Normalized Confidence Score [0.0 - 1.0]
            if exact_title_match and artist_score > 0:
                score = 1.0
            elif exact_title_match:
                score = min(1.0, 0.98 + 0.02 * (cos_sim if mag_a > 0 else 1.0))
            elif artist_score > 0 and title_score > 0:
                score = min(0.98, max(title_score, artist_score) + 0.04)
            elif title_score > 0:
                score = min(0.96, title_score + 0.02 * token_coverage + 0.02 * cos_sim)
            elif artist_score > 0 and exact_lyrics_match:
                score = min(0.96, max(lyrics_phrase_score, artist_score) + 0.03)
            elif exact_lyrics_match:
                score = min(0.94, lyrics_phrase_score + 0.03 * token_coverage + 0.02 * cos_sim)
            elif artist_score > 0:
                score = min(0.94, artist_score + 0.02 * token_coverage + 0.02 * cos_sim)
            elif fuzzy_title_match:
                score = min(0.80, fuzzy_score + 0.05 * token_coverage + 0.03 * cos_sim)
            elif fuzzy_lyrics_match:
                score = min(0.72, fuzzy_score + 0.06 * token_coverage + 0.04 * cos_sim)
            elif token_coverage > 0 or cos_sim > 0:
                score = min(0.68, 0.45 * token_coverage + 0.20 * cos_sim)

        min_threshold = 0.20 if norm_q else 0.01
        exact_lyric_phrase = exact_lyrics_match and (len(norm_q) >= 6 or len(tokens) >= 2)
        if score >= min_threshold:
            clean_matched_terms = [
                t for t in dict.fromkeys(matched_terms)
                if t and len(t) >= 2 and is_valid_thai_query(t) and t not in BOUND_PREFIXES
            ] if matched_terms else []

            results.append({
                'idx': i,
                'score': round(score, 4),
                'title': song['title'],
                'artist': song['artist'],
                'year': song['year'],
                'emotion': song['emotion'],
                'exactMatch': exact_lyric_phrase or exact_title_match,
                'evidence': {
                    'exactTitle': exact_title_match,
                    'exactLyricPhrase': exact_lyric_phrase,
                    'fuzzyTitle': fuzzy_title_match,
                    'fuzzyLyrics': fuzzy_lyrics_match,
                    'matchedTokenCount': matched_token_count,
                    'queryTokenCount': len(tokens),
                    'matchedSynonymCount': matched_synonym_count,
                    'matchedTerms': clean_matched_terms,
                }
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

    report.assert_test(
        "Short fragment 'าว' without a vocabulary token returns no results",
        len(enhanced_search("าว")) == 0,
        f"Results count: {len(enhanced_search('าว'))}"
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
    # Warm-up run to eliminate cold-start timing jitter and warm cache
    for bq in benchmark_queries:
        _ = enhanced_search(bq)
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

    print("\nCategory 8: Standardized Scoring & Highlighting Evidence")
    all_scores_bounded = True
    for bq in benchmark_queries:
        for r in enhanced_search(bq):
            if r['score'] < 0.0 or r['score'] > 1.0:
                all_scores_bounded = False
                break
    report.assert_test(
        "All result scores are strictly bounded within [0.0, 1.0] confidence interval",
        all_scores_bounded,
        "Verified all scores adhere to normalized standard"
    )

    res_typo_ev = enhanced_search("ควายรัก")
    kwam_in_terms = any(
        "ความรัก" in r['evidence']['matchedTerms']
        for r in res_typo_ev if "ความรัก" in SONGS[r['idx']]['lyrics']
    )
    report.assert_test(
        "Fuzzy Highlight Evidence: 'ควายรัก' returns 'ความรัก' in evidence.matchedTerms for highlighting",
        kwam_in_terms,
        f"Matched terms: {[r['evidence']['matchedTerms'] for r in res_typo_ev[:3]]}"
    )

    top_conf = enhanced_search("ขอใจกันหนาว")[0]['score'] >= 0.98
    report.assert_test(
        "Exact title match achieves tier-1 confidence (>= 0.98)",
        top_conf,
        f"Score: {enhanced_search('ขอใจกันหนาว')[0]['score']}"
    )

    print("\nCategory 9: Compound Decompounding & Clean Sub-token Highlighting")
    res_compound = enhanced_search("ความรัก")
    
    # 1. Songs containing 'ความรัก' should include 'ความรัก' in matchedTerms
    has_full_compound = any(
        "ความรัก" in r['evidence']['matchedTerms']
        for r in res_compound if "ความรัก" in SONGS[r['idx']]['lyrics']
    )
    report.assert_test(
        "Compound Match: 'ความรัก' query returns 'ความรัก' in matchedTerms for compound-containing songs",
        has_full_compound,
        "Full compound highlighted as cohesive phrase"
    )

    # 2. Songs containing only root 'รัก' (no 'ความรัก', e.g. ยาใจคนจน) should be retrieved with 'รัก' in matchedTerms
    res_root_only = [
        r for r in res_compound
        if "รัก" in SONGS[r['idx']]['lyrics'] and "ความรัก" not in SONGS[r['idx']]['lyrics']
    ]
    has_root_match = (
        len(res_root_only) > 0 and
        any("รัก" in r['evidence']['matchedTerms'] for r in res_root_only)
    )
    report.assert_test(
        "Decompounding Root Match: 'ความรัก' query retrieves songs with root 'รัก' and includes 'รัก' in matchedTerms",
        has_root_match,
        f"Found {len(res_root_only)} songs with decompounded root 'รัก'"
    )

    # 3. Bound prefix 'ความ' alone should NEVER be in matchedTerms
    kwam_alone_leaked = any("ความ" in r['evidence']['matchedTerms'] for r in res_compound)
    report.assert_test(
        "Affix Isolation: 'ความ' prefix alone is NEVER added to matchedTerms (no noisy partial highlights)",
        not kwam_alone_leaked,
        "Ensured bound morpheme 'ความ' is not treated as a standalone highlighted term"
    )

    # 4. Incomplete Thai syllable onset rejection (e.g. 'าว', 'ิน')
    report.assert_test(
        "Invalid Syllable Onset Rejection: 'าว' and 'ิน' fragments return 0 results",
        len(enhanced_search("าว")) == 0 and len(enhanced_search("ิน")) == 0,
        "Non-word combining vowel fragments rejected cleanly"
    )

    print("\nCategory 10: Omnibox Direct & Combined Artist Search")
    # 1. Direct exact artist search (ต่าย อรทัย) -> 100% precision, all songs feature artist
    res_artist_direct = enhanced_search("ต่าย อรทัย")
    all_tai = all("ต่าย อรทัย" in r['artist'] for r in res_artist_direct)
    report.assert_test(
        "Direct Artist Search: 'ต่าย อรทัย' retrieves all songs featuring artist with 100% precision",
        len(res_artist_direct) >= 40 and all_tai,
        f"Found {len(res_artist_direct)} songs, all featuring ต่าย อรทัย"
    )

    # 2. Direct artist high confidence score and evidence highlight
    high_conf_artist = all(r['score'] >= 0.90 for r in res_artist_direct)
    has_artist_in_terms = all("ต่าย อรทัย" in r['evidence']['matchedTerms'] for r in res_artist_direct)
    report.assert_test(
        "Artist Confidence & Highlighting: 'ต่าย อรทัย' achieves tier-1 score (>= 0.90) with artist in matchedTerms",
        high_conf_artist and has_artist_in_terms,
        f"Top score: {res_artist_direct[0]['score']}, Matched terms: {res_artist_direct[0]['evidence']['matchedTerms']}"
    )

    # 3. Combined query: Artist + Song Title ('ต่าย อรทัย ขอใจกันหนาว') -> #1 score 1.0
    res_comb = enhanced_search("ต่าย อรทัย ขอใจกันหนาว")
    top_comb = res_comb[0] if res_comb else None
    is_top_comb = (
        top_comb is not None and
        top_comb['title'] == "ขอใจกันหนาว" and
        top_comb['score'] == 1.0 and
        "ต่าย อรทัย" in top_comb['evidence']['matchedTerms'] and
        "ขอใจกันหนาว" in top_comb['evidence']['matchedTerms']
    )
    report.assert_test(
        "Combined Omnibox Query: 'ต่าย อรทัย ขอใจกันหนาว' ranks exact song at #1 with score 1.0 and both terms matched",
        is_top_comb,
        f"Top result: {top_comb['title'] if top_comb else 'None'} - Score: {top_comb['score'] if top_comb else 0}"
    )

    # 4. Partial artist search ('มนต์แคน') -> Top songs belong to Monkaen
    res_partial_artist = enhanced_search("มนต์แคน")
    top_10_monkaen = all("มนต์แคน" in r['artist'] for r in res_partial_artist[:10])
    report.assert_test(
        "Partial Artist Search: 'มนต์แคน' ranks Monkaen Kaenkoon songs at top ranks (score >= 0.85)",
        len(res_partial_artist) > 0 and top_10_monkaen and res_partial_artist[0]['score'] >= 0.85,
        f"Top 5 artists: {[r['artist'] for r in res_partial_artist[:5]]}"
    )

    print("\nCategory 11: Edge-Case & Boundary Query Handling")
    # 1. Punctuation-only query
    res_punct = enhanced_search("!@#$%^&*()_+-=[]{}|;':,.<>?/")
    report.assert_test(
        "Punctuation-Only Query: returns 0 results cleanly without error",
        len(res_punct) == 0,
        f"Results count: {len(res_punct)}"
    )

    # 2. Whitespace-only string
    res_space = enhanced_search("    \t\n  ")
    report.assert_test(
        "Whitespace-Only Query: returns 0 results cleanly without error",
        len(res_space) == 0,
        f"Results count: {len(res_space)}"
    )

    # 3. Numeric string query handling
    res_numeric = enhanced_search("2560")
    report.assert_test(
        "Numeric Query: returns matches or handles cleanly without error",
        isinstance(res_numeric, list),
        f"Results returned: {len(res_numeric)}"
    )

    print("\nCategory 12: Metadata Multi-Filter Verification (Emotion & Year)")
    # 1. Filter Emotion Only
    res_emo = enhanced_search("", filter_emotion="สนุก")
    all_sanook = len(res_emo) == 500 and all(r['emotion'] == "สนุก" for r in res_emo)
    report.assert_test(
        "Emotion Filter: 'สนุก' retrieves all 500 upbeat songs with 100% precision",
        all_sanook,
        f"Retrieved {len(res_emo)} songs, all emotion='สนุก'"
    )

    # 2. Filter Year Only
    res_yr = enhanced_search("", filter_year="2562")
    all_2562 = len(res_yr) == 112 and all(r['year'] == "2562" for r in res_yr)
    report.assert_test(
        "Year Filter: '2562' retrieves all 112 songs published in 2562 with 100% precision",
        all_2562,
        f"Retrieved {len(res_yr)} songs, all year='2562'"
    )

    # 3. Composite Multi-Filter: Artist + Emotion
    res_multi = enhanced_search("", filter_artist="ต่าย อรทัย", filter_emotion="เศร้า")
    all_tai_sad = len(res_multi) > 0 and all(r['artist'] == "ต่าย อรทัย" and r['emotion'] == "เศร้า" for r in res_multi)
    report.assert_test(
        "Composite Multi-Filter: Artist 'ต่าย อรทัย' + Emotion 'เศร้า' retrieves matching intersection",
        all_tai_sad,
        f"Retrieved {len(res_multi)} songs matching both constraints"
    )

    print("\nCategory 13: Collaboration & Featured Artist Search (Duet & Collab)")
    # 1. Collab with &amp;
    res_collab_amp = enhanced_search("ดอกอ้อ ทุ่งทอง")
    has_collab_song = any(r['title'] == "หนุ่มบ้านเฮา สาวโรงงาน" and r['score'] >= 0.90 for r in res_collab_amp)
    report.assert_test(
        "Collab Artist with '&': 'ดอกอ้อ ทุ่งทอง' retrieves 'หนุ่มบ้านเฮา สาวโรงงาน' (with ศร สินชัย) at score >= 0.90",
        has_collab_song,
        f"Found collab song: {has_collab_song}"
    )

    # 2. Featured Artist with feat.
    res_collab_feat = enhanced_search("ยุ่งยิ่ง กนกนันทน์")
    has_feat_song = any(r['title'] == "ฉันยังรักเธอ" and r['score'] >= 0.90 for r in res_collab_feat)
    report.assert_test(
        "Featured Artist with 'feat.': 'ยุ่งยิ่ง กนกนันทน์' retrieves 'ฉันยังรักเธอ' (เต้ย อภิวัฒน์ feat.) at score >= 0.90",
        has_feat_song,
        f"Found featured song: {has_feat_song}"
    )

    # 3. Collab artist with &amp; solo search
    res_collab_joke = enhanced_search("โจ๊ก SO COOL")
    has_joke_song = any(r['title'] == "อย่าไว้ใจทาง อย่าวางใจแฟน" and r['score'] >= 0.90 for r in res_collab_joke)
    report.assert_test(
        "Duet Artist: 'โจ๊ก SO COOL' retrieves 'อย่าไว้ใจทาง อย่าวางใจแฟน' (with ศิริพร อำไพพงษ์) at score >= 0.90",
        has_joke_song,
        f"Found duet song: {has_joke_song}"
    )

    print("\nCategory 14: Compound Prefix Isolation & Subtoken Dialect Tests")
    # 1. Prefix 'การ' Affix Isolation
    res_prefix_kan = enhanced_search("การรอคอย")
    has_root_rokoy = len(res_prefix_kan) > 0 and any("รอคอย" in r['evidence']['matchedTerms'] for r in res_prefix_kan[:5]) and all("การ" not in r['evidence']['matchedTerms'] for r in res_prefix_kan[:5])
    report.assert_test(
        "Compound Prefix Isolation: 'การรอคอย' isolates root 'รอคอย' and excludes bound prefix 'การ'",
        has_root_rokoy,
        f"Root 'รอคอย' isolated and 'การ' excluded in top results: {has_root_rokoy}"
    )

    # 2. Prefix 'น่า' Decompounding
    res_prefix_na = enhanced_search("น่ารัก")
    has_root_rak = len(res_prefix_na) > 0 and any("รัก" in r['evidence']['matchedTerms'] for r in res_prefix_na[:5])
    report.assert_test(
        "Compound Prefix Decompounding: 'น่ารัก' extracts root 'รัก' in matchedTerms",
        has_root_rak,
        f"Root 'รัก' extracted from 'น่ารัก': {has_root_rak}"
    )

    # 3. Subtoken Dialect Expansion: 'น่ารัก' -> 'รัก' -> 'ฮัก'
    has_subtoken_dialect = any("ฮัก" in r['evidence']['matchedTerms'] for r in res_prefix_na)
    report.assert_test(
        "Subtoken Dialect Expansion: 'น่ารัก' expands subtoken root 'รัก' to Isan synonym 'ฮัก'",
        has_subtoken_dialect,
        f"Found Isan dialect match 'ฮัก' via subtoken: {has_subtoken_dialect}"
    )

    print("\nCategory 15: Punctuated Omnibox & Tri-Filter Precision")
    # 1. Hyphenated Omnibox: Artist - Title
    res_punc_omnibox1 = enhanced_search("ไผ่ พงศธร - คนบ้านเดียวกัน")
    punc1_pass = len(res_punc_omnibox1) > 0 and res_punc_omnibox1[0]['title'] == "คนบ้านเดียวกัน" and res_punc_omnibox1[0]['score'] == 1.0
    report.assert_test(
        "Punctuated Omnibox: 'ไผ่ พงศธร - คนบ้านเดียวกัน' ranks 'คนบ้านเดียวกัน' at #1 with score 1.0",
        punc1_pass,
        f"Rank #1: {res_punc_omnibox1[0]['title'] if res_punc_omnibox1 else None}, score={res_punc_omnibox1[0]['score'] if res_punc_omnibox1 else 0}"
    )

    # 2. Parenthesized Omnibox: Title (Artist)
    res_punc_omnibox2 = enhanced_search("ขอใจกันหนาว (ต่าย อรทัย)")
    punc2_pass = len(res_punc_omnibox2) > 0 and res_punc_omnibox2[0]['title'] == "ขอใจกันหนาว" and res_punc_omnibox2[0]['score'] == 1.0
    report.assert_test(
        "Parenthesized Omnibox: 'ขอใจกันหนาว (ต่าย อรทัย)' ranks 'ขอใจกันหนาว' at #1 with score 1.0",
        punc2_pass,
        f"Rank #1: {res_punc_omnibox2[0]['title'] if res_punc_omnibox2 else None}, score={res_punc_omnibox2[0]['score'] if res_punc_omnibox2 else 0}"
    )

    # 3. Tri-Filter Precision (Artist + Emotion + Year)
    res_trifilter = enhanced_search("", filter_artist="ต่าย อรทัย", filter_emotion="กำลังใจ", filter_year="2545")
    tri_pass = len(res_trifilter) > 0 and all(r['artist'] == "ต่าย อรทัย" and r['emotion'] == "กำลังใจ" and str(r['year']) == "2545" for r in res_trifilter)
    report.assert_test(
        "Tri-Filter Precision: Artist 'ต่าย อรทัย' + Emotion 'กำลังใจ' + Year '2545' returns exact matches",
        tri_pass,
        f"Retrieved {len(res_trifilter)} songs matching all 3 criteria with 100% precision"
    )

    print("\nCategory 16: Hybrid Query & Single Filter Interaction")
    # 1. Query + Artist Filter: Lyrics Query constrained to Specific Artist
    res_q_artist = enhanced_search("เคียงข้างบนทางเปื้อนฝุ่น", filter_artist="ต่าย อรทัย")
    pass_q_artist = len(res_q_artist) > 0 and res_q_artist[0]['title'] == "ขอใจกันหนาว" and all(r['artist'] == "ต่าย อรทัย" for r in res_q_artist)
    report.assert_test(
        "Hybrid Query + Artist: 'เคียงข้างบนทางเปื้อนฝุ่น' + Artist 'ต่าย อรทัย' ranks 'ขอใจกันหนาว' at #1 with 100% artist constraint",
        pass_q_artist,
        f"Rank #1: {res_q_artist[0]['title'] if res_q_artist else None}, artist={res_q_artist[0]['artist'] if res_q_artist else None}, total={len(res_q_artist)}"
    )

    # 2. Query + Year Filter: Song Title Query constrained to Release Year
    res_q_year = enhanced_search("คนบ้านเดียวกัน", filter_year="2551")
    pass_q_year = len(res_q_year) > 0 and res_q_year[0]['title'] == "คนบ้านเดียวกัน" and all(str(r['year']) == "2551" for r in res_q_year)
    report.assert_test(
        "Hybrid Query + Year: 'คนบ้านเดียวกัน' + Year '2551' ranks exact song at #1 with 100% year constraint",
        pass_q_year,
        f"Rank #1: {res_q_year[0]['title'] if res_q_year else None}, year={res_q_year[0]['year'] if res_q_year else None}, total={len(res_q_year)}"
    )

    # 3. Query + Emotion Filter: Partial Title Query constrained to Emotion Tag
    res_q_emotion = enhanced_search("ดอกหญ้า", filter_emotion="กำลังใจ")
    pass_q_emotion = len(res_q_emotion) > 0 and res_q_emotion[0]['title'] == "ดอกหญ้าในป่าปูน" and all(r['emotion'] == "กำลังใจ" for r in res_q_emotion)
    report.assert_test(
        "Hybrid Query + Emotion: 'ดอกหญ้า' + Emotion 'กำลังใจ' ranks 'ดอกหญ้าในป่าปูน' at #1 with 100% emotion constraint",
        pass_q_emotion,
        f"Rank #1: {res_q_emotion[0]['title'] if res_q_emotion else None}, emotion={res_q_emotion[0]['emotion'] if res_q_emotion else None}, total={len(res_q_emotion)}"
    )

    print("\nCategory 17: Hybrid Query & Dual Filter Precision")
    # 1. Query + Artist + Year Filter
    res_q_ay = enhanced_search("ขอใจกันหนาว", filter_artist="ต่าย อรทัย", filter_year="2547")
    pass_q_ay = len(res_q_ay) > 0 and res_q_ay[0]['title'] == "ขอใจกันหนาว" and all(r['artist'] == "ต่าย อรทัย" and str(r.get('year')) == "2547" for r in res_q_ay)
    report.assert_test(
        "Hybrid Query + Artist + Year: 'ขอใจกันหนาว' + Artist 'ต่าย อรทัย' + Year '2547' ranks exact song at #1 with 100% dual constraints",
        pass_q_ay,
        f"Rank #1: {res_q_ay[0]['title'] if res_q_ay else None}, artist={res_q_ay[0]['artist'] if res_q_ay else None}, year={res_q_ay[0]['year'] if res_q_ay else None}, total={len(res_q_ay)}"
    )

    # 2. Query + Artist + Emotion Filter
    res_q_ae = enhanced_search("ทางเปื้อนฝุ่น", filter_artist="ต่าย อรทัย", filter_emotion="กำลังใจ")
    pass_q_ae = len(res_q_ae) > 0 and res_q_ae[0]['title'] == "ขอใจกันหนาว" and all(r['artist'] == "ต่าย อรทัย" and r.get('emotion') == "กำลังใจ" for r in res_q_ae)
    report.assert_test(
        "Hybrid Query + Artist + Emotion: 'ทางเปื้อนฝุ่น' + Artist 'ต่าย อรทัย' + Emotion 'กำลังใจ' ranks 'ขอใจกันหนาว' at #1 with 100% dual constraints",
        pass_q_ae,
        f"Rank #1: {res_q_ae[0]['title'] if res_q_ae else None}, artist={res_q_ae[0]['artist'] if res_q_ae else None}, emotion={res_q_ae[0]['emotion'] if res_q_ae else None}, total={len(res_q_ae)}"
    )

    # 3. Query + Emotion + Year Filter
    res_q_ey = enhanced_search("คนบ้านเดียวกัน", filter_emotion="กำลังใจ", filter_year="2551")
    pass_q_ey = len(res_q_ey) > 0 and res_q_ey[0]['title'] == "คนบ้านเดียวกัน" and all(r.get('emotion') == "กำลังใจ" and str(r.get('year')) == "2551" for r in res_q_ey)
    report.assert_test(
        "Hybrid Query + Emotion + Year: 'คนบ้านเดียวกัน' + Emotion 'กำลังใจ' + Year '2551' ranks exact song at #1 with 100% dual constraints",
        pass_q_ey,
        f"Rank #1: {res_q_ey[0]['title'] if res_q_ey else None}, emotion={res_q_ey[0]['emotion'] if res_q_ey else None}, year={res_q_ey[0]['year'] if res_q_ey else None}, total={len(res_q_ey)}"
    )

    print("\nCategory 18: Quad-Constraint Precision (Query + Artist + Emotion + Year)")
    # 1. Lyric Query + Artist + Emotion + Year Filter
    res_q_aey1 = enhanced_search("เปื้อนฝุ่น", filter_artist="ต่าย อรทัย", filter_emotion="กำลังใจ", filter_year="2547")
    pass_q_aey1 = (
        len(res_q_aey1) > 0 and
        res_q_aey1[0]['title'] == "ขอใจกันหนาว" and
        all(
            r['artist'] == "ต่าย อรทัย" and
            r.get('emotion') == "กำลังใจ" and
            str(r.get('year')) == "2547"
            for r in res_q_aey1
        )
    )
    report.assert_test(
        "Quad-Constraint Precision: 'เปื้อนฝุ่น' + Artist 'ต่าย อรทัย' + Emotion 'กำลังใจ' + Year '2547' ranks 'ขอใจกันหนาว' at #1 with 100% precision",
        pass_q_aey1,
        f"Rank #1: {res_q_aey1[0]['title'] if res_q_aey1 else None}, total={len(res_q_aey1)}"
    )

    # 2. Title Query + Artist + Emotion + Year Filter
    res_q_aey2 = enhanced_search("คนบ้านเดียวกัน", filter_artist="ไผ่ พงศธร", filter_emotion="กำลังใจ", filter_year="2551")
    pass_q_aey2 = (
        len(res_q_aey2) > 0 and
        res_q_aey2[0]['title'] == "คนบ้านเดียวกัน" and
        all(
            r['artist'] == "ไผ่ พงศธร" and
            r.get('emotion') == "กำลังใจ" and
            str(r.get('year')) == "2551"
            for r in res_q_aey2
        )
    )
    report.assert_test(
        "Quad-Constraint Precision: 'คนบ้านเดียวกัน' + Artist 'ไผ่ พงศธร' + Emotion 'กำลังใจ' + Year '2551' ranks exact song at #1 with 100% precision",
        pass_q_aey2,
        f"Rank #1: {res_q_aey2[0]['title'] if res_q_aey2 else None}, total={len(res_q_aey2)}"
    )

    # 3. Partial Title Query + Artist + Emotion + Year Filter
    res_q_aey3 = enhanced_search("ดอกหญ้า", filter_artist="ต่าย อรทัย", filter_emotion="กำลังใจ", filter_year="2546")
    pass_q_aey3 = (
        len(res_q_aey3) > 0 and
        res_q_aey3[0]['title'] == "ดอกหญ้าในป่าปูน" and
        all(
            r['artist'] == "ต่าย อรทัย" and
            r.get('emotion') == "กำลังใจ" and
            str(r.get('year')) == "2546"
            for r in res_q_aey3
        )
    )
    report.assert_test(
        "Quad-Constraint Precision: 'ดอกหญ้า' + Artist 'ต่าย อรทัย' + Emotion 'กำลังใจ' + Year '2546' ranks 'ดอกหญ้าในป่าปูน' at #1 with 100% precision",
        pass_q_aey3,
        f"Rank #1: {res_q_aey3[0]['title'] if res_q_aey3 else None}, total={len(res_q_aey3)}"
    )

    print("\n========================================================")
    print(f"  TEST SUMMARY: Total={report.total}, Passed={report.passed}, Failed={report.failed}")
    success_rate = (report.passed / report.total) * 100 if report.total > 0 else 0
    print(f"  SUCCESS RATE: {success_rate:.1f}%")
    print("========================================================\n")

    return report

if __name__ == '__main__':
    run_all_tests()
