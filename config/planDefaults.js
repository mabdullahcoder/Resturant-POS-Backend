/**
 * Default resource limits per subscription plan tier.
 * Used to seed a new Tenant's `limits` field; a super-admin can override
 * individual limits per tenant afterwards (see PlatformAdminService.updateTenantPlan).
 */
const PLAN_LIMITS = {
    free: {
        maxMenuItems: 20,
        maxStaffSeats: 2,
        maxOrdersPerMonth: 200,
    },
    starter: {
        maxMenuItems: 100,
        maxStaffSeats: 5,
        maxOrdersPerMonth: 2000,
    },
    pro: {
        maxMenuItems: 1000,
        maxStaffSeats: 25,
        maxOrdersPerMonth: 100000,
    },
};

module.exports = { PLAN_LIMITS };
