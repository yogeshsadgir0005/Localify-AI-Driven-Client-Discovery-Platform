import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'motion/react';
import { Loader2, Globe } from 'lucide-react';
import toast from 'react-hot-toast';

import Layout from '../layout/Layout';
import { useAuth } from '../hooks/useAuth';
import SearchableSelect from '../components/SearchableSelect';
import {
  COUNTRIES,
  getStates,
  getCities,
} from '../utils/locations';

const addressSchema = z.object({
  country: z.string().min(1, 'Select your country'),
  state: z.string().min(1, 'Select your state / region'),
  district: z.string().min(1, 'Select or enter your district / city'),
  city: z.string().trim().optional().or(z.literal('')),
});

const AddressSetupPage = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { user, saveAddress, hasAddress } = useAuth();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(addressSchema),
    mode: 'onTouched',
    defaultValues: {
      country: user?.address?.country || '',
      state: user?.address?.state || '',
      district: user?.address?.district || '',
      city: user?.address?.city || '',
    },
  });

  const selectedCountry = watch('country');
  const selectedState = watch('state');

  // Cascading data
  const states = useMemo(() => getStates(selectedCountry), [selectedCountry]);
  const cities = useMemo(
    () => getCities(selectedCountry, selectedState),
    [selectedCountry, selectedState]
  );

  const cityOptions = useMemo(
    () => cities.map((c) => ({ value: c, label: c })),
    [cities]
  );

  const currentState = watch('state');
  useEffect(() => {
    if (selectedCountry && currentState) {
      const stateExists = states.some((s) => s.value === currentState);
      if (!stateExists) {
        setValue('state', '');
        setValue('district', '');
      }
    }
  }, [selectedCountry, currentState, states, setValue]);

  const currentDistrict = watch('district');
  useEffect(() => {
    if (selectedState && currentDistrict) {
      const cityExists = cities.includes(currentDistrict);
      if (!cityExists) {
        setValue('district', '');
      }
    }
  }, [selectedState, currentDistrict, cities, setValue]);

  // If they already have an address (e.g. going back), just redirect them
  useEffect(() => {
    if (hasAddress) {
      navigate('/', { replace: true });
    }
  }, [hasAddress, navigate]);

  const plan = user?.plan || 'free';
  const limit = plan === 'max' ? Infinity : plan === 'pro' ? 10 : 3;
  const count = user?.locationChanges?.count || 0;
  const remaining = Math.max(0, limit - count);
  const limitReached = count >= limit;

  const onSubmit = async (values) => {
    const res = await saveAddress({
      country: values.country,
      state: values.state,
      district: values.district,
      city: values.city,
    });
    if (res.ok) {
      toast.success('Location saved successfully.');
      navigate('/', { replace: true });
    } else {
      if (res.error?.toLowerCase().includes('limit')) {
        toast(res.error, { icon: '🔒' });
      } else {
        toast.error(res.error);
      }
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Setup Location — Localify</title>
      </Helmet>
      <section className="mx-auto flex max-w-md flex-col px-4 py-12 sm:px-6">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="card-base p-7 sm:p-8"
        >
          <div className="mb-6 text-center">
            <span className="mb-3 inline-grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-primary to-accent">
              <Globe className="h-6 w-6 text-bg" />
            </span>
            <h1 className="font-display text-2xl font-bold text-text">
              Where are you looking?
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Set your location to find the best local businesses around you.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {plan !== 'max' && (
              <div className={`rounded-lg border p-3 text-sm ${limitReached ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-surface-2 text-text-muted'}`}>
                <div className="flex items-center justify-between">
                  <span>
                    {limitReached
                      ? `You have reached your limit of ${limit} location changes this week.`
                      : `You have ${remaining} out of ${limit} location changes remaining this week.`}
                  </span>
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm text-text">Country</label>
              <SearchableSelect
                id="setup-country"
                options={COUNTRIES}
                value={selectedCountry}
                onChange={(val) => setValue('country', val, { shouldValidate: true })}
                placeholder="Select a country…"
              />
              {errors.country && <p className="mt-1.5 text-xs text-error">{errors.country.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-text">State / Region</label>
              <SearchableSelect
                id="setup-state"
                options={states}
                value={selectedState}
                onChange={(val) => setValue('state', val, { shouldValidate: true })}
                placeholder={selectedCountry ? 'Select a state / region…' : 'Select a country first'}
                disabled={!selectedCountry}
              />
              {errors.state && <p className="mt-1.5 text-xs text-error">{errors.state.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-text">District / City</label>
              <SearchableSelect
                id="setup-district"
                options={cityOptions}
                value={currentDistrict}
                onChange={(val) => setValue('district', val, { shouldValidate: true })}
                placeholder={selectedState ? 'Select a district / city…' : 'Select a state first'}
                disabled={!selectedState}
              />
              {errors.district && <p className="mt-1.5 text-xs text-error">{errors.district.message}</p>}
            </div>

            <div>
              <label htmlFor="setup-city" className="mb-1.5 block text-sm text-text">
                Town <span className="text-text-muted">(optional)</span>
              </label>
              <input
                id="setup-city"
                type="text"
                autoComplete="address-level2"
                className="input-base"
                placeholder="e.g. Sinnar, Brooklyn, Shibuya (optional)"
                {...register('city')}
              />
              {errors.city && <p className="mt-1.5 text-xs text-error">{errors.city.message}</p>}
            </div>

            <motion.button
              whileTap={(reduce || limitReached) ? undefined : { scale: 0.96 }}
              type="submit"
              disabled={isSubmitting || limitReached}
              className={`w-full mt-2 ${limitReached ? 'btn-disabled bg-surface-2 text-text-muted cursor-not-allowed py-2 px-4 rounded-xl' : 'btn-primary'}`}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2 inline" />}
              {isSubmitting ? 'Saving…' : limitReached ? 'Limit Reached' : 'Complete Setup'}
            </motion.button>
          </form>
        </motion.div>
      </section>
    </Layout>
  );
};

export default AddressSetupPage;
