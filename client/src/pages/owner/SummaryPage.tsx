import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import {
  displaySurveyTitle,
  STATUS_BADGE_STYLES,
  type SurveySummaryData,
} from './ownerUtils';

const RATING_KEYS: Array<'1' | '2' | '3' | '4' | '5'> = ['1', '2', '3', '4', '5'];

export const SummaryPage: React.FC = () => {
  const { surveyId } = useParams<{ surveyId: string }>();
  const [summary, setSummary] = useState<SurveySummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  useEffect(() => {
    if (!surveyId) return;
    let active = true;
    const loadSummary = async () => {
      setLoading(true);
      setError(null);
      setGenericError(null);
      try {
        const res = await apiFetch<SurveySummaryData>(`/surveys/${surveyId}/summary`);
        if (!active) return;
        setSummary(res.data);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError(err);
        } else {
          setGenericError('Unable to load survey summary.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSummary();
    return () => {
      active = false;
    };
  }, [surveyId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" label="Loading summary..." />
        <p className="mt-3 text-sm text-gray-600">Loading survey summary...</p>
      </div>
    );
  }

  if (error?.status === 409) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-4">
        <EmptyState
          title="A draft has no results yet."
          description="Publish this survey to begin collecting responses and view summary results."
        />
        <div className="text-center">
          <Link
            to={`/my-surveys/${surveyId ?? ''}`}
            className="text-sm font-medium text-[#006B3C] hover:underline"
          >
            &larr; Back to survey detail
          </Link>
        </div>
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-4">
        <EmptyState
          title="Survey not found."
          description="This survey does not exist or you do not have access to it."
        />
        <div className="text-center">
          <Link to="/my-surveys" className="text-sm font-medium text-[#006B3C] hover:underline">
            &larr; Back to My Surveys
          </Link>
        </div>
      </div>
    );
  }

  if (error?.status === 403) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <ErrorBanner
          message="You are not allowed to view this summary."
          requestId={error.requestId}
        />
      </div>
    );
  }

  if (error || genericError || !summary) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-4">
        {error ? (
          <ErrorBanner
            message={error.message}
            details={error.details}
            requestId={error.requestId}
          />
        ) : (
          <ErrorBanner message={genericError ?? 'Unable to load summary.'} />
        )}
        <Link to="/my-surveys" className="text-sm font-medium text-[#006B3C] hover:underline">
          &larr; Back to My Surveys
        </Link>
      </div>
    );
  }

  const badge = STATUS_BADGE_STYLES[summary.status];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          to={`/my-surveys/${summary.surveyId}`}
          className="text-sm font-medium text-[#006B3C] hover:underline"
        >
          &larr; Back to survey detail
        </Link>
      </div>

      <header className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-bold text-gray-900 break-words">
            {displaySurveyTitle(summary.title)}
          </h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="text-base font-semibold text-gray-800">
          Total responses: {summary.totalResponses}
        </p>
      </header>

      {summary.totalResponses === 0 ? (
        <EmptyState
          title="No responses yet."
          description="Summary charts and counts will appear once responses are submitted."
        />
      ) : (
        <ol className="space-y-5">
          {summary.questions.map((question) => (
            <li
              key={question.questionId}
              className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 shadow-sm space-y-4 min-w-0"
            >
              <div className="space-y-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 break-words">
                  {question.position}. {question.text}
                </h2>
                {question.type === 'SINGLE_CHOICE' ? (
                  <p className="text-xs text-gray-600">
                    {question.answered} {question.answered === 1 ? 'answer' : 'answers'}
                  </p>
                ) : (
                  <p className="text-sm font-medium text-[#006B3C]">
                    {question.mean !== null
                      ? `Average ${question.mean.toFixed(2)} from ${question.answered} ${
                          question.answered === 1 ? 'answer' : 'answers'
                        }`
                      : 'Average — from 0 answers'}
                  </p>
                )}
              </div>

              {question.type === 'SINGLE_CHOICE' ? (
                <ul role="list" className="space-y-3">
                  {question.options.map((opt) => {
                    const percentText =
                      opt.percent === null ? '—' : `${opt.percent.toFixed(1)}%`;
                    const widthPct = opt.percent ?? 0;
                    return (
                      <li key={opt.optionId} className="space-y-1.5 min-w-0">
                        <div className="text-sm text-gray-800 break-words">
                          {opt.text} — {opt.count} ({percentText})
                        </div>
                        <div
                          aria-hidden="true"
                          className="w-full h-3 rounded-full bg-gray-100 overflow-hidden"
                        >
                          <div
                            className="h-full rounded-full bg-[#006B3C]"
                            style={{ width: `${Math.min(100, Math.max(0, widthPct))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul role="list" className="space-y-2.5">
                  {RATING_KEYS.map((ratingKey) => {
                    const count = question.distribution[ratingKey] ?? 0;
                    const widthPct =
                      question.answered > 0 ? Math.round((count / question.answered) * 100) : 0;
                    return (
                      <li key={ratingKey} className="space-y-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 text-sm text-gray-800">
                          <span className="font-medium">Rating {ratingKey}</span>
                          <span className="tabular-nums font-medium">{count}</span>
                        </div>
                        <div
                          aria-hidden="true"
                          className="w-full h-3 rounded-full bg-gray-100 overflow-hidden"
                        >
                          <div
                            className="h-full rounded-full bg-[#006B3C]"
                            style={{ width: `${Math.min(100, Math.max(0, widthPct))}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default SummaryPage;
