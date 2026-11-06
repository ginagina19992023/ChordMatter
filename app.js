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
  const KEY = 'hexian.v1', SCHEMA = 3;
  const DEF = { v: SCHEMA, xp: 0, days: {}, units: {}, arp: {}, songs: {}, custom: [], seen: {}, sym: {}, log: [], pk: {} };
  let S;
  function migrate(o) {
    o = Object.assign({}, DEF, o || {});
    if (!o.v || o.v < 2) { o.sym = o.sym || {}; o.log = o.log || []; o.v = 2; }
    if (o.v < 3) {
      // v3：「屏幕上学会」和「在琴上弹过」分开记。旧记录只把有收音证据（m: 'mic'）的算作琴上弹过
      o.pk = o.pk || {}; const lg = o.log || [];
      Object.keys(o.sym || {}).forEach(id => { o.pk['sym:' + id] = { a: '旧记录' }; });
      lg.filter(e => e.t === 'arp' && !e.miss).forEach(e => { const r = (o.pk['arp:' + e.s] = o.pk['arp:' + e.s] || { a: e.d }); if (e.m === 'mic') { r.p = r.p || e.d; r.pn = (r.pn || 0) + 1; } });
      Object.keys(o.songs || {}).forEach(id => { const st = o.songs[id]; st.away = st.level || 0; st.level = Math.max(0, ...lg.filter(e => e.t === 'mem' && e.id === id && e.m === 'mic' && !e.miss && !e.hint).map(e => e.lv + 1)); });
      o.v = 3;
    }
    return o;
  }
  try { S = migrate(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { S = migrate(null); }
  // 第二份存在 IndexedDB：iOS 清理 localStorage 时可以从这里恢复；另外每天留一份快照（保留 7 天）
  const IDB = {
    db: null,
    open() { if (this.db) return this.db; this.db = new Promise((res, rej) => { try { const r = indexedDB.open('hexian-state', 1); r.onupgradeneeded = () => { r.result.createObjectStore('kv'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); return this.db; },
    async put(k, v) { const d = await this.open(); return new Promise(res => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); }); },
    async get(k) { const d = await this.open(); return new Promise(res => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); },
    async keys() { const d = await this.open(); return new Promise(res => { const r = d.transaction('kv').objectStore('kv').getAllKeys(); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); }); },
    async del(k) { const d = await this.open(); return new Promise(res => { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').delete(k); tx.oncomplete = () => res(true); }); },
  };
  let idbTimer = null;
  function mirror() {
    clearTimeout(idbTimer);
    idbTimer = setTimeout(async () => {
      try {
        const json = JSON.stringify(S);
        await IDB.put('state', json);
        const snapKey = 'snap-' + new Date().toISOString().slice(0, 10);
        await IDB.put(snapKey, json);
        const snaps = (await IDB.keys()).filter(k => String(k).startsWith('snap-')).sort();
        for (const k of snaps.slice(0, Math.max(0, snaps.length - 7))) await IDB.del(k);
      } catch (e) {}
    }, 400);
  }
  const save = () => { S.v = SCHEMA; S.savedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} mirror(); };
  // 启动时：如果 localStorage 被清掉或比 IndexedDB 旧，用 IndexedDB 那份恢复
  (async () => {
    try {
      const raw = await IDB.get('state'); if (!raw) { mirror(); return; }
      const o = JSON.parse(raw);
      if ((o.savedAt || 0) > (S.savedAt || 0)) { S = migrate(o); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} if (typeof render === 'function') render(); }
    } catch (e) {}
  })();
  async function askPersist() { try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) {} }
  document.addEventListener('click', askPersist, { once: true });
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
    d[k] = 1; d[k + 'M'] = place(); S.xp += 20; save();
    if (dayComplete(d)) toast('今日完成 · 连续 ' + streak() + ' 天');
  }

  // 如实记录：每次作答 / 每次弹奏的真实结果
  function logEv(t, data) { S.log = S.log || []; S.log.push(Object.assign({ d: today(), t }, data)); if (S.log.length > 800) S.log.splice(0, S.log.length - 800); save(); }
  // ---- 两种状态分开记：没钢琴时在屏幕上学会 = 「已学 · 未上琴」；有钢琴并且收音听到你弹对 = 「琴上弹过」 ----
  const PK = {
    rec: k => (S.pk && S.pk[k]) || null,
    state(k) { const r = PK.rec(k); return !r ? 0 : r.p ? 2 : 1; },
    mark(k, onPiano) { S.pk = S.pk || {}; const r = (S.pk[k] = S.pk[k] || {}); const t = today(); r.a = r.a || t; if (onPiano) { r.p = r.p || t; r.pl = t; r.pn = (r.pn || 0) + 1; } save(); },
  };
  const PKL = ['未学', '已学 · 未上琴', '琴上弹过'];
  const pkTag = st => st ? `<span class="pk pk${st}">${PKL[st]}</span>` : '';
  const songSt = id => { const st = S.songs[id] || {}; return st.level > 0 ? 2 : st.away > 0 ? 1 : 0; };
  const songLv = (id, m = place()) => { const st = S.songs[id] || {}; return (m === 'away' ? st.away : st.level) || 0; };
  // 符号/转位/逻辑课里，有「在键盘上点出来」的课，才需要上琴；纯看懂的课不需要
  const needsPiano = card => [0, 1, 2].some(i => { try { return card.task(i).type === 'tap'; } catch (e) { return false; } });
  const symSt = card => !symDone(card.id) ? 0 : !needsPiano(card) ? 3 : PK.state('sym:' + card.id) === 2 ? 2 : 1;
  const symTag = card => { const st = symSt(card); return st === 3 ? '<span class="pk pk2">已学 · 不用上琴</span>' : pkTag(st); };
  function pianoTodo() {
    const out = [];
    COURSE_ORDER.forEach(ck => COURSES[ck].cards.forEach(c => { if (symSt(c) === 1) out.push({ k: 'sym', t: `${c.big} · ${c.title}`, sub: COURSES[ck].title + ' · 在琴上弹出 3 题', href: '#pk-' + c.id, d: (PK.rec('sym:' + c.id) || {}).a }); }));
    Object.keys(S.arp || {}).forEach(a => { if (PK.state('arp:' + a) === 1) out.push({ k: 'arp', t: `${D(a)} 琶音`, sub: '屏幕上点对过 · 在琴上弹一遍上行 + 下行', href: '#arp-' + a, d: (PK.rec('arp:' + a) || {}).a }); });
    allSongs().forEach(s => { const st = S.songs[s.id] || {}; if ((st.away || 0) > (st.level || 0)) out.push({ k: 'song', t: s.title, sub: `屏幕上到第 ${st.away} 层 · 琴上第 ${st.level || 0} 层 · 去琴上弹第 ${(st.level || 0) + 1} 层`, href: '#mem-' + s.id, d: '' }); });
    return out;
  }
  // 一条练习流：自动进入下一个没完成的步骤
  function stepHref(k) {
    const cur = currentUnit(), song = todaysSong(), arp = todaysArp();
    return { warm: `#arp-${arp}-today`, learn: coursesDone() ? `#unit-${cur.id}-today` : `#sym-next-today`, quiz: '#quiz-today', song: `#mem-${song.id}-today` }[k];
  }
  function nextStep() { const d = day(); const k = STEPS.find(x => !d[x]); go(k ? stepHref(k) : '#today'); }
  const flowBtn = (label = '继续') => `<button class="btn" data-act="flow">${label} →</button>`;

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
    tone(midi, t = 0, dur = 0.5) {
      this.init();
      const c = this.ctx, st = c.currentTime + 0.02 + t, f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain(), o = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f; g2.gain.value = 0.25;
      const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.2; vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.22, st + 0.04); g.gain.setValueAtTime(0.2, st + Math.max(0.05, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, st + dur + 0.05);
      o.connect(g); o2.connect(g2).connect(g); g.connect(this.out);
      [o, o2, vib].forEach(x => { x.start(st); x.stop(st + dur + 0.1); });
    },
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
        whites.push(`<g><rect class="k w${n ? ' on' : ''}${n && n.dim ? ' dim' : ''}${n && n.lh ? ' lh' : ''}"${o.tap ? ' data-act="key"' : ''} data-m="${m}" x="${xs[m] + 0.5}" y="0.5" width="${W - 1}" height="${H}" rx="2"/>` +
          (n && n.f ? `<text class="fn${n.lh ? ' fl' : ''}" x="${xs[m] + W / 2}" y="${H - 9}">${n.f}</text>` : '') +
          (pc === 0 && !n ? `<text class="cl" x="${xs[m] + W / 2}" y="${H - 8}">C${m / 12 - 1}</text>` : '') + '</g>');
      } else {
        const bx = xs[m - 1] + W - BW / 2;
        blacks.push(`<g><rect class="k b${n ? ' on' : ''}${n && n.dim ? ' dim' : ''}${n && n.lh ? ' lh' : ''}"${o.tap ? ' data-act="key"' : ''} data-m="${m}" x="${bx}" y="0.5" width="${BW}" height="${BH}" rx="1.5"/>` +
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
  const funcTag = f => (f ? `<span class="fx fx-${f}">${S.pro ? f : { T: '稳', S: '走', D: '紧' }[f]}</span>` : '<span class="fx fx-X">·</span>');

  function chordCard(sym, key) {
    const c = T.parseChord(sym); if (!c) return '';
    const v = T.voicing(c);
    const a = key ? T.analyze(sym, key) : null;
    return `<div class="ccard" data-act="play" data-s="${esc(sym)}">
      <div class="ccard-h"><b>${D(sym)}</b><span>${c.quality.zh}${c.inv > 0 ? ' · ' + ['', '第一', '第二', '第三'][c.inv] + '转位' : ''}</span>${a ? '<i>' + degLabel(sym, key) + '</i>' : ''}<em>▶</em></div>
      <div class="duo">${Staff.html({ bars: [[sym]], numerals: false, perRow: 1, exact: true })}${kb(v.map(n => ({ midi: n.midi, f: D(n.name) })), { trim: true })}</div>
    </div>`;
  }
  function progRow(key, chords) {
    return `<div class="prog" data-act="prog" data-k="${esc(key)}" data-c="${esc(chords.join(','))}">
      ${chords.map((s, i) => { const a = T.analyze(s, key); return `<div class="pc" data-i="${i}"><b>${D(s)}</b><i>${a ? degLabel(s, key) : '?'}</i>${funcTag(a && a.func)}</div>`; }).join('')}
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
    logEv('q', { u: unitId, ok: ok ? 1 : 0 });
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
      return { q: '键盘 / 五线谱上是什么和弦？', staff: sym, kb: vnotes(sym, false), play: [chordMidis(sym)], options: opts(D(sym), [D(other), D(rel), D(nb)]), answer: D(sym),
        why: `根音 ${D(c.root.name)}，到三音 ${D(c.notes[1].name)} 是${minor ? '小' : '大'}三度 → ${c.quality.zh}。`, after: vnotes(sym) };
    },
    u3() {
      const root = rand(['C', 'D', 'E', 'F', 'G', 'A', 'Bb', 'Eb']);
      const q = rand(['', 'm', 'dim', 'aug']), sym = root + q, c = T.parseChord(sym);
      const ear = Math.random() < 0.6;
      return { q: ear ? '听：这是哪种三和弦？' : '键盘上是哪种三和弦？', staff: ear ? null : sym, kb: ear ? null : vnotes(sym), auto: ear, play: [chordMidis(sym), 'arp'],
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
      return { q: '这是什么转位？', staff: c.sym, kb: vnotes(c.sym), play: [chordMidis(c.sym)], options: names, answer: names[inv],
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
      return { q: ear ? '听：哪种七和弦？' : '键盘上是哪种七和弦？', staff: ear ? null : sym, kb: ear ? null : vnotes(sym), auto: ear, play: [chordMidis(sym), 'arp'],
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
    drillStop(); document.querySelectorAll('.giftov, .cpop').forEach(x => x.remove());
    document.body.classList.toggle('focus', ['quiz', 'arp', 'mem', 'sing', 'acctest'].includes(r) || (['sym', 'inv', 'logic'].includes(r) && route[1]));
    document.querySelectorAll('nav a').forEach(x => { if ((r === 'sing' || r === 'acctest') && x.dataset.r === 'acc') x.classList.add('on'); if (['know', 'sym', 'inv', 'logic'].includes(r) && x.dataset.r === 'path') x.classList.add('on'); if ((r === 'score' || r === 'scan') && x.dataset.r === 'songs') x.classList.add('on'); });
    ({ today: vToday, path: vPath, unit: vUnit, chords: vChords, songs: vSongs, song: vSong, edit: vEdit, quiz: vQuiz, arp: vArp, mem: vMem, me: vMe, acc: vAcc, sing: vSing, acctest: vAccTest, know: vKnow, score: vScore, scan: vScan, pk: vPk, sym: vSym, inv: vInv, cards: vCards, logic: vLogic }[r] || vToday)();
    if (r === 'song') mountMyScore(route[1]);
    if (S.pendingGift && !document.body.classList.contains('focus')) setTimeout(flushGift, 400);
    window.scrollTo(0, 0); const ph = document.getElementById('phone'); if (ph) ph.scrollTop = 0;
  }

  function vToday() {
    const d = day(), cur = currentUnit(), song = todaysSong(), arp = todaysArp();
    const n = STEPS.filter(k => d[k]).length;
    const C = 2 * Math.PI * 34;
    const steps = [
      ['warm', '热身', place() === 'away' ? `${D(arp)} 琶音 · 屏幕上按指法点对 3 遍` : `${D(arp)} 琶音 · 在琴上一个音不错弹完 3 遍`, `#arp-${arp}-today`],
      ['learn', '学', coursesDone() ? `${cur.n} · ${cur.title}` : `${COURSES[courseOf(nextAny())].title} · ${nextAny().big}（今天学 2 课）`, stepHref('learn')],
      ['quiz', '练', '8 题 · 新知 + 自动复习', '#quiz-today'],
      ['song', '用', `${song.title.split(' ')[0]} · ${place() === 'away' ? '屏幕上点出和弦' : '在琴上弹下来'} 第 ${Math.min(4, songLv(song.id) + 1)} 层`, `#mem-${song.id}-today`],
    ];
    view.innerHTML = `
      <header class="top"><div><small>${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}</small><h1>今天</h1></div>
        <a class="stat" href="#me"><b>${streak()}</b><small>连续天</small></a><a class="stat" href="#me"><b>${S.xp}</b><small>XP</small></a></header>
      ${modeSwitch()}
      <section class="ring-wrap">
        <svg viewBox="0 0 80 80" class="ring"><circle cx="40" cy="40" r="34"/><circle class="p" cx="40" cy="40" r="34" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - n / 4)}"/></svg>
        <div class="ring-t"><b>${n}/4</b><small>${n === 4 ? '完成' : '约 12 分钟'}</small></div>
      </section>
      ${n < 4 ? `<div class="cta flow">${flowBtn(n === 0 ? '开始今天的练习' : '继续 · ' + steps.find(x => !d[x[0]])[1])}</div>` : '<p class="donemsg">今天的 4 步都完成了。想多练可以试试下面的即兴伴奏。</p>'}
      <ol class="steps">${steps.map(([k, t, s, h], i) => `<li><a href="${h}" class="${d[k] ? 'done' : ''}"><span class="dot">${d[k] ? '✓' : i + 1}</span><span><b>${t}</b><small>${esc(s)}${d[k] ? (d[k + 'M'] === 'away' ? ' · 今天在屏幕上完成' : d[k + 'M'] === 'piano' ? ' · 今天在琴上完成' : '') : ''}</small></span><span class="arr">→</span></a></li>`).join('')}</ol>
      ${todoBox()}
      <a class="unitbar" href="#unit-${cur.id}"><small>当前单元</small><b>${cur.n} ${cur.title}</b><span class="meter"><i style="width:${mastery(cur.id)}%"></i></span><small>${mastery(cur.id)}% · 达到 80% 自动解锁下一单元</small></a>
      <a class="calweek" href="#me"><small>这一周 · 一天一小节，越高练得越久</small>${calHtml(calWeeks(new Date().getFullYear(), new Date().getMonth(), today()), true)}</a>
      <a class="ptsline" href="#cards"><span class="meter"><i style="width:${Math.min(100, (1 - ((S.ptsNext || PTS_STEP) - (S.pts || 0)) / PTS_STEP) * 100)}%"></i></span><small>${S.pts || 0} 分 · 再得 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))} 分抽一张曲谱卡 · 卡册 ${ownedCards().length}/${CARDS.length}</small></a>
      <section class="bonus${n === 4 ? ' ready' : ''}"><small>加练 · 即兴伴奏${d.acc ? ' · 今日已考 ✓' : ''}</small><div class="row"><a class="ghost" href="#acctest">考一段配和弦</a><a class="ghost" href="#sing-${SING[dayNum(today()) % SING.length].id}">跟弹 · 唱《${SING[dayNum(today()) % SING.length].title}》</a></div></section>`;
  }
  function modeSwitch() {
    return `<div class="modesw"><button class="${place() === 'piano' ? 'on' : ''}" data-act="place" data-v="piano"><b>有钢琴</b><small>收音听你弹，记为「琴上弹过」</small></button><button class="${place() === 'away' ? 'on' : ''}" data-act="place" data-v="away"><b>没钢琴</b><small>在屏幕上学，记为「已学 · 未上琴」</small></button></div>`;
  }
  function todoBox() {
    const td = pianoTodo();
    if (!td.length) return '';
    if (place() === 'away') return `<a class="unitbar todo" href="#pk"><small>回到琴边要补弹</small><b>${td.length} 项「已学 · 未上琴」</b><small>切到「有钢琴」后，今天页会把它们排在这里</small></a>`;
    return `<section class="todo"><h3>上琴补弹 <small>· 屏幕上学过、还没在琴上弹过的</small></h3><ul class="list">${td.slice(0, 4).map(x => `<li><a href="${x.href}"><span><b>${x.t}</b><small>${x.sub}</small></span><span class="pk pk1">未上琴</span></a></li>`).join('')}</ul>${td.length > 4 ? `<a class="more" href="#pk">全部 ${td.length} 项 →</a>` : ''}</section>`;
  }
  function todaysSong() {
    const cur = currentUnit();
    const all = allSongs().filter(s => s.sections.length);
    const linked = all.find(s => s.id === cur.song);
    const notMastered = all.filter(s => songLv(s.id) < 4);
    const pick = linked && songLv(linked.id) < 4 ? linked : notMastered[dayNum(today()) % Math.max(1, notMastered.length)] || all[0];
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
    view.innerHTML = `<header class="top"><div><small>${UNITS.length} 个单元 · 由浅入深</small><h1>路径</h1></div><a class="stat" href="#know"><b>?</b><small>知识点</small></a></header>
      <a class="unitbar sym1" href="#sym"><small>先学这个 · ${SYMS.filter(x => symDone(x.id)).length}/${SYMS.length}</small><b>符号入门：一次学一个符号</b><span class="meter"><i style="width:${SYMS.filter(x => symDone(x.id)).length / SYMS.length * 100}%"></i></span><small>C、♯、m、7、/、级数、罗马数字……逐个看演示、在键盘上试</small></a>
      <a class="unitbar sym1" href="#inv"><small>${symAllDone() ? '接着学' : '学完符号入门后'} · ${INVS.filter(x => symDone(x.id)).length}/${INVS.length}</small><b>转位十课：先找最低音，不背形状</b><span class="meter"><i style="width:${INVS.filter(x => symDone(x.id)).length / INVS.length * 100}%"></i></span><small>最低音 → 根三五 → 原位 / 一转 / 二转 → 五线谱 → 写法 → 指法 → 手少移动</small></a>
      <a class="unitbar sym1" href="#logic"><small>第三门 · ${LOGICS.filter(x => symDone(x.id)).length}/${LOGICS.length}</small><b>读懂谱面逻辑：稳、走、紧、结尾、2–5–1……</b><span class="meter"><i style="width:${LOGICS.filter(x => symDone(x.id)).length / LOGICS.length * 100}%"></i></span><small>曲目页里看到的每个词，各有一课</small></a>
      <a class="unitbar" href="#know"><small>看不懂符号？</small><b>知识点：从「C、G7 是什么」到「一级二级三级」</b></a>
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
      if (b.t === 'video') return `<figure class="vclip${b.tall ? ' tall' : ''}"><video controls playsinline preload="metadata" poster="${b.poster}" src="${b.src}">${b.vtt ? `<track kind="subtitles" srclang="zh" label="中文" src="${b.vtt}" default>` : ''}</video><figcaption><b>${b.title}</b><small>${b.credit}${b.url ? ` · <a href="${b.url}" target="_blank" rel="noopener">原视频 ↗</a>` : ''}</small></figcaption></figure>`;
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
      ${videoBox(u.vid || u.title + ' 钢琴 乐理')}
      ${song ? `<a class="link" href="#song-${song.id}"><small>联系曲目</small><b>${song.title}</b><span>→</span></a>` : ''}
      <div class="cta"><button class="btn" data-act="lesson-done" data-u="${u.id}">${fromToday ? '继续 · 做题 →' : '练这个单元 8 题'}</button></div>`;
  }

  // 参考视频：应用内演示（自动播放本课所有和弦并高亮）+ 外部免费视频搜索
  function videoBox(q) {
    const e = encodeURIComponent(q);
    return `<section class="vid"><h3>参考视频</h3>
      <button class="vplay" data-act="demo"><span class="vtri">▶</span><span><b>本课演示</b><small>按顺序弹一遍本课所有例子，键盘和级数同步高亮</small></span></button>
      <div class="row"><a class="ghost sm" href="https://search.bilibili.com/all?keyword=${e}" target="_blank" rel="noopener">B 站免费视频 ↗</a><a class="ghost sm" href="https://www.xiaohongshu.com/search_result?keyword=${e}" target="_blank" rel="noopener">小红书 ↗</a></div>
      <p class="fine">外部链接是按「${esc(q)}」搜索的结果，内容由各平台作者提供。</p></section>`;
  }
  function lessonDemo() {
    stopAll(); A.init();
    const items = [...document.querySelectorAll('.lesson .ccard, .lesson .prog')];
    if (!items.length) return toast('这一课没有可演示的例子');
    let t = 0;
    items.forEach(el => {
      const isProg = el.classList.contains('prog');
      const len = isProg ? el.dataset.c.split(',').length * 60 / 84 * 2 + 0.6 : 2.4;
      later(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (isProg) playProg(el, el.dataset.k, el.dataset.c.split(','), 84, 2);
        else { el.classList.add('flash'); A.chord(chordMidis(el.dataset.s), 0, 0.15, 1); A.chord(chordMidis(el.dataset.s), 1.1, 0.01, 1.2); setTimeout(() => el.classList.remove('flash'), 2200); }
      }, t * 1000);
      t += len;
    });
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
        ${q.staff ? `<div class="qst">${Staff.html({ bars: [[q.staff]], numerals: false, perRow: 1, hideName: true, exact: true })}</div>` : ''}
        <div class="qkb">${q.kb ? kb(q.kb, { trim: true }) : q.play ? '<button class="big-play" data-act="qplay">▶</button>' : ''}</div>
        ${q.kb && q.play ? '<button class="ghost sm" data-act="qplay">▶ 听一下</button>' : ''}
        <div class="opts">${q.options.map(o => `<button class="opt" data-act="ans" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>
        <div class="fb" id="fb"></div>
      </section>`;
    if (q.auto) later(() => qplay(q), 250);
  }
  function qplay(q) {
    stopAll(); A.init();
    if (q.melody) { q.play[0].forEach((m, i) => A.tone(m, i * 0.42, 0.4)); return; }
    if (q.pat) { for (let b = 0; b < 2; b++) q.pat.ev.forEach(([t, code, d]) => A.chord(accMidis(b ? 'G' : 'C', code), (b * 4 + t) * 0.42, 0.005, d * 0.42)); return; }
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
    const qs = document.querySelector('.qst .staff'); if (qs) { const cfg = JSON.parse(qs.dataset.staff); cfg.hideName = false; qs.dataset.staff = JSON.stringify(cfg); try { Staff.draw(qs); } catch (err) {} }
    $('#fb').innerHTML = `<p class="${ok ? 'ok' : 'no'}">${ok ? '正确' : '再想想 · 稍后会再出一道类似的题'}</p><p class="why">${q.why}</p><button class="btn" data-act="next">继续</button>`;
    if (ok && !q.melody && !q.pat) A.init(), q.play && q.play.length && A.chord(Array.isArray(q.play[q.play.length - 1]) ? q.play[q.play.length - 1] : q.play[0], 0, 0.01, 0.9);
  }
  function quizEnd() {
    const base = Z.list.length - Z.retry.size;
    if (!Z.unit) completeStep('quiz');
    else S.xp += 10, save();
    const cur = currentUnit();
    const g = award(Z.right / base, 'quiz');
    view.innerHTML = `<section class="end">${gradeHtml(g)}<h1 class="endscore">${Z.right}/${base}</h1><p>${Z.right / base >= 0.8 ? '很稳。' : '错的题已经重做过一遍，明天会继续复习。'}</p>
      <p class="fine">当前单元「${cur.title}」掌握度 ${mastery(cur.id)}%</p>
      <div class="cta">${Z.unit ? '<a class="btn" href="#path">回到路径</a>' : flowBtn()}<a class="ghost" href="#quiz-${Z.unit || 'today'}">再来 8 题</a></div></section>`;
  }

  // ---- 和弦库 ----
  const CX = { root: 'C', q: '', inv: 0, hand: 'R' };
  function vChords() {
    const c = T.build(CX.root, CX.q, Math.min(CX.inv, T.Q[CX.q].ints.length - 1));
    const v = T.voicing(c), fg = T.blockFingers(c, CX.hand === 'L' ? 'L' : 'R');
    const fgR = T.blockFingers(c, 'R'), fgL = T.blockFingers(c, 'L');
    const lhV = v.map(n => Object.assign({}, n, { midi: n.midi - 12 }));
    const showN = CX.hand === 'B' ? lhV.map((n, i) => ({ midi: n.midi, name: n.name, f: fgL[i], lh: 1 })).concat(v.map((n, i) => ({ midi: n.midi, name: n.name, f: fgR[i] })))
      : CX.hand === 'L' ? lhV.map((n, i) => ({ midi: n.midi, name: n.name, f: fgL[i], lh: 1 })) : v.map((n, i) => ({ midi: n.midi, name: n.name, f: fgR[i] }));
    const inSongs = allSongs().filter(s => s.sections.some(sec => parseBars(sec.bars).flat().some(x => { const p = T.parseChord(x); return p && p.root.pc === c.root.pc && p.q === c.q; })));
    const arp = T.arpeggio(T.parseChord(CX.root + CX.q), 'R');
    const qlist = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'sus4'];
    const QINFO = {
      '': ['大三', '明亮、稳定', '大三度 + 小三度，最常见'], m: ['小三', '暗淡、柔和', '只把大三的中间音降半音'], dim: ['减三', '紧张、不安', '两个小三度叠起来'], aug: ['增三', '飘、像梦', '两个大三度叠起来'],
      '7': ['属七', '紧张，想回家', '大三 + 小七度，五级常用'], maj7: ['大七', '柔和、高级感', '大三 + 大七度'], m7: ['小七', '温柔、爵士感', '小三 + 小七度'],
      m7b5: ['半减七', '忧郁、悬着', '减三 + 小七度'], dim7: ['减七', '悬疑、戏剧化', '每两个音都隔小三度'], sus4: ['挂四', '悬而未决', '三音换成四音，等着落回大三'],
    };
    const INV = [['原位', '根音在最下面'], ['一转', '三音在最下面'], ['二转', '五音在最下面'], ['三转', '七音在最下面']];
    const qi = QINFO[CX.q], invi = Math.max(0, c.inv);
    const bottom = v[0];
    view.innerHTML = `<section class="cxtop">
        <div class="cxhead"><div class="cxname"><b>${D(c.sym)}</b><span>${qi[0]}和弦${invi ? ' · ' + INV[invi][0] : ''} · ${qi[1]}</span></div>
          <button class="ghost sm" data-act="play" data-s="${esc(c.sym)}">▶ 柱式</button><button class="ghost sm" data-act="play" data-s="${esc(c.sym)}" data-arp="1">▶ 分解</button></div>
        <div class="cxview">${Staff.html({ bars: [[c.sym]], numerals: false, perRow: 1, minBar: 60, exact: true, notes: showN.map(n => ({ name: n.name, midi: n.midi, lh: n.lh ? 1 : 0 })) })}${kb(showN, CX.hand === 'R' ? { lo: 60, hi: 88 } : CX.hand === 'L' ? { lo: 48, hi: 76 } : { lo: 48, hi: 88 })}</div>
        <p class="cxline">${c.notes.map(n => D(n.name)).join(' – ')} · ${c.quality.f} · ${CX.hand !== 'R' ? '<span class="lhc">左手 ' + fgL.join('-') + '</span> ' : ''}${CX.hand !== 'L' ? '右手 ' + fgR.join('-') : ''}</p>
      </section>
      <div class="cxrow"><p><b>① 根音</b> 和弦从哪个音开始叠</p>
      <div class="chips grid6">${ROOT_MAJ.map(r => `<button class="chip${r === CX.root ? ' on' : ''}" data-act="cx" data-k="root" data-v="${r}">${D(r)}</button>`).join('')}</div></div>
      <div class="cxrow"><p><b>② 性质</b> 听起来是什么颜色 · 小字是和弦名里的写法</p>
      <div class="chips grid5">${qlist.map(q => `<button class="chip q${q === CX.q ? ' on' : ''}" data-act="cx" data-k="q" data-v="${q}"><b>${QINFO[q][0]}</b><small>${q === '' ? '不写' : D(q)}</small></button>`).join('')}</div></div>
      <div class="cxrow"><p><b>③ 转位</b> 哪个音放最下面 · <b>手</b> 看哪只手的指法</p>
      <div class="chips">${c.notes.map((_, i) => `<button class="chip${i === invi ? ' on' : ''}" data-act="cx" data-k="inv" data-v="${i}">${INV[i][0]}</button>`).join('')}
        <span class="sp"></span><button class="chip${CX.hand === 'R' ? ' on' : ''}" data-act="cx" data-k="hand" data-v="R">右手</button><button class="chip${CX.hand === 'L' ? ' on' : ''}" data-act="cx" data-k="hand" data-v="L">左手</button><button class="chip${CX.hand === 'B' ? ' on' : ''}" data-act="cx" data-k="hand" data-v="B">双手</button></div></div>
      <p class="explain"><b>${D(c.sym)}</b>：以 ${D(c.root.name)} 为根音的${c.quality.zh}，${qi[2]}，听起来${qi[1]}。${invi ? `${INV[invi][0]}：最下面弹 ${D(bottom.name)}（${INV[invi][1]}），所以写成 ${D(c.sym)}，斜线后面就是最低音。` : '原位：根音 ' + D(c.root.name) + ' 在最下面。'}键盘上的数字是手指（1 = 拇指，5 = 小指）${CX.hand === 'B' ? '，蓝色是左手（低八度），橙色是右手' : CX.hand === 'L' ? '，左手在低八度' : ''}。<a href="#know-k0">看不懂？</a></p>
      ${arp.white && T.Q[CX.q].ints.length === 3 && !CX.q.startsWith('sus') ? `<a class="link" href="#arp-${CX.root + CX.q}"><small>练这个和弦</small><b>${D(CX.root + CX.q)} 琶音 · 带指法和收音</b><span>→</span></a>` : ''}
      ${(() => { const ctx = chordContext(c); return ctx ? `<section class="cxblock"><h3>先在小进行里听它</h3><p class="fine">${ctx[1]} · 点一下听，跟着弹</p>${progRow(c.root.name, ctx[0])}</section>` : ''; })()}
      <section class="cxblock"><h3>在曲子里找到它</h3>${chordFinds(c)}</section>
      <p class="pageend">— 到底了 —</p>`;
  }


  // 每个和弦组合：找含有它的曲子；找不到就给一段「它通常怎么用」的小进行（按所选根音移调）
  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.find') && d.open) document.querySelectorAll('details.find[open]').forEach(x => x !== d && (x.open = false)); }, true);
  function chordContext(c) {
    const r = c.root, nt = (st, se) => T.noteAt(r.li + st, r.pc + se).name;
    const me = c.sym;
    const P = {
      '': [[me, nt(3, 5), nt(4, 7), me], '一 → 四 → 五 → 一：大三和弦当「家」'],
      m: [[me, nt(3, 5) + 'm', nt(4, 7), me], '小调的 i → iv → V → i'],
      dim: [[me, nt(1, 1)], '减三和弦往上走半音，解决到大三和弦（vii° → I）'],
      aug: [[r.name, me, nt(3, 5)], '大三 → 增三 → 四级：中间的音往上推了半音'],
      '7': [[me, nt(3, 5)], '属七和弦解决到往上四度的和弦（V⁷ → I）'],
      maj7: [[me, nt(3, 5) + 'maj7'], 'Imaj7 → IVmaj7：柔和的流行 / 爵士色彩'],
      m7: [[me, nt(3, 5) + '7', nt(6, 10) + 'maj7'], 'ii⁷ → V⁷ → Imaj7：最常见的爵士进行'],
      m7b5: [[me, nt(3, 5) + '7', nt(6, 10) + 'm'], '小调里的 iiø⁷ → V⁷ → i'],
      dim7: [[me, nt(1, 1) + 'm'], '减七和弦往上半音，解决到小三和弦'],
      sus4: [[me, r.name, me, r.name], '挂四 → 大三：悬着的四音落回三音'],
    }[c.q];
    return P;
  }
  // 和弦页「在曲子里找到它」：逐小节查，每首曲子可展开，直接看到它出现在哪几小节（按 4 小节乐句显示），再一键跳到曲目页的那一段
  function chordHits(s, c) {
    const st = sectionStarts(s), hits = [];
    s.sections.forEach((sec, si) => parseBars(sec.bars).forEach((bar, k) => bar.forEach(x => {
      const p = T.parseChord(x); if (!p) return;
      const lv = p.sym === c.sym ? 3 : p.root.pc === c.root.pc && p.q === c.q ? 2 : p.q === c.q ? 1 : 0;
      if (lv) hits.push({ si, k, n: st[si] + k, sym: x, lv });
    })));
    return hits;
  }
  function chordFinds(c) {
    const LV = ['', '同类型（换了根音）', '同一个和弦（换了转位）', '原样出现'];
    const rows = allSongs().map(s => { const h = chordHits(s, c); return h.length ? { s, h, best: Math.max(...h.map(x => x.lv)) } : null; }).filter(Boolean)
      .sort((x, y) => y.best - x.best || y.h.filter(z => z.lv === y.best).length - x.h.filter(z => z.lv === x.best).length);
    if (!rows.length) return '<p class="fine">曲库里还没有用到这种和弦的曲子，先用上面的小进行练。</p>';
    return rows.slice(0, 6).map(({ s, h, best }) => {
      const use = h.filter(x => x.lv === best), st = sectionStarts(s);
      const names = [...new Set(use.map(x => x.sym))].map(D).join('、');
      const nums = [...new Set(use.map(x => x.n))];
      // 乐句：以命中小节所在的 4 小节为一组（按段落起点对齐），最多显示 3 组
      const phr = []; use.forEach(x => { const p0 = Math.floor(x.k / 4) * 4; const id = x.si + ':' + p0; if (!phr.some(p => p.id === id)) phr.push({ id, si: x.si, p0 }); });
      const blocks = phr.slice(0, 3).map(p => {
        const sec = s.sections[p.si], bars = parseBars(sec.bars).slice(p.p0, p.p0 + 4);
        const flat = []; const cells = bars.map((bar, j) => bar.map((x, m) => { const i = flat.length; flat.push(x); const n = st[p.si] + p.p0 + j; const a = T.analyze(x, s.key);
          return `<div class="pc${use.some(u => u.n === n && u.sym === x) ? ' hit' : ''}" data-i="${i}">${m === 0 ? `<small class="pbn">${n}</small>` : ''}<b>${D(x)}</b><i>${a ? degLabel(x, s.key) : '?'}</i></div>`; }).join('')).join('');
        return `<p class="fine phead">${esc(sec.name)} · 第 ${st[p.si] + p.p0}–${st[p.si] + p.p0 + bars.length - 1} 小节</p><div class="prog phrase" data-act="prog" data-k="${esc(s.key)}" data-c="${esc(flat.join(','))}">${cells}<em>▶</em></div>`;
      }).join('');
      const more = phr.length > 3 ? `<p class="fine">还有 ${phr.length - 3} 处，在曲目页里都高亮了。</p>` : '';
      return `<details class="find"><summary><span><b>${esc(s.title)}</b><small>${LV[best]}：${names} · 第 ${nums.slice(0, 6).join('、')}${nums.length > 6 ? ' 等' : ''}小节</small></span><span class="arr">⌄</span></summary>
        <div class="findbody">${blocks}${more}<a class="ghost sm" href="#song-${s.id}-${nums.join('.')}-${encodeURIComponent(c.sym)}">到曲目页看这一段 →</a></div></details>`;
    }).join('');
  }
  function chordSongs(c) {
    const out = [];
    const scan = (title, chords, href, kind) => {
      let best = 0;
      chords.forEach(x => { const p = T.parseChord(x); if (!p) return; if (p.sym === c.sym) best = Math.max(best, 3); else if (p.root.pc === c.root.pc && p.q === c.q) best = Math.max(best, 2); else if (p.q === c.q) best = Math.max(best, 1); });
      if (best) out.push({ title, href, best, kind });
    };
    allSongs().forEach(s => scan(s.title, songFlat(s), '#song-' + s.id, '曲目'));
    SING.forEach(s => scan(s.title, s.bars.flatMap(b => String(b[2] || '').split(/\s+/).map(x => x.split(':')[0]).filter(Boolean)), '#sing-' + s.id, '伴奏'));
    return out.sort((x, y) => y.best - x.best).slice(0, 4);
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
        <h2>${D(sym)} 琶音 · 两个八度 ${pkTag(PK.state('arp:' + sym))}</h2>
        <div class="chips"><button class="chip${ARP.hand === 'R' ? ' on' : ''}" data-act="ahand" data-v="R">右手</button><button class="chip${ARP.hand === 'L' ? ' on' : ''}" data-act="ahand" data-v="L">左手</button></div>
        ${placeChips()}
        <div id="akb">${kb(a.up.map((n, i) => ({ midi: n.midi, f: fingers[i] || '' })), { tap: place() === 'away' })}</div>
        <p class="fine">${a.fingers ? `上行 ${fingers.join(' ')} · 下行 ${fingers.slice().reverse().join(' ')}` : '黑键根音的琶音指法因调而异，请以谱面为准。'}
        ${ARP.hand === 'L' ? '<br>若三音是黑键（如 D、A、E 大调），有的教材左手用 5-3-2-1。选一种，然后固定下来：固定的指法才能形成肌肉记忆。' : ''}</p>
        <div class="tempo"><button class="ghost sm" data-act="bpm" data-v="-4">−</button><b id="bpm">${st.bpm}</b><small>BPM</small><button class="ghost sm" data-act="bpm" data-v="4">+</button></div>
        <div class="ladder">${[0, 1, 2].map(i => `<i class="${i < st.clean ? 'on' : ''}"></i>`).join('')}<small>连续干净 3 次 → 自动 +4 BPM</small></div>
        <div class="row"><button class="ghost" data-act="ademo" data-s="${esc(sym)}">▶ 示范</button><button class="ghost" data-act="ametro">◷ 节拍器</button></div>
        ${fromToday && d.warm ? `<div class="cta flow"><p class="ok">热身完成</p>${flowBtn()}</div>` : ''}
        <div id="dctl"></div>

        <p class="tip">每拍一个音。弹错一次就退回到慢速：准确比速度重要。拇指穿指时手腕保持水平，眼睛看下一个落点。</p>
        ${sym === 'C' ? renderBlocks([{ t: 'video', tall: 1, src: 'media/demo-arpeggio.mp4', poster: 'media/demo-arpeggio.jpg', title: '演示视频：C 琶音，每个音用哪根手指（15 秒）', credit: '本应用录制的演示（原创）' }]) : ''}
      </section>`;
    const seq = a.up.concat(a.up.slice(0, -1).reverse());
    drillStart(seq.map(n => ({ kind: 'note', pcs: [n.midi % 12], midi: n.midi })), {
      onAdvance: i => document.querySelectorAll('#akb .k').forEach(k => k.classList.toggle('next', +k.dataset.m % 12 === seq[i].midi % 12 && Math.abs(+k.dataset.m - seq[i].midi) < (place() === 'away' ? 1 : 13))),
      onMiss: (i, h) => { toast(h ? `听到 ${h}，应该是 ${D(T.noteAt(0, seq[i].midi % 12).name)}` : '不对'); },
      onMode: () => ($('#dctl').innerHTML = arpCtl()),
      onDone: r => { relisten = DR && DR.mode === 'mic'; logEv('arp', { s: sym, miss: r.miss, n: r.total, bpm: S.arp[sym].bpm, m: DR ? DR.mode : '' }); const g = award(Math.max(0, 1 - r.miss / r.total), 'arp'); if (r.miss === 0) PK.mark('arp:' + sym, DR && DR.mode === 'mic'); arpResult(sym, r.miss === 0, r.miss); toast(`${g[0]} 级 · +${g[2]} 分`); },
    });
    if (place() === 'away') DR.mode = 'tap';
    $('#dctl').innerHTML = arpCtl();
    if ((relisten || S.micOK) && place() === 'piano') { relisten = false; drillListen(); }
  }
  function arpCtl() {
    if (!DR) return '';
    if (DR.mode === 'tap') return '<p class="fine">按顺序点上面键盘的琴键（上行再下行），心里默念每个音用几指。</p>';
    if (DR.mode === 'mic') return `<div class="micbar"><span class="meter"><i id="lvl"></i></span><small>正在听 · 跟着节拍器弹一遍上行 + 下行</small><button class="ghost sm" data-act="dstop">停止</button></div>`;
    return '<div class="row"><button class="btn" data-act="dlisten">开始收音 · 弹给它听</button></div>';
  }
  function arpResult(sym, clean, miss) {
    const st = S.arp[sym], d = day();
    if (clean) { st.clean++; st.miss = 0; d.clean = (d.clean || 0) + 1; if (st.clean >= 3) { st.clean = 0; st.bpm = Math.min(160, st.bpm + 4); toast('连续 3 遍没错 · 速度自动提到 ' + st.bpm); } else toast('一个音都没错 · 第 ' + st.clean + '/3 遍'); }
    else { st.clean = 0; st.miss++; if (st.miss >= 2) { st.miss = 0; st.bpm = Math.max(40, st.bpm - 4); toast('错了 ' + miss + ' 个音 · 速度自动降到 ' + st.bpm); } else toast('错了 ' + miss + ' 个音 · 再来一遍'); }
    save(); if (d.clean >= 3 && route[2] === 'today') completeStep('warm');
    vArp();
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
  function allSongs() { return SONGS.concat(GIFT_SONGS.filter(g => S.cards && S.cards[g.id])).map(s => Object.assign({}, s, S.custom.find(c => c.id === s.id) || {})).concat(S.custom.filter(c => !SONGS.some(s => s.id === c.id))); }
  function vSongs() {
    const songs = allSongs();
    const drafts = SONG_DRAFTS.filter(d => !songs.some(s => s.title === d.title));
    view.innerHTML = `<header class="top"><div><small>经典与流行 · 和声逻辑 · 背谱</small><h1>曲目</h1></div><a class="stat" href="#scan"><b>⌗</b><small>识谱</small></a><a class="stat" href="#edit-new"><b>＋</b><small>手动</small></a></header>
      <a class="unitbar" href="#scan"><small>新歌</small><b>上传谱子的截图或 PDF，自动认出和弦</b><small>认出后自动判断调、级数和功能，马上可以练</small></a>
      <ul class="list">${songs.map(s => { const lv = (S.songs[s.id] || { level: 0 }).level; return `<li><a href="#song-${s.id}"><span><b>${esc(s.title)}</b><small>${esc(s.sub || '')} · ${s.key ? kz(s.key) : '未设调'}</small></span><span class="lv2"><span class="lv">${[0, 1, 2, 3].map(i => `<i class="${i < lv ? 'on' : i < (S.songs[s.id] || {}).away ? 'half' : ''}"></i>`).join('')}</span><small>${pkTag(songSt(s.id)) || '未学'}</small></span></a></li>`; }).join('')}
      ${drafts.map(d => `<li class="draft"><a href="#edit-new-${SONG_DRAFTS.indexOf(d)}"><span><b>${esc(d.title)}</b><small>${esc(d.sub)}</small></span><span class="arr">＋</span></a></li>`).join('')}</ul>
      <p class="fine">右边四格 = 背谱的四层：看全谱 → 遮 1/3 → 遮 2/3 → 只看功能。在「编辑」里改成你手上谱的和弦，系统会自动分析级数、功能和终止式。</p>`;
  }
  function songLogic(s) {
    const key = T.parseKey(s.key);
    const out = [];
    const secs = s.sections.map(sec => { const bars = parseBars(sec.bars); const flat = bars.flat(); return { name: sec.name, bars, flat, an: flat.map(x => T.analyze(x, key)) }; });
    out.push(`<b>调性</b> ${key.zh}，主和弦 ${D(key.tonic.name + (key.minor ? 'm' : ''))}（${key.minor ? '简谱里是 6 la 起的小调' : '简谱 1 = ' + D(key.tonic.name)}）`);
    secs.forEach((sc, i) => {
      const cad = sc.an.length > 1 ? T.cadence(sc.an[sc.an.length - 2], sc.an[sc.an.length - 1]) : null;
      const fx = sc.an.map(a => (a && a.func) ? (S.pro ? a.func : FW[a.func]) : '·').join(' ');
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
  function sectionStarts(s) { let n = 1; return s.sections.map(sec => { const m = /(\d+)/.exec(sec.name); const st = m ? +m[1] : n; n = st + parseBars(sec.bars).length; return st; }); }
  function songBarMap(s) { const map = {}, st = sectionStarts(s); s.sections.forEach((sec, i) => parseBars(sec.bars).forEach((b, k) => (map[st[i] + k] = b))); return map; }
  function songGrid(s) {
    const key = s.key, starts = sectionStarts(s);
    let idx = 0;
    return s.sections.map((sec, si) => `<div class="sec"><small>${esc(sec.name)}</small><div class="bars">${parseBars(sec.bars).map((bar, bi) => `<div class="bar"><span class="bn">${starts[si] + bi}</span>${bar.map(sym => {
      const a = T.analyze(sym, key), i = idx++;
      return `<div class="cell" data-i="${i}" data-act="explain" data-s="${esc(sym)}"><b>${D(sym)}</b><i>${a ? degLabel(sym, key) : '?'}</i>${funcTag(a && a.func)}</div>`;
    }).join('')}</div>`).join('')}</div></div>`).join('');
  }
  function songFlat(s) { return s.sections.flatMap(sec => parseBars(sec.bars).flat()); }
  function vSong() {
    const s = allSongs().find(x => x.id === route[1]);
    if (!s) return go('#songs');
    if (!s.sections.length || !s.key) return go('#edit-' + s.id);
    const lv = songLv(s.id);
    const origLinks = s.orig ? `<div class="row origlinks">${s.orig.apple ? `<a class="ghost sm" href="${s.orig.apple}" target="_blank" rel="noopener">Apple Music 听录音 ↗</a>` : ''}${s.orig.imslp ? `<a class="ghost sm" href="${s.orig.imslp}" target="_blank" rel="noopener">IMSLP 原版乐谱 ↗</a>` : ''}</div>` : '';
    view.innerHTML = `<header class="top"><div><a class="back" href="#songs">←</a><small>${esc(s.sub || '')}</small><h1>${esc(s.title)}</h1></div><a class="stat" href="#edit-${s.id}"><b>✎</b><small>编辑</small></a></header>
      <section class="orig first"><h3>原谱</h3>
        ${s.orig && s.orig.score ? `<a class="scorelink" href="#score-${s.id}"><b>打开完整原谱</b><small>每小节上方标好了和弦和级数 · 学习段落高亮 · 点音符发声 · 可听全部</small><span>→</span></a>` : ''}
        <div id="myscore"></div>
        ${origLinks}
      </section>
      <section class="songmain">
        <div class="chips"><button class="chip${S.pro ? '' : ' on'}" data-act="pro" data-v="0">简单写法</button><button class="chip${S.pro ? ' on' : ''}" data-act="pro" data-v="1">专业写法</button><a class="chip" href="#logic">这些字是什么意思？</a></div>
        <p class="fine legend">每格左上角的小数字 = 原谱的小节号，对着原谱看。${S.pro ? 'I IV V = 大三和弦，ii vi = 小三和弦，T 主 · S 下属 · D 属' : '6m = 六级小和弦 · 5⁷/2 = 五级七和弦、低音弹 2 · 稳 = 在家 · 走 = 出门 · 紧 = 想回家'}</p>
        ${route[2] ? `<p class="hitnote">从 <b>${D(route[3] || '')}</b> 和弦页过来：橙色框的是第 ${route[2].split('.').join('、')} 小节。点格子可以听。</p>` : ''}
        <div class="grid" id="grid">${songGrid(s)}</div>
        <p class="explain" id="explain">点任意和弦：听声音，并看它是什么意思。</p>
        <div class="row"><button class="ghost" data-act="splay" data-id="${s.id}">▶ 播放进行</button><a class="btn" href="#mem-${s.id}">${place() === 'away' ? '屏幕上点出来' : '在琴上弹下来'} · 第 ${Math.min(4, lv + 1)} 层 →</a></div>
        <p class="fine">${esc(s.note || '')}</p>
      </section>
      <section class="logic"><h3>谱面逻辑 <small>· 点下划线的词看解释</small></h3>${songLogic(s).map(l => `<p>${l}</p>`).join('')}</section>
      <h3 class="h3">五线谱 · 和声骨架（左手低音 + 右手和弦）</h3>
      ${s.sections.map(sec => `<div class="stf"><small>${esc(sec.name)}</small>${Staff.html({ key: s.key, bars: parseBars(sec.bars), end: true, time: true })}</div>`).join('')}
      ${s.rec ? `<section class="orig"><h3>真人演奏录音</h3><p class="fine">学习段落 ${s.rec.clipName}</p><audio controls preload="none" src="${s.rec.clip}"></audio><p class="fine">完整版</p><audio controls preload="none" src="${s.rec.full}"></audio><p class="fine">${s.rec.credit} · <a href="${s.rec.url}" target="_blank" rel="noopener">来源 ↗</a></p></section>` : ''}
      <section class="logic"><h3>背谱方法</h3>
        <p>1. <b>先分析后记忆</b>：每一段先说出「调、功能、怎么结束」。</p>
        <p>2. <b>分块</b>：按乐句（通常 2 或 4 小节）记，不按单个音记。</p>
        <p>3. <b>找相同与不同</b>：重复的地方只记一次，只把注意力放在不同处。</p>
        <p>4. <b>离开琴背</b>：能在脑中把级数说出来，手上才稳。</p></section>`;
      if (route[2]) {
      const want = route[2].split('.').map(Number); let first = null;
      view.querySelectorAll('#grid .bar').forEach(el => { const n = +el.querySelector('.bn').textContent; if (want.includes(n)) { el.classList.add('hit'); first = first || el; } });
      if (first) setTimeout(() => first.closest('.sec').scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
    }
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

  function logTable() {
    const L = S.log || [];
    const days = uniq(L.map(x => x.d)).sort().slice(-10).reverse();
    if (!days.length) return '<p class="fine">还没有记录。每次答题、每遍弹奏的结果都会自动记在这里。</p>';
    const pct = (a, b) => (b ? Math.round(a / b * 100) + '%' : '—');
    return `<div class="tbl"><table><tr><td>日期</td><td>答题正确</td><td>琶音无错遍数</td><td>弹下来无错遍数</td><td>配和弦</td></tr>${days.map(d => {
      const x = L.filter(e => e.d === d), q = x.filter(e => e.t === 'q'), ar = x.filter(e => e.t === 'arp'), me = x.filter(e => e.t === 'mem'), ac = x.filter(e => e.t === 'acc');
      return `<tr><td>${d.slice(5)}</td><td>${q.filter(e => e.ok).length}/${q.length} ${pct(q.filter(e => e.ok).length, q.length)}</td><td>${ar.filter(e => !e.miss).length}/${ar.length}</td><td>${me.filter(e => !e.miss && !e.hint).length}/${me.length}</td><td>${ac.length ? ac.reduce((s, e) => s + e.right, 0) + '/' + ac.reduce((s, e) => s + e.n, 0) : '—'}</td></tr>`;
    }).join('')}</table></div><p class="fine">全部来自真实作答和收音 / 点键盘的结果，没有自评。</p>`;
  }
  async function storInfo() {
    const el = $('#storinfo'); if (!el) return;
    let persisted = false, used = '';
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch (e) {}
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); used = (e.usage / 1048576).toFixed(1) + ' MB'; } } catch (e) {}
    const snaps = (await IDB.keys().catch(() => [])).filter(k => String(k).startsWith('snap-')).sort();
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    el.innerHTML = `<dl class="stor"><dt>保存方式</dt><dd>本机两份（localStorage + IndexedDB）</dd><dt>持久保存</dt><dd>${persisted ? '已开启，不会被系统自动清理' : standalone ? '主屏幕 App，iOS 不会自动清理' : '未开启 · 建议添加到主屏幕'}</dd><dt>每日快照</dt><dd>${snaps.length ? snaps.length + ' 份，最近 ' + snaps[snaps.length - 1].slice(5) : '还没有'}</dd><dt>最近备份</dt><dd>${S.backupAt ? new Date(S.backupAt).toLocaleDateString('zh-CN') : '还没导出过'}</dd>${used ? `<dt>占用空间</dt><dd>${used}</dd>` : ''}</dl>`;
  }
  async function exportBackup() {
    S.backupAt = Date.now(); save();
    const name = 'ChordMatter-备份-' + today() + '.json';
    const file = new File([JSON.stringify(S)], name, { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'ChordMatter 备份' }); storInfo(); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); storInfo();
  }
  function vMe() {
    CAL = CAL || { y: new Date().getFullYear(), m: new Date().getMonth() };
    view.innerHTML = `<header class="top"><div><a class="back" href="#today">←</a><small>记录</small><h1>我</h1></div></header>
      <section class="stats"><div><b>${streak()}</b><small>连续天</small></div><div><b>${S.xp}</b><small>XP</small></div><div><b>${UNITS.filter(u => unitState(u.id).done).length}/${UNITS.length}</b><small>单元</small></div></section>
      ${pkSummary()}
      <div class="calhead"><button class="ghost sm" data-act="calmonth" data-v="-1">‹</button><b>${CAL.y} 年 ${CAL.m + 1} 月</b><button class="ghost sm" data-act="calmonth" data-v="1">›</button></div>
      <div id="calmonth">${calHtml(calWeeks(CAL.y, CAL.m))}</div>
      <p class="fine callegend">一天一小节：音符越高 = 练得越久，颜色越深 · 实心 = 当天 4 步都完成 · 空心 = 练了一部分 · 休止符 = 休息日 · 橙色双竖线 = 背下了一首曲子。点任意一天看详情。</p>
      <div id="caldetail" class="caldetail"></div>
      <a class="unitbar" href="#cards"><small>卡册 · ${ownedCards().length}/${CARDS.length}</small><b>${S.pts || 0} 分 · 再得 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))} 分抽一张曲谱卡</b></a>
      <h3 class="h3">最近的真实记录</h3>${logTable()}
      <h3 class="h3">琶音速度</h3><ul class="list">${Object.entries(S.arp).map(([k, v]) => `<li><a href="#arp-${k}"><span><b>${D(k)}</b></span><span>${v.bpm} BPM</span></a></li>`).join('') || '<li class="fine">还没有记录</li>'}</ul>
      <h3 class="h3">数据</h3><div id="storinfo" class="fine">正在检查存储状态…</div>
      <div class="row"><button class="ghost" data-act="export">导出备份</button><button class="ghost" data-act="import">导入备份</button><button class="ghost" data-act="reset">清空</button></div>
      <p class="fine">进度保存在这台 iPhone 上（两份 + 每日快照）。建议「添加到主屏幕」使用，iOS 不会清理主屏幕 App 的数据。换手机或重装前点「导出备份」，可以存到「文件」或 iCloud。<br>iPhone 静音键打开时可能听不到声音，请关闭静音。</p>`;
    storInfo();
  }

  function pkSummary() {
    const cards = COURSE_ORDER.flatMap(ck => COURSES[ck].cards), cs = cards.map(symSt);
    const arps = Object.keys(S.arp || {}).map(a => PK.state('arp:' + a)), ss = allSongs().map(s => songSt(s.id));
    const n = st => cs.filter(x => x === st).length + arps.filter(x => x === st).length + ss.filter(x => x === st).length;
    return `<section class="stats pkstats"><div><b>${n(2) + cs.filter(x => x === 3).length}</b><small>琴上弹过 / 不用上琴</small></div><div><b>${n(1)}</b><small>已学 · 未上琴</small></div><div><b>${cards.length - cs.filter(Boolean).length}</b><small>还没学的课</small></div></section>
      ${n(1) ? `<a class="unitbar todo" href="#pk"><small>上琴补弹</small><b>${n(1)} 项等你回到琴边</b></a>` : ''}`;
  }
  const toPiano = t => String(t).replace(/在键盘上点出/g, '在琴上弹出').replace(/点出/g, '弹出').replace(/点一个/g, '弹一个').replace(/是哪个键？/g, '弹出来').replace(/^点 /, '弹 ').replace(/<b>点<\/b>/g, '<b>弹</b>');
  function vPk() {
    const id = route[1];
    if (!id) {
      const td = pianoTodo();
      view.innerHTML = `<header class="top"><div><a class="back" href="#today">←</a><small>屏幕上学过 · 还没在琴上弹过</small><h1>上琴补弹</h1></div></header>
        ${modeSwitch()}
        <p class="fine">没钢琴时学会的东西，只算「已学 · 未上琴」。回到琴边，打开收音，把它们在琴上弹一遍，才会变成「琴上弹过」。手指要真的按过，才会记得住。</p>
        ${td.length ? `<ul class="list">${td.map(x => `<li><a href="${x.href}"><span><b>${x.t}</b><small>${x.sub}${x.d && x.d !== '旧记录' ? ' · ' + x.d + ' 在屏幕上学的' : ''}</small></span><span class="arr">→</span></a></li>`).join('')}</ul>` : '<p class="donemsg">没有待补弹的。屏幕上学过的，都已经在琴上弹过了。</p>'}
        <p class="pageend">— 到底了 —</p>`;
      return;
    }
    const card = COURSE_ORDER.flatMap(ck => COURSES[ck].cards).find(c => c.id === id);
    if (!card) return go('#pk');
    const tasks = [0, 1, 2].map(i => card.task(i)).filter(t => t.type === 'tap');
    view.innerHTML = `<div class="qbar"><a href="#pk" class="x">×</a><span class="meter"><i id="pkbar" style="width:0%"></i></span><small id="pkn">1/${tasks.length}</small></div>
      <section class="pkrun"><small>上琴补弹 · ${esc(card.title)}</small><h2><span class="symchip">${card.big}</span> 在琴上弹出来</h2>
      ${place() === 'away' ? `<p class="no">现在是「没钢琴」模式。补弹要在琴上、打开收音，才能记为「琴上弹过」。</p>${modeSwitch()}` : `
      <p class="ask" id="pkask"></p>
      <div id="dctl"></div>
      <p class="fine">收音只能判断音对不对。题目里说「最左边 / 最低音」的，请自己看准再弹。</p>`}
      </section>`;
    if (place() === 'away') return;
    drillStart(tasks.map(t => ({ kind: t.pcs.length === 1 ? 'note' : 'chord', pcs: t.pcs, label: toPiano(t.ask) })), {
      onAdvance: i => { $('#pkask').innerHTML = toPiano(tasks[i].ask); $('#pkn').textContent = (i + 1) + '/' + tasks.length; $('#pkbar').style.width = (i / tasks.length * 100) + '%'; },
      onMiss: (i, h) => toast(h ? `听到 ${h}，再试一次` : '不对，再试一次'),
      onMode: () => ($('#dctl').innerHTML = drillControls()),
      onDone: r => {
        const mic = DR && DR.mode === 'mic';
        logEv('pk', { id: card.id, miss: r.miss, n: r.total, m: DR ? DR.mode : '' });
        if (mic) PK.mark('sym:' + card.id, true);
        $('#pkbar').style.width = '100%';
        $('.pkrun').innerHTML = `<h2>${mic ? '在琴上弹出来了' : '完成'}</h2><p class="${mic ? 'ok' : 'no'}">${mic ? `「${esc(card.title)}」现在是「琴上弹过」${r.miss ? `（中间错了 ${r.miss} 次）` : ''}` : '没有通过收音确认，仍记为「已学 · 未上琴」'}</p><div class="cta"><a class="btn" href="#pk">下一项 →</a></div>`;
      },
    });
    DR.cands = tasks.map(t => t.pcs);
    $('#dctl').innerHTML = drillControls();
    if ((relisten || S.micOK)) { relisten = false; drillListen(); }
  }

  // ---------------- 即兴伴奏 ----------------
  const MAJ_SEMI = [0, 2, 4, 5, 7, 9, 11];
  function parseMel(str, key) {
    const tonic = T.parseKey(key).tonic.pc;
    return String(str).trim().split(/\s+/).map(tk => {
      const m = /^([0-7])([',]*)(_*)(\.?)(-*)$/.exec(tk);
      if (!m) return null;
      const deg = +m[1];
      const oct = (m[2].match(/'/g) || []).length - (m[2].match(/,/g) || []).length;
      const beats = (1 / Math.pow(2, m[3].length)) * (m[4] ? 1.5 : 1) + m[5].length;
      return { deg, oct, beats, under: m[3].length, dot: !!m[4], dash: m[5].length, midi: deg ? 60 + tonic + MAJ_SEMI[deg - 1] + 12 * oct : null };
    }).filter(Boolean);
  }
  function parseSlots(str, beats) {
    const parts = String(str || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return [];
    const ex = parts.map(p => p.split(':'));
    let t = 0;
    return ex.map(([sym, b]) => { const d = b ? +b : beats / parts.length; const s = { sym, t, d }; t += d; return s; });
  }
  // 整首曲子 → 时间线（拍）
  function songTimeline(song) {
    const notes = [], slots = [];
    let barStart = 0, ni = 0;
    song.bars.forEach(([mel, lyr, ch], bi) => {
      const ns = parseMel(mel, song.key), ly = String(lyr).trim().split(/\s+/);
      const sum = ns.reduce((a, n) => a + n.beats, 0);
      const len = bi === 0 && sum < song.beats - 1e-6 ? sum : song.beats;
      let t = 0;
      ns.forEach((n, i) => { notes.push(Object.assign({}, n, { start: barStart + t, bar: bi, i: ni++, lyric: ly[i] || '' })); t += n.beats; });
      parseSlots(ch, song.beats).forEach(s => slots.push(Object.assign({}, s, { start: barStart + s.t, bar: bi })));
      barStart += len;
    });
    return { notes, slots, total: barStart };
  }
  function accMidis(sym, code) {
    const c = T.parseChord(sym);
    let R = 48 + c.root.pc; if (R >= 55) R -= 12;
    const th = c.quality.ints[1][1], fi = c.quality.ints[2][1];
    const close = () => T.voicing(c, 48).filter(n => n.deg !== -1).map(n => n.midi);
    return { R: [R], 3: [R + th], 5: [R + fi], 8: [R + 12], 10: [R + 12 + th], C: close(), RC: [R].concat(close()) }[code] || [R];
  }
  function jianpu(n) {
    if (!n.deg) return `<span class="jn" data-n="${n.i}"><em>0</em></span>`;
    const hi = n.oct > 0 ? '<i class="dt up">' + '•'.repeat(n.oct) + '</i>' : '', lo = n.oct < 0 ? '<i class="dt dn">' + '•'.repeat(-n.oct) + '</i>' : '';
    return `<span class="jn u${n.under}" data-n="${n.i}">${hi}<em>${n.deg}</em>${lo}${n.dot ? '<b class="dot2">·</b>' : ''}</span>` + ' <span class="jd">–</span>'.repeat(n.dash);
  }
  function jianpuBars(song, opt = {}) {
    const tl = songTimeline(song);
    return `<div class="jp">${song.bars.map((b, bi) => {
      const ns = tl.notes.filter(n => n.bar === bi);
      const sl = tl.slots.filter(s => s.bar === bi);
      const chordRow = opt.slotHtml ? opt.slotHtml(sl, bi) : sl.map(s => `<span>${D(s.sym)}</span>`).join('');
      return `<div class="jb${bi === 0 && ns.reduce((a, n) => a + n.beats, 0) < song.beats ? ' pick' : ''}"><div class="jc">${chordRow || '&nbsp;'}</div><div class="jm">${ns.map(jianpu).join('')}</div><div class="jl">${ns.map(n => `<span data-n="${n.i}">${n.lyric === '~' ? '' : esc(n.lyric)}</span>`).join('')}</div></div>`;
    }).join('')}</div>`;
  }
  const SG = { pat: {}, acc: true, mel: true, rate: 1 };
  const CODE_ZH = { R: '根', 3: '三', 5: '五', 8: '高根', 10: '高三', C: '和弦', RC: '根+和弦' };
  // 伴奏型的每一个事件 → 具体音（带音名，供五线谱和键盘使用）
  function patEvents(sym, pat) {
    const c = T.parseChord(sym);
    const nameOf = m => { const pc = m % 12; const n = c.notes.find(x => x.pc === pc) || (c.bass && c.bass.pc === pc ? c.bass : null); return n ? n.name : T.noteAt(0, pc).name; };
    return pat.ev.map(([t, code, d]) => ({ t, d, code, label: CODE_ZH[code] || code, keys: accMidis(sym, code).map(m => ({ midi: m, name: nameOf(m) })) }));
  }
  function patStaff(sym, pat, beats, mark) {
    return Staff.html({ pattern: true, sym, name: pat.name, beats, mark, events: patEvents(sym, pat).map(e => ({ d: e.d, label: e.label, keys: e.keys })) });
  }
  function patGrid(pat, beats) {
    const cells = [];
    for (let b = 0; b < beats * 2; b++) { const t = b / 2; const e = pat.ev.find(x => Math.abs(x[0] - t) < 1e-6); const hold = !e && pat.ev.some(x => x[0] < t && x[0] + x[2] > t); cells.push(`<i class="${e ? 'hit' : hold ? 'hold' : ''}${b % 2 ? '' : ' beat'}">${e ? CODE_ZH[e[1]] : ''}</i>`); }
    return `<div class="pgrid" style="grid-template-columns:repeat(${beats * 2},1fr)">${cells.join('')}</div><div class="pbeats" style="grid-template-columns:repeat(${beats},1fr)">${Array.from({ length: beats }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>`;
  }
  const PAT_WHEN = { block: '慢歌、刚开始学、右手旋律难的时候', oom: '儿歌、进行曲、节奏明快的歌', broken: '抒情歌、想要流动感的时候', alberti: '古典风格，像 K.545', waltz: '3 拍子的歌（生日快乐）' };
  function playPattern(sym, pat, beats, bpm) {
    stopAll(); A.init();
    const spb = 60 / bpm, evs = patEvents(sym, pat);
    for (let bar = 0; bar < 2; bar++) evs.forEach((e, i) => {
      const t = (bar * beats + e.t) * spb + 0.05;
      A.chord(e.keys.map(k => k.midi), t, 0.005, e.d * spb * 1.05);
      later(() => {
        document.querySelectorAll('#skb .k').forEach(k => k.classList.toggle('on-play', e.keys.some(x => x.midi === +k.dataset.m)));
        document.querySelectorAll('.pgrid i').forEach((c, ci) => c.classList.toggle('now', ci === Math.round(e.t * 2)));
      }, t * 1000);
    });
    later(() => { document.querySelectorAll('#skb .k.on-play, .pgrid i.now').forEach(k => k.classList.remove('on-play', 'now')); }, (2 * beats * spb + 0.3) * 1000);
  }
  function vAcc() {
    const d = day();
    view.innerHTML = `<header class="top"><div><small>看简谱 · 配和弦 · 边弹边唱</small><h1>伴奏</h1></div></header>
      <a class="unitbar" href="#acctest"><small>每日一考${d.acc ? ' · 今天已完成 ✓' : ''}</small><b>给一段旋律配和弦</b><small>4 小节 · 选 I / IV / V · 弹给你听对不对</small></a>
      <h3 class="h3">跟弹 · 跟唱</h3>
      <ul class="list">${SING.map(s => `<li><a href="#sing-${s.id}"><span><b>${s.title}</b><small>${s.sub} · ${s.beats}/4 拍</small></span><span class="arr">▶</span></a></li>`).join('')}</ul>
      <a class="link" href="#unit-u13"><small>先看</small><b>即兴伴奏入门：三步配和弦</b><span>→</span></a>`;
  }
  function vSing() {
    const song = SING.find(s => s.id === route[1]) || SING[0];
    const pats = PATTERNS[song.beats];
    const pat = pats.find(p => p.id === SG.pat[song.id]) || pats[song.beats === 3 ? 1 : 1];
    const tl = songTimeline(song);
    const first = tl.slots[0];
    view.innerHTML = `<div class="qbar"><a href="#acc" class="x">×</a><span class="meter"><i id="sgbar" style="width:0%"></i></span><small>${song.title}</small></div>
      <section class="sing">
        <div class="now"><div><small>现在</small><b id="nowc">${D(first.sym)}</b></div><div><small>下一个</small><span id="nextc">${tl.slots[1] ? D(tl.slots[1].sym) : ''}</span></div><div><small>级数</small><span id="nowr">${degLabel(first.sym, song.key)}</span></div></div>
        <div class="chips">${pats.map(p => `<button class="chip${p === pat ? ' on' : ''}" data-act="sgpat" data-v="${p.id}">${p.name}</button>`).join('')}</div>
        <section class="patbox">
          <p class="pwhen"><b>${pat.name}</b>：${pat.tip}。适合${PAT_WHEN[pat.id] || ''}。</p>
          <div id="pstaff">${patStaff(first.sym, pat, song.beats)}</div>
          ${patGrid(pat, song.beats)}
          <div id="skb">${kb(uniq(patEvents(first.sym, pat).flatMap(e => e.keys.map(k => k.midi))).map(m => ({ midi: m })), { lo: 36, hi: 72 })}</div>
          <div class="row"><button class="ghost sm" data-act="patplay" data-id="${song.id}">▶ 只听这个伴奏型（两小节）</button></div>
          <p class="fine">格子里是每半拍弹什么：根 = 和弦根音，五 = 五音，高根 / 高三 = 高八度的根音 / 三音，和弦 = 三个音一起按。换和弦时形状不变，只是整体平移。</p>
        </section>
        ${jianpuBars(song)}
        <div class="row"><button class="btn" data-act="sgplay" data-id="${song.id}" id="sgbtn">▶ 开始（先数一小节）</button></div>
        <div class="row"><button class="ghost sm${SG.acc ? ' on' : ''}" data-act="sgtog" data-k="acc">伴奏示范 ${SG.acc ? '开' : '关'}</button><button class="ghost sm${SG.mel ? ' on' : ''}" data-act="sgtog" data-k="mel">旋律 ${SG.mel ? '开' : '关'}</button><button class="ghost sm" data-act="sgrate" data-v="-0.1">慢</button><button class="ghost sm" data-act="sgrate" data-v="0.1">快</button></div>
        <p class="fine">速度 ${Math.round(song.bpm * SG.rate)} BPM。关掉「伴奏示范」就是你自己弹伴奏；关掉「旋律」就是你自己唱。</p>
      </section>`;
  }
  function singPlay(song) {
    stopAll(); A.init();
    const pats = PATTERNS[song.beats];
    const pat = pats.find(p => p.id === SG.pat[song.id]) || pats[1];
    const tl = songTimeline(song);
    const spb = 60 / (song.bpm * SG.rate);
    // 预备拍：一整小节，弱起时减去弱起长度
    const firstSlot = tl.slots[0] ? tl.slots[0].start : 0;
    const count = song.beats;
    for (let i = 0; i < count; i++) A.click(i * spb + 0.05, i === 0);
    const t0 = (count - 0) * spb + 0.05 - firstSlot * spb;
    if (SG.mel) tl.notes.forEach(n => { if (n.midi) A.tone(n.midi + 12 * 0, t0 + n.start * spb, n.beats * spb * 0.95); });
    tl.slots.forEach((s, si) => {
      if (SG.acc) pat.ev.forEach(([t, code, d]) => { if (t < s.d - 1e-6) A.chord(accMidis(s.sym, code), t0 + (s.start + t) * spb, 0.005, Math.min(d, s.d - t) * spb * 1.05); });
      pat.ev.forEach(([t, code]) => { if (t < s.d - 1e-6) later(() => { const ms = accMidis(s.sym, code); document.querySelectorAll('#skb .k').forEach(k => k.classList.toggle('on-play', ms.includes(+k.dataset.m))); document.querySelectorAll('.pgrid i').forEach((c, ci) => c.classList.toggle('now', ci === Math.round(((s.t + t) % song.beats) * 2))); }, (t0 + (s.start + t) * spb) * 1000); });
      later(() => {
        $('#nowc') && ($('#nowc').textContent = D(s.sym));
        $('#nextc') && ($('#nextc').textContent = tl.slots[si + 1] ? D(tl.slots[si + 1].sym) : '结束');
        $('#nowr') && ($('#nowr').innerHTML = degLabel(s.sym, song.key));
        const k = $('#skb'); if (k) k.innerHTML = kb(uniq(patEvents(s.sym, pat).flatMap(e => e.keys.map(x => x.midi))).map(m => ({ midi: m })), { lo: 36, hi: 72 });
        const ps = document.querySelector('#pstaff div.staff'); if (ps) { ps.outerHTML = patStaff(s.sym, pat, song.beats); }
      }, Math.max(0, (t0 + s.start * spb) * 1000 - 150));
    });
    tl.notes.forEach(n => later(() => {
      document.querySelectorAll('.jp [data-n]').forEach(e => { const k = +e.dataset.n; e.classList.toggle('cur', k === n.i); e.classList.toggle('past', k < n.i); });
      const bar = $('#sgbar'); if (bar) bar.style.width = ((n.i + 1) / tl.notes.length * 100) + '%';
    }, (t0 + n.start * spb) * 1000));
    later(() => {
      document.querySelectorAll('.jp [data-n]').forEach(e => e.classList.remove('cur'));
      const d = day(); if (!d.sing) { d.sing = 1; S.xp += 15; save(); } logEv('sing', { id: song.id, acc: SG.acc ? 1 : 0, mel: SG.mel ? 1 : 0 });
      toast('唱完了 · +15 XP');
      const b = $('#sgbtn'); if (b) b.textContent = '▶ 再来一遍';
    }, (t0 + tl.total * spb) * 1000 + 300);
  }

  // 每日一考：给 4 小节旋律配和弦
  let AT = null;
  function vAccTest() {
    const pool = SING.filter(s => s.test);
    const song = rand(pool);
    const phrases = [];
    for (let i = 0; i + 4 <= song.bars.length; i += 4) phrases.push(i);
    const from = rand(phrases);
    const sub = Object.assign({}, song, { bars: song.bars.slice(from, from + 4) });
    const tl = songTimeline(sub);
    AT = { song: sub, tl, pick: tl.slots.map(() => null), done: false };
    renderAccTest();
  }
  const IVV = key => [0, 3, 4].map(d => T.degreeChord(T.parseKey(key), d));
  function renderAccTest() {
    const { song, tl } = AT;
    const choices = IVV(song.key);
    let si = 0;
    const slotHtml = (sl) => sl.map(s => {
      const i = si++, res = AT.done ? AT.res[i] : null;
      return `<span class="slot${res ? (res.ok ? ' ok' : ' no') : ''}">${choices.map(c => `<button class="mini${AT.pick[i] === c ? ' on' : ''}" data-act="atpick" data-i="${i}" data-v="${c}" ${AT.done ? 'disabled' : ''}>${D(c)}</button>`).join('')}</span>`;
    }).join('');
    view.innerHTML = `<div class="qbar"><a href="#acc" class="x">×</a><span class="meter"><i style="width:${AT.pick.filter(Boolean).length / AT.pick.length * 100}%"></i></span><small>配和弦</small></div>
      <section class="quiz"><h2>给《${song.title}》这 4 小节配和弦</h2>
      <p class="fine">规则：强拍（每格第一个音）是和弦里的音就行。C = do mi sol · F = fa la do · G = sol si re</p>
      ${jianpuBars(song, { slotHtml })}
      <div class="row"><button class="ghost" data-act="atmel">▶ 听旋律</button>${AT.done ? '<button class="ghost" data-act="atplay">▶ 听你的伴奏</button>' : ''}</div>
      <div id="fb">${AT.done ? (AT.g ? gradeHtml(AT.g) : '') + AT.fb : ''}</div>
      ${AT.done ? `<div class="cta"><a class="btn" href="#sing-${SING.find(s => s.title === song.title).id}">跟弹这首 →</a><a class="ghost" href="#acctest">再考一段</a></div>` : `<div class="cta"><button class="btn" data-act="atsubmit" ${AT.pick.every(Boolean) ? '' : 'disabled'}>提交</button></div>`}
      </section>`;
  }
  function accTestSubmit() {
    const { song, tl } = AT;
    const solf = ['', 'do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
    AT.res = tl.slots.map((s, i) => {
      const n = tl.notes.find(x => x.start <= s.start + 1e-6 && x.start + x.beats > s.start + 1e-6 && x.deg);
      const pcs = T.parseChord(AT.pick[i]).notes.map(x => x.pc);
      const fits = n && pcs.includes(n.midi % 12);
      const ok = fits || AT.pick[i] === s.sym;
      return { ok, n, ref: s.sym, fits };
    });
    const right = AT.res.filter(r => r.ok).length;
    record('u13', right / AT.res.length >= 0.75);
    S.xp += right * 5;
    const d = day(); d.acc = 1; save();
    logEv('acc', { right, n: AT.res.length }); AT.g = award(right / AT.res.length, 'acc');
    AT.done = true;
    AT.fb = `<p class="${right === AT.res.length ? 'ok' : 'no'}">${right}/${AT.res.length} 合适</p>` +
      AT.res.map((r, i) => r.ok ? '' : `<p class="why">第 ${i + 1} 格：强拍是 ${r.n ? r.n.deg + '（' + solf[r.n.deg] + '）' : '?'}，不在 ${D(AT.pick[i])} 里。参考答案 ${D(r.ref)}。</p>`).join('') +
      `<p class="why">参考配法：${tl.slots.map(s => D(s.sym)).join(' · ')}。按「听你的伴奏」听听不合适的地方有多刺耳。</p>`;
    renderAccTest();
  }
  function accTestPlay(withChords) {
    stopAll(); A.init();
    const { song, tl } = AT, spb = 60 / song.bpm;
    tl.notes.forEach(n => n.midi && A.tone(n.midi, n.start * spb + 0.1, n.beats * spb * 0.95));
    if (withChords) tl.slots.forEach((s, i) => A.chord(accMidis(AT.pick[i], 'RC'), s.start * spb + 0.1, 0.01, s.d * spb));
    tl.notes.forEach(n => later(() => document.querySelectorAll('.jp [data-n]').forEach(e => e.classList.toggle('cur', +e.dataset.n === n.i)), (n.start * spb + 0.1) * 1000));
    later(() => document.querySelectorAll('.jp [data-n]').forEach(e => e.classList.remove('cur')), tl.total * spb * 1000 + 200);
  }
  GEN.u0 = () => {
    const kn = rand(['C', 'G', 'F', 'D']), k = T.parseKey(kn), sc = T.scale(k), r = Math.random();
    const NM = ['主音', '上主音', '中音', '下属音', '属音', '下中音', '导音'];
    if (r < 0.35) { const d = Math.floor(Math.random() * 7); return { q: `${k.zh}的 ${d + 1} 级音（简谱 ${d + 1} · ${SOLF[d]}）是哪个音？`, options: opts(D(sc[d].name), sc.map(n => D(n.name))), answer: D(sc[d].name), why: `${k.zh}从 ${D(sc[0].name)} 开始数：${sc.map((n, i) => (i + 1) + '=' + D(n.name)).join(' ')}`, play: [[60 + sc[d].pc]] }; }
    if (r < 0.7) { const d = rand([0, 3, 4]), ch = T.degreeChord(k, d); return { q: `${k.zh}的 ${['一', '', '', '四', '五'][d]}级和弦是？`, options: opts(D(ch), [0, 3, 4, 1, 5].map(x => D(T.degreeChord(k, x)))), answer: D(ch), why: `以 ${d + 1} 级音 ${D(sc[d].name)} 为根音：${T.parseChord(ch).notes.map(n => D(n.name)).join(' ')}`, play: [chordMidis(ch)], after: vnotes(ch) }; }
    const d = rand([0, 3, 4, 6]); return { q: `第 ${d + 1} 级音叫什么？`, options: opts(NM[d], [NM[0], NM[3], NM[4], NM[6]]), answer: NM[d], why: '1 主音 · 4 下属音 · 5 属音 · 7 导音（离 1 只差半音）' };
  };
  GEN.u13 = () => {
    const k = T.parseKey('C');
    const [I, IV, V] = IVV('C');
    const uniqueTones = { [I]: [3], [IV]: [4, 6], [V]: [2, 7] };
    const ans = rand([I, IV, V]);
    if (Math.random() < 0.25) {
      const pats = PATTERNS[4], p = rand(pats);
      return { q: '听：这是哪种伴奏型？', options: pats.map(x => x.name), answer: p.name, why: `${p.name}：${p.tip}`, play: [], pat: p, auto: true };
    }
    const strong = rand(uniqueTones[ans]);
    const mel = [strong]; for (let i = 0; i < 3; i++) { let x = mel[mel.length - 1] + rand([-1, 1, -2, 2]); if (x < 1) x = 2; if (x > 7) x = 6; mel.push(x); }
    const solf = ['', 'do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
    return { q: `C 大调，这小节旋律是 <span class="jpq">${mel.join(' ')}</span>，配哪个和弦？`, play: [mel.map(d => 60 + MAJ_SEMI[d - 1])], melody: true, options: [I, IV, V].map(D), answer: D(ans),
      why: `看强拍（第一个音）${strong}（${solf[strong]}）：它只在 ${D(ans)} 里。`, after: vnotes(ans) };
  };

  // ---------------- 简单模式：简谱数字级数 + 中文功能 ----------------
  const FW = { T: '稳', S: '走', D: '紧' };
  const FWL = { T: '稳 · 主功能（在家）', S: '走 · 下属功能（出门）', D: '紧 · 属功能（想回家）' };
  const SOLF = ['do', 're', 'mi', 'fa', 'sol', 'la', 'si'];
  function degLabel(sym, key) {
    const c = T.parseChord(sym), k = T.parseKey(key);
    if (!c || !k) return '?';
    if (S.pro) { const a = T.analyze(sym, k); return a ? a.numeral : '?'; }
    const mk = k.minor ? { tonic: T.noteAt(k.tonic.li + 2, k.tonic.pc + 3) } : k;
    const deg = r => { const dl = T.mod(r.li - mk.tonic.li, 7), iv = T.mod(r.pc - mk.tonic.pc, 12), df = T.mod(iv - [0, 2, 4, 5, 7, 9, 11][dl] + 6, 12) - 6; return (df < 0 ? '♭' : df > 0 ? '♯' : '') + (dl + 1); };
    const suf = { m: 'm', dim: '°', aug: '+', m7: 'm⁷', '7': '⁷', maj7: 'maj⁷', m7b5: 'ø', dim7: '°⁷', sus2: 'sus2', sus4: 'sus4' }[c.q] || '';
    return deg(c.root) + suf + (c.bass ? '/' + deg(c.bass) : '');
  }
  window.HX_LABEL = degLabel;
  function chordExplain(sym, key) {
    const c = T.parseChord(sym), a = key ? T.analyze(sym, key) : null;
    if (!c) return '';
    const rootTxt = `${D(c.root.name)}`;
    let s = `<b>${D(sym)}</b> = 以 <b>${rootTxt}</b> 为根音的${c.quality.zh}，由 ${c.notes.map(n => D(n.name)).join('、')} 组成。`;
    if (c.bass && c.inv > 0) s += ` 斜线后的 ${D(c.bass.name)} 表示<b>低音弹 ${D(c.bass.name)}</b>（${['', '第一', '第二', '第三'][c.inv]}转位）。`;
    if (a) {
      const k = T.parseKey(key);
      s += `<br>在${k.zh}里：简单写法 <b>${S.pro ? '' : degLabel(sym, key)}</b>${S.pro ? '' : '，'}专业写法 <b>${a.numeral}</b>`;
      if (a.func) s += `，功能「${FWL[a.func]}」`;
      if (a.note) s += `。${a.note}`;
      s += '。';
    }
    return s;
  }

  // ---------------- 练习引擎：在琴边（麦克风收音）/ 不在琴边（点屏幕键盘），只按真实结果判定 ----------------
  // targets: [{kind:'chord'|'note', pcs:[..], label}]
  let DR = null, relisten = false;
  const place = () => S.place || 'piano';
  function drillStart(targets, hooks) {
    drillStop();
    DR = Object.assign({ targets, i: 0, miss: 0, missAt: {}, tap: new Set(), hooks, mode: place() === 'away' ? 'tap' : 'self' }, {});
    hooks.onAdvance && hooks.onAdvance(0);
  }
  function drillStop() { if (Listen.active()) Listen.stop(); if (DR) DR.listening = false; }
  async function drillListen() {
    if (!DR) return;
    A.init();
    try {
      await Listen.start(A.ctx, drillEvent);
      DR.mode = 'mic'; DR.listening = true; if (!S.micOK) { S.micOK = 1; save(); } toast('在听了，开始弹吧');
    } catch (e) {
      S.micOK = 0; S.place = 'away'; save();
      toast(e && e.name === 'NotAllowedError' ? '没有麦克风权限 · 改为在屏幕键盘上点' : '这里用不了麦克风 · 改为在屏幕键盘上点');
      render(); return;
    }
    DR.hooks.onMode && DR.hooks.onMode();
  }
  function drillEvent(ev) {
    if (!DR || ev.type !== 'onset') { if (ev.type === 'level') { const m = $('#lvl'); if (m) m.style.width = Math.min(100, ev.energy * 400) + '%'; } return; }
    const t = DR.targets[DR.i]; if (!t) return;
    if (t.kind === 'note') {
      const pc = Listen.bestNote(ev.chroma);
      drillJudge(pc === t.pcs[0], D(T.noteAt(0, pc).name));
    } else {
      const s = Listen.matchChord(ev.chroma, t.pcs);
      const others = DR.cands.filter(p => p.join() !== t.pcs.join()).map(p => Listen.matchChord(ev.chroma, p));
      const bo = Math.max(0, ...others);
      if (s >= 0.7 && s >= bo - 0.02) drillJudge(true);
      else if (bo > s + 0.08 && bo > 0.72) drillJudge(false);
    }
  }
  function drillJudge(ok, heard) {
    if (!DR) return;
    const i = DR.i;
    if (ok) {
      DR.i++;
      DR.hooks.onHit && DR.hooks.onHit(i);
      if (DR.i >= DR.targets.length) { const r = { miss: DR.miss, total: DR.targets.length }; drillStop(); DR.hooks.onDone(r); return; }
      DR.hooks.onAdvance && DR.hooks.onAdvance(DR.i);
    } else {
      DR.miss++; DR.missAt[i] = (DR.missAt[i] || 0) + 1;
      DR.hooks.onMiss && DR.hooks.onMiss(i, heard, DR.missAt[i]);
    }
  }
  function drillTapKey(midi) {
    if (!DR) return;
    A.note(midi, 0, 0.8, 0.5);
    const t = DR.targets[DR.i]; if (!t) return;
    const pc = midi % 12;
    if (t.kind === 'note') return drillJudge(pc === t.pcs[0], D(T.noteAt(0, pc).name));
    DR.tap.has(pc) ? DR.tap.delete(pc) : DR.tap.add(pc);
    document.querySelectorAll('#tapkb .k').forEach(k => k.classList.toggle('sel', DR.tap.has(+k.dataset.m % 12)));
    if (DR.tap.size >= t.pcs.length) {
      const ok = t.pcs.every(p => DR.tap.has(p)) && DR.tap.size === t.pcs.length;
      DR.tap.clear();
      setTimeout(() => document.querySelectorAll('#tapkb .k').forEach(k => k.classList.remove('sel')), ok ? 200 : 400);
      drillJudge(ok);
    }
  }
  const placeChips = () => `<div class="chips place"><button class="chip${place() === 'piano' ? ' on' : ''}" data-act="place" data-v="piano">有钢琴</button><button class="chip${place() === 'away' ? ' on' : ''}" data-act="place" data-v="away">没钢琴</button></div>`;
  function drillControls() {
    if (!DR) return '';
    if (DR.mode === 'tap') return `<div id="tapkb">${kb([], { lo: 48, hi: 71, tap: true })}</div><p class="fine">在屏幕键盘上点出${DR.targets[0].kind === 'note' ? '下一个音' : '这个和弦的所有音（任意八度）'}。横屏键盘更大。</p>`;
    if (DR.mode === 'mic') return `<div class="micbar"><span class="meter"><i id="lvl"></i></span><small>正在听 · 弹错会标红</small><button class="ghost sm" data-act="dstop">停止</button></div>`;
    return `<div class="row"><button class="btn" data-act="dlisten">开始收音 · 弹给它听</button></div><p class="fine">打开麦克风后，弹对一个它就自动往下走。不方便出声时，选上面的「没钢琴」在屏幕上点（会记为「已学 · 未上琴」）。</p>`;
  }

  // ---------------- 背谱 = 弹下来（四层） ----------------
  const MEM_LV = [
    ['五线谱 + 标注', '看着五线谱弹，同时认识每个和弦叫什么、是几级。'],
    ['只留标注', '音符藏起来了，只看和弦名和级数弹出来。'],
    ['只留级数', '只剩级数和「稳/走/紧」，用逻辑想出是哪个和弦。'],
    ['什么都不留', '凭记忆弹完整首。'],
  ];
  function vMem() {
    const s = allSongs().find(x => x.id === route[1]);
    if (!s) return go('#songs');
    const fromToday = route[2] === 'today';
    const st = (S.songs[s.id] = S.songs[s.id] || { level: 0, away: 0 });
    const away = place() === 'away', lv = Math.min(3, songLv(s.id));
    const flat = songFlat(s), bars = s.sections.flatMap(sec => parseBars(sec.bars));
    const hideMode = [null, 'names', 'degree', 'all'][lv];
    view.innerHTML = `<div class="qbar"><a href="${fromToday ? '#today' : '#song-' + s.id}" class="x">×</a><span class="meter"><i id="mprog" style="width:0%"></i></span><small>${away ? '屏幕' : '琴上'} 第 ${lv + 1}/4 层</small></div>
      <section class="mem"><h2>${esc(s.title)} · ${MEM_LV[lv][0]}</h2><p class="fine">${MEM_LV[lv][1]} 一个和弦弹对了才会往下走。</p>
      ${placeChips()}
      <div class="stf" id="memstaff">${Staff.html({ key: s.key, bars, hide: lv ? flat.map((_, i) => i) : [], hideMode, mark: 0, end: true })}</div>
      <p class="explain" id="explain"></p>
      <div id="dctl"></div>
      <div class="row"><button class="ghost sm" data-act="mhint">提示这一个</button><button class="ghost sm" data-act="splay" data-id="${s.id}">▶ 听一遍</button></div>
      <details class="fine"><summary>记住标注有什么用？</summary>一个标注 = 3~4 个音。记 8 个标注比记 30 个音轻松得多；手忘了的时候，看到「5⁷」就能自己推出是 G–B–D–F。层层去掉提示，最后只剩你脑中的结构。</details></section>`;
    const cands = uniq(flat.map(x => T.parseChord(x).notes.map(n => n.pc).sort((a, b) => a - b).join())).map(x => x.split(',').map(Number));
    const ms = () => document.querySelector('#memstaff .staff');
    const setStaff = fn => { const el = ms(); if (!el) return; const cfg = JSON.parse(el.dataset.staff); fn(cfg); el.dataset.staff = JSON.stringify(cfg); try { Staff.draw(el); } catch (e) {} };
    drillStart(flat.map(x => ({ kind: 'chord', pcs: T.parseChord(x).notes.map(n => n.pc), label: x })), {
      onAdvance: i => { setStaff(c => (c.mark = i)); $('#mprog').style.width = (i / flat.length * 100) + '%'; $('#explain').innerHTML = lv === 0 ? chordExplain(flat[i], s.key) : `第 ${i + 1} 个和弦`; },
      onHit: i => setStaff(c => { c.hide = (c.hide || []).filter(x => x !== i); }),
      onMiss: (i, h, n) => { toast(n >= 2 ? '已经错两次，看一下提示' : '不对，再试一次'); if (n >= 2) setStaff(c => { c.hide = (c.hide || []).filter(x => x !== i); }); },
      onMode: () => ($('#dctl').innerHTML = drillControls()),
      onDone: r => {
        relisten = DR && DR.mode === 'mic';
        const pass = r.miss === 0 && !DR.hinted;
        logEv('mem', { id: s.id, lv, miss: r.miss, n: r.total, hint: DR.hinted ? 1 : 0, m: DR.mode });
        const mic = DR && DR.mode === 'mic';
        if (pass && mic) { st.level = Math.min(4, lv + 1); st.away = Math.max(st.away || 0, st.level); if (st.level === 4) logEv('piece', { id: s.id }); }
        else if (pass) st.away = Math.min(4, lv + 1);
        const g = award(Math.max(0, 1 - (r.miss + (DR.hinted ? 1 : 0)) / r.total), 'mem');
        S.xp += pass ? 30 : 10; save();
        if (fromToday) completeStep('song');
        $('#dctl').innerHTML = gradeHtml(g) + `<p class="${pass ? 'ok' : 'no'}">${pass ? (mic ? '在琴上一遍弹下来，没有错 · 琴上升到第 ' + Math.min(4, lv + 2) + ' 层' : '屏幕上一遍点对 · 屏幕升到第 ' + Math.min(4, lv + 2) + ' 层（记为「已学 · 未上琴」，回到琴边再弹）') : '弹完了，错 ' + r.miss + ' 次' + (DR.hinted ? '、看了提示' : '') + ' · 留在这一层再来一遍'}</p><div class="row">${fromToday ? flowBtn() : `<a class="btn" href="#song-${s.id}">完成</a>`}<button class="ghost" data-act="mredo">再来一遍</button></div>`;
      },
    });
    DR.cands = cands; DR.hinted = false;
    $('#dctl').innerHTML = drillControls();
    if ((relisten || S.micOK) && place() === 'piano') { relisten = false; drillListen(); }
  }

  // ---------------- 原曲完整乐谱 ----------------
  const SC = { section: false, rate: 1 };
  function vScore() {
    const s = allSongs().find(x => x.id === route[1]);
    if (!s || !s.orig || !s.orig.score) return go('#songs');
    const sc = s.orig.score;
    view.innerHTML = `<header class="top"><div><a class="back" href="#song-${s.id}">←</a><small>${esc(s.sub || '')}</small><h1>${esc(s.title)}</h1></div></header>
      <div class="chips"><button class="chip${SC.section ? '' : ' on'}" data-act="scmode" data-v="0">完整原谱（学习段落高亮）</button><button class="chip${SC.section ? ' on' : ''}" data-act="scmode" data-v="1">只看学习段落 ${sc.measures} 小节</button></div>
      <div class="row"><button class="btn" data-act="scplay" id="scbtn">▶ ${SC.section ? '听这一段' : '听全部'}</button><button class="ghost sm" data-act="screte" data-v="-0.1">慢</button><button class="ghost sm" data-act="screte" data-v="0.1">快</button></div>
      <p class="fine">速度 ${Math.round(SC.rate * 100)}% · 橙色 = 你在「曲目」里学的段落 · 播放的是原谱上的每一个音</p>
      <div class="score" id="score"><p class="fine">正在加载乐谱…（第一次需要下载约 13MB 的乐谱引擎，之后会快很多）</p></div>
      ${s.orig.apple ? `<a class="link" href="${s.orig.apple}" target="_blank" rel="noopener"><small>真人演奏</small><b>在 Apple Music 听录音</b><span>↗</span></a>` : ''}
      <p class="fine">乐谱：${esc(sc.credit)}</p>`;
    const bm = songBarMap(s), lab = {};
    Object.keys(bm).forEach(n => (lab[n] = bm[n].map(x => D(x) + ' ' + degLabel(x, s.key)).join('  ')));
    Score.render($('#score'), sc, { section: SC.section, labels: lab }).catch(() => { const e = $('#score'); if (e) e.innerHTML = '<p class="no">乐谱加载失败：需要联网。可以先用下面的链接。</p>'; });
  }
  function scorePlay() {
    const c = Score.get(); if (!c || !c.notes.length) return toast('乐谱还没加载好');
    stopAll(); A.init();
    const r = 1 / SC.rate, el = c.el;
    let lastY = -1;
    c.notes.forEach(n => {
      A.note(n.pitch, n.t * r + 0.05, Math.min(2.5, n.dur * r + 0.3), 0.55);
      later(() => {
        const g = el.querySelector('[data-id="' + n.id + '"]') || el.querySelector('[id="' + n.id + '"]'); if (!g) return;
        g.classList.add('playing'); setTimeout(() => g.classList.remove('playing'), Math.max(120, n.dur * r * 1000));
        const y = g.getBoundingClientRect().top;
        if (Math.abs(y - lastY) > 40) { const box = (document.getElementById('phone') && getComputedStyle(document.getElementById('phone')).overflowY === 'auto') ? document.getElementById('phone').getBoundingClientRect() : { top: 0, bottom: innerHeight }; if (y < box.top + 60 || y > box.bottom - 140) g.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        lastY = y;
      }, (n.t * r + 0.05) * 1000);
    });
    const end = Math.max(...c.notes.map(n => n.t + n.dur)) * r;
    later(() => { const b = $('#scbtn'); if (b) { b.textContent = '▶ 再听一遍'; b.dataset.act = 'scplay'; } }, end * 1000 + 300);
  }

  // ---------------- 识谱 ----------------
  let SCAN = null;
  function vScan() {
    view.innerHTML = `<header class="top"><div><a class="back" href="#songs">←</a><small>截图 / 照片 / PDF</small><h1>识谱</h1></div></header>
      <label class="drop" for="scanfile"><b>选择谱子</b><small>支持 PNG、JPG、PDF（最多 6 页）。文件只在这台手机上处理，不会上传</small></label>
      <input type="file" id="scanfile" accept="image/*,application/pdf,.pdf" hidden>
      <div id="scanprog"></div><div id="scanout"></div>
      <p class="fine"><b>说实话：</b>手机截图里的小号和弦字（尤其是 Gm⁷ 这种带上标的）经常认错，结果只能当起点。更准的办法：在 iPhone「照片」里长按谱子 →「实况文本」选中和弦字母 → 拷贝，粘贴到识别结果的文本框里修改。</p>
      <p class="fine">能认出的是谱子上<b>印出来的和弦记号</b>（流行谱、弹唱谱上方的 C、Am、G7/B 这些）。纯五线谱的音符目前在手机上识别不准，这类谱子会保存成原谱图片，和弦可以自己补上。</p>`;
    $('#scanfile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const prog = $('#scanprog'); $('#scanout').innerHTML = '';
      const show = (msg, p) => { prog.innerHTML = `<p class="fine">${msg}</p><span class="meter"><i style="width:${Math.round(p * 100)}%"></i></span>`; };
      try {
        const r = await OCR.recognize(f, show);
        SCAN = Object.assign(r, { title: f.name.replace(/\.[^.]+$/, '') });
        prog.innerHTML = '';
        renderScan();
      } catch (err) { prog.innerHTML = `<p class="no">没能读取这个文件（${esc(err.message || err)}）。识谱需要联网下载识别引擎，请检查网络后再试。</p>`; }
    });
  }
  function renderScan() {
    const r = SCAN, n = r.lines.flat().length;
    const txt = r.lines.map((l, i) => `第${i + 1}行: ${l.join(' | ')}`).join('\n');
    $('#scanout').innerHTML = `<div class="thumbs">${r.thumbs.map(t => `<img src="${t}" alt="谱子">`).join('')}</div>
      <p class="${n ? 'ok' : 'no'}">${n ? `认出 ${n} 个和弦，猜测是 ${kz(r.key)}` : '没有找到印出来的和弦记号'}</p>
      <form class="form" id="scanform">
        <label for="sctitle">曲名<input id="sctitle" name="title" value="${esc(r.title)}" required></label>
        <label for="sckey">调（自动猜的，可以改）<input id="sckey" name="key" value="${esc(r.key || 'C')}" autocapitalize="off"></label>
        <label for="scsecs">识别出的和弦（每行一段，| 分小节，认错的直接改）<textarea id="scsecs" name="secs" rows="8" autocapitalize="off" autocorrect="off" spellcheck="false">${esc(txt)}</textarea></label>
        <div class="row"><button class="btn" type="submit">${n ? '生成曲目，开始练' : '只保存原谱，和弦稍后补'}</button></div>
      </form>`;
    $('#scanform').addEventListener('submit', async e => {
      e.preventDefault();
      const f = e.target;
      const key = T.parseKey(f.key.value.trim()) ? f.key.value.trim() : 'C';
      const sections = f.secs.value.split('\n').map(l => l.trim()).filter(Boolean).map((l, i) => { const k = l.search(/[:：]/); return k > -1 ? { name: l.slice(0, k).trim(), bars: l.slice(k + 1).trim() } : { name: '第' + (i + 1) + '行', bars: l }; })
        .map(s => ({ name: s.name, bars: parseBars(s.bars).map(b => b.filter(x => T.parseChord(x)).join(' ')).filter(Boolean).join(' | ') })).filter(s => s.bars);
      const id = 'scan' + Date.now().toString(36);
      const song = { id, title: f.title.value.trim() || '我的谱子', sub: '识谱导入', key, sections, tag: '我的', bpm: 76, note: '和弦由识谱自动读取，请对照原谱核对', scanned: 1 };
      try { await OCR.savePages(id, SCAN.thumbs); } catch (err) {}
      S.custom = S.custom.concat(song); save();
      logEv('scan', { id, n: sections.reduce((s, x) => s + parseBars(x.bars).flat().length, 0) });
      go(sections.length ? '#song-' + id : '#edit-' + id);
    });
  }
  async function mountMyScore(id) {
    const el = $('#myscore'); if (!el) return;
    let pages = await OCR.loadPages(id);
    if ((!pages || !pages.length) && window.HX_PRESEED && HX_PRESEED[id]) pages = HX_PRESEED[id];
    if (!pages || !pages.length) {
      el.innerHTML = `<label class="drop small" for="addscore"><b>添加你手上的原谱</b><small>截图、照片或 PDF · 只存在这台手机上 · 下面每格的小节号对着它看</small></label><input type="file" id="addscore" accept="image/*,application/pdf,.pdf" hidden>`;
      $('#addscore').addEventListener('change', async e => {
        const f = e.target.files[0]; if (!f) return;
        el.innerHTML = '<p class="fine">正在读取…</p>';
        try { const cs = await OCR.toCanvases(f); await OCR.savePages(id, cs.map(c => c.toDataURL('image/jpeg', 0.8))); mountMyScore(id); } catch (err) { el.innerHTML = '<p class="no">没能读取这个文件</p>'; }
      });
      return;
    }
    el.innerHTML = `<div class="myscore">${pages.map(p => `<img src="${p}" alt="原谱">`).join('')}</div><p class="fine">双指放大查看。下面和弦格子里的小数字就是这份谱的小节号。</p>`;
  }

  // ---------------- 符号入门：一次一个符号 ----------------
  const COURSES = { sym: { title: '符号入门', cards: SYMS }, inv: { title: '转位十课', cards: INVS }, logic: { title: '读懂谱面逻辑', cards: LOGICS } };
  const COURSE_ORDER = ['sym', 'inv', 'logic'];
  const courseOf = card => (INVS.includes(card) ? 'inv' : LOGICS.includes(card) ? 'logic' : 'sym');
  const ALLCARDS = SYMS.concat(INVS, LOGICS);
  const nextAny = () => { for (const ck of COURSE_ORDER) { const c = COURSES[ck].cards.find(x => !(S.sym && S.sym[x.id])); if (c) return c; } return null; };
  const symDone = id => !!(S.sym && S.sym[id]);
  const symNext = (ck = 'sym') => COURSES[ck].cards.find(x => !symDone(x.id));
  const symAllDone = () => !symNext('sym');
  const invAllDone = () => !symNext('inv');
  const coursesDone = () => !nextAny();
  let SY = null;
  function vSymIndex(ck = 'sym') {
    const C = COURSES[ck], cards = C.cards, nx = symNext(ck);
    const intro = { sym: '一次只学一个符号：看演示 → 在键盘上试 3 次 → 学会。每学新符号前，会顺手复习一个学过的。', inv: '每课只讲一个点。所有题都用同一个方法：先找最低音，再看它是根、三还是五。不背五线谱的形状。', logic: '曲目页「谱面逻辑」里的每个词（功能、稳、走、紧、结尾、2–5–1、4536、低音线）各有一课。在谱面逻辑里点任何一个词，也会跳到这里。' }[ck];
    view.innerHTML = `<header class="top"><div><a class="back" href="#path">←</a><small>${cards.filter(x => symDone(x.id)).length}/${cards.length} 已学会</small><h1>${C.title}</h1></div></header>
      <p class="fine">${intro}</p>
      ${nx ? `<div class="cta flow"><a class="btn" href="#sym-${nx.id}">学下一个：${nx.big} · ${nx.title} →</a></div>` : `<p class="donemsg">${C.title}全部学会了。下面任何一课都可以点开再看。</p>`}
      <ol class="path symlist">${cards.map((x, i) => { const st = symDone(x.id) ? 'done' : x === nx ? 'cur' : 'lock'; return `<li class="${st}"><a href="${st === 'lock' ? '#sym' : '#sym-' + x.id}"><span class="node">${st === 'done' ? '✓' : i + 1}</span><span><b><span class="symchip">${x.big}</span> ${x.title}</b><small>${st === 'lock' ? '学完前一个后解锁' : x.say.slice(0, 26) + '…'}</small>${st === 'done' ? symTag(x) : ''}</span></a></li>`; }).join('')}</ol>
      ${cards.some(x => symSt(x) === 1) ? `<a class="unitbar todo" href="#pk"><small>上琴补弹</small><b>${cards.filter(x => symSt(x) === 1).length} 课已学 · 未上琴</b><small>有钢琴时，在琴上把这几课的题弹一遍</small></a>` : ''}`;
  }
  function symDemo(card) {
    stopAll(); A.init();
    const seq = card.demo.seq || [];
    seq.forEach((ms, i) => {
      if (ms.length) A.chord(ms, i * 0.75, 0.01, 0.9);
      later(() => document.querySelectorAll('#symdemo .kb .k').forEach(k => k.classList.toggle('on-play', ms.includes(+k.dataset.m))), i * 750);
    });
    later(() => document.querySelectorAll('#symdemo .kb .k.on-play').forEach(k => k.classList.remove('on-play')), seq.length * 750 + 300);
  }
  function vInv() { if (route[1]) { route = ['sym'].concat(route.slice(1)); return vSym(); } vSymIndex('inv'); }
  function vLogic() { if (route[1]) { route = ['sym'].concat(route.slice(1)); return vSym(); } vSymIndex('logic'); }
  const DEMO_V = n => ({ src: `media/demo-${n}.mp4`, poster: `media/demo-${n}.jpg` });
  const CARD_VIDEO = {
    i4: Object.assign(DEMO_V('inversions'), { title: '演示视频：原位 → 一转 → 二转（15 秒）' }),
    i5: Object.assign(DEMO_V('inversions'), { title: '演示视频：原位 → 一转 → 二转（15 秒）' }),
    s16: Object.assign(DEMO_V('function'), { title: '演示视频：稳 → 走 → 紧 → 稳（13 秒）' }),
    l1: Object.assign(DEMO_V('function'), { title: '演示视频：稳 → 走 → 紧 → 稳（13 秒）' }),
    l5: Object.assign(DEMO_V('function'), { title: '演示视频：一句话的标准路线（13 秒）' }),
    l11: Object.assign(DEMO_V('progression'), { title: '演示视频：4536 王道进行（15 秒）' }),
  };
  function vSym() {
    const id = route[1];
    if (!id) return vSymIndex('sym');
    const card = id === 'next' ? nextAny() : ALLCARDS.find(x => x.id === id);
    if (!card) return go('#sym');
    const fromToday = route[2] === 'today';
    const learned = ALLCARDS.filter(x => symDone(x.id) && x !== card);
    const reps = [];
    if (learned.length) { const rc = rand(learned); reps.push(Object.assign(rc.task(Math.floor(Math.random() * 3)), { review: rc })); }
    for (let i = 0; i < 3; i++) reps.push(card.task(i));
    const ck = courseOf(card), cards = COURSES[ck].cards;
    SY = { card, reps, i: 0, tap: [], miss: 0, fromToday, locked: false, ck };
    const k = cards.indexOf(card);
    view.innerHTML = `<div class="qbar"><a href="${fromToday ? '#today' : '#' + ck}" class="x">×</a><span class="meter"><i id="symbar" style="width:0%"></i></span><small>${COURSES[ck].title} ${k + 1}/${cards.length}</small></div>
      <section class="symcard">
        <div class="symbig">${card.big}</div>
        <h2>${card.title}</h2>
        <p class="say">${card.say}</p>
        <div id="symdemo" class="symdemo">${card.demo.staff ? Staff.html({ bars: [[card.demo.staff]], numerals: false, perRow: 1, exact: true }) : ''}${card.demo.jp ? '<div class="jpdemo"><span class="jn u1"><em>5</em></span><small>半拍</small><span class="jn"><em>5</em></span><small>一拍</small><span class="jn"><em>5</em></span><span class="jd">–</span><small>两拍</small><span class="jn"><i class="dt up">•</i><em>5</em></span><small>高八度</small></div>' : ''}${kb(card.demo.keys.map(x => ({ midi: x.m, f: x.f })), { lo: 48, hi: 83, trim: true })}</div>
        <button class="ghost sm" data-act="symdemo">▶ 再看一遍演示</button>
        ${CARD_VIDEO[card.id] ? renderBlocks([Object.assign({ t: 'video', tall: 1, credit: '本应用录制的演示（原创）' }, CARD_VIDEO[card.id])]) : ''}
        <div id="symtask"></div>
      </section>`;
    later(() => symDemo(card), 300);
    symRep();
  }
  function symRep() {
    const r = SY.reps[SY.i], el = $('#symtask');
    $('#symbar').style.width = (SY.i / SY.reps.length * 100) + '%';
    SY.tap = []; SY.locked = false;
    const k = SY.reps.slice(0, SY.i + 1).filter(x => !x.review && !x.extra).length;
    const head = `<p class="symask">${r.review ? `<span class="tag">复习 ${r.review.big}</span>` : r.extra ? '<span class="tag">再练一次</span>' : `<span class="tag">试一试 ${k}/3</span>`}${r.ask}</p>`;
    const shown = (r.showStaff ? `<div class="symshow">${Staff.html({ bars: [[r.showStaff]], numerals: false, perRow: 1, exact: true, hideName: true })}</div>` : '') + (r.showKb && r.type !== 'tap' ? `<div class="symshow">${kb(r.showKb.map(x => ({ midi: x.m, f: x.f })), { lo: 48, hi: 83, trim: true })}</div>` : '') + (r.showKb && r.type === 'tap' ? `<p class="fine">刚才弹的：${r.showKb.map(x => x.f).join(' ')}</p>` : '');
    if (r.type === 'tap') el.innerHTML = head + shown + `<div id="symkb">${kb([], { lo: 48, hi: 83, tap: true })}</div><p class="fine" id="symhint">任意八度都可以。点错了再点一下取消。</p><div id="symfb"></div>`;
    else el.innerHTML = head + shown + `${r.play ? '<button class="ghost sm" data-act="symplay">▶ 听</button>' : ''}<div class="opts">${r.options.map(o => `<button class="opt" data-act="sympick" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div><div id="symfb"></div>`;
    if (r.play) later(() => symPlay(r), 400);
  }
  function symPlay(r) { A.init(); const ps = [].concat(r.play); ps.forEach((s, i) => A.chord(chordMidis(s), i * 0.9, 0.01, 0.9)); }
  function symTap(midi) {
    const r = SY.reps[SY.i]; if (!r || r.type !== 'tap' || SY.locked) return;
    A.note(midi, 0, 0.8, 0.5);
    const at = SY.tap.indexOf(midi);
    if (at > -1) SY.tap.splice(at, 1); else SY.tap.push(midi);
    document.querySelectorAll('#symkb .k').forEach(k => k.classList.toggle('sel', SY.tap.includes(+k.dataset.m)));
    if (SY.tap.length < r.pcs.length) return;
    const pcs = SY.tap.map(m => m % 12);
    let ok = r.pcs.every(p => pcs.includes(p)) && uniq(pcs).length === r.pcs.length;
    if (ok && r.bass != null) ok = Math.min(...SY.tap) % 12 === r.bass;
    symJudge(ok, () => {
      // 标出正确答案
      document.querySelectorAll('#symkb .k').forEach(k => { const m = +k.dataset.m; k.classList.toggle('want', r.pcs.includes(m % 12) && m >= 60 && m < 72 + (r.bass != null ? 12 : 0)); });
    });
  }
  function symJudge(ok, showAnswer) {
    SY.locked = true;
    const r = SY.reps[SY.i];
    logEv('sym', { c: (r.review || SY.card).id, ok: ok ? 1 : 0 });
    const fb = $('#symfb');
    if (ok) {
      fb.innerHTML = '<p class="ok">对了</p>'; if (r.sym) A.chord(chordMidis(r.sym), 0.15, 0.01, 0.9);
      // 前进用独立计时器：不会被演示播放（stopAll）打断
      const me = SY; clearTimeout(SY.adv); SY.adv = setTimeout(() => { if (SY !== me || !$('#symtask')) return; symAdvance(); }, 800);
    } else {
      SY.miss++;
      if (showAnswer) showAnswer();
      fb.innerHTML = `<div class="whybox"><p class="no">还不对</p><p>${symWhy(r)}</p><button class="btn" data-act="symnext">明白了，${r.extra ? '继续' : '再练一次'} →</button></div>`;
      if (r.play) symPlay(r);
      if (!r.extra) SY.reps.splice(SY.i + 1, 0, Object.assign(SY.card.task(SY.i + 3), { extra: 1 })); // 错了就多练一次
    }
  }
  function symAdvance() { SY.i++; if (SY.i >= SY.reps.length) symFinish(); else symRep(); }
  // 错题讲解：说清楚对的是什么、为什么
  const nn = pc => D(T.noteAt([0, 0, 1, 2, 2, 3, 3, 4, 4, 5, 6, 6][pc], pc).name);
  function symWhy(r) {
    const card = r.review || SY.card;
    if (r.why) return r.why;
    if (r.type === 'tap') {
      const want = r.sym ? T.parseChord(r.sym).notes.map(n => D(n.name)) : r.pcs.map(nn);
      const got = SY.tap.slice().sort((x, y) => x - y).map(m => nn(m % 12));
      let s = `正确的是 <b>${want.join('、')}</b>（绿色标出来了）。你点的是 ${got.join('、') || '—'}。`;
      if (r.bass != null) {
        const low = SY.tap.length ? nn(Math.min(...SY.tap) % 12) : '—';
        s += `<br>这题还要看<b>最左边（最低）</b>的音：应该是 <b>${nn(r.bass)}</b>，你最左边弹的是 ${low}。${r.pcs.every(p => SY.tap.some(m => m % 12 === p)) ? '三个音都对了，只是最低音没放对：把它挪到最左边就行。' : ''}`;
      } else if (r.sym) s += `<br>${chordExplain(r.sym)}`;
      return s;
    }
    let s = `正确答案是 <b>${esc(r.answer)}</b>。`;
    if (r.play) { const ps = [].concat(r.play); s += `<br>刚才弹的是 ${ps.map(x => `<b>${D(x)}</b>（${degLabel(x, 'C')}）`).join(' → ')}，再听一遍。`; }
    return s + `<br><span class="fine">${card.say}</span>`;
  }
  function symFinish() {
    S.sym = S.sym || {}; S.sym[SY.card.id] = 1; S.xp += 15; PK.mark('sym:' + SY.card.id, false);
    const d = day(); d.symToday = (d.symToday || 0) + 1; save();
    if (SY.fromToday && (d.symToday >= 2 || coursesDone())) completeStep('learn');
    $('#symbar').style.width = '100%';
    const nx = symNext(SY.ck) || nextAny();
    const g = award(Math.max(0, 1 - SY.miss / 3), 'sym');
    $('#symtask').innerHTML = gradeHtml(g) + `<p class="ok">学会了「${SY.card.big}」${SY.miss ? `（练习中错了 ${SY.miss} 次，已多练补上）` : ''}</p>
      <div class="cta flow">${SY.fromToday && day().learn ? flowBtn() : nx ? `<a class="btn" href="#sym-${nx.id}${SY.fromToday ? '-today' : ''}">下一课：${nx.big} · ${nx.title} →</a>` : flowBtn('全部学会了 · 继续')}</div>`;
  }


  // ---------------- 评级与卡册（音游式） ----------------
  const GRADES = [['S', 1, 100], ['A', 0.9, 80], ['B', 0.75, 60], ['C', 0.6, 40], ['D', 0, 20]];
  const gradeOf = acc => GRADES.find(g => acc >= g[1] - 1e-9) || GRADES[GRADES.length - 1];
  const PTS_STEP = 500;
  function award(acc, src) {
    const g = gradeOf(acc);
    S.pts = (S.pts || 0) + g[2];
    S.ptsNext = S.ptsNext || PTS_STEP;
    logEv('grade', { s: src, g: g[0], p: g[2] });
    let gift = null;
    if (S.pts >= S.ptsNext) { S.ptsNext += PTS_STEP; gift = unlockCard(); }
    if (gift) S.pendingGift = { id: gift.c.id, foil: gift.foil ? 1 : 0 };
    save();
    if (gift) { const here = location.hash; setTimeout(() => { if (location.hash === here) flushGift(); }, 900); }
    return g;
  }
  const gradeHtml = (g, extra = '') => `<div class="grade g${g[0]}"><b>${g[0]}</b><span>+${g[2]} 分${extra}</span><small>${(S.pts || 0)} 分 · 距下一张卡 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))}</small></div>`;
  const ownedCards = () => CARDS.filter(c => c.own || (S.cards && S.cards[c.id]));
  function unlockCard() {
    S.cards = S.cards || {};
    const locked = CARDS.filter(c => !c.own && !S.cards[c.id]);
    let c, foil = false;
    if (locked.length) { c = rand(locked); S.cards[c.id] = { at: today() }; }
    else { c = rand(CARDS); S.foil = S.foil || {}; S.foil[c.id] = (S.foil[c.id] || 0) + 1; foil = true; }
    logEv('card', { id: c.id, foil: foil ? 1 : 0 });
    return { c, foil };
  }
  function cardSong(id) { return allSongs().find(s => s.id === id); }
  function cardFace(c, opts = {}) {
    const s = cardSong(c.id); if (!s) return '';
    const first = s.sections[0] ? parseBars(s.sections[0].bars).flat().slice(0, 4) : [];
    const foil = S.foil && S.foil[c.id];
    return `<div class="tcard r${c.rare}${foil ? ' foil' : ''}">
      <div class="tc-top"><small>${RARE[c.rare]}${foil ? ' · 闪卡 ×' + foil : ''}</small><small>${'●'.repeat(c.level)}${'○'.repeat(3 - c.level)}</small></div>
      <div class="tc-staff">${Staff.html({ key: s.key, bars: [first.slice(0, 2), first.slice(2, 4)].filter(b => b.length), numerals: false, perRow: 2, minBar: 60 })}</div>
      <b class="tc-title">${esc(s.title)}</b>
      <small class="tc-sub">${esc(c.composer)} · ${c.year} · ${kz(s.key)}</small>
      <p class="tc-note">${esc(c.note)}</p>
      ${opts.actions ? `<div class="tc-acts"><a class="ghost sm" href="#song-${s.id}">看分析</a><a class="ghost sm" href="#mem-${s.id}">弹下来</a>${s.orig && s.orig.score ? `<a class="ghost sm" href="#score-${s.id}">原谱</a>` : ''}</div>` : ''}
    </div>`;
  }
  // 抽到的卡：只在结果页当场弹出；已经离开就等回到非练习页面再弹，不打断练习
  function flushGift() {
    const pg = S.pendingGift; if (!pg) return;
    const c = CARDS.find(x => x.id === pg.id); S.pendingGift = null; save();
    if (c) showGift({ c, foil: !!pg.foil });
  }
  function showGift({ c, foil }) {
    const ov = document.createElement('div'); ov.className = 'giftov';
    ov.innerHTML = `<div class="giftbox"><p class="fine">${foil ? '卡册已经集齐 · 这次是一张闪卡' : '攒够 ' + PTS_STEP + ' 分 · 新的曲谱卡'}</p><div class="flip"><div class="back"><span>♪</span></div><div class="front">${cardFace(c)}</div></div>
      <div class="row"><a class="btn" href="#mem-${c.id}" data-act="giftclose">去练这首</a><button class="ghost" data-act="giftclose">收下</button></div></div>`;
    document.body.appendChild(ov);
    A.init(); [0, 0.12, 0.24].forEach((t, i) => A.note([72, 76, 79][i], t, 1.2, 0.5));
    setTimeout(() => ov.classList.add('open'), 50);
  }
  function vCards() {
    const own = ownedCards();
    view.innerHTML = `<header class="top"><div><a class="back" href="#me">←</a><small>${own.length}/${CARDS.length} 张 · ${S.pts || 0} 分</small><h1>卡册</h1></div></header>
      <div class="ptsbar"><span class="meter"><i style="width:${Math.min(100, (1 - ((S.ptsNext || PTS_STEP) - (S.pts || 0)) / PTS_STEP) * 100)}%"></i></span><small>再得 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))} 分，随机解锁一张新曲谱卡</small></div>
      <p class="fine">评级：S 全对 100 分 · A ≥90% 80 分 · B ≥75% 60 分 · C ≥60% 40 分 · D 20 分。全部按真实结果计算。</p>
      <div class="cardgrid">${CARDS.map(c => (c.own || (S.cards && S.cards[c.id])) ? cardFace(c, { actions: true }) : `<div class="tcard locked r${c.rare}"><span>?</span><small>${RARE[c.rare]} · 未解锁</small></div>`).join('')}</div>`;
  }

  // ---------------- 练习时长（只算停留在练习页面、屏幕亮着的时间） ----------------
  const PRACTICE_ROUTES = ['arp', 'quiz', 'mem', 'sing', 'acctest', 'sym', 'inv', 'logic', 'unit', 'score', 'song'];
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !PRACTICE_ROUTES.includes(route[0])) return;
    const d = day(); d.sec = (d.sec || 0) + 15; if (d.sec % 60 === 0) save();
  }, 15000);

  // ---------------- 五线谱日历：一天一小节 ----------------
  const ymd = dt => dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
  function dayInfo(ds) {
    const d = S.days[ds], L = (S.log || []).filter(e => e.d === ds);
    const min = Math.round(((d && d.sec) || 0) / 60);
    const steps = d ? STEPS.filter(k => d[k]).length : 0;
    const active = min > 0 || steps > 0 || L.length > 0;
    return { ds, min, steps, active, full: steps === 4, piece: L.some(e => e.t === 'piece'), grades: L.filter(e => e.t === 'grade').map(e => e.g), cards: L.filter(e => e.t === 'card').map(e => e.id) };
  }
  // 开始使用之前的日子不画休止符（那不是休息，只是还没开始）
  function firstDay() { const ks = Object.keys(S.days).concat((S.log || []).map(e => e.d)).sort(); return ks[0] || today(); }
  function calWeeks(year, month, onlyWeekOf) {
    const first = new Date(year, month, 1);
    const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); // 周一开始
    const weeks = [], tds = today();
    for (let w = 0; w < 6; w++) {
      const days = [];
      for (let k = 0; k < 7; k++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + k);
        const ds = ymd(dt), inf = dayInfo(ds);
        days.push({ ds, label: dt.getDate(), other: dt.getMonth() !== month, today: ds === tds, future: ds > tds || ds < firstDay(), ...inf });
      }
      if (onlyWeekOf) { if (days.some(x => x.ds === onlyWeekOf)) return [days]; continue; }
      if (w > 3 && days.every(x => x.other)) break;
      weeks.push(days);
    }
    return weeks;
  }
  let CAL = null;
  function calHtml(weeks, compact) {
    return Staff.html({ calendar: true, compact: !!compact, weeks: weeks.map(w => w.map(x => ({ ds: x.ds, label: x.label, other: x.other, today: x.today, future: x.future, active: x.active, min: x.min, full: x.full, piece: x.piece }))) });
  }
  function calDetail(ds) {
    const x = dayInfo(ds), el = $('#caldetail'); if (!el) return;
    const dt = new Date(ds + 'T12:00:00');
    const title = dt.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    if (!x.active) { el.innerHTML = `<b>${title}</b><p class="fine">${ds > today() ? '还没到。' : '休止符：休息日。休息也是练习的一部分。'}</p>`; return; }
    el.innerHTML = `<b>${title}</b><p>练习 ${x.min} 分钟 · 今日 ${x.steps}/4 步${x.piece ? ' · 背下了一首曲子' : ''}</p>${x.grades.length ? `<p class="fine">评级：${x.grades.join(' ')}</p>` : ''}${x.cards.length ? `<p class="fine">得到卡：${x.cards.map(id => (cardSong(id) || { title: id }).title).join('、')}</p>` : ''}`;
  }


  // ---------------- 文字里的和弦名：自动加下划线，点开浮窗解释 ----------------
  const CHORD_RE = /(^|[^A-Za-z0-9#♯♭\/])([A-G](?:#|♯|b|♭)?(?:maj7|m7b5|m7♭5|dim7|dim|aug|sus2|sus4|m7|m|7|°|ø)?(?:\/[A-G](?:#|♯|b|♭)?)?)(?![A-Za-z0-9#♯♭])/g;
  const SKIP = 'button, a, svg, input, textarea, select, label, nav, h1, .chordref, .kb, .tcard, .symbig, .jp, .grade, .now, .cell, .pc, .opt, .chip, .stat, .qbar, .cxname, .tc-title, .bars, .ring-t, .heat, .jpq, .src, code';
  // 取文字节点前后（跨过 <b> 之类的标签）的几个字
  function sideText(n, dir) {
    let t = '', cur = n;
    while (t.length < 8 && cur) {
      const sib = dir < 0 ? cur.previousSibling : cur.nextSibling;
      if (sib) { cur = sib; t = dir < 0 ? sib.textContent + t : t + sib.textContent; }
      else { cur = cur.parentNode; if (!cur || (cur.matches && cur.matches('p, td, li, div, section'))) break; }
    }
    return dir < 0 ? t.slice(-8) : t.slice(0, 8);
  }
  function linkChords(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (!n.nodeValue.trim() || !/[A-G]/.test(n.nodeValue) || (n.parentElement && n.parentElement.closest(SKIP))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      const txt = n.nodeValue; let m, last = 0, frag = null;
      // 单个字母（C、F）可能只是音名或调名：同一句里有明确的和弦（Am、G/B、G7）或后面跟「和弦」时才当和弦
      const ctx = (n.parentElement && n.parentElement.closest('p, td, li, .say, .symask, .tip, .explain')) || n.parentElement;
      const ctxText = ctx ? ctx.textContent : txt;
      const hasClear = /(^|[^A-Za-z0-9])[A-G](#|♯|b|♭)?(maj7|m7b5|m7♭5|dim7|dim|aug|sus2|sus4|m7|m|7|°|ø|\/[A-G])/.test(ctxText);
      CHORD_RE.lastIndex = 0;
      while ((m = CHORD_RE.exec(txt))) {
        const sym = m[2], after = txt.slice(m.index + m[0].length, m.index + m[0].length + 3);
        if (/^[A-G]$/.test(sym) && /^\s?[段站面]/.test(after)) continue; // 「A 段」「B 站」不是和弦
        if (/^[A-G](#|♯|b|♭)?$/.test(sym) && !hasClear && !/^\s?(和弦|大三|级和弦)/.test(after)) continue; // 单独的音名 / 调名不当和弦
        if (/^[A-G](#|♯|b|♭)?$/.test(sym)) {
          const before = (sideText(n, -1) + txt.slice(0, m.index + m[1].length)).slice(-6);
          const aft = (txt.slice(m.index + m[0].length) + sideText(n, 1)).slice(0, 3);
          if (/(后面是|不是|音是|根音|弹|音|键)\s*$/.test(before) || /^\s[A-G]([\s,，、。]|$)/.test(aft) || /[A-G]\s$/.test(before)) continue; // 「最低音是 B」「C B A」是音名
        }
        const norm = sym.replace(/♯/g, '#').replace(/♭/g, 'b').replace(/°$/, 'dim').replace(/ø$/, 'm7b5');
        if (!T.parseChord(norm)) continue;
        frag = frag || document.createDocumentFragment();
        const st = m.index + m[1].length;
        frag.appendChild(document.createTextNode(txt.slice(last, st)));
        const sp = document.createElement('span'); sp.className = 'chordref'; sp.dataset.act = 'chordpop'; sp.dataset.s = norm; sp.textContent = sym;
        frag.appendChild(sp); last = st + sym.length;
      }
      if (frag) { frag.appendChild(document.createTextNode(txt.slice(last))); n.parentNode.replaceChild(frag, n); }
    });
  }
  let linkT = null;
  new MutationObserver(() => { clearTimeout(linkT); linkT = setTimeout(() => { linkChords(view); linkTerms(view); }, 60); }).observe(view, { childList: true, subtree: true });
  function chordPop(sym) {
    document.querySelectorAll('.cpop').forEach(x => x.remove());
    const c = T.parseChord(sym); if (!c) return;
    const song = route[0] === 'song' || route[0] === 'mem' ? allSongs().find(x => x.id === route[1]) : null;
    const v = T.voicing(c);
    const el = document.createElement('div'); el.className = 'cpop';
    el.innerHTML = `<div class="cpop-card" role="dialog" aria-label="${esc(D(sym))}">
      <div class="cpop-h"><b>${D(sym)}</b><button class="ghost sm" data-act="play" data-s="${esc(sym)}">▶ 听</button><button class="x" data-act="cpopclose" aria-label="关闭">×</button></div>
      <p>${chordExplain(sym, song && song.key)}</p>
      <div class="cpop-v">${Staff.html({ bars: [[sym]], numerals: false, perRow: 1, exact: true, minBar: 60 })}${kb(v.map(n => ({ midi: n.midi, f: D(n.name) })), { trim: true })}</div>
      <a class="fine" href="#know-k0">和弦名怎么读 →</a></div>`;
    (document.getElementById('phone') || document.body).appendChild(el);
    A.init(); A.chord(v.map(n => n.midi), 0, 0.02, 1.2);
    requestAnimationFrame(() => el.classList.add('open'));
  }


  // ---------------- 术语：全应用自动加下划线，点开一句话解释 + 去学这一课 ----------------
  // [词, 对应的课 id]（长词在前，避免被短词截断）
  const GLOSS = [
    ['正格终止', 'l7'], ['变格终止', 'l6'], ['半终止', 'l8'], ['阻碍终止', 'l9'], ['终止式', 'l6'],
    ['王道进行', 'l11'], ['卡农进行', 'l11'], ['4536 进行', 'l11'], ['1564 进行', 'l11'], ['6415 进行', 'l11'], ['1645 进行', 'l11'], ['2–5–1', 'l10'],
    ['低音线', 'l12'], ['和声功能', 'l1'], ['功能', 'l1'],
    ['副属和弦', 'k7'], ['借用和弦', 'k7'], ['和声小调', 'k1'], ['导音', 'k1'], ['属音', 'k1'], ['下属音', 'k1'],
    ['大三和弦', 's5'], ['小三和弦', 's6'], ['属七和弦', 's7'], ['大七和弦', 's8'], ['减三和弦', 's9'], ['罗马数字', 's14'],
    ['第一转位', 'i4'], ['第二转位', 'i5'], ['一转', 'i4'], ['二转', 'i5'], ['原位', 'i3'], ['转位', 'i4'],
    ['根音', 'i2'], ['三音', 'i2'], ['五音', 'i2'], ['级数', 's11'], ['伴奏型', 's20'],
    ['稳', 'l2'], ['走', 'l3'], ['紧', 'l4'],
  ];
  const ONECHAR = new Set(['稳', '走', '紧']);
  const glossCard = id => ALLCARDS.find(x => x.id === id) || KNOW.find(x => x.id === id);
  window.__glossOf = id => GLOSS.filter(g => g[1] === id).map(g => g[0]); // 审计用
  function linkTerms(root) {
    const own = route[0] === 'sym' ? route[1] : null; // 当前这一课自己的词不再链接
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP + ', .termref, h2, .tag, .fx'))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      const txt = n.nodeValue; let i = 0, last = 0, frag = null;
      while (i < txt.length) {
        let hit = null;
        for (const [term, id] of GLOSS) {
          if (!txt.startsWith(term, i) || id === own) continue;
          if (ONECHAR.has(term)) { // 单字只在「稳 走 紧」这种独立出现时算术语（不碰「稳定」「走路」）
            const pv = txt[i - 1] || ' ', nx = txt[i + 1] || ' ';
            if (/[一-龥]/.test(pv) || /[一-龥]/.test(nx)) continue;
          }
          hit = [term, id]; break;
        }
        if (!hit) { i++; continue; }
        frag = frag || document.createDocumentFragment();
        frag.appendChild(document.createTextNode(txt.slice(last, i)));
        const sp = document.createElement('span'); sp.className = 'termref'; sp.dataset.act = 'termpop'; sp.dataset.id = hit[1]; sp.textContent = hit[0];
        frag.appendChild(sp); i += hit[0].length; last = i;
      }
      if (frag) { frag.appendChild(document.createTextNode(txt.slice(last))); n.parentNode.replaceChild(frag, n); }
    });
  }
  function termPop(id, word) {
    document.querySelectorAll('.cpop').forEach(x => x.remove());
    const c = glossCard(id); if (!c) return;
    const isKnow = id.startsWith('k');
    const say = isKnow ? (c.blocks.find(b => b.t === 'p') || {}).x || '' : c.say;
    const done = !isKnow && symDone(id);
    const el = document.createElement('div'); el.className = 'cpop';
    el.innerHTML = `<div class="cpop-card" role="dialog" aria-label="${esc(word)}">
      <div class="cpop-h"><b>${esc(word)}</b><button class="x" data-act="cpopclose" aria-label="关闭">×</button></div>
      <p>${say}</p>
      <a class="btn" href="${isKnow ? '#know-' + id : '#sym-' + id}">${isKnow ? '看完整的知识点' : done ? '再看一遍这一课（含演示）' : '去学这一课（看演示 + 试 3 次）'} →</a></div>`;
    (document.getElementById('phone') || document.body).appendChild(el);
    requestAnimationFrame(() => el.classList.add('open'));
  }

  // ---------------- 知识点 ----------------
  function vKnow() {
    const id = route[1];
    const k = KNOW.find(x => x.id === id);
    if (!k) {
      view.innerHTML = `<header class="top"><div><a class="back" href="#path">←</a><small>从零开始 · 核对过来源</small><h1>知识点</h1></div></header>
        <ul class="list">${KNOW.map((x, i) => `<li><a href="#know-${x.id}"><span><b>${x.t}</b></span><span class="arr">→</span></a></li>`).join('')}</ul>
        <p class="fine">主要依据开放教材 Open Music Theory（第 2 版）、维基百科中文术语页和相关研究。个别说法来源不够权威的已在条目里注明。</p>`;
      return;
    }
    const i = KNOW.indexOf(k), nx = KNOW[i + 1];
    view.innerHTML = `<header class="top"><div><a class="back" href="#know">←</a><small>知识点 ${i + 1}/${KNOW.length}</small><h1>${k.t}</h1></div></header>
      <article class="lesson">${renderBlocks(k.blocks)}</article>
      ${videoBox(k.vid || k.t.replace(/[：:].*$/, '') + ' 乐理 讲解')}
      <div class="src"><small>来源</small>${k.src.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(n)} ↗</a>`).join('')}</div>
      ${nx ? `<a class="link" href="#know-${nx.id}"><small>下一条</small><b>${nx.t}</b><span>→</span></a>` : ''}`;
  }

  // ---------------- 事件 ----------------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    A.init();
    switch (act) {
      case 'explain': { playChord(el.dataset.s); const s = allSongs().find(x => x.id === route[1]); const ex = $('#explain'); if (ex) ex.innerHTML = chordExplain(el.dataset.s, s && s.key); document.querySelectorAll('.cell').forEach(c => c.classList.toggle('sel', c === el)); break; }
      case 'scmode': SC.section = el.dataset.v === '1'; render(); break;
      case 'scplay': scorePlay(); el.textContent = '■ 停止'; el.dataset.act = 'scstop'; break;
      case 'scstop': stopAll(); el.textContent = '▶ 播放'; el.dataset.act = 'scplay'; break;
      case 'screte': SC.rate = Math.max(0.5, Math.min(1.3, Math.round((SC.rate + +el.dataset.v) * 10) / 10)); render(); break;
      case 'pro': S.pro = el.dataset.v === '1'; save(); render(); break;
      case 'place': S.place = el.dataset.v; save(); render(); break;
      case 'key': if (['sym', 'inv', 'logic'].includes(route[0])) symTap(+el.dataset.m); else drillTapKey(+el.dataset.m); break;
      case 'symdemo': symDemo(SY.card); break;
      case 'sympick': { if (!SY || SY.locked) break; const r = SY.reps[SY.i]; const ok = el.dataset.v === r.answer; document.querySelectorAll('#symtask .opt').forEach(b => { if (b.dataset.v === r.answer) b.classList.add('right'); else if (b === el) b.classList.add('wrong'); b.disabled = true; }); symJudge(ok); break; }
      case 'symplay': symPlay(SY.reps[SY.i]); break;
      case 'symnext': symAdvance(); break;
      case 'dlisten': drillListen(); break;
      case 'dstop': drillStop(); DR && (DR.mode = 'self'); $('#dctl') && ($('#dctl').innerHTML = drillControls()); break;
      case 'mhint': { if (!DR) break; DR.hinted = true; const t = DR.targets[DR.i]; if (t) { const ex = $('#explain'); if (ex) ex.innerHTML = '提示：' + chordExplain(t.label, (allSongs().find(x => x.id === route[1]) || {}).key); playChord(t.label); } break; }
      case 'mredo': render(); break;
      case 'sgpat': { SG.pat[route[1]] = el.dataset.v; vSing(); const song = SING.find(x => x.id === route[1]); const pat = PATTERNS[song.beats].find(p => p.id === el.dataset.v); playPattern(songTimeline(song).slots[0].sym, pat, song.beats, song.bpm * SG.rate); break; }
      case 'sgplay': singPlay(SING.find(s => s.id === el.dataset.id)); el.textContent = '■ 停止'; el.dataset.act = 'sgstop'; break;
      case 'sgstop': stopAll(); vSing(); break;
      case 'patplay': { const song = SING.find(x => x.id === el.dataset.id); const pats = PATTERNS[song.beats]; const pat = pats.find(p => p.id === SG.pat[song.id]) || pats[1]; playPattern(songTimeline(song).slots[0].sym, pat, song.beats, song.bpm * SG.rate); break; }
      case 'sgtog': SG[el.dataset.k] = !SG[el.dataset.k]; vSing(); break;
      case 'sgrate': SG.rate = Math.max(0.5, Math.min(1.5, Math.round((SG.rate + +el.dataset.v) * 10) / 10)); vSing(); break;
      case 'atpick': AT.pick[+el.dataset.i] = el.dataset.v; renderAccTest(); A.init(); playChord(el.dataset.v); break;
      case 'atsubmit': accTestSubmit(); break;
      case 'atmel': accTestPlay(false); break;
      case 'atplay': accTestPlay(true); break;
      case 'play': playChord(el.dataset.s, !!el.dataset.arp); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 300); break;
      case 'prog': playProg(el, el.dataset.k, el.dataset.c.split(','), 84, 2); break;
      case 'flow': nextStep(); break;
      case 'chordpop': e.preventDefault(); chordPop(el.dataset.s); break;
      case 'termpop': e.preventDefault(); termPop(el.dataset.id, el.textContent); break;
      case 'cpopclose': { const p = el.closest('.cpop'); if (p) p.remove(); break; }
      case 'calmonth': { CAL.m += +el.dataset.v; if (CAL.m < 0) { CAL.m = 11; CAL.y--; } if (CAL.m > 11) { CAL.m = 0; CAL.y++; } vMe(); break; }
      case 'giftclose': { const ov = el.closest('.giftov'); if (ov) ov.remove(); break; }
      case 'demo': lessonDemo(); break;
      case 'lesson-done': {
        const fromToday = route[2] === 'today';
        S.seen[el.dataset.u] = 1; if (fromToday) completeStep('learn'); save();
        go(fromToday ? '#quiz-today' : '#quiz-' + el.dataset.u); break;
      }
      case 'qplay': qplay(Z.list[Z.i]); break;
      case 'ans': answer(el.dataset.v); break;
      case 'next': Z.i++; quizStep(); break;
      case 'cx': CX[el.dataset.k] = el.dataset.k === 'inv' ? +el.dataset.v : el.dataset.v; if (el.dataset.k === 'q') CX.inv = 0; vChords(); if (el.dataset.k !== 'hand') playChord(T.build(CX.root, CX.q, CX.inv).sym); break;
      case 'ahand': ARP.hand = el.dataset.v; vArp(); break;
      case 'bpm': { const sym = route[1]; const st = S.arp[sym]; st.bpm = Math.max(40, Math.min(160, st.bpm + +el.dataset.v)); save(); $('#bpm').textContent = st.bpm; if (metro) startMetro(st.bpm); break; }
      case 'ademo': arpDemo(el.dataset.s); break;
      case 'ametro': { if (metro) { stopMetro(); el.classList.remove('on'); } else { startMetro(S.arp[route[1]].bpm); el.classList.add('on'); } break; }
      case 'splay': { const s = allSongs().find(x => x.id === el.dataset.id); const flat = songFlat(s); stopAll(); A.init(); const spc = 60 / (s.bpm || 76) * 2;
        flat.forEach((sym, i) => { const p = T.parseChord(sym); A.note((p.bass ? p.bass.pc : p.root.pc) + 36, i * spc, spc, 0.6); A.chord(chordMidis(sym), i * spc, 0.01, spc); later(() => document.querySelectorAll('#grid .cell').forEach(c => c.classList.toggle('on-play', +c.dataset.i === i)), i * spc * 1000); });
        later(() => document.querySelectorAll('#grid .cell').forEach(c => c.classList.remove('on-play')), flat.length * spc * 1000); break; }
      case 'sdel': S.custom = S.custom.filter(c => c.id !== el.dataset.id); save(); try { indexedDB.open('hexian-scores', 1).onsuccess = e => { const d = e.target.result; if (d.objectStoreNames.contains('pages')) d.transaction('pages', 'readwrite').objectStore('pages').delete(el.dataset.id); }; } catch (err) {} go('#songs'); break;
      case 'export': exportBackup(); break;
      case 'import': { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json'; i.onchange = () => { const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (!o || typeof o !== 'object' || !('xp' in o)) throw 0; S = migrate(o); save(); toast('已导入备份'); render(); } catch (err) { toast('这不是 ChordMatter 的备份文件'); } }; r.readAsText(i.files[0]); }; i.click(); break; }
      case 'reset': if (el.dataset.armed) { S = JSON.parse(JSON.stringify(DEF)); save(); render(); toast('已清空'); } else { el.dataset.armed = 1; el.textContent = '再点一次确认清空'; } break;
    }
  });

  window.addEventListener('hashchange', render);
  document.addEventListener('staffplay', e => { A.init(); const ms = e.detail || []; if (ms.length === 1) A.note(ms[0], 0, 1.4, 0.7); else A.chord(ms, 0, 0.02, 1.4); });
  document.addEventListener('calpick', e => { calDetail(e.detail); });
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__hexian = { T, GEN, S: () => S, A, SY: () => SY };
})();
