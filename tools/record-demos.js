// 录制演示视频：画面用 Playwright 录屏，声音用同一套合成音色离线渲染，最后 ffmpeg 合成 mp4
// 用法：先在 hexian 目录起一个静态服务（python3 -m http.server 8765），再 node tools/record-demos.js
const { chromium } = require('playwright');
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const OUT = path.join(__dirname, '..', 'media');
const TMP = process.env.TMPDIR_DEMO || '/tmp';
const DARK = !!process.env.DARK; // DARK=1 录深色版：media/demo-xxx-dark.mp4
const SCENES = (process.argv[2] || 'inversions,function,arpeggio,progression').split(',');

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const s of SCENES) {
    const t0 = Date.now();
    // 录屏按 CSS 像素算，不吃 deviceScaleFactor：所以页面开 780×1400、整体放大 2 倍，录出来铺满画面又清楚
    const ctx = await b.newContext({ viewport: { width: 780, height: 1400 }, recordVideo: { dir: TMP, size: { width: 780, height: 1400 } } });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8765/tools/demo-video.html?s=' + s + (DARK ? '&dark=1' : ''));
    await p.addStyleTag({ content: 'body { transform: scale(2); transform-origin: 0 0; }' });
    await p.waitForTimeout(1200);
    const total = await p.evaluate(() => DEMO.total);
    const wav = await p.evaluate(() => DEMO.audio());
    const offset = (Date.now() - t0) / 1000;
    await p.evaluate(() => DEMO.play());
    await p.waitForTimeout(total * 1000 + 400);
    const vpath = await p.video().path();
    await ctx.close();
    const wavPath = path.join(TMP, s + '.wav');
    fs.writeFileSync(wavPath, Buffer.from(wav, 'base64'));
    const out = path.join(OUT, 'demo-' + s + (DARK ? '-dark' : '') + '.mp4');
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', offset.toFixed(2), '-i', vpath, '-i', wavPath, '-t', String(total), '-map', '0:v', '-map', '1:a',
      '-vf', 'scale=540:970:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '96k', out]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '2', '-i', out, '-frames:v', '1', out.replace('.mp4', '.jpg')]);
    console.log(s, 'offset', offset.toFixed(2), '→', out, Math.round(fs.statSync(out).size / 1024) + 'KB');
  }
  await b.close();
})();
