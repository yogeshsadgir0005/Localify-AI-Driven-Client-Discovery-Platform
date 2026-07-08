import { useEffect, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, useReducedMotion } from 'motion/react';
import {
  Search,
  MapPin,
  RefreshCw,
  Database,
  Store,
  AlertCircle,
  Globe2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import BusinessCard, { BusinessCardSkeleton } from '../components/BusinessCard';
import { useAuth } from '../hooks/useAuth';
import { useBusinessSearch, CATEGORIES } from '../hooks/useBusinessSearch';
import { getStateLabelSmart, getCountryLabel } from '../utils/locations';

/**
 * Build a compact list of page numbers with ellipses, e.g. [1, '…', 4, 5, 6, '…', 10].
 * Always includes the first, last, current, and the pages adjacent to current.
 */
const getPageItems = (page, total) => {
  const wanted = new Set([1, total, page, page - 1, page + 1]);
  const sorted = [...wanted]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b);

  const items = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) items.push('…');
    items.push(p);
    prev = p;
  }
  return items;
};

const SearchPage = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user, hasAddress } = useAuth();
  const address = user?.address;

  const {
    status,
    error,
    meta,
    keyword,
    setKeyword,
    category,
    setCategory,
    noWebsiteOnly,
    setNoWebsiteOnly,
    results,
    totalFiltered,
    totalAll,
    page,
    totalPages,
    pageSize,
    goToPage,
    refetch,
  } = useBusinessSearch(address);

  const resultsTopRef = useRef(null);

  const changePage = (p) => {
    goToPage(p);
    // Scroll back to the top of the results when changing pages.
    resultsTopRef.current?.scrollIntoView({
      behavior: reduce ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  // Guard: no address set -> bounce to setup.
  useEffect(() => {
    if (!hasAddress) {
      toast.error('Please set your location first.');
    }
  }, [hasAddress]);

  if (!hasAddress) {
    return <Navigate to="/address-setup" replace />;
  }

  const cachedAt =
    meta.cached && meta.fetchedAt
      ? new Date(meta.fetchedAt).toLocaleString('en-IN')
      : null;

  return (
    <Layout>
      <Helmet>
        <title>{`Businesses in ${address.city || address.district} — Localify`}</title>
        <meta
          name="description"
          content={`Discover offline-only local businesses in ${address.city || address.district}, ${getStateLabelSmart(
            address.state, address.country
          )}.`}
        />
      </Helmet>

      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Top bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <MapPin className="mt-1 h-5 w-5 shrink-0 text-primary" />
            <div>
              <div className="text-xs uppercase tracking-wide text-text-muted">
                Businesses in
              </div>
              <h1 className="font-display text-xl font-bold text-text sm:text-2xl">
                {address.city ? `${address.city}, ` : ''}{address.district},{' '}
                {getStateLabelSmart(address.state, address.country)},{' '}
                {getCountryLabel(address.country)}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/address-setup')}
            className="btn-ghost self-start px-4 py-2 text-sm sm:self-auto"
          >
            <MapPin className="h-4 w-4" />
            Change location
          </button>
        </div>

        {/* Cached badge */}
        {cachedAt && (
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent">
            <Database className="h-3.5 w-3.5" />
            Results cached · {cachedAt}
          </div>
        )}

        {/* Search input */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute inset-y-0 left-4 my-auto h-5 w-5 text-text-muted" />
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="Filter by name, category or keyword…"
            className="input-base pl-12"
          />
        </div>

        {/* Category pills + website filter */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {CATEGORIES.map((cat) => {
            const active = cat === category;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border bg-surface-2 text-text-muted hover:text-text'
                }`}
              >
                {cat}
              </button>
            );
          })}

          <span className="mx-1 hidden h-5 w-px bg-border sm:block" />

          <button
            type="button"
            onClick={() => setNoWebsiteOnly((v) => !v)}
            aria-pressed={noWebsiteOnly}
            className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              noWebsiteOnly
                ? 'border-accent bg-accent/15 text-accent'
                : 'border-border bg-surface-2 text-text-muted hover:text-text'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            No website only
            {meta.noWebsiteCount > 0 && (
              <span className="opacity-70">({meta.noWebsiteCount})</span>
            )}
          </button>
        </div>

        {/* States */}
        {status === 'loading' && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <BusinessCardSkeleton key={i} />
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className="card-base flex flex-col items-center gap-4 p-12 text-center">
            <AlertCircle className="h-12 w-12 text-error" />
            <div>
              <h2 className="font-display text-xl font-semibold text-text">
                Could not load businesses
              </h2>
              <p className="mt-1 text-sm text-text-muted">{error}</p>
            </div>
            <button type="button" onClick={refetch} className="btn-primary">
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        )}

        {status === 'success' && totalAll === 0 && (
          <div className="card-base flex flex-col items-center gap-4 p-12 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-surface-2 text-text-muted">
              <Store className="h-8 w-8" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold text-text">
                No offline businesses found
              </h2>
              <p className="mt-1 max-w-md text-sm text-text-muted">
                {meta.message ||
                  'We couldn’t find offline-only businesses here. Try a nearby city or check the spelling.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/address-setup')}
              className="btn-ghost"
            >
              <MapPin className="h-4 w-4" />
              Try another city
            </button>
          </div>
        )}

        {status === 'success' && totalAll > 0 && totalFiltered === 0 && (
          <div className="card-base flex flex-col items-center gap-3 p-12 text-center">
            <Search className="h-10 w-10 text-text-muted" />
            <h2 className="font-display text-lg font-semibold text-text">
              No matches for your filters
            </h2>
            <p className="text-sm text-text-muted">
              Try clearing the search or choosing a different category.
            </p>
          </div>
        )}

        {status === 'success' && totalFiltered > 0 && (
          <>
            <div ref={resultsTopRef} className="mb-4 scroll-mt-24 text-sm text-text-muted">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, totalFiltered)} of {totalFiltered}{' '}
              business{totalFiltered === 1 ? '' : 'es'}
            </div>
            <motion.div
              layout={!reduce}
              className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
            >
              {results.map((b, i) => (
                <BusinessCard key={b.placeId} business={b} index={i} />
              ))}
            </motion.div>

            {totalPages > 1 && (
              <nav
                aria-label="Pagination"
                className="mt-10 flex flex-wrap items-center justify-center gap-2"
              >
                <button
                  type="button"
                  onClick={() => changePage(page - 1)}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>

                {getPageItems(page, totalPages).map((item, idx) =>
                  item === '…' ? (
                    <span
                      key={`gap-${idx}`}
                      className="px-2 text-sm text-text-muted"
                    >
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => changePage(item)}
                      aria-current={item === page ? 'page' : undefined}
                      className={`h-9 min-w-9 rounded-xl border px-3 text-sm font-medium transition ${
                        item === page
                          ? 'border-primary bg-primary/15 text-primary'
                          : 'border-border bg-surface-2 text-text-muted hover:text-text'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => changePage(page + 1)}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-xl border border-border bg-surface-2 px-4 py-2 text-sm font-medium text-text transition hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </Layout>
  );
};

export default SearchPage;
