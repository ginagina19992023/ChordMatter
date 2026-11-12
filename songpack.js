// 导入完整谱：
//   ① ChordMatter 曲目包（.json）：{ chordmatter: 'song', song: {...}, kern?: '…', pages?: [dataURL…] }
//   ② MIDI 文件（.mid）：自动转成两只手的谱（右手 / 左手），按音判断每小节的和弦、调和分段
// 全部只存在这台手机上（不进公开网站）
const SongPack = (() => {
  // ---------- MIDI 读取 ----------
  function readMidi(buf) {
    const d = new DataView(buf); let p = 0;
    const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; }, u8 = () => d.getUint8(p++);
    const vlq = () => { let v = 0, b; do { b = u8(); v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
    const str = n => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(u8()); return s; };
    if (str(4) !== 'MThd') throw new Error('不是 MIDI 文件');
    const hl = u32(); u16(); const nt = u16(), div = u16(); p += hl - 6;
    if (div & 0x8000) throw new Error('不支持这种 MIDI 时间格式');
    const notes = [], meta = { tempo: null, ts: null, ks: null, name: '' };
    for (let tr = 0; tr < nt && p < d.byteLength; tr++) {
      if (str(4) !== 'MTrk') break;
      const len = u32(), end = p + len; let t = 0, run = 0; const open = {};
      while (p < end) {
        t += vlq(); let st = u8();
        if (st < 0x80) { p--; st = run; } else if (st < 0xf0) run = st;
        if (st === 0xff) { const ty = u8(), l = vlq(), s0 = p;
          if (ty === 0x51 && meta.tempo == null) meta.tempo = (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2);
          if (ty === 0x58 && !meta.ts) meta.ts = [d.getUint8(p), 1 << d.getUint8(p + 1)];
          if (ty === 0x59 && !meta.ks) meta.ks = [d.getInt8(p), d.getUint8(p + 1)];
          if (ty === 0x03 && !meta.name) { try { meta.name = new TextDecoder().decode(new Uint8Array(buf, p, l)).trim(); } catch (e) {} }
          p = s0 + l; continue; }
        if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
        const hi = st & 0xf0, ch = st & 0x0f;
        if (hi === 0x90 || hi === 0x80) { const k = u8(), v = u8(), id = ch + ':' + k;
          if (hi === 0x90 && v > 0) { (open[id] = open[id] || []).push(t); }
          else if (open[id] && open[id].length) { const on = open[id].shift(); if (t > on) notes.push({ on, off: t, pitch: k, tr, ch }); } }
        else if (hi === 0xc0 || hi === 0xd0) p += 1; else p += 2;
      }
      p = end;
    }
    return { notes, div, meta };
  }
  // ---------- 记谱 ----------
  const SH = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'], FL = ['c', 'd-', 'd', 'e-', 'e', 'f', 'g-', 'g', 'a-', 'a', 'b-', 'b'];
  function kp(m, flats) { const n = (flats ? FL : SH)[m % 12], oct = Math.floor(m / 12) - 1, L = n[0], acc = n.slice(1); return (oct >= 4 ? L.repeat(oct - 3) : L.toUpperCase().repeat(4 - oct)) + acc; }
  const DUR = [[16, '1'], [12, '2.'], [8, '2'], [6, '4.'], [4, '4'], [3, '8.'], [2, '8'], [1, '16']];
  const split = n => { const out = []; for (const [v, s] of DUR) while (n >= v) { out.push([v, s]); n -= v; } return out; };
  const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'], FKEYS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb'], MK = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'], FMK = ['Am', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm'];
  const SHARP_ORDER = ['f#', 'c#', 'g#', 'd#', 'a#', 'e#', 'b#'], FLAT_ORDER = ['b-', 'e-', 'a-', 'd-', 'g-', 'c-', 'f-'];
  // 没有调号时按音的分布猜调（Krumhansl 调性轮廓）
  const PMAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88], PMIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function guessKey(w) {
    let best = -1e9, k = [0, 0];
    for (let r = 0; r < 12; r++) for (const [mi, P] of [[0, PMAJ], [1, PMIN]]) { let s = 0; for (let i = 0; i < 12; i++) s += w[(r + i) % 12] * P[i]; if (s > best) { best = s; k = [r, mi]; } }
    const FIF = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 1: -5, 8: -4, 3: -3, 10: -2, 5: -1 }, sf = FIF[(k[0] + (k[1] ? 3 : 0)) % 12];
    return [sf, k[1]];
  }
  // 每半小节按音判断和弦（低音权重大、长音权重大）
  const Q = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], dim: [0, 3, 6], m7: [0, 3, 7, 10], maj7: [0, 4, 7, 11] };
  function chordOf(evs, names) {
    const w = Array(12).fill(0); let low = null;
    evs.forEach(e => { const pc = e.pitch % 12; w[pc] += e.dd * (e.hand === 'L' ? 1 : (e.d >= 4 ? 0.5 : 0.15)); if (e.hand === 'L' && (!low || e.pitch < low.pitch)) low = e; });
    if (!w.some(x => x > 0)) return null;
    const mx = Math.max(...w); let best = -1e9, bc = null;
    for (let r = 0; r < 12; r++) for (const q in Q) { const iv = Q[q]; let s = 0; for (let pc = 0; pc < 12; pc++) s += iv.includes((pc - r + 12) % 12) ? w[pc] : -0.6 * w[pc];
      if (!w[r]) s -= 1.5; if (low && low.pitch % 12 === r) s += 0.25 * mx; if (iv.length === 4 && w[(r + iv[3]) % 12] < 0.35 * mx) s -= 99; if (q.length > 1 && q !== 'm') s -= 0.15; if (s > best) { best = s; bc = [r, q]; } }
    let sym = names[bc[0]] + bc[1]; if (low && low.pitch % 12 !== bc[0] && Q[bc[1]].includes((low.pitch % 12 - bc[0] + 12) % 12)) sym += '/' + names[low.pitch % 12];
    return sym;
  }
  function fromMidi(buf, fileName) {
    const { notes, div, meta } = readMidi(buf);
    if (!notes.length) throw new Error('这个 MIDI 里没有音符');
    const q = div / 4, ts = meta.ts || [4, 4], barLen = Math.max(1, Math.round(ts[0] * 16 / ts[1]));
    // 分左右手：有两条以上的音轨，平均音高最高的那条是右手；只有一条就按中央 C 分
    const trs = [...new Set(notes.map(n => n.tr))], avg = tr => { const ns = notes.filter(n => n.tr === tr); return ns.reduce((s, n) => s + n.pitch, 0) / ns.length; };
    const rTr = trs.length >= 2 ? trs.reduce((a, b) => (avg(b) > avg(a) ? b : a)) : null;
    const ev = notes.map(n => { const t = Math.round(n.on / q), e = Math.max(t + 1, Math.round(n.off / q)); return { t, d: e - t, pitch: n.pitch, hand: rTr != null ? (n.tr === rTr ? 'R' : 'L') : (n.pitch >= 60 ? 'R' : 'L') }; });
    const total = Math.ceil(Math.max(...ev.map(e => e.t + e.d)) / barLen), w = Array(12).fill(0); ev.forEach(e => (w[e.pitch % 12] += e.d));
    const [sf, mi] = meta.ks || guessKey(w), flats = sf < 0, keyName = mi ? (flats ? FMK : MK)[Math.min(7, Math.abs(sf))] : (flats ? FKEYS : KEYS)[Math.min(7, Math.abs(sf))];
    const names = flats ? ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] : ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // 每只手：同一时刻起音的音合成一下，时值到下一下为止（不超过小节线，跨小节用连音线接上）
    const spine = hand => { const byT = new Map(); ev.filter(e => e.hand === hand).forEach(e => { if (!byT.has(e.t)) byT.set(e.t, []); byT.get(e.t).push(e); });
      const ts2 = [...byT.keys()].sort((a, b) => a - b), out = [];
      ts2.forEach((t, i) => { const nx = i + 1 < ts2.length ? ts2[i + 1] : total * barLen, ps = [...new Set(byT.get(t).map(e => e.pitch))].sort((a, b) => a - b), len = Math.min(nx - t, Math.max(...byT.get(t).map(e => e.d))); out.push({ t, len, ps }); if (len < nx - t) out.push({ t: t + len, len: nx - t - len, ps: null }); });
      if (!ts2.length || ts2[0] > 0) out.unshift({ t: 0, len: ts2.length ? ts2[0] : total * barLen, ps: null });
      const cells = []; // [bar][time] = token
      out.forEach(({ t, len, ps }) => { let at = t, left = len, first = true;
        while (left > 0) { const b = Math.floor(at / barLen), inBar = Math.min(left, (b + 1) * barLen - at), parts = split(inBar); let a2 = at;
          parts.forEach(([v, s], k) => { const last = left - v === 0 && k === parts.length - 1, tie = ps ? (first && last ? '' : first ? '[' : last ? ']' : '_') : '';
            const tok = ps ? ps.map(m => (tie === '[' ? '[' : '') + s + kp(m, flats) + (tie === ']' ? ']' : tie === '_' ? '_' : '')).join(' ') : s + 'r';
            (cells[b] = cells[b] || new Map()).set(a2 - b * barLen, tok); a2 += v; first = false; left -= v; });
          at = a2; } });
      return cells; };
    const L = spine('L'), R = spine('R');
    const kk = '*k[' + (sf >= 0 ? SHARP_ORDER.slice(0, sf) : FLAT_ORDER.slice(0, -sf)).join('') + ']', bpm = meta.tempo ? Math.round(60000000 / meta.tempo) : 90;
    const lines = ['**kern\t**kern', '*staff2\t*staff1', '*clefF4\t*clefG2', kk + '\t' + kk, `*M${ts[0]}/${ts[1]}\t*M${ts[0]}/${ts[1]}`, '!\t!q=' + bpm];
    for (let b = 0; b < total; b++) {
      const l = L[b] || new Map([[0, split(barLen).map(x => x[1] + 'r')[0]]]), r = R[b] || new Map([[0, split(barLen).map(x => x[1] + 'r')[0]]]);
      if (!L[b]) { let a = 0; split(barLen).forEach(([v, s]) => { l.set(a, s + 'r'); a += v; }); }
      if (!R[b]) { let a = 0; split(barLen).forEach(([v, s]) => { r.set(a, s + 'r'); a += v; }); }
      [...new Set([...l.keys(), ...r.keys()])].sort((x, y) => x - y).forEach(t => lines.push((l.get(t) || '.') + '\t' + (r.get(t) || '.')));
      lines.push(`=${b + 2}\t=${b + 2}`);
    }
    lines[lines.length - 1] = '==\t=='; lines.push('*-\t*-');
    // 小节号从 1 开始：第一个小节线写成 =2，前面补一个 =1
    lines.splice(6, 0, '=1\t=1');
    // 每半小节一个和弦
    const bars = [];
    for (let b = 0; b < total; b++) { const hs = [0, 1].map(h => { const a = b * barLen + h * barLen / 2, z = a + barLen / 2; return chordOf(ev.filter(e => e.t < z && e.t + e.d > a).map(e => Object.assign({ dd: Math.min(e.t + e.d, z) - Math.max(e.t, a) }, e)), names); });
      const a = hs[0] || hs[1] || (bars[b - 1] || ['C'])[0], c = hs[1] || a; bars.push(a === c ? [a] : [a, c]); }
    const sections = []; for (let s = 0; s < total; s += 8) { const e = Math.min(total, s + 8); sections.push({ name: `${s + 1}–${e} 小节`, bars: bars.slice(s, e).map(x => x.join(' ')).join(' | ') }); }
    const title = (meta.name && !/^(track|piano|untitled)/i.test(meta.name) ? meta.name : String(fileName || '导入的曲子').replace(/\.[^.]+$/, '')).slice(0, 40);
    return { song: { title, sub: `导入的完整谱（MIDI · ${total} 小节）`, key: keyName, bpm, tag: '我的', sections, note: `从 MIDI 自动转成的谱：右手 / 左手按${rTr != null ? '音轨' : '中央 C'}分，节奏按十六分音符对齐；每小节的和弦是按音判断的（每半小节一个），不是谱上印的。${meta.ks ? '' : '调是按音的分布猜的。'}可以在「编辑」里改。` }, kern: lines.join('\n') };
  }
  async function read(file) {
    const name = file.name || '';
    if (/\.midi?$/i.test(name) || file.type === 'audio/midi' || file.type === 'audio/x-midi') return fromMidi(await file.arrayBuffer(), name);
    const o = JSON.parse(await file.text());
    if (!o || o.chordmatter !== 'song' || !o.song) throw new Error('不是 ChordMatter 曲目包');
    return o;
  }
  return { read, fromMidi };
})();
if (typeof module !== 'undefined') module.exports = SongPack;
