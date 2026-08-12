import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { FiEye, FiEyeOff, FiLock } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import api, { getErrorMessage } from '../services/api';
import BrandLogo from '../components/BrandLogo';
import Button from '../components/ui/Button';
import { Input } from '../components/ui/Field';

export default function ChangePassword() {
  const { user, refreshSession, logout } = useAuth();
  const { businessName } = useSettings();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!user) return <Navigate to="/login" replace />;
  if (!user.mustChangePassword) return <Navigate to="/" replace />;

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    if (error) setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (form.newPassword.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const { data } = await api.put('/auth/me/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });

      refreshSession(data);
      toast.success('Password updated. You can now use the app.');
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update your password.'));
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <BrandLogo size={64} rounded="rounded-2xl" className="shadow-sm border border-hairline/[0.07]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-semibold text-content tracking-tight">
            {businessName}
          </h1>
          <p className="text-sm text-content-subtle mt-1">Set a new password to continue</p>
        </div>

        <div className="surface-card rounded-card p-6 sm:p-7">
          <h2 className="text-lg font-semibold text-content">Change your password</h2>
          <p className="text-sm text-content-muted mt-1 mb-5">
            Your account was created with a temporary password. Choose a new one before using the app.
          </p>

          <form onSubmit={handleSubmit} className="space-y-2.5" noValidate>
            <Input
              label="Current password"
              required
              type={showPassword ? 'text' : 'password'}
              icon={FiLock}
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={update('currentPassword')}
              disabled={submitting}
            />

            <Input
              label="New password"
              required
              type={showPassword ? 'text' : 'password'}
              icon={FiLock}
              autoComplete="new-password"
              placeholder="At least 6 characters"
              minLength={6}
              value={form.newPassword}
              onChange={update('newPassword')}
              disabled={submitting}
            />

            <div className="relative">
              <Input
                label="Confirm new password"
                required
                type={showPassword ? 'text' : 'password'}
                icon={FiLock}
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                disabled={submitting}
                className="[&_.field-shell-control]:pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 h-10 w-10 grid place-items-center rounded-well text-content-subtle hover:text-content transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <FiEyeOff className="w-[18px] h-[18px]" /> : <FiEye className="w-[18px] h-[18px]" />}
              </button>
            </div>

            {error && (
              <div
                className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-500"
                role="alert"
              >
                {error}
              </div>
            )}

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              {submitting ? 'Saving…' : 'Save and continue'}
            </Button>

            <Button type="button" variant="ghost" fullWidth onClick={logout} disabled={submitting}>
              Sign out instead
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
