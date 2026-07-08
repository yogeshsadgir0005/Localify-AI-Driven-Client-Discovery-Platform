import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Eye, EyeOff, Loader2, CheckCircle2, Info } from 'lucide-react';
import toast from 'react-hot-toast';
import Layout from '../layout/Layout';
import Logo from '../components/Logo';
import api, { getErrorMessage } from '../utils/axios';

const emailSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
});

const otpSchema = z.object({
  otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

const passwordSchema = z
  .object({
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

const stepVariants = {
  enter: { opacity: 0, x: 30 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -30 },
};

const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [showPw, setShowPw] = useState(false);

  const emailForm = useForm({
    resolver: zodResolver(emailSchema),
    mode: 'onTouched',
  });
  const otpForm = useForm({
    resolver: zodResolver(otpSchema),
    mode: 'onTouched',
  });
  const passwordForm = useForm({
    resolver: zodResolver(passwordSchema),
    mode: 'onTouched',
  });

  const submitEmail = async (values) => {
    try {
      await api.post('/auth/forgot-password', { email: values.email });
      setEmail(values.email);
      toast.success('Reset code sent to your email.');
      setStep(2);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send reset code.'));
    }
  };

  const submitOtp = async (values) => {
    try {
      await api.post('/auth/verify-reset-otp', { email, otp: values.otp });
      setOtp(values.otp);
      setStep(3);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not verify code.'));
    }
  };

  const submitPassword = async (values) => {
    try {
      await api.post('/auth/reset-password', {
        email,
        otp,
        password: values.password,
      });
      toast.success('Password reset successful.');
      setStep(4);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not reset password.'));
    }
  };

  const motionProps = reduce
    ? {}
    : {
        variants: stepVariants,
        initial: 'enter',
        animate: 'center',
        exit: 'exit',
        transition: { duration: 0.3 },
      };

  return (
    <Layout>
      <Helmet>
        <title>Reset Password — Localify</title>
        <meta name="description" content="Reset your Localify account password." />
      </Helmet>

      <section className="mx-auto flex max-w-md flex-col px-4 py-12 sm:px-6">
        <div className="card-base overflow-hidden p-7 sm:p-8">
          <div className="mb-6 text-center flex flex-col items-center">
            <Logo className="h-16 w-auto object-contain mb-4" />
            <h1 className="font-display text-2xl font-bold text-text">
              Reset your password
            </h1>
          </div>

          {/* Step indicator */}
          <div className="mb-6 flex items-center justify-center gap-2">
            {[1, 2, 3, 4].map((n) => (
              <span
                key={n}
                className={`h-1.5 rounded-full transition-all ${
                  step >= n ? 'w-8 bg-primary' : 'w-4 bg-border'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.form
                key="step1"
                {...motionProps}
                onSubmit={emailForm.handleSubmit(submitEmail)}
                noValidate
                className="space-y-4"
              >
                <p className="text-sm text-text-muted">
                  Enter your account email and we&apos;ll generate a 6-digit reset
                  code.
                </p>
                <div>
                  <label
                    htmlFor="fp-email"
                    className="mb-1.5 block text-sm text-text"
                  >
                    Email
                  </label>
                  <input
                    id="fp-email"
                    type="email"
                    autoComplete="email"
                    className="input-base"
                    placeholder="you@example.com"
                    {...emailForm.register('email')}
                  />
                  {emailForm.formState.errors.email && (
                    <p className="mt-1.5 text-xs text-error">
                      {emailForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  type="submit"
                  disabled={emailForm.formState.isSubmitting}
                  className="btn-primary w-full"
                >
                  {emailForm.formState.isSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Send reset code
                </motion.button>
              </motion.form>
            )}

            {step === 2 && (
              <motion.form
                key="step2"
                {...motionProps}
                onSubmit={otpForm.handleSubmit(submitOtp)}
                noValidate
                className="space-y-4"
              >
                <p className="text-sm text-text-muted">
                  Enter the 6-digit code sent for{' '}
                  <span className="text-text">{email}</span>.
                </p>
                <div>
                  <label
                    htmlFor="otp"
                    className="mb-1.5 block text-sm text-text"
                  >
                    Reset code
                  </label>
                  <input
                    id="otp"
                    inputMode="numeric"
                    maxLength={6}
                    className="input-base tracking-[0.5em]"
                    placeholder="000000"
                    {...otpForm.register('otp')}
                  />
                  {otpForm.formState.errors.otp && (
                    <p className="mt-1.5 text-xs text-error">
                      {otpForm.formState.errors.otp.message}
                    </p>
                  )}
                </div>

                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  type="submit"
                  disabled={otpForm.formState.isSubmitting}
                  className="btn-primary w-full"
                >
                  {otpForm.formState.isSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Verify code
                </motion.button>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full text-center text-xs text-text-muted hover:text-text"
                >
                  Use a different email
                </button>
              </motion.form>
            )}

            {step === 3 && (
              <motion.form
                key="step3"
                {...motionProps}
                onSubmit={passwordForm.handleSubmit(submitPassword)}
                noValidate
                className="space-y-4"
              >
                <p className="text-sm text-text-muted">
                  Code verified. Choose a new password for your account.
                </p>

                <div>
                  <label
                    htmlFor="new-password"
                    className="mb-1.5 block text-sm text-text"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="new-password"
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      className="input-base pr-12"
                      placeholder="••••••••"
                      {...passwordForm.register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((s) => !s)}
                      aria-label={showPw ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 right-3 grid place-items-center text-text-muted hover:text-text"
                    >
                      {showPw ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {passwordForm.formState.errors.password && (
                    <p className="mt-1.5 text-xs text-error">
                      {passwordForm.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="confirm-new-password"
                    className="mb-1.5 block text-sm text-text"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirm-new-password"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    className="input-base"
                    placeholder="••••••••"
                    {...passwordForm.register('confirmPassword')}
                  />
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="mt-1.5 text-xs text-error">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <motion.button
                  whileTap={reduce ? undefined : { scale: 0.96 }}
                  type="submit"
                  disabled={passwordForm.formState.isSubmitting}
                  className="btn-primary w-full"
                >
                  {passwordForm.formState.isSubmitting && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Reset password
                </motion.button>
              </motion.form>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                {...motionProps}
                className="flex flex-col items-center gap-4 text-center"
              >
                <CheckCircle2 className="h-14 w-14 text-accent" />
                <h2 className="font-display text-xl font-semibold text-text">
                  Password updated
                </h2>
                <p className="text-sm text-text-muted">
                  Your password has been reset. You can now log in with your new
                  password.
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/login', { replace: true })}
                  className="btn-primary mt-2 w-full"
                >
                  Go to login
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {step !== 4 && (
            <p className="mt-6 text-center text-sm text-text-muted">
              Remembered it?{' '}
              <Link
                to="/login"
                className="font-medium text-primary hover:underline"
              >
                Back to login
              </Link>
            </p>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default ForgotPasswordPage;
