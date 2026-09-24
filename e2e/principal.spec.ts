import { test, expect } from '@playwright/test';
import { signIn, PRINCIPAL, expectNoHorizontalScroll } from './helpers';

test('the principal administers the centre', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Unrestricted scope (D-07): every quiz in the centre, not just one author's.
  await expect(page.locator('li.card').first()).toBeVisible();

  await page.getByRole('button', { name: 'Classes' }).click();
  await expect(page.getByText(/students?$/).first()).toBeVisible();

  await page.getByRole('button', { name: 'People' }).click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  // The roster is served without a password hash anywhere in it.
  expect(await page.content()).not.toMatch(/scrypt|password_hash/);

  await page.getByRole('button', { name: 'Who teaches what' }).click();
  await expect(page.getByLabel('Teacher')).toBeVisible();

  await expectNoHorizontalScroll(page);
});

test('only the principal sees the raw score', async ({ page }) => {
  await signIn(page, PRINCIPAL);

  await page.locator('a.rowlink').first().click();
  await expect(page).toHaveURL(/\/classes\/\d+$/);

  // display_score = max(0, raw_score), and the negative one is the principal's
  // alone (D-05). The teacher spec asserts the opposite for the same page.
  await expect(page.getByRole('columnheader', { name: 'Raw' })).toBeVisible();
  await expect(page.getByText(/Raw scores can be negative/)).toBeVisible();
});

test('the import page states the format it expects', async ({ page }) => {
  await signIn(page, PRINCIPAL);
  await page.getByRole('link', { name: 'Import a roster' }).click();

  await expect(page).toHaveURL(/\/admin\/import/);
  // The header format is on the page so nobody has to go and find the docs.
  await expect(page.getByText('login_code, full_name, class_name, password, locale')).toBeVisible();
  await expect(page.getByText(/never changes an existing password/)).toBeVisible();

  await page.getByLabel('What are you importing?').selectOption('teachers');
  await expect(page.getByText('login_code, full_name, role, password, locale')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
