import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './lib/errors.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chats.js';
import messageRoutes from './routes/messages.js';
import notificationRoutes from './routes/notifications.js';
import uploadRoutes from './routes/uploads.js';
import userRoutes from './routes/users.js';

export const app = express();
app.disable('x-powered-by');
if (env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(morgan(env.LOG_LEVEL));
app.use('/api', rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 600,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { error: 'Too many requests. Please wait a few minutes and try again.' },
}));
app.use('/api/auth', rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 120,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { error: 'Too many authentication requests. Please wait before trying again.' },
}));
app.use('/api/auth/register', rateLimit({
	windowMs: 60 * 60 * 1000,
	limit: 100,
	standardHeaders: 'draft-7',
	legacyHeaders: false,
	message: { error: 'Too many registrations from this network. Please try again later.' },
}));

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api', messageRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use(notFound);
app.use(errorHandler);