import { test, expect } from '@playwright/test';
import { signIn, STUDENT, expectNoHorizontalScroll } from './helpers';

test('a student sits a quiz once and sees a mark but not the answers', async ({ page }) => {
  await signIn(page, STUDENT);
  await expect(page).toHaveURL(/\/quizzes/);
  await expectNoHorizontalScroll(page);

  // Exactly one quiz is open to this class, so exactly one card offers a start.
  const start = page.getByRole('button', { name: 'Start' });
  await expect(start).toHaveCount(1);
  await start.click();

  await expect(page).toHaveURL(/\/attempts\/\d+$/);
  const attemptUrl = page.url();
  await expect(page.getByRole('timer')).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Answer every question, taking the first option each time. One question per
  // screen, so this is also the navigation being exercised.
  const total = Number(/of (\d+)/.exec(await page.getByText(/Question \d+ of \d+/).innerText())![1]);
  expect(total).toBeGreaterThan(0);

  await page.locator('.question input[type="radio"]').first().check();
  await expect(page.getByText('Saved')).toBeVisible();

  // A refresh mid-attempt must lose nothing: the answers are on the server and
  // the deadline was written once, at the start. This happens before the rest is
  // answered, because a reload returns to the first question.
  await page.reload();
  await expect(page.locator('.question input[type="radio"]').first()).toBeChecked();
  await expect(page.getByText(`Question 1 of ${total}`)).toBeVisible();

  for (let i = 1; i <= total; i++) {
    await expect(page.getByText(`Question ${i} of ${total}`)).toBeVisible();
    const first = page.locator('.question input[type="radio"]').first();
    // Question 1 came back from the server already answered, and checking an
    // already-checked radio fires no change, so there would be nothing to save.
    if (!await first.isChecked()) await first.check();
    if (i < total) await page.getByRole('button', { name: 'Next' }).click();
  }

  // Every question now carries an answer, which the progress bar reports.
  await expect(page.locator('progress')).toHaveJSProperty('value', total);

  await page.getByRole('button', { name: 'Finish' }).click();
  await page.locator('.confirm').getByRole('button', { name: 'Finish' }).click();

  await expect(page).toHaveURL(/\/attempts\/\d+\/result/);
  await expect(page.getByText(/out of/)).toBeVisible();

  // The paper is not given back while others can still be sitting it.
  await expect(page.getByText('Answers are not out yet')).toBeVisible();
  await expect(page.getByText('Correct answer')).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // The one-attempt rule: no way back in, and no second start.
  await page.goto(attemptUrl);
  await expect(page).toHaveURL(/\/result/);
  await page.goto('/quizzes');
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0);
});

test('a finished quiz shows up under my results', async ({ page }) => {
  await signIn(page, STUDENT);
  await page.getByRole('link', { name: 'My results' }).click();

  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByRole('heading', { name: 'My results' })).toBeVisible();
  await expect(page.locator('.card').first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
