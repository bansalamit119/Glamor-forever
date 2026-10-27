// Glamour Forever - Employee Document Management Portal (demo MVP)
require('dotenv').config({ quiet: true });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieSession = require('cookie-session');
const expressLayouts = require('express-ejs-layouts');
const helpers = require('./helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
  console.error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env (see .env.example).');
  process.exit(1);
}
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('SESSION_SECRET must be set in production.');
  process.exit(1);
}

// Hosts like Render sit behind an HTTPS proxy; needed for secure cookies.
app.set('trust proxy', 1);

// ---- Views ----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.disable('x-powered-by');

// ---- Basic security headers ----
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    // Keep the whole portal (and especially employee documents) out of search engines.
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  });
  next();
});

app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

// Static assets only. NOTE: /uploads is deliberately NOT served statically -
// documents are served through authenticated routes in routes/employees.js.
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

// ---- Sessions ----
// Signed cookie sessions: the tiny session (admin email + flash message) lives in
// a tamper-proof cookie, so logins survive server restarts / free-tier sleep.
app.use(cookieSession({
  name: 'gf.sid',
  keys: [process.env.SESSION_SECRET || 'dev-only-secret'],
  httpOnly: true,
  sameSite: 'lax', // blocks cross-site form POSTs from carrying the session cookie
  secure: isProduction, // HTTPS only when hosted
  maxAge: 8 * 60 * 60 * 1000, // 8 hours
}));

// ---- Template locals + flash messages ----
app.use((req, res, next) => {
  res.locals.h = helpers;
  res.locals.currentPath = req.path;
  res.locals.adminEmail = req.session.adminEmail || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

// ---- Authentication ----
// DEMO ONLY - NOT PRODUCTION-READY.
// A single admin account whose credentials come from environment variables.
// There are no users table, roles, password reset, rate limiting or MFA.
// Replace with proper user accounts + hashed passwords before real use.
function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest();
}

function credentialsMatch(email, password) {
  // Compare hashes with timingSafeEqual to avoid leaking info via timing.
  const emailOk = crypto.timingSafeEqual(hash(String(email).toLowerCase().trim()), hash(process.env.ADMIN_EMAIL.toLowerCase()));
  const passwordOk = crypto.timingSafeEqual(hash(password), hash(process.env.ADMIN_PASSWORD));
  return emailOk && passwordOk;
}

app.get('/login', (req, res) => {
  if (req.session.adminEmail) return res.redirect('/dashboard');
  res.render('login', { layout: false, email: '', error: null });
});

app.post('/login', (req, res) => {
  const body = req.body || {};
  const email = body.email || '';
  const password = body.password || '';
  if (!credentialsMatch(email, password)) {
    return res.status(401).render('login', { layout: false, email, error: 'Invalid email or password.' });
  }
  req.session.adminEmail = process.env.ADMIN_EMAIL;
  res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

// Everything below requires a signed-in admin.
app.use((req, res, next) => {
  if (!req.session.adminEmail) return res.redirect('/login');
  next();
});

// ---- Routes ----
app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/employees', require('./routes/employees'));
app.use('/branches', require('./routes/branches'));

// ---- 404 + error handling ----
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred. Please try again.',
  });
});

app.listen(PORT, () => {
  console.log(`Glamour Forever portal running at http://localhost:${PORT}`);
});
