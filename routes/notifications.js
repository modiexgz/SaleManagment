const express = require('express');
const db = require('../config/database');
const { requireAuth, requireRole, ROLES } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.MANAGER));

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT n.*, p.name AS product_name
       FROM notifications n
       LEFT JOIN products p ON p.id = n.product_id
       WHERE n.role_target = 'manager' OR n.user_id = $1
       ORDER BY n.is_read ASC, n.created_at DESC
       LIMIT 50`,
      [req.session.user.id]
    );
    res.render('notifications/index', { title: 'Notifications', notifications: result.rows });
  } catch (err) {
    console.error(err);
    res.redirect('/dashboard');
  }
});

router.post('/:id/read', async (req, res) => {
  await db.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [req.params.id]);
  res.redirect('/notifications');
});

router.post('/read-all', async (req, res) => {
  await db.query(
    `UPDATE notifications SET is_read = TRUE
     WHERE role_target = 'manager' OR user_id = $1`,
    [req.session.user.id]
  );
  res.redirect('/notifications');
});

module.exports = router;
