/**
 * Request-scoped tenant context, backed by Node's built-in AsyncLocalStorage.
 * Set once per request by tenantMiddleware; read anywhere downstream
 * (repositories, services, the tenantScopePlugin) without threading a
 * tenantId parameter through every function call.
 */
const { AsyncLocalStorage } = require('async_hooks');

const als = new AsyncLocalStorage();

/**
 * Run `fn` with the given tenantId bound to the async context.
 * Pass `null` for platform-level requests (no tenant resolved, e.g. a
 * super-admin console request or the platform apex domain).
 */
function runWithTenant(tenantId, fn) {
    return als.run({ tenantId: tenantId ? String(tenantId) : null, bypass: false }, fn);
}

/**
 * Explicit escape hatch for intentional cross-tenant reads/writes
 * (e.g. platform-admin metrics aggregation, tenant lookup itself).
 */
function runAsSuperAdmin(fn) {
    return als.run({ tenantId: null, bypass: true }, fn);
}

function getTenantId() {
    return als.getStore()?.tenantId ?? undefined;
}

function isBypassed() {
    return als.getStore()?.bypass === true;
}

module.exports = { runWithTenant, runAsSuperAdmin, getTenantId, isBypassed };
