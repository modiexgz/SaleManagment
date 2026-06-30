const bcrypt = require('bcryptjs');

const ROLES = {
  DIRECTOR: 'director',
  MANAGER: 'manager',
  SALES_AGENT: 'sales_agent',
};

function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      req.session.flash = { type: 'error', message: 'You do not have permission to access this page.' };
      return res.redirect('/dashboard');
    }
    next();
  };
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  next();
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function auditLog(userId, action, entityType, entityId, details) {
  const db = require('../config/database');
  return db.query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, action, entityType, entityId, details ? JSON.stringify(details) : null]
  );
}

async function recordInventoryMovement(client, {
  productId, movementType, quantityChange, quantityBefore, quantityAfter,
  referenceId, referenceType, performedBy, notes,
}) {
  await client.query(
    `INSERT INTO inventory_movements
     (product_id, movement_type, quantity_change, quantity_before, quantity_after,
      reference_id, reference_type, performed_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [productId, movementType, quantityChange, quantityBefore, quantityAfter,
      referenceId, referenceType, performedBy, notes]
  );
}

async function checkLowStock(client, productId) {
  const result = await client.query(
    `SELECT p.id, p.name, p.quantity, p.reorder_level
     FROM products p WHERE p.id = $1`,
    [productId]
  );
  if (result.rows.length === 0) return;

  const product = result.rows[0];
  if (product.quantity === 0) {
    await client.query(
      `INSERT INTO notifications (role_target, type, message, product_id)
       VALUES ('manager', 'out_of_stock', $1, $2)`,
      [`Out of stock: ${product.name}`, product.id]
    );
  } else if (product.quantity <= product.reorder_level) {
    await client.query(
      `INSERT INTO notifications (role_target, type, message, product_id)
       VALUES ('manager', 'low_stock', $1, $2)`,
      [`Low stock alert: ${product.name} (${product.quantity} remaining, reorder level: ${product.reorder_level})`, product.id]
    );
  }
}

function generateReceiptNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const rand = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `RCP-${date}-${time}-${rand}`;
}

module.exports = {
  ROLES,
  requireAuth,
  requireRole,
  redirectIfAuthenticated,
  hashPassword,
  comparePassword,
  auditLog,
  recordInventoryMovement,
  checkLowStock,
  generateReceiptNumber,
};
