import { test, expect } from '@playwright/test';
import { signIn, TEACHER, expectNoHorizontalScroll } from './helpers';

test('a teacher writes a quiz, publishes it, and reads a class report', async ({ page }) => {
  await signIn(page, TEACHER);
  await expect(page).toHaveURL(/\/teach/);
  await expectNoHorizontalScroll(page);

  const title = `E2E quiz ${Date.now()}`;
  await page.getByRole('link', { name: 'New quiz' }).click();

  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Time limit in minutes').fill('15');
  // Only the classes this teacher is assigned to are offered at all.
  await page.locator('fieldset').getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Create quiz' }).click();

  await expect(page).toHaveURL(/\/teach\/quizzes\/\d+$/);
  await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();

  // Publishing is refused until the paper is actually a paper.
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('alert')).toContainText('It has no questions.');

  const form = page.locator('form').filter({ has: page.getByLabel('Add a question') });
  await form.getByLabel('Add a question').fill('What is 2 + 2?');
  await form.getByLabel('Marks').fill('2');
  for (const [i, text] of ['3', '4', '5', '6'].entries()) {
    await form.getByLabel(`Option ${i + 1}`).fill(text);
  }
  await form.getByRole('radio').nth(1).check();          // "4" is the right answer
  await form.getByRole('button', { name: 'Add a question' }).click();

  await expect(page.getByLabel('Question 1')).toHaveValue('What is 2 + 2?');

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('button', { name: 'Published' })).toBeVisible();

  // The marks the teacher typed are the marks the quiz is worth: 2 marks, stored
  // as 200 hundredths, shown back as 2 marks and never as 200.
  await page.getByRole('link', { name: 'Back' }).click();
  const card = page.locator('li.card').filter({ hasText: title });
  await expect(card).toContainText('2 marks');
  await expect(card).toContainText('1 question');
});

test('a class average opens the names behind it', async ({ page }) => {
  await signIn(page, TEACHER);

  // The average is the link: reading it is the moment you want the names (D-06).
  await page.locator('a.rowlink').first().click();
  await expect(page).toHaveURL(/\/classes\/\d+$/);

  await expect(page.getByText('Class average')).toBeVisible();
  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeGreaterThan(0);

  // A teacher's report never carries the raw score; only the principal's does.
  await expect(page.getByRole('columnheader', { name: 'Raw' })).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});
