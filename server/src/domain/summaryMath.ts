export type RatingBucket = '1' | '2' | '3' | '4' | '5';

export interface SummaryOptionInput {
  id: string;
  position: number;
  text: string;
}

export type SummaryQuestionInput =
  | {
      id: string;
      position: number;
      text: string;
      type: 'SINGLE_CHOICE';
      options: ReadonlyArray<SummaryOptionInput>;
    }
  | {
      id: string;
      position: number;
      text: string;
      type: 'RATING';
    };

export interface ChoiceQuestionCounts {
  answered: number;
  optionCounts: Readonly<Record<string, number>>;
}

export interface RatingQuestionCounts {
  answered: number;
  sum?: number;
  distribution: Readonly<Partial<Record<RatingBucket, number>>>;
}

export interface RawSummaryCounts {
  totalResponses: number;
  choiceByQuestionId: Readonly<Record<string, ChoiceQuestionCounts>>;
  ratingByQuestionId: Readonly<Record<string, RatingQuestionCounts>>;
}

export interface SummaryOptionResult {
  optionId: string;
  text: string;
  count: number;
  percent: number | null;
}

export type SummaryQuestionResult =
  | {
      questionId: string;
      position: number;
      text: string;
      type: 'SINGLE_CHOICE';
      answered: number;
      options: SummaryOptionResult[];
    }
  | {
      questionId: string;
      position: number;
      text: string;
      type: 'RATING';
      answered: number;
      mean: number | null;
      distribution: Record<RatingBucket, number>;
    };

export interface SummaryResult {
  totalResponses: number;
  questions: SummaryQuestionResult[];
}

function roundHalfUpScaled(numerator: number, denominator: number, scale: number): number {
  const scaledNum = BigInt(numerator) * BigInt(scale);
  const den = BigInt(denominator);
  const roundedInt = (2n * scaledNum + den) / (2n * den);
  return Number(roundedInt) / scale;
}

/**
 * Builds ordered aggregate summary metrics from SQL count/sum aggregates using integer half-up rounding.
 */
export function buildSummary(
  questions: ReadonlyArray<SummaryQuestionInput>,
  counts: RawSummaryCounts
): SummaryResult {
  const orderedQuestions = [...questions].sort((a, b) => a.position - b.position);

  const mappedQuestions: SummaryQuestionResult[] = orderedQuestions.map((question) => {
    if (question.type === 'SINGLE_CHOICE') {
      const raw = counts.choiceByQuestionId[question.id] ?? { answered: 0, optionCounts: {} };
      const orderedOptions = [...question.options].sort((a, b) => a.position - b.position);
      const options: SummaryOptionResult[] = orderedOptions.map((opt) => {
        const count = raw.optionCounts[opt.id] ?? 0;
        const percent =
          raw.answered === 0 ? null : roundHalfUpScaled(count * 100, raw.answered, 10);
        return {
          optionId: opt.id,
          text: opt.text,
          count,
          percent,
        };
      });

      return {
        questionId: question.id,
        position: question.position,
        text: question.text,
        type: 'SINGLE_CHOICE',
        answered: raw.answered,
        options,
      };
    }

    const raw = counts.ratingByQuestionId[question.id] ?? {
      answered: 0,
      sum: 0,
      distribution: {},
    };
    const distribution: Record<RatingBucket, number> = {
      '1': raw.distribution['1'] ?? 0,
      '2': raw.distribution['2'] ?? 0,
      '3': raw.distribution['3'] ?? 0,
      '4': raw.distribution['4'] ?? 0,
      '5': raw.distribution['5'] ?? 0,
    };
    const sum =
      raw.sum ??
      1 * distribution['1'] +
        2 * distribution['2'] +
        3 * distribution['3'] +
        4 * distribution['4'] +
        5 * distribution['5'];
    const mean = raw.answered === 0 ? null : roundHalfUpScaled(sum, raw.answered, 100);

    return {
      questionId: question.id,
      position: question.position,
      text: question.text,
      type: 'RATING',
      answered: raw.answered,
      mean,
      distribution,
    };
  });

  return {
    totalResponses: counts.totalResponses,
    questions: mappedQuestions,
  };
}
