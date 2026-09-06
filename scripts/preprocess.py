import csv
import json
import math
import re
import os
from collections import Counter, defaultdict

try:
    from pythainlp.tokenize import word_tokenize
    from pythainlp.corpus import thai_stopwords
    HAS_PYTHAINLP = True
    STOP_WORDS = thai_stopwords()
    print("[OK] pythainlp loaded")
except ImportError:
    HAS_PYTHAINLP = False
    STOP_WORDS = set()
    print("[!] pythainlp not found — using space-based tokenization")

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_FILE = os.path.join(PROJECT_ROOT, 'data', 'เนื้อเพลงลูกทุ่ง_1500.csv')
OUTPUT_FILE = os.path.join(PROJECT_ROOT, 'data', 'data.json')
MIN_WORD_LEN = 2
MIN_DOC_FREQ = 2
MAX_DOC_FREQ_RATIO = 0.75


def clean_text(text):
    if not text:
        return ''
    text = re.sub(r'[^฀-๿a-zA-Z0-9\s]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def tokenize(text):
    if not text:
        return []
    text = clean_text(text)
    if HAS_PYTHAINLP:
        tokens = word_tokenize(text, engine='newmm')
    else:
        tokens = text.split()
    return [
        t.strip() for t in tokens
        if t.strip()
        and len(t.strip()) >= MIN_WORD_LEN
        and t.strip() not in STOP_WORDS
        and not t.strip().isspace()
        and not t.strip().isdigit()
    ]


def fix_year(year):
    """Fix malformed year values."""
    if not year:
        return ''
    year = year.strip()
    if len(year) == 4 and year.isdigit():
        y = int(year)
        if 2500 <= y <= 2570:
            return year
        return ''
    if len(year) == 5 and year.isdigit():
        first4 = year[:4]
        last4 = year[1:]
        if first4.isdigit() and 2500 <= int(first4) <= 2570:
            return first4
        if last4.isdigit() and 2500 <= int(last4) <= 2570:
            return last4
        return ''
    if len(year) == 3 and year.isdigit():
        candidate = '2' + year
        if 2500 <= int(candidate) <= 2570:
            return candidate
        return ''
    return ''


def clean_song(song):
    """Fix tab characters, column shifts, and bad data."""
    title = song['title']
    artist = song['artist']
    year = song['year']
    fixed = []

    if '\t' in title:
        parts = title.split('\t')
        title = parts[0].strip()
        if len(parts) > 1 and parts[1].strip() and not artist:
            artist = parts[1].strip()
        fixed.append(f"title tab: '{song['title']}' → '{title}'")

    if '\t' in artist:
        parts = artist.split('\t')
        artist = parts[0].strip()
        if len(parts) > 1 and parts[1].strip().isdigit():
            year = parts[1].strip()
        fixed.append(f"artist tab: '{song['artist']}' → '{artist}' (year: {year})")

    if artist and re.fullmatch(r'\d+', artist):
        fixed.append(f"artist is number: '{artist}' → cleared")
        artist = ''

    m = re.match(r'^(.+?)\s+(25\d{2})$', artist)
    if m:
        clean_name = m.group(1).strip()
        trailing_year = m.group(2)
        if not year or fix_year(year) == '':
            year = trailing_year
        artist = clean_name
        fixed.append(f"artist trailing year: '{song['artist']}' → '{artist}' (year: {year})")

    m2 = re.match(r'^(.+?)\s+(25\d{2})$', artist)
    if m2:
        artist = m2.group(1).strip()
        if not year or fix_year(year) == '':
            year = m2.group(2)
        fixed.append(f"artist trailing year (2nd pass): → '{artist}' (year: {year})")

    original_year = year
    year = fix_year(year)
    if original_year and original_year != year:
        fixed.append(f"year: '{original_year}' → '{year or '(cleared)'}'")

    song['title'] = title
    song['artist'] = artist
    song['year'] = year
    return fixed


def read_songs(path):
    songs = []
    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            parts = [
                row.get('field_lyrics_lead', '') or '',
                row.get('field_lyrics_chorus', '') or '',
                row.get('field_lyrics_hook', '') or '',
            ]
            lyrics = '\n'.join(p for p in parts if p.strip())
            if not lyrics.strip():
                continue
            songs.append({
                'id': len(songs),
                'title': (row.get('title') or '').strip(),
                'artist': (row.get('field_artis') or '').strip(),
                'emotion': (row.get('field_emotion') or '').strip(),
                'year': (row.get('field_year') or '').strip(),
                'lyrics': lyrics.strip(),
            })
    return songs


def build_tfidf(token_lists):
    n = len(token_lists)

    doc_freq = defaultdict(int)
    for tokens in token_lists:
        for w in set(tokens):
            doc_freq[w] += 1

    vocab = []
    w2i = {}
    for w in sorted(doc_freq.keys()):
        if MIN_DOC_FREQ <= doc_freq[w] <= n * MAX_DOC_FREQ_RATIO:
            w2i[w] = len(vocab)
            vocab.append(w)

    idf = [round(math.log(n / (1 + doc_freq[w])), 4) for w in vocab]

    vectors = []
    for tokens in token_lists:
        tf = Counter(tokens)
        max_tf = max(tf.values()) if tf else 1
        vec = {}
        for w, cnt in tf.items():
            if w in w2i:
                idx = w2i[w]
                val = round((cnt / max_tf) * idf[idx], 4)
                if val > 0:
                    vec[str(idx)] = val
        vectors.append(vec)

    return vocab, idf, vectors


def main():
    print(f"\n=== Preprocessing ===\n")

    print(f"Reading {CSV_FILE} ...")
    songs = read_songs(CSV_FILE)
    print(f"  {len(songs)} songs loaded")

    print("Cleaning data ...")
    total_fixes = 0
    for song in songs:
        fixes = clean_song(song)
        if fixes:
            total_fixes += len(fixes)
            for f in fixes:
                print(f"  [fix] #{song['id']} {song['title']}: {f}")
    print(f"  {total_fixes} fixes applied")

    print("Tokenizing ...")
    token_lists = [tokenize(s['lyrics']) for s in songs]
    total_tokens = sum(len(t) for t in token_lists)
    print(f"  {total_tokens} tokens total")

    print("Building TF-IDF ...")
    vocab, idf, vectors = build_tfidf(token_lists)
    max_wl = max((len(w) for w in vocab), default=0)
    print(f"  vocab size: {len(vocab)}, max word len: {max_wl}")

    artists = sorted(set(s['artist'] for s in songs if s['artist']))
    emotions = sorted(set(s['emotion'] for s in songs if s['emotion']))
    years = sorted(set(s['year'] for s in songs if s['year']))

    data = {
        'songs': songs,
        'vocab': vocab,
        'idf': idf,
        'vectors': vectors,
        'maxWordLen': max_wl,
        'artists': artists,
        'emotions': emotions,
        'years': years,
    }

    print(f"Writing {OUTPUT_FILE} ...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False)

    size_mb = os.path.getsize(OUTPUT_FILE) / (1024 * 1024)
    print(f"  {size_mb:.2f} MB")
    print(f"\nDone! {len(songs)} songs, {len(vocab)} vocab words\n")


if __name__ == '__main__':
    main()
