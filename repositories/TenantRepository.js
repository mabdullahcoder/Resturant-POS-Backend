/**
 * Tenant Repository
 * NOTE: Tenant is not itself tenant-scoped (it IS the tenant), so these
 * methods query the model directly with no auto-injected filter.
 */
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const { runAsSuperAdmin } = require('../utils/tenantContext');

class TenantRepository {
    async create(data) {
        return Tenant.create(data);
    }

    async findById(id) {
        return Tenant.findById(id);
    }

    async findBySubdomain(subdomain) {
        return Tenant.findOne({ subdomain });
    }

    async findAll({ status = null, search = null } = {}, page = 1, limit = 20) {
        const query = {};
        if (status) query.status = status;
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { subdomain: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (page - 1) * limit;
        const [tenants, total] = await Promise.all([
            Tenant.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Tenant.countDocuments(query),
        ]);

        return {
            tenants,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        };
    }

    async updateStatus(id, status) {
        return Tenant.findByIdAndUpdate(id, { status }, { new: true });
    }

    async updatePlan(id, plan, limits) {
        const update = { plan };
        if (limits) update.limits = limits;
        return Tenant.findByIdAndUpdate(id, update, { new: true });
    }

    async updateBranding(id, branding) {
        return Tenant.findByIdAndUpdate(id, { branding }, { new: true, runValidators: true });
    }

    /**
     * Cross-tenant metrics for the super-admin console.
     * Explicitly bypasses tenant scoping since this reads across the whole platform.
     */
    async getMetrics(tenantId) {
        return runAsSuperAdmin(async () => {
            const tid = new mongoose.Types.ObjectId(tenantId);
            const [orderCount, revenueAgg, userCount, menuItemCount] = await Promise.all([
                Order.countDocuments({ tenantId: tid }),
                Order.aggregate([
                    { $match: { tenantId: tid, paymentStatus: 'completed' } },
                    { $group: { _id: null, total: { $sum: '$totalAmount' } } },
                ]),
                User.countDocuments({ tenantId: tid, role: 'user' }),
                MenuItem.countDocuments({ tenantId: tid }),
            ]);
            return {
                orderCount,
                revenue: revenueAgg[0]?.total ?? 0,
                userCount,
                menuItemCount,
            };
        });
    }
}

module.exports = new TenantRepository();
