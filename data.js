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
      { t: 'video', src: 'media/u2-minor-triads.mp4', poster: 'media/u2-minor-triads.jpg', vtt: 'media/u2-minor-triads.zh.vtt', title: '真人示范：大三和弦 → 小三和弦（1 分 36 秒，中文字幕）', credit: 'Mario Ajero《Back to Basics: Minor Triads》片段（原片 3:16–4:52），CC BY 2.5', url: 'https://archive.org/details/MarioAjeroMinorTriadsandLastChristmas' },
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
      { t: 'video', src: 'media/demo-inversions.mp4', poster: 'media/demo-inversions.jpg', title: '演示视频：C → C/E → C/G，只把最下面的音搬上去（15 秒）', credit: '本应用录制的演示（原创）', tall: 1 },
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
      { t: 'video', src: 'media/demo-function.mp4', poster: 'media/demo-function.jpg', title: '演示视频：稳 → 走 → 紧 → 稳（13 秒）', credit: '本应用录制的演示（原创）', tall: 1 },
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
      { t: 'video', src: 'media/demo-progression.mp4', poster: 'media/demo-progression.jpg', title: '演示视频：4536 王道进行，Always Online 的骨架（15 秒）', credit: '本应用录制的演示（原创）', tall: 1 },
      { t: 'tip', x: '你的 Always Online 主歌和副歌都是 4536（F G Em Am）。学新歌时先找模板，剩下的只是变化。' },
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
    id: 'k545', orig: { score: { src: 'https://raw.githubusercontent.com/craigsapp/mozart-piano-sonatas/master/kern/sonata15-1.krn', measures: '1-4', credit: 'Craig Stuart Sapp 数字版，依据 1878 年《旧莫扎特全集》，CC BY-NC-SA 4.0' }, imslp: 'https://imslp.org/index.php?search=Mozart+K.545', apple: 'https://music.apple.com/cn/search?term=Mozart%20K.545%20Allegro' }, title: '莫扎特 C 大调奏鸣曲 K.545', sub: '第一乐章 · 开头', key: 'C', tag: '古典', bpm: 100,
    sections: [{ name: '主题 1–4 小节', bars: 'C | G7/D C | F/C C | G7/B C' }],
    note: '左手 Alberti 低音的和声骨架（简化）。请对照乐谱核对。',
  },
  {
    id: 'clementi', orig: { imslp: 'https://imslp.org/index.php?search=Clementi+Op.36', apple: 'https://music.apple.com/cn/search?term=Clementi%20Sonatina%20Op.36%20No.1' }, title: '克列门蒂 小奏鸣曲 Op.36 No.1', sub: '第一乐章 · 开头（简化）', key: 'C', tag: '古典', bpm: 96,
    sections: [
      { name: '前句', bars: 'C | C | G | G' },
      { name: '后句', bars: 'C | F | G7 | C' },
    ],
    note: '开头右手是 C 大三和弦的分解（琶音！）。这里是简化的骨架，请对照乐谱核对。',
  },
  {
    id: 'bach', rec: { clip: 'media/bach-prelude-m1-11.mp3', full: 'media/bach-prelude-full.mp3', clipName: '1–11 小节（约 45 秒）', credit: 'Sam Tennison 演奏，公有领域，来源 Internet Archive', url: 'https://archive.org/details/BachWellTemperedKlavierBookI-PreludeInCMajor' }, orig: { score: { src: 'https://raw.githubusercontent.com/humdrum-tools/bach-wtc/master/kern/wtc1p01.krn', measures: '1-11', credit: 'CCARH（Walter Hewlett）数字版，依据巴赫协会版；从原站实时加载，仅供学习' }, imslp: 'https://imslp.org/index.php?search=BWV+846', apple: 'https://music.apple.com/cn/search?term=Bach%20Prelude%20C%20major%20BWV%20846' }, title: '巴赫 C 大调前奏曲 BWV 846', sub: '《平均律》第一首 · 1–11 小节', key: 'C', tag: '古典', bpm: 66,
    sections: [
      { name: '1–4', bars: 'C | Dm7/C | G7/B | C' },
      { name: '5–8', bars: 'Am/C | D7/C | G/B | Cmaj7/B' },
      { name: '9–11', bars: 'Am7 | D7 | G' },
    ],
    note: '整首都是分解和弦，最适合同时练琶音、七和弦和背谱。',
  },
  {
    id: 'castle', orig: { apple: 'https://music.apple.com/cn/search?term=%E5%A4%A9%E7%A9%BA%E4%B9%8B%E5%9F%8E%20%E4%B9%85%E7%9F%B3%E8%AE%A9' }, title: '天空之城', sub: '久石让 · 常见钢琴改编（A 小调）', key: 'Am', tag: '流行', bpm: 76,
    sections: [
      { name: 'A 段', bars: 'Am Em | F C | Dm G | C E7 | Am Em | F C | Dm E7 | Am' },
      { name: 'B 段', bars: 'F G | Em Am | Dm G | C | F G | E7 Am | Dm E7 | Am' },
    ],
    note: '改编版本很多，这是最常见的一种，请以你的谱为准（在「编辑」里改）。',
  },
  {
    id: 'canon', orig: { imslp: 'https://imslp.org/index.php?search=Pachelbel+Canon', apple: 'https://music.apple.com/cn/search?term=Pachelbel%20Canon%20in%20D' }, title: '卡农', sub: '帕赫贝尔 · D 大调', key: 'D', tag: '古典', bpm: 60,
    sections: [{ name: '低音主题', bars: 'D A | Bm F#m | G D | G A' }],
    note: '流行音乐里「卡农进行」的源头。',
  },
  {
    id: 'alwayson', title: 'Always Online', sub: '林俊杰 · 弹琴吧钢琴谱（全曲 77 小节）', key: 'C', tag: '流行', bpm: 120,
    sections: [
      { name: '前奏 1–8', bars: 'F | G | Em | Am | Dm | G | C | C' },
      { name: '主歌 9–24', bars: 'F | G | Em | Am | F | G | Em | Am | F | G | Em | Am | F | D7 | G | G7' },
      { name: '副歌 25–40', bars: 'F | G | Em | Am | F | G | C | E | F | G | Em | Am | Dm | G | C | C' },
      { name: '桥段 41–49', bars: 'Eb | F | Dm | G7 | Eb | F | D/C# | G | G7/D' },
      { name: '副歌 50–65', bars: 'F | G | Em | Am | F | G | C | G/B | F | G | Em | Am | F | G | C | G7' },
      { name: '尾声 66–77', bars: 'Dm | G | C | C | F | G | Em | Am | Dm | G | C | C' },
    ],
    note: '和弦是逐小节看你上传的谱（左手低音 + 右手和声）分析出来的。主歌、副歌都是 4536 王道进行（F G Em Am）；D7、E 是副属和弦；桥段的 E♭ 是从 C 小调借来的和弦，D/C♯ 是低音半音下行的过渡。第 66 小节起速度放慢到 ♩=90，第 69 小节回到 ♩=120。',
    orig: { apple: 'https://music.apple.com/cn/search?term=Always%20Online%20%E6%9E%97%E4%BF%8A%E6%9D%B0' },
  },
  {
    id: 'cityofstars', title: 'City of Stars（简易版）', sub: '《爱乐之城》· Anne Ku 简易钢琴版（13 小节）', key: 'F', tag: '流行', bpm: 100,
    sections: [
      { name: '前奏 1–4', bars: 'Gm7 | Gm7 | Gm7 | Gm7' },
      { name: '主歌 5–13', bars: 'Gm Gm7 | C C7 | Dm | Dm | Gm Gm7 | C C7 | F7 | F7 | Gm Gm7' },
    ],
    note: '和弦记号直接来自你上传的简易版谱面。C7 → Dm 是阻碍终止（属七没回到主和弦 F），F7 是副属和弦。',
    orig: { apple: 'https://music.apple.com/cn/search?term=City%20of%20Stars%20La%20La%20Land' },
  },
  {
    id: 'cosrowan', title: 'City of Stars（改编版）', sub: '《爱乐之城》· RowanMusic 钢琴改编（全曲 60 小节）', key: 'F', tag: '流行', bpm: 105,
    sections: [
      { name: '前奏 1–4', bars: 'Gm7 | Gm7 | Gm7 | Gm7' },
      { name: '主歌 5–12', bars: 'Gm7 | C7 | Dm7 | Dm7 | Gm7 | C7 | Fmaj7 | Fmaj7' },
      { name: '13–18', bars: 'Gm7b5 | C | F | F7/Eb | Gm7 | A7' },
      { name: '主歌 19–26', bars: 'Dm7 | F/C | Gm7 | C7 | Dm7 | Dm7 | Gm7 | C7' },
      { name: '27–34', bars: 'F | Am/E | Gm7 | C7 | F | F7/Eb | Gm7 | A7' },
      { name: '桥段 35–48', bars: 'Bb | A7 | A7 | Dm | Bb | C | Dm | Dm | Bb | C | A7 | Dm | Bb | A7' },
      { name: '尾声 49–60', bars: 'Dm7 | F/C | Gm7 | C7 | Fmaj7 | Fmaj7 | Gm7 | A7 | A7 | Dm7 | Dm | Dm' },
    ],
    note: '这份谱没写调号，但 B♭ 一直在用，其实是 F 大调。和弦是逐小节看你上传的谱分析的：Gm7 → C7 → Dm7 就是简易版里的 2–5–6（阻碍终止）；F7/E♭ 是低音一路往下走；桥段反复出现 A7 → Dm，是暂时转到 D 小调。第 13 小节右手写了 D♭，所以标成 Gm7♭5（半减七）。',
    orig: { apple: 'https://music.apple.com/cn/search?term=City%20of%20Stars%20La%20La%20Land' },
  },
  {
    id: 'letitbe', orig: { apple: 'https://music.apple.com/cn/search?term=Let%20It%20Be%20The%20Beatles' }, title: 'Let It Be', sub: 'The Beatles · 主歌', key: 'C', tag: '流行', bpm: 72,
    sections: [{ name: '主歌', bars: 'C G | Am F | C G | F C' }],
    note: '1564 进行的经典例子。',
  },
];

// 用户自己的曲目模板（例如 Always Online），在「编辑」中填写
const SONG_DRAFTS = [];

// ---------------- 即兴伴奏：跟唱曲目（均为公有领域旋律/歌词） ----------------
// 简谱记法：数字=唱名；' 高八度，, 低八度；_ 八分（__ 十六分）；. 附点；每个 - 多一拍；0 休止
// 歌词：每个音对应一个字，~ 表示同一个字的拖腔
// 和弦：按小节，空格分半小节；也可写 C:2 G:1 指定拍数；空 = 弱起小节不配
const SING = [
  {
    id: 'twinkle', title: '小星星', sub: '儿歌 · 莫扎特 K.265 变奏曲的主题', key: 'C', beats: 4, bpm: 96, test: true,
    bars: [
      ['1 1 5 5', '一 闪 一 闪', 'C'], ['6 6 5-', '亮 晶 晶', 'F C'], ['4 4 3 3', '满 天 都 是', 'F C'], ['2 2 1-', '小 星 星', 'G C'],
      ['5 5 4 4', '挂 在 天 上', 'C F'], ['3 3 2-', '放 光 明', 'C G'], ['5 5 4 4', '好 像 许 多', 'C F'], ['3 3 2-', '小 眼 睛', 'C G'],
      ['1 1 5 5', '一 闪 一 闪', 'C'], ['6 6 5-', '亮 晶 晶', 'F C'], ['4 4 3 3', '满 天 都 是', 'F C'], ['2 2 1-', '小 星 星', 'G C'],
    ],
  },
  {
    id: 'joy', title: '欢乐颂', sub: '贝多芬第九交响曲 · 用唱名唱', key: 'C', beats: 4, bpm: 104, test: true,
    bars: [
      ['3 3 4 5', 'mi mi fa sol', 'C'], ['5 4 3 2', 'sol fa mi re', 'G'], ['1 1 2 3', 'do do re mi', 'C'], ['3. 2_ 2-', 'mi re re', 'C G'],
      ['3 3 4 5', 'mi mi fa sol', 'C'], ['5 4 3 2', 'sol fa mi re', 'G'], ['1 1 2 3', 'do do re mi', 'C'], ['2. 1_ 1-', 're do do', 'G C'],
    ],
  },
  {
    id: 'songbie', title: '送别', sub: '李叔同 词 · 奥德威 曲', key: 'C', beats: 4, bpm: 72, test: true,
    bars: [
      ["5 3_ 5_ 1'-", '长 亭 ~ 外', 'C'], ["6 1' 5-", '古 道 边', 'F C'], ['5 1_ 2_ 3 2_ 1_', '芳 草 ~ 碧 连 ~', 'C'], ['2---', '天', 'G'],
      ["5 3_ 5_ 1'. 7_", '晚 风 ~ 拂 柳', 'C'], ["6 1' 5-", '笛 声 残', 'F C'], ['5 2_ 3_ 4. 7,_', '夕 阳 ~ 山 外', 'G'], ['1---', '山', 'C'],
    ],
  },
  {
    id: 'bday', title: '生日快乐', sub: '3/4 拍 · 练圆舞曲伴奏', key: 'C', beats: 3, bpm: 100,
    bars: [
      ['5,_. 5,__', '祝 你', ''], ['6, 5, 1', '生 日 快', 'C'], ['7,- 5,_. 5,__', '乐 祝 你', 'G'], ['6, 5, 2', '生 日 快', 'G'],
      ['1- 5,_. 5,__', '乐 祝 你', 'C'], ['5 3 1', '生 日 快', 'C'], ['7, 6, 4_. 4__', '乐 ~ 祝 你', 'F'], ['3 1 2', '生 日 快', 'C:2 G:1'], ['1--', '乐', 'C'],
    ],
  },
];

// 伴奏型：t 拍位置，n 音（R 根音 3 三音 5 五音 8 高八度根音 10 高八度三音 C 柱式和弦），d 时值（拍）
const PATTERNS = {
  4: [
    { id: 'block', name: '柱式', tip: '每小节弹一次和弦，最稳，先从这个开始', ev: [[0, 'RC', 4]] },
    { id: 'oom', name: '低音 + 和弦', tip: '根音 – 和弦 – 五音 – 和弦，进行曲感', ev: [[0, 'R', 1], [1, 'C', 1], [2, '5', 1], [3, 'C', 1]] },
    { id: 'broken', name: '分解 1-5-8-10', tip: '流行抒情最常用，手张开', ev: [[0, 'R', .5], [.5, '5', .5], [1, '8', .5], [1.5, '10', .5], [2, '8', .5], [2.5, '5', .5], [3, '8', .5], [3.5, '5', .5]] },
    { id: 'alberti', name: 'Alberti 低音', tip: '1-5-3-5，就是 K.545 的左手', ev: [[0, 'R', .5], [.5, '5', .5], [1, '3', .5], [1.5, '5', .5], [2, 'R', .5], [2.5, '5', .5], [3, '3', .5], [3.5, '5', .5]] },
  ],
  3: [
    { id: 'block', name: '柱式', tip: '每小节弹一次和弦', ev: [[0, 'RC', 3]] },
    { id: 'waltz', name: '圆舞曲 嘭-嚓-嚓', tip: '根音 – 和弦 – 和弦', ev: [[0, 'R', 1], [1, 'C', 1], [2, 'C', 1]] },
    { id: 'broken', name: '分解 1-5-8-10', tip: '流动感', ev: [[0, 'R', .5], [.5, '5', .5], [1, '8', .5], [1.5, '10', .5], [2, '8', .5], [2.5, '5', .5]] },
  ],
};

UNITS.splice(7, 0, {
  id: 'u13', title: '即兴伴奏入门', en: 'Improvised Accompaniment', song: 'k545', acc: true,
  blocks: [
    { t: 'p', x: '即兴伴奏 = 看着旋律（通常是简谱），现场配上和弦，再选一种伴奏型弹出来。只用 <b>I、IV、V</b> 三个和弦，就能配大多数儿歌和民歌。' },
    { t: 'p', x: '<b>第 1 步 定调</b>：看最后一个音，通常是 1（do），这就是主音。<br><b>第 2 步 配和弦</b>：每小节（或半小节）<b>强拍上的旋律音，应该是和弦里的音</b>。<br><b>第 3 步 结尾</b>：用 V → I（正格终止）收住。' },
    { t: 'table', rows: [['旋律强拍音', '可以配', 'C 大调'], ['1 do', 'I 或 IV', 'C / F'], ['2 re', 'V', 'G'], ['3 mi', 'I', 'C'], ['4 fa', 'IV（或 V7）', 'F / G7'], ['5 sol', 'I 或 V', 'C / G'], ['6 la', 'IV', 'F'], ['7 si', 'V', 'G']] },
    { t: 'prog', k: 'C', c: ['C', 'F', 'C', 'G'] },
    { t: 'table', rows: [['柱式', '每小节一个和弦'], ['低音 + 和弦', '根 – 和弦 – 五 – 和弦'], ['分解 1-5-8-10', '流行抒情'], ['Alberti', '1-5-3-5，古典'], ['圆舞曲', '3/4 拍：根 – 和弦 – 和弦']] },
    { t: 'tip', x: '先左手只弹根音、右手弹旋律并跟着唱；稳了再换伴奏型。每天练完可以去「伴奏」考一段或跟弹一首。' },
  ],
});
UNITS.forEach((u, i) => (u.n = i + 1));

// ---------------- 知识点（核对来源后整理） ----------------
const OMT = 'https://human.libretexts.org/Bookshelves/Music/Music_Theory/Open_Music_Theory_2e_(Gotham_et_al.)';
const KNOW = [
  {
    id: 'k0', t: '先看懂：C、Am、G7 这些是什么', blocks: [
      { t: 'p', x: '钢琴白键从左到右，按 <b>C D E F G A B</b> 循环命名，这叫<b>音名</b>。C 就在「两个黑键一组」左边的那个白键。在 C 大调里，C D E F G A B 就是 do re mi fa sol la si（简谱 1–7）。' },
      { t: 'p', x: '<b>和弦名的第一个字母 = 根音</b>（和弦最下面、起名字的那个音），后面的小字说明是什么样的和弦：' },
      { t: 'table', rows: [['写法', '意思', '音'], ['C', 'C 大三和弦（明亮）', 'C E G'], ['Am', 'A 小三和弦（m = minor，暗淡）', 'A C E'], ['G7', 'G 大三和弦 + 一个七度音（紧张）', 'G B D F'], ['Cmaj7', 'C 大三和弦 + 大七度（柔和）', 'C E G B'], ['Bdim', '减三和弦', 'B D F'], ['F♯ / B♭', '♯ 升半音 = 右边紧挨的键，♭ 降半音 = 左边紧挨的键', ''], ['C/E', '弹 C 和弦，但最低音弹 E', 'E G C']] },
      { t: 'chord', s: 'C' }, { t: 'chord', s: 'Am' }, { t: 'chord', s: 'G7' },
      { t: 'p', x: '所以看到 <b>G7/B</b> 就读作：G 七和弦，低音弹 B。在曲目页点任何一个和弦，都会用这种大白话告诉你它是什么。' },
    ], src: [['Open Music Theory · 三和弦与七和弦', OMT + '/01%3A_Fundamentals/1.16%3A_Triads'], ['Open Music Theory · 罗马数字', OMT + '/01%3A_Fundamentals/1.19%3A_Roman_Numerals_and_SATB_Chord_Construction']],
  },
  {
    id: 'k1', t: '音级：一级、二级、三级是什么', blocks: [
      { t: 'p', x: '把一个调的音阶从主音开始数：第 1 个音叫<b>一级</b>，第 2 个叫<b>二级</b>……一直到七级。你熟悉的简谱数字 1 2 3 4 5 6 7，就是在说级数。' },
      { t: 'table', rows: [['级', '简谱', 'C 大调', '名称'], ['一级', '1 do', 'C', '主音 Tonic'], ['二级', '2 re', 'D', '上主音 Supertonic'], ['三级', '3 mi', 'E', '中音 Mediant'], ['四级', '4 fa', 'F', '下属音 Subdominant'], ['五级', '5 sol', 'G', '属音 Dominant'], ['六级', '6 la', 'A', '下中音 Submediant'], ['七级', '7 si', 'B', '导音 Leading tone']] },
      { t: 'p', x: '换到 G 大调，一级就变成 G，五级变成 D。<b>级数不跟着具体的音走，跟着调走</b>，所以一套逻辑可以用在所有调上。' },
      { t: 'p', x: '小调的第七级比主音低一个全音（A 小调的 G），叫<b>下主音</b>。把它升高半音（G♯），离主音只差半音，就重新变成<b>导音</b>。' },
    ], src: [['Open Music Theory · 大调音阶与音级', OMT + '/01%3A_Fundamentals/1.12%3A_Major_Scales_Scale_Degrees_and_Key_Signatures'], ['Open Music Theory · 小调音阶', OMT + '/01%3A_Fundamentals/1.13%3A_Minor_Scales_Scale_Degrees_and_Key_Signatures'], ['维基百科 · 音级', 'https://zh.wikipedia.org/wiki/音級']],
  },
  {
    id: 'k2', t: '级数和弦：「一级和弦」「五级和弦」', blocks: [
      { t: 'p', x: '以第几级音为<b>根音</b>，在它上面隔一个音叠三个音，就是几级和弦。C 大调：一级和弦 = C–E–G（1 3 5），四级和弦 = F–A–C（4 6 1），五级和弦 = G–B–D（5 7 2）。' },
      { t: 'prog', k: 'C', c: ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim'] },
      { t: 'p', x: '一、四、五级是大三和弦，叫<b>正三和弦</b>，撑起整个调；二、三、六级是小三和弦，七级是减三和弦。顺序永远是：<b>大 小 小 大 大 小 减</b>。' },
      { t: 'p', x: '流行音乐说的「1645」「4536」，就是一级、六级、四级、五级和弦连起来弹。' },
    ], src: [['Open Music Theory · 罗马数字', OMT + '/01%3A_Fundamentals/1.19%3A_Roman_Numerals_and_SATB_Chord_Construction']],
  },
  {
    id: 'k3', t: '符号怎么读：I ii V⁷ ° ⁶', blocks: [
      { t: 'table', rows: [['写法', '意思', '例子（C 大调）'], ['I IV V', '大写 = 大三和弦', 'C F G'], ['ii iii vi', '小写 = 小三和弦', 'Dm Em Am'], ['vii°', '° = 减三和弦', 'B–D–F'], ['V⁷', '加 7 = 七和弦', 'G7'], ['iiø⁷', 'ø = 半减七', 'Bm7♭5（在 A 小调里）'], ['V/V', '「五的五」：属和弦的属和弦', 'D7'], ['♭VII', '♭ = 根音降半音，借来的', 'B♭']] },
      { t: 'p', x: '本应用的「简单模式」把这些换成你熟悉的简谱数字：<b>6m</b> = 六级小和弦（Am），<b>5⁷</b> = 五级七和弦（G7），<b>5⁷/2</b> = 低音弹 2（re）。在曲目页可以随时切换。' },
    ], src: [['Open Music Theory · 罗马数字', OMT + '/01%3A_Fundamentals/1.19%3A_Roman_Numerals_and_SATB_Chord_Construction']],
  },
  {
    id: 'k4', t: '转位数字：⁶ ⁶₄ ⁶₅ ⁴₃ ⁴₂', blocks: [
      { t: 'p', x: '这些小数字来自巴洛克时期的数字低音，意思是「低音上方有哪些音程」，不是从根音算。' },
      { t: 'table', rows: [['', '三和弦', '七和弦'], ['原位（根音在下）', '不标', '⁷'], ['第一转位（三音在下）', '⁶ 六和弦', '⁶₅ 五六和弦'], ['第二转位（五音在下）', '⁶₄ 四六和弦', '⁴₃ 三四和弦'], ['第三转位（七音在下）', '—', '⁴₂ 二和弦']] },
      { t: 'chord', s: 'G7/B' },
      { t: 'p', x: 'K.545 第 2 小节左手的 V⁴₃，就是低音为 D 的 G7。简单模式里写成 5⁷/2。' },
    ], src: [['Open Music Theory · 转位与数字低音', OMT + '/01%3A_Fundamentals/1.18%3A_Inversion_and_Figured_Bass']],
  },
  {
    id: 'k5', t: '功能：稳 · 走 · 紧（T S D）', blocks: [
      { t: 'table', rows: [['简单模式', '术语', '和弦（C 大调）', '感觉'], ['稳', '主功能 T', 'I（vi、iii）', '在家'], ['走', '下属功能 S', 'IV、ii', '出门'], ['紧', '属功能 D', 'V、vii°', '想回家']] },
      { t: 'p', x: '最常见的路线是 稳 → 走 → 紧 → 稳。背谱时问自己：现在在家、出门，还是在回家的路上？' },
      { t: 'p', x: '中文教材用里曼的 T/S/D 三分法，美国教材把 S 叫「前属」（predominant），并把 vi、iii 看作较弱的前属。两种说法描述的是同一件事。' },
    ], src: [['Open Music Theory · 和声与终止', OMT + '/04%3A_Diatonic_Harmony_Tonicization_and_Modulation/4.01%3A_Introduction_to_Harmony_Cadences_and_Phrase_Endings'], ['维基百科 · 功能和声', 'https://zh.wikipedia.org/wiki/功能和声']],
  },
  {
    id: 'k6', t: '终止式：乐句的标点', blocks: [
      { t: 'table', rows: [['名称', '和弦', '例子'], ['完满正格终止 PAC', 'V → I，原位，旋律落主音', 'G → C，高音 C'], ['不完满正格终止 IAC', 'V → I，但上面条件缺一个', 'G → C，高音 E'], ['变格终止', 'IV → I', 'F → C（阿门）'], ['半终止', '停在 V', 'Dm → G'], ['阻碍终止', 'V → vi', 'G7 → Am']] },
    ], src: [['Open Music Theory · 终止式', OMT + '/04%3A_Diatonic_Harmony_Tonicization_and_Modulation/4.01%3A_Introduction_to_Harmony_Cadences_and_Phrase_Endings'], ['Music Theory for the 21st-Century Classroom · 终止式', 'https://musictheory.pugetsound.edu/mt21c/cadences.html']],
  },
  {
    id: 'k7', t: '副属和弦与借用和弦', blocks: [
      { t: 'p', x: '<b>副属和弦</b>：临时把某个和弦当成「主」，在它前面放它自己的属和弦，这个过程叫<b>离调</b>。C 大调里 D7 → G 写作 V⁷/V（重属和弦）。' },
      { t: 'p', x: '<b>借用和弦（调式交替）</b>：向同主音小调借和弦，功能不变、颜色变暗。C 大调里 Fm（iv）、A♭（♭VI）、B♭（♭VII）。' },
    ], src: [['Open Music Theory · 离调', OMT + '/04%3A_Diatonic_Harmony_Tonicization_and_Modulation/4.14%3A_Tonicization'], ['Open Music Theory · 调式交替', OMT + '/05%3A_Chromaticism/5.01%3A_Modal_Mixture']],
  },
  {
    id: 'k8', t: '流行进行：1564 · 6415 · 1645 · 卡农 · 4536', blocks: [
      { t: 'table', rows: [['1564', 'C G Am F', '歌手创作型套路'], ['6415', 'Am F C G', '同一套路换起点'], ['1645', 'C Am F G', 'doo-wop / 50 年代'], ['卡农', 'C G Am Em F C F G', '帕赫贝尔'], ['4536 王道', 'F G Em Am', '日本流行乐常用（来源为大众资料）']] },
    ], src: [['Open Music Theory · 四和弦套路', OMT + '/07%3A_Popular_Music/7.09%3A_Four-Chord_Schemas'], ['Wikipedia · Royal road progression', 'https://en.wikipedia.org/wiki/Royal_road_progression']],
  },
  {
    id: 'k9', t: '调号与五度圈', blocks: [
      { t: 'p', x: '升号的顺序永远是 F C G D A E B，降号相反 B E A D G C F。C 大调没有升降号；每往上五度（C→G→D）多一个升号，每往下五度（C→F→B♭）多一个降号。' },
    ], src: [['Open Music Theory · 调号', OMT + '/01%3A_Fundamentals/1.12%3A_Major_Scales_Scale_Degrees_and_Key_Signatures']],
  },
  {
    id: 'k10', t: '为什么用分析来背谱', blocks: [
      { t: 'p', x: '心理学家 Chaffin 与钢琴家 Imreh 跟踪研究一位职业钢琴家背巴赫《意大利协奏曲》，发现她用<b>曲式结构当作「检索框架」</b>，在关键位置设「提示点」。只靠手指动作的记忆很脆弱，一卡就断；知道结构的人能从下一个结构点接着弹。' },
      { t: 'p', x: '这项研究证明的是「结构和概念的记忆让背谱更稳」，没有单独检验和声分析。所以最好的做法是<b>两种记忆一起练</b>：分析帮你知道「这里应该是什么」，在琴上真的弹下来，手才记得住。' },
    ], src: [['Chaffin & Imreh (2002), Psychological Science 13:342–349', 'https://doi.org/10.1111/1467-9280.00462']],
  },
];

UNITS.unshift({
  id: 'u0', title: '级数：一级二级三级', en: 'Scale Degrees', song: 'letitbe',
  blocks: [
    { t: 'p', x: '你熟悉的简谱 1 2 3 4 5 6 7，就是<b>级数</b>。在 C 大调里 1 = C，在 G 大调里 1 = G。' },
    { t: 'table', rows: [['一级 1', '主音', '最稳，「家」'], ['四级 4', '下属音', ''], ['五级 5', '属音', '最想回到 1'], ['七级 7', '导音', '离 1 只差半音']] },
    { t: 'p', x: '以某一级音为根音搭的三和弦，就叫几级和弦。C 大调：<b>一级和弦</b> C（1 3 5），<b>四级和弦</b> F（4 6 1），<b>五级和弦</b> G（5 7 2）。' },
    { t: 'prog', k: 'C', c: ['C', 'F', 'G', 'C'] },
    { t: 'tip', x: '看不懂的符号，随时去「路径 → 知识点」查。' },
  ],
});
UNITS.forEach((u, i) => (u.n = i));

// 参考视频搜索词（B 站 / 小红书）
const VID = {
  u0: '简谱 级数 一级和弦 四级 五级 钢琴', u1: '音程 大三度 小三度 钢琴 乐理', u2: '大三和弦 小三和弦 钢琴 入门', u3: '减三和弦 增三和弦 听辨',
  u4: '三和弦 转位 指法 钢琴', u5: '调内和弦 大调 七个和弦 钢琴', u6: '和声功能 主 下属 属 讲解', u13: '钢琴即兴伴奏 入门 正三和弦 配和弦',
  u7: '终止式 正格终止 半终止 讲解', u8: '七和弦 属七和弦 大七 小七 钢琴', u9: '和声小调 导音 属七和弦', u10: '流行和弦进行 1564 卡农进行 钢琴',
  u11: '副属和弦 重属和弦 讲解', u12: '借用和弦 调式交替 钢琴',
  k0: '和弦名 C Am G7 怎么看 钢琴', k1: '音级 主音 属音 导音 乐理', k2: '一级和弦 四级和弦 五级和弦 钢琴', k3: '罗马数字 和弦标记 乐理', k4: '数字低音 六和弦 四六和弦',
  k5: '和声功能 TSD', k6: '终止式 乐理', k7: '副属和弦 借用和弦', k8: '流行和弦进行 王道进行', k9: '五度圈 调号 记忆', k10: '钢琴背谱 方法 分析记忆',
};
UNITS.forEach(u => (u.vid = VID[u.id]));
KNOW.forEach(k => (k.vid = VID[k.id]));
