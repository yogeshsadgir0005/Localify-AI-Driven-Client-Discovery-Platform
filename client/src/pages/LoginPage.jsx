import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
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

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

const hasAddressOf = (user) =>
  Boolean(user?.address?.state && user?.address?.district && user?.address?.city);

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const { login } = useAuth();
  const [showPw, setShowPw] = useState(false);

  const from = location.state?.from?.pathname;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), mode: 'onTouched' });

  const routeAfterAuth = (user) => {
    if (from) {
      navigate(from, { replace: true });
      return;
    }
    navigate(hasAddressOf(user) ? '/search' : '/address-setup', {
      replace: true,
    });
  };

  const onSubmit = async (values) => {
    const res = await login(values.email, values.password);
    if (res.ok) {
      toast.success('Welcome back!');
      routeAfterAuth(res.user);
    } else {
      toast.error(res.error);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Log In — Localify</title>
        <meta name="description" content="Log in to your Localify account." />
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
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Log in to keep discovering local businesses.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm text-text">
                  Password
                </label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
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
              {errors.password && (
                <p className="mt-1.5 text-xs text-error">
                  {errors.password.message}
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
              {isSubmitting ? 'Logging in…' : 'Log in'}
            </motion.button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            or continue with
            <span className="h-px flex-1 bg-border" />
          </div>

          <GoogleAuthButton text="signin_with" onSuccess={routeAfterAuth} />

          <p className="mt-6 text-center text-sm text-text-muted">
            New to Localify?{' '}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </p>
        </motion.div>
      </section>
    </Layout>
  );
};

export default LoginPage;
