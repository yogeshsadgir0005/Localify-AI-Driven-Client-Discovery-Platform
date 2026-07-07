import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';

const hasClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

/**
 * Google OAuth button.
 * Uses @react-oauth/google's GoogleLogin and forwards the credential to the
 * backend via useAuth().loginWithGoogle. Calls onSuccess(user) on success.
 */
const GoogleAuthButton = ({ onSuccess, text = 'continue_with' }) => {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  if (!hasClientId) {
    // Graceful, non-white fallback when OAuth is not configured.
    return (
      <div className="rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-sm text-text-muted">
        Google sign-in is not configured. Set{' '}
        <code className="text-text">VITE_GOOGLE_CLIENT_ID</code> to enable it.
      </div>
    );
  }

  const handleSuccess = async (credentialResponse) => {
    const credential = credentialResponse?.credential;
    if (!credential) {
      toast.error('No Google credential received.');
      return;
    }
    setBusy(true);
    const res = await loginWithGoogle(credential);
    setBusy(false);
    if (res.ok) {
      toast.success('Signed in with Google.');
      onSuccess?.(res.user);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <div className="relative">
      {/* The library renders its own iframe-based button; we center it. */}
      <div
        className={`flex justify-center [color-scheme:light] ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <GoogleLogin
          onSuccess={handleSuccess}
          onError={() => toast.error('Google sign-in failed. Please try again.')}
          theme="filled_black"
          shape="pill"
          text={text}
          width="320"
        />
      </div>
    </div>
  );
};

export default GoogleAuthButton;
