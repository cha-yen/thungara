# Thungara (ทุ่งคารา) 🎵

ระบบค้นหาเพลงลูกทุ่งไทยจากเนื้อร้อง 1,500 เพลง — พิมพ์ชื่อเพลง ท่อนเนื้อร้อง ชื่อศิลปิน หรือร้องผ่านไมโครโฟนก็ค้นพบได้ทันที ประมวลผลรวดเร็วแบบ Real-time บนเบราว์เซอร์ 100% ปราศจาก External Frameworks

---

## ✨ จุดเด่นสำคัญ (Key Highlights)

### 🔍 ค้นหาอัจฉริยะ & ภาษาไทย (Smart Search & Thai NLP)
- **Hybrid Search Engine** — ผสาน TF-IDF Sparse Vector Space Model, Exact Phrase และ Levenshtein Fuzzy Matching คำนวณความเชื่อมั่นแบบ Tiered Normalized Confidence Score ($[0.0, 1.0]$) แบบ Real-time
- **Omnibox ค้นหาในช่องเดียว** — พิมพ์ชื่อศิลปินเดี่ยว เพลงคู่ (`&`) หรือศิลปินรับเชิญ (`feat.`) ผสมชื่อเพลงได้ทันทีโดยไม่ต้องเลือกฟิลเตอร์
- **แยกรากคำประสม (Compound Decompounding)** — สกัดคำรากศัพท์หลักออกจากคำประสม (เช่น *"ความรัก"* จับคู่ *"รัก"*) พร้อมระบบ **Affix Isolation** ป้องกันคำนำหน้านามรบกวนไฮไลต์
- **ร้องค้นหา (Voice Search)** — แปลงเสียงร้องหรือเสียงพูดเป็นข้อความภาษาไทยด้วย Web Speech API แล้วค้นหาให้อัตโนมัติ
- **คำพ้องภาษาถิ่นอีสาน** — ขยายคำค้นหาสู่ภาษาถิ่นโดยอัตโนมัติ (เช่น *"คิดถึง"* ค้นพบ *"คิดฮอด"*, *"ไม่รัก"* ค้นพบ *"บ่ฮัก"*)
- **ตรวจสอบสระลอย** — กรองเศษคำและสระลอยที่ไม่สมบูรณ์ (เช่น *"าว"*, *"ิน"*) ทันที ป้องกันผลลัพธ์แปลกปลอม (False Positives)

### 🎨 ประสบการณ์และการเข้าถึง (UX & Accessibility)
- **WCAG 2.1 SC 2.4.7 & A11y 100%** — รองรับ Focus-Visible (`:focus-visible`) ครบทุกปุ่มและตัวกรอง, มี Modal Focus Trap ป้องกันโฟกัสหลุด, ประกาศสถานะสดผ่าน Screen-Reader (`aria-live="polite"`), และรองรับ Keyboard Navigation เต็มรูปแบบ
- **ตัวกรองและการจัดเรียง (Metadata Filters & Smart Sort)** — กรองตามศิลปิน, อารมณ์เพลง (สนุกสนาน, เศร้า/อกหัก, กำลังใจ), และปี พ.ศ. พร้อมเรียงลำดับผลลัพธ์ตามความเกี่ยวข้อง ปี หรือตัวอักษร
- **Dark Mode & Responsive UI** — สลับโหมดมืด/สว่างอัตโนมัติตามระบบ พร้อมการแสดงผลที่ลื่นไหลบนทุกขนาดหน้าจอ
- **URL Deep-Linking & Web Share** — แชร์และเปิดเพลงตรงผ่าน URL parameters (`?song=`, `?q=`, `?artist=`, `?emotion=`, `?year=`, `?sort=`) ฟื้นฟูสถานะหน้าเว็บได้สมบูรณ์
- **ประวัติการค้นหาและคีย์ลัด** — บันทึกคำค้นหาล่าสุด 5 รายการ พร้อมคีย์ลัด `/` โฟกัสช่องค้นหา และ `Esc` ปิดหน้าต่าง

### ⚡ สถาปัตยกรรมและความเร็ว (Architecture & Performance)
- **Dedicated Web Worker** — แยกการคำนวณการค้นหาทั้งหมดออกจาก Main Thread ด้วยความเร็วเฉลี่ยต่ำกว่า 15ms พร้อมระบบ Fallback สู่ Main Thread อัตโนมัติหาก Worker ขัดข้อง
- **PWA & Offline First** — ติดตั้งลงบนสมาร์ตโฟนได้เหมือนแอป Native ใช้งานแบบ Offline ได้ 100% ผ่าน Service Worker Resilient Caching (`Promise.allSettled`, `thungara-v18`)
- **SafeStorage Fault-Tolerance** — ระบบจัดเก็บข้อมูลที่ปลอดภัย ป้องกันข้อผิดพลาดใน Safari/iOS Private Browsing Mode

---

## 🛠️ Tech Stack

| ด้าน | เทคโนโลยีที่เลือกใช้ |
|:---|:---|
| **Frontend** | HTML5, CSS3, Modern JavaScript (Pure Vanilla — Zero Dependencies) |
| **Web Standards & A11y** | WAI-ARIA 1.2, WCAG 2.1 (Focus-Visible, Focus Trap, Screen-Reader Live Regions) |
| **Search Engine** | TF-IDF Sparse Vector Space Model + Cosine Similarity + Greedy Tokenizer |
| **Voice Recognition** | Web Speech API (`th-TH`) |
| **Offline & Cache** | Service Worker + Cache Storage API with Resilient Caching (`thungara-v18`) |
| **Concurrency** | Dedicated Web Worker (`search-worker.js`) with Fault-Tolerant Fallback |

---

## 📁 โครงสร้างโปรเจกต์ (Project Structure)

```
thungara/
├── app/
│   ├── index.html        — Single-file web application (UI + Controller)
│   ├── search-worker.js  — Dedicated Web Worker สำหรับการค้นหาใน background
│   ├── sw.js             — Service Worker สำหรับ Caching & Offline
│   └── manifest.json     — PWA Web App Manifest
├── assets/
│   └── favicon.svg       — ไอคอนประจำเว็บและ PWA Application
├── data/
│   ├── data.json         — ฐานข้อมูลเพลง 1,500 เพลง พร้อม TF-IDF Vectors
│   └── youtube_ids.json  — YouTube Video IDs สำหรับฟังเพลงจริง
├── tests/
│   ├── test_full_system.py — ชุดตรวจสอบและตรวจสอบความปลอดภัยทั้งระบบ (65 Checks)
│   ├── test_search.py      — ชุดทดสอบ Core Search Engine (19 Categories, 61 Assertions)
│   ├── test_runner.html    — หน้าทดสอบบนเบราว์เซอร์พร้อม UI จับเวลา Latency (61 Tests)
│   └── run_test.bat        — สคริปต์รันการทดสอบอัตโนมัติบน Windows
└── LICENSE
```

---

## 🚀 เริ่มต้นใช้งาน (Getting Started)

### รันบนเครื่องสำหรับพัฒนา (Local Development)

ใช้คำสั่ง Python เพื่อจำลอง Local Web Server:

```bash
python -m http.server 8765
```

เปิดเบราว์เซอร์ไปที่: `http://localhost:8765/app/index.html`

---

## 🧪 การทดสอบระบบ (Testing & Verification)

### 1. ตรวจสอบความสมบูรณ์ทั้งระบบ (Comprehensive System Audit)

รันการตรวจสอบ Data Schema, Git Hygiene, Accessibility, และ Search Resilience:

```bash
python tests/test_full_system.py
```

### 2. ทดสอบ Core Search Engine ผ่าน Command Line

ทดสอบความแม่นยำของการค้นหา 19 หมวดหมู่:

```bash
python tests/test_search.py
```

### 3. ทดสอบ Search Worker ผ่านเบราว์เซอร์

เปิดหน้าทดสอบในเบราว์เซอร์เพื่อทดสอบการทำงานร่วมกับ Web Worker จริง:

```text
http://localhost:8765/tests/test_runner.html
```

---

## 🌐 การนำขึ้นใช้งาน (Deployment)

สามารถ Deploy ขึ้นผู้ให้บริการ Static Hosting ใดก็ได้ทันที:

- **Vercel**: นำเข้า GitHub Repository → Framework: Other → Deploy
- **Netlify**: เชื่อมต่อ Repository หรือลากวางโฟลเดอร์โครงการ
- **GitHub Pages**: ไปที่ Repository Settings → Pages → เลือก Branch และบันทึก

> **หมายเหตุ**: ฟีเจอร์ Voice Search จำเป็นต้องใช้งานผ่าน HTTPS (หรือ `localhost`) บนเบราว์เซอร์ที่รองรับ Web Speech API และได้รับอนุญาตการเข้าถึงไมโครโฟน

---

## 📄 License

[MIT License](LICENSE)