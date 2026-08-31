/**
 * Mongoose plugin: automatically scopes every query to the current tenant
 * (read from AsyncLocalStorage via tenantContext) and auto-stamps new
 * documents with the current tenantId.
 *
 * Why a plugin instead of editing every repository method: the repositories
 * have no shared base class or query builder, so intercepting at the schema
 * level is the only way to cover all ~40 existing query methods without
 * touching each one by hand.
 *
 * Outside a request (cron jobs, one-off scripts under server/scripts/*.js)
 * there is no AsyncLocalStorage store, so getTenantId() returns undefined
 * and queries run unscoped by design. Any new cross-tenant admin code path
 * must explicitly opt in via tenantContext.runAsSuperAdmin(...).
 */
const mongoose = require('mongoose');
const { getTenantId, isBypassed } = require('../utils/tenantContext');

const QUERY_HOOKS = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'findOneAndDelete',
    'findOneAndRemove',
    'count',
    'countDocuments',
    'updateMany',
    'updateOne',
    'deleteMany',
    'deleteOne',
];

module.exports = function tenantScopePlugin(schema, options = {}) {
    const field = options.field || 'tenantId';

    // Auto-stamp tenantId on newly created documents (covers Model.create/doc.save)
    schema.pre('validate', function (next) {
        if (this.isNew && this[field] == null) {
            const tid = getTenantId();
            if (tid) this[field] = tid;
        }
        next();
    });

    // Auto-stamp on insertMany when callers don't set it explicitly
    schema.pre('insertMany', function (next, docs) {
        const tid = getTenantId();
        if (tid && Array.isArray(docs)) {
            docs.forEach((doc) => {
                if (doc[field] == null) doc[field] = tid;
            });
        }
        next();
    });

    QUERY_HOOKS.forEach((hook) => {
        schema.pre(hook, function (next) {
            if (isBypassed() || this.getOptions().skipTenantScope) return next();
            const tid = getTenantId();
            if (tid && this.getQuery()[field] === undefined) {
                this.where({ [field]: tid });
            }
            next();
        });
    });

    schema.pre('aggregate', function (next) {
        if (isBypassed()) return next();
        const tid = getTenantId();
        if (tid) {
            this.pipeline().unshift({ $match: { [field]: new mongoose.Types.ObjectId(tid) } });
        }
        next();
    });
};
