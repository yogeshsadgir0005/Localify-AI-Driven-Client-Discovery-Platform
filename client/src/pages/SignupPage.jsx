import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, useReducedMotion } from 'motion/react';
import { Eye, EyeOff, Loader2, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import GoogleAuthButton from '../components/GoogleAuthButton';
import { useAuth } from '../hooks/useAuth';

const schema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters'),
    email: z.string().trim().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'At least 8 characters')
      .regex(/[A-Z]/, 'Add an uppercase letter')
      .regex(/[0-9]/, 'Add a number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/** Score password strength 0–3. */
const scorePassword = (pw = '') => {
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) score += 1;
  if (pw.length >= 12 && /[^A-Za-z0-9]/.test(pw)) score += 1;
  return score;
};

const STRENGTH = [
  { label: 'Too weak', color: 'bg-error', width: 'w-1/4' },
  { label: 'Weak', color: 'bg-error', width: 'w-2/4' },
  { label: 'Medium', color: 'bg-primary', width: 'w-3/4' },
  { label: 'Strong', color: 'bg-accent', width: 'w-full' },
];

const SignupPage = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { signup } = useAuth();
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: 'onTouched' });

  const pw = watch('password') || '';
  const strength = STRENGTH[scorePassword(pw)];

  const onSubmit = async (values) => {
    const res = await signup({
      name: values.name,
      email: values.email,
      password: values.password,
    });
    if (res.ok) {
      toast.success(`Welcome, ${res.user.name.split(' ')[0]}!`);
      navigate('/address-setup', { replace: true });
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Sign Up — Localify</title>
        <meta name="description" content="Create your free Localify account." />
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
              <MapPin className="h-6 w-6 text-bg" />
            </span>
            <h1 className="font-display text-2xl font-bold text-text">
              Create your account
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Discover the businesses your city never told you about.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm text-text">
                Full name
              </label>
              <input
                id="name"
                type="text"
                autoComplete="name"
                className="input-base"
                placeholder="Jane Doe"
                {...register('name')}
              />
              {errors.name && (
                <p className="mt-1.5 text-xs text-error">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm text-text">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input-base"
                placeholder="you@example.com"
                {...register('email')}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-error">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm text-text">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-base pr-12"
                  placeholder="••••••••"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-3 grid place-items-center text-text-muted hover:text-text"
                >
                  {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              {pw && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.width} ${strength.color}`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-text-muted">
                    Strength: <span className="text-text">{strength.label}</span>
                  </p>
                </div>
              )}

              {errors.password && (
                <p className="mt-1.5 text-xs text-error">
                  {errors.password.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1.5 block text-sm text-text"
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  autoComplete="new-password"
                  className="input-base pr-12"
                  placeholder="••••••••"
                  {...register('confirmPassword')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((s) => !s)}
                  aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-3 grid place-items-center text-text-muted hover:text-text"
                >
                  {showConfirm ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-error">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <motion.button
              whileTap={reduce ? undefined : { scale: 0.96 }}
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </motion.button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>

          <GoogleAuthButton
            text="signup_with"
            onSuccess={() => navigate('/address-setup', { replace: true })}
          />

          <p className="mt-6 text-center text-sm text-text-muted">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary hover:underline">
              Log in
            </Link>
          </p>
        </motion.div>
      </section>
    </Layout>
  );
};

export default SignupPage;
