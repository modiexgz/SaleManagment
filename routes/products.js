const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireAuth, requireRole, ROLES, auditLog } = require('../middleware/auth');

const router = express.Router();

const managerOnly = [requireAuth, requireRole(ROLES.MANAGER)];

router.get('/', requireAuth, async (req, res) => {
  try {
    const search = req.query.search || '';
    const result = await db.query(
      `SELECT p.*, c.name AS category_name,
              (SELECT string_agg(pb.barcode, ', ') FROM product_barcodes pb WHERE pb.product_id = p.id) AS barcodes
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE ($1 = '' OR p.name ILIKE $2 OR c.name ILIKE $2)
       ORDER BY p.name ASC`,
      [search, `%${search}%`]
    );
    res.render('products/index', { title: 'Products', products: result.rows, search });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load products.' };
    res.redirect('/dashboard');
  }
});

router.get('/search', requireAuth, async (req, res) => {
  const q = req.query.q || '';
  try {
    const result = await db.query(
      `SELECT p.id, p.name, p.selling_price, p.quantity, c.name AS category_name
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active' AND p.quantity > 0
         AND ($1 = '' OR p.name ILIKE $2)
       ORDER BY p.name LIMIT 20`,
      [q, `%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/barcode/:code', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, c.name AS category_name
       FROM product_barcodes pb
       JOIN products p ON p.id = pb.product_id
       JOIN categories c ON c.id = p.category_id
       WHERE pb.barcode = $1 AND p.status = 'active'`,
      [req.params.code]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

router.get('/new', ...managerOnly, async (req, res) => {
  const categories = await db.query(`SELECT id, name FROM categories WHERE status = 'active' ORDER BY name`);
  res.render('products/form', {
    title: 'New Product', product: null, categories: categories.rows, errors: [],
  });
});

router.post('/', ...managerOnly, [
  body('name').trim().notEmpty(),
  body('category_id').isInt(),
  body('cost_price').isFloat({ min: 0 }),
  body('selling_price').isFloat({ min: 0 }),
  body('quantity').isInt({ min: 0 }),
  body('reorder_level').isInt({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  const categories = await db.query(`SELECT id, name FROM categories WHERE status = 'active' ORDER BY name`);

  if (!errors.isEmpty()) {
    return res.render('products/form', {
      title: 'New Product', product: req.body, categories: categories.rows, errors: errors.array(),
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { name, category_id, description, cost_price, selling_price, quantity, reorder_level, barcodes } = req.body;

    const result = await client.query(
      `INSERT INTO products (category_id, name, description, cost_price, selling_price, quantity, reorder_level)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [category_id, name, description || null, cost_price, selling_price, quantity, reorder_level]
    );

    const productId = result.rows[0].id;
    if (barcodes) {
      const codes = barcodes.split(',').map((b) => b.trim()).filter(Boolean);
      for (const code of codes) {
        await client.query(
          `INSERT INTO product_barcodes (product_id, barcode) VALUES ($1, $2)`,
          [productId, code]
        );
      }
    }

    await client.query('COMMIT');
    await auditLog(req.session.user.id, 'create_product', 'product', productId, { name });
    req.session.flash = { type: 'success', message: 'Product created successfully.' };
    res.redirect('/products');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.session.flash = { type: 'error', message: err.code === '23505' ? 'Barcode already exists.' : 'Failed to create product.' };
    res.redirect('/products/new');
  } finally {
    client.release();
  }
});

router.get('/:id/edit', ...managerOnly, async (req, res) => {
  try {
    const [product, categories, barcodes] = await Promise.all([
      db.query('SELECT * FROM products WHERE id = $1', [req.params.id]),
      db.query(`SELECT id, name FROM categories WHERE status = 'active' ORDER BY name`),
      db.query('SELECT barcode FROM product_barcodes WHERE product_id = $1', [req.params.id]),
    ]);
    if (product.rows.length === 0) {
      req.session.flash = { type: 'error', message: 'Product not found.' };
      return res.redirect('/products');
    }
    const p = product.rows[0];
    p.barcodes = barcodes.rows.map((b) => b.barcode).join(', ');
    res.render('products/form', {
      title: 'Edit Product', product: p, categories: categories.rows, errors: [],
    });
  } catch (err) {
    console.error(err);
    res.redirect('/products');
  }
});

router.post('/:id', ...managerOnly, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { name, category_id, description, cost_price, selling_price, reorder_level, status, barcodes } = req.body;

    await client.query(
      `UPDATE products SET category_id = $1, name = $2, description = $3,
       cost_price = $4, selling_price = $5, reorder_level = $6, status = $7
       WHERE id = $8`,
      [category_id, name, description || null, cost_price, selling_price, reorder_level, status || 'active', req.params.id]
    );

    await client.query('DELETE FROM product_barcodes WHERE product_id = $1', [req.params.id]);
    if (barcodes) {
      const codes = barcodes.split(',').map((b) => b.trim()).filter(Boolean);
      for (const code of codes) {
        await client.query(
          `INSERT INTO product_barcodes (product_id, barcode) VALUES ($1, $2)`,
          [req.params.id, code]
        );
      }
    }

    await client.query('COMMIT');
    await auditLog(req.session.user.id, 'update_product', 'product', req.params.id, { name });
    req.session.flash = { type: 'success', message: 'Product updated successfully.' };
    res.redirect('/products');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to update product.' };
    res.redirect(`/products/${req.params.id}/edit`);
  } finally {
    client.release();
  }
});

module.exports = router;
