/**
 * Tenant Routes
 * Public: subdomain availability check, public branding lookup, logo serving.
 * Admin (tenant-scoped): update branding, upload logo.
 * NOTE: there is no public self-signup — new restaurants are created by a
 * platform super-admin (see POST /api/platform-admin/tenants). A restaurant's
 * admin account only ever signs in; it is never self-registered.
 */
const express = require('express');
const router = express.Router();
const TenantController = require('../controllers/TenantController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRoles = require('../middlewares/authorizationMiddleware');
const { uploadSingleImage } = require('../middlewares/uploadMiddleware');

const adminOnly = [authMiddleware, authorizeRoles('admin')];

/* ── Public ── */
router.get('/check-subdomain', (req, res, next) => TenantController.checkSubdomain(req, res, next));
router.get('/public', (req, res, next) => TenantController.getPublicBranding(req, res, next));
router.get('/branding/logo/:id', (req, res, next) => TenantController.getLogo(req, res, next));

/* ── Tenant admin ── */
router.put('/branding', ...adminOnly, (req, res, next) => TenantController.updateBranding(req, res, next));
router.post('/branding/logo', ...adminOnly, uploadSingleImage('logo'), (req, res, next) => TenantController.uploadLogo(req, res, next));

module.exports = router;
