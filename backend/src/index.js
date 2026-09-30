import { createServer } from 'node:http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { app } from './app.js';
import { env } from './config/env.js';
import { db, realtimeDb } from './config/firebase.js';
import { HttpError } from './lib/errors.js';
import { attachSocketHandlers } from './sockets/index.js';

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.FRONTEND_URL, credentials: true },
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string') throw new Error('Missing token');
    const claims = jwt.verify(token, env.JWT_SECRET);
    if (typeof claims !== 'object' || typeof claims.uid !== 'string') throw new Error('Invalid token');
    const userSnapshot = await db.collection('users').doc(claims.uid).get();
    if (!userSnapshot.exists || (userSnapshot.get('tokenVersion') ?? 0) !== claims.tokenVersion) {
      throw new Error('Revoked token');
    }
    socket.data.uid = claims.uid;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

attachSocketHandlers(io);
app.set('io', io);

httpServer.listen(env.PORT, () => {
  console.log(`Chatt backend listening on port ${env.PORT}`);
});

async function shutdown() {
  io.close();
  httpServer.close(async () => {
    await realtimeDb.goOffline();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);