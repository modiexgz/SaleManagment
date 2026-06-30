require('dotenv').config();
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const methodOverride = require('method-override');
const path = require('path');
const { pool } = require('./config/database');
const localsMiddleware = require('./middleware/locals');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_TIMEOUT = (parseInt(process.env.SESSION_TIMEOUT_MINUTES || '30', 10)) * 60 * 1000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'csrms-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: SESSION_TIMEOUT,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  },
  rolling: true,
}));

app.use(localsMiddleware);

app.use((req, res, next) => {
  if (req.session.user) {
    const now = Date.now();
    if (req.session.lastActivity && now - req.session.lastActivity > SESSION_TIMEOUT) {
      req.session.destroy(() => res.redirect('/login'));
      return;
    }
    req.session.lastActivity = now;
  }
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.redirect('/login');
});

app.use('/', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/categories', require('./routes/categories'));
app.use('/products', require('./routes/products'));
app.use('/procurement', require('./routes/procurement'));
app.use('/inventory', require('./routes/inventory'));
app.use('/sales', require('./routes/sales'));
app.use('/cashier', require('./routes/cashier'));
app.use('/reports', require('./routes/reports'));
app.use('/notifications', require('./routes/notifications'));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found', message: 'Page not found.', status: 404 });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Error', message: 'An unexpected error occurred.', status: 500 });
});

app.listen(PORT, () => {
  console.log(`CSRMS running at http://localhost:${PORT}`);
});
