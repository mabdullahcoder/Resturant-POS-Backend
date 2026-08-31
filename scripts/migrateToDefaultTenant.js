/**
 * One-time migration: creates a "default" Tenant for the restaurant that
 * was running before multi-tenancy existed, and backfills tenantId onto
 * every pre-existing document across all tenant-owned collections.
 *
 * Run once: node server/scripts/migrateToDefaultTenant.js
 * Safe to re-run — it only touches documents missing tenantId.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/database');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Order = require('../models/Order');
const MenuItem = require('../models/MenuItem');
const MenuCategory = require('../models/MenuCategory');
const Report = require('../models/Report');
const ActivityLog = require('../models/ActivityLog');
const AdminLog = require('../models/AdminLog');

(async () => {
    await connectDB();

    let tenant = await Tenant.findOne({ subdomain: 'default' });
    if (!tenant) {
        const owner = await User.findOne({ role: { $in: ['admin', 'super-admin'] } }).sort({ createdAt: 1 });
        tenant = await Tenant.create({
            name: 'Default Restaurant',
            subdomain: 'default',
            status: 'active',
            plan: 'pro',
            // Grandfathered: generous limits so the pre-existing restaurant is never blocked by new plan caps
            limits: { maxMenuItems: 100000, maxStaffSeats: 1000, maxOrdersPerMonth: 10000000 },
            ownerId: owner ? owner._id : null,
        });
        console.log(`Created default tenant: ${tenant._id}`);
    } else {
        console.log(`Default tenant already exists: ${tenant._id}`);
    }

    const targets = [
        [User.collection, { tenantId: { $exists: false }, role: { $ne: 'super-admin' } }],
        [Order.collection, { tenantId: { $exists: false } }],
        [MenuItem.collection, { tenantId: { $exists: false } }],
        [MenuCategory.collection, { tenantId: { $exists: false } }],
        [Report.collection, { tenantId: { $exists: false } }],
        [ActivityLog.collection, { tenantId: { $exists: false } }],
        [AdminLog.collection, { tenantId: { $exists: false } }],
    ];

    for (const [collection, filter] of targets) {
        const result = await collection.updateMany(filter, { $set: { tenantId: tenant._id } });
        console.log(`${collection.collectionName}: backfilled ${result.modifiedCount} document(s)`);
    }

    console.log('\nVerifying no documents remain without tenantId...');
    let allClear = true;
    for (const [collection, filter] of targets) {
        const remaining = await collection.countDocuments(filter);
        if (remaining > 0) {
            allClear = false;
            console.warn(`WARNING: ${collection.collectionName} still has ${remaining} document(s) missing tenantId`);
        }
    }
    console.log(allClear ? 'All clear — safe to enforce required/unique tenant indexes.' : 'Fix the above before relying on tenant-required schema constraints.');

    await mongoose.disconnect();
    process.exit(0);
})().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
