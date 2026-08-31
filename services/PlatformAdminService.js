/**
 * Platform Admin Service
 * Cross-tenant management for platform super-admins: list/view/suspend/activate
 * tenants and adjust their plan/limits. All reads here are intentionally
 * cross-tenant (there's no single tenant context for a super-admin request).
 */
const TenantRepository = require('../repositories/TenantRepository');
const TenantService = require('./TenantService');
const { PLAN_LIMITS } = require('../config/planDefaults');

class PlatformAdminService {
    /**
     * Create a new restaurant (tenant) and its admin account. There is no
     * public self-signup — only a platform super-admin can onboard a new
     * restaurant; that restaurant's admin then only ever signs in.
     */
    async createTenant(payload) {
        return TenantService.registerTenant(payload);
    }

    async listTenants(filters, page, limit) {
        return TenantRepository.findAll(filters, page, limit);
    }

    async getTenantDetail(id) {
        const tenant = await TenantRepository.findById(id);
        if (!tenant) {
            throw { status: 404, message: 'Tenant not found' };
        }
        const metrics = await TenantRepository.getMetrics(id);
        return { tenant, metrics };
    }

    async suspendTenant(id) {
        const tenant = await TenantRepository.updateStatus(id, 'suspended');
        if (!tenant) throw { status: 404, message: 'Tenant not found' };
        return tenant;
    }

    async activateTenant(id) {
        const tenant = await TenantRepository.updateStatus(id, 'active');
        if (!tenant) throw { status: 404, message: 'Tenant not found' };
        return tenant;
    }

    async updateTenantPlan(id, plan, limitOverrides) {
        if (!PLAN_LIMITS[plan]) {
            throw { status: 400, message: `Invalid plan: ${plan}` };
        }
        const limits = { ...PLAN_LIMITS[plan], ...(limitOverrides || {}) };
        const tenant = await TenantRepository.updatePlan(id, plan, limits);
        if (!tenant) throw { status: 404, message: 'Tenant not found' };
        return tenant;
    }
}

module.exports = new PlatformAdminService();
