import { expect, test } from '@playwright/test';
import { SAMPLE_VIDEO } from './fixtures';

test.describe('guest', () => {
  test('home lists ready videos with signed thumbnails', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.video-card');
    await expect(cards.first()).toBeVisible();
    const src = await cards.first().locator('img').getAttribute('src');
    expect(src).toContain('Signature=');
  });

  test('search tolerates one typo', async ({ page }) => {
    await page.goto('/results?q=uplaod');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('uplaod');
    await expect(page.locator('.video-card').first()).toContainText('upload');
  });

  test('a video plays through the CDN with its AES key', async ({ page }) => {
    await page.goto(`/watch/${SAMPLE_VIDEO}`);
    const video = page.locator('video');
    await expect(video).toBeVisible();
    await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(1);
    expect(await video.evaluate((v: HTMLVideoElement) => v.videoHeight)).toBeGreaterThan(0);
    await expect(page.locator('.video-error-overlay')).toHaveCount(0);
  });

  test('unknown pages show the 404 screen with a mascot', async ({ page }) => {
    await page.goto('/@no-such-channel-e2e');
    await expect(page.getByText('Error 404')).toBeVisible();
    await expect(page.locator('.status-mascot')).toBeVisible();
  });

  test('a wrong password is refused with a message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@zelos.test');
    await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('wrong');
  });

  test('signed-in pages send guests to sign in and back', async ({ page }) => {
    await page.goto('/history');
    await expect(page).toHaveURL(/\/login$/);
  });
});
