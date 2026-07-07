# LocalBiz — Client (Frontend)

Vite + React 18 single-page app for the Local Business Discovery Platform.
Tailwind CSS v3, React Router v6, Zustand, React Hook Form + Zod, Motion
animations, and Google OAuth.

## Prerequisites

- **Node.js 18+**
- The **backend** running (see `../server`) at the URL in `VITE_API_BASE_URL`.

## Setup

```bash
cd client
npm install
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:5173
```

Other scripts:

```bash
npm run build     # production build into dist/
npm run preview   # preview the production build
```

## Environment variables (`.env`)

| Variable | Description |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL of the backend API, e.g. `http://localhost:5000/api`. |
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID (must match the server's). |

> All values are read via `import.meta.env.*`. No secrets are hardcoded.
> If `VITE_GOOGLE_CLIENT_ID` is omitted, the Google button shows a configuration
> hint instead of breaking the page.

## Getting a Google OAuth Client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. **APIs & Services → OAuth consent screen** → configure (External + test users).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application**.
4. Add `http://localhost:5173` under **Authorized JavaScript origins**.
5. Copy the **Client ID** into `VITE_GOOGLE_CLIENT_ID` here and into the server's
   `GOOGLE_CLIENT_ID`.

## AI summaries (Ollama)

AI summaries are produced by the backend using a local, free, open-source model
via [Ollama](https://ollama.com). They are optional from the frontend's point of
view — if Ollama is not running, the detail page shows a graceful message:

> AI summary unavailable — start Ollama locally (ollama run llama3) to enable this feature.

To enable them:

```bash
ollama pull llama3
ollama run llama3
```

## Project structure

```
src/
├── pages/        # route components (lazy-loaded)
├── components/   # BusinessCard, GoogleAuthButton, ProtectedRoute
├── layout/       # Navbar, Footer, Layout (+ offline banner)
├── hooks/        # useAuth, useBusinessSearch
├── store/        # Zustand auth store
└── utils/        # axios instance, India states/districts data
```

## Notes

- The design system uses a dark palette only — there is no pure white anywhere.
- All animations respect `prefers-reduced-motion`.
- Protected routes (`/address-setup`, `/search`, `/business/:placeId`) require
  authentication and redirect to `/login` otherwise.
- The JWT is stored in `localStorage` under `lbd_token` and attached to every
  API request; expired-token responses log the user out automatically.
