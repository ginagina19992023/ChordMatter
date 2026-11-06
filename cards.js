// 卡册：积分解锁随机曲谱卡。卡面 = 曲名、作曲、年代、难度、稀有度、自带的练习
// own: 一开始就有（基础曲库）；其他靠积分随机解锁。新曲目的和声为学习用简化版，请对照原谱核对
const CARDS = [
  { id: 'k545', rare: 2, composer: '莫扎特', year: 1788, level: 3, note: '左手 Alberti 低音的教科书', own: 1 },
  { id: 'clementi', rare: 1, composer: '克列门蒂', year: 1797, level: 2, note: '开头就是 C 大三和弦的琶音', own: 1 },
  { id: 'bach', rare: 3, composer: '巴赫', year: 1722, level: 3, note: '整首都是分解和弦，配真人录音', own: 1 },
  { id: 'castle', rare: 1, composer: '久石让', year: 1986, level: 2, note: '小调里的 E7 → Am', own: 1 },
  { id: 'canon', rare: 2, composer: '帕赫贝尔', year: 1680, level: 2, note: '流行音乐「卡农进行」的源头', own: 1 },
  { id: 'alwayson', rare: 3, composer: '林俊杰', year: 2013, level: 2, note: '你的目标曲：4536 王道进行 + 副属和弦', own: 1 },
  { id: 'cityofstars', rare: 2, composer: 'Justin Hurwitz', year: 2016, level: 2, note: '属七没回家：C7 → Dm 的阻碍终止', own: 1 },
  { id: 'cosrowan', rare: 3, composer: 'Justin Hurwitz', year: 2016, level: 3, note: '七和弦一整首：2–5–6、副属和弦、桥段转 D 小调', own: 1 },
  { id: 'letitbe', rare: 1, composer: 'The Beatles', year: 1970, level: 1, note: '1564 进行', own: 1 },
  { id: 'elise', rare: 3, composer: '贝多芬', year: 1810, level: 3, note: 'A 小调里 E 和 Am 来回摆动' },
  { id: 'greensleeves', rare: 2, composer: '英格兰民歌', year: 1580, level: 2, note: '小调里借来的大调色彩' },
  { id: 'grace', rare: 1, composer: '美国民谣', year: 1835, level: 1, note: 'I – IV – V 三个和弦配一整首' },
];
const GIFT_SONGS = [
  { id: 'elise', title: '致爱丽丝', sub: '贝多芬 · A 段（简化和声）', key: 'Am', tag: '古典', bpm: 72, src: 'simplified',
    sections: [{ name: 'A 段', bars: 'Am | E | Am | E | Am | E | Am' }], note: '学习用简化和声：主旋律在 E–D♯ 之间摆动，下面是 Am 与 E 交替。请对照原谱核对。' },
  { id: 'greensleeves', title: '绿袖子', sub: '英格兰民歌 · 主歌（简化和声）', key: 'Am', tag: '古典', bpm: 84,
    sections: [{ name: '前句', bars: 'Am | G | F | E' }, { name: '后句', bars: 'Am | G | F E | Am' }], note: '常见简化配法，版本很多，请对照你的谱。' },
  { id: 'grace', title: '奇异恩典', sub: 'Amazing Grace · G 大调（简化和声）', key: 'G', tag: '流行', bpm: 76,
    sections: [{ name: '前句', bars: 'G | G | C | G | G | G | D | D' }, { name: '后句', bars: 'G | G7 | C | G | G Em | D | G | G' }], note: '最常见的 I–IV–V 配法。' },
];
const RARE = ['', '普通', '稀有', '传说'];
