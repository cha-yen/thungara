# Thungara 🎵

ค้นหาเพลงลูกทุ่งไทยจากเนื้อร้อง 1,500 เพลง — พิมพ์ชื่อเพลง เนื้อร้อง หรือชื่อศิลปิน หรือร้องผ่านไมค์ก็ค้นได้ทันที

## Features

- **ค้นหาอัจฉริยะ (Hybrid Search Engine)** — ขับเคลื่อนด้วย TF-IDF Cosine Similarity, Exact Match, และ Fuzzy Matching คำนวณความเชื่อมั่นแบบ Tiered Normalized Confidence Score ($[0.0, 1.0]$) แบบ Real-time
- **ค้นหาศิลปินผ่านช่องเดียว (Omnibox Artist & Duet Search)** — พิมพ์ชื่อศิลปินเดี่ยวๆ (เช่น *"ต่าย อรทัย"*, *"มนต์แคน"*) หรือพิมพ์ชื่อศิลปินผสมชื่อเพลง (เช่น *"ต่าย อรทัย ขอใจกันหนาว"*) ได้ทันที รองรับทั้งผลงานเดี่ยวและเพลงคู่/เพลงฟีเจอริ่ง (Collab) โดยไม่ต้องเลือกฟิลเตอร์
- **การแยกรากศัพท์คำประสม (Compound Decompounding)** — สกัดคำรากศัพท์ที่มีความหมายหลักออกจากคำประสม (เช่น ค้นหา *"ความรัก"* สามารถจับคู่เพลงที่มีเฉพาะคำว่า *"รัก"* ได้) พร้อมระบบ **Affix Isolation** ป้องกันคำนำหน้านาม (เช่น *"ความ"*, *"การ"*) จากการเกิดไฮไลต์รบกวนสายตา
- **การปฏิเสธเศษคำและสระลอย (Syllable Onset Validation)** — กรองคำค้นหาที่ไม่สมบูรณ์หรือขึ้นต้นด้วยสระ/วรรณยุกต์ลอย (เช่น *"าว"*, *"ิน"*) ทันที ป้องกันผลลัพธ์แปลกปลอม (False Positives) 100%
- **ตัวเรียงลำดับผลลัพธ์อัจฉริยะ (Smart Sorting Controls)** — เลือกเรียงลำดับผลการค้นหาตามความเกี่ยวข้อง (Relevance), ปีใหม่ล่าสุด, ปีเก่าสุด, ชื่อเพลง (ก-ฮ), หรือชื่อศิลปิน (ก-ฮ) ได้ทันทีแบบ Real-time
- **ข้อมูลผลงานศิลปินและการกรองด่วน (Artist Discography Insight)** — แสดงจำนวนเพลงทั้งหมดของศิลปินในระบบบนหน้าต่างเนื้อเพลง พร้อมปุ่มลัดแตะเพื่อค้นหาผลงานทั้งหมดของศิลปินท่านนั้นได้ทันที
- **ลิงก์เปิดตรงและแชร์เพลง (URL Deep-Linking & Web Share)** — รองรับการแชร์และเปิดเพลงตรงผ่าน URL parameters (เช่น `?q=...`, `?artist=...`, หรือ `?song=idx`) ช่วยให้ส่งต่อเพลงให้เพื่อนเปิดได้ทันที
- **การเข้าถึงที่ครอบคลุม (Accessibility & WCAG Compliance)** — ออกแบบตามมาตรฐาน WAI-ARIA ครบถ้วน ทั้ง `role="search"`, `role="dialog"`, `aria-modal`, `aria-label`, และการแจ้งเตือน Toast ด้วย `role="status"` / `aria-live="polite"` พร้อม Focus Indicator (`:focus-visible`) ชัดเจนสำหรับการควบคุมผ่านคีย์บอร์ด, การลดการเคลื่อนไหวตามสเปกระบบ (`prefers-reduced-motion`), การคัดลอกที่ไม่กระตุกบน iOS, และ Mobile Viewport ที่ซูมขยายได้อย่างอิสระ
- **ระบบป้องกันการขัดข้องและความยืดหยุ่น (Fault-Tolerant Storage & Worker Resilience)** — ห่อหุ้ม `localStorage` ด้วย `SafeStorage` ป้องกันข้อผิดพลาดในโหมดไม่ระบุตัวตน (Safari/iOS Incognito) พร้อมระบบโหลดไฟล์ข้อมูลแบบ Path-Agnostic Fetch Fallback และ Web Worker Defensive Try-Catch Boundary ที่สามารถตรวจจับข้อผิดพลาดและ Fallback กลับมาค้นหาบน Main Thread ได้อย่างไร้รอยต่อ
- **การเพิ่มประสิทธิภาพเครือข่าย (Resource Hints & Network Optimization)** — ใช้ `<link rel="preconnect">` และ `dns-prefetch` เชื่อมต่อ Google Fonts ล่วงหน้า ช่วยลด Latency และเร่งความเร็วในการแสดงผล (FCP)
- **ประวัติการค้นหาล่าสุด (Recent Search History)** — จดจำคำค้นหาล่าสุด 5 รายการผ่าน `SafeStorage` แตะเพื่อค้นหาซ้ำได้ทันที รองรับการลบทีละรายการและล้างประวัติทั้งหมด
- **คีย์ลัดสำหรับผู้ใช้ระดับโปร (Keyboard Shortcuts)** — กด `/` เพื่อโฟกัสช่องค้นหาได้จากทุกที่ และกด `Esc` เพื่อปิด Modal หรือล้างคำค้นหา
- **Skeleton Shimmer Loading State** — แอนิเมชันโครงร่างการ์ดโหลดข้อมูลแบบ Shimmer ให้ความรู้สึกลื่นไหลและตอบสนองอย่างเป็นธรรมชาติ
- **ร้องค้นหา (Voice Search)** — กดไมค์แล้วร้องหรือพูดเนื้อเพลง ระบบแปลงเสียงพูดเป็นข้อความภาษาไทยด้วย Web Speech API แล้วค้นหาให้อัตโนมัติ
- **ไฮไลต์คำค้นและคำคล้าย (Evidence-Based Highlighting)** — ส่งค่า `evidence.matchedTerms` จาก Search Worker มาไฮไลต์คำที่ตรงจริง ทั้งคำตรง วลีต่อเนื่อง คำภาษาถิ่นอีสาน และคำคล้ายที่พบจริงในเนื้อเพลง
- **ตัวกรองครอบคลุม (Metadata Filters)** — กรองตามศิลปิน, อารมณ์เพลง (สนุกสนาน, เศร้า/อกหัก, กำลังใจ, ฯลฯ), และปีที่ออก
- **Dark Mode & Responsive UI** — รองรับโหมดมืด/สว่างอัตโนมัติตามระบบ พร้อมการแสดงผลที่ลื่นไหลบนทุกขนาดหน้าจอ
- **PWA & Offline First** — ติดตั้งลงบนหน้าจอสมาร์ตโฟนได้เหมือนแอป Native ใช้งานแบบ Offline ได้ผ่าน Service Worker Caching Strategy และ Navigation Fallback พร้อม Web App Manifest มาตรฐานสากล
- **High Performance Web Worker** — แยกการคำนวณการค้นหาทั้งหมดออกจาก Main Thread ทำให้ UI ไม่กระตุก ด้วยความเร็วในการค้นหาเฉลี่ยต่ำกว่า 20ms

## Tech Stack

- **Frontend**: HTML5, CSS3, Modern JavaScript (Pure Vanilla — Zero External Frameworks)
- **Web Standards & A11y**: WAI-ARIA 1.2, WCAG 2.1 Focus-Visible & Reduced-Motion, Screen-Reader Toast Live Regions, SafeStorage Wrapper, Path-Agnostic Asset Fallbacks
- **Search Engine**: TF-IDF Sparse Vector Space Model + Cosine Similarity + Greedy Longest-Match Tokenizer
- **Scoring Architecture**: Standardized Multi-Tiered Confidence Matrix ($[0.0, 1.0]$)
- **Speech Recognition**: Web Speech API (`th-TH`)
- **Offline & Cache**: Service Worker + Cache Storage API with Offline Fallback
- **Concurrency & Resilience**: Dedicated Web Worker (`search-worker.js`) with Try-Catch Boundary & Seamless Main-Thread Fallback

## Project Structure

```
app/
	index.html        — Single-file web application (UI + Controller)
	search-worker.js  — Dedicated Web Worker สำหรับการค้นหาใน background
	sw.js             — Service Worker สำหรับ Caching & Offline
	manifest.json     — PWA Web App Manifest
assets/
	favicon.svg       — ไอคอนประจำเว็บและ PWA Application
data/
	data.json         — ฐานข้อมูลเพลง 1,500 เพลง พร้อม TF-IDF Vectors
	youtube_ids.json  — YouTube Video IDs สำหรับฟังเพลงจริง
tests/
	test_search.py    — ชุดทดสอบ Core Search Engine (12 Categories, 40 Assertions)
	test_full_system.py — ชุดตรวจสอบและตรวจสอบความปลอดภัยทั้งระบบ (Comprehensive Audit Suite: 37 Checks)
	test_runner.html  — หน้าทดสอบบนเบราว์เซอร์พร้อม UI แสดงผลและจับเวลา Latency (12 Categories, 40 Tests)
	run_test.bat      — สคริปต์รันการทดสอบอัตโนมัติบน Windows
LICENSE
```

## Getting Started

### รันบนเครื่องสำหรับพัฒนา (Local Development)

ใช้คำสั่ง Python เพื่อจำลอง Local Web Server:

```bash
python -m http.server 8765
```

เปิดเบราว์เซอร์ไปที่: `http://localhost:8765/app/index.html`

### การทดสอบระบบ (Testing & Verification)

#### 1. ตรวจสอบความสมบูรณ์ทั้งระบบ (Comprehensive System Audit)

รันการตรวจสอบ Data Schema, Git Hygiene, และ Core Search Engine:

```bash
python tests/test_full_system.py
```

#### 2. ทดสอบ Core Search Engine ผ่าน Command Line

```bash
python tests/test_search.py
```

#### 3. ทดสอบ Search Worker ผ่านเบราว์เซอร์

เปิดหน้าทดสอบในเบราว์เซอร์เพื่อทดสอบการทำงานร่วมกับ Web Worker จริง:

```text
http://localhost:8765/tests/test_runner.html
```

### การนำขึ้นใช้งาน (Deployment)

สามารถ Deploy ขึ้นผู้ให้บริการ Static Hosting ใดก็ได้ทันที:

- **Vercel**: นำเข้า GitHub Repository → Framework: Other → Deploy
- **Netlify**: เชื่อมต่อ Repository หรือลากวางโฟลเดอร์โครงการ
- **GitHub Pages**: ไปที่ Repository Settings → Pages → เลือก Branch และบันทึก

> **หมายเหตุ**: ฟีเจอร์ Voice Search จำเป็นต้องใช้งานผ่าน HTTPS (หรือ `localhost`) บนเบราว์เซอร์ที่รองรับ Web Speech API และต้องได้รับอนุญาตการเข้าถึงไมโครโฟน

## License

[MIT License](LICENSE)