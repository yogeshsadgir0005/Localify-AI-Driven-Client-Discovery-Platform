import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Loader2, Inbox, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import TrustBadge from '../components/TrustBadge';
import api, { getErrorMessage } from '../utils/axios';

const RequirementsPage = () => {
  const [status, setStatus] = useState('loading');
  const [reqs, setReqs] = useState([]);
  const [openId, setOpenId] = useState(null);
  const [matches, setMatches] = useState({}); // id -> matches[]
  const [loadingId, setLoadingId] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/requirements');
        setReqs(data.requirements || []);
        setStatus('success');
      } catch {
        setStatus('error');
      }
    })();
  }, []);

  const toggle = async (r) => {
    if (openId === r._id) {
      setOpenId(null);
      return;
    }
    setOpenId(r._id);
    if (!matches[r._id]) {
      setLoadingId(r._id);
      try {
        const { data } = await api.get(`/requirements/${r._id}/matches`);
        setMatches((m) => ({ ...m, [r._id]: data.matches || [] }));
      } catch (err) {
        toast.error(getErrorMessage(err, 'Could not load matches.'));
      } finally {
        setLoadingId(null);
      }
    }
  };

  return (
    <Layout>
      <Helmet><title>My requests — Localify</title></Helmet>
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-text">My requests</h1>
        <p className="mt-2 text-text-muted">Everything you&apos;ve searched for. Re-open any request to see fresh matches.</p>

        <div className="mt-6 space-y-3">
          {status === 'loading' && <div className="flex items-center gap-2 text-text-muted"><Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading…</div>}
          {status === 'error' && <div className="card-base p-6 text-error">Could not load your requests.</div>}
          {status === 'success' && reqs.length === 0 && (
            <div className="card-base flex flex-col items-center gap-3 p-10 text-center">
              <Inbox className="h-10 w-10 text-text-muted" />
              <p className="text-text-muted">No requests yet.</p>
              <Link to="/search" className="btn-primary px-4 py-2 text-sm">Find a match</Link>
            </div>
          )}
          {reqs.map((r) => (
            <div key={r._id} className="card-base p-5">
              <button type="button" onClick={() => toggle(r)} className="flex w-full items-start justify-between gap-3 text-left">
                <div>
                  <p className="font-medium text-text">{r.rawText}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    {r.parsed?.vertical && <span className="pill">{r.parsed.vertical}</span>}
                    {r.parsed?.moqBand?.min && <span className="pill">MOQ ~{r.parsed.moqBand.min}</span>}
                    {r.parsed?.geo?.city && <span className="pill">{r.parsed.geo.city}</span>}
                  </div>
                </div>
                {openId === r._id ? <ChevronUp className="h-5 w-5 shrink-0 text-text-muted" /> : <ChevronDown className="h-5 w-5 shrink-0 text-text-muted" />}
              </button>

              {openId === r._id && (
                <div className="mt-4 border-t border-border pt-4">
                  {loadingId === r._id && <div className="flex items-center gap-2 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading matches…</div>}
                  {matches[r._id]?.length === 0 && <p className="text-sm text-text-muted">No matches right now.</p>}
                  <div className="space-y-2">
                    {(matches[r._id] || []).map((m) => (
                      <Link key={m.profile.id} to={`/profiles/${m.profile.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3 transition hover:border-border-strong">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-text">{m.profile.name}</div>
                          <div className="mt-0.5"><TrustBadge trust={m.profile.trust} showScore={false} /></div>
                        </div>
                        <span className="shrink-0 text-sm font-bold text-text">{Math.round((m.fitScore || 0) * 100)}%</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
};

export default RequirementsPage;
