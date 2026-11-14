# GuessLess — Survey and Feedback System

CPE 334 Introduction to Software Engineering in the Age of AI Agents (Theme 10)

## Quick Start (NFR-10 Reproducible Setup)

Follow these exact steps from a clean repository checkout:

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Start PostgreSQL 16 container (if using Docker)
docker compose up -d db

# 3. Install dependencies, create test database, generate Prisma client, and apply migrations
npm run setup

# 4. Start API and client in development mode
npm run dev

# 5. Run test suite
npm test
```

## Workspaces & Architecture

- **`server/`**: Express API, PostgreSQL persistence with Prisma ORM, strict Zod validation, and structured error handling.
- **`client/`**: React 18 SPA built with Vite, TypeScript, Tailwind CSS (Zen Green theme tokens), and React Router.
- **`docs/`**: Requirements (`srs.md`), System Design (`system-sds.md`), feature inventory (`features.md`), and sprint contracts.

## Available Scripts

- `npm run setup`: Full installation, database initialization, and migration.
- `npm run dev`: Runs server (`http://localhost:8080`) and client (`http://localhost:5173`) concurrently.
- `npm test`: Runs server unit and integration test suites.
- `npm run typecheck`: Runs TypeScript type checking across both workspaces.
- `npm run build`: Builds client SPA and compiles server TypeScript.
