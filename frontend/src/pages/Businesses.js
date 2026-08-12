import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FiBriefcase, FiPlus } from 'react-icons/fi';
import api, { getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { applyPalette } from '../utils/color';
import PageHeader from '../components/PageHeader';
import Button from '../components/ui/Button';
import Card, { CardBody } from '../components/ui/Card';
import { Input, Select } from '../components/ui/Field';
import BrandLogo from '../components/BrandLogo';
import { EmptyState, ErrorState } from '../components/ui/States';
import { Skeleton, SkeletonGate } from '../components/ui/Skeleton';

const COLOR_PRESETS = [
  { name: 'Forest', primary: '#059669', accent: '#10b981' },
  { name: 'Ocean', primary: '#0284c7', accent: '#0ea5e9' },
  { name: 'Royal', primary: '#4f46e5', accent: '#6366f1' },
  { name: 'Slate', primary: '#334155', accent: '#64748b' },
];

export default function Businesses() {
  const { businesses, can, switchBusiness } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', primaryColor: '#059669', accentColor: '#10b981' });
  const [logoUploading, setLogoUploading] = useState(false);
  const [list, setList] = useState(businesses);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/businesses');
      setList(data.businesses || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load businesses'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, businesses]);

  if (!can('settings.manage')) {
    return null;
  }

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      await api.post('/businesses', form);
      toast.success('Business created');
      setForm({ name: '', primaryColor: '#059669', accentColor: '#10b981' });
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create business'));
    } finally {
      setCreating(false);
    }
  };

  const handleLogo = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be smaller than 2MB');
      return;
    }
    setLogoUploading(true);
    try {
      const reader = new FileReader();
      const dataUrl = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api.post('/settings/logo', { logo: dataUrl });
      toast.success('Logo updated for active business');
      window.dispatchEvent(new CustomEvent('rim:business-changed'));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not upload logo'));
    } finally {
      setLogoUploading(false);
      event.target.value = '';
    }
  };

  const applyColors = async (primaryColor, accentColor) => {
    applyPalette(primaryColor);
    await updateSettings({ primaryColor, accentColor });
    toast.success('Brand colours updated');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Businesses"
        description="Manage organisations, branding, and logos. Only admins can change logos."
      />

      {error && <ErrorState message={error} onRetry={load} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-lg font-display font-semibold text-content flex items-center gap-2">
              <FiBriefcase aria-hidden="true" /> Your businesses
            </h2>
            {loading ? (
              <SkeletonGate className="space-y-2" aria-busy="true" aria-label="Loading businesses">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between gap-3 p-3 rounded-card border border-hairline/[0.07]"
                  >
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-9 w-16 rounded-lg" />
                  </div>
                ))}
              </SkeletonGate>
            ) : list.length === 0 ? (
              <EmptyState title="No businesses yet" description="Create one below." />
            ) : (
              <ul className="space-y-2">
                {list.map((business) => (
                  <li
                    key={business.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-card border-hairline/[0.07] surface-card"
                  >
                    <span className="font-medium text-content">{business.name}</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => switchBusiness(business.id).then(() => window.location.reload())}
                    >
                      Open
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-lg font-display font-semibold text-content">Active business branding</h2>
            <div className="flex items-center gap-4">
              <BrandLogo size={56} rounded="rounded-2xl" />
              <div>
                <p className="font-medium text-content">{settings.businessName}</p>
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-primary-600 cursor-pointer min-h-[44px]">
                  <input type="file" accept="image/*" className="sr-only" onChange={handleLogo} disabled={logoUploading} />
                  {logoUploading ? (
                    <span className="inline-flex items-center gap-2">
                      <Skeleton className="w-4 h-4 rounded" />
                      Uploading…
                    </span>
                  ) : (
                    'Change logo'
                  )}
                </label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => applyColors(preset.primary, preset.accent)}
                  className="px-3 py-2 min-h-[44px] rounded-full text-xs font-medium border border-hairline/[0.07] hover:border-primary-400 transition-colors"
                  style={{ background: `linear-gradient(135deg, ${preset.primary}, ${preset.accent})`, color: '#fff' }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <h2 className="text-lg font-display font-semibold text-content mb-4 flex items-center gap-2">
            <FiPlus aria-hidden="true" /> Add a business
          </h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-w-2xl">
            <Input
              label="Business name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. 999"
            />
            <Select
              label="Colour preset"
              value={form.primaryColor}
              onChange={(e) => {
                const preset = COLOR_PRESETS.find((p) => p.primary === e.target.value) || COLOR_PRESETS[0];
                setForm((f) => ({ ...f, primaryColor: preset.primary, accentColor: preset.accent }));
              }}
            >
              {COLOR_PRESETS.map((preset) => (
                <option key={preset.name} value={preset.primary}>
                  {preset.name}
                </option>
              ))}
            </Select>
            <div className="sm:col-span-2">
              <Button type="submit" loading={creating} icon={FiPlus}>
                Create business
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
