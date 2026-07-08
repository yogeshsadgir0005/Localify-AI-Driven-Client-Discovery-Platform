import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api, { getErrorMessage } from '../utils/axios';

/**
 * Auth helper hook wrapping the Zustand store and the API.
 * All functions return { ok, user?, error? } so callers can branch cleanly.
 */
export const useAuth = () => {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setUser = useAuthStore((s) => s.setUser);
  const logoutStore = useAuthStore((s) => s.logout);

  const login = useCallback(
    async (email, password) => {
      try {
        const { data } = await api.post('/auth/login', { email, password });
        setAuth(data.user, data.token);
        return { ok: true, user: data.user };
      } catch (err) {
        return { ok: false, error: getErrorMessage(err, 'Login failed.') };
      }
    },
    [setAuth]
  );

  const signup = useCallback(
    async ({ name, email, password }) => {
      try {
        const { data } = await api.post('/auth/register', {
          name,
          email,
          password,
        });
        // Registration now requires OTP verification, so we don't log in yet.
        return { ok: true, requiresOtp: data.requiresOtp };
      } catch (err) {
        return { ok: false, error: getErrorMessage(err, 'Sign up failed.') };
      }
    },
    []
  );

  const verifySignupOtp = useCallback(
    async (email, otp) => {
      try {
        const { data } = await api.post('/auth/verify-signup-otp', { email, otp });
        setAuth(data.user, data.token);
        return { ok: true, user: data.user };
      } catch (err) {
        return { ok: false, error: getErrorMessage(err, 'OTP verification failed.') };
      }
    },
    [setAuth]
  );

  const loginWithGoogle = useCallback(
    async (credential) => {
      try {
        const { data } = await api.post('/auth/google', { credential });
        setAuth(data.user, data.token);
        return { ok: true, user: data.user };
      } catch (err) {
        return {
          ok: false,
          error: getErrorMessage(err, 'Google sign-in failed.'),
        };
      }
    },
    [setAuth]
  );

  const refreshProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/profile');
      setUser(data.user);
      return { ok: true, user: data.user };
    } catch (err) {
      return { ok: false, error: getErrorMessage(err) };
    }
  }, [setUser]);

  const saveAddress = useCallback(
    async (address) => {
      try {
        const { data } = await api.put('/auth/update-address', address);
        setUser(data.user);
        return { ok: true, user: data.user };
      } catch (err) {
        if (err.response?.data?.user) {
          setUser(err.response.data.user);
        }
        return {
          ok: false,
          error: getErrorMessage(err, 'Could not save address.'),
        };
      }
    },
    [setUser]
  );

  const logout = useCallback(() => {
    logoutStore();
  }, [logoutStore]);

  const hasAddress = Boolean(
    user?.address?.country && user?.address?.state && user?.address?.district
  );

  return {
    user,
    token,
    isAuthenticated,
    isLoading,
    hasAddress,
    login,
    signup,
    verifySignupOtp,
    loginWithGoogle,
    refreshProfile,
    saveAddress,
    logout,
  };
};

export default useAuth;
