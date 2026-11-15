import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, exec, ChildProcess } from 'child_process';
import path from 'path';
import { clearDatabase } from '../helpers/db';
import { createUser } from '../helpers/factories';

describe('TEST-NFR-07: Process-Restart Data Durability (NFR-07, SRS 5, SDS 11)', () => {
  const serverDir = path.resolve(__dirname, '../../');
  const port = 8089;
  const baseUrl = `http://127.0.0.1:${port}`;
  const testDbUrl =
    process.env.TEST_DATABASE_URL ||
    'postgresql://survey:change-me-db-password@localhost:5432/survey_test';

  let currentChild: ChildProcess | null = null;

  function killProcess(child: ChildProcess | null): Promise<void> {
    return new Promise((resolve) => {
      if (!child || !child.pid || child.killed) {
        return resolve();
      }
      if (process.platform === 'win32') {
        exec(`taskkill /pid ${child.pid} /T /F`, () => {
          resolve();
        });
      } else {
        child.kill('SIGTERM');
        resolve();
      }
    });
  }

  function startServerProcess(): Promise<ChildProcess> {
    return new Promise((resolve, reject) => {
      const cmd = process.platform === 'win32' ? 'npx.cmd tsx src/index.ts' : 'npx tsx src/index.ts';
      const child = spawn(
        cmd,
        {
          cwd: serverDir,
          env: {
            ...process.env,
            NODE_ENV: 'test',
            DATABASE_URL: testDbUrl,
            TEST_DATABASE_URL: testDbUrl,
            PORT: String(port),
            BCRYPT_COST: '4',
            LOG_LEVEL: 'silent',
          },
          stdio: 'pipe',
          shell: true,
        }
      );

      child.on('error', (err) => reject(err));

      // Poll health check endpoint until HTTP 200 is returned
      const checkInterval = 200;
      const maxAttempts = 50; // 10 seconds total
      let attempts = 0;

      const timer = setInterval(async () => {
        attempts++;
        try {
          const res = await fetch(`${baseUrl}/api/v1/health`);
          if (res.ok) {
            clearInterval(timer);
            resolve(child);
          }
        } catch {
          // not ready yet
        }

        if (attempts >= maxAttempts) {
          clearInterval(timer);
          await killProcess(child);
          reject(new Error(`Timed out waiting for child server to become healthy at ${baseUrl}`));
        }
      }, checkInterval);
    });
  }

  beforeAll(async () => {
    await clearDatabase();
    await createUser({
      email: 'owner1-restart@example.edu',
      password: 'Password123!',
      role: 'SURVEY_OWNER',
    });
    await createUser({
      email: 'resp1-restart@example.edu',
      password: 'Password123!',
      role: 'RESPONDENT',
    });
  });

  afterAll(async () => {
    if (currentChild) {
      await killProcess(currentChild);
      currentChild = null;
    }
  });

  it('preserves 100% of surveys, responses, and summaries across separate OS process restart (compared field by field)', async () => {
    // ------------------------------------------------------------------------
    // Phase 1: Start 1st Server Process & Populate Data via HTTP
    // ------------------------------------------------------------------------
    currentChild = await startServerProcess();

    // 1. Log in as owner1
    const o1LoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner1-restart@example.edu', password: 'Password123!' }),
    });
    expect(o1LoginRes.status).toBe(200);
    const o1LoginBody = await o1LoginRes.json();
    const ownerToken1 = o1LoginBody.data.token;

    // 2. Create survey with 1 choice and 1 rating question
    const createRes = await fetch(`${baseUrl}/api/v1/surveys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken1}`,
      },
      body: JSON.stringify({
        title: 'Durability Survey',
        description: 'Testing restart persistence',
        mode: 'IDENTIFIED',
        questions: [
          {
            type: 'SINGLE_CHOICE',
            text: 'Is Postgres durable?',
            required: true,
            options: [{ text: 'Definitely' }, { text: 'No' }],
          },
          {
            type: 'RATING',
            text: 'Rate persistence stability',
            required: true,
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdSurvey = (await createRes.json()).data;
    const surveyId = createdSurvey.id;
    const q1 = createdSurvey.questions[0];
    const q2 = createdSurvey.questions[1];
    const chosenOptionId = q1.options[0].id;

    // 3. Publish survey
    const publishRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken1}`,
      },
      body: JSON.stringify({}),
    });
    expect(publishRes.status).toBe(200);

    // 4. Log in as resp1
    const r1LoginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'resp1-restart@example.edu', password: 'Password123!' }),
    });
    expect(r1LoginRes.status).toBe(200);
    const r1LoginBody = await r1LoginRes.json();
    const respToken1 = r1LoginBody.data.token;

    // 5. Submit response
    const submitRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${respToken1}`,
      },
      body: JSON.stringify({
        answers: [
          { questionId: q1.id, optionIds: [chosenOptionId] },
          { questionId: q2.id, rating: 5 },
        ],
      }),
    });
    expect(submitRes.status).toBe(201);

    // 6. Read Pre-Restart Snapshots via HTTP
    const preSurveyRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}`, {
      headers: { Authorization: `Bearer ${ownerToken1}` },
    });
    expect(preSurveyRes.status).toBe(200);
    const preSurveyData = (await preSurveyRes.json()).data;

    const preSummaryRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/summary`, {
      headers: { Authorization: `Bearer ${ownerToken1}` },
    });
    expect(preSummaryRes.status).toBe(200);
    const preSummaryData = (await preSummaryRes.json()).data;

    const preRespRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/my-response`, {
      headers: { Authorization: `Bearer ${respToken1}` },
    });
    expect(preRespRes.status).toBe(200);
    const preRespData = (await preRespRes.json()).data;

    // ------------------------------------------------------------------------
    // Phase 2: Kill 1st Server Process
    // ------------------------------------------------------------------------
    await killProcess(currentChild);
    currentChild = null;

    // Verify server is down
    let isDown = false;
    try {
      await fetch(`${baseUrl}/api/v1/health`);
    } catch {
      isDown = true;
    }
    expect(isDown).toBe(true);

    // ------------------------------------------------------------------------
    // Phase 3: Start 2nd Brand-New Server Process on Same Port
    // ------------------------------------------------------------------------
    currentChild = await startServerProcess();

    // ------------------------------------------------------------------------
    // Phase 4: Authenticate & Retrieve Data Field-By-Field
    // ------------------------------------------------------------------------
    // Fresh login after restart
    const o1LoginAfter = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'owner1-restart@example.edu', password: 'Password123!' }),
    });
    expect(o1LoginAfter.status).toBe(200);
    const ownerToken2 = (await o1LoginAfter.json()).data.token;

    const r1LoginAfter = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'resp1-restart@example.edu', password: 'Password123!' }),
    });
    expect(r1LoginAfter.status).toBe(200);
    const respToken2 = (await r1LoginAfter.json()).data.token;

    // 1. Post-Restart Survey Read
    const postSurveyRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}`, {
      headers: { Authorization: `Bearer ${ownerToken2}` },
    });
    expect(postSurveyRes.status).toBe(200);
    const postSurveyData = (await postSurveyRes.json()).data;

    // Field-by-field check of Survey
    expect(postSurveyData.id).toBe(preSurveyData.id);
    expect(postSurveyData.title).toBe(preSurveyData.title);
    expect(postSurveyData.description).toBe(preSurveyData.description);
    expect(postSurveyData.status).toBe('PUBLISHED');
    expect(postSurveyData.status).toBe(preSurveyData.status);
    expect(postSurveyData.publishedAt).toBe(preSurveyData.publishedAt);
    expect(postSurveyData.questions).toEqual(preSurveyData.questions);

    // 2. Post-Restart Summary Read
    const postSummaryRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/summary`, {
      headers: { Authorization: `Bearer ${ownerToken2}` },
    });
    expect(postSummaryRes.status).toBe(200);
    const postSummaryData = (await postSummaryRes.json()).data;

    // Field-by-field check of Summary
    expect(postSummaryData.surveyId).toBe(preSummaryData.surveyId);
    expect(postSummaryData.title).toBe(preSummaryData.title);
    expect(postSummaryData.status).toBe(preSummaryData.status);
    expect(postSummaryData.totalResponses).toBe(1);
    expect(postSummaryData.totalResponses).toBe(preSummaryData.totalResponses);
    expect(postSummaryData.questions).toEqual(preSummaryData.questions);

    // 3. Post-Restart Respondent Submission Read
    const postRespRes = await fetch(`${baseUrl}/api/v1/surveys/${surveyId}/my-response`, {
      headers: { Authorization: `Bearer ${respToken2}` },
    });
    expect(postRespRes.status).toBe(200);
    const postRespData = (await postRespRes.json()).data;

    // Field-by-field check of Respondent Submission
    expect(postRespData.id).toBe(preRespData.id);
    expect(postRespData.surveyId).toBe(preRespData.surveyId);
    expect(postRespData.mode).toBe('IDENTIFIED');
    expect(postRespData.submittedAt).toBe(preRespData.submittedAt);
    expect(postRespData.answers).toEqual(preRespData.answers);
  }, 35000); // 35 second timeout for process spawns
});
