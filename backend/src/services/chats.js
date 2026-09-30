import { db } from '../config/firebase.js';
import { HttpError } from '../lib/errors.js';

export async function requireChatMember(chatId, uid) {
  const snapshot = await db.collection('chats').doc(chatId).get();
  if (!snapshot.exists) throw new HttpError(404, 'Chat not found');
  const chat = snapshot.data();
  if (!chat.members?.includes(uid)) throw new HttpError(403, 'You are not a member of this chat');
  return { ref: snapshot.ref, chat };
}

function serializeValue(value) {
  if (value?.toDate instanceof Function) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, serializeValue(child)]));
  }
  return value;
}

export function serializeSnapshot(snapshot) {
  return { id: snapshot.id, ...serializeValue(snapshot.data()) };
}

export function emitToChat(req, chatId, event, payload) {
  req.app.get('io')?.to(`chat:${chatId}`).emit(event, payload);
}