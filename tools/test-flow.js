const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const U = 'http://localhost:8765/';
  const closeGift = async () => { if (await p.$('.giftov')) await p.click('.giftov button[data-act=giftclose]'); };
  await p.goto(U + '#today');
  await p.evaluate(() => { localStorage.clear(); indexedDB.deleteDatabase('hexian-state'); localStorage.setItem('hexian.v1', JSON.stringify({ place: 'away' })); }); await p.reload(); await p.waitForTimeout(400);
  // 1 热身
  await p.click('[data-act=flow]'); await p.waitForSelector('#akb [data-act=key]');
  const sym = decodeURIComponent(p.url().split('#arp-')[1].split('-')[0]);
  const seq = await p.evaluate(s => { const T = window.__hexian.T; const a = T.arpeggio(T.parseChord(s), 'R'); return a.up.concat(a.up.slice(0, -1).reverse()).map(n => n.midi); }, sym);
  for (let r = 0; r < 3; r++) { await closeGift(); for (const m of seq) await p.click(`#akb [data-m="${m}"]`); await p.waitForTimeout(200); }
  await closeGift();
  console.log('warm:', (await p.textContent('.cta.flow')).trim());
  // 2 学：两张符号卡
  await p.click('[data-act=flow]'); await p.waitForTimeout(400);
  console.log('learn page:', p.url());
  for (let card = 0; card < 2; card++) {
    for (let g = 0; g < 10; g++) {
      await closeGift();
      const st = await p.evaluate(() => { const s = window.__hexian.SY(); const r = s && s.reps[s.i]; return r ? { type: r.type, pcs: r.pcs, bass: r.bass, answer: r.answer } : null; });
      if (!st) break;
      if (st.type === 'tap') { const ms = st.pcs.map(pc => (st.bass == null || pc === st.bass || pc > st.bass ? 60 + pc : 72 + pc)); for (const m of ms) await p.click(`#symkb [data-m="${m}"]`); }
      else await p.click(`#symtask .opt[data-v="${st.answer}"]`);
      await p.waitForTimeout(950);
      if (/学会了/.test(await p.textContent('#symtask'))) break;
    }
    await p.waitForTimeout(300); await closeGift();
    await p.click('#symtask .cta.flow a, #symtask .cta.flow button');
    await p.waitForTimeout(400);
  }
  console.log('after learn:', p.url());
  // 3 练
  await p.waitForSelector('.opt');
  let n = 0; while (await p.$('.opt') && n < 30) { await closeGift(); await p.click('.opt >> nth=0'); await p.click('[data-act=next]'); n++; }
  await p.waitForTimeout(300); await closeGift();
  await p.click('[data-act=flow]'); await p.waitForSelector('#tapkb');
  console.log('song page:', p.url());
  const syms = await p.evaluate(() => JSON.parse(document.querySelector('#memstaff .staff').dataset.staff).bars.flat());
  for (const s of syms) { const pcs = await p.evaluate(x => window.__hexian.T.parseChord(x).notes.map(n => n.pc), s); for (const pc of pcs) await p.click(`#tapkb [data-m="${60 + pc}"]`); await p.waitForTimeout(40); }
  await p.waitForTimeout(400); await closeGift();
  console.log('mem:', (await p.textContent('#dctl')).replace(/\s+/g, ' ').slice(0, 80));
  await p.click('#dctl [data-act=flow]'); await p.waitForTimeout(400);
  await p.waitForTimeout(600); console.log('gift on today page:', !!(await p.$('.giftov'))); await closeGift(); console.log('today ring:', await p.textContent('.ring-t b'), '|', await p.textContent('.donemsg').catch(() => ''));
  await p.goto(U + '#me'); await p.waitForTimeout(400); console.log((await p.textContent('.tbl')).slice(0, 120));
  console.log(errs.join('\n') || 'no errors'); await b.close();
})();
