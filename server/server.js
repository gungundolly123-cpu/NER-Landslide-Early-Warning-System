/**
 * NEXZORA — Backend API & Web Server
 * Integrates GIS map server, Machine Learning inference pipelines,
 * and Role-Based Access Control (RBAC) authentication system.
 */

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const config = require('./config');
const db = require('./db');

const authRouter = require('./routes/auth');
const usersRouter = require('./routes/users');
const adminRouter = require('./routes/admin');
const fieldOfficerRouter = require('./routes/fieldOfficer');
const incidentsRouter = require('./routes/incidents');
const reportsRouter = require('./routes/reports');
const roadsRouter = require('./routes/roads');
const alertsRouter = require('./routes/alerts');
const notificationsRouter = require('./routes/notifications');
const internalRouter = require('./routes/internal');
const dashboardRouter = require('./routes/dashboard');

const app = express();

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Service Worker Root Endpoint
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.sendFile(path.join(__dirname, '..', 'sw.js'));
});

// Middleware
app.use(cors({
  origin: config.APP_BASE_URL,
  credentials: true
}));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());

// Static Assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
app.use('/src', express.static(path.join(__dirname, '..', 'src')));
app.use('/outputs', express.static(path.join(__dirname, '..', 'outputs')));

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin', adminRouter);
app.use('/api/field-officer', fieldOfficerRouter);
app.use('/api/incidents', incidentsRouter);
app.use('/api/reports', incidentsRouter); // Backwards-compatible mount
app.use('/api/roads', roadsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/internal', internalRouter);
app.use('/api/dashboard', dashboardRouter);

// Healthcheck & System Status Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'NEXZORA AI Landslide Early Warning & Monitoring',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Fallback: Serve Single Page Application (index.html)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Server Unhandled Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: config.isProd ? 'Internal Server Error' : (err.message || 'Server error')
  });
});

// Start Server
if (require.main === module) {
  app.listen(config.PORT, () => {
    console.log(`\n=============================================================`);
    console.log(`   NEXZORA — AI Early Warning & Landslide Risk System`);
    console.log(`   Server actively listening on: http://localhost:${config.PORT}`);
    console.log(`   Environment: ${config.NODE_ENV}`);
    console.log(`=============================================================\n`);
  });
}

module.exports = app;
