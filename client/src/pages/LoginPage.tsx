import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiFetch, authStorage, ApiClientError } from '../lib/apiClient';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';

interface LoginPageProps {
  onLoginSuccess?: (user: { id: string; displayName: string; role: string }) => void;
  currentUser?: { id: string; displayName: string; role: string } | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, currentUser }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  // Check for session ended query parameter
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.get('sessionEnded') === 'true') {
      setSessionNotice('Your session has ended. Please log in again.');
    }
  }, [location.search]);

  // If already logged in, redirect to role home
  useEffect(() => {
    if (currentUser) {
      redirectByRole(currentUser.role);
    }
  }, [currentUser]);

  const redirectByRole = (role: string) => {
    if (role === 'SURVEY_OWNER') {
      navigate('/my-surveys', { replace: true });
    } else if (role === 'RESPONDENT') {
      navigate('/available', { replace: true });
    } else if (role === 'ADMIN') {
      navigate('/', { replace: true });
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});
    setRequestId(undefined);
    setSessionNotice(null);
    setLoading(true);

    try {
      const response = await apiFetch<{
        token: string;
        tokenType: string;
        expiresAt: string;
        user: { id: string; displayName: string; role: string };
      }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      authStorage.setToken(response.data.token);

      if (onLoginSuccess) {
        onLoginSuccess(response.data.user);
      }

      redirectByRole(response.data.user.role);
    } catch (err: any) {
      if (err instanceof ApiClientError) {
        setRequestId(err.requestId);
        if (err.status === 401) {
          // Keep email, clear password
          setPassword('');
          setErrorMessage('Email or password is incorrect.');
        } else if (err.status === 400) {
          setErrorMessage(err.message || 'The request is not valid.');
          if (err.details && Array.isArray(err.details)) {
            const errors: Record<string, string> = {};
            for (const d of err.details) {
              if (d.field) {
                errors[d.field] = d.issue;
              }
            }
            setFieldErrors(errors);
          }
        } else {
          setErrorMessage(err.message || 'An unexpected error occurred.');
        }
      } else {
        setErrorMessage('Unable to connect to server. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto my-12 px-4 sm:px-6">
      <div className="bg-white py-8 px-6 shadow-sm rounded-lg border border-gray-200 sm:px-10">
        <div className="sm:mx-auto sm:w-full sm:max-w-md mb-6 text-center">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#006B3C] text-white font-black text-2xl shadow-sm mb-2">
            G
          </span>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Sign in to GuessLess</h1>
          <p className="mt-1 text-sm text-gray-500">
            Enter your department credentials to access your account.
          </p>
        </div>

        {sessionNotice && (
          <div
            className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-sm"
            role="alert"
          >
            {sessionNotice}
          </div>
        )}

        {errorMessage && (
          <div className="mb-4">
            <ErrorBanner
              message={errorMessage}
              requestId={requestId}
              onDismiss={() => setErrorMessage(null)}
            />
          </div>
        )}

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006B3C] sm:text-sm ${
                  fieldErrors.email
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-[#006B3C]'
                }`}
                placeholder="you@example.edu"
              />
            </div>
            {fieldErrors.email && (
              <p className="mt-1 text-xs text-red-600" id="email-error">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className={`appearance-none block w-full px-3 py-2 border rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#006B3C] sm:text-sm ${
                  fieldErrors.password
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-[#006B3C]'
                }`}
              />
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-xs text-red-600" id="password-error">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-[#006B3C] hover:bg-[#0B7A46] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006B3C] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <span>Signing in...</span>
                </span>
              ) : (
                'Log in'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
