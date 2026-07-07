import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import Navbar from './Navbar';
import Footer from './Footer';

/**
 * Small banner shown when the browser goes offline.
 */
const OfflineBanner = () => {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-error/15 px-4 py-2 text-center text-sm text-error">
      <WifiOff className="h-4 w-4" />
      You&apos;re offline. Some features may not work until you reconnect.
    </div>
  );
};

/**
 * App shell: offline banner, navbar, main, footer.
 * The animated background is rendered once at the app root (see App.jsx).
 */
const Layout = ({ children }) => (
  <div className="relative flex min-h-screen flex-col">
    <OfflineBanner />
    <Navbar />
    <main className="flex-1">{children}</main>
    <Footer />
  </div>
);

export default Layout;
