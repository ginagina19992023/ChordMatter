// 转位十课：每课一个点，全部用「找最低音 → 它是根/三/五」来推理，不背形状
// 题目里可带 showKb（键盘上标出的音）或 showStaff（只看五线谱）
const INVS = (() => {
  const vo = s => T.voicing(T.parseChord(s));
  const keys = s => vo(s).map(n => ({ m: n.midi, f: T.disp(n.name) }));
  const plain = s => vo(s).map(n => ({ m: n.midi, f: '' }));
  const pick = (arr, i) => arr[i % arr.length];
  const ROLE = ['根音', '三音', '五音'];
  const INVN = ['原位', '一转', '二转'];
  const tri = ['C', 'F', 'G', 'D', 'A', 'Am', 'Dm', 'Em'];
  const withInv = (s, inv) => { const c = T.parseChord(s); return inv ? s + '/' + c.notes[inv].name : s; };
  return [
    { id: 'i1', big: '最低音', title: '先找最左边那个音', say: '弹和弦时，键盘上最左边（最低）的那个音叫「低音」。转位只看一件事：<b>最低音是谁</b>。',
      demo: { keys: keys('C/E'), staff: 'C/E', seq: [[64], [64, 67, 72]] },
      task: i => { const s = pick(['C/E', 'F/C', 'G/B', 'Am/C'], i); const lo = vo(s)[0]; return { type: 'pick', ask: '键盘上标出的和弦里，<b>最低的音</b>是？', showKb: plain(s), options: uniqNames(s), answer: T.disp(lo.name) }; } },
    { id: 'i2', big: '根 三 五', title: '和弦里每个音的身份', say: 'C 和弦的三个音有固定身份：C 是<b>根音</b>（起名字的音），E 是<b>三音</b>，G 是<b>五音</b>。不管怎么排，身份不变。',
      demo: { keys: [{ m: 60, f: '根' }, { m: 64, f: '三' }, { m: 67, f: '五' }], staff: 'C', seq: [[60], [64], [67]] },
      task: i => { const s = pick(['F', 'G', 'Am'], i), r = pick([1, 2, 0], i); const c = T.parseChord(s); return { type: 'tap', ask: `<b>${T.disp(s)}</b> 和弦的<b>${ROLE[r]}</b>是哪个键？`, pcs: [c.notes[r].pc] }; } },
    { id: 'i3', big: '原位', title: '根音在最下面', say: '最低音是<b>根音</b>，就叫<b>原位</b>。C 原位：C – E – G，从下往上。',
      demo: { keys: keys('C'), staff: 'C', seq: [[60], [60, 64, 67]] },
      task: i => { const s = pick(['G', 'F', 'Dm'], i); const c = T.parseChord(s); return { type: 'tap', ask: `点出 <b>${T.disp(s)} 原位</b>：最左边是根音 ${T.disp(c.root.name)}`, pcs: c.notes.map(n => n.pc), bass: c.root.pc }; } },
    { id: 'i4', big: '一转', title: '把根音搬到最上面', say: '原位 C–E–G，把最下面的 C 搬到最上面，变成 E–G–C。现在最低音是<b>三音</b> E，这叫<b>第一转位</b>。',
      demo: { keys: keys('C/E'), staff: 'C/E', seq: [[60, 64, 67], [64, 67], [64, 67, 72]] },
      task: i => { const s = pick(['C', 'F', 'G'], i); const c = T.parseChord(s); return { type: 'tap', ask: `点出 <b>${T.disp(s)} 一转</b>：最左边是三音 ${T.disp(c.notes[1].name)}`, pcs: c.notes.map(n => n.pc), bass: c.notes[1].pc }; } },
    { id: 'i5', big: '二转', title: '再搬一次', say: '一转 E–G–C，再把最下面的 E 搬上去，变成 G–C–E。最低音是<b>五音</b> G，这叫<b>第二转位</b>。',
      demo: { keys: keys('C/G'), staff: 'C/G', seq: [[64, 67, 72], [67, 72], [67, 72, 76]] },
      task: i => { const s = pick(['C', 'F', 'G'], i); const c = T.parseChord(s); return { type: 'tap', ask: `点出 <b>${T.disp(s)} 二转</b>：最左边是五音 ${T.disp(c.notes[2].name)}`, pcs: c.notes.map(n => n.pc), bass: c.notes[2].pc }; } },
    { id: 'i6', big: '三步法', title: '看键盘认转位', say: '三步：① 找最低音 ② 它是根、三还是五 ③ 根 = 原位，三 = 一转，五 = 二转。不要背形状。',
      demo: { keys: keys('F/A'), staff: 'F/A', seq: [[57], [57, 60, 65]] },
      task: i => { const s0 = pick(tri, i + 1), inv = (i + 1) % 3, s = withInv(s0, inv); return { type: 'pick', ask: `这是 <b>${T.disp(s0)}</b> 和弦的哪种排法？（先找最低音）`, showKb: keys(s), options: INVN, answer: INVN[inv] }; } },
    { id: 'i7', big: '五线谱', title: '看五线谱认转位', say: '五线谱上也是同样三步：<b>最下面那个音符</b>就是最低音。先读出它的名字，再看它是根、三还是五。',
      demo: { keys: keys('G/B'), staff: 'G/B', seq: [[59], [59, 62, 67]] },
      task: i => { const s0 = pick(['C', 'G', 'F', 'D'], i), inv = (i + 2) % 3, s = withInv(s0, inv); return { type: 'pick', ask: `只看五线谱：这是 <b>${T.disp(s0)}</b> 的哪种排法？`, showStaff: s, options: INVN, answer: INVN[inv] }; } },
    { id: 'i8', big: 'C/E = C⁶', title: '两种写法', say: '流行谱写<b>斜线</b>：C/E 就是「C 和弦，最低音 E」。古典分析写<b>小数字</b>：⁶ = 一转，⁶₄ = 二转。两种写法说的是同一件事。',
      demo: { keys: keys('C/G'), staff: 'C/G', seq: [[64, 67, 72], [67, 72, 76]] },
      task: i => { const [q, a] = pick([['C/E', '一转（C⁶）'], ['C/G', '二转（C⁶₄）'], ['G/B', '一转（G⁶）']], i); return { type: 'pick', ask: `<b>${T.disp(q)}</b> 是？`, options: ['原位', '一转（C⁶）', '二转（C⁶₄）', '一转（G⁶）'].filter((x, k, arr) => arr.indexOf(x) === k), answer: a }; } },
    { id: 'i9', big: '1-2-5', title: '指法为什么不一样', say: '右手原位、二转用 <b>1-3-5</b>，一转用 <b>1-2-5</b>。规律：两个音之间隔得远（四度）的地方，手指也要分开。',
      demo: { keys: vo('C/E').map((n, k) => ({ m: n.midi, f: [1, 2, 5][k] })), staff: 'C/E', seq: [[64], [67], [72], [64, 67, 72]] },
      task: i => { const inv = [1, 0, 2][i % 3]; const s = withInv(pick(['C', 'G', 'F'], i), inv); return { type: 'pick', ask: `右手弹键盘上这个排法，用哪组手指？`, showKb: keys(s), options: ['1-3-5', '1-2-5', '1-2-4'], answer: ['1-3-5', '1-2-5', '1-3-5'][inv] }; } },
    { id: 'i10', big: '少移动', title: '转位让手几乎不动', say: 'C → G 如果都弹原位，手要跳很远。改成 C → G/B，只有一个音动了一点点。K.545 左手全是这样：I – V⁴₃ – I – IV⁶₄ – I。',
      demo: { keys: keys('G7/B'), staff: 'G7/B', seq: [[60, 64, 67], [59, 62, 67], [60, 64, 67], [60, 65, 69], [60, 64, 67]] },
      task: i => { const [from, to] = pick([['C', 'G/B'], ['C', 'F/C'], ['Am', 'E/G#']], i); const c = T.parseChord(to); return { type: 'tap', ask: `刚弹完 <b>${T.disp(from)}</b>，接着点出 <b>${T.disp(to)}</b>（最左边是 ${T.disp(c.bass.name)}）—— 感受手几乎没动`, pcs: c.notes.map(n => n.pc), bass: c.bass.pc, showKb: keys(from) }; } },
  ];
  function uniqNames(s) { const n = T.parseChord(s).notes.map(x => T.disp(x.name)); return n; }
})();
