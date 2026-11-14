import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BarChart3, Eye } from 'lucide-react';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import {
  displaySurveyTitle,
  formatBangkokDateTime,
  STATUS_BADGE_STYLES,
  type SurveyListItem,
} from './ownerUtils';

interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export const MySurveysPage: React.FC = () => {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<SurveyListItem[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, pageSize: 20, total: 0 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiClientError | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadSurveys = async () => {
      setLoading(true);
      setError(null);
      setGenericError(null);
      try {
        const res = await apiFetch<SurveyListItem[]>(`/surveys?page=${page}&pageSize=20`);
        if (!active) return;
        setSurveys(Array.isArray(res.data) ? res.data : []);
        if (res.meta) {
          setMeta(res.meta);
        }
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setError(err);
        } else {
          setGenericError('Unable to load your surveys. Please try again.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSurveys();
    return () => {
      active = false;
    };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(meta.total / (meta.pageSize || 20)));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" label="Loading surveys..." />
        <p className="mt-3 text-sm text-gray-600">Loading your surveys...</p>
      </div>
    );
  }

  if (error?.status === 403) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <ErrorBanner
          message="You are not allowed to view owner surveys."
          requestId={error.requestId}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">My Surveys</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage drafts, publish surveys, and review responses. Dates shown in Asia/Bangkok (UTC+7).
          </p>
        </div>
        <Link
          to="/my-surveys/new"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] bg-[#006B3C] hover:bg-[#0B7A46] text-white text-sm font-medium rounded-md shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#006B3C] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Create survey
        </Link>
      </div>

      {error && (
        <ErrorBanner
          message={error.message}
          details={error.details}
          requestId={error.requestId}
        />
      )}
      {genericError && <ErrorBanner message={genericError} />}

      {!error && !genericError && surveys.length === 0 ? (
        <EmptyState
          title="No surveys yet. Create your first survey."
          description="Create a survey draft, add questions, and publish when ready."
          actionText="Create survey"
          onAction={() => navigate('/my-surveys/new')}
        />
      ) : null}

      {surveys.length > 0 && (
        <>
          {/* Wide screen table (768px and above) */}
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="my-surveys-table-caption"
            className="hidden md:block bg-white rounded-lg border border-gray-200 shadow-sm overflow-x-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#006B3C]"
          >
            <table className="w-full border-collapse text-left text-sm">
              <caption id="my-surveys-table-caption" className="sr-only">
                My surveys list with status, response count, and timestamps in Asia/Bangkok time
              </caption>
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase tracking-wide text-gray-600">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    Title
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3 text-right whitespace-nowrap">
                    Responses
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Created
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Published
                  </th>
                  <th scope="col" className="px-3 py-3 whitespace-nowrap">
                    Closed
                  </th>
                  <th scope="col" className="px-4 py-3 text-right whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {surveys.map((survey) => {
                  const badge = STATUS_BADGE_STYLES[survey.status];
                  const titleText = displaySurveyTitle(survey.title);
                  return (
                    <tr key={survey.id} className="hover:bg-gray-50">
                      <th scope="row" className="px-4 py-3 font-medium text-gray-900 break-words max-w-[220px]">
                        <Link
                          to={`/my-surveys/${survey.id}`}
                          className="text-[#006B3C] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#006B3C] rounded"
                        >
                          {titleText}
                        </Link>
                      </th>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-800 whitespace-nowrap">
                        {survey.responseCount}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                        {formatBangkokDateTime(survey.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                        {formatBangkokDateTime(survey.publishedAt)}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap tabular-nums">
                        {formatBangkokDateTime(survey.closedAt ?? survey.closeAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-3">
                          <Link
                            to={`/my-surveys/${survey.id}`}
                            className="text-sm font-medium text-[#006B3C] hover:text-[#0B7A46] hover:underline"
                          >
                            View
                          </Link>
                          {(survey.status === 'PUBLISHED' || survey.status === 'CLOSED') && (
                            <Link
                              to={`/my-surveys/${survey.id}/summary`}
                              className="text-sm font-medium text-gray-700 hover:text-[#006B3C] hover:underline"
                            >
                              Summary
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile stacked cards (below 768px) */}
          <ul role="list" className="space-y-3 md:hidden">
            {surveys.map((survey) => {
              const badge = STATUS_BADGE_STYLES[survey.status];
              const titleText = displaySurveyTitle(survey.title);
              return (
                <li
                  key={survey.id}
                  className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-gray-900 break-words min-w-0">
                      <Link
                        to={`/my-surveys/${survey.id}`}
                        className="text-[#006B3C] hover:underline"
                      >
                        {titleText}
                      </Link>
                    </h2>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0 ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600">
                    <div>
                      <dt className="font-medium text-gray-500">Responses</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-gray-900 tabular-nums">
                        {survey.responseCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Created</dt>
                      <dd className="mt-0.5 tabular-nums">
                        {formatBangkokDateTime(survey.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Published</dt>
                      <dd className="mt-0.5 tabular-nums">
                        {formatBangkokDateTime(survey.publishedAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-gray-500">Closed</dt>
                      <dd className="mt-0.5 tabular-nums">
                        {formatBangkokDateTime(survey.closedAt ?? survey.closeAt)}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                    <Link
                      to={`/my-surveys/${survey.id}`}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-sm font-medium text-[#006B3C] bg-[#EAF6EF] hover:bg-[#D9EFE2] rounded-md transition-colors"
                    >
                      <Eye className="w-4 h-4" aria-hidden="true" />
                      View
                    </Link>
                    {(survey.status === 'PUBLISHED' || survey.status === 'CLOSED') && (
                      <Link
                        to={`/my-surveys/${survey.id}/summary`}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      >
                        <BarChart3 className="w-4 h-4" aria-hidden="true" />
                        Summary
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav
              aria-label="Surveys pagination"
              className="flex items-center justify-between pt-2 text-sm text-gray-700"
            >
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-2 min-h-[40px] rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-2 min-h-[40px] rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
};

export default MySurveysPage;
