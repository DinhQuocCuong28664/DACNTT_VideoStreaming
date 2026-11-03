import { expect, test } from '@playwright/test';
import { API } from '../global-setup';
import { SAMPLE_VIDEO } from './fixtures';

test.describe('guest', () => {
  test('home lists ready videos with signed thumbnails', async ({ page }) => {
    await page.goto('/');
    const cards = page.locator('.video-card');
    await expect(cards.first()).toBeVisible();
    const src = await cards.first().locator('.video-card-thumbnail img').getAttribute('src');
    expect(src).toContain('Signature=');
  });

  test('search tolerates one typo', async ({ page, request }) => {
    // A word of the sample video's title with two inner letters swapped, so the test holds on
    // every environment: "Bảng" becomes "Bảgn".
    const res = await request.get(`${API}/v1/videos/${SAMPLE_VIDEO}`);
    const { video } = (await res.json()) as { video: { title: string } };
    const word = video.title.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).find((w) => w.length >= 4) ?? '';
    expect(word, 'the sample title needs a word of four letters or more').not.toBe('');
    const typo = word.slice(0, 2) + word[3] + word[2] + word.slice(4);
    await page.goto(`/results?q=${encodeURIComponent(typo)}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(typo);
    await expect(page.locator('.video-card', { hasText: video.title }).first()).toBeVisible();
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

  test('the landing page opens', async ({ page }) => {
    await page.goto('/landing');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Terraform modules')).toBeVisible();
  });

  test('the embed page says when a video does not exist', async ({ page }) => {
    await page.goto('/embed/000000000000000000000000');
    await expect(page.getByText('This video is unavailable.')).toBeVisible();
  });
});
