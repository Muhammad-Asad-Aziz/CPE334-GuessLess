import { Eligibility, Prisma, QuestionType, ResponseMode, SurveyStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { effectiveStatus } from '../domain/effectiveStatus';
import { canTransition, publishChecks } from '../domain/surveyLifecycle';
import {
  InvalidStateTransitionError,
  NotFoundError,
  ValidationError,
} from '../errors';
import type { CreateSurveyInput } from '../schemas/surveySchema';

export interface SurveyOptionDto {
  id: string;
  position: number;
  text: string;
}

export interface SurveyQuestionDto {
  id: string;
  position: number;
  type: QuestionType;
  text: string;
  required: boolean;
  options: SurveyOptionDto[];
}

export interface SurveyDetailDto {
  id: string;
  title: string;
  description: string;
  mode: ResponseMode;
  status: SurveyStatus;
  eligibility: Eligibility;
  createdAt: string;
  publishedAt: string | null;
  closeAt: string | null;
  closedAt: string | null;
  responseCount: number;
  questions: SurveyQuestionDto[];
}

export interface SurveyListItemDto {
  id: string;
  title: string;
  status: SurveyStatus;
  responseCount: number;
  createdAt: string;
  publishedAt: string | null;
  closeAt: string | null;
  closedAt: string | null;
}

export interface SurveyListResult {
  data: SurveyListItemDto[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
  };
}

const surveyDetailInclude = {
  questions: {
    orderBy: { position: 'asc' as const },
    include: {
      options: {
        orderBy: { position: 'asc' as const },
      },
    },
  },
} satisfies Prisma.SurveyInclude;

type SurveyWithQuestions = Prisma.SurveyGetPayload<{
  include: typeof surveyDetailInclude;
}>;

function toSurveyDetailDto(
  survey: SurveyWithQuestions,
  responseCount: number,
  now: Date
): SurveyDetailDto {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    mode: survey.mode,
    status: effectiveStatus(survey, now),
    eligibility: survey.eligibility,
    createdAt: survey.createdAt.toISOString(),
    publishedAt: survey.publishedAt ? survey.publishedAt.toISOString() : null,
    closeAt: survey.closeAt ? survey.closeAt.toISOString() : null,
    closedAt: survey.closedAt ? survey.closedAt.toISOString() : null,
    responseCount,
    questions: survey.questions.map((question) => ({
      id: question.id,
      position: question.position,
      type: question.type,
      text: question.text,
      required: question.required,
      options: question.options.map((option) => ({
        id: option.id,
        position: option.position,
        text: option.text,
      })),
    })),
  };
}

async function loadOwnSurveyWithQuestions(
  ownerId: string,
  surveyId: string
): Promise<SurveyWithQuestions | null> {
  return prisma.survey.findFirst({
    where: { id: surveyId, ownerId },
    include: surveyDetailInclude,
  });
}

export class SurveyService {
  /**
   * Creates a new DRAFT survey with ordered questions and options in one transaction.
   */
  static async create(ownerId: string, input: CreateSurveyInput): Promise<SurveyDetailDto> {
    const created = await prisma.$transaction(async (tx) => {
      return tx.survey.create({
        data: {
          ownerId,
          title: input.title,
          description: input.description,
          mode: 'IDENTIFIED',
          status: 'DRAFT',
          eligibility: 'ALL',
          questions: {
            create: input.questions.map((question, qIndex) => ({
              position: qIndex + 1,
              type: question.type,
              text: question.text,
              required: question.required,
              options:
                question.type === 'SINGLE_CHOICE'
                  ? {
                      create: question.options.map((option, oIndex) => ({
                        position: oIndex + 1,
                        text: option.text,
                      })),
                    }
                  : undefined,
            })),
          },
        },
        include: surveyDetailInclude,
      });
    });

    return toSurveyDetailDto(created, 0, new Date());
  }

  /**
   * Lists the caller's own surveys newest-first with SQL-computed response counts.
   */
  static async list(
    ownerId: string,
    page: number,
    pageSize: number
  ): Promise<SurveyListResult> {
    const now = new Date();
    const skip = (page - 1) * pageSize;

    const [surveys, total] = await Promise.all([
      prisma.survey.findMany({
        where: { ownerId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
      }),
      prisma.survey.count({
        where: { ownerId },
      }),
    ]);

    const surveyIds = surveys.map((survey) => survey.id);
    const countsBySurvey = new Map<string, number>();

    if (surveyIds.length > 0) {
      const grouped = await prisma.response.groupBy({
        by: ['surveyId'],
        where: { surveyId: { in: surveyIds } },
        _count: { _all: true },
      });

      for (const row of grouped) {
        countsBySurvey.set(row.surveyId, row._count._all);
      }
    }

    return {
      data: surveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        status: effectiveStatus(survey, now),
        responseCount: countsBySurvey.get(survey.id) ?? 0,
        createdAt: survey.createdAt.toISOString(),
        publishedAt: survey.publishedAt ? survey.publishedAt.toISOString() : null,
        closeAt: survey.closeAt ? survey.closeAt.toISOString() : null,
        closedAt: survey.closedAt ? survey.closedAt.toISOString() : null,
      })),
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * Retrieves one survey owned by the caller with ordered questions and options.
   */
  static async getById(ownerId: string, surveyId: string): Promise<SurveyDetailDto> {
    const survey = await loadOwnSurveyWithQuestions(ownerId, surveyId);
    if (!survey) {
      throw new NotFoundError('Survey not found.');
    }

    const responseCount = await prisma.response.count({
      where: { surveyId: survey.id },
    });

    return toSurveyDetailDto(survey, responseCount, new Date());
  }

  /**
   * Publishes an own DRAFT survey after verifying all BR-04 publish checks.
   */
  static async publish(ownerId: string, surveyId: string): Promise<SurveyDetailDto> {
    const now = new Date();
    const survey = await loadOwnSurveyWithQuestions(ownerId, surveyId);
    if (!survey) {
      throw new NotFoundError('Survey not found.');
    }

    const currentStatus = effectiveStatus(survey, now);
    if (!canTransition(currentStatus, 'PUBLISHED')) {
      throw new InvalidStateTransitionError('Only draft surveys can be published.');
    }

    const failures = publishChecks(survey);
    if (failures.length > 0) {
      throw new ValidationError('The survey cannot be published yet.', failures);
    }

    const updated = await prisma.survey.updateMany({
      where: { id: surveyId, ownerId, status: 'DRAFT' },
      data: {
        status: 'PUBLISHED',
        publishedAt: now,
      },
    });

    if (updated.count === 0) {
      throw new InvalidStateTransitionError('Only draft surveys can be published.');
    }

    return this.getById(ownerId, surveyId);
  }

  /**
   * Closes an own PUBLISHED survey while preserving all stored responses.
   */
  static async close(ownerId: string, surveyId: string): Promise<SurveyDetailDto> {
    const now = new Date();
    const survey = await loadOwnSurveyWithQuestions(ownerId, surveyId);
    if (!survey) {
      throw new NotFoundError('Survey not found.');
    }

    const currentStatus = effectiveStatus(survey, now);
    if (!canTransition(currentStatus, 'CLOSED')) {
      throw new InvalidStateTransitionError('Only published surveys can be closed.');
    }

    const updated = await prisma.survey.updateMany({
      where: { id: surveyId, ownerId, status: 'PUBLISHED' },
      data: {
        status: 'CLOSED',
        closedAt: now,
      },
    });

    if (updated.count === 0) {
      throw new InvalidStateTransitionError('Only published surveys can be closed.');
    }

    return this.getById(ownerId, surveyId);
  }
}
