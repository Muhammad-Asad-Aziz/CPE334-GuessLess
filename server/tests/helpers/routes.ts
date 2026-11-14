import { Express } from 'express';

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
  { method: 'POST', path: '/api/v1/auth/login', description: 'Log in and obtain JWT' },
  { method: 'GET', path: '/api/v1/health', description: 'System health check' },
  { method: 'GET', path: '/api/health', description: 'Root health check alias' },
];

export interface IntrospectedRoute {
  method: string;
  path: string;
}

function regexToPrefix(regex: RegExp): string {
  const src = regex.source;
  const cleaned = src
    .replace(/^\^\\?/, '')
    .replace(/\\\/\?\(\?=\\\/\|\$\)\/?.*$/, '')
    .replace(/\\\//g, '/');
  return cleaned.startsWith('/') ? cleaned : '/' + cleaned;
}

/**
 * Traverses Express router stack to extract all registered routes.
 */
export function getIntrospectedRoutes(app: Express): IntrospectedRoute[] {
  const routes: IntrospectedRoute[] = [];
  const stack = (app as any)._router?.stack;
  if (!stack) {
    return routes;
  }

  for (const layer of stack) {
    if (layer.route) {
      const p = layer.route.path;
      for (const m of Object.keys(layer.route.methods)) {
        routes.push({ method: m.toUpperCase(), path: p });
      }
    } else if (layer.name === 'router' && layer.handle?.stack) {
      const prefix = regexToPrefix(layer.regexp);
      for (const sub of layer.handle.stack) {
        if (sub.route) {
          const subPath = sub.route.path === '/' ? '' : sub.route.path;
          const fullPath = (prefix + subPath) || '/';
          for (const m of Object.keys(sub.route.methods)) {
            routes.push({ method: m.toUpperCase(), path: fullPath });
          }
        }
      }
    }
  }

  return routes;
}

/**
 * Validates that all canonical /api/v1 routes in the Express app match the documented
 * protected and public registries, and that no unregistered /api/v1 endpoints exist.
 */
export function assertRoutesComplete(app: Express) {
  const introspected = getIntrospectedRoutes(app);

  // 1. Every route in PROTECTED_ROUTES must exist in Express router
  for (const spec of PROTECTED_ROUTES) {
    const found = introspected.some(
      (r) => r.method === spec.method && r.path === spec.path
    );
    if (!found) {
      throw new Error(
        `Registered router stack is missing protected route: ${spec.method} ${spec.path}`
      );
    }
  }

  // 2. Every route in PUBLIC_ROUTES must exist in Express router
  for (const pub of PUBLIC_ROUTES) {
    const found = introspected.some(
      (r) => r.method === pub.method && r.path === pub.path
    );
    if (!found) {
      throw new Error(
        `Registered router stack is missing public route: ${pub.method} ${pub.path}`
      );
    }
  }

  // 3. Every canonical /api/v1 route in Express must be documented in either PROTECTED_ROUTES or PUBLIC_ROUTES
  const knownV1 = new Set([
    ...PROTECTED_ROUTES.map((r) => `${r.method} ${r.path}`),
    ...PUBLIC_ROUTES.filter((r) => r.path.startsWith('/api/v1')).map(
      (r) => `${r.method} ${r.path}`
    ),
  ]);

  const v1Introspected = introspected.filter((r) => r.path.startsWith('/api/v1'));
  for (const r of v1Introspected) {
    const key = `${r.method} ${r.path}`;
    if (!knownV1.has(key)) {
      throw new Error(
        `Express app has undeclared /api/v1 route not in PROTECTED_ROUTES or PUBLIC_ROUTES: ${key}`
      );
    }
  }
}
