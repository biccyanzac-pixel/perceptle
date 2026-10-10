// Screenshots of each task's reveal after its animation has finished: node tools/reveal-shots.mjs
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
const srv = await serve(8084);
const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await b.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 });
const tap = async (x, y) => { const r = await page.locator('.stage-canvas').boundingBox(); await page.mouse.click(r.x + x * r.width, r.y + y * r.height); };
for (const [type, d] of [['count', 0.6], ['angle', 0.8], ['proportion', 0.6], ['length', 1], ['midpoint', 0.6]]) {
  await page.goto(`http://localhost:8084/dev/show.html?type=${type}&d=${d}&seed=reveal-${type}`);
  await page.waitForSelector('.stage-canvas');
  if (type === 'count') { await page.keyboard.type('123'); await page.keyboard.press('Enter'); await page.keyboard.type('30'); await page.keyboard.press('Enter'); }
  else if (type === 'angle') { await page.keyboard.type('70'); await page.keyboard.press('Enter'); }
  else if (type === 'proportion') { await page.keyboard.type('40'); await page.keyboard.press('Enter'); }
  else { await tap(0.5, 0.5); await page.waitForTimeout(100); if (type === 'length') await tap(0.2, 0.2); await page.click('.ctl-btn'); }
  await page.waitForTimeout(3200);
  await page.screenshot({ path: `tools/results/reveal-${type}.png` });
}
await b.close(); srv.close();
