import multer from 'multer';
import { HttpError } from '../lib/errors.js';

const maxFileBytes = 10 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileBytes, files: 1 },
  fileFilter(req, file, callback) {
    const allowed = req.path.endsWith('/image')
      ? /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)
      : /^[\w.+-]+\/[\w.+-]+$/.test(file.mimetype);
    callback(allowed ? null : new HttpError(415, 'Unsupported file type'), allowed);
  },
});

export function handleUpload(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(new HttpError(413, 'Maximum upload size is 10 MB'));
    }
    next(error);
  });
}