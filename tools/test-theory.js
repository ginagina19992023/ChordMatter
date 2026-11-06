// 乐理引擎单元测试（不需要浏览器）：node tools/test-theory.js
const T = require('../theory.js');
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; const g = JSON.stringify(got), w = JSON.stringify(want); if (g !== w) { fail++; console.log('✗', name, '得到', g, '应为', w); } };
const notes = s => T.parseChord(s).notes.map(x => x.name).join(' ');
const mids = s => T.voicing(T.parseChord(s)).map(x => x.midi);

// 拼写：按字母拼，不会把 F# 小三写成 F# A Db
eq('F#m 拼写', notes('F#m'), 'F# A C#');
eq('Bb7 拼写', notes('Bb7'), 'Bb D F Ab');
eq('Ebm7b5 拼写', notes('Ebm7b5'), 'Eb Gb Bbb Db');
eq('C/E 低音', T.parseChord('C/E').inv, 1);

// 级数与功能
const an = (s, k) => { const a = T.analyze(s, k); return [a.numeral, a.func, a.kind]; };
eq('G7/D 在 C', an('G7/D', 'C'), ['V⁴₃', 'D', 'dia']);
eq('E7 在 Am', an('E7', 'Am'), ['V⁷', 'D', 'dia']);
eq('D7 在 C = V7/V', an('D7', 'C')[0], 'V⁷/V');
eq('Fm 在 C = 借用 iv', an('Fm', 'C').slice(0, 1).concat(an('Fm', 'C')[2]), ['iv', 'bor']);
eq('C7 → Dm 在 F：C7 是 V7', an('C7', 'F')[0], 'V⁷');

// 转位：原位根音固定，转位只把下面的音搬上去（谱面保持一致）
eq('C 原位', mids('C'), [60, 64, 67]);
eq('C 一转', mids('C/E'), [64, 67, 72]);
eq('C 二转', mids('C/G'), [67, 72, 76]);
eq('A 二转仍是同一组音往上', mids('A/E'), [76, 81, 85]);
['C', 'D', 'Eb', 'F#', 'G', 'A', 'Bb'].forEach(r => {
  const c = T.parseChord(r), b0 = mids(r);
  [1, 2].forEach(inv => { const v = mids(r + '/' + c.notes[inv].name); eq(r + ' 转位' + inv + ' 只动最下面的音', v.filter(m => !b0.includes(m)).length, inv); });
});

// 终止式
const cad = (a, b, k) => T.cadence(T.analyze(a, k), T.analyze(b, k));
eq('正格', cad('G7', 'C', 'C'), '正格终止 V→I');
eq('阻碍', cad('G7', 'Am', 'C'), '阻碍终止 V→vi');
eq('半终止', cad('Dm', 'G', 'C'), '半终止 →V');

// 进行模板
const tpl = (cs, k) => T.findTemplates(cs.map(c => T.analyze(c, k))).map(t => t.name);
eq('4536', tpl(['F', 'G', 'Em', 'Am'], 'C'), ['4536 进行（王道）']);
eq('卡农', tpl(['D', 'A', 'Bm', 'F#m', 'G', 'D', 'G', 'A'], 'D'), ['卡农进行']);

console.log(fail ? `✗ ${fail}/${n} 失败` : `✓ 乐理引擎 ${n} 项全部通过`);
process.exit(fail ? 1 : 0);
