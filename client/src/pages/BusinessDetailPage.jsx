import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowLeft,
  Phone,
  MapPin,
  Star,
  Clock,
  Globe2,
  Sparkles,
  Loader2,
  AlertCircle,
  ExternalLink,
  Mail,
  MessageCircle,
  Copy,
  Check,
  Send,
  Camera,
  Quote,
  Gauge,
  Lock,
  EyeOff,
  LayoutTemplate,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import { categoryOf } from '../hooks/useBusinessSearch';
import { useAuth } from '../hooks/useAuth';
import api, { getErrorMessage } from '../utils/axios';
import WebsiteSurveyModal from '../components/WebsiteSurveyModal';
import TopUpCreditsModal from '../components/TopUpCreditsModal';
import { useGenerationStore } from '../store/generationStore';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const photoUrl = (ref, width = 600) =>
  `${API_BASE}/business/photo?ref=${encodeURIComponent(ref)}&maxwidth=${width}`;

/** Normalize a business phone into a wa.me-compatible number (India default). */
const whatsappNumber = (business) => {
  const raw = business.internationalPhone || business.phone || '';
  let digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.startsWith('0')) digits = `91${digits.replace(/^0+/, '')}`;
  return digits;
};

const LANGUAGES = [
  { key: 'english', label: 'English' },
  { key: 'marathi', label: 'मराठी' },
  { key: 'manglish', label: 'Manglish' },
  { key: 'hindi', label: 'हिंदी' },
  { key: 'hinglish', label: 'Hinglish' },
];

/** Tailwind classes for an aspect-sentiment chip. */
const SENTIMENT_STYLES = {
  positive: 'border-accent/40 bg-accent/10 text-accent',
  mixed: 'border-primary/40 bg-primary/10 text-primary',
  negative: 'border-error/40 bg-error/10 text-error',
  unknown: 'border-border bg-surface-2 text-text-muted',
};
const SENTIMENT_LABEL = {
  positive: 'Positive',
  mixed: 'Mixed',
  negative: 'Negative',
  unknown: 'Not mentioned',
};

/** Small star row. */
const Stars = ({ rating, className = '' }) => {
  const rounded = Math.round(rating || 0);
  return (
    <div className={`flex ${className}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rounded ? 'fill-accent text-accent' : 'text-border'
          }`}
        />
      ))}
    </div>
  );
};

/** A single gallery photo that hides itself if it fails to load. */
const PhotoTile = ({ refId, alt }) => {
  const [errored, setErrored] = useState(false);
  if (errored) return null;
  return (
    <img
      src={photoUrl(refId, 600)}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className="h-40 w-full rounded-xl border border-border object-cover"
      width="600"
      height="160"
    />
  );
};

/** Word-by-word reveal of the AI summary. */
const TypingSummary = ({ text }) => {
  const reduce = useReducedMotion();
  const words = text.split(/(\s+)/);
  if (reduce) return <p className="leading-relaxed text-text">{text}</p>;
  return (
    <p className="leading-relaxed text-text">
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: i * 0.03 }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
};

const BusinessDetailPage = () => {
  const { placeId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user, refreshProfile } = useAuth();
  // "Free" = anyone NOT on a paid plan (Pro/Max) or admin. Note: a user whose
  // plan is undefined must count as free, so gate on the paid set explicitly.
  const isPaidUser = Boolean(user && (user.plan === 'pro' || user.plan === 'max' || (user.roles || []).includes('admin')));
  const isFreePlan = !isPaidUser;
  
  const isUnhidden = user?.phoneUnhides?.unlockedPlaceIds?.includes(placeId);
  const remainingUnhides = Math.max(0, 3 - (user?.phoneUnhides?.unlockedPlaceIds?.length || 0));

  const [business, setBusiness] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | success | error | notfound
  const [error, setError] = useState(null);

  // AI summary state.
  const [summary, setSummary] = useState(null);
  const [summaryFallback, setSummaryFallback] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Review insights (aspect sentiment) state.
  const [insights, setInsights] = useState(null); // { available, summary, aspects, fallback, message }
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Outreach state.
  const [drafts, setDrafts] = useState(null); // { english, marathi, manglish }
  const [outreachFallback, setOutreachFallback] = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [lang, setLang] = useState('english');
  const [copied, setCopied] = useState(false);

  const [showWebsiteSurvey, setShowWebsiteSurvey] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [generatingWebsite, setGeneratingWebsite] = useState(false);
  const [websiteExists, setWebsiteExists] = useState(false);

  const planLimit = user?.plan === 'max' ? 9 : user?.plan === 'pro' ? 3 : 0;

  const handleGenerateWebsite = (surveyData) => {
    setShowWebsiteSurvey(false);
    navigate(`/business/${placeId}/generate-website`, { state: { survey: surveyData, businessName: business?.name || 'Business' } });
  };

  // Check for active generation (from global store or server)
  const { activeGenerations, checkStatus: checkGenStatus } = useGenerationStore();
  const activeGen = activeGenerations[placeId];
  const isGenerating = activeGen && !activeGen.completed && !activeGen.error;
  const [serverGenerating, setServerGenerating] = useState(false);

  useEffect(() => {
    // Also check server for active generation (covers page refresh scenario)
    if (!isGenerating) {
      checkGenStatus(placeId).then((status) => {
        if (status) setServerGenerating(true);
        else setServerGenerating(false);
      });
    } else {
      setServerGenerating(false);
    }
  }, [placeId, isGenerating]);

  const showOngoingButton = isGenerating || serverGenerating;

  useEffect(() => {
    let active = true;
    const load = async () => {
      setStatus('loading');
      setError(null);
      try {
        const { data } = await api.get(`/business/${placeId}`);
        if (!active) return;
        setBusiness(data.business);
        
        try {
          await api.get(`/website/${placeId}`);
          if (active) setWebsiteExists(true);
        } catch (e) {
          // Ignore 404
        }
        
        setStatus('success');
      } catch (err) {
        if (!active) return;
        if (err.response?.status === 404) {
          setStatus('notfound');
        } else {
          setError(getErrorMessage(err, 'Could not load business details.'));
          setStatus('error');
        }
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [placeId]);

  const generateSummary = async (force = false) => {
    if (summary && !force) return;
    setSummaryLoading(true);
    setSummaryFallback(null);
    try {
      const { data } = await api.post(`/summary/${placeId}${force ? '?force=true' : ''}`);
      if (data.summary) setSummary(data.summary);
      else
        setSummaryFallback(
          data.message ||
            'AI summary unavailable — add a GROQ_API_KEY on the server to enable this feature.'
        );
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate summary.'));
    } finally {
      setSummaryLoading(false);
    }
  };

  const generateInsights = async (force = false) => {
    setInsightsLoading(true);
    try {
      const { data } = await api.post(`/summary/${placeId}/reviews${force ? '?force=true' : ''}`);
      setInsights(data);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not analyze reviews.'));
    } finally {
      setInsightsLoading(false);
    }
  };

  const generateOutreach = async (force = false) => {
    setOutreachLoading(true);
    try {
      const { data } = await api.post(`/summary/${placeId}/outreach${force ? '?force=true' : ''}`);
      setDrafts(data.messages);
      setOutreachFallback(Boolean(data.fallback));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate outreach message.'));
    } finally {
      setOutreachLoading(false);
    }
  };

  const waNumber = useMemo(
    () => (business ? whatsappNumber(business) : ''),
    [business]
  );

  const handleCopy = async () => {
    if (!drafts) return;
    try {
      await navigator.clipboard.writeText(drafts[lang]);
      setCopied(true);
      toast.success('Message copied.');
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Could not copy. Select and copy manually.');
    }
  };

  const handleSendWhatsApp = () => {
    if (!drafts) return;
    if (!waNumber) {
      toast.error('No phone number available for this business.');
      return;
    }
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(drafts[lang])}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const goBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate('/search');
  };

  const handlePhoneClick = async (e) => {
    e?.preventDefault();
    if (!isFreePlan || isUnhidden) return;

    try {
      const { data } = await api.post('/auth/unhide-phone', { placeId });
      if (data.success) {
        toast.success(`Contact unhidden! ${data.remaining} remaining this week.`);
        await refreshProfile();
      }
    } catch (err) {
      if (err.response?.status === 403) {
        toast('Upgrade to Pro to view more contact details.', { icon: '🔒' });
        navigate('/subscriptions');
      } else {
        const errorMsg = err.response?.data?.message || err.message;
        toast.error(`Could not unhide contact: ${errorMsg}`);
      }
    }
  };

  if (status === 'loading') {
    return (
      <Layout>
        <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
          <div className="h-8 w-24 animate-pulse rounded bg-surface-2" />
          <div className="mt-6 h-40 animate-pulse rounded-2xl bg-surface-2" />
          <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-2" />
        </div>
      </Layout>
    );
  }

  if (status === 'notfound' || status === 'error') {
    return (
      <Layout>
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
          <AlertCircle className="h-12 w-12 text-error" />
          <h1 className="font-display text-2xl font-bold text-text">
            {status === 'notfound' ? 'Business not found' : 'Something went wrong'}
          </h1>
          <p className="max-w-md text-text-muted">
            {status === 'notfound'
              ? 'We couldn’t find this business. It may have been removed.'
              : error}
          </p>
          <button type="button" onClick={goBack} className="btn-primary mt-2">
            <ArrowLeft className="h-4 w-4" />
            Go back
          </button>
        </div>
      </Layout>
    );
  }

  const category = categoryOf(business);
  const mapQuery = business.location
    ? `${business.location.lat},${business.location.lng}`
    : `${business.name} ${business.address}`;
  const mapSrc = `https://www.google.com/maps?q=${encodeURIComponent(
    mapQuery
  )}&output=embed`;
  const photos = business.photos || [];
  const reviews = business.reviews || [];

  return (
    <Layout>
      <Helmet>
        <title>{`${business.name} — Localify`}</title>
        <meta
          name="description"
          content={`${business.name} in ${business.address || 'your city'} — contact details, reviews and an AI summary on Localify.`}
        />
      </Helmet>

      <section className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <button
          type="button"
          onClick={goBack}
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-6"
        >
          {/* Header card */}
          <div className="card-base p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="pill border-primary/40 bg-primary/10 text-primary">
                    {category}
                  </span>
                  {business.website ? (
                    <a
                      href={business.website}
                      target="_blank"
                      rel="noreferrer"
                      className="pill hover:text-text"
                    >
                      <Globe2 className="h-3 w-3" />
                      Visit website
                    </a>
                  ) : (
                    <span className="pill border-accent/40 bg-accent/10 text-accent">
                      <Globe2 className="h-3 w-3" />
                      No website found
                    </span>
                  )}
                  {business.businessStatus &&
                    business.businessStatus !== 'OPERATIONAL' && (
                      <span className="pill border-error/40 bg-error/10 text-error">
                        {business.businessStatus.replaceAll('_', ' ')}
                      </span>
                    )}
                </div>
                <h1 className="font-display text-2xl font-bold text-text sm:text-3xl">
                  {business.name}
                </h1>
              </div>

              {business.rating != null && (
                <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-3 py-2">
                  <Star className="h-4 w-4 fill-accent text-accent" />
                  <span className="font-semibold text-text">
                    {business.rating.toFixed(1)}
                  </span>
                  <span className="text-xs text-text-muted">
                    ({business.reviewCount})
                  </span>
                </div>
              )}
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-text-muted">
                    Address
                  </div>
                  <div className="text-sm text-text">
                    {business.address || 'Not available'}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-text-muted">
                    Phone
                  </div>
                  {business.phone ? (
                    (isFreePlan && !isUnhidden) ? (
                      <div 
                        onClick={handlePhoneClick}
                        className="flex cursor-pointer items-center gap-2 text-sm font-medium text-text hover:text-accent transition group"
                        title="Click to unhide phone number"
                      >
                        <span className="font-mono tracking-wider text-text-muted group-hover:text-accent">+91 ••••••••••</span>
                        <EyeOff className="h-4 w-4 text-text-muted group-hover:text-accent" />
                        <span className="text-[10px] font-medium opacity-60 text-text-muted group-hover:text-accent">({remainingUnhides} remaining)</span>
                      </div>
                    ) : (
                      <a
                        href={`tel:${(business.internationalPhone || business.phone).replace(/\s+/g, '')}`}
                        className="text-sm font-medium text-text hover:text-primary"
                      >
                        {business.phone}
                      </a>
                    )
                  ) : (
                    <div className="text-sm text-text-muted">Not listed</div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                <div>
                  <div className="text-xs uppercase tracking-wide text-text-muted">
                    Email
                  </div>
                  <div className="text-sm text-text-muted">
                    Not available (free tier)
                  </div>
                </div>
              </div>

              {business.googleUrl && (
                <div className="flex items-start gap-3">
                  <ExternalLink className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                  <div>
                    <div className="text-xs uppercase tracking-wide text-text-muted">
                      On Google Maps
                    </div>
                    <a
                      href={business.googleUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Open in Maps
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Quick actions */}
            <div className="mt-6 flex flex-wrap gap-3 border-t border-border pt-6">
              {business.phone && (
                (isFreePlan && !isUnhidden) ? (
                  <button
                    onClick={handlePhoneClick}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    <EyeOff className="h-4 w-4" />
                    Call
                  </button>
                ) : (
                  <a
                    href={`tel:${(business.internationalPhone || business.phone).replace(/\s+/g, '')}`}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    <Phone className="h-4 w-4" />
                    Call
                  </a>
                )
              )}
              {waNumber && (
                (isFreePlan && !isUnhidden) ? (
                  <button
                    onClick={handlePhoneClick}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    <EyeOff className="h-4 w-4 text-accent" />
                    WhatsApp
                  </button>
                ) : (
                  <a
                    href={`https://wa.me/${waNumber}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    <MessageCircle className="h-4 w-4 text-accent" />
                    WhatsApp
                  </a>
                )
              )}
              <a
                href={`#outreach`}
                className="btn-primary px-4 py-2 text-sm"
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById('outreach')
                    ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
                }}
              >
                <Sparkles className="h-4 w-4" />
                Pitch this business
              </a>
            </div>

            {/* Opening hours */}
            {business.openingHours?.weekdayText?.length > 0 && (
              <div className="mt-6 border-t border-border pt-6">
                <div className="mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-text-muted" />
                  <span className="text-sm font-semibold text-text">
                    Opening hours
                  </span>
                  {business.openingHours.openNow != null && (
                    <span
                      className={`pill ${
                        business.openingHours.openNow
                          ? 'border-accent/40 bg-accent/10 text-accent'
                          : 'border-error/40 bg-error/10 text-error'
                      }`}
                    >
                      {business.openingHours.openNow ? 'Open now' : 'Closed'}
                    </span>
                  )}
                </div>
                <ul className="grid gap-1 text-sm text-text-muted sm:grid-cols-2">
                  {business.openingHours.weekdayText.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div className="card-base p-6 sm:p-8">
              <div className="mb-4 flex items-center gap-2">
                <Camera className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-semibold text-text">
                  Photos
                </h2>
                <span className="text-xs text-text-muted">from Google Maps</span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos.map((p) => (
                  <PhotoTile
                    key={p.ref}
                    refId={p.ref}
                    alt={`${business.name} photo`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Map embed */}
          <div className="card-base overflow-hidden p-0">
            <iframe
              title={`Map of ${business.name}`}
              src={mapSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-72 w-full border-0"
              width="100%"
              height="288"
            />
          </div>

          {/* AI Website Generator Card */}
          <div className="card-base p-6 sm:p-8 border-primary/20 bg-gradient-to-br from-surface to-primary/5">
            <div className="mb-4 flex items-center gap-2">
              <LayoutTemplate className="h-6 w-6 text-primary" />
              <h2 className="font-display text-xl font-semibold text-text">
                AI Website Builder
              </h2>
            </div>
            <p className="text-sm text-text-muted mb-6">
              Generate a stunning, full-featured website for this business in 30 seconds using our state-of-the-art AI. It will use real Google Reviews and adapt to their brand.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {showOngoingButton ? (
                <button
                  onClick={() => navigate(`/business/${placeId}/generate-website`)}
                  className="btn-primary flex items-center justify-center gap-2 flex-1 relative overflow-hidden"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>View Ongoing Generation ({activeGen?.progress || '...'}%)</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    if (!user) return toast.error('Please login to generate a website.');
                    setShowWebsiteSurvey(true);
                  }}
                  disabled={generatingWebsite}
                  className="btn-primary flex items-center justify-center gap-2 flex-1 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300" />
                  <LayoutTemplate className="h-5 w-5 relative z-10" />
                  <span className="relative z-10">{generatingWebsite ? 'Generating...' : (websiteExists ? 'Re-Generate Website' : 'Generate AI Website')}</span>
                </button>
              )}

              {websiteExists && (
                <button
                  onClick={() => navigate(`/business/website/${placeId}`)}
                  className="btn-ghost flex items-center justify-center gap-2 text-primary flex-1 border border-primary/20 hover:bg-primary/10"
                >
                  <Globe2 className="h-5 w-5" />
                  View Built Website
                </button>
              )}
            </div>
          </div>

          {/* Review insights — AI aspect-sentiment chips from Google reviews */}
          {reviews.length > 0 && (
            <div className="card-base p-6 sm:p-8">
              <div className="mb-4 flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-semibold text-text">
                  What customers say
                </h2>
                <span className="text-xs text-text-muted">AI read of reviews</span>
              </div>

              {!insights && !insightsLoading && (
                <div className="flex flex-col items-start gap-4">
                  <p className="text-sm text-text-muted">
                    Get a neutral, at-a-glance read of these reviews — a short
                    summary and sentiment on quality, value, service and
                    reliability.
                  </p>
                  {isFreePlan ? (
                    <motion.button
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                      type="button"
                      onClick={() => navigate('/subscriptions')}
                      className="btn-primary"
                    >
                      <Lock className="mr-2 h-4 w-4" />
                      Upgrade to Pro to analyze
                    </motion.button>
                  ) : (
                    <motion.button
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                      type="button"
                      onClick={generateInsights}
                      className="btn-primary"
                    >
                      <Gauge className="h-4 w-4" />
                      Analyze reviews
                    </motion.button>
                  )}
                </div>
              )}

              {insightsLoading && (
                <div className="flex items-center gap-3 text-sm text-text-muted">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  Reading the reviews…
                </div>
              )}

              {insights && !insightsLoading && (
                <div className="space-y-4">
                  {insights.summary && (
                    <p className="leading-relaxed text-text">{insights.summary}</p>
                  )}

                  {Array.isArray(insights.aspects) &&
                    insights.aspects.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {insights.aspects.map((a) => (
                          <span
                            key={a.key}
                            className={`pill ${
                              SENTIMENT_STYLES[a.sentiment] ||
                              SENTIMENT_STYLES.unknown
                            }`}
                            title={SENTIMENT_LABEL[a.sentiment] || 'Not mentioned'}
                          >
                            {a.label}: {SENTIMENT_LABEL[a.sentiment] || 'Not mentioned'}
                          </span>
                        ))}
                      </div>
                    )}

                  {(insights.fallback || insights.available === false) && (
                    <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-muted">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                      <span>{insights.message}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="card-base p-6 sm:p-8">
              <div className="mb-5 flex items-center gap-2">
                <Quote className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg font-semibold text-text">
                  Google reviews
                </h2>
                <span className="text-xs text-text-muted">
                  showing {reviews.length} of {business.reviewCount}
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {reviews.map((r, i) => (
                  <div
                    key={`${r.author}-${i}`}
                    className="rounded-xl border border-border bg-surface-2 p-4"
                  >
                    <div className="mb-2 flex items-center gap-3">
                      {r.profilePhoto ? (
                        <img
                          src={r.profilePhoto}
                          alt={r.author}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-9 w-9 rounded-full object-cover"
                          width="36"
                          height="36"
                        />
                      ) : (
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-surface text-xs font-semibold text-primary">
                          {r.author.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text">
                          {r.author}
                        </div>
                        <div className="flex items-center gap-2">
                          <Stars rating={r.rating} />
                          <span className="text-xs text-text-muted">
                            {r.relativeTime}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="line-clamp-5 text-sm leading-relaxed text-text-muted">
                      {r.text || 'No written review.'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI summary */}
          <div className="card-base p-6 sm:p-8">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-semibold text-text">
                AI Summary
              </h2>
            </div>

            {!summary && !summaryFallback && !summaryLoading && (
              <div className="flex flex-col items-start gap-4">
                <p className="text-sm text-text-muted">
                  Generate a friendly summary of this business, written by our AI.
                </p>
                {isFreePlan ? (
                  <motion.button
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    type="button"
                    onClick={() => navigate('/subscriptions')}
                    className="btn-primary"
                  >
                    <Lock className="mr-2 h-4 w-4" />
                    Upgrade to Pro to generate
                  </motion.button>
                ) : (
                  <motion.button
                    whileTap={reduce ? undefined : { scale: 0.96 }}
                    type="button"
                    onClick={generateSummary}
                    className="btn-primary"
                  >
                    <Sparkles className="h-4 w-4" />
                    Generate Summary
                  </motion.button>
                )}
              </div>
            )}

            {summaryLoading && (
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Generating summary…
              </div>
            )}

            {summary && !summaryLoading && <TypingSummary text={summary} />}

            {summaryFallback && !summaryLoading && (
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-4">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-text-muted" />
                <div className="space-y-3">
                  <p className="text-sm text-text-muted">{summaryFallback}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSummaryFallback(null);
                      generateSummary(true);
                    }}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Outreach generator */}
          <div id="outreach" className="card-base scroll-mt-24 p-6 sm:p-8">
            <div className="mb-1 flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-accent" />
              <h2 className="font-display text-lg font-semibold text-text">
                Cold outreach message
              </h2>
            </div>
            <p className="mb-5 text-sm text-text-muted">
              An AI-written, personalised pitch you can edit, copy, or send on
              WhatsApp — in English, Marathi, Hindi, or their colloquial variants.
            </p>

            {!drafts && !outreachLoading && (
              isFreePlan ? (
                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  type="button"
                  onClick={() => navigate('/subscriptions')}
                  className="btn-primary"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Upgrade to Pro to pitch
                </motion.button>
              ) : (
                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  type="button"
                  onClick={generateOutreach}
                  className="btn-primary"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate message
                </motion.button>
              )
            )}

            {outreachLoading && (
              <div className="flex items-center gap-3 text-sm text-text-muted">
                <Loader2 className="h-5 w-5 animate-spin text-accent" />
                Crafting a personalised pitch…
              </div>
            )}

            {drafts && !outreachLoading && (
              <div className="space-y-4">
                {/* Language toggle */}
                <div className="inline-flex rounded-xl border border-border bg-surface-2 p-1">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.key}
                      type="button"
                      onClick={() => setLang(l.key)}
                      className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
                        lang === l.key
                          ? 'bg-primary text-text'
                          : 'text-text-muted hover:text-text'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>

                {outreachFallback && (
                  <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs text-text-muted">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                    <span>
                      Generated from a smart template (AI model unavailable). Add
                      a GROQ_API_KEY on the server for fully AI-written, unique
                      messages.
                    </span>
                  </div>
                )}

                {/* Editable message */}
                <textarea
                  value={drafts[lang]}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [lang]: e.target.value }))
                  }
                  rows={6}
                  className="input-base resize-y leading-relaxed"
                  dir="auto"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    disabled={!waNumber}
                    className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ backgroundColor: waNumber ? '#1FA855' : undefined }}
                    title={
                      waNumber ? 'Open WhatsApp' : 'No phone number available'
                    }
                  >
                    <Send className="h-4 w-4" />
                    Send on WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="btn-ghost px-4 py-2 text-sm"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-accent" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => generateOutreach(true)}
                    className="text-sm font-medium text-text-muted transition hover:text-text"
                  >
                    Regenerate
                  </button>
                </div>

                {!waNumber && (
                  <p className="text-xs text-text-muted">
                    WhatsApp is disabled because this business has no listed phone
                    number. You can still copy the message.
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </section>

      {showWebsiteSurvey && (
        <WebsiteSurveyModal
          isOpen={true}
          onClose={() => setShowWebsiteSurvey(false)}
          onGenerate={handleGenerateWebsite}
          onTopUp={() => {
            setShowWebsiteSurvey(false);
            setShowTopUp(true);
          }}
          user={user}
          planLimit={planLimit}
          business={business}
        />
      )}
      {showTopUp && (
        <TopUpCreditsModal onClose={() => setShowTopUp(false)} />
      )}
    </Layout>
  );
};

export default BusinessDetailPage;
