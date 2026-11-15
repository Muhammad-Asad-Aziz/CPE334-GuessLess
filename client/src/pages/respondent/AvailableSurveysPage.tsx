import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Spinner } from '../../components/Spinner';
import { CheckCircle2, ClipboardList, ArrowRight } from 'lucide-react';

export interface AvailableSurvey {
  id: string;
  title: string;
  description: string;
  mode: 'IDENTIFIED' | 'ANONYMOUS';
  questionCount: number;
  closeAt: string | null;
  alreadyResponded: boolean;
}

export const AvailableSurveysPage: React.FC = () => {
  const [surveys, setSurveys] = useState<AvailableSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiFetch<AvailableSurvey[]>('/available-surveys')
      .then((res) => {
        if (mounted) {
          setSurveys(res.data || []);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          if (err instanceof ApiClientError) {
            setError({ message: err.message, requestId: err.requestId });
          } else {
            setError({ message: 'Failed to load available surveys.' });
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
        <Spinner size="lg" label="Loading available surveys..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Available Surveys</h1>
        <p className="mt-1 text-sm text-gray-600">
          Browse and complete surveys currently open for your participation.
        </p>
      </div>

      {error && <ErrorBanner message={error.message} requestId={error.requestId} />}

      {surveys.length === 0 ? (
        <EmptyState
          title="No surveys are open for you right now."
          description="Check back later for newly published surveys."
          icon={<ClipboardList className="w-12 h-12 text-gray-400" />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm hover:shadow transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                    Identified
                  </span>
                  {survey.alreadyResponded && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                      Responded
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-semibold text-gray-900 line-clamp-1">{survey.title}</h2>
                <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                  {survey.description || 'No description provided.'}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-xs text-gray-500 font-medium">
                  {survey.questionCount} {survey.questionCount === 1 ? 'question' : 'questions'}
                </span>

                {survey.alreadyResponded ? (
                  <Link
                    to={`/my-responses/${survey.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#006B3C] hover:text-[#0B7A46] hover:underline"
                  >
                    View my submission
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <Link
                    to={`/available/${survey.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#006B3C] hover:bg-[#0B7A46] text-white rounded text-xs font-medium transition-colors"
                  >
                    Answer Survey
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
