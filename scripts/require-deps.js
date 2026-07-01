function requireDeps() {
  try {
    require.resolve('pg');
    require.resolve('dotenv');
  } catch {
    console.error('\n========================================');
    console.error('ERROR: Dependencies are not installed');
    console.error('========================================\n');
    console.error('Run this first:\n');
    console.error('  npm install\n');
    console.error('Then run:\n');
    console.error('  npm run db:init\n');
    process.exit(1);
  }
}

module.exports = { requireDeps };
