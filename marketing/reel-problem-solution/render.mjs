import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
const FPS = 30;
const only = process.argv[2]; // optional: comma-separated seconds for preview stills
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto('file://' + path.resolve('reel.html'));
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(800);
if (only) {
  for (const s of only.split(',')) { await page.evaluate(t => seek(t), +s); await page.screenshot({ path: `preview_${s}.png` }); }
} else {
  const dur = await page.evaluate(() => window.DUR);
  const ff = spawn('ffmpeg', ['-y','-f','image2pipe','-framerate',String(FPS),'-c:v','png','-i','-',
    '-c:v','libx264','-pix_fmt','yuv420p','-profile:v','high','-crf','16','-preset','slow','-movflags','+faststart','nomadic-reel.mp4'], { stdio: ['pipe','ignore','inherit'] });
  for (let f = 0; f < dur*FPS; f++) {
    await page.evaluate(t => seek(t), f/FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
}
await browser.close();
