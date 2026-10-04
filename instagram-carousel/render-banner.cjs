const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1700, height: 700 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/banner.html'); await p.evaluate(() => document.fonts.ready);
  await (await p.$('#p')).screenshot({ path: 'linkedin-banner-profile.png' });
  await (await p.$('#c')).screenshot({ path: 'linkedin-banner-company.png' });
  await b.close();
})();
