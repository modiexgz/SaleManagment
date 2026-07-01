const express = require('express');
const db = require('../config/database');
const { requireAuth, ROLES } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  const user = req.session.user;

  try {
    if (user.role === ROLES.DIRECTOR) {
      const [sales, inventory, procurement, topCategories, topProducts] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales`),
        db.query(`SELECT COALESCE(SUM(quantity * cost_price), 0) AS total FROM products WHERE status = 'active'`),
        db.query(`SELECT COALESCE(SUM(quantity_received * cost_price), 0) AS total FROM procurements`),
        db.query(`
          SELECT c.name, COALESCE(SUM(s.total_amount), 0) AS revenue
          FROM categories c
          JOIN products p ON p.category_id = c.id
          LEFT JOIN sales s ON s.product_id = p.id
          GROUP BY c.id, c.name
          ORDER BY revenue DESC LIMIT 5
        `),
        db.query(`
          SELECT p.name, COALESCE(SUM(s.quantity), 0) AS qty, COALESCE(SUM(s.total_amount), 0) AS revenue
          FROM products p
          LEFT JOIN sales s ON s.product_id = p.id
          GROUP BY p.id, p.name
          ORDER BY revenue DESC LIMIT 5
        `),
      ]);

      return res.render('dashboard/director', {
        title: 'Director Dashboard',
        totalSales: parseFloat(sales.rows[0].total),
        inventoryValue: parseFloat(inventory.rows[0].total),
        procurementValue: parseFloat(procurement.rows[0].total),
        topCategories: topCategories.rows,
        topProducts: topProducts.rows,
      });
    }

    if (user.role === ROLES.MANAGER) {
      const [sales, inventory, lowStock, cashierSales, notifications] = await Promise.all([
        db.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE sale_date::date = CURRENT_DATE`),
        db.query(`
          SELECT COUNT(*) AS product_count,
                 COALESCE(SUM(quantity), 0) AS total_units,
                 COALESCE(SUM(quantity * cost_price), 0) AS total_value
          FROM products WHERE status = 'active'
        `),
        db.query(`
          SELECT p.name, p.quantity, p.reorder_level, c.name AS category_name
          FROM products p
          JOIN categories c ON c.id = p.category_id
          WHERE p.status = 'active' AND p.quantity <= p.reorder_level
          ORDER BY p.quantity ASC LIMIT 10
        `),
        db.query(`
          SELECT u.full_name, COALESCE(SUM(s.total_amount), 0) AS total
          FROM users u
          LEFT JOIN sales s ON s.sales_agent_id = u.id AND s.sale_date::date = CURRENT_DATE
          WHERE u.role = 'sales_agent'
          GROUP BY u.id, u.full_name
        `),
        db.query(`
          SELECT * FROM notifications
          WHERE (role_target = 'manager' OR user_id = $1) AND is_read = FALSE
          ORDER BY created_at DESC LIMIT 10
        `, [user.id]),
      ]);

      return res.render('dashboard/manager', {
        title: 'Manager Dashboard',
        todaySales: parseFloat(sales.rows[0].total),
        inventory: inventory.rows[0],
        lowStock: lowStock.rows,
        cashierSales: cashierSales.rows,
        notifications: notifications.rows,
      });
    }

    const [dailySales, recentSales] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS count
         FROM sales WHERE sales_agent_id = $1 AND sale_date::date = CURRENT_DATE`,
        [user.id]
      ),
      db.query(
        `SELECT s.*, p.name AS product_name
         FROM sales s JOIN products p ON p.id = s.product_id
         WHERE s.sales_agent_id = $1
         ORDER BY s.sale_date DESC LIMIT 5`,
        [user.id]
      ),
    ]);

    res.render('dashboard/sales-agent', {
      title: 'Sales Agent Dashboard',
      dailySales: dailySales.rows[0],
      recentSales: recentSales.rows,
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load dashboard.' };
    res.redirect('/login');
  }
});

module.exports = router;
