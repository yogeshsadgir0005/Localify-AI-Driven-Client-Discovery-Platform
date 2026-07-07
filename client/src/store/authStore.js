import { create } from 'zustand';

const TOKEN_KEY = 'lbd_token';
const USER_KEY = 'lbd_user';

const safeParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const useAuthStore = create((set, get) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  // Starts true so ProtectedRoute can wait for rehydration before deciding.
  isLoading: true,

  /**
   * Persist auth and mark the user as authenticated.
   */
  setAuth: (user, token) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({
      user: user || null,
      token: token || null,
      isAuthenticated: Boolean(token),
      isLoading: false,
    });
  },

  /**
   * Merge fresh user fields (e.g. after profile refresh) without losing token.
   */
  setUser: (user) => {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ user: user || null });
  },

  /**
   * Update only the address sub-object on the current user.
   */
  updateAddress: (address) => {
    const { user } = get();
    if (!user) return;
    const next = { ...user, address };
    localStorage.setItem(USER_KEY, JSON.stringify(next));
    set({ user: next });
  },

  /**
   * Clear auth from memory and storage.
   */
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  },

  /**
   * Rehydrate auth state from localStorage on app load.
   */
  initFromStorage: () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const user = safeParse(localStorage.getItem(USER_KEY));
    set({
      token: token || null,
      user: user || null,
      isAuthenticated: Boolean(token),
      isLoading: false,
    });
  },
}));

export { TOKEN_KEY, USER_KEY };
