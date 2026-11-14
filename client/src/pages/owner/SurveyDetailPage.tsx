import React, { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { BarChart3, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { Spinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { ErrorBanner } from '../../components/ErrorBanner';
import {
  displaySurveyTitle,
  formatBangkokDateTime,
  IDENTIFIED_MODE_NOTICE,
  STATUS_BADGE_STYLES,
  type SurveyDetail,
} from './ownerUtils';
import './ownerDialog.css';

interface DetailLocationState {
  flashMessage?: string;
}

export const SurveyDetailPage: React.FC = () => {
  const { surveyId } = useParams<{ surveyId: string }>();
  const location = useLocation();
  const initialFlash = (location.state as DetailLocationState | null)?.flashMessage ?? null;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleId = useId();

  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiClientError | null>(null);
  const [genericLoadError, setGenericLoadError] = useState<string | null>(null);

  const [flashMessage, setFlashMessage] = useState<string | null>(initialFlash);
  const [publishFailures, setPublishFailures] = useState<
    Array<{ field?: string; issue: string }> | null
  >(null);
  const [actionError, setActionError] = useState<ApiClientError | null>(null);
  const [genericActionError, setGenericActionError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!surveyId) return;
    let active = true;
    const loadSurvey = async () => {
      setLoading(true);
      setLoadError(null);
      setGenericLoadError(null);
      try {
        const res = await apiFetch<SurveyDetail>(`/surveys/${surveyId}`);
        if (!active) return;
        setSurvey(res.data);
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiClientError) {
          setLoadError(err);
        } else {
          setGenericLoadError('Unable to load survey details.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    loadSurvey();
    return () => {
      active = false;
    };
  }, [surveyId]);

  const handlePublish = async () => {
    if (!survey || isPublishing) return;
    setIsPublishing(true);
    setPublishFailures(null);
    setActionError(null);
    setGenericActionError(null);
    setFlashMessage(null);

    try {
      const res = await apiFetch<SurveyDetail>(`/surveys/${survey.id}/publish`, {
        method: 'POST',
      });
      setSurvey(res.data);
      setFlashMessage('Survey published.');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 400 && err.details && err.details.length > 0) {
          setPublishFailures(err.details);
        }
        setActionError(err);
      } else {
        setGenericActionError('Could not publish survey. Please try again.');
      }
    } finally {
      setIsPublishing(false);
    }
  };

  const openCloseModal = () => {
    setActionError(null);
    setGenericActionError(null);
    dialogRef.current?.showModal();
  };

  const cancelCloseModal = () => {
    dialogRef.current?.close('cancel');
  };

  const handleConfirmClose = async () => {
    if (!survey || isClosing) return;
    setIsClosing(true);
    setActionError(null);
    setGenericActionError(null);
    setFlashMessage(null);

    try {
      const res = await apiFetch<SurveyDetail>(`/surveys/${survey.id}/close`, {
        method: 'POST',
      });
      setSurvey(res.data);
      dialogRef.current?.close('confirmed');
      setFlashMessage('Survey closed.');
    } catch (err) {
      dialogRef.current?.close('error');
      if (err instanceof ApiClientError) {
        setActionError(err);
      } else {
        setGenericActionError('Could not close survey. Please try again.');
      }
    } finally {
      setIsClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" label="Loading survey..." />
        <p className="mt-3 text-sm text-gray-600">Loading survey details...</p>
      </div>
    );
  }

  if (loadError?.status === 404) {
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

  if (loadError?.status === 403) {
    return (
      <div className="max-w-xl mx-auto py-12">
        <ErrorBanner
          message="You are not allowed to view this survey."
          requestId={loadError.requestId}
        />
      </div>
    );
  }

  if (loadError || genericLoadError || !survey) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-4">
        {loadError ? (
          <ErrorBanner
            message={loadError.message}
            details={loadError.details}
            requestId={loadError.requestId}
          />
        ) : (
          <ErrorBanner message={genericLoadError ?? 'Survey not found.'} />
        )}
        <Link to="/my-surveys" className="text-sm font-medium text-[#006B3C] hover:underline">
          &larr; Back to My Surveys
        </Link>
      </div>
    );
  }

  const badge = STATUS_BADGE_STYLES[survey.status];
  const titleText = displaySurveyTitle(survey.title);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link to="/my-surveys" className="text-sm font-medium text-[#006B3C] hover:underline">
          &larr; Back to My Surveys
        </Link>
      </div>

      {flashMessage && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-md bg-[#EAF6EF] border border-[#B7DFC7] px-4 py-3 text-sm font-medium text-[#006B3C]"
        >
          <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>{flashMessage}</span>
        </div>
      )}

      {publishFailures && publishFailures.length > 0 && (
        <div
          role="alert"
          className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800 space-y-2"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" aria-hidden="true" />
            <div className="space-y-2 min-w-0">
              <h2 className="text-sm font-semibold text-red-900">
                This survey cannot be published yet:
              </h2>
              <ul className="list-disc list-inside text-sm text-red-800 space-y-1">
                {publishFailures.map((failure, index) => (
                  <li key={index}>
                    {failure.field ? (
                      <span className="font-semibold">{failure.field}: </span>
                    ) : null}
                    {failure.issue}
                  </li>
                ))}
              </ul>
              {actionError?.requestId && (
                <p className="text-xs text-red-600 font-mono">
                  Request ID: <span className="select-all font-semibold">{actionError.requestId}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {actionError && !publishFailures && (
        <ErrorBanner
          message={actionError.message}
          details={actionError.details}
          requestId={actionError.requestId}
        />
      )}
      {genericActionError && <ErrorBanner message={genericActionError} />}

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-bold text-gray-900 break-words">{titleText}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            </div>
            {survey.description ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                {survey.description}
              </p>
            ) : (
              <p className="text-sm text-gray-500 italic">No description provided.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {survey.status === 'DRAFT' && (
              <button
                type="button"
                onClick={handlePublish}
                disabled={isPublishing}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-md bg-[#006B3C] hover:bg-[#0B7A46] text-white text-sm font-medium shadow-sm disabled:opacity-60 transition-colors"
              >
                {isPublishing ? (
                  <>
                    <Spinner size="sm" label="Publishing survey..." />
                    Publishing...
                  </>
                ) : (
                  'Publish'
                )}
              </button>
            )}

            {survey.status === 'PUBLISHED' && (
              <>
                <Link
                  to={`/my-surveys/${survey.id}/summary`}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-md border border-[#006B3C] text-[#006B3C] hover:bg-[#EAF6EF] text-sm font-medium transition-colors"
                >
                  <BarChart3 className="w-4 h-4" aria-hidden="true" />
                  View summary
                </Link>
                <button
                  type="button"
                  onClick={openCloseModal}
                  disabled={isClosing}
                  className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium shadow-sm disabled:opacity-60 transition-colors"
                >
                  Close survey
                </button>
              </>
            )}

            {survey.status === 'CLOSED' && (
              <Link
                to={`/my-surveys/${survey.id}/summary`}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-md bg-[#006B3C] hover:bg-[#0B7A46] text-white text-sm font-medium shadow-sm transition-colors"
              >
                <BarChart3 className="w-4 h-4" aria-hidden="true" />
                View summary
              </Link>
            )}
          </div>
        </div>

        {survey.status === 'DRAFT' && (
          <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">
            Editing drafts arrives in Sprint 2.
          </p>
        )}

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t border-gray-200 text-sm">
          <div>
            <dt className="text-xs font-medium text-gray-500">Response mode</dt>
            <dd className="mt-1 text-gray-900">
              {survey.mode === 'IDENTIFIED' ? IDENTIFIED_MODE_NOTICE : 'Anonymous'}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Responses</dt>
            <dd className="mt-1 font-semibold text-gray-900 tabular-nums">
              {survey.responseCount}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">Created (Asia/Bangkok)</dt>
            <dd className="mt-1 text-gray-900 tabular-nums">
              {formatBangkokDateTime(survey.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-gray-500">
              {survey.closedAt ? 'Closed (Asia/Bangkok)' : 'Published (Asia/Bangkok)'}
            </dt>
            <dd className="mt-1 text-gray-900 tabular-nums">
              {survey.closedAt
                ? formatBangkokDateTime(survey.closedAt)
                : formatBangkokDateTime(survey.publishedAt)}
            </dd>
          </div>
        </dl>
      </div>

      <section aria-labelledby="detail-questions-heading" className="space-y-4">
        <h2 id="detail-questions-heading" className="text-lg font-semibold text-gray-900">
          Questions ({survey.questions.length})
        </h2>

        {survey.questions.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
            This draft has no questions yet.
          </div>
        ) : (
          <ol className="space-y-3">
            {survey.questions.map((question) => (
              <li
                key={question.id}
                className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="text-base font-medium text-gray-900 break-words">
                    {question.position}. {question.text}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0 text-xs">
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                      {question.type === 'SINGLE_CHOICE' ? 'Single choice' : 'Rating 1–5'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                      {question.required ? 'Required' : 'Optional'}
                    </span>
                  </div>
                </div>

                {question.type === 'SINGLE_CHOICE' ? (
                  question.options.length === 0 ? (
                    <p className="text-xs text-amber-800">No options defined yet.</p>
                  ) : (
                    <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700 pl-1">
                      {question.options.map((opt) => (
                        <li key={opt.id} className="break-words">
                          {opt.text}
                        </li>
                      ))}
                    </ol>
                  )
                ) : (
                  <p className="text-xs text-gray-500">Scale: 1 to 5</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        onCancel={(e) => {
          if (isClosing) {
            e.preventDefault();
          }
        }}
        className="owner-modal-dialog rounded-lg border border-gray-200 bg-white p-0 shadow-xl max-w-md w-[calc(100%-2rem)]"
      >
        <div className="p-6 space-y-4">
          <h2 id={dialogTitleId} className="text-lg font-bold text-gray-900">
            Close survey?
          </h2>
          <p className="text-sm text-gray-700">
            Closing is final. No new responses will be accepted.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <button
              type="button"
              autoFocus
              onClick={cancelCloseModal}
              disabled={isClosing}
              className="px-4 py-2 min-h-[44px] rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmClose}
              disabled={isClosing}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-60"
            >
              {isClosing ? (
                <>
                  <Spinner size="sm" label="Closing survey..." />
                  Closing...
                </>
              ) : (
                'Close survey'
              )}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
};

export default SurveyDetailPage;
