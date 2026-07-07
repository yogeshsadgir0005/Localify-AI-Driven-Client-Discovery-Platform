import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft,
  Loader2,
  MapPin,
  Star,
  MessageCircle,
  Phone,
  Mail,
  Globe2,
  Flag,
  AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import TrustBadge from '../components/TrustBadge';
import api, { getErrorMessage } from '../utils/axios';

const Stars = ({ n }) => (
  <span className="inline-flex" aria-hidden="true">
    {Array.from({ length: 5 }).map((_, i) => (
      <Star key={i} className={`h-3.5 w-3.5 ${i < Math.round(n || 0) ? 'fill-accent text-accent' : 'text-border'}`} />
    ))}
  </span>
);

const HANDOFF = 'You are connected. Continue off-platform — Localify does not handle quotes, payments or delivery.';

const ProfileDetailPage = () => {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [status, setStatus] = useState('loading');
  const [cr, setCr] = useState(null);
  const [contacting, setContacting] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [p, r] = await Promise.all([
          api.get(`/profiles/${id}`),
          api.get(`/reviews/profile/${id}`),
        ]);
        if (!active) return;
        setProfile(p.data.profile);
        setReviews(r.data.reviews || []);
        setStatus('success');
      } catch (err) {
        if (active) setStatus(err.response?.status === 404 ? 'notfound' : 'error');
      }
    })();
    return () => { active = false; };
  }, [id]);

  const requestContact = async () => {
    setContacting(true);
    try {
      const { data } = await api.post('/contacts', { profileId: id });
      setCr(data.contactRequest);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not request contact.'));
    } finally {
      setContacting(false);
    }
  };

  const report = async () => {
    const reason = window.prompt('Why are you reporting this business? (optional)');
    if (reason === null) return;
    try {
      await api.post(`/profiles/${id}/report`, { reason });
      toast.success('Reported — our team will review it.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit report.'));
    }
  };

  if (status === 'loading') {
    return <Layout><div className="mx-auto max-w-3xl px-4 py-16 text-text-muted"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></Layout>;
  }
  if (status === 'notfound' || status === 'error') {
    return (
      <Layout>
        <div className="mx-auto max-w-2xl px-4 py-24 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-error" />
          <h1 className="mt-4 font-display text-2xl font-bold text-text">{status === 'notfound' ? 'Profile not found' : 'Something went wrong'}</h1>
          <Link to="/search" className="btn-primary mt-6">Back to search</Link>
        </div>
      </Layout>
    );
  }

  const contact = cr?.revealedContact || {};

  return (
    <Layout>
      <Helmet><title>{`${profile.name} — Localify`}</title></Helmet>
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <Link to="/search" className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>

        <div className="card-base p-6 sm:p-8">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {profile.vertical && <span className="pill border-primary/40 bg-primary/10 text-primary">{profile.vertical}</span>}
            <TrustBadge trust={profile.trust} />
            {profile.reviewCount > 0 && (
              <span className="pill"><Stars n={profile.ratingAvg} /> {profile.ratingAvg?.toFixed(1)} · {profile.reviewCount}</span>
            )}
          </div>
          <h1 className="font-display text-2xl font-bold text-text sm:text-3xl">{profile.name}</h1>
          {(profile.location?.city || profile.location?.state) && (
            <div className="mt-1 flex items-center gap-1 text-sm text-text-muted">
              <MapPin className="h-4 w-4" /> {[profile.location.city, profile.location.state].filter(Boolean).join(', ')}
            </div>
          )}
          {profile.description && <p className="mt-4 leading-relaxed text-text-muted">{profile.description}</p>}

          {(profile.moqMin != null || profile.priceBand || (profile.categories || []).length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {profile.categories?.map((c) => <span key={c} className="pill">{c}</span>)}
              {profile.moqMin != null && <span className="pill">MOQ {profile.moqMin}</span>}
              {profile.priceBand && <span className="pill">{profile.priceBand}</span>}
            </div>
          )}

          {profile.trust?.caveats?.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-text-muted">
              {profile.trust.caveats.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          )}

          <div className="mt-6 border-t border-border pt-5">
            {!cr && (
              <button type="button" onClick={requestContact} disabled={contacting} className="btn-primary">
                {contacting ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Request contact
              </button>
            )}
            {cr && cr.status !== 'revealed' && (
              <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-text-muted">
                Request sent — track it under <Link to="/search" className="text-primary hover:underline">My requests</Link>.
              </p>
            )}
            {cr && cr.status === 'revealed' && (
              <div className="space-y-3 rounded-xl border border-accent/30 bg-accent/5 p-4">
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {contact.phone && <a href={`tel:${contact.phone}`} className="inline-flex items-center gap-1.5 font-medium text-text hover:text-primary"><Phone className="h-4 w-4 text-accent" /> {contact.phone}</a>}
                  {contact.email && <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 text-text hover:text-primary"><Mail className="h-4 w-4 text-text-muted" /> {contact.email}</a>}
                  {contact.website && <a href={contact.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Globe2 className="h-4 w-4" /> Website</a>}
                </div>
                {cr.draftedMessage && <p className="rounded-lg border border-border bg-surface-2 p-3 text-sm text-text">{cr.draftedMessage}</p>}
                <p className="text-xs text-text-muted">{HANDOFF}</p>
              </div>
            )}
          </div>
        </div>

        {reviews.length > 0 && (
          <div className="card-base mt-6 p-6 sm:p-8">
            <h2 className="mb-4 font-display text-lg font-semibold text-text">Contact-verified reviews</h2>
            <div className="space-y-3">
              {reviews.map((r, i) => (
                <div key={i} className="rounded-xl border border-border bg-surface-2 p-4">
                  <Stars n={r.rating} />
                  {r.text && <p className="mt-2 text-sm leading-relaxed text-text-muted">{r.text}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <button type="button" onClick={report} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-error">
            <Flag className="h-3 w-3" /> Report this business
          </button>
        </div>
      </section>
    </Layout>
  );
};

export default ProfileDetailPage;
