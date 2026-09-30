import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/firebase.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';
import { requireChatMember, serializeSnapshot } from '../services/chats.js';

const router = Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const result = await db.collection('chats').where('members', 'array-contains', req.user.uid)
    .orderBy('updatedAt', 'desc').limit(50).get();
  res.json({ chats: result.docs.map(serializeSnapshot) });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { userId } = parse(z.object({ userId: z.string().min(1).max(128) }), req.body);
  if (userId === req.user.uid) throw new HttpError(400, 'Cannot create a direct chat with yourself');
  if (!(await db.collection('users').doc(userId).get()).exists) throw new HttpError(404, 'User not found');
  const members = [req.user.uid, userId].sort();
  const id = `dm_${createHash('sha256').update(members.join(':')).digest('hex').slice(0, 40)}`;
  const ref = db.collection('chats').doc(id);
  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (!existing.exists) transaction.create(ref, {
      type: 'direct', members, memberRoles: Object.fromEntries(members.map((uid) => [uid, 'member'])),
      createdBy: req.user.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessage: null,
    });
  });
  res.status(201).json({ chat: serializeSnapshot(await ref.get()) });
}));

router.post('/group', asyncHandler(async (req, res) => {
  const input = parse(z.object({ name: z.string().trim().min(1).max(100), memberIds: z.array(z.string().min(1).max(128)).min(1).max(99) }), req.body);
  const members = [...new Set([req.user.uid, ...input.memberIds])];
  const memberSnapshots = await Promise.all(members.map((uid) => db.collection('users').doc(uid).get()));
  if (memberSnapshots.some((snapshot) => !snapshot.exists)) throw new HttpError(404, 'One or more users were not found');
  const ref = db.collection('chats').doc();
  await ref.create({
    type: 'group', name: input.name, members,
    memberRoles: Object.fromEntries(members.map((uid) => [uid, uid === req.user.uid ? 'owner' : 'member'])),
    createdBy: req.user.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastMessage: null,
  });
  res.status(201).json({ chat: serializeSnapshot(await ref.get()) });
}));

router.get('/:chatId', asyncHandler(async (req, res) => {
  const { ref } = await requireChatMember(req.params.chatId, req.user.uid);
  res.json({ chat: serializeSnapshot(await ref.get()) });
}));

router.patch('/:chatId', asyncHandler(async (req, res) => {
  const { ref, chat } = await requireChatMember(req.params.chatId, req.user.uid);
  if (chat.type !== 'group') throw new HttpError(400, 'Only group chats can be renamed');
  if (chat.createdBy !== req.user.uid) throw new HttpError(403, 'Only the group owner can rename this chat');
  const { name } = parse(z.object({ name: z.string().trim().min(1).max(100) }), req.body);
  await ref.update({ name, updatedAt: FieldValue.serverTimestamp() });
  res.json({ chat: serializeSnapshot(await ref.get()) });
}));

router.post('/:chatId/members', asyncHandler(async (req, res) => {
  const { ref, chat } = await requireChatMember(req.params.chatId, req.user.uid);
  if (chat.type !== 'group' || chat.createdBy !== req.user.uid) throw new HttpError(403, 'Only the group owner can add members');
  const { userId } = parse(z.object({ userId: z.string().min(1).max(128) }), req.body);
  if (!(await db.collection('users').doc(userId).get()).exists) throw new HttpError(404, 'User not found');
  if (!chat.members.includes(userId)) {
    await ref.update({
      members: FieldValue.arrayUnion(userId),
      [`memberRoles.${userId}`]: 'member',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  res.json({ chat: serializeSnapshot(await ref.get()) });
}));

router.delete('/:chatId/members/:userId', asyncHandler(async (req, res) => {
  const { ref, chat } = await requireChatMember(req.params.chatId, req.user.uid);
  if (chat.type !== 'group' || chat.createdBy !== req.user.uid) throw new HttpError(403, 'Only the group owner can remove members');
  if (req.params.userId === chat.createdBy) throw new HttpError(400, 'The group owner cannot be removed');
  if (!chat.members.includes(req.params.userId)) throw new HttpError(404, 'User is not a member');
  await ref.update({
    members: FieldValue.arrayRemove(req.params.userId),
    [`memberRoles.${req.params.userId}`]: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  res.json({ chat: serializeSnapshot(await ref.get()) });
}));

export default router;