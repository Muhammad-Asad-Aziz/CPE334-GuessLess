export interface ErrorDetail {
  field?: string;
  issue: string;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string = 'The request is not valid.', details?: ErrorDetail[]) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message: string = 'Authentication is required.') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message: string = 'Email or password is incorrect.') {
    super(401, 'INVALID_CREDENTIALS', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'You do not have permission to perform this action.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class SurveyNotOpenError extends AppError {
  constructor(message: string = 'Survey is not open for responses.') {
    super(409, 'SURVEY_NOT_OPEN', message);
  }
}

export class DuplicateResponseError extends AppError {
  constructor(message: string = 'You have already submitted a response for this survey.') {
    super(409, 'DUPLICATE_RESPONSE', message);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string = 'Invalid survey lifecycle transition.') {
    super(409, 'INVALID_STATE_TRANSITION', message);
  }
}

export class SurveyNotPublishedError extends AppError {
  constructor(message: string = 'Survey has not been published.') {
    super(409, 'SURVEY_NOT_PUBLISHED', message);
  }
}

export class SurveyLockedError extends AppError {
  constructor(message: string = 'Survey questions cannot be modified once published.') {
    super(409, 'SURVEY_LOCKED', message);
  }
}

export class RateLimitedError extends AppError {
  constructor(message: string = 'Too many requests. Please try again later.') {
    super(429, 'RATE_LIMITED', message);
  }
}

export class InternalError extends AppError {
  constructor(message: string = 'An unexpected error occurred.') {
    super(500, 'INTERNAL_ERROR', message);
  }
}

