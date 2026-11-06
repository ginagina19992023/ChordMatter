// 完整扒谱（两声部 kern：左手、右手）→ 三种看法
//   compare：上下对比（右手原曲 / 原曲左手 / 和弦左手），一小节对一小节
//   practice：练习版（右手原曲 + 左手按和弦弹）
//   orig：原曲
// 歌词（用户自己粘贴，存本机）按顺序贴到右手旋律的每个新音下面
const FullScore = (() => {
  const F = (a, b) => a / b;
  function dur(tok) {
    if (!tok || tok === '.' || /^[*!=]/.test(tok)) return null;
    const sub = tok.split(' ')[0];
    if (/q/.test(sub)) return 0;
    const m = /^[\[\(\{&]*(\d+)(%\d+)?(\.*)/.exec(sub); if (!m) return 0;
    let d = m[2] ? F(4 * +m[2].slice(1), +m[1]) : F(4, +m[1]), add = d;
    for (let i = 0; i < m[3].length; i++) { add /= 2; d += add; }
    return d;
  }
  const isNoteStart = tok => tok && tok !== '.' && !/^[*!=]/.test(tok) && !/r/.test(tok.split(' ')[0]) && !/[\]_]/.test(tok.split(' ')[0]);
  // 解析两声部 kern：返回小节列表，每小节是带起始时间的行
  function parse(kern) {
    const out = [], head = []; let cur = { n: 0, rows: [] }, rem = [0, 0], t = 0;
    kern.split('\n').forEach(l => {
      if (!l.trim() || l.startsWith('!!')) return;
      const f = l.split('\t');
      if (f[0].startsWith('**') || f[0] === '*-') return;
      if (f[0].startsWith('=')) {
        if (cur.rows.length || cur.n) out.push(cur);
        cur.len = t + Math.max(...rem);
        const m = /^=(\d+)/.exec(f[0]); cur = { n: m ? +m[1] : -1, rows: [], end: !m }; rem = [0, 0]; t = 0; return;
      }
      if (f[0].startsWith('*') || f[0].startsWith('!')) {
        if (!/^\*(k\[|M\d|MM)/.test(f[0])) return; // 只保留调号、拍号、速度；谱表、谱号由 build 自己写
        if (!out.length && !cur.rows.some(r => r.f)) head.push(f); else cur.rows.push({ interp: f });
        return;
      }
      cur.rows.push({ t, f });
      f.forEach((tok, i) => { const d = dur(tok); if (d != null) rem[i] = d; });
      const live = rem.filter(x => x > 1e-9); const step = live.length ? Math.min(...live) : 0;
      rem = rem.map(x => Math.max(0, x - step)); t += step;
    });
    if (cur.rows.length) out.push(cur);
    const ms = out.filter(m => m.n >= 0 && m.rows.some(r => r.f)); ms.head = head;
    return ms;
  }
  // 左手和弦：密集排列在 G2–G3 一带；一小节两个和弦就各占半小节
  const RD = { 4: '1', 3: '2.', 2: '2', 1: '4', 1.5: '4.', 0.5: '8' };
  function chordTokens(chords, kp, len = 4) {
    if (!chords || !chords.length) return [[0, (RD[len] || '1') + 'r']];
    const d = chords.length === 1 ? '1' : chords.length === 2 ? '2' : '4';
    const step = 4 / chords.length;
    return chords.slice(0, 4).map((sym, i) => {
      const c = T.parseChord(sym); if (!c) return [i * step, d + 'r'];
      let prev = 0; const ns = c.notes.slice(0, 4).map((n, k) => { let m; if (k === 0) { m = 48 + n.pc; if (m > 54) m -= 12; } else { m = 36 + n.pc; while (m <= prev) m += 12; } prev = m; return d + kp(n.name, m); });
      const bass = c.bass && c.bass.pc !== c.root.pc ? [d + kp(c.bass.name, 36 + c.bass.pc + (36 + c.bass.pc < 40 ? 12 : 0))] : [];
      return [i * step, bass.concat(ns).join(' ')];
    });
  }
  function syllables(text) {
    // 中文逐字；英文按空格和连字符；「_」= 这个音不贴字
    return String(text || '').replace(/[，。、！？,.!?；;：:“”"'（）()]/g, ' ').split(/\s+/).filter(Boolean).flatMap(w => /[一-鿿]/.test(w) ? [...w] : w.split('-').map((x, i, a) => x + (i < a.length - 1 ? '-' : '')));
  }
  // mode: compare | practice | orig
  function build(kern, opt) {
    const { mode, barChords, kp, title, lyrics, from, to } = opt;
    const ms = parse(kern), syl = syllables(lyrics); let si = 0;
    const withChord = mode !== 'orig', withOrigL = mode !== 'practice';
    const cols = [].concat(withChord ? ['chord'] : [], withOrigL ? ['L'] : [], ['R', 'text']);
    const hdr = (fn) => cols.map(fn).join('\t');
    const L = ['!!!OTL: ' + title,
      hdr(c => c === 'text' ? '**text' : '**kern'),
      hdr(c => ({ chord: '*staff3', L: '*staff2', R: '*staff1', text: '*staff1' })[c]),
      hdr(c => ({ chord: '*I"和弦', L: '*I"原曲', R: '*I"右手', text: '*' })[c]),
      hdr(c => ({ chord: '*clefF4', L: '*clefF4', R: '*clefG2', text: '*' })[c])];
    let started = false;
    ms.forEach(m => {
      const inRange = (from == null || m.n >= from) && (to == null || m.n <= to);
      // 歌词按全曲顺序数：范围外的小节也要把音数过去
      if (!inRange) { m.rows.forEach(r => { if (r.f && isNoteStart(r.f[1])) si++; }); return; }
      if (!started) { started = true; ms.head.forEach(f => L.push(hdr(c => c === 'text' ? '*' : c === 'R' ? f[1] : f[0]))); }
      if (m.n > 0 || from) L.push(hdr(() => '=' + m.n)); // 弱起小节（0）前面不画小节线
      const ct = withChord ? chordTokens(barChords[m.n], kp, m.len && m.len < 4 - 1e-6 ? m.len : 4) : [];
      const times = [...new Set(m.rows.filter(r => r.f).map(r => +r.t.toFixed(4)).concat(ct.map(x => +x[0].toFixed(4))))].sort((a, b) => a - b);
      m.rows.filter(r => r.interp).forEach(r => L.push(hdr(c => c === 'text' ? '*' : c === 'R' ? r.interp[1] : r.interp[0])));
      times.forEach(tt => {
        const row = m.rows.find(r => r.f && Math.abs(r.t - tt) < 1e-4), ch = ct.find(x => Math.abs(x[0] - tt) < 1e-4);
        const rTok = row ? row.f[1] : '.';
        let lyr = '.';
        if (isNoteStart(rTok)) { const w = syl[si++]; if (w && w !== '_') lyr = w; }
        L.push(hdr(c => c === 'chord' ? (ch ? ch[1] : '.') : c === 'L' ? (row ? row.f[0] : '.') : c === 'R' ? rTok : lyr));
      });
    });
    L.push(hdr(() => '=='), hdr(() => '*-'));
    return L.join('\n');
  }
  // 扒谱 → 瀑布流用的音符（拍为单位；连音线合并成一个长音）
  function kernMidi(sub) {
    const m = /([a-gA-G])\1*/.exec(sub); if (!m) return null;
    const L = m[0], lower = L[0] === L[0].toLowerCase(), n = L.length;
    const oct = lower ? 3 + n : 4 - n;
    const pc = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[L[0].toLowerCase()];
    const acc = (sub.slice(m.index + n).match(/^[#\-n]*/) || [''])[0];
    return 12 * (oct + 1) + pc + (acc.split('#').length - 1) - (acc.split('-').length - 1);
  }
  function events(kern) {
    const ms = parse(kern), out = [], open = {};
    let off = 0;
    ms.forEach(m => {
      m.rows.filter(r => r.f).forEach(r => r.f.forEach((tok, sp) => {
        if (!tok || tok === '.' || /^[*!=]/.test(tok)) return;
        tok.split(' ').forEach(sub => {
          if (/r/.test(sub) || /q/.test(sub)) return;
          const midi = kernMidi(sub), d = dur(sub); if (midi == null || !d) return;
          const key = sp + ':' + midi;
          if (/[\]_]/.test(sub) && open[key]) { open[key].d += d; if (/\]/.test(sub)) delete open[key]; return; }
          const e = { t: off + r.t, d, midi, hand: sp === 0 ? 'L' : 'R', bar: m.n }; out.push(e);
          if (/\[/.test(sub)) open[key] = e;
        });
      }));
      off += m.len || 4;
    });
    const starts = {}; let o2 = 0; ms.forEach(m => { starts[m.n] = o2; o2 += m.len || 4; });
    return { events: out, barStart: starts, lens: Object.fromEntries(ms.map(m => [m.n, m.len || 4])) };
  }
  return { parse, build, syllables, events };
})();
if (typeof module !== 'undefined') module.exports = FullScore;
