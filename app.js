/* 和弦 · 极简和弦学习器 */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const D = T.disp;
  const rand = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const uniq = a => [...new Set(a)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dayNum = s => Math.round(new Date(s + 'T12:00:00').getTime() / 864e5);

  // ---------------- 存储 ----------------
  const KEY = 'hexian.v1';
  const DEF = { xp: 0, days: {}, units: {}, arp: {}, songs: {}, custom: [], seen: {} };
  let S;
  try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = Object.assign({}, DEF); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const day = () => (S.days[today()] = S.days[today()] || { warm: 0, learn: 0, quiz: 0, song: 0, clean: 0 });
  const unitState = id => (S.units[id] = S.units[id] || { hist: [], done: false });
  const STEPS = ['warm', 'learn', 'quiz', 'song'];
  const dayComplete = d => d && STEPS.every(k => d[k]);
  function streak() {
    let n = 0, t = dayNum(today());
    const done = new Set(Object.keys(S.days).filter(k => dayComplete(S.days[k])).map(dayNum));
    if (!done.has(t)) t--;
    while (done.has(t)) { n++; t--; }
    return n;
  }
  function completeStep(k) {
    const d = day();
    if (d[k]) return;
    d[k] = 1; S.xp += 20; save();
    if (dayComplete(d)) toast('今日完成 · 连续 ' + streak() + ' 天');
  }

  // ---------------- 音频 ----------------
  const A = {
    ctx: null,
    init() {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        this.ctx = new C();
        this.out = this.ctx.createDynamicsCompressor();
        this.vol = this.ctx.createGain(); this.vol.gain.value = 0.9;
        this.out.connect(this.vol).connect(this.ctx.destination);
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
    },
    note(midi, t = 0, dur = 1.8, vel = 0.7) {
      this.init();
      const c = this.ctx, st = c.currentTime + 0.02 + t, f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain(), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(9000, f * 8), st); lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), st + dur);
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(vel * 0.32, st + 0.006);
      g.gain.exponentialRampToValueAtTime(vel * 0.1, st + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, st + dur);
      [['triangle', 1, 1], ['sine', 2, 0.35], ['sine', 3, 0.08]].forEach(([type, m, a]) => {
        const o = c.createOscillator(), og = c.createGain();
        o.type = type; o.frequency.value = f * m; og.gain.value = a;
        o.connect(og).connect(lp); o.start(st); o.stop(st + dur + 0.05);
      });
      lp.connect(g).connect(this.out);
    },
    chord(midis, t = 0, spread = 0, dur) { midis.forEach((m, i) => this.note(m, t + i * spread, dur)); },
    click(t, accent) {
      this.init();
      const c = this.ctx, st = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = accent ? 1760 : 1180; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, st + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
      o.connect(g).connect(this.out); o.start(st); o.stop(st + 0.06);
    },
  };
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let metro = null;
  function stopAll() { timers.forEach(clearTimeout); timers = []; if (metro) { clearInterval(metro.id); metro = null; } document.querySelectorAll('.k.on-play,.bar.on-play').forEach(e => e.classList.remove('on-play')); }
  function startMetro(bpm, onBeat) {
    A.init(); stopMetro();
    const spb = 60 / bpm; let next = A.ctx.currentTime + 0.1, beat = 0;
    metro = { id: setInterval(() => {
      while (next < A.ctx.currentTime + 0.12) { A.click(next - A.ctx.currentTime, beat % 4 === 0); const b = beat; later(() => onBeat && onBeat(b), (next - A.ctx.currentTime) * 1000); next += spb; beat++; }
    }, 25) };
  }
  function stopMetro() { if (metro) { clearInterval(metro.id); metro = null; } }

  // ---------------- 键盘 SVG ----------------
  const BLACK = [1, 3, 6, 8, 10];
  const WIDX = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  function kb(notes, o = {}) {
    const ms = notes.map(n => n.midi);
    let lo = Math.floor((Math.min(...ms, o.lo || 999) ) / 12) * 12, hi = Math.ceil((Math.max(...ms, o.hi || 0) + 1) / 12) * 12 - 1;
    if (!ms.length) { lo = 60; hi = 83; }
    if (hi - lo < 23) hi = lo + 23;
    if (o.trim) { // 裁剪到 E/F/B/C 边界，保持紧凑
      const mn = Math.min(...ms), mx = Math.max(...ms);
      if (mn - lo >= 5) lo += 5; if (hi - mx >= 7 && (hi - lo) > 23) hi -= 7;
    }
    const W = 22, H = 92, BW = 13, BH = 58;
    const map = {}; notes.forEach(n => (map[n.midi] = n));
    let whites = [], blacks = [], x = 0;
    const xs = {};
    for (let m = lo; m <= hi; m++) { const pc = m % 12; if (!BLACK.includes(pc)) { xs[m] = x; x += W; } }
    for (let m = lo; m <= hi; m++) {
      const pc = m % 12, n = map[m];
      if (!BLACK.includes(pc)) {
        whites.push(`<g><rect class="k w${n ? ' on' : ''}${n && n.dim ? ' dim' : ''}" data-m="${m}" x="${xs[m] + 0.5}" y="0.5" width="${W - 1}" height="${H}" rx="2"/>` +
          (n && n.f ? `<text class="fn" x="${xs[m] + W / 2}" y="${H - 9}">${n.f}</text>` : '') +
          (pc === 0 && !n ? `<text class="cl" x="${xs[m] + W / 2}" y="${H - 8}">C${m / 12 - 1}</text>` : '') + '</g>');
      } else {
        const bx = xs[m - 1] + W - BW / 2;
        blacks.push(`<g><rect class="k b${n ? ' on' : ''}${n && n.dim ? ' dim' : ''}" data-m="${m}" x="${bx}" y="0.5" width="${BW}" height="${BH}" rx="1.5"/>` +
          (n && n.f ? `<text class="fn fb" x="${bx + BW / 2}" y="${BH - 8}">${n.f}</text>` : '') + '</g>');
      }
    }
    return `<svg class="kb" viewBox="0 0 ${x + 1} ${H + 2}" preserveAspectRatio="xMidYMid meet">${whites.join('')}${blacks.join('')}</svg>`;
  }

  // ---------------- 通用 UI ----------------
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const chordMidis = sym => T.voicing(T.parseChord(sym)).map(n => n.midi);
  function playChord(sym, arp = false) { A.init(); const m = chordMidis(sym); arp ? A.chord(m, 0, 0.12) : A.chord(m, 0, 0.012); }
  const funcTag = f => (f ? `<span class="fx fx-${f}">${f}</span>` : '<span class="fx fx-X">·</span>');

  function chordCard(sym, key) {
    const c = T.parseChord(sym); if (!c) return '';
    const v = T.voicing(c);
    const a = key ? T.analyze(sym, key) : null;
    return `<div class="ccard" data-act="play" data-s="${esc(sym)}">
      <div class="ccard-h"><b>${D(sym)}</b><span>${c.quality.zh}${c.inv > 0 ? ' · ' + ['', '第一', '第二', '第三'][c.inv] + '转位' : ''}</span>${a ? '<i>' + a.numeral + '</i>' : ''}<em>▶</em></div>
      ${kb(v.map(n => ({ midi: n.midi, f: D(n.name) })), { trim: true })}
    </div>`;
  }
  function progRow(key, chords) {
    return `<div class="prog" data-act="prog" data-k="${esc(key)}" data-c="${esc(chords.join(','))}">
      ${chords.map((s, i) => { const a = T.analyze(s, key); return `<div class="pc" data-i="${i}"><b>${D(s)}</b><i>${a ? a.numeral : '?'}</i>${funcTag(a && a.func)}</div>`; }).join('')}
      <em>▶</em></div>`;
  }
  function playProg(el, key, chords, bpm = 80, beats = 2) {
    stopAll(); A.init();
    const spc = (60 / bpm) * beats;
    chords.forEach((s, i) => {
      const m = chordMidis(s);
      const p = T.parseChord(s);
      const bass = (p.bass ? p.bass.pc : p.root.pc) + 36;
      A.note(bass, i * spc, spc * 1.1, 0.6);
      A.chord(m, i * spc, 0.01, spc * 1.1);
      later(() => { el.querySelectorAll('[data-i]').forEach(e => e.classList.toggle('on-play', +e.dataset.i === i)); }, i * spc * 1000);
    });
    later(() => el.querySelectorAll('[data-i]').forEach(e => e.classList.remove('on-play')), chords.length * spc * 1000);
  }

  // ---------------- 课程逻辑 ----------------
  const currentUnit = () => UNITS.find(u => !unitState(u.id).done) || UNITS[UNITS.length - 1];
  const unitIdx = u => UNITS.indexOf(u);
  const unlocked = u => unitIdx(u) <= unitIdx(currentUnit());
  function mastery(id) {
    const h = unitState(id).hist;
    if (!h.length) return 0;
    const acc = h.reduce((a, b) => a + b, 0) / h.length;
    return Math.round(acc * Math.min(1, h.length / 10) * 100);
  }
  function record(unitId, ok) {
    const u = unitState(unitId);
    u.hist.push(ok ? 1 : 0); if (u.hist.length > 12) u.hist.shift();
    if (ok) S.xp += 10;
    if (!u.done && u.hist.length >= 10 && u.hist.reduce((a, b) => a + b, 0) / u.hist.length >= 0.8) {
      u.done = true; const nx = currentUnit();
      later(() => toast('掌握「' + UNITS.find(x => x.id === unitId).title + '」· 解锁 ' + nx.n + ' ' + nx.title), 400);
    }
    save();
  }

  // ---------------- 题目生成器 ----------------
  const MAJ_KEYS = ['C', 'G', 'D', 'A', 'F', 'Bb', 'Eb', 'E'];
  const MIN_KEYS = ['Am', 'Em', 'Dm', 'Bm', 'Gm', 'Cm'];
  const ROOT_MAJ = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const ROOT_MIN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const kz = k => T.parseKey(k).zh;
  const vnotes = (sym, labels = true) => T.voicing(T.parseChord(sym)).map(n => ({ midi: n.midi, f: labels ? D(n.name) : '' }));
  const opts = (ans, pool, n = 4) => shuffle(uniq([ans, ...shuffle(pool.filter(x => x !== ans))]).slice(0, n));

  const GEN = {
    u1() {
      const r = T.parseNote(rand(WHITE));
      const se = rand([3, 4, 5, 7, 3, 4, 2, 12]);
      const [name, st] = T.INTERVALS[se];
      const n2 = T.noteAt(r.li + st, r.pc + se);
      const m1 = 60 + r.pc, m2 = m1 + se;
      const ear = Math.random() < 0.3;
      return {
        q: ear ? '听：这是什么音程？' : '这两个音是什么音程？',
        kb: ear ? null : [{ midi: m1, f: D(r.name) }, { midi: m2, f: D(n2.name) }],
        play: [[m1], [m2], [m1, m2]], auto: ear,
        options: opts(name, ['小三度', '大三度', '纯四度', '纯五度', '大二度', '纯八度']),
        answer: name,
        why: `${D(r.name)} → ${D(n2.name)}：跨 ${st + 1} 个字母（${st + 1} 度），含 ${se} 个半音 → ${name}。`,
        after: [{ midi: m1, f: D(r.name) }, { midi: m2, f: D(n2.name) }],
      };
    },
    u2() {
      const minor = Math.random() < 0.5, root = rand(minor ? ROOT_MIN : ROOT_MAJ), q = minor ? 'm' : '';
      const sym = root + q, c = T.parseChord(sym);
      if (Math.random() < 0.4) {
        const right = c.notes.map(n => D(n.name)).join(' ');
        const alt = T.parseChord(root + (minor ? '' : 'm')).notes.map(n => D(n.name)).join(' ');
        const w2 = [D(c.notes[0].name), D(c.notes[1].name), D(T.noteAt(c.notes[2].li, c.notes[2].pc + 1).name)].join(' ');
        const w3 = [D(c.notes[0].name), D(T.noteAt(c.notes[1].li, c.notes[1].pc + (minor ? -1 : 1)).name), D(c.notes[2].name)].join(' ');
        return { q: `${D(sym)} 由哪三个音组成？`, play: [chordMidis(sym)], options: opts(right, [alt, w2, w3]), answer: right, why: `${D(sym)}：${c.quality.f}。`, after: vnotes(sym) };
      }
      const other = root + (minor ? '' : 'm');
      const rel = minor ? T.noteAt(c.root.li + 2, c.root.pc + 3).name : T.noteAt(c.root.li + 5, c.root.pc + 9).name + 'm';
      const nb = T.noteAt(c.root.li + 1, c.root.pc + 2).name + q;
      return { q: '键盘上是什么和弦？', kb: vnotes(sym, false), play: [chordMidis(sym)], options: opts(D(sym), [D(other), D(rel), D(nb)]), answer: D(sym),
        why: `根音 ${D(c.root.name)}，到三音 ${D(c.notes[1].name)} 是${minor ? '小' : '大'}三度 → ${c.quality.zh}。`, after: vnotes(sym) };
    },
    u3() {
      const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb']);
      const q = rand(['', 'm', 'dim', 'aug']), sym = root + q, c = T.parseChord(sym);
      const ear = Math.random() < 0.6;
      return { q: ear ? '听：这是哪种三和弦？' : '键盘上是哪种三和弦？', kb: ear ? null : vnotes(sym), auto: ear, play: [chordMidis(sym), 'arp'],
        options: ['大三和弦', '小三和弦', '减三和弦', '增三和弦'], answer: c.quality.zh, why: `${D(sym)}：${c.quality.f}。大=亮 小=暗 减=紧 增=飘。`, after: vnotes(sym) };
    },
    u4() {
      const minor = Math.random() < 0.5, root = rand(minor ? ROOT_MIN : ROOT_MAJ);
      const inv = Math.floor(Math.random() * 3), c = T.build(root, minor ? 'm' : '', inv);
      const names = ['原位', '第一转位 ⁶', '第二转位 ⁶₄'];
      if (Math.random() < 0.3) {
        const RH = ['1-3-5', '1-2-5', '1-3-5'];
        return { q: `右手弹 ${D(c.sym)}（${names[inv]}），通用指法是？`, kb: vnotes(c.sym), play: [chordMidis(c.sym)], options: inv === 1 ? ['1-2-5', '1-3-5', '1-2-4'] : ['1-3-5', '1-2-5', '1-2-4'],
          answer: RH[inv], why: '哪两个音之间是四度，就在那里留出更大的手指间隔。', after: T.voicing(c).map((n, i) => ({ midi: n.midi, f: T.blockFingers(c, 'R')[i] })) };
      }
      const low = T.voicing(c)[0];
      return { q: '这是什么转位？', kb: vnotes(c.sym), play: [chordMidis(c.sym)], options: names, answer: names[inv],
        why: `最低音是 ${D(low.name)}，是${['根音', '三音', '五音'][inv]} → ${names[inv]}。`, after: vnotes(c.sym) };
    },
    u5() {
      const k = T.parseKey(rand(MAJ_KEYS)), d = Math.floor(Math.random() * 7);
      const all = [0, 1, 2, 3, 4, 5, 6].map(i => T.degreeChord(k, i));
      const romans = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
      if (Math.random() < 0.5) return { q: `${k.zh}的 ${romans[d]} 级和弦是？`, play: [chordMidis(all[d])], options: opts(D(all[d]), all.map(D)), answer: D(all[d]), why: `${k.zh}：${all.map((s, i) => romans[i] + ' ' + D(s)).join('  ')}`, after: vnotes(all[d]) };
      return { q: `在${k.zh}中，${D(all[d])} 是几级？`, play: [chordMidis(all[d])], options: opts(romans[d], romans), answer: romans[d], why: `大调性质顺序：大 小 小 大 大 小 减。${D(all[d])} 是第 ${d + 1} 级。`, after: vnotes(all[d]) };
    },
    u6() {
      const k = T.parseKey(rand(MAJ_KEYS)), d = rand([0, 1, 3, 4, 5, 6, 0, 3, 4]);
      const s = T.degreeChord(k, d), a = T.analyze(s, k);
      const F = { T: '主功能 T', S: '下属功能 S', D: '属功能 D' };
      return { q: `${k.zh}中，${D(s)}（${a.numeral}）的功能是？`, play: [chordMidis(s)], options: Object.values(F), answer: F[a.func], why: 'T：I vi（iii）· S：IV ii · D：V vii°', after: vnotes(s) };
    },
    u7() {
      const k = T.parseKey(rand(MAJ_KEYS));
      const dc = (i, s7) => T.degreeChord(k, i, s7);
      const types = [['正格终止', [dc(4, Math.random() < 0.5), dc(0)]], ['变格终止', [dc(3), dc(0)]], ['半终止', [rand([dc(0), dc(3), dc(1)]), dc(4)]], ['阻碍终止', [dc(4, true), dc(5)]]];
      const [ans, pair] = rand(types);
      const nums = pair.map(s => T.analyze(s, k).numeral).join(' → ');
      return { q: `${k.zh}：${pair.map(D).join(' → ')} 是什么终止？`, play: [chordMidis(pair[0]), chordMidis(pair[1])], auto: true, options: ['正格终止', '变格终止', '半终止', '阻碍终止'], answer: ans, why: `${nums}。正格 V→I · 变格 IV→I · 半终止 →V · 阻碍 V→vi`, after: vnotes(pair[1]) };
    },
    u8() {
      const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb', 'B']);
      const q = rand(['maj7', '7', 'm7', 'm7b5', '7', 'maj7', 'm7', 'dim7']), sym = root + q, c = T.parseChord(sym);
      const ear = Math.random() < 0.3 && ['maj7', '7', 'm7'].includes(q);
      return { q: ear ? '听：哪种七和弦？' : '键盘上是哪种七和弦？', kb: ear ? null : vnotes(sym), auto: ear, play: [chordMidis(sym), 'arp'],
        options: ear ? ['大七和弦', '属七和弦', '小七和弦'] : opts(c.quality.zh, ['大七和弦', '属七和弦', '小七和弦', '半减七和弦', '减七和弦']), answer: c.quality.zh, why: `${D(sym)}：${c.quality.f}。`, after: vnotes(sym) };
    },
    u9() {
      const k = T.parseKey(rand(MIN_KEYS)), t = Math.random();
      const v7 = T.degreeChord(k, 4, true), lt = T.scale(k, true)[6];
      if (t < 0.4) {
        const nat = T.scale(k)[4].name + 'm7';
        return { q: `${k.zh}（和声小调）的属七和弦是？`, play: [chordMidis(v7), chordMidis(k.tonic.name + 'm')], options: opts(D(v7), [D(nat), D(T.scale(k)[6].name + '7'), D(T.scale(k)[3].name + 'm7')]), answer: D(v7), why: `升高第七级得到导音 ${D(lt.name)}，V7 = ${D(v7)}。`, after: vnotes(v7) };
      }
      if (t < 0.7) return { q: `${k.zh}里，${D(v7)} 中的 ${D(lt.name)} 从哪来？`, options: ['和声小调升高第七级（导音）', '借用了同主音大调的主和弦', '转调到了关系大调'], answer: '和声小调升高第七级（导音）', why: `${D(lt.name)} 离主音 ${D(k.tonic.name)} 只差半音，强烈地想上行解决。`, play: [chordMidis(v7), chordMidis(k.tonic.name + 'm')], after: vnotes(v7) };
      const d = rand([0, 3, 4]), s = T.degreeChord(k, d), lab = ['i', '', '', 'iv', 'V'][d];
      return { q: `${k.zh}的 ${lab} 级和弦是？`, play: [chordMidis(s)], options: opts(D(s), [0, 2, 3, 4, 5].map(i => D(T.degreeChord(k, i))).concat(D(T.scale(k)[4].name + 'm'))), answer: D(s), why: '小调：i 小，iv 小，V 大（和声小调）。', after: vnotes(s) };
    },
    u10() {
      const k = T.parseKey(rand(['C', 'G', 'D', 'F', 'A']));
      const tp = rand(T.TEMPLATES.slice(0, 5));
      const chords = tp.seq.map(d => T.degreeChord(k, d));
      if (Math.random() < 0.5) return { q: `${k.zh}：${chords.map(D).join(' – ')}，这是什么进行？`, play: chords.map(chordMidis), auto: false, options: opts(tp.name, T.TEMPLATES.slice(0, 5).map(t => t.name)), answer: tp.name, why: `${tp.name} = ${tp.nums}` };
      const right = chords.map(D).join(' '), sh = chords.slice();
      const w1 = sh.slice().reverse().map(D).join(' '), w2 = tp.seq.map(d => T.degreeChord(k, (d + 1) % 7)).map(D).join(' ');
      const w3 = T.TEMPLATES[(T.TEMPLATES.indexOf(tp) + 1) % 5].seq.map(d => D(T.degreeChord(k, d))).join(' ');
      return { q: `${tp.nums} 在${k.zh}是？`, play: chords.map(chordMidis), options: opts(right, [w1, w2, w3]), answer: right, why: `${tp.name}：${tp.nums}` };
    },
    u11() {
      const k = T.parseKey(rand(['C', 'G', 'D', 'F'])), td = rand([1, 2, 3, 4, 5]);
      const t = T.scale(k)[td], sec = T.noteAt(t.li + 4, t.pc + 7).name + '7';
      const a = T.analyze(sec, k);
      const pool = [1, 2, 3, 4, 5].map(d => 'V⁷/' + ['I', 'ii', 'iii', 'IV', 'V', 'vi'][d]);
      return { q: `${k.zh}中出现 ${D(sec)}，它是？`, play: [chordMidis(sec), chordMidis(T.degreeChord(k, td))], options: opts(a.numeral, pool.concat(['借用和弦'])), answer: a.numeral, why: `${D(sec)} 的根音向下五度是 ${D(t.name)}，所以它是 ${D(T.degreeChord(k, td))} 的属和弦 → ${a.numeral}。`, after: vnotes(sec) };
    },
    u12() {
      const k = T.parseKey(rand(['C', 'G', 'D', 'F'])), tc = k.tonic;
      const B = [['iv', 3, 5, 'm'], ['♭VI', 5, 8, ''], ['♭VII', 6, 10, ''], ['♭III', 2, 3, '']];
      const [num, st, se, q] = rand(B);
      const sym = T.noteAt(tc.li + st, tc.pc + se).name + q;
      return { q: `${k.zh}中出现 ${D(sym)}，它是？`, play: [chordMidis(sym), chordMidis(tc.name)], options: opts(num, B.map(b => b[0]).concat(['V/V'])), answer: num, why: `${D(sym)} 来自同主音小调（${D(tc.name)}小调），在${k.zh}里是借用和弦 ${num}。`, after: vnotes(sym) };
    },
  };

  function buildQuiz(unitId) {
    const qs = [];
    if (unitId) { for (let i = 0; i < 8; i++) qs.push(unitId); }
    else {
      const cur = currentUnit(), done = UNITS.filter(u => unitState(u.id).done && u !== cur);
      // 复习：掌握度低的单元权重更高
      const weighted = [];
      done.forEach(u => { const w = 1 + Math.round((100 - mastery(u.id)) / 20); for (let i = 0; i < w; i++) weighted.push(u.id); });
      for (let i = 0; i < 8; i++) qs.push(weighted.length && i % 3 === 2 ? rand(weighted) : cur.id);
    }
    return qs.map(id => Object.assign(GEN[id](), { unit: id }));
  }

  // ---------------- 视图 ----------------
  const view = $('#view');
  let route = [];
  function go(h) { location.hash = h; }
  function render() {
    stopAll();
    route = (location.hash.replace(/^#\/?/, '') || 'today').split(/[-\/]/).map(decodeURIComponent);
    const r = route[0];
    document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.r === r || (r === 'song' && a.dataset.r === 'songs') || (r === 'unit' && a.dataset.r === 'path')));
    document.body.classList.toggle('focus', ['quiz', 'arp', 'mem'].includes(r));
    ({ today: vToday, path: vPath, unit: vUnit, chords: vChords, songs: vSongs, song: vSong, edit: vEdit, quiz: vQuiz, arp: vArp, mem: vMem, me: vMe }[r] || vToday)();
    window.scrollTo(0, 0);
  }

  function vToday() {
    const d = day(), cur = currentUnit(), song = todaysSong(), arp = todaysArp();
    const n = STEPS.filter(k => d[k]).length;
    const C = 2 * Math.PI * 34;
    const steps = [
      ['warm', '热身', `${D(arp)} 琶音 · 慢速干净 3 次`, `#arp-${arp}-today`],
      ['learn', '学', `${cur.n} · ${cur.title}`, `#unit-${cur.id}-today`],
      ['quiz', '练', '8 题 · 新知 + 自动复习', '#quiz-today'],
      ['song', '用', `${song.title.split(' ')[0]} · 背谱第 ${(S.songs[song.id] || { level: 0 }).level + 1} 层`, `#mem-${song.id}-today`],
    ];
    view.innerHTML = `
      <header class="top"><div><small>${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</small><h1>今天</h1></div>
        <a class="stat" href="#me"><b>${streak()}</b><small>连续天</small></a><a class="stat" href="#me"><b>${S.xp}</b><small>XP</small></a></header>
      <section class="ring-wrap">
        <svg viewBox="0 0 80 80" class="ring"><circle cx="40" cy="40" r="34"/><circle class="p" cx="40" cy="40" r="34" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - n / 4)}"/></svg>
        <div class="ring-t"><b>${n}/4</b><small>${n === 4 ? '完成' : '约 12 分钟'}</small></div>
      </section>
      <ol class="steps">${steps.map(([k, t, s, h], i) => `<li><a href="${h}" class="${d[k] ? 'done' : ''}"><span class="dot">${d[k] ? '✓' : i + 1}</span><span><b>${t}</b><small>${esc(s)}</small></span><span class="arr">→</span></a></li>`).join('')}</ol>
      <a class="unitbar" href="#unit-${cur.id}"><small>当前单元</small><b>${cur.n} ${cur.title}</b><span class="meter"><i style="width:${mastery(cur.id)}%"></i></span><small>${mastery(cur.id)}% · 达到 80% 自动解锁下一单元</small></a>`;
  }
  function todaysSong() {
    const cur = currentUnit();
    const all = allSongs().filter(s => s.sections.length);
    const linked = all.find(s => s.id === cur.song);
    const notMastered = all.filter(s => (S.songs[s.id] || { level: 0 }).level < 4);
    const pick = linked && (S.songs[linked.id] || { level: 0 }).level < 4 ? linked : notMastered[dayNum(today()) % Math.max(1, notMastered.length)] || all[0];
    return pick;
  }
  function todaysArp() {
    const pool = ['C', 'G', 'F', 'Am', 'D', 'Em', 'A', 'Dm', 'E'];
    // 优先：今日曲目里出现的白键根音三和弦
    const song = todaysSong();
    const inSong = uniq(song.sections.flatMap(s => parseBars(s.bars).flat()).map(s => { const c = T.parseChord(s); return c ? c.root.name + (c.quality.fam === 'm' ? 'm' : '') : null; })).filter(s => pool.includes(s));
    const list = inSong.length ? inSong : pool;
    return list[dayNum(today()) % list.length];
  }

  function vPath() {
    const cur = currentUnit();
    view.innerHTML = `<header class="top"><div><small>12 个单元 · 由浅入深</small><h1>路径</h1></div></header>
      <ol class="path">${UNITS.map(u => {
        const st = unitState(u.id).done ? 'done' : u === cur ? 'cur' : unlocked(u) ? '' : 'lock';
        return `<li class="${st}"><a href="${st === 'lock' ? '#path' : '#unit-' + u.id}"><span class="node">${st === 'done' ? '✓' : u.n}</span><span><b>${u.title}</b><small>${u.en}${st === 'lock' ? ' · 未解锁' : ' · ' + mastery(u.id) + '%'}</small></span></a></li>`;
      }).join('')}</ol>
      <p class="fine">规则：单元最近 10 题以上、正确率 ≥ 80% 即掌握，自动解锁下一单元。已掌握的单元会在每日练习里按薄弱程度自动复习。</p>`;
  }

  function renderBlocks(blocks, key = 'C') {
    return blocks.map(b => {
      if (b.t === 'p') return `<p>${b.x}</p>`;
      if (b.t === 'tip') return `<p class="tip">${b.x}</p>`;
      if (b.t === 'chord') return chordCard(b.s);
      if (b.t === 'prog') return progRow(b.k, b.c);
      if (b.t === 'table') return `<table>${b.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
      return '';
    }).join('');
  }
  function vUnit() {
    const u = UNITS.find(x => x.id === route[1]) || currentUnit();
    const fromToday = route[2] === 'today';
    const song = allSongs().find(s => s.id === u.song);
    view.innerHTML = `<header class="top"><div><a class="back" href="${fromToday ? '#today' : '#path'}">←</a><small>单元 ${u.n} · ${u.en}</small><h1>${u.title}</h1></div></header>
      <article class="lesson">${renderBlocks(u.blocks)}</article>
      ${song ? `<a class="link" href="#song-${song.id}"><small>联系曲目</small><b>${song.title}</b><span>→</span></a>` : ''}
      <div class="cta"><button class="btn" data-act="lesson-done" data-u="${u.id}">${fromToday ? '懂了，去练习' : '练这个单元 8 题'}</button></div>`;
  }

  // ---- 测验 ----
  let Z = null;
  function vQuiz() {
    const unit = route[1] === 'today' ? null : route[1];
    Z = { list: buildQuiz(unit), i: 0, right: 0, wrongs: 0, unit, answered: false, retry: new Set() };
    quizStep();
  }
  function quizStep() {
    if (Z.i >= Z.list.length) return quizEnd();
    const q = Z.list[Z.i];
    Z.answered = false;
    const pct = (Z.i / Z.list.length) * 100;
    view.innerHTML = `<div class="qbar"><a href="#today" class="x">×</a><span class="meter"><i style="width:${pct}%"></i></span><small>${Z.i + 1}/${Z.list.length}</small></div>
      <section class="quiz">
        <h2>${q.q}</h2>
        <div class="qkb">${q.kb ? kb(q.kb, { trim: true }) : q.play ? '<button class="big-play" data-act="qplay">▶</button>' : ''}</div>
        ${q.kb && q.play ? '<button class="ghost sm" data-act="qplay">▶ 听一下</button>' : ''}
        <div class="opts">${q.options.map(o => `<button class="opt" data-act="ans" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <div class="fb" id="fb"></div>
      </section>`;
    if (q.auto) later(() => qplay(q), 250);
  }
  function qplay(q) {
    stopAll(); A.init();
    let t = 0;
    q.play.forEach(p => {
      if (p === 'arp') { const m = q.play[0]; A.chord(m, t, 0.18, 1.2); t += 1.2; return; }
      A.chord(p, t, 0.012, 1.1); t += 0.85;
    });
  }
  function answer(v) {
    if (Z.answered) return;
    Z.answered = true;
    const q = Z.list[Z.i], ok = v === q.answer;
    const first = !Z.retry.has(Z.i);
    if (first) record(q.unit, ok);
    if (ok && first) Z.right++;
    if (!ok) { Z.wrongs++; if (first) { const again = Object.assign(GEN[q.unit](), { unit: q.unit }); Z.list.push(again); Z.retry.add(Z.list.length - 1); } }
    document.querySelectorAll('.opt').forEach(b => { if (b.dataset.v === q.answer) b.classList.add('right'); else if (b.dataset.v === v) b.classList.add('wrong'); b.disabled = true; });
    if (q.after) $('.qkb').innerHTML = kb(q.after, { trim: true });
    $('#fb').innerHTML = `<p class="${ok ? 'ok' : 'no'}">${ok ? '正确' : '再想想 · 稍后会再出一道类似的题'}</p><p class="why">${q.why}</p><button class="btn" data-act="next">继续</button>`;
    if (ok) A.init(), q.play && A.chord(Array.isArray(q.play[q.play.length - 1]) ? q.play[q.play.length - 1] : q.play[0], 0, 0.01, 0.9);
  }
  function quizEnd() {
    const base = Z.list.length - Z.retry.size;
    if (!Z.unit) completeStep('quiz');
    else S.xp += 10, save();
    const cur = currentUnit();
    view.innerHTML = `<section class="end"><h1>${Z.right}/${base}</h1><p>${Z.right / base >= 0.8 ? '很稳。' : '错的题已经重做过一遍，明天会继续复习。'}</p>
      <p class="fine">当前单元「${cur.title}」掌握度 ${mastery(cur.id)}%</p>
      <div class="cta"><a class="btn" href="#today">回到今天</a><a class="ghost" href="#quiz-${Z.unit || 'today'}">再来 8 题</a></div></section>`;
  }

  // ---- 和弦库 ----
  const CX = { root: 'C', q: '', inv: 0, hand: 'R' };
  function vChords() {
    const c = T.build(CX.root, CX.q, Math.min(CX.inv, T.Q[CX.q].ints.length - 1));
    const v = T.voicing(c), fg = T.blockFingers(c, CX.hand);
    const inSongs = allSongs().filter(s => s.sections.some(sec => parseBars(sec.bars).flat().some(x => { const p = T.parseChord(x); return p && p.root.pc === c.root.pc && p.q === c.q; })));
    const arp = T.arpeggio(T.parseChord(CX.root + CX.q), 'R');
    const qlist = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'sus4'];
    view.innerHTML = `<header class="top"><div><small>选根音、性质和转位</small><h1>和弦</h1></div></header>
      <div class="chips">${ROOT_MAJ.map(r => `<button class="chip${r === CX.root ? ' on' : ''}" data-act="cx" data-k="root" data-v="${r}">${D(r)}</button>`).join('')}</div>
      <div class="chips">${qlist.map(q => `<button class="chip${q === CX.q ? ' on' : ''}" data-act="cx" data-k="q" data-v="${q}">${q === '' ? '大' : q === 'm' ? '小' : D(q)}</button>`).join('')}</div>
      <div class="chips">${c.notes.map((_, i) => `<button class="chip${i === Math.max(0, c.inv) ? ' on' : ''}" data-act="cx" data-k="inv" data-v="${i}">${['原位', '一转', '二转', '三转'][i]}</button>`).join('')}
        <span class="sp"></span><button class="chip${CX.hand === 'R' ? ' on' : ''}" data-act="cx" data-k="hand" data-v="R">右手</button><button class="chip${CX.hand === 'L' ? ' on' : ''}" data-act="cx" data-k="hand" data-v="L">左手</button></div>
      <section class="cbig">
        <div class="cbig-h"><b>${D(c.sym)}</b><span>${c.quality.zh} · ${c.quality.en}</span></div>
        ${kb(v.map((n, i) => ({ midi: n.midi, f: fg[i] })), { trim: true })}
        <dl><dt>组成</dt><dd>${c.notes.map(n => D(n.name)).join(' – ')}</dd><dt>结构</dt><dd>${c.quality.f}</dd><dt>${CX.hand === 'R' ? '右手' : '左手'}指法</dt><dd>${fg.join('-')}（低 → 高）</dd></dl>
        <div class="row"><button class="btn" data-act="play" data-s="${esc(c.sym)}">▶ 柱式</button><button class="ghost" data-act="play" data-s="${esc(c.sym)}" data-arp="1">▶ 分解</button>
        ${arp.white && T.Q[CX.q].ints.length === 3 && !CX.q.startsWith('sus') ? `<a class="ghost" href="#arp-${CX.root + CX.q}">琶音练习 →</a>` : ''}</div>
      </section>
      ${inSongs.length ? `<p class="fine">出现在：${inSongs.map(s => `<a href="#song-${s.id}">${s.title}</a>`).join('、')}</p>` : ''}`;
  }

  // ---- 琶音（指法 + 速度阶梯） ----
  let ARP = { hand: 'R' };
  function vArp() {
    const sym = route[1] || 'C', fromToday = route[2] === 'today';
    const c = T.parseChord(sym);
    const a = T.arpeggio(c, ARP.hand);
    const st = (S.arp[sym] = S.arp[sym] || { bpm: 60, clean: 0, miss: 0 });
    const fingers = a.fingers || [];
    const d = day();
    view.innerHTML = `<div class="qbar"><a href="${fromToday ? '#today' : '#chords'}" class="x">×</a><span class="meter"><i style="width:${Math.min(100, (d.clean || 0) / 3 * 100)}%"></i></span><small>${Math.min(3, d.clean || 0)}/3</small></div>
      <section class="arp">
        <h2>${D(sym)} 琶音 · 两个八度</h2>
        <div class="chips"><button class="chip${ARP.hand === 'R' ? ' on' : ''}" data-act="ahand" data-v="R">右手</button><button class="chip${ARP.hand === 'L' ? ' on' : ''}" data-act="ahand" data-v="L">左手</button></div>
        <div id="akb">${kb(a.up.map((n, i) => ({ midi: n.midi, f: fingers[i] || '' })))}</div>
        <p class="fine">${a.fingers ? `上行 ${fingers.join(' ')} · 下行 ${fingers.slice().reverse().join(' ')}` : '黑键根音的琶音指法因调而异，请以谱面为准。'}
        ${ARP.hand === 'L' ? '<br>若三音是黑键（如 D、A、E 大调），有的教材左手用 5-3-2-1。选一种，然后固定下来：固定的指法才能形成肌肉记忆。' : ''}</p>
        <div class="tempo"><button class="ghost sm" data-act="bpm" data-v="-4">−</button><b id="bpm">${st.bpm}</b><small>BPM</small><button class="ghost sm" data-act="bpm" data-v="4">+</button></div>
        <div class="ladder">${[0, 1, 2].map(i => `<i class="${i < st.clean ? 'on' : ''}"></i>`).join('')}<small>连续干净 3 次 → 自动 +4 BPM</small></div>
        <div class="row"><button class="ghost" data-act="ademo" data-s="${esc(sym)}">▶ 示范</button><button class="ghost" data-act="ametro">◷ 节拍器</button></div>
        <div class="row"><button class="btn good" data-act="aclean" data-s="${esc(sym)}">✓ 干净</button><button class="btn bad" data-act="amiss" data-s="${esc(sym)}">✗ 有错</button></div>
        <p class="tip">每拍一个音。弹错一次就退回到慢速：准确比速度重要。拇指穿指时手腕保持水平，眼睛看下一个落点。</p>
      </section>`;
  }
  function arpDemo(sym) {
    stopAll(); A.init();
    const c = T.parseChord(sym), a = T.arpeggio(c, ARP.hand), st = S.arp[sym];
    const seq = a.up.concat(a.up.slice(0, -1).reverse());
    const spb = 60 / st.bpm;
    seq.forEach((n, i) => {
      A.note(n.midi, i * spb, spb * 2, 0.7);
      later(() => { document.querySelectorAll('#akb .k').forEach(k => k.classList.toggle('on-play', +k.dataset.m === n.midi)); }, i * spb * 1000 + 20);
    });
    later(() => document.querySelectorAll('#akb .k').forEach(k => k.classList.remove('on-play')), seq.length * spb * 1000 + 200);
  }

  // ---- 曲库 ----
  function parseBars(str) { return String(str || '').split('|').map(b => b.trim().split(/\s+/).filter(Boolean)).filter(b => b.length); }
  function allSongs() { return SONGS.map(s => Object.assign({}, s, S.custom.find(c => c.id === s.id) || {})).concat(S.custom.filter(c => !SONGS.some(s => s.id === c.id))); }
  function vSongs() {
    const songs = allSongs();
    const drafts = SONG_DRAFTS.filter(d => !songs.some(s => s.title === d.title));
    view.innerHTML = `<header class="top"><div><small>经典与流行 · 和声逻辑 · 背谱</small><h1>曲目</h1></div><a class="stat" href="#edit-new"><b>＋</b><small>添加</small></a></header>
      <ul class="list">${songs.map(s => { const lv = (S.songs[s.id] || { level: 0 }).level; return `<li><a href="#song-${s.id}"><span><b>${esc(s.title)}</b><small>${esc(s.sub || '')} · ${s.key ? kz(s.key) : '未设调'}</small></span><span class="lv">${[0, 1, 2, 3].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</span></a></li>`; }).join('')}
      ${drafts.map(d => `<li class="draft"><a href="#edit-new-${SONG_DRAFTS.indexOf(d)}"><span><b>${esc(d.title)}</b><small>${esc(d.sub)}</small></span><span class="arr">＋</span></a></li>`).join('')}</ul>
      <p class="fine">右边四格 = 背谱的四层：看全谱 → 遮 1/3 → 遮 2/3 → 只看功能。在「编辑」里改成你手上谱的和弦，系统会自动分析级数、功能和终止式。</p>`;
  }
  function songLogic(s) {
    const key = T.parseKey(s.key);
    const out = [];
    const secs = s.sections.map(sec => { const bars = parseBars(sec.bars); const flat = bars.flat(); return { name: sec.name, bars, flat, an: flat.map(x => T.analyze(x, key)) }; });
    out.push(`<b>调性</b> ${key.zh}，主和弦 ${D(key.tonic.name + (key.minor ? 'm' : ''))}`);
    secs.forEach((sc, i) => {
      const cad = sc.an.length > 1 ? T.cadence(sc.an[sc.an.length - 2], sc.an[sc.an.length - 1]) : null;
      const fx = sc.an.map(a => (a && a.func) || '·').join(' ');
      let rep = '';
      for (let j = 0; j < i; j++) { const p = secs[j].flat; let n = 0; while (n < p.length && n < sc.flat.length && p[n] === sc.flat[n]) n++; if (n >= 3) rep = `前 ${n} 个和弦与「${secs[j].name}」相同`; }
      const tp = key.minor ? [] : T.findTemplates(sc.an);
      out.push(`<b>${esc(sc.name)}</b> 功能：${fx}${cad ? ` · 结尾 <u>${cad}</u>` : ''}${rep ? ' · ' + rep : ''}${tp.length ? ' · 含 <u>' + tp.map(t => t.name).join('、') + '</u>' : ''}`);
      const special = sc.an.filter(a => a && a.kind !== 'dia');
      if (special.length) out.push(`<span class="sub">特别和弦：${uniq(special.map(a => `${D(a.c.sym)} = ${a.numeral}（${a.note}）`)).join('；')}</span>`);
      const half = sc.bars.length >= 4 && sc.bars.length % 2 === 0 ? sc.bars.length / 2 : 0;
      if (half) {
        const a1 = sc.bars.slice(0, half).flat().join(' '), a2 = sc.bars.slice(half).flat().join(' ');
        const firstSame = sc.bars[0].join() === sc.bars[half].join();
        if (firstSame && a1 !== a2) out.push(`<span class="sub">结构：前后两半开头相同，只有结尾不同（一问一答）</span>`);
      }
    });
    const bass = secs.flatMap(sc => sc.an.map(a => a ? D(a.c.bass ? a.c.bass.name : a.c.root.name) : '?'));
    out.push(`<b>低音线</b> ${bass.join(' ')}`);
    return out;
  }
  function songGrid(s, hideFn, showFn) {
    const key = s.key;
    let idx = 0;
    return s.sections.map(sec => `<div class="sec"><small>${esc(sec.name)}</small><div class="bars">${parseBars(sec.bars).map(bar => `<div class="bar">${bar.map(sym => {
      const a = T.analyze(sym, key), i = idx++, hid = hideFn ? hideFn(i) : false;
      return `<div class="cell${hid ? ' hid' : ''}" data-i="${i}" data-act="${hid ? 'reveal' : 'play'}" data-s="${esc(sym)}"><b>${hid ? '?' : D(sym)}</b><i>${hid && !(showFn && showFn()) ? '' : a ? a.numeral : '?'}</i>${funcTag(a && a.func)}</div>`;
    }).join('')}</div>`).join('')}</div></div>`).join('');
  }
  function songFlat(s) { return s.sections.flatMap(sec => parseBars(sec.bars).flat()); }
  function vSong() {
    const s = allSongs().find(x => x.id === route[1]);
    if (!s) return go('#songs');
    if (!s.sections.length || !s.key) return go('#edit-' + s.id);
    const lv = (S.songs[s.id] || { level: 0 }).level;
    view.innerHTML = `<header class="top"><div><a class="back" href="#songs">←</a><small>${esc(s.sub || '')}</small><h1>${esc(s.title)}</h1></div><a class="stat" href="#edit-${s.id}"><b>✎</b><small>编辑</small></a></header>
      <section class="logic"><h3>谱面逻辑</h3>${songLogic(s).map(l => `<p>${l}</p>`).join('')}</section>
      <div class="grid" id="grid">${songGrid(s)}</div>
      <div class="row"><button class="ghost" data-act="splay" data-id="${s.id}">▶ 播放进行</button><a class="btn" href="#mem-${s.id}">背谱 · 第 ${Math.min(4, lv + 1)} 层 →</a></div>
      <p class="fine">${esc(s.note || '')}<br>点任意和弦试听。颜色线：T 主 · S 下属 · D 属。</p>
      <section class="logic"><h3>背谱方法</h3>
        <p>1. <b>先分析后记忆</b>：每一段先说出「调、功能、怎么结束」。</p>
        <p>2. <b>分块</b>：按乐句（通常 2 或 4 小节）记，不按单个音记。</p>
        <p>3. <b>找相同与不同</b>：重复的地方只记一次，只把注意力放在不同处。</p>
        <p>4. <b>离开琴背</b>：能在脑中把级数说出来，手上才稳。</p></section>`;
  }
  const HIDE = [i => false, i => i % 3 === 2, i => i % 3 !== 0, i => true];
  function vMem() {
    const s = allSongs().find(x => x.id === route[1]);
    if (!s) return go('#songs');
    const fromToday = route[2] === 'today';
    const st = (S.songs[s.id] = S.songs[s.id] || { level: 0 });
    const lv = Math.min(3, st.level);
    const desc = ['看着全谱，边弹边说出级数', '遮住 1/3：先回忆，再点开核对', '遮住 2/3：靠功能和终止式推理', '只剩功能 T/S/D：完全用逻辑回忆'][lv];
    view.innerHTML = `<div class="qbar"><a href="${fromToday ? '#today' : '#song-' + s.id}" class="x">×</a><span class="meter"><i style="width:${(lv / 4) * 100}%"></i></span><small>第 ${lv + 1}/4 层</small></div>
      <section class="mem"><h2>${esc(s.title)}</h2><p class="fine">${desc}</p>
      <div class="grid" id="grid">${songGrid(s, HIDE[lv], () => lv < 2)}</div>
      <div class="row"><button class="ghost" data-act="splay" data-id="${s.id}">▶ 听一遍</button><button class="ghost" data-act="revealall">全部翻开</button></div>
      <div class="row"><button class="btn good" data-act="memok" data-id="${s.id}">✓ 我能背出来</button><button class="btn bad" data-act="memno" data-id="${s.id}">还不行</button></div>
      <p class="tip">先在琴上弹，卡住的地方再点「?」看答案。能不看完整弹下来一遍，才算「能背出来」。</p></section>`;
  }

  function vEdit() {
    const id = route[1];
    const base = id === 'new' ? { id: 'my' + Date.now().toString(36), title: (SONG_DRAFTS[+route[2]] || {}).title || '', sub: '', key: '', sections: [] } : allSongs().find(s => s.id === id);
    if (!base) return go('#songs');
    const txt = base.sections.map(s => `${s.name}: ${s.bars}`).join('\n');
    view.innerHTML = `<header class="top"><div><a class="back" href="${id === 'new' ? '#songs' : '#song-' + id}">←</a><small>抄谱上的和弦，自动分析</small><h1>${id === 'new' ? '添加曲目' : '编辑'}</h1></div></header>
      <form class="form" id="ef" data-id="${base.id}">
        <label>曲名<input name="title" value="${esc(base.title)}" required></label>
        <label>说明<input name="sub" value="${esc(base.sub || '')}" placeholder="如：林俊杰 · 副歌"></label>
        <label>调<input name="key" value="${esc(base.key)}" placeholder="C、G、Bb、Am、F#m" required autocapitalize="off"></label>
        <label>和弦（每行一段：段名: 和弦，用 | 分小节）
          <textarea name="secs" rows="7" placeholder="主歌: C G | Am F | Dm G | C&#10;副歌: F G | Em Am | Dm G7 | C" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(txt)}</textarea></label>
        <p class="fine">支持：C Cm Cdim Caug C7 Cmaj7 Cm7 Cm7b5 Cdim7 Csus4，以及 C/E 这样的低音。</p>
        <div id="eprev"></div>
        <div class="row"><button class="btn" type="submit">保存</button>${S.custom.some(c => c.id === base.id) ? `<button class="ghost" type="button" data-act="sdel" data-id="${base.id}">${SONGS.some(s => s.id === base.id) ? '恢复默认' : '删除'}</button>` : ''}</div>
      </form>`;
    const f = $('#ef');
    const prev = () => {
      const key = T.parseKey(f.key.value || '');
      const bad = [];
      f.secs.value.split('\n').forEach(l => { const b = l.includes(':') ? l.slice(l.indexOf(':') + 1) : l; parseBars(b).flat().forEach(x => { if (!T.parseChord(x)) bad.push(x); }); });
      $('#eprev').innerHTML = (f.key.value && !key ? '<p class="no">调写法不对，例如 C、Eb、F#m</p>' : '') + (bad.length ? `<p class="no">认不出：${uniq(bad).map(esc).join(' ')}</p>` : '');
    };
    f.addEventListener('input', prev); prev();
    f.addEventListener('submit', e => {
      e.preventDefault();
      if (!T.parseKey(f.key.value.trim())) return toast('调写法不对');
      const sections = f.secs.value.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => {
        const k = l.indexOf(':') > -1 ? l.indexOf(':') : l.indexOf('：');
        return k > -1 ? { name: l.slice(0, k).trim(), bars: l.slice(k + 1).trim() } : { name: '段 ' + (i + 1), bars: l };
      }).filter(s => parseBars(s.bars).flat().every(x => T.parseChord(x)) && parseBars(s.bars).length);
      if (!sections.length) return toast('至少需要一段有效的和弦');
      const song = { id: f.dataset.id, title: f.title.value.trim(), sub: f.sub.value.trim(), key: f.key.value.trim(), sections, tag: '我的', bpm: 76, note: '' };
      const orig = SONGS.find(s => s.id === song.id);
      if (orig) song.note = orig.note;
      S.custom = S.custom.filter(c => c.id !== song.id).concat(song); save();
      go('#song-' + song.id);
    });
  }

  function vMe() {
    const days = Object.keys(S.days).sort().slice(-28);
    const grid = []; const t = dayNum(today());
    for (let i = 27; i >= 0; i--) { const d = Object.keys(S.days).find(k => dayNum(k) === t - i); const n = d ? STEPS.filter(k => S.days[d][k]).length : 0; grid.push(`<i class="h${n}"></i>`); }
    view.innerHTML = `<header class="top"><div><a class="back" href="#today">←</a><small>记录</small><h1>我</h1></div></header>
      <section class="stats"><div><b>${streak()}</b><small>连续天</small></div><div><b>${S.xp}</b><small>XP</small></div><div><b>${UNITS.filter(u => unitState(u.id).done).length}/12</b><small>单元</small></div></section>
      <h3 class="h3">最近 28 天</h3><div class="heat">${grid.join('')}</div>
      <h3 class="h3">琶音速度</h3><ul class="list">${Object.entries(S.arp).map(([k, v]) => `<li><a href="#arp-${k}"><span><b>${D(k)}</b></span><span>${v.bpm} BPM</span></a></li>`).join('') || '<li class="fine">还没有记录</li>'}</ul>
      <h3 class="h3">数据</h3><div class="row"><button class="ghost" data-act="export">导出备份</button><button class="ghost" data-act="import">导入备份</button><button class="ghost" data-act="reset">清空</button></div>
      <p class="fine">数据只存在这台设备上。iPhone 静音键打开时可能听不到声音，请关闭静音。</p>`;
  }

  // ---------------- 事件 ----------------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    A.init();
    switch (act) {
      case 'play': playChord(el.dataset.s, !!el.dataset.arp); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 300); break;
      case 'prog': playProg(el, el.dataset.k, el.dataset.c.split(','), 84, 2); break;
      case 'lesson-done': {
        const fromToday = route[2] === 'today';
        S.seen[el.dataset.u] = 1; if (fromToday) completeStep('learn'); save();
        go(fromToday ? '#today' : '#quiz-' + el.dataset.u); break;
      }
      case 'qplay': qplay(Z.list[Z.i]); break;
      case 'ans': answer(el.dataset.v); break;
      case 'next': Z.i++; quizStep(); break;
      case 'cx': CX[el.dataset.k] = el.dataset.k === 'inv' ? +el.dataset.v : el.dataset.v; if (el.dataset.k === 'q') CX.inv = 0; vChords(); if (el.dataset.k !== 'hand') playChord(T.build(CX.root, CX.q, CX.inv).sym); break;
      case 'ahand': ARP.hand = el.dataset.v; vArp(); break;
      case 'bpm': { const sym = route[1]; const st = S.arp[sym]; st.bpm = Math.max(40, Math.min(160, st.bpm + +el.dataset.v)); save(); $('#bpm').textContent = st.bpm; if (metro) startMetro(st.bpm); break; }
      case 'ademo': arpDemo(el.dataset.s); break;
      case 'ametro': { if (metro) { stopMetro(); el.classList.remove('on'); } else { startMetro(S.arp[route[1]].bpm); el.classList.add('on'); } break; }
      case 'aclean': case 'amiss': {
        const st = S.arp[el.dataset.s], d = day();
        if (act === 'aclean') {
          st.clean++; st.miss = 0; d.clean = (d.clean || 0) + 1;
          if (st.clean >= 3) { st.clean = 0; st.bpm = Math.min(160, st.bpm + 4); toast('稳了 · 速度提到 ' + st.bpm); }
          if (d.clean >= 3 && route[2] === 'today') { save(); completeStep('warm'); }
        } else {
          st.clean = 0; st.miss++;
          if (st.miss >= 2) { st.miss = 0; st.bpm = Math.max(40, st.bpm - 4); toast('退一步 · 速度降到 ' + st.bpm); } else toast('慢一点，再来一次');
        }
        save(); const m = !!metro; vArp(); if (m) { startMetro(st.bpm); document.querySelector('[data-act=ametro]').classList.add('on'); } break;
      }
      case 'splay': { const s = allSongs().find(x => x.id === el.dataset.id); const flat = songFlat(s); stopAll(); A.init(); const spc = 60 / (s.bpm || 76) * 2;
        flat.forEach((sym, i) => { const p = T.parseChord(sym); A.note((p.bass ? p.bass.pc : p.root.pc) + 36, i * spc, spc, 0.6); A.chord(chordMidis(sym), i * spc, 0.01, spc); later(() => document.querySelectorAll('#grid .cell').forEach(c => c.classList.toggle('on-play', +c.dataset.i === i)), i * spc * 1000); });
        later(() => document.querySelectorAll('#grid .cell').forEach(c => c.classList.remove('on-play')), flat.length * spc * 1000); break; }
      case 'reveal': { const s = allSongs().find(x => x.id === route[1]); const a = T.analyze(el.dataset.s, s.key); el.classList.remove('hid'); el.dataset.act = 'play'; el.querySelector('b').textContent = D(el.dataset.s); el.querySelector('i').textContent = a.numeral; playChord(el.dataset.s); break; }
      case 'revealall': document.querySelectorAll('.cell.hid').forEach(c => c.click()); break;
      case 'memok': case 'memno': {
        const st = S.songs[el.dataset.id];
        if (act === 'memok') { st.level = Math.min(4, st.level + 1); toast(st.level >= 4 ? '这首已经背下来了' : '进入第 ' + (st.level + 1) + ' 层'); }
        else toast('保持这一层，明天再试');
        save();
        if (route[2] === 'today') { completeStep('song'); go('#today'); } else if (act === 'memok') vMem();
        break;
      }
      case 'sdel': S.custom = S.custom.filter(c => c.id !== el.dataset.id); save(); go('#songs'); break;
      case 'export': { const b = new Blob([JSON.stringify(S)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'hexian-backup-' + today() + '.json'; a.click(); break; }
      case 'import': { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json'; i.onchange = () => { const r = new FileReader(); r.onload = () => { try { S = Object.assign({}, DEF, JSON.parse(r.result)); save(); toast('已导入'); render(); } catch (err) { toast('文件不对'); } }; r.readAsText(i.files[0]); }; i.click(); break; }
      case 'reset': if (el.dataset.armed) { S = JSON.parse(JSON.stringify(DEF)); save(); render(); toast('已清空'); } else { el.dataset.armed = 1; el.textContent = '再点一次确认清空'; } break;
    }
  });

  window.addEventListener('hashchange', render);
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__hexian = { T, GEN, S: () => S };
})();
