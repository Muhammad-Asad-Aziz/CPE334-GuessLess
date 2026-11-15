import type { SurveyStatus } from './surveyLifecycle';

export interface SurveyWithCloseAt {
  status: SurveyStatus;
  closeAt: Date | null;
}

/**
 * Computes effective survey status at `now`: CLOSED if stored status is CLOSED or closeAt <= now.
 */
export function effectiveStatus(
  survey: SurveyWithCloseAt,
  now: Date = new Date()
): SurveyStatus {
  if (survey.status === 'CLOSED') {
    return 'CLOSED';
  }
  if (survey.closeAt !== null && survey.closeAt.getTime() <= now.getTime()) {
    return 'CLOSED';
  }
  return survey.status;
}
