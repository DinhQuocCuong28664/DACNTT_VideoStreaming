import { expect, test } from '@playwright/test';
import { asCreator } from './fixtures';

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
});
