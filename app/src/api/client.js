import axios from 'axios';
import Constants from 'expo-constants';
import { useAuthStore } from '../store/authStore';

// Resolve the backend base URL. Priority:
//  1. EXPO_PUBLIC_API_BASE_URL env (set in an .env or eas secret)
//  2. app.json → expo.extra.apiBaseUrl
//  3. localhost fallback (simulator / web only — a physical device must use the
//     machine's LAN IP, e.g. http://192.168.1.5:5000/api, or the deployed URL).
const baseURL =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  Constants.expoConfig?.extra?.apiBaseUrl ||
  'http://localhost:5000/api';

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the bearer token from the store on every request.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on an expired session.
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;
    if (status === 401 && data?.expired) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);

export const getErrorMessage = (error, fallback = 'Something went wrong.') => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message === 'Network Error') return 'Cannot reach the server. Check your connection.';
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  return fallback;
};

export const API_BASE = baseURL;
export default api;
