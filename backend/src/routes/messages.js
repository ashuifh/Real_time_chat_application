import { FieldValue } from 'firebase-admin/firestore';
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../config/firebase.js';
import { authenticate } from '../middleware/authenticate.js';
import { asyncHandler, HttpError } from '../lib/errors.js';
import { parse } from '../lib/validation.js';
import { emitToChat, requireChatMember, serializeSnapshot } from '../services/chats.js';

const router = Router();
router.use(authenticate);

export async function createMessage({ uid, chatId, body, io }) {
  const input = parse(z.object({
    text: z.string().trim().max(10000).default(''),
    attachments: z.array(z.object({ url: z.string().url().max(2048), name: z.string().max(255), mimeType: z.string().max(128) })).max(10).default([]),
  }).refine((value) => value.text.length > 0 || value.attachments.length > 0, 'A message needs text or an attachment'), body);
  await requireChatMember(chatId, uid);
  const chatRef = db.collection('chats').doc(chatId);
  const messageRef = chatRef.collection('messages').doc();
  const preview = input.text || 'Attachment';
  await db.runTransaction(async (transaction) => {
    transaction.create(messageRef, {
      senderId: uid, text: input.text, attachments: input.attachments,
      readBy: [uid], deleted: false, createdAt: FieldValue.serverTimestamp(),
    });
    transaction.update(chatRef, {
      updatedAt: FieldValue.serverTimestamp(),
      lastMessage: { senderId: uid, text: preview.slice(0, 160), createdAt: FieldValue.serverTimestamp() },
    });
  });
  const message = serializeSnapshot(await messageRef.get());
  io?.to(`chat:${chatId}`).emit('message:new', { chatId, message });
  return message;
}

router.get('/chats/:chatId/messages', asyncHandler(async (req, res) => {
  await requireChatMember(req.params.chatId, req.user.uid);
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new HttpError(400, 'limit must be between 1 and 50');
  const collection = db.collection('chats').doc(req.params.chatId).collection('messages');
  let query = collection.orderBy('createdAt', 'desc');
  if (req.query.cursor) {
    const cursor = await collection.doc(String(req.query.cursor)).get();
    if (!cursor.exists) throw new HttpError(400, 'Invalid message cursor');
    query = query.startAfter(cursor);
  }
  const result = await query.limit(limit + 1).get();
  const hasMore = result.docs.length > limit;
  const docs = result.docs.slice(0, limit);
  res.json({ messages: docs.map(serializeSnapshot), nextCursor: hasMore ? docs.at(-1).id : null, hasMore });
}));

router.post('/chats/:chatId/messages', asyncHandler(async (req, res) => {
  const message = await createMessage({ uid: req.user.uid, chatId: req.params.chatId, body: req.body, io: req.app.get('io') });
  res.status(201).json({ message });
}));

router.patch('/chats/:chatId/messages/:messageId/read', asyncHandler(async (req, res) => {
  const { ref } = await requireChatMember(req.params.chatId, req.user.uid);
  const messageRef = ref.collection('messages').doc(req.params.messageId);
  const message = await messageRef.get();
  if (!message.exists) throw new HttpError(404, 'Message not found');
  await messageRef.update({ readBy: FieldValue.arrayUnion(req.user.uid) });
  const payload = { chatId: req.params.chatId, messageId: message.id, userId: req.user.uid };
  emitToChat(req, req.params.chatId, 'message:read', payload);
  res.json({ success: true, ...payload });
}));

router.delete('/chats/:chatId/messages/:messageId', asyncHandler(async (req, res) => {
  const { ref } = await requireChatMember(req.params.chatId, req.user.uid);
  const messageRef = ref.collection('messages').doc(req.params.messageId);
  const message = await messageRef.get();
  if (!message.exists) throw new HttpError(404, 'Message not found');
  if (message.get('senderId') !== req.user.uid) throw new HttpError(403, 'Only the sender can delete this message');
  await messageRef.update({ text: '', attachments: [], deleted: true, deletedAt: FieldValue.serverTimestamp() });
  emitToChat(req, req.params.chatId, 'message:deleted', { chatId: req.params.chatId, messageId: message.id });
  res.status(204).end();
}));

export default router;