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
