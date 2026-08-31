/**
 * Multer config for menu image uploads.
 * Files are received into memory and streamed straight into GridFS —
 * nothing ever touches local disk.
 */
const multer = require('multer');

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024; // 5MB default

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed'));
        }
        cb(null, true);
    },
});

/** Wraps multer's single-file upload so errors flow through the normal error handler. */
const uploadSingleImage = (fieldName) => (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
        if (err) {
            err.status = 400;
            return next(err);
        }
        next();
    });
};

module.exports = { uploadSingleImage, MAX_FILE_SIZE };
