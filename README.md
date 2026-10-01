<div align="center">

# Chatt

### A real-time chat application for private conversations and groups.

React · Express · Firebase · Socket.IO · Docker

</div>

---

## Overview

Chatt is a full-stack messaging application with account registration and sign-in, direct and group conversations, live message delivery, read receipts, typing indicators, presence, profile editing, and file/image attachments. The React client talks to an Express REST API and an authenticated Socket.IO connection. Firebase provides authentication and managed data, while the backend owns authorization and chat mutations.

This repository is developed on `dev` and promoted to `main` after validation and review. GitHub Actions runs CI for pushes and pull requests targeting either branch.

## Highlights

- Firebase Authentication account creation and credential verification, with backend-issued JWT access tokens.
- 24 REST endpoints covering authentication, user profiles, chats, messages, uploads, and notifications.
- Authenticated Socket.IO events for chat rooms, live messages, read receipts, typing state, and online status.
- Firestore message history with cursor pagination, capped at 50 messages per request.
- Firestore for users, chats, and chat messages; Realtime Database for presence and typing state; Firebase Storage for attachments; FCM for push delivery.
- Request validation, chat-membership authorization, Helmet, origin-restricted CORS, centralized errors, and layered API/auth/registration rate limits.
- Dockerized backend image with a health check, non-root runtime user, and secret files excluded from the image build context.
- Responsive React chat client with sign-in/register, inbox, people search, group creation, profile settings, attachments, and real-time conversation UI.

## Architecture

```text
Browser
  React + Vite
     | REST (JWT)                 | Socket.IO (JWT)
     +----------------------------+---------------------+
                                                        |
                                                Express backend
                                                        |
                     +------------------+---------------+----------------+
                     |                  |               |                |
               Firebase Auth        Firestore       Realtime DB      Storage / FCM
```

### Data model

| Store | Data |
| --- | --- |
| Firestore `users/{uid}` | Profile, FCM tokens, and server-managed token version |
| Firestore `chats/{chatId}` | Direct/group metadata, member IDs and roles, timestamps, last-message preview |
| Firestore `chats/{chatId}/messages/{messageId}` | Message body, attachments, sender, read members, and timestamps |
| Realtime Database `presence/{uid}` | Per-connection online state and last change |
| Realtime Database `typing/{chatId}/{uid}` | Per-user typing state in a chat |

The chat list uses a composite Firestore index on `members` and descending `updatedAt`. The index definition is in `backend/firestore.indexes.json`.

## Repository layout

```text
.
├── .github/workflows/ci.yml       # CI for main and dev
├── backend/
│   ├── Dockerfile                 # Production-oriented API image
│   ├── src/
│   │   ├── config/                # Environment and Firebase Admin setup
│   │   ├── middleware/            # JWT auth and upload validation
│   │   ├── routes/                # REST API route groups
│   │   ├── services/              # Shared chat authorization/helpers
│   │   └── sockets/               # Authenticated Socket.IO events
│   ├── firestore.rules
│   ├── firestore.indexes.json
│   └── database.rules.json
└── frontend/frontend/
    └── src/
        ├── components/            # Auth, inbox, conversation, settings UI
        └── lib/                   # REST client and Socket.IO loader
```

## Technology

- **Frontend:** React 19, Vite, JavaScript, Oxlint
- **Backend:** Node.js 20+, Express 4, Socket.IO 4, Zod
- **Identity:** Firebase Authentication + signed backend JWTs
- **Data and messaging:** Cloud Firestore, Firebase Realtime Database, Cloud Storage, Firebase Cloud Messaging
- **Delivery:** Docker image for the backend; GitHub Actions CI; Render backend and Vercel frontend are the intended deployment split

## Run locally

### Prerequisites

- Node.js 20 or newer and npm
- A Firebase project with Email/Password Authentication, Firestore, Realtime Database, and Storage enabled
- A Firebase Admin service account for local backend access

### Backend

```powershell
cd backend
Copy-Item .env.example .env
npm ci
npm run dev
```

Set the values in `backend/.env` before starting. Required values include `FRONTEND_URL`, a random `JWT_SECRET` of at least 32 characters, and `FIREBASE_PROJECT_ID`. Login also needs `FIREBASE_WEB_API_KEY`. Provide Firebase Admin credentials via `FIREBASE_SERVICE_ACCOUNT_JSON` or place a local `serviceAccountKey.json` in `backend/`. Never commit `.env` or service-account credentials.

The API listens on port `3000` by default. Check it with:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

### Frontend

Open another terminal:

```powershell
cd frontend/frontend
Copy-Item .env.example .env
npm ci
npm run dev
```

Set `VITE_API_URL=http://localhost:3000` in the frontend `.env`. Vite may choose a different port if its default is occupied; use that exact origin for backend `FRONTEND_URL`, then restart the backend/container. The frontend URL must match CORS configuration exactly, including the port.

## Docker backend

Build from the backend directory:

```powershell
cd backend
docker build -t chatt-backend:local .
```

Run locally with the environment file and mount the service account read-only at runtime:

```powershell
docker run --rm --name chatt-backend-local `
  -p 3000:3000 `
  --env-file .env `
  --mount "type=bind,source=$((Resolve-Path .\serviceAccountKey.json).Path),target=/app/serviceAccountKey.json,readonly" `
  chatt-backend:local
```

Do not copy credentials into the image. `backend/.dockerignore` excludes environment files, service-account keys, dependencies, and Git metadata. Confirm the running container with `docker ps` and `http://localhost:3000/health`.

## API and real-time interface

All protected REST routes require `Authorization: Bearer <JWT>`. The API is grouped under:

| Base path | Capabilities |
| --- | --- |
| `/api/auth` | Register, login, current profile, logout |
| `/api/users` | List/search users, public profile, edit own profile, register FCM token |
| `/api/chats` | List/create direct chats, create groups, details, rename, manage members |
| `/api/chats/:chatId/messages` | Cursor-paginated history, send, mark read, delete own message |
| `/api/uploads` | Image and general file uploads (10 MB maximum) |
| `/api/notifications` | Send and list notifications |

Message history defaults to 50 and cannot exceed 50 per page. Cursor values are message document IDs.

Socket.IO authenticates with `auth: { token }`. Client events include `user:setup`, `chat:join`, `chat:leave`, `typing:start`, `typing:stop`, `message:send`, and `message:read`. Server events include `message:new`, `message:read`, `message:deleted`, `typing:update`, `user:online`, and `user:offline`.

## Security and limits

- CORS allows the configured frontend origin; use the exact deployed Vercel origin in production.
- REST and Socket.IO requests require backend JWT validation; chat reads and mutations check membership.
- Firebase Admin credentials and JWT secrets belong in local ignored environment files or hosting-provider secret settings, never in Git or a Docker image.
- Request limits are 600 API requests per IP/15 minutes, 120 authentication requests per IP/15 minutes, and 100 registrations per IP/hour. These are request-abuse limits, not a concurrent-user cap.
- The current rate limiter is in-memory and intended for one backend instance. Before horizontal scaling, use a shared Redis rate-limit store and Socket.IO Redis adapter; account for sticky sessions if Socket.IO polling is enabled.
- Firebase Admin SDK bypasses client Firebase Security Rules, so backend authorization checks remain essential.

## CI and release workflow

The workflow in `.github/workflows/ci.yml` runs on pushes and pull requests targeting `dev` or `main`. It installs locked dependencies, runs lint/test scripts when present, and builds the frontend. At present, there are no dedicated automated test scripts in either package; backend CI does not invoke the separate `npm run check` syntax script.

Recommended promotion flow:

1. Create feature work from `dev` and push changes to `dev`.
2. Review the changes and let the `dev` CI run; locally run the backend syntax check and frontend production build as well.
3. Open a pull request from `dev` to `main`. Review and merge only after checks pass.
4. Treat `main` as the release branch. Deploy the reviewed `main` revision and verify `/health` plus login, chat, and Socket.IO behavior.

This is a branch/release process, not an assertion that branch protection or automatic deployment is already configured. Enable required PR reviews/status checks in GitHub branch protection for enforced production controls.

## Deployment

The intended hosting split is a Docker-based backend on Render and the Vite frontend on Vercel. Configure Render's Docker service with the repository's `backend/` directory as its root/build context. Put all Firebase and JWT settings in Render's secret environment configuration; do not upload local `.env` or `serviceAccountKey.json` files.

Set frontend `VITE_API_URL` to the deployed Render API origin and backend `FRONTEND_URL` to the deployed Vercel origin. Deploy Firestore rules and indexes from `backend/` with the Firebase CLI. `backend/render.yaml` currently describes Render's Node runtime rather than Docker; use Render's Docker service configuration or update the Blueprint before using it for deployment.

## Current scope and next production steps

This is a functional full-stack MVP with containerized backend, Firebase-backed persistence, REST and real-time messaging, and CI checks. The following are not yet configured in the repository: automatic Render/Vercel deployment, enforced GitHub branch protections, automated API/integration tests, shared Redis infrastructure for multi-instance Socket.IO/rate limiting, and production monitoring/load testing. Add and validate these before describing the system as horizontally scaled or fully production-hardened.

## Resume summary

**Chatt — Real-Time Chat Application:** Built a full-stack React and Node.js messaging app with Firebase Authentication, JWT-protected REST APIs, Firestore persistence, Socket.IO live messaging/presence/read receipts, file uploads, and a Dockerized backend. Added request validation, membership-based authorization, security headers, CORS controls, rate limiting, Firestore rules/indexes, and GitHub Actions CI with a `dev`-to-`main` release workflow.
