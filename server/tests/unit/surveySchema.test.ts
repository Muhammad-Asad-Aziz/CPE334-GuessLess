import { describe, it, expect } from 'vitest';
import { createSurveySchema } from '../../src/schemas/surveySchema';

describe('Survey Create / Save-Draft Schema (TEST-F02-01, AC-F02-01)', () => {
  const validBaseRequest = {
    title: 'Lab feedback',
    description: 'Week 10 lab evaluation',
    mode: 'IDENTIFIED' as const,
    questions: [
      {
        type: 'SINGLE_CHOICE' as const,
        text: 'Was the lab clear?',
        required: true,
        options: [{ text: 'Yes' }, { text: 'No' }],
      },
      {
        type: 'RATING' as const,
        text: 'Rate the lab overall',
        required: true,
      },
    ],
  };

  it('accepts a valid complete draft and applies defaults', () => {
    const res = createSurveySchema.safeParse(validBaseRequest);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe('Lab feedback');
      expect(res.data.mode).toBe('IDENTIFIED');
      expect(res.data.questions).toHaveLength(2);
    }
  });

  it('accepts an empty object using draft defaults (incomplete draft)', () => {
    const res = createSurveySchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toEqual({
        title: '',
        description: '',
        mode: 'IDENTIFIED',
        questions: [],
      });
    }
  });

  // Row 1: title of 0 characters, no questions -> accepted
  it('accepts title of 0 characters with no questions (row 1)', () => {
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      title: '',
      questions: [],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe('');
      expect(res.data.questions).toEqual([]);
    }
  });

  it('trims title and treats spaces-only title as empty draft title', () => {
    const res = createSurveySchema.safeParse({
      title: '   ',
      questions: [],
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe('');
    }
  });

  // Row 2: title of 120 characters -> accepted
  it('accepts title of 120 characters (row 2)', () => {
    const title120 = 'a'.repeat(120);
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      title: `  ${title120}  `,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.title).toBe(title120);
      expect(res.data.title).toHaveLength(120);
    }
  });

  // Row 3: title of 121 characters -> rejected, field title
  it('rejects title of 121 characters on field title (row 3)', () => {
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      title: 'a'.repeat(121),
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'title')).toBe(true);
    }
  });

  // Row 4: description of 1,001 characters -> rejected, field description
  it('accepts description of 1,000 characters and rejects 1,001 on field description (row 4)', () => {
    const ok = createSurveySchema.safeParse({
      ...validBaseRequest,
      description: 'd'.repeat(1000),
    });
    expect(ok.success).toBe(true);

    const tooLong = createSurveySchema.safeParse({
      ...validBaseRequest,
      description: 'd'.repeat(1001),
    });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.issues.some((i) => i.path.join('.') === 'description')).toBe(true);
    }
  });

  // Row 5: 30 questions -> accepted
  it('accepts 30 questions (row 5)', () => {
    const questions = Array.from({ length: 30 }, (_, idx) => ({
      type: 'RATING' as const,
      text: `Question ${idx + 1}`,
    }));
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions,
    });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.questions).toHaveLength(30);
    }
  });

  // Row 6: 31 questions -> rejected, field questions
  it('rejects 31 questions on field questions (row 6)', () => {
    const questions = Array.from({ length: 31 }, (_, idx) => ({
      type: 'RATING' as const,
      text: `Question ${idx + 1}`,
    }));
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'questions')).toBe(true);
    }
  });

  // Row 7: question text of 0 or 301 characters -> rejected, field questions[i].text
  it('rejects question text of 0, whitespace-only, or 301 characters and accepts 1 and 300 (row 7)', () => {
    const minOk = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'RATING', text: 'x' }],
    });
    expect(minOk.success).toBe(true);

    const maxOk = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'RATING', text: ` ${'q'.repeat(300)} ` }],
    });
    expect(maxOk.success).toBe(true);

    for (const badText of ['', '   ', 'q'.repeat(301)]) {
      const bad = createSurveySchema.safeParse({
        ...validBaseRequest,
        questions: [{ type: 'RATING', text: badText }],
      });
      expect(bad.success).toBe(false);
      if (!bad.success) {
        expect(bad.error.issues.some((i) => i.path.join('.') === 'questions.0.text')).toBe(true);
      }
    }
  });

  // Row 8: single-choice question with 0 options -> accepted (and 1 option accepted in draft)
  it('accepts single-choice question with 0, 1, or 10 options in a draft (row 8)', () => {
    const omittedOptions = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'SINGLE_CHOICE', text: 'Incomplete choice' }],
    });
    expect(omittedOptions.success).toBe(true);

    const zeroOptions = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'SINGLE_CHOICE', text: 'Incomplete choice', options: [] }],
    });
    expect(zeroOptions.success).toBe(true);

    const oneOption = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'SINGLE_CHOICE', text: 'One option draft', options: [{ text: 'Only' }] }],
    });
    expect(oneOption.success).toBe(true);

    const tenOptions = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Max options',
          options: Array.from({ length: 10 }, (_, idx) => ({ text: `Opt ${idx + 1}` })),
        },
      ],
    });
    expect(tenOptions.success).toBe(true);
  });

  // Row 9: single-choice question with 11 options -> rejected, field questions[i].options
  it('rejects single-choice question with 11 options on field questions[i].options (row 9)', () => {
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Too many options',
          options: Array.from({ length: 11 }, (_, idx) => ({ text: `Opt ${idx + 1}` })),
        },
      ],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'questions.0.options')).toBe(true);
    }
  });

  // Row 10: option text of 0 or 101 characters -> rejected, field questions[i].options[j].text
  it('rejects option text of 0, whitespace-only, or 101 characters and accepts 1 and 100 (row 10)', () => {
    const ok = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Choice',
          options: [{ text: 'a' }, { text: ` ${'o'.repeat(100)} ` }],
        },
      ],
    });
    expect(ok.success).toBe(true);

    for (const badText of ['', '   ', 'o'.repeat(101)]) {
      const bad = createSurveySchema.safeParse({
        ...validBaseRequest,
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Choice',
            options: [{ text: 'Valid' }, { text: badText }],
          },
        ],
      });
      expect(bad.success).toBe(false);
      if (!bad.success) {
        expect(bad.error.issues.some((i) => i.path.join('.') === 'questions.0.options.1.text')).toBe(
          true
        );
      }
    }
  });

  // Row 11: rating question with options -> rejected, field questions[i].options
  it('accepts rating question with absent or empty options and rejects non-empty options (row 11)', () => {
    const emptyArrOk = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'RATING', text: 'Rate', options: [] }],
    });
    expect(emptyArrOk.success).toBe(true);

    const withOptions = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'RATING', text: 'Rate', options: [{ text: 'Bad' }] }],
    });
    expect(withOptions.success).toBe(false);
    if (!withOptions.success) {
      expect(withOptions.error.issues.some((i) => i.path.join('.') === 'questions.0.options')).toBe(
        true
      );
    }
  });

  // Row 12: mode ANONYMOUS -> rejected, field mode
  it('rejects ANONYMOUS mode in Sprint 1 on field mode (row 12)', () => {
    const res = createSurveySchema.safeParse({
      ...validBaseRequest,
      mode: 'ANONYMOUS',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const modeIssue = res.error.issues.find((i) => i.path.join('.') === 'mode');
      expect(modeIssue).toBeDefined();
      expect(modeIssue?.message).toBe('is not available yet');
    }
  });

  // Row 13: question type MULTIPLE_CHOICE -> rejected, field questions[i].type
  it('rejects MULTIPLE_CHOICE (and FREE_TEXT) question types on field questions[i].type (row 13)', () => {
    for (const unsupportedType of ['MULTIPLE_CHOICE', 'FREE_TEXT']) {
      const res = createSurveySchema.safeParse({
        ...validBaseRequest,
        questions: [{ type: unsupportedType, text: 'Unsupported' }],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path.join('.') === 'questions.0.type')).toBe(true);
      }
    }
  });

  // Row 14: extra server-owned fields -> rejected (BR-08)
  it('rejects extra server-owned fields at top level and nested levels (row 14)', () => {
    for (const extraField of ['ownerId', 'status', 'publishedAt', 'id'] as const) {
      const res = createSurveySchema.safeParse({
        ...validBaseRequest,
        [extraField]: 'spoofed-value',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(
          res.error.issues.some(
            (i) => i.code === 'unrecognized_keys' && i.keys.includes(extraField)
          )
        ).toBe(true);
      }
    }

    const extraOnQuestion = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [{ type: 'RATING', text: 'Rate', position: 1 }],
    });
    expect(extraOnQuestion.success).toBe(false);
    if (!extraOnQuestion.success) {
      expect(
        extraOnQuestion.error.issues.some(
          (i) =>
            i.path.join('.') === 'questions.0' &&
            i.code === 'unrecognized_keys' &&
            i.keys.includes('position')
        )
      ).toBe(true);
    }

    const extraOnOption = createSurveySchema.safeParse({
      ...validBaseRequest,
      questions: [
        {
          type: 'SINGLE_CHOICE',
          text: 'Choice',
          options: [{ text: 'Yes', id: 'spoof-opt-id' }],
        },
      ],
    });
    expect(extraOnOption.success).toBe(false);
    if (!extraOnOption.success) {
      expect(
        extraOnOption.error.issues.some(
          (i) =>
            i.path.join('.') === 'questions.0.options.0' &&
            i.code === 'unrecognized_keys' &&
            i.keys.includes('id')
        )
      ).toBe(true);
    }
  });
});
