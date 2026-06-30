const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { requireAuth, requireRole, ROLES, auditLog } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole(ROLES.MANAGER));

router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM categories ORDER BY name ASC`
    );
    res.render('categories/index', { title: 'Categories', categories: result.rows });
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to load categories.' };
    res.redirect('/dashboard');
  }
});

router.get('/new', (req, res) => {
  res.render('categories/form', { title: 'New Category', category: null, errors: [] });
});

router.post('/', [
  body('name').trim().notEmpty().withMessage('Category name is required'),
  body('description').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('categories/form', { title: 'New Category', category: req.body, errors: errors.array() });
  }

  try {
    const { name, description } = req.body;
    await db.query(
      `INSERT INTO categories (name, description) VALUES ($1, $2)`,
      [name, description || null]
    );
    await auditLog(req.session.user.id, 'create_category', 'category', null, { name });
    req.session.flash = { type: 'success', message: 'Category created successfully.' };
    res.redirect('/categories');
  } catch (err) {
    if (err.code === '23505') {
      return res.render('categories/form', {
        title: 'New Category', category: req.body,
        errors: [{ msg: 'Category name already exists.' }],
      });
    }
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to create category.' };
    res.redirect('/categories');
  }
});

router.get('/:id/edit', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM categories WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.flash = { type: 'error', message: 'Category not found.' };
      return res.redirect('/categories');
    }
    res.render('categories/form', { title: 'Edit Category', category: result.rows[0], errors: [] });
  } catch (err) {
    console.error(err);
    res.redirect('/categories');
  }
});

router.post('/:id', [
  body('name').trim().notEmpty(),
  body('description').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('categories/form', {
      title: 'Edit Category', category: { ...req.body, id: req.params.id }, errors: errors.array(),
    });
  }

  try {
    const { name, description, status } = req.body;
    await db.query(
      `UPDATE categories SET name = $1, description = $2, status = $3 WHERE id = $4`,
      [name, description || null, status || 'active', req.params.id]
    );
    await auditLog(req.session.user.id, 'update_category', 'category', req.params.id, { name, status });
    req.session.flash = { type: 'success', message: 'Category updated successfully.' };
    res.redirect('/categories');
  } catch (err) {
    console.error(err);
    req.session.flash = { type: 'error', message: 'Failed to update category.' };
    res.redirect('/categories');
  }
});

router.post('/:id/toggle', async (req, res) => {
  try {
    const result = await db.query('SELECT status FROM categories WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      req.session.flash = { type: 'error', message: 'Category not found.' };
      return res.redirect('/categories');
    }
    const newStatus = result.rows[0].status === 'active' ? 'inactive' : 'active';
    await db.query('UPDATE categories SET status = $1 WHERE id = $2', [newStatus, req.params.id]);
    req.session.flash = { type: 'success', message: `Category ${newStatus === 'active' ? 'activated' : 'deactivated'}.` };
    res.redirect('/categories');
  } catch (err) {
    console.error(err);
    res.redirect('/categories');
  }
});

module.exports = router;
