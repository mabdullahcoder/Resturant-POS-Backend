/**
 * GridFS helper — stores uploaded menu images directly in MongoDB.
 */
const mongoose = require('mongoose');
const { Readable } = require('stream');

const BUCKET_NAME = 'menuImages';

const getBucket = () => {
    const { db } = mongoose.connection;
    if (!db) {
        const err = new Error('Database connection not ready');
        err.status = 503;
        throw err;
    }
    return new mongoose.mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
};

/** Streams a buffer into GridFS, returns the stored file's id. */
const uploadBuffer = (buffer, filename, contentType) =>
    new Promise((resolve, reject) => {
        const bucket = getBucket();
        const uploadStream = bucket.openUploadStream(filename, { contentType });
        Readable.from(buffer)
            .pipe(uploadStream)
            .on('error', reject)
            .on('finish', () => resolve(uploadStream.id));
    });

/** Looks up file metadata (used to set the response Content-Type before streaming). */
const findFile = async (id) => {
    const bucket = getBucket();
    const objectId = new mongoose.Types.ObjectId(id);
    const files = await bucket.find({ _id: objectId }).toArray();
    return files[0] || null;
};

/** Returns a readable stream for the stored file. */
const openDownloadStream = (id) => {
    const bucket = getBucket();
    return bucket.openDownloadStream(new mongoose.Types.ObjectId(id));
};

const deleteFile = async (id) => {
    const bucket = getBucket();
    await bucket.delete(new mongoose.Types.ObjectId(id)).catch(() => { });
};

module.exports = { uploadBuffer, findFile, openDownloadStream, deleteFile };
