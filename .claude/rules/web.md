---
paths:
  - "web/**/*"
---

# Web rules

- CSS uses logical properties only: `margin-inline-start`, `padding-inline`, `inset-inline-start`,
  `text-align: start`. No `left` / `right` variants — the Arabic layout mirrors by flipping `dir`,
  and one physical property breaks that without any error. Task 18 adds a CI check that fails on them.
- There are two independent directions. The interface follows the user's locale (`<html dir lang>`);
  a quiz's content follows `quiz.language`. An Arabic quiz inside the English UI still renders RTL.
- Render every user-generated string — names, question text, option text — through `<Text>`,
  which sets `dir="auto"`.
- UI copy lives in `web/src/i18n/en.json` and `ar.json` via react-i18next, never inline. Counted
  strings need all six Arabic plural suffixes: `_zero _one _two _few _many _other`.
- Numbers and dates go through `Intl` with `numberingSystem: 'latn'` and `timeZone: 'Asia/Amman'`.
  Marks arrive as integer hundredths; prefer the API's `*Label` strings.
- The countdown is display-only, anchored to the server's `serverNow` and `expiresAt`, never the
  device clock.
- Phone first: build and check at 375px wide, tap targets at least 44px, no horizontal scroll.
- The implemented shapes in `api/src/serializers/` and `api/src/routes/` are the contract. Read
  them before building a screen; the plan's sketches are older.
