// 题目生成器模糊测试：每类题随机生成 500 道，检查答案在选项里、选项不重复、没有 undefined/NaN
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8765/#today'); await p.waitForTimeout(500);
  const r = await p.evaluate(() => {
    const { GEN } = window.__hexian; const bad = []; let total = 0;
    for (const k in GEN) for (let i = 0; i < 500; i++) {
      let q; total++;
      try { q = GEN[k](); } catch (e) { bad.push(k + ' 抛错 ' + e.message); continue; }
      if (!q.options.includes(q.answer)) bad.push(k + ' 答案不在选项里：' + q.q);
      if (new Set(q.options).size !== q.options.length) bad.push(k + ' 选项重复');
      if (/undefined|NaN/.test(JSON.stringify(q))) bad.push(k + ' 含 undefined/NaN');
    }
    return { types: Object.keys(GEN).length, total, bad: [...new Set(bad)].slice(0, 10) };
  });
  console.log(r.bad.length || errs.length ? '✗ ' + r.bad.concat(errs).join(' | ') : `✓ 题目生成器 ${r.types} 类 × 500 = ${r.total} 道全部合格`);
  await b.close(); process.exit(r.bad.length || errs.length ? 1 : 0);
})();
