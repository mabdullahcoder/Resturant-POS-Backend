/**
 * Menu Controller
 * SENIOR FIX: Added Socket.IO real-time updates for menu changes
 */
const MenuService = require('../services/MenuService');
const { sendSuccess } = require('../utils/responseFormatter');
const { emitMenuItemUpdated, emitMenuCategoryUpdated } = require('../utils/socket');
const gridfs = require('../utils/gridfs');

class MenuController {
    /* ── Categories ── */

    async createCategory(req, res, next) {
        try {
            const category = await MenuService.createCategory(req.body, req.user.id);
            // SENIOR FIX: Emit real-time update to all admins
            emitMenuCategoryUpdated(category, 'created', req.user.id, req.tenant?._id);
            return sendSuccess(res, 201, 'Category created', category);
        } catch (err) {
            return next(err);
        }
    }

    async getCategories(req, res, next) {
        try {
            const includeInactive = req.query.includeInactive === 'true';
            const categories = await MenuService.getAllCategories(includeInactive);
            return sendSuccess(res, 200, 'Categories retrieved', categories);
        } catch (err) {
            return next(err);
        }
    }

    async updateCategory(req, res, next) {
        try {
            const updated = await MenuService.updateCategory(req.params.id, req.body, req.user.id);
            // SENIOR FIX: Emit real-time update to all admins
            emitMenuCategoryUpdated(updated, 'updated', req.user.id, req.tenant?._id);
            return sendSuccess(res, 200, 'Category updated', updated);
        } catch (err) {
            return next(err);
        }
    }

    async deleteCategory(req, res, next) {
        try {
            const category = await MenuService.getCategoryById(req.params.id);
            await MenuService.deleteCategory(req.params.id, req.user.id);
            // SENIOR FIX: Emit real-time deletion update to all admins
            if (category) {
                emitMenuCategoryUpdated(category, 'deleted', req.user.id, req.tenant?._id);
            }
            return sendSuccess(res, 200, 'Category deleted');
        } catch (err) {
            return next(err);
        }
    }

    /* ── Menu Items ── */

    async createItem(req, res, next) {
        try {
            const item = await MenuService.createItem(req.body, req.user.id);
            // SENIOR FIX: Emit real-time update to all admins
            emitMenuItemUpdated(item, 'created', req.user.id, req.tenant?._id);
            return sendSuccess(res, 201, 'Menu item created', item);
        } catch (err) {
            return next(err);
        }
    }

    async getItems(req, res, next) {
        try {
            const includeInactive = req.query.includeInactive === 'true';
            const { categoryId } = req.query;
            const items = categoryId
                ? await MenuService.getItemsByCategory(categoryId, includeInactive)
                : await MenuService.getAllItems(includeInactive);
            return sendSuccess(res, 200, 'Menu items retrieved', items);
        } catch (err) {
            return next(err);
        }
    }

    async getMenuGrouped(req, res, next) {
        try {
            const menu = await MenuService.getMenuGrouped();
            return sendSuccess(res, 200, 'Menu retrieved', menu);
        } catch (err) {
            return next(err);
        }
    }

    async updateItem(req, res, next) {
        try {
            const updated = await MenuService.updateItem(req.params.id, req.body, req.user.id);
            // SENIOR FIX: Emit real-time update to all admins
            emitMenuItemUpdated(updated, 'updated', req.user.id, req.tenant?._id);
            return sendSuccess(res, 200, 'Menu item updated', updated);
        } catch (err) {
            return next(err);
        }
    }

    async deleteItem(req, res, next) {
        try {
            const item = await MenuService.getItemById(req.params.id);
            await MenuService.deleteItem(req.params.id, req.user.id);
            // SENIOR FIX: Emit real-time deletion update to all admins
            if (item) {
                emitMenuItemUpdated(item, 'deleted', req.user.id, req.tenant?._id);
            }
            return sendSuccess(res, 200, 'Menu item deleted');
        } catch (err) {
            return next(err);
        }
    }

    /* ── Image upload (stored in MongoDB via GridFS) ── */

    async uploadImage(req, res, next) {
        try {
            const result = await MenuService.uploadImage(req.file, req.user.id);
            return sendSuccess(res, 201, 'Image uploaded', result);
        } catch (err) {
            return next(err);
        }
    }

    async getImage(req, res, next) {
        try {
            const file = await gridfs.findFile(req.params.id);
            if (!file) {
                const err = new Error('Image not found');
                err.status = 404;
                throw err;
            }
            res.set('Content-Type', file.contentType || 'application/octet-stream');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            const stream = gridfs.openDownloadStream(req.params.id);
            stream.on('error', () => res.status(404).end());
            stream.pipe(res);
        } catch (err) {
            return next(err);
        }
    }
}

module.exports = new MenuController();
