const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  for (const [id, scale, out] of [['#c', 3.5, 'linkedin-banner-company.png'], ['#p', 1, 'linkedin-banner-profile.png']]) {
    const p = await b.newPage({ viewport: { width: 1700, height: 700 }, deviceScaleFactor: scale });
    await p.goto('file://' + __dirname + '/banner.html'); await p.evaluate(() => document.fonts.ready);
    await (await p.$(id)).screenshot({ path: out });
    await p.close();
  }
  await b.close();
})();
