# Tutoring Quiz Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a phone-first, Arabic-capable web app where students sit timed multiple-choice quizzes once, teachers author them, and the principal sees how everyone did.

**Architecture:** Three npm workspaces — `api/` (Express 5 REST, owns all domain logic), `web/` (Vite React SPA), `shared/` (zod schemas with TypeScript types inferred from them). All scoring and attempt-lifecycle logic lives in pure, I/O-free modules under `api/src/domain/` so it is unit-testable without a database and physically unreachable from the client. Two containers: Postgres, and one Node process serving both the API and the built SPA.

**Tech Stack:** TypeScript (ESM) · Express 5 · PostgreSQL 16 · `pg` with hand-written SQL and numbered migration files · zod · helmet · cookie-parser · pino-http · React 19 + Vite · react-router · react-i18next · plain CSS with custom properties · Vitest · Supertest · Playwright · Docker Compose

**Spec:** `docs/superpowers/specs/2026-09-24-tutoring-quiz-platform-design.md` — read it alongside this plan. Decision IDs (`D-01`…`D-25`) referenced here are defined in its §2.


## Execution status — read this first

**Updated 2026-09-25, Tasks 1–19 complete.** 188 API tests, 29 web tests and 9 end-to-end tests at a
375px viewport, a clean `tsc` and Vite build, green CI, and `docker compose up --build` verified from
a destroyed volume — including the whole e2e suite run against the container itself. Work happens on `feat/v1`; merge to `main` with `--no-ff` at each phase boundary so `main`
is always submittable.

### Running locally without Docker

Docker is not installed on the dev machine yet. A local Postgres 14 runs on 5432.

```bash
export DATABASE_URL=postgres://mohammedhamada@localhost:5432/quiz_dev   # dev
npm test                   # api (quiz_test via api/test/setup.ts) + web
npm run build              # tsc + Vite; Vitest does NOT typecheck, so run this before every commit
npm run dev                # API on :3000 (migrate + seed + sweeper) and Vite on :5173
```

The API also serves the built SPA from `web/dist` when it exists, so `npm run build && npm start`
gives the production shape on :3000 alone. `web/dist` is resolved from the API module's own
location, not from `process.cwd()`, because the three ways of starting it have three cwds.

The API does not load `.env` files; export `DATABASE_URL` yourself. `compose` publishes Postgres on
host **5433**, not 5432.

### Seeded logins (password `pass1234` for all)

| Role | Login | Notes |
|---|---|---|
| Student | `10A-001` … `10A-020`, `10B-…`, `11A-…` | Every class has exactly one open quiz |
| Teacher | `t-samir` | 10A + 10B; authored both closed quizzes (one deducts, one does not) |
| Teacher | `t-rana`, `t-huda`, `t-george` | |
| Principal | `principal` | |

Test fixtures in `api/test/helpers/world.ts` use different codes (`teacher-samir`, `teacher-rana`) — those are test-only.

### Deviations from this plan that Phase 4 must respect

- **The narrowest real Chrome window on macOS is 400px, not 375.** The OS clamps it, so the
  in-browser check runs at 400. There are no width breakpoints, so this is representative; a true
  375px check belongs to the Playwright run in Task 18, which sets the viewport directly.

- ~~Workspaces are `["shared", "api"]` only.~~ **Done in Task 14:** `web` is in the root
  `workspaces`, in `build`/`dev`/`test`, and in both Dockerfile stages.
- **`web` pins Vite 5, not 6.** Vitest 2 hoists Vite 5 to the root; a second copy at Vite 6 made
  `@vitejs/plugin-react` typecheck against the wrong one. One copy in the tree, deliberately.
- **Read `window.localStorage`, never the bare `localStorage` global.** Node 20+ ships its own
  experimental one that shadows jsdom's under Vitest and has no `getItem`. `web/test/setup.ts`
  restores a real Storage for tests.
- **The implemented response shapes are the contract, not the plan's sketches.** Read
  `api/src/serializers/*.ts` and `api/src/routes/*.ts` before building a screen. In particular:
  student quiz `state` is one of `available | not_open_yet | closed | in_progress | expired | submitted`;
  results and reports carry pre-formatted `*Label` strings alongside integer hundredths.
- `pg` parses `int8` **and `int8[]`** to numbers (`api/src/db/pool.ts`). The array parser was a real bug.
- `scopeFor(role)` in `api/src/db/quizzes.ts` is the only home of the teacher-scope rule; its principal
  branch must keep `$1::bigint` — a bare `TRUE` or an uncast `$1` breaks every principal query.
- Express 5 makes `req.query` a getter; `validate()` installs parsed input with `defineProperty`.

### API gaps Phase 4 closed

All four are done, in Tasks 14 and 16:

| Gap | Where | Note |
|---|---|---|
| `PATCH /api/me` `{ locale }` | Task 14 | `updateMeBody`; persists `users.locale`; 204 |
| `GET /api/me/classes` | Task 16 | teacher → assigned, principal → all; 403 for a student |
| `GET /api/quizzes/:id` (staff, scoped) | Task 16 | the only shape carrying `isCorrect`; `serializeQuizForAuthor` |
| `PATCH /api/quizzes/:id`, `PUT /api/quizzes/:id/questions/:qid` | Task 16 | see the editing note below |

**Spec §11 is now proven.** `api/test/quiz-editing.test.ts` has the test that could not be written
before: a student answers, the teacher then rewrites the question's text, marks and answer key, and
every recorded grade is byte-identical afterwards.

**Question options are updated in place, never replaced.** `answers.selected_option_id` references
`options(id)` with no `ON DELETE`, so deleting an option a student picked fails outright. The PUT
upserts by `(question_id, position)` and clears `is_correct` first, which also keeps the
`one_correct_option` partial index satisfied at every statement boundary.

### Still open

- ~~`docker compose up` has never been run.~~ **Done 2026-09-25**, after Docker Desktop was
  installed. From `docker compose down -v`, a full `--build` produced a working stack: the db
  container healthy, the app migrating and seeding on first boot (65 users, 3 classes, 5 quizzes),
  the SPA and its fonts served from :3000, `/api/*` misses still 404, and Postgres published on
  5433. The **entire e2e suite was then run against the container** — all 9 passing, which is what
  verifies the README's three logins against the delivered artefact rather than a dev server. The
  volume was destroyed and rebuilt afterwards, so the checked-out state is pristine.

- **`quiz_dev` now has a submitted attempt for `10A-002` on القراءة والفهم**, created by Task 15's
  Step 5 walkthrough. The one-attempt rule means that student cannot sit it again; recreate
  `quiz_dev` to reseed if you want a clean student for a demo.

- `data/` quiz content is machine-checked (15 questions, 20 marks, answers spread across a–d, no
  duplicate options). The Arabic wording has not been reviewed by a native speaker.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node >= 20.** Containers run `node:22-alpine`. `npm` only — corepack's pnpm shim is broken on the dev machine.
- **TypeScript ESM throughout.** `"type": "module"` in every workspace package.
- **All mark arithmetic is integer hundredths** (`100` = 1.00 mark). Conversion to `NUMERIC(5,2)` happens only at the database boundary. Never use floats for marks; never introduce a decimal library.
- **Wrong-answer penalty is `Math.round(points / 3)`** in hundredths, applied per answer (D-05, D-19). Blank answers are never penalised.
- **`display_score = Math.max(0, raw_score)`** (D-05). `raw_score` is returned to the principal only.
- **No physical CSS properties.** `margin-inline-start`, `padding-inline`, `inset-inline-start`, `text-align: start` — never `margin-left`, `text-align: right` (D-14). This rule goes in `CLAUDE.md`.
- **`dir="auto"` on every element rendering user-generated text** — names, question text, option text (D-22).
- **Western digits and Gregorian dates in both locales**, `Intl` with `numberingSystem: 'latn'`, timezone `Asia/Amman` (D-11, D-21).
- **Timestamps are `timestamptz`, stored UTC.** Never store local time.
- **Postgres is published on host port 5433**, container-internal 5432 (D-20).
- **Every route parses its input through a zod schema before the handler runs** (D-24). A parse failure is a 400 and never reaches domain code.
- **Responses are built by role-specific serializers.** Never mutate or `delete` fields off a shared object to hide them (spec §8).
- **`options.is_correct` must never appear** in an attempt payload or a locked result payload.
- **Reading another user's resource returns 404, not 403** — do not confirm that the id exists.
- **Commit after every task.** Conventional-commit prefixes (`feat:`, `test:`, `chore:`, `docs:`).

---

## File Structure

| Path | Responsibility |
|---|---|
| `docker-compose.yml` | Postgres + app. The one command. |
| `Dockerfile` | Multi-stage: build `web`, build `api`, run one Node process. |
| `package.json` | Workspace root; scripts that delegate. |
| `shared/src/schemas.ts` | zod request/response schemas; types inferred from them. Single source of truth for the contract. |
| `api/src/domain/marks.ts` | Integer-hundredths helpers. Pure. |
| `api/src/domain/scoring.ts` | `gradeAnswer`, `totalScore`. Pure. The crown jewel of the test suite. |
| `api/src/domain/attempt.ts` | Attempt state machine: `canStart`, `canSaveAnswer`, `attemptState`. Pure. |
| `api/src/db/pool.ts` | `pg` pool, NUMERIC parsing. |
| `api/src/db/migrate.ts` | Numbered-SQL migration runner. |
| `api/src/db/migrations/*.sql` | Schema, one numbered file per change. |
| `api/src/auth/password.ts` | `scrypt` hash/verify. No native deps. |
| `api/src/auth/session.ts` | Session issue/lookup/revoke. |
| `api/src/middleware/*.ts` | `requireAuth`, `requireRole`, `validate`, error handler. |
| `api/src/routes/*.ts` | One file per resource. Thin — guards, validation, serializer. |
| `api/src/serializers/*.ts` | Role-specific response shaping. |
| `api/src/sweeper.ts` | Expiry sweeper (spec §6). |
| `api/src/seed/` | CSV parser + idempotent loader (D-17, D-18). |
| `data/*.csv` | Sample data = the future import format. |
| `web/src/i18n/` | `index.ts`, `en.json`, `ar.json`. |
| `web/src/styles/tokens.css` | Colour, spacing, type scale. Logical properties only. |
| `web/src/api/client.ts` | Typed fetch wrapper using `shared` schemas. |
| `web/src/pages/` | One file per screen. |
| `e2e/` | Playwright specs at 375px. |

---

## Phase 1 — Foundation and pure domain (Tasks 1-4)

*Ends with: a running container, a real schema whose constraints are proven, and the two hardest pieces of logic fully tested without a database.*

### Task 1: Workspace skeleton, Docker Compose, health check

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `.env.example`, `Dockerfile`, `docker-compose.yml`, `.dockerignore`
- Create: `api/package.json`, `api/tsconfig.json`, `api/src/index.ts`, `api/src/app.ts`
- Create: `shared/package.json`, `shared/tsconfig.json`, `shared/src/index.ts`
- Test: `api/test/health.test.ts`

**Interfaces:**
- Produces: `createApp(): express.Express` from `api/src/app.ts` — every later route test imports this.

- [x] **Step 1: Root workspace files**

`package.json`:
```json
{
  "name": "tutoring-quiz-platform",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "workspaces": ["shared", "api", "web"],
  "scripts": {
    "dev": "npm run dev -w api & npm run dev -w web",
    "build": "npm run build -w shared && npm run build -w web && npm run build -w api",
    "start": "node api/dist/index.js",
    "test": "npm run test -w api",
    "test:e2e": "playwright test",
    "migrate": "npm run migrate -w api",
    "seed": "npm run seed -w api"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "strict": true, "noUncheckedIndexedAccess": true, "esModuleInterop": true,
    "skipLibCheck": true, "declaration": true, "sourceMap": true
  }
}
```

`.env.example`:
```
DATABASE_URL=postgres://quiz:quiz@localhost:5433/quiz
PORT=3000
SESSION_SECRET=change-me-in-production
NODE_ENV=development
TZ=UTC
```

- [x] **Step 2: Write the failing health test**

`api/test/health.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('sets security headers', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
```

- [x] **Step 3: Run it and watch it fail**

Run: `npm test -w api`
Expected: FAIL — cannot resolve `../src/app.js`.

- [x] **Step 4: Implement the app factory**

`api/src/app.ts`:
```ts
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';

export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());
  app.get('/api/health', (_req, res) => { res.json({ status: 'ok' }); });
  return app;
}
```

`api/src/index.ts`:
```ts
import { createApp } from './app.js';
const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.log(`api listening on ${port}`));
```

- [x] **Step 5: Run the test again**

Run: `npm test -w api`
Expected: PASS, 2 tests.

- [x] **Step 6: Docker Compose and Dockerfile**

`docker-compose.yml` — note the 5433 mapping (D-20):
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: quiz
      POSTGRES_PASSWORD: quiz
      POSTGRES_DB: quiz
    ports: ["5433:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U quiz"]
      interval: 3s
      timeout: 3s
      retries: 20
  app:
    build: .
    environment:
      DATABASE_URL: postgres://quiz:quiz@db:5432/quiz
      PORT: 3000
      TZ: UTC
      SESSION_SECRET: dev-secret-not-for-production
    ports: ["3000:3000"]
    depends_on:
      db: { condition: service_healthy }
volumes:
  pgdata:
```

`Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/
COPY api/package.json api/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci --omit=dev --workspace=api --workspace=shared --include-workspace-root
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/web/dist web/dist
COPY data data
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
```

- [x] **Step 7: Verify the one command** — done 2026-09-25, see the execution status

Run: `docker compose up --build`
Then: `curl -s localhost:3000/api/health`
Expected: `{"status":"ok"}`

If Docker is unavailable, run `npm run dev -w api` against the local Postgres on 5432 and record the blocker — but do not mark this step complete, because an unverified compose file is the single biggest submission risk (spec appendix).

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: workspace skeleton, compose stack and health endpoint"
```

---

### Task 2: Schema and migrations

**Files:**
- Create: `api/src/db/pool.ts`, `api/src/db/migrate.ts`, `api/src/db/migrations/001_init.sql`
- Test: `api/test/schema.test.ts`

**Interfaces:**
- Produces: `pool` (a `pg.Pool`), `migrate(): Promise<void>`, `withTestDb(fn)` test helper.

- [x] **Step 1: Write failing constraint tests**

These assert the four load-bearing guarantees from spec §4 — the database, not the application, enforces them.

`api/test/schema.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';

beforeAll(async () => { await migrate(); });
afterAll(async () => { await pool.end(); });

async function seedMinimal() {
  const { rows: [cls] } = await pool.query(
    `INSERT INTO classes(name) VALUES ('10A') ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id`);
  const { rows: [student] } = await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash, class_id)
     VALUES ('student','ليلى حداد','s-test-1','x',$1)
     ON CONFLICT (login_code) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`, [cls.id]);
  const { rows: [teacher] } = await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash)
     VALUES ('teacher','Samir Odeh','t-test-1','x')
     ON CONFLICT (login_code) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`);
  const { rows: [quiz] } = await pool.query(
    `INSERT INTO quizzes(title, author_id, language, time_limit_minutes, opens_at, closes_at)
     VALUES ('T', $1, 'en', 20, now() - interval '1 day', now() + interval '1 day') RETURNING id`, [teacher.id]);
  return { cls, student, teacher, quiz };
}

describe('schema constraints', () => {
  it('rejects a second attempt for the same student and quiz', async () => {
    const { student, quiz } = await seedMinimal();
    const insert = () => pool.query(
      `INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, max_score)
       VALUES ($1,$2, now(), now() + interval '20 min', 2000)`, [quiz.id, student.id]);
    await insert();
    await expect(insert()).rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects a student without a class and a teacher with one', async () => {
    await expect(pool.query(
      `INSERT INTO users(role, full_name, login_code, password_hash)
       VALUES ('student','No Class','s-bad','x')`)).rejects.toThrow(/violates check/i);
  });

  it('allows at most one correct option per question', async () => {
    const { quiz } = await seedMinimal();
    const { rows: [q] } = await pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,1,'Q',100) RETURNING id`, [quiz.id]);
    await pool.query(`INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,1,'a',true)`, [q.id]);
    await expect(pool.query(
      `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,2,'b',true)`, [q.id]))
      .rejects.toThrow(/duplicate key|unique/i);
  });

  it('rejects a quiz that closes before it opens', async () => {
    const { teacher } = await seedMinimal();
    await expect(pool.query(
      `INSERT INTO quizzes(title, author_id, language, time_limit_minutes, opens_at, closes_at)
       VALUES ('Bad', $1, 'en', 20, now(), now() - interval '1 hour')`, [teacher.id]))
      .rejects.toThrow(/violates check/i);
  });

  it('round-trips Arabic text unchanged', async () => {
    const { rows: [r] } = await pool.query(`SELECT full_name FROM users WHERE login_code='s-test-1'`);
    expect(r.full_name).toBe('ليلى حداد');
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- schema`
Expected: FAIL — relation "classes" does not exist.

- [x] **Step 3: Write the pool**

`api/src/db/pool.ts`:
```ts
import pg from 'pg';
// NUMERIC arrives as string; marks are integer hundredths in the domain, so parse explicitly at call sites.
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
```

- [x] **Step 4: Write the migration runner**

`api/src/db/migrate.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(): Promise<void> {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())`);
  const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rowCount } = await pool.query(`SELECT 1 FROM schema_migrations WHERE name=$1`, [file]);
    if (rowCount) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(`INSERT INTO schema_migrations(name) VALUES ($1)`, [file]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
}
```

- [x] **Step 5: Write the schema**

`api/src/db/migrations/001_init.sql` — marks are stored as `integer` hundredths to match the domain exactly and remove every rounding question at the boundary:
```sql
CREATE TABLE classes (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            bigserial PRIMARY KEY,
  role          text NOT NULL CHECK (role IN ('student','teacher','principal')),
  full_name     text NOT NULL,
  login_code    text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  locale        text NOT NULL DEFAULT 'ar' CHECK (locale IN ('en','ar')),
  class_id      bigint REFERENCES classes(id),
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_has_class CHECK ((class_id IS NOT NULL) = (role = 'student'))
);

CREATE TABLE teacher_classes (
  teacher_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  class_id   bigint NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (teacher_id, class_id)
);

CREATE TABLE quizzes (
  id                 bigserial PRIMARY KEY,
  title              text NOT NULL,
  author_id          bigint NOT NULL REFERENCES users(id),
  language           text NOT NULL DEFAULT 'en' CHECK (language IN ('en','ar')),
  time_limit_minutes integer NOT NULL DEFAULT 20 CHECK (time_limit_minutes BETWEEN 1 AND 300),
  opens_at           timestamptz NOT NULL,
  closes_at          timestamptz NOT NULL,
  negative_marking   boolean NOT NULL DEFAULT false,
  is_published       boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT window_ordered CHECK (closes_at > opens_at)
);

CREATE TABLE quiz_classes (
  quiz_id  bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  class_id bigint NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  PRIMARY KEY (quiz_id, class_id)
);

CREATE TABLE questions (
  id       bigserial PRIMARY KEY,
  quiz_id  bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position integer NOT NULL,
  text     text NOT NULL,
  points   integer NOT NULL CHECK (points > 0),   -- hundredths: 100 = 1.00 mark
  UNIQUE (quiz_id, position)
);

CREATE TABLE options (
  id          bigserial PRIMARY KEY,
  question_id bigint NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  text        text NOT NULL,
  is_correct  boolean NOT NULL DEFAULT false,
  UNIQUE (question_id, position)
);
-- At most one correct option per question. "Exactly one" is validated at publish time.
CREATE UNIQUE INDEX one_correct_option ON options(question_id) WHERE is_correct;

CREATE TABLE attempts (
  id               bigserial PRIMARY KEY,
  quiz_id          bigint NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id       bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  submitted_at     timestamptz,
  submitted_reason text CHECK (submitted_reason IN ('manual','expired')),
  raw_score        integer,
  display_score    integer,
  max_score        integer NOT NULL,
  UNIQUE (quiz_id, student_id)          -- D-03, enforced by the database
);

CREATE TABLE answers (
  id                 bigserial PRIMARY KEY,
  attempt_id         bigint NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id        bigint NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  selected_option_id bigint REFERENCES options(id),
  points_possible    integer NOT NULL,   -- D-08 snapshot
  points_awarded     integer NOT NULL,   -- D-08 snapshot
  answered_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

CREATE TABLE sessions (
  id         text PRIMARY KEY,           -- sha256 of the cookie token
  user_id    bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON attempts(student_id);
CREATE INDEX ON attempts(quiz_id);
CREATE INDEX ON answers(attempt_id);
CREATE INDEX ON quiz_classes(class_id);
CREATE INDEX ON sessions(expires_at);
```

- [x] **Step 6: Run the tests**

Run: `docker compose up -d db && DATABASE_URL=postgres://quiz:quiz@localhost:5433/quiz npm test -w api -- schema`
Expected: PASS, 5 tests. The Arabic round-trip proves UTF-8 end to end rather than assuming it.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: database schema with constraint-level one-attempt rule"
```

---

### Task 3: Scoring domain

**Files:**
- Create: `api/src/domain/marks.ts`, `api/src/domain/scoring.ts`
- Test: `api/test/domain/scoring.test.ts`

**Interfaces:**
- Produces:
  - `type Hundredths = number`
  - `wrongAnswerPenalty(points: Hundredths): Hundredths`
  - `gradeAnswer(points: Hundredths, isCorrect: boolean | null, negativeMarking: boolean): Hundredths`
  - `totalScore(awarded: Hundredths[]): { raw: Hundredths; display: Hundredths }`
  - `formatMarks(h: Hundredths): string`

- [x] **Step 1: Write the failing test — the whole table from spec §7**

`api/test/domain/scoring.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { gradeAnswer, totalScore, wrongAnswerPenalty, formatMarks } from '../../src/domain/scoring.js';

const ONE = 100, TWO = 200;   // hundredths

describe('wrongAnswerPenalty', () => {
  it('is one third of the question, rounded to the nearest hundredth', () => {
    expect(wrongAnswerPenalty(ONE)).toBe(33);   // 0.33
    expect(wrongAnswerPenalty(TWO)).toBe(67);   // 0.67
    expect(wrongAnswerPenalty(300)).toBe(100);  // 1.00, exact
  });
});

describe('gradeAnswer', () => {
  it('awards full points for a correct answer regardless of negative marking', () => {
    expect(gradeAnswer(TWO, true, false)).toBe(200);
    expect(gradeAnswer(TWO, true, true)).toBe(200);
  });

  it('awards nothing for a wrong answer when negative marking is off', () => {
    expect(gradeAnswer(TWO, false, false)).toBe(0);
  });

  it('deducts a third for a wrong answer when negative marking is on', () => {
    expect(gradeAnswer(ONE, false, true)).toBe(-33);
    expect(gradeAnswer(TWO, false, true)).toBe(-67);
  });

  it('never penalises a blank answer', () => {
    expect(gradeAnswer(TWO, null, true)).toBe(0);
    expect(gradeAnswer(TWO, null, false)).toBe(0);
  });
});

// A 15-question, 20-mark quiz: ten 1-mark questions and five 2-mark questions.
// Both papers come from the design discussion and are named so the reasoning survives.
describe('totalScore — worked papers, negative marking on', () => {
  it("Layla: studied, unsure on a few — 8x1 correct, 2x2 correct, 2x1 wrong, 2x2 wrong, one 2-mark blank", () => {
    const awarded = [
      ...Array(8).fill(gradeAnswer(ONE, true, true)),
      ...Array(2).fill(gradeAnswer(TWO, true, true)),
      ...Array(2).fill(gradeAnswer(ONE, false, true)),
      ...Array(2).fill(gradeAnswer(TWO, false, true)),
      gradeAnswer(TWO, null, true),
    ];
    expect(totalScore(awarded)).toEqual({ raw: 1000, display: 1000 });
    expect(formatMarks(1000)).toBe('10.00');
  });

  it('Omar: guessed all fifteen — 4x1 and 1x2 lucky, the rest wrong', () => {
    const awarded = [
      ...Array(4).fill(gradeAnswer(ONE, true, true)),
      gradeAnswer(TWO, true, true),
      ...Array(6).fill(gradeAnswer(ONE, false, true)),
      ...Array(4).fill(gradeAnswer(TWO, false, true)),
    ];
    expect(totalScore(awarded)).toEqual({ raw: 134, display: 134 });
  });

  it('every answer wrong: the raw total goes negative and the displayed total floors at zero', () => {
    const awarded = [
      ...Array(10).fill(gradeAnswer(ONE, false, true)),
      ...Array(5).fill(gradeAnswer(TWO, false, true)),
    ];
    expect(totalScore(awarded)).toEqual({ raw: -665, display: 0 });
  });

  it('a blank paper and a badly guessed paper are distinguishable in the raw score', () => {
    const blank = totalScore(Array(15).fill(gradeAnswer(ONE, null, true)));
    const guessed = totalScore(Array(15).fill(gradeAnswer(ONE, false, true)));
    expect(blank.raw).toBe(0);
    expect(guessed.raw).toBeLessThan(blank.raw);
  });
});

describe('formatMarks', () => {
  it('renders hundredths as two decimal places', () => {
    expect(formatMarks(0)).toBe('0.00');
    expect(formatMarks(134)).toBe('1.34');
    expect(formatMarks(-665)).toBe('-6.65');
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- scoring`
Expected: FAIL — cannot resolve `scoring.js`.

- [x] **Step 3: Implement**

`api/src/domain/marks.ts`:
```ts
/** Marks are integer hundredths everywhere in the domain. 100 = 1.00 mark. */
export type Hundredths = number;

export function formatMarks(h: Hundredths): string {
  const sign = h < 0 ? '-' : '';
  const abs = Math.abs(h);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
```

`api/src/domain/scoring.ts`:
```ts
import type { Hundredths } from './marks.js';
export { formatMarks } from './marks.js';
export type { Hundredths } from './marks.js';

/**
 * Options per question. A wrong answer costs points/(OPTIONS-1), the ratio at
 * which random guessing is exactly break-even (D-05).
 */
export const OPTIONS_PER_QUESTION = 4;

export function wrongAnswerPenalty(points: Hundredths): Hundredths {
  return Math.round(points / (OPTIONS_PER_QUESTION - 1));
}

/** `isCorrect === null` means the question was left blank. Blanks are never penalised. */
export function gradeAnswer(
  points: Hundredths,
  isCorrect: boolean | null,
  negativeMarking: boolean,
): Hundredths {
  if (isCorrect === null) return 0;
  if (isCorrect) return points;
  return negativeMarking ? -wrongAnswerPenalty(points) : 0;
}

/** The raw total may be negative; the displayed total floors at zero (D-05). */
export function totalScore(awarded: Hundredths[]): { raw: Hundredths; display: Hundredths } {
  const raw = awarded.reduce((sum, a) => sum + a, 0);
  return { raw, display: Math.max(0, raw) };
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -w api -- scoring`
Expected: PASS, 11 tests. If Omar is not exactly `134`, the rounding is being applied to the total rather than per answer — re-read D-19.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scoring domain with guessing-neutral deduction"
```

---

### Task 4: Attempt state machine

**Files:**
- Create: `api/src/domain/attempt.ts`
- Test: `api/test/domain/attempt.test.ts`

**Interfaces:**
- Produces:
  - `type AttemptState = 'not_started' | 'in_progress' | 'expired' | 'submitted'`
  - `attemptState(a: { expiresAt: Date; submittedAt: Date | null } | null, now: Date): AttemptState`
  - `type StartRefusal = 'not_published' | 'not_open_yet' | 'closed' | 'wrong_class' | 'already_attempted'`
  - `canStart(input, now): { ok: true } | { ok: false; reason: StartRefusal }`
  - `ANSWER_GRACE_MS: number`
  - `canSaveAnswer(a: { expiresAt: Date; submittedAt: Date | null }, now: Date): boolean`

- [x] **Step 1: Write the failing test**

`api/test/domain/attempt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { attemptState, canStart, canSaveAnswer, ANSWER_GRACE_MS } from '../../src/domain/attempt.js';

const t = (iso: string) => new Date(iso);
const NOW = t('2026-09-24T10:00:00Z');

describe('attemptState', () => {
  it('is not_started when there is no attempt', () => {
    expect(attemptState(null, NOW)).toBe('not_started');
  });
  it('is in_progress before the deadline', () => {
    expect(attemptState({ expiresAt: t('2026-09-24T10:20:00Z'), submittedAt: null }, NOW)).toBe('in_progress');
  });
  it('is expired once the deadline passes unsubmitted', () => {
    expect(attemptState({ expiresAt: t('2026-09-24T09:40:00Z'), submittedAt: null }, NOW)).toBe('expired');
  });
  it('is submitted once stamped, even before the deadline', () => {
    expect(attemptState({ expiresAt: t('2026-09-24T10:20:00Z'), submittedAt: t('2026-09-24T09:50:00Z') }, NOW)).toBe('submitted');
  });
});

const openQuiz = {
  isPublished: true,
  opensAt: t('2026-09-24T09:00:00Z'),
  closesAt: t('2026-09-24T11:00:00Z'),
  classIds: [1, 2],
};

describe('canStart', () => {
  it('allows a published, open quiz for a student in a targeted class with no prior attempt', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, NOW)).toEqual({ ok: true });
  });
  it('refuses an unpublished quiz', () => {
    expect(canStart({ quiz: { ...openQuiz, isPublished: false }, studentClassId: 1, hasAttempt: false }, NOW))
      .toEqual({ ok: false, reason: 'not_published' });
  });
  it('refuses before the window opens', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, t('2026-09-24T08:59:00Z')))
      .toEqual({ ok: false, reason: 'not_open_yet' });
  });
  it('refuses after the window closes', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: false }, t('2026-09-24T11:00:01Z')))
      .toEqual({ ok: false, reason: 'closed' });
  });
  it('refuses a student whose class was not targeted', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 9, hasAttempt: false }, NOW))
      .toEqual({ ok: false, reason: 'wrong_class' });
  });
  it('refuses a second attempt', () => {
    expect(canStart({ quiz: openQuiz, studentClassId: 1, hasAttempt: true }, NOW))
      .toEqual({ ok: false, reason: 'already_attempted' });
  });
  it('checks publication before anything else, so an unpublished closed quiz reads as unpublished', () => {
    expect(canStart({ quiz: { ...openQuiz, isPublished: false }, studentClassId: 9, hasAttempt: true }, NOW))
      .toEqual({ ok: false, reason: 'not_published' });
  });
});

describe('canSaveAnswer', () => {
  const live = { expiresAt: t('2026-09-24T10:00:00Z'), submittedAt: null };
  it('accepts before the deadline', () => {
    expect(canSaveAnswer(live, t('2026-09-24T09:59:59Z'))).toBe(true);
  });
  it('accepts inside the grace window, so a request in flight is not punished for latency', () => {
    expect(canSaveAnswer(live, new Date(live.expiresAt.getTime() + ANSWER_GRACE_MS - 1))).toBe(true);
  });
  it('refuses past the grace window', () => {
    expect(canSaveAnswer(live, new Date(live.expiresAt.getTime() + ANSWER_GRACE_MS + 1))).toBe(false);
  });
  it('refuses once submitted', () => {
    expect(canSaveAnswer({ ...live, submittedAt: t('2026-09-24T09:30:00Z') }, t('2026-09-24T09:31:00Z'))).toBe(false);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- attempt`
Expected: FAIL — cannot resolve `attempt.js`.

- [x] **Step 3: Implement**

`api/src/domain/attempt.ts`:
```ts
export type AttemptState = 'not_started' | 'in_progress' | 'expired' | 'submitted';

export interface AttemptTiming { expiresAt: Date; submittedAt: Date | null }

export function attemptState(a: AttemptTiming | null, now: Date): AttemptState {
  if (!a) return 'not_started';
  if (a.submittedAt) return 'submitted';
  return now < a.expiresAt ? 'in_progress' : 'expired';
}

export type StartRefusal =
  | 'not_published' | 'not_open_yet' | 'closed' | 'wrong_class' | 'already_attempted';

export interface StartInput {
  quiz: { isPublished: boolean; opensAt: Date; closesAt: Date; classIds: number[] };
  studentClassId: number;
  hasAttempt: boolean;
}

/** Order matters: the first failing guard is the reason reported. */
export function canStart(input: StartInput, now: Date): { ok: true } | { ok: false; reason: StartRefusal } {
  const { quiz, studentClassId, hasAttempt } = input;
  if (!quiz.isPublished) return { ok: false, reason: 'not_published' };
  if (now < quiz.opensAt) return { ok: false, reason: 'not_open_yet' };
  if (now > quiz.closesAt) return { ok: false, reason: 'closed' };
  if (!quiz.classIds.includes(studentClassId)) return { ok: false, reason: 'wrong_class' };
  if (hasAttempt) return { ok: false, reason: 'already_attempted' };
  return { ok: true };
}

/** Latency grace so a request already in flight at the deadline is not lost (spec §6). */
export const ANSWER_GRACE_MS = 5_000;

export function canSaveAnswer(a: AttemptTiming, now: Date): boolean {
  if (a.submittedAt) return false;
  return now.getTime() <= a.expiresAt.getTime() + ANSWER_GRACE_MS;
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -w api -- attempt`
Expected: PASS, 15 tests.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: attempt state machine with start guards and latency grace"
```

---
## Phase 2 — Identity, data, and authoring (Tasks 5-7)

*Ends with: real users you can log in as, a populated database loaded from the CSV format the client's spreadsheets will arrive in, and teachers able to create quizzes.*

### Task 5: Authentication, sessions, and the validation middleware

**Files:**
- Create: `shared/src/schemas.ts`, `api/src/auth/password.ts`, `api/src/auth/session.ts`
- Create: `api/src/middleware/validate.ts`, `api/src/middleware/auth.ts`, `api/src/middleware/errors.ts`
- Create: `api/src/routes/auth.ts`, `api/src/serializers/user.ts`
- Modify: `api/src/app.ts`
- Test: `api/test/auth.test.ts`, `api/test/helpers/db.ts`

**Interfaces:**
- Consumes: `pool`, `migrate` (Task 2).
- Produces:
  - `hashPassword(plain: string): Promise<string>` · `verifyPassword(plain: string, stored: string): Promise<boolean>`
  - `issueSession(userId: number): Promise<string>` (returns the raw cookie token) · `lookupSession(token: string): Promise<SessionUser | null>` · `revokeSession(token: string): Promise<void>`
  - `type Role = 'student' | 'teacher' | 'principal'`
  - `type SessionUser = { id: number; role: Role; locale: 'en' | 'ar'; classId: number | null; fullName: string }`
  - `requireAuth`, `requireRole(...roles: Role[])`, `validate({ body?, params?, query? })` — Express middleware
  - `req.user: SessionUser` after `requireAuth`
  - Test helper `resetDb()` and `loginAs(app, loginCode, password)` returning a supertest agent.

- [x] **Step 1: Write the failing test**

`api/test/auth.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { hashPassword } from '../src/auth/password.js';
import { resetDb } from './helpers/db.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => {
  await resetDb();
  const { rows: [c] } = await pool.query(`INSERT INTO classes(name) VALUES ('10A') RETURNING id`);
  await pool.query(
    `INSERT INTO users(role, full_name, login_code, password_hash, class_id) VALUES ('student','ليلى حداد','10A-001',$1,$2)`,
    [await hashPassword('pass1234'), c.id]);
});
afterAll(async () => { await pool.end(); });

describe('POST /api/auth/login', () => {
  it('sets an httpOnly session cookie on success', async () => {
    const res = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('never returns the password hash', async () => {
    const res = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(res.body.user).toMatchObject({ role: 'student', fullName: 'ليلى حداد' });
  });

  it('rejects a wrong password with the same message as an unknown user', async () => {
    const bad = await request(app).post('/api/auth/login').send({ loginCode: '10A-001', password: 'wrong' });
    const missing = await request(app).post('/api/auth/login').send({ loginCode: 'nobody', password: 'wrong' });
    expect(bad.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(bad.body).toEqual(missing.body);   // no user enumeration
  });

  it('rejects a malformed body with 400 before touching the database', async () => {
    const res = await request(app).post('/api/auth/login').send({ loginCode: 123 });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/me', () => {
  it('is 401 without a session', async () => {
    expect((await request(app).get('/api/me')).status).toBe(401);
  });

  it('returns the signed-in user with a session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    const res = await agent.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'student', locale: 'ar' });
  });

  it('is 401 after logout', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ loginCode: '10A-001', password: 'pass1234' });
    await agent.post('/api/auth/logout');
    expect((await agent.get('/api/me')).status).toBe(401);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- auth`
Expected: FAIL — cannot resolve `helpers/db.js`.

- [x] **Step 3: Write the test helper**

`api/test/helpers/db.ts`:
```ts
import { pool } from '../../src/db/pool.js';

/** Truncate everything between tests. Order is irrelevant with CASCADE. */
export async function resetDb(): Promise<void> {
  await pool.query(`TRUNCATE answers, attempts, options, questions, quiz_classes, quizzes,
                    teacher_classes, sessions, users, classes RESTART IDENTITY CASCADE`);
}
```

- [x] **Step 4: Implement password hashing with no native dependency**

`api/src/auth/password.ts`:
```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(plain, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(plain, Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
```

- [x] **Step 5: Implement sessions**

`api/src/auth/session.ts` — the cookie carries a random token; only its SHA-256 is stored, so a database leak does not yield usable sessions:
```ts
import { createHash, randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';

export type Role = 'student' | 'teacher' | 'principal';
export interface SessionUser {
  id: number; role: Role; locale: 'en' | 'ar'; classId: number | null; fullName: string;
}

export const SESSION_COOKIE = 'qsid';
const TTL_MS = 1000 * 60 * 60 * 12;

const digest = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO sessions(id, user_id, expires_at) VALUES ($1,$2, now() + $3::interval)`,
    [digest(token), userId, `${TTL_MS} milliseconds`]);
  return token;
}

export async function lookupSession(token: string): Promise<SessionUser | null> {
  const { rows } = await pool.query(
    `SELECT u.id, u.role, u.locale, u.class_id, u.full_name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.expires_at > now() AND u.is_active`, [digest(token)]);
  const r = rows[0];
  return r ? { id: Number(r.id), role: r.role, locale: r.locale, classId: r.class_id ? Number(r.class_id) : null, fullName: r.full_name } : null;
}

export async function revokeSession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [digest(token)]);
}
```

- [x] **Step 6: Implement the middleware**

`api/src/middleware/validate.ts`:
```ts
import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

/** Parse before the handler. A parse failure is a 400 and never reaches domain code (D-24). */
export function validate(schemas: { body?: ZodTypeAny; params?: ZodTypeAny; query?: ZodTypeAny }): RequestHandler {
  return (req, res, next) => {
    for (const key of ['body', 'params', 'query'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        res.status(400).json({ error: 'invalid_request', details: result.error.flatten() });
        return;
      }
      Object.defineProperty(req, key, { value: result.data, writable: true });
    }
    next();
  };
}
```

`api/src/middleware/auth.ts`:
```ts
import type { RequestHandler } from 'express';
import { lookupSession, SESSION_COOKIE, type Role, type SessionUser } from '../auth/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express { interface Request { user?: SessionUser } }
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  const user = token ? await lookupSession(token) : null;
  if (!user) { res.status(401).json({ error: 'unauthenticated' }); return; }
  req.user = user;
  next();
};

export const requireRole = (...roles: Role[]): RequestHandler => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) { res.status(403).json({ error: 'forbidden' }); return; }
  next();
};
```

`api/src/middleware/errors.ts`:
```ts
import type { ErrorRequestHandler } from 'express';

/** Express 5 forwards rejected async handlers here automatically. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'internal_error' : (err.code ?? 'error') });
};
```

- [x] **Step 7: Write the shared schemas and the login route**

`shared/src/schemas.ts`:
```ts
import { z } from 'zod';

export const loginBody = z.object({
  loginCode: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginBody = z.infer<typeof loginBody>;

export const idParam = z.object({ id: z.coerce.number().int().positive() });
export type IdParam = z.infer<typeof idParam>;
```

`api/src/serializers/user.ts`:
```ts
import type { SessionUser } from '../auth/session.js';
/** Explicit construction, never field deletion (spec §8). */
export const serializeMe = (u: SessionUser) => ({
  id: u.id, role: u.role, locale: u.locale, classId: u.classId, fullName: u.fullName,
});
```

`api/src/routes/auth.ts`:
```ts
import { Router } from 'express';
import { loginBody } from '@quiz/shared';
import { pool } from '../db/pool.js';
import { verifyPassword } from '../auth/password.js';
import { issueSession, revokeSession, SESSION_COOKIE } from '../auth/session.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { serializeMe } from '../serializers/user.js';

export const authRoutes = Router();

authRoutes.post('/auth/login', validate({ body: loginBody }), async (req, res) => {
  const { loginCode, password } = req.body;
  const { rows } = await pool.query(
    `SELECT id, role, locale, class_id, full_name, password_hash FROM users WHERE login_code=$1 AND is_active`,
    [loginCode]);
  const row = rows[0];
  // Verify against a dummy hash when the user is missing, so timing does not leak existence.
  const ok = row ? await verifyPassword(password, row.password_hash) : await verifyPassword(password, 'scrypt$AA==$AA==');
  if (!row || !ok) { res.status(401).json({ error: 'invalid_credentials' }); return; }

  const token = await issueSession(Number(row.id));
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12, path: '/',
  });
  res.json({ user: serializeMe({
    id: Number(row.id), role: row.role, locale: row.locale,
    classId: row.class_id ? Number(row.class_id) : null, fullName: row.full_name }) });
});

authRoutes.post('/auth/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await revokeSession(token);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

authRoutes.get('/me', requireAuth, (req, res) => { res.json(serializeMe(req.user!)); });
```

- [x] **Step 8: Wire into the app**

Modify `api/src/app.ts` — add after the health route:
```ts
import { authRoutes } from './routes/auth.js';
import { errorHandler } from './middleware/errors.js';
// ...
  app.use('/api', authRoutes);
  app.use(errorHandler);        // must be registered last
```

- [x] **Step 9: Run the tests**

Run: `npm test -w api -- auth`
Expected: PASS, 7 tests. The equal-response test is the one that matters: a different message for "unknown user" would hand an attacker the roster.

- [x] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: session auth with scrypt hashing and zod request validation"
```

---

### Task 6: CSV sample data and the idempotent seeder

**Files:**
- Create: `data/classes.csv`, `data/teachers.csv`, `data/students.csv`, `data/teacher-classes.csv`
- Create: `data/quiz-algebra-en.csv`, `data/quiz-nahw-ar.csv`, `data/quiz-geometry-en.csv`, `data/quiz-history-ar.csv`, `data/quiz-reading-ar.csv`, `data/quizzes.csv`
- Create: `api/src/seed/csv.ts`, `api/src/seed/index.ts`
- Modify: `api/src/index.ts` (run migrate + seed on boot)
- Test: `api/test/seed.test.ts`

**Interfaces:**
- Consumes: `pool`, `migrate`, `hashPassword`.
- Produces: `seed(): Promise<void>` — idempotent; `parseCsv(text: string): Record<string,string>[]`.

**CSV shapes** — these are the columns the client's real spreadsheets will be mapped onto (D-17):

```
classes.csv          name
teachers.csv         login_code,full_name,password,locale
students.csv         login_code,full_name,class_name,password,locale
teacher-classes.csv  teacher_login_code,class_name
quizzes.csv          slug,title,author_login_code,language,time_limit_minutes,
                     opens_at_offset_days,closes_at_offset_days,negative_marking,classes,questions_file
<quiz file>.csv      position,text,points,option_a,option_b,option_c,option_d,correct
```

`opens_at_offset_days` / `closes_at_offset_days` are offsets from seed time, so the sample data is always in a sensible state whenever a reviewer runs it — a fixed date would make every quiz "closed" a week later.

- [x] **Step 1: Write the failing test**

`api/test/seed.test.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/seed/index.js';
import { resetDb } from './helpers/db.js';

beforeAll(async () => { await migrate(); await resetDb(); await seed(); });
afterAll(async () => { await pool.end(); });

const count = async (sql: string) => Number((await pool.query(sql)).rows[0].c);

describe('seed', () => {
  it('creates three classes with about twenty students each', async () => {
    expect(await count(`SELECT count(*) c FROM classes`)).toBe(3);
    const { rows } = await pool.query(
      `SELECT c.name, count(u.id)::int n FROM classes c JOIN users u ON u.class_id=c.id GROUP BY c.name ORDER BY c.name`);
    expect(rows.map(r => r.name)).toEqual(['10A', '10B', '11A']);
    for (const r of rows) expect(r.n).toBeGreaterThanOrEqual(18);
  });

  it('creates four teachers and one principal, each assigned to at least one class', async () => {
    expect(await count(`SELECT count(*) c FROM users WHERE role='teacher'`)).toBe(4);
    expect(await count(`SELECT count(*) c FROM users WHERE role='principal'`)).toBe(1);
    expect(await count(`SELECT count(*) c FROM users u WHERE u.role='teacher'
       AND NOT EXISTS (SELECT 1 FROM teacher_classes tc WHERE tc.teacher_id=u.id)`)).toBe(0);
  });

  it('includes Arabic names stored intact', async () => {
    const { rows } = await pool.query(`SELECT full_name FROM users WHERE full_name ~ '[\\u0600-\\u06FF]' LIMIT 1`);
    expect(rows.length).toBe(1);
    expect(rows[0].full_name).toMatch(/[؀-ۿ]/);
  });

  it('ships both scoring modes from the same teacher, proving the setting lives on the quiz', async () => {
    const { rows } = await pool.query(
      `SELECT author_id, bool_or(negative_marking) has_on, bool_or(NOT negative_marking) has_off
         FROM quizzes GROUP BY author_id HAVING bool_or(negative_marking) AND bool_or(NOT negative_marking)`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('leaves at least two quizzes open so a reviewer can sit one and still explore', async () => {
    expect(await count(
      `SELECT count(*) c FROM quizzes WHERE is_published AND now() BETWEEN opens_at AND closes_at`))
      .toBeGreaterThanOrEqual(2);
  });

  it('ships a closed quiz that already has results, so reports are not empty on first login', async () => {
    expect(await count(
      `SELECT count(*) c FROM attempts a JOIN quizzes q ON q.id=a.quiz_id
        WHERE a.submitted_at IS NOT NULL AND q.closes_at < now()`)).toBeGreaterThan(0);
  });

  it('gives every question exactly four options and exactly one correct', async () => {
    expect(await count(
      `SELECT count(*) c FROM questions q WHERE
         (SELECT count(*) FROM options o WHERE o.question_id=q.id) <> 4
      OR (SELECT count(*) FROM options o WHERE o.question_id=q.id AND o.is_correct) <> 1`)).toBe(0);
  });

  it('is idempotent — running twice changes nothing', async () => {
    const before = await count(`SELECT count(*) c FROM users`);
    await seed();
    expect(await count(`SELECT count(*) c FROM users`)).toBe(before);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- seed`
Expected: FAIL — cannot resolve `seed/index.js`.

- [x] **Step 3: Write the CSV parser**

`api/src/seed/csv.ts` — quoted fields with embedded commas are required, since Arabic text and question wording contain them:
```ts
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', inQuotes = false;
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!header) return [];
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}
```

- [x] **Step 4: Author the sample data**

Write the CSV files. Requirements the tests enforce:

| File | Contents |
|---|---|
| `classes.csv` | `10A`, `10B`, `11A` |
| `teachers.csv` | 4 teachers + 1 principal (`role` column: `teacher`/`principal`). Mixed Arabic and Latin names. Password `pass1234` for all — documented in the README. |
| `students.csv` | 60 students, 20 per class. Majority Arabic Jordanian names (e.g. ليلى حداد, عمر الخطيب, نور الدين سعيد), some Latin. Login codes `10A-001`…`11A-020`. |
| `teacher-classes.csv` | Every teacher assigned to at least one class; at least two teachers share a class, so D-09's intersection is exercisable. |
| `quizzes.csv` | Five quizzes per the table below. |

| Quiz | Language | Neg. | Window (days from seed) | Published |
|---|---|---|---|---|
| Algebra Basics | en | off | −10 → −3 | yes, with attempts |
| النحو العربي | ar | **on** | −9 → −2 | yes, with attempts |
| Geometry | en | on | −1 → +6 | yes, open now |
| تاريخ الأردن | ar | off | −1 → +6 | yes, open now |
| القراءة | ar | off | +3 → +10 | yes, not open yet |

Algebra and Geometry must share an author so the "same teacher, both modes" test passes. Each quiz file has 15 rows, four options, varied `points` (use `100` and `200` hundredths so the totals match the worked papers).

- [x] **Step 5: Write the seeder**

`api/src/seed/index.ts`. Structure — keep each loader a named function so failures point at a file:
```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../db/pool.js';
import { hashPassword } from '../auth/password.js';
import { parseCsv } from './csv.js';
import { gradeAnswer, totalScore } from '../domain/scoring.js';

const DATA = process.env.SEED_DIR ?? join(process.cwd(), 'data');
const read = async (f: string) => parseCsv(await readFile(join(DATA, f), 'utf8'));

export async function seed(): Promise<void> {
  // Idempotence guard: the seed is a fixed dataset, so one marker row is enough.
  const { rowCount } = await pool.query(`SELECT 1 FROM users WHERE login_code = 'principal'`);
  if (rowCount) return;

  await seedClasses();
  await seedUsers();
  await seedTeacherClasses();
  await seedQuizzes();
  await seedHistoricAttempts();   // gives closed quizzes results so reports are not empty
}
```

Implement each function with plain `INSERT ... RETURNING id` and a `Map<string, number>` from natural key to id. `seedHistoricAttempts` must produce answers through `gradeAnswer` and totals through `totalScore` — **never hand-written score values**, or the seed can disagree with the scoring rules it is meant to demonstrate.

- [x] **Step 6: Run migrate and seed on boot (D-18)**

Modify `api/src/index.ts`:
```ts
import { createApp } from './app.js';
import { migrate } from './db/migrate.js';
import { seed } from './seed/index.js';

await migrate();
await seed();
const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => console.log(`api listening on ${port}`));
```

Add to `api/package.json` scripts: `"seed": "node dist/seed/cli.js"` with a two-line `cli.ts` calling `migrate()` then `seed()`, so the README can document it explicitly even though boot handles it.

- [x] **Step 7: Run the tests**

Run: `npm test -w api -- seed`
Expected: PASS, 8 tests.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: CSV sample data and idempotent seeder sharing the import format"
```

---

### Task 7: Quiz authoring

**Files:**
- Create: `api/src/routes/quizzes.ts`, `api/src/serializers/quiz.ts`, `api/src/db/quizzes.ts`
- Modify: `shared/src/schemas.ts`, `api/src/app.ts`
- Test: `api/test/quizzes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `requireRole`, `validate`, `pool`.
- Produces:
  - `POST /api/quizzes` → `{ id }`
  - `POST /api/quizzes/:id/questions` → `{ id }`
  - `PATCH /api/quizzes/:id` → `204`
  - `POST /api/quizzes/:id/publish` → `204` or `422 { error: 'not_publishable', problems: string[] }`
  - `GET /api/quizzes` → role-scoped list
  - `serializeQuizForTeacher(row)`, `serializeQuizForStudent(row)` — **the student shape never includes `is_correct`**
  - `teacherScope(teacherId)` SQL fragment, exported from `api/src/db/quizzes.ts` and used by every teacher-scoped query (D-09)

- [x] **Step 1: Write the failing test**

`api/test/quizzes.test.ts` — the important cases are the publish validation and the class-targeting guard:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

describe('POST /api/quizzes', () => {
  it('lets a teacher create a quiz targeted at a class they teach', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send({
      title: 'Algebra', language: 'en', timeLimitMinutes: 20,
      opensAt: new Date(Date.now() - 3600e3).toISOString(),
      closesAt: new Date(Date.now() + 3600e3).toISOString(),
      negativeMarking: true, classIds: [1],
    });
    expect(res.status).toBe(201);
  });

  it('refuses to target a class the teacher does not teach', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send({
      title: 'X', language: 'en', timeLimitMinutes: 20,
      opensAt: new Date().toISOString(), closesAt: new Date(Date.now() + 3600e3).toISOString(),
      negativeMarking: false, classIds: [3],
    });
    expect(res.status).toBe(403);
  });

  it('refuses a window that closes before it opens', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const res = await agent.post('/api/quizzes').send({
      title: 'X', language: 'en', timeLimitMinutes: 20,
      opensAt: new Date(Date.now() + 3600e3).toISOString(), closesAt: new Date().toISOString(),
      negativeMarking: false, classIds: [1],
    });
    expect(res.status).toBe(400);
  });

  it('refuses a student outright', async () => {
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post('/api/quizzes').send({})).status).toBe(403);
  });
});

describe('POST /api/quizzes/:id/publish', () => {
  it('refuses a quiz with no questions', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body } = await agent.post('/api/quizzes').send(validQuizBody());
    const res = await agent.post(`/api/quizzes/${body.id}/publish`);
    expect(res.status).toBe(422);
    expect(res.body.problems).toContain('no_questions');
  });

  it('refuses a question that does not have exactly four options with one correct', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    await agent.post(`/api/quizzes/${quiz.id}/questions`).send({
      text: 'Q', points: 100,
      options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }],
    });
    const res = await agent.post(`/api/quizzes/${quiz.id}/publish`);
    expect(res.status).toBe(422);
    expect(res.body.problems.join()).toMatch(/option/);
  });

  it('publishes a complete quiz', async () => {
    const agent = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await agent.post('/api/quizzes').send(validQuizBody());
    await agent.post(`/api/quizzes/${quiz.id}/questions`).send(validQuestionBody());
    expect((await agent.post(`/api/quizzes/${quiz.id}/publish`)).status).toBe(204);
  });

  it('refuses to publish another teacher\'s quiz', async () => {
    const samir = await loginAs(app, 'teacher-samir');
    const { body: quiz } = await samir.post('/api/quizzes').send(validQuizBody());
    const rana = await loginAs(app, 'teacher-rana');
    expect((await rana.post(`/api/quizzes/${quiz.id}/publish`)).status).toBe(404);
  });
});

function validQuizBody() {
  return { title: 'Q', language: 'en', timeLimitMinutes: 20,
    opensAt: new Date(Date.now() - 3600e3).toISOString(),
    closesAt: new Date(Date.now() + 3600e3).toISOString(),
    negativeMarking: false, classIds: [1] };
}
function validQuestionBody() {
  return { text: 'Q1', points: 100, options: [
    { text: 'a', isCorrect: true }, { text: 'b', isCorrect: false },
    { text: 'c', isCorrect: false }, { text: 'd', isCorrect: false }] };
}
```

- [x] **Step 2: Write the shared world helper**

`api/test/helpers/world.ts` — every later test file uses this, so build it once:
```ts
import request from 'supertest';
import type { Express } from 'express';
import { pool } from '../../src/db/pool.js';
import { hashPassword } from '../../src/auth/password.js';

/**
 * Classes 1=10A 2=10B 3=11A.
 * teacher-samir teaches 10A and 10B; teacher-rana teaches 10A only.
 * Both teach 10A, which is what makes D-09's intersection testable.
 * Students 10A-001 (class 1), 10B-001 (class 2), 11A-001 (class 3).
 */
export async function makeWorld() {
  const hash = await hashPassword('pass1234');
  for (const name of ['10A', '10B', '11A']) await pool.query(`INSERT INTO classes(name) VALUES ($1)`, [name]);
  await pool.query(`INSERT INTO users(role, full_name, login_code, password_hash) VALUES
    ('teacher','Samir Odeh','teacher-samir',$1), ('teacher','رنا مصطفى','teacher-rana',$1),
    ('principal','نور العلي','principal',$1)`, [hash]);
  await pool.query(`INSERT INTO users(role, full_name, login_code, password_hash, class_id) VALUES
    ('student','ليلى حداد','10A-001',$1,1), ('student','عمر الخطيب','10A-002',$1,1),
    ('student','Dana Haddad','10B-001',$1,2), ('student','Yousef Ali','11A-001',$1,3)`, [hash]);
  await pool.query(`INSERT INTO teacher_classes(teacher_id, class_id)
    SELECT id, 1 FROM users WHERE login_code='teacher-samir'
    UNION ALL SELECT id, 2 FROM users WHERE login_code='teacher-samir'
    UNION ALL SELECT id, 1 FROM users WHERE login_code='teacher-rana'`);
}

export async function loginAs(app: Express, loginCode: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ loginCode, password: 'pass1234' });
  if (res.status !== 200) throw new Error(`login failed for ${loginCode}: ${res.status}`);
  return agent;
}
```

- [x] **Step 3: Run and watch it fail**

Run: `npm test -w api -- quizzes`
Expected: FAIL — 404 on `POST /api/quizzes`.

- [x] **Step 4: Add the schemas**

Append to `shared/src/schemas.ts`:
```ts
export const createQuizBody = z.object({
  title: z.string().min(1).max(200),
  language: z.enum(['en', 'ar']),
  timeLimitMinutes: z.number().int().min(1).max(300),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  negativeMarking: z.boolean(),
  classIds: z.array(z.number().int().positive()).min(1),
}).refine(q => new Date(q.closesAt) > new Date(q.opensAt), {
  message: 'closesAt must be after opensAt', path: ['closesAt'],
});
export type CreateQuizBody = z.infer<typeof createQuizBody>;

export const createQuestionBody = z.object({
  text: z.string().min(1).max(2000),
  points: z.number().int().positive().max(100_000),   // hundredths
  options: z.array(z.object({ text: z.string().min(1).max(500), isCorrect: z.boolean() })).length(4),
});
export type CreateQuestionBody = z.infer<typeof createQuestionBody>;
```

- [x] **Step 5: Write the D-09 scope fragment once**

`api/src/db/quizzes.ts`:
```ts
/**
 * D-09: a teacher sees their own quizzes, in the classes they are assigned to.
 * This predicate is the entirety of that rule and must not be reimplemented elsewhere.
 * $1 = teacher id.
 */
export const TEACHER_SCOPE = `
  q.author_id = $1
  AND EXISTS (
    SELECT 1 FROM quiz_classes qc
      JOIN teacher_classes tc ON tc.class_id = qc.class_id AND tc.teacher_id = $1
     WHERE qc.quiz_id = q.id)
`;
```

- [x] **Step 6: Implement the routes**

`api/src/routes/quizzes.ts`. Rules the implementation must follow:
- Creating a quiz: reject `classIds` containing a class the teacher is not assigned to → **403**.
- Fetching a quiz for edit/publish: filter by `TEACHER_SCOPE` for teachers, unrestricted for the principal. A miss is **404**, never 403 — do not confirm the id exists.
- Publish validation returns `422 { error: 'not_publishable', problems: [...] }` where `problems` may contain `'no_questions'`, `'question_N_needs_four_options'`, `'question_N_needs_one_correct_option'`.
- Adding a question assigns `position = COALESCE(MAX(position),0)+1` inside the same transaction as its options.

- [x] **Step 7: Run the tests**

Run: `npm test -w api -- quizzes`
Expected: PASS, 9 tests.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: quiz authoring with publish validation and teacher class scoping"
```

---
## Phase 3 — The attempt lifecycle and reporting (Tasks 8-12)

*Ends with: a complete, hostile-tested API. Everything the reviewer will try to break is covered here.*

### Task 8: Starting and resuming an attempt

**Files:**
- Create: `api/src/routes/attempts.ts`, `api/src/serializers/attempt.ts`, `api/src/db/attempts.ts`
- Modify: `shared/src/schemas.ts`, `api/src/app.ts`
- Test: `api/test/attempts-start.test.ts`

**Interfaces:**
- Consumes: `canStart`, `attemptState` (Task 4), `TEACHER_SCOPE` (Task 7).
- Produces:
  - `POST /api/quizzes/:id/attempt` → `201 { attemptId }`, or `409 { error: <StartRefusal> }`, or `404`
  - `GET /api/attempts/:id` → `{ attempt: { id, expiresAt, submittedAt, state }, serverNow, quiz: {...}, questions: [...], answers: [...] }`
  - `serializeQuestionForAttempt(q)` — **returns `{ id, position, text, points, options: [{ id, position, text }] }` and nothing else. No `isCorrect` field exists on this shape.**

- [x] **Step 1: Write the failing test**

`api/test/attempts-start.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';
import { makeQuiz } from './helpers/quiz.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

describe('POST /api/quizzes/:id/attempt', () => {
  it('starts an attempt and fixes the deadline from the server clock', async () => {
    const quiz = await makeQuiz({ classIds: [1], timeLimitMinutes: 20 });
    const agent = await loginAs(app, '10A-001');
    const res = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect(res.status).toBe(201);

    const { rows: [a] } = await pool.query(`SELECT started_at, expires_at FROM attempts WHERE id=$1`, [res.body.attemptId]);
    const minutes = (new Date(a.expires_at).getTime() - new Date(a.started_at).getTime()) / 60000;
    expect(minutes).toBeCloseTo(20, 1);
  });

  it('refuses a second attempt', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('already_attempted');
  });

  it('creates exactly one attempt when two requests race', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const results = await Promise.all([
      agent.post(`/api/quizzes/${quiz.id}/attempt`),
      agent.post(`/api/quizzes/${quiz.id}/attempt`),
    ]);
    expect(results.filter(r => r.status === 201)).toHaveLength(1);
    expect(results.filter(r => r.status === 409)).toHaveLength(1);
    const { rows } = await pool.query(`SELECT count(*)::int c FROM attempts WHERE quiz_id=$1`, [quiz.id]);
    expect(rows[0].c).toBe(1);
  });

  it('refuses before the window opens and after it closes', async () => {
    const future = await makeQuiz({ classIds: [1], opensInDays: 2, closesInDays: 5 });
    const past = await makeQuiz({ classIds: [1], opensInDays: -5, closesInDays: -2 });
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post(`/api/quizzes/${future.id}/attempt`)).body.error).toBe('not_open_yet');
    expect((await agent.post(`/api/quizzes/${past.id}/attempt`)).body.error).toBe('closed');
  });

  it('refuses a student whose class was not targeted', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '11A-001');
    expect((await agent.post(`/api/quizzes/${quiz.id}/attempt`)).status).toBe(404);
  });

  it('refuses an unpublished quiz', async () => {
    const quiz = await makeQuiz({ classIds: [1], publish: false });
    const agent = await loginAs(app, '10A-001');
    expect((await agent.post(`/api/quizzes/${quiz.id}/attempt`)).status).toBe(404);
  });

  it('refuses a teacher', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, 'teacher-samir');
    expect((await agent.post(`/api/quizzes/${quiz.id}/attempt`)).status).toBe(403);
  });
});

describe('GET /api/attempts/:id', () => {
  it('never includes which option is correct', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.get(`/api/attempts/${body.attemptId}`);
    expect(res.status).toBe(200);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toMatch(/isCorrect|is_correct/);
    expect(payload).not.toMatch(/"correct"/);
  });

  it('returns the server clock alongside the deadline', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const res = await agent.get(`/api/attempts/${body.attemptId}`);
    expect(new Date(res.body.serverNow).getTime()).toBeGreaterThan(0);
    expect(new Date(res.body.attempt.expiresAt).getTime())
      .toBeGreaterThan(new Date(res.body.serverNow).getTime());
  });

  it("returns 404, not 403, for another student's attempt", async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    const other = await loginAs(app, '10A-002');
    expect((await other.get(`/api/attempts/${body.attemptId}`)).status).toBe(404);
  });
});
```

- [x] **Step 2: Write the quiz test helper**

`api/test/helpers/quiz.ts`:
```ts
import { pool } from '../../src/db/pool.js';

interface Opts {
  classIds: number[]; authorLogin?: string; timeLimitMinutes?: number;
  opensInDays?: number; closesInDays?: number; negativeMarking?: boolean;
  publish?: boolean; questions?: { points: number }[];
}

/** Builds a quiz with N questions, four options each, option index 0 correct. */
export async function makeQuiz(o: Opts) {
  const { rows: [author] } = await pool.query(
    `SELECT id FROM users WHERE login_code=$1`, [o.authorLogin ?? 'teacher-samir']);
  const { rows: [q] } = await pool.query(
    `INSERT INTO quizzes(title, author_id, language, time_limit_minutes, opens_at, closes_at,
                         negative_marking, is_published)
     VALUES ('Test', $1, 'en', $2, now() + ($3 || ' days')::interval, now() + ($4 || ' days')::interval, $5, $6)
     RETURNING id`,
    [author.id, o.timeLimitMinutes ?? 20, o.opensInDays ?? -1, o.closesInDays ?? 1,
     o.negativeMarking ?? false, o.publish ?? true]);
  for (const cid of o.classIds) await pool.query(`INSERT INTO quiz_classes VALUES ($1,$2)`, [q.id, cid]);

  const specs = o.questions ?? [{ points: 100 }, { points: 200 }];
  const questions = [];
  for (const [i, spec] of specs.entries()) {
    const { rows: [qq] } = await pool.query(
      `INSERT INTO questions(quiz_id, position, text, points) VALUES ($1,$2,$3,$4) RETURNING id`,
      [q.id, i + 1, `Question ${i + 1}`, spec.points]);
    const options = [];
    for (let j = 0; j < 4; j++) {
      const { rows: [op] } = await pool.query(
        `INSERT INTO options(question_id, position, text, is_correct) VALUES ($1,$2,$3,$4) RETURNING id`,
        [qq.id, j + 1, `Option ${j + 1}`, j === 0]);
      options.push({ id: Number(op.id), isCorrect: j === 0 });
    }
    questions.push({ id: Number(qq.id), points: spec.points, options });
  }
  return { id: Number(q.id), questions };
}
```

- [x] **Step 3: Run and watch it fail**

Run: `npm test -w api -- attempts-start`
Expected: FAIL — 404 on the attempt route.

- [x] **Step 4: Implement**

`api/src/routes/attempts.ts`. Rules:
- Load the quiz with its `classIds` and the caller's existing attempt in one query, then call `canStart` — the route contains no scheduling logic of its own.
- Map refusals to status codes: `not_published` and `wrong_class` → **404** (do not reveal that a quiz the student may not see exists); `not_open_yet`, `closed`, `already_attempted` → **409** with `{ error: reason }`.
- `INSERT` computes the deadline in SQL so the database clock is the only clock:
  ```sql
  INSERT INTO attempts(quiz_id, student_id, started_at, expires_at, max_score)
  VALUES ($1, $2, now(), now() + ($3 || ' minutes')::interval, $4)
  RETURNING id
  ```
- Catch unique-violation `23505` on that insert and return `409 already_attempted`. **This is what makes the race test pass** — `canStart` alone cannot, because two requests can both read "no attempt" before either writes.
- `max_score` is `SUM(points)` over the quiz's questions, snapshotted at start.
- `GET /api/attempts/:id` requires the attempt's `student_id` to equal `req.user.id`, else 404.

- [x] **Step 5: Run the tests**

Run: `npm test -w api -- attempts-start`
Expected: PASS, 10 tests. If the race test intermittently produces two 201s, the unique-violation catch is missing.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: attempt start with database-enforced single attempt and server clock"
```

---

### Task 9: Saving and grading answers

**Files:**
- Modify: `api/src/routes/attempts.ts`, `shared/src/schemas.ts`
- Test: `api/test/attempts-answer.test.ts`

**Interfaces:**
- Consumes: `canSaveAnswer`, `ANSWER_GRACE_MS`, `gradeAnswer`.
- Produces: `PUT /api/attempts/:id/answers/:questionId` → `200 { saved: true }` · `409 { error: 'attempt_closed' }` · `400` · `404`

- [x] **Step 1: Write the failing test**

`api/test/attempts-answer.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';
import { makeQuiz } from './helpers/quiz.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

async function startAttempt(negativeMarking = false) {
  const quiz = await makeQuiz({ classIds: [1], negativeMarking, questions: [{ points: 100 }, { points: 200 }] });
  const agent = await loginAs(app, '10A-001');
  const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
  return { quiz, agent, attemptId: body.attemptId as number };
}

describe('PUT /api/attempts/:id/answers/:questionId', () => {
  it('grades the answer at save time', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const q = quiz.questions[0];
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0].id });
    const { rows: [a] } = await pool.query(
      `SELECT points_possible, points_awarded FROM answers WHERE attempt_id=$1 AND question_id=$2`,
      [attemptId, q.id]);
    expect(a.points_possible).toBe(100);
    expect(a.points_awarded).toBe(100);
  });

  it('applies the one-third deduction when the quiz has negative marking on', async () => {
    const { quiz, agent, attemptId } = await startAttempt(true);
    const q = quiz.questions[1];   // 2 marks
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[1].id });   // wrong
    const { rows: [a] } = await pool.query(
      `SELECT points_awarded FROM answers WHERE attempt_id=$1 AND question_id=$2`, [attemptId, q.id]);
    expect(a.points_awarded).toBe(-67);
  });

  it('awards zero for a wrong answer when negative marking is off', async () => {
    const { quiz, agent, attemptId } = await startAttempt(false);
    const q = quiz.questions[1];
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[1].id });
    const { rows: [a] } = await pool.query(
      `SELECT points_awarded FROM answers WHERE attempt_id=$1 AND question_id=$2`, [attemptId, q.id]);
    expect(a.points_awarded).toBe(0);
  });

  it('lets a student change their answer, replacing the grade', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const q = quiz.questions[0];
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`).send({ selectedOptionId: q.options[1].id });
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`).send({ selectedOptionId: q.options[0].id });
    const { rows } = await pool.query(`SELECT points_awarded FROM answers WHERE attempt_id=$1`, [attemptId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].points_awarded).toBe(100);
  });

  it('accepts a null selection as a blank, scoring zero and never penalising', async () => {
    const { quiz, agent, attemptId } = await startAttempt(true);
    const q = quiz.questions[0];
    await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`).send({ selectedOptionId: null });
    const { rows: [a] } = await pool.query(
      `SELECT points_awarded FROM answers WHERE attempt_id=$1 AND question_id=$2`, [attemptId, q.id]);
    expect(a.points_awarded).toBe(0);
  });

  it('refuses an option belonging to a different question', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[1].options[0].id });
    expect(res.status).toBe(400);
  });

  it('refuses a question belonging to a different quiz', async () => {
    const { agent, attemptId } = await startAttempt();
    const other = await makeQuiz({ classIds: [1] });
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${other.questions[0].id}`)
      .send({ selectedOptionId: other.questions[0].options[0].id });
    expect(res.status).toBe(400);
  });

  it('accepts a save inside the latency grace window', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '2 seconds' WHERE id=$1`, [attemptId]);
    const q = quiz.questions[0];
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0].id });
    expect(res.status).toBe(200);
  });

  it('refuses a save past the grace window', async () => {
    const { quiz, agent, attemptId } = await startAttempt();
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '30 seconds' WHERE id=$1`, [attemptId]);
    const q = quiz.questions[0];
    const res = await agent.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0].id });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('attempt_closed');
  });

  it("refuses to write into another student's attempt", async () => {
    const { quiz, attemptId } = await startAttempt();
    const other = await loginAs(app, '10A-002');
    const q = quiz.questions[0];
    const res = await other.put(`/api/attempts/${attemptId}/answers/${q.id}`)
      .send({ selectedOptionId: q.options[0].id });
    expect(res.status).toBe(404);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- attempts-answer`
Expected: FAIL — 404 on the answer route.

- [x] **Step 3: Add the schema**

Append to `shared/src/schemas.ts`:
```ts
export const saveAnswerBody = z.object({
  selectedOptionId: z.number().int().positive().nullable(),
});
export type SaveAnswerBody = z.infer<typeof saveAnswerBody>;
```

- [x] **Step 4: Implement**

In `api/src/routes/attempts.ts`, the handler in order:

1. Load the attempt joined to its quiz; require `student_id = req.user.id`, else **404**.
2. `canSaveAnswer({ expiresAt, submittedAt }, new Date())` — false → **409 `attempt_closed`**.
3. Load the question, asserting `question.quiz_id = attempt.quiz_id`, else **400**.
4. If `selectedOptionId` is not null, load the option asserting `option.question_id = question.id`, else **400**. *This is the check that stops an answer being smuggled in from another question.*
5. `isCorrect = selectedOptionId === null ? null : option.is_correct`.
6. `awarded = gradeAnswer(question.points, isCorrect, quiz.negative_marking)`.
7. Upsert, snapshotting both values (D-08):
   ```sql
   INSERT INTO answers(attempt_id, question_id, selected_option_id, points_possible, points_awarded)
   VALUES ($1,$2,$3,$4,$5)
   ON CONFLICT (attempt_id, question_id) DO UPDATE
     SET selected_option_id = EXCLUDED.selected_option_id,
         points_possible    = EXCLUDED.points_possible,
         points_awarded     = EXCLUDED.points_awarded,
         answered_at        = now()
   ```

- [x] **Step 5: Run the tests**

Run: `npm test -w api -- attempts-answer`
Expected: PASS, 10 tests.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: grade each answer at save time with cross-question tampering guards"
```

---

### Task 10: Submission and the expiry sweeper

**Files:**
- Create: `api/src/sweeper.ts`
- Modify: `api/src/routes/attempts.ts`, `api/src/index.ts`
- Test: `api/test/attempts-submit.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/attempts/:id/submit` → `200 { displayScore, maxScore }` · `404`
  - `finalizeExpiredAttempts(): Promise<number>` — returns how many were closed
  - `startSweeper(intervalMs?: number): NodeJS.Timeout`

- [x] **Step 1: Write the failing test**

`api/test/attempts-submit.test.ts`:
```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { migrate } from '../src/db/migrate.js';
import { finalizeExpiredAttempts } from '../src/sweeper.js';
import { resetDb } from './helpers/db.js';
import { makeWorld, loginAs } from './helpers/world.js';
import { makeQuiz } from './helpers/quiz.js';

const app = createApp();
beforeAll(async () => { await migrate(); });
beforeEach(async () => { await resetDb(); await makeWorld(); });
afterAll(async () => { await pool.end(); });

describe('POST /api/attempts/:id/submit', () => {
  it('stamps the attempt and denormalises the totals', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }, { points: 200 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[0].options[0].id });

    const res = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ displayScore: 100, maxScore: 300 });

    const { rows: [a] } = await pool.query(`SELECT submitted_at, submitted_reason FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(a.submitted_at).not.toBeNull();
    expect(a.submitted_reason).toBe('manual');
  });

  it('floors a negative raw total at zero for display but stores the raw value', async () => {
    const quiz = await makeQuiz({ classIds: [1], negativeMarking: true, questions: [{ points: 100 }, { points: 200 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    for (const q of quiz.questions) {
      await agent.put(`/api/attempts/${body.attemptId}/answers/${q.id}`)
        .send({ selectedOptionId: q.options[1].id });   // both wrong
    }
    const res = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    expect(res.body.displayScore).toBe(0);
    const { rows: [a] } = await pool.query(`SELECT raw_score, display_score FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(a.raw_score).toBe(-100);   // -33 + -67
    expect(a.display_score).toBe(0);
  });

  it('is idempotent — a second submit does not change the score', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    const first = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    const second = await agent.post(`/api/attempts/${body.attemptId}/submit`);
    expect(second.status).toBe(200);
    expect(second.body.displayScore).toBe(first.body.displayScore);
  });

  it('accepts a submit after expiry but adds no answers', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);
    expect((await agent.post(`/api/attempts/${body.attemptId}/submit`)).status).toBe(200);
    const { rows } = await pool.query(`SELECT count(*)::int c FROM answers WHERE attempt_id=$1`, [body.attemptId]);
    expect(rows[0].c).toBe(0);
  });
});

describe('finalizeExpiredAttempts', () => {
  it('closes an abandoned attempt and scores what was answered', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }, { points: 200 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[0].options[0].id });
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);

    expect(await finalizeExpiredAttempts()).toBe(1);
    const { rows: [a] } = await pool.query(
      `SELECT submitted_at, submitted_reason, display_score FROM attempts WHERE id=$1`, [body.attemptId]);
    expect(a.submitted_reason).toBe('expired');
    expect(a.display_score).toBe(100);
    expect(new Date(a.submitted_at).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('is idempotent — a second run finds nothing', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await pool.query(`UPDATE attempts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [body.attemptId]);
    expect(await finalizeExpiredAttempts()).toBe(1);
    expect(await finalizeExpiredAttempts()).toBe(0);
  });

  it('leaves a live attempt alone', async () => {
    const quiz = await makeQuiz({ classIds: [1] });
    const agent = await loginAs(app, '10A-001');
    await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    expect(await finalizeExpiredAttempts()).toBe(0);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- attempts-submit`
Expected: FAIL — cannot resolve `sweeper.js`.

- [x] **Step 3: Implement the sweeper**

`api/src/sweeper.ts` — one statement, so concurrent runs are harmless:
```ts
import { pool } from './db/pool.js';

/**
 * Closes attempts whose deadline has passed without a submit. Answers are already
 * graded at save time, so the totals are a plain aggregate (spec §6).
 * Safe to run concurrently: the WHERE clause makes it idempotent.
 */
export async function finalizeExpiredAttempts(): Promise<number> {
  const { rowCount } = await pool.query(`
    WITH totals AS (
      SELECT a.id, COALESCE(SUM(ans.points_awarded), 0)::int AS raw
        FROM attempts a LEFT JOIN answers ans ON ans.attempt_id = a.id
       WHERE a.submitted_at IS NULL AND a.expires_at < now()
       GROUP BY a.id
    )
    UPDATE attempts a
       SET submitted_at     = a.expires_at,
           submitted_reason = 'expired',
           raw_score        = t.raw,
           display_score    = GREATEST(0, t.raw)
      FROM totals t
     WHERE a.id = t.id AND a.submitted_at IS NULL
  `);
  return rowCount ?? 0;
}

export function startSweeper(intervalMs = 60_000): NodeJS.Timeout {
  const timer = setInterval(() => {
    finalizeExpiredAttempts().catch(err => console.error('sweeper failed', err));
  }, intervalMs);
  timer.unref();
  return timer;
}
```

- [x] **Step 4: Implement submit**

In `api/src/routes/attempts.ts`. Reuse the same totals aggregate so submit and sweeper cannot drift:
```sql
UPDATE attempts a
   SET submitted_at     = COALESCE(a.submitted_at, now()),
       submitted_reason = COALESCE(a.submitted_reason, 'manual'),
       raw_score        = t.raw,
       display_score    = GREATEST(0, t.raw)
  FROM (SELECT COALESCE(SUM(points_awarded),0)::int AS raw FROM answers WHERE attempt_id = $1) t
 WHERE a.id = $1 AND a.student_id = $2
 RETURNING a.display_score, a.max_score
```
`COALESCE` on both stamp columns is what makes a repeat submit idempotent. No rows returned → **404**.

- [x] **Step 5: Start the sweeper on boot**

Modify `api/src/index.ts` — add `startSweeper();` after `await seed();`.

- [x] **Step 6: Run the tests**

Run: `npm test -w api -- attempts-submit`
Expected: PASS, 7 tests.

- [x] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: submission and idempotent expiry sweeper for abandoned attempts"
```

---

### Task 11: Results and the review gate

**Files:**
- Create: `api/src/routes/results.ts`, `api/src/serializers/result.ts`
- Modify: `api/src/app.ts`
- Test: `api/test/results.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/attempts/:id/result` → locked: `{ locked: true, displayScore, maxScore, answersAvailableAt }` · unlocked: adds `questions: [{ id, text, points, yourOptionId, correctOptionId, awarded }]`
  - `GET /api/students/me/history` → `[{ quizId, title, displayScore, maxScore, submittedAt, reviewAvailableAt }]`

- [x] **Step 1: Write the failing test**

`api/test/results.test.ts` — the locked-payload leak test is the one that matters:
```ts
describe('GET /api/attempts/:id/result', () => {
  it('returns the score immediately after submitting, while the quiz is still open', async () => {
    const quiz = await makeQuiz({ classIds: [1], closesInDays: 2, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[0].options[0].id });
    await agent.post(`/api/attempts/${body.attemptId}/submit`);

    const res = await agent.get(`/api/attempts/${body.attemptId}/result`);
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.displayScore).toBe(100);
    expect(res.body.answersAvailableAt).toBeTruthy();
  });

  it('does not leak the correct option while the review is locked', async () => {
    const quiz = await makeQuiz({ classIds: [1], closesInDays: 2, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.post(`/api/attempts/${body.attemptId}/submit`);
    const res = await agent.get(`/api/attempts/${body.attemptId}/result`);
    const payload = JSON.stringify(res.body);
    expect(payload).not.toMatch(/correctOptionId|is_correct|isCorrect/);
    expect(res.body.questions).toBeUndefined();
  });

  it('unlocks the review once the quiz has closed', async () => {
    const quiz = await makeQuiz({ classIds: [1], opensInDays: -2, closesInDays: 2, questions: [{ points: 100 }] });
    const agent = await loginAs(app, '10A-001');
    const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
    await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[0].options[1].id });
    await agent.post(`/api/attempts/${body.attemptId}/submit`);
    await pool.query(`UPDATE quizzes SET closes_at = now() - interval '1 minute' WHERE id=$1`, [quiz.id]);

    const res = await agent.get(`/api/attempts/${body.attemptId}/result`);
    expect(res.body.locked).toBe(false);
    expect(res.body.questions[0].correctOptionId).toBe(quiz.questions[0].options[0].id);
    expect(res.body.questions[0].yourOptionId).toBe(quiz.questions[0].options[1].id);
    expect(res.body.questions[0].awarded).toBe(0);
  });

  it("returns 404 for another student's result", async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    await owner.post(`/api/attempts/${body.attemptId}/submit`);
    const other = await loginAs(app, '10A-002');
    expect((await other.get(`/api/attempts/${body.attemptId}/result`)).status).toBe(404);
  });
});

describe('GET /api/students/me/history', () => {
  it("lists the student's own attempts with scores, newest first", async () => {
    const agent = await loginAs(app, '10A-001');
    for (const closesInDays of [-1, 2]) {
      const quiz = await makeQuiz({ classIds: [1], opensInDays: -3, closesInDays, questions: [{ points: 100 }] });
      const { body } = await agent.post(`/api/quizzes/${quiz.id}/attempt`);
      await agent.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
        .send({ selectedOptionId: quiz.questions[0].options[0].id });
      await agent.post(`/api/attempts/${body.attemptId}/submit`);
    }
    const res = await agent.get('/api/students/me/history');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ displayScore: 100, maxScore: 100 });
    expect(res.body[0].submittedAt >= res.body[1].submittedAt).toBe(true);
  });

  it('is empty for a student who has taken nothing', async () => {
    const agent = await loginAs(app, '10A-002');
    const res = await agent.get('/api/students/me/history');
    expect(res.body).toEqual([]);
  });

  it("never includes another student's attempts", async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const owner = await loginAs(app, '10A-001');
    const { body } = await owner.post(`/api/quizzes/${quiz.id}/attempt`);
    await owner.post(`/api/attempts/${body.attemptId}/submit`);
    const other = await loginAs(app, '10A-002');
    expect((await other.get('/api/students/me/history')).body).toEqual([]);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- results`
Expected: FAIL — 404 on the result route.

- [x] **Step 3: Implement**

`api/src/serializers/result.ts` — **two separate functions, not one with a flag.** The locked serializer has no code path that can reach `correctOptionId`:
```ts
export const serializeLockedResult = (a: { displayScore: number; maxScore: number; closesAt: Date }) => ({
  locked: true as const,
  displayScore: a.displayScore,
  maxScore: a.maxScore,
  answersAvailableAt: a.closesAt.toISOString(),
});

export const serializeUnlockedResult = (a: {
  displayScore: number; maxScore: number;
  questions: { id: number; text: string; points: number;
               yourOptionId: number | null; correctOptionId: number; awarded: number }[];
}) => ({ locked: false as const, displayScore: a.displayScore, maxScore: a.maxScore, questions: a.questions });
```

The route decides with `new Date() >= quiz.closes_at` (D-10) and calls one or the other. The unlocked branch runs a second query to fetch correct options; the locked branch never issues it.

- [x] **Step 4: Run the tests**

Run: `npm test -w api -- results`
Expected: PASS, 6 tests.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: results with review gated on the quiz close date"
```

---

### Task 12: Reports

**Files:**
- Create: `api/src/routes/reports.ts`
- Modify: `api/src/app.ts`
- Test: `api/test/reports.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/reports/quizzes` → `[{ quizId, title, classes: [{ classId, name, averageDisplayScore, maxScore, submitted, total }] }]`
  - `GET /api/reports/quizzes/:id/classes/:classId` → `{ students: [{ id, fullName, displayScore, maxScore, submittedAt, state }] }`
  - Principal responses additionally include `rawScore`; teacher responses never do.

- [x] **Step 1: Write the failing test**

`api/test/reports.test.ts` — the two D-09 tests are the point of this task:
```ts
describe('GET /api/reports/quizzes', () => {
  it('shows a teacher the class average for their own quiz in a class they teach', async () => {
    // samir teaches 10A and 10B; quiz targeted at 10A; two students submit 100 and 200 of 300
    // expect averageDisplayScore === 150
  });

  it("does not show a teacher another teacher's quiz, even in a class they teach", async () => {
    // rana authors a quiz for 10A; samir also teaches 10A
    // GET as samir → the list must not contain rana's quiz        [D-09, authorship half]
  });

  it('does not show a teacher their own quiz for a class they do not teach', async () => {
    // samir authors a quiz targeted at 11A, which he does not teach
    // GET as samir → the list must not contain it                 [D-09, class half]
  });

  it('shows the principal every quiz and every class', async () => {
    await makeQuiz({ classIds: [1], authorLogin: 'teacher-samir' });
    await makeQuiz({ classIds: [3], authorLogin: 'teacher-rana' });
    const principal = await loginAs(app, 'principal');
    const res = await principal.get('/api/reports/quizzes');
    expect(res.body).toHaveLength(2);
  });

  it('counts students who have not submitted in `total` but not in the average', async () => {
    // 3 students in class, 2 submitted → submitted === 2, total === 3
    // average is over submitted attempts only
  });
});

describe('GET /api/reports/quizzes/:id/classes/:classId', () => {
  it('drills into every student grade in that class, including those who did not sit it', async () => {
    const quiz = await makeQuiz({ classIds: [1], questions: [{ points: 100 }] });
    const student = await loginAs(app, '10A-001');
    const { body } = await student.post(`/api/quizzes/${quiz.id}/attempt`);
    await student.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[0].options[0].id });
    await student.post(`/api/attempts/${body.attemptId}/submit`);

    const teacher = await loginAs(app, 'teacher-samir');
    const res = await teacher.get(`/api/reports/quizzes/${quiz.id}/classes/1`);
    expect(res.status).toBe(200);
    const byName = Object.fromEntries(res.body.students.map((s: any) => [s.fullName, s]));
    expect(byName['ليلى حداد']).toMatchObject({ displayScore: 100, state: 'submitted' });
    expect(byName['عمر الخطيب']).toMatchObject({ state: 'not_started' });
  });

  it('returns rawScore to the principal and omits it entirely for a teacher', async () => {
    const quiz = await makeQuiz({ classIds: [1], negativeMarking: true, questions: [{ points: 100 }] });
    const student = await loginAs(app, '10A-001');
    const { body } = await student.post(`/api/quizzes/${quiz.id}/attempt`);
    await student.put(`/api/attempts/${body.attemptId}/answers/${quiz.questions[0].id}`)
      .send({ selectedOptionId: quiz.questions[0].options[1].id });   // wrong → -33
    await student.post(`/api/attempts/${body.attemptId}/submit`);

    const principal = await loginAs(app, 'principal');
    const asPrincipal = await principal.get(`/api/reports/quizzes/${quiz.id}/classes/1`);
    expect(asPrincipal.body.students.find((s: any) => s.displayScore === 0).rawScore).toBe(-33);

    const teacher = await loginAs(app, 'teacher-samir');
    const asTeacher = await teacher.get(`/api/reports/quizzes/${quiz.id}/classes/1`);
    expect(JSON.stringify(asTeacher.body)).not.toMatch(/rawScore/);
  });

  it('is 404 for a teacher outside the D-09 scope', async () => {
    const quiz = await makeQuiz({ classIds: [1], authorLogin: 'teacher-rana' });
    const samir = await loginAs(app, 'teacher-samir');   // teaches 10A, but did not author this
    expect((await samir.get(`/api/reports/quizzes/${quiz.id}/classes/1`)).status).toBe(404);
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- reports`
Expected: FAIL — 404.

- [x] **Step 3: Implement**

Both routes build their `WHERE` from a single helper so D-09 exists in exactly one place:
```ts
import { TEACHER_SCOPE } from '../db/quizzes.js';

/**
 * Principal sees everything; a teacher is confined to TEACHER_SCOPE (D-09).
 * Both branches keep $1 = the caller's id so the parameter positions of the
 * surrounding query never shift between roles — the principal branch simply
 * ignores it. Returning different arities here would silently misbind $2.
 */
function scopeClause(role: Role): string {
  return role === 'principal' ? 'TRUE' : TEACHER_SCOPE;
}
// Always called as: pool.query(sql, [req.user.id, quizId, ...])
```

The average is over **submitted attempts only**, using `display_score`:
```sql
SELECT c.id AS class_id, c.name,
       ROUND(AVG(a.display_score) FILTER (WHERE a.submitted_at IS NOT NULL))::int AS average_display_score,
       count(a.id) FILTER (WHERE a.submitted_at IS NOT NULL)::int AS submitted,
       (SELECT count(*) FROM users u WHERE u.class_id = c.id AND u.role='student')::int AS total
  FROM quizzes q
  JOIN quiz_classes qc ON qc.quiz_id = q.id
  JOIN classes c ON c.id = qc.class_id
  LEFT JOIN attempts a ON a.quiz_id = q.id
       AND a.student_id IN (SELECT id FROM users WHERE class_id = c.id)
 WHERE q.id = $2 AND (<scope>)
 GROUP BY c.id, c.name
```

- [x] **Step 4: Run the tests**

Run: `npm test -w api -- reports`
Expected: PASS, 8 tests.

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: class-average reports scoped to a teacher's own quizzes and classes"
```

---

### Task 13: Principal administration

**Files:**
- Create: `api/src/routes/admin.ts`
- Modify: `api/src/app.ts`, `shared/src/schemas.ts`
- Test: `api/test/admin.test.ts`

**Interfaces:**
- Produces, all `requireRole('principal')`:
  - `GET/POST /api/admin/classes` · `GET/POST /api/admin/users` · `PUT /api/admin/users/:id/password`
  - `POST /api/admin/assignments` `{ teacherId, classIds }` — replaces the teacher's assignments
  - `POST /api/admin/import` `{ kind: 'students'|'teachers', csv: string }` → `{ created, updated, errors: [{ line, message }] }`

- [x] **Step 1: Write the failing test**

`api/test/admin.test.ts`:
```ts
describe('principal administration', () => {
  it('refuses every admin route to a teacher and to a student', async () => {
    for (const who of ['teacher-samir', '10A-001']) {
      const agent = await loginAs(app, who);
      expect((await agent.get('/api/admin/users')).status).toBe(403);
      expect((await agent.post('/api/admin/classes').send({ name: 'X' })).status).toBe(403);
    }
  });

  it('creates a student and lets them log in with the issued credentials', async () => {
    const principal = await loginAs(app, 'principal');
    const created = await principal.post('/api/admin/users').send({
      role: 'student', fullName: 'سلمى قاسم', loginCode: '10A-099', password: 'pass1234',
      locale: 'ar', classId: 1,
    });
    expect(created.status).toBe(201);
    const agent = await loginAs(app, '10A-099');
    expect((await agent.get('/api/me')).body).toMatchObject({ role: 'student', fullName: 'سلمى قاسم' });
  });

  it("replaces a teacher's class assignments rather than appending to them", async () => {
    const principal = await loginAs(app, 'principal');
    const { rows: [t] } = await pool.query(`SELECT id FROM users WHERE login_code='teacher-samir'`);
    // samir starts on classes 1 and 2
    const res = await principal.post('/api/admin/assignments')
      .send({ teacherId: Number(t.id), classIds: [3] });
    expect(res.status).toBe(200);
    const { rows } = await pool.query(
      `SELECT class_id FROM teacher_classes WHERE teacher_id=$1 ORDER BY class_id`, [t.id]);
    expect(rows.map(r => Number(r.class_id))).toEqual([3]);
  });

  it('imports students from the same CSV shape the seeder reads', async () => {
    const agent = await loginAs(app, 'principal');
    const csv = 'login_code,full_name,class_name,password,locale\n10A-050,سلمى قاسم,10A,pass1234,ar\n';
    const res = await agent.post('/api/admin/import').send({ kind: 'students', csv });
    expect(res.body).toMatchObject({ created: 1, updated: 0 });
    const { rows } = await pool.query(`SELECT full_name FROM users WHERE login_code='10A-050'`);
    expect(rows[0].full_name).toBe('سلمى قاسم');
  });

  it('reports the line number for a row naming an unknown class, importing the rest', async () => {
    const agent = await loginAs(app, 'principal');
    const csv = 'login_code,full_name,class_name,password,locale\n' +
                'X-1,Good Row,10A,pass1234,en\nX-2,Bad Row,99Z,pass1234,en\n';
    const res = await agent.post('/api/admin/import').send({ kind: 'students', csv });
    expect(res.body.created).toBe(1);
    expect(res.body.errors[0]).toMatchObject({ line: 3 });
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w api -- admin`
Expected: FAIL — 404.

- [x] **Step 3: Implement**

Reuse `parseCsv` from Task 6 — the importer and the seeder must share it (D-17). Import is row-by-row, collecting errors with 1-based line numbers counting the header as line 1, so a bad row never aborts a good one. Upsert on `login_code`.

- [x] **Step 4: Run the tests**

Run: `npm test -w api -- admin`
Expected: PASS, 6 tests.

- [x] **Step 5: Run the whole API suite**

Run: `npm test -w api`
Expected: all green, roughly 90 tests.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: principal administration with spreadsheet import"
```

---
## Phase 4 — The web app (Tasks 14-17)

*Ends with: a clickable product on a phone, in two languages and two directions.*

### Task 14: Web shell, design tokens, i18n and RTL

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`
- Create: `web/src/styles/tokens.css`, `web/src/styles/base.css`
- Create: `web/src/i18n/index.ts`, `web/src/i18n/en.json`, `web/src/i18n/ar.json`
- Create: `web/src/api/client.ts`, `web/src/auth/SessionProvider.tsx`, `web/src/components/DirectionProvider.tsx`
- Create: `web/src/pages/LoginPage.tsx`, `web/src/components/LanguageToggle.tsx`, `web/src/components/Text.tsx`
- Create: `web/public/fonts/` (IBM Plex Sans Arabic woff2 subset)
- Test: `web/test/direction.test.tsx`

**Interfaces:**
- Produces:
  - `useSession(): { user: Me | null; login(code, password): Promise<void>; logout(): Promise<void>; setLocale(l): Promise<void> }`
  - `<Text as="p">{userGeneratedString}</Text>` — renders with `dir="auto"`. **Every user-generated string in the app goes through this component** (D-22).
  - `apiFetch<T>(path, init?): Promise<T>` — throws `ApiError { status, code }` on non-2xx, always `credentials: 'include'`.

- [x] **Step 1: Write the failing direction test**

`web/test/direction.test.tsx`:
```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { DirectionProvider } from '../src/components/DirectionProvider';
import { Text } from '../src/components/Text';

afterEach(cleanup);

describe('DirectionProvider', () => {
  it('sets the document to rtl and lang=ar for the Arabic interface', () => {
    render(<DirectionProvider locale="ar"><span>x</span></DirectionProvider>);
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
  });

  it('sets the document to ltr and lang=en for the English interface', () => {
    render(<DirectionProvider locale="en"><span>x</span></DirectionProvider>);
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('Text', () => {
  it('marks user-generated content dir=auto so it lays out by its own script', () => {
    const { getByText } = render(<Text>ليلى حداد</Text>);
    expect(getByText('ليلى حداد').getAttribute('dir')).toBe('auto');
  });

  it('keeps dir=auto for Latin content too, rather than assuming', () => {
    const { getByText } = render(<Text>Dana Haddad</Text>);
    expect(getByText('Dana Haddad').getAttribute('dir')).toBe('auto');
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w web`
Expected: FAIL — cannot resolve `DirectionProvider`.

- [x] **Step 3: Implement direction and text**

`web/src/components/DirectionProvider.tsx`:
```tsx
import { useEffect, type ReactNode } from 'react';

/** Interface direction. Content direction is handled separately by <Text> and quiz blocks (D-22). */
export function DirectionProvider({ locale, children }: { locale: 'en' | 'ar'; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = locale;
  }, [locale]);
  return <>{children}</>;
}
```

`web/src/components/Text.tsx`:
```tsx
import type { ElementType, ReactNode } from 'react';

/**
 * Renders user-generated text. `dir="auto"` lets the browser pick direction from the
 * first strong character, which is what makes an Arabic question inside an English
 * interface — or an English name in an Arabic class list — lay out correctly (D-22).
 */
export function Text({ as: As = 'span', children, ...rest }:
  { as?: ElementType; children: ReactNode } & Record<string, unknown>) {
  return <As dir="auto" {...rest}>{children}</As>;
}
```

- [x] **Step 4: Write the design tokens — logical properties only**

`web/src/styles/tokens.css`:
```css
:root {
  --ink: #12202b;
  --ink-muted: #5a6b78;
  --surface: #ffffff;
  --surface-sunken: #f4f6f8;
  --line: #dfe5ea;
  --accent: #1f6f5c;          /* calm green, reads as "school" not "startup" */
  --accent-ink: #ffffff;
  --danger: #b3261e;
  --ok: #1f6f5c;

  --space-1: .25rem; --space-2: .5rem; --space-3: .75rem;
  --space-4: 1rem;  --space-5: 1.5rem; --space-6: 2rem;

  --radius: 10px;
  --tap: 44px;                 /* minimum touch target */

  --font: "IBM Plex Sans", "IBM Plex Sans Arabic", system-ui, sans-serif;
  --step--1: .875rem; --step-0: 1rem; --step-1: 1.25rem; --step-2: 1.5rem; --step-3: 2rem;
}
```

`web/src/styles/base.css` — note every spacing property is logical:
```css
@font-face {
  font-family: "IBM Plex Sans Arabic";
  src: url("/fonts/IBMPlexSansArabic-Regular.woff2") format("woff2");
  font-weight: 400; font-display: swap;
  unicode-range: U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF;
}

* { box-sizing: border-box; }
body {
  margin: 0; font-family: var(--font); font-size: var(--step-0);
  color: var(--ink); background: var(--surface-sunken);
}
.page { max-inline-size: 42rem; margin-inline: auto; padding-inline: var(--space-4); padding-block: var(--space-5); }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--space-4); }
.stack > * + * { margin-block-start: var(--space-4); }
.btn {
  min-block-size: var(--tap); inline-size: 100%;
  padding-inline: var(--space-4); border-radius: var(--radius);
  border: 1px solid var(--accent); background: var(--accent); color: var(--accent-ink);
  font: inherit; cursor: pointer;
}
.btn--quiet { background: transparent; color: var(--accent); }
/* Mirror directional icons rather than swapping assets. */
[dir="rtl"] .icon-chevron { transform: scaleX(-1); }
```

> **Enforcement:** add `grep -rnE '(margin|padding|border)-(left|right)|text-align:\s*(left|right)' web/src` to the CI script as a failing check. This is the rule that decays silently otherwise.

- [x] **Step 5: Set up i18n**

`web/src/i18n/index.ts`:
```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import ar from './ar.json';

// i18next routes plurals through Intl.PluralRules, which knows Arabic's six
// categories (zero/one/two/few/many/other). This is why we are not hand-rolling it.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: localStorage.getItem('locale') ?? (navigator.language.startsWith('ar') ? 'ar' : 'ar'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
export default i18n;
```

`ar.json` must use the plural suffixes for any counted string, e.g.:
```json
{
  "quiz.questionsLeft_zero": "لم تتبقَّ أسئلة",
  "quiz.questionsLeft_one": "سؤال واحد متبقٍ",
  "quiz.questionsLeft_two": "سؤالان متبقيان",
  "quiz.questionsLeft_few": "{{count}} أسئلة متبقية",
  "quiz.questionsLeft_many": "{{count}} سؤالاً متبقياً",
  "quiz.questionsLeft_other": "{{count}} سؤال متبقٍ"
}
```

- [x] **Step 6: Format numbers and dates correctly**

`web/src/i18n/format.ts`:
```ts
const TZ = 'Asia/Amman';

/**
 * Western digits in both locales (D-21). Named distinctly from the API's
 * `formatMarks` in `api/src/domain/marks.ts`, which is locale-independent.
 */
export const formatMarksForLocale = (hundredths: number, locale: string) =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-JO-u-nu-latn' : 'en-JO',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(hundredths / 100);

export const formatDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === 'ar' ? 'ar-JO-u-nu-latn-ca-gregory' : 'en-JO',
    { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
```

- [x] **Step 7: Vite config with the dev proxy**

`web/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist' },
  test: { environment: 'jsdom', globals: true },
});
```

- [x] **Step 8: Serve the SPA from the API in production**

Modify `api/src/app.ts` — after the API routes, before the error handler:
```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';

const webDist = join(process.cwd(), 'web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback: anything not under /api returns index.html
  app.get(/^(?!\/api\/).*/, (_req, res) => { res.sendFile(join(webDist, 'index.html')); });
}
```

- [x] **Step 9: Build the login page**

`LoginPage.tsx`: a single card, one `login code` field, one `password` field, a submit button at `--tap` height, and `<LanguageToggle />` in the header. On success, route by role — student → `/quizzes`, teacher → `/teach`, principal → `/admin`. On 401 show one neutral message; never distinguish unknown user from wrong password.

- [x] **Step 10: Run the tests, then look at it**

Run: `npm test -w web`
Expected: PASS, 4 tests.
Then: `npm run dev` and open `http://localhost:5173` at 375px width. Toggle the language and confirm the whole layout mirrors.

- [x] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: web shell with bilingual RTL support and design tokens"
```

---

### Task 15: Student flow

**Files:**
- Create: `web/src/pages/QuizListPage.tsx`, `web/src/pages/AttemptPage.tsx`, `web/src/pages/ResultPage.tsx`, `web/src/pages/HistoryPage.tsx`
- Create: `web/src/components/Countdown.tsx`, `web/src/components/QuestionCard.tsx`
- Test: `web/test/countdown.test.tsx`

**Interfaces:**
- Produces: `<Countdown expiresAt={ISO} serverNow={ISO} onExpire={() => void} />`

- [x] **Step 1: Write the failing countdown test**

The countdown is the only genuinely tricky component: it must be driven by the **server's** clock, not the device's.

`web/test/countdown.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Countdown } from '../src/components/Countdown';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Countdown', () => {
  it('counts down from the server-provided remaining time, ignoring a skewed device clock', () => {
    // Device clock is an hour behind the server. Remaining must still read 20:00.
    const serverNow = '2026-09-24T10:00:00Z';
    const expiresAt = '2026-09-24T10:20:00Z';
    vi.setSystemTime(new Date('2026-09-24T09:00:00Z'));
    render(<Countdown expiresAt={expiresAt} serverNow={serverNow} onExpire={() => {}} />);
    expect(screen.getByRole('timer')).toHaveTextContent('20:00');
  });

  it('ticks down once a second', () => {
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    render(<Countdown expiresAt="2026-09-24T10:00:10Z" serverNow="2026-09-24T10:00:00Z" onExpire={() => {}} />);
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole('timer')).toHaveTextContent('00:07');
  });

  it('fires onExpire exactly once when it reaches zero', () => {
    const onExpire = vi.fn();
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    render(<Countdown expiresAt="2026-09-24T10:00:02Z" serverNow="2026-09-24T10:00:00Z" onExpire={onExpire} />);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
  });

  it('never renders a negative time', () => {
    vi.setSystemTime(new Date('2026-09-24T10:00:00Z'));
    render(<Countdown expiresAt="2026-09-24T09:59:00Z" serverNow="2026-09-24T10:00:00Z" onExpire={() => {}} />);
    expect(screen.getByRole('timer')).toHaveTextContent('00:00');
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `npm test -w web -- countdown`
Expected: FAIL — cannot resolve `Countdown`.

- [x] **Step 3: Implement the countdown**

`web/src/components/Countdown.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';

/**
 * Display only. The server decides when the attempt ends; this measures elapsed
 * local time from the moment the page learned the server's clock, so a skewed
 * device clock cannot buy or lose time (spec §6).
 */
export function Countdown({ expiresAt, serverNow, onExpire }:
  { expiresAt: string; serverNow: string; onExpire: () => void }) {
  const totalMs = new Date(expiresAt).getTime() - new Date(serverNow).getTime();
  const mountedAt = useRef(Date.now());
  const fired = useRef(false);
  const [remaining, setRemaining] = useState(Math.max(0, totalMs));

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, totalMs - (Date.now() - mountedAt.current));
      setRemaining(left);
      if (left === 0 && !fired.current) { fired.current = true; onExpire(); }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [totalMs, onExpire]);

  const s = Math.ceil(remaining / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return <span role="timer" aria-live="off" className="countdown">{mm}:{ss}</span>;
}
```

- [x] **Step 4: Build the screens**

**`QuizListPage`** — a card per quiz showing state from the API: *Open until \<date>* · *Opens \<date>* · *Closed* · *Completed — \<score>*. Only an open, untaken quiz gets a Start button. Titles render through `<Text>`.

**`AttemptPage`** — one question per screen with a progress indicator, not a 15-question scroll: thumbs are small and a phone keyboard is not involved. Sticky header holds the `<Countdown>` and the question number.
- Saves on every selection via `PUT`, debounced 300ms, showing a quiet *Saved* indicator.
- The question block carries `dir` from the quiz's own `language`, independent of the interface (D-22).
- `onExpire` → `POST /submit`, then navigate to the result. Also submit on the explicit Finish button, with a confirm dialog.
- A failed save retries twice, then surfaces a persistent banner — a student on a phone will lose connection.

**`ResultPage`** — the score large and plain, out of the maximum. If `locked`, a line saying when answers become available, formatted in `Asia/Amman`. If unlocked, each question with the student's choice and the correct one, and the marks awarded.

**`HistoryPage`** — a list of past attempts with scores and dates.

- [x] **Step 5: Run the tests and check it on a phone viewport**

Run: `npm test -w web`
Then: dev server at 375px. Start a quiz, answer, refresh mid-attempt — answers must still be there and the timer must have kept running.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: student quiz flow with server-anchored countdown and autosave"
```

---

### Task 16: Teacher flow

**Files:**
- Create: `web/src/pages/TeacherHomePage.tsx`, `web/src/pages/QuizEditorPage.tsx`, `web/src/pages/QuizReportPage.tsx`
- Test: covered by E2E in Task 18

- [x] **Step 1: Teacher home**

Lists the teacher's own quizzes with state and, for each, the class averages from `GET /api/reports/quizzes`. Clicking an average opens the drill-down (D-06).

- [x] **Step 2: Quiz editor**

Two panes on desktop, stacked on a phone. Quiz settings: title, language, time limit, open/close datetimes (entered in `Asia/Amman`, sent as UTC ISO), negative-marking toggle with helper text — *"Wrong answers deduct one third of the question's marks"* — and class checkboxes limited to the teacher's assigned classes.

Question editor: text, points (entered in marks, sent as hundredths), four option rows with a radio for the correct one. Publishing surfaces the `422 problems[]` codes as readable messages against the offending question.

- [x] **Step 3: Report page**

Class average at the top, a table of students below: name via `<Text>`, score, submitted time, and a clear marker for those who have not sat it.

- [x] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: teacher authoring and reporting screens"
```

---

### Task 17: Principal screens

**Files:**
- Create: `web/src/pages/AdminPage.tsx`, `web/src/pages/AdminImportPage.tsx`

- [x] **Step 1: Admin home**

Tabs for classes, users, and teacher assignments. Every quiz across the centre with its averages, since the principal's scope is unrestricted (D-07).

- [x] **Step 2: Import**

A textarea to paste CSV, plus a file input that reads the file client-side and posts its text. Results render as *created / updated* counts and a table of per-line errors. The header format for each `kind` is shown on the page so nobody has to open the docs.

- [x] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: principal administration screens"
```

---

## Phase 5 — Verification and delivery (Tasks 18-19)

### Task 18: End-to-end tests and CI

**Files:**
- Create: `playwright.config.ts`, `e2e/student.spec.ts`, `e2e/teacher.spec.ts`, `e2e/rtl.spec.ts`
- Create: `.github/workflows/ci.yml`

- [x] **Step 1: Playwright config at phone width**

```ts
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000', ...devices['iPhone 13'] },
  webServer: { command: 'npm start', url: 'http://localhost:3000/api/health', reuseExistingServer: true },
});
```

- [x] **Step 2: Write the three specs**

`student.spec.ts` — log in as a seeded student, open the Arabic quiz, answer every question, finish, assert a score is shown and that the answers are not yet revealed.

`teacher.spec.ts` — log in as a seeded teacher, create a quiz with one question, publish it, open the report for a closed quiz, click the class average, assert individual student names appear.

`rtl.spec.ts`:
```ts
test('the interface mirrors when switched to Arabic, with no horizontal scroll', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /العربية|Arabic/ }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
```

- [x] **Step 3: Run them**

Run: `docker compose up -d && npx playwright test`
Expected: 3 passing.

- [x] **Step 4: CI**

`.github/workflows/ci.yml` — Postgres service container, `npm ci`, `npm test`, and the logical-properties grep as a hard gate:
```yaml
- name: No physical CSS properties
  run: |
    if grep -rnE '(margin|padding|border)-(left|right):|text-align:\s*(left|right)' web/src; then
      echo "Use logical properties (margin-inline-start, text-align: start)"; exit 1;
    fi
```

- [x] **Step 5: Commit**

```bash
git add -A
git commit -m "test: end-to-end coverage at phone width and CI pipeline"
```

---

### Task 19: Delivery documentation

**Files:**
- Create: `README.md`, `DECISIONS.md`, `AI_USAGE.md`, `CLAUDE.md`

- [x] **Step 1: README**

Must contain, in this order: what it is in two lines · **the one command** (`docker compose up`) · the URL · **a login table** with a student, a teacher and the principal, with real seeded codes and passwords · how sample data loads and how to reload it · the no-Docker path if that is what shipped · the test commands · a short architecture note.

Verify the login table by actually logging in as each of the three before committing.

- [x] **Step 2: DECISIONS.md**

Section 2 of the spec is the source. Structure it as: **assumptions made** (the decision register) · **built but not asked for** (bilingual interface, CSV import, principal role, the logical-properties CI gate — each with one line of why) · **deliberately left out** (spec §12's out-list) · **next week** (spec §13).

Lead with the negative-marking amendment. A decision that was reconsidered, with the reasoning for the change, says more than one that was merely made.

- [x] **Step 3: AI_USAGE.md**

Honest and specific. What to cover: which tools · that the brief was decomposed into a traced requirements analysis *before* any code, and that this conversation produced the spec and this plan · that the work ran test-first, with the scoring fixtures derived from worked examples rather than from the implementation · **where the AI was wrong and how it was caught** — the worked scoring examples were computed with exact thirds and were off by one hundredth once per-answer rounding was decided; the error was found by re-deriving the fixtures with a script before writing the tests · how output was verified (the suite, the adversarial list, a real phone viewport).

- [x] **Step 4: CLAUDE.md**

Already written on 2026-09-25: root `CLAUDE.md` plus path-scoped `.claude/rules/api.md` and
`.claude/rules/web.md`. Review it against what actually happened in Phases 4–5: delete lines
Claude now gets right without being told, and add any correction that had to be made twice.
Keep the root file well under 200 lines.

- [x] **Step 5: Final verification before submitting**

```bash
git clean -xdn                      # confirm nothing needed is untracked
docker compose down -v              # destroy all state
docker compose up --build           # the reviewer's exact experience
```
Then log in as each of the three roles from the README table, sit a quiz on a 375px viewport, switch to Arabic, and read a report. Only then submit.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: README, decisions, AI usage and project conventions"
```

---

## Coverage check

| Spec section | Task |
|---|---|
| §3 architecture, runtime | 1 |
| §4 data model | 2 |
| §5 API surface | 5, 7, 8, 9, 10, 11, 12, 13 |
| §6 attempt lifecycle, sweeper, grace | 4, 8, 9, 10 |
| §7 scoring | 3 |
| §8 access control, serializers | 5, 7, 11, 12, 13 |
| §9 Arabic, RTL, i18n | 14 |
| §10 seed data | 6 |
| §11 test plan | 3, 4, 8, 9, 10, 11, 12, 13, 18 |
| §12 v1 scope | all |
| §13 deferred | 19 (`DECISIONS.md`) |
| §14 delivery checklist | 19 |

**D-coverage:** D-01 §12 · D-02 T10 · D-03 T2, T8 · D-04 T5, T6 · D-05 T3 · D-06 T12, T16 · D-07 T13 · D-08 T9 · D-09 T7, T12 · D-10 T11 · D-11 T14 · D-12 T7 · D-13 not built, by design · D-14 T14 · D-15 T1 · D-16 T5 · D-17 T6, T13 · D-18 T6 · D-19 T3 · D-20 T1 · D-21 T14 · D-22 T14 · D-23 done · D-24 T5 · D-25 T5.

## If the clock runs out

Each phase boundary is a submittable state. Stop at the end of a phase, not in the middle of one, and write what is missing into `DECISIONS.md`.

| Stopped after | What you have |
|---|---|
| Phase 1 | A running stack, a proven schema, and the two hardest algorithms fully tested. Honest but not a product. |
| Phase 2 | An API with real data and authoring. Demonstrable with `curl`. |
| Phase 3 | **The whole product, minus a user interface.** A complete, hostile-tested API — this is the most defensible place to stop early. |
| Phase 4 | The clickable product Nour asked for. |
| Phase 5 | The submission. |
