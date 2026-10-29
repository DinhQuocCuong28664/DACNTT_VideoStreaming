import { expect, test } from '@playwright/test';
import { asCreator, runId } from './fixtures';

test.use(asCreator);

test.describe('signed-in creator', () => {
  test('the channel page offers customise and manage videos', async ({ page }) => {
    await page.goto('/@e2e.creator');
    await expect(page.getByRole('heading', { name: 'E2E Creator' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Manage videos' })).toBeVisible();
  });

  test('a verified account sees the upload dropzone', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByRole('button', { name: /Drag and drop|Select/ }).first()).toBeVisible();
  });

  test('another channel can be subscribed and unsubscribed', async ({ page }) => {
    await page.goto('/@e2e.viewer');
    const subscribe = page.getByRole('button', { name: 'Subscribe' });
    await subscribe.click();
    await page.getByRole('button', { name: 'Subscribed' }).click();
    await page.getByRole('menuitem', { name: 'Unsubscribe' }).click();
    await expect(page.getByRole('button', { name: 'Subscribe' })).toBeVisible();
  });

  test('the studio lists content and opens analytics', async ({ page }) => {
    await page.goto('/studio');
    await expect(page.getByRole('heading', { name: 'Channel content' })).toBeVisible();
    await expect(page.locator('.studio-table, .empty-state').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Analytics' }).click();
    await expect(page.getByText('Views (28 days)')).toBeVisible();
  });

  test('the channel description can be changed and restored', async ({ page }) => {
    const marker = runId();
    await page.goto('/settings');
    const box = page.getByRole('textbox', { name: 'Description' });
    const before = await box.inputValue();
    await box.fill(marker);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').getByText('Changes saved')).toBeVisible();
    await page.reload();
    await expect(box).toHaveValue(marker);
    await box.fill(before);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').getByText('Changes saved').first()).toBeVisible();
  });

  test('a membership tier can be added and retired', async ({ page }) => {
    const name = runId();
    await page.goto('/settings?tab=memberships');
    await page.getByRole('textbox', { name: 'Tier name' }).fill(name);
    await page.getByRole('button', { name: 'Add tier' }).click();
    const row = page.locator('.studio-list-row', { hasText: name });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Retire tier' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retire tier' }).click();
    await expect(row).toHaveCount(0);
  });

  test('the appearance tab switches the theme', async ({ page }) => {
    await page.goto('/settings?tab=appearance');
    await page.getByRole('radio', { name: 'Dark theme' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('radio', { name: 'Light theme' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
