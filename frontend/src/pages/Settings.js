import React, { useEffect, useRef, useState } from 'react';
import { toast } from '../utils/toast';
import { FiBriefcase, FiCheck, FiImage, FiLock, FiMoon, FiTrash2, FiUser, FiVolume2 } from 'react-icons/fi';

import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useTheme } from '../context/ThemeContext';
import { applyPalette } from '../utils/color';
import {
  feedbackSuccess,
  getFeedbackPrefs,
  getHapticsSupportHint,
  setFeedbackPrefs,
  unlockFeedbackAudio,
} from '../utils/feedback';
import PageHeader from '../components/PageHeader';
import SettingsSkeleton from '../components/skeletons/SettingsSkeleton';
import Button from '../components/ui/Button';
import Card, { CardBody, CardHeader } from '../components/ui/Card';
import { Checkbox, Input, Select } from '../components/ui/Field';

const PRESET_COLORS = [
  { hex: '#0284c7', name: 'Sky' },
  { hex: '#059669', name: 'Emerald' },
  { hex: '#d97706', name: 'Amber' },
  { hex: '#dc2626', name: 'Red' },
  { hex: '#7c3aed', name: 'Violet' },
  { hex: '#0f172a', name: 'Slate' },
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export default function Settings() {
  const { user, updateUser } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { preference, setTheme } = useTheme();
  const [feedbackPrefs, setFeedbackPrefsState] = useState(() => getFeedbackPrefs());

  useEffect(() => {
    const sync = () => setFeedbackPrefsState(getFeedbackPrefs());
    window.addEventListener('ui-feedback-prefs', sync);
    return () => window.removeEventListener('ui-feedback-prefs', sync);
  }, []);

  const [business, setBusiness] = useState(null);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [profile, setProfile] = useState({ name: '', email: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (settings) {
      setBusiness({
        businessName: settings.businessName || '',
        tagline: settings.tagline || '',
        phone: settings.phone || '',
        email: settings.email || '',
        website: settings.website || '',
        primaryColor: settings.primaryColor || '#0284c7',
        currency: settings.currency || { code: 'PKR', symbol: 'Rs.' },
        address: settings.address || {},
        receiptSettings: settings.receiptSettings || {},
      });
    }
  }, [settings]);

  useEffect(() => {
    if (user) setProfile({ name: user.name || '', email: user.email || '' });
  }, [user]);

  const setBusinessField = (field) => (event) => {
    const value = event.target.value;
    setBusiness((current) => ({ ...current, [field]: value }));
  };

  /* --------------------------------------------------------------- branding */

  const previewColor = (hex) => {
    setBusiness((current) => ({ ...current, primaryColor: hex }));
    // Repaint immediately so the choice is judged against the real interface,
    // not a swatch. Reverted on cancel by the settings reload.
    applyPalette(hex);
  };

  const handleLogoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // let the same file be picked again after an error
    if (!file) return;

    if (!/^image\/(png|jpeg|jpg|webp|svg\+xml)$/.test(file.type)) {
      toast.error('Choose a PNG, JPG, WEBP or SVG image.');
      return;
    }

    if (file.size > MAX_LOGO_BYTES) {
      toast.error('That image is over 2MB. Try a smaller one.');
      return;
    }

    setUploadingLogo(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });

      const { data } = await api.post('/settings/logo', { logo: dataUrl });
      await updateSettings({ logo: data.logo });
      toast.success('Logo updated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not upload the logo'));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    setUploadingLogo(true);
    try {
      await api.delete('/settings/logo');
      await updateSettings({ logo: null });
      toast.success('Logo removed');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not remove the logo'));
    } finally {
      setUploadingLogo(false);
    }
  };

  /* ----------------------------------------------------------------- saving */

  const handleSaveBusiness = async (event) => {
    event.preventDefault();
    setSavingBusiness(true);

    try {
      await updateSettings(business);
      toast.success('Business details saved');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not save your settings'));
    } finally {
      setSavingBusiness(false);
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setSavingProfile(true);

    try {
      const { data } = await api.put('/auth/me', profile);
      updateUser(data.user);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not update your profile'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    setPasswordError('');

    if (passwords.newPassword.length < 6) {
      setPasswordError('The new password must be at least 6 characters.');
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordError('The two new passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await api.put('/auth/me/password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed');
    } catch (error) {
      setPasswordError(getErrorMessage(error, 'Could not change your password'));
    } finally {
      setSavingPassword(false);
    }
  };

  if (!business) return <SettingsSkeleton />;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Settings" description="Your business details, branding and account." />

      {/* Business */}
      <Card>
        <CardHeader title="Business details" subtitle="Shown on receipts and reports" icon={FiBriefcase} />
        <CardBody>
          <form onSubmit={handleSaveBusiness} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Input
                label="Business name"
                required
                value={business.businessName}
                onChange={setBusinessField('businessName')}
                className="sm:col-span-2"
              />
              <Input
                label="Tagline"
                value={business.tagline}
                onChange={setBusinessField('tagline')}
                placeholder="Inventory Management System"
                className="sm:col-span-2"
              />
              <Input label="Phone" value={business.phone} onChange={setBusinessField('phone')} placeholder="+92 300 0000000" />
              <Input label="Email" type="email" value={business.email} onChange={setBusinessField('email')} placeholder="shop@example.com" />
              <Input
                label="City"
                value={business.address?.city || ''}
                onChange={(event) =>
                  setBusiness((current) => ({
                    ...current,
                    address: { ...current.address, city: event.target.value },
                  }))
                }
              />
              <Input
                label="Country"
                value={business.address?.country || ''}
                onChange={(event) =>
                  setBusiness((current) => ({
                    ...current,
                    address: { ...current.address, country: event.target.value },
                  }))
                }
              />
              <Input
                label="Currency symbol"
                value={business.currency?.symbol || ''}
                onChange={(event) =>
                  setBusiness((current) => ({
                    ...current,
                    currency: { ...current.currency, symbol: event.target.value },
                  }))
                }
                hint="Used everywhere money is shown"
              />
              <Select
                label="Currency code"
                value={business.currency?.code || 'PKR'}
                onChange={(event) =>
                  setBusiness((current) => ({
                    ...current,
                    currency: { ...current.currency, code: event.target.value },
                  }))
                }
              >
                {['PKR', 'USD', 'AED', 'GBP', 'EUR', 'INR', 'SAR'].map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
              <Input
                label="Receipt footer"
                value={business.receiptSettings?.footerText || ''}
                onChange={(event) =>
                  setBusiness((current) => ({
                    ...current,
                    receiptSettings: { ...current.receiptSettings, footerText: event.target.value },
                  }))
                }
                placeholder="Thank you for your business!"
                className="sm:col-span-2"
              />
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" loading={savingBusiness}>
                Save details
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Branding */}
      <Card>
        <CardHeader title="Branding" subtitle="Logo and colour used across the app" icon={FiImage} />
        <CardBody className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-20 h-20 rounded-xl border border-hairline/[0.07] bg-surface-sunken flex items-center justify-center overflow-hidden flex-shrink-0">
              {settings.logo ? (
                <img src={settings.logo} alt="Business logo" className="w-full h-full object-contain" />
              ) : (
                <FiImage className="w-7 h-7 text-content-subtle" aria-hidden="true" />
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoChange}
                className="sr-only"
              />
              <Button
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                loading={uploadingLogo}
              >
                {settings.logo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {settings.logo && (
                <Button variant="dangerGhost" icon={FiTrash2} onClick={handleRemoveLogo} disabled={uploadingLogo}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-content-muted mb-2">Brand colour</p>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => previewColor(color.hex)}
                  aria-label={color.name}
                  aria-pressed={business.primaryColor === color.hex}
                  style={{ backgroundColor: color.hex }}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center transition-transform
                    hover:scale-105 active:scale-95 ${
                      business.primaryColor === color.hex
                        ? 'ring-2 ring-offset-2 ring-offset-surface-1 ring-content'
                        : ''
                    }`}
                >
                  {business.primaryColor === color.hex && <FiCheck className="w-4 h-4 text-white" />}
                </button>
              ))}

              <label className="w-10 h-10 rounded-lg border-2 border-dashed border-hairline/[0.12] flex items-center justify-center cursor-pointer hover:border-hairline/[0.2] transition-colors">
                <input
                  type="color"
                  value={business.primaryColor}
                  onChange={(event) => previewColor(event.target.value)}
                  className="sr-only"
                />
                <span className="text-xs text-content-subtle">+</span>
              </label>
            </div>
            <p className="text-xs text-content-subtle mt-2">
              Changes preview instantly. Press Save details above to keep them.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Appearance */}
      <Card>
        <CardHeader title="Appearance" subtitle="Light, dark or follow your device" icon={FiMoon} />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'System' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                aria-pressed={preference === option.value}
                className={`px-4 py-2.5 min-h-[44px] rounded-lg text-sm font-medium border transition-colors ${
                  preference === option.value
                    ? 'bg-primary-500/12 border-primary-500/40 text-primary-600 dark:text-primary-400'
                    : 'bg-surface-1 border-hairline/[0.12] text-content-muted hover:bg-hairline/[0.05]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Feedback */}
      <Card>
        <CardHeader
          title="Sound & haptics"
          subtitle="Soft cues when you save, download, or hit an error"
          icon={FiVolume2}
        />
        <CardBody className="space-y-3">
          <Checkbox
            label="Sound effects"
            description="Short chimes on success and errors — the most reliable cue on iPhone"
            checked={feedbackPrefs.sound}
            onChange={(e) => {
              unlockFeedbackAudio();
              setFeedbackPrefs({ sound: e.target.checked });
              setFeedbackPrefsState(getFeedbackPrefs());
              if (e.target.checked) feedbackSuccess();
            }}
          />
          <Checkbox
            label="Haptic vibration"
            description={
              getHapticsSupportHint() === 'vibrate'
                ? 'Uses the Vibration API on this device (typical on Android).'
                : getHapticsSupportHint() === 'ios-switch'
                  ? 'iPhone still blocks the normal vibration API — even as a Home Screen app. We try Apple’s switch haptic when the OS allows it; keep Sound on as backup.'
                  : 'Not available in this browser. Sound effects still work.'
            }
            checked={feedbackPrefs.haptics}
            onChange={(e) => {
              unlockFeedbackAudio();
              setFeedbackPrefs({ haptics: e.target.checked });
              setFeedbackPrefsState(getFeedbackPrefs());
              if (e.target.checked) feedbackSuccess();
            }}
          />
        </CardBody>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader title="Your account" icon={FiUser} />
        <CardBody>
          <form onSubmit={handleSaveProfile} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Input
                label="Name"
                value={profile.name}
                onChange={(event) => setProfile((p) => ({ ...p, name: event.target.value }))}
              />
              <Input
                label="Email"
                type="email"
                value={profile.email}
                onChange={(event) => setProfile((p) => ({ ...p, email: event.target.value }))}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" loading={savingProfile}>
                Update profile
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader title="Password" subtitle="Change the password you sign in with" icon={FiLock} />
        <CardBody>
          <form onSubmit={handleChangePassword} className="space-y-2.5">
            <Input
              label="Current password"
              type="password"
              required
              autoComplete="current-password"
              value={passwords.currentPassword}
              onChange={(event) => setPasswords((p) => ({ ...p, currentPassword: event.target.value }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Input
                label="New password"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={passwords.newPassword}
                onChange={(event) => setPasswords((p) => ({ ...p, newPassword: event.target.value }))}
              />
              <Input
                label="Confirm new password"
                type="password"
                required
                autoComplete="new-password"
                value={passwords.confirmPassword}
                onChange={(event) => setPasswords((p) => ({ ...p, confirmPassword: event.target.value }))}
              />
            </div>

            {passwordError && (
              <p className="text-sm text-red-500" role="alert">
                {passwordError}
              </p>
            )}

            <div className="flex justify-end">
              <Button type="submit" variant="secondary" loading={savingPassword}>
                Change password
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
