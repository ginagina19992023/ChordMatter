// 乐理引擎：音名拼写、和弦解析、调性分析、级数与功能
const T = (() => {
  const L = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const LPC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const mod = (n, m) => ((n % m) + m) % m;
  const accStr = a => (a > 0 ? '#'.repeat(a) : 'b'.repeat(-a));

  function parseNote(s) {
    const m = /^([A-G])(##|#|bb|b)?$/.exec(s);
    if (!m) return null;
    const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length;
    return { letter: m[1], li: L.indexOf(m[1]), acc, pc: mod(LPC[m[1]] + acc, 12), name: s };
  }
  // 按字母位置 + 目标音高类拼写（保证 F# 小三和弦写作 F# A C#）
  function noteAt(li, pc) {
    const i = mod(li, 7), letter = L[i];
    const acc = mod(pc - LPC[letter] + 6, 12) - 6;
    return { letter, li: i, acc, pc: mod(pc, 12), name: letter + accStr(acc) };
  }

  const Q = {
    '':     { zh: '大三和弦', en: 'major', ints: [[0, 0], [2, 4], [4, 7]], fam: 'M', f: '大三度 + 小三度' },
    'm':    { zh: '小三和弦', en: 'minor', ints: [[0, 0], [2, 3], [4, 7]], fam: 'm', f: '小三度 + 大三度' },
    'dim':  { zh: '减三和弦', en: 'diminished', ints: [[0, 0], [2, 3], [4, 6]], fam: 'd', f: '小三度 + 小三度' },
    'aug':  { zh: '增三和弦', en: 'augmented', ints: [[0, 0], [2, 4], [4, 8]], fam: 'A', f: '大三度 + 大三度' },
    'sus2': { zh: '挂二和弦', en: 'sus2', ints: [[0, 0], [1, 2], [4, 7]], fam: 'M', f: '大二度 + 纯四度' },
    'sus4': { zh: '挂四和弦', en: 'sus4', ints: [[0, 0], [3, 5], [4, 7]], fam: 'M', f: '纯四度 + 大二度' },
    '7':    { zh: '属七和弦', en: 'dominant 7th', ints: [[0, 0], [2, 4], [4, 7], [6, 10]], fam: 'M', f: '大三和弦 + 小七度' },
    'maj7': { zh: '大七和弦', en: 'major 7th', ints: [[0, 0], [2, 4], [4, 7], [6, 11]], fam: 'M', f: '大三和弦 + 大七度' },
    'm7':   { zh: '小七和弦', en: 'minor 7th', ints: [[0, 0], [2, 3], [4, 7], [6, 10]], fam: 'm', f: '小三和弦 + 小七度' },
    'm7b5': { zh: '半减七和弦', en: 'half-diminished', ints: [[0, 0], [2, 3], [4, 6], [6, 10]], fam: 'd', f: '减三和弦 + 小七度' },
    'dim7': { zh: '减七和弦', en: 'diminished 7th', ints: [[0, 0], [2, 3], [4, 6], [6, 9]], fam: 'd', f: '减三和弦 + 减七度' },
  };
  const ALIAS = { M: '', maj: '', min: 'm', '-': 'm', '°': 'dim', o: 'dim', '+': 'aug', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7-5': 'm7b5', '°7': 'dim7', o7: 'dim7', sus: 'sus4', '-7': 'm7', min7: 'm7' };

  function parseChord(sym) {
    const s = String(sym).trim().replace(/♯/g, '#').replace(/♭/g, 'b');
    const m = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/.exec(s);
    if (!m) return null;
    let q = m[2];
    if (ALIAS[q] !== undefined) q = ALIAS[q];
    if (!(q in Q)) return null;
    const root = parseNote(m[1]);
    const bass = m[3] ? parseNote(m[3]) : null;
    const notes = Q[q].ints.map(([st, se]) => noteAt(root.li + st, root.pc + se));
    let inv = 0;
    if (bass) inv = notes.findIndex(n => n.pc === bass.pc);
    return { sym: s, root, q, quality: Q[q], notes, bass, inv, seventh: notes.length === 4 };
  }
  function build(rootName, q, inv = 0) {
    const c = parseChord(rootName + q);
    if (inv > 0) return parseChord(rootName + q + '/' + c.notes[inv].name);
    return c;
  }

  // 返回带 midi 的音（转位/低音已处理），保证在键盘合理范围
  function voicing(c, base = 60) {
    let out = c.quality.ints.map(([, se], i) => ({ midi: base + c.root.pc + se, name: c.notes[i].name, deg: i }));
    if (c.bass && c.inv > 0) {
      for (let k = 0; k < c.inv; k++) out[k].midi += 12;
      out.sort((a, b) => a.midi - b.midi);
    } else if (c.bass && c.inv === -1) {
      let b = out[0].midi - mod(out[0].midi - c.bass.pc, 12);
      if (b === out[0].midi) b -= 12;
      out.unshift({ midi: b, name: c.bass.name, deg: -1 });
    }
    // 不再整体挪八度：原位的根音固定在 base 这个八度，转位只把下面的音搬上去，其他音原地不动
    return out;
  }

  // 柱式和弦通用指法
  function blockFingers(c, hand) {
    const n = c.notes.length, inv = Math.max(0, c.inv);
    if (n === 3) {
      const RH = [[1, 3, 5], [1, 2, 5], [1, 3, 5]], LH = [[5, 3, 1], [5, 3, 1], [5, 2, 1]];
      return hand === 'R' ? RH[inv] : LH[inv];
    }
    return hand === 'R' ? [1, 2, 3, 5] : [5, 3, 2, 1];
  }

  // 两个八度原位琶音（白键根音）
  function arpeggio(c, hand) {
    const base = hand === 'R' ? 60 : 48;
    const tri = c.quality.ints.slice(0, 3);
    const up = [];
    for (let o = 0; o < 2; o++) tri.forEach(([, se], i) => up.push({ midi: base + c.root.pc + se + o * 12, name: c.notes[i].name }));
    up.push({ midi: base + c.root.pc + 24, name: c.notes[0].name });
    const white = c.root.acc === 0 && c.root.letter !== 'B';
    let fingers = null;
    if (white) fingers = hand === 'R' ? [1, 2, 3, 1, 2, 3, 5] : [5, 4, 2, 1, 4, 2, 1];
    return { up, fingers, white };
  }

  // ---------- 调性 ----------
  const MAJ = [0, 2, 4, 5, 7, 9, 11], NMIN = [0, 2, 3, 5, 7, 8, 10], HMIN = [0, 2, 3, 5, 7, 8, 11];
  function parseKey(k) {
    const s = String(k).trim();
    const minor = /m$/.test(s);
    const tonic = parseNote(minor ? s.slice(0, -1) : s);
    if (!tonic) return null;
    return { name: s, tonic, minor, zh: disp(tonic.name) + (minor ? '小调' : '大调') };
  }
  function scale(key, harmonic = false) {
    const steps = key.minor ? (harmonic ? HMIN : NMIN) : MAJ;
    return steps.map((se, i) => noteAt(key.tonic.li + i, key.tonic.pc + se));
  }
  const TRI_MAJ = ['', 'm', 'm', '', '', 'm', 'dim'], SEV_MAJ = ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5'];
  const TRI_MIN = ['m', 'dim', '', 'm', '', '', 'dim'], SEV_MIN = ['m7', 'm7b5', 'maj7', 'm7', '7', 'maj7', 'dim7'];
  function degreeChord(key, d, seventh = false) {
    const sc = scale(key, true); // 小调用和声小调的 V 与 vii°
    const q = key.minor ? (seventh ? SEV_MIN : TRI_MIN)[d] : (seventh ? SEV_MAJ : TRI_MAJ)[d];
    return sc[d].name + q;
  }

  const ROM = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  const FUNC_MAJ = ['T', 'S', 'T', 'S', 'D', 'T', 'D'], FUNC_MIN = ['T', 'S', 'T', 'S', 'D', 'T', 'D'];
  const FIG3 = ['', '⁶', '⁶₄'], FIG7 = ['⁷', '⁶₅', '⁴₃', '⁴₂'];

  function romanFor(c, dl, diff, key) {
    let pre = diff < 0 ? '♭'.repeat(-diff) : diff > 0 ? '♯'.repeat(diff) : '';
    if (key.minor && dl === 6 && diff === 1) pre = '';
    let r = ROM[dl];
    const fam = c.quality.fam;
    if (fam === 'm' || fam === 'd') r = r.toLowerCase();
    let suf = { dim: '°', aug: '+', m7b5: 'ø', dim7: '°', maj7: 'Δ', sus2: 'sus2', sus4: 'sus4' }[c.q] || '';
    let fig = '';
    if (c.seventh) fig = FIG7[Math.max(0, c.inv)];
    else if (!c.q.startsWith('sus')) fig = FIG3[Math.max(0, c.inv)];
    let s = pre + r + suf + fig;
    if (c.inv === -1 && c.bass) s += '/' + disp(c.bass.name);
    return s;
  }

  function isDiatonic(c, dl, diff, key) {
    const fam = c.quality.fam;
    if (!key.minor) {
      if (diff !== 0) return false;
      if (c.seventh) return SEV_MAJ[dl] === c.q;
      if (c.q.startsWith('sus')) return dl !== 6;
      return ({ '': 'M', m: 'm', dim: 'd' })[TRI_MAJ[dl]] === fam && c.q !== 'aug';
    }
    if (dl === 6) return (diff === 0 && fam === 'M' && c.q !== 'aug') || (diff === 1 && fam === 'd');
    if (diff !== 0 || c.q === 'aug') return false;
    if (dl === 4) return fam === 'M' || fam === 'm';
    const exp = ['m', 'd', 'M', 'm', null, 'M'][dl];
    if (c.seventh) return SEV_MIN[dl] === c.q || (dl === 0 && c.q === 'm7');
    return exp === fam || (c.q.startsWith('sus') && exp !== 'd');
  }

  function analyze(sym, keyName) {
    const key = typeof keyName === 'string' ? parseKey(keyName) : keyName;
    const c = parseChord(sym);
    if (!c || !key) return null;
    const dl = mod(c.root.li - key.tonic.li, 7);
    const iv = mod(c.root.pc - key.tonic.pc, 12);
    const ref = key.minor ? NMIN : MAJ;
    const diff = mod(iv - ref[dl] + 6, 12) - 6;
    const numeral = romanFor(c, dl, diff, key);
    const res = { c, dl, diff, numeral, func: '', kind: 'chr', note: '' };
    if (isDiatonic(c, dl, diff, key)) {
      res.kind = 'dia';
      res.func = (key.minor ? FUNC_MIN : FUNC_MAJ)[dl];
      if (key.minor && dl === 4 && c.quality.fam === 'M') res.note = '和声小调：升高第七级得到导音';
      return res;
    }
    // 副属和弦：大三/属七，且向下五度解决到一个调内和弦
    if ((c.q === '' || c.q === '7') && !(dl === 4 && diff === 0)) {
      const tdl = mod(dl + 3, 7), tiv = mod(iv + 5, 12);
      const sc = key.minor ? NMIN : MAJ;
      if (sc[tdl] === tiv && tdl !== 0) {
        const tc = parseChord(degreeChord(key, tdl));
        let tr = ROM[tdl];
        if (tc.quality.fam !== 'M') tr = tr.toLowerCase();
        if (tc.quality.fam === 'd') return res; // V/vii° 不常用，按半音化处理
        res.kind = 'sec';
        res.func = 'D';
        res.numeral = 'V' + (c.seventh ? FIG7[Math.max(0, c.inv)] : FIG3[Math.max(0, c.inv)]) + '/' + tr;
        res.note = '副属和弦：' + tr + ' 级的属和弦';
        return res;
      }
    }
    if (!key.minor) {
      const fam = c.quality.fam;
      const bor = (dl === 3 && diff === 0 && fam === 'm') || (dl === 5 && diff === -1 && fam === 'M') || (dl === 6 && diff === -1 && fam === 'M') || (dl === 2 && diff === -1 && fam === 'M') || (dl === 1 && diff === 0 && fam === 'd');
      if (bor) {
        res.kind = 'bor';
        res.func = dl === 2 ? 'T' : 'S';
        res.note = '借用和弦：来自同主音小调（' + disp(key.tonic.name) + '小调）';
        return res;
      }
    }
    res.note = '半音化和弦';
    return res;
  }

  function cadence(a, b) {
    if (!a || !b) return null;
    const isI = x => x.dl === 0 && x.diff === 0 && x.kind === 'dia';
    const isV = x => x.dl === 4 && x.diff === 0 && x.kind === 'dia';
    const isIV = x => x.dl === 3 && x.diff === 0 && (x.kind === 'dia' || x.kind === 'bor');
    if (isV(a) && isI(b)) return '正格终止 V→I';
    if (isIV(a) && isI(b)) return '变格终止 IV→I';
    if (isV(a) && b.dl === 5 && b.kind === 'dia') return '阻碍终止 V→vi';
    if (isV(b)) return '半终止 →V';
    return null;
  }

  const TEMPLATES = [
    { name: '卡农进行', seq: [0, 4, 5, 2, 3, 0, 3, 4], nums: 'I–V–vi–iii–IV–I–IV–V' },
    { name: '1564 进行', seq: [0, 4, 5, 3], nums: 'I–V–vi–IV' },
    { name: '6415 进行', seq: [5, 3, 0, 4], nums: 'vi–IV–I–V' },
    { name: '1645 进行（50年代）', seq: [0, 5, 3, 4], nums: 'I–vi–IV–V' },
    { name: '4536 进行（王道）', seq: [3, 4, 2, 5], nums: 'IV–V–iii–vi' },
    { name: '2–5–1', seq: [1, 4, 0], nums: 'ii–V–I' },
  ];
  function findTemplates(analyses) {
    const seq = analyses.map(a => (a && a.kind === 'dia' ? a.dl : -1));
    const found = [];
    for (const t of TEMPLATES) {
      for (let i = 0; i + t.seq.length <= seq.length; i++) {
        if (t.seq.every((d, j) => seq[i + j] === d)) { found.push(t); break; }
      }
    }
    return found.filter((t, i, arr) => !(t.name === '1564 进行' && arr.some(x => x.name === '卡农进行')));
  }

  const INTERVALS = {
    1: ['小二度', 1], 2: ['大二度', 1], 3: ['小三度', 2], 4: ['大三度', 2], 5: ['纯四度', 3], 6: ['三全音', 3],
    7: ['纯五度', 4], 8: ['小六度', 5], 9: ['大六度', 5], 10: ['小七度', 6], 11: ['大七度', 6], 12: ['纯八度', 7],
  };

  function disp(s) { return String(s).replace(/#/g, '♯').replace(/b/g, '♭'); }

  return { L, LPC, mod, parseNote, noteAt, parseChord, build, voicing, blockFingers, arpeggio, parseKey, scale, degreeChord, analyze, cadence, TEMPLATES, findTemplates, INTERVALS, Q, ROM, disp };
})();
if (typeof module !== 'undefined') module.exports = T;
