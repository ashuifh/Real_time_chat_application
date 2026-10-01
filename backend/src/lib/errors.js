export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error.code === 9 && /index/i.test(error.message ?? '')) {
    console.error('Firestore composite index missing:', error.message);
    return res.status(503).json({
      error: 'Firestore index is not deployed. Deploy backend/firestore.indexes.json, then retry.',
      code: 'FIRESTORE_INDEX_MISSING',
    });
  }
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : error.message,
    ...(error.details ? { details: error.details } : {}),
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}