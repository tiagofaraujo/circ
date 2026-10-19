// Production-bundle checks served locally. No account, payment or provider access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('/tmp/circ-committee-browser/node_modules/playwright');
const expectedNames = require('../src/data/scientificCommittee2027.json');
const root = path.resolve('build');
const output = path.resolve('artifacts/scientific-committee2027');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
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
  await new Promise(resolve => server.listen(4180, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, viewport, language, columns] of [
      ['desktop-pt', { width: 1440, height: 1080 }, 'pt', 3],
      ['tablet-pt', { width: 820, height: 1180 }, 'pt', 2],
      ['mobile-pt', { width: 390, height: 900 }, 'pt', 1],
      ['small-mobile-pt', { width: 320, height: 900 }, 'pt', 1],
      ['desktop-en', { width: 1280, height: 1000 }, 'en', 3],
    ]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
      await context.addInitScript(lang => {
        localStorage.setItem('circ-language', lang);
        localStorage.setItem('cookies-consent', 'rejected');
      }, language);
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
      await page.goto('http://127.0.0.1:4180/organizacao#comissao-cientifica', { waitUntil: 'networkidle' });
      const section = page.locator('#comissao-cientifica');
      await section.waitFor({ state: 'visible' });
      await page.evaluate(() => document.fonts.ready);
      const labels = language === 'en' ? ['Scientific Committee', 'CIRC 2027 committees'] : ['Comissão Científica', 'Comissões do CIRC 2027'];
      assert.equal(await section.locator('h2').textContent(), labels[0]);
      assert.deepEqual(await section.locator('li').allTextContents(), expectedNames);
      assert.equal(expectedNames.length, 17);
      assert.equal(await section.locator('a, img, button, input, iframe').count(), 0);
      assert.doesNotMatch(await section.innerHTML(), /@|mailto:|\.xlsx|contacto/i);
      assert.equal(await page.locator('#comissao-organizadora li').count(), 9);
      assert.equal(await section.locator('ul').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), columns);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'No horizontal overflow');
      assert.equal(await section.locator('li').evaluateAll(items => items.every(el => el.scrollWidth <= el.clientWidth + 1)), true, 'Names are not clipped');
      await section.scrollIntoViewIfNeeded();
      await section.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
      const nav = page.getByRole('navigation', { name: labels[1] });
      const link = nav.getByRole('link', { name: labels[0] });
      await link.focus();
      await page.keyboard.press('Enter');
      await page.waitForTimeout(100);
      assert.equal(new URL(page.url()).hash, '#comissao-cientifica');
      assert.deepEqual(pageErrors, [], 'No runtime page errors');
      console.log(`${name}: 17 names, no contacts, original organisers, ${columns} columns and anchor OK`);
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
