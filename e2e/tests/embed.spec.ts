import { expect, test } from '@playwright/test';
import { SAMPLE_VIDEO } from './fixtures';

// The test host page is not on the local network, so Chrome's Local Network Access check
// would block it from framing the localhost dev server. A real site framing the public
// deployment never meets that check.
test.use({ launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks'] } });

test('the embed player plays a public video inside an iframe', async ({ page }) => {
  // A page on another origin hosts the iframe, like a third-party site would.
  const src = new URL(`/embed/${SAMPLE_VIDEO}`, test.info().project.use.baseURL).href;
  await page.route('http://third-party.localhost/', (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><iframe id="e" width="640" height="360" src="${src}" allow="autoplay; fullscreen"></iframe>`,
  }));
  await page.goto('http://third-party.localhost/');
  const frame = page.frameLocator('#e');
  const video = frame.locator('video');
  await expect(video).toBeAttached({ timeout: 20_000 });
  await video.evaluate((v: HTMLVideoElement) => { v.muted = true; return v.play(); });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 20_000 }).toBeGreaterThan(1);
  await expect(frame.locator('.embed-title')).toHaveAttribute('href', new URL(`/watch/${SAMPLE_VIDEO}`, test.info().project.use.baseURL).href);
});
