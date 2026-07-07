import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { Star, Phone, MapPin, Globe2, ChevronRight } from 'lucide-react';
import { categoryOf } from '../hooks/useBusinessSearch';

const truncate = (str, n) =>
  str && str.length > n ? `${str.slice(0, n - 1).trimEnd()}…` : str || '';

/**
 * Render a 0–5 rating as filled/empty stars.
 */
const RatingStars = ({ rating, reviewCount }) => {
  if (rating == null) {
    return <span className="text-xs text-text-muted">No rating yet</span>;
  }
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < rounded ? 'fill-accent text-accent' : 'text-border'
            }`}
          />
        ))}
      </div>
      <span className="text-xs text-text-muted">
        {rating.toFixed(1)}
        {reviewCount ? ` (${reviewCount})` : ''}
      </span>
    </div>
  );
};

const BusinessCard = ({ business, index = 0 }) => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const category = categoryOf(business);

  const open = () => navigate(`/business/${business.placeId}`);
  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: reduce ? 0 : (index % 12) * 0.05 }}
      whileHover={reduce ? undefined : { scale: 1.02, y: -4 }}
      className="card-base group flex cursor-pointer flex-col gap-3 p-5 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-lg font-semibold leading-tight text-text">
          {truncate(business.name, 48)}
        </h3>
        <span className="pill shrink-0 border-primary/40 bg-primary/10 text-primary">
          {category}
        </span>
      </div>

      <div className="flex items-start gap-2 text-sm text-text-muted">
        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
        <span>{truncate(business.address, 72) || 'Address unavailable'}</span>
      </div>

      {business.phone ? (
        <div className="flex items-center gap-2 text-sm text-text">
          <Phone className="h-4 w-4 shrink-0 text-accent" />
          <span>{business.phone}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Phone className="h-4 w-4 shrink-0" />
          <span>Phone not listed</span>
        </div>
      )}

      <div className="mt-1 flex items-center justify-between">
        <RatingStars rating={business.rating} reviewCount={business.reviewCount} />
        {business.website ? (
          <span className="pill">
            <Globe2 className="h-3 w-3" />
            Website
          </span>
        ) : (
          <span className="pill border-accent/40 bg-accent/10 text-accent">
            <Globe2 className="h-3 w-3" />
            No Website
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-1 text-sm font-medium text-primary opacity-0 transition group-hover:opacity-100">
        View details
        <ChevronRight className="h-4 w-4" />
      </div>
    </motion.div>
  );
};

/**
 * Skeleton placeholder shown while results are loading.
 */
export const BusinessCardSkeleton = () => (
  <div className="card-base flex animate-pulse flex-col gap-4 p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="h-5 w-2/3 rounded bg-surface-2" />
      <div className="h-5 w-16 rounded-full bg-surface-2" />
    </div>
    <div className="h-4 w-full rounded bg-surface-2" />
    <div className="h-4 w-1/2 rounded bg-surface-2" />
    <div className="mt-2 flex items-center justify-between">
      <div className="h-4 w-24 rounded bg-surface-2" />
      <div className="h-5 w-24 rounded-full bg-surface-2" />
    </div>
  </div>
);

export default BusinessCard;
