<!-- Maintainer note (stripped before it reaches Claude's context): keep this file short.
Progress changes daily and belongs in the plan's "Execution status" section, not here.
Area-specific rules live in .claude/rules/ and load only when matching files are read. -->

# Tutoring Quiz Platform

Timed multiple-choice quizzes for a tutoring centre in Amman. Students sit each quiz once on a
phone, teachers author them, the principal reads the results. Arabic and RTL throughout.

## At the start of a session

- Read "Execution status — read this first" in `docs/superpowers/plans/2026-09-24-tutoring-quiz-platform.md`.
  It says which tasks are done, which API gaps are open, and where the code deviates from the plan.
- Product decisions are the register in §2 of `docs/superpowers/specs/2026-09-24-tutoring-quiz-platform-design.md`
  (`D-01` to `D-25`). Don't reverse one without asking; add new ones there.
- `BRIEF_ANALYSIS.md` traces every requirement to the client's own words.

## Commands

npm only — the lockfile is `package-lock.json`. Workspaces: `shared`, `api`, and `web` from Task 14.

```bash
export DATABASE_URL=postgres://<user>@localhost:5432/quiz_dev   # the API does not read .env files
npm run dev                   # API (tsx watch; migrates, seeds, sweeper) + Vite on :5173
npm run dev:api               # just the API, when you only need the backend
npm test -w api               # all API tests, always against quiz_test (see api/test/setup.ts)
npm test -w api -- scoring    # one file by name; prefer this while iterating
npm test -w web               # jsdom component tests
npm test                      # both workspaces
npm run build                 # tsc for shared and api, then the Vite build for web
npm run migrate
npm run seed
docker compose up --build     # app on :3000, Postgres published on host :5433
```

- Vitest does not typecheck. A hook (`.claude/hooks/typecheck-before-commit.sh`) runs
  `npm run build` before every `git commit` and blocks the commit if it fails. Run the build
  yourself after a change rather than finding out at commit time.
- Suites run serially (`fileParallelism: false`) because they share one database and truncate
  between cases. Don't re-enable parallelism. Override the database with `TEST_DATABASE_URL`.

## Layout

- `shared/src/schemas.ts` — zod schemas; the TypeScript types are inferred from them. This is the API contract.
- `api/src/domain/` — pure scoring and attempt-state logic: no I/O, no database, no clock reads (pass `now` in).
- `api/src/routes/` thin handlers · `api/src/serializers/` response shapes · `api/src/db/` pool, migrations, scope predicate.
- `data/*.csv` — sample data, in the same format the admin importer reads.
- `web/src/components/Text.tsx` — every user-generated string renders through it, for `dir="auto"` (D-22).
- `web/src/styles/` — tokens and base CSS. Logical properties only; `npm run build -w web` greps for
  physical ones and fails, so a `margin-left` cannot reach a commit.
- `web/src/api/client.ts` — the only place the app calls the API. Always `credentials: 'include'`.

## Domain rules that apply everywhere

- Marks are integer hundredths: `100` is 1.00 mark. Never floats, never a decimal library.
- On a negative-marking quiz a wrong answer costs `Math.round(points / 3)`, rounded per answer.
  Blanks cost nothing. A total is the exact sum of its per-answer values.
- `display_score = max(0, raw_score)`. Only the principal ever receives `raw_score`.
- The one-attempt rule is the `UNIQUE (quiz_id, student_id)` constraint. Routes catch `23505`;
  a read-then-insert check alone loses the race.
- The deadline is `attempts.expires_at`, written once by Postgres at start. Never trust a client clock.
- Timestamps are `timestamptz` in UTC. Display in `Asia/Amman` with Western digits.

## Workflow

- Test first: write the failing test, run it, confirm it fails for the expected reason, then implement.
- Work on `feat/v1`. Merge to `main` with `--no-ff` at each phase boundary so `main` is always
  submittable. Never force-push `main`.
- One commit per task with a conventional prefix (`feat:`, `fix:`, `test:`, `docs:`). Messages say
  why, not just what — reviewers read the history.
- Schema changes are new numbered files in `api/src/db/migrations/`. Never edit an applied one.
- Editing `data/` does not change an existing dev database: the seed skips once the `principal`
  login exists. Recreate `quiz_dev` to reseed.
- `byThursday_Brief.pdf` is gitignored and stays out of the repo. Don't quote the assessment's
  own instructions in committed files; quoting the client brief is fine.

## When compacting

Keep the current task number, files changed since the last commit, the names of any failing
tests, and the open items from the plan's execution status.
