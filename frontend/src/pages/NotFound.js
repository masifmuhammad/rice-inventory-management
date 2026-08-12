import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FiArrowLeft, FiCompass } from 'react-icons/fi';
import Button from '../components/ui/Button';

export default function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-14 h-14 rounded-full bg-hairline/[0.08] flex items-center justify-center mx-auto mb-5">
          <FiCompass className="w-6 h-6 text-content-subtle" aria-hidden="true" />
        </div>

        <h1 className="text-xl font-semibold text-content">This page does not exist</h1>
        <p className="text-sm text-content-subtle mt-2">
          Nothing lives at <code className="text-content-muted bg-hairline/[0.08] px-1.5 py-0.5 rounded">{pathname}</code>.
          It may have moved, or the link may be out of date.
        </p>

        <div className="mt-6 flex justify-center">
          <Link to="/">
            <Button icon={FiArrowLeft}>Back to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
