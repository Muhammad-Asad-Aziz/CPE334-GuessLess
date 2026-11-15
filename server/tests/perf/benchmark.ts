import { PrismaClient } from '@prisma/client';
import { execSync, spawn, type ChildProcess } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import {
  ANSWERED_COUNT,
  BENCHMARK_OWNER_EMAIL,
  BENCHMARK_SURVEY_TITLE,
  UNANSWERED_COUNT,
  answeredEmail,
  resolveTestDatabaseUrl,
  unansweredEmail,
} from '../../prisma/seed-benchmark';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const WARMUP_REQUESTS = 5;
const TIMED_REQUESTS = 50;
const P95_THRESHOLD_MS = 300;

interface EndpointStats {
  label: string;
  p50: number;
  p95: number;
  max: number;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Could not resolve ephemeral port')));
        return;
      }
      const { port } = address;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function waitForHealth(baseUrl: string, child: ChildProcess, getLogs: () => string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Built API process exited early with code ${child.exitCode}.\nLogs:\n${getLogs()}`
      );
    }
    try {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      if (res.status === 200) {
        return;
      }
    } catch {
      // Server still starting
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/v1/health.\nLogs:\n${getLogs()}`);
}

async function login(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (res.status !== 200) {
    const body = await res.text();
    throw new Error(`Login failed for ${email}: HTTP ${res.status} ${body}`);
  }
  const json = (await res.json()) as { data?: { token?: string } };
  if (!json.data?.token) {
    throw new Error(`Login response missing token for ${email}`);
  }
  return json.data.token;
}

async function loginMany(baseUrl: string, emails: string[], password: string): Promise<string[]> {
  const tokens: string[] = [];
  const batchSize = 10;
  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const batchTokens = await Promise.all(batch.map((email) => login(baseUrl, email, password)));
    tokens.push(...batchTokens);
  }
  return tokens;
}

function nearestRankPercentile(sorted: number[], percentile: number): number {
  const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

async function measureEndpoint(
  label: string,
  warmupFn: (idx: number) => Promise<void>,
  timedFn: (idx: number) => Promise<void>
): Promise<EndpointStats> {
  for (let i = 0; i < WARMUP_REQUESTS; i++) {
    await warmupFn(i);
  }

  const durationsMs: number[] = [];
  for (let i = 0; i < TIMED_REQUESTS; i++) {
    const start = performance.now();
    await timedFn(i);
    durationsMs.push(performance.now() - start);
  }

  const sorted = [...durationsMs].sort((a, b) => a - b);
  return {
    label,
    p50: nearestRankPercentile(sorted, 50),
    p95: nearestRankPercentile(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

async function stopChildProcess(child: ChildProcess | null) {
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
      resolve();
    }, 3000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function main() {
  const testDbUrl = resolveTestDatabaseUrl();
  const seedPassword = process.env.SEED_PASSWORD || 'change-me-seed-password';
  const serverRoot = path.resolve(__dirname, '../..');
  const builtEntry = path.join(serverRoot, 'dist', 'index.js');

  if (!fs.existsSync(builtEntry)) {
    throw new Error(
      `Built server entry not found at ${builtEntry}. Run "npm run build -w server" first.`
    );
  }

  const prisma = new PrismaClient({
    datasources: {
      db: { url: testDbUrl },
    },
  });

  let child: ChildProcess | null = null;

  try {
    // Verify PostgreSQL version and benchmark dataset preconditions
    const pgVersionRows = await prisma.$queryRaw<Array<{ version: string }>>`SELECT version()`;
    const pgVersion = pgVersionRows[0]?.version ?? 'unknown';

    const owner = await prisma.user.findUnique({
      where: { email: BENCHMARK_OWNER_EMAIL },
      select: { id: true },
    });
    if (!owner) {
      throw new Error(
        `Benchmark owner (${BENCHMARK_OWNER_EMAIL}) not found in TEST_DATABASE_URL. Run "npm run seed:benchmark" first.`
      );
    }

    const survey = await prisma.survey.findFirst({
      where: { ownerId: owner.id, title: BENCHMARK_SURVEY_TITLE },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { options: { orderBy: { position: 'asc' } } },
        },
        _count: {
          select: { responses: true },
        },
      },
    });

    if (!survey || survey.questions.length !== 10 || survey._count.responses !== ANSWERED_COUNT) {
      throw new Error(
        `Benchmark survey precondition failed (found responses=${survey?._count.responses ?? 0}, questions=${survey?.questions.length ?? 0}). Run "npm run seed:benchmark" first.`
      );
    }
    const surveyId = survey.id;

    if (UNANSWERED_COUNT < WARMUP_REQUESTS + TIMED_REQUESTS) {
      throw new Error(
        `UNANSWERED_COUNT (${UNANSWERED_COUNT}) must be >= WARMUP_REQUESTS + TIMED_REQUESTS (${WARMUP_REQUESTS + TIMED_REQUESTS}).`
      );
    }

    const unansweredEmails = Array.from({ length: UNANSWERED_COUNT }, (_, i) =>
      unansweredEmail(i + 1)
    );
    const unansweredUsers = await prisma.user.findMany({
      where: { email: { in: unansweredEmails } },
      select: { id: true, email: true },
    });
    if (unansweredUsers.length !== UNANSWERED_COUNT) {
      throw new Error(
        `Expected ${UNANSWERED_COUNT} unanswered benchmark respondents, found ${unansweredUsers.length}. Run "npm run seed:benchmark" first.`
      );
    }

    const existingWarmupOrUnansweredParticipations = await prisma.participation.count({
      where: {
        surveyId: survey.id,
        respondentId: { in: unansweredUsers.map((u) => u.id) },
      },
    });
    if (existingWarmupOrUnansweredParticipations > 0) {
      throw new Error(
        'One or more unanswered benchmark respondents already have responses. Run "npm run seed:benchmark" before running "npm run test:perf".'
      );
    }

    // Use the first 5 seeded unanswered respondents for discarded warm-ups,
    // and the remaining 50 for the timed POST /responses requests.
    const warmupEmails = unansweredEmails.slice(0, WARMUP_REQUESTS);
    const timedUnansweredEmails = unansweredEmails.slice(
      WARMUP_REQUESTS,
      WARMUP_REQUESTS + TIMED_REQUESTS
    );

    const port = await getFreePort();
    const baseUrl = `http://127.0.0.1:${port}`;
    const jwtSecret =
      process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32
        ? process.env.JWT_SECRET
        : 'perf-benchmark-jwt-secret-at-least-32-chars';

    let serverLogs = '';
    child = spawn(process.execPath, [builtEntry], {
      cwd: serverRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        DATABASE_URL: testDbUrl,
        TEST_DATABASE_URL: testDbUrl,
        JWT_SECRET: jwtSecret,
        JWT_EXPIRES_MINUTES: '60',
        BCRYPT_COST: '4',
        SEED_PASSWORD: seedPassword,
        LOG_LEVEL: 'silent',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk) => {
      serverLogs += chunk.toString();
    });
    child.stderr?.on('data', (chunk) => {
      serverLogs += chunk.toString();
    });

    await waitForHealth(baseUrl, child, () => serverLogs);

    // Obtain all auth tokens BEFORE timing starts
    const answeredEmailsSlice = Array.from({ length: TIMED_REQUESTS }, (_, i) =>
      answeredEmail(i + 1)
    );
    const [ownerToken, warmupTokens, answeredTokens, unansweredTokens] = await Promise.all([
      login(baseUrl, BENCHMARK_OWNER_EMAIL, seedPassword),
      loginMany(baseUrl, warmupEmails, seedPassword),
      loginMany(baseUrl, answeredEmailsSlice, seedPassword),
      loginMany(baseUrl, timedUnansweredEmails, seedPassword),
    ]);

    const submissionPayload = JSON.stringify({
      answers: survey.questions.map((q) =>
        q.type === 'SINGLE_CHOICE'
          ? { questionId: q.id, optionIds: [q.options[0].id] }
          : { questionId: q.id, rating: 4 }
      ),
    });

    // 1. GET /api/v1/available-surveys
    const availableStats = await measureEndpoint(
      'GET /api/v1/available-surveys',
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/available-surveys`, {
          headers: { Authorization: `Bearer ${answeredTokens[i]}` },
        });
        if (res.status !== 200) {
          throw new Error(`Warm-up GET /available-surveys failed: ${res.status}`);
        }
        await res.arrayBuffer();
      },
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/available-surveys`, {
          headers: { Authorization: `Bearer ${answeredTokens[i]}` },
        });
        if (res.status !== 200) {
          throw new Error(`Timed GET /available-surveys[${i}] failed: ${res.status}`);
        }
        await res.arrayBuffer();
      }
    );

    // 2. GET /api/v1/surveys/{id}/my-response (50 answered respondents)
    const myResponseStats = await measureEndpoint(
      'GET /api/v1/surveys/{id}/my-response',
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/my-response`, {
          headers: { Authorization: `Bearer ${answeredTokens[i]}` },
        });
        if (res.status !== 200) {
          throw new Error(`Warm-up GET /my-response failed: ${res.status}`);
        }
        await res.arrayBuffer();
      },
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/my-response`, {
          headers: { Authorization: `Bearer ${answeredTokens[i]}` },
        });
        if (res.status !== 200) {
          throw new Error(`Timed GET /my-response[${i}] failed: ${res.status}`);
        }
        await res.arrayBuffer();
      }
    );

    // 3. GET /api/v1/surveys/{id}/summary (owner — measured at exact 1,000 stored responses)
    const summaryStats = await measureEndpoint(
      'GET /api/v1/surveys/{id}/summary',
      async () => {
        const res = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/summary`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        if (res.status !== 200) {
          throw new Error(`Warm-up GET /summary failed: ${res.status}`);
        }
        await res.arrayBuffer();
      },
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/summary`, {
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        if (res.status !== 200) {
          throw new Error(`Timed GET /summary[${i}] failed: ${res.status}`);
        }
        const json = (await res.json()) as { data?: { totalResponses?: number } };
        if (json.data?.totalResponses !== ANSWERED_COUNT) {
          throw new Error(
            `Expected summary totalResponses=${ANSWERED_COUNT}, got ${json.data?.totalResponses}`
          );
        }
      }
    );

    // 4. POST /api/v1/surveys/{id}/responses (5 seeded warm-up respondents, then 50 timed respondents)
    const submitStats = await measureEndpoint(
      'POST /api/v1/surveys/{id}/responses',
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${warmupTokens[i]}`,
            'Content-Type': 'application/json',
          },
          body: submissionPayload,
        });
        if (res.status !== 201) {
          throw new Error(`Warm-up POST /responses failed: ${res.status} ${await res.text()}`);
        }
        await res.arrayBuffer();
      },
      async (i) => {
        const res = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${unansweredTokens[i]}`,
            'Content-Type': 'application/json',
          },
          body: submissionPayload,
        });
        if (res.status !== 201) {
          throw new Error(
            `Timed POST /responses[${i}] failed: ${res.status} ${await res.text()}`
          );
        }
        await res.arrayBuffer();
      }
    );

    const results = [availableStats, submitStats, myResponseStats, summaryStats];

    let commitId = 'unknown';
    try {
      commitId = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    } catch {
      // Ignore if git metadata unavailable
    }

    const cpus = os.cpus();
    const cpuModel = cpus[0]?.model?.trim() || 'unknown';
    const ramGb = (os.totalmem() / (1024 ** 3)).toFixed(2);

    console.log('\n=== TEST-NFR-01 Performance Benchmark Results ===');
    console.log(`Commit:     ${commitId}`);
    console.log(`OS:         ${os.type()} ${os.release()} (${os.arch()})`);
    console.log(`CPU:        ${cpuModel} (${cpus.length} logical cores)`);
    console.log(`RAM:        ${ramGb} GiB`);
    console.log(`Node:       ${process.version}`);
    console.log(`PostgreSQL: ${pgVersion}`);
    console.log(`Dataset:    1 survey, 10 questions, ${ANSWERED_COUNT} responses (+50 timed submissions)`);
    console.log(`Warm-up:    ${WARMUP_REQUESTS} req/endpoint | Timed: ${TIMED_REQUESTS} sequential req/endpoint`);
    console.log('');
    console.log(
      `${'Endpoint'.padEnd(38)} | ${'p50 (ms)'.padStart(9)} | ${'p95 (ms)'.padStart(9)} | ${'max (ms)'.padStart(9)} | Target (<${P95_THRESHOLD_MS}ms)`
    );
    console.log('-'.repeat(88));

    let allPassed = true;
    for (const r of results) {
      const pass = r.p95 < P95_THRESHOLD_MS;
      if (!pass) allPassed = false;
      console.log(
        `${r.label.padEnd(38)} | ${r.p50.toFixed(2).padStart(9)} | ${r.p95.toFixed(2).padStart(9)} | ${r.max.toFixed(2).padStart(9)} | ${pass ? 'PASS' : 'FAIL'}`
      );
    }
    console.log('');

    if (!allPassed) {
      console.error(`FAIL: One or more endpoints had p95 >= ${P95_THRESHOLD_MS} ms.`);
      process.exitCode = 1;
    } else {
      console.log(`PASS: All endpoints achieved p95 < ${P95_THRESHOLD_MS} ms.`);
    }
  } finally {
    await stopChildProcess(child);
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
