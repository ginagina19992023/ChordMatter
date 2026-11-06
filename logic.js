// 读懂谱面逻辑：曲目页「谱面逻辑」里出现的每个词，各有一课
const LOGICS = (() => {
  const v = s => T.voicing(T.parseChord(s)).map(n => n.midi);
  const keys = s => T.voicing(T.parseChord(s)).map(n => ({ m: n.midi, f: T.disp(n.name) }));
  const pick = (arr, i) => arr[i % arr.length];
  const feel = (sym, ans, ask) => ({ type: 'pick', ask: ask || 'C 大调里，听这个和弦是哪种感觉？', options: ['稳', '走', '紧'], answer: ans, play: sym });
  return [
    { id: 'l1', big: '功能', title: '「功能」= 和弦在乐句里的角色', say: '和弦不只是一组音，它在乐句里还有角色，叫<b>功能</b>。只有三种：<b>稳</b>（在家）、<b>走</b>（出门）、<b>紧</b>（急着回家）。谱面逻辑里的「功能：稳 走 紧 稳」就是一句话的角色表。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('C'), v('F'), v('G7'), v('C')] },
      task: i => pick([feel('C', '稳'), feel('F', '走'), feel('G7', '紧')], i) },
    { id: 'l2', big: '稳', title: '稳 = 主功能，像在家', say: '听完会觉得「结束了、安心了」。C 大调里最稳的是 <b>C</b>（1 级）；<b>Am</b>（6m）和 <b>Em</b>（3m）也算稳，但没那么踏实。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('C'), [], v('Am'), [], v('Em')] },
      task: i => ({ type: 'pick', ask: 'C 大调里，哪个和弦最「稳」？', options: pick([['C', 'F', 'G'], ['G', 'C', 'Dm'], ['F', 'G7', 'C']], i), answer: 'C' }) },
    { id: 'l3', big: '走', title: '走 = 下属功能，出门了', say: '离开家，往前走，但还不急。C 大调里是 <b>F</b>（4 级）和 <b>Dm</b>（2m）。',
      demo: { keys: keys('F'), staff: 'F', seq: [v('C'), v('F'), v('Dm')] },
      task: i => ({ type: 'pick', ask: 'C 大调里，哪个和弦是「走」？', options: pick([['F', 'C', 'G'], ['C', 'Dm', 'G7'], ['G', 'Am', 'F']], i), answer: pick(['F', 'Dm', 'F'], i) }) },
    { id: 'l4', big: '紧', title: '紧 = 属功能，急着回家', say: '听着有点紧张，很想往下走到「稳」。C 大调里是 <b>G</b>、<b>G7</b>（5 级）和 <b>Bdim</b>。G7 比 G 更紧，因为多了一个 F。',
      demo: { keys: keys('G7'), staff: 'G7', seq: [v('G'), v('G7'), v('C')] },
      task: i => ({ type: 'pick', ask: 'C 大调里，哪个和弦最「紧」？', options: pick([['G7', 'C', 'F'], ['Am', 'G7', 'Dm'], ['C', 'F', 'G']], i), answer: pick(['G7', 'G7', 'G'], i) }) },
    { id: 'l5', big: '稳→走→紧→稳', title: '一句话的标准路线', say: '大多数乐句都走这条路：在家 → 出门 → 急着回家 → 回到家。C → F → G → C 就是最短的一句。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('C'), v('F'), v('G7'), v('C')] },
      task: i => ({ type: 'pick', ask: pick(['C → F → G7 → ？ 最自然的下一个是', 'Am → Dm → G → ？ 最自然的下一个是', 'C → Am → F → ？ 最自然的下一个是'], i), options: ['C', 'F', 'G', 'Dm'].slice(0, 4), answer: pick(['C', 'C', 'G'], i), play: pick([['C', 'F', 'G7'], ['Am', 'Dm', 'G'], ['C', 'Am', 'F']], i) }) },
    { id: 'l6', big: '结尾', title: '「结尾」= 一句话最后两个和弦', say: '谱面逻辑里写「结尾 正格终止」，意思是这一段最后两个和弦的走法。它就像标点符号：句号、逗号，还是意外。专业名字叫<b>终止式</b>。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('F'), v('G7'), v('C')] },
      task: i => ({ type: 'pick', ask: 'C – F – G – C 这一句的「结尾」是哪两个和弦？', options: ['C – F', 'F – G', 'G – C'], answer: 'G – C' }) },
    { id: 'l7', big: 'V → I', title: '正格终止：句号', say: '紧 → 稳，5 → 1（G7 → C）。最完整的结束，像句号。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('G7'), v('C')] },
      task: i => ({ type: 'pick', ask: '听两个和弦，这是哪种结尾？', options: ['正格终止（句号）', '半终止（逗号）', '阻碍终止（意外）'], answer: pick(['正格终止（句号）', '半终止（逗号）', '正格终止（句号）'], i), play: pick([['G7', 'C'], ['C', 'G'], ['G', 'C']], i) }) },
    { id: 'l8', big: '→ V', title: '半终止：逗号', say: '停在「紧」上（停在 5 级 G），话没说完，像逗号，后面一定还有一句。',
      demo: { keys: keys('G'), staff: 'G', seq: [v('C'), v('Dm'), v('G')] },
      task: i => ({ type: 'pick', ask: '这一句停在哪种和弦上，像逗号？', options: ['停在 G（紧）', '停在 C（稳）', '停在 F（走）'], answer: '停在 G（紧）', play: ['C', 'F', 'G'] }) },
    { id: 'l9', big: 'V → vi', title: '阻碍终止：意外', say: '紧完本该回家（C），却去了 Am。像故事里的转折。你的 City of Stars 里 C7 → Dm 就是这个。',
      demo: { keys: keys('Am'), staff: 'Am', seq: [v('G7'), v('C'), [], v('G7'), v('Am')] },
      task: i => ({ type: 'pick', ask: '听：紧之后回家了吗？', options: ['回家了（正格）', '没回家（阻碍）'], answer: pick(['没回家（阻碍）', '回家了（正格）', '没回家（阻碍）'], i), play: pick([['G7', 'Am'], ['G7', 'C'], ['G', 'Am']], i) }) },
    { id: 'l10', big: '2–5–1', title: '2–5–1：走 → 紧 → 稳', say: '2m → 5 → 1（Dm → G → C）。流行和爵士里最常见的一小句。看到「含 2–5–1」，就是这三个和弦连在一起出现了。',
      demo: { keys: keys('Dm'), staff: 'Dm', seq: [v('Dm7'), v('G7'), v('C')] },
      task: i => ({ type: 'tap', ask: pick(['2–5–1 的第一个和弦是 Dm，点出 Dm', '2–5–1 的第二个和弦是 G，点出 G', '2–5–1 的最后一个和弦是 C，点出 C'], i), pcs: pick([[2, 5, 9], [7, 11, 2], [0, 4, 7]], i), sym: pick(['Dm', 'G', 'C'], i) }) },
    { id: 'l11', big: '4536', title: '「进行」= 一串常用的和弦顺序', say: '「含 4536 进行」= 4 → 5 → 3m → 6m（F G Em Am）。你的 Always Online 主歌和副歌整段都是它。认出模板，一首歌就只剩一点点要记。',
      demo: { keys: keys('F'), staff: 'F', seq: [v('F'), v('G'), v('Em'), v('Am')] },
      task: i => ({ type: 'pick', ask: pick(['4536 在 C 大调是？', '1564 在 C 大调是？', 'Always Online 主歌的进行是？'], i), options: ['F G Em Am', 'C G Am F', 'Dm G C'], answer: pick(['F G Em Am', 'C G Am F', 'F G Em Am'], i) }) },
    { id: 'l12', big: '低音线', title: '低音线 = 每个和弦最下面的音连起来', say: '谱面逻辑最后的「低音线」，就是左手最低的音排成一行。背谱时先把低音线哼出来，整首的骨架就有了。',
      demo: { keys: [{ m: 48, f: 'C' }, { m: 47, f: 'B' }, { m: 45, f: 'A' }, { m: 43, f: 'G' }], seq: [[48], [47], [45], [43]] },
      task: i => ({ type: 'pick', ask: pick(['C → G/B → Am 的低音线是？', 'F → G → C 的低音线是？', 'C → C/E → F 的低音线是？'], i), options: ['C B A', 'F G C', 'C E F', 'C G A'], answer: pick(['C B A', 'F G C', 'C E F'], i),
        why: pick(['每个和弦只取最下面那个音：<b>C</b> 没有斜线，最低音就是根音 C；<b>G/B</b> 斜线后面是 B，所以最低音是 <b>B</b>（不是 G）；<b>Am</b> 最低音是根音 A。连起来就是 <b>C B A</b>，一步一步往下走。',
          '三个都没有斜线，最低音就是各自的根音：F、G、C → <b>F G C</b>。',
          '<b>C</b> 的最低音是 C；<b>C/E</b> 斜线后是 E，最低音是 <b>E</b>；<b>F</b> 的最低音是 F → <b>C E F</b>，一步一步往上走。'], i) }) },
  ];
})();
