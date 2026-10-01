import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { auth, db } from '../config/firebase.js';
import { env } from '../config/env.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';

const router = Router();
const registerSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
});
const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

function issueToken(uid, tokenVersion = 0) {
  return jwt.sign({ uid, tokenVersion }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function safeUser(uid, data) {
  const { tokenVersion, fcmTokens, ...publicData } = data;
  return { uid, ...publicData };
}

router.post('/register', asyncHandler(async (req, res) => {
  const input = parse(registerSchema, req.body);
  const existingProfile = await db.collection('users').where('email', '==', input.email).limit(1).get();
  if (!existingProfile.empty) throw new HttpError(409, 'Email is already registered');

  let firebaseUser;
  try {
    firebaseUser = await auth.createUser({ email: input.email, password: input.password, displayName: input.displayName });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') throw new HttpError(409, 'Email is already registered');
    throw error;
  }

  const userData = {
    email: input.email,
    displayName: input.displayName,
    displayNameLower: input.displayName.toLowerCase(),
    bio: '',
    photoURL: null,
    fcmTokens: [],
    tokenVersion: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  try {
    await db.collection('users').doc(firebaseUser.uid).create(userData);
  } catch (error) {
    await auth.deleteUser(firebaseUser.uid).catch(() => {});
    throw error;
  }
  res.status(201).json({ token: issueToken(firebaseUser.uid), user: safeUser(firebaseUser.uid, userData) });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const input = parse(loginSchema, req.body);
  if (!env.FIREBASE_WEB_API_KEY) throw new HttpError(503, 'Firebase password sign-in is not configured');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: input.email, password: input.password, returnSecureToken: true }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = result.error?.message;
    if (['EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_LOGIN_CREDENTIALS', 'USER_DISABLED'].includes(code)) {
      throw new HttpError(401, 'Invalid email or password');
    }
    throw new HttpError(502, 'Firebase sign-in could not be completed');
  }
  const snapshot = await db.collection('users').doc(result.localId).get();
  if (!snapshot.exists) throw new HttpError(403, 'User profile is unavailable');
  const data = snapshot.data();
  res.json({ token: issueToken(result.localId, data.tokenVersion ?? 0), user: safeUser(result.localId, data) });
}));

router.get('/me', authenticate, (req, res) => {
  res.json({ user: safeUser(req.user.uid, req.user) });
});

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await db.collection('users').doc(req.user.uid).update({ tokenVersion: (req.user.tokenVersion ?? 0) + 1 });
  res.status(204).end();
}));

export default router;