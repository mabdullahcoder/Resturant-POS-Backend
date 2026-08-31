/**
 * Tenant Controller
 * Public subdomain-availability/branding lookups + tenant-admin branding management.
 * Tenant creation itself lives in PlatformAdminController (super-admin only).
 */
const TenantService = require('../services/TenantService');
const gridfs = require('../utils/gridfs');
const { sendSuccess } = require('../utils/responseFormatter');

class TenantController {
    async checkSubdomain(req, res, next) {
        try {
            const { subdomain } = req.query;
            const result = await TenantService.checkSubdomainAvailable(subdomain);
            return sendSuccess(res, 200, 'Checked', result);
        } catch (err) {
            return next(err);
        }
    }

    async getPublicBranding(req, res, next) {
        try {
            const branding = await TenantService.getPublicBranding(req.tenant);
            return sendSuccess(res, 200, 'Branding retrieved', branding);
        } catch (err) {
            return next(err);
        }
    }

    async updateBranding(req, res, next) {
        try {
            if (!req.tenant) {
                return res.status(400).json({ success: false, message: 'No restaurant context for this request' });
            }
            const updated = await TenantService.updateBranding(req.tenant._id, req.body);
            return sendSuccess(res, 200, 'Branding updated', updated.branding);
        } catch (err) {
            return next(err);
        }
    }

    async uploadLogo(req, res, next) {
        try {
            if (!req.tenant) {
                return res.status(400).json({ success: false, message: 'No restaurant context for this request' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No image file provided' });
            }
            const fileId = await gridfs.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
            const logoUrl = `/api/tenant/branding/logo/${fileId}`;
            const updated = await TenantService.updateBranding(req.tenant._id, { logoUrl });
            return sendSuccess(res, 201, 'Logo uploaded', updated.branding);
        } catch (err) {
            return next(err);
        }
    }

    async getLogo(req, res, next) {
        try {
            const file = await gridfs.findFile(req.params.id);
            if (!file) {
                const err = new Error('Logo not found');
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

module.exports = new TenantController();
