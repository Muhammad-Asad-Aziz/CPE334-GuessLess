import { prisma } from '../lib/prisma';
import {
  NotFoundError,
  SurveyNotOpenError,
  DuplicateResponseError,
  ValidationError,
  mapPrismaError,
} from '../errors';
import { effectiveStatus } from '../domain/effectiveStatus';
import { calendarDay } from '../domain/calendarDay';
import { validateAnswers, AnswerItemInput } from '../domain/validateAnswers';

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export class ResponseService {
  /**
   * FR-08: Browse available surveys for respondent.
   * Returns stored status PUBLISHED, closeAt null or > now, eligibility ALL,
   * ordered newest published first, paginated, with alreadyResponded flag.
   */
  async browseAvailable(respondentId: string, { page = 1, pageSize = 20 }: PaginationParams = {}) {
    const now = new Date();
    const where = {
      status: 'PUBLISHED' as const,
      eligibility: 'ALL' as const,
      OR: [{ closeAt: null }, { closeAt: { gt: now } }],
    };

    const [total, surveys] = await Promise.all([
      prisma.survey.count({ where }),
      prisma.survey.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { questions: true },
          },
        },
      }),
    ]);

    // Check which surveys respondent has already participated in
    const surveyIds = surveys.map((s) => s.id);
    const participations = await prisma.participation.findMany({
      where: {
        respondentId,
        surveyId: { in: surveyIds },
      },
      select: { surveyId: true },
    });
    const participatedSurveyIds = new Set(participations.map((p) => p.surveyId));

    const data = surveys.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      mode: s.mode,
      questionCount: s._count.questions,
      closeAt: s.closeAt,
      alreadyResponded: participatedSurveyIds.has(s.id),
    }));

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * FR-03, FR-08: Get survey form for taking survey.
   * Questions and options in position order.
   * DRAFT or missing -> 404; effectively CLOSED -> 409 SURVEY_NOT_OPEN.
   */
  async getSurveyForm(surveyId: string, respondentId: string) {
    const survey = await prisma.survey.findUnique({
      where: { id: surveyId },
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

    if (!survey || survey.status === 'DRAFT') {
      throw new NotFoundError('Survey not found.');
    }

    const now = new Date();
    if (effectiveStatus(survey, now) === 'CLOSED') {
      throw new SurveyNotOpenError('Survey is not open for responses.');
    }

    const participation = await prisma.participation.findUnique({
      where: {
        surveyId_respondentId: {
          surveyId,
          respondentId,
        },
      },
    });

    return {
      data: {
        id: survey.id,
        title: survey.title,
        description: survey.description,
        mode: survey.mode,
        alreadyResponded: Boolean(participation),
        questions: survey.questions.map((q) => ({
          id: q.id,
          position: q.position,
          type: q.type,
          text: q.text,
          required: q.required,
          options: q.options.map((o) => ({
            id: o.id,
            position: o.position,
            text: o.text,
          })),
        })),
      },
    };
  }

  /**
   * FR-03: Submit response inside ONE Prisma transaction.
   * Checks: DRAFT -> 404, effective CLOSED -> 409, existing participation -> 409,
   * validateAnswers -> 400.
   * Inserts: Participation -> Response -> Answers -> AnswerSelections.
   * Optional testAnswerWriter allows injecting simulated mid-transaction failure for rollback testing.
   */
  async submitResponse(
    surveyId: string,
    respondentId: string,
    payload: { answers: AnswerItemInput[] },
    testAnswerWriter?: (tx: any, responseId: string) => Promise<void>
  ) {
    return prisma.$transaction(async (tx) => {
      // 1. Read survey with questions and options
      const survey = await tx.survey.findUnique({
        where: { id: surveyId },
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

      if (!survey || survey.status === 'DRAFT') {
        throw new NotFoundError('Survey not found.');
      }

      const now = new Date();

      // 2. Check effective status
      if (effectiveStatus(survey, now) === 'CLOSED') {
        throw new SurveyNotOpenError('Survey is not open for responses.');
      }

      // 3. Check existing participation record
      const existing = await tx.participation.findUnique({
        where: {
          surveyId_respondentId: {
            surveyId,
            respondentId,
          },
        },
      });
      if (existing) {
        throw new DuplicateResponseError('You have already submitted a response for this survey.');
      }

      // 4. Validate answers (BR-06)
      const validation = validateAnswers(survey, payload.answers);
      if (!validation.isValid) {
        throw new ValidationError('The response is not valid.', validation.errors);
      }

      // 5. Insert Participation with Bangkok calendar day
      const bangkokDayStr = calendarDay(now);
      const bangkokDate = new Date(`${bangkokDayStr}T00:00:00.000Z`);

      try {
        await tx.participation.create({
          data: {
            surveyId,
            respondentId,
            participatedDay: bangkokDate,
          },
        });
      } catch (err: any) {
        throw mapPrismaError(err);
      }

      // 6. Insert Response
      const response = await tx.response.create({
        data: {
          surveyId,
          mode: 'IDENTIFIED',
          respondentId,
          submittedAt: now,
          submittedDay: bangkokDate,
        },
      });

      // 7. Write answers and selections (or invoke injected test hook)
      if (testAnswerWriter) {
        await testAnswerWriter(tx, response.id);
      } else {
        for (const ans of payload.answers) {
          const question = survey.questions.find((q) => q.id === ans.questionId);
          if (!question) continue;

          if (question.type === 'SINGLE_CHOICE') {
            const answerRow = await tx.answer.create({
              data: {
                responseId: response.id,
                questionId: ans.questionId,
              },
            });

            if (ans.optionIds && ans.optionIds.length > 0) {
              for (const optId of ans.optionIds) {
                await tx.answerSelection.create({
                  data: {
                    answerId: answerRow.id,
                    optionId: optId,
                  },
                });
              }
            }
          } else if (question.type === 'RATING') {
            await tx.answer.create({
              data: {
                responseId: response.id,
                questionId: ans.questionId,
                ratingValue: ans.rating,
              },
            });
          }
        }
      }

      return {
        responseId: response.id,
        surveyId: survey.id,
        submittedAt: response.submittedAt,
      };
    });
  }

  /**
   * FR-09: List respondent's own responses, including closed surveys.
   * Scoped strictly by respondentId = caller.
   */
  async listMyResponses(respondentId: string, { page = 1, pageSize = 20 }: PaginationParams = {}) {
    const where = { respondentId };

    const [total, participations] = await Promise.all([
      prisma.participation.count({ where }),
      prisma.participation.findMany({
        where,
        orderBy: { participatedDay: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          survey: true,
        },
      }),
    ]);

    const surveyIds = participations.map((p) => p.surveyId);
    const responses = await prisma.response.findMany({
      where: {
        respondentId,
        surveyId: { in: surveyIds },
      },
      select: {
        id: true,
        surveyId: true,
        submittedAt: true,
      },
    });
    const responseMap = new Map(responses.map((r) => [r.surveyId, r]));

    const now = new Date();
    const data = participations.map((p) => {
      const resp = responseMap.get(p.surveyId);
      return {
        surveyId: p.surveyId,
        title: p.survey.title,
        mode: p.survey.mode,
        status: effectiveStatus(p.survey, now),
        participatedDay: calendarDay(p.participatedDay),
        responseId: resp?.id,
        submittedAt: resp?.submittedAt ?? null,
      };
    });

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
      },
    };
  }

  /**
   * FR-09: Get own response by surveyId.
   * Scoped strictly by respondentId = caller.
   */
  async getMyResponse(surveyId: string, respondentId: string) {
    const response = await prisma.response.findUnique({
      where: {
        surveyId_respondentId: {
          surveyId,
          respondentId,
        },
      },
      include: {
        survey: {
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
        },
        answers: {
          include: {
            selections: {
              include: {
                option: true,
              },
            },
          },
        },
      },
    });

    if (!response) {
      throw new NotFoundError('Submission not found.');
    }

    return this.formatSubmissionDetail(response);
  }

  /**
   * FR-09: Get own response by responseId.
   * Scoped strictly by respondentId = caller.
   */
  async getResponseById(responseId: string, respondentId: string) {
    const response = await prisma.response.findUnique({
      where: { id: responseId },
      include: {
        survey: {
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
        },
        answers: {
          include: {
            selections: {
              include: {
                option: true,
              },
            },
          },
        },
      },
    });

    if (!response || response.respondentId !== respondentId) {
      throw new NotFoundError('Submission not found.');
    }

    return this.formatSubmissionDetail(response);
  }

  private formatSubmissionDetail(response: any) {
    const answerMap = new Map(response.answers.map((a: any) => [a.questionId, a]));

    const formattedAnswers = response.survey.questions.map((q: any) => {
      const ans = answerMap.get(q.id) as any;
      const selectedOptions =
        ans?.selections?.map((s: any) => ({
          id: s.option.id,
          text: s.option.text,
        })) ?? [];

      return {
        questionId: q.id,
        position: q.position,
        text: q.text,
        type: q.type,
        selectedOptions,
        rating: ans?.ratingValue ?? null,
      };
    });

    return {
      data: {
        responseId: response.id,
        surveyId: response.surveyId,
        title: response.survey.title,
        mode: response.mode,
        submittedAt: response.submittedAt,
        answers: formattedAnswers,
      },
    };
  }
}

export const responseService = new ResponseService();
