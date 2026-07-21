import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'lbd_token';
const USER_KEY = 'lbd_user';

const save = async (key, value) => {
  try {
    if (value == null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    /* SecureStore can throw on web/unsupported — ignore, state still lives in memory */
  }
};

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true, // true until we rehydrate from secure storage

  setAuth: (user, token) => {
    save(TOKEN_KEY, token || null);
    save(USER_KEY, user ? JSON.stringify(user) : null);
    set({ user: user || null, token: token || null, isAuthenticated: Boolean(token), isLoading: false });
  },

  setUser: (user) => {
    save(USER_KEY, user ? JSON.stringify(user) : null);
    set({ user: user || null });
  },

  logout: () => {
    save(TOKEN_KEY, null);
    save(USER_KEY, null);
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  // Rehydrate from secure storage on launch.
  init: async () => {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      const rawUser = await SecureStore.getItemAsync(USER_KEY);
      const user = rawUser ? JSON.parse(rawUser) : null;
      set({ token: token || null, user, isAuthenticated: Boolean(token), isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },
}));

export const hasAddress = (user) =>
  Boolean(user?.address?.country && user?.address?.state && user?.address?.district);
