// Browser acceptance checks against the production bundle on localhost.
// No production requests, payment calls or credentials. YouTube frames are mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('/tmp/circ-video-browser/node_modules/playwright');
const root = path.resolve('build');
const output = path.resolve('artifacts/edition2025-video');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(root, 'index.html');
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(resolve => server.listen(4178, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, viewport, language] of [
      ['desktop-pt', { width: 1440, height: 1300 }, 'pt'],
      ['mobile-pt', { width: 390, height: 1000 }, 'pt'],
      ['small-mobile-pt', { width: 320, height: 1000 }, 'pt'],
      ['desktop-en', { width: 1280, height: 1200 }, 'en'],
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await context.addInitScript(lang => {
        localStorage.setItem('circ-language', lang);
        localStorage.setItem('cookies-consent', 'rejected');
      }, language);
      const page = await context.newPage();
      const youtubeRequests = [];
      await page.route('**/*', route => {
        const u = new URL(route.request().url());
        if (u.hostname === '127.0.0.1') return route.continue();
        if (u.hostname.includes('youtube') || u.hostname.includes('ytimg') || u.hostname.includes('googlevideo')) {
          youtubeRequests.push(u.href);
          return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Test player</title><body style="background:#10142d;color:white">Mock YouTube player</body>' });
        }
        return route.abort();
      });
      await page.goto('http://127.0.0.1:4178/#circ2025-video', { waitUntil: 'networkidle' });
      const section = page.locator('#circ2025-video');
      await section.waitFor({ state: 'visible' });
      await section.scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('#circ2025-video img')?.naturalWidth > 0);
      assert.equal(await section.locator('iframe').count(), 0);
      assert.equal(youtubeRequests.length, 0, 'No YouTube traffic before explicit play');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No horizontal overflow');
      const cover = section.locator('.edition-film__cover');
      const box = await cover.boundingBox();
      assert.ok(box.width >= 200 && box.height >= 200, 'YouTube minimum player viewport');
      await section.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
      await cover.focus();
      await page.keyboard.press('Enter');
      const frame = section.locator('iframe');
      await frame.waitFor();
      assert.match(await frame.getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\/bvVn2Bl3BRw\?/);
      assert.equal(await frame.getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
      await section.getByRole('button', { name: language === 'en' ? /Close video/ : /Fechar vídeo/ }).click();
      assert.equal(await section.locator('iframe').count(), 0);
      assert.equal(await cover.evaluate(el => el === document.activeElement), true, 'Focus returns to play control');
      console.log(`${name}: cover, lazy embed, minimum size, keyboard, close, focus and layout OK`);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
