export type SurveyStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type QuestionType = 'SINGLE_CHOICE' | 'RATING' | 'MULTIPLE_CHOICE' | 'FREE_TEXT';

export interface PublishCheckFailure {
  field: string;
  issue: string;
}

export interface SurveyForPublishChecks {
  title: string;
  questions: ReadonlyArray<{
    type: QuestionType;
    position?: number;
    options?: ReadonlyArray<unknown>;
  }>;
}

export type SurveyChangeKind =
  | 'ADD_QUESTION'
  | 'REMOVE_QUESTION'
  | 'REORDER_QUESTIONS'
  | 'CHANGE_QUESTION_TEXT'
  | 'CHANGE_QUESTION_TYPE'
  | 'CHANGE_QUESTION_REQUIRED'
  | 'ADD_OPTION'
  | 'REMOVE_OPTION'
  | 'CHANGE_OPTION'
  | 'CHANGE_MODE'
  | 'CHANGE_TITLE'
  | 'CHANGE_DESCRIPTION';

export type SurveyChangeResult = 'ALLOWED' | 'SURVEY_LOCKED';

/**
 * Evaluates every BR-04 publication requirement and returns all failed checks.
 */
export function publishChecks(survey: SurveyForPublishChecks): PublishCheckFailure[] {
  const failures: PublishCheckFailure[] = [];

  if (survey.title.trim().length === 0) {
    failures.push({ field: 'title', issue: 'must not be empty to publish' });
  }

  if (survey.questions.length === 0) {
    failures.push({ field: 'questions', issue: 'at least 1 question is required to publish' });
    return failures;
  }

  const orderedQuestions = survey.questions
    .map((question, originalIndex) => ({ question, originalIndex }))
    .sort((a, b) => (a.question.position ?? a.originalIndex) - (b.question.position ?? b.originalIndex))
    .map((entry) => entry.question);

  for (let i = 0; i < orderedQuestions.length; i++) {
    const question = orderedQuestions[i];
    const isChoice = question.type === 'SINGLE_CHOICE' || question.type === 'MULTIPLE_CHOICE';
    if (isChoice && (question.options?.length ?? 0) < 2) {
      failures.push({
        field: `questions[${i}].options`,
        issue: 'a choice question needs at least 2 options to publish',
      });
    }
  }

  return failures;
}

/**
 * Enforces BR-04 allowed lifecycle transitions: DRAFT -> PUBLISHED and PUBLISHED -> CLOSED.
 */
export function canTransition(from: SurveyStatus, to: SurveyStatus): boolean {
  return (from === 'DRAFT' && to === 'PUBLISHED') || (from === 'PUBLISHED' && to === 'CLOSED');
}

/**
 * Enforces BR-03 immutability: questions, options, and mode are locked after publication.
 */
export function checkSurveyChange(
  status: SurveyStatus,
  change: SurveyChangeKind
): SurveyChangeResult {
  if (status === 'DRAFT') {
    return 'ALLOWED';
  }
  if (change === 'CHANGE_TITLE' || change === 'CHANGE_DESCRIPTION') {
    return 'ALLOWED';
  }
  return 'SURVEY_LOCKED';
}
