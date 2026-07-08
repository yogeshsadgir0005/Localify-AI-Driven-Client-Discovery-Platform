import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Routes,
  Route,
  Navigate,
  Link,
  useLocation,
} from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';
import Layout from './layout/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Route-level lazy loading.
const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const BusinessDetailPage = lazy(() => import('./pages/BusinessDetailPage'));
const GeneratedWebsitePage = lazy(() => import('./pages/GeneratedWebsitePage'));
const WebsiteGeneratorPage = lazy(() => import('./pages/WebsiteGeneratorPage'));

const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const ModerationPage = lazy(() => import('./pages/ModerationPage'));
const ProfileDetailPage = lazy(() => import('./pages/ProfileDetailPage'));
const RequirementsPage = lazy(() => import('./pages/RequirementsPage'));
const AddressSetupPage = lazy(() => import('./pages/AddressSetupPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const SubscriptionsPage = lazy(() => import('./pages/SubscriptionsPage'));


const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/* ---------------------------------------------------------------------------
 * Persistent animated background
 *
 * Mounted ONCE at the app root so it never unmounts between routes. It picks a
 * "scene" from the current route (and, on the landing page, the scroll phase),
 * and cross-fades between scenes — so scrolling and navigating feel like one
 * continuous, morphing surface while each section/page has its own motion.
 * ------------------------------------------------------------------------- */

const useScene = () => {
  const location = useLocation();
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    // On the landing page, the only scene change is hero -> rest (once you
    // scroll past the hero). Every other page keeps a single consistent scene.
    if (location.pathname !== '/') {
      setPastHero(false);
      return undefined;
    }
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPastHero(window.scrollY > window.innerHeight * 0.6);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [location.pathname]);

  const { pathname } = location;
  if (pathname === '/') return pastHero ? 'landing-rest' : 'landing-hero';
  if (pathname.startsWith('/business')) return 'detail';
  if (pathname.startsWith('/search') || pathname.startsWith('/find')) return 'search';

  if (pathname.startsWith('/address')) return 'location';
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/forgot')
  ) {
    return 'auth';
  }
  return 'misc';
};

const glow = (cls) => (
  <div className={`absolute rounded-full blur-3xl will-change-transform ${cls}`} />
);

// A drifting pattern fills an oversized box (-inset-20) so its transform loop
// never reveals an edge.
const pattern = (cls, opacity) => (
  <div className={`absolute -inset-20 ${cls} ${opacity}`} />
);

// A centered, self-rotating conic glow. The rotation lives on an inner element
// so it doesn't fight the centering transform on the wrapper.
const conic = (size, opacity, position = 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2') => (
  <div className={`absolute ${position} ${size}`}>
    <div className={`absolute inset-0 fx-conic ${opacity}`} />
  </div>
);

// Each scene renders one lightweight pattern plus a couple of glows.
const SCENES = {
  // Landing — hero: grid + sweeping light lines
  'landing-hero': (
    <>
      {pattern('fx-grid', 'opacity-70')}
      {glow('-left-40 -top-32 h-[34rem] w-[34rem] bg-glow-primary animate-aurora-1')}
      {glow('-right-40 top-1/4 h-[32rem] w-[32rem] bg-glow-accent animate-aurora-2')}
      <div className="absolute left-0 top-1/3 h-px w-full bg-gradient-to-r from-transparent via-primary/50 to-transparent animate-sweep-x" />
      <div className="absolute left-2/3 top-0 h-full w-px bg-gradient-to-b from-transparent via-accent/40 to-transparent animate-sweep-y" />
    </>
  ),
  // Landing — everything after the hero: one consistent, calm background
  'landing-rest': (
    <>
      {pattern('fx-dots', 'opacity-60')}
      {glow('-left-40 top-1/4 h-[34rem] w-[34rem] bg-glow-primary animate-aurora-1')}
      {glow('-right-40 bottom-0 h-[32rem] w-[32rem] bg-glow-accent animate-aurora-2')}
    </>
  ),
  // Auth pages: soft drifting glows (no repeating pattern)
  auth: (
    <>
      {glow('left-1/4 -top-24 h-[34rem] w-[34rem] bg-glow-primary opacity-80 animate-aurora-3')}
      {glow('right-1/4 bottom-[-6rem] h-[30rem] w-[30rem] bg-glow-accent opacity-80 animate-aurora-1')}
    </>
  ),
  // Address setup: dot field (accent)
  location: (
    <>
      {pattern('fx-dots', 'opacity-70')}
      {glow('-left-32 -top-24 h-[30rem] w-[30rem] bg-glow-accent animate-aurora-3')}
      {glow('-right-32 bottom-0 h-[28rem] w-[28rem] bg-glow-primary animate-aurora-2')}
    </>
  ),
  // Search: diagonal stripes + glows
  search: (
    <>
      {pattern('fx-diagonal', 'opacity-50')}
      {glow('-right-40 -top-24 h-[34rem] w-[34rem] bg-glow-primary animate-aurora-2')}
      {glow('-left-40 bottom-0 h-[30rem] w-[30rem] bg-glow-accent animate-aurora-1')}
    </>
  ),
  // Business detail: rotating conic + faint grid
  detail: (
    <>
      {conic('h-[44rem] w-[44rem]', 'opacity-70', 'left-1/2 top-0 -translate-x-1/2')}
      {pattern('fx-grid', 'opacity-25')}
    </>
  ),
  // Fallback: soft glows
  misc: (
    <>
      {glow('left-1/3 -top-20 h-[32rem] w-[32rem] bg-glow-primary opacity-70 animate-aurora-2')}
      {glow('right-1/4 bottom-0 h-[28rem] w-[28rem] bg-glow-accent opacity-70 animate-aurora-3')}
    </>
  ),
};

const BackgroundFX = () => {
  const scene = useScene();
  // Keep at most two layers: the current scene and the one fading out. Only
  // these render/animate at a time — far lighter than mounting every scene.
  const [layers, setLayers] = useState([{ id: 0, scene }]);
  const idRef = useRef(0);

  useEffect(() => {
    setLayers((prev) => {
      if (prev[prev.length - 1].scene === scene) return prev;
      idRef.current += 1;
      return [...prev, { id: idRef.current, scene }].slice(-2);
    });
  }, [scene]);

  // Once the incoming layer has finished fading in, drop the outgoing one.
  useEffect(() => {
    if (layers.length < 2) return undefined;
    const t = setTimeout(() => setLayers((p) => p.slice(-1)), 950);
    return () => clearTimeout(t);
  }, [layers]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-bg"
    >
      {/* Persistent base glows so cross-fades never reveal flat black. */}
      {glow('-left-48 -top-48 h-[40rem] w-[40rem] bg-glow-primary opacity-60 animate-aurora-1')}
      {glow('-right-48 -bottom-48 h-[38rem] w-[38rem] bg-glow-accent opacity-60 animate-aurora-2')}

      {layers.map((l, i) => (
        <div
          key={l.id}
          className={`absolute inset-0 ${
            i === layers.length - 1 ? 'animate-scene-in' : ''
          }`}
        >
          {SCENES[l.scene] || SCENES.misc}
        </div>
      ))}

      {/* Vignette keeps edges calm and text readable. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,#0D0F14_100%)]" />
    </div>
  );
};

/** Full-screen dark pulse fallback while a route chunk loads. */
const PageSkeleton = () => (
  <div className="flex min-h-screen items-center justify-center bg-bg">
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
      <div className="h-3 w-32 animate-pulse rounded-full bg-surface-2" />
    </div>
  </div>
);

/** Minimal static page used for footer stubs. */
const StubPage = ({ title, children }) => (
  <Layout>
    <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-text">{title}</h1>
      <p className="mt-4 leading-relaxed text-text-muted">{children}</p>
      <Link to="/" className="btn-ghost mt-8">
        Back home
      </Link>
    </section>
  </Layout>
);

/** Router-level error boundary (class component — no extra dependency). */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
          <AlertTriangle className="h-10 w-10 text-error" />
          <h1 className="font-display text-2xl font-bold text-text">
            Something went wrong
          </h1>
          <p className="max-w-md text-text-muted">
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => {
              this.handleReset();
              window.location.assign('/');
            }}
            className="btn-primary mt-2"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => {
  useEffect(() => {
    import('./store/authStore').then(({ useAuthStore }) => {
      const token = useAuthStore.getState().token;
      if (token) {
        import('./utils/axios').then(({ default: api }) => {
          api.get('/auth/profile').then(({ data }) => {
            useAuthStore.getState().setUser(data.user);
          }).catch(() => {});
        });
      }
    });
  }, []);

  return (
    <HelmetProvider>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <ErrorBoundary>
        <BackgroundFX />
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: '#161A23',
              color: '#E8EAF0',
              border: '1px solid #2A3142',
            },
            success: { iconTheme: { primary: '#00D4AA', secondary: '#0D0F14' } },
            error: { iconTheme: { primary: '#FF5370', secondary: '#0D0F14' } },
          }}
        />
        <Suspense fallback={<PageSkeleton />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route
              path="/address-setup"
              element={
                <ProtectedRoute>
                  <AddressSetupPage />
                </ProtectedRoute>
              }
            />


            <Route
              path="/search"
              element={
                <ProtectedRoute>
                  <SearchPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/business/website/:placeId"
              element={
                <ProtectedRoute requireAuth={true}>
                  <GeneratedWebsitePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/business/:placeId/generate-website"
              element={
                <ProtectedRoute requireAuth={true}>
                  <WebsiteGeneratorPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/business/:placeId"
              element={
                <ProtectedRoute>
                  <BusinessDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/moderation"
              element={
                <ProtectedRoute>
                  <ModerationPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/requirements"
              element={
                <ProtectedRoute>
                  <RequirementsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/subscriptions"
              element={
                <ProtectedRoute>
                  <SubscriptionsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profiles/:id"
              element={
                <ProtectedRoute>
                  <ProfileDetailPage />
                </ProtectedRoute>
              }
            />

            {/* Footer stubs */}
            <Route
              path="/about"
              element={
                <StubPage title="About Localify">
                  Localify helps you discover offline-only local businesses and
                  shops that don&apos;t have a website, surfacing their contact
                  details and an AI-generated summary so you can connect directly.
                </StubPage>
              }
            />
            <Route
              path="/privacy"
              element={
                <StubPage title="Privacy Policy">
                  We store only the account details you provide and your saved
                  location. We never sell your data.
                </StubPage>
              }
            />
            <Route
              path="/terms"
              element={
                <StubPage title="Terms of Service">
                  Localify is provided as-is for discovering local businesses.
                  Business data is sourced from Google Maps.
                </StubPage>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </GoogleOAuthProvider>
  </HelmetProvider>
  );
};

export default App;
