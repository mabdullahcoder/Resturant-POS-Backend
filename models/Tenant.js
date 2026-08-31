/**
 * Tenant Model
 * Represents one independent restaurant business on the platform.
 * NOTE: This model is intentionally NOT scoped by tenantScopePlugin —
 * it IS the tenant, not a tenant-owned resource.
 */
const mongoose = require('mongoose');
const { PLAN_LIMITS } = require('../config/planDefaults');

const tenantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Restaurant name is required'],
            trim: true,
        },
        subdomain: {
            type: String,
            required: [true, 'Subdomain is required'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^[a-z0-9-]{3,30}$/, 'Subdomain must be 3-30 lowercase letters, numbers, or hyphens'],
        },
        status: {
            type: String,
            enum: ['trial', 'active', 'suspended'],
            default: 'trial',
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        plan: {
            type: String,
            enum: ['free', 'starter', 'pro'],
            default: 'free',
        },
        limits: {
            maxMenuItems: { type: Number, default: PLAN_LIMITS.free.maxMenuItems },
            maxStaffSeats: { type: Number, default: PLAN_LIMITS.free.maxStaffSeats },
            maxOrdersPerMonth: { type: Number, default: PLAN_LIMITS.free.maxOrdersPerMonth },
        },
        branding: {
            displayName: { type: String, trim: true, default: '' },
            logoUrl: { type: String, default: '' },
            primaryColor: { type: String, default: '#dc2626' },
            secondaryColor: { type: String, default: '#f59e0b' },
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

tenantSchema.index({ status: 1 });

module.exports = mongoose.model('Tenant', tenantSchema);
