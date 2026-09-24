# AI usage

## Tools

Claude Code (Opus) throughout, in the terminal, with access to the repository, a local Postgres, and
Chrome for looking at the running app. No other AI tools.

## How it was directed

**The brief was decomposed before any code was written.** First `BRIEF_ANALYSIS.md`, which traces
every requirement back to the client's own words and marks what the brief does not say. Then a
design spec whose §2 is a register of every gap and how it was closed, each entry marked `[C]` for a
client decision or `[E]` for an engineering one. Then an implementation plan: nineteen tasks, each
with the files it touches, the tests it must write first, and the verification that closes it. Both
documents are in `docs/superpowers/` and were written before the first line of the application.

That ordering is the whole method. An agent asked to "build a quiz platform" will invent answers to
the questions the brief left open and bury them in code. An agent asked to implement Task 9, against
a spec that already says a wrong answer costs `Math.round(points / 3)` in integer hundredths, is
doing something much narrower and much easier to check.

**The work ran test-first, and that was enforced rather than hoped for.** Each task's plan states
the failing test, the command that runs it, and the failure that is expected. Where a test passed
before its implementation existed, that was treated as a defect in the test: during Task 14 the web
suite could not run until dependencies had installed, so the component and its test were written in
the same step — the component was then moved out of the tree and the suite re-run to confirm it
failed for the stated reason before being restored.

**The scoring fixtures were derived independently of the implementation.** The expected marks in
`api/test/domain/scoring.test.ts` come from worked examples in the spec, not from running the code
and recording what it printed. That distinction is the only thing standing between a test suite and
a very confident tautology.

## Where the AI was wrong

**The worked scoring examples were wrong by one hundredth.** The spec's examples were computed with
exact thirds. Once the decision was made to round *per answer* rather than per total (D-19), the
arithmetic no longer matched: a three-question example came out 0.01 away from the figure written in
the spec. This was caught before the tests were written, by re-deriving every fixture with a short
script and diffing it against the spec's prose. Had the fixtures been transcribed from the spec, the
tests would have encoded the wrong expectation; had they been taken from the implementation, they
would have encoded whatever the code happened to do.

**The SPA was served from the wrong directory and appeared to work.** The plan's own snippet located
the built front end with `process.cwd()`. That is correct when the server starts at the repository
root and wrong when it starts in `api/`, which is what `npm run dev -w api` does — and the failure
mode is a silent 404 rather than an error. It was found by curling the running server, and is now
pinned by `api/test/spa.test.ts`, which also asserts the thing that would be worse: that an unknown
`/api/...` path is never answered with the application shell.

**Three problems were found only by looking at the running app.** The finish-and-hand-in
confirmation was rendered at the bottom of the page, below the fold on a phone, so a student would
tap Finish and see nothing happen. On the result page only the correct option was marked, so a
question answered correctly looked identical to one left blank. Both were invisible to a test suite
that asserts on text content, and both were obvious within seconds of opening the page at 375px. The
third was a test that was itself wrong: it expected an English heading after sign-in, when the
correct behaviour is to adopt the language stored on the account.

**Two environment traps cost time and are worth recording.** Vitest 2 hoists Vite 5 to the root of
the tree; the web workspace initially pulled Vite 6, and `@vitejs/plugin-react` then type-checked
against the wrong copy. And Node 20+ ships an experimental `localStorage` global that shadows
jsdom's under the test runner while having none of the `Storage` methods, so the application would
not even import under test. Neither was a mistake in the application, and neither would have been
found without running the tools.

## How the output was verified

- **217 automated tests**: 188 API tests against a real Postgres, and 29 component tests in jsdom.
  Vitest does not type-check, so a git hook runs the full TypeScript build before every commit and
  blocks the commit if it fails.
- **The adversarial cases in the spec's §11 test plan**, written as tests rather than checked by
  hand: an option id smuggled in from a different question, a second attempt racing the first,
  reading another student's attempt, an answer saved after the deadline, and — the one that had
  never been provable until the edit route existed — that editing a question leaves every recorded
  grade byte-identical.
- **The app was driven in a real browser at phone width**, in both languages and both directions,
  including sitting a quiz end to end and refreshing mid-attempt to confirm the answers and the
  deadline survived.
- **End-to-end tests at a true 375px viewport** run the student, teacher and principal flows against
  the production shape — one process serving both API and front end — and assert, among other
  things, that nothing scrolls sideways and that a teacher's report does not carry the raw score
  that only the principal may see.

## What a reviewer should be sceptical of

The Arabic interface strings were written by the model and have not been read by a native speaker.
The technical vocabulary is conventional and the plural forms use the six Arabic categories
correctly, but tone and idiom are exactly the sort of thing that reads as translated. That is the
part of this submission I would most want a human to check.
