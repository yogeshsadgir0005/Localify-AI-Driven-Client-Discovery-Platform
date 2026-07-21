import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import api, { API_BASE, getErrorMessage } from '../api/client';
import { useAuthStore } from '../store/authStore';

// Ensures the auth session resolves if the app was reopened via the redirect.
WebBrowser.maybeCompleteAuthSession();

// The Google flow runs SERVER-SIDE: the app opens the backend's mobile-start
// URL, Google redirects to the backend's HTTPS callback (registered in the
// Google console), the backend exchanges the code and bounces back into the app
// with our JWT. This is the one Google flow that works inside Expo Go.
//
// It must hit an HTTPS backend Google can redirect to. Defaults to the API base;
// set EXPO_PUBLIC_OAUTH_BASE_URL to your deployed https backend (including /api)
// so it completes on a physical phone (a local http:// LAN backend is rejected
// by Google's redirect rules).
const oauthBase = (process.env.EXPO_PUBLIC_OAUTH_BASE_URL || API_BASE).replace(/\/+$/, '');

// Show the button whenever Google is wired up (client id present OR an oauth
// base override is set). The backend-redirect flow works in Expo Go, so there
// is no Expo Go gating anymore.
export const googleConfigured =
  Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) ||
  Boolean(process.env.EXPO_PUBLIC_OAUTH_BASE_URL);
export const googleAvailable = googleConfigured;

/**
 * Opens the Google sign-in flow and, on success, sets auth. Returns
 * { ok, error?, cancelled? }.
 */
export async function signInWithGoogle() {
  try {
    const returnUrl = Linking.createURL('auth'); // exp://.../--/auth  or  localify://auth
    const startUrl = `${oauthBase}/auth/google/mobile-start?returnUrl=${encodeURIComponent(returnUrl)}`;

    const result = await WebBrowser.openAuthSessionAsync(startUrl, returnUrl);
    if (result.type !== 'success' || !result.url) {
      return { ok: false, cancelled: true };
    }

    const { queryParams } = Linking.parse(result.url);
    if (queryParams?.error) return { ok: false, error: String(queryParams.error) };

    const token = queryParams?.token;
    if (!token) return { ok: false, error: 'No sign-in token was returned.' };

    // Load the profile with the fresh token, then persist auth.
    const { data } = await api.get('/auth/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    useAuthStore.getState().setAuth(data.user, token);
    return { ok: true, user: data.user };
  } catch (e) {
    return { ok: false, error: getErrorMessage(e, 'Google sign-in failed.') };
  }
}

export default signInWithGoogle;
