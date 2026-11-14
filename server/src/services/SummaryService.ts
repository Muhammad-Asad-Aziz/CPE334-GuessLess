import { SurveyStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { effectiveStatus } from '../domain/effectiveStatus';
import {
  buildSummary,
  type RatingBucket,
  type SummaryQuestionInput,
  type SummaryQuestionResult,
} from '../domain/summaryMath';
import { NotFoundError, SurveyNotPublishedError } from '../errors';

export interface SurveySummaryDto {
  surveyId: string;
  title: string;
  status: SurveyStatus;
  totalResponses: number;
  suppressed: boolean;
  suppressionReason: string | null;
  questions: SummaryQuestionResult[];
}

const VALID_RATING_BUCKETS = new Set<string>(['1', '2', '3', '4', '5']);

async function fetchChoiceAnswerCounts(questionIds: string[]) {
  if (questionIds.length === 0) return [];
  return prisma.answer.groupBy({
    by: ['questionId'],
    where: { questionId: { in: questionIds } },
    _count: { _all: true },
  });
}

async function fetchChoiceOptionCounts(optionIds: string[]) {
  if (optionIds.length === 0) return [];
  return prisma.answerSelection.groupBy({
    by: ['optionId'],
    where: { optionId: { in: optionIds } },
    _count: { _all: true },
  });
}

async function fetchRatingAggregates(questionIds: string[]) {
  if (questionIds.length === 0) return [];
  return prisma.answer.groupBy({
    by: ['questionId', 'ratingValue'],
    where: {
      questionId: { in: questionIds },
      ratingValue: { not: null },
    },
    _count: { _all: true },
    _sum: { ratingValue: true },
  });
}

export class SummaryService {
  /**
   * Computes aggregate summary results for an owner's published or closed survey using SQL aggregates.
   */
  static async getSummary(ownerId: string, surveyId: string): Promise<SurveySummaryDto> {
    const survey = await prisma.survey.findFirst({
      where: { id: surveyId, ownerId },
      select: {
        id: true,
        title: true,
        status: true,
        closeAt: true,
        questions: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            text: true,
            type: true,
            options: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                position: true,
                text: true,
              },
            },
          },
        },
      },
    });

    if (!survey) {
      throw new NotFoundError('Survey not found.');
    }

    if (survey.status === 'DRAFT') {
      throw new SurveyNotPublishedError('Survey has not been published.');
    }

    const status = effectiveStatus(survey, new Date());

    const summaryQuestions: SummaryQuestionInput[] = [];
    const choiceQuestionIds: string[] = [];
    const choiceOptionIds: string[] = [];
    const optionToQuestionId = new Map<string, string>();
    const ratingQuestionIds: string[] = [];

    for (const q of survey.questions) {
      if (q.type === 'SINGLE_CHOICE') {
        choiceQuestionIds.push(q.id);
        for (const opt of q.options) {
          choiceOptionIds.push(opt.id);
          optionToQuestionId.set(opt.id, q.id);
        }
        summaryQuestions.push({
          id: q.id,
          position: q.position,
          text: q.text,
          type: 'SINGLE_CHOICE',
          options: q.options,
        });
      } else if (q.type === 'RATING') {
        ratingQuestionIds.push(q.id);
        summaryQuestions.push({
          id: q.id,
          position: q.position,
          text: q.text,
          type: 'RATING',
        });
      }
    }

    const [totalResponses, choiceAnswerCounts, choiceOptionCounts, ratingGroups] =
      await Promise.all([
        prisma.response.count({
          where: { surveyId: survey.id },
        }),
        fetchChoiceAnswerCounts(choiceQuestionIds),
        fetchChoiceOptionCounts(choiceOptionIds),
        fetchRatingAggregates(ratingQuestionIds),
      ]);

    const choiceByQuestionId: Record<
      string,
      { answered: number; optionCounts: Record<string, number> }
    > = {};
    for (const qId of choiceQuestionIds) {
      choiceByQuestionId[qId] = { answered: 0, optionCounts: {} };
    }
    for (const row of choiceAnswerCounts) {
      if (choiceByQuestionId[row.questionId]) {
        choiceByQuestionId[row.questionId].answered = row._count._all;
      }
    }
    for (const row of choiceOptionCounts) {
      const qId = optionToQuestionId.get(row.optionId);
      if (qId && choiceByQuestionId[qId]) {
        choiceByQuestionId[qId].optionCounts[row.optionId] = row._count._all;
      }
    }

    const ratingByQuestionId: Record<
      string,
      { answered: number; sum: number; distribution: Partial<Record<RatingBucket, number>> }
    > = {};
    for (const qId of ratingQuestionIds) {
      ratingByQuestionId[qId] = { answered: 0, sum: 0, distribution: {} };
    }
    for (const row of ratingGroups) {
      if (row.ratingValue === null) continue;
      const bucketStr = String(row.ratingValue);
      if (!VALID_RATING_BUCKETS.has(bucketStr)) continue;
      const bucket = bucketStr as RatingBucket;
      const entry = ratingByQuestionId[row.questionId];
      if (!entry) continue;
      entry.answered += row._count._all;
      entry.sum += row._sum.ratingValue ?? row.ratingValue * row._count._all;
      entry.distribution[bucket] = (entry.distribution[bucket] ?? 0) + row._count._all;
    }

    const computed = buildSummary(summaryQuestions, {
      totalResponses,
      choiceByQuestionId,
      ratingByQuestionId,
    });

    return {
      surveyId: survey.id,
      title: survey.title,
      status,
      totalResponses: computed.totalResponses,
      suppressed: false,
      suppressionReason: null,
      questions: computed.questions,
    };
  }
}
