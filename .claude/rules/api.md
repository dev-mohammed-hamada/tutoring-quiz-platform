---
paths:
  - "api/**/*.ts"
---

# API rules

- Middleware order: `requireAuth → requireRole(...) → validate({ params, body, query }) → handler`.
  A wrong role gets 403 before its body is validated.
- All input goes through a zod schema from `shared/src/schemas.ts` via `validate()`. Never read
  an unvalidated `req.body`.
- Another user's resource, or a quiz outside the caller's scope, is 404 — never 403. Don't confirm
  that the id exists.
- Build responses in `api/src/serializers/` field by field, one function per role or state. Never
  `delete` a field to hide it.
- `options.is_correct` must never appear in an attempt payload or a locked result, and the locked
  path must not even query it.
- The teacher scope (own quizzes ∩ assigned classes) exists only in `scopeFor()` in
  `api/src/db/quizzes.ts`. Queries using it bind `$1` to the caller's id. Its principal branch must
  stay `$1::bigint IS NOT NULL`: a bare `TRUE` or an uncast `$1` breaks every principal query
  while the teacher query still passes.
- `pg` returns `int8` and `int8[]` as numbers (parsers in `api/src/db/pool.ts`). Cast other
  aggregates with `::int`.
- Express 5 forwards rejected async handlers to `errorHandler` itself, so no `asyncHandler`
  wrapper. `req.query` is a getter, which is why `validate()` uses `defineProperty`.
- Multi-statement writes use a pooled client with `BEGIN` / `COMMIT` / `ROLLBACK`, and
  `release()` in `finally`.
- Seed scores go through `gradeAnswer` and `totalScore`, never hand-written values.

## Tests

- Route suites: `beforeEach` runs `resetDb()` then `makeWorld()`; log in with `loginAs(app, code)`;
  build quizzes with `makeQuiz()`. All in `api/test/helpers/`.
- The fixture world: classes 1 = 10A, 2 = 10B, 3 = 11A. `teacher-samir` teaches 10A and 10B,
  `teacher-rana` teaches 10A only — both teach 10A, which is what makes the scope intersection
  testable. Plus `principal` and students `10A-001`, `10A-002`, `10B-001`, `11A-001`.
  These are not the seeded logins (`t-samir` and so on).
- Security tests assert on the whole payload (`JSON.stringify(res.body)`), not a single field.
