// 课程单元 + 曲库
// 课文 blocks: p 段落 / chord 和弦示例 / prog 进行示例 / tip 提示 / song 联系曲目
const UNITS = [
  {
    id: 'u1', n: 1, title: '音程', en: 'Intervals', song: 'k545',
    blocks: [
      { t: 'p', x: '音程是两个音之间的距离，用「度数 + 性质」来描述。<b>数字母得度数</b>：C→E 经过 C D E 三个字母，是三度。<b>数半音得性质</b>：C→E 有 4 个半音，是大三度。' },
      { t: 'table', rows: [['小三度', '3 个半音', 'A–C'], ['大三度', '4 个半音', 'C–E'], ['纯四度', '5 个半音', 'C–F'], ['纯五度', '7 个半音', 'C–G']] },
      { t: 'p', x: '和弦就是三度叠起来的。分清大三度和小三度，就等于分清了大和弦和小和弦的一半。' },
      { t: 'tip', x: '你的 K545 左手 Alberti 低音 C–G–E–G：C–E 是大三度，C–G 是纯五度。先认出音程，再认出和弦。' },
    ],
  },
  {
    id: 'u2', n: 2, title: '大三和弦与小三和弦', en: 'Major & Minor Triads', song: 'castle',
    blocks: [
      { t: 'p', x: '三和弦 = 根音 + 三音 + 五音。<b>大三和弦</b>：大三度 + 小三度（4+3 个半音）。<b>小三和弦</b>：小三度 + 大三度（3+4）。' },
      { t: 'chord', s: 'C' }, { t: 'chord', s: 'Cm' },
      { t: 'p', x: '两者只有三音差半音，五音完全一样。大和弦明亮，小和弦暗淡，这个「颜色」要靠耳朵记住。' },
      { t: 'tip', x: '天空之城一开头就是 Am（小）→ Em（小）→ F（大）→ C（大）。边弹边听：先暗后亮。' },
    ],
  },
  {
    id: 'u3', n: 3, title: '减三和弦与增三和弦', en: 'Diminished & Augmented', song: 'k545',
    blocks: [
      { t: 'p', x: '<b>减三和弦</b>：小三度 + 小三度（3+3），五音比纯五度低半音，听起来紧张、不稳定。<b>增三和弦</b>：大三度 + 大三度（4+4），听起来悬浮、梦幻。' },
      { t: 'chord', s: 'Bdim' }, { t: 'chord', s: 'Caug' },
      { t: 'p', x: '在大调里，减三和弦自然出现在第七级（C 大调的 B–D–F）。它和属和弦很像，同样想要「回家」到主和弦。' },
      { t: 'tip', x: '听辨口诀：大 = 亮，小 = 暗，减 = 紧，增 = 飘。' },
    ],
  },
  {
    id: 'u4', n: 4, title: '转位与指法', en: 'Inversions & Fingering', song: 'k545',
    blocks: [
      { t: 'p', x: '最低的音决定转位。<b>原位</b>：根音在最低；<b>第一转位（⁶）</b>：三音在最低；<b>第二转位（⁶₄）</b>：五音在最低。' },
      { t: 'chord', s: 'C' }, { t: 'chord', s: 'C/E' }, { t: 'chord', s: 'C/G' },
      { t: 'table', rows: [['', '右手', '左手'], ['原位', '1-3-5', '5-3-1'], ['第一转位', '1-2-5', '5-3-1'], ['第二转位', '1-3-5', '5-2-1']] },
      { t: 'p', x: '规律：<b>哪两个音之间是四度，就在那里留出更大的手指间隔</b>。别死记，看间距。' },
      { t: 'tip', x: 'K545 前四小节左手只有 I – V⁴₃ – I – IV⁶₄ – I – V⁶₅ – I。转位让左手几乎不用移动。背谱时记这 7 个符号，不要记 32 个音。' },
    ],
  },
  {
    id: 'u5', n: 5, title: '调内三和弦', en: 'Diatonic Triads', song: 'letitbe',
    blocks: [
      { t: 'p', x: '在大调音阶的每个音上叠三度，就得到七个调内和弦。性质的排列永远是：<b>大 小 小 大 大 小 减</b>。' },
      { t: 'prog', k: 'C', c: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'] },
      { t: 'p', x: '用罗马数字表示级数：大写 = 大和弦（I IV V），小写 = 小和弦（ii iii vi），° = 减和弦（vii°）。级数和调无关，所以换调时同一套逻辑照样成立。' },
      { t: 'tip', x: '背谱的关键：把「C F G C」记成「I IV V I」。换到任何调，手里的逻辑不变。' },
    ],
  },
  {
    id: 'u6', n: 6, title: '和声功能', en: 'Harmonic Function', song: 'letitbe',
    blocks: [
      { t: 'p', x: '每个和弦都有角色。<b>主功能 T</b>（I、vi，iii）：稳定、在家。<b>下属功能 S</b>（IV、ii）：离开。<b>属功能 D</b>（V、vii°）：紧张，想回家。' },
      { t: 'p', x: '最基本的和声逻辑是 <b>T → S → D → T</b>。绝大多数古典和流行乐句都是这条路的变体。' },
      { t: 'prog', k: 'C', c: ['C', 'F', 'G', 'C'] },
      { t: 'tip', x: '背谱卡壳时问自己：我现在是在家、出门还是回家路上？功能比具体的音更好记。' },
    ],
  },
  {
    id: 'u7', n: 7, title: '终止式', en: 'Cadences', song: 'clementi',
    blocks: [
      { t: 'p', x: '终止式就是乐句的「标点符号」。' },
      { t: 'table', rows: [['正格终止', 'V → I', '句号，完满'], ['变格终止', 'IV → I', '「阿门」，柔和'], ['半终止', '? → V', '逗号，悬停'], ['阻碍终止', 'V → vi', '意外，没回家']] },
      { t: 'prog', k: 'C', c: ['F', 'G7', 'C'] },
      { t: 'tip', x: '背一首曲子先背每一句怎么结束。克列门蒂小奏鸣曲的乐句几乎都是「半终止 → 正格终止」成对出现：一问一答。' },
    ],
  },
  {
    id: 'u8', n: 8, title: '七和弦', en: 'Seventh Chords', song: 'bach',
    blocks: [
      { t: 'p', x: '三和弦上再加一个三度，就是七和弦。五种常用的：' },
      { t: 'table', rows: [['大七 maj7', '大三 + 大七度', 'Cmaj7'], ['属七 7', '大三 + 小七度', 'G7'], ['小七 m7', '小三 + 小七度', 'Dm7'], ['半减七 ø', '减三 + 小七度', 'Bm7♭5'], ['减七 °7', '减三 + 减七度', 'Bdim7']] },
      { t: 'chord', s: 'G7' },
      { t: 'p', x: '<b>属七和弦最重要</b>：G7 里的 B 和 F 构成三全音，B 想上行到 C，F 想下行到 E，于是非常想解决到 C 大和弦。' },
      { t: 'tip', x: '巴赫 C 大调前奏曲（BWV 846）整首都是七和弦的分解：Dm7/C、G7/B、Cmaj7/B……它也是最好的琶音和背谱练习。' },
    ],
  },
  {
    id: 'u9', n: 9, title: '小调与和声小调', en: 'Minor Keys', song: 'castle',
    blocks: [
      { t: 'p', x: '自然小调的 v 级是小和弦（A 小调的 Em），力量不够。于是把第七级升高半音（G → G♯），得到<b>和声小调</b>：v 变成大和弦 E，还可以加七度成为 E7。' },
      { t: 'chord', s: 'E7' }, { t: 'chord', s: 'Am' },
      { t: 'p', x: 'G♯ 叫做<b>导音</b>，它离主音 A 只有半音，强烈地想上行解决。' },
      { t: 'tip', x: '天空之城里 E7 → Am 就是这个原理。看到谱上的升号临时记号，先想：这是不是导音？' },
    ],
  },
  {
    id: 'u10', n: 10, title: '流行和声进行', en: 'Pop Progressions', song: 'canon',
    blocks: [
      { t: 'p', x: '流行音乐反复使用少数几个「模板」，学会一个就等于学会几十首歌。' },
      { t: 'table', rows: [['卡农进行', 'I–V–vi–iii–IV–I–IV–V'], ['1564', 'I–V–vi–IV'], ['6415', 'vi–IV–I–V'], ['1645', 'I–vi–IV–V'], ['4536（王道）', 'IV–V–iii–vi']] },
      { t: 'prog', k: 'C', c: ['C', 'G', 'Am', 'F'] },
      { t: 'tip', x: '华语流行（包括林俊杰的很多歌）大量使用这些进行。学新歌时先找模板，剩下的只是变化。' },
    ],
  },
  {
    id: 'u11', n: 11, title: '副属和弦', en: 'Secondary Dominants', song: 'bach',
    blocks: [
      { t: 'p', x: '任何调内和弦都可以拥有自己的「属和弦」。在 C 大调里，G 的属和弦是 D（D–F♯–A），写作 <b>V/V</b>，读作「五级的五级」。' },
      { t: 'prog', k: 'C', c: ['C', 'D7', 'G', 'C'] },
      { t: 'table', rows: [['V/V', 'D7 → G', 'C 大调'], ['V/vi', 'E7 → Am', 'C 大调'], ['V/ii', 'A7 → Dm', 'C 大调']] },
      { t: 'tip', x: '谱上突然出现 F♯、G♯、C♯ 这类临时升号，常常就是副属和弦。看它下一个和弦是谁，就知道它在「指向」谁。' },
    ],
  },
  {
    id: 'u12', n: 12, title: '借用和弦', en: 'Borrowed Chords', song: 'letitbe',
    blocks: [
      { t: 'p', x: '大调可以从<b>同主音小调</b>借和弦（C 大调向 C 小调借），给音乐加上一层阴影。' },
      { t: 'table', rows: [['iv', 'Fm', '温柔的伤感'], ['♭VI', 'A♭', '突然变暗'], ['♭VII', 'B♭', '摇滚、电影感'], ['♭III', 'E♭', '色彩明显']] },
      { t: 'prog', k: 'C', c: ['C', 'F', 'Fm', 'C'] },
      { t: 'tip', x: 'IV → iv → I 是流行抒情歌最常见的「心碎」时刻。看到降号临时记号，先想：是不是借用和弦？' },
    ],
  },
];

// 曲库：bars 用 | 分小节，空格分同一小节内的和弦
// 注意：均为学习用的简化和声分析，请对照你手上的乐谱核对
const SONGS = [
  {
    id: 'k545', title: '莫扎特 C 大调奏鸣曲 K.545', sub: '第一乐章 · 开头', key: 'C', tag: '古典', bpm: 100,
    sections: [{ name: '主题 1–4 小节', bars: 'C | G7/D C | F/C C | G7/B C' }],
    note: '左手 Alberti 低音的和声骨架（简化）。请对照乐谱核对。',
  },
  {
    id: 'clementi', title: '克列门蒂 小奏鸣曲 Op.36 No.1', sub: '第一乐章 · 开头（简化）', key: 'C', tag: '古典', bpm: 96,
    sections: [
      { name: '前句', bars: 'C | C | G | G' },
      { name: '后句', bars: 'C | F | G7 | C' },
    ],
    note: '开头右手是 C 大三和弦的分解（琶音！）。这里是简化的骨架，请对照乐谱核对。',
  },
  {
    id: 'bach', title: '巴赫 C 大调前奏曲 BWV 846', sub: '《平均律》第一首 · 1–11 小节', key: 'C', tag: '古典', bpm: 66,
    sections: [
      { name: '1–4', bars: 'C | Dm7/C | G7/B | C' },
      { name: '5–8', bars: 'Am/C | D7/C | G/B | Cmaj7/B' },
      { name: '9–11', bars: 'Am7 | D7 | G' },
    ],
    note: '整首都是分解和弦，最适合同时练琶音、七和弦和背谱。',
  },
  {
    id: 'castle', title: '天空之城', sub: '久石让 · 常见钢琴改编（A 小调）', key: 'Am', tag: '流行', bpm: 76,
    sections: [
      { name: 'A 段', bars: 'Am Em | F C | Dm G | C E7 | Am Em | F C | Dm E7 | Am' },
      { name: 'B 段', bars: 'F G | Em Am | Dm G | C | F G | E7 Am | Dm E7 | Am' },
    ],
    note: '改编版本很多，这是最常见的一种，请以你的谱为准（在「编辑」里改）。',
  },
  {
    id: 'canon', title: '卡农', sub: '帕赫贝尔 · D 大调', key: 'D', tag: '古典', bpm: 60,
    sections: [{ name: '低音主题', bars: 'D A | Bm F#m | G D | G A' }],
    note: '流行音乐里「卡农进行」的源头。',
  },
  {
    id: 'letitbe', title: 'Let It Be', sub: 'The Beatles · 主歌', key: 'C', tag: '流行', bpm: 72,
    sections: [{ name: '主歌', bars: 'C G | Am F | C G | F C' }],
    note: '1564 进行的经典例子。',
  },
];

// 用户自己的曲目模板（例如 Always Online），在「编辑」中填写
const SONG_DRAFTS = [
  { title: 'Always Online', sub: '林俊杰 · 从你的谱上抄写和弦', key: '', sections: [] },
];
