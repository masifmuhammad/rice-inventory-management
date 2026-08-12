import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import api, {
  AUTH_EXPIRED_EVENT,
  PASSWORD_CHANGE_EVENT,
  getCachedCapabilities,
  getCachedUser,
  getToken,
  setCachedCapabilities,
  setCachedUser,
  setToken,
  TOKEN_KEY,
} from '../services/api';

const AuthContext = createContext(null);

const BUSINESS_ID_KEY = 'rim.businessId';
const BUSINESSES_KEY = 'rim.businesses';

const ROLE_RANK = { worker: 1, accountant: 2, admin: 3 };
const CAPABILITY_MIN_ROLE = {
  'products.view': 'worker',
  'products.manage': 'accountant',
  'products.delete': 'admin',
  'transactions.view': 'worker',
  'transactions.create': 'worker',
  'transactions.reverse': 'admin',
  'cash.view': 'accountant',
  'cash.manage': 'accountant',
  'cash.delete': 'admin',
  'reports.view': 'accountant',
  'settings.view': 'worker',
  'settings.manage': 'admin',
  'users.manage': 'admin',
  'audit.view': 'admin',
};

const capabilitiesFromRole = (role) => {
  const rank = ROLE_RANK[role] || 0;
  return Object.fromEntries(
    Object.entries(CAPABILITY_MIN_ROLE).map(([capability, minimum]) => [
      capability,
      rank >= (ROLE_RANK[minimum] || 0),
    ])
  );
};

const normalizeCapabilities = (role, capabilities) =>
  capabilities && Object.keys(capabilities).length > 0
    ? capabilities
    : capabilitiesFromRole(role);

const readBusinesses = () => {
  try {
    const raw = localStorage.getItem(BUSINESSES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeBusinesses = (businesses) => {
  try {
    localStorage.setItem(BUSINESSES_KEY, JSON.stringify(businesses || []));
  } catch {
    /* non-fatal */
  }
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getToken() ? getCachedUser() : null));
  const [businessId, setBusinessId] = useState(() => localStorage.getItem(BUSINESS_ID_KEY) || null);
  const [businesses, setBusinesses] = useState(readBusinesses);
  const [capabilities, setCapabilities] = useState(() => {
    if (!getToken()) return {};
    const cached = getCachedCapabilities();
    const cachedUser = getCachedUser();
    return normalizeCapabilities(cachedUser?.role, cached);
  });
  const [initialising, setInitialising] = useState(() => Boolean(getToken()) && !getCachedUser());

  const applySession = useCallback((token, nextUser, nextCapabilities, nextBusinessId, nextBusinesses) => {
    const resolved = normalizeCapabilities(nextUser?.role, nextCapabilities);
    setToken(token);
    setCachedUser(nextUser);
    setCachedCapabilities(resolved);
    setUser(nextUser);
    setCapabilities(resolved);
    setBusinessId(nextBusinessId || nextUser?.businessId || null);
    setBusinesses(nextBusinesses || []);
    if (nextBusinessId || nextUser?.businessId) {
      localStorage.setItem(BUSINESS_ID_KEY, nextBusinessId || nextUser.businessId);
    }
    writeBusinesses(nextBusinesses || []);
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setCachedUser(null);
    setCachedCapabilities(null);
    setUser(null);
    setCapabilities({});
    setBusinessId(null);
    setBusinesses([]);
    localStorage.removeItem(BUSINESS_ID_KEY);
    localStorage.removeItem(BUSINESSES_KEY);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setInitialising(false);
      return;
    }

    const controller = new AbortController();

    api
      .get('/auth/me', { signal: controller.signal })
      .then(({ data }) => {
        const resolved = normalizeCapabilities(data.user?.role, data.capabilities);
        setUser(data.user);
        setCachedUser(data.user);
        setCapabilities(resolved);
        setCachedCapabilities(resolved);
        setBusinessId(data.businessId || data.user?.businessId);
        setBusinesses(data.businesses || []);
        if (data.businessId) localStorage.setItem(BUSINESS_ID_KEY, data.businessId);
        writeBusinesses(data.businesses || []);
      })
      .catch((error) => {
        if (error.response?.status === 401) clearSession();
      })
      .finally(() => setInitialising(false));

    return () => controller.abort();
  }, [clearSession]);

  useEffect(() => {
    const onExpired = (event) => {
      clearSession();
      toast.error(event.detail?.message || 'Your session expired. Please sign in again.', {
        id: 'session-expired',
      });
    };

    const onPasswordChangeRequired = () => {
      setUser((current) => {
        if (!current) return current;
        const next = { ...current, mustChangePassword: true };
        setCachedUser(next);
        return next;
      });
      if (!window.location.pathname.startsWith('/change-password')) {
        window.location.assign('/change-password');
      }
    };

    const onStorage = (event) => {
      if (event.key === TOKEN_KEY && !event.newValue) {
        setUser(null);
        setCapabilities({});
        setBusinessId(null);
        setBusinesses([]);
      }
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    window.addEventListener(PASSWORD_CHANGE_EVENT, onPasswordChangeRequired);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
      window.removeEventListener(PASSWORD_CHANGE_EVENT, onPasswordChangeRequired);
      window.removeEventListener('storage', onStorage);
    };
  }, [clearSession]);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post('/auth/login', { email, password });
      applySession(data.token, data.user, data.capabilities, data.businessId, data.businesses);
      return data;
    },
    [applySession]
  );

  const register = useCallback(async (name, email, password, selectedBusinessId) => {
    const { data } = await api.post('/auth/register', {
      name,
      email,
      password,
      businessId: selectedBusinessId,
    });
    return data;
  }, []);

  const switchBusiness = useCallback(
    async (nextBusinessId) => {
      const { data } = await api.post('/auth/switch-business', { businessId: nextBusinessId });
      applySession(data.token, data.user, data.capabilities, data.businessId, data.businesses);
      window.dispatchEvent(new CustomEvent('rim:business-changed', { detail: { businessId: data.businessId } }));
      return data;
    },
    [applySession]
  );

  const logout = useCallback(() => {
    clearSession();
    toast.success('Signed out');
    window.location.assign('/login');
  }, [clearSession]);

  const updateUser = useCallback((nextUser) => {
    setUser(nextUser);
    setCachedUser(nextUser);
  }, []);

  const refreshSession = useCallback(
    (data) => {
      if (data.token) {
        applySession(data.token, data.user, data.capabilities, data.businessId, data.businesses);
      } else if (data.user) updateUser(data.user);
    },
    [applySession, updateUser]
  );

  const can = useCallback((capability) => Boolean(capabilities?.[capability]), [capabilities]);

  const activeBusiness = useMemo(
    () => businesses.find((b) => b.id === businessId) || businesses[0] || null,
    [businesses, businessId]
  );

  const value = useMemo(
    () => ({
      user,
      businessId,
      businesses,
      activeBusiness,
      capabilities,
      initialising,
      login,
      register,
      switchBusiness,
      logout,
      updateUser,
      refreshSession,
      can,
    }),
    [
      user,
      businessId,
      businesses,
      activeBusiness,
      capabilities,
      initialising,
      login,
      register,
      switchBusiness,
      logout,
      updateUser,
      refreshSession,
      can,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
