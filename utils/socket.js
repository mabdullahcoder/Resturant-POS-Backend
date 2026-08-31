/**
 * Socket.IO utility
 * Manages the Socket.IO instance and handles connection events
 * SENIOR FIX: Proper event emission with logging and error handling
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

let io;

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || 'localhost';
const corsOriginPattern = new RegExp(
    `^https?://([a-z0-9-]+\\.)?${PLATFORM_DOMAIN.replace(/\./g, '\\.')}(:\\d+)?$`
);

const init = (server) => {
    io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin) return callback(null, true);
                if (process.env.NODE_ENV !== 'production') return callback(null, true);
                return corsOriginPattern.test(origin) ? callback(null, true) : callback(new Error('Not allowed by CORS'));
            },
            methods: ['GET', 'POST'],
            credentials: true,
        },
        pingInterval: 25000,
        pingTimeout: 60000,
    });

    // Authentication middleware
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            logger.error('Socket auth failed: No token provided');
            return next(new Error('Authentication error: No token provided'));
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            socket.tenantId = decoded.tenantId || null;
            next();
        } catch (error) {
            logger.error(`Socket auth failed: Invalid token - ${error.message}`);
            return next(new Error('Authentication error: Invalid or expired token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        const userRole = socket.user.role;
        const tenantId = socket.tenantId;

        logger.info(`✓ Socket CONNECTED: User ${userId} | Role: ${userRole} | Tenant: ${tenantId} | Socket ID: ${socket.id}`);

        try {
            // Join a private room for the user
            socket.join(`user_${userId}`);
            logger.debug(`Socket room joined: user_${userId}`);

            // Join this tenant's admin panel room if user is a tenant admin.
            // Platform super-admins have no tenantId and don't join a tenant room.
            if (userRole === 'admin' && tenantId) {
                socket.join(`admin_panel_${tenantId}`);
                socket.join(`admin_${userId}`);
                logger.info(`✓ Admin socket rooms joined: admin_panel_${tenantId}, admin_${userId}`);
            } else if (userRole === 'super-admin') {
                socket.join(`admin_${userId}`);
                logger.info(`✓ Super-admin socket room joined: admin_${userId}`);
            }
        } catch (error) {
            logger.error(`Error during socket room setup: ${error.message}`);
        }

        socket.on('disconnect', () => {
            logger.info(`✓ Socket DISCONNECTED: User ${userId} | Socket ID: ${socket.id}`);
        });
    });

    return io;
};

const getIO = () => {
    if (!io) {
        throw new Error('Socket.IO not initialized');
    }
    return io;
};

const emitUpdate = (userId, event, data) => {
    if (io) {
        try {
            // Convert ObjectId to string for socket room matching
            const userIdStr = userId && userId.toString ? userId.toString() : String(userId);
            const roomName = `user_${userIdStr}`;

            logger.debug(`📡 Emitting to user room: ${roomName} | Event: ${event} | Data:`, {
                orderId: data?.orderId,
                status: data?.status,
                _id: data?._id
            });

            io.to(roomName).emit(event, data);
            logger.info(`✓ Socket update EMITTED to ${roomName}: ${event}`);
        } catch (error) {
            logger.error(`✗ Error emitting socket update: ${error.message}`, { event, userId });
        }
    } else {
        logger.error(`✗ Socket.IO not initialized when trying to emit: ${event}`);
    }
};

// Emit update to a tenant's admin panel (order changes visible to that restaurant's active admins only)
const emitAdminUpdate = (event, data, tenantId) => {
    if (io) {
        try {
            if (!tenantId) {
                logger.error(`✗ emitAdminUpdate called without tenantId: ${event}`);
                return;
            }
            const room = `admin_panel_${tenantId}`;
            logger.debug(`📡 Emitting to ${room} | Event: ${event} | Data:`, {
                orderId: data?.orderId,
                status: data?.status,
                userId: data?.userId
            });

            io.to(room).emit(event, data);
            logger.info(`✓ Admin panel update EMITTED to ${room}: ${event}`);
        } catch (error) {
            logger.error(`✗ Error emitting admin socket update: ${error.message}`, { event });
        }
    } else {
        logger.error(`✗ Socket.IO not initialized when trying to emit admin update: ${event}`);
    }
};

// Emit update to specific admin user
const emitAdminNotification = (adminId, event, data) => {
    if (io) {
        try {
            const adminIdStr = adminId && adminId.toString ? adminId.toString() : String(adminId);
            const roomName = `admin_${adminIdStr}`;

            logger.debug(`📡 Emitting to admin: ${roomName} | Event: ${event}`);

            io.to(roomName).emit(event, data);
            logger.info(`✓ Admin notification EMITTED to ${roomName}: ${event}`);
        } catch (error) {
            logger.error(`✗ Error emitting admin notification: ${error.message}`, { event, adminId });
        }
    } else {
        logger.error(`✗ Socket.IO not initialized when trying to emit admin notification: ${event}`);
    }
};

// Get socket statistics for debugging
const getSocketStats = () => {
    if (!io) return null;
    const sockets = io.sockets.sockets;
    let userCount = 0;
    let adminCount = 0;

    sockets.forEach((socket) => {
        if (socket.user.role === 'admin' || socket.user.role === 'super-admin') {
            adminCount++;
        } else {
            userCount++;
        }
    });

    return {
        totalConnections: sockets.size,
        users: userCount,
        admins: adminCount,
    };
};

/**
 * SENIOR FIX: Menu/Product real-time updates
 * Broadcasts menu item changes to all connected admins (admin_panel room)
 */
const emitMenuItemUpdated = (menuItem, actionType = 'updated', updatedBy = null, tenantId = null) => {
    if (io) {
        try {
            const tid = tenantId || menuItem.tenantId;
            if (!tid) {
                logger.error(`✗ emitMenuItemUpdated called without tenantId for item ${menuItem._id}`);
                return;
            }
            const room = `admin_panel_${tid}`;
            const eventData = {
                _id: menuItem._id,
                name: menuItem.name,
                price: menuItem.price,
                originalPrice: menuItem.originalPrice,
                description: menuItem.description,
                image: menuItem.image,
                category: menuItem.category,
                isActive: menuItem.isActive,
                sortOrder: menuItem.sortOrder,
                createdAt: menuItem.createdAt,
                updatedAt: menuItem.updatedAt,
                updatedBy: updatedBy,
                actionType: actionType, // 'created', 'updated', 'deleted'
                timestamp: new Date().toISOString(),
            };

            logger.debug(`📡 Emitting menu item ${actionType} to ${room} | Item: ${menuItem.name} | ID: ${menuItem._id}`);

            io.to(room).emit('menuItemUpdated', eventData);
            logger.info(`✓ Menu item ${actionType} EMITTED to ${room}: ${menuItem.name}`);
        } catch (error) {
            logger.error(`✗ Error emitting menu item update: ${error.message}`, { menuItemId: menuItem._id, actionType });
        }
    } else {
        logger.error(`✗ Socket.IO not initialized when trying to emit menu item update`);
    }
};

/**
 * SENIOR FIX: Menu category real-time updates
 * Broadcasts category changes to all connected admins
 */
const emitMenuCategoryUpdated = (category, actionType = 'updated', updatedBy = null, tenantId = null) => {
    if (io) {
        try {
            const tid = tenantId || category.tenantId;
            if (!tid) {
                logger.error(`✗ emitMenuCategoryUpdated called without tenantId for category ${category._id}`);
                return;
            }
            const room = `admin_panel_${tid}`;
            const eventData = {
                _id: category._id,
                name: category.name,
                slug: category.slug,
                description: category.description,
                isActive: category.isActive,
                sortOrder: category.sortOrder,
                createdAt: category.createdAt,
                updatedAt: category.updatedAt,
                updatedBy: updatedBy,
                actionType: actionType, // 'created', 'updated', 'deleted'
                timestamp: new Date().toISOString(),
            };

            logger.debug(`📡 Emitting menu category ${actionType} to ${room} | Category: ${category.name} | ID: ${category._id}`);

            io.to(room).emit('menuCategoryUpdated', eventData);
            logger.info(`✓ Menu category ${actionType} EMITTED to ${room}: ${category.name}`);
        } catch (error) {
            logger.error(`✗ Error emitting menu category update: ${error.message}`, { categoryId: category._id, actionType });
        }
    } else {
        logger.error(`✗ Socket.IO not initialized when trying to emit menu category update`);
    }
};

module.exports = {
    init,
    getIO,
    emitUpdate,
    emitAdminUpdate,
    emitAdminNotification,
    getSocketStats,
    emitMenuItemUpdated,
    emitMenuCategoryUpdated,
};
