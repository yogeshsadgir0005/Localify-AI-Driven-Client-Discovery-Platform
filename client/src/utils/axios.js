import axios from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore, TOKEN_KEY } from '../store/authStore';

const baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the bearer token from the store (falling back to localStorage).
api.interceptors.request.use((config) => {
  const token =
    useAuthStore.getState().token || localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Guard so we only fire the "session expired" flow once per burst of 401s.
let handlingExpiry = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const data = error.response?.data;

    if (status === 401 && data?.expired && !handlingExpiry) {
      handlingExpiry = true;
      useAuthStore.getState().logout();
      toast.error('Session expired, please log in again.');
      // Redirect to login, preserving the attempted path is handled by routes.
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
      setTimeout(() => {
        handlingExpiry = false;
      }, 2000);
    }

    return Promise.reject(error);
  }
);

/**
 * Normalize an axios error into a user-facing message.
 */
export const getErrorMessage = (error, fallback = 'Something went wrong.') => {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.message === 'Network Error') {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return fallback;
};

export default api;
