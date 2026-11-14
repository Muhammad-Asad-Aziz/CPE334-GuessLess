import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiClientError, ApiErrorDetail } from '../../lib/apiClient';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Spinner } from '../../components/Spinner';
import { CheckCircle2, AlertTriangle, ArrowLeft } from 'lucide-react';

interface OptionData {
  id: string;
  position: number;
  text: string;
}

interface QuestionData {
  id: string;
  position: number;
  type: 'SINGLE_CHOICE' | 'RATING' | 'MULTIPLE_CHOICE' | 'FREE_TEXT';
  text: string;
  required: boolean;
  options: OptionData[];
}

interface SurveyFormData {
  id: string;
  title: string;
  description: string;
  mode: 'IDENTIFIED' | 'ANONYMOUS';
  alreadyResponded: boolean;
  questions: QuestionData[];
}

export const TakeSurveyPage: React.FC = () => {
  const { surveyId } = useParams<{ surveyId: string }>();

  const [survey, setSurvey] = useState<SurveyFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<{ message: string; code?: string; requestId?: string } | null>(null);

  // Form state
  const [answers, setAnswers] = useState<Record<string, { optionIds?: string[]; rating?: number }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; code?: string; details?: ApiErrorDetail[]; requestId?: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ submittedAt: string; responseId: string } | null>(null);

  useEffect(() => {
    if (!surveyId) return;

    let mounted = true;
    setLoading(true);
    apiFetch<SurveyFormData>(`/available-surveys/${surveyId}`)
      .then((res) => {
        if (mounted) {
          setSurvey(res.data);
          setFetchError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          if (err instanceof ApiClientError) {
            setFetchError({ message: err.message, code: err.code, requestId: err.requestId });
          } else {
            setFetchError({ message: 'Failed to load survey form.' });
          }
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [surveyId]);

  const handleOptionSelect = (questionId: string, optionId: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { optionIds: [optionId] },
    }));
  };

  const handleRatingSelect = (questionId: string, rating: number) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { rating },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!survey) return;

    // Build payload answers array
    const answerList = Object.entries(answers).map(([qId, val]) => ({
      questionId: qId,
      ...(val.optionIds ? { optionIds: val.optionIds } : {}),
      ...(val.rating !== undefined ? { rating: val.rating } : {}),
    }));

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await apiFetch<{ responseId: string; surveyId: string; submittedAt: string }>(
        `/surveys/${survey.id}/responses`,
        {
          method: 'POST',
          body: JSON.stringify({ answers: answerList }),
        }
      );

      setConfirmation({
        submittedAt: res.data.submittedAt,
        responseId: res.data.responseId,
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setSubmitError({
          message: err.message,
          code: err.code,
          details: err.details,
          requestId: err.requestId,
        });
      } else {
        setSubmitError({
          message: 'An unexpected error occurred while submitting your response.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner size="lg" label="Loading survey form..." />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        {fetchError.code === 'SURVEY_NOT_OPEN' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-amber-900">This survey is closed.</h2>
            <p className="mt-1 text-sm text-amber-700">
              This survey is no longer accepting new responses.
            </p>
            <div className="mt-4">
              <Link
                to="/available"
                className="inline-flex items-center gap-1 px-4 py-2 bg-[#006B3C] text-white rounded text-sm font-medium hover:bg-[#0B7A46]"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Available Surveys
              </Link>
            </div>
          </div>
        ) : (
          <ErrorBanner message={fetchError.message} requestId={fetchError.requestId} />
        )}
      </div>
    );
  }

  if (!survey) return null;

  // Case 1: Survey already responded on load
  if (survey.alreadyResponded) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-gray-900">You have already responded to this survey.</h2>
          <p className="mt-2 text-sm text-gray-600">
            Each respondent can submit at most one response per survey.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to={`/my-responses/${survey.id}`}
              className="px-4 py-2 bg-[#006B3C] text-white rounded text-sm font-medium hover:bg-[#0B7A46]"
            >
              View my submission
            </Link>
            <Link
              to="/available"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-50"
            >
              Back to Available Surveys
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Case 2: Confirmation banner after successful submission
  if (confirmation) {
    const formattedBangkokTime = new Date(confirmation.submittedAt).toLocaleString('en-US', {
      timeZone: 'Asia/Bangkok',
      dateStyle: 'medium',
      timeStyle: 'medium',
    });

    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 shadow-sm text-center">
          <CheckCircle2 className="w-12 h-12 text-[#006B3C] mx-auto mb-3" />
          <h2 className="text-xl font-bold text-emerald-900">
            Response submitted on {formattedBangkokTime}
          </h2>
          <p className="mt-2 text-sm text-emerald-800">
            Thank you for participating! Your answers have been securely recorded.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              to={`/my-responses/${survey.id}`}
              className="px-4 py-2 bg-[#006B3C] text-white rounded text-sm font-medium hover:bg-[#0B7A46]"
            >
              View my submission
            </Link>
            <Link
              to="/available"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded text-sm font-medium bg-white hover:bg-gray-50"
            >
              Back to Available Surveys
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        to="/available"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Available Surveys
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Identified
          </span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">{survey.title}</h1>
        {survey.description && (
          <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{survey.description}</p>
        )}
      </div>

      {submitError && (
        <div className="mb-6">
          {submitError.code === 'DUPLICATE_RESPONSE' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
              <p className="font-medium">You have already responded to this survey.</p>
              <Link
                to={`/my-responses/${survey.id}`}
                className="mt-2 inline-block text-xs font-semibold text-[#006B3C] hover:underline"
              >
                View my submission &rarr;
              </Link>
            </div>
          ) : submitError.code === 'SURVEY_NOT_OPEN' ? (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-amber-800">
              <p className="font-medium">This survey is closed.</p>
              <Link to="/available" className="mt-2 inline-block text-xs font-semibold text-[#006B3C] hover:underline">
                Back to Available Surveys &rarr;
              </Link>
            </div>
          ) : (
            <ErrorBanner
              message={submitError.message}
              details={submitError.details}
              requestId={submitError.requestId}
            />
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {survey.questions.map((question) => {
          const currentAnswer = answers[question.id];

          return (
            <div
              key={question.id}
              className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">
                  {question.position}. {question.text}
                </span>
                {question.required ? (
                  <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">
                    Required
                  </span>
                ) : (
                  <span className="text-xs font-medium text-gray-400">Optional</span>
                )}
              </div>

              {/* Single Choice Options */}
              {question.type === 'SINGLE_CHOICE' && (
                <div className="space-y-2 pt-1">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className="flex items-center gap-3 p-2.5 rounded-md border border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={currentAnswer?.optionIds?.[0] === option.id}
                        onChange={() => handleOptionSelect(question.id, option.id)}
                        className="h-4 w-4 text-[#006B3C] focus:ring-[#006B3C] border-gray-300"
                      />
                      <span className="text-sm text-gray-800">{option.text}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* Rating 1 to 5 Buttons */}
              {question.type === 'RATING' && (
                <div className="pt-2">
                  <div className="flex items-center gap-3">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <label
                        key={val}
                        className={`flex flex-col items-center justify-center w-12 h-12 rounded-lg border cursor-pointer font-semibold text-sm transition-all ${
                          currentAnswer?.rating === val
                            ? 'bg-[#006B3C] text-white border-[#006B3C] shadow-sm'
                            : 'border-gray-200 text-gray-700 hover:border-[#006B3C] hover:bg-emerald-50/50'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${question.id}`}
                          value={val}
                          checked={currentAnswer?.rating === val}
                          onChange={() => handleRatingSelect(question.id, val)}
                          className="sr-only"
                        />
                        <span>{val}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 mt-1.5 px-1 max-w-[280px]">
                    <span>1 — Poor</span>
                    <span>5 — Excellent</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Notice strictly ABOVE Submit button as required by AC-F03-01 / Section 3 */}
        <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs text-emerald-900 leading-relaxed font-medium">
          Identified survey: your answers are linked to your name and the survey owner can see them.
        </div>

        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-3 bg-[#006B3C] hover:bg-[#0B7A46] text-white font-medium rounded-md shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#006B3C]"
          >
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </form>
    </div>
  );
};
