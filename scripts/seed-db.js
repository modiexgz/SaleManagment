require('./require-deps').requireDeps();
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let branchResult = await client.query(`SELECT id FROM branches WHERE name = $1`, ['Crown Stores Main Branch']);
    let branchId;
    if (branchResult.rows.length === 0) {
      branchResult = await client.query(
        `INSERT INTO branches (name, address) VALUES ($1, $2) RETURNING id`,
        ['Crown Stores Main Branch', 'Nairobi, Kenya']
      );
    }
    branchId = branchResult.rows[0].id;

    const users = [
      { username: 'director', password: 'director123', full_name: 'Company Director', role: 'director' },
      { username: 'manager', password: 'manager123', full_name: 'Branch Manager', role: 'manager' },
      { username: 'agent', password: 'agent123', full_name: 'Sales Agent', role: 'sales_agent' },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      await client.query(
        `INSERT INTO users (username, password_hash, full_name, role, branch_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO NOTHING`,
        [u.username, hash, u.full_name, u.role, branchId]
      );
    }

    const categories = [
      { name: 'Refreshments', description: 'Soft drinks and beverages' },
      { name: 'Groceries', description: 'General grocery items' },
      { name: 'Dairy Products', description: 'Milk and dairy items' },
    ];

    const categoryIds = {};
    for (const c of categories) {
      const result = await client.query(
        `INSERT INTO categories (name, description)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        [c.name, c.description]
      );
      categoryIds[c.name] = result.rows[0].id;
    }

    const products = [
      { category: 'Refreshments', name: 'Coca-Cola 500ml', cost: 45, sell: 60, qty: 100, barcode: '8901234567890' },
      { category: 'Refreshments', name: 'Fanta Orange 500ml', cost: 45, sell: 60, qty: 80, barcode: '8901234567891' },
      { category: 'Refreshments', name: 'Pepsi 500ml', cost: 43, sell: 58, qty: 90, barcode: '8901234567892' },
      { category: 'Dairy Products', name: 'Brookside Milk 500ml', cost: 55, sell: 70, qty: 50, barcode: '8901234567893' },
      { category: 'Dairy Products', name: 'Brookside Milk 1L', cost: 95, sell: 120, qty: 40, barcode: '8901234567894' },
      { category: 'Groceries', name: 'Maize Flour 2kg', cost: 120, sell: 150, qty: 30, barcode: '8901234567895' },
    ];

    for (const p of products) {
      const result = await client.query(
        `INSERT INTO products (category_id, name, cost_price, selling_price, quantity, reorder_level)
         VALUES ($1, $2, $3, $4, $5, 20)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [categoryIds[p.category], p.name, p.cost, p.sell, p.qty]
      );

      if (result.rows.length > 0) {
        await client.query(
          `INSERT INTO product_barcodes (product_id, barcode)
           VALUES ($1, $2)
           ON CONFLICT (barcode) DO NOTHING`,
          [result.rows[0].id, p.barcode]
        );
      }
    }

    await client.query('COMMIT');
    console.log('Seed data inserted successfully.');
    console.log('\nDefault login credentials:');
    console.log('  Director:    director / director123');
    console.log('  Manager:     manager  / manager123');
    console.log('  Sales Agent: agent    / agent123');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
