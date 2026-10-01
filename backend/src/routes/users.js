import { FieldValue } from 'firebase-admin/firestore';
import { Router } from 'express';
import { z } from 'zod';
import { auth, db } from '../config/firebase.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';

const router = Router();
router.use(authenticate);

function publicUser(snapshot) {
  const { fcmTokens, tokenVersion, displayNameLower, ...user } = snapshot.data();
  return { uid: snapshot.id, ...user };
}

router.get('/', asyncHandler(async (req, res) => {
  const snapshot = await db.collection('users').orderBy('displayNameLower').limit(100).get();
  res.json({ users: snapshot.docs.filter((doc) => doc.id !== req.user.uid).map(publicUser) });
}));

router.get('/search', asyncHandler(async (req, res) => {
  const query = parse(z.string().trim().min(1).max(80), req.query.q).toLowerCase();
  const snapshot = await db.collection('users').orderBy('displayNameLower')
    .startAt(query).endAt(`${query}\uf8ff`).limit(25).get();
  res.json({ users: snapshot.docs.filter((doc) => doc.id !== req.user.uid).map(publicUser) });
}));

router.get('/:userId', asyncHandler(async (req, res) => {
  const snapshot = await db.collection('users').doc(req.params.userId).get();
  if (!snapshot.exists) throw new HttpError(404, 'User not found');
  res.json({ user: publicUser(snapshot) });
}));

router.patch('/me', asyncHandler(async (req, res) => {
  const input = parse(z.object({
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(500).optional(),
    photoURL: z.string().url().max(2048).nullable().optional(),
  }).refine((value) => Object.keys(value).length > 0, 'At least one field is required'), req.body);
  const updates = { ...input, updatedAt: new Date() };
  if (input.displayName !== undefined) updates.displayNameLower = input.displayName.toLowerCase();
  await Promise.all([
    db.collection('users').doc(req.user.uid).update(updates),
    auth.updateUser(req.user.uid, {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.photoURL !== undefined && input.photoURL !== null ? { photoURL: input.photoURL } : {}),
    }),
  ]);
  const snapshot = await db.collection('users').doc(req.user.uid).get();
  res.json({ user: publicUser(snapshot) });
}));

router.post('/me/fcm-token', asyncHandler(async (req, res) => {
  const { token } = parse(z.object({ token: z.string().min(20).max(4096) }), req.body);
  await db.collection('users').doc(req.user.uid).update({ fcmTokens: FieldValue.arrayUnion(token) });
  res.status(204).end();
}));

export default router;