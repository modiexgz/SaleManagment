const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireAuth, requireRole, ROLES, auditLog } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.MANAGER));

router.get('/', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const [agents, balances] = await Promise.all([
      db.query(
        `SELECT u.id, u.full_name,
                COALESCE(SUM(s.total_amount), 0) AS total_sales,
                COUNT(s.id) AS transaction_count
         FROM users u
         LEFT JOIN sales s ON s.sales_agent_id = u.id AND s.sale_date::date = $1::date
         WHERE u.role = 'sales_agent' AND u.is_active = TRUE
         GROUP BY u.id, u.full_name
         ORDER BY u.full_name`,
        [date]
      ),
      db.query(
        `SELECT cb.*, u.full_name AS agent_name, a.full_name AS approved_by_name
         FROM cashier_balancing cb
         JOIN users u ON u.id = cb.sales_agent_id
         LEFT JOIN users a ON a.id = cb.approved_by
         WHERE cb.balance_date = $1::date
         ORDER BY u.full_name`,
        [date]
      ),
    ]);

    res.render('cashier/index', {
      title: 'Cashier Balancing',
      date,
      agents: agents.rows,
      balances: balances.rows,
    });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load cashier balancing.' };
    res.redirect('/dashboard');
  }
});

router.post('/submit', [
  body('sales_agent_id').isInt(),
  body('cash_collected').isFloat({ min: 0 }),
  body('balance_date').optional().isDate(),
  body('notes').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.flash = { type: 'error', message: errors.array()[0].msg };
    return res.redirect('/cashier');
  }

  try {
    const { sales_agent_id, cash_collected, balance_date, notes } = req.body;
    const date = balance_date || new Date().toISOString().slice(0, 10);

    const salesResult = await db.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales
       WHERE sales_agent_id = $1 AND sale_date::date = $2::date`,
      [sales_agent_id, date]
    );

    const totalSales = parseFloat(salesResult.rows[0].total);
    const cash = parseFloat(cash_collected);
    const variance = cash - totalSales;

    await db.query(
      `INSERT INTO cashier_balancing (sales_agent_id, balance_date, total_sales, cash_collected, variance, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sales_agent_id, balance_date)
       DO UPDATE SET cash_collected = $4, variance = $5, notes = $6, status = 'pending'`,
      [sales_agent_id, date, totalSales, cash, variance, notes || null]
    );

    req.session.flash = { type: 'success', message: 'Cash submission recorded.' };
    res.redirect(`/cashier?date=${date}`);
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to submit cash.' };
    res.redirect('/cashier');
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE cashier_balancing SET status = 'approved', approved_by = $1
       WHERE id = $2 RETURNING *`,
      [req.session.user.id, req.params.id]
    );
    if (result.rows.length === 0) {
      req.session.flash = { type: 'error', message: 'Balance record not found.' };
    } else {
      await auditLog(req.session.user.id, 'approve_cashier_balance', 'cashier_balancing', req.params.id);
      req.session.flash = { type: 'success', message: 'Daily balance approved.' };
    }
    res.redirect(`/cashier?date=${result.rows[0]?.balance_date || new Date().toISOString().slice(0, 10)}`);
  } catch (err) {
    console.error(err);
    res.redirect('/cashier');
  }
});

module.exports = router;
