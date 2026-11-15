import { describe, it, expect } from 'vitest';
import {
  publishChecks,
  canTransition,
  checkSurveyChange,
  type SurveyStatus,
  type SurveyChangeKind,
} from '../../src/domain/surveyLifecycle';

describe('Survey Lifecycle Domain Rules', () => {
  describe('publishChecks (TEST-F02-04 TDD, AC-F02-04, BR-04)', () => {
    it('passes a complete survey with non-blank title, >=1 question, and >=2 options per choice question', () => {
      const failures = publishChecks({
        title: 'Course Evaluation',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            options: [{ text: 'Yes' }, { text: 'No' }],
          },
          {
            type: 'RATING',
            options: [],
          },
        ],
      });
      expect(failures).toEqual([]);
    });

    it('fails when title is empty string', () => {
      const failures = publishChecks({
        title: '',
        questions: [{ type: 'RATING', options: [] }],
      });
      expect(failures).toEqual([
        { field: 'title', issue: 'must not be empty to publish' },
      ]);
    });

    it('fails when title is spaces/whitespace only', () => {
      const failures = publishChecks({
        title: '   \t\n ',
        questions: [{ type: 'RATING', options: [] }],
      });
      expect(failures).toEqual([
        { field: 'title', issue: 'must not be empty to publish' },
      ]);
    });

    it('fails when survey has 0 questions', () => {
      const failures = publishChecks({
        title: 'Valid Title',
        questions: [],
      });
      expect(failures).toEqual([
        { field: 'questions', issue: 'at least 1 question is required to publish' },
      ]);
    });

    it('fails when first single-choice question has 1 option', () => {
      const failures = publishChecks({
        title: 'Valid Title',
        questions: [{ type: 'SINGLE_CHOICE', options: [{ text: 'Only option' }] }],
      });
      expect(failures).toEqual([
        {
          field: 'questions[0].options',
          issue: 'a choice question needs at least 2 options to publish',
        },
      ]);
    });

    it('fails when first single-choice question has 0 options', () => {
      const failures = publishChecks({
        title: 'Valid Title',
        questions: [{ type: 'SINGLE_CHOICE', options: [] }],
      });
      expect(failures).toEqual([
        {
          field: 'questions[0].options',
          issue: 'a choice question needs at least 2 options to publish',
        },
      ]);
    });

    it('reports EVERY failed check together and uses zero-based index in position order', () => {
      const failures = publishChecks({
        title: '   ',
        questions: [
          { position: 2, type: 'SINGLE_CHOICE', options: [{ text: 'Only one' }] },
          { position: 1, type: 'RATING', options: [] },
          { position: 3, type: 'SINGLE_CHOICE', options: [] },
        ],
      });
      expect(failures).toEqual([
        { field: 'title', issue: 'must not be empty to publish' },
        {
          field: 'questions[1].options',
          issue: 'a choice question needs at least 2 options to publish',
        },
        {
          field: 'questions[2].options',
          issue: 'a choice question needs at least 2 options to publish',
        },
      ]);
    });

    it('reports both title and questions when both are empty', () => {
      const failures = publishChecks({
        title: '',
        questions: [],
      });
      expect(failures).toEqual([
        { field: 'title', issue: 'must not be empty to publish' },
        { field: 'questions', issue: 'at least 1 question is required to publish' },
      ]);
    });
  });

  describe('BR-03 question lock (TEST-F02-07 TDD, AC-F02-07)', () => {
    const lockedChanges: SurveyChangeKind[] = [
      'ADD_QUESTION',
      'REMOVE_QUESTION',
      'REORDER_QUESTIONS',
      'CHANGE_QUESTION_TEXT',
      'CHANGE_QUESTION_TYPE',
      'CHANGE_QUESTION_REQUIRED',
      'ADD_OPTION',
      'REMOVE_OPTION',
      'CHANGE_OPTION',
      'CHANGE_MODE',
    ];

    const metadataChanges: SurveyChangeKind[] = [
      'CHANGE_TITLE',
      'CHANGE_DESCRIPTION',
    ];

    it('allows every change when survey status is DRAFT', () => {
      for (const change of [...lockedChanges, ...metadataChanges]) {
        expect(checkSurveyChange('DRAFT', change)).toBe('ALLOWED');
      }
    });

    it('returns SURVEY_LOCKED for question, option, type, required, order, and mode changes when PUBLISHED', () => {
      for (const change of lockedChanges) {
        expect(checkSurveyChange('PUBLISHED', change)).toBe('SURVEY_LOCKED');
      }
    });

    it('returns SURVEY_LOCKED for question, option, type, required, order, and mode changes when CLOSED', () => {
      for (const change of lockedChanges) {
        expect(checkSurveyChange('CLOSED', change)).toBe('SURVEY_LOCKED');
      }
    });

    it('allows title and description changes when PUBLISHED or CLOSED', () => {
      for (const status of ['PUBLISHED', 'CLOSED'] as const) {
        for (const change of metadataChanges) {
          expect(checkSurveyChange(status, change)).toBe('ALLOWED');
        }
      }
    });
  });

  describe('canTransition (TEST-F02-08, AC-F02-08, BR-04)', () => {
    const statuses: SurveyStatus[] = ['DRAFT', 'PUBLISHED', 'CLOSED'];

    it('evaluates all 9 status transition pairs and allows only DRAFT->PUBLISHED and PUBLISHED->CLOSED', () => {
      const results: Array<[SurveyStatus, SurveyStatus, boolean]> = [];
      for (const from of statuses) {
        for (const to of statuses) {
          results.push([from, to, canTransition(from, to)]);
        }
      }

      expect(results).toEqual([
        ['DRAFT', 'DRAFT', false],
        ['DRAFT', 'PUBLISHED', true],
        ['DRAFT', 'CLOSED', false],
        ['PUBLISHED', 'DRAFT', false],
        ['PUBLISHED', 'PUBLISHED', false],
        ['PUBLISHED', 'CLOSED', true],
        ['CLOSED', 'DRAFT', false],
        ['CLOSED', 'PUBLISHED', false],
        ['CLOSED', 'CLOSED', false],
      ]);
    });
  });
});
