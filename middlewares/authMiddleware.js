/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user to request
 * SENIOR FIX: Added role validation and debug logging
 */

const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided',
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Validate required fields in token
        if (!decoded.id || !decoded.role || !decoded.email) {
            logger.error('Invalid token payload:', { decoded });
            return res.status(401).json({
                success: false,
                message: 'Invalid token payload',
            });
        }

        // Validate role is a valid enum value
        const validRoles = ['user', 'admin', 'super-admin'];
        if (!validRoles.includes(decoded.role)) {
            logger.error(`Invalid role in token: ${decoded.role}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid user role',
            });
        }

        // Cross-check the token's tenant claim against the tenant resolved from
        // the subdomain (set by tenantMiddleware, which runs before every route).
        if (decoded.role === 'super-admin') {
            if (decoded.tenantId) {
                logger.error('Super-admin token unexpectedly carries a tenantId');
                return res.status(401).json({ success: false, message: 'Invalid token' });
            }
        } else if (!decoded.tenantId) {
            // Legacy token issued before multi-tenancy — only honor it on the
            // "default" tenant (the pre-existing restaurant), so existing
            // logged-in users aren't forced to re-login the moment this ships.
            if (!req.tenant || req.tenant.subdomain !== 'default') {
                return res.status(401).json({ success: false, message: 'Session outdated, please log in again' });
            }
        } else if (!req.tenant || String(req.tenant._id) !== String(decoded.tenantId)) {
            return res.status(403).json({ success: false, message: 'This session does not belong to this restaurant' });
        }

        req.user = decoded;
        logger.debug(`Auth middleware verified user: ${decoded.id} with role: ${decoded.role}`);
        next();
    } catch (error) {
        logger.error(`Auth middleware error: ${error.message}`);
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token',
            error: error.message,
        });
    }
};

module.exports = authMiddleware;
