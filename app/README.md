# Localify — Mobile App

The React Native (Expo) app version of Localify. It shares the **same backend**
(`/server`) as the website (`/client`) and mirrors its dark theme, glow
animations and features: discover local businesses, view details, contact them,
and generate / preview AI websites.

## Stack
- **Expo** (SDK 51) + React Native 0.74
- **React Navigation** (native-stack + bottom-tabs)
- **Zustand** for auth state, **expo-secure-store** for token persistence
- **axios** against the same REST API as the web client
- **Moti + Reanimated** for the entrance & glow animations
- **react-native-webview** to render generated websites

## Getting started

```bash
cd app
npm install          # or: yarn
cp .env.example .env  # then set EXPO_PUBLIC_API_BASE_URL to your backend
npm start            # opens Expo Dev Tools; press a (Android), i (iOS), or scan the QR in Expo Go
```

### Pointing at the backend
Set `EXPO_PUBLIC_API_BASE_URL` in `.env` (see `.env.example`):
- Android emulator → `http://10.0.2.2:5000/api`
- iOS simulator → `http://localhost:5000/api`
- Physical device (Expo Go) → your machine's LAN IP, e.g. `http://192.168.1.5:5000/api`
- Production → your deployed backend, e.g. `https://your-backend.onrender.com/api`

The backend must be running (`cd server && npm run dev`) and reachable from the device.

## What's included
| Screen | Purpose |
| --- | --- |
| Login / Signup (+OTP) | `POST /auth/login`, `/auth/register`, `/auth/verify-signup-otp` |
| Address setup | `PUT /auth/update-address` (search needs country/state/district) |
| Discover (Search) | `GET /business/search` with keyword + category + no-website filters |
| Business detail | `GET /business/:placeId` — photos, reviews, call, directions |
| AI website | `POST /website/:placeId/generate` → preview via WebView (`GET /website/:placeId`) |
| Notifications | `GET /notifications` |
| Profile | plan/credits, edit area, sign out |

## Structure
```
app/
  App.js                 # fonts, auth rehydrate, NavigationContainer
  src/
    api/client.js        # axios + token interceptor (same endpoints as web)
    store/authStore.js   # zustand + SecureStore
    theme/colors.js      # mirrors client/tailwind.config.js
    navigation/          # auth stack ↔ tabs ↔ detail stack
    components/          # GlowBackground, ui primitives, BusinessCard
    screens/             # all screens
    utils/               # photo URLs, categories, survey questions
```

Notes:
- Website generation is a long request on mobile (a few minutes); the app shows a
  building overlay and opens the WebView preview when done.
- Photo URLs are auto-rewritten to the configured backend origin so images load
  even if a stored site baked in a different host.
