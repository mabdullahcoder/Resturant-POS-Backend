/**
 * Tenant Service
 * Handles restaurant self-signup/onboarding and public branding lookup.
 */
const mongoose = require('mongoose');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const MenuCategory = require('../models/MenuCategory');
const { generateToken } = require('../utils/jwtUtils');
const { validateInput, tenantValidationSchemas } = require('../utils/validationSchemas');
const { PLAN_LIMITS } = require('../config/planDefaults');
const { runAsSuperAdmin } = require('../utils/tenantContext');

const STARTER_CATEGORIES = ['Appetizers', 'Main Course', 'Desserts', 'Beverages'];

const slugify = (str) =>
    str
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-');

class TenantService {
    async checkSubdomainAvailable(subdomain) {
        const clean = String(subdomain || '').toLowerCase().trim();
        if (!/^[a-z0-9-]{3,30}$/.test(clean)) {
            return { available: false, reason: 'Must be 3-30 lowercase letters, numbers, or hyphens' };
        }
        const existing = await runAsSuperAdmin(() => Tenant.findOne({ subdomain: clean }));
        return { available: !existing };
    }

    async registerTenant(payload) {
        const validation = validateInput(tenantValidationSchemas.register, payload);
        if (!validation.valid) {
            throw { status: 400, message: 'Validation failed', errors: validation.errors };
        }
        const { restaurantName, subdomain, ownerFirstName, ownerLastName, ownerEmail, ownerPassword } = validation.data;

        const existingTenant = await runAsSuperAdmin(() => Tenant.findOne({ subdomain }));
        if (existingTenant) {
            throw { status: 400, message: 'This subdomain is already taken' };
        }

        const buildResult = async (tenant, owner) => ({
            tenant: {
                id: tenant._id,
                name: tenant.name,
                subdomain: tenant.subdomain,
                plan: tenant.plan,
            },
            user: {
                id: owner._id,
                firstName: owner.firstName,
                lastName: owner.lastName,
                email: owner.email,
                role: owner.role,
            },
            token: generateToken(owner._id, owner.role, owner.email, tenant._id),
        });

        // Transactions require MongoDB running as a replica set (Atlas satisfies this
        // by default). Fall back to sequential creation with manual cleanup on a
        // standalone mongod, where transactions aren't available.
        const session = await mongoose.startSession();
        try {
            let created;
            try {
                await session.withTransaction(async () => {
                    created = await this._createTenantAndOwner(
                        { restaurantName, subdomain, ownerFirstName, ownerLastName, ownerEmail, ownerPassword },
                        session
                    );
                });
            } catch (txError) {
                if (txError?.errorLabelSet?.has?.('TransientTransactionError') || txError?.code === 20 || /Transaction numbers/.test(txError?.message || '')) {
                    // Standalone MongoDB — no replica set, retry without a transaction.
                    created = await this._createTenantAndOwnerNoTransaction({
                        restaurantName, subdomain, ownerFirstName, ownerLastName, ownerEmail, ownerPassword,
                    });
                } else {
                    throw txError;
                }
            }
            return buildResult(created.tenant, created.owner);
        } finally {
            session.endSession();
        }
    }

    async _createTenantAndOwner({ restaurantName, subdomain, ownerFirstName, ownerLastName, ownerEmail, ownerPassword }, session) {
        const [tenant] = await Tenant.create(
            [{ name: restaurantName, subdomain, status: 'active', plan: 'free', limits: PLAN_LIMITS.free }],
            { session }
        );
        const [owner] = await User.create(
            [{ firstName: ownerFirstName, lastName: ownerLastName, email: ownerEmail, password: ownerPassword, role: 'admin', tenantId: tenant._id }],
            { session }
        );
        tenant.ownerId = owner._id;
        await tenant.save({ session });

        const categoryDocs = STARTER_CATEGORIES.map((name, i) => ({
            name,
            slug: slugify(name),
            tenantId: tenant._id,
            sortOrder: i,
            createdBy: owner._id,
        }));
        await MenuCategory.insertMany(categoryDocs, { session });

        return { tenant, owner };
    }

    async _createTenantAndOwnerNoTransaction({ restaurantName, subdomain, ownerFirstName, ownerLastName, ownerEmail, ownerPassword }) {
        const tenant = await Tenant.create({ name: restaurantName, subdomain, status: 'active', plan: 'free', limits: PLAN_LIMITS.free });
        try {
            const owner = await User.create({ firstName: ownerFirstName, lastName: ownerLastName, email: ownerEmail, password: ownerPassword, role: 'admin', tenantId: tenant._id });
            tenant.ownerId = owner._id;
            await tenant.save();

            const categoryDocs = STARTER_CATEGORIES.map((name, i) => ({
                name,
                slug: slugify(name),
                tenantId: tenant._id,
                sortOrder: i,
                createdBy: owner._id,
            }));
            await MenuCategory.insertMany(categoryDocs);

            return { tenant, owner };
        } catch (err) {
            // Manual compensation since there's no transaction to roll back
            await Tenant.deleteOne({ _id: tenant._id }).catch(() => {});
            throw err;
        }
    }

    async getPublicBranding(tenant) {
        if (!tenant) {
            return {
                displayName: 'Restaurant',
                primaryColor: '#dc2626',
                secondaryColor: '#f59e0b',
                logoUrl: '',
                subdomain: null,
            };
        }
        return {
            displayName: tenant.branding?.displayName || tenant.name,
            primaryColor: tenant.branding?.primaryColor || '#dc2626',
            secondaryColor: tenant.branding?.secondaryColor || '#f59e0b',
            logoUrl: tenant.branding?.logoUrl || '',
            subdomain: tenant.subdomain,
        };
    }

    async updateBranding(tenantId, branding) {
        const TenantRepository = require('../repositories/TenantRepository');
        const tenant = await TenantRepository.findById(tenantId);
        if (!tenant) {
            throw { status: 404, message: 'Tenant not found' };
        }
        const merged = { ...tenant.branding?.toObject?.() ?? tenant.branding ?? {} };
        ['displayName', 'primaryColor', 'secondaryColor', 'logoUrl'].forEach((key) => {
            if (branding[key] !== undefined) merged[key] = branding[key];
        });
        return TenantRepository.updateBranding(tenantId, merged);
    }
}

module.exports = new TenantService();
