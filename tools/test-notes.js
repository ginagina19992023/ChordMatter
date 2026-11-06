// 按「音符实际画的位置」点击：用 VexFlow 自己的坐标（getYs / getAbsoluteX），换算成屏幕坐标
const { chromium, devices } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  for (const h of ['song-alwayson', 'song-bach', 'song-cityofstars', 'know-k0']) {
    await p.goto('http://localhost:8765/#' + h); await p.waitForTimeout(1200);
    const r = await p.evaluate(async () => {
      let total = 0, single = 0, right = 0;
      for (const st of [...document.querySelectorAll('div.staff')].slice(0, 3)) {
        st.scrollIntoView();
        const svg = st.querySelector('svg'); const rc = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        const k = rc.width / vb.width;
        // 读出每个音符头真实画的中心（path 的几何中心，排除加线）
        for (const hd of [...svg.querySelectorAll('.vf-notehead path')]) {
          const bb = hd.getBBox(); const x = rc.left + (bb.x + bb.width / 2) * k, y = rc.top + (bb.y + bb.height / 2) * k;
          let got = null; const f = e => (got = e.detail); document.addEventListener('staffplay', f, { once: true });
          svg.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
          document.removeEventListener('staffplay', f);
          total++; if (got && got.length === 1) single++;
        }
      }
      return { total, single };
    });
    console.log(h, JSON.stringify(r));
  }
  await b.close();
})();
