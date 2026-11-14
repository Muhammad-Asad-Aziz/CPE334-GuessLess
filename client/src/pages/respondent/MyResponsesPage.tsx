import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Spinner } from '../../components/Spinner';
import { CheckCircle, ArrowRight } from 'lucide-react';

export interface MyResponseItem {
  surveyId: string;
  title: string;
  mode: 'IDENTIFIED' | 'ANONYMOUS';
  status: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
  participatedDay: string;
  responseId?: string;
  submittedAt?: string;
}

export const MyResponsesPage: React.FC = () => {
  const [items, setItems] = useState<MyResponseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<MyResponseItem[]>('/my-responses')
      .then((res) => {
        if (mounted) {
          setItems(res.data || []);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          if (err instanceof ApiClientError) {
            setError({ message: err.message, requestId: err.requestId });
          } else {
            setError({ message: 'Failed to load your responses.' });
          }
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner size="lg" label="Loading your responses..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Submissions</h1>
        <p className="mt-1 text-sm text-gray-600">
          History of surveys you have completed and their recorded participation dates.
        </p>
      </div>

      {error && <ErrorBanner message={error.message} requestId={error.requestId} />}

      {items.length === 0 ? (
        <EmptyState
          title="You have not answered any surveys yet."
          description="Browse available surveys to provide feedback."
          icon={<CheckCircle className="w-12 h-12 text-gray-400" />}
          actionText="Browse Available Surveys"
          onAction={() => (window.location.href = '/available')}
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link
              key={item.surveyId}
              to={`/my-responses/${item.surveyId}`}
              className="block bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:border-[#006B3C] hover:shadow transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        item.status === 'PUBLISHED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {item.status === 'PUBLISHED' ? 'Published' : 'Closed'}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      Participated: {item.participatedDay}
                    </span>
                  </div>

                  <h2 className="text-lg font-semibold text-gray-900">{item.title}</h2>
                </div>

                <div className="flex items-center text-sm font-medium text-[#006B3C]">
                  <span>View submission</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};
