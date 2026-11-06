// 把逐小节转写（左手低音 + 右手和声）生成「新造谱」：Humdrum kern 双手谱 + 每小节依据
// 用法：node tools/make-harmony.js <转写目录>  → 写出 harmony.js
// 新造谱只含左手低音线和右手和声（不含旋律），小节号与原谱一一对应
const fs = require('fs'), path = require('path');
const T = require('../theory.js');
const dir = process.argv[2];
const SRC = {
  alwayson: { title: 'Always Online（和声新造谱）', files: ['ao_p1-3.json', 'ao_p4-5.json'], key: 'C', ksig: '*k[]', bpm: 120, from: '弹琴吧《Always Online》钢琴谱（你上传的 5 页）' },
  cosrowan: { title: 'City of Stars（和声新造谱）', files: ['cos_rowan.json'], key: 'F', ksig: '*k[b-]', bpm: 105, from: 'RowanMusic《City of Stars》钢琴改编（你上传的 3 页）' },
};
const LET = s => (String(s || '').replace(/♯/g, '#').replace(/♭/g, 'b').match(/[A-G](?:#|b)?/g) || []);
const pcOf = n => T.parseNote(n).pc;
function kernPitch(name, midi) {
  const L = name[0], acc = name.slice(1).replace('b', '-');
  let oct = Math.floor(midi / 12) - 1;
  if (name === 'Cb') oct += 1; if (name === 'B#') oct -= 1;
  return (oct >= 4 ? L.toLowerCase().repeat(oct - 3) : L.repeat(4 - oct)) + acc;
}
function midiNear(name, target, lo, hi) {
  const pc = pcOf(name); let best = null;
  for (let m = lo; m <= hi; m++) if (((m % 12) + 12) % 12 === pc && (best == null || Math.abs(m - target) < Math.abs(best - target))) best = m;
  return best;
}
function durs(n) {
  return { 1: ['1'], 2: ['2', '2'], 3: ['4', '4', '2'], 4: ['4', '4', '4', '4'], 5: ['8', '8', '8', '8', '2'], 6: ['8', '8', '8', '8', '4', '4'], 7: ['8', '8', '8', '8', '8', '8', '4'], 8: ['8', '8', '8', '8', '8', '8', '8', '8'] }[n];
}
// 右手和弦用 data.js 里核对过的标注（不是转写时的初步猜测）
const vm = require('vm'); const ctx = { T, console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8') + ';this.SONGS = SONGS;', ctx);
function barMap(id) {
  const s = ctx.SONGS.find(x => x.id === id), m = {}; let n = 1;
  s.sections.forEach(sec => { const mm = /(\d+)/.exec(sec.name); let st = mm ? +mm[1] : n; sec.bars.split('|').forEach(b => { m[st++] = b.trim().split(/\s+/).filter(Boolean); }); n = st; });
  return m;
}
// 依据里的说明：只保留和和声有关的（不复述旋律），中文
const NOTES = {
  alwayson: { 0: '弱起小节（2 拍），只有旋律，没有和弦', 4: '左手有 B，是加九音色彩，和弦仍是 Am', 5: '右手有 C，带一点 Dm7 的色彩', 6: 'G 低音上右手有 C，是挂留（sus）色彩，最后落到 G',
    9: '‖: 反复从这里开始', 17: '旋律里的 G 是加九音色彩，和弦仍是 F', 21: 'B 是经过音', 22: '前 3 拍是 D 大三（旋律有 C → D7）；第 4 拍右手是 F A C（F 没有升号），在 D 低音上是 Dm7。这一小节先 D7 后 Dm7，格子里只标了主要的 D7', 23: '左手的 C 是挂四色彩', 24: '左手 D G B 琶音（G/D），引入副歌',
    27: '最后一个八分音符提前进入下一小节的 Am', 30: 'Gsus4 → G：C 在第 4 拍落到 B', 31: '最后一个八分音符提前进入下一小节的 E', 37: '右手 E、F 在 D 上 = Dm9 色彩', 39: '左手只印了 2 拍', 40: ':‖ 反复结束，回到第 9 小节再弹一遍',
    41: '降号是临时记号，没有转调；最后一个八分音符提前进入 F', 44: '左手 A 是加九音色彩', 45: '最后一个八分音符提前进入 F', 47: '低音印的是 E♯（下加一线，听起来是 F）。按低音线 E♭ → F → ? → G 推测应为 F♯，可能是印错了；右手很清楚是 D7（D F♯ A C）',
    55: '挂留色彩（C）在第 4 拍落到 B', 61: '左手 B 是加九音色彩', 64: '左手最后的 F 是经过音', 65: '右手整小节休止，只有左手 G C E 琶音（C/G）', 66: '速度放慢到 ♩=90', 68: '左手 F 是经过音', 69: '回到 ♩=120',
    70: '前两拍 F 低音上有 E（大七色彩），后面是 F', 73: '左手 B 是加九音色彩', 74: 'G、E 是 Dm 上的辅助音', 75: '渐慢；旋律的 F 在 G 上 = G7 色彩', 77: '结束和弦', 78: '空小节（休止）', 79: '空小节（休止），全曲结束' },
};
NOTES.cosrowan = { 13: '右手 B♭ G B♭，左手 G B♭ D F → Gm7。之前我标成 Gm7♭5 是看错了，这里没有 D♭', 14: '这一小节没有 B♭，所以是 C，不是 C7；旋律里的 D 是加九音', 15: '左手从 F A C 变成 E A C：前半 F，后半 Am/E（也可以看成 F 大七、低音 E）', 16: '左手 E♭ A C，没有根音 F：标成 F7/E♭（省略根音），也可以叫 A°/E♭',
  20: '左手从 C 开始（C F A D）：Dm7/C，也可以看成 F6/C', 28: 'E 低音上的 Am', 30: '没有 B♭，是 C 不是 C7；D 是加九音', 31: '同第 15 小节：F → Am/E', 32: '同第 16 小节',
  36: '左手 C，右手 B♭ C E → C7；最后一个八分音符提前进入 A7（连到下一小节）', 37: '低音一步一步走', 38: '低音 D → E → F 往上走', 40: '最后一个八分音符提前进入 Dm', 41: '右手 E F A 在 D 上：Dm 加九音', 42: '右手 E F A 在 D 上：Dm 加九音', 43: '最后一个八分音符提前进入下一个和弦',
  44: '最后一个八分音符提前进入 A7；第 2 拍左手低音是 D 还是 E 看不太清', 45: '低音 A → A → B → C♯ 往上走', 47: '最后一个八分音符提前进入 A7', 48: '延长记号', 50: '同第 20 小节', 52: '这次没有 B♭，是 C', 56: '琶音', 59: '琶音 F A C D', 61: '休止，全曲结束' };
const WORDS = [['melody only', '只有旋律（没有和声音）'], ['whole-bar rest', '整小节休止'], ['whole rest', '整小节休止'], ['half rest', '二分休止'], ['quarter rest', '四分休止'], ['qtr rest', '四分休止'], ['8th rest', '八分休止'], ['arpeggiated', '琶音'], ['eighths', '八分'], ['eighth', '八分'], ['8ths', '八分'], ['16ths', '十六分'], ['qtrs', '四分'], ['qtr', '四分'], ['quarters', '四分'], ['quarter', '四分'], ['dotted', '附点'], ['half', '二分'], ['whole', '全音符'], ['chord', '和弦'], ['octaves', '八度'], ['octave', '八度'], ['dyads', '双音'], ['dyad', '双音'], ['then', '然后'], ['tied', '连音'], ['twice', '两遍'], ['natural', '还原'], ['pickup', '弱起'], ['rest', '休止'], ['beat', '第'], ['rolled', '琶音'], ['fermata', '延长记号'], ['under', '下'], ['over', '上'], ['and', '和'], ['with', '带'], ['each', '每个'], ['repeated', '重复'], ['tremolo', '震音'], ['nothing', '无'], ['grace', '装饰音'], ['tie', '连音'], ['(?)', '（看不清）'], ['figures', '音型'], ['printed', '印的'], ['last', '最后'], ['end', '结尾'], ['walking', '走动'], ['cluster', '音簇'], ['doubled', '重复'], ['melody', '旋律'], ['->', '→'], ['~', '（连音）'], ['passing', '经过音'], ['holds', '保持'], [' bar', ' 小节']];
function zh(t) { let x = String(t || ''); WORDS.forEach(([a, b]) => { x = x.split(a).join(b); }); return x.replace(/\(/g, '（').replace(/\)/g, '）').replace(/[A-Za-z]{3,}/g, m => m); }
const out = {};
for (const [id, cfg] of Object.entries(SRC)) {
  let rows = [];
  for (const f of cfg.files) { const p = path.join(dir, f); if (fs.existsSync(p)) rows = rows.concat(JSON.parse(fs.readFileSync(p, 'utf8'))); }
  if (!rows.length) continue;
  rows.sort((a, b) => a.bar - b.bar);
  const bm = barMap(id);
  const ev = {}, lines = ['!!!OTL: ' + cfg.title, '**kern\t**kern', '*staff2\t*staff1', '*clefF4\t*clefG2', cfg.ksig + '\t' + cfg.ksig, '*M4/4\t*M4/4', `*MM${cfg.bpm}\t*MM${cfg.bpm}`];
  let prevBass = 43, prevTop = 67;
  rows.forEach(r => {
    const chords = (bm[r.bar] || []).filter(x => T.parseChord(x));
    ev[r.bar] = { lh: zh(r.lh), rh: zh(r.rh_harmony), printed: r.printed_chord || null, chord: (bm[r.bar] || []).join(' ') || r.chord, guess: r.chord, conf: r.confidence, note: (NOTES[id] || {})[r.bar] || '', page: r.page, sys: r.system };
    if (r.bar === 0) return; // 弱起小节只在依据里记，不进新造谱
    lines.push(`=${r.bar}\t=${r.bar}`);
    // 左手：转写的低音（最多 8 个），平均分到一小节
    // 带八度的写法（C3 G3）直接用原谱的音高；没有八度的就就近放
    const withOct = [...String(r.lh || '').replace(/♯/g, '#').replace(/♭/g, 'b').matchAll(/([A-G](?:#|b)?)(\d)/g)].map(m => [m[1], (+m[2] + 1) * 12 + pcOf(m[1]) - (m[1] === 'Cb' ? -12 : 0) - (m[1] === 'B#' ? 12 : 0)]);
    let lh = withOct.length ? withOct.map(x => x[0]).slice(0, 8) : LET(String(r.lh || '').split('(')[0]).slice(0, 8);
    const lhMidi = withOct.length ? withOct.map(x => x[1]).slice(0, 8) : null;
    if (!lh.length && chords.length) lh = [T.parseChord(chords[0].replace(/♯/g, '#').replace(/♭/g, 'b')).bass?.name || T.parseChord(chords[0].replace(/♯/g, '#').replace(/♭/g, 'b')).root.name];
    // 右手：每个和弦一个柱式和弦（一小节两个和弦时各占半小节）
    const rhSets = chords.length ? chords.map(c => T.parseChord(c.replace(/♯/g, '#').replace(/♭/g, 'b')).notes.map(n => n.name)) : [];
    const lhTok = lh.length ? durs(lh.length).map((d, i) => { const m = lhMidi ? lhMidi[i] : midiNear(lh[i], prevBass, 33, 57); prevBass = m; return d + kernPitch(lh[i], m); }) : ['1r'];
    const rhDur = rhSets.length === 2 ? '2' : '1';
    const rhTok = rhSets.length ? rhSets.slice(0, 2).map(set => {
      const ms = set.map(n => midiNear(n, prevTop - 4, 57, 81)).map((m, i) => [m, set[i]]).sort((a, b) => a[0] - b[0]);
      prevTop = ms[ms.length - 1][0];
      return ms.map(([m, n]) => rhDur + kernPitch(n, m)).join(' ');
    }) : ['1r'];
    // 两个声部按时间对齐（kern 每行同时开始的事件）
    const toBeats = d => 4 / parseInt(d, 10);
    const evs = [];
    let t = 0; lhTok.forEach(x => { evs.push([t, 0, x]); t += toBeats(x); });
    t = 0; rhTok.forEach(x => { evs.push([t, 1, x]); t += toBeats(x.split(' ')[0]); });
    const times = [...new Set(evs.map(e => e[0]))].sort((a, b) => a - b);
    times.forEach(tt => { const a = evs.find(e => e[0] === tt && e[1] === 0), b = evs.find(e => e[0] === tt && e[1] === 1); lines.push(`${a ? a[2] : '.'}\t${b ? b[2] : '.'}`); });
  });
  lines.push('==\t==', '*-\t*-');
  out[id] = { kern: lines.join('\n'), ev, from: cfg.from };
}
const js = `// 自动生成（tools/make-harmony.js）：按上传的原谱逐小节转写的依据 + 新造谱（左手低音 + 右手和声，不含旋律）
const HARMONY = ${JSON.stringify(out)};
if (typeof SONGS !== 'undefined') Object.entries(HARMONY).forEach(([id, h]) => { const s = SONGS.find(x => x.id === id); if (!s) return; s.ev = h.ev; s.orig = Object.assign({}, s.orig, { score: { kern: h.kern, measures: '', credit: '新造谱：左手是按' + h.from + '逐音转写的原谱左手；右手是按每小节的和弦配的柱式和弦（不是原谱右手，没有旋律）。小节号和原谱一一对应。', made: 1 } }); });
`;
fs.writeFileSync(path.join(__dirname, '..', 'harmony.js'), js);
console.log(Object.entries(out).map(([k, v]) => k + ': ' + Object.keys(v.ev).length + ' bars, kern ' + v.kern.length + ' chars').join('\n'));
