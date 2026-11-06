// 识谱：上传截图 / PDF → 识别谱面上印的和弦记号（C、Am、G7/B…）→ 生成曲目
// 文字识别用 Tesseract.js，PDF 用 pdf.js，都在本机浏览器里运行，文件不会上传到任何服务器
const OCR = (() => {
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFW = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const loaded = {};
  function script(src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('load ' + src)); }; document.head.appendChild(s); }));
  }

  // 文件 → 画布（每页一张）
  async function toCanvases(file, maxPages = 6) {
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
      await script(PDFJS);
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFW;
      const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
      const out = [];
      for (let p = 1; p <= Math.min(pdf.numPages, maxPages); p++) {
        const page = await pdf.getPage(p);
        const vp = page.getViewport({ scale: 2.2 });
        const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        out.push(c);
      }
      return out;
    }
    const url = URL.createObjectURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(3.5, Math.max(1, 2400 / img.width));
    const c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return [c];
  }

  // 识别结果里的词 → 和弦（按行、从左到右）
  const PREFIX = /^[A-G][#b]?(?:maj7|m7b5|dim7|dim|aug|sus2|sus4|m7|m|7)?(?:\/[A-G][#b]?)?/;
  function norm(t) {
    t = t.replace(/^([A-G])([a-g])$/, (m, a, b) => (a.toLowerCase() === b ? a : m)); // Cc → C
    const pre = t.match(PREFIX);
    if (pre && t.length > pre[0].length && /^[—\-–_~=|.,·]/.test(t.slice(pre[0].length))) t = pre[0]; // F—1TT… → F（和谱线粘在一起）
    return t.replace(/[♯＃]/g, '#').replace(/♭/g, 'b').replace(/[（(].*$/, '').replace(/[,.;:|'"`]+$/g, '').replace(/^[|'"`]+/, '').replace(/maj/i, 'maj').replace(/M7$/, 'maj7').replace(/^([A-G])[Hh]/, '$1#');
  }
  function chordsFromWords(words) {
    const ok = [];
    words.forEach(w => {
      const t = norm(w.text.trim());
      if (!t || t.length > 9 || !/^[A-G]/.test(t) || w.confidence < 15) return;
      if (/^[A-G][#b]?o/.test(t)) return; // 扫描件里 Gm⁷、G⁷ 常被误读成 Go，不当减和弦
      const p = T.parseChord(t);
      if (p) ok.push({ sym: p.sym, x: w.bbox.x0, y: (w.bbox.y0 + w.bbox.y1) / 2, h: Math.min(w.bbox.y1 - w.bbox.y0, 80), single: /^[A-G]$/.test(t), conf: w.confidence });
    });
    // 两种版面模式的结果合并：同一位置只留把握最大的一个
    ok.sort((a, b) => b.conf - a.conf);
    for (let i = ok.length - 1; i >= 0; i--) if (ok.slice(0, i).some(o => Math.abs(o.x - ok[i].x) < Math.max(20, ok[i].h * 1.2) && Math.abs(o.y - ok[i].y) < Math.max(12, ok[i].h * 0.8))) ok.splice(i, 1);
    ok.sort((a, b) => a.y - b.y);
    const lines = [];
    ok.forEach(c => { const L = lines.find(l => Math.abs(l.y - c.y) < Math.max(12, c.h * 0.8)); if (L) { L.items.push(c); L.y = (L.y + c.y) / 2; } else lines.push({ y: c.y, items: [c] }); });
    // 单个字母容易是噪点：只有当同一行还有别的和弦（像一行和弦记号）时才保留
    return lines.map(l => {
      const multi = l.items.filter(c => !c.single).length;
      const keep = l.items.filter(c => !c.single || multi >= 1 || l.items.length >= 3 || c.conf > 70);
      // 一行只有一个和弦、又没有性质后缀、把握不大：多半是标题或歌词里的字母
      if (keep.length === 1 && keep[0].single && keep[0].conf < 85) return [];
      return keep.sort((a, b) => a.x - b.x).map(c => c.sym);
    }).filter(l => l.length);
  }

  // 由和弦猜调：调内和弦越多、首尾越像主和弦，分越高
  function guessKey(chords) {
    const keys = [];
    ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'].forEach(k => { keys.push(k); });
    ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'Dm', 'Gm', 'Cm', 'Fm'].forEach(k => keys.push(k));
    let best = null;
    keys.forEach(k => {
      let s = 0;
      chords.forEach((c, i) => {
        const a = T.analyze(c, k); if (!a) return;
        s += a.kind === 'dia' ? 2 : a.kind === 'sec' ? 0.6 : a.kind === 'bor' ? 0.3 : -1;
        if ((i === 0 || i === chords.length - 1) && a.kind === 'dia' && a.dl === 0) s += 2.5;
      });
      if (k.endsWith('m')) s -= 0.5; // 同样分数时优先大调
      if (!best || s > best.s) best = { k, s };
    });
    return best ? best.k : 'C';
  }

  async function recognize(file, onProgress) {
    onProgress && onProgress('正在读取文件…', 0.02);
    const pages = await toCanvases(file);
    onProgress && onProgress('第一次使用要下载识别引擎（约 5MB）…', 0.06);
    await script(TESS);
    const worker = await Tesseract.createWorker('eng', 1, {
      logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress('识别中…', 0.1 + 0.85 * m.progress); },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '11', preserve_interword_spaces: '1' });
    const lines = [];
    for (let i = 0; i < pages.length; i++) {
      onProgress && onProgress(`识别第 ${i + 1}/${pages.length} 页…`, 0.1 + 0.85 * (i / pages.length));
      const words = [];
      for (const psm of ['11', '6']) { await worker.setParameters({ tessedit_pageseg_mode: psm }); const { data } = await worker.recognize(pages[i]); words.push(...(data.words || [])); }
      lines.push(...chordsFromWords(words));
    }
    await worker.terminate();
    const all = lines.flat();
    return { lines: lines.filter(l => l.length), key: all.length ? guessKey(all) : '', pages: pages.length, thumbs: pages.map(c => c.toDataURL('image/jpeg', 0.7)) };
  }

  // 原谱图片存进 IndexedDB（每首自己的曲目可以随时看原谱）
  function db() {
    return new Promise((res, rej) => { const r = indexedDB.open('hexian-scores', 1); r.onupgradeneeded = () => r.result.createObjectStore('pages'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  }
  async function savePages(id, dataUrls) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('pages', 'readwrite'); tx.objectStore('pages').put(dataUrls, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function loadPages(id) { try { const d = await db(); return await new Promise(res => { const r = d.transaction('pages').objectStore('pages').get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } }

  return { recognize, chordsFromWords, guessKey, savePages, loadPages, toCanvases };
})();
