const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { comparePassword, hashPassword, redirectIfAuthenticated, requireAuth, auditLog } = require('../middleware/auth');

const router = express.Router();

router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('auth/login', { title: 'Login', error: null });
});

router.post('/login', redirectIfAuthenticated, [
  body('username').trim().notEmpty().withMessage('Username is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', { title: 'Login', error: errors.array()[0].msg });
  }

  try {
    const { username, password } = req.body;
    const result = await db.query(
      `SELECT u.*, b.name AS branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.username = $1 AND u.is_active = TRUE`,
      [username]
    );

    if (result.rows.length === 0) {
      return res.render('auth/login', { title: 'Login', error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.render('auth/login', { title: 'Login', error: 'Invalid username or password.' });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      branch_id: user.branch_id,
      branch_name: user.branch_name,
    };

    await auditLog(user.id, 'login', 'user', user.id, { username });
    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    res.render('auth/login', { title: 'Login', error: 'An error occurred. Please try again.' });
  }
});

router.get('/logout', requireAuth, async (req, res) => {
  const userId = req.session.user.id;
  await auditLog(userId, 'logout', 'user', userId);
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

router.get('/password-reset', redirectIfAuthenticated, (req, res) => {
  res.render('auth/password-reset', { title: 'Password Reset', message: null, error: null });
});

router.post('/password-reset', redirectIfAuthenticated, [
  body('username').trim().notEmpty(),
  body('new_password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirm_password').custom((val, { req }) => val === req.body.new_password).withMessage('Passwords do not match'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/password-reset', {
      title: 'Password Reset',
      message: null,
      error: errors.array()[0].msg,
    });
  }

  try {
    const { username, new_password } = req.body;
    const result = await db.query('SELECT id FROM users WHERE username = $1 AND is_active = TRUE', [username]);
    if (result.rows.length === 0) {
      return res.render('auth/password-reset', {
        title: 'Password Reset',
        message: null,
        error: 'User not found.',
      });
    }

    const hash = await hashPassword(new_password);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, result.rows[0].id]);
    await auditLog(result.rows[0].id, 'password_reset', 'user', result.rows[0].id);

    res.render('auth/password-reset', {
      title: 'Password Reset',
      message: 'Password updated successfully. You can now log in.',
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('auth/password-reset', {
      title: 'Password Reset',
      message: null,
      error: 'An error occurred. Please try again.',
    });
  }
});

module.exports = router;
