// 视奏：看到没见过的音符就能弹。一关只加一个新东西：先认路标音，再往旁边数一格。
// 每关 12 个音（和弦 / 双手是 6 组），正确率 ≥ 90%、速度够了才过关、解锁下一关。
const Sight = (() => {
  const NAT = { 0: 'c', 2: 'd', 4: 'e', 5: 'f', 7: 'g', 9: 'a', 11: 'b' };
  // 各调用到的音名（只有 C、G、F 三个调）
  const SPELL = { C: NAT, G: Object.assign({}, NAT, { 6: 'f#' }), F: Object.assign({}, NAT, { 10: 'bb' }) };
  const inKey = (m, key) => SPELL[key][m % 12] !== undefined && (key !== 'G' || m % 12 !== 5) && (key !== 'F' || m % 12 !== 11);
  const range = (lo, hi, key = 'C') => { const o = []; for (let m = lo; m <= hi; m++) if (inKey(m, key)) o.push(m); return o; };
  const vex = (m, key = 'C') => SPELL[key][m % 12] + '/' + (Math.floor(m / 12) - 1);
  const ANY = { 1: 'c#', 3: 'eb', 6: 'f#', 8: 'g#', 10: 'bb' };
  const name = (m, key = 'C') => { const s = SPELL[key][m % 12] || ANY[m % 12]; return s[0].toUpperCase() + (s[1] === '#' ? '♯' : s[1] === 'b' ? '♭' : ''); };
  const nameOct = (m, key = 'C') => name(m, key) + (Math.floor(m / 12) - 1);

  // 路标音（marks）：每关开头先认这几个，其他音从路标往旁边数
  const LEVELS = [
    { id: 't1', n: 1, name: '高音谱表 · 中央 C、D、E', clef: 'treble', pool: range(60, 64), marks: [60], spm: 16,
      tip: '中央 C 在高音谱表下面的「加一线」上。D 挂在第一线下面（下加一间），E 就在第一线上。' },
    { id: 't2', n: 2, name: '高音谱表 · C 到 G（五个手指）', clef: 'treble', pool: range(60, 67), marks: [60, 67], spm: 18,
      tip: '从中央 C 往上：线、间、线、间……一格一个音。G 在第二线——高音谱号的圈就绕在这条线上。' },
    { id: 't3', n: 3, name: '高音谱表 · 中央 C 到高音 C', clef: 'treble', pool: range(60, 72), marks: [60, 67, 72], spm: 20,
      tip: '第三间是高音 C（比中央 C 高八度）。认住 G（第二线）和高音 C（第三间），其他的往旁边数一格。' },
    { id: 'b1', n: 4, name: '低音谱表 · 中央 C 往下', clef: 'bass', pool: range(53, 60), marks: [60, 53], spm: 18,
      tip: '低音谱表里，中央 C 在上面的「加一线」。往下是 B、A、G、F。F 在第四线——低音谱号的两个点夹着这条线。' },
    { id: 'b2', n: 5, name: '低音谱表 · 低音 C 到中央 C', clef: 'bass', pool: range(48, 60), marks: [48, 53, 60], spm: 20,
      tip: '第二间是低音 C（比中央 C 低八度）。路标：低音 C（第二间）、F（第四线）、中央 C（上加一线）。' },
    { id: 'g1', n: 6, name: '大谱表 · 两个谱表来回跳', clef: 'grand', pool: range(48, 72), marks: [48, 53, 60, 67, 72], spm: 20,
      tip: '先看音在哪个谱表，再找最近的路标。两个谱表中间夹着的都是中央 C：在高音谱表下加一线、或低音谱表上加一线。' },
    { id: 't4', n: 7, name: '高音谱表 · 所有线和间', clef: 'treble', pool: range(62, 77), marks: [64, 67, 71, 74, 77], spm: 22,
      tip: '线上从下到上：E G B D F；间里从下到上：F A C E。认不出时先找第二线的 G。' },
    { id: 'b3', n: 8, name: '低音谱表 · 所有线和间', clef: 'bass', pool: range(41, 57), marks: [43, 47, 50, 53, 57], spm: 22,
      tip: '线上从下到上：G B D F A；间里从下到上：A C E G。认不出时先找第四线的 F。' },
    { id: 'l1', n: 9, name: '加线音 · 谱表外面的音', clef: 'grand', marks: [57, 64, 81, 40], spm: 18,
      pool: [57, 59, 60].map(m => ({ m, st: 't' })).concat([60, 62, 64].map(m => ({ m, st: 'b' })), [81, 83, 84].map(m => ({ m, st: 't' })), [40, 41, 43].map(m => ({ m, st: 'b' }))),
      tip: '加线就是把五线谱往外接几条短线，照样「线、间、线、间」往外数。高音谱表下加两线是 A，低音谱表上加两线是 E。' },
    { id: 'k1', n: 10, name: '调号 · G 大调的 F♯、F 大调的 B♭', clef: 'treble', keys: ['G', 'F'], lo: 60, hi: 74, marks: [66, 70], spm: 20,
      tip: '谱号旁边的调号管整首：一个 ♯ 写在 F 线上 = 所有 F 都弹 F♯（G 大调）；一个 ♭ 写在 B 线上 = 所有 B 都弹 B♭（F 大调）。音符旁边不会再写。' },
    { id: 'm1', n: 11, name: '短旋律 · 一口气读 4 个音', clef: 'treble', kind: 'mel', pool: range(60, 72), marks: [60, 67, 72], spm: 26,
      tip: '只认第一个音，后面的看「往上 / 往下走几格」：线到相邻的间 = 隔壁的音（二度），线到上面一条线 = 隔一个音（三度）。' },
    { id: 'm2', n: 12, name: '短旋律 · 低音谱表', clef: 'bass', kind: 'mel', pool: range(48, 60), marks: [48, 53, 60], spm: 24,
      tip: '左手也一样：认准第一个音，后面看形状。眼睛提前看下一个，手还在弹这一个。' },
    { id: 'c1', n: 13, name: '三和弦 · 叠起来的三个音', clef: 'treble', kind: 'chord', pool: range(60, 69), marks: [60, 64, 67], spm: 10,
      tip: '三个音都在线上（或都在间里）、像糖葫芦一样叠着 = 原位三和弦。只认最下面那个，往上「隔一个、再隔一个」。' },
    { id: 'h1', n: 14, name: '双手 · 上下各一个音一起弹', clef: 'grand', kind: 'two', pool: range(48, 72), marks: [53, 60, 67], spm: 10,
      tip: '先读下面（左手），再读上面（右手），两只手一起按下去。' },
  ];
  const ROUND = 12;
  const pick = a => a[Math.floor(Math.random() * a.length)];

  // 一个音放在哪个谱表：大谱表里中央 C 以下放低音谱表（中央 C 随机放一边）
  function staffOf(lv, it) {
    if (it.st) return it.st;
    if (lv.clef === 'treble') return 't';
    if (lv.clef === 'bass') return 'b';
    return it.m > 60 ? 't' : it.m < 60 ? 'b' : Math.random() < 0.5 ? 't' : 'b';
  }
  // 一轮的题：groups = [[item, item, …]]，一组画在一行谱上；item = { ms: [midi…], key, ev: {t:[], b:[]}, label }
  function round(lv) {
    const items = [], kind = lv.kind || 'note';
    const mk = (ms, key, sts) => {
      const ev = { t: [], b: [] };
      ms.forEach((m, i) => ev[sts ? sts[i] : staffOf(lv, { m })].push(vex(m, key)));
      return { ms, key, ev, label: ms.map(m => nameOct(m, key)).join(' + ') };
    };
    if (kind === 'note') {
      let last = null;
      for (let g = 0; g < ROUND / 4; g++) {
        const key = lv.keys ? pick(lv.keys) : 'C';
        const pool = lv.keys ? range(lv.lo, lv.hi, key) : lv.pool;
        for (let i = 0; i < 4; i++) {
          let it; do { it = pick(pool); } while (pool.length > 2 && (typeof it === 'object' ? it.m : it) === last);
          const o = typeof it === 'object' ? it : { m: it };
          last = o.m; items.push(Object.assign(mk([o.m], key, [staffOf(lv, o)]), { g }));
        }
      }
    } else if (kind === 'mel') {
      const P = lv.pool;
      for (let g = 0; g < ROUND / 4; g++) {
        let k = Math.floor(Math.random() * P.length);
        for (let i = 0; i < 4; i++) {
          if (i) { const step = pick([-2, -1, -1, 1, 1, 2, -3, 3, -1, 1]); k = Math.max(0, Math.min(P.length - 1, k + step)); }
          items.push(Object.assign(mk([P[k]], 'C'), { g }));
        }
      }
    } else if (kind === 'chord') {
      const all = range(60, 81);
      for (let g = 0; g < ROUND / 4; g++) for (let i = 0; i < 2; i++) {
        const r = pick(lv.pool), k = all.indexOf(r);
        items.push(Object.assign(mk([all[k], all[k + 2], all[k + 4]], 'C'), { g }));
      }
    } else if (kind === 'two') {
      for (let g = 0; g < ROUND / 4; g++) for (let i = 0; i < 2; i++) {
        const lo = pick(range(48, 59)), hi = pick(range(60, 72));
        items.push(Object.assign(mk([lo, hi], 'C', ['b', 't']), { g }));
      }
    }
    return items;
  }
  // 一关键盘要露出的范围（按白键对齐）
  function span(lv) {
    const ms = lv.keys ? [lv.lo, lv.hi] : (lv.kind === 'chord' ? [60, 81] : lv.pool.map(x => (typeof x === 'object' ? x.m : x)));
    return [Math.min(...ms), Math.max(...ms)];
  }
  // ================= 5 级视奏：每次生成一首新的 8 小节双手小曲 =================
  // 音用「字母序号」L 表示：C4 = 28（八度 × 7 + 字母），升降由调号决定，alt 是额外的临时升降
  const NATS = [0, 2, 4, 5, 7, 9, 11], LET = 'cdefgab', UP = 'CDEFGAB';
  function keyInfo(key) {
    const k = T.parseKey(key), sc = T.scale(k), acc = {};
    sc.forEach(n => { acc[UP.indexOf(n.name[0])] = (n.name.slice(1).match(/#/g) || []).length - (n.name.slice(1).match(/b/g) || []).length; });
    return { key, k, tl: UP.indexOf(k.tonic.name[0]), acc, minor: k.minor };
  }
  const accStr = (a, sh, fl) => (a > 0 ? sh.repeat(a) : a < 0 ? fl.repeat(-a) : '');
  function noteL(L, ki, alt = 0) {
    const li = ((L % 7) + 7) % 7, oct = Math.floor(L / 7), a = (ki.acc[li] || 0) + alt;
    return { L, alt, midi: 12 * (oct + 1) + NATS[li] + a, vex: LET[li] + accStr(a, '#', 'b') + '/' + oct, name: UP[li] + accStr(a, '♯', '♭'), oct };
  }
  const degOf = (L, ki) => (((L - ki.tl) % 7) + 7) % 7;
  const GRADE = {
    4: { keys: ['C', 'G', 'F', 'D', 'Am', 'Em', 'Dm'], times: ['2/4', '3/4', '4/4'], hi: 38, chrom: 0 },
    5: { keys: ['G', 'D', 'A', 'F', 'Bb', 'Eb', 'Em', 'Bm', 'Dm', 'Gm', 'Am', 'Cm'], times: ['3/4', '4/4', '6/8', '2/4'], hi: 40, chrom: 1 },
    6: { keys: ['A', 'E', 'Eb', 'Ab', 'Bb', 'D', 'F#m', 'C#m', 'Fm', 'Cm', 'Bm', 'Gm'], times: ['3/4', '4/4', '6/8', '2/4'], hi: 42, chrom: 2 },
  };
  const BARQ = { '2/4': 2, '3/4': 3, '4/4': 4, '6/8': 3 };
  const STRONG = { '2/4': [0], '3/4': [0], '4/4': [0, 2], '6/8': [0, 1.5] };
  // 节奏型（单位：四分音符；负数 = 休止）。g 是从几级开始出现
  const RH = {
    '4/4': [[4, [1, 1, 1, 1]], [4, [2, 1, 1]], [4, [1, 1, 2]], [4, [2, 2]], [4, [1.5, .5, 1, 1]], [4, [.5, .5, 1, 1, 1]], [4, [1, .5, .5, 2]], [4, [3, 1]],
      [5, [1.5, .5, 1.5, .5]], [5, [.5, .5, .5, .5, 1, 1]], [5, [1, .5, .5, .5, .5, 1]], [5, [1, .5, 1, .5, 1]], [5, [-1, 1, 1, 1]], [5, [.5, 1, .5, 2]],
      [6, [.75, .25, 1, 1, 1]], [6, [.25, .25, .5, 1, 2]], [6, [1, .75, .25, 2]], [6, [-.5, .5, .5, .5, 1, 1]]],
    '3/4': [[4, [1, 1, 1]], [4, [2, 1]], [4, [1, 2]], [4, [1.5, .5, 1]], [4, [.5, .5, 1, 1]], [4, [1, .5, .5, 1]],
      [5, [.5, .5, .5, .5, 1]], [5, [1.5, .5, .5, .5]], [5, [-1, 1, 1]], [5, [.5, 1, .5, 1]],
      [6, [.75, .25, 1, 1]], [6, [.25, .25, .5, 1, 1]], [6, [1, .75, .25, 1]]],
    '2/4': [[4, [1, 1]], [4, [.5, .5, 1]], [4, [1.5, .5]], [4, [1, .5, .5]],
      [5, [.5, .5, .5, .5]], [5, [-.5, .5, 1]], [5, [.5, 1, .5]],
      [6, [.25, .25, .5, 1]], [6, [.75, .25, 1]], [6, [.75, .25, .5, .5]]],
    '6/8': [[5, [1.5, 1.5]], [5, [1, .5, 1, .5]], [5, [1, .5, 1.5]], [5, [.5, .5, .5, 1.5]], [5, [1.5, .5, .5, .5]], [5, [-.5, .5, .5, 1, .5]],
      [6, [.75, .25, .5, 1.5]], [6, [.5, .5, .5, .5, .5, .5]], [6, [1, .5, .5, .5, .5]]],
  };
  const PROG = [[0, 3, 4, 0, 5, 1, 4, 0], [0, 5, 3, 4, 0, 3, 4, 0], [0, 4, 0, 4, 3, 0, 4, 0], [0, 3, 0, 4, 5, 3, 4, 0], [0, 5, 1, 4, 0, 3, 4, 0]];
  const LHT = {
    '4/4': { 4: ['bass', 'block'], 5: ['block', 'alberti'], 6: ['alberti'] },
    '3/4': { 4: ['bass', 'waltz'], 5: ['waltz'], 6: ['waltz', 'broken'] },
    '2/4': { 4: ['bass', 'block'], 5: ['alberti', 'block'], 6: ['alberti'] },
    '6/8': { 4: ['bass'], 5: ['bass', 'broken'], 6: ['broken'] },
  };
  const LHNAME = { bass: '单音低音', block: '柱式（两个音一起）', alberti: '阿尔贝蒂（低-高-中-高）', waltz: '华尔兹（低音 + 和弦）', broken: '分解和弦' };
  const TEMPO = { '4/4': [['Andante', 76], ['Moderato', 92], ['Allegretto', 104]], '2/4': [['Andante', 76], ['Moderato', 96], ['Allegretto', 108]], '3/4': [['Andantino', 84], ['Moderato', 100], ['Grazioso', 92]], '6/8': [['Andante', 50], ['Allegretto', 60]] };
  function piece(grade = 5) {
    const G = GRADE[grade] || GRADE[5];
    const ki = keyInfo(pick(G.keys)), time = pick(G.times), BQ = BARQ[time], prog = pick(PROG), lht = pick(LHT[time][grade] || LHT[time][5] || ['bass']);
    const altFor = (L, cd) => (ki.minor && (cd === 4 || cd === 6) && degOf(L, ki) === 6 ? 1 : 0);
    const ct = cd => [cd, (cd + 2) % 7, (cd + 4) % 7];
    const pool = RH[time].filter(([g]) => g <= grade).map(x => x[1]);
    const lo = grade >= 6 ? 27 : 28, hi = G.hi;
    const tonicNear = (x, set) => { let best = null; for (let L = lo; L <= hi; L++) if (set.includes(degOf(L, ki)) && (best === null || Math.abs(L - x) < Math.abs(best - x) || (Math.abs(L - x) === Math.abs(best - x) && Math.random() < 0.5))) best = L; return best; };
    let prev = tonicNear(28 + ki.tl + 2 + Math.floor(Math.random() * 3), ct(0)), rep = 0;
    const bars = [];
    for (let b = 0; b < 8; b++) {
      const cd = prog[b], tones = ct(cd), t0 = b * BQ;
      let pat;
      if (b === 7) pat = [BQ];
      else {
        let cand = pool.filter(p => (b === 0 ? p[0] > 0 : true) && (b === 3 ? p[p.length - 1] >= 1 : true));
        if (grade < 5 || b === 0 || b === 4) cand = cand.filter(p => p.every(d => d > 0));
        pat = pick(cand.length ? cand : pool);
      }
      const rh = []; let pos = 0;
      pat.forEach((d, i) => {
        if (d < 0) { rh.push({ t: t0 + pos, d: -d, rest: true }); pos += -d; return; }
        const strong = STRONG[time].includes(pos), last = i === pat.length - 1;
        let L;
        if (b === 7) L = tonicNear(prev, [0]);
        else if (b === 3 && last) L = tonicNear(prev, ct(4));
        else if (strong || d >= 1) {
          const opts = []; for (let x = Math.max(lo, prev - 4); x <= Math.min(hi, prev + 4); x++) if (tones.includes(degOf(x, ki)) && (x !== prev || (rep < 1 && Math.random() < 0.2))) opts.push(x);
          L = opts.length ? opts.sort((a, c) => Math.abs(a - prev) - Math.abs(c - prev) + (Math.random() - 0.5) * 3)[0] : tonicNear(prev, tones);
        } else {
          L = prev + pick([1, -1, 1, -1, 2, -2, 1]);
          if (L < lo) L = lo + 1; if (L > hi) L = hi - 1;
          if (ki.minor && (cd === 4 || cd === 6) && degOf(L, ki) === 5) L += (L > prev ? 1 : -1); // 小调 V 和弦里不用 ♭6（避免增二度）
        }
        rep = L === prev ? rep + 1 : 0; prev = L;
        rh.push({ t: t0 + pos, d, notes: [noteL(L, ki, altFor(L, cd))] });
        pos += d;
      });
      // 左手
      const [rlo, rhi] = lht === 'waltz' || lht === 'broken' ? [14, 19] : [17, 23];
      const rl = (() => { let L = 14 + ((ki.tl + cd) % 7); while (L < rlo) L += 7; while (L > rhi) L -= 7; return L; })();
      const N = (...Ls) => Ls.map(L => noteL(L, ki, altFor(L, cd)));
      const lh = [];
      const put = (d, Ls, stac) => { lh.push({ t: t0 + lh.reduce((a, e) => a + e.d, 0), d, notes: N(...Ls), stac }); };
      if (b === 7) put(BQ, lht === 'bass' ? [rl] : [rl, rl + 4]);
      else if (lht === 'bass') { if (time === '4/4') { put(2, [rl]); put(2, [rl + (b % 2 ? 4 : 0) - (b % 2 ? 7 : 0)]); } else if (time === '6/8') { put(1.5, [rl]); put(1.5, [rl + 4 - 7]); } else put(BQ, [rl]); }
      else if (lht === 'block') { if (time === '4/4') { put(2, [rl, rl + 4]); put(2, [rl, rl + 2 + (Math.random() < .5 ? 0 : 2)]); } else put(BQ, [rl, rl + 4]); }
      else if (lht === 'alberti') { for (let k = 0; k < BQ * 2; k++) put(0.5, [[rl, rl + 4, rl + 2, rl + 4][k % 4]]); }
      else if (lht === 'waltz') { put(1, [rl]); put(1, [rl + 9, rl + 11], true); put(1, [rl + 9, rl + 11], true); }
      else if (lht === 'broken') { const seq = time === '6/8' ? [0, 4, 7, 9, 7, 4] : [0, 4, 7, 9, 7, 4]; seq.forEach(x => put(0.5, [rl + x])); }
      bars.push({ cd, rh, lh });
    }
    // 临时记号：第二乐句里，弱拍上离下一个音一个全音的音升高半音，变成「导音」式的倚音
    if (G.chrom) {
      const cands = [];
      bars.slice(4, 7).forEach(bar => bar.rh.forEach((e, i) => { const nx = bar.rh[i + 1]; if (!e.rest && nx && !nx.rest && !STRONG[time].includes(e.t % BQ) && nx.notes[0].L === e.notes[0].L + 1 && nx.notes[0].midi - e.notes[0].midi === 2 && !e.notes[0].alt) cands.push(e); }));
      cands.sort(() => Math.random() - 0.5).slice(0, G.chrom).forEach(e => { e.notes = [noteL(e.notes[0].L, ki, 1)]; e.chrom = 1; });
    }
    const tp = pick(TEMPO[time]);
    const d1 = pick(['p', 'mp', 'mf']), d5 = pick(['f', 'mf', 'p', 'mp'].filter(x => x !== d1));
    return { grade, key: ki.key, keyZh: ki.k.zh, minor: ki.minor, time, bq: BQ, bars, lht, lhName: LHNAME[lht], tempo: { text: tp[0], bpm: time === '6/8' ? Math.round(tp[1] * 1.5) : tp[1], mark: time === '6/8' ? '♩. = ' + tp[1] : '♩ = ' + tp[1] }, dyn: { 0: d1, 4: d5 }, cresc: grade >= 5 ? 5 : null, rit: grade >= 5 };
  }
  // 预读三问：调、右手最高音 / 临时记号、左手伴奏型
  function questions(P) {
    const ki = keyInfo(P.key), sc = T.scale(ki.k), qs = [];
    const rel = ki.minor ? sc[2].name : sc[5].name + 'm', par = ki.minor ? ki.k.tonic.name : ki.k.tonic.name + 'm';
    const dom = sc[4].name + (ki.minor ? 'm' : '');
    const kz = k => T.parseKey(k).zh;
    qs.push({ q: '这首是什么调？', a: kz(P.key), opts: shuffle([kz(P.key), kz(rel), kz(par), kz(dom)].filter((x, i, a) => a.indexOf(x) === i)), why: `看调号${ki.minor ? '，再看结尾落在哪个音、有没有升高的导音（小调的 V 和弦里会出现临时升号）' : '，再看第一个和最后一个低音'}：${kz(P.key)}。` });
    const chromBar = P.bars.findIndex(b => b.rh.some(e => e.chrom) || b.rh.concat(b.lh).some(e => !e.rest && e.notes.some(n => n.alt)));
    if (chromBar >= 0) {
      const bars = P.bars.map((b, i) => i).filter(i => P.bars[i].rh.concat(P.bars[i].lh).some(e => !e.rest && e.notes.some(n => n.alt))).map(i => i + 1);
      const others = shuffle([1, 2, 3, 4, 5, 6, 7, 8].filter(x => !bars.includes(x))).slice(0, 3);
      const a = '第 ' + bars[0] + ' 小节';
      qs.push({ q: '最先出现临时记号（调号以外的升降号）的是哪一小节？', a, opts: shuffle([a].concat(others.map(x => '第 ' + x + ' 小节'))), why: `第 ${bars.join('、')} 小节有临时记号。弹之前先圈出来，弹到那里手才不会按成调号里的音。` });
    } else {
      const top = P.bars.flatMap(b => b.rh).filter(e => !e.rest).reduce((a, e) => (e.notes[0].midi > a.notes[0].midi ? e : a)).notes[0];
      const kiN = keyInfo(P.key), alt = [-2, -1, 1].map(d => noteL(top.L + d, kiN)).map(n => n.name + n.oct);
      const a = top.name + top.oct;
      qs.push({ q: '右手最高的音是哪个？（预读时先找音域，手才知道要伸多远）', a, opts: shuffle([a].concat(alt)), why: `最高是 ${a}。` });
    }
    const all = Object.keys(LHNAME).map(k => LHNAME[k]);
    qs.push({ q: '左手是什么伴奏型？', a: P.lhName, opts: shuffle([P.lhName].concat(shuffle(all.filter(x => x !== P.lhName)).slice(0, 3))), why: `左手是${P.lhName}。认出型来，左手就不用一个音一个音读，只看每小节的和弦换没换。` });
    return qs;
  }
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // 评分用：每个起音时刻要响的音（两只手合在一起），以及每只手各自的起音
  function onsets(P) {
    const m = new Map(), hands = { r: [], l: [] };
    P.bars.forEach((b, bi) => [['r', b.rh], ['l', b.lh]].forEach(([h, evs]) => evs.forEach(e => {
      if (e.rest) return;
      hands[h].push({ t: e.t, bar: bi });
      const o = m.get(e.t) || { t: e.t, bar: bi, ms: [] }; e.notes.forEach(n => o.ms.push(n.midi)); m.set(e.t, o);
    })));
    return { all: [...m.values()].sort((a, b) => a.t - b.t), r: hands.r, l: hands.l };
  }

  return { LEVELS, ROUND, round, span, vex, name, nameOct, range, piece, questions, onsets, GRADE };
})();
if (typeof module !== 'undefined') module.exports = Sight;
