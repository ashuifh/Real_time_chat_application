import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { db } from '../config/firebase.js';
import { asyncHandler, HttpError } from '../lib/errors.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const authorization = req.get('authorization') ?? '';
  const [scheme, token] = authorization.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'Bearer token required');

  let claims;
  try {
    claims = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new HttpError(401, 'Invalid or expired token');
  }
  if (typeof claims !== 'object' || typeof claims.uid !== 'string') {
    throw new HttpError(401, 'Invalid token payload');
  }

  const userSnapshot = await db.collection('users').doc(claims.uid).get();
  if (!userSnapshot.exists || (userSnapshot.get('tokenVersion') ?? 0) !== claims.tokenVersion) {
    throw new HttpError(401, 'Token has been revoked');
  }
  req.user = { uid: claims.uid, ...userSnapshot.data() };
  next();
});