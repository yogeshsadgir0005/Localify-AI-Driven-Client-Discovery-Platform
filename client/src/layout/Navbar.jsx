import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Menu, X, MapPin, LogOut, Search, Bell, ShieldCheck, Settings, FileText, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import NotificationBell from '../components/NotificationBell';
import Logo from '../components/Logo';
import { prefersReducedMotion } from '../animations/utilities';

gsap.registerPlugin(ScrollTrigger);

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
  const [open, setOpen] = useState(false);
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');
  
  const navRef = useRef(null);
  const progressRef = useRef(null);
  const drawerRef = useRef(null);
  const bgRef = useRef(null);

  const handleLogout = () => {
    logout();
    setOpen(false);
    toast.success('Signed out.');
    navigate('/');
  };

  useGSAP(() => {
    if (prefersReducedMotion()) return;

    // 1. Initial Dropdown
    gsap.from(navRef.current, {
      yPercent: -100,
      duration: 1,
      ease: 'power3.out',
      delay: 0.2 // Wait for preloader start
    });

    // 2. Global Scroll Progress Bar
    gsap.to(progressRef.current, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.1
      }
    });

    // 3. Scroll state (blur & border)
    const updateNavState = () => {
      if (window.scrollY > 50) {
        gsap.to(bgRef.current, { backgroundColor: 'rgba(13, 15, 20, 0.85)', backdropFilter: 'blur(12px)', borderBottomColor: 'rgba(42, 49, 66, 1)', duration: 0.3 });
      } else {
        gsap.to(bgRef.current, { backgroundColor: 'transparent', backdropFilter: 'blur(0px)', borderBottomColor: 'transparent', duration: 0.3 });
      }
    };
    
    window.addEventListener('scroll', updateNavState);
    updateNavState(); // Init

    return () => window.removeEventListener('scroll', updateNavState);
  }, { scope: navRef });

  // Mobile Drawer Animation
  useEffect(() => {
    if (prefersReducedMotion()) {
      gsap.set(drawerRef.current, { height: open ? 'auto' : 0, opacity: open ? 1 : 0 });
      return;
    }

    if (open) {
      gsap.fromTo(drawerRef.current, 
        { height: 0, opacity: 0 }, 
        { height: 'auto', opacity: 1, duration: 0.4, ease: 'power3.out' }
      );
    } else {
      gsap.to(drawerRef.current, { height: 0, opacity: 0, duration: 0.3, ease: 'power2.in' });
    }
  }, [open]);

  const navLinkClass = ({ isActive }) =>
    `relative px-1 py-1 text-sm font-medium transition ${
      isActive ? 'text-text' : 'text-text-muted hover:text-text'
    } nav-item-link`;

  return (
    <header ref={navRef} className="fixed top-0 left-0 right-0 z-50">
      {/* Background Layer to animate independently */}
      <div ref={bgRef} className="absolute inset-0 border-b border-transparent bg-transparent pointer-events-none" />
      
      {/* Progress Bar */}
      <div ref={progressRef} className="absolute bottom-0 left-0 h-[1px] w-full bg-gradient-to-r from-primary to-accent origin-left scale-x-0 z-10" />

      <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 z-20">
        <Logo />

        {/* Desktop links */}
        <div className="hidden items-center gap-5 md:flex">
          {isAuthenticated ? (
            <>
              {isAdmin && <NavLink to="/moderation" className={navLinkClass}>Moderation</NavLink>}
              <NavLink to="/search" className={navLinkClass}>
                {({ isActive }) => (
                  <span className="relative inline-flex flex-col items-center">
                    Search
                    {isActive && <span className="absolute -bottom-2 h-0.5 w-full rounded-full bg-primary" />}
                  </span>
                )}
              </NavLink>
              <NavLink to="/subscriptions" className={navLinkClass}>
                {({ isActive }) => (
                  <span className="relative inline-flex flex-col items-center text-accent">
                    Pricing
                    {isActive && <span className="absolute -bottom-2 h-0.5 w-full rounded-full bg-accent" />}
                  </span>
                )}
              </NavLink>
              <div className="flex items-center gap-3">
                <Link to="/settings" aria-label="Settings" className="grid h-9 w-9 place-items-center rounded-full text-text-muted transition hover:bg-surface-2 hover:text-text">
                  <Settings className="h-5 w-5" />
                </Link>
                <NotificationBell />
                <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-primary ring-1 ring-border">
                  {initials(user?.name)}
                </span>
                <button type="button" onClick={handleLogout} className="btn-ghost px-4 py-2 text-sm">
                  <LogOut className="h-4 w-4" /> Sign Out
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="text-sm font-medium text-text-muted transition hover:text-text">
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
      <div 
        ref={drawerRef}
        className="relative overflow-hidden border-t border-border bg-bg/95 md:hidden backdrop-blur-xl h-0 opacity-0"
      >
        <div className="flex flex-col gap-2 px-4 py-4">
          {isAuthenticated ? (
            <>
              <Link to="/notifications" onClick={() => setOpen(false)} className="btn-ghost justify-start"><Bell className="h-4 w-4" /> Notifications</Link>
              <Link to="/requirements" onClick={() => setOpen(false)} className="btn-ghost justify-start"><FileText className="h-4 w-4" /> My requests</Link>
              <Link to="/settings" onClick={() => setOpen(false)} className="btn-ghost justify-start"><Settings className="h-4 w-4" /> Settings</Link>
              <Link to="/subscriptions" onClick={() => setOpen(false)} className="btn-ghost justify-start text-accent"><Sparkles className="h-4 w-4" /> Pricing</Link>
              {isAdmin && <Link to="/moderation" onClick={() => setOpen(false)} className="btn-ghost justify-start"><ShieldCheck className="h-4 w-4" /> Moderation</Link>}
              <Link to="/search" onClick={() => setOpen(false)} className="btn-ghost justify-start"><Search className="h-4 w-4" /> Search</Link>
              <button type="button" onClick={handleLogout} className="btn-ghost justify-start"><LogOut className="h-4 w-4" /> Sign Out</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)} className="btn-ghost justify-start">Login</Link>
              <Link to="/signup" onClick={() => setOpen(false)} className="btn-primary justify-start">Get Started</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
