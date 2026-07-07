import { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'motion/react';
import {
  Loader2,
  Bell,
  Bookmark,
  Trash2,
  ShieldCheck,
  Send,
  MapPin,
  Pencil,
  ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import api, { getErrorMessage } from '../utils/axios';
import { useAuth } from '../hooks/useAuth';
import { STATES, getDistricts, getStateLabel } from '../utils/india';

const GRIEVANCE_KINDS = [
  { value: 'data_access', label: 'Access my data' },
  { value: 'data_correction', label: 'Correct my data' },
  { value: 'data_erasure', label: 'Erase my data' },
  { value: 'dpdp_grievance', label: 'General grievance' },
];

const addressSchema = z.object({
  state: z.string().min(1, 'Select your state'),
  district: z.string().min(1, 'Select your district'),
  city: z.string().trim().min(2, 'Enter your city or town'),
});

const Toggle = ({ on, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`relative h-6 w-11 rounded-full transition ${on ? 'bg-primary' : 'bg-surface-2 border border-border'}`}
  >
    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-text transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
  </button>
);

/* -----------------------------------------------------------------------
 * LocationSection — address management moved from AddressSetupPage
 * --------------------------------------------------------------------- */
const LocationSection = () => {
  const reduce = useReducedMotion();
  const { user, saveAddress, hasAddress } = useAuth();
  const [editing, setEditing] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addressSchema),
    mode: 'onTouched',
    defaultValues: {
      state: user?.address?.state || '',
      district: user?.address?.district || '',
      city: user?.address?.city || '',
    },
  });

  const selectedState = watch('state');
  const districts = useMemo(() => getDistricts(selectedState), [selectedState]);

  const currentDistrict = watch('district');
  useEffect(() => {
    if (selectedState && currentDistrict && !districts.includes(currentDistrict)) {
      setValue('district', '');
    }
  }, [selectedState, currentDistrict, districts, setValue]);

  const onSubmit = async (values) => {
    const res = await saveAddress({
      state: values.state,
      district: values.district,
      city: values.city,
    });
    if (res.ok) {
      toast.success('Location saved.');
      setEditing(false);
    } else {
      toast.error(res.error);
    }
  };

  const handleEdit = () => {
    // Reset form with current user address values when entering edit mode
    reset({
      state: user?.address?.state || '',
      district: user?.address?.district || '',
      city: user?.address?.city || '',
    });
    setEditing(true);
  };

  return (
    <div className="card-base p-5">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="font-display text-lg font-semibold text-text">Your location</h2>
      </div>
      <p className="mb-4 text-sm text-text-muted">
        We use this to find local businesses around you.
      </p>

      {hasAddress && !editing ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface-2 p-4">
            <div className="text-xs uppercase tracking-wide text-text-muted">Saved address</div>
            <div className="mt-1.5 font-display text-base font-semibold text-text">
              {user.address.city}
            </div>
            <div className="text-sm text-text-muted">
              {user.address.district}, {getStateLabel(user.address.state)}
            </div>
          </div>
          <button type="button" onClick={handleEdit} className="btn-ghost px-4 py-2 text-sm">
            <Pencil className="h-4 w-4" /> Edit location
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="settings-state" className="mb-1.5 block text-sm text-text">
              State / UT
            </label>
            <div className="relative">
              <select
                id="settings-state"
                className="input-base appearance-none pr-10"
                {...register('state')}
              >
                <option value="">Select a state…</option>
                {STATES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute inset-y-0 right-3 my-auto h-5 w-5 text-text-muted" />
            </div>
            {errors.state && (
              <p className="mt-1.5 text-xs text-error">{errors.state.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="settings-district" className="mb-1.5 block text-sm text-text">
              District
            </label>
            <div className="relative">
              <select
                id="settings-district"
                disabled={!selectedState}
                className="input-base appearance-none pr-10 disabled:cursor-not-allowed disabled:opacity-60"
                {...register('district')}
              >
                <option value="">
                  {selectedState ? 'Select a district…' : 'Select a state first'}
                </option>
                {districts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute inset-y-0 right-3 my-auto h-5 w-5 text-text-muted" />
            </div>
            {errors.district && (
              <p className="mt-1.5 text-xs text-error">{errors.district.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="settings-city" className="mb-1.5 block text-sm text-text">
              Enter your city / town
            </label>
            <input
              id="settings-city"
              type="text"
              autoComplete="address-level2"
              className="input-base"
              placeholder="e.g. Nashik"
              {...register('city')}
            />
            {errors.city && (
              <p className="mt-1.5 text-xs text-error">{errors.city.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            {hasAddress && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="btn-ghost flex-1"
              >
                Cancel
              </button>
            )}
            <motion.button
              whileTap={reduce ? undefined : { scale: 0.96 }}
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Saving…' : 'Save location'}
            </motion.button>
          </div>
        </form>
      )}
    </div>
  );
};

/* -----------------------------------------------------------------------
 * SettingsPage
 * --------------------------------------------------------------------- */
const SettingsPage = () => {
  const [status, setStatus] = useState('loading');
  const [alertsOn, setAlertsOn] = useState(true);
  const [saved, setSaved] = useState([]);
  const [officer, setOfficer] = useState(null);
  const [gk, setGk] = useState('data_access');
  const [gmsg, setGmsg] = useState('');
  const [gbusy, setGbusy] = useState(false);

  // Track per-section errors so one failing endpoint doesn't block everything
  const [sectionErrors, setSectionErrors] = useState({
    consent: false,
    savedSearches: false,
    privacy: false,
  });

  const load = async () => {
    // Use allSettled so individual failures don't crash the whole page
    const [consentRes, savedRes, privacyRes] = await Promise.allSettled([
      api.get('/auth/consent'),
      api.get('/auth/saved-searches'),
      api.get('/legal/privacy'),
    ]);

    const errors = { consent: false, savedSearches: false, privacy: false };

    if (consentRes.status === 'fulfilled') {
      const alerts = (consentRes.value.data.consents || []).find(
        (x) => x.purpose === 'match_alerts'
      );
      setAlertsOn(!alerts || alerts.granted !== false);
    } else {
      errors.consent = true;
    }

    if (savedRes.status === 'fulfilled') {
      setSaved(savedRes.value.data.savedSearches || []);
    } else {
      errors.savedSearches = true;
    }

    if (privacyRes.status === 'fulfilled') {
      setOfficer(privacyRes.value.data.grievanceOfficer);
    } else {
      errors.privacy = true;
    }

    setSectionErrors(errors);

    // Only show full-page error if ALL requests failed
    const allFailed = errors.consent && errors.savedSearches && errors.privacy;
    setStatus(allFailed ? 'error' : 'success');
  };

  useEffect(() => {
    load();
  }, []);

  const toggleAlerts = async () => {
    const next = !alertsOn;
    setAlertsOn(next);
    try {
      await api.put('/auth/consent', { purpose: 'match_alerts', granted: next });
    } catch (err) {
      setAlertsOn(!next);
      toast.error(getErrorMessage(err, 'Could not update.'));
    }
  };

  const removeSaved = async (id) => {
    try {
      const { data } = await api.delete(`/auth/saved-searches/${id}`);
      setSaved(data.savedSearches || []);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not remove.'));
    }
  };

  const submitGrievance = async () => {
    if (gmsg.trim().length < 10) return toast.error('Please describe your request (10+ characters).');
    setGbusy(true);
    try {
      const { data } = await api.post('/legal/grievance', { kind: gk, message: gmsg });
      toast.success(`Recorded — ticket ${data.ticket}.`);
      setGmsg('');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit.'));
    } finally {
      setGbusy(false);
    }
  };

  return (
    <Layout>
      <Helmet><title>Settings — Localify</title></Helmet>
      <section className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl font-bold text-text">Settings &amp; privacy</h1>

        {status === 'loading' && (
          <div className="flex items-center gap-2 text-text-muted">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading…
          </div>
        )}
        {status === 'error' && (
          <div className="card-base p-6 text-error">Could not load settings. Please try again later.</div>
        )}

        {/* Location section — always rendered (it manages its own data via useAuth) */}
        {status !== 'loading' && <LocationSection />}

        {status === 'success' && (
          <>
            {/* Match alerts */}
            {!sectionErrors.consent && (
              <div className="card-base flex items-center justify-between p-5">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <div className="font-medium text-text">Match alerts</div>
                    <div className="text-sm text-text-muted">Get notified when a buyer or seller matches you. Pull-only — never spam.</div>
                  </div>
                </div>
                <Toggle on={alertsOn} onClick={toggleAlerts} />
              </div>
            )}

            {/* Saved searches */}
            {!sectionErrors.savedSearches && (
              <div className="card-base p-5">
                <div className="mb-3 flex items-center gap-2">
                  <Bookmark className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-lg font-semibold text-text">Saved searches</h2>
                </div>
                {saved.length === 0 ? (
                  <p className="text-sm text-text-muted">None yet — save a search from the Search page.</p>
                ) : (
                  <div className="space-y-2">
                    {saved.map((s) => (
                      <div key={s._id} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2 p-3 text-sm">
                        <span className="text-text">{s.label || s.query?.rawText || 'Saved search'}</span>
                        <button type="button" onClick={() => removeSaved(s._id)} aria-label="Remove" className="text-text-muted hover:text-error">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Data rights / DPDP */}
            {!sectionErrors.privacy && (
              <div className="card-base p-5">
                <div className="mb-1 flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-lg font-semibold text-text">Your data rights (DPDP)</h2>
                </div>
                <p className="mb-3 text-sm text-text-muted">
                  Access, correct, or erase your data, or raise a grievance. Our officer{officer?.name ? `, ${officer.name},` : ''} responds by email{officer?.email ? ` (${officer.email})` : ''}.
                </p>
                <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                  <select value={gk} onChange={(e) => setGk(e.target.value)} className="input-base">
                    {GRIEVANCE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                  <input value={gmsg} onChange={(e) => setGmsg(e.target.value)} placeholder="Describe your request" className="input-base" />
                </div>
                <button type="button" onClick={submitGrievance} disabled={gbusy} className="btn-ghost mt-3 px-4 py-2 text-sm">
                  {gbusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit request
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </Layout>
  );
};

export default SettingsPage;
