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

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/**
 * Validates respondent answer submission according to BR-06 rules.
 * Pure domain function: ZERO database or HTTP imports.
 */
export function validateAnswers(
  _survey: SurveyForValidation,
  _answers: AnswerItemInput[]
): ValidationResult {
  // Stub for Phase A (Red TDD)
  return { valid: false, issues: [] };
}
