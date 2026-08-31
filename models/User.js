/**
 * User Model
 * Manages user data with role-based access control
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const tenantScopePlugin = require('../plugins/tenantScopePlugin');

const userSchema = new mongoose.Schema(
    {
        tenantId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Tenant',
            default: null,
            index: true,
            // Every user belongs to a tenant except platform-level super-admins
            required: function () {
                return this.role !== 'super-admin';
            },
        },
        firstName: {
            type: String,
            required: [true, 'First name is required'],
            trim: true,
        },
        lastName: {
            type: String,
            required: [true, 'Last name is required'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            lowercase: true,
            match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide valid email'],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: 6,
            select: false, // Don't return password by default
        },
        phone: {
            type: String,
            trim: true,
        },
        address: {
            type: String,
            trim: true,
        },
        city: {
            type: String,
            trim: true,
        },
        state: {
            type: String,
            trim: true,
        },
        country: {
            type: String,
            trim: true,
        },
        zipCode: {
            type: String,
            trim: true,
        },
        role: {
            type: String,
            enum: ['user', 'admin', 'super-admin'],
            default: 'user',
        },
        profileImage: {
            type: String,
            default: null,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        loginAttempts: {
            type: Number,
            default: 0,
        },
        lockUntil: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Method to handle login attempts
userSchema.methods.incLoginAttempts = function () {
    this.loginAttempts += 1;
    if (this.loginAttempts >= 5) {
        this.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Lock for 30 minutes
    }
    return this.save();
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function () {
    this.loginAttempts = 0;
    this.lockUntil = null;
    this.lastLogin = new Date();
    return this.save();
};

// Email is unique per tenant (two different restaurants may share a customer email);
// platform super-admins (tenantId: null) are unique on email across the whole platform.
userSchema.index(
    { tenantId: 1, email: 1 },
    { unique: true, partialFilterExpression: { tenantId: { $type: 'objectId' } } }
);
userSchema.index(
    { email: 1 },
    { unique: true, partialFilterExpression: { role: 'super-admin' } }
);

userSchema.plugin(tenantScopePlugin);

module.exports = mongoose.model('User', userSchema);
