import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import api from '../utils/axios';

/**
 * Nav bell showing the unread notification count. Polls lightly (on mount,
 * every 60s, and on window focus). Pull-only — matches the backend's TRAI-safe
 * no-push model.
 */
const NotificationBell = () => {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const { data } = await api.get('/notifications');
        if (active) setUnread(data.unread || 0);
      } catch {
        /* silent — the bell is best-effort */
      }
    };
    load();
    const timer = setInterval(load, 60000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <Link
      to="/notifications"
      aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      className="relative grid h-9 w-9 place-items-center rounded-full text-text-muted transition hover:bg-surface-2 hover:text-text"
    >
      <Bell className="h-5 w-5" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-text">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
};

export default NotificationBell;
