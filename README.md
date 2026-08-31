# Multi-Tenant System — Backend

Express + MongoDB REST API for the Multi-Tenant restaurant ordering system, with JWT auth, role-based authorization, and real-time updates over Socket.IO.

## Stack

Express 4 · Mongoose 7 · JWT (`jsonwebtoken`) · Joi / `express-validator` · Socket.IO · `node-cron` · `helmet` / `express-rate-limit` · Jest (configured, no tests yet)

## Getting started

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI, JWT_SECRET, PORT, CLIENT_URL, etc.
npm run dev             # nodemon, http://localhost:5000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Start with nodemon (auto-reload) |
| `npm start` | Start with plain `node` (production) |
| `npm test` | Run Jest |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run create-admin` / `create-superadmin` | Seed an admin/super-admin user |
| `npm run reset-admin-password` | Reset an admin's password |

## Folder structure

```
server/
├── app.js                 # Express app: middleware, routes, server bootstrap
├── config/
│   └── database.js        # Mongoose connection
├── routes/                # Express routers — one per resource, thin (validation + controller call)
├── controllers/           # Request/response handling, delegates business logic to services
├── services/               # Business logic, orchestrates repositories
├── repositories/           # Data-access layer — the only layer that talks to Mongoose models
├── models/                 # Mongoose schemas
├── middlewares/            # auth, authorization, error handling, request logging, rate limiting
├── utils/                  # JWT helpers, logger, socket setup, response formatting, validation schemas
├── jobs/                   # node-cron scheduled jobs
└── scripts/                 # One-off / operational CLI scripts (admin seeding, env validation, debugging)
```

Requests flow one direction only: **route → controller → service → repository → model**. Keep business logic out of controllers and data-access out of services — that separation is what makes each layer independently testable.

## API surface

Mounted under `/api`: `auth`, `user`, `order`, `report`, `activity-logs`, `menu`. `GET /api/health` is a liveness check; `GET /` returns basic API info.

## Environment variables

See [`.env.example`](.env.example) for the full list (database, JWT, mail, rate limiting, `CLIENT_URL` for CORS). Never commit `.env`.

## Notes

- `jest` is configured (`npm test`) but the project has no test files yet — add them under a `tests/` (or `__tests__`) folder as coverage is introduced.
- This repo is deployed independently from the frontend; see the top-level `README.md` one directory up for how the two apps relate.
