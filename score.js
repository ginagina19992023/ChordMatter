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
      el.querySelectorAll('g.measure').forEach((g, i) => {
        let n = NaN; try { n = parseInt(tk.getElementAttr(g.dataset.id || g.id).n, 10); } catch (e) {}
        if (isNaN(n)) n = i + 1;
        const txt = opt.labels[n]; if (!txt) return;
        const bb = g.getBBox(), svg = g.ownerSVGElement;
        const fs = Math.max(bb.height * 0.075, 1);
        const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        t.setAttribute('x', bb.x + fs * 0.3); t.setAttribute('y', bb.y - fs * 0.15);
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
    cur = { el, notes, sc, tk };
    el.onclick = e => {
      const g = e.target.closest('g.note, g.chord');
      if (!g) { // 点到小节的空白处：告诉外面是第几小节
        const m = e.target.closest('g.measure'); if (!m || e.target.closest('[data-act]')) return;
        let n = NaN; try { n = parseInt(tk.getElementAttr(m.dataset.id || m.id).n, 10); } catch (err) {}
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
