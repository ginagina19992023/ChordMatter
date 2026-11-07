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
  return { LEVELS, ROUND, round, span, vex, name, nameOct, range };
})();
if (typeof module !== 'undefined') module.exports = Sight;
