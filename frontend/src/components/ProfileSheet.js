import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiCamera, FiSettings, FiTrash2 } from 'react-icons/fi';
import { toast } from '../utils/toast';
import { useAuth } from '../context/AuthContext';
import api, { getErrorMessage } from '../services/api';
import UserAvatar from './UserAvatar';
import Modal from './ui/Modal';
import Button from './ui/Button';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';

export default function ProfileSheet({ open, onClose }) {
  const { user, updateUser } = useAuth();
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.match(/^image\/(png|jpe?g|webp)$/)) {
      toast.error('Use a PNG, JPG, or WEBP image');
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('That image is over 2MB. Try a smaller one.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read the file'));
        reader.readAsDataURL(file);
      });

      const { data } = await api.post('/auth/me/avatar', { avatar: dataUrl });
      updateUser(data.user);
      toast.success('Profile picture updated');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not upload your photo'));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      const { data } = await api.delete('/auth/me/avatar');
      updateUser(data.user);
      toast.success('Profile picture removed');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Could not remove your photo'));
    } finally {
      setUploading(false);
    }
  };

  if (!user) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Your profile"
      description="Update how you appear across the app."
      size="sm"
      busy={uploading}
      disableClose={uploading}
    >
      <div className="space-y-5">
        <div className="flex flex-col items-center text-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1"
            aria-label="Change profile picture"
          >
            <UserAvatar name={user.name} avatar={user.avatar} size="xl" />
            <span className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 group-disabled:opacity-50 transition-colors flex items-center justify-center">
              <FiCamera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
            </span>
          </button>
          <div>
            <p className="font-semibold text-content">{user.name}</p>
            <p className="text-sm text-content-subtle">{user.email}</p>
            <p className="text-xs text-content-subtle capitalize mt-0.5">{user.role}</p>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={handleFileChange}
          className="sr-only"
        />

        <div className="flex flex-wrap justify-center gap-2">
          <Button
            icon={FiCamera}
            loading={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {user.avatar ? 'Replace photo' : 'Upload photo'}
          </Button>
          {user.avatar && (
            <Button variant="dangerGhost" icon={FiTrash2} onClick={handleRemove} disabled={uploading}>
              Remove
            </Button>
          )}
        </div>

        <div className="pt-2 border-t border-hairline/[0.07]">
          <Link
            to="/settings"
            onClick={onClose}
            className="flex items-center justify-center gap-2 py-2.5 text-sm font-medium text-content-muted hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
          >
            <FiSettings className="w-4 h-4" aria-hidden="true" />
            Account & business settings
          </Link>
        </div>
      </div>
    </Modal>
  );
}
