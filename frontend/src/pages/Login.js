import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { FiEye, FiEyeOff, FiLock, FiMail, FiUser } from 'react-icons/fi';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { iconSwap, staggerContainer, staggerItem, staggerItemReduced, springUI } from '../utils/motion';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', businessId: '' });
  const [businesses, setBusinesses] = useState([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, register } = useAuth();
  const { businessName, settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const firstFieldRef = useRef(null);

  const isLogin = mode === 'login';
  const redirectTo = location.state?.from?.pathname || '/';
  const reducedMotion = usePrefersReducedMotion();
  const item = reducedMotion ? staggerItemReduced : staggerItem;

  useEffect(() => {
    if (mode !== 'register') return;
    setLoadingBusinesses(true);
    axios
      .get('/api/businesses/public')
      .then(({ data }) => setBusinesses(data || []))
      .catch(() => setBusinesses([]))
      .finally(() => setLoadingBusinesses(false));
  }, [mode]);

  useEffect(() => {
    firstFieldRef.current?.focus();
  }, [mode]);

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    setError('');
    setSubmitting(true);

    try {
      if (isLogin) {
        const data = await login(form.email.trim(), form.password);
        toast.success('Welcome back');
        const target = data.user?.mustChangePassword
          ? '/change-password'
          : redirectTo;
        navigate(target, { replace: true });
      } else {
        if (!form.businessId) {
          setError('Please select which business you want to work for');
          setSubmitting(false);
          return;
        }
        const data = await register(form.name.trim(), form.email.trim(), form.password, form.businessId);
        toast.success(data.message || 'Account request sent');
        setMode('login');
        setForm({ name: '', email: form.email.trim(), password: '', businessId: '' });
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Could not sign you in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(isLogin ? 'register' : 'login');
    setError('');
    setForm({ name: '', email: '', password: '', businessId: '' });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 py-10">
      <motion.div
        className="w-full max-w-md"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.div variants={item} className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <BrandLogo size={64} rounded="rounded-2xl" className="shadow-sm border border-hairline/[0.07]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-display font-bold text-content tracking-[-0.02em] text-balance">
            {businessName}
          </h1>
          <p className="text-sm text-content-subtle mt-1">
            {settings?.tagline || 'Inventory Management System'}
          </p>
        </motion.div>

        <motion.div variants={item} className="surface-card rounded-card p-6 sm:p-7">
          <h2 className="text-lg font-semibold text-content">
            {isLogin ? 'Sign in' : 'Create your account'}
          </h2>
          <p className="text-sm text-content-muted mt-1 mb-5">
            {isLogin
              ? 'Enter your details to open the dashboard.'
              : 'Request an account. An administrator must approve it before you can sign in.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {!isLogin && (
              <>
                <Input
                  ref={firstFieldRef}
                  label="Full name"
                  required
                  icon={FiUser}
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  value={form.name}
                  onChange={update('name')}
                  disabled={submitting}
                />
                <Select
                  label="Business"
                  required
                  name="businessId"
                  value={form.businessId}
                  onChange={update('businessId')}
                  disabled={submitting || loadingBusinesses}
                  hint={loadingBusinesses ? undefined : 'Choose where you will work'}
                >
                  {loadingBusinesses ? (
                    <option value="">Loading businesses…</option>
                  ) : (
                    <>
                      <option value="">Select a business</option>
                      {businesses.map((business) => (
                        <option key={business.id} value={business.id}>
                          {business.name}
                        </option>
                      ))}
                    </>
                  )}
                </Select>
              </>
            )}

            <Input
              ref={isLogin ? firstFieldRef : undefined}
              label="Email address"
              required
              type="email"
              icon={FiMail}
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck="false"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
              disabled={submitting}
            />

            <div className="relative">
              <Input
                label="Password"
                required
                type={showPassword ? 'text' : 'password'}
                icon={FiLock}
                name="password"
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                placeholder={isLogin ? 'Your password' : 'At least 6 characters'}
                minLength={6}
                value={form.password}
                onChange={update('password')}
                disabled={submitting}
                className="[&_input]:pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1 top-[26px] h-[44px] w-11 grid place-items-center rounded-well
                  text-content-subtle hover:text-content transition-colors"
                tabIndex={-1}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  <motion.span
                    key={showPassword ? 'hide' : 'show'}
                    initial={iconSwap.initial}
                    animate={iconSwap.animate}
                    exit={iconSwap.exit}
                    transition={reducedMotion ? { duration: 0.12 } : iconSwap.transition}
                  >
                    {showPassword ? (
                      <FiEyeOff className="w-[18px] h-[18px]" />
                    ) : (
                      <FiEye className="w-[18px] h-[18px]" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </button>
            </div>

            <AnimatePresence initial={false}>
              {error && (
                <motion.div
                  initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
                  animate={reducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto', y: 0 }}
                  exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
                  transition={reducedMotion ? { duration: 0.15 } : springUI}
                  className="overflow-hidden"
                >
                  <div
                    className="rounded-well border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500"
                    role="alert"
                  >
                    {error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              {submitting
                ? isLogin
                  ? 'Signing in…'
                  : 'Creating account…'
                : isLogin
                ? 'Sign in'
                : 'Create account'}
            </Button>
          </form>

          <div className="mt-5 pt-5 border-t border-hairline/[0.07] text-center">
            <button
              type="button"
              onClick={switchMode}
              disabled={submitting}
              className="text-sm text-content-muted hover:text-content transition-colors disabled:opacity-50"
            >
              {isLogin ? (
                <>
                  Don&apos;t have an account?{' '}
                  <span className="font-medium text-primary-600">Sign up</span>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <span className="font-medium text-primary-600">Sign in</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        <motion.p variants={item} className="text-center text-xs text-content-subtle mt-6">
          Inventory, sales and cash — in one place.
        </motion.p>
      </motion.div>
    </div>
  );
}
