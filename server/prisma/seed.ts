import { PrismaClient, Role, SurveyStatus, ResponseMode, Eligibility, QuestionType } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

export async function seed() {
  const seedPassword = process.env.SEED_PASSWORD || 'change-me-seed-password';
  const bcryptCost = parseInt(process.env.BCRYPT_COST || '12', 10);
  const passwordHash = await bcrypt.hash(seedPassword, bcryptCost);

  console.log('Seeding database with initial users and surveys...');

  // 1. Seed Accounts
  const usersData = [
    { email: 'owner1@example.edu', displayName: 'Owner One', role: Role.SURVEY_OWNER },
    { email: 'owner2@example.edu', displayName: 'Owner Two', role: Role.SURVEY_OWNER },
    { email: 'resp1@example.edu', displayName: 'Respondent One', role: Role.RESPONDENT },
    { email: 'resp2@example.edu', displayName: 'Respondent Two', role: Role.RESPONDENT },
    { email: 'resp3@example.edu', displayName: 'Respondent Three', role: Role.RESPONDENT },
    { email: 'admin1@example.edu', displayName: 'Admin One', role: Role.ADMIN },
  ];

  const userMap: Record<string, string> = {};

  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        displayName: u.displayName,
        passwordHash,
        role: u.role,
        isActive: true,
      },
      create: {
        email: u.email,
        displayName: u.displayName,
        passwordHash,
        role: u.role,
        isActive: true,
      },
    });
    userMap[u.email] = user.id;
    console.log(`Seeded user: ${u.email} (${u.role}) -> ${user.id}`);
  }

  const owner1Id = userMap['owner1@example.edu'];

  // Helper to safely delete an existing survey and its cascade/restrict relations
  const cleanSurvey = async (surveyId: string) => {
    // Delete answer selections and answers for responses of this survey
    const responses = await prisma.response.findMany({ where: { surveyId }, select: { id: true } });
    const responseIds = responses.map((r) => r.id);
    if (responseIds.length > 0) {
      await prisma.answerSelection.deleteMany({
        where: { answer: { responseId: { in: responseIds } } },
      });
      await prisma.answer.deleteMany({
        where: { responseId: { in: responseIds } },
      });
      await prisma.response.deleteMany({
        where: { id: { in: responseIds } },
      });
    }
    await prisma.participation.deleteMany({ where: { surveyId } });
    await prisma.surveyEligibility.deleteMany({ where: { surveyId } });
    await prisma.survey.delete({ where: { id: surveyId } });
  };

  // 2. Seed Survey S-PUB (PUBLISHED)
  const existingSPub = await prisma.survey.findFirst({
    where: { ownerId: owner1Id, title: 'Seed: CPE334 Course Evaluation' },
  });

  if (existingSPub) {
    await cleanSurvey(existingSPub.id);
  }

  const sPub = await prisma.survey.create({
    data: {
      ownerId: owner1Id,
      title: 'Seed: CPE334 Course Evaluation',
      description: 'Official course evaluation survey for CPE334.',
      mode: ResponseMode.IDENTIFIED,
      status: SurveyStatus.PUBLISHED,
      eligibility: Eligibility.ALL,
      publishedAt: new Date(),
      questions: {
        create: [
          {
            position: 1,
            type: QuestionType.SINGLE_CHOICE,
            text: 'How was the lab workload?',
            required: true,
            options: {
              create: [
                { position: 1, text: 'Too light' },
                { position: 2, text: 'About right' },
                { position: 3, text: 'Too heavy' },
              ],
            },
          },
          {
            position: 2,
            type: QuestionType.RATING,
            text: 'Rate the course overall',
            required: true,
          },
        ],
      },
    },
  });
  console.log(`Seeded survey S-PUB: ${sPub.id}`);

  // 3. Seed Survey S-DRAFT (DRAFT)
  const existingSDraft = await prisma.survey.findFirst({
    where: { ownerId: owner1Id, title: 'Seed: Workshop Feedback' },
  });

  if (existingSDraft) {
    await cleanSurvey(existingSDraft.id);
  }

  const sDraft = await prisma.survey.create({
    data: {
      ownerId: owner1Id,
      title: 'Seed: Workshop Feedback',
      description: 'Feedback for the introductory workshop.',
      mode: ResponseMode.IDENTIFIED,
      status: SurveyStatus.DRAFT,
      eligibility: Eligibility.ALL,
      publishedAt: null,
      questions: {
        create: [
          {
            position: 1,
            type: QuestionType.RATING,
            text: 'Rate the workshop',
            required: true,
          },
        ],
      },
    },
  });
  console.log(`Seeded survey S-DRAFT: ${sDraft.id}`);

  // 4. Seed Survey S-CLOSED (CLOSED)
  const existingSClosed = await prisma.survey.findFirst({
    where: { ownerId: owner1Id, title: 'Seed: Orientation Survey 2026' },
  });

  if (existingSClosed) {
    await cleanSurvey(existingSClosed.id);
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);

  const sClosed = await prisma.survey.create({
    data: {
      ownerId: owner1Id,
      title: 'Seed: Orientation Survey 2026',
      description: 'Orientation survey conducted at the start of term.',
      mode: ResponseMode.IDENTIFIED,
      status: SurveyStatus.CLOSED,
      eligibility: Eligibility.ALL,
      publishedAt: oneWeekAgo,
      closedAt: oneDayAgo,
      questions: {
        create: [
          {
            position: 1,
            type: QuestionType.SINGLE_CHOICE,
            text: 'Was orientation useful?',
            required: true,
            options: {
              create: [
                { position: 1, text: 'Yes' },
                { position: 2, text: 'No' },
              ],
            },
          },
        ],
      },
    },
  });
  console.log(`Seeded survey S-CLOSED: ${sClosed.id}`);

  console.log('Seeding completed successfully.');
}

if (require.main === module) {
  seed()
    .catch((e) => {
      console.error('Seeding failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
