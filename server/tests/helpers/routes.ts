export interface RouteSpec {
  id: number;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  allowedRoles: Array<'RESPONDENT' | 'SURVEY_OWNER' | 'ADMIN'>;
  description: string;
}

export const PROTECTED_ROUTES: RouteSpec[] = [
  {
    id: 1,
    method: 'POST',
    path: '/api/v1/auth/logout',
    allowedRoles: ['RESPONDENT', 'SURVEY_OWNER', 'ADMIN'],
    description: 'Revoke token and log out',
  },
  {
    id: 2,
    method: 'GET',
    path: '/api/v1/auth/me',
    allowedRoles: ['RESPONDENT', 'SURVEY_OWNER', 'ADMIN'],
    description: 'Current user profile',
  },
  {
    id: 3,
    method: 'POST',
    path: '/api/v1/surveys',
    allowedRoles: ['SURVEY_OWNER'],
    description: 'Create draft survey',
  },
  {
    id: 4,
    method: 'GET',
    path: '/api/v1/surveys',
    allowedRoles: ['SURVEY_OWNER'],
    description: 'List owner surveys',
  },
  {
    id: 5,
    method: 'GET',
    path: '/api/v1/surveys/:id',
    allowedRoles: ['SURVEY_OWNER'],
    description: 'Get owner survey detail',
  },
  {
    id: 6,
    method: 'POST',
    path: '/api/v1/surveys/:id/publish',
    allowedRoles: ['SURVEY_OWNER'],
    description: 'Publish survey',
  },
  {
    id: 7,
    method: 'POST',
    path: '/api/v1/surveys/:id/close',
    allowedRoles: ['SURVEY_OWNER'],
    description: 'Close survey',
  },
  {
    id: 8,
    method: 'GET',
    path: '/api/v1/surveys/:id/summary',
    allowedRoles: ['SURVEY_OWNER'],
    description: 'View survey summary aggregates',
  },
  {
    id: 9,
    method: 'GET',
    path: '/api/v1/available-surveys',
    allowedRoles: ['RESPONDENT'],
    description: 'List available open surveys for respondent',
  },
  {
    id: 10,
    method: 'GET',
    path: '/api/v1/available-surveys/:id',
    allowedRoles: ['RESPONDENT'],
    description: 'Get survey form for submission',
  },
  {
    id: 11,
    method: 'POST',
    path: '/api/v1/surveys/:id/responses',
    allowedRoles: ['RESPONDENT'],
    description: 'Submit responses to survey',
  },
  {
    id: 12,
    method: 'GET',
    path: '/api/v1/my-responses',
    allowedRoles: ['RESPONDENT'],
    description: 'List respondent own response history',
  },
  {
    id: 13,
    method: 'GET',
    path: '/api/v1/surveys/:id/my-response',
    allowedRoles: ['RESPONDENT'],
    description: 'View own submitted response for survey',
  },
  {
    id: 14,
    method: 'GET',
    path: '/api/v1/responses/:responseId',
    allowedRoles: ['RESPONDENT'],
    description: 'Get specific response by id',
  },
];

export const PUBLIC_ROUTES = [
  { method: 'POST', path: '/api/v1/auth/login' },
  { method: 'GET', path: '/api/v1/health' },
  { method: 'GET', path: '/api/health' },
];

