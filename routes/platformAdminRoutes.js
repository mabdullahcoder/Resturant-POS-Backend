/**
 * Platform Admin Routes
 * Entirely restricted to the platform-wide super-admin role.
 */
const express = require('express');
const router = express.Router();
const PlatformAdminController = require('../controllers/PlatformAdminController');
const authMiddleware = require('../middlewares/authMiddleware');
const authorizeRoles = require('../middlewares/authorizationMiddleware');

const superAdminOnly = [authMiddleware, authorizeRoles('super-admin')];

router.post('/tenants', ...superAdminOnly, (req, res, next) => PlatformAdminController.createTenant(req, res, next));
router.get('/tenants', ...superAdminOnly, (req, res, next) => PlatformAdminController.listTenants(req, res, next));
router.get('/tenants/:id', ...superAdminOnly, (req, res, next) => PlatformAdminController.getTenantDetail(req, res, next));
router.patch('/tenants/:id/status', ...superAdminOnly, (req, res, next) => PlatformAdminController.updateStatus(req, res, next));
router.patch('/tenants/:id/plan', ...superAdminOnly, (req, res, next) => PlatformAdminController.updatePlan(req, res, next));

module.exports = router;
