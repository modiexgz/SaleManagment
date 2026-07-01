const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const {
  requireAuth, requireRole, ROLES, auditLog,
  recordInventoryMovement, checkLowStock,
} = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.MANAGER));

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT pr.*, p.name AS product_name, u.full_name AS recorded_by_name, b.name AS branch_name
       FROM procurements pr
       JOIN products p ON p.id = pr.product_id
       JOIN users u ON u.id = pr.recorded_by
       JOIN branches b ON b.id = pr.branch_id
       ORDER BY pr.received_date DESC, pr.created_at DESC
       LIMIT 100`
    );
    res.render('procurement/index', { title: 'Procurement', procurements: result.rows });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load procurements.' };
    res.redirect('/dashboard');
  }
});

router.get('/new', async (req, res) => {
  const products = await db.query(
    `SELECT id, name, cost_price, quantity FROM products WHERE status = 'active' ORDER BY name`
  );
  res.render('procurement/form', {
    title: 'Record Procurement', products: products.rows, errors: [], form: {},
  });
});

router.post('/', [
  body('product_id').isInt(),
  body('supplier_name').trim().notEmpty(),
  body('quantity_received').isInt({ min: 1 }),
  body('cost_price').isFloat({ min: 0 }),
  body('received_date').optional().isDate(),
], async (req, res) => {
  const errors = validationResult(req);
  const products = await db.query(
    `SELECT id, name, cost_price, quantity FROM products WHERE status = 'active' ORDER BY name`
  );

  if (!errors.isEmpty()) {
    return res.render('procurement/form', {
      title: 'Record Procurement', products: products.rows, errors: errors.array(), form: req.body,
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id, supplier_name, quantity_received, cost_price, received_date } = req.body;
    const user = req.session.user;

    const productResult = await client.query(
      'SELECT quantity FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const qtyBefore = productResult.rows[0].quantity;
    const qtyAfter = qtyBefore + parseInt(quantity_received, 10);

    const procResult = await client.query(
      `INSERT INTO procurements (product_id, supplier_name, quantity_received, cost_price, branch_id, received_date, recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [product_id, supplier_name, quantity_received, cost_price, user.branch_id,
        received_date || new Date().toISOString().slice(0, 10), user.id]
    );

    await client.query(
      `UPDATE products SET quantity = $1, cost_price = $2 WHERE id = $3`,
      [qtyAfter, cost_price, product_id]
    );

    await recordInventoryMovement(client, {
      productId: product_id,
      movementType: 'procurement',
      quantityChange: parseInt(quantity_received, 10),
      quantityBefore: qtyBefore,
      quantityAfter: qtyAfter,
      referenceId: procResult.rows[0].id,
      referenceType: 'procurement',
      performedBy: user.id,
      notes: `Procurement from ${supplier_name}`,
    });

    await checkLowStock(client, product_id);
    await client.query('COMMIT');
    await auditLog(user.id, 'record_procurement', 'procurement', procResult.rows[0].id, {
      product_id, quantity_received, supplier_name,
    });

    req.session.flash = { type: 'success', message: `Procurement recorded. Stock updated to ${qtyAfter}.` };
    res.redirect('/procurement');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to record procurement.' };
    res.redirect('/procurement/new');
  } finally {
    client.release();
  }
});

module.exports = router;
