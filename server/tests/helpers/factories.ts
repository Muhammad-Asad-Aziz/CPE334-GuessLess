import { prisma } from '../../src/lib/prisma';
import { calendarDay } from '../../src/domain/calendarDay';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

export async function createUser(overrides: {
  email?: string;
  displayName?: string;
  password?: string;
  role?: 'RESPONDENT' | 'SURVEY_OWNER' | 'ADMIN';
  isActive?: boolean;
} = {}) {
  const email = overrides.email || `user-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const displayName = overrides.displayName || 'Test User';
  const password = overrides.password || 'password123';
  const role = overrides.role || 'RESPONDENT';
  const isActive = overrides.isActive !== undefined ? overrides.isActive : true;

  const passwordHash = await bcrypt.hash(password, 4);

  return prisma.user.create({
    data: {
      email,
      displayName,
      passwordHash,
      role,
      isActive,
    },
  });
}

export async function createSurvey(
  ownerId: string,
  overrides: {
    title?: string;
    description?: string;
    mode?: 'IDENTIFIED' | 'ANONYMOUS';
    status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    eligibility?: 'ALL' | 'SELECTED';
    publishedAt?: Date | null;
    closeAt?: Date | null;
    closedAt?: Date | null;
  } = {}
) {
  const status = overrides.status || 'DRAFT';
  let publishedAt = overrides.publishedAt;
  if (status !== 'DRAFT' && publishedAt === undefined) {
    publishedAt = new Date();
  }

  let closedAt = overrides.closedAt;
  if (status === 'CLOSED' && closedAt === undefined) {
    closedAt = new Date();
  }

  return prisma.survey.create({
    data: {
      ownerId,
      title: overrides.title !== undefined ? overrides.title : 'Test Survey',
      description: overrides.description || 'Test Survey Description',
      mode: overrides.mode || 'IDENTIFIED',
      status,
      eligibility: overrides.eligibility || 'ALL',
      publishedAt: status === 'DRAFT' ? null : publishedAt,
      closeAt: overrides.closeAt || null,
      closedAt: status === 'CLOSED' ? closedAt : null,
    },
  });
}

export interface FactoryQuestionInput {
  type: 'SINGLE_CHOICE' | 'RATING';
  text: string;
  required?: boolean;
  options?: Array<{ text: string }>;
}

export async function createSurveyWithQuestions(
  ownerId: string,
  overrides: {
    title?: string;
    description?: string;
    mode?: 'IDENTIFIED' | 'ANONYMOUS';
    status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED';
    eligibility?: 'ALL' | 'SELECTED';
    publishedAt?: Date | null;
    closeAt?: Date | null;
    closedAt?: Date | null;
    createdAt?: Date;
    questions?: FactoryQuestionInput[];
  } = {}
) {
  const status = overrides.status || 'DRAFT';
  let publishedAt = overrides.publishedAt;
  if (status !== 'DRAFT' && publishedAt === undefined) {
    publishedAt = new Date();
  }

  let closedAt = overrides.closedAt;
  if (status === 'CLOSED' && closedAt === undefined) {
    closedAt = new Date();
  }

  const questions = overrides.questions ?? [
    {
      type: 'SINGLE_CHOICE',
      text: 'Default question',
      required: true,
      options: [{ text: 'Yes' }, { text: 'No' }],
    },
  ];

  return prisma.survey.create({
    data: {
      ownerId,
      title: overrides.title !== undefined ? overrides.title : 'Test Survey',
      description: overrides.description ?? 'Test Survey Description',
      mode: overrides.mode || 'IDENTIFIED',
      status,
      eligibility: overrides.eligibility || 'ALL',
      publishedAt: status === 'DRAFT' ? null : publishedAt,
      closeAt: overrides.closeAt || null,
      closedAt: status === 'CLOSED' ? closedAt : null,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      questions: {
        create: questions.map((q, qIdx) => ({
          position: qIdx + 1,
          type: q.type,
          text: q.text,
          required: q.required ?? true,
          options:
            q.type === 'SINGLE_CHOICE' && q.options
              ? {
                  create: q.options.map((opt, oIdx) => ({
                    position: oIdx + 1,
                    text: opt.text,
                  })),
                }
              : undefined,
        })),
      },
    },
    include: {
      questions: {
        orderBy: { position: 'asc' },
        include: {
          options: {
            orderBy: { position: 'asc' },
          },
        },
      },
    },
  });
}

export async function createQuestion(
  surveyId: string,
  overrides: {
    position?: number;
    type?: 'SINGLE_CHOICE' | 'RATING' | 'MULTIPLE_CHOICE' | 'FREE_TEXT';
    text?: string;
    required?: boolean;
  } = {}
) {
  return prisma.question.create({
    data: {
      surveyId,
      position: overrides.position ?? 1,
      type: overrides.type ?? 'SINGLE_CHOICE',
      text: overrides.text ?? 'Test question?',
      required: overrides.required ?? true,
    },
  });
}

export async function createOption(
  questionId: string,
  overrides: {
    position?: number;
    text?: string;
  } = {}
) {
  return prisma.option.create({
    data: {
      questionId,
      position: overrides.position ?? 1,
      text: overrides.text ?? 'Option 1',
    },
  });
}

export async function createParticipation(
  surveyId: string,
  respondentId: string,
  overrides: {
    participatedDay?: Date;
  } = {}
) {
  return prisma.participation.create({
    data: {
      surveyId,
      respondentId,
      participatedDay: overrides.participatedDay ?? new Date(),
    },
  });
}

export interface FactoryAnswerInput {
  questionId: string;
  ratingValue?: number;
  optionId?: string;
}

async function createResponseWithAnswersImpl(
  surveyId: string,
  respondentId: string,
  answers: FactoryAnswerInput[] = [],
  submittedAt: Date = new Date()
) {
  const dayDate = new Date(`${calendarDay(submittedAt)}T00:00:00.000Z`);

  return prisma.$transaction(async (tx) => {
    await tx.participation.create({
      data: {
        surveyId,
        respondentId,
        participatedDay: dayDate,
      },
    });

    return tx.response.create({
      data: {
        surveyId,
        mode: 'IDENTIFIED',
        respondentId,
        submittedDay: dayDate,
        submittedAt,
        answers:
          answers.length > 0
            ? {
                create: answers.map((ans) => ({
                  questionId: ans.questionId,
                  ratingValue: ans.ratingValue ?? null,
                  selections: ans.optionId
                    ? {
                        create: [{ optionId: ans.optionId }],
                      }
                    : undefined,
                })),
              }
            : undefined,
      },
      include: {
        answers: {
          include: {
            selections: true,
          },
        },
      },
    });
  });
}

async function createResponseRowImpl(
  surveyId: string,
  overrides: {
    respondentId?: string | null;
    mode?: 'IDENTIFIED' | 'ANONYMOUS';
    submittedDay?: Date;
    submittedAt?: Date | null;
  } = {}
) {
  const mode = overrides.mode ?? 'IDENTIFIED';
  const now = new Date();
  return prisma.response.create({
    data: {
      surveyId,
      mode,
      respondentId: mode === 'IDENTIFIED' ? (overrides.respondentId ?? null) : null,
      submittedDay: overrides.submittedDay ?? now,
      submittedAt:
        mode === 'IDENTIFIED'
          ? overrides.submittedAt !== undefined
            ? overrides.submittedAt
            : now
          : null,
    },
  });
}

export function createResponse(
  surveyId: string,
  respondentId: string,
  answers?: FactoryAnswerInput[],
  submittedAt?: Date
): ReturnType<typeof createResponseWithAnswersImpl>;
export function createResponse(
  surveyId: string,
  overrides?: {
    respondentId?: string | null;
    mode?: 'IDENTIFIED' | 'ANONYMOUS';
    submittedDay?: Date;
    submittedAt?: Date | null;
  }
): ReturnType<typeof createResponseRowImpl>;
export function createResponse(
  surveyId: string,
  respondentIdOrOverrides: any = {},
  answers: FactoryAnswerInput[] = [],
  submittedAt: Date = new Date()
) {
  if (typeof respondentIdOrOverrides === 'string') {
    return createResponseWithAnswersImpl(
      surveyId,
      respondentIdOrOverrides,
      answers,
      submittedAt
    );
  }
  return createResponseRowImpl(surveyId, respondentIdOrOverrides);
}


