import { describe, it, expect } from 'vitest';
import { buildSummary, type SummaryQuestionInput } from '../../src/domain/summaryMath';

describe('Aggregate Summary Math & Rounding (TEST-F04-01, AC-F04-01, FR-04)', () => {
  describe('single-choice percentages', () => {
    const cases: Array<{
      answered: number;
      counts: number[];
      expectedPercents: Array<number | null>;
    }> = [
      { answered: 12, counts: [9, 3], expectedPercents: [75.0, 25.0] },
      { answered: 3, counts: [2, 1, 0], expectedPercents: [66.7, 33.3, 0.0] },
      { answered: 3, counts: [1, 1, 1], expectedPercents: [33.3, 33.3, 33.3] },
      { answered: 16, counts: [1, 15], expectedPercents: [6.3, 93.8] },
      { answered: 0, counts: [0, 0], expectedPercents: [null, null] },
    ];

    it.each(cases)(
      'computes percentages for answered=$answered with counts=$counts',
      ({ answered, counts, expectedPercents }) => {
        const questions: SummaryQuestionInput[] = [
          {
            id: 'q1',
            position: 1,
            text: 'Choice question',
            type: 'SINGLE_CHOICE',
            options: counts.map((_, idx) => ({
              id: `o${idx + 1}`,
              position: idx + 1,
              text: `Option ${idx + 1}`,
            })),
          },
        ];

        const optionCounts: Record<string, number> = {};
        counts.forEach((c, idx) => {
          optionCounts[`o${idx + 1}`] = c;
        });

        const summary = buildSummary(questions, {
          totalResponses: answered,
          choiceByQuestionId: {
            q1: { answered, optionCounts },
          },
          ratingByQuestionId: {},
        });

        expect(summary.totalResponses).toBe(answered);
        expect(summary.questions).toHaveLength(1);
        const q = summary.questions[0];
        expect(q.type).toBe('SINGLE_CHOICE');
        if (q.type === 'SINGLE_CHOICE') {
          expect(q.answered).toBe(answered);
          expect(q.options.map((o) => o.count)).toEqual(counts);
          expect(q.options.map((o) => o.percent)).toEqual(expectedPercents);
        }
      }
    );
  });

  describe('rating mean and distribution', () => {
    const cases: Array<{
      ratings: number[];
      expectedAnswered: number;
      expectedMean: number | null;
      expectedDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
    }> = [
      {
        ratings: [4, 5, 5],
        expectedAnswered: 3,
        expectedMean: 4.67,
        expectedDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 },
      },
      {
        ratings: [1, 2, 2],
        expectedAnswered: 3,
        expectedMean: 1.67,
        expectedDistribution: { '1': 1, '2': 2, '3': 0, '4': 0, '5': 0 },
      },
      {
        ratings: [5, 5, 4, 4, 4, 2],
        expectedAnswered: 6,
        expectedMean: 4.0,
        expectedDistribution: { '1': 0, '2': 1, '3': 0, '4': 3, '5': 2 },
      },
      {
        ratings: [4, 5],
        expectedAnswered: 2,
        expectedMean: 4.5,
        expectedDistribution: { '1': 0, '2': 0, '3': 0, '4': 1, '5': 1 },
      },
      {
        ratings: [],
        expectedAnswered: 0,
        expectedMean: null,
        expectedDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
      },
    ];

    it.each(cases)(
      'computes mean and 1-5 distribution for ratings=$ratings',
      ({ ratings, expectedAnswered, expectedMean, expectedDistribution }) => {
        const questions: SummaryQuestionInput[] = [
          {
            id: 'q-rate',
            position: 1,
            text: 'Rate overall',
            type: 'RATING',
          },
        ];

        const dist: Record<'1' | '2' | '3' | '4' | '5', number> = {
          '1': 0,
          '2': 0,
          '3': 0,
          '4': 0,
          '5': 0,
        };
        let sum = 0;
        for (const r of ratings) {
          sum += r;
          const key = String(r) as '1' | '2' | '3' | '4' | '5';
          dist[key] += 1;
        }

        const summary = buildSummary(questions, {
          totalResponses: expectedAnswered,
          choiceByQuestionId: {},
          ratingByQuestionId:
            expectedAnswered > 0
              ? {
                  'q-rate': {
                    answered: expectedAnswered,
                    sum,
                    distribution: dist,
                  },
                }
              : {},
        });

        expect(summary.questions).toHaveLength(1);
        const q = summary.questions[0];
        expect(q.type).toBe('RATING');
        if (q.type === 'RATING') {
          expect(q.answered).toBe(expectedAnswered);
          expect(q.mean).toBe(expectedMean);
          expect(q.distribution).toEqual(expectedDistribution);
        }
      }
    );
  });

  it('uses question answered count rather than totalResponses for optional questions', () => {
    const questions: SummaryQuestionInput[] = [
      {
        id: 'q-opt',
        position: 1,
        text: 'Optional choice',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'o1', position: 1, text: 'Yes' },
          { id: 'o2', position: 2, text: 'No' },
        ],
      },
    ];

    const summary = buildSummary(questions, {
      totalResponses: 4,
      choiceByQuestionId: {
        'q-opt': { answered: 2, optionCounts: { o1: 1, o2: 1 } },
      },
      ratingByQuestionId: {},
    });

    expect(summary.totalResponses).toBe(4);
    const q = summary.questions[0];
    expect(q.type).toBe('SINGLE_CHOICE');
    if (q.type === 'SINGLE_CHOICE') {
      expect(q.answered).toBe(2);
      expect(q.options.map((o) => o.percent)).toEqual([50.0, 50.0]);
    }
  });

  it('preserves 0-count options, missing count entries, and sorts questions and options in position order', () => {
    const questions: SummaryQuestionInput[] = [
      {
        id: 'q2',
        position: 2,
        text: 'Rating',
        type: 'RATING',
      },
      {
        id: 'q1',
        position: 1,
        text: 'Workload',
        type: 'SINGLE_CHOICE',
        options: [
          { id: 'o3', position: 3, text: 'Too heavy' },
          { id: 'o1', position: 1, text: 'Too light' },
          { id: 'o2', position: 2, text: 'About right' },
        ],
      },
    ];

    const summary = buildSummary(questions, {
      totalResponses: 3,
      choiceByQuestionId: {
        q1: { answered: 3, optionCounts: { o2: 2, o3: 1 } }, // o1 omitted (0 count)
      },
      ratingByQuestionId: {
        q2: { answered: 3, sum: 14, distribution: { '4': 1, '5': 2 } }, // 1,2,3 omitted
      },
    });

    expect(summary.questions.map((q) => q.questionId)).toEqual(['q1', 'q2']);
    const q1 = summary.questions[0];
    if (q1.type === 'SINGLE_CHOICE') {
      expect(q1.options).toEqual([
        { optionId: 'o1', text: 'Too light', count: 0, percent: 0.0 },
        { optionId: 'o2', text: 'About right', count: 2, percent: 66.7 },
        { optionId: 'o3', text: 'Too heavy', count: 1, percent: 33.3 },
      ]);
    }
    const q2 = summary.questions[1];
    if (q2.type === 'RATING') {
      expect(q2.mean).toBe(4.67);
      expect(q2.distribution).toEqual({ '1': 0, '2': 0, '3': 0, '4': 1, '5': 2 });
    }
  });
});
