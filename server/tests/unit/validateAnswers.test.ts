import { describe, it, expect } from 'vitest';
import {
  validateAnswers,
  SurveyForValidation,
  AnswerItemInput,
} from '../../src/domain/validateAnswers';

describe('TEST-F03-07 (Unit): validateAnswers Pure Domain Rules (BR-06, AC-F03-07)', () => {
  // Fixture: S-PUB structure with Q1 single-choice (required), Q2 rating (required), Q3 single-choice (optional)
  const fixtureSurvey: SurveyForValidation = {
    id: 's-pub-uuid',
    questions: [
      {
        id: 'q1-sc-req',
        position: 1,
        type: 'SINGLE_CHOICE',
        required: true,
        options: [
          { id: 'o1-q1', position: 1 },
          { id: 'o2-q1', position: 2 },
          { id: 'o3-q1', position: 3 },
        ],
      },
      {
        id: 'q2-rat-req',
        position: 2,
        type: 'RATING',
        required: true,
        options: [],
      },
      {
        id: 'q3-sc-opt',
        position: 3,
        type: 'SINGLE_CHOICE',
        required: false,
        options: [
          { id: 'o1-q3', position: 1 },
          { id: 'o2-q3', position: 2 },
        ],
      },
    ],
  };

  describe('Invalid Answer Problem Rows (each reported on specific field)', () => {
    it('reports field "answers" when a required question (Q2) is missing', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o2-q1'] },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers',
          issue: expect.stringMatching(/question 2 is required/i),
        })
      );
    });

    it('reports field "answers" when answers array is empty and required questions exist', () => {
      const answers: AnswerItemInput[] = [];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers',
          issue: expect.stringMatching(/required/i),
        })
      );
    });

    it('reports field "answers[i].questionId" when a questionId belongs to another survey', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o2-q1'] },
        { questionId: 'q2-rat-req', rating: 4 },
        { questionId: 'unknown-question-id', optionIds: ['o1-q1'] },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers[2].questionId',
        })
      );
    });

    it('reports field "answers[i].questionId" when a question is answered twice', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o1-q1'] },
        { questionId: 'q1-sc-req', optionIds: ['o2-q1'] },
        { questionId: 'q2-rat-req', rating: 4 },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers[1].questionId',
          issue: expect.stringMatching(/twice|duplicate|already/i),
        })
      );
    });

    it('reports field "answers[i].optionIds" when single-choice has more than one optionId', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o1-q1', 'o2-q1'] },
        { questionId: 'q2-rat-req', rating: 4 },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers[0].optionIds',
          issue: expect.stringMatching(/exactly 1|single/i),
        })
      );
    });

    it('reports field "answers[i].optionIds" when optionId belongs to another question or is unknown', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o1-q3'] }, // o1-q3 is from Q3, not Q1!
        { questionId: 'q2-rat-req', rating: 4 },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers[0].optionIds',
          issue: expect.stringMatching(/not one of that question's options|invalid option/i),
        })
      );
    });

    it('reports field "answers[i].optionIds" when single-choice question is answered with rating instead of optionIds', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', rating: 3 },
        { questionId: 'q2-rat-req', rating: 4 },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers[0].optionIds',
        })
      );
    });

    it.each([0, 6, 3.5])(
      'reports field "answers[i].rating" when rating is %s (outside integer 1-5)',
      (invalidRating) => {
        const answers: AnswerItemInput[] = [
          { questionId: 'q1-sc-req', optionIds: ['o1-q1'] },
          { questionId: 'q2-rat-req', rating: invalidRating },
        ];
        const result = validateAnswers(fixtureSurvey, answers);

        expect(result.isValid).toBe(false);
        expect(result.errors).toContainEqual(
          expect.objectContaining({
            field: 'answers[1].rating',
            issue: expect.stringMatching(/integer from 1 to 5|1-5/i),
          })
        );
      }
    );

    it('reports field "answers[i].rating" when rating question is answered with optionIds instead of rating', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o1-q1'] },
        { questionId: 'q2-rat-req', optionIds: ['o1-q1'] },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'answers[1].rating',
        })
      );
    });

    it('reports ALL validation problems together in details (never stops on first error)', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o1-q1', 'o2-q1'] }, // 2 options
        { questionId: 'q2-rat-req', rating: 7 }, // rating 7
        { questionId: 'unknown-id', optionIds: ['o1-q1'] }, // unknown question
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.field === 'answers[0].optionIds')).toBe(true);
      expect(result.errors.some((e) => e.field === 'answers[1].rating')).toBe(true);
      expect(result.errors.some((e) => e.field === 'answers[2].questionId')).toBe(true);
    });
  });

  describe('Accepted Boundary Rows', () => {
    it('accepts rating 1 and optional question omitted', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o1-q1'] },
        { questionId: 'q2-rat-req', rating: 1 },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts rating 5 and optional question answered', () => {
      const answers: AnswerItemInput[] = [
        { questionId: 'q1-sc-req', optionIds: ['o2-q1'] },
        { questionId: 'q2-rat-req', rating: 5 },
        { questionId: 'q3-sc-opt', optionIds: ['o1-q3'] },
      ];
      const result = validateAnswers(fixtureSurvey, answers);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('accepts empty answers array when survey has zero required questions', () => {
      const optionalOnlySurvey: SurveyForValidation = {
        id: 'opt-survey-uuid',
        questions: [
          {
            id: 'q-opt',
            position: 1,
            type: 'SINGLE_CHOICE',
            required: false,
            options: [{ id: 'opt-1', position: 1 }],
          },
        ],
      };
      const result = validateAnswers(optionalOnlySurvey, []);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });
});
