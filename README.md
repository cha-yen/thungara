# Thungara (ทุ่งคารา) 🎵

[![CI](https://github.com/cha-yen/thungara/actions/workflows/ci.yml/badge.svg)](https://github.com/cha-yen/thungara/actions/workflows/ci.yml)
[![PWA](https://img.shields.io/badge/PWA-Ready-f59e0b?style=flat-square&logo=pwa)](app/manifest.json)
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-Zero_Dependencies-yellow?style=flat-square&logo=javascript)](app/index.html)
[![Service Worker](https://img.shields.io/badge/Cache-thungara--v70-green?style=flat-square)](app/sw.js)
[![Tests](https://img.shields.io/badge/Tests-415_Passed-success?style=flat-square)](tests/run_all.js)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

> ระบบค้นหาเพลงลูกทุ่งไทยจากเนื้อร้อง 1,500 เพลง ค้นหาด้วยชื่อเพลง ท่อนเนื้อร้อง ศิลปิน หรือร้องผ่านไมโครโฟนได้ทันที ประมวลผลรวดเร็วบนเบราว์เซอร์แบบ Real-time 100% (Pure Vanilla JS — Zero Dependencies)

---

## ✨ ฟีเจอร์เด่น (Key Highlights)

- ⚡ **Real-time Hybrid Search** — ผสาน TF-IDF และ Levenshtein Fuzzy Matching ค้นหาเนื้อร้อง ชื่อเพลง ศิลปินได้ในช่องเดียว (Omnibox) ด้วยความเร็วเฉลี่ย < 15ms
- 🎙️ **Voice Search & Dialect Support** — แปลงเสียงร้อง/พูดเป็นข้อความภาษาไทยด้วย Web Speech API พร้อมขยายคำพ้องภาษาถิ่นอีสานอัตโนมัติ
- 📱 **PWA & Offline-First** — ติดตั้งบนสมาร์ตโฟนได้เหมือน Native App ใช้งานแบบออฟไลน์ได้ 100% ผ่าน Service Worker (`thungara-v70`)
- ♿ **WCAG 2.1 & Dark Mode** — รองรับ Keyboard Navigation, Screen Reader (A11y 100%), และสลับโหมดมืด/สว่างตามระบบอัตโนมัติ
- 🔗 **Deep-Linking & History** — แชร์และเปิดเพลงตรงผ่าน URL parameters พร้อมบันทึกประวัติการค้นหาล่าสุด 5 รายการ

---

## 🛠️ Tech Stack

| ด้าน | เครื่องมือ / เทคโนโลยี |
|:---|:---|
| **Frontend** | HTML5, CSS3, Modern JavaScript (Pure Vanilla — Zero Dependencies) |
| **Search Engine** | TF-IDF Vector Space Model + Cosine Similarity + Greedy Tokenizer |
| **Voice Recognition** | Web Speech API (`th-TH`) |
| **Offline & Cache** | Service Worker + Cache Storage API (`thungara-v70`) |
| **Concurrency** | Dedicated Web Worker (`search-worker.js`) |
| **Accessibility** | WAI-ARIA 1.2, WCAG 2.1 (Focus-Visible, Focus Trap, Screen-Reader Live Regions) |

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```text
thungara/
├── .github/
│   └── workflows/
│       └── ci.yml            — GitHub Actions Dual-Engine CI (Node.js 20 + Python 3.11)
├── app/
│   ├── index.html            — หน้าเว็บแอปพลิเคชันหลัก (UI + Controller)
│   ├── search-worker.js      — Dedicated Web Worker สำหรับการค้นหาใน background
│   ├── sw.js                 — Service Worker สำหรับ Caching & Offline
│   └── manifest.json         — PWA Web App Manifest
├── assets/
│   └── favicon.svg           — ไอคอนประจำเว็บและ PWA Application
├── data/
│   ├── data.json             — ฐานข้อมูลเพลง 1,500 เพลง พร้อม TF-IDF Vectors
│   └── youtube_ids.json      — YouTube Video IDs สำหรับฟังเพลงจริง
├── tests/
│   ├── run_all.js            — Unified Test Runner รันการทดสอบทั้งหมดผ่าน Node.js
│   ├── test_full_system.js   — ชุดตรวจสอบระบบฉบับ Node.js (239 Checks)
│   ├── test_search.js        — ชุดทดสอบ Core Search ฉบับ Node.js (71 หมวด / 176 Assertions)
│   ├── test_full_system.py   — ชุดตรวจสอบระบบฉบับ Python (239 Checks)
│   ├── test_search.py        — ชุดทดสอบ Core Search ฉบับ Python (71 หมวด / 176 Assertions)
│   ├── test_runner.html      — หน้าทดสอบบนเบราว์เซอร์พร้อม UI วัด Latency (176 Tests)
│   └── run_test.bat          — สคริปต์ 1-Click รันทดสอบอัตโนมัติบน Windows
└── package.json              — Zero-dependency npm scripts สำหรับรันทดสอบ
```

---

## 🚀 เริ่มต้นใช้งาน (Getting Started)

รัน Local Web Server ด้วย Python หรือ Node.js:

```bash
# ด้วย Python
python -m http.server 8765

# หรือด้วย Node.js (npx)
npx serve -l 8765 .
```

เปิดเบราว์เซอร์ไปที่: `http://localhost:8765/app/index.html`

---

## 🧪 การทดสอบระบบ (Testing & Verification)

โปรเจกต์รองรับการทดสอบแบบ Dual-Engine ทั้ง Node.js (Zero-Dependency) และ Python:

### 1. รันผ่าน Node.js / npm (แนะนำ)

```bash
# รันชุดทดสอบทั้งหมดในคำสั่งเดียว (415 Tests: System 239 + Search 176)
npm test

# หรือรันแยกเฉพาะชุด:
npm run test:system   # ตรวจสอบความสมบูรณ์และ Defensive Guards (239 Checks)
npm run test:search   # ทดสอบความแม่นยำของ Core Search Engine (176 Assertions)
```

### 2. รันบน Windows แบบ 1-Click
ดับเบิลคลิกไฟล์ `tests/run_test.bat` หรือรันผ่าน Command Line:
```cmd
tests\run_test.bat
```

### 3. รันผ่าน Python
```bash
python tests/test_full_system.py
python tests/test_search.py
```

### 4. รันบนเบราว์เซอร์
เปิดหน้าทดสอบที่: `http://localhost:8765/tests/test_runner.html`

---

## 🌐 การนำขึ้นใช้งาน (Deployment)

สามารถ Deploy บน Static Hosting ใดก็ได้ทันที (Vercel, Netlify, หรือ GitHub Pages)

> **หมายเหตุ**: ระบบ Voice Search จำเป็นต้องใช้งานผ่าน HTTPS หรือ `localhost`

---

## 📄 License

[MIT License](LICENSE)