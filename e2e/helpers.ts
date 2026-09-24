import { expect, type Page } from '@playwright/test';

/** Seeded fixture credentials for the throwaway e2e database (data/*.csv). */
export const PASSWORD = 'pass1234';
export const STUDENT = '10A-001';
export const TEACHER = 't-samir';
export const PRINCIPAL = 'principal';

/**
 * The interface opens in Arabic and then follows the account's own locale, so a
 * spec that reads English labels has to ask for English explicitly — before
 * signing in and again afterwards, since the account may flip it back.
 */
export async function useEnglish(page: Page) {
  const html = page.locator('html');
  if (await html.getAttribute('dir') === 'ltr') return;
  await page.getByRole('button', { name: 'اللغة' }).click();
  await expect(html).toHaveAttribute('dir', 'ltr');
}

export async function signIn(page: Page, loginCode: string) {
  await page.goto('/login');
  await useEnglish(page);
  await page.getByLabel('Login code').fill(loginCode);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await useEnglish(page);
}

/** Nothing should ever scroll sideways on a phone. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}
