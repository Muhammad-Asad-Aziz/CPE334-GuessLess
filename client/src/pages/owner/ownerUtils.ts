import type { ApiErrorDetail } from '../../lib/apiClient';

export type SurveyStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED';
export type ResponseMode = 'IDENTIFIED' | 'ANONYMOUS';
export type QuestionType = 'SINGLE_CHOICE' | 'RATING';

export interface SurveyListItem {
  id: string;
  title: string;
  status: SurveyStatus;
  responseCount: number;
  createdAt: string;
  publishedAt: string | null;
  closeAt: string | null;
  closedAt: string | null;
}

export interface SurveyOptionDetail {
  id: string;
  position: number;
  text: string;
}

export interface SurveyQuestionDetail {
  id: string;
  position: number;
  type: QuestionType;
  text: string;
  required: boolean;
  options: SurveyOptionDetail[];
}

export interface SurveyDetail {
  id: string;
  title: string;
  description: string;
  mode: ResponseMode;
  status: SurveyStatus;
  eligibility: 'ALL' | 'SELECTED';
  createdAt: string;
  publishedAt: string | null;
  closeAt: string | null;
  closedAt: string | null;
  responseCount: number;
  questions: SurveyQuestionDetail[];
}

export interface SummaryOptionItem {
  optionId: string;
  text: string;
  count: number;
  percent: number | null;
}

export type SummaryQuestionItem =
  | {
      questionId: string;
      position: number;
      text: string;
      type: 'SINGLE_CHOICE';
      answered: number;
      options: SummaryOptionItem[];
    }
  | {
      questionId: string;
      position: number;
      text: string;
      type: 'RATING';
      answered: number;
      mean: number | null;
      distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
    };

export interface SurveySummaryData {
  surveyId: string;
  title: string;
  status: SurveyStatus;
  totalResponses: number;
  suppressed: boolean;
  suppressionReason: string | null;
  questions: SummaryQuestionItem[];
}

export const IDENTIFIED_MODE_NOTICE =
  'Identified — respondents are told that their answers are linked to their name.';

export function displaySurveyTitle(title: string): string {
  return title.trim().length > 0 ? title : 'Untitled survey';
}

const BANGKOK_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Bangkok',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatBangkokDateTime(isoString: string | null | undefined): string {
  if (!isoString) {
    return '—';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  const parts = BANGKOK_FORMATTER.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}`;
}

export const STATUS_BADGE_STYLES: Record<
  SurveyStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'Draft',
    className: 'bg-amber-50 text-amber-800 border border-amber-200',
  },
  PUBLISHED: {
    label: 'Published',
    className: 'bg-[#EAF6EF] text-[#006B3C] border border-[#B7DFC7]',
  },
  CLOSED: {
    label: 'Closed',
    className: 'bg-gray-100 text-gray-700 border border-gray-300',
  },
};

export function normalizeFieldPath(field?: string): string {
  if (!field) {
    return '_form';
  }
  return field.replace(/\[(\d+)\]/g, '.$1');
}

export function mapDetailsToFieldErrors(
  details?: ApiErrorDetail[]
): Record<string, string> {
  const mapped: Record<string, string> = {};
  if (!details) {
    return mapped;
  }
  for (const item of details) {
    const key = normalizeFieldPath(item.field);
    if (!mapped[key]) {
      mapped[key] = item.issue;
    }
  }
  return mapped;
}
