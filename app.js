/**
 * Main Application File
 * Entry point for the Express server
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const connectDB = require('./config/database');
const errorHandler = require('./middlewares/errorHandler');
const { logActivity } = require('./middlewares/loggerMiddleware');
const resolveTenant = require('./middlewares/tenantMiddleware');
const logger = require('./utils/logger');

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || 'localhost';

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const menuRoutes = require('./routes/menuRoutes');
const tenantRoutes = require('./routes/tenantRoutes');
const platformAdminRoutes = require('./routes/platformAdminRoutes');

const http = require('http');
const socketIO = require('./utils/socket');

// Initialize app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
socketIO.init(server);

// Connect to database
connectDB();

// MIDDLEWARE
// Security - Configure helmet to be less restrictive for development
app.use(
    helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    })
);

// CORS - Must be before other middleware
// In production, only the platform domain and its subdomains (one per tenant) are allowed.
// In development there's no wildcard DNS for subdomains, so all origins are allowed.
const corsOriginPattern = new RegExp(
    `^https?://([a-z0-9-]+\\.)?${PLATFORM_DOMAIN.replace(/\./g, '\\.')}(:\\d+)?$`
);
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true); // same-origin / non-browser requests
            if (process.env.NODE_ENV !== 'production') return callback(null, true);
            return corsOriginPattern.test(origin) ? callback(null, true) : callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Subdomain'],
    })
);

// Handle preflight requests
app.options('*', cors());

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Resolve which tenant (restaurant) this request belongs to, from the subdomain.
// Must run before logging/routes so req.tenant and the tenant-scoping context exist everywhere downstream.
app.use(resolveTenant);

// Activity logging middleware
app.use(logActivity);

// ROUTES
app.get('/', (_req, res) => {
    res.json({
        message: 'Multi-Tenant System API',
        version: '1.0.0',
        status: 'running',
    });
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
    res.json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
    });
});

// API Routes
app.use('/api/tenant', tenantRoutes);
app.use('/api/platform-admin', platformAdminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/menu', menuRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
