export type QuestionType = 'SINGLE_CHOICE' | 'RATING' | 'MULTIPLE_CHOICE' | 'FREE_TEXT';

export interface AnswerItemInput {
  questionId: string;
  optionIds?: string[];
  rating?: number;
}

export interface QuestionForValidation {
  id: string;
  position: number;
  type: QuestionType;
  required: boolean;
  options: Array<{
    id: string;
    position: number;
  }>;
}

export interface SurveyForValidation {
  id: string;
  questions: QuestionForValidation[];
}

export interface AnswerValidationError {
  field?: string;
  issue: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: AnswerValidationError[];
}

/**
 * Validates respondent answer submission according to BR-06 rules.
 * Pure domain function: ZERO database or HTTP imports.
 *
 * Rules:
 * - Missing required question -> field: "answers", issue: "question <position> is required"
 * - questionId not in survey -> field: "answers[i].questionId"
 * - question answered more than once -> field: "answers[i].questionId"
 * - SINGLE_CHOICE: optionIds count != 1 or has rating or option not in question -> field: "answers[i].optionIds"
 * - RATING: rating not integer 1-5 or has optionIds -> field: "answers[i].rating"
 * - Optional questions may be omitted; answers: [] valid only if survey has zero required questions.
 */
export function validateAnswers(
  survey: SurveyForValidation,
  answers: AnswerItemInput[]
): ValidationResult {
  const errors: AnswerValidationError[] = [];
  const questionMap = new Map<string, QuestionForValidation>();

  for (const q of survey.questions) {
    questionMap.set(q.id, q);
  }

  // Track which questions are answered and which questionIds appear
  const answeredQuestionIds = new Set<string>();
  const seenQuestionIndices = new Map<string, number>();

  answers.forEach((ans, index) => {
    const qField = `answers[${index}].questionId`;
    const targetQuestion = questionMap.get(ans.questionId);

    if (!targetQuestion) {
      errors.push({
        field: qField,
        issue: `Question ${ans.questionId} does not belong to this survey.`,
      });
      return;
    }

    if (seenQuestionIndices.has(ans.questionId)) {
      errors.push({
        field: qField,
        issue: `Question ${targetQuestion.position} is answered more than once (duplicate questionId).`,
      });
      return;
    }

    seenQuestionIndices.set(ans.questionId, index);
    answeredQuestionIds.add(ans.questionId);

    // Type-specific answer validations
    if (targetQuestion.type === 'SINGLE_CHOICE') {
      const optField = `answers[${index}].optionIds`;

      if (ans.rating !== undefined || !ans.optionIds || !Array.isArray(ans.optionIds) || ans.optionIds.length !== 1) {
        errors.push({
          field: optField,
          issue: 'Single-choice question requires exactly 1 selected option and no rating.',
        });
      } else {
        const selectedOptionId = ans.optionIds[0];
        const validOption = targetQuestion.options.some((o) => o.id === selectedOptionId);
        if (!validOption) {
          errors.push({
            field: optField,
            issue: "Selected option is not one of that question's options.",
          });
        }
      }
    } else if (targetQuestion.type === 'RATING') {
      const ratField = `answers[${index}].rating`;

      if (
        ans.optionIds !== undefined ||
        ans.rating === undefined ||
        typeof ans.rating !== 'number' ||
        !Number.isInteger(ans.rating) ||
        ans.rating < 1 ||
        ans.rating > 5
      ) {
        errors.push({
          field: ratField,
          issue: 'Rating must be an integer from 1 to 5 and have no optionIds.',
        });
      }
    }
  });

  // Check required questions are all answered
  for (const q of survey.questions) {
    if (q.required && !answeredQuestionIds.has(q.id)) {
      errors.push({
        field: 'answers',
        issue: `Question ${q.position} is required.`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
