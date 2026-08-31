/**
 * Enforces per-tenant plan limits (menu items, staff seats, monthly orders).
 * No payment processing exists — plan tier is set by a platform super-admin
 * via PlatformAdminService.updateTenantPlan; this just blocks the resource
 * once a tenant's current plan cap is hit.
 */
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const { getTenantId } = require('./tenantContext');

async function enforceLimit(kind) {
    const tenantId = getTenantId();
    if (!tenantId) return; // platform-level context (e.g. a super-admin action) — no limits apply

    const tenant = await Tenant.findById(tenantId).setOptions({ skipTenantScope: true });
    if (!tenant) return;

    let breached = false;
    let limitValue;

    if (kind === 'menuItem') {
        limitValue = tenant.limits.maxMenuItems;
        breached = (await MenuItem.countDocuments({ tenantId })) >= limitValue;
    } else if (kind === 'staffSeat') {
        limitValue = tenant.limits.maxStaffSeats;
        breached = (await User.countDocuments({ tenantId, role: 'admin' })) >= limitValue;
    } else if (kind === 'orderThisMonth') {
        limitValue = tenant.limits.maxOrdersPerMonth;
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        breached = (await Order.countDocuments({ tenantId, createdAt: { $gte: startOfMonth } })) >= limitValue;
    } else {
        throw new Error(`Unknown limit kind: ${kind}`);
    }

    if (breached) {
        const labels = {
            menuItem: `Menu item limit reached (${limitValue}) for the ${tenant.plan} plan`,
            staffSeat: `Staff seat limit reached (${limitValue}) for the ${tenant.plan} plan`,
            orderThisMonth: `Monthly order limit reached (${limitValue}) for the ${tenant.plan} plan`,
        };
        throw { status: 402, message: `${labels[kind]}. Upgrade your plan or contact support.` };
    }
}

module.exports = { enforceLimit };
