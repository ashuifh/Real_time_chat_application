# Chatt Backend

Express REST API and Socket.IO service using Firebase Authentication, Cloud Firestore, Realtime Database, Cloud Storage, and Firebase Cloud Messaging.

## Setup

Requires Node.js 20 or newer. Copy `.env.example` to `.env`, set the Firebase project values, set the exact frontend origin, and provide a Firebase service account as `FIREBASE_SERVICE_ACCOUNT_JSON` or configure Application Default Credentials. Create the Firebase Authentication Email/Password provider and enable Firestore, Realtime Database, and Storage.

Install packages yourself with `npm install` (or `npm ci` when using the committed lockfile). Start locally with `npm run dev`; the health check is `GET /health`. This repository intentionally does not commit `node_modules` or real credentials. Generate a production `JWT_SECRET` with a cryptographically secure random generator and configure secrets in Render's environment settings.

## Docker

Build the backend image from the `backend/` directory with `docker build -t chatt-backend:local .`. Run it with `docker run --rm --env-file .env -p 3000:3000 chatt-backend:local`. Put Firebase Admin credentials in the ignored local `.env` as `FIREBASE_SERVICE_ACCOUNT_JSON` for this local container run, or inject them through the deployment platform's secret environment settings. The Docker build context excludes `.env`, service-account files, and `node_modules`; credentials are never copied into the image. Start Docker Desktop before building on Windows.

API requests are limited to 600 per IP per 15 minutes, authentication routes to 120 per IP per 15 minutes, and registration to 100 per IP per hour. These are request-abuse limits, not a cap on simultaneous users. The in-memory limiter is suitable for a single instance; use a shared Redis store if scaling to multiple instances.

## REST API

Protected routes require `Authorization: Bearer <backend-jwt>`. Registration creates the Firebase Auth user and Firestore profile. Login verifies the email and password through Firebase Identity Toolkit, so `FIREBASE_WEB_API_KEY` must be set. Logout increments the profile token version and invalidates previously issued backend JWTs.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create account and issue JWT |
| POST | `/api/auth/login` | Verify credentials and issue JWT |
| GET | `/api/auth/me` | Get current profile |
| POST | `/api/auth/logout` | Revoke current token generation |
| GET | `/api/users` | List users |
| GET | `/api/users/search?q=...` | Prefix-search user display names |
| GET | `/api/users/:userId` | Get a public profile |
| PATCH | `/api/users/me` | Update current profile |
| POST | `/api/users/me/fcm-token` | Save an FCM token |
| GET | `/api/chats` | List current user's chats |
| POST | `/api/chats` | Create or get a direct chat (`userId`) |
| POST | `/api/chats/group` | Create a group (`name`, `memberIds`) |
| GET | `/api/chats/:chatId` | Get chat details |
| PATCH | `/api/chats/:chatId` | Rename a group |
| POST | `/api/chats/:chatId/members` | Add a group member (`userId`) |
| DELETE | `/api/chats/:chatId/members/:userId` | Remove a group member |
| GET | `/api/chats/:chatId/messages` | Read history (`limit` up to 50, `cursor` is a message ID) |
| POST | `/api/chats/:chatId/messages` | Send a message |
| PATCH | `/api/chats/:chatId/messages/:messageId/read` | Mark a message read |
| DELETE | `/api/chats/:chatId/messages/:messageId` | Delete own message |
| POST | `/api/uploads/image` | Upload image as multipart field `file` |
| POST | `/api/uploads/file` | Upload file as multipart field `file` |
| POST | `/api/notifications` | Send/persist notification |
| GET | `/api/notifications` | List current user's notifications |

Uploads are limited to 10 MB. Image uploads accept JPEG, PNG, WebP, and GIF. File URLs use Firebase download tokens; protect token-bearing URLs as bearer credentials.

## Socket.IO

Connect with `auth: { token: '<backend-jwt>' }`. Events: `user:setup`, `chat:join`, `chat:leave`, `typing:start`, `typing:stop`, `message:send`, and `message:read`. The server emits `message:new`, `message:read`, `typing:update`, `user:online`, and `user:offline`. Use Socket.IO acknowledgements to receive `{ ok, ... }` results. Chat membership is checked before joining, typing, or sending.

Presence is tracked per socket connection in `presence/{uid}` so one device disconnecting does not mark a user offline while another is connected. Typing state is under `typing/{chatId}/{uid}` and is removed on disconnect.

## Firebase and Render
Deploy Firestore rules and indexes plus Realtime Database rules with the Firebase CLI from this directory. To resolve a missing chat-list index, run `npx firebase-tools deploy --only firestore:indexes --project YOUR_FIREBASE_PROJECT_ID` from `backend/`, then restart the backend and retry. Admin SDK requests bypass Firebase client Security Rules; the API performs its own JWT and chat membership checks. Client rules intentionally deny client writes to chat and message records; use this API for mutations. The current RTDB rules limit presence/typing reads to the owning user, while Socket.IO broadcasts online and typing events to connected clients/chat rooms.

Render uses `npm ci` and `npm start`. Set `FRONTEND_URL`, the Firebase project settings, API key, and service-account JSON in Render's secret environment settings. Do not put credentials in the repository. Add Redis-backed Socket.IO adapter and shared rate-limit storage before horizontally scaling beyond a single Render instance; in-memory Socket.IO rooms do not synchronize between instances.

## Current storage model

- `users/{uid}`: public profile fields plus server-managed FCM tokens and JWT token version.
- `chats/{chatId}`: type, members, roles, owner, timestamps, last-message preview.
- `chats/{chatId}/messages/{messageId}`: sender, text, attachments, read members, timestamps.
- Realtime Database `presence/{uid}` and `typing/{chatId}/{uid}`.

The `members + updatedAt` chat-list composite index is provided. Firestore automatically maintains single-field indexes for fields such as email, display name, and message creation time.