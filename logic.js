// 读懂谱面逻辑：曲目页「谱面逻辑」里出现的每个词，各有一课
const LOGICS = (() => {
  const v = s => T.voicing(T.parseChord(s)).map(n => n.midi);
  const keys = s => T.voicing(T.parseChord(s)).map(n => ({ m: n.midi, f: T.disp(n.name) }));
  const pick = (arr, i) => arr[i % arr.length];
  // 稳 / 走 / 紧 的判断规则：不是靠感觉，看和弦的根音是调里第几级
  //   1、3、6 级 → 稳（和一级和弦共用两个音）；2、4 级 → 走（含 4 级音）；5、7 级 → 紧（含 7 级音 = 导音，离主音只差半音）
  const FAM = { T: '稳', S: '走', D: '紧' };
  function famWhy(sym, key = 'C') {
    const a = T.analyze(sym, key); if (!a) return '';
    const K = T.parseKey(key), sc = T.scale(K, true).map(x => x.name), d = T.disp;
    const notes = T.parseChord(sym).notes.map(x => x.name), I1 = T.degreeChord(K, 0), I = T.parseChord(I1).notes.map(x => x.name);
    const lvl = sc.findIndex(x => T.parseNote(x).pc === T.parseChord(sym).root.pc) + 1;
    const f = FAM[a.func];
    let r = `① <b>${d(sym)}</b> 的根音 ${d(notes[0])} 是 ${d(key)} ${K.minor ? '小调' : '大调'}的第 <b>${lvl || '?'}</b> 级。② 规则：1、3、6 级稳；2、4 级走；5、7 级紧 → <b>${f}</b>。`;
    if (a.kind === 'sec') r = `① <b>${d(sym)}</b> 不是调里本来的和弦，它是<b>副属和弦</b>：临时的「五级」，指向下一个和弦。② 五级 = 紧 → <b>紧</b>。`;
    if (f === '稳') { const sh = notes.filter(n => I.some(x => T.parseNote(x).pc === T.parseNote(n).pc)); r += ` ③ 为什么：它和一级和弦 ${d(I1)}（${I.map(d).join(' ')}）共用 ${sh.map(d).join('、')}，听起来像家。`; }
    if (f === '走') { const four = sc[3]; r += ` ③ 为什么：它里面有 ${d(four)}（4 级音），${d(four)} 不在一级和弦里，所以离开了家。`; }
    if (f === '紧' && a.kind !== 'sec') { const lt = sc[6]; r += ` ③ 为什么：它里面有 ${d(lt)}（7 级音 = 导音），${d(lt)} 离 ${d(sc[0])} 只差半音，特别想往上走回家。${notes.length > 3 ? ' 七和弦还多了 ' + d(notes[3]) + '，更紧。' : ''}`; }
    return r;
  }
  const famQ = (sym, key = 'C', ask) => ({ type: 'pick', ask: ask || `${T.disp(key)} ${/m$/.test(key) ? '小调' : '大调'}里，<b>${T.disp(sym)}</b> 是稳、走还是紧？先数它是第几级。`, options: ['稳', '走', '紧'], answer: FAM[T.analyze(sym, key).func], play: sym, why: famWhy(sym, key) });
  const feel = (sym, ans, ask) => ({ type: 'pick', ask: ask || 'C 大调里，听这个和弦是哪种感觉？', options: ['稳', '走', '紧'], answer: ans, play: sym, why: famWhy(sym, 'C') });
  return [
    { id: 'l1', big: '功能', title: '「功能」= 和弦在乐句里的角色', say: '和弦不只是一组音，它在乐句里还有角色，叫<b>功能</b>。只有三种：<b>稳</b>（在家）、<b>走</b>（出门）、<b>紧</b>（急着回家）。谱面逻辑里的「功能：稳 走 紧 稳」就是一句话的角色表。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('C'), v('F'), v('G7'), v('C')] },
      task: i => pick([feel('C', '稳'), feel('F', '走'), feel('G7', '紧')], i) },
    { id: 'l2', big: '稳', title: '稳 = 主功能，像在家', say: '听完会觉得「结束了、安心了」。C 大调里最稳的是 <b>C</b>（1 级）；<b>Am</b>（6 级）和 <b>Em</b>（3 级）也算稳，因为它们和 C 和弦共用两个音，只是没那么踏实。规则见「数级数」那一课：1、3、6 级 = 稳。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('C'), [], v('Am'), [], v('Em')] },
      task: i => ({ type: 'pick', ask: 'C 大调里，哪个和弦最「稳」？', options: pick([['C', 'F', 'G'], ['G', 'C', 'Dm'], ['F', 'G7', 'C']], i), answer: 'C', why: 'C 是 1 级，就是「家」本身，所以最稳。F 是 4 级（走），G / G7 是 5 级（紧），Dm 是 2 级（走）。规则：1、3、6 级稳；2、4 级走；5、7 级紧。' }) },
    { id: 'l3', big: '走', title: '走 = 下属功能，出门了', say: '离开家，往前走，但还不急。C 大调里是 <b>F</b>（4 级）和 <b>Dm</b>（2 级）。它们都含 F（4 级音），F 不在 C 和弦里，所以「离开了家」。规则：2、4 级 = 走。',
      demo: { keys: keys('F'), staff: 'F', seq: [v('C'), v('F'), v('Dm')] },
      task: i => ({ type: 'pick', ask: 'C 大调里，哪个和弦是「走」？', options: pick([['F', 'C', 'G'], ['C', 'Dm', 'G7'], ['G', 'Am', 'F']], i), answer: pick(['F', 'Dm', 'F'], i), why: pick(['F 是 4 级 → 走（含 4 级音 F）。C 是 1 级（稳），G 是 5 级（紧）。', 'Dm 是 2 级 → 走（含 4 级音 F）。C 是 1 级（稳），G7 是 5 级（紧）。', 'F 是 4 级 → 走。G 是 5 级（紧），Am 是 6 级（稳）。'], i) }) },
    { id: 'l4', big: '紧', title: '紧 = 属功能，急着回家', say: '听着有点紧张，很想往下走到「稳」。C 大调里是 <b>G</b>、<b>G7</b>（5 级）和 <b>Bdim</b>。它们都含 B（7 级音，导音），B 离 C 只差半音，特别想回去。G7 比 G 更紧，因为多了一个 F。规则：5、7 级 = 紧。',
      demo: { keys: keys('G7'), staff: 'G7', seq: [v('G'), v('G7'), v('C')] },
      task: i => ({ type: 'pick', ask: 'C 大调里，哪个和弦最「紧」？', options: pick([['G7', 'C', 'F'], ['Am', 'G7', 'Dm'], ['C', 'F', 'G']], i), answer: pick(['G7', 'G7', 'G'], i), why: pick(['G7 是 5 级 → 紧（含导音 B，还多了一个 F）。C 是 1 级（稳），F 是 4 级（走）。', 'G7 是 5 级 → 紧。Am 是 6 级（稳），Dm 是 2 级（走）。', 'G 是 5 级 → 紧（含导音 B，离 C 只差半音）。C 是 1 级（稳），F 是 4 级（走）。'], i) }) },
    { id: 'l13', big: '1 3 6 · 2 4 · 5 7', title: '稳走紧不是靠感觉：数级数', say: '判断只要两步：① 数这个和弦的根音是调里第几级；② 套规则——<b>1、3、6 级 = 稳</b>，<b>2、4 级 = 走</b>，<b>5、7 级 = 紧</b>。<br>为什么这么分？看和弦里的音：<br>· 稳：C、Em、Am 都和 C 和弦（C E G）共用两个音，所以都「像家」。<br>· 走：F、Dm 里都有 <b>F</b>（4 级音），F 不在 C 和弦里，所以离开了家。<br>· 紧：G、Bdim 里都有 <b>B</b>（7 级音，导音），B 离 C 只差半音，特别想回去。G7 再多一个 F，更紧。<br>先会数，再去听，耳朵会越来越确定。',
      demo: { keys: keys('C'), staff: 'C', seq: [v('C'), v('Am'), [], v('F'), v('Dm'), [], v('G'), v('G7'), [], v('C')] },
      task: i => pick([famQ('Am'), famQ('Dm'), famQ('Em'), famQ('G7'), famQ('F'), famQ('Bdim')], i + Math.floor(Math.random() * 3)) },
    { id: 'l14', big: '换调', title: '换个调，规则不变，只是级数换了', say: '在 G 大调里，1 = G。所以 <b>G 稳、C 走、D 紧</b>；Em（6 级）稳，Am（2 级）走。<br>同一个 C 和弦，在 C 大调是稳，在 G 大调是走：<b>和弦本身没有稳走紧，是在调里的位置决定的</b>。',
      demo: { keys: keys('G'), staff: 'G', seq: [v('G'), v('C'), v('D7'), v('G')] },
      task: i => pick([famQ('C', 'G'), famQ('D7', 'G'), famQ('Em', 'G'), famQ('Am', 'G'), famQ('Bb', 'F'), famQ('C7', 'F'), famQ('Gm7', 'F'), famQ('Dm', 'F')], i * 2 + Math.floor(Math.random() * 2)) },
    { id: 'l15', big: '曲子里', title: '在你的曲子里数一遍', say: '<b>Always Online</b>（C 大调）主歌：F → G → Em → Am。数级数：4 → 5 → 3 → 6，所以是 <b>走 → 紧 → 稳 → 稳</b>。<br><b>City of Stars</b>（F 大调）开头：Gm7 → C7 → Dm7。Gm 是 2 级（走），C7 是 5 级（紧），Dm 是 6 级（稳）——紧之后没回 1 级 F，落到了 6 级，这就是阻碍终止的「意外」。<br>副属和弦（比如 Always Online 里的 <b>D7</b>、<b>E</b>，City of Stars 里的 <b>A7</b>）不在调里，一律算紧：它们是临时的五级，指向下一个和弦。',
      demo: { keys: keys('F'), staff: 'F', seq: [v('F'), v('G'), v('Em'), v('Am')] },
      task: i => pick([famQ('F', 'C', 'Always Online 主歌第 9 小节 <b>F</b>（C 大调）：稳、走还是紧？'), famQ('Em', 'C', 'Always Online 第 3 小节 <b>Em</b>（C 大调）：稳、走还是紧？'), famQ('D7', 'C', 'Always Online 第 22 小节 <b>D7</b>（C 大调）：稳、走还是紧？'), famQ('Gm7', 'F', 'City of Stars 第 5 小节 <b>Gm7</b>（F 大调）：稳、走还是紧？'), famQ('Dm7', 'F', 'City of Stars 第 7 小节 <b>Dm7</b>（F 大调）：稳、走还是紧？'), famQ('A7', 'F', 'City of Stars 第 18 小节 <b>A7</b>（F 大调）：稳、走还是紧？')], i * 2 + Math.floor(Math.random() * 2)) },
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
