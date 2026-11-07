// 关键界面不为空：有些错误不会报错，只会让一块内容悄悄变空（比如一行代码被注释吃掉）
// 逐页打开，检查每一块该有的东西都在
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const server = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0].split('#')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(d); }); });
server.listen(8781, async () => {
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await c.addInitScript(() => { if (!sessionStorage.getItem('t')) { sessionStorage.setItem('t', '1'); localStorage.setItem('hexian.v1', JSON.stringify({ v: 3, savedAt: Date.now() + 1e9, songView: 'grid', songTab: 'sheet' })); } });
  const checks = [
    ['#songs', '.scard', 5, '曲目卡片'],
    ['#acc', '.acard', 4, '伴奏卡片'],
    ['#song-alwayson', '#klpanel .dot', 3, '键盘图层的圆点'],
    ['#song-alwayson', '#grid .cell', 4, '和弦格子'],
    ['#combo', '.combos li', 8, '组合和弦列表'],
    ['#combo-c4536', '.rollentry', 1, '瀑布流入口'],
    ['#combo-c4536', '.variant', 0, '（抠掉前没有变体）'],
    ['#chords', '.chip', 10, '和弦页选项'],
    ['#browse', '.brchips .chip', 10, '和弦浏览'],
    ['#today', '.steps li', 4, '今天的 4 步'],
    ['#sight', '.sightpath li', 14, '视奏关卡'],
    ['#sight-t1', '.sight-st svg .vf-stavenote', 1, '视奏开头的路标音'],
  ];
  let bad = 0;
  for (const [h, sel, min, name] of checks) {
    await p.goto('http://localhost:8781/index.html' + h); await p.waitForTimeout(700);
    const n = await p.$$eval(sel, e => e.length);
    const ok = min === 0 ? n === 0 : n >= min; if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name}：${n}${min ? `（至少 ${min}）` : ''}`);
  }
  // 播放时和弦格子和键盘图层要同步
  await p.goto('http://localhost:8781/index.html#song-alwayson'); await p.waitForTimeout(600);
  await p.$eval('.dock .play', e => e.click()); await p.waitForTimeout(1300);
  const sync = await p.evaluate(() => { const c = document.querySelector('#grid .cell.on-play'), k = document.querySelector('#klpanel .klhead b'); return c && k ? c.dataset.s.replace(/#/g, '♯').replace(/b(?=\d|$|\/)/g, '♭') === k.textContent || T.disp(c.dataset.s) === k.textContent : false; });
  await p.$eval('.dock .play', e => e.click());
  if (!sync) bad++; console.log(`${sync ? '✓' : '✗'} 播放时和弦格子和键盘图层同步`);
  // 色带要在「结构」分页
  await p.goto('http://localhost:8781/index.html#song-alwayson'); await p.waitForTimeout(500);
  await p.$eval('[data-act="songtab"][data-v="shape"]', e => e.click()); await p.waitForTimeout(400);
  const hs = await p.$$eval('.hstrip .hbar', e => e.length); if (hs < 70) bad++; console.log(`${hs >= 70 ? '✓' : '✗'} 和声色带格子：${hs}（至少 70）`);
  // 视奏：开始一轮后五线谱上有音、键盘可点；点对第一个音进到第 2 个
  await p.goto('http://localhost:8781/index.html#sight-t2'); await p.waitForTimeout(500);
  await p.$eval('[data-act="sgo"]', e => e.click()); await p.waitForTimeout(500);
  const sv = await p.evaluate(() => { const r = window.__sight(); const n = document.querySelectorAll('#sst .vf-stavenote').length, k = document.querySelectorAll('#skb [data-act="key"]').length; document.querySelector(`#skb [data-m="${r.items[0].ms[0]}"]`).dispatchEvent(new MouseEvent('click', { bubbles: true })); return { n, k, i: window.__sight().i }; });
  const sok = sv.n === 4 && sv.k >= 14 && sv.i === 1; if (!sok) bad++; console.log(`${sok ? '✓' : '✗'} 视奏一轮：一行 ${sv.n} 个音、键盘 ${sv.k} 个键、点对后到第 ${sv.i + 1} 个`);
  console.log(errs.length ? '页面错误：' + errs.slice(0, 3).join(' | ') : '没有页面错误');
  console.log(bad || errs.length ? `✗ ${bad} 处为空` : '✓ 关键界面都有内容');
  await b.close(); server.close(); process.exit(bad || errs.length ? 1 : 0);
});
