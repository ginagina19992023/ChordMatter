// 体验审计：遍历所有页面，检查 ① 自评按钮 ② 没有解释的术语 ③ 每个术语都有对应的课 ④ 页面错误
// 用法：在 hexian 目录起静态服务（python3 -m http.server 8765），然后 node tools/audit.js
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const U = 'http://localhost:8765/';
  await p.goto(U + '#today'); await p.waitForTimeout(600);
  const routes = await p.evaluate(() => {
    const r = ['today', 'path', 'sym', 'inv', 'logic', 'know', 'chords', 'songs', 'acc', 'acctest', 'me', 'cards', 'scan'];
    UNITS.forEach(u => r.push('unit-' + u.id));
    KNOW.forEach(k => r.push('know-' + k.id));
    SONGS.forEach(s => r.push('song-' + s.id, 'mem-' + s.id));
    SING.forEach(s => r.push('sing-' + s.id));
    SYMS.concat(INVS, LOGICS).forEach(c => r.push('sym-' + c.id));
    r.push('arp-C', 'quiz-u5');
    return r;
  });
  // ③ 每个术语都有对应的课
  const glossMissing = await p.evaluate(() => {
    const ids = SYMS.concat(INVS, LOGICS).map(c => c.id).concat(KNOW.map(k => k.id));
    const src = document.documentElement.innerHTML; // GLOSS 在闭包里，从页面脚本文本里取
    return null;
  });
  const SELF = /我记住|我能背|弹对了|弹错了|^✓ 干净|✗ 有错|懂了|自评/;
  const JARGON = ['正格终止', '变格终止', '半终止', '阻碍终止', '终止式', '王道进行', '卡农进行', '2–5–1', '低音线', '和声功能', '副属和弦', '借用和弦', '和声小调', '导音', '属音', '下属音', '大三和弦', '小三和弦', '属七和弦', '大七和弦', '减三和弦', '罗马数字', '第一转位', '第二转位', '一转', '二转', '原位', '转位', '根音', '三音', '五音', '级数', '伴奏型'];
  let selfBtns = [], unlinked = {}, pages = 0, linkedTotal = 0; const allPairs = new Set();
  for (const r of routes) {
    await p.goto(U + '#songs'); await p.goto(U + '#' + r); await p.waitForTimeout(450);
    pages++;
    const res = await p.evaluate(JARGON => {
      const SKIP = 'button, a, svg, input, textarea, select, label, nav, h1, h2, .tag, .fx, .kb, .tcard, .symbig, .jp, .grade, .now, .cell, .pc, .opt, .chip, .stat, .qbar, .cxname, .tc-title, .bars, .ring-t, .heat, .jpq, .src, code, .termref, .chordref';
      const btns = [...document.querySelectorAll('#view button, #view a.btn')].map(x => x.textContent.trim());
      const w = document.createTreeWalker(document.getElementById('view'), NodeFilter.SHOW_TEXT);
      const miss = [];
      while (w.nextNode()) { const n = w.currentNode; if (n.parentElement.closest(SKIP)) continue; JARGON.forEach(t => { if (n.nodeValue.includes(t)) miss.push(t); }); }
      return { btns, miss, linked: document.querySelectorAll('#view .termref').length, pairs: [...document.querySelectorAll('#view .termref')].map(x => x.textContent + '→' + x.dataset.id) };
    }, JARGON);
    res.btns.filter(t => SELF.test(t)).forEach(t => selfBtns.push(r + ': ' + t));
    // 课自己的那个词不链接到自己（这是有意的），其余都应该有链接
    const ownId = r.startsWith('sym-') ? r.slice(4) : null;
    const ownTerms = ownId ? await p.evaluate(id => window.__glossOf ? window.__glossOf(id) : [], ownId) : [];
    res.miss.filter(t => !ownTerms.includes(t)).forEach(t => { (unlinked[t] = unlinked[t] || new Set()).add(r); });
    linkedTotal += res.linked; res.pairs.forEach(x => allPairs.add(x));
  }
  // ③ 术语 → 课：点开每个术语的浮窗，确认有「去学这一课」且课存在
  await p.goto(U + '#unit-u13'); await p.waitForTimeout(600);
  const terms = [...allPairs];
  const broken = [];
  for (const t of terms) {
    const [w, id] = t.split('→');
    const ok = await p.evaluate(id => !!(SYMS.concat(INVS, LOGICS).find(c => c.id === id) || KNOW.find(k => k.id === id)), id);
    if (!ok) broken.push(t);
  }
  await p.click('#view .termref >> nth=0'); await p.waitForTimeout(400);
  const popText = (await p.textContent('.tpop-card')).replace(/\s+/g, ' ').slice(0, 90);
  // ⑤ 每个术语都有自己的解释：不能有没写解释的词，也不能两个不同的词显示同一段话（一转 = 第一转位这类同义词除外）
  const defs = await p.evaluate(words => words.map(w => { const d = termDef(w, 'C'); return [w, d ? d.mean : null]; }), [...new Set(terms.map(t => t.split('→')[0]))]);
  const ALIAS = { '第一转位': '一转', '第二转位': '二转' };
  const noDef = defs.filter(d => !d[1]).map(d => d[0]);
  const same = defs.filter((d, i) => d[1] && defs.some((e, j) => j < i && e[1] === d[1] && ALIAS[d[0]] !== e[0] && ALIAS[e[0]] !== d[0])).map(d => d[0]);
  console.log('页面数', pages, '· 术语下划线总数', linkedTotal);
  console.log('① 自评按钮：', selfBtns.length ? selfBtns.join(' | ') : '无');
  console.log('② 没有解释链接的术语：', Object.keys(unlinked).length ? Object.entries(unlinked).map(([t, s]) => t + '@' + [...s].slice(0, 3).join(',')).join(' | ') : '无');
  console.log('③ 术语 → 课：', new Set(terms.map(t => t.split('→')[0])).size, '个不同的术语，都指向', new Set(terms.map(t => t.split('→')[1])).size, '节课，失效', broken.length, '· 浮窗示例：', popText);
  console.log('   对照：', [...new Set(terms)].sort().join('  '));
  console.log('⑤ 术语解释：', defs.length, '个词，缺解释', noDef.length ? noDef.join('、') : '0', '· 和别的词重复', same.length ? same.join('、') : '0');
  console.log('④ 页面错误：', errs.length ? errs.slice(0, 5).join(' | ') : '无');
  await b.close();
})();
