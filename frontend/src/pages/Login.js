import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from '../utils/toast';
import { FiEye, FiEyeOff, FiArrowRight } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import api, { getErrorMessage, isCancel } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import LanguagePicker from '../components/LanguagePicker';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Field';
import { translate, useAppLanguage } from '../context/LanguageContext';

export default function Login() {
  useAppLanguage();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', businessId: '' });
  const [businesses, setBusinesses] = useState([]);
  const [loadingBusinesses, setLoadingBusinesses] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { login, register } = useAuth();
  const { businessName } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const firstFieldRef = useRef(null);

  const isLogin = mode === 'login';
  const redirectTo = location.state?.from?.pathname || '/';

  /**
   * The business list for the signup form.
   *
   * Goes through the shared client, not bare axios: hard-coding `/api` ignores
   * REACT_APP_API_URL, so on split hosting this hit the static host, got
   * index.html back, and left the dropdown empty with no error — registration
   * was simply impossible and nothing said why. The abort also settles the
   * login/register toggle race, where an older response could land last.
   */
  useEffect(() => {
    if (mode !== 'register') return undefined;

    const controller = new AbortController();
    setLoadingBusinesses(true);

    api
      .get('/businesses/public', { signal: controller.signal })
      .then(({ data }) => setBusinesses(Array.isArray(data) ? data : []))
      .catch((err) => {
        if (isCancel(err)) return;
        setBusinesses([]);
        setError(getErrorMessage(err, 'Could not load the business list'));
      })
      .finally(() => setLoadingBusinesses(false));

    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) firstFieldRef.current?.focus();
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
    <div className="login-screen min-h-[100dvh] bg-surface-1 lg:grid lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-[#17251f] text-white p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <BrandLogo size={44} rounded="rounded-xl" />
          <span className="text-base font-medium tracking-tight">{businessName}</span>
        </div>
        <div className="py-16 max-w-lg">
          <p className="text-sm text-white/65 mb-6">{translate("Stock & cash, in balance.")}</p>
          <h2 className="text-[clamp(3rem,4.6vw,4.75rem)] leading-[1.07] tracking-[-0.04em] font-medium">{translate("Every bag.")}<br />{translate("Every rupee.")}<br />{translate("Accounted for.")}</h2>
          <p className="mt-8 text-base leading-relaxed text-white/70 max-w-sm">{translate("A clear record of your rice business. From the first delivery to the last sale of the day.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-8 border-t border-white/20 pt-7">
          <div><p className="text-sm font-medium">{translate("Your inventory")}</p><p className="text-sm text-white/65 mt-2">{translate("Stock, deliveries & sales")}</p></div>
          <div><p className="text-sm font-medium">{translate("Your cash book")}</p><p className="text-sm text-white/65 mt-2">{translate("Income, expenses & balances")}</p></div>
        </div>
      </aside>
      <main className="flex min-h-[100dvh] flex-col px-6 sm:px-10 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] lg:justify-center">
        <div className="flex justify-end mb-5"><LanguagePicker /></div>
        <div className="lg:hidden flex items-center gap-3">
          <BrandLogo size={44} rounded="rounded-xl" />
          <span className="text-base font-semibold tracking-tight text-content">{businessName}</span>
        </div>
        <div className="w-full max-w-[400px] mx-auto mt-14 sm:mt-20 lg:mt-0">
          <h1 className="text-[34px] sm:text-[40px] leading-tight font-semibold tracking-[-0.04em] text-content">{translate(isLogin ? 'Sign in' : 'Create your account')}</h1>
          <p className="text-[15px] leading-relaxed text-content-muted mt-3 mb-8">{translate(isLogin ? 'Your stock, sales and cash book. All together.' : 'Choose your business below. An administrator will approve your account.')}</p>
          <form onSubmit={handleSubmit} className="space-y-3" aria-busy={submitting}>
            {!isLogin && <>
              <Input ref={firstFieldRef} label={translate("Full name")} required name="name" maxLength={80} autoComplete="name" value={form.name} onChange={update('name')} disabled={submitting} />
              <Select label={translate("Business")} required name="businessId" value={form.businessId} onChange={update('businessId')} disabled={submitting || loadingBusinesses}>
                <option value="">{translate(loadingBusinesses ? 'Loading businesses?' : 'Select a business')}</option>
                {businesses.map((business) => <option key={business.id} value={business.id}>{business.name}</option>)}
              </Select>
            </>}
            <Input ref={isLogin ? firstFieldRef : undefined} label={translate("Email address")} required type="email" name="email" maxLength={255} autoComplete="username" inputMode="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={update('email')} disabled={submitting} />
            <div className="relative">
              <Input label={translate("Password")} required type={showPassword ? 'text' : 'password'} name="password" autoComplete={isLogin ? 'current-password' : 'new-password'} minLength={6} value={form.password} onChange={update('password')} disabled={submitting} enterKeyHint="go" className="[&_.field-shell-control]:pr-12 [&_.field-shell-label]:pr-10" hint={translate(!isLogin ? 'Use at least 6 characters.' : undefined)} />
              <button type="button" onClick={() => setShowPassword((current) => !current)} aria-label={translate(showPassword ? 'Hide password' : 'Show password')} aria-pressed={showPassword} className="absolute right-1.5 top-2 h-11 w-11 grid place-items-center rounded-lg text-content-muted hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-content">
                {showPassword ? <FiEyeOff className="w-5 h-5" /> : <FiEye className="w-5 h-5" />}
              </button>
            </div>
            {error && <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-400" role="alert">{translate(error)}</div>}
            <div className="pt-3"><Button type="submit" size="lg" fullWidth loading={submitting} iconRight={FiArrowRight} className="min-h-[54px] rounded-full">{translate(submitting ? (isLogin ? 'Signing in?' : 'Creating account?') : (isLogin ? 'Sign in' : 'Create account'))}</Button></div>
          </form>
          <div className="mt-7 text-center text-sm text-content-muted">
            <span>{translate(isLogin ? 'New to the team? ' : 'Already have an account? ')}</span>
            <button type="button" onClick={switchMode} disabled={submitting} className="font-semibold text-content underline underline-offset-4 decoration-hairline/30 min-h-[44px] disabled:opacity-50">{translate(isLogin ? 'Sign up' : 'Sign in')}</button>
          </div>
          <p className="mt-12 text-xs text-center leading-relaxed text-content-subtle">{translate("Access is limited to your approved business.")}<br />{translate("Need help signing in? Contact your administrator.")}</p>
        </div>
      </main>
    </div>
  );
}
