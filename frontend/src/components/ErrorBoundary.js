import React from 'react';
import { FiAlertOctagon, FiHome, FiLogOut, FiRefreshCw } from 'react-icons/fi';
import { setCachedCapabilities, setCachedUser, setToken } from '../services/api';

/**
 * Without a boundary, one thrown render turns the whole app into a blank white
 * page with no way out. This catches the throw, keeps the user on a real screen,
 * and offers two exits that actually work.
 *
 * `resetKeys` clears the error when navigation changes, so a broken page does not
 * poison every route after it.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Render error caught by boundary:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    const { resetKeys } = this.props;
    if (!this.state.error || !resetKeys) return;

    const changed =
      prevProps.resetKeys?.length !== resetKeys.length ||
      resetKeys.some((key, i) => key !== prevProps.resetKeys[i]);

    if (changed) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback(error, () => this.setState({ error: null }));

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-5">
            <FiAlertOctagon className="w-7 h-7 text-red-500" aria-hidden="true" />
          </div>

          <h1 className="text-xl font-semibold text-content">This page hit a problem</h1>
          <p className="text-sm text-content-subtle mt-2">
            The rest of the app is fine. Try again, or head back to the dashboard.
          </p>

          <pre className="mt-4 text-left text-xs bg-surface-sunken text-red-400 rounded-lg p-3 overflow-auto max-h-48">
            {error.message}
          </pre>

          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg
                bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              <FiRefreshCw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg
                border border-hairline/[0.12] bg-surface-1 text-content-muted text-sm font-medium hover:bg-hairline/[0.05] transition-colors"
            >
              <FiHome className="w-4 h-4" aria-hidden="true" />
              Back to dashboard
            </a>
            <button
              type="button"
              onClick={() => {
                setToken(null);
                setCachedUser(null);
                setCachedCapabilities(null);
                window.location.href = '/login';
              }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg
                border border-hairline/[0.12] bg-surface-1 text-content-muted text-sm font-medium hover:bg-hairline/[0.05] transition-colors"
            >
              <FiLogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }
}
