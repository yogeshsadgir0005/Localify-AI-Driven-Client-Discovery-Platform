import { ShieldCheck, ShieldAlert, Shield } from 'lucide-react';

/**
 * A compact trust chip: tier label + composite score, with caveats surfaced on
 * hover. Trust is earned (never sold), so this is intentionally plain.
 */
const TIER = {
  listed: { label: 'Listed', cls: 'border-border bg-surface-2 text-text-muted', Icon: Shield },
  phone_verified: { label: 'Phone verified', cls: 'border-primary/40 bg-primary/10 text-primary', Icon: ShieldCheck },
  email_verified: { label: 'Email verified', cls: 'border-primary/40 bg-primary/10 text-primary', Icon: ShieldCheck },
  gst_verified: { label: 'GST verified', cls: 'border-accent/40 bg-accent/10 text-accent', Icon: ShieldCheck },
  kyb_verified: { label: 'KYB verified', cls: 'border-accent/40 bg-accent/10 text-accent', Icon: ShieldCheck },
};

const TrustBadge = ({ trust, showScore = true }) => {
  const tier = trust?.tier || 'listed';
  const meta = TIER[tier] || TIER.listed;
  const caveats = trust?.caveats || [];
  const { Icon } = meta;
  return (
    <span
      className={`pill ${meta.cls}`}
      title={caveats.length ? caveats.join(' ') : 'Trust is earned from verification signals and reviews.'}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
      {showScore && typeof trust?.score === 'number' && (
        <span className="opacity-70">· {trust.score}</span>
      )}
      {caveats.length > 0 && <ShieldAlert className="h-3 w-3 opacity-70" />}
    </span>
  );
};

export default TrustBadge;
