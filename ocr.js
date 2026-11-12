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
    if (Array.isArray(file)) { const out = []; for (const f of file) { if (out.length >= 10) break; out.push(...await toCanvases(f, 10 - out.length)); } return out; } // 一次选了很多张图 / 多个 PDF：依次读，合在一起（最多 10 页）
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

  // ---------- AI 识谱：把谱子图片交给 Claude 读 ----------
  // 两条路：Claude 预览版里用看的人自己的 Claude 账号（sample 能力）；网站版用自己填的 Anthropic API Key（只存本机）
  const AI_MODEL = 'claude-opus-5-5';
  // 长截图切成几段（每段不太细长），否则缩到模型的分辨率后字太小
  function tiles(c) {
    const out = [], W = c.width, H = c.height, step = Math.round(W * 1.35), ov = Math.round(W * 0.12);
    if (H <= W * 1.8) return [c];
    for (let y = 0; y < H; y += step - ov) {
      const h = Math.min(step, H - y); if (h < W * 0.25 && out.length) break;
      const t = document.createElement('canvas'); t.width = W; t.height = h; t.getContext('2d').drawImage(c, 0, y, W, h, 0, 0, W, h); out.push(t);
      if (y + h >= H) break;
    }
    return out;
  }
  function shrink(c, max = 1800) {
    const k = Math.min(1, max / Math.max(c.width, c.height)); if (k === 1) return c;
    const o = document.createElement('canvas'); o.width = Math.round(c.width * k); o.height = Math.round(c.height * k);
    const g = o.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, o.width, o.height); g.drawImage(c, 0, 0, o.width, o.height); return o;
  }
  const QUALS = ['', 'm', '7', 'maj7', 'm7', 'dim', 'dim7', 'm7b5', 'aug', 'sus2', 'sus4'];
  function aiPrompt(n) {
    return `你在读一份钢琴谱 / 弹唱谱的图片，共 ${n} 张，按顺序排列（长截图会被切成几段，相邻两段有少量重叠，重叠的小节不要重复记）。
任务：把整首曲子的和弦按小节写出来。
1. 谱面上印有和弦记号（C、Am7、G/B 这类）的地方：照着抄，这一段的 src 写 "printed"。
2. 没有印和弦记号的地方（纯五线谱）：根据左右手的音判断每小节的和弦，src 写 "inferred"。
3. 每小节写 1–2 个和弦，用空格隔开；一个和弦持续好几小节，就每小节都写一遍。休止或看不出和弦的小节，沿用前一个和弦。
4. 和弦只用这种写法：根音 A–G，可加 # 或 b，后面接这些性质之一：${QUALS.map(q => q || '（空，表示大三）').join('、')}；需要时再加 /低音（例如 C/E）。add9、6、9、11、13 之类简化成最接近的一个。
5. 按谱上的段落标记分段（前奏、主歌、副歌、间奏、尾奏、A、B、Verse、Chorus…）；没有标记就每 4–8 小节一段，名字写「第1段」「第2段」。反复记号按谱面写一遍即可，不用展开。
6. 调：根据调号和和弦判断，写成 C、G、F#、Bb、Am、F#m 这样。
7. 曲名：谱上能看到就写，看不到写空字符串。
只输出一个 JSON 对象，不要任何别的文字：
{"title":"","key":"C","sections":[{"name":"前奏","src":"printed","bars":["C","Am","F G","C"]}],"note":"一句话：哪里看不清、哪些是你判断的"}`;
  }
  function parseAI(text) {
    const t = String(text || '').replace(/```(?:json)?/g, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('AI 没有给出结果');
    const o = JSON.parse(t.slice(a, b + 1));
    const fix = s => String(s || '').trim().replace(/[♯＃]/g, '#').replace(/♭/g, 'b').replace(/M7$/, 'maj7').replace(/min/, 'm');
    // App 不认识的扩展和弦，简化成最接近的：Cadd9→C、Cm9→Cm7、G13→G7、Fmaj9→Fmaj7、C7sus4→C7…
    const simp = x => {
      if (!x) return ''; if (T.parseChord(x)) return x;
      const m = /^([A-G][#b]?)([^/]*)(\/[A-G][#b]?)?$/.exec(x); if (!m) return '';
      const q = m[2], b = m[3] || '';
      const tries = [/^(maj|M|Δ)(9|11|13)/.test(q) ? 'maj7' : /^m(?!aj)(9|11|13)/.test(q) ? 'm7' : /^m(?!aj)/.test(q) ? 'm' : /^(7|9|11|13)/.test(q) ? '7' : /dim/.test(q) ? 'dim' : /aug|\+/.test(q) ? 'aug' : /sus2/.test(q) ? 'sus2' : /sus/.test(q) ? 'sus4' : ''];
      for (const t of tries) { if (T.parseChord(m[1] + t + b)) return m[1] + t + b; if (T.parseChord(m[1] + t)) return m[1] + t; }
      return T.parseChord(m[1]) ? m[1] : '';
    };
    const sections = (o.sections || []).map((s, i) => ({
      name: String(s.name || '第' + (i + 1) + '段').replace(/[:：|]/g, ' ').trim().slice(0, 12),
      src: s.src === 'inferred' ? 'inferred' : 'printed',
      bars: (Array.isArray(s.bars) ? s.bars : String(s.bars || '').split('|')).map(b => String(b).split(/\s+/).map(fix).map(simp).filter(Boolean).join(' ')).filter(Boolean),
    })).filter(s => s.bars.length);
    const all = sections.flatMap(s => s.bars.join(' ').split(' '));
    const k = String(o.key || '').trim();
    return { title: String(o.title || '').trim().slice(0, 40), key: k && T.parseKey(k) ? k : (all.length ? guessKey(all) : 'C'), sections, note: String(o.note || '').slice(0, 200) };
  }
  async function viaApi(key, b64s, prompt) {
    const body = { model: AI_MODEL, max_tokens: 16000, output_config: { effort: 'medium' }, fallbacks: 'default',
      messages: [{ role: 'user', content: b64s.map(d => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d } })).concat([{ type: 'text', text: prompt }]) }] };
    const send = b => fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' }, b.fallbacks ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}), body: JSON.stringify(b) });
    let r = await send(body);
    if (r.status === 400) { const j = await r.clone().json().catch(() => ({})); if (/fallback/i.test(JSON.stringify(j))) { delete body.fallbacks; r = await send(body); } }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    if (j.stop_reason === 'refusal') throw new Error('Claude 没有处理这张图');
    return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  }
  async function viaClaude(blobs, prompt) {
    const sample = window.claude && await claude.use('sample');
    if (!sample) { const e = new Error('这里用不了 Claude'); e.code = 'unavailable'; throw e; }
    const lim = await sample.limits();
    if (!lim.images) { const e = new Error('这里不能把图片发给 Claude'); e.code = 'images_unavailable'; throw e; }
    const { text } = await sample(prompt, { images: blobs.slice(0, lim.images.maxCount), modelTier: 'complex' });
    return text;
  }
  // backend：{ api: key } 用自己的 API Key；{ claude: true } 用 Claude 预览版里看的人自己的账号
  async function aiRecognize(file, onProgress, backend) {
    onProgress && onProgress('正在读取文件…', 0.05);
    const pages = await toCanvases(file);
    const parts = pages.flatMap(tiles).map(c => shrink(c)).slice(0, 12);
    onProgress && onProgress(`把 ${parts.length} 张图交给 Claude 读谱，大约要 20–90 秒…`, 0.25);
    const prompt = aiPrompt(parts.length);
    let tick = 0.25; const tm = setInterval(() => { tick = Math.min(0.92, tick + 0.015); onProgress && onProgress('Claude 正在读谱（20–90 秒）…', tick); }, 1500);
    try {
      const text = backend.api
        ? await viaApi(backend.api, parts.map(c => c.toDataURL('image/jpeg', 0.85).split(',')[1]), prompt)
        : await viaClaude(await Promise.all(parts.map(c => new Promise(res => c.toBlob(res, 'image/jpeg', 0.85)))), prompt);
      return Object.assign(parseAI(text), { ai: 1, thumbs: pages.map(c => c.toDataURL('image/jpeg', 0.7)) });
    } finally { clearInterval(tm); }
  }

  return { recognize, chordsFromWords, guessKey, savePages, loadPages, toCanvases, aiRecognize, parseAI };
})();
