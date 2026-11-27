// Run the app's Vite server and use a Chromium installation from Playwright.
// BASE_URL and CHROMIUM_PATH can select the server and the local browser.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.BASE_URL || 'http://127.0.0.1:5199';
const out = resolve(process.env.HOUSING_RENDER_OUTPUT || 'public/home-designs/model-v1');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', error => console.error(error));
  await page.goto(base + '/scripts/housing-preview/index.html');
  await page.waitForFunction(() => typeof window.captureHomeModel === 'function', null, { timeout: 45000 });
  const ids = process.argv.length > 2 ? process.argv.slice(2) : await page.evaluate(() => window.catalogIds);
  const assets = new Map();
  for (const id of ids) {
    const { pictures, assemblySlabs, floors } = await page.evaluate(id => window.captureHomeModel(id), id);
    for (const [view, url] of Object.entries(pictures)) {
      if (!url.startsWith('data:image/webp;base64,')) throw new Error('Non-WebP render for ' + id);
      assets.set(id + '-' + view + '.webp', Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log(id, floors + ' floors, ' + assemblySlabs + ' model pieces, front and rear');
  }
  // Writing under public/ triggers Vite to reload, so publish after all captures.
  for (const [file, bytes] of assets) await writeFile(resolve(out, file), bytes);
} finally {
  await browser.close();
}
