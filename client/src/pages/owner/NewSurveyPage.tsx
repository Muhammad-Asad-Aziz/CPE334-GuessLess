import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { apiFetch, ApiClientError } from '../../lib/apiClient';
import { ErrorBanner } from '../../components/ErrorBanner';
import { Spinner } from '../../components/Spinner';
import {
  IDENTIFIED_MODE_NOTICE,
  mapDetailsToFieldErrors,
  type QuestionType,
  type SurveyDetail,
} from './ownerUtils';

interface DraftOption {
  localId: string;
  text: string;
}

interface DraftQuestion {
  localId: string;
  type: QuestionType;
  text: string;
  required: boolean;
  options: DraftOption[];
}

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_QUESTIONS = 30;
const MAX_QUESTION_TEXT_LENGTH = 300;
const MAX_OPTIONS_PER_QUESTION = 10;
const MAX_OPTION_TEXT_LENGTH = 100;

let nextLocalId = 1;
function createLocalId(prefix: string): string {
  nextLocalId += 1;
  return `${prefix}-${nextLocalId}`;
}

export const NewSurveyPage: React.FC = () => {
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<DraftQuestion[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<ApiClientError | null>(null);
  const [genericError, setGenericError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const clearFieldError = (key: string) => {
    setFieldErrors((prev) => {
      if (!(key in prev)) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const addQuestion = () => {
    if (questions.length >= MAX_QUESTIONS) return;
    setQuestions((prev) => [
      ...prev,
      {
        localId: createLocalId('q'),
        type: 'SINGLE_CHOICE',
        text: '',
        required: true,
        options: [],
      },
    ]);
    clearFieldError('questions');
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== index));
    setFieldErrors({});
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    setQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
    setFieldErrors({});
  };

  const updateQuestion = (index: number, patch: Partial<DraftQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== index) return q;
        const updated = { ...q, ...patch };
        if (patch.type === 'RATING') {
          updated.options = [];
        }
        return updated;
      })
    );
  };

  const addOption = (qIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex || q.options.length >= MAX_OPTIONS_PER_QUESTION) return q;
        return {
          ...q,
          options: [...q.options, { localId: createLocalId('opt'), text: '' }],
        };
      })
    );
    clearFieldError(`questions.${qIndex}.options`);
  };

  const updateOptionText = (qIndex: number, oIndex: number, text: string) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        return {
          ...q,
          options: q.options.map((opt, j) => (j === oIndex ? { ...opt, text } : opt)),
        };
      })
    );
    clearFieldError(`questions.${qIndex}.options.${oIndex}.text`);
  };

  const removeOption = (qIndex: number, oIndex: number) => {
    setQuestions((prev) =>
      prev.map((q, idx) => {
        if (idx !== qIndex) return q;
        return {
          ...q,
          options: q.options.filter((_, j) => j !== oIndex),
        };
      })
    );
    setFieldErrors({});
  };

  const validateClientDraft = (): Record<string, string> => {
    const errors: Record<string, string> = {};

    if (title.trim().length > MAX_TITLE_LENGTH) {
      errors.title = `Title must be at most ${MAX_TITLE_LENGTH} characters.`;
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      errors.description = `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.`;
    }
    if (questions.length > MAX_QUESTIONS) {
      errors.questions = `A survey can have at most ${MAX_QUESTIONS} questions.`;
    }

    questions.forEach((q, i) => {
      const trimmedText = q.text.trim();
      if (trimmedText.length === 0) {
        errors[`questions.${i}.text`] = 'Question text is required (1–300 characters).';
      } else if (trimmedText.length > MAX_QUESTION_TEXT_LENGTH) {
        errors[`questions.${i}.text`] = `Question text must be at most ${MAX_QUESTION_TEXT_LENGTH} characters.`;
      }

      if (q.type === 'SINGLE_CHOICE') {
        if (q.options.length > MAX_OPTIONS_PER_QUESTION) {
          errors[`questions.${i}.options`] = `At most ${MAX_OPTIONS_PER_QUESTION} options are allowed.`;
        }
        q.options.forEach((opt, j) => {
          const trimmedOpt = opt.text.trim();
          if (trimmedOpt.length === 0) {
            errors[`questions.${i}.options.${j}.text`] =
              'Option text is required (1–100 characters).';
          } else if (trimmedOpt.length > MAX_OPTION_TEXT_LENGTH) {
            errors[`questions.${i}.options.${j}.text`] =
              `Option text must be at most ${MAX_OPTION_TEXT_LENGTH} characters.`;
          }
        });
      }
    });

    return errors;
  };

  const focusFirstInvalidInput = (errors: Record<string, string>) => {
    const firstKey = Object.keys(errors)[0];
    if (!firstKey || !formRef.current) return;
    const escaped = firstKey.replace(/\./g, '-');
    const target = formRef.current.querySelector<HTMLElement>(`[data-field-key="${escaped}"]`);
    target?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setGenericError(null);

    const clientErrors = validateClientDraft();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      setTimeout(() => focusFirstInvalidInput(clientErrors), 0);
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        description,
        mode: 'IDENTIFIED' as const,
        questions: questions.map((q) =>
          q.type === 'SINGLE_CHOICE'
            ? {
                type: 'SINGLE_CHOICE' as const,
                text: q.text.trim(),
                required: q.required,
                options: q.options.map((opt) => ({ text: opt.text.trim() })),
              }
            : {
                type: 'RATING' as const,
                text: q.text.trim(),
                required: q.required,
              }
        ),
      };

      const res = await apiFetch<SurveyDetail>('/surveys', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      navigate(`/my-surveys/${res.data.id}`, {
        state: { flashMessage: 'Draft saved.' },
      });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setApiError(err);
        const mapped = mapDetailsToFieldErrors(err.details);
        setFieldErrors(mapped);
        setTimeout(() => focusFirstInvalidInput(mapped), 0);
      } else {
        setGenericError('Could not save draft. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <Link
            to="/my-surveys"
            className="text-sm font-medium text-[#006B3C] hover:underline"
          >
            &larr; Back to My Surveys
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Create Survey</h1>
        </div>
      </div>

      <div className="rounded-lg bg-[#EAF6EF] border border-[#B7DFC7] px-4 py-3 text-sm text-[#006B3C]">
        <span className="font-semibold">Response mode: </span>
        {IDENTIFIED_MODE_NOTICE}
      </div>

      {apiError && (
        <ErrorBanner
          message={apiError.message}
          details={apiError.details}
          requestId={apiError.requestId}
        />
      )}
      {genericError && <ErrorBanner message={genericError} />}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-6 bg-white rounded-lg border border-gray-200 p-4 sm:p-6 shadow-sm"
      >
        <div className="space-y-1.5">
          <label htmlFor="survey-title" className="block text-sm font-medium text-gray-900">
            Title
          </label>
          <p id="survey-title-hint" className="text-xs text-gray-500">
            Optional for drafts (0–120 characters). Blank titles are shown as &ldquo;Untitled survey&rdquo;.
          </p>
          <input
            id="survey-title"
            name="title"
            type="text"
            data-field-key="title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              clearFieldError('title');
            }}
            aria-invalid={Boolean(fieldErrors.title)}
            aria-describedby={
              fieldErrors.title ? 'survey-title-hint survey-title-error' : 'survey-title-hint'
            }
            className="block w-full rounded-md border border-gray-400 px-3 py-2.5 text-base text-gray-900 focus:border-[#006B3C] focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
          />
          <div className="flex justify-between text-xs">
            <span
              id="survey-title-error"
              role={fieldErrors.title ? 'alert' : undefined}
              className="text-red-700 font-medium"
            >
              {fieldErrors.title ?? ''}
            </span>
            <span className="text-gray-500 tabular-nums">
              {title.trim().length}/{MAX_TITLE_LENGTH}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="survey-description" className="block text-sm font-medium text-gray-900">
            Description
          </label>
          <p id="survey-description-hint" className="text-xs text-gray-500">
            Optional instructions or context for respondents (0–1,000 characters).
          </p>
          <textarea
            id="survey-description"
            name="description"
            rows={3}
            data-field-key="description"
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              clearFieldError('description');
            }}
            aria-invalid={Boolean(fieldErrors.description)}
            aria-describedby={
              fieldErrors.description
                ? 'survey-description-hint survey-description-error'
                : 'survey-description-hint'
            }
            className="block w-full rounded-md border border-gray-400 px-3 py-2.5 text-base text-gray-900 focus:border-[#006B3C] focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
          />
          <div className="flex justify-between text-xs">
            <span
              id="survey-description-error"
              role={fieldErrors.description ? 'alert' : undefined}
              className="text-red-700 font-medium"
            >
              {fieldErrors.description ?? ''}
            </span>
            <span className="text-gray-500 tabular-nums">
              {description.length}/{MAX_DESCRIPTION_LENGTH}
            </span>
          </div>
        </div>

        <section aria-labelledby="questions-heading" className="space-y-4 pt-2 border-t border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="questions-heading" className="text-lg font-semibold text-gray-900">
                Questions ({questions.length}/{MAX_QUESTIONS})
              </h2>
              <p className="text-xs text-gray-500">
                Incomplete drafts can be saved now; at least 1 question is required before publishing.
              </p>
            </div>
            <button
              type="button"
              onClick={addQuestion}
              disabled={questions.length >= MAX_QUESTIONS}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-md border border-[#006B3C] text-[#006B3C] hover:bg-[#EAF6EF] text-sm font-medium disabled:opacity-50 transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add question
            </button>
          </div>

          {fieldErrors.questions && (
            <p role="alert" className="text-sm font-medium text-red-700">
              {fieldErrors.questions}
            </p>
          )}

          {questions.length === 0 ? (
            <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
              No questions added yet. Click &ldquo;Add question&rdquo; to add a single-choice or rating question, or save this as an incomplete draft.
            </div>
          ) : (
            <ol className="space-y-4">
              {questions.map((question, qIndex) => {
                const typeId = `q-${question.localId}-type`;
                const textId = `q-${question.localId}-text`;
                const reqId = `q-${question.localId}-required`;
                const textErrorKey = `questions.${qIndex}.text`;
                const optionsErrorKey = `questions.${qIndex}.options`;
                const textError = fieldErrors[textErrorKey];
                const optionsError = fieldErrors[optionsErrorKey];

                return (
                  <li
                    key={question.localId}
                    className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">
                        Question {qIndex + 1}
                      </h3>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => moveQuestion(qIndex, -1)}
                          disabled={qIndex === 0}
                          aria-label={`Move question ${qIndex + 1} up`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveQuestion(qIndex, 1)}
                          disabled={qIndex === questions.length - 1}
                          aria-label={`Move question ${qIndex + 1} down`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIndex)}
                          aria-label={`Remove question ${qIndex + 1}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[36px] rounded border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label htmlFor={typeId} className="block text-sm font-medium text-gray-800">
                          Question type
                        </label>
                        <select
                          id={typeId}
                          data-field-key={`questions-${qIndex}-type`}
                          value={question.type}
                          onChange={(e) => {
                            updateQuestion(qIndex, {
                              type: e.target.value as QuestionType,
                            });
                            clearFieldError(`questions.${qIndex}.type`);
                            clearFieldError(optionsErrorKey);
                          }}
                          className="block w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 focus:border-[#006B3C] focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
                        >
                          <option value="SINGLE_CHOICE">Single choice</option>
                          <option value="RATING">Rating 1–5</option>
                        </select>
                        {fieldErrors[`questions.${qIndex}.type`] && (
                          <p role="alert" className="text-xs font-medium text-red-700">
                            {fieldErrors[`questions.${qIndex}.type`]}
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label htmlFor={textId} className="block text-sm font-medium text-gray-800">
                          Question text <span aria-hidden="true" className="text-red-600">*</span>
                        </label>
                        <input
                          id={textId}
                          type="text"
                          required
                          data-field-key={`questions-${qIndex}-text`}
                          value={question.text}
                          onChange={(e) => {
                            updateQuestion(qIndex, { text: e.target.value });
                            clearFieldError(textErrorKey);
                          }}
                          aria-invalid={Boolean(textError)}
                          aria-describedby={textError ? `${textId}-error` : undefined}
                          className="block w-full rounded-md border border-gray-400 bg-white px-3 py-2.5 text-base text-gray-900 focus:border-[#006B3C] focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
                        />
                        {textError && (
                          <p id={`${textId}-error`} role="alert" className="text-xs font-medium text-red-700">
                            {textError}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        id={reqId}
                        type="checkbox"
                        checked={question.required}
                        onChange={(e) => updateQuestion(qIndex, { required: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-400 text-[#006B3C] focus:ring-[#006B3C] accent-[#006B3C]"
                      />
                      <label htmlFor={reqId} className="text-sm font-medium text-gray-800">
                        Required
                      </label>
                    </div>

                    {question.type === 'SINGLE_CHOICE' ? (
                      <div className="space-y-3 pt-2 border-t border-gray-200">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-800">
                            Options ({question.options.length}/{MAX_OPTIONS_PER_QUESTION})
                          </span>
                          <button
                            type="button"
                            onClick={() => addOption(qIndex)}
                            disabled={question.options.length >= MAX_OPTIONS_PER_QUESTION}
                            className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[36px] rounded border border-gray-300 bg-white text-xs font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                            Add option
                          </button>
                        </div>

                        {optionsError && (
                          <p role="alert" className="text-xs font-medium text-red-700">
                            {optionsError}
                          </p>
                        )}

                        {question.options.length === 0 ? (
                          <p className="text-xs text-gray-500">
                            No options yet. At least 2 options are required before publishing.
                          </p>
                        ) : (
                          <ul className="space-y-2.5">
                            {question.options.map((opt, oIndex) => {
                              const optId = `q-${question.localId}-opt-${opt.localId}`;
                              const optErrorKey = `questions.${qIndex}.options.${oIndex}.text`;
                              const optError = fieldErrors[optErrorKey];
                              return (
                                <li key={opt.localId} className="space-y-1">
                                  <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                                    <div className="flex-1 space-y-1">
                                      <label
                                        htmlFor={optId}
                                        className="block text-xs font-medium text-gray-700"
                                      >
                                        Option {oIndex + 1}{' '}
                                        <span aria-hidden="true" className="text-red-600">*</span>
                                      </label>
                                      <input
                                        id={optId}
                                        type="text"
                                        required
                                        data-field-key={`questions-${qIndex}-options-${oIndex}-text`}
                                        value={opt.text}
                                        onChange={(e) =>
                                          updateOptionText(qIndex, oIndex, e.target.value)
                                        }
                                        aria-invalid={Boolean(optError)}
                                        aria-describedby={optError ? `${optId}-error` : undefined}
                                        className="block w-full rounded-md border border-gray-400 bg-white px-3 py-2 text-base text-gray-900 focus:border-[#006B3C] focus:outline-none focus:ring-2 focus:ring-[#006B3C]"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => removeOption(qIndex, oIndex)}
                                      aria-label={`Remove option ${oIndex + 1} from question ${qIndex + 1}`}
                                      className="inline-flex items-center justify-center gap-1 px-3 py-2 min-h-[42px] rounded border border-red-200 bg-white text-xs font-medium text-red-700 hover:bg-red-50 shrink-0"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                                      Remove
                                    </button>
                                  </div>
                                  {optError && (
                                    <p
                                      id={`${optId}-error`}
                                      role="alert"
                                      className="text-xs font-medium text-red-700"
                                    >
                                      {optError}
                                    </p>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600 pt-1">
                        Rating scale is fixed at 1–5.
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-4 border-t border-gray-200">
          <Link
            to="/my-surveys"
            className="inline-flex items-center justify-center px-4 py-2.5 min-h-[44px] rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 min-h-[44px] rounded-md bg-[#006B3C] hover:bg-[#0B7A46] text-white text-sm font-medium shadow-sm disabled:opacity-60 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Spinner size="sm" label="Saving draft..." />
                Saving...
              </>
            ) : (
              'Save draft'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default NewSurveyPage;
