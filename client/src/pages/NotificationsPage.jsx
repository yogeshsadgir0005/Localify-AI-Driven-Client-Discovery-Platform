import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  Loader2,
  BellOff,
  Handshake,
  Inbox,
  Search,
  CheckCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import api, { getErrorMessage } from '../utils/axios';

const META = {
  new_matching_requirement: { Icon: Search, route: '/search', tag: 'New demand' },
  contact_request: { Icon: Inbox, route: '/search', tag: 'Request' },
  contact_revealed: { Icon: Handshake, route: '/search', tag: 'Connected' },
  saved_search_match: { Icon: Search, route: '/search', tag: 'Match' },
};

const timeAgo = (iso) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

const NotificationsPage = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [items, setItems] = useState([]);

  const load = async () => {
    try {
      const { data } = await api.get('/notifications');
      setItems(data.notifications || []);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = async (n) => {
    try {
      if (!n.read) await api.post(`/notifications/${n._id}/read`);
    } catch {
      /* non-fatal */
    }
    navigate(META[n.type]?.route || '/');
  };

  const markAll = async () => {
    try {
      await api.post('/notifications/read-all');
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success('All caught up.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update.'));
    }
  };

  return (
    <Layout>
      <Helmet><title>Notifications — Localify</title></Helmet>
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-display text-3xl font-bold text-text">Notifications</h1>
          {items.some((n) => !n.read) && (
            <button type="button" onClick={markAll} className="btn-ghost px-4 py-2 text-sm">
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>
          )}
        </div>

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading…
          </div>
        )}
        {status === 'error' && <div className="card-base p-6 text-error">Could not load notifications.</div>}
        {status === 'success' && items.length === 0 && (
          <div className="card-base flex flex-col items-center gap-3 p-10 text-center">
            <BellOff className="h-10 w-10 text-text-muted" />
            <p className="text-text-muted">No notifications yet.</p>
          </div>
        )}

        <div className="space-y-2">
          {items.map((n) => {
            const meta = META[n.type] || { Icon: Inbox, tag: '' };
            const { Icon } = meta;
            return (
              <button
                key={n._id}
                type="button"
                onClick={() => open(n)}
                className={`card-base flex w-full items-start gap-3 p-4 text-left transition hover:border-border-strong ${
                  n.read ? 'opacity-70' : ''
                }`}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text">{n.title}</span>
                    {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </div>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-text-muted">{n.body}</p>}
                  <div className="mt-1 flex items-center gap-2 text-xs text-text-muted">
                    {meta.tag && <span className="pill">{meta.tag}</span>}
                    <span>{timeAgo(n.createdAt)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </Layout>
  );
};

export default NotificationsPage;
