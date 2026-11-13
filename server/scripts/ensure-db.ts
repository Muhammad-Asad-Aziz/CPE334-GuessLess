import { Client } from 'pg';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

const rootEnvPath = path.resolve(process.cwd(), '../.env');
const serverEnvPath = path.resolve(process.cwd(), '.env');

// If root .env exists, ensure server .env is synced
if (fs.existsSync(rootEnvPath)) {
  fs.copyFileSync(rootEnvPath, serverEnvPath);
}

// Load .env
dotenv.config({ path: serverEnvPath });
dotenv.config({ path: rootEnvPath });

function parseDbUrl(url: string) {
  const parsed = new URL(url);
  return {
    user: parsed.username,
    password: parsed.password,
    host: parsed.hostname,
    port: parseInt(parsed.port || '5432', 10),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

async function ensureDatabase(targetUrl: string) {
  const dbConfig = parseDbUrl(targetUrl);
  const client = new Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: dbConfig.port,
    database: 'postgres',
  });

  try {
    await client.connect();
    const res = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbConfig.database]
    );

    if (res.rowCount === 0) {
      console.log(`Creating database "${dbConfig.database}"...`);
      await client.query(`CREATE DATABASE "${dbConfig.database}" OWNER "${dbConfig.user}"`);
      console.log(`Database "${dbConfig.database}" created.`);
    } else {
      console.log(`Database "${dbConfig.database}" already exists.`);
    }
  } catch (err: any) {
    console.warn(`Database check/creation notice for ${dbConfig.database}:`, err.message);
  } finally {
    await client.end();
  }
}

async function main() {
  const devUrl = process.env.DATABASE_URL || 'postgresql://survey:change-me-db-password@localhost:5432/survey';
  const testUrl = process.env.TEST_DATABASE_URL || 'postgresql://survey:change-me-db-password@localhost:5432/survey_test';

  console.log('Ensuring dev and test databases exist...');
  await ensureDatabase(devUrl);
  await ensureDatabase(testUrl);

  console.log('\n--- Applying Prisma Migrations to DEV database ---');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: devUrl,
    },
  });

  console.log('\n--- Applying Prisma Migrations to TEST database ---');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: testUrl,
    },
  });

  console.log('\nAll databases and migrations are successfully up-to-date.');
}

main().catch((err) => {
  console.error('ensure-db script failed:', err);
  process.exit(1);
});
