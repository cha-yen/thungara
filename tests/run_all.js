/**
 * run_all.js - Unified Node.js Test Suite Runner for Thungara
 * Runs Full-System Integrity Audit (239 checks) and Core Search Engine Benchmarks (176 assertions).
 */
const { FullSystemTester } = require('./test_full_system');
const { runAllTests } = require('./test_search');

async function main() {
  const startTime = Date.now();
  console.log('\n' + '='.repeat(70));
  console.log('   THUNGARA UNIFIED TEST SUITE RUNNER');
  console.log('='.repeat(70));

  let systemSuccess = false;
  let searchReport = null;

  try {
    // 1. Run Full System Audit
    console.log('\n>>> SUITE 1/2: Full System Integrity Audit (239 checks)');
    const tester = new FullSystemTester();
    systemSuccess = await tester.runAll();

    // 2. Run Standalone Search Engine Benchmark Suite
    console.log('\n>>> SUITE 2/2: Search Engine Core Benchmarks (176 assertions / 71 categories)');
    searchReport = await runAllTests();
  } catch (err) {
    console.error('\n[FATAL ERROR] Test suite execution aborted:', err);
    process.exit(1);
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const searchSuccess = searchReport && searchReport.failed === 0;
  const allPassed = systemSuccess && searchSuccess;

  console.log('\n' + '='.repeat(70));
  console.log('   UNIFIED TEST SUITE FINAL SUMMARY');
  console.log('='.repeat(70));
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
