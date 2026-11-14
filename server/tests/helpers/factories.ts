import { prisma } from '../../src/lib/prisma';
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

export async function createResponse(
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
      submittedAt: mode === 'IDENTIFIED' ? (overrides.submittedAt !== undefined ? overrides.submittedAt : now) : null,
    },
  });
}


