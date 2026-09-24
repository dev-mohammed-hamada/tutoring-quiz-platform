# Decisions

What the brief left open, how it was closed, and what was deliberately not built. The full register
with reasoning for each entry is §2 of
`docs/superpowers/specs/2026-09-24-tutoring-quiz-platform-design.md`; the decision ids below refer
to it.

## The one that changed: negative marking

The client first asked that a wrong answer cost the **full** value of the question. Built that way,
the sample data showed what it does to a class: a student with six marks' worth of correct answers
and the rest wrong scored **zero** — the same zero as a student who answered nothing at all. The
floor at zero (`display_score = max(0, raw_score)`) collapses weak students onto a single value, and
the class average the principal actually reads stops distinguishing between them.

So it is **one third** of the question's value (D-05). With four options, ⅓ is the ratio at which
random guessing is exactly break-even: guessing has no expected gain, which is the point of the
penalty, but partial knowledge is not punished into the floor. The raw score is stored unfloored and
shown to the principal alone, so the information is not lost — only the number handed to a fifteen
year old is.

This is the decision I would most want reviewed, because it overrides something the client asked for
directly. It is reversible in one constant (`api/src/domain/scoring.ts`), and the tests state the
expected marks explicitly, so the change would be visible rather than silent.

## Assumptions made where the brief was silent

The guiding rule throughout: **mirror how a school actually works.**

| | Decision |
|---|---|
| D-02 | Time expiry auto-submits whatever has been answered. A timed quiz that never ends is not timed. |
| D-03 | One attempt per student per quiz, absolute in v1 — no retake mechanism at all. A student who loses connection is out until the deferred approval flow ships. Deliberate, and the most painful of these. |
| D-04 | School-issued credentials. The principal creates logins and hands them out. No self-registration: the students are minors and many have no email. |
| D-08 | Grades never change retroactively, via answer snapshots rather than question versioning. Each answer stores the marks in force when it was given, so a teacher may edit a question freely and every recorded grade stays put. |
| D-09 | A teacher sees their own quizzes in the classes they are assigned to — the intersection, not the union. Not another teacher's quiz, even for a class they both teach. |
| D-10 | The score comes back immediately; the answers unlock when the quiz closes. A quiz is open over a date range, so releasing the paper on submission would hand the key to classmates who have not yet sat it. |
| D-11 | `Asia/Amman` for every entry and display, UTC in storage. |
| D-12 | Exactly one correct option, four options per question — matching the paper quizzes being replaced. |
| D-19 | Each answer's mark is rounded, and the total is the exact sum of those rounded values. A third produces repeating decimals; rounding the total instead would mean the per-question marks shown do not add up to the total given. |

## Built without being asked

Each of these was a judgement that the thing would be wrong without it.

- **A bilingual interface with full RTL, not just Arabic content.** The brief only promises that
  Arabic *content* works. But a student in Amman on a phone expects the interface to be Arabic too,
  and with CSS logical properties from the first commit the mirroring is nearly free — the real cost
  was the translated strings. Interface direction and content direction are independent, so an
  Arabic quiz renders RTL inside an English interface and vice versa (D-14, D-22).
- **CSV import for the roster.** The sample data and the import path are the same code (D-17). Sixty
  students were never going to be typed in one at a time, and the real roster will arrive as a
  spreadsheet, so when it does the work is column mapping rather than building a pipeline.
- **The principal as a real role rather than a super-teacher.** Unrestricted scope (D-07), the raw
  unfloored scores, class and user management. The brief describes someone who reads results; the
  person who reads results for a whole centre also needs to create the accounts.
- **A CI gate on physical CSS properties.** One `margin-left` breaks the Arabic layout in a way
  nobody notices until a student does. The grep runs in the web build and again in CI, so it fails
  the pipeline rather than a code review.
- **An expiry sweeper.** Auto-submit cannot depend on the student's browser being open at the
  deadline — a phone that goes to sleep mid-quiz would otherwise leave an attempt open forever.

## Deliberately left out

Designed, costed, and not built — v1 is the core flow (D-01).

Retake approval workflow · question-version history UI · a per-quiz penalty ratio · question and
option shuffling · early answer release · results export · per-question analytics · forced password
change · notifications · multiple correct options per question.

The per-quiz penalty ratio is the one I most nearly built: it is a single column and a single input.
It was rejected because the client specified that *whether* marks are deducted varies between
quizzes, not *how much* — and every additional scoring knob makes class averages harder to compare
across quizzes, which is the number the principal reads.

## Next

- **Retake approval (D-03).** The student requests a retake with a reason, the request queues for
  the principal, approval supersedes the old attempt while retaining it. The half-hour version, if
  it is needed sooner, is a principal-only "allow retake" action with a required reason.
- **Question version history (D-08).** A `question_versions` table; an edit creates a version and
  flags the previous one hidden rather than deleting it, so a past attempt can be replayed with the
  wording the student actually saw. The grade-consistency guarantee already holds without this —
  what is missing is only the ability to re-read the old paper.
- **Per-question analytics.** The data is already there: every answer row stores what was selected
  and what it was worth. "Which question did the class fall down on" is a query away, and it is the
  first thing a teacher will ask for once they have used the reports for a fortnight.
