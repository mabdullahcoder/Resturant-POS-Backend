/**
 * MenuCategory Model
 */
const mongoose = require('mongoose');
const tenantScopePlugin = require('../plugins/tenantScopePlugin');

const menuCategorySchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            default: null,
            index: true,
        },
        name: {
            type: String,
            required: [true, 'Category name is required'],
            trim: true,
        },
        slug: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        description: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true }
);

// Compound-unique per tenant: two different restaurants can both have "Appetizers"/"appetizers"
menuCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });
menuCategorySchema.index({ tenantId: 1, slug: 1 }, { unique: true });
menuCategorySchema.index({ tenantId: 1, isActive: 1, sortOrder: 1 });

menuCategorySchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('MenuCategory', menuCategorySchema);
