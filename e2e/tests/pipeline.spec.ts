/**
 * The main flow end to end: the creator uploads a 36-second clip through the UI, the real
 * pipeline (SQS, Step Functions, Batch Fargate) processes it, the watch page plays it, and
 * the studio edits its details and chapters. The video is deleted at the end.
 *
 * It runs the transcoder on Fargate (a few minutes, a few cents), so it is opt-in:
 * E2E_PIPELINE=1 npx playwright test tests/pipeline.spec.ts
 */
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { asCreator, runId } from './fixtures';

const CLIP = fileURLToPath(new URL('../fixtures/clip36.mp4', import.meta.url));
const PROCESSING_TIMEOUT = 15 * 60_000;

test.use(asCreator);
test.skip(!process.env['E2E_PIPELINE'], 'set E2E_PIPELINE=1 to run the transcoding pipeline');
test.setTimeout(PROCESSING_TIMEOUT + 5 * 60_000);

test('upload, process, watch, edit in the studio, delete', async ({ page }) => {
  const title = `pipeline ${runId()}`;

  // Upload through the UI as an unlisted video.
  await page.goto('/upload');
  await page.locator('input[type="file"]').setInputFiles(CLIP);
  await page.getByRole('textbox', { name: /Title/ }).fill(title);
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('radio', { name: /Unlisted/ }).check();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page).toHaveURL(/\/watch\/[a-f0-9]{24}$/, { timeout: 120_000 });
  const id = page.url().split('/').pop() ?? '';

  // The watch page polls until the workflow publishes the video, then plays it.
  const video = page.locator('video');
  await expect(video).toBeAttached({ timeout: PROCESSING_TIMEOUT });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 30_000 }).toBeGreaterThan(2);

  // Edit details and chapters in the studio.
  const edited = `${title} edited`;
  await page.goto('/studio');
  const row = page.locator('tr', { has: page.locator(`a[href="/watch/${id}"]`) });
  await expect(row.getByText('Ready')).toBeVisible();
  await row.getByRole('button', { name: 'Edit video' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Title/ }).fill(edited);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').getByText('Changes saved')).toBeVisible();

  await dialog.getByRole('tab', { name: 'Chapters' }).click();
  await dialog.getByRole('textbox', { name: 'Chapters' }).fill('0:00 Start\n0:12 Middle\n0:24 End');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').getByText('Chapters saved')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();

  await page.goto(`/watch/${id}`);
  await expect(page.getByRole('heading', { name: edited })).toBeVisible();

  // Clean up.
  await page.goto('/studio');
  await row.getByRole('button', { name: 'Delete video' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(row).toHaveCount(0);
});
