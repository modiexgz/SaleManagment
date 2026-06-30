const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function setup() {
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  const dbName = process.env.DB_NAME || 'csrms';

  try {
    const exists = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    if (exists.rows.length === 0) {
      await adminPool.query(`CREATE DATABASE ${dbName}`);
      console.log(`Database "${dbName}" created.`);
    } else {
      console.log(`Database "${dbName}" already exists.`);
    }
  } catch (err) {
    console.error('Failed to create database:', err.message);
    console.log('Attempting to connect to existing database...');
  } finally {
    await adminPool.end();
  }

  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: dbName,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });

  const schema = fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema applied successfully.');

  await pool.end();
  console.log('Database setup complete. Run "npm run db:seed" to add sample data.');
}

setup().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
