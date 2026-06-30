const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const {
  requireAuth, requireRole, ROLES, auditLog,
  recordInventoryMovement, checkLowStock,
} = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireRole(ROLES.MANAGER), async (req, res) => {
  try {
    const search = req.query.search || '';
    const result = await db.query(
      `SELECT p.*, c.name AS category_name,
              CASE WHEN p.quantity = 0 THEN 'out_of_stock'
                   WHEN p.quantity <= p.reorder_level THEN 'low_stock'
                   ELSE 'in_stock' END AS stock_status
       FROM products p
       JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active'
         AND ($1 = '' OR p.name ILIKE $2 OR c.name ILIKE $2)
       ORDER BY p.quantity ASC, p.name ASC`,
      [search, `%${search}%`]
    );
    res.render('inventory/index', { title: 'Inventory', products: result.rows, search });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load inventory.' };
    res.redirect('/dashboard');
  }
});

router.get('/history', requireAuth, requireRole(ROLES.MANAGER), async (req, res) => {
  try {
    const result = await db.query(
      `SELECT im.*, p.name AS product_name, u.full_name AS performed_by_name
       FROM inventory_movements im
       JOIN products p ON p.id = im.product_id
       LEFT JOIN users u ON u.id = im.performed_by
       ORDER BY im.created_at DESC LIMIT 200`
    );
    res.render('inventory/history', { title: 'Inventory History', movements: result.rows });
  } catch (err) {
    console.error(err);
    res.redirect('/inventory');
  }
});

router.get('/adjust', requireAuth, requireRole(ROLES.MANAGER), async (req, res) => {
  const products = await db.query(
    `SELECT id, name, quantity FROM products WHERE status = 'active' ORDER BY name`
  );
  res.render('inventory/adjust', {
    title: 'Stock Adjustment', products: products.rows, errors: [], form: {},
  });
});

router.post('/adjust', requireAuth, requireRole(ROLES.MANAGER), [
  body('product_id').isInt(),
  body('adjustment_quantity').isInt().custom((v) => v !== 0).withMessage('Adjustment cannot be zero'),
  body('reason').trim().notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  const products = await db.query(
    `SELECT id, name, quantity FROM products WHERE status = 'active' ORDER BY name`
  );

  if (!errors.isEmpty()) {
    return res.render('inventory/adjust', {
      title: 'Stock Adjustment', products: products.rows, errors: errors.array(), form: req.body,
    });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id, adjustment_quantity, reason } = req.body;
    const adjQty = parseInt(adjustment_quantity, 10);

    const productResult = await client.query(
      'SELECT quantity FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (productResult.rows.length === 0) throw new Error('Product not found');

    const qtyBefore = productResult.rows[0].quantity;
    const qtyAfter = qtyBefore + adjQty;
    if (qtyAfter < 0) {
      throw new Error('Adjustment would result in negative stock');
    }

    const adjResult = await client.query(
      `INSERT INTO stock_adjustments (product_id, adjustment_quantity, reason, adjusted_by)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [product_id, adjQty, reason, req.session.user.id]
    );

    await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [qtyAfter, product_id]);

    await recordInventoryMovement(client, {
      productId: product_id,
      movementType: 'adjustment',
      quantityChange: adjQty,
      quantityBefore: qtyBefore,
      quantityAfter: qtyAfter,
      referenceId: adjResult.rows[0].id,
      referenceType: 'adjustment',
      performedBy: req.session.user.id,
      notes: reason,
    });

    await checkLowStock(client, product_id);
    await client.query('COMMIT');
    await auditLog(req.session.user.id, 'stock_adjustment', 'stock_adjustment', adjResult.rows[0].id, {
      product_id, adjustment_quantity: adjQty, reason,
    });

    req.session.flash = { type: 'success', message: `Stock adjusted. New quantity: ${qtyAfter}.` };
    res.redirect('/inventory');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    req.session.flash = { type: 'error', message: err.message || 'Failed to adjust stock.' };
    res.redirect('/inventory/adjust');
  } finally {
    client.release();
  }
});

module.exports = router;
