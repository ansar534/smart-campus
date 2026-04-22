const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Simple request logger
app.use((req, _res, next) => {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use(
  session({
    name: 'scems.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
      sameSite: 'lax',
    },
  })
);

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/events', require('./routes/events'));
app.use('/api/registrations', require('./routes/registrations'));
app.use('/api/attendance', require('./routes/attendance'));
app.use('/api/admin', require('./routes/admin'));

// Static frontend — disable browser caching so HTML/JS edits show up immediately
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use((req, res, next) => {
  if (/\.(html|js|css)$/i.test(req.path)) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(frontendDir));

// Root -> login page
app.get('/', (_req, res) => {
  res.redirect('/pages/login.html');
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  res
    .status(err.status || 500)
    .json({ message: err.publicMessage || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[scems] Server running at http://localhost:${PORT}`);
  console.log(`[scems] Open http://localhost:${PORT}/pages/login.html`);
});
