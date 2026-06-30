require('dotenv').config();
const { pool } = require('./config/database');

const DB_NAME = process.env.DB_NAME || 'csrms';

async function checkDatabase() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    if (err.code === '3D000') {
      console.error('\n========================================');
      console.error('ERROR: PostgreSQL database does not exist');
      console.error('========================================');
      console.error(`Database "${DB_NAME}" was not found.\n`);
      console.error('Run these commands first (in your project folder):\n');
      console.error('  1. cp .env.example .env     (then set DB_PASSWORD)');
      console.error('  2. npm run db:setup         (creates database + tables)');
      console.error('  3. npm run db:seed          (adds sample users & products)');
      console.error('  4. npm start\n');
      console.error('Or run everything at once:  npm run db:init\n');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('\nERROR: Cannot connect to PostgreSQL.');
      console.error('Make sure PostgreSQL is running on your laptop.\n');
    } else if (err.code === '28P01') {
      console.error('\nERROR: PostgreSQL login failed (wrong password).');
      console.error('Check DB_USER and DB_PASSWORD in your .env file.\n');
    } else {
      console.error('\nDatabase connection failed:', err.message);
    }
    return false;
  }
}

module.exports = { checkDatabase };
