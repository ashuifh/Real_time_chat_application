import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { db, realtimeDb } from '../config/firebase.js';
import { createMessage } from '../routes/messages.js';
import { requireChatMember } from '../services/chats.js';

const chatIdSchema = z.string().min(1).max(128);

function acknowledgement(callback, result) {
  if (typeof callback === 'function') callback(result);
}

async function updatePresence(uid, socketId, connected) {
  const ref = realtimeDb.ref(`presence/${uid}`);
  await ref.transaction((current) => {
    const state = current ?? { connections: {} };
    const connections = { ...(state.connections ?? {}) };
    if (connected) connections[socketId] = true;
    else delete connections[socketId];
    return {
      connections,
      online: Object.keys(connections).length > 0,
      lastChanged: Date.now(),
    };
  });
}

export function attachSocketHandlers(io) {
  io.on('connection', (socket) => {
    const { uid } = socket.data;
    const userRoom = `user:${uid}`;
    const activeTypingChats = new Set();
    socket.join(userRoom);

    void updatePresence(uid, socket.id, true).then(() => {
      io.emit('user:online', { userId: uid });
    }).catch((error) => console.error('Unable to set presence online:', error));

    socket.on('user:setup', (callback) => {
      acknowledgement(callback, { ok: true, userId: uid, socketId: socket.id });
    });

    socket.on('chat:join', async (payload, callback) => {
      const parsed = z.object({ chatId: chatIdSchema }).safeParse(payload);
      if (!parsed.success) return acknowledgement(callback, { ok: false, error: 'Invalid chatId' });
      try {
        await requireChatMember(parsed.data.chatId, uid);
        socket.join(`chat:${parsed.data.chatId}`);
        acknowledgement(callback, { ok: true, chatId: parsed.data.chatId });
      } catch (error) {
        acknowledgement(callback, { ok: false, error: error.status === 403 || error.status === 404 ? error.message : 'Unable to join chat' });
      }
    });

    socket.on('chat:leave', (payload, callback) => {
      const parsed = z.object({ chatId: chatIdSchema }).safeParse(payload);
      if (!parsed.success) return acknowledgement(callback, { ok: false, error: 'Invalid chatId' });
      socket.leave(`chat:${parsed.data.chatId}`);
      acknowledgement(callback, { ok: true, chatId: parsed.data.chatId });
    });

    const setTyping = async (payload, typing, callback) => {
      const parsed = z.object({ chatId: chatIdSchema }).safeParse(payload);
      if (!parsed.success) return acknowledgement(callback, { ok: false, error: 'Invalid chatId' });
      try {
        await requireChatMember(parsed.data.chatId, uid);
        const ref = realtimeDb.ref(`typing/${parsed.data.chatId}/${uid}`);
        if (typing) {
          await ref.set({ typing: true, updatedAt: Date.now() });
          activeTypingChats.add(parsed.data.chatId);
          socket.to(`chat:${parsed.data.chatId}`).emit('typing:update', {
            chatId: parsed.data.chatId, userId: uid, typing: true,
          });
        } else {
          await ref.remove();
          activeTypingChats.delete(parsed.data.chatId);
          socket.to(`chat:${parsed.data.chatId}`).emit('typing:update', {
            chatId: parsed.data.chatId, userId: uid, typing: false,
          });
        }
        acknowledgement(callback, { ok: true });
      } catch (error) {
        acknowledgement(callback, { ok: false, error: error.status === 403 || error.status === 404 ? error.message : 'Unable to update typing status' });
      }
    };

    socket.on('typing:start', (payload, callback) => void setTyping(payload, true, callback));
    socket.on('typing:stop', (payload, callback) => void setTyping(payload, false, callback));

    socket.on('message:send', async (payload, callback) => {
      const parsed = z.object({ chatId: chatIdSchema, message: z.unknown() }).safeParse(payload);
      if (!parsed.success) return acknowledgement(callback, { ok: false, error: 'Invalid message payload' });
      try {
        const message = await createMessage({ uid, chatId: parsed.data.chatId, body: parsed.data.message, io });
        acknowledgement(callback, { ok: true, message });
      } catch (error) {
        acknowledgement(callback, {
          ok: false,
          error: error.status ? error.message : 'Unable to send message',
        });
      }
    });

    socket.on('message:read', async (payload, callback) => {
      const parsed = z.object({ chatId: chatIdSchema, messageId: z.string().min(1).max(128) }).safeParse(payload);
      if (!parsed.success) return acknowledgement(callback, { ok: false, error: 'Invalid read receipt' });
      try {
        const { ref: chatRef } = await requireChatMember(parsed.data.chatId, uid);
        const messageRef = chatRef.collection('messages').doc(parsed.data.messageId);
        const message = await messageRef.get();
        if (!message.exists) return acknowledgement(callback, { ok: false, error: 'Message not found' });
        await messageRef.update({ readBy: FieldValue.arrayUnion(uid) });
        const receipt = { chatId: parsed.data.chatId, messageId: parsed.data.messageId, userId: uid };
        socket.to(`chat:${parsed.data.chatId}`).emit('message:read', receipt);
        acknowledgement(callback, { ok: true, ...receipt });
      } catch (error) {
        acknowledgement(callback, { ok: false, error: error.status ? error.message : 'Unable to mark message read' });
      }
    });

    socket.on('disconnect', async () => {
      try {
        await Promise.all([
          updatePresence(uid, socket.id, false),
          ...[...activeTypingChats].map(async (chatId) => {
            await realtimeDb.ref(`typing/${chatId}/${uid}`).remove();
            io.to(`chat:${chatId}`).emit('typing:update', { chatId, userId: uid, typing: false });
          }),
        ]);
        const presence = await realtimeDb.ref(`presence/${uid}/connections`).get();
        if (!presence.exists() || Object.keys(presence.val() ?? {}).length === 0) {
          io.emit('user:offline', { userId: uid, lastChanged: Date.now() });
        }
      } catch (error) {
        console.error('Unable to update presence on disconnect:', error);
      }
    });
  });
}