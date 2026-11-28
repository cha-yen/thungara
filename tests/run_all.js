/**
 * run_all.js - Unified Node.js Test Suite Runner for Thungara
 * Runs Linter & Syntax Guard (24 checks), Data Audit (17 checks), PWA Audit (16 checks),
 * Accessibility Guard (21 checks), Security Audit (18 checks), Full-System Audit (239 checks),
 * and Core Search Suite (176 assertions).
 */
const path = require('path');
const { execFileSync } = require('child_process');
const { FullSystemTester } = require('./test_full_system');
const { runAllTests } = require('./test_search');

async function main() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(70));
  console.log('   THUNGARA UNIFIED TEST SUITE RUNNER');
  console.log('='.repeat(70));

  let lintSuccess = false;
  let dataSuccess = false;
  let pwaSuccess = false;
  let a11ySuccess = false;
  let securitySuccess = false;
  let systemSuccess = false;
  let searchReport = null;

  try {
    // 1. Run Linter & Syntax Guard
    console.log('\n>>> SUITE 1/7: Zero-Dependency Linter & Syntax Guard (24 checks)');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'lint.js')], { stdio: 'inherit' });
      lintSuccess = true;
    } catch (e) {
      lintSuccess = false;
    }

    // 2. Run Data & Vector Math Audit
    console.log('\n>>> SUITE 2/7: Data & TF-IDF Vector Math Integrity Audit (17 checks)');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'audit_data.js')], { stdio: 'inherit' });
      dataSuccess = true;
    } catch (e) {
      dataSuccess = false;
    }

    // 3. Run PWA & Offline Resilience Suite
    console.log('\n>>> SUITE 3/7: PWA & Offline Resilience Test Suite (16 checks)');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'test_pwa.js')], { stdio: 'inherit' });
      pwaSuccess = true;
    } catch (e) {
      pwaSuccess = false;
    }

    // 4. Run WCAG 2.1 AA Accessibility Guard
    console.log('\n>>> SUITE 4/7: WCAG 2.1 AA Accessibility & Standards Guard (21 checks)');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'audit_a11y.js')], { stdio: 'inherit' });
      a11ySuccess = true;
    } catch (e) {
      a11ySuccess = false;
    }

    // 5. Run Client-Side Security & DOM-XSS Audit
    console.log('\n>>> SUITE 5/7: Client-Side Security & DOM-XSS Static Audit (18 checks)');
    try {
      execFileSync(process.execPath, [path.join(__dirname, 'audit_security.js')], { stdio: 'inherit' });
      securitySuccess = true;
    } catch (e) {
      securitySuccess = false;
    }

    // 6. Run Full System Audit
    console.log('\n>>> SUITE 6/7: Full System Integrity Audit (239 checks)');
    const tester = new FullSystemTester();
    systemSuccess = await tester.runAll();

    // 7. Run Standalone Search Engine Benchmark Suite
    console.log('\n>>> SUITE 7/7: Search Engine Core Benchmarks (176 assertions / 71 categories)');
    searchReport = await runAllTests();
  } catch (err) {
    console.error('\n[FATAL ERROR] Test suite execution aborted:', err);
    process.exit(1);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const searchSuccess = searchReport && searchReport.failed === 0;
  const allPassed = lintSuccess && dataSuccess && pwaSuccess && a11ySuccess && securitySuccess && systemSuccess && searchSuccess;

  console.log('\n' + '='.repeat(70));
  console.log('   UNIFIED TEST SUITE FINAL SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Zero-Dependency Linter      : ${lintSuccess ? 'PASSED (24/24)' : 'FAILED'}`);
  console.log(`  Data & Vector Math Audit    : ${dataSuccess ? 'PASSED (17/17)' : 'FAILED'}`);
  console.log(`  PWA & Offline Resilience    : ${pwaSuccess ? 'PASSED (16/16)' : 'FAILED'}`);
  console.log(`  WCAG 2.1 AA Accessibility   : ${a11ySuccess ? 'PASSED (21/21)' : 'FAILED'}`);
  console.log(`  Client-Side Security Audit  : ${securitySuccess ? 'PASSED (18/18)' : 'FAILED'}`);
  console.log(`  Full-System Integrity Audit : ${systemSuccess ? 'PASSED (239/239)' : 'FAILED'}`);
  console.log(`  Core Search Engine Suite    : ${searchSuccess ? `PASSED (${searchReport.total}/${searchReport.total})` : 'FAILED'}`);
  console.log(`  Total Execution Time        : ${durationSec}s`);
  console.log(`  Overall Status              : ${allPassed ? 'ALL TESTS PASSED (100% OK)' : 'SOME TESTS FAILED'}`);
  console.log('='.repeat(70) + '\n');

  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { main };
