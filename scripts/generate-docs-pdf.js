/**
 * Generates CSRMS System Guide PDF for store owner presentations.
 * Run: npm run docs:pdf
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const OUTPUT = path.join(__dirname, '../docs/CSRMS-System-Guide.pdf');
const MARGIN = 55;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const PRIMARY = '#1a5f4a';
const TEXT = '#2c3e50';
const MUTED = '#5d6d7e';

function ensureDocsDir() {
  const dir = path.dirname(OUTPUT);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createGuide() {
  ensureDocsDir();

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    info: {
      Title: 'Crown Stores Retail Management System - System Guide',
      Author: 'CSRMS v2.0',
      Subject: 'Presentation guide for store owners',
    },
  });

  const stream = fs.createWriteStream(OUTPUT);
  doc.pipe(stream);

  let y = MARGIN;

  function newPage() {
    doc.addPage();
    y = MARGIN;
    drawFooter();
  }

  function drawFooter() {
    const page = doc.bufferedPageRange().count;
    doc.save();
    doc.fontSize(8).fillColor(MUTED)
      .text(`Crown Stores CSRMS v2.0  |  Page ${page}`, MARGIN, 800, {
        width: CONTENT_WIDTH,
        align: 'center',
      });
    doc.restore();
  }

  function space(n = 12) {
    y += n;
    if (y > 760) newPage();
  }

  function heading(text, size = 16) {
    if (y > 700) newPage();
    doc.font('Helvetica-Bold').fontSize(size).fillColor(PRIMARY).text(text, MARGIN, y, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 8;
    doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).strokeColor(PRIMARY).lineWidth(1).stroke();
    y += 14;
  }

  function subheading(text) {
    if (y > 720) newPage();
    doc.font('Helvetica-Bold').fontSize(12).fillColor(TEXT).text(text, MARGIN, y, {
      width: CONTENT_WIDTH,
    });
    y = doc.y + 6;
  }

  function paragraph(text, opts = {}) {
    doc.font('Helvetica').fontSize(opts.size || 10.5).fillColor(opts.color || TEXT);
    const height = doc.heightOfString(text, { width: CONTENT_WIDTH, lineGap: 3 });
    if (y + height > 780) newPage();
    doc.text(text, MARGIN, y, { width: CONTENT_WIDTH, lineGap: 3, align: opts.align || 'left' });
    y = doc.y + (opts.after || 10);
  }

  function bullets(items, indent = 0) {
    items.forEach((item) => {
      const bulletText = `•  ${item}`;
      const height = doc.heightOfString(bulletText, { width: CONTENT_WIDTH - indent, lineGap: 2 });
      if (y + height > 780) newPage();
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXT)
        .text(bulletText, MARGIN + indent, y, { width: CONTENT_WIDTH - indent, lineGap: 2 });
      y = doc.y + 4;
    });
    space(6);
  }

  function numbered(items) {
    items.forEach((item, i) => {
      const line = `${i + 1}.  ${item}`;
      const height = doc.heightOfString(line, { width: CONTENT_WIDTH, lineGap: 2 });
      if (y + height > 780) newPage();
      doc.font('Helvetica').fontSize(10.5).fillColor(TEXT)
        .text(line, MARGIN, y, { width: CONTENT_WIDTH, lineGap: 2 });
      y = doc.y + 4;
    });
    space(6);
  }

  function table(headers, rows) {
    const colWidth = CONTENT_WIDTH / headers.length;
    const rowH = 22;
    if (y + rowH * (rows.length + 2) > 780) newPage();

    headers.forEach((h, i) => {
      doc.rect(MARGIN + i * colWidth, y, colWidth, rowH).fillAndStroke('#e8f5f0', '#ccc');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PRIMARY)
        .text(h, MARGIN + i * colWidth + 4, y + 6, { width: colWidth - 8 });
    });
    y += rowH;

    rows.forEach((row, ri) => {
      if (y + rowH > 780) newPage();
      row.forEach((cell, ci) => {
        if (ri % 2 === 0) doc.rect(MARGIN + ci * colWidth, y, colWidth, rowH).fill('#fafafa');
        doc.rect(MARGIN + ci * colWidth, y, colWidth, rowH).stroke('#ddd');
        doc.font('Helvetica').fontSize(8.5).fillColor(TEXT)
          .text(String(cell), MARGIN + ci * colWidth + 4, y + 6, { width: colWidth - 8 });
      });
      y += rowH;
    });
    space(10);
  }

  // ─── COVER PAGE ───
  doc.rect(0, 0, PAGE_WIDTH, 180).fill(PRIMARY);
  doc.font('Helvetica-Bold').fontSize(28).fillColor('#ffffff')
    .text('Crown Stores', MARGIN, 50, { width: CONTENT_WIDTH });
  doc.fontSize(20).text('Retail Management System', MARGIN, 88);
  doc.font('Helvetica').fontSize(12).fillColor('#d5f5e3')
    .text('System Guide & Presentation Document', MARGIN, 125);

  y = 220;
  doc.font('Helvetica-Bold').fontSize(14).fillColor(TEXT).text('CSRMS Version 2.0', MARGIN, y);
  y += 30;
  paragraph('This document explains how the Crown Stores Retail Management System works — for store owners, managers, and stakeholders. It covers business benefits, daily workflows, user roles, and a clear overview of how the technology supports your operations.');
  space(20);
  subheading('Prepared for');
  paragraph('Crown Stores — Directors, Branch Managers, and Operations Team');
  space(10);
  subheading('Document purpose');
  bullets([
    'Explain what the system does and why it matters for the business',
    'Show how each staff role uses the system day to day',
    'Describe the complete flow from stocking shelves to closing the till',
    'Provide a simple technical overview for decision-makers',
  ]);
  drawFooter();

  // ─── PAGE 2: EXECUTIVE SUMMARY ───
  newPage();
  heading('1. Executive Summary');
  paragraph('Crown Stores Retail Management System (CSRMS) is a secure, web-based platform that replaces manual record-keeping with a single digital system. Staff access it through a web browser — no special software installation is needed beyond a standard computer or tablet connected to your store network.');
  space(4);
  paragraph('The system gives you real-time visibility into stock levels, sales performance, procurement history, and cashier accountability. Every important action is recorded automatically, reducing errors and improving trust across the business.');
  subheading('Key business benefits');
  bullets([
    'Real-time inventory — always know what is in stock and what is running low',
    'Faster sales — cashiers scan barcodes and print receipts in seconds',
    'Accountability — every sale, stock change, and cash collection is tracked',
    'Better decisions — directors and managers get reports without manual spreadsheets',
    'Reduced losses — stock cannot be sold if it is not available; variances are flagged at cashier closing',
  ]);

  heading('2. Who Uses the System?');
  paragraph('CSRMS supports three user roles. Each person sees only what they need — the Director cannot accidentally change stock, and Sales Agents cannot access management reports.');
  table(
    ['Role', 'Who they are', 'Main responsibilities'],
    [
      ['Director', 'Business owner / overseer', 'View company sales, inventory value, procurement totals, and performance reports. Download PDF reports.'],
      ['Branch Manager', 'Day-to-day branch leader', 'Manage categories, products, prices, procurement, stock adjustments, cashier balancing, and branch reports.'],
      ['Sales Agent', 'Cashier / front-line staff', 'Search products, scan barcodes, process cash sales, print receipts, and view available stock.'],
    ]
  );

  heading('3. Default Login Credentials (Demo)');
  paragraph('When the system is first set up, three demo accounts are created for testing and training:');
  table(
    ['Role', 'Username', 'Password'],
    [
      ['Director', 'director', 'director123'],
      ['Branch Manager', 'manager', 'manager123'],
      ['Sales Agent', 'agent', 'agent123'],
    ]
  );
  paragraph('Important: Change these passwords before going live in production.', { color: '#c0392b' });

  // ─── PAGE 3: BUSINESS WORKFLOW ───
  newPage();
  heading('4. Complete Business Workflow');
  paragraph('This is the end-to-end process the system supports — from receiving goods to reviewing company performance:');
  numbered([
    'Manager creates product categories (e.g. Refreshments, Groceries, Dairy)',
    'Manager adds products with prices, barcodes, and reorder levels',
    'Supplier delivers goods to the branch',
    'Manager records procurement — stock increases automatically',
    'Products become available for sale on the shop floor',
    'Sales Agent searches or scans a product barcode at the till',
    'System checks stock availability before allowing the sale',
    'Customer pays cash — sale is recorded and receipt is printed',
    'Stock is reduced automatically — no manual counting needed',
    'Manager performs cashier balancing at end of day',
    'Reports are updated in real time',
    'Director reviews company performance and downloads PDF summaries',
  ]);

  heading('5. Module-by-Module Guide');
  paragraph('Each section of the system maps directly to a part of your store operations:');

  subheading('5.1 Authentication & Security');
  bullets([
    'Staff log in with a username and password',
    'Passwords are encrypted — never stored in plain text',
    'Sessions expire after 30 minutes of inactivity',
    'Each user is assigned one role that controls what they can see and do',
    'Password reset is available without administrator intervention',
  ]);

  subheading('5.2 Dashboard (Home Screen)');
  bullets([
    'Director sees: total company sales, inventory value, procurement value, top categories and products',
    'Manager sees: today\'s sales, inventory summary, low-stock alerts, cashier sales breakdown',
    'Sales Agent sees: daily sales total, quick access to new sale, recent transactions',
  ]);

  subheading('5.3 Category Management');
  bullets([
    'Organises products into groups (Refreshments, Groceries, Dairy Products, etc.)',
    'Manager can create, edit, activate, or deactivate categories',
    'A category must exist before a product can be added — enforces proper organisation',
  ]);

  subheading('5.4 Product Management');
  bullets([
    'Each product has: name, category, cost price, selling price, stock quantity, reorder level, and barcodes',
    'Managers set and update selling prices',
    'Multiple barcodes can be assigned to one product (useful for different pack sizes)',
    'Inactive products cannot be sold',
  ]);

  // ─── PAGE 4: MORE MODULES ───
  newPage();
  subheading('5.5 Procurement (Stock Receiving)');
  bullets([
    'Records goods received from suppliers: product, supplier name, quantity, cost, and date',
    'When procurement is saved, stock increases automatically: Current Stock + Quantity Received',
    'Example: 100 units in stock + 50 received = 150 units updated instantly',
    'Every procurement is linked to the manager who recorded it',
  ]);

  subheading('5.6 Inventory Management');
  bullets([
    'View all products with current stock levels and status (In Stock / Low Stock / Out of Stock)',
    'Stock increases automatically when procurement is recorded',
    'Stock decreases automatically when a sale is completed',
    'Managers can make manual adjustments (e.g. -10 for damaged goods) with a required reason',
    'Full history of every stock movement is kept for audit purposes',
  ]);

  subheading('5.7 Sales (Point of Sale)');
  bullets([
    'Sales Agent scans a barcode or searches by product name',
    'System retrieves price and checks stock before allowing the sale',
    'Cash payment is entered; system calculates total and change',
    'Sale cannot complete if stock is insufficient or payment is too low',
    'Receipt is generated immediately with receipt number, date, product details, and agent name',
  ]);

  subheading('5.8 Cashier Balancing');
  bullets([
    'At end of day, manager reviews each cashier\'s total sales',
    'Cashier submits the actual cash collected',
    'System compares sales total vs. cash collected and records any variance',
    'Manager approves the daily balance — creating accountability for cash handling',
  ]);

  subheading('5.9 Receipts');
  bullets([
    'Every completed sale produces a receipt with: receipt number, date/time, product, quantity, price, total, agent, and branch',
    'Receipts can be printed directly from the browser',
    'PDF receipts can be downloaded for records or customer copies',
  ]);

  subheading('5.10 Reports & Analytics');
  table(
    ['Report', 'Who can view', 'What it shows'],
    [
      ['Daily Sales', 'Manager, Director', 'Products sold, quantities, revenue for a selected day'],
      ['Inventory', 'Manager, Director', 'Current stock, low-stock items, out-of-stock items, total value'],
      ['Procurement', 'Manager, Director', 'Products received, suppliers, quantities, costs'],
      ['Cashier Balancing', 'Manager', 'Per-cashier sales, cash collected, variances'],
      ['Company Performance', 'Director only', 'Total sales, inventory value, procurement value, top sellers'],
    ]
  );
  paragraph('All reports can be exported as PDF for meetings, filing, or sharing with stakeholders.');

  // ─── PAGE 5: NOTIFICATIONS & RULES ───
  newPage();
  heading('6. Automatic Alerts (Notifications)');
  paragraph('The system proactively warns managers before stock problems affect customers:');
  bullets([
    'Low Stock Alert — when quantity falls at or below the reorder level (e.g. 10 units left, reorder level is 20)',
    'Out of Stock Alert — when quantity reaches zero; product becomes unavailable for sale automatically',
    'Alerts appear on the Manager dashboard and in the Notifications section',
  ]);

  heading('7. Business Rules Enforced by the System');
  paragraph('These rules are built into the software and cannot be bypassed by staff:');
  numbered([
    'A category must exist before a product can be created',
    'Every product must belong to a category',
    'A product may have one or more barcodes',
    'Only Managers can create categories, products, and update prices',
    'Only products with available stock can be sold',
    'Stock reduces automatically after every sale',
    'Sales Agents cannot modify inventory or access management reports',
    'All inventory movements are recorded in an audit log',
    'Directors can only view consolidated company information — no operational changes',
  ]);

  heading('8. How the Technology Works (Simple Overview)');
  paragraph('For stakeholders who want to understand what powers the system without technical jargon:');
  space(4);

  subheading('The three main components');
  bullets([
    'Web Application (Node.js + Express) — the brain of the system; handles login, business logic, calculations, and security',
    'Web Pages (EJS templates) — what staff see in the browser; dashboards, forms, tables, and receipts',
    'Database (PostgreSQL) — securely stores all products, sales, users, stock movements, and reports data on your laptop/server',
  ]);

  subheading('How a sale works behind the scenes');
  numbered([
    'Sales Agent submits the sale form in the browser',
    'Server verifies the user is logged in and has Sales Agent role',
    'Server checks product stock in the database (locks the record to prevent double-selling)',
    'Server calculates total, records the sale, reduces stock, and logs the inventory movement',
    'Server generates a unique receipt number and shows the receipt page',
    'If stock drops below reorder level, a notification is created for the Manager',
  ]);

  subheading('Data security features');
  bullets([
    'Encrypted passwords (bcrypt hashing)',
    'Role-based access control on every page and action',
    'Session timeout after 30 minutes',
    'Audit log records logins, stock changes, sales, and approvals',
    'Database transactions ensure stock and sales stay in sync — no partial updates',
  ]);

  // ─── PAGE 6: ARCHITECTURE & PRESENTATION TIPS ───
  newPage();
  heading('9. System Architecture');
  paragraph('The application follows a clear structure that mirrors your business modules:');
  table(
    ['Folder / Area', 'Purpose'],
    [
      ['server.js', 'Starts the application and connects all modules'],
      ['routes/', 'Handles web requests — one file per module (sales, inventory, reports, etc.)'],
      ['views/', 'HTML page templates staff see in the browser'],
      ['database/schema.sql', 'Database structure — tables for products, sales, users, etc.'],
      ['middleware/auth.js', 'Security — login checks and role permissions'],
      ['public/css/', 'Visual design and layout styling'],
    ]
  );

  heading('10. Presentation Demo Script');
  paragraph('Suggested order for demonstrating CSRMS to store owners (approx. 15–20 minutes):');
  numbered([
    'Log in as Director — show the high-level dashboard and Company Performance report',
    'Log out, log in as Manager — create a category and add a new product with barcode',
    'Record a procurement — show stock increase on the inventory screen',
    'Log in as Sales Agent — scan/search product, complete a cash sale, print receipt',
    'Return as Manager — show stock decreased, view inventory history, check low-stock alert',
    'Demonstrate cashier balancing — submit cash, show variance calculation, approve balance',
    'End as Director — download PDF performance report for the meeting',
  ]);

  heading('11. System Requirements');
  bullets([
    'Computer or server running Windows, Mac, or Linux',
    'Node.js 18 or higher installed',
    'PostgreSQL database (installed on your laptop or a dedicated server)',
    'Modern web browser (Chrome, Edge, or Firefox)',
    'Local network or internet access for staff devices',
    'Supports 500+ transactions per day with response times under 3 seconds',
  ]);

  heading('12. Getting Started (Quick Reference)');
  numbered([
    'Install Node.js and PostgreSQL on the host machine',
    'Extract the project and run: npm install',
    'Copy .env.example to .env and set the database password',
    'Run: npm run db:init (creates database, tables, and sample data)',
    'Run: npm start and open http://localhost:3000',
    'Train staff using the demo accounts, then create real user accounts',
    'Replace demo passwords before production use',
  ]);

  space(20);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PRIMARY)
    .text('— End of Document —', MARGIN, y, { width: CONTENT_WIDTH, align: 'center' });
  paragraph(`Generated: ${new Date().toLocaleDateString('en-KE', { dateStyle: 'full' })}`, {
    align: 'center',
    size: 9,
    color: MUTED,
  });

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(OUTPUT));
    stream.on('error', reject);
  });
}

createGuide()
  .then((file) => {
    console.log(`PDF created: ${file}`);
  })
  .catch((err) => {
    console.error('Failed to generate PDF:', err);
    process.exit(1);
  });
