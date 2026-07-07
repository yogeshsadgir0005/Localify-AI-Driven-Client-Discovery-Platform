import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

/**
 * Route guard. While auth is rehydrating it renders a minimal loader.
 * If unauthenticated, redirects to /login and remembers where the user
 * was trying to go via location state.
 */
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
};

export default ProtectedRoute;
