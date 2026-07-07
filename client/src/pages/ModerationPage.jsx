import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Flag,
  Copy,
  BarChart3,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import { useAuth } from '../hooks/useAuth';
import api, { getErrorMessage } from '../utils/axios';

const STATE_CLS = {
  ok: 'border-accent/40 bg-accent/10 text-accent',
  under_review: 'border-primary/40 bg-primary/10 text-primary',
  contested: 'border-primary/40 bg-primary/10 text-primary',
  flagged: 'border-error/40 bg-error/10 text-error',
};

const ModerationPage = () => {
  const { user } = useAuth();
  const isAdmin = Array.isArray(user?.roles) && user.roles.includes('admin');

  const [queue, setQueue] = useState([]);
  const [appeals, setAppeals] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [dupes, setDupes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const [q, m, d] = await Promise.all([
        api.get('/moderation/queue'),
        api.get('/moderation/metrics'),
        api.get('/moderation/duplicates'),
      ]);
      setQueue(q.data.queue || []);
      setAppeals(q.data.appeals || []);
      setMetrics(m.data);
      setDupes(d.data.groups || []);
      setStatus('success');
    } catch (err) {
      setStatus(err.response?.status === 403 ? 'forbidden' : 'error');
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    else setStatus('forbidden');
  }, [isAdmin]);

  const label = async (id, value) => {
    setBusy(`${id}:${value}`);
    try {
      await api.post(`/moderation/${id}/label`, { label: value });
      toast.success(`Labelled ${value}.`);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not apply label.'));
    } finally {
      setBusy('');
    }
  };

  const resolveAppeal = async (ticket, decision) => {
    setBusy(`appeal:${ticket}:${decision}`);
    try {
      await api.post(`/moderation/appeal/${ticket}/resolve`, { decision });
      toast.success(`Appeal ${decision}.`);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not resolve appeal.'));
    } finally {
      setBusy('');
    }
  };

  const merge = async (keepId, dropId) => {
    setBusy(`merge:${dropId}`);
    try {
      await api.post('/moderation/merge', { keepId, dropId });
      toast.success('Merged.');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not merge.'));
    } finally {
      setBusy('');
    }
  };

  if (status === 'forbidden') {
    return (
      <Layout>
        <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
          <Lock className="mx-auto h-10 w-10 text-text-muted" />
          <h1 className="mt-4 font-display text-2xl font-bold text-text">Admins only</h1>
          <p className="mt-2 text-text-muted">
            The moderation console is restricted to trust &amp; safety admins.
          </p>
        </section>
      </Layout>
    );
  }

  const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

  return (
    <Layout>
      <Helmet><title>Moderation — Localify</title></Helmet>
      <section className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-text">Trust &amp; safety</h1>
          <p className="mt-2 text-text-muted">
            Review reported and low-trust profiles, resolve duplicates, and track fraud-model accuracy.
          </p>
        </div>

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-text-muted"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading…</div>
        )}
        {status === 'error' && <div className="card-base p-6 text-error">Could not load the console.</div>}

        {status === 'success' && (
          <>
            {/* Metrics */}
            <div className="card-base p-5">
              <div className="mb-3 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-semibold text-text">Fraud-model accuracy</h2>
              </div>
              {metrics?.sampleSize > 0 ? (
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="pill">sample: {metrics.sampleSize}</span>
                  <span className="pill">precision: {pct(metrics.precision)}</span>
                  <span className="pill">recall: {pct(metrics.recall)}</span>
                  {metrics.confusion && (
                    <span className="pill">
                      TP {metrics.confusion.tp} · FP {metrics.confusion.fp} · FN {metrics.confusion.fn} · TN {metrics.confusion.tn}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-sm text-text-muted">{metrics?.note || 'No labelled sample yet.'}</p>
              )}
              <p className="mt-2 text-xs text-text-muted">Measured on the real human-labelled sample — not a synthetic benchmark.</p>
            </div>

            {/* Queue */}
            <div>
              <h2 className="mb-3 font-display text-xl font-semibold text-text">Review queue</h2>
              {queue.length === 0 ? (
                <div className="card-base p-6 text-sm text-text-muted">Nothing to review — the queue is clear.</div>
              ) : (
                <div className="space-y-3">
                  {queue.map((p) => (
                    <div key={p.id} className="card-base p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-medium text-text">{p.name}</div>
                        <span className={`pill ${STATE_CLS[p.reviewState] || ''}`}>{p.reviewState}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
                        <span className="pill">reports: {p.reportCount}</span>
                        <span className="pill">fraud score: {Math.round((p.fraudScore || 0) * 100)}%</span>
                        <span className="pill">trust: {p.trustScore}</span>
                        {p.claimed && <span className="pill">claimed</span>}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy === `${p.id}:fraud`} onClick={() => label(p.id, 'fraud')} className="btn-ghost px-3 py-1.5 text-sm text-error">
                          <Flag className="h-4 w-4" /> Fraud
                        </button>
                        <button type="button" disabled={busy === `${p.id}:legit`} onClick={() => label(p.id, 'legit')} className="btn-ghost px-3 py-1.5 text-sm text-accent">
                          <ShieldCheck className="h-4 w-4" /> Legit
                        </button>
                        <button type="button" disabled={busy === `${p.id}:contested`} onClick={() => label(p.id, 'contested')} className="btn-ghost px-3 py-1.5 text-sm">
                          <ShieldAlert className="h-4 w-4" /> Contested
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Appeals */}
            {appeals.length > 0 && (
              <div>
                <h2 className="mb-3 font-display text-xl font-semibold text-text">Trust appeals</h2>
                <div className="space-y-3">
                  {appeals.map((a) => (
                    <div key={a.ticket} className="card-base p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="pill">{a.ticket}</span>
                        <span className="pill">{a.status}</span>
                      </div>
                      {a.message && <p className="mt-2 text-sm text-text-muted">“{a.message}”</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={busy === `appeal:${a.ticket}:upheld`} onClick={() => resolveAppeal(a.ticket, 'upheld')} className="btn-ghost px-3 py-1.5 text-sm text-accent">
                          <ShieldCheck className="h-4 w-4" /> Uphold (restore)
                        </button>
                        <button type="button" disabled={busy === `appeal:${a.ticket}:rejected`} onClick={() => resolveAppeal(a.ticket, 'rejected')} className="btn-ghost px-3 py-1.5 text-sm text-error">
                          <ShieldAlert className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicates */}
            <div>
              <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-semibold text-text">
                <Copy className="h-5 w-5 text-primary" /> Duplicate groups
              </h2>
              {dupes.length === 0 ? (
                <div className="card-base p-6 text-sm text-text-muted">No duplicates detected.</div>
              ) : (
                <div className="space-y-3">
                  {dupes.map((g) => {
                    const keep = [...g.profiles].sort((a, b) => b.trust - a.trust)[0];
                    return (
                      <div key={g.key} className="card-base p-4">
                        <div className="mb-2 text-xs text-text-muted">Keeping highest-trust: <span className="text-text">{keep.name}</span></div>
                        <div className="space-y-1">
                          {g.profiles.map((p) => (
                            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-2 text-sm">
                              <span className="text-text">
                                {p.name} <span className="text-text-muted">· {p.city} · trust {p.trust}</span>
                              </span>
                              {p.id === keep.id ? (
                                <span className="pill border-accent/40 bg-accent/10 text-accent">keep</span>
                              ) : (
                                <button type="button" disabled={busy === `merge:${p.id}`} onClick={() => merge(keep.id, p.id)} className="btn-ghost px-3 py-1 text-xs">
                                  Merge into keep
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
};

export default ModerationPage;
