const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const { requireAuth, requireRole, ROLES } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
  const role = req.session.user.role;
  if (role === ROLES.SALES_AGENT) {
    req.session.flash = { type: 'error', message: 'You do not have access to reports.' };
    return res.redirect('/dashboard');
  }

  res.render('reports/index', { title: 'Reports', role });
});

router.get('/daily-sales', requireRole(ROLES.MANAGER, ROLES.DIRECTOR), async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const format = req.query.format;

  try {
    const result = await db.query(
      `SELECT p.name AS product_name, SUM(s.quantity) AS qty_sold,
              SUM(s.total_amount) AS revenue
       FROM sales s JOIN products p ON p.id = s.product_id
       WHERE s.sale_date::date = $1::date
       GROUP BY p.id, p.name ORDER BY revenue DESC`,
      [date]
    );

    const total = result.rows.reduce((sum, r) => sum + parseFloat(r.revenue), 0);

    if (format === 'pdf') {
      return generatePdf(res, `Daily Sales Report - ${date}`, [
        ['Product', 'Qty Sold', 'Revenue (KES)'],
        ...result.rows.map((r) => [r.product_name, r.qty_sold, parseFloat(r.revenue).toFixed(2)]),
        ['TOTAL', '', total.toFixed(2)],
      ], `daily-sales-${date}.pdf`);
    }

    res.render('reports/daily-sales', {
      title: 'Daily Sales Report', date, rows: result.rows, total,
    });
  } catch (err) {
    console.error(err);
    res.redirect('/reports');
  }
});

router.get('/inventory', requireRole(ROLES.MANAGER, ROLES.DIRECTOR), async (req, res) => {
  const format = req.query.format;
  try {
    const result = await db.query(
      `SELECT p.name, c.name AS category, p.quantity, p.reorder_level,
              p.cost_price, (p.quantity * p.cost_price) AS value,
              CASE WHEN p.quantity = 0 THEN 'Out of Stock'
                   WHEN p.quantity <= p.reorder_level THEN 'Low Stock'
                   ELSE 'In Stock' END AS status
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.status = 'active' ORDER BY p.quantity ASC`
    );

    if (format === 'pdf') {
      return generatePdf(res, 'Inventory Report', [
        ['Product', 'Category', 'Qty', 'Reorder', 'Status', 'Value (KES)'],
        ...result.rows.map((r) => [
          r.name, r.category, r.quantity, r.reorder_level, r.status,
          parseFloat(r.value).toFixed(2),
        ]),
      ], 'inventory-report.pdf');
    }

    res.render('reports/inventory', { title: 'Inventory Report', rows: result.rows });
  } catch (err) {
    console.error(err);
    res.redirect('/reports');
  }
});

router.get('/procurement', requireRole(ROLES.MANAGER, ROLES.DIRECTOR), async (req, res) => {
  const format = req.query.format;
  try {
    const result = await db.query(
      `SELECT pr.received_date, p.name AS product_name, pr.supplier_name,
              pr.quantity_received, pr.cost_price,
              (pr.quantity_received * pr.cost_price) AS total_value
       FROM procurements pr JOIN products p ON p.id = pr.product_id
       ORDER BY pr.received_date DESC LIMIT 200`
    );

    if (format === 'pdf') {
      return generatePdf(res, 'Procurement Report', [
        ['Date', 'Product', 'Supplier', 'Qty', 'Cost', 'Total (KES)'],
        ...result.rows.map((r) => [
          new Date(r.received_date).toLocaleDateString(), r.product_name, r.supplier_name,
          r.quantity_received, parseFloat(r.cost_price).toFixed(2),
          parseFloat(r.total_value).toFixed(2),
        ]),
      ], 'procurement-report.pdf');
    }

    res.render('reports/procurement', { title: 'Procurement Report', rows: result.rows });
  } catch (err) {
    console.error(err);
    res.redirect('/reports');
  }
});

router.get('/cashier', requireRole(ROLES.MANAGER), async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const format = req.query.format;
  try {
    const result = await db.query(
      `SELECT cb.*, u.full_name AS agent_name
       FROM cashier_balancing cb JOIN users u ON u.id = cb.sales_agent_id
       WHERE cb.balance_date = $1::date`,
      [date]
    );

    if (format === 'pdf') {
      return generatePdf(res, `Cashier Balancing - ${date}`, [
        ['Cashier', 'Total Sales', 'Cash Collected', 'Variance', 'Status'],
        ...result.rows.map((r) => [
          r.agent_name, parseFloat(r.total_sales).toFixed(2),
          parseFloat(r.cash_collected).toFixed(2), parseFloat(r.variance).toFixed(2), r.status,
        ]),
      ], `cashier-report-${date}.pdf`);
    }

    res.render('reports/cashier', { title: 'Cashier Balancing Report', date, rows: result.rows });
  } catch (err) {
    console.error(err);
    res.redirect('/reports');
  }
});

router.get('/performance', requireRole(ROLES.DIRECTOR), async (req, res) => {
  const format = req.query.format;
  try {
    const [sales, inventory, procurement, topCategories, topProducts] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales`),
      db.query(`SELECT COALESCE(SUM(quantity * cost_price), 0) AS total FROM products WHERE status = 'active'`),
      db.query(`SELECT COALESCE(SUM(quantity_received * cost_price), 0) AS total FROM procurements`),
      db.query(`
        SELECT c.name, COALESCE(SUM(s.total_amount), 0) AS revenue
        FROM categories c JOIN products p ON p.category_id = c.id
        LEFT JOIN sales s ON s.product_id = p.id
        GROUP BY c.id ORDER BY revenue DESC LIMIT 10
      `),
      db.query(`
        SELECT p.name, COALESCE(SUM(s.quantity), 0) AS qty, COALESCE(SUM(s.total_amount), 0) AS revenue
        FROM products p LEFT JOIN sales s ON s.product_id = p.id
        GROUP BY p.id ORDER BY revenue DESC LIMIT 10
      `),
    ]);

    const data = {
      totalSales: parseFloat(sales.rows[0].total),
      inventoryValue: parseFloat(inventory.rows[0].total),
      procurementValue: parseFloat(procurement.rows[0].total),
      topCategories: topCategories.rows,
      topProducts: topProducts.rows,
    };

    if (format === 'pdf') {
      const rows = [
        ['Metric', 'Value (KES)'],
        ['Total Sales', data.totalSales.toFixed(2)],
        ['Inventory Value', data.inventoryValue.toFixed(2)],
        ['Procurement Value', data.procurementValue.toFixed(2)],
        [],
        ['Top Categories', 'Revenue (KES)'],
        ...data.topCategories.map((c) => [c.name, parseFloat(c.revenue).toFixed(2)]),
        [],
        ['Top Products', 'Revenue (KES)'],
        ...data.topProducts.map((p) => [p.name, parseFloat(p.revenue).toFixed(2)]),
      ];
      return generatePdf(res, 'Company Performance Report', rows, 'performance-report.pdf');
    }

    res.render('reports/performance', { title: 'Company Performance', ...data });
  } catch (err) {
    console.error(err);
    res.redirect('/reports');
  }
});

function generatePdf(res, title, rows, filename) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  doc.pipe(res);

  doc.fontSize(16).text('Crown Stores - CSRMS', { align: 'center' });
  doc.fontSize(12).text(title, { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();

  rows.forEach((row) => {
    if (!row || row.length === 0) {
      doc.moveDown(0.5);
      return;
    }
    doc.text(row.join('  |  '));
  });

  doc.end();
}

module.exports = router;
