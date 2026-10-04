const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/carousel.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  console.log(await p.evaluate(() => [...document.fonts].map(f=>f.family+':'+f.status).join(', ')));
  for (let i = 1; i <= 5; i++) await (await p.$('#s' + i)).screenshot({ path: `nomadic-0${i}.png` });
  await b.close();
})();
