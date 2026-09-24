# Tutoring Quiz Platform — Design Spec

**Date:** 2026-09-24
**Status:** Approved, ready for implementation planning
**Source brief:** `BRIEF_ANALYSIS.md` (requirements traced to the client's words)

This spec is self-contained. A developer who has not seen the conversation that
produced it should be able to build from this document plus `BRIEF_ANALYSIS.md`
alone. Where a decision closed a gap in the brief, the reasoning is recorded —
that reasoning is the raw material for `DECISIONS.md`.

---

## 1. Context

A tutoring centre in Amman (~300 students, 12 teachers) runs weekly paper quizzes
and wants them online. Students sit timed multiple-choice quizzes on their phones;
teachers author them; the principal sees how everyone did. Arabic names and Arabic
quiz content throughout. No designer.

Pilot data: three classes (10A, 10B, 11A) of ~20 students, four active teachers.
A typical quiz is 15 questions, four options each, per-question point values, 20
minutes. **Build for 300/12; seed 60/4.**

---

## 2. Decision register

Every gap the brief left open, and how it was closed. `[C]` marks a decision the
client made directly; `[E]` marks an engineering decision.

| # | Decision | Reasoning |
|---|---|---|
| D-01 | **Core flow only for v1.** | Deadline pressure. Deferred items are designed, not forgotten — see §13. `[C]` |
| D-02 | **Time expiry auto-submits** whatever has been answered. | A timed quiz that never ends is not timed. `[C]` |
| D-03 | **One attempt per student per quiz, absolute in v1.** No retake mechanism at all. | The principal-approved retake flow (`[C]`) is designed but deferred with D-01. A student who disconnects is out until it ships. Recorded as a deliberate omission. `[C]` |
| D-04 | **School-issued credentials.** Principal creates logins and hands them out as a file. No self-registration, no forced password change in v1. | Students are minors; many have no email. The roster is authoritative and arrives as a spreadsheet. `[C]` |
| D-05 | **Wrong answer deducts ⅓ of that question's points**, when the quiz has negative marking on. Displayed total floors at 0; the raw value is stored. | Originally specified at full weight `[C]`, then amended: with four options, ⅓ is the ratio at which random guessing is exactly break-even, so it penalises guessing without punishing partial knowledge. Full weight collapsed weak students onto the floor — a student with 6 marks' worth of correct answers scored the same 0 as a blank paper — which destroys the class average the principal actually reads. `[C]` |
| D-06 | **Reporting starts at the class average and drills into every student's grade** on click. | `[C]` |
| D-07 | **Principal has full permissions, without exception.** | `[C]` |
| D-08 | **Grades never change retroactively — via answer snapshots, not question versioning.** Each answer row stores the `points_possible` and `points_awarded` in force when it was answered. Teachers edit questions freely; recorded grades are immovable because they do not reference the question's current state. | The client asked for full versioning (old question retained, flagged hidden, new version created) to keep grades consistent `[C]`. Two snapshot columns deliver that *guarantee* for a fraction of the cost. What is deferred is only the ability to replay a past attempt with the original wording. `[E]` |
| D-09 | **A teacher sees their own quizzes, in the classes they are assigned to** — the intersection. Not other teachers' quizzes, even for a class they teach. | Mirrors a real school: teachers stay in their subject lane, the principal holds the cross-subject view. Requires a teacher↔class assignment maintained by the principal. `[C]` |
| D-10 | **Score immediately; answers and per-question results unlock when the quiz closes.** | Mirrors the classroom — the mark comes back now, the paper is gone over later. Necessary too: a quiz is open over a date range, so releasing answers on submission hands the key to classmates who have not yet sat it. `closes_at` drives it; no extra setting. `[C]` |
| D-11 | **`Asia/Amman` for all entry and display; UTC in storage.** | The centre is in Amman. `[E]` |
| D-12 | **Exactly one correct option per question**, four options. | Matches the paper quizzes being replaced. `[E]` |
| D-13 | No question or option shuffling in v1. | `[E]` |
| D-14 | **Bilingual interface (en/ar) with a per-user preference**, full RTL flip; quiz content carries its own language independently. | The brief only promises Arabic *content* works, but a Jordanian student on a phone expects an Arabic interface. With CSS logical properties from the first commit the layout flip is nearly free; the real cost is ~80 translated strings. `[C]` |
| D-15 | **React SPA + Express 5 API + PostgreSQL, Docker Compose.** | The client-facing stack, literally. Keeps the domain logic in one isolated, testable server module — which is where this brief's difficulty lives. Express over Fastify at the client's preference; Express 5 handles async errors natively, so no wrapper is needed. `[C]` |
| D-24 | **`zod` schemas in `shared/`, used for both runtime validation and the TypeScript types.** Every request body and param is parsed at the route boundary; anything unparsed is rejected before it reaches a handler. | Express has no built-in schema validation, so the §11 adversarial cases (an option id from a different question, a malformed answer payload) need an explicit layer. Deriving the types from the same schemas means the contract and its enforcement cannot drift apart — a better story than the framework-bound alternative. `[E]` |
| D-25 | `helmet` for security headers, `cookie-parser` for the session cookie, `pino-http` for request logging. | The pieces Express does not ship that the API needs anyway. `[E]` |
| D-16 | **Server sessions in Postgres behind an httpOnly cookie**, not JWT. | Revocable, no token-expiry edge cases, trivially testable. `[E]` |
| D-17 | **The seed data IS the import path.** Sample data lives as CSV in `data/`; the seeder parses it. | The real data arrives as spreadsheets, so seeder and importer are one code path. When the real files land, the work is column mapping, not building a pipeline. `[E]` |
| D-18 | Seed runs automatically on first boot, idempotently. | Makes "one command" literally true. `npm run seed` is documented but not required. `[E]` |
| D-19 | **Each answer's mark rounds to 2dp; the total is the exact sum of those rounded values.** | ⅓ produces repeating decimals. Rounding only the total would mean the per-question marks a student sees do not add up to the total they are given. A total may sit ≤0.05 from the theoretical value; nobody will notice, and every number on the page reconciles. `[E]` |
| D-20 | Compose maps Postgres to **host port 5433**. | A local Postgres 14 already holds 5432 on the development machine. Container-internal stays 5432; a clean machine sees no difference. `[E]` |
| D-21 | Western digits (`0-9`) and Gregorian dates in both locales. | Standard in Jordanian schools; keeps marks and timers legible in both directions. `[E]` |
| D-22 | **Two independent direction contexts** — interface direction from the user's locale, content direction from the quiz's language. | An Arabic quiz inside an English interface must still render its questions RTL. `[E]` |
| D-23 | The assessment PDF is gitignored, and quotations from the assessment instructions are paraphrased in committed docs. | The client brief belongs in the repo; the grading criteria are the assessor's material and are not ours to republish. `[E]` |

**Guiding rule, applied wherever the brief was silent:** *mirror how a school actually
works.* D-03, D-09 and D-10 all follow from it.

---

## 3. Architecture

```
tutoring-quiz-platform/
├── docker-compose.yml · .env.example
├── README.md · DECISIONS.md · AI_USAGE.md · CLAUDE.md
├── BRIEF_ANALYSIS.md
├── docs/superpowers/specs/
├── data/                       CSV seed = future import
│   ├── classes.csv · teachers.csv · students.csv
│   └── quiz-algebra-en.csv · quiz-nahw-ar.csv
├── shared/                     zod schemas → types inferred (D-24)
├── api/src/
│   ├── domain/                 scoring.ts, attempt.ts — pure, no I/O, no DB
│   ├── db/                     migrations + queries
│   ├── routes/ · auth/ · middleware/ · seed/
└── web/src/
    ├── i18n/                   en.json · ar.json
    └── pages/ · components/
```

`shared/` holds **zod schemas and the types inferred from them** — the request and
response contracts, and nothing else. Scoring lives in `api/src/domain/` and is
physically unreachable from `web/`, so correct answers cannot leak to the client by
accident.

**Runtime — two containers.** `docker compose up` starts Postgres and one Node
container serving both the API and the built React bundle at `http://localhost:3000`.
Fewer moving parts than a separate web server, and fewer ways for a reviewer's run
to fail. Development runs Vite on 5173 proxying `/api` to 3000.

---

## 4. Data model

```sql
classes(id, name UNIQUE, created_at)

users(id, role, full_name, login_code UNIQUE, password_hash,
      locale DEFAULT 'ar', class_id → classes NULL, is_active, created_at)
      CHECK ((class_id IS NOT NULL) = (role = 'student'))
      -- role ∈ ('student','teacher','principal')

teacher_classes(teacher_id → users, class_id → classes)
      PRIMARY KEY (teacher_id, class_id)

quizzes(id, title, author_id → users, language,
        time_limit_minutes DEFAULT 20,
        opens_at, closes_at,                  -- both NOT NULL
        negative_marking BOOLEAN DEFAULT false,
        is_published, created_at)
      CHECK (closes_at > opens_at)

quiz_classes(quiz_id, class_id) PRIMARY KEY (quiz_id, class_id)

questions(id, quiz_id, position, text, points NUMERIC(5,2) CHECK (points > 0))

options(id, question_id, position, text, is_correct)
      UNIQUE INDEX ON options(question_id) WHERE is_correct
      -- enforces AT MOST one correct; "exactly one" also needs a publish-time
      -- validation that every question has a correct option and four options

attempts(id, quiz_id, student_id,
         started_at, expires_at,
         submitted_at, submitted_reason,      -- 'manual' | 'expired'
         raw_score, display_score, max_score)
      UNIQUE (quiz_id, student_id)

answers(id, attempt_id, question_id, selected_option_id NULL,
        points_possible NUMERIC(5,2), points_awarded NUMERIC(5,2))
      UNIQUE (attempt_id, question_id)

sessions(id, user_id, expires_at)
```

**Load-bearing details:**

1. `UNIQUE (quiz_id, student_id)` — D-03 is a database constraint, not a hidden
   button. Two tabs racing yields a constraint violation, not two attempts.
2. `expires_at` is written once at start and never recomputed. A student changing
   their device clock changes nothing; there is no arithmetic left to trick.
3. `points_possible` / `points_awarded` snapshots implement D-08.
4. `NUMERIC` everywhere, never float — ⅓ produces repeating decimals.
5. `raw_score` may be negative and is principal-only; `display_score` is floored at 0.

---

## 5. API surface

Every route parses its input through a zod schema before the handler runs; a parse
failure is a 400 and never reaches domain code.

```
POST   /api/auth/login                   → session cookie
POST   /api/auth/logout
GET    /api/me                           → role, locale, class

GET    /api/quizzes                      role-scoped list
POST   /api/quizzes                      teacher
PATCH  /api/quizzes/:id                  teacher (own) | principal
POST   /api/quizzes/:id/questions        teacher
POST   /api/quizzes/:id/publish

POST   /api/quizzes/:id/attempt          start
GET    /api/attempts/:id                 resume → questions, saved answers,
                                            expires_at, server now
PUT    /api/attempts/:id/answers/:qid    save one answer
POST   /api/attempts/:id/submit          submit
GET    /api/attempts/:id/result          score; review only after closes_at

GET    /api/reports/quizzes/:id          class average → drill to grades (D-09 scoped)
GET    /api/students/me/history

GET/POST /api/admin/users · /classes · /assignments · /import    principal only
```

---

## 6. Attempt lifecycle

| State | Detected by |
|---|---|
| Not started | no `attempts` row |
| In progress | row, `submitted_at` NULL, `now() < expires_at` |
| Expired, unsubmitted | row, `submitted_at` NULL, `now() ≥ expires_at` |
| Submitted | `submitted_at` NOT NULL |

**Start guards, in order:** quiz published → `now()` within `[opens_at, closes_at]`
→ the student's class is in `quiz_classes` → no existing attempt. Then write
`started_at = now()` and `expires_at = now() + time_limit_minutes`.

**Every answer is graded the moment it is saved.** `points_awarded` is written on
each `PUT`, so an attempt's score is always already correct whether or not anyone
submits. Submission merely stamps `submitted_at` and denormalises the totals.

**Abandoned attempts** therefore need no rescue. A sweeper inside the API process
runs once a minute:

```sql
UPDATE attempts SET submitted_at = expires_at, submitted_reason = 'expired'
WHERE submitted_at IS NULL AND expires_at < now();
```

Idempotent, safe if it runs concurrently, no external scheduler.

**Clock handling:** answer saves accept a **5-second grace** past `expires_at` so a
request in flight is not punished for latency. `GET /api/attempts/:id` returns the
server's `now` beside `expires_at`; the client counts down against server time.
The client timer is display only and is never trusted.

---

## 7. Scoring

```ts
// api/src/domain/scoring.ts — pure, no I/O
export const WRONG_DIVISOR = 3;   // points / (options - 1): guessing-neutral at 4 options

gradeAnswer(points, isCorrect, negativeMarking):
  isCorrect === null  → 0                       // blank, never penalised
  isCorrect === true  → +points
  negativeMarking     → −(points / 3) at 2dp    // else 0
                      // 1-mark → −0.33 · 2-mark → −0.67 (D-19: round per answer)

totalScore(awarded[]): { raw: sum, display: max(0, sum) }
```

Test fixtures — two named papers carried from the design discussion, so a reader
sees the reasoning and not just arithmetic:

| Points | Answer | Neg. | Awarded |
|---|---|---|---|
| 1 | correct | off | +1.00 |
| 1 | wrong | off | 0.00 |
| 1 | wrong | on | −0.33 |
| 2 | wrong | on | −0.67 |
| any | blank | on | 0.00 |
| **"Layla"** 8×1✓ 2×2✓ · 2×1✗ 2×2✗ · 1×2 blank (20 max) | | on | raw 10.00, shown 10.00 |
| **"Omar"** 4×1✓ 1×2✓ · 6×1✗ 4×2✗ | | on | raw 1.34, shown 1.34 |
| all wrong (10×1 + 5×2) | | on | raw −6.65, shown **0.00** |

---

## 8. Access control

`helmet → cookie-parser → requireAuth → requireRole(...) → validate(schema) → resource guard`

| | Student | Teacher | Principal |
|---|---|---|---|
| Quizzes for own class | ✓ | – | – |
| Start / answer / submit own attempt | ✓ | – | – |
| Own score and history | ✓ | – | – |
| Own review, after `closes_at` | ✓ | – | – |
| Create / edit quiz | – | own | any |
| Assign quiz to a class | – | own classes only | any |
| Results, drill to grades | – | own quizzes ∩ own classes | all |
| Classes, users, assignments, import | – | – | ✓ |

D-09 is exactly one SQL predicate, and it must exist in exactly one place:

```sql
quiz.author_id = :teacher
AND quiz_classes.class_id IN (SELECT class_id FROM teacher_classes WHERE teacher_id = :teacher)
```

**Responses are shaped by role-specific serializers, never by deleting fields from
a shared object** — a forgotten `delete obj.x` is how these leak:

- `options.is_correct` — absent during an attempt *and* in a locked result
- any attempt that is not the caller's
- `raw_score` — principal only

---

## 9. Arabic, RTL and i18n

| | Driven by | Applied to |
|---|---|---|
| Interface direction | `users.locale` | `<html dir lang>` — chrome, nav, forms |
| Content direction | `quizzes.language` | the question block, independently |

- **`react-i18next`.** Arabic has six plural categories (zero/one/two/few/many/other);
  "20 minutes remaining" and "3 questions left" hit that immediately. i18next wires
  `Intl.PluralRules` correctly. A hand-rolled layer gets Arabic plurals wrong and
  nobody notices until a native speaker looks.
- **CSS logical properties only** — `margin-inline-start`, `inset-inline-start`,
  `text-align: start`. No physical properties anywhere. This belongs in `CLAUDE.md`
  so generated components do not reintroduce them.
- **Mirrored affordances** — chevrons, back arrows, progress direction flip under `[dir="rtl"]`.
- **`dir="auto"` on every user-generated string** — names, questions, options. This
  is what handles an Arabic question containing a Latin formula.
- **IBM Plex Sans Arabic**, self-hosted woff2, matching Latin face. Open-licensed,
  neutral, answers "make it look clean" without a designer.
- **Pre-login** there is no user locale: default from `navigator.language`, fall back
  to Arabic, remember in `localStorage` until a session exists.

---

## 10. Seed data

Three classes 10A/10B/11A · ~20 students each · 4 teachers assigned across them ·
1 principal · majority Arabic Jordanian names, some Latin.

At least four quizzes so the app has something to show on first login and a reviewer
can explore without burning their single attempt on each:

| Quiz | Language | Neg. marking | State |
|---|---|---|---|
| Algebra | English | off | closed, with results |
| Nahw (نحو) | Arabic | **on** | closed, with results |
| Geometry | English | on | open now |
| History | Arabic | off | open now |
| Reading | Arabic | off | not yet open |

Both scoring modes should appear **on quizzes by the same teacher**, proving the
setting lives on the quiz and not on the teacher.

**Two quizzes are open simultaneously, and the README lists several spare student
logins.** Under D-03 a reviewer who sits a quiz cannot sit it again, so without this
they exhaust the take-a-quiz flow on their first click and cannot explore it further.

---

## 11. Test plan

**Unit (Vitest, no I/O)** — `domain/scoring.ts` against the table in §7;
`domain/attempt.ts` state transitions.

**Integration (supertest against real Postgres)** — one test per adversarial case:

- two concurrent starts → exactly one attempt; the other hits the unique constraint
- second attempt after submitting → refused
- answer saved after `expires_at` → refused; within the 5s grace → accepted
- submit after expiry → stamps, adds nothing
- start before `opens_at` / after `closes_at` → refused
- student A reading student B's attempt → **404, not 403** (do not confirm the id exists)
- teacher reading another teacher's quiz results → refused
- teacher reading their **own** quiz's results for a class they do not teach → refused
  *(the ∩ half of D-09, the half that is easy to forget)*
- `is_correct` absent from the attempt payload **and** from a locked result payload
- answer referencing an option from a different question → refused
- review locked before `closes_at`, unlocked after
- **editing a question leaves every recorded grade unchanged** — D-08 proved, not asserted

**E2E (Playwright, three tests, all at 375px)** — student takes the Arabic quiz and
sees a score; teacher creates a quiz, reads the class average, drills to grades;
language toggle flips the document to RTL with no horizontal scroll.

**CI** — GitHub Actions on push: unit + integration.

---

## 12. v1 scope

**In:** three roles and sessions · teacher↔class assignment · quiz authoring with
per-question points, time limit, date range, negative-marking toggle, class
targeting · taking a quiz on a server clock with autosave and auto-submit · score on
submit, review at close · student history · D-09-scoped teacher reports, average →
drill to grades · principal full access, user and class management, CSV import ·
bilingual UI with RTL · CSV seed · one-command Compose · the tests above.

**Out, with the design recorded in `DECISIONS.md`:** retake approval workflow ·
question-versioning history UI · per-quiz penalty ratio · shuffling · early answer
release · results export · per-question analytics · forced password change ·
notifications · multiple correct options.

---

## 13. Deferred, with intended design

- **Retake approval (D-03).** Student requests a retake with a reason; the request
  queues for the principal; approval supersedes the old attempt, which is retained.
  The v1 shortcut, if needed sooner, is a principal-only "allow retake" action with
  a required reason — roughly half an hour of work.
- **Question version history (D-08).** A `question_versions` table; edits create a
  version and flag the prior one hidden rather than deleting it; past attempts replay
  with their original wording. The grade-consistency guarantee already holds without it.
- **Per-quiz penalty ratio.** One `NUMERIC` column and one input, letting a teacher
  run a strict drill at full weight and a review quiz at ⅓. Rejected for v1 because
  the client specified *whether* marks are deducted varies, not *how much* — and every
  extra scoring knob makes the class average harder to compare across quizzes.

---

## 14. Delivery checklist

- [ ] Public GitHub repo with complete source
- [ ] `README.md` — one command on a clean machine, how to load sample data, login
      details for a student, a teacher and the principal
- [ ] `DECISIONS.md` — from §2, plus what was built beyond the ask, what was left out, what is next
- [ ] `AI_USAGE.md` — tools, how they were directed, how output was verified
- [ ] `CLAUDE.md` — including the logical-properties rule
- [ ] Automated tests per §11
- [ ] Incremental commit history

---

## Appendix — environment notes

- **Postgres 14 and Redis already run locally** on this machine (5432, 6379). Compose
  maps the database to host **5433** so both can coexist (D-20).
- **Docker Desktop was not installed** at the time of writing. `brew install --cask
  docker-desktop` failed repeatedly on `ghcr.io` with `PROTOCOL_ERROR` while fetching
  Homebrew's portable Ruby — a network issue specific to that host. The direct `.dmg`
  from docker.com uses different infrastructure and is the recommended route.
- **Fallback if Docker cannot be installed:** run the API against the local Postgres 14
  and document an exact no-Docker path in the README. The design does not change; only
  the verification story weakens, and a `docker-compose.yml` that has never been
  executed is a real submission risk.
- **Node 25.9 / npm 11.12.** Corepack's pnpm shim is broken (points at an nvm 18.17
  path); use npm.
