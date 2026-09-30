import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { Router } from 'express';
import { z } from 'zod';
import { db, messaging } from '../config/firebase.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';

const router = Router();
router.use(authenticate);

router.post('/', asyncHandler(async (req, res) => {
  const input = parse(z.object({
    userId: z.string().min(1).max(128),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    data: z.record(z.string().max(1000)).optional(),
  }), req.body);

  if (input.userId !== req.user.uid) {
    const memberships = await db.collection('chats').where('members', 'array-contains', req.user.uid).limit(100).get();
    if (!memberships.docs.some((chat) => chat.get('members')?.includes(input.userId))) {
      throw new HttpError(403, 'Notifications can only be sent to users sharing a chat');
    }
  }

  const recipientRef = db.collection('users').doc(input.userId);
  const recipient = await recipientRef.get();
  if (!recipient.exists) throw new HttpError(404, 'User not found');
  const notification = {
    id: randomUUID(), fromUid: req.user.uid, title: input.title, body: input.body,
    data: input.data ?? {}, createdAt: new Date().toISOString(),
  };
  await db.runTransaction(async (transaction) => {
    const latest = await transaction.get(recipientRef);
    const previous = latest.get('notifications') ?? [];
    transaction.update(recipientRef, { notifications: [notification, ...previous].slice(0, 50) });
  });

  const tokens = recipient.get('fcmTokens') ?? [];
  let sent = 0;
  if (tokens.length) {
    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title: input.title, body: input.body },
      data: { ...input.data, fromUid: req.user.uid },
    });
    sent = result.successCount;
    const invalid = result.responses.flatMap((item, index) =>
      !item.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(item.error?.code)
        ? [tokens[index]] : []);
    if (invalid.length) await recipientRef.update({ fcmTokens: FieldValue.arrayRemove(...invalid) });
  }
  res.status(202).json({ notification, sent });
}));

router.get('/', asyncHandler(async (req, res) => {
  const snapshot = await db.collection('users').doc(req.user.uid).get();
  res.json({ notifications: snapshot.get('notifications') ?? [] });
}));

export default router;