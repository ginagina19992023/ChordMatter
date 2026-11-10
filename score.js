// 原曲完整乐谱：Verovio 渲染 Humdrum 乐谱 + 段落高亮 + 用原谱音符播放
const Score = (() => {
  const VBASE = 'https://cdn.jsdelivr.net/npm/verovio@4.3.1/dist/';
  let tkP = null;
  function toolkit() {
    if (tkP) return tkP;
    tkP = (async () => {
      const [{ default: createModule }, { VerovioToolkit }] = await Promise.all([import(VBASE + 'verovio-module-hum.mjs'), import(VBASE + 'verovio.mjs')]);
      const mod = await createModule();
      return new VerovioToolkit(mod);
    })();
    tkP.catch(() => (tkP = null));
    return tkP;
  }
  const cache = {};
  async function data(url) {
    if (cache[url]) return cache[url];
    const r = await fetch(url);
    if (!r.ok) throw new Error('fetch');
    return (cache[url] = await r.text());
  }
  let cur = null; // { tk, el, notes:[{t,dur,pitch,id,m}], measures }
  async function render(el, sc, opt) {
    const tk = await toolkit();
    const kern = sc.kern || await data(sc.src);
    const W = Math.max(300, el.clientWidth);
    const scale = W < 500 ? 32 : 40;
    tk.setOptions({ pageWidth: Math.round(W * 100 / scale), scale, adjustPageHeight: true, breaks: 'auto', pageMarginLeft: 20, pageMarginRight: 20, pageMarginTop: 20, footer: 'none', header: opt.section ? 'none' : 'auto', svgViewBox: true, svgHtml5: true });
    tk.loadData(kern);
    if (opt.section && sc.measures) tk.select({ measureRange: sc.measures });
    tk.redoLayout && tk.redoLayout();
    const pages = tk.getPageCount();
    let html = '';
    for (let p = 1; p <= pages; p++) html += tk.renderToSVG(p);
    el.innerHTML = html;
    // 段落高亮：完整谱里给学习小节加底色
    const ms = [...el.querySelectorAll('g.measure')];
    if (!opt.section && sc.measures) {
      const [a, b] = sc.measures.split('-').map(Number);
      ms.forEach((g, i) => {
        let n = NaN; try { n = parseInt(tk.getElementAttr(g.dataset.id || g.id).n, 10); } catch (e) {}
        if (isNaN(n)) n = i + 1;
        if (n >= a && n <= b) g.classList.add('learn');
      });
    }
    // 每小节上方写上和弦与级数（来自曲目的和声分析）
    if (opt.labels) {
      // 同一个小节号只标最后那个（弱起小节在 Verovio 里会和第 1 小节同号）
      const lastOf = {}; el.querySelectorAll('g.measure').forEach((g, i) => { let n = NaN; try { n = parseInt(tk.getElementAttr(g.dataset.id || g.id).n, 10); } catch (e) {} if (isNaN(n)) n = i + 1; lastOf[n] = g; });
      el.querySelectorAll('g.measure').forEach((g, i) => {
        let n = NaN; try { n = parseInt(tk.getElementAttr(g.dataset.id || g.id).n, 10); } catch (e) {}
        if (isNaN(n)) n = i + 1;
        g.dataset.n = lastOf[n] === g ? n : n - 1; // 弱起小节记为第 0 小节
        if (lastOf[n] !== g) return;
        const bb = g.getBBox(), svg = g.ownerSVGElement;
        const fs = Math.max(bb.height * 0.1, 1);
        // 小节线上方的小三角：点它从这一小节一直播放到结尾（画成图形，不用 ▶ 字符：iPhone 会把字符画成图标）
        if (opt.barAct) {
          const NS = 'http://www.w3.org/2000/svg', st = g.querySelector(':scope > g.staff'), sb = st ? st.getBBox() : bb;
          const top = (() => { const ln = st && st.querySelector(':scope > path'); return ln ? ln.getBBox().y : sb.y; })();
          const sz = fs * 0.52, x0 = bb.x - sz * 0.3, y0 = top - sz * 1.45;
          const mk = document.createElementNS(NS, 'g'); mk.setAttribute('class', 'pfm'); mk.dataset.act = 'playfrom'; mk.dataset.n = n;
          const hit = document.createElementNS(NS, 'rect'); hit.setAttribute('x', x0 - sz); hit.setAttribute('y', y0 - sz * 1.2); hit.setAttribute('width', sz * 3.2); hit.setAttribute('height', sz * 3.2); hit.setAttribute('class', 'pfm-hit');
          const tri = document.createElementNS(NS, 'path'); tri.setAttribute('d', `M${x0} ${y0}L${x0} ${y0 + sz}L${x0 + sz * 0.9} ${y0 + sz / 2}Z`); tri.setAttribute('class', 'pfm-tri');
          mk.appendChild(hit); mk.appendChild(tri); (g.parentNode || svg).appendChild(mk);
        }
        const txt = opt.labels[n]; if (!txt) return;
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', bb.x + fs * (opt.barAct ? 0.85 : 0.3)); t.setAttribute('y', bb.y - fs * 0.15);
        t.setAttribute('font-size', fs); t.setAttribute('class', 'chordlab'); t.dataset.n = n;
        if (opt.barAct) { t.dataset.act = 'barev'; t.style.cursor = 'pointer'; }
        t.textContent = txt;
        (g.parentNode || svg).appendChild(t);
      });
    }
    // 时间表 → 播放用的音符
    const tm = tk.renderToTimemap({ includeMeasures: true });
    const notes = [];
    let m = 0;
    tm.forEach(e => {
      if (e.measureOn) m++;
      (e.on || []).forEach(id => {
        try { const v = tk.getMIDIValuesForElement(id); if (v && v.pitch) notes.push({ t: e.tstamp / 1000, dur: Math.max(0.12, v.duration / 1000), pitch: v.pitch, id }); } catch (err) {}
      });
    });
    // 每个音在第几行谱表（从上往下 0、1、2…）：对比谱只播放选中的那几行
    const staffOf = {};
    const barOf = {};
    el.querySelectorAll('g.measure').forEach((mg, mi) => {
      let mn = NaN; try { mn = parseInt(tk.getElementAttr(mg.dataset.id || mg.id).n, 10); } catch (e) {} if (isNaN(mn)) mn = mi + 1;
      [...mg.querySelectorAll(':scope > g.staff')].forEach((sg, si) => sg.querySelectorAll('g.note').forEach(nn => { staffOf[nn.dataset.id || nn.id] = si; barOf[nn.dataset.id || nn.id] = mn; }));
    });
    notes.forEach(n => { n.staff = staffOf[n.id]; n.m = barOf[n.id]; });
    // 连音线：被连住的后一个音不再单独发声，前一个音一直延长到它结束
    const byId = {}; notes.forEach(n => (byId[n.id] = n));
    const ties = []; el.querySelectorAll('g.tie').forEach(g => { try { const a = tk.getElementAttr(g.dataset.id || g.id); const s0 = String(a.startid || '').replace('#', ''), e0 = String(a.endid || '').replace('#', ''); if (byId[s0] && byId[e0]) ties.push([byId[s0], byId[e0]]); } catch (err) {} });
    ties.sort((x, y) => x[0].t - y[0].t).forEach(([a, b]) => { const root = a.tieRoot || a; root.dur = Math.max(root.dur, b.t + b.dur - root.t); b.silent = true; b.tieRoot = root; });
    cur = { el, notes, sc, tk };
    el.onclick = e => {
      const g = e.target.closest('g.note, g.chord');
      if (!g) { // 点到小节的空白处：告诉外面是第几小节
        if (e.target.closest('[data-act]')) return;
        // 点在空白处时 SVG 里没有元素被点到：按坐标找是哪一小节
        const m = e.target.closest('g.measure') || [...el.querySelectorAll('g.measure')].find(g => { const r = g.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12; });
        if (!m) return;
        let n = m.dataset.n != null ? +m.dataset.n : NaN; if (isNaN(n)) try { n = parseInt(tk.getElementAttr(m.dataset.id || m.id).n, 10); } catch (err) {}
        if (!isNaN(n)) el.dispatchEvent(new CustomEvent('staffbar', { detail: n, bubbles: true }));
        return;
      }
      const ids = g.classList.contains('chord') ? [...g.querySelectorAll('g.note')].map(x => x.dataset.id || x.id) : [g.dataset.id || g.id];
      const ms = ids.map(id => { try { return tk.getMIDIValuesForElement(id).pitch; } catch (err) { return null; } }).filter(Boolean);
      if (ms.length) { g.classList.add('playing'); setTimeout(() => g.classList.remove('playing'), 500); el.dispatchEvent(new CustomEvent('staffplay', { detail: ms, bubbles: true })); }
    };
    return { pages, notes: notes.length };
  }
  // 学习段落的时间范围（完整谱中）
  return { render, toolkit, get: () => cur };
})();
