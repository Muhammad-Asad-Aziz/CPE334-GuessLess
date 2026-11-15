import { PrismaClient, Role, SurveyStatus, ResponseMode, Eligibility, QuestionType } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { calendarDay } from '../src/domain/calendarDay';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const BENCHMARK_SURVEY_TITLE = 'Benchmark: NFR-01 1000-Response Survey';
export const BENCHMARK_OWNER_EMAIL = 'bench-owner@example.edu';
export const ANSWERED_COUNT = 1000;
export const UNANSWERED_COUNT = 55;

function normalizeDbTarget(urlStr: string): string {
  const parsed = new URL(urlStr);
  return `${parsed.protocol}//${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname}`;
}

export function resolveTestDatabaseUrl(): string {
  const testDbUrl = process.env.TEST_DATABASE_URL?.trim();
  const devDbUrl = process.env.DATABASE_URL?.trim();

  if (!testDbUrl) {
    throw new Error('TEST_DATABASE_URL is required and must point to the isolated test database.');
  }

  if (devDbUrl && (testDbUrl === devDbUrl || normalizeDbTarget(testDbUrl) === normalizeDbTarget(devDbUrl))) {
    throw new Error(
      'Safety abort: TEST_DATABASE_URL must NOT match DATABASE_URL (benchmark seeding must never target the dev database).'
    );
  }

  return testDbUrl;
}

export function answeredEmail(index: number): string {
  return `bench-resp-${String(index).padStart(4, '0')}@example.edu`;
}

export function unansweredEmail(index: number): string {
  return `bench-unanswered-${String(index).padStart(4, '0')}@example.edu`;
}

async function truncateTestDatabase(prisma: PrismaClient) {
  const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations';
  `;

  const tables = tablenames.map(({ tablename }) => `"${tablename}"`).join(', ');
  if (tables.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
  }
}

async function insertInChunks<T>(
  items: T[],
  chunkSize: number,
  insertFn: (chunk: T[]) => Promise<unknown>
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    await insertFn(items.slice(i, i + chunkSize));
  }
}

export async function seedBenchmark() {
  const testDbUrl = resolveTestDatabaseUrl();
  const seedPassword = process.env.SEED_PASSWORD || 'change-me-seed-password';
  const bcryptCost = 4; // Test profile cost; hashed ONCE and shared across all 1,055+1 accounts

  const prisma = new PrismaClient({
    datasources: {
      db: { url: testDbUrl },
    },
  });

  try {
    console.log('Seeding NFR-01 benchmark dataset into TEST_DATABASE_URL...');
    const startedAt = Date.now();

    await truncateTestDatabase(prisma);

    // Compute ONE bcrypt hash from SEED_PASSWORD and share across all benchmark accounts
    const sharedPasswordHash = await bcrypt.hash(seedPassword, bcryptCost);

    const ownerId = crypto.randomUUID();
    const answeredUsers = Array.from({ length: ANSWERED_COUNT }, (_, idx) => ({
      id: crypto.randomUUID(),
      email: answeredEmail(idx + 1),
      displayName: `Benchmark Respondent ${idx + 1}`,
      passwordHash: sharedPasswordHash,
      role: Role.RESPONDENT,
      isActive: true,
    }));

    const unansweredUsers = Array.from({ length: UNANSWERED_COUNT }, (_, idx) => ({
      id: crypto.randomUUID(),
      email: unansweredEmail(idx + 1),
      displayName: `Benchmark Unanswered ${idx + 1}`,
      passwordHash: sharedPasswordHash,
      role: Role.RESPONDENT,
      isActive: true,
    }));

    const allUsers = [
      {
        id: ownerId,
        email: BENCHMARK_OWNER_EMAIL,
        displayName: 'Benchmark Owner',
        passwordHash: sharedPasswordHash,
        role: Role.SURVEY_OWNER,
        isActive: true,
      },
      ...answeredUsers,
      ...unansweredUsers,
    ];

    await insertInChunks(allUsers, 500, (chunk) =>
      prisma.user.createMany({ data: chunk })
    );

    const now = new Date();
    const survey = await prisma.survey.create({
      data: {
        ownerId,
        title: BENCHMARK_SURVEY_TITLE,
        description: 'Synthetic 10-question identified survey with 1,000 responses for NFR-01.',
        mode: ResponseMode.IDENTIFIED,
        status: SurveyStatus.PUBLISHED,
        eligibility: Eligibility.ALL,
        publishedAt: now,
        questions: {
          create: [
            // 5 SINGLE_CHOICE questions
            ...Array.from({ length: 5 }, (_, idx) => ({
              position: idx + 1,
              type: QuestionType.SINGLE_CHOICE,
              text: `Benchmark Single-Choice Question ${idx + 1}`,
              required: true,
              options: {
                create: [
                  { position: 1, text: `Q${idx + 1} Option A` },
                  { position: 2, text: `Q${idx + 1} Option B` },
                  { position: 3, text: `Q${idx + 1} Option C` },
                ],
              },
            })),
            // 5 RATING questions
            ...Array.from({ length: 5 }, (_, idx) => ({
              position: idx + 6,
              type: QuestionType.RATING,
              text: `Benchmark Rating Question ${idx + 6}`,
              required: true,
            })),
          ],
        },
      },
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

    const dayDate = new Date(`${calendarDay(now)}T00:00:00.000Z`);

    const participations: Array<{
      id: string;
      surveyId: string;
      respondentId: string;
      participatedDay: Date;
    }> = [];

    const responses: Array<{
      id: string;
      surveyId: string;
      mode: ResponseMode;
      respondentId: string;
      submittedDay: Date;
      submittedAt: Date;
    }> = [];

    const answers: Array<{
      id: string;
      responseId: string;
      questionId: string;
      ratingValue: number | null;
      textValue: string | null;
    }> = [];

    const selections: Array<{
      answerId: string;
      optionId: string;
    }> = [];

    for (let rIdx = 0; rIdx < answeredUsers.length; rIdx++) {
      const respondent = answeredUsers[rIdx];
      const responseId = crypto.randomUUID();
      const submittedAt = new Date(now.getTime() - (ANSWERED_COUNT - rIdx) * 1000);

      participations.push({
        id: crypto.randomUUID(),
        surveyId: survey.id,
        respondentId: respondent.id,
        participatedDay: dayDate,
      });

      responses.push({
        id: responseId,
        surveyId: survey.id,
        mode: ResponseMode.IDENTIFIED,
        respondentId: respondent.id,
        submittedDay: dayDate,
        submittedAt,
      });

      for (let qIdx = 0; qIdx < survey.questions.length; qIdx++) {
        const question = survey.questions[qIdx];
        const answerId = crypto.randomUUID();

        if (question.type === QuestionType.SINGLE_CHOICE) {
          const option = question.options[(rIdx + qIdx) % question.options.length];
          answers.push({
            id: answerId,
            responseId,
            questionId: question.id,
            ratingValue: null,
            textValue: null,
          });
          selections.push({
            answerId,
            optionId: option.id,
          });
        } else {
          const ratingValue = ((rIdx + qIdx) % 5) + 1;
          answers.push({
            id: answerId,
            responseId,
            questionId: question.id,
            ratingValue,
            textValue: null,
          });
        }
      }
    }

    await insertInChunks(participations, 1000, (chunk) =>
      prisma.participation.createMany({ data: chunk })
    );
    await insertInChunks(responses, 1000, (chunk) =>
      prisma.response.createMany({ data: chunk })
    );
    await insertInChunks(answers, 2000, (chunk) =>
      prisma.answer.createMany({ data: chunk })
    );
    await insertInChunks(selections, 2000, (chunk) =>
      prisma.answerSelection.createMany({ data: chunk })
    );

    const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2);
    console.log(
      `Benchmark seed completed in ${elapsedSec}s: 1 owner, ${ANSWERED_COUNT} answered + ${UNANSWERED_COUNT} unanswered respondents (${ANSWERED_COUNT + UNANSWERED_COUNT} respondent accounts), 1 survey (${survey.id}), 10 questions, ${responses.length} responses, ${answers.length} answers.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedBenchmark().catch((err) => {
    console.error('Benchmark seeding failed:', err);
    process.exit(1);
  });
}
