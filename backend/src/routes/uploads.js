import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { storage } from '../config/firebase.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';
import { handleUpload } from '../middleware/validate-upload.js';

const router = Router();
router.use(authenticate);

async function storeFile(req, folder) {
  if (!req.file) throw new HttpError(400, 'Multipart field "file" is required');
  const originalName = req.file.originalname.replace(/[\\/\0-\x1f]/g, '_').slice(0, 180) || 'upload';
  const objectPath = `${folder}/${req.user.uid}/${randomUUID()}-${originalName}`;
  const token = randomUUID();
  const bucket = storage.bucket();
  const file = bucket.file(objectPath);
  await file.save(req.file.buffer, {
    resumable: false,
    metadata: {
      contentType: req.file.mimetype,
      metadata: { ownerUid: req.user.uid, firebaseStorageDownloadTokens: token },
    },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(env.FIREBASE_STORAGE_BUCKET ?? bucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  return { url, name: originalName, mimeType: req.file.mimetype, size: req.file.size };
}

router.post('/image', handleUpload, asyncHandler(async (req, res) => {
  res.status(201).json({ file: await storeFile(req, 'images') });
}));

router.post('/file', handleUpload, asyncHandler(async (req, res) => {
  const { allowedMimeTypes } = parse(z.object({ allowedMimeTypes: z.array(z.string().max(128)).max(30).optional() }), req.body ?? {});
  if (allowedMimeTypes?.length && !allowedMimeTypes.includes(req.file?.mimetype)) throw new HttpError(415, 'File type is not allowed');
  res.status(201).json({ file: await storeFile(req, 'files') });
}));

export default router;