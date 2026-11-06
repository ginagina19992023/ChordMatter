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
    const kern = await data(sc.src);
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
    cur = { el, notes, sc };
    return { pages, notes: notes.length };
  }
  // 学习段落的时间范围（完整谱中）
  return { render, toolkit, get: () => cur };
})();
