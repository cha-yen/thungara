#!/usr/bin/env node
/**
 * Thungara - Search Engine Latency & Memory Benchmark Suite
 * Measures query latency percentiles (p50, p90, p95, p99), throughput (QPS),
 * and verifies memory stability under high query volume.
 */

const fs = require('fs');
const path = require('path');
const { search, SONGS, VOCAB } = require('./test_search.js');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Helper to format numbers
function fmt(num, decimals = 2) {
  return Number(num).toFixed(decimals);
}

function getMemoryUsageMB() {
  const mem = process.memoryUsage();
  return {
    rss: mem.rss / (1024 * 1024),
    heapTotal: mem.heapTotal / (1024 * 1024),
    heapUsed: mem.heapUsed / (1024 * 1024)
  };
}

// Percentile calculation
function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const index = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, Math.min(index, sortedArr.length - 1))];
}

console.log('======================================================================');
console.log('   THUNGARA SEARCH LATENCY & MEMORY BENCHMARK');
console.log('======================================================================');
console.log(`Node.js   : ${process.version} (${process.platform} ${process.arch})`);
console.log(`Songs     : ${SONGS ? SONGS.length : 1500} records`);
console.log(`Vocab     : ${VOCAB ? VOCAB.length : '5,000+'} entries`);
console.log('======================================================================\n');

// 1. Initial Memory Snapshot
const initMem = getMemoryUsageMB();
console.log('--- Phase 1: Baseline Memory Footprint ---');
console.log(`  RSS Memory       : ${fmt(initMem.rss)} MB`);
console.log(`  Heap Allocated   : ${fmt(initMem.heapTotal)} MB`);
console.log(`  Heap In-Use      : ${fmt(initMem.heapUsed)} MB`);

// 2. Query Profiles
const QUERY_PROFILES = {
  'Direct Title'     : ['ขอใจกันหนาว', 'ดาวเต้น ม.ต้น', 'คนบ้านเดียวกัน', 'ดอกหญ้าในป่าปูน'],
  'Lyrics Phrase'    : ['เมื่อเลิกงานเดินเหงามีเงาเป็นเพื่อนเข้าซอย', 'กอดคนบ่มีใจ', 'เหนื่อยจังอยากฟังเสียง', 'มีเงาเป็นเพื่อนเข้าซอย'],
  'Dialect & Synonym': ['คิดถึงเธอ', 'ไม่รัก', 'คิดฮอดบ้าน', 'เฮาฮักเจ้า'],
  'Typo & Fuzzy'     : ['ควายรัก', 'ขอบใจกันหนาว', 'เคียงค้างบนทางเปื้อนฝุ่น', 'ดอกยาในป่าปูน'],
  'Omnibox Delimiter': ['ขอใจกันหนาว + ต่าย อรทัย', 'ศิริพร - เต้ยฟ้าผ่า', 'ไผ่ พงศธร // คนบ้านเดียวกัน', 'ไมค์ ภิรมย์พร /// ยาใจคนจน']
};

console.log('\n--- Phase 2: Category Profile Latency (Warm-up & Sampling) ---');
console.log(
  'Category'.padEnd(20) +
  'Queries'.padEnd(10) +
  'Avg Latency'.padEnd(14) +
  'Min'.padEnd(10) +
  'Max'.padEnd(10)
);
console.log('-'.repeat(64));

const allBenchmarkQueries = [];

for (const [category, queries] of Object.entries(QUERY_PROFILES)) {
  const latencies = [];
  for (const q of queries) {
    allBenchmarkQueries.push(q);
    // Warm query
    search(q);
    // Timed run
    const start = process.hrtime.bigint();
    const results = search(q);
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    latencies.push(ms);
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  console.log(
    category.padEnd(20) +
    String(queries.length).padEnd(10) +
    `${fmt(avg, 3)} ms`.padEnd(14) +
    `${fmt(min, 3)} ms`.padEnd(10) +
    `${fmt(max, 3)} ms`.padEnd(10)
  );
}

// 3. High-Volume Stress Test (1,000 Queries)
console.log('\n--- Phase 3: High-Volume Stress Run (1,000 Sequential Queries) ---');

const TOTAL_STRESS_QUERIES = 1000;
const queryCount = allBenchmarkQueries.length;
const stressLatencies = [];

const memBeforeStress = getMemoryUsageMB();
const stressStartTime = process.hrtime.bigint();

for (let i = 0; i < TOTAL_STRESS_QUERIES; i++) {
  const q = allBenchmarkQueries[i % queryCount];
  const qStart = process.hrtime.bigint();
  search(q);
  const qEnd = process.hrtime.bigint();
  stressLatencies.push(Number(qEnd - qStart) / 1e6);
}

const stressEndTime = process.hrtime.bigint();
const memAfterStress = getMemoryUsageMB();

const totalDurationMs = Number(stressEndTime - stressStartTime) / 1e6;
const totalDurationSec = totalDurationMs / 1000;
const qps = TOTAL_STRESS_QUERIES / totalDurationSec;

stressLatencies.sort((a, b) => a - b);
const avgLatency = stressLatencies.reduce((a, b) => a + b, 0) / stressLatencies.length;
const p50 = percentile(stressLatencies, 50);
const p90 = percentile(stressLatencies, 90);
const p95 = percentile(stressLatencies, 95);
const p99 = percentile(stressLatencies, 99);
const minLatency = stressLatencies[0];
const maxLatency = stressLatencies[stressLatencies.length - 1];
const heapDeltaMB = memAfterStress.heapUsed - memBeforeStress.heapUsed;

console.log(`  Completed Queries : ${TOTAL_STRESS_QUERIES.toLocaleString()} queries`);
console.log(`  Total Wall Time   : ${fmt(totalDurationSec, 3)} s (${fmt(totalDurationMs, 1)} ms)`);
console.log(`  Throughput (QPS)  : ${fmt(qps, 1)} queries/sec`);
console.log(`  Latency Metrics   :`);
console.log(`    - Min Latency   : ${fmt(minLatency, 3)} ms`);
console.log(`    - Mean (Avg)    : ${fmt(avgLatency, 3)} ms`);
console.log(`    - Median (p50)  : ${fmt(p50, 3)} ms`);
console.log(`    - 90th %ile (p90): ${fmt(p90, 3)} ms`);
console.log(`    - 95th %ile (p95): ${fmt(p95, 3)} ms`);
console.log(`    - 99th %ile (p99): ${fmt(p99, 3)} ms`);
console.log(`    - Max Latency   : ${fmt(maxLatency, 3)} ms`);
console.log(`  Memory Stability  :`);
console.log(`    - Heap Before   : ${fmt(memBeforeStress.heapUsed)} MB`);
console.log(`    - Heap After    : ${fmt(memAfterStress.heapUsed)} MB`);
console.log(`    - Heap Delta    : ${heapDeltaMB >= 0 ? '+' : ''}${fmt(heapDeltaMB)} MB`);

// 4. Performance & Regression Guards
console.log('\n--- Phase 4: Performance & Memory Regression Guards ---');

const guards = [
  {
    name: 'Average Latency SLA (< 15.0 ms)',
    pass: avgLatency < 15.0,
    actual: `${fmt(avgLatency, 3)} ms`,
    threshold: '< 15.0 ms'
  },
  {
    name: '95th Percentile Latency SLA (< 30.0 ms)',
    pass: p95 < 30.0,
    actual: `${fmt(p95, 3)} ms`,
    threshold: '< 30.0 ms'
  },
  {
    name: 'Worst-case Latency Guard (< 100.0 ms)',
    pass: maxLatency < 100.0,
    actual: `${fmt(maxLatency, 3)} ms`,
    threshold: '< 100.0 ms'
  },
  {
    name: 'Memory Leak Guard (Heap Growth < 25 MB)',
    pass: heapDeltaMB < 25.0,
    actual: `${fmt(heapDeltaMB, 2)} MB`,
    threshold: '< 25.0 MB'
  }
];

let failedGuards = 0;
for (const g of guards) {
  if (g.pass) {
    console.log(`  [PASS] ${g.name.padEnd(42)}: ${g.actual}`);
  } else {
    failedGuards++;
    console.error(`  [FAIL] ${g.name.padEnd(42)}: ${g.actual} (Threshold: ${g.threshold})`);
  }
}

console.log('\n======================================================================');
console.log('   BENCHMARK VERDICT');
console.log('======================================================================');
console.log(`  Status: ${failedGuards === 0 ? 'PASSED - ALL PERFORMANCE GUARDS MET' : 'FAILED - PERFORMANCE REGRESSION DETECTED'}`);
console.log('======================================================================\n');

if (failedGuards > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
