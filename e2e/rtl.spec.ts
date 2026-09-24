import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll } from './helpers';

test.describe('direction', () => {
  test('opens in Arabic and mirrors both ways with no horizontal scroll', async ({ page }) => {
    await page.goto('/');

    // Arabic is the centre's own language and the default for a first visit.
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'اللغة' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expectNoHorizontalScroll(page);

    // And back, which is where a half-applied stylesheet would show up.
    await page.getByRole('button', { name: 'Language' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expectNoHorizontalScroll(page);
  });

  test('remembers the choice across a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'اللغة' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });
});
