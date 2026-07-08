# LocalBiz — Server (Backend API)

Express + MongoDB API for the Local Business Discovery Platform. It handles
authentication (JWT + bcrypt, plus Google OAuth), Google Maps Places search for
website-less local businesses, and AI features via a free hosted LLM (Groq).

All external services use free / open-source tiers. See
[`docs/FREE_SETUP_GUIDE.md`](../docs/FREE_SETUP_GUIDE.md) for a step-by-step
walkthrough of every credential.

## Prerequisites

- **Node.js 18+**
- **MongoDB** — free Atlas M0 cluster or a local instance
- **Groq API key** (optional, free — for AI features) — https://console.groq.com
- **Brevo API key** (optional, free — for email OTP) — https://app.brevo.com

## Setup

```bash
cd server
npm install
cp .env.example .env   # then fill in the values
npm run dev            # starts with nodemon on http://localhost:5000
```

`npm start` runs without nodemon (for production).

## Environment variables (`.env`)

| Variable | Description |
| --- | --- |
| `PORT` | Port the API listens on (default `5000`). |
| `MONGODB_URI` | MongoDB connection string, e.g. `mongodb://localhost:27017/localbiz`. |
| `JWT_SECRET` | Secret for signing JWTs. Use **at least 32 characters**. |
| `JWT_EXPIRES_IN` | Token lifetime, e.g. `7d`. |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (must match the client). |

| `GOOGLE_MAPS_API_KEY` | API key with **Places API** enabled. |
| `FRONTEND_URL` | Allowed CORS origin, e.g. `http://localhost:5173`. |
| `GROQ_API_KEY` | Free Groq key for the LLM path (parse/draft/summaries). Blank = heuristic fallbacks. |
| `GROQ_MODEL` | Groq model id (default `llama-3.3-70b-versatile`). |
| `BREVO_API_KEY` | Free Brevo key for email OTP + notifications. Blank = dev-console OTP. |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | Verified Brevo sender address + display name. |
| `BCRYPT_ROUNDS` | bcrypt cost factor (default `12`). |
| `NODE_ENV` | `development` or `production`. |

> **Never commit your real `.env`.** Only `.env.example` is tracked.

## Getting a Google Maps API key (free tier)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (or select one).
3. **APIs & Services → Library** → enable **Places API**.
4. **APIs & Services → Credentials → Create credentials → API key**.
5. (Recommended) Restrict the key to the Places API.
6. Put the key in `GOOGLE_MAPS_API_KEY`.

The free tier includes a monthly credit that comfortably covers development use.

## Getting Google OAuth credentials

1. In the same project, go to **APIs & Services → Credentials**.
2. Configure the **OAuth consent screen** (External, add your email as a test user).
3. **Create credentials → OAuth client ID → Web application**.
4. Add `http://localhost:5173` to **Authorized JavaScript origins**.
5. Copy the **Client ID** and **Client secret** into `.env` (and the client's
   `VITE_GOOGLE_CLIENT_ID`).

## AI features (free hosted LLM — Groq)

AI features (requirement parsing, intro drafts, business/review summaries) run on
**Groq**, a free hosted API serving open-source Llama models. They are optional —
if `GROQ_API_KEY` is unset, every AI call degrades to a deterministic
heuristic/template, so the app still works.

1. Sign up (free, no card) at https://console.groq.com.
2. **API Keys → Create API Key**, copy it into `GROQ_API_KEY`.
3. (Optional) pick a different model via `GROQ_MODEL`.

Email OTP + notifications use **Brevo** (free 300/day). Full walkthrough for both,
plus MongoDB Atlas and Google, is in
[`docs/FREE_SETUP_GUIDE.md`](../docs/FREE_SETUP_GUIDE.md).

## API overview

```
GET  /api/health

POST /api/auth/register
POST /api/auth/login
POST /api/auth/google
POST /api/auth/forgot-password   # OTP is logged to the server console (dev)
POST /api/auth/reset-password
PUT  /api/auth/update-address    [auth]
GET  /api/auth/profile           [auth]

GET  /api/business/search?city=&district=&state=   [auth]
GET  /api/business/:placeId                         [auth]

POST /api/summary/:placeId                          [auth]
```

## Notes

- Search results are cached in MongoDB for 24h (TTL index auto-purges them).
- Business details are cached in-memory for 6h (`node-cache`).
- Only businesses **without a website** are returned — that is the core feature.
- Google Maps does not expose business emails on the free tier, so `email` is
  always `null` with an explanatory `emailNote` in the response.
