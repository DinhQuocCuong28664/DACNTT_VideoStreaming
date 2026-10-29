import { expect, test } from '@playwright/test';
import { asCreator, asViewer } from './fixtures';

test.describe('staff console (admin)', () => {
  test.use(asCreator);

  test('every tab opens', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Content moderation' })).toBeVisible();
    for (const name of ['To review', 'Removed', 'Comments', 'Appeals', 'Spot check', 'Accuracy', 'Decision log', 'Team']) {
      await page.getByRole('tab', { name, exact: false }).first().click();
      await expect(page.locator('.spinner')).toHaveCount(0, { timeout: 15_000 });
    }
  });

  test('the team tab finds a user by handle', async ({ page }) => {
    await page.goto('/admin?tab=users');
    await page.getByRole('searchbox', { name: 'Search by name or email' }).fill('e2e.viewer');
    await page.locator('.admin-page').getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('link', { name: 'E2E Viewer' })).toBeVisible();
  });
});

test.describe('staff console (viewer)', () => {
  test.use(asViewer);

  test('a regular user is sent to the forbidden page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/403$/);
  });
});
