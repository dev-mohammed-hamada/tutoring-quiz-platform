# Tutoring Quiz Platform

Timed multiple-choice quizzes for a tutoring centre in Amman. Students sit each quiz once on a
phone, teachers write them, the principal reads how everyone did. Arabic and English, RTL and LTR.

## Run it

```bash
docker compose up --build
```

Then open **<http://localhost:3000>**.

That is the whole thing: the app migrates the database, loads the sample data and starts on first
boot. Postgres is published on host port **5433**, not 5432, so it cannot collide with a Postgres
you already run.

## Sign in

Every seeded account uses the password **`pass1234`**.

| Role | Login code | Who they are |
|---|---|---|
| Student | `10A-001` | Dana Haddad, class 10A — has an open quiz waiting |
| Teacher | `t-samir` | سمير عودة — teaches 10A and 10B, wrote two of the quizzes |
| Principal | `principal` | نور العلي — sees the whole centre |

Other seeded logins follow the same shape: students `10A-001`…`10A-020`, `10B-001`…, `11A-001`…,
and teachers `t-rana`, `t-huda`, `t-george`. Sixty students across three classes, five quizzes.

These three are signed into on every CI run — `e2e/student.spec.ts`, `e2e/teacher.spec.ts` and
`e2e/principal.spec.ts` each begin by signing in, so this table cannot quietly go stale.

## The sample data

It lives as CSV in `data/`, and the seeder parses it — the same code path the principal's spreadsheet
import uses, so the sample data *is* the import format (D-17). Loading is idempotent and happens on
first boot; it is skipped once the `principal` account exists.

To load it again from scratch:

```bash
docker compose down -v      # destroys the volume, and with it the database
docker compose up --build
```

Editing a file in `data/` will not change a database that is already seeded. Destroy it first.

## Running without Docker

You need Node 20+ and a PostgreSQL you can reach.

```bash
createdb quiz_dev
export DATABASE_URL=postgres://<you>@localhost:5432/quiz_dev   # the API does not read .env files
npm ci
npm run dev        # API on :3000 with migrate, seed and the expiry sweeper; Vite on :5173
```

Use <http://localhost:5173> in development — Vite serves the app and proxies `/api` to the API.
In production one Node process serves both, which is what `npm run build && npm start` gives you
on :3000 alone.

## Tests

```bash
npm test                  # every API and web test
npm test -w api           # API only, always against quiz_test
npm test -w api -- scoring   # one file by name
npm test -w web           # component tests in jsdom
npx playwright test       # end-to-end, at a 375px phone viewport
```

The end-to-end suite needs a database of its own; it rebuilds it from the seed before every run:

```bash
createdb quiz_e2e
npx playwright test
```

CI runs all of it, plus a grep that fails the build on a physical CSS property — see below.

## How it is put together

Three npm workspaces, one process, one database.

- **`shared/`** — zod schemas. The TypeScript types are inferred from them, so the contract and its
  enforcement cannot drift apart. Every request is parsed against one before a handler sees it.
- **`api/`** — Express 5. `api/src/domain/` holds the scoring and attempt-lifecycle logic as pure
  functions: no I/O, no database, no clock reads. That is where this problem's difficulty lives, so
  it is the part that is unit-testable without a database and unreachable from the browser.
  `api/src/serializers/` builds each response field by field, per role — a student's payload has no
  code path that can reach an answer key, rather than having one hidden from it.
- **`web/`** — React and Vite. Plain CSS with custom properties, logical properties only
  (`margin-inline-start`, never `margin-left`), so the entire layout mirrors for Arabic without a
  second stylesheet. The build greps for physical properties and fails, because that rule decays
  silently otherwise.

Three details worth knowing before you read the code:

- **Marks are integer hundredths.** `100` is 1.00 mark. No floats, no decimal library. A wrong
  answer on a negative-marking quiz costs `Math.round(points / 3)`, applied per answer, so the marks
  a student sees always add up to the total they are given (D-05, D-19).
- **The deadline is written once, by Postgres, at start.** The countdown in the browser is display
  only, measured from the server's clock; a device with the wrong time cannot buy itself a minute.
- **One attempt per student per quiz is a `UNIQUE` constraint**, not a check in a handler. Two
  simultaneous requests can both read "no attempt yet"; only the database can settle it.

## Where the documents are

| File | What it holds |
|---|---|
| `DECISIONS.md` | Every gap the brief left open and how it was closed, what was built beyond the ask, what was deliberately left out |
| `AI_USAGE.md` | Which tools, how they were directed, and where they were wrong |
| `BRIEF_ANALYSIS.md` | Each requirement traced to the client's own words |
| `CLAUDE.md` | Conventions for anyone — human or agent — working in this repo |
| `docs/superpowers/specs/` | The design spec, including the decision register `D-01`…`D-25` |
| `docs/superpowers/plans/` | The implementation plan, task by task, with its execution status |
