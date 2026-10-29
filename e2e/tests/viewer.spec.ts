import { expect, test } from '@playwright/test';
import { asViewer, runId, SAMPLE_VIDEO } from './fixtures';

test.use(asViewer);

test.describe('signed-in viewer', () => {
  test('the account menu shows the handle', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByText('@e2e.viewer')).toBeVisible();
  });

  test('like and unlike a video', async ({ page }) => {
    await page.goto(`/watch/${SAMPLE_VIDEO}`);
    const like = page.getByRole('button', { name: 'I like this' });
    await expect(like).toBeVisible();
    const before = await like.getAttribute('aria-pressed');
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true');
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', before ?? 'false');
  });

  test('comment, reply and delete', async ({ page }) => {
    const marker = runId();
    await page.goto(`/watch/${SAMPLE_VIDEO}`);
    const box = page.getByRole('textbox', { name: 'Comment text' });
    await box.click();
    await box.fill(`top ${marker}`);
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    const top = page.locator('.comment-item', { hasText: `top ${marker}` }).first();
    await expect(top).toBeVisible();

    await top.getByRole('button', { name: 'Reply' }).first().click();
    await page.getByRole('textbox', { name: 'Write a reply' }).fill(`reply ${marker}`);
    await top.getByRole('button', { name: 'Reply', exact: true }).last().click();
    await expect(page.locator('.comment-reply', { hasText: `reply ${marker}` })).toBeVisible();

    // Deleting the thread removes its reply too.
    await top.locator('> .comment-menu .comment-menu-trigger').click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.comment-item', { hasText: marker })).toHaveCount(0);
  });

  test('save to Watch later and remove it', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('.video-card').filter({ has: page.locator(`a[href="/watch/${SAMPLE_VIDEO}"]`) });
    await card.getByRole('button', { name: 'Action menu' }).click();
    await page.getByRole('menuitem', { name: 'Save to Watch later' }).click();
    await expect(page.getByRole('status').getByText(/Saved to|already/)).toBeVisible();

    await page.goto('/playlist/watch-later');
    const row = page.locator('.playlist-row', { has: page.locator(`a[href^="/watch/${SAMPLE_VIDEO}"]`) });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Remove from list' }).click();
    await expect(row).toHaveCount(0);
  });

  test('create a playlist from the card menu and delete it', async ({ page }) => {
    const name = runId();
    await page.goto('/');
    const card = page.locator('.video-card').filter({ has: page.locator(`a[href="/watch/${SAMPLE_VIDEO}"]`) });
    await card.getByRole('button', { name: 'Action menu' }).click();
    await page.getByRole('menuitem', { name: 'Save to playlist' }).click();
    await page.getByRole('textbox', { name: 'New playlist name' }).fill(name);
    await page.getByRole('button', { name: 'Create' }).click();
    // Wait for the add to finish before leaving the page.
    await expect(page.getByRole('status').getByText(`Saved to ${name}`)).toBeVisible();

    await page.goto('/playlists');
    await page.getByRole('link', { name }).click();
    await expect(page.locator('.playlist-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Delete playlist' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page).toHaveURL(/\/playlists$/);
    await expect(page.getByRole('link', { name })).toHaveCount(0);
  });

  test('watching adds the video to history', async ({ page }) => {
    await page.goto(`/watch/${SAMPLE_VIDEO}`);
    const video = page.locator('video');
    await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
    await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(3);
    // Pausing sends the heartbeat that records the resume position.
    await video.evaluate((v: HTMLVideoElement) => v.pause());
    await page.waitForTimeout(1500);
    await page.goto('/history');
    await expect(page.locator(`a[href="/watch/${SAMPLE_VIDEO}"]`).first()).toBeVisible();
  });

  test('notifications and subscriptions pages open', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await page.goto('/subscriptions');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });
});
