import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Spinner } from '../../components/Spinner';
import { ArrowLeft, CheckCircle, Clock } from 'lucide-react';

interface SelectedOption {
  id: string;
  text: string;
}

interface FormattedAnswer {
  questionId: string;
  position: number;
  text: string;
  type: 'SINGLE_CHOICE' | 'RATING' | 'MULTIPLE_CHOICE' | 'FREE_TEXT';
  selectedOptions: SelectedOption[];
  rating: number | null;
}

interface SubmissionDetailData {
  responseId: string;
  surveyId: string;
  title: string;
  mode: 'IDENTIFIED' | 'ANONYMOUS';
  submittedAt: string | null;
  answers: FormattedAnswer[];
}

export const SubmissionDetailPage: React.FC = () => {
  const { surveyId } = useParams<{ surveyId: string }>();

  const [submission, setSubmission] = useState<SubmissionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; statusCode?: number; requestId?: string } | null>(null);

  useEffect(() => {
    if (!surveyId) return;

    let mounted = true;
    setLoading(true);
    apiFetch<SubmissionDetailData>(`/surveys/${surveyId}/my-response`)
      .then((res) => {
        if (mounted) {
          setSubmission(res.data);
          setError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          if (err instanceof ApiClientError) {
            setError({
              message: err.status === 404 ? 'Submission not found.' : err.message,
              statusCode: err.status,
              requestId: err.requestId,
            });
          } else {
            setError({ message: 'Failed to load submission details.' });
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

  if (loading) {
    return (
      <div className="py-12 flex justify-center">
        <Spinner size="lg" label="Loading submission details..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{error.message}</h2>
          {error.statusCode === 404 ? (
            <p className="text-sm text-gray-600 mb-4">
              We could not find a recorded response for this survey under your account.
            </p>
          ) : (
            <ErrorBanner message={error.message} requestId={error.requestId} className="mb-4 text-left" />
          )}
          <Link
            to="/my-responses"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#006B3C] text-white rounded text-sm font-medium hover:bg-[#0B7A46]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to My Submissions
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) return null;

  const formattedBangkokTime = submission.submittedAt
    ? new Date(submission.submittedAt).toLocaleString('en-US', {
        timeZone: 'Asia/Bangkok',
        dateStyle: 'medium',
        timeStyle: 'medium',
      })
    : 'Unknown';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link
        to="/my-responses"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to My Submissions
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm mb-6">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
            Identified Survey
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-mono">
            <Clock className="w-3.5 h-3.5 text-gray-400" />
            {formattedBangkokTime}
          </span>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{submission.title}</h1>
        <p className="mt-1 text-xs text-gray-500">
          Response ID: <span className="font-mono">{submission.responseId}</span>
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
          Recorded Answers
        </h2>

        {submission.answers.map((ans) => (
          <div
            key={ans.questionId}
            className="bg-white rounded-lg border border-gray-200 p-5 shadow-sm space-y-2"
          >
            <div className="text-sm font-medium text-gray-900">
              {ans.position}. {ans.text}
            </div>

            <div className="pt-2 pl-3 border-l-2 border-[#006B3C] bg-emerald-50/30 py-2 rounded-r">
              {ans.type === 'SINGLE_CHOICE' && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <CheckCircle className="w-4 h-4 text-[#006B3C]" />
                  <span className="font-medium">
                    {ans.selectedOptions.length > 0
                      ? ans.selectedOptions.map((o) => o.text).join(', ')
                      : 'Not answered'}
                  </span>
                </div>
              )}

              {ans.type === 'RATING' && (
                <div className="flex items-center gap-2 text-sm text-gray-800">
                  <span className="font-medium">
                    Rating: <span className="font-bold text-[#006B3C] text-base">{ans.rating ?? 'Not answered'}</span> / 5
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
