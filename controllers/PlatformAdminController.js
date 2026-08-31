/**
 * Platform Admin Controller
 * Endpoints for the platform super-admin console (cross-tenant management).
 */
const PlatformAdminService = require('../services/PlatformAdminService');
const AdminLog = require('../models/AdminLog');
const { sendSuccess } = require('../utils/responseFormatter');

class PlatformAdminController {
    async createTenant(req, res, next) {
        try {
            const { tenant, user } = await PlatformAdminService.createTenant(req.body);

            await AdminLog.create({
                adminId: req.user.id,
                action: 'admin_created',
                actionDescription: `Restaurant "${tenant.name}" (${tenant.subdomain}) created with admin ${user.email}`,
                targetResourceId: tenant.id,
                resourceType: 'SystemSettings',
            }).catch(() => {});

            return sendSuccess(res, 201, 'Restaurant created successfully', { tenant, user });
        } catch (err) {
            return next(err);
        }
    }

    async listTenants(req, res, next) {
        try {
            const { page = 1, limit = 20, status = null, search = null } = req.query;
            const result = await PlatformAdminService.listTenants(
                { status, search },
                parseInt(page),
                Math.min(parseInt(limit), 100)
            );
            return sendSuccess(res, 200, 'Tenants retrieved', result.tenants, result.pagination);
        } catch (err) {
            return next(err);
        }
    }

    async getTenantDetail(req, res, next) {
        try {
            const result = await PlatformAdminService.getTenantDetail(req.params.id);
            return sendSuccess(res, 200, 'Tenant detail retrieved', result);
        } catch (err) {
            return next(err);
        }
    }

    async updateStatus(req, res, next) {
        try {
            const { status } = req.body;
            if (!['active', 'suspended'].includes(status)) {
                return res.status(400).json({ success: false, message: 'Status must be "active" or "suspended"' });
            }
            const tenant = status === 'suspended'
                ? await PlatformAdminService.suspendTenant(req.params.id)
                : await PlatformAdminService.activateTenant(req.params.id);

            await AdminLog.create({
                adminId: req.user.id,
                action: 'settings_updated',
                actionDescription: `Tenant ${tenant.subdomain} status set to ${status}`,
                targetResourceId: tenant._id,
                resourceType: 'SystemSettings',
            }).catch(() => {});

            return sendSuccess(res, 200, 'Tenant status updated', tenant);
        } catch (err) {
            return next(err);
        }
    }

    async updatePlan(req, res, next) {
        try {
            const { plan, limits } = req.body;
            const tenant = await PlatformAdminService.updateTenantPlan(req.params.id, plan, limits);

            await AdminLog.create({
                adminId: req.user.id,
                action: 'settings_updated',
                actionDescription: `Tenant ${tenant.subdomain} plan set to ${plan}`,
                targetResourceId: tenant._id,
                resourceType: 'SystemSettings',
            }).catch(() => {});

            return sendSuccess(res, 200, 'Tenant plan updated', tenant);
        } catch (err) {
            return next(err);
        }
    }
}

module.exports = new PlatformAdminController();
