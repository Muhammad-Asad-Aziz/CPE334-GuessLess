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

