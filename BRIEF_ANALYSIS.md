# Quiz Platform — Structured Requirements

**Source:** `byThursday_Brief.pdf` — a client brief from "Nour", a tutoring centre in Amman.
**Analysed:** 2026-09-24

---

## 0. How to read this

The brief is a founder's Monday message: everything is in there, but scattered, and a lot of it is
implied rather than said. This document does three things:

1. Splits it into **concepts** (actors, entities, features) and attaches the **exact source clause**
   that produced each one, so nothing is invented silently and nothing is lost.
2. Separates what was **stated** from what is **inferred** from what is **missing**.
3. Turns each gap into a **decision with a default**, because the brief explicitly says the client
   is unavailable and the decisions are part of the deliverable.

**Markers used throughout**

| Marker | Meaning |
|---|---|
| `[S]` | **Stated** — directly in the brief |
| `[I]` | **Implied** — follows necessarily from something stated; safe to build |
| `[D]` | **Decision** — not in the brief at all; a default has been chosen (see §6) |
| `[A]` | **Assessment** — comes from the surrounding instructions, not from Nour |

---

## 1. Context in one table

| | |
|---|---|
| Client | Nour — runs a tutoring centre in Amman, Jordan |
| Pain | `"We run our weekly quizzes on paper and it is killing us."` |
| Product in one line | `"a simple website where students log in, take a timed multiple choice quiz, and see their score at the end"` |
| Content source | `"Our teachers will put the quizzes in."` |
| Reporting | `"I also want to see how the students did."` |
| Real scale | `"about 300 students and 12 teachers"` |
| Pilot scale | `"three classes … 10A, 10B and 11A, with around 20 students in each"` + `"Four of our teachers"` |
| Languages | Arabic + English, in both names and quiz content |
| Primary device | Phone — `"most students only have their phone"` |
| Ask | `"something I can click through by Thursday"` — a working, clickable flow, not a design mock |

> **Scale reading:** two different numbers appear because they answer different questions.
> **300 students / 12 teachers** is what the data model and queries must not choke on.
> **~60 students / 4 teachers / 3 classes** is what the seed data must contain. Build for the first,
> seed the second.

---

## 2. Actors

| ID | Actor | Evidence | Notes |
|---|---|---|---|
| `ACT-1` | **Student** | `[S]` `"students log in, take a timed multiple choice quiz, and see their score"` | Belongs to exactly one class. Consumer only — never authors. |
| `ACT-2` | **Teacher** | `[S]` `"Our teachers will put the quizzes in."` | Authors quizzes, sets scoring rules. 4 active at launch, 12 total. |
| `ACT-3` | **Centre owner / admin** | `[I]` `"I also want to see how the students did."` | Nour is not a teacher; she wants a view across *all* classes and teachers. The delivery requirements also anticipate a third kind of user beyond student and teacher. `[A]` |

**Consequence:** role-based access, three roles, not two. Reporting exists at two altitudes — a teacher
sees their own quizzes; the owner sees everything.

---

## 3. Domain model

Entities and the clause that justifies each field.

### `Class`
| Field | Evidence |
|---|---|
| name (`10A`, `10B`, `11A`) | `[S]` `"three classes at the moment, 10A, 10B and 11A"` |

`"at the moment"` signals classes are data, not an enum — new ones must be addable. `[I]`

### `User` (single table or per-role tables)
| Field | Evidence |
|---|---|
| role: student \| teacher \| admin | `[I]` §2 |
| display name (Arabic-capable) | `[S]` `"Many of our students have Arabic names"` |
| credentials | `[I]` `"students log in"` |
| class (students only) | `[I]` classes exist and students are counted per class |

### `Quiz`
| Field | Evidence |
|---|---|
| title | `[I]` |
| author (teacher) | `[S]` `"Our teachers will put the quizzes in."` |
| time limit, minutes (default 20) | `[S]` `"a time limit (usually 20 minutes)"` — *"usually"* ⇒ per-quiz value, not a constant |
| opens at / closes at | `[S]` `"a date range when it is open"` |
| negative marking on/off (+ penalty size) | `[S]` `"some of our teachers give negative marks for wrong answers and some do not. It depends on the teacher and the quiz."` |
| target class(es) | `[I]` a quiz written by a teacher of 10A must not appear to 11A; classes would otherwise be decorative |
| language / direction | `[S]` `"some of our quizzes are in Arabic"` |

> **`"It depends on the teacher and the quiz"` is the single most load-bearing sentence in the brief.**
> It means the flag lives on the **quiz** (the narrower scope wins), optionally seeded from a
> teacher-level default. Storing it only on the teacher would make it impossible for one teacher to
> run both kinds of quiz — which the sentence explicitly allows.

### `Question`
| Field | Evidence |
|---|---|
| quiz, position | `[I]` |
| text (Arabic-capable) | `[S]` |
| points — **per question** | `[S]` `"each question has its own number of points"` |
| four options, one correct | `[S]` `"15 questions with four options each"` + `"multiple choice"` |

### `Attempt`
| Field | Evidence |
|---|---|
| student + quiz, **unique together** | `[S]` `"Students should not be able to take a quiz twice."` |
| started at (server clock) | `[I]` a time limit cannot be enforced without it |
| submitted at, status | `[I]` |
| score, max score | `[S]` `"see their score at the end"` |

### `Answer`
| Field | Evidence |
|---|---|
| attempt, question, chosen option (nullable) | `[I]` |
| awarded points | `[I]` needed for per-question reporting and for auditing the scoring rule |

**Shape:** `Class 1—* Student`, `Teacher 1—* Quiz`, `Quiz 1—* Question 1—4 Option`,
`Student 1—1 Attempt per Quiz`, `Attempt 1—* Answer`.

---

## 4. Functional requirements

### 4.1 Access and identity

| ID | Requirement | Source |
|---|---|---|
| `F-AUTH-1` | Students authenticate before seeing any quiz. | `[S]` `"students log in"` |
| `F-AUTH-2` | Teachers authenticate and reach an authoring area. | `[I]` `"Our teachers will put the quizzes in."` |
| `F-AUTH-3` | Owner authenticates and reaches a reporting area covering all classes. | `[I]` `"I also want to see how the students did."` |
| `F-AUTH-4` | No public self-registration; accounts come from the centre's roster. | `[I]` `"I will send you our real student list, teacher list"` — the roster is authoritative and arrives as a file |
| `F-AUTH-5` | A student can never read another student's attempt or result, by URL or otherwise. | `[D]` see §7 |

### 4.2 Quiz authoring (teacher)

| ID | Requirement | Source |
|---|---|---|
| `F-AUTHOR-1` | Create a quiz with title, time limit, open/close dates, negative-marking setting. | `[S]` all four named |
| `F-AUTHOR-2` | Add questions, each with its own text, four options, one correct option, and its own point value. | `[S]` `"15 questions with four options each, and each question has its own number of points"` |
| `F-AUTHOR-3` | Author fully in Arabic — question text and options. | `[S]` `"some of our quizzes are in Arabic"` |
| `F-AUTHOR-4` | Assign the quiz to one or more classes. | `[I]` |
| `F-AUTHOR-5` | A teacher sees and edits only their own quizzes; the owner sees all. | `[D]` |
| `F-AUTHOR-6` | Editing is restricted once the first attempt exists. | `[D]` — otherwise scores already awarded become unexplainable |

### 4.3 Taking a quiz (student)

| ID | Requirement | Source |
|---|---|---|
| `F-TAKE-1` | Student sees the quizzes available to their class, with their state (open / not yet open / closed / already taken). | `[I]` from date range + one-attempt rule |
| `F-TAKE-2` | A quiz is startable only inside its date range. | `[S]` `"a date range when it is open"` |
| `F-TAKE-3` | One attempt per student per quiz, enforced **server-side and at the database level**. | `[S]` `"Students should not be able to take a quiz twice."` |
| `F-TAKE-4` | A countdown runs for the quiz's time limit. | `[S]` `"Each quiz has a time limit"` |
| `F-TAKE-5` | The deadline is computed from the **server-recorded start time**; the client timer is display only. | `[I]` a client-side timer is trivially defeated |
| `F-TAKE-6` | On expiry the attempt is submitted automatically with whatever was answered. | `[I]` a timed quiz that never ends is not timed |
| `F-TAKE-7` | Answers survive a page refresh or a dropped connection within the window. | `[D]` — phone-first usage makes this a routine event, not an edge case |
| `F-TAKE-8` | Score is shown immediately on submission. | `[S]` `"see their score at the end"` |

### 4.4 Scoring

| ID | Requirement | Source |
|---|---|---|
| `F-SCORE-1` | Correct answer awards that question's own point value. | `[S]` |
| `F-SCORE-2` | With negative marking off, a wrong answer awards 0. | `[S]` |
| `F-SCORE-3` | With negative marking on, a wrong answer subtracts a penalty derived from that question's points. | `[S]` `"some of our teachers give negative marks for wrong answers"` |
| `F-SCORE-4` | Unanswered questions are never penalised. | `[D]` — universal exam convention; otherwise running out of time is punished twice |
| `F-SCORE-5` | Scoring happens on the server, from stored answers; the client is never told the correct options before submission. | `[I]` |

Penalty size and whether a total may go negative are **not in the brief** → `Q-03`, `Q-04` in §6.

### 4.5 Reporting

`"I also want to see how the students did."` is one sentence carrying an entire feature area. Read
literally it is per-student outcomes; read as a centre owner would mean it, it is:

| ID | Requirement | Source |
|---|---|---|
| `F-REP-1` | Per quiz: every student's score, who has not taken it yet, the average. | `[I]` |
| `F-REP-2` | Per student: their attempts and scores over time. | `[S]` literal reading |
| `F-REP-3` | Per class: comparison across 10A / 10B / 11A. | `[I]` classes are the centre's organising unit |
| `F-REP-4` | Per question: how many got it right — which questions the class failed. | `[D]` cheap to compute, and the actual reason a teacher reads results |
| `F-REP-5` | Export to spreadsheet. | `[D]` the client's whole world is spreadsheets |

### 4.6 Data

| ID | Requirement | Source |
|---|---|---|
| `F-DATA-1` | Ship realistic sample data: 3 classes, ~20 students each, 4 teachers, at least one 15-question quiz. | `[S]` + `[A]` sample data must match what the client describes |
| `F-DATA-2` | Loading it is one documented command. | `[A]` the data must be loadable |
| `F-DATA-3` | There is an import path for spreadsheets — students, teachers, quizzes. | `[S]` `"I will send you our real student list, teacher list and last week's quiz as spreadsheets"` — and the real data arrives in that form `[A]` |

> `F-DATA-3` is a requirement, not a nice-to-have: the brief states the format of the real data and
> the moment it arrives. At minimum the seed loader should read the same file format the import will,
> so the two paths are the same code.

---

## 5. Non-functional requirements

| ID | Requirement | Source |
|---|---|---|
| `N-1` | **Phone-first.** Designed at phone width and usable there — tap targets, a timer that stays visible while scrolling, no horizontal scroll. | `[S]` `"it has to work well on phones because most students only have their phone"` |
| `N-2` | **Arabic throughout.** UTF-8 end to end (`utf8mb4`-equivalent), Arabic names rendered correctly in lists, results and exports. | `[S]` `"Many of our students have Arabic names"` |
| `N-3` | **RTL.** Arabic quiz content laid out right-to-left, including mixed Arabic/Latin/numeric strings. | `[I]` from `"some of our quizzes are in Arabic"` — an Arabic quiz in an LTR layout is not "working" |
| `N-4` | **Clean, unassisted design.** Restrained and consistent; no designer is coming. | `[S]` `"We do not have a designer, so make it look clean"` |
| `N-5` | Correct under concurrency and misuse. | `[A]` the reviewers run it and try to break it |
| `N-6` | One command from clean checkout to running app. | `[A]` one command on a clean machine |
| `N-7` | Comfortable at 300 students × 12 teachers × weekly quizzes. | `[S]` |

---

## 6. What the brief does not say — and the default for each

The client is unavailable for questions, so every gap has to be closed by a decision that is then
written down. This table is the raw material for `DECISIONS.md`.

> **These are the questions as first identified, with the defaults recommended at analysis time.**
> All of them were subsequently resolved — with the client amending several — in
> [`docs/superpowers/specs/2026-09-24-tutoring-quiz-platform-design.md`](docs/superpowers/specs/2026-09-24-tutoring-quiz-platform-design.md) §2.
> Where that spec and this table disagree, the spec is what was built.

| # | Open question | Why it matters | Recommended default |
|---|---|---|---|
| `Q-01` | How do students log in — email, student code, username? | Students are minors on phones; many have no email. | Student code / username + password, issued from the roster. Teachers and owner use email. |
| `Q-02` | Does an abandoned attempt burn the single try? | `"not … twice"` vs. a phone that dies mid-quiz. | The attempt is consumed at **start**. The timer keeps running; on expiry it auto-submits. Consistent with a paper exam, and the only rule that can't be gamed. Admin can reset an attempt. |
| `Q-03` | How big is the negative mark? | Never stated, and it changes every score. | Penalty = a configurable fraction of the question's own points, default 25%, stored on the quiz. Proportional so a 10-point question stings more than a 1-point one. |
| `Q-04` | Can a total go below zero? | Affects averages and student morale. | Clamp the displayed total at 0; store the raw value. |
| `Q-05` | Which timezone bounds the date range? | Amman is UTC+3; a UTC-bounded window opens and closes at the wrong hour locally. | Store UTC, enter and display in `Asia/Amman`. |
| `Q-06` | Does a student see the correct answers afterwards? | `"see their score"` is all that's stated; revealing answers leaks the quiz to classmates who haven't sat it. | Score + per-question right/wrong immediately; correct answers revealed only after the quiz's close date. |
| `Q-07` | One correct option, or several? | `"multiple choice … four options"` is ambiguous in English. | Exactly one correct option per question. Simplest reading, matches the paper quizzes being replaced. |
| `Q-08` | Are questions or options shuffled? | Phones side by side in one room. | Off by default, per-quiz toggle if time allows. |
| `Q-09` | Can a teacher see another teacher's quizzes and results? | Not addressed at all. | Teacher = own quizzes; owner = everything. |
| `Q-10` | Who creates accounts and resets passwords? | The roster arrives as a spreadsheet, so someone imports it. | Owner/admin, via import + a reset action. |
| `Q-11` | Can a quiz be edited after students have started? | Silently changes past scores. | Locked once an attempt exists; duplicate-to-edit instead. |
| `Q-12` | Is the UI itself bilingual, or only the content? | The brief only promises Arabic *content* works. | Content fully bilingual + RTL; UI in English for v1, with strings externalised so an Arabic UI is a translation file, not a rewrite. State this openly. |

---

## 7. Adversarial checklist

The list a reviewer will actually work through.

- **Second attempt** — resubmit the finished quiz, replay the POST, open it in two browsers at once. Must be refused by a unique constraint, not just a hidden button.
- **Beat the clock** — submit after expiry; change the device clock; leave the tab open for an hour and submit. Server start-time decides.
- **Two tabs, one attempt** — parallel submissions of the same attempt must not double-score or corrupt it.
- **Outside the window** — start a quiz before it opens or after it closes, by direct URL.
- **Someone else's data** — `/attempts/{id}`, `/results/{studentId}` with another student's id; a teacher opening another teacher's quiz.
- **Answer tampering** — post an option id from a different question, a non-existent option, or a question from another quiz.
- **Answer leakage** — correct options must not be present in the page source or API response served during the attempt.
- **Empty / partial submission** — no answers at all; unanswered questions mixed with answered ones.
- **Arabic integrity** — Arabic names and questions survive save → reload → report → export without mojibake; RTL renders correctly at phone width; mixed Arabic + Latin + digits in one string.
- **Phone reality** — 360 px wide, connection dropped mid-quiz, refresh mid-quiz, rotate, timer visible while scrolling question 14.
- **Degenerate data** — a quiz with 0 questions; a question worth 0 points; an open window that ends before it begins.

---

## 8. Sample data specification

Everything here is dictated by the brief; no invention needed except names.

| Item | Value | Source |
|---|---|---|
| Classes | `10A`, `10B`, `11A` | `[S]` |
| Students | ~20 per class, ~60 total | `[S]` |
| Teachers | 4 active (of 12 on the books) | `[S]` |
| Owner | 1 | `[I]` |
| Quiz shape | 15 questions × 4 options, per-question points | `[S]` |
| Time limit | 20 minutes | `[S]` |
| Names | Majority Arabic, realistic Jordanian names, some Latin | `[S]` |
| Quizzes | At least one fully Arabic, one English | `[S]` |
| Scoring mix | At least one quiz with negative marking on, one off — ideally **both from the same teacher**, to prove `Q-03`'s placement | `[S]` |
| States | Include a closed quiz with results, an open quiz, a not-yet-open quiz, and a mix of taken / not taken — so reporting has something to show on first login | `[I]` |

Store it in the same file format the real spreadsheets will use (CSV/XLSX), so the seeder and the
importer are one code path.

---

## 9. Delivery checklist `[A]`

Not from Nour — from the submission requirements. Every item is checked.

- [ ] Public GitHub repository with complete source (no zip, no build folder, no deploy link alone)
- [ ] `README.md` — one command to run on a clean machine, how to load sample data, login details for a student, a teacher, and the admin
- [ ] `DECISIONS.md` — assumptions (§6), what was built beyond the ask and why, what was deliberately left out, what comes next with another week
- [ ] `AI_USAGE.md` — tools used, how they were directed, how output was verified; a committed `CLAUDE.md` is welcome
- [ ] Automated tests on the parts that matter most — scoring rules, one-attempt enforcement, timer expiry, access control
- [ ] Incremental commit history
- [ ] Runs from a clean machine with one command (Docker Compose, or a documented no-Docker SQLite path)

---

## 10. Suggested build order

Inferred, not from the brief. Ordered so that stopping early still leaves something clickable —
an honest partial project beats a polished one that hides its gaps.

1. **Skeleton** — one-command run, schema, seed loader, three roles logging in.
2. **Spine** — teacher creates a quiz with questions and points → student sees it → takes it → is scored → sees the score. End to end, ugly.
3. **The rules** — single attempt (DB constraint), server-authoritative timer with auto-submit, date-range gating, negative marking.
4. **Tests on §3** — these are the parts the reviewer will try to break; they are the tests worth writing.
5. **Reporting** — per-quiz, per-class, per-student.
6. **Arabic + RTL + phone pass** — end to end, on a real 360 px viewport.
7. **Polish** — clean visual pass, CSV export, spreadsheet import.
8. **Writing** — `README.md`, `DECISIONS.md`, `AI_USAGE.md` from §6 and this document.

---

## Appendix — full traceability index

Every clause in Nour's brief, and where it landed.

| Clause | Lands in |
|---|---|
| `"about 300 students and 12 teachers"` | §1 scale, `N-7` |
| `"weekly quizzes on paper and it is killing us"` | §1 context |
| `"students log in"` | `F-AUTH-1`, `Q-01` |
| `"take a timed multiple choice quiz"` | `F-TAKE-4`…`F-TAKE-6`, `Q-07` |
| `"see their score at the end"` | `F-TAKE-8`, `Q-06` |
| `"Our teachers will put the quizzes in"` | `ACT-2`, §4.2 |
| `"a time limit (usually 20 minutes)"` | `Quiz.time_limit` (per-quiz, default 20) |
| `"a date range when it is open"` | `F-TAKE-2`, `Q-05` |
| `"should not be able to take a quiz twice"` | `F-TAKE-3`, `Q-02`, §7 |
| `"I also want to see how the students did"` | `ACT-3`, §4.5 |
| `"negative marks … depends on the teacher and the quiz"` | `Quiz.negative_marking`, `F-SCORE-3`, `Q-03`, `Q-04` |
| `"send you our real student list … as spreadsheets"` | `F-AUTH-4`, `F-DATA-3` |
| `"make up some data that looks like ours"` | §8 |
| `"10A, 10B and 11A, with around 20 students in each"` | `Class`, §8 |
| `"Four of our teachers … to start with"` | §8 |
| `"15 questions with four options each"` | `Question`, `Option`, §8 |
| `"each question has its own number of points"` | `Question.points`, `F-SCORE-1` |
| `"Arabic names … quizzes are in Arabic"` | `N-2`, `N-3`, `Q-12`, §7 |
| `"no designer, so make it look clean"` | `N-4` |
| `"work well on phones"` | `N-1`, `F-TAKE-7`, §7 |
| `"something I can click through by Thursday"` | §10 — complete flow beats deep features |
