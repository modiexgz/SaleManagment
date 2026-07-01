const express = require('express');
const { body, validationResult } = require('express-validator');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const {
  requireAuth, requireRole, ROLES, auditLog,
  recordInventoryMovement, checkLowStock, generateReceiptNumber,
} = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.SALES_AGENT, ROLES.MANAGER));

router.get('/', async (req, res) => {
  try {
    const isAgent = req.session.user.role === ROLES.SALES_AGENT;
    const agentFilter = isAgent ? 'AND s.sales_agent_id = $1' : '';
    const params = isAgent ? [req.session.user.id] : [];

    const result = await db.query(
      `SELECT s.*, p.name AS product_name, u.full_name AS agent_name
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.sales_agent_id
       WHERE 1=1 ${agentFilter}
       ORDER BY s.sale_date DESC LIMIT 100`,
      params
    );
    res.render('sales/index', { title: 'Sales', sales: result.rows });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load sales.' };
    res.redirect('/dashboard');
  }
});

router.get('/new', requireRole(ROLES.SALES_AGENT), (req, res) => {
  res.render('sales/pos', { title: 'New Sale', errors: [], form: {} });
});

router.post('/', requireRole(ROLES.SALES_AGENT), [
  body('product_id').isInt(),
  body('quantity').isInt({ min: 1 }),
  body('amount_paid').isFloat({ min: 0 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('sales/pos', { title: 'New Sale', errors: errors.array(), form: req.body });
  }

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const { product_id, quantity, amount_paid } = req.body;
    const qty = parseInt(quantity, 10);
    const user = req.session.user;

    const productResult = await client.query(
      `SELECT p.*, c.name AS category_name
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.id = $1 AND p.status = 'active' FOR UPDATE`,
      [product_id]
    );

    if (productResult.rows.length === 0) {
      throw new Error('Product not found or inactive');
    }

    const product = productResult.rows[0];
    if (product.quantity < qty) {
      throw new Error(`Insufficient stock. Available: ${product.quantity}`);
    }

    const unitPrice = parseFloat(product.selling_price);
    const totalAmount = unitPrice * qty;
    const paid = parseFloat(amount_paid);

    if (paid < totalAmount) {
      throw new Error(`Insufficient payment. Total: ${totalAmount.toFixed(2)}`);
    }

    const qtyAfter = product.quantity - qty;
    const receiptNumber = generateReceiptNumber();

    const saleResult = await client.query(
      `INSERT INTO sales (receipt_number, product_id, quantity, unit_price, total_amount, amount_paid, sales_agent_id, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [receiptNumber, product_id, qty, unitPrice, totalAmount, paid, user.id, user.branch_id]
    );

    await client.query('UPDATE products SET quantity = $1 WHERE id = $2', [qtyAfter, product_id]);

    await recordInventoryMovement(client, {
      productId: product_id,
      movementType: 'sale',
      quantityChange: -qty,
      quantityBefore: product.quantity,
      quantityAfter: qtyAfter,
      referenceId: saleResult.rows[0].id,
      referenceType: 'sale',
      performedBy: user.id,
      notes: `Sale ${receiptNumber}`,
    });

    await checkLowStock(client, product_id);
    await client.query('COMMIT');
    await auditLog(user.id, 'record_sale', 'sale', saleResult.rows[0].id, { receiptNumber, totalAmount });

    res.redirect(`/sales/${saleResult.rows[0].id}/receipt`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    return res.render('sales/pos', {
      title: 'New Sale',
      errors: [{ msg: err.message || 'Sale failed.' }],
      form: req.body,
    });
  } finally {
    client.release();
  }
});

router.get('/:id/receipt', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, p.name AS product_name, u.full_name AS agent_name, b.name AS branch_name
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.sales_agent_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      req.session.flash = { type: 'error', message: 'Receipt not found.' };
      return res.redirect('/sales');
    }
    res.render('sales/receipt', { title: 'Receipt', sale: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.redirect('/sales');
  }
});

router.get('/:id/receipt/pdf', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT s.*, p.name AS product_name, u.full_name AS agent_name, b.name AS branch_name
       FROM sales s
       JOIN products p ON p.id = s.product_id
       JOIN users u ON u.id = s.sales_agent_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).send('Receipt not found');
    }

    const sale = result.rows[0];
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=receipt-${sale.receipt_number}.pdf`);
    doc.pipe(res);

    doc.fontSize(18).text('Crown Stores', { align: 'center' });
    doc.fontSize(10).text(sale.branch_name, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`Receipt: ${sale.receipt_number}`);
    doc.text(`Date: ${new Date(sale.sale_date).toLocaleString()}`);
    doc.text(`Sales Agent: ${sale.agent_name}`);
    doc.moveDown();
    doc.text('─'.repeat(40));
    doc.text(`Product: ${sale.product_name}`);
    doc.text(`Quantity: ${sale.quantity}`);
    doc.text(`Unit Price: KES ${parseFloat(sale.unit_price).toFixed(2)}`);
    doc.text(`Total: KES ${parseFloat(sale.total_amount).toFixed(2)}`);
    doc.text(`Amount Paid: KES ${parseFloat(sale.amount_paid).toFixed(2)}`);
    doc.text(`Change: KES ${(parseFloat(sale.amount_paid) - parseFloat(sale.total_amount)).toFixed(2)}`);
    doc.moveDown();
    doc.text('─'.repeat(40));
    doc.text('Thank you for shopping at Crown Stores!', { align: 'center' });
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to generate PDF');
  }
});

module.exports = router;
