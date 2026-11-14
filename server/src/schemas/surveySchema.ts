import { z } from 'zod';

export const optionInputSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, 'must be between 1 and 100 characters')
      .max(100, 'must be at most 100 characters'),
  })
  .strict();

export const singleChoiceQuestionSchema = z
  .object({
    type: z.literal('SINGLE_CHOICE'),
    text: z
      .string()
      .trim()
      .min(1, 'must be between 1 and 300 characters')
      .max(300, 'must be at most 300 characters'),
    required: z.boolean().default(true),
    options: z.array(optionInputSchema).max(10, 'must have at most 10 options').default([]),
  })
  .strict();

export const ratingQuestionSchema = z
  .object({
    type: z.literal('RATING'),
    text: z
      .string()
      .trim()
      .min(1, 'must be between 1 and 300 characters')
      .max(300, 'must be at most 300 characters'),
    required: z.boolean().default(true),
    options: z
      .array(z.unknown())
      .max(0, 'rating questions cannot have options')
      .optional()
      .default([]),
  })
  .strict();

export const questionInputSchema = z.discriminatedUnion('type', [
  singleChoiceQuestionSchema,
  ratingQuestionSchema,
]);

const surveyModeSchema = z
  .string()
  .superRefine((val, ctx) => {
    if (val === 'ANONYMOUS') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'is not available yet',
      });
      return;
    }
    if (val !== 'IDENTIFIED') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'must be IDENTIFIED',
      });
    }
  })
  .transform(() => 'IDENTIFIED' as const)
  .default('IDENTIFIED');

export const createSurveySchema = z
  .object({
    title: z.string().trim().max(120, 'must be at most 120 characters').default(''),
    description: z.string().max(1000, 'must be at most 1000 characters').default(''),
    mode: surveyModeSchema,
    questions: z
      .array(questionInputSchema)
      .max(30, 'must have at most 30 questions')
      .default([]),
  })
  .strict();

export type OptionInput = z.infer<typeof optionInputSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;

export const uuidParamSchema = z.object({
  id: z.string().uuid('must be a valid UUID'),
});

const coercePositiveInt = (defaultValue: number, fieldLabel: string) =>
  z.preprocess((val) => {
    if (val === undefined) return defaultValue;
    if (typeof val !== 'string' || val.trim() === '') return NaN;
    return Number(val);
  }, z.number({ invalid_type_error: `${fieldLabel} must be an integer` }).int(`${fieldLabel} must be an integer`).min(1, `${fieldLabel} must be at least 1`));

export const listSurveysQuerySchema = z.object({
  page: coercePositiveInt(1, 'page'),
  pageSize: z.preprocess(
    (val) => {
      if (val === undefined) return 20;
      if (typeof val !== 'string' || val.trim() === '') return NaN;
      return Number(val);
    },
    z
      .number({ invalid_type_error: 'pageSize must be an integer' })
      .int('pageSize must be an integer')
      .min(1, 'pageSize must be at least 1')
      .max(100, 'pageSize must be at most 100')
  ),
});

export const emptyBodySchema = z.preprocess(
  (val) => (val === undefined ? {} : val),
  z.object({}).strict()
);

export type ListSurveysQuery = z.infer<typeof listSurveysQuerySchema>;
