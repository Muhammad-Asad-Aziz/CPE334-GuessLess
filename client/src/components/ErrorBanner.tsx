import React from 'react';
import { AlertCircle } from 'lucide-react';
import { ApiErrorDetail } from '../lib/apiClient';

interface ErrorBannerProps {
  message: string;
  details?: ApiErrorDetail[];
  requestId?: string;
  className?: string;
  onDismiss?: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({
  message,
  details,
  requestId,
  className = '',
  onDismiss,
}) => {
  return (
    <div
      role="alert"
      className={`rounded-md bg-red-50 border border-red-200 p-4 my-3 text-red-800 ${className}`}
    >
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">{message}</h3>
          {details && details.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-red-700 space-y-1">
              {details.map((detail, index) => (
                <li key={index}>
                  {detail.field ? <span className="font-semibold">{detail.field}: </span> : null}
                  {detail.issue}
                </li>
              ))}
            </ul>
          )}
          {requestId && (
            <p className="mt-2 text-xs text-red-600 font-mono">
              Request ID: <span className="select-all font-semibold">{requestId}</span>
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-auto -mx-1.5 -my-1.5 rounded-lg p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label="Dismiss"
          >
            &times;
          </button>
        )}
      </div>
    </div>
  );
};

