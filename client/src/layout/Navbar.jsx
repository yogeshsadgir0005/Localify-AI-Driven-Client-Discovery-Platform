import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Menu, X, MapPin, LogOut, Search, Bell, ShieldCheck, Settings, FileText, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import NotificationBell from '../components/NotificationBell';
import Logo from '../components/Logo';

const initials = (name) =>
  (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

const Navbar = () => {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  const handleLogout = () => {
    logout();
    setOpen(false);
    toast.success('Signed out.');
    navigate('/');
  };

  const navLinkClass = ({ isActive }) =>
    `relative px-1 py-1 text-sm font-medium transition ${
      isActive ? 'text-text' : 'text-text-muted hover:text-text'
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Logo />

        {/* Desktop links */}
        <div className="hidden items-center gap-5 md:flex">
          {isAuthenticated ? (
            <>
              {isAdmin && (
                <NavLink to="/moderation" className={navLinkClass}>Moderation</NavLink>
              )}
              <NavLink to="/search" className={navLinkClass}>
                {({ isActive }) => (
                  <span className="relative inline-flex flex-col items-center">
                    Search
                    {isActive && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute -bottom-2 h-0.5 w-full rounded-full bg-primary"
                      />
                    )}
                  </span>
                )}
              </NavLink>
              <NavLink to="/subscriptions" className={navLinkClass}>
                {({ isActive }) => (
                  <span className="relative inline-flex flex-col items-center text-accent">
                    Pricing
                    {isActive && (
                      <motion.span
                        layoutId="nav-underline"
                        className="absolute -bottom-2 h-0.5 w-full rounded-full bg-accent"
                      />
                    )}
                  </span>
                )}
              </NavLink>
              <div className="flex items-center gap-3">
                <Link
                  to="/settings"
                  aria-label="Settings"
                  className="grid h-9 w-9 place-items-center rounded-full text-text-muted transition hover:bg-surface-2 hover:text-text"
                >
                  <Settings className="h-5 w-5" />
                </Link>
                <NotificationBell />
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-primary ring-1 ring-border">
                  {initials(user?.name)}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="btn-ghost px-4 py-2 text-sm"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-text-muted transition hover:text-text"
              >
                Login
              </Link>
              <Link to="/signup" className="btn-primary px-4 py-2 text-sm">
                Get Started
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
          className="grid h-10 w-10 place-items-center rounded-xl border border-border text-text md:hidden"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-border bg-bg/95 md:hidden"
          >
            <div className="flex flex-col gap-2 px-4 py-4">
              {isAuthenticated ? (
                <>
                  <Link
                    to="/notifications"
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-start"
                  >
                    <Bell className="h-4 w-4" /> Notifications
                  </Link>
                  <Link
                    to="/requirements"
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-start"
                  >
                    <FileText className="h-4 w-4" /> My requests
                  </Link>
                  <Link
                    to="/settings"
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-start"
                  >
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                  <Link
                    to="/subscriptions"
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-start text-accent"
                  >
                    <Sparkles className="h-4 w-4" /> Pricing
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/moderation"
                      onClick={() => setOpen(false)}
                      className="btn-ghost justify-start"
                    >
                      <ShieldCheck className="h-4 w-4" /> Moderation
                    </Link>
                  )}
                  <Link
                    to="/search"
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-start"
                  >
                    <Search className="h-4 w-4" /> Search
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="btn-ghost justify-start"
                  >
                    <LogOut className="h-4 w-4" /> Sign Out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="btn-ghost justify-start"
                  >
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setOpen(false)}
                    className="btn-primary justify-start"
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Navbar;
