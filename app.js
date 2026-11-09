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
  const KEY = 'hexian.v1', SCHEMA = 3, APPV = 117; // 和 sw.js 的 hexian-v 号一起改
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
  const save = () => { S.v = SCHEMA; S.savedAt = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} mirror(); cloudQueue(); };
  // 云端同步：存到你自己 GitHub 账号里的一个私密 Gist（不需要服务器）
  // 令牌只存在这台手机（hexian.cloud），不进备份、不进分享
  if ('HX_PRESEED' in window) document.documentElement.classList.add('inart'); // 在 Claude 里打开：顶部有 Claude 的工具条盖住
  const CK = 'hexian.cloud', GFILE = 'chordmatter-state.json';
  const cloudCfg = () => { try { return JSON.parse(localStorage.getItem(CK) || 'null'); } catch (e) { return null; } };
  const cloudSet = o => { try { if (o) localStorage.setItem(CK, JSON.stringify(o)); else localStorage.removeItem(CK); } catch (e) {} };
  const CL = { timer: null, busy: false, msg: '' };
  async function gh(path, opt = {}, token) {
    const r = await fetch('https://api.github.com' + path, Object.assign({}, opt, { headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' }, opt.body ? { 'Content-Type': 'application/json' } : {}) }));
    if (!r.ok) { const e = new Error('github ' + r.status); e.status = r.status; throw e; }
    return r.status === 204 ? null : r.json();
  }
  async function gistRead(cfg) {
    const g = await gh('/gists/' + cfg.gist, {}, cfg.token), f = g.files && g.files[GFILE]; if (!f) return null;
    const txt = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
    return JSON.parse(txt);
  }
  async function cloudConnect(token) {
    token = String(token || '').trim(); if (!token) throw new Error('empty'); CL.msg = '';
    const me = await gh('/user', {}, token);
    // 找已有的那个 Gist（换手机 / 重装时接上原来的记录），没有就新建一个私密的
    let gist = null;
    for (let page = 1; page <= 5 && !gist; page++) {
      const list = await gh('/gists?per_page=100&page=' + page, {}, token); if (!list.length) break;
      const hit = list.find(g => g.files && g.files[GFILE]); if (hit) gist = hit.id;
    }
    const cfg = { token, gist, login: me.login };
    if (!gist) { const g = await gh('/gists', { method: 'POST', body: JSON.stringify({ description: 'ChordMatter 练琴记录（自动同步）', public: false, files: { [GFILE]: { content: JSON.stringify(S) } } }) }, token); cfg.gist = g.id; cfg.at = Date.now(); cloudSet(cfg); return 'new'; }
    cloudSet(cfg); return (await cloudPull(true)) || 'linked';
  }
  // 拉：云端比本机新就用云端（覆盖前在 IndexedDB 留一份本机的）
  async function cloudPull(first) {
    const cfg = cloudCfg(); if (!cfg || !cfg.gist || CL.busy) return null;
    CL.busy = true;
    try {
      const o = await gistRead(cfg); cfg.at = Date.now(); cloudSet(cfg); CL.msg = '';
      if (o && typeof o === 'object' && 'xp' in o && (o.savedAt || 0) > (S.savedAt || 0)) {
        await IDB.put('before-cloud', JSON.stringify(S)).catch(() => {});
        S = migrate(o); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} mirror();
        if (typeof render === 'function') render(); return 'pulled';
      }
      if (first || !o || (S.savedAt || 0) > (o.savedAt || 0)) { CL.busy = false; await cloudPush(); }
      return 'same';
    } catch (e) { CL.msg = e.status === 401 ? '令牌失效了，请重新连接' : '暂时连不上，稍后会再试'; return null; }
    finally { CL.busy = false; cloudPaint(); }
  }
  async function cloudPush() {
    const cfg = cloudCfg(); if (!cfg || !cfg.gist || CL.busy) return;
    CL.busy = true;
    try { await gh('/gists/' + cfg.gist, { method: 'PATCH', body: JSON.stringify({ files: { [GFILE]: { content: JSON.stringify(S) } } }) }, cfg.token); cfg.at = Date.now(); cloudSet(cfg); CL.msg = ''; }
    catch (e) { CL.msg = e.status === 401 ? '令牌失效了，请重新连接' : '暂时连不上，联网后会自动补传'; }
    finally { CL.busy = false; cloudPaint(); }
  }
  function cloudQueue() { if (!cloudCfg() || 'HX_PRESEED' in window) return; clearTimeout(CL.timer); CL.timer = setTimeout(cloudPush, 4000); }
  // 打开 App、切回前台时拉一次；切到后台时把没传的立刻传上去
  setTimeout(() => cloudPull(), 800);
  document.addEventListener('visibilitychange', () => { if (!cloudCfg()) return; if (document.visibilityState === 'visible') cloudPull(); else if (CL.timer) { clearTimeout(CL.timer); CL.timer = null; cloudPush(); } });
  function cloudPaint() {
    const el = document.getElementById('cloudbox'); if (!el) return;
    if ('HX_PRESEED' in window) { el.innerHTML = '<p class="fine">这里是预览版，连不了 GitHub。云端同步请在网站版用：<a href="https://ginagina19992023.github.io/ChordMatter/#me" target="_blank" rel="noopener">ginagina19992023.github.io/ChordMatter</a></p>'; return; }
    const c = cloudCfg();
    el.innerHTML = c ? `<p>已连接 GitHub：<b>${c.login || ''}</b> · ${CL.busy ? '同步中…' : c.at ? '上次同步 ' + new Date(c.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '还没同步'}</p>${CL.msg ? `<p class="no">${CL.msg}</p>` : ''}<div class="pills"><button class="pill" data-act="cloudsync">现在同步</button><button class="pill" data-act="cloudoff">断开</button></div><p class="fine">练习一结束就自动传上去；在别的手机 / 电脑打开这个网址，用同一个令牌连接，记录会自动接上。</p>`
      : `<p class="fine">把练习记录存到你自己 GitHub 账号里的一个私密 Gist：换手机、清缓存都不会丢，几台设备之间自动同步。</p><ol class="fine cloudsteps"><li><a href="https://github.com/settings/tokens/new?scopes=gist&description=ChordMatter%20%E5%90%8C%E6%AD%A5" target="_blank" rel="noopener">点这里生成令牌</a>（只勾 gist 这一项，过期时间可以选 No expiration）</li><li>复制生成的 ghp_… 令牌，粘到下面</li></ol><div class="row"><input id="cloudtoken" type="password" autocomplete="off" placeholder="ghp_…"><button class="btn" data-act="cloudconnect">连接</button></div>${CL.msg ? `<p class="no">${CL.msg}</p>` : ''}`;
  }
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
  const symSt = card => !symDone(card.id) || (S.sym && S.sym[card.id] === 'skip') ? 0 : !needsPiano(card) ? 3 : PK.state('sym:' + card.id) === 2 ? 2 : 1;
  const symTag = card => { if (S.sym && S.sym[card.id] === 'skip') return '<span class="pk">已跳过 · 没学</span>'; const st = symSt(card); return st === 3 ? '<span class="pk pk2">已学 · 不用上琴</span>' : pkTag(st); };
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
      // 离开 App 再回来，iPhone 会把声音通道挂起/打断，有时怎么叫都叫不醒：回来后的第一次触摸，直接换一个全新的声音通道
      if (this.ctx && (this.stale || this.ctx.state === 'closed' || this.ctx.state === 'interrupted')) { try { this.ctx.close(); } catch (e) {} this.ctx = null; this.stale = false; }
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        this.ctx = new C();
        this.out = this.ctx.createDynamicsCompressor();
        this.vol = this.ctx.createGain(); this.vol.gain.value = 0.9;
        this.out.connect(this.vol).connect(this.ctx.destination);
        this.bus = this.ctx.createGain(); this.bus.connect(this.out);
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
      lp.connect(g).connect(this.bus);
    },
    // 停掉所有已经排好的音：把旧的总线快速淡出后断开，换一条新的
    cut() {
      if (!this.ctx || !this.bus) return;
      const old = this.bus, now = this.ctx.currentTime;
      old.gain.cancelScheduledValues(now); old.gain.setValueAtTime(old.gain.value, now); old.gain.linearRampToValueAtTime(0, now + 0.04);
      setTimeout(() => { try { old.disconnect(); } catch (e) {} }, 80);
      this.bus = this.ctx.createGain(); this.bus.connect(this.out);
    },
    chord(midis, t = 0, spread = 0, dur) { midis.forEach((m, i) => this.note(m, t + i * spread, dur)); },
    tone(midi, t = 0, dur = 0.5) {
      this.init();
      const c = this.ctx, st = c.currentTime + 0.02 + t, f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain(), o = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'triangle'; o2.frequency.value = f; g2.gain.value = 0.25;
      const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 5.2; vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(0.22, st + 0.04); g.gain.setValueAtTime(0.2, st + Math.max(0.05, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, st + dur + 0.05);
      o.connect(g); o2.connect(g2).connect(g); g.connect(this.bus);
      [o, o2, vib].forEach(x => { x.start(st); x.stop(st + dur + 0.1); });
    },
    click(t, accent) {
      this.init();
      const c = this.ctx, st = c.currentTime + t, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = accent ? 1760 : 1180; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, st + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05);
      o.connect(g).connect(this.bus); o.start(st); o.stop(st + 0.06);
    },
  };
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let metro = null;
  function stopAll() { A.cut(); timers.forEach(clearTimeout); timers = []; if (metro) { clearInterval(metro.id); metro = null; } document.querySelectorAll('.k.on-play,.bar.on-play').forEach(e => e.classList.remove('on-play')); }
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
    if (!ms.length && !o.lo) { lo = 60; hi = 83; }
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
        whites.push(`<g><rect class="k w${n ? ' on' : ''}${n && n.dim ? ' dim' : ''}${n && n.lh ? ' lh' : ''}${n && n.cls ? ' ' + n.cls : ''}"${o.tap ? ' data-act="key"' : ''} data-m="${m}" x="${xs[m] + 0.5}" y="0.5" width="${W - 1}" height="${H}" rx="2"/>` +
          (n && n.f ? `<text class="fn${n.lh ? ' fl' : ''}${n.cls ? ' ' + n.cls : ''}" x="${xs[m] + W / 2}" y="${H - 9}">${n.f}</text>` : '') +
          (pc === 0 && !n ? `<text class="cl" x="${xs[m] + W / 2}" y="${H - 8}">C${m / 12 - 1}</text>` : '') + '</g>');
      } else {
        const bx = xs[m - 1] + W - BW / 2;
        blacks.push(`<g><rect class="k b${n ? ' on' : ''}${n && n.dim ? ' dim' : ''}${n && n.lh ? ' lh' : ''}${n && n.cls ? ' ' + n.cls : ''}"${o.tap ? ' data-act="key"' : ''} data-m="${m}" x="${bx}" y="0.5" width="${BW}" height="${BH}" rx="1.5"/>` +
          (n && n.f ? `<text class="fn fb${n.cls ? ' ' + n.cls : ''}" x="${bx + BW / 2}" y="${BH - 8}">${n.f}</text>` : '') + '</g>');
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
    drillStop(); alStop(); stopAll(); Roll.stop(); SELB.on = false; { const ov = document.querySelector('.rollfs'); if (ov) { ov.remove(); document.body.classList.remove('immersive'); } } document.querySelectorAll('.giftov, .cpop, .tpop').forEach(x => x.remove());
    document.body.classList.toggle('focus', ['quiz', 'arp', 'mem', 'sing', 'acctest'].includes(r) || (['sym', 'inv', 'logic', 'sight'].includes(r) && route[1]));
    document.querySelectorAll('nav a').forEach(x => { if (['know', 'sym', 'inv', 'logic', 'sight'].includes(r) && x.dataset.r === 'path') x.classList.add('on'); if ((r === 'score' || r === 'scan' || r === 'acc' || r === 'sing' || r === 'acctest') && x.dataset.r === 'songs') x.classList.add('on'); if (r === 'me' && x.dataset.r === 'set') x.classList.add('on'); });
    ({ today: vToday, path: vPath, unit: vUnit, chords: vChords, songs: vSongs, song: vSong, edit: vEdit, quiz: vQuiz, arp: vArp, mem: vMem, me: vMe, acc: vAcc, sing: vSing, acctest: vAccTest, know: vKnow, score: vScore, scan: vScan, pk: vPk, browse: vBrowse, along: vAlong, cmp: vCmp, combo: vCombo, sym: vSym, inv: vInv, cards: vCards, logic: vLogic, sight: vSight, set: vSet }[r] || vToday)();
    cxGlobalDark(); if (!['chords', 'combo'].includes(r)) document.body.classList.remove('cxdark'); else if (r === 'combo') cxTheme(null);
    try { linkChords(view); linkTerms(view); } catch (e) {} // 立即给文字加下划线，不等谱面画完
    document.body.classList.toggle('nolab', S.lab === false);
    pbarPaint();
    navRestoreScroll();
    if (['song', 'cmp', 'score'].includes(r) && !view.querySelector('.dock')) view.insertAdjacentHTML('beforeend', dockHtml());
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
      <section class="calcard"><div class="calcard-h"><b>练琴日历</b><small>一天一小节 · 越高练得越久</small><a class="pill" href="#me-cal">看整个月 →</a></div>
        <a class="calweek" href="#me-cal">${calHtml(calWeeks(new Date().getFullYear(), new Date().getMonth(), today()), true)}</a>
        <div class="pills"><button class="pill" data-act="shareday" data-v="${today()}">导出今天的音符 · 分享卡片</button></div></section>
      ${cardBox()}
      <ol class="steps">${steps.map(([k, t, s, h], i) => `<li><a href="${h}" class="${d[k] ? 'done' : ''}"><span class="dot">${d[k] ? '✓' : i + 1}</span><span><b>${t}</b><small>${esc(s)}${d[k] ? (d[k + 'M'] === 'away' ? ' · 今天在屏幕上完成' : d[k + 'M'] === 'piano' ? ' · 今天在琴上完成' : '') : ''}</small></span><span class="arr">→</span></a></li>`).join('')}</ol>
      ${todoBox()}
      <a class="unitbar" href="#unit-${cur.id}"><small>当前单元</small><b>${cur.n} ${cur.title}</b><span class="meter"><i style="width:${mastery(cur.id)}%"></i></span><small>${mastery(cur.id)}% · 达到 80% 自动解锁下一单元</small></a>
      <section class="bonus${n === 4 ? ' ready' : ''}"><small>加练 · 即兴伴奏${d.acc ? ' · 今日已考 ✓' : ''}</small><div class="row"><a class="ghost" href="#sight-piece">视奏一条 · 约 2 分钟</a><a class="ghost" href="#acctest">考一段配和弦</a><a class="ghost" href="#sing-${SING[dayNum(today()) % SING.length].id}">跟弹 · 唱《${SING[dayNum(today()) % SING.length].title}》</a></div></section>`;
  }
  // 有钢琴 / 没钢琴：只在页眉右上角切换（全局），页面里不再单独放选择
  function modeSwitch() { return ''; }
  // 五线谱每行几小节（手调，全局记住）
  const perRowChips = () => `<span class="seg perrow"><small>每行</small>${[2, 3, 4].map(n => `<button class="${(S.perRow || 4) === n ? 'on' : ''}" data-act="perrow" data-v="${n}">${n}</button>`).join('')}</span>`;
  if (typeof window !== 'undefined') window.HX_PERROW = S.perRow || 0;
  function pbarPaint() {
    let bar = document.getElementById('pbar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'pbar'; (document.getElementById('phone') || document.body).prepend(bar); }
    const on = place() === 'piano';
    const cu = currentUnit();
    bar.innerHTML = `${cu ? `<a class="pcur" href="#unit-${cu.id}">当前单元：${cu.n} ${esc(cu.title)} ›</a>` : ''}<button class="pbadge${on ? ' on' : ''}" data-act="placetoggle" aria-label="切换有没有钢琴">${on ? '🎹 有钢琴' : '没钢琴'}</button>`;
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
      <a class="unitbar sym1" href="#sight"><small>视奏 · 今天 ${(S.log || []).filter(e => e.t === 'sightp' && e.d === today()).length} 条</small><b>视奏：${S.sightGrade || 5} 级小曲，预读 30 秒后一口气弹</b><small>每次一首没见过的 8 小节双手小曲 · 收音按小节评音准和节奏 · 另有基础认音 14 关</small></a>
      <a class="unitbar sym1" href="#combo"><small>一串一串记</small><b>组合和弦：4536、1564、2–5–1……</b><small>把常用的一串和弦当成一个词记 · 抠掉一个换成「稳 / 走 / 紧」，变出新的进行</small></a>
      <a class="unitbar" href="#know"><small>看不懂符号？</small><b>知识点：从「C、G7 是什么」到「一级二级三级」</b></a>
      <ol class="path">${UNITS.map(u => {
        const st = unitState(u.id).done ? 'done' : u === cur ? 'cur' : unlocked(u) ? '' : 'lock';
        return `<li class="${st}"><a href="${st === 'lock' ? '#path' : '#unit-' + u.id}"><span class="node">${st === 'done' ? '✓' : u.n}</span><span><b>${u.title}</b><small>${u.en}${st === 'lock' ? ' · 未解锁' : unitState(u.id).skipped ? ' · 已跳过' : ' · ' + mastery(u.id) + '%'}</small></span></a></li>`;
      }).join('')}</ol>
      <p class="fine">规则：单元最近 10 题以上、正确率 ≥ 80% 即掌握，自动解锁下一单元。已掌握的单元会在每日练习里按薄弱程度自动复习。</p>`;
  }

  function renderBlocks(blocks, key = 'C') {
    return blocks.map(b => {
      if (b.t === 'p') return `<p>${b.x}</p>`;
      if (b.t === 'tip') return `<p class="tip">${b.x}</p>`;
      if (b.t === 'chord') return chordCard(b.s);
      if (b.t === 'prog') return progRow(b.k, b.c);
      if (b.t === 'video') return `<figure class="vclip${b.tall ? ' tall' : ''}"><video controls playsinline preload="metadata" poster="${b.poster}" src="${b.src}"${/media\/demo-[a-z]+\.mp4$/.test(b.src) ? ` data-light="${b.src}" data-lightp="${b.poster}" data-dark="${b.src.replace('.mp4', '-dark.mp4')}" data-darkp="${b.poster.replace('.jpg', '-dark.jpg')}"` : ''}>${b.vtt ? `<track kind="subtitles" srclang="zh" label="中文" src="${b.vtt}" default>` : ''}</video><figcaption><b>${b.title}</b><small>${b.credit}${b.url ? ` · <a href="${b.url}" target="_blank" rel="noopener">原视频 ↗</a>` : ''}</small></figcaption></figure>`;
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
      <div class="cta"><button class="btn" data-act="lesson-done" data-u="${u.id}">${fromToday ? '继续 · 做题 →' : '练这个单元 8 题'}</button></div>
      ${unitState(u.id).done ? '' : `<button class="skipbtn" data-act="unitskip" data-u="${u.id}">这个单元我已经会了，跳过 →</button>`}`;
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
  const CX = { root: 'C', q: '', inv: 0, hand: 'R', pat: 'block', lastH: null };
  // 每种和弦一个固定的色彩：[深色, 浅色]（深色 = 挪了/新加的音，浅色 = 没动的音）
  const QHUE = { '': ['#a35f00', '#f2c45c', '#5a3d0b', '#2e2008', '#17110a', '#ffc857'], m: ['#2f6fdb', '#a9c6f3', '#1c3560', '#141f38', '#0c1220', '#7cb8ff'], dim: ['#7a4fd0', '#cdb9f1', '#3d2466', '#22163d', '#130d22', '#c9a6ff'], aug: ['#0b7a72', '#9ad9d3', '#0f4a47', '#0e2a29', '#0a1717', '#5ee0d4'], '7': ['#d9480f', '#f5b08a', '#5c2410', '#2e170e', '#170d09', '#ff9a62'], maj7: ['#c2417a', '#f0b0cd', '#5a2140', '#2e1424', '#170b12', '#ff9cc8'], m7: ['#4a5bd6', '#b0b8f3', '#26306a', '#171c3d', '#0d1022', '#9aa8ff'], m7b5: ['#3f7a60', '#b0d2c0', '#1f4034', '#13261f', '#0b1511', '#8fd0aa'], dim7: ['#c0283a', '#efaab2', '#5a1f24', '#2a1215', '#170a0c', '#ff6b7c'], sus4: ['#5c7a00', '#d3e38f', '#3d4a0e', '#212809', '#121505', '#c6e45c'] };
  const REF_SONGS = {"": [{"t": "Twist and Shout（扭腰舞）· The Beatles", "w": "副歌 D – G – A，都是大三和弦", "k": "D 大调", "u": "https://hooktheory.com/theorytab/view/the-beatles/twist-and-shout", "c": "ok"}, {"t": "Wild Thing · The Troggs", "w": "主歌 A – D – E – D", "k": "A 大调", "u": "https://hooktheory.com/theorytab/view/the-troggs/wild-thing", "c": "ok"}, {"t": "Johnny B. Goode · Chuck Berry", "w": "主歌和副歌 B♭ – E♭ – B♭ – F", "k": "B♭ 大调", "u": "https://hooktheory.com/theorytab/view/chuck-berry/johnny-b-goode", "c": "ok"}], "m": [{"t": "Eleanor Rigby · The Beatles", "w": "主歌在 Em 和 C 之间走，Em 是主和弦", "k": "E 小调", "u": "https://hooktheory.com/theorytab/view/the-beatles/eleanor-rigby", "c": "ok"}, {"t": "想见恨晚 · 彭佳慧", "w": "主歌以 C♯m 为主和弦", "k": "C♯ 小调", "u": "https://www.hooktheory.com/theorytab/view/julia-peng/xiang-jian-hen-wan", "c": "ok"}, {"t": "Hotel California · Eagles", "w": "主歌、尾声从 Bm 开始", "k": "B 小调", "u": "https://hooktheory.com/theorytab/view/eagles/hotel-california", "c": "mid"}], "aug": [{"t": "Oh! Darling · The Beatles", "w": "开头那一个和弦是 Eaug，下一步解决到 A", "k": "A 大调", "u": "https://www.jonmaclennan.com/blog/oh-darling-chords", "c": "ok"}], "7": [{"t": "Fly Me to the Moon · Bart Howard", "w": "Am7 – Dm7 – G7 – Cmaj7，G7 在第 3 小节", "k": "C 大调", "u": "https://www.learnjazzstandards.com/blog/fly-me-to-the-moon-chords/", "c": "ok"}, {"t": "Over the Rainbow · Harold Arlen", "w": "乐句末 Dm – G7 – C，G7 回到主和弦之前", "k": "C 大调", "u": "https://www.guitartabsexplorer.com/garland-judy/over-the-rainbow-chords", "c": "mid"}], "maj7": [{"t": "Imagine · John Lennon", "w": "开头 C – Cmaj7 – F，Cmaj7 是第 2 个和弦", "k": "C 大调", "u": "https://www.classicfm.com/discover-music/harmonic-analysis-imagine-john-lennon/", "c": "ok"}, {"t": "Fly Me to the Moon · Bart Howard", "w": "Am7 – Dm7 – G7 – Cmaj7，Cmaj7 是第 4 小节的落点", "k": "C 大调", "u": "https://www.learnjazzstandards.com/blog/fly-me-to-the-moon-chords/", "c": "ok"}, {"t": "Over the Rainbow · Harold Arlen", "w": "主歌第二句 C – Cmaj7 – Csus – Dm", "k": "C 大调", "u": "https://www.guitartabsexplorer.com/garland-judy/over-the-rainbow-chords", "c": "mid"}], "m7": [{"t": "Fly Me to the Moon · Bart Howard", "w": "A 段第一小节 Am7，后面还有 Dm7", "k": "C 大调", "u": "https://www.guitarcomposerstoolbox.com/jazz-standards/fly-me-to-the-moon-in-c", "c": "ok"}, {"t": "Autumn Leaves（枯叶）· Joseph Kosma", "w": "第一小节 Cm7，接 F7 和 B♭maj7", "k": "G 小调", "u": "https://www.guitarcomposerstoolbox.com/jazz-standards/autumn-leaves-in-g", "c": "mid"}], "m7b5": [{"t": "Autumn Leaves（枯叶）· Joseph Kosma", "w": "A 段第 5 个和弦 Am7♭5 → D7 → Gm", "k": "G 小调", "u": "https://www.guitarcomposerstoolbox.com/jazz-standards/autumn-leaves-in-g", "c": "ok"}, {"t": "Blue Bossa · Kenny Dorham", "w": "第 3 个和弦 Dm7♭5 → G7♭9 → Cm7", "k": "C 小调", "u": "https://www.guitarcomposerstoolbox.com/jazz-standards/blue-bossa-in-c", "c": "ok"}, {"t": "Fly Me to the Moon · Bart Howard", "w": "A 段第 6 个和弦 Bm7♭5 → E7♭9 → Am7", "k": "C 大调", "u": "https://www.guitarcomposerstoolbox.com/jazz-standards/fly-me-to-the-moon-in-c", "c": "ok"}], "dim7": [{"t": "I Got Rhythm · George Gershwin", "w": "C C/E | F F♯dim7 | C/G A7：F♯dim7 夹在 F 和 C/G 之间当过渡", "k": "C 大调", "u": "https://en.wikipedia.org/wiki/Diminished_seventh_chord", "c": "ok"}, {"t": "All Those Years Ago · George Harrison", "w": "D – Em – Edim7 – D，Edim7 是过渡和弦", "k": "D 大调（按和弦推出）", "u": "https://www.secretsofsongwriting.com/2018/03/23/using-the-diminished-seventh-chord-in-your-progressions/", "c": "mid"}], "sus4": [{"t": "Wonderwall · Oasis", "w": "前奏和主歌 Em7 – G – Dsus4 – A7sus4（按带变调夹的和弦谱写法）", "k": "", "u": "https://guitartabs.cc/tabs/o/oasis/wonderwall_crd_ver_8.html", "c": "ok"}]};
  const CX_ZH = { '': '大三', m: '小三', dim: '减三', aug: '增三', '7': '属七', maj7: '大七', m7: '小七', m7b5: '半减七', dim7: '减七', sus4: '挂四' };
  const CX_Q = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'sus4'];
  const cxHue = q => QHUE[q] || QHUE[''];
  const hueVars = h => `--h:${h[0]};--hm:${h[1]};--hs0:${h[2]};--hs1:${h[3]};--hs2:${h[4]};--ha:${h[5]}`;
  const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  // 和弦相关页面：深色跟着手机主题；整页的色彩跟着和弦走（body 上的变量会渐变）
  function cxGlobalDark() { const d = isDarkTheme(); document.body.classList.toggle('dark', d); document.querySelectorAll('video[data-dark]').forEach(v => { const want = d ? v.dataset.dark : v.dataset.light; if (v.getAttribute('src') !== want) { v.setAttribute('src', want); v.setAttribute('poster', d ? v.dataset.darkp : v.dataset.lightp); } }); const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', d ? '#141210' : '#ffffff'); }
  const isDarkTheme = () => S.theme === 'dark' || (S.theme !== 'light' && !!darkMQ.matches);
  function cxTheme(q) {
    const b = document.body, h = q == null ? ['#555555', '#cccccc', '#26231f', '#1c1a17', '#141210', '#e8e0d4'] : cxHue(q);
    b.classList.toggle('cxdark', isDarkTheme() && ['chords', 'combo'].includes(route[0]));
    cxGlobalDark();
    b.classList.toggle('cxpage', q != null && route[0] === 'chords' && !!route[1]);
    { const mt = document.querySelector('meta[name=theme-color]'); if (mt && b.classList.contains('cxpage')) mt.setAttribute('content', isDarkTheme() ? h[2] : h[1]); }
    ['--h', '--hm', '--hs0', '--hs1', '--hs2', '--ha'].forEach((k, n) => b.style.setProperty(k, h[n]));
  }
  const CX_PATS = () => [PATTERNS[4][0], PATTERNS[4][2], PATTERNS[4][3], PATTERNS[3][1], PATTERNS[4][1]];
  const CX_PAT_NAME = { block: '柱式', broken: '逐键', alberti: '阿尔贝蒂', waltz: '华尔兹', oom: '低音+和弦' };
  const CX_LAB = { '': ['1', '3', '5'], m: ['1', '♭3', '5'], dim: ['1', '♭3', '♭5'], aug: ['1', '3', '♯5'], '7': ['1', '3', '5', '♭7'], maj7: ['1', '3', '5', '7'], m7: ['1', '♭3', '5', '♭7'], m7b5: ['1', '♭3', '♭5', '♭7'], dim7: ['1', '♭3', '♭5', '♭♭7'], sus4: ['1', '4', '5'] };
  const CX_STORY = { '': '1 · 3 · 5，最基本的三个音', m: '3 往下挪半音', dim: '3 和 5 都往下挪', aug: '5 往上挪半音', '7': '大三和弦，再加 ♭7', maj7: '大三和弦，再加 7', m7: '小三和弦，再加 ♭7', m7b5: '减三和弦，再加 ♭7', dim7: '3 和 5 都往下挪，再加 ♭♭7', sus4: '3 往上挪成 4' };
  const cxPath = dy => `M0 25 H12 C32 25 32 ${25 + dy} 52 ${25 + dy} H64`; // 前一小段平、中间一条弧、最后一小段平
  const CX_DL = 64, CX_DU = 7; // 度数线：水平长度 / 每个半音升降的像素
  const CX_INV = ['原位', '一转', '二转', '三转'];
  // 一个音是「根音 / 没动 / 挪了」：和大三和弦（1-3-5）比，七音一律算新加的
  function cxRole(c, i) { if (i === 0) return 'rt'; const se = c.quality.ints[i][1]; return (i >= 3 || se !== [0, 4, 7][i]) ? 'mv' : 'st'; }
  function cxPlay(el) {
    const c = T.build(CX.root, CX.q, Math.min(CX.inv, T.Q[CX.q].ints.length - 1));
    const pat = CX_PATS().find(p => p.id === CX.pat) || PATTERNS[4][0], beats = pat.id === 'waltz' ? 3 : 4, spb = 60 / 84;
    stopAll(); A.init();
    // 按当前转位弹：最低的音就是这个转位的低音，其余的音按显示的排法
    const m = T.voicing(c, 48).map(n => n.midi), pick = { R: [m[0]], 3: [m[1]], 5: [m[2]], 8: [m[0] + 12], 10: [m[1] + 12], C: m, RC: [m[0] - 12].concat(m) };
    const evs = pat.ev.map(([t, code, d]) => ({ t, d, keys: (pick[code] || [m[0]]).map(x => ({ midi: x })) }));
    for (let bar = 0; bar < 2; bar++) evs.forEach(e => {
      const t = (bar * beats + e.t) * spb + 0.03;
      A.chord(e.keys.map(k => k.midi), t, pat.id === 'block' ? 0.012 : 0.005, e.d * spb * 1.05);
      later(() => document.querySelectorAll('.cxview .kb .k.on, .cxmini .kb .k.on').forEach(k => k.classList.toggle('on-play', e.keys.some(x => x.midi % 12 === (+k.dataset.m) % 12))), t * 1000);
    });
    later(() => document.querySelectorAll('.cxview .kb .k.on-play, .cxmini .kb .k.on-play').forEach(k => k.classList.remove('on-play')), (2 * beats * spb + 0.3) * 1000);
    if (el) { el.classList.add('flash'); later(() => el.classList.remove('flash'), 300); }
  }
  function vChords() {
    if (!route[1]) return vLib();
    const oldK = {}; document.querySelectorAll('.cxview .kb .k').forEach(k => { oldK[k.dataset.m] = k.getAttribute('class'); });
    const oldDy = {}; document.querySelectorAll('.cxdeg .dr[data-dy]').forEach(r => { oldDy[r.dataset.i] = +r.dataset.dy; });
    { const sig = route.join('-'); if (CX.sig !== sig) { CX.sig = sig; const r = decodeURIComponent(route[1]); if (ROOT_MAJ.includes(r)) CX.root = r; if (route[2] != null) CX.q = route[2] === '_' ? '' : route[2]; if (!T.Q[CX.q]) CX.q = ''; CX.inv = 0; } }
    const c = T.build(CX.root, CX.q, Math.min(CX.inv, T.Q[CX.q].ints.length - 1));
    const v = T.voicing(c), fg = T.blockFingers(c, CX.hand === 'L' ? 'L' : 'R');
    const fgR = T.blockFingers(c, 'R'), fgL = T.blockFingers(c, 'L');
    const lhV = v.map(n => Object.assign({}, n, { midi: n.midi - 12 }));
    const role = n => cxRole(c, n.deg);
    const showN = CX.hand === 'B' ? lhV.map((n, i) => ({ midi: n.midi, name: n.name, f: fgL[i], lh: 1, cls: role(n) })).concat(v.map((n, i) => ({ midi: n.midi, name: n.name, f: fgR[i], cls: role(n) })))
      : CX.hand === 'L' ? lhV.map((n, i) => ({ midi: n.midi, name: n.name, f: fgL[i], lh: 1, cls: role(n) })) : v.map((n, i) => ({ midi: n.midi, name: n.name, f: fgR[i], cls: role(n) }));
    const inSongs = allSongs().filter(s => s.sections.some(sec => parseBars(sec.bars).flat().some(x => { const p = T.parseChord(x); return p && p.root.pc === c.root.pc && p.q === c.q; })));
    const arp = T.arpeggio(T.parseChord(CX.root + CX.q), 'R');
    const qlist = ['', 'm', 'dim', 'aug', '7', 'maj7', 'm7', 'm7b5', 'dim7', 'sus4'];
    const QINFO = {
      '': ['大三', '明亮、稳定', '大三度 + 小三度，最常见'], m: ['小三', '暗淡、柔和', '只把大三的中间音降半音'], dim: ['减三', '紧张、不安', '两个小三度叠起来'], aug: ['增三', '飘、像梦', '两个大三度叠起来'],
      '7': ['属七', '紧张，想回家', '大三 + 小七度，五级常用'], maj7: ['大七', '柔和、高级感', '大三 + 大七度'], m7: ['小七', '温柔、爵士感', '小三 + 小七度'],
      m7b5: ['半减七', '忧郁、悬着', '减三 + 小七度'], dim7: ['减七', '悬疑、戏剧化', '每两个音都隔小三度'], sus4: ['挂四', '悬而未决', '三音换成四音，等着落回大三'],
    };
    const INV = [['原位', '根音在最下面'], ['一转', '三音在最下面'], ['二转', '五音在最下面'], ['三转', '七音在最下面']];
    cxTheme(CX.q);
    S.cxLast = { r: CX.root, q: CX.q }; clearTimeout(CX.st); CX.st = setTimeout(save, 600); // 记住停在哪个和弦
    const qi = QINFO[CX.q], invi = Math.max(0, c.inv);
    const bigN = showN.map(n => Object.assign({}, n, { f: D(n.name) }));
    const curL = CX_LAB[CX.q];
    const nbrs = qlist.filter(q => q !== CX.q).map((q, k) => { const L = CX_LAB[q], add = L.filter(x => !curL.includes(x)), rem = curL.filter(x => !L.includes(x)); return { q, k, d: Math.max(add.length, rem.length) * 10 + add.length + rem.length, note: (rem.length ? rem.join(' ') + ' → ' : '') + (add.length ? (rem.length ? '' : '加 ') + add.join(' ') : '去掉 ' + rem.join(' ')) }; }).sort((x, y) => x.d - y.d || x.k - y.k).slice(0, 3);
    const bottom = v[0];
    view.innerHTML = `<a class="cxback" href="#chords">← 和弦</a><div class="cxsent" id="cxsent"></div>
      <div class="cxsticky" id="cxst">
        <div class="cxhead"><div class="cxname"><b class="${D(c.sym).replace(/<[^>]*>/g, '').length >= 5 ? 'long' : ''}">${D(c.sym)}</b><span>${qi[0]}和弦${invi ? ' · ' + INV[invi][0] : ''} · ${qi[1]}</span></div>
          <button class="cxhold" data-hold="inv" aria-label="转位：按住往下拖可以选">↻ ${CX_INV[invi]}</button><button class="cxhold go" data-hold="pat" aria-label="弹奏：点一下弹，按住往下拖选弹法">弹 <small>${CX_PAT_NAME[CX.pat]}</small></button></div>
        <div class="cxmini">${kb(showN.map(n => ({ midi: n.midi, cls: n.cls })), { lo: CX.hand === 'R' ? 60 : 48, hi: CX.hand === 'R' ? 83 : CX.hand === 'L' ? 71 : 83 }).replace('<svg class="kb"', '<svg class="kb" preserveAspectRatio="none"')}</div>
      </div>
      <section class="cxtop" id="cxtop">
        <p class="cxhint">按住「↻」或「弹」往下拖，可以选转位 / 弹法</p>
        <p class="cxstory">${CX_STORY[CX.q]}</p>
        <div class="cxdeg">${[3, 2, 1, 0].map(k => {
          const i = k, sl = ['1', '3', '5', '7'][i], n = c.notes[i];
          if (!n) return `<div class="dr none" data-i="${i}"><span class="dn">${sl}</span><span class="dstart"></span><svg class="dline" width="64" height="50" viewBox="0 0 64 50"><path d="M0 25 H64"/></svg></div>`;
          const alt = c.quality.ints[i][1] - [0, 4, 7, 11][i], role = cxRole(c, i), dy = -alt * CX_DU;
          const sub = i === 0 ? '根音' : i === 3 ? '新加的音' + (alt ? ' · 比 7 低 ' + (-alt === 1 ? '半音' : -alt + ' 个半音') : '') : role === 'st' ? '不动' : (alt < 0 ? '往下挪 ' : '往上挪 ') + (Math.abs(alt) === 1 ? '半音' : Math.abs(alt) + ' 个半音');
          return `<div class="dr ${role}" data-i="${i}" data-dy="${dy}"><span class="dn">${sl}</span><span class="dstart"></span><svg class="dline" width="64" height="50" viewBox="0 0 64 50"><path d="${cxPath(dy)}"/></svg><span class="dmove" style="transform:translateY(${dy}px)"><span class="dc ${role}">${CX_LAB[CX.q][i]}</span><span class="dt"><b>${D(n.name)}</b><small>${sub}</small></span></span></div>`;
        }).join('')}<div class="cxrail" id="cxrail" aria-label="性质滑条：上下拖动换和弦性质">${CX_Q.map((q, i) => `<i class="qt${q === CX.q ? ' on' : ''}" style="top:${(10 + i * 18).toFixed(0)}px;background:${QHUE[q][0]}"></i>`).join('')}<b class="qthumb" style="top:${(10 + CX_Q.indexOf(CX.q) * 18 - 14).toFixed(0)}px">${CX_ZH[CX.q]}</b></div></div>
        <div class="cxview">${kb(bigN, { lo: CX.hand === 'R' ? 60 : 48, hi: CX.hand === 'R' ? 83 : CX.hand === 'L' ? 71 : 83 })}</div>
        <div class="cxnbs"><span>只动一点，就变成</span>${nbrs.map(x => `<button class="nb" data-act="cx" data-k="q" data-v="${x.q}"><i class="qd" style="background:${QHUE[x.q][0]}"></i><b>${D(CX.root + x.q)}</b><small>${x.note}</small></button>`).join('')}</div>
        <p class="cxline"><span class="cxlt">${CX.hand !== 'R' ? '<span class="lhc">左手 ' + fgL.join('-') + '</span> ' : ''}${CX.hand !== 'L' ? '右手 ' + fgR.join('-') : ''} · ${c.quality.f}</span><span class="hseg" role="group" aria-label="左右手">${[['L', '左'], ['R', '右'], ['B', '双']].map(([v, t]) => `<button class="${CX.hand === v ? 'on' : ''}" data-act="cx" data-k="hand" data-v="${v}" aria-label="${t}手">${t}</button>`).join('')}</span></p>
        <details class="cxstaff"><summary>看谱</summary>${Staff.html({ bars: [[c.sym]], numerals: false, perRow: 1, minBar: 60, exact: true, notes: showN.map(n => ({ name: n.name, midi: n.midi, lh: n.lh ? 1 : 0 })) })}</details>
      </section>
      <p class="explain"><b>${D(c.sym)}</b>：以 ${D(c.root.name)} 为根音的${c.quality.zh}，${qi[2]}，听起来${qi[1]}。${invi ? `${INV[invi][0]}：最下面弹 ${D(bottom.name)}（${INV[invi][1]}），所以写成 ${D(c.sym)}，斜线后面就是最低音。` : '原位：根音 ' + D(c.root.name) + ' 在最下面。'}键盘上的数字是手指（1 = 拇指，5 = 小指）${CX.hand === 'B' ? '，蓝色是左手（低八度），橙色是右手' : CX.hand === 'L' ? '，左手在低八度' : ''}。<a href="#know-k0">看不懂？</a></p>
      ${pager('chord', [
        ['小进行', `${(() => { const ctx = chordContext(c); return ctx ? `<h3>先在小进行里听它</h3><p class="fine">${ctx[1]} · 点一下听，跟着弹</p>${progRow(c.root.name, ctx[0])}<div class="pills"><button class="pill rlprog" data-act="rollprog" data-k="${esc(c.root.name)}" data-c="${esc(ctx[0].join(','))}" data-t="${esc(ctx[0].map(D).join(' → '))}">▶ 跟练这个小进行 · 全屏</button></div>` : '<p class="fine">这个和弦没有常用的小进行。</p>'; })()}`],
        ['曲子里', `${refSongHtml(c)}<h3>在曲子里找到它</h3>${chordFinds(c)}<a class="link" href="#browse-${encodeURIComponent(c.root.name + c.q)}"><small>浏览</small><b>曲库里所有和弦 · 有的和没有的</b><span>→</span></a><a class="link" href="#combo"><small>连起来记</small><b>组合和弦：一串一串记</b><span>→</span></a>`],
        ['练', `${arp.white && T.Q[CX.q].ints.length === 3 && !CX.q.startsWith('sus') ? `<a class="link" href="#arp-${CX.root + CX.q}"><small>练这个和弦</small><b>${D(CX.root + CX.q)} 琶音 · 带指法和收音</b><span>→</span></a>` : ''}<a class="link" href="#combo"><small>连起来记</small><b>组合和弦：一串一串记</b><span>→</span></a>`],
      ])}
      <div class="cxdock" id="cxdock"><div class="cxroot" id="cxroot" aria-label="根音滑条：左右拖动换根音"><div class="rtrack"></div>${ROOT_MAJ.map((r, i) => `<i class="rt${r === CX.root ? ' cur' : ''}" style="left:calc(19px + (100% - 38px) * ${(i / 11).toFixed(4)})">${D(r)}</i>`).join('')}<b class="rthumb" style="left:calc(19px + (100% - 38px) * ${(ROOT_MAJ.indexOf(CX.root) / 11).toFixed(4)})">${D(CX.root)}</b></div></div><div class="cxdocksp"></div>`;
    { const nv = document.querySelector('nav'); document.documentElement.style.setProperty('--navh', (nv ? nv.offsetHeight : 64) + 'px'); }
    pagerInit();
    // 度数线：从原来的位置，慢慢滑到升/降之后的位置（线是一条弧，圆圈跟着走）
    const rows = [...document.querySelectorAll('.cxdeg .dr[data-dy]')].filter(r => oldDy[r.dataset.i] != null && oldDy[r.dataset.i] !== +r.dataset.dy);
    if (rows.length) {
      const t0 = performance.now(), ez = t => 1 - Math.pow(1 - t, 3);
      const paint = (r, dy) => { r.querySelector('.dline path').setAttribute('d', cxPath(dy)); r.querySelector('.dmove').style.transform = `translateY(${dy}px)`; };
      rows.forEach(r => { r.querySelector('.dmove').style.transition = 'none'; paint(r, oldDy[r.dataset.i]); });
      const step = now => { const t = Math.min(1, (now - t0) / 520); rows.forEach(r => paint(r, oldDy[r.dataset.i] + (+r.dataset.dy - oldDy[r.dataset.i]) * ez(t))); if (t < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    if (CX.io) CX.io.disconnect();
    { const se = document.getElementById('cxsent'), st = document.getElementById('cxst');
      if (se && st && window.IntersectionObserver) { CX.io = new IntersectionObserver(es => es.forEach(en => st.classList.toggle('stuck', !en.isIntersecting && en.boundingClientRect.top < 0)), { rootMargin: '-40px 0px 0px 0px', threshold: 0 }); CX.io.observe(se); } }
    const ks = [...document.querySelectorAll('.cxview .kb .k')];
    if (Object.keys(oldK).length) {
      ks.forEach(k => { const t = k.getAttribute('class'); k.dataset.t = t; k.setAttribute('class', oldK[k.dataset.m] || t.replace(/ (on|rt|st|mv)\b/g, '')); });
      requestAnimationFrame(() => requestAnimationFrame(() => ks.forEach(k => k.setAttribute('class', k.dataset.t))));
    }
  }

  document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.cxstaff') && d.open) d.querySelectorAll('.staff').forEach(x => { try { Staff.draw(x); } catch (err) {} }); }, true);
  function refSongHtml(c) {
    const L = REF_SONGS[c.q]; if (!L) return '';
    return `<div class="refsong"><small>这种和弦在歌里 · 已找网页核对过</small>${L.map(x => `<a class="rs" href="${esc(x.u)}" target="_blank" rel="noopener"><b>${esc(x.t)}</b><span>${esc(x.w)}${x.k ? ' · ' + esc(x.k) : ''}${x.c === 'mid' ? ' · 只核对了一个来源' : ''}</span></a>`).join('')}</div>`;
  }
  // ---- 和弦库首页：五度圈选根音 + 这个根音的 10 种和弦 ----
  const FIFTHS = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
  // 每个根音的 10 种和弦卡片（拖动圆盘时只刷新这一块）
  function libCardsHtml() {
    return CX_Q.map(q => {
      const c = T.build(CX.root, q, 0), v = T.voicing(c), h = cxHue(q);
      const notes = v.map(n => ({ midi: n.midi, name: n.name, cls: cxRole(c, n.deg) }));
      return `<a class="libcard cxcard" href="#chords-${encodeURIComponent(CX.root)}-${q || '_'}" style="${hueVars(h)}"><div class="lh"><b>${D(CX.root + q)}</b><span>${CX_ZH[q]}</span></div><p>${CX_STORY[q]}</p>${kb(notes, { lo: 60, hi: 83 })}</a>`;
    }).join('');
  }
  const DIAL_R = 112, dialPos = i => { const a = i * 30 * Math.PI / 180; return [140 + DIAL_R * Math.sin(a) - 20, 140 - DIAL_R * Math.cos(a) - 20]; };
  function vLib() {
    CX.sig = null; cxTheme(null);
    const ring = FIFTHS.map((r, i) => { const [x, y] = dialPos(i); return `<button class="cr-b" data-act="libroot" data-v="${r}" aria-label="根音 ${D(r)}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">${D(r)}</button>`; }).join('');
    const [tx, ty] = dialPos(Math.max(0, FIFTHS.indexOf(CX.root)));
    view.innerHTML = `<header class="top"><div><small>选一个根音，看它的 10 种颜色</small><h1>和弦</h1></div></header>
      <div class="fifths" id="dial" aria-label="五度圈：手指在圆盘上转着拖，可以一格一格换根音"><div class="crc"><b id="dialname">${D(CX.root)}</b><small>五度圈 · 转动圆盘</small></div>${ring}<div class="dthumb" id="dthumb" style="left:${tx.toFixed(1)}px;top:${ty.toFixed(1)}px">${D(CX.root)}</div></div>
      <div class="libhd"><b id="libtitle">${D(CX.root)} 的 10 种和弦</b><small>点进去看怎么搭 →</small></div>
      <div class="libgrid" id="libgrid">${libCardsHtml()}</div>`;
  }
  // 圆盘：像拨号盘一样，手指在圆上转，圆点跟着手指走，经过哪个根音就换成哪个；松手吸附并弹一下
  (function () {
    let D3 = null;
    const ang = (e, el) => { const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360; };
    function apply(e) {
      const el = document.getElementById('dial'); if (!el) return;
      const a = ang(e, el), idx = Math.round(a / 30) % 12, th = document.getElementById('dthumb'), sc = el.getBoundingClientRect().width / 280;
      const rad = a * Math.PI / 180;
      th.style.transition = 'none'; th.style.left = (140 + DIAL_R * Math.sin(rad) - 20).toFixed(1) + 'px'; th.style.top = (140 - DIAL_R * Math.cos(rad) - 20).toFixed(1) + 'px';
      const r = FIFTHS[idx];
      el.querySelectorAll('.cr-b').forEach((x, k) => x.classList.toggle('near', k === idx));
      if (r !== CX.root) {
        CX.root = r; th.textContent = D(r);
        const nm = document.getElementById('dialname'); if (nm) nm.innerHTML = D(r);
        if (navigator.vibrate) navigator.vibrate(4);
        const st = D3; if (!st.raf) st.raf = requestAnimationFrame(() => { st.raf = 0; const g = document.getElementById('libgrid'), t = document.getElementById('libtitle'); if (g) g.innerHTML = libCardsHtml(); if (t) t.innerHTML = D(CX.root) + ' 的 10 种和弦'; });
      }
    }
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest && e.target.closest('#dial'); if (!el || route[0] !== 'chords' || route[1]) return;
      e.preventDefault(); try { document.documentElement.setPointerCapture(e.pointerId); } catch (err) {}
      D3 = { raf: 0 }; document.body.classList.add('drag-dial'); apply(e);
    }, true);
    document.addEventListener('pointermove', e => { if (D3) apply(e); }, true);
    const end = () => {
      if (!D3) return; D3 = null; document.body.classList.remove('drag-dial'); document.querySelectorAll('#dial .cr-b.near').forEach(x => x.classList.remove('near'));
      const th = document.getElementById('dthumb'); if (th) { const [x, y] = dialPos(Math.max(0, FIFTHS.indexOf(CX.root))); th.style.transition = 'left .2s ease, top .2s ease'; th.style.left = x.toFixed(1) + 'px'; th.style.top = y.toFixed(1) + 'px'; }
      const g = document.getElementById('libgrid'); if (g) g.innerHTML = libCardsHtml();
      try { playChord(CX.root); } catch (err) {}
    };
    document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', end, true);
  })();

  // 组合和弦：每个和弦的小键盘，没动的音灰，新按的音用这个和弦的色彩
  function cbTiles(ch, key) {
    return `<div class="cbtiles">${ch.map((x, i) => {
      const p = T.parseChord(x), v = T.voicing(p), prev = i ? T.parseChord(ch[i - 1]).notes.map(n => n.pc) : null, h = cxHue(p.q);
      const shared = prev ? p.notes.filter(n => prev.includes(n.pc)).length : 0;
      const notes = v.map(n => ({ midi: n.midi, name: n.name, cls: !prev || prev.includes(n.midi % 12) ? 'rt' : 'mv' }));
      const a = T.analyze(x, key);
      return `<div class="cbt cxcard" style="${hueVars(h)}"><b>${D(x)}</b><small>${a ? degLabel(x, key) : ''}</small>${kb(notes, { lo: 60, hi: 71 })}<em>${prev ? '留 ' + shared + ' · 动 ' + (p.notes.length - shared) : '起点'}</em></div>`;
    }).join('')}</div><p class="fine cblegend"><i class="lg rt"></i>没动 <i class="lg mv"></i>新按（和弦的色彩）</p>`;
  }
  // 两条滑条：右边竖的换性质，下面横的换根音；拖到哪一格就换到哪，页面立刻跟着变
  (function () {
    let D2 = null;
    const idx = (e, el, vertical) => {
      const r = el.getBoundingClientRect();
      if (vertical) return Math.max(0, Math.min(CX_Q.length - 1, Math.round((e.clientY - r.top - 10) / 18)));
      const tr = el.querySelector('.rtrack').getBoundingClientRect();
      return Math.max(0, Math.min(11, Math.round((e.clientX - tr.left) / tr.width * 11)));
    };
    const apply = (e) => {
      const el = document.getElementById(D2.vertical ? 'cxrail' : 'cxroot'); if (!el) return;
      const i = idx(e, el, D2.vertical);
      if (D2.vertical) { const q = CX_Q[i]; if (q !== CX.q) { CX.q = q; CX.inv = Math.min(CX.inv, T.Q[q].ints.length - 1); vChords(); if (navigator.vibrate) navigator.vibrate(4); } }
      else { const r = ROOT_MAJ[i]; if (r !== CX.root) { CX.root = r; vChords(); if (navigator.vibrate) navigator.vibrate(4); } }
    };
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest && e.target.closest('#cxrail, #cxroot'); if (!el || route[0] !== 'chords') return;
      e.preventDefault(); try { document.documentElement.setPointerCapture(e.pointerId); } catch (err) {}
      D2 = { vertical: el.id === 'cxrail' }; document.body.classList.add(D2.vertical ? 'drag-rail' : 'drag-root'); apply(e);
    }, true);
    document.addEventListener('pointermove', e => { if (D2) apply(e); }, true);
    const end = () => { if (!D2) return; D2 = null; document.body.classList.remove('drag-rail', 'drag-root'); try { playChord(T.build(CX.root, CX.q, Math.min(CX.inv, T.Q[CX.q].ints.length - 1)).sym); } catch (err) {} };
    document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', () => { D2 = null; document.body.classList.remove('drag-rail', 'drag-root'); }, true);
  })();
  // ---- 底部每个标签都记住「上次停在哪一页、滚到哪里」：切到别的标签再点回来，回到原处；已在这个标签里再点一下，回到这个标签的首页 ----
  const TAB_OF = { today: 'today', pk: 'today', path: 'path', unit: 'path', sym: 'path', inv: 'path', logic: 'path', know: 'path', sight: 'path', chords: 'chords', combo: 'chords', browse: 'chords', songs: 'songs', song: 'songs', acc: 'songs', sing: 'songs', score: 'songs', scan: 'songs', cmp: 'songs', edit: 'songs', set: 'set', me: 'set', cards: 'set' };
  const navTabNow = () => ((route[0] === 'sight' && route[1]) ? null : TAB_OF[route[0]] || null);
  const scrollerNow = () => { const box = document.getElementById('phone'); return box && getComputedStyle(box).overflowY === 'auto' ? box : document.scrollingElement; };
  let NAV_RESTORE = null;
  function navRestoreScroll() {
    if (NAV_RESTORE == null) return; const y = NAV_RESTORE; NAV_RESTORE = null;
    const go2 = () => { const sc = scrollerNow(); if (sc) sc.scrollTop = y; };
    go2(); setTimeout(go2, 80); setTimeout(go2, 600); setTimeout(go2, 1600);
  }
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('nav a[data-r]'); if (!a) return;
    e.preventDefault();
    const tab = a.dataset.r, cur = navTabNow();
    if (cur) { const sc = scrollerNow(); S.navLast = S.navLast || {}; S.navLast[cur] = { h: location.hash || '#' + cur, y: sc ? Math.round(sc.scrollTop) : 0 }; save(); }
    if (cur === tab) { go('#' + tab); return; }
    const L = (S.navLast || {})[tab];
    if (L && L.h) { NAV_RESTORE = L.y || 0; go(L.h); } else go('#' + tab);
  }, true);
  // 按住往下拖选：转位 / 弹法（点一下 = 直接执行）
  (function () {
    let H = null;
    const items = k => { if (k === 'inv') { const n = T.Q[CX.q].ints.length; return CX_INV.slice(0, n).map((t, i) => ({ t: (i ? i + ' · ' : '0 · ') + t })); } return CX_PATS().map(p => ({ t: CX_PAT_NAME[p.id] })); };
    const cur = k => k === 'inv' ? Math.min(CX.inv, T.Q[CX.q].ints.length - 1) : Math.max(0, CX_PATS().findIndex(p => p.id === CX.pat));
    function open() {
      if (!H) return; H.open = true; const r = H.b.getBoundingClientRect(), its = items(H.kind);
      const m = document.createElement('div'); m.className = 'holdmenu'; m.style.cssText = `right:${Math.max(8, innerWidth - r.right)}px;top:${r.bottom + 6}px`;
      m.innerHTML = its.map((x, i) => `<div class="hmi" data-i="${i}">${x.t}</div>`).join(''); document.body.appendChild(m); H.m = m; H.n = its.length; H.y0 = r.bottom + 6 + 19;
      H.idx = cur(H.kind); mark(); if (navigator.vibrate) navigator.vibrate(10);
    }
    function mark() { H.m.querySelectorAll('.hmi').forEach((e, i) => e.classList.toggle('on', i === H.idx)); }
    document.addEventListener('pointerdown', e => {
      const b = e.target.closest && e.target.closest('[data-hold]'); if (!b || route[0] !== 'chords') return;
      e.preventDefault(); try { document.documentElement.setPointerCapture(e.pointerId); } catch (err) {} H = { b, kind: b.dataset.hold, open: false, idx: 0 }; H.t = setTimeout(open, 260);
    }, true);
    document.addEventListener('pointermove', e => {
      if (!H || !H.open) return; const i = Math.max(0, Math.min(H.n - 1, Math.round((e.clientY - H.y0) / 38)));
      if (i !== H.idx) { H.idx = i; mark(); if (navigator.vibrate) navigator.vibrate(5); if (H.kind === 'inv') { CX.inv = i; vChords(); H.b = document.querySelector('[data-hold=inv]') || H.b; } }
    }, true);
    const end = (e, cancel) => {
      if (!H) return; clearTimeout(H.t); const h = H; H = null;
      if (h.m) h.m.remove();
      if (cancel) return;
      if (h.open) {
        if (h.kind === 'inv') { CX.inv = h.idx; playChord(T.build(CX.root, CX.q, CX.inv).sym); }
        else { CX.pat = CX_PATS()[h.idx].id; vChords(); cxPlay(document.querySelector('.cxhold.go')); }
      } else if (h.kind === 'inv') { CX.inv = (cur('inv') + 1) % T.Q[CX.q].ints.length; vChords(); playChord(T.build(CX.root, CX.q, CX.inv).sym); }
      else cxPlay(h.b);
    };
    document.addEventListener('pointerup', e => end(e, false), true);
    document.addEventListener('pointercancel', e => end(e, true), true);
    document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-hold]')) e.preventDefault(); });
  })();


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
  // 一段 4 小节的乐句（小节号对齐原谱），命中的格子标橙；点一下整句播放
  // 原曲：公有领域的给旋律 + 伴奏；有版权的说明为什么没有旋律，并给「跟录音弹」
  function origBox(s) {
    if (hasFull(s.id)) return ''; // 已经在上面放了入口
    if (s.melody) return `<a class="scorelink" href="#sing-${s.melody}"><b>原曲旋律 + 伴奏一起听、一起弹</b><small>双手谱：右手是原曲旋律，左手是这些和弦 · 逐小节讲为什么配这个和弦</small><span>→</span></a>`;
    if (!s.copy) return '';
    return `<div class="origcopy"><p><b>原曲在哪？</b>这首歌有版权，App 里不能放它的旋律和录音，只放和弦。要把伴奏和原曲对上，用这两步：</p>
      <p>① 点下面 <b>Apple Music</b> 先完整听一遍原曲，边听边看下面的和弦格子（小节号对着原曲）。<br>② 打开 <b>跟录音弹</b>：在 Apple Music 里放原曲，跟着拍子点 4 下，App 就按原曲的速度一小节一小节亮出和弦，你和录音一起弹伴奏——你弹的和弦和歌手唱的旋律同时响，就知道伴奏是怎么托住旋律的了。</p>
      <a class="btn" href="#along-${s.id}">跟录音弹 →</a>
      <p class="fine">想先弄懂「旋律 → 伴奏」是怎么配出来的，可以先看没有版权的例子：<a href="#sing-twinkle">小星星</a>、<a href="#sing-canon">卡农</a>，那里旋律和伴奏写在同一张谱上。</p></div>`;
  }
  // ---- 跟录音弹：按用户点的速度（跟着原曲录音点 4 下）一小节一小节亮出和弦 ----
  const AL = { sec: 0, sound: false, taps: [], iv: null };
  function vAlong() {
    const s = allSongs().find(x => x.id === route[1]); if (!s) return go('#songs');
    if (AL.id !== s.id) { AL.id = s.id; AL.sec = 0; }
    const st = sectionStarts(s), sec = s.sections[AL.sec] || s.sections[0];
    view.innerHTML = `<div class="qbar"><a href="#song-${s.id}" class="x">×</a><span class="meter"><i id="albar" style="width:0%"></i></span><small>跟录音弹</small></div>
      <section class="along"><small>${esc(s.title)} · 和原曲一起弹伴奏</small>
      <ol class="alsteps"><li>在 Apple Music 放原曲 <a href="${(s.orig || {}).apple || '#'}" target="_blank" rel="noopener">打开 ↗</a></li><li>选你要跟的段落</li><li>这一段开始前的那一小节，跟着录音的拍子点「拍」4 下</li><li>App 从下一拍起按你的速度亮和弦，循环这一段；对不上就停止重来</li></ol>
      <div class="chips">${s.sections.map((x, i) => `<button class="chip${i === AL.sec ? ' on' : ''}" data-act="alsec" data-v="${i}">${esc(x.name)}</button>`).join('')}</div>
      <div class="alnow"><div><small>现在 · 第 <span id="aln">${st[AL.sec] || 1}</span> 小节</small><b id="alc">${D(parseBars(sec.bars)[0][0])}</b><i id="ald">${degLabel(parseBars(sec.bars)[0][0], s.key)}</i></div><div><small>下一个</small><span id="alx">${D((parseBars(sec.bars)[1] || parseBars(sec.bars)[0])[0])}</span></div></div>
      <div class="beats" id="albeats">${'<i></i>'.repeat(4)}</div>
      <button class="tapbtn" data-act="altap">拍</button>
      <div class="row"><button class="ghost sm" data-act="alstop">停止</button><button class="ghost sm${AL.sound ? ' on' : ''}" data-act="alsound">App 也轻声弹和弦：${AL.sound ? '开' : '关'}</button></div>
      <p class="fine" id="alhint">点 4 下「拍」之后开始。速度会按你点的来，原曲大约 ♩=${s.bpm}。</p></section>`;
  }
  function alStop() { if (AL.iv) clearInterval(AL.iv); AL.iv = null; AL.taps = []; }
  function alTap() {
    const now = performance.now(); A.init();
    AL.taps = AL.taps.filter(t => now - t < 6000).slice(-3); AL.taps.push(now); // 4 下最长 6 秒：慢到 ♩=40 也能用
    const b = $('#albeats'); if (b) b.querySelectorAll('i').forEach((x, i) => x.classList.toggle('on', i < AL.taps.length));
    if (AL.taps.length < 4) return;
    const s = allSongs().find(x => x.id === route[1]); const sec = s.sections[AL.sec], bars = parseBars(sec.bars), n0 = sectionStarts(s)[AL.sec];
    const beat = (AL.taps[3] - AL.taps[0]) / 3, t0 = AL.taps[3] + beat, beats = 4;
    alStop();
    $('#alhint').textContent = `速度 ♩=${Math.round(60000 / beat)} · 循环这一段 · 点「停止」结束`;
    let last = '';
    AL.iv = setInterval(() => {
      const el = $('#alc'); if (!el) return alStop();
      const bi = Math.floor((performance.now() - t0) / beat); if (bi < 0) return;
      const barI = Math.floor(bi / beats) % bars.length, inBar = bi % beats, ch = bars[barI], ci = Math.min(ch.length - 1, Math.floor(inBar / (beats / ch.length)));
      const key = barI + ':' + ci + ':' + inBar;
      if (key === last) return; last = key;
      document.querySelectorAll('#albeats i').forEach((x, i) => x.classList.toggle('on', i === inBar));
      const sym = ch[ci], nxt = ci + 1 < ch.length ? ch[ci + 1] : bars[(barI + 1) % bars.length][0];
      if (el.dataset.k !== barI + ':' + ci) { el.dataset.k = barI + ':' + ci; el.textContent = D(sym); $('#ald').textContent = degLabel(sym, s.key); $('#alx').textContent = D(nxt); $('#aln').textContent = n0 + barI; $('#albar').style.width = ((barI + 1) / bars.length * 100) + '%'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); if (AL.sound) A.chord(chordMidis(sym), 0, 0.01, 0.35); }
    }, 25);
  }
  // ---- 原曲 ↔ 和弦伴奏：上下对比 / 练习版 / 原曲（完整扒谱只在私人版本里）----
  const CMP = { mode: 'compare', sec: 0 };
  const hasFull = id => !!(window.FULL && FULL[id]);
  function vCmp() {
    const s = allSongs().find(x => x.id === route[1]); if (!s) return go('#songs');
    if (CMP.id !== s.id) { CMP.id = s.id; CMP.sec = 0; }
    const st = sectionStarts(s), secs = s.sections.map((x, i) => [x.name, st[i], st[i] + parseBars(x.bars).length - 1]);
    const head = `<header class="top"><div><a class="back" href="#song-${s.id}">←</a><small>${esc(s.title)}</small><h1>原曲 ↔ 和弦伴奏</h1></div></header>`;
    if (!hasFull(s.id)) { view.innerHTML = head + `<p class="no">这首的完整扒谱只放在你的私人版本（artifact）里：原谱有版权，不能放到公开网站。请在 artifact 里打开这一页。</p>`; return; }
    const M = CMP.mode, sec = secs[CMP.sec] || null;
    const lyr = (S.lyrics || {})[s.id] || '';
    view.innerHTML = head + `
      <div class="chips">${[['compare', '上下对比'], ['practice', '练习版：右手原曲 + 左手和弦'], ['orig', '原曲']].map(([k, n]) => `<button class="chip${M === k ? ' on' : ''}" data-act="cmpmode" data-v="${k}">${n}</button>`).join('')}</div>
      <p class="fine cmpnote">${{ compare: '每一小节从上往下三行：<b>右手（原曲旋律）</b>、<b>原曲左手</b>、<b>和弦左手</b>。第二行和第三行弹的是同一个和弦：原曲把它拆开弹，和弦版把它一下按住。对着看，就知道原曲的左手是从哪个和弦变出来的。', practice: '<b>右手照原曲弹旋律，左手换成和弦</b>：每小节开头按下上面标的和弦，按住到下一个和弦。先慢速，弹熟了再换回原曲左手。', orig: '按你上传的谱逐音扒下来的原曲（两只手）。每小节上方标了和弦。' }[M]}</p>
      <div class="chips">${secs.map(([n], i) => `<button class="chip${i === CMP.sec ? ' on' : ''}" data-act="cmpsec" data-v="${i}">${esc(n)}</button>`).join('')}<button class="chip${CMP.sec < 0 ? ' on' : ''}" data-act="cmpsec" data-v="-1">全曲</button></div>
      <div class="row">${M !== 'practice' ? '<button class="btn" data-act="cmpplay" data-v="orig">▶ 听原曲</button>' : ''}${M !== 'orig' ? `<button class="${M === 'practice' ? 'btn' : 'ghost'}" data-act="cmpplay" data-v="practice">▶ 听练习版</button>` : ''}<button class="ghost sm" data-act="screte" data-v="-0.1">慢</button><button class="ghost sm" data-act="screte" data-v="0.1">快</button></div>
      <div class="score" id="cmpscore"><p class="fine">正在生成谱面…</p></div>
      <a class="link" href="#mem-${s.id}"><small>边弹边判断</small><b>打开收音，一个和弦一个和弦弹</b><span>→</span></a>
      <details class="lyr"${lyr ? '' : ' open'}><summary>歌词${lyr ? '（已贴上）' : '：粘贴进来就会贴到旋律音下面'}</summary>
        <p class="fine">歌词有版权，App 不自带。你把歌词粘贴到这里，只存在这台手机上。中文一个字对一个音，按顺序贴到右手旋律的每个新音下面；某个音不唱字就写一个 _ 跳过；前奏没有歌词的话，在前面写够 _ 或者从「主歌」开始数。</p>
        <textarea id="lyrtext" rows="5" placeholder="在这里粘贴歌词">${esc(lyr)}</textarea>
        <div class="row"><button class="ghost sm" data-act="lyrsave">贴到谱上</button>${lyr ? '<button class="ghost sm" data-act="lyrclear">清空</button>' : ''}</div></details>`;
    const bm = songBarMap(s), lab = {};
    Object.keys(bm).forEach(n => (lab[n] = barLabel(s, +n)));
    const kern = FullScore.build(FULL[s.id].kern, { mode: M, barChords: bm, kp, title: s.title + ' · ' + { compare: '上下对比', practice: '练习版', orig: '原曲' }[M], lyrics: lyr, from: sec && CMP.sec >= 0 ? sec[1] : null, to: sec && CMP.sec >= 0 ? sec[2] : null });
    Score.render($('#cmpscore'), { kern }, { section: false, labels: lab, barAct: true }).catch(e => ($('#cmpscore').innerHTML = '<p class="no">谱面生成失败：' + esc(String(e && e.message || e)) + '</p>'));
  }
  // ---------------- 翻页：上面只放主要内容，细节一页一页左右翻（滑动或点页签）----------------
  const PG = {};
  function pager(id, pages) {
    const at = Math.min(PG[id] || 0, pages.length - 1);
    return `<div class="pager" data-pg="${id}"><div class="pgtabs">${pages.map(([t], i) => `<button class="pgtab${i === at ? ' on' : ''}" data-act="pgto" data-pg="${id}" data-v="${i}">${t}</button>`).join('')}</div>
      <div class="pgtrack">${pages.map(([t, h], i) => `<section class="pg" data-i="${i}">${h}</section>`).join('')}</div>
      <div class="pgdots">${pages.map((_, i) => `<i class="${i === at ? 'on' : ''}"></i>`).join('')}</div></div>`;
  }
  function pagerInit() {
    view.querySelectorAll('.pager').forEach(pg => {
      const id = pg.dataset.pg, tr = pg.querySelector('.pgtrack'), pages = [...tr.children];
      const fit = i => { const p = pages[i]; if (p) tr.style.height = p.scrollHeight + 'px'; pg.querySelectorAll('.pgtab').forEach((b, k) => b.classList.toggle('on', k === i)); pg.querySelectorAll('.pgdots i').forEach((d, k) => d.classList.toggle('on', k === i)); };
      const at = Math.min(PG[id] || 0, pages.length - 1);
      tr.scrollLeft = at * tr.clientWidth; fit(at);
      let t = null;
      tr.addEventListener('scroll', () => { clearTimeout(t); t = setTimeout(() => { const i = Math.round(tr.scrollLeft / Math.max(1, tr.clientWidth)); if (i !== PG[id]) { PG[id] = i; } fit(i); }, 60); }, { passive: true });
      const ro = new ResizeObserver(() => fit(PG[id] || 0)); pages.forEach(p => ro.observe(p));
      pg.__fit = fit;
    });
  }
  function pagerGo(id, i) {
    const pg = view.querySelector(`.pager[data-pg="${id}"]`); if (!pg) return;
    const tr = pg.querySelector('.pgtrack'); PG[id] = i; tr.scrollTo({ left: i * tr.clientWidth, behavior: 'smooth' }); pg.__fit && pg.__fit(i);
    const top = pg.getBoundingClientRect().top; if (top < 0) pg.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  // ---------------- 组合和弦：一串和弦当成一个「词组」记 ----------------
  const CB = { key: 'C', mkey: 'Am', hide: null, q: null };
  const FAMD = { 1: 'T', 3: 'T', 6: 'T', 2: 'S', 4: 'S', 5: 'D', 7: 'D' };
  const cbKey = cb => (cb.minor ? CB.mkey : CB.key);
  const cbChords = (cb, key = cbKey(cb)) => cb.deg.map(d => T.degreeChord(T.parseKey(key), d - 1, !!cb.sev));
  const famWord = d => FUNC_ZH[FAMD[d]];
  // 和这个位置同一家（稳 / 走 / 紧）的和弦都能填进去：每填一个就是一个变体
  function cbCands(cb, pos, key = cbKey(cb)) {
    const K = T.parseKey(key), d = cb.deg[pos], fam = FAMD[d];
    const out = [1, 2, 3, 4, 5, 6, 7].filter(x => FAMD[x] === fam).map(x => ({ d: x, sym: T.degreeChord(K, x - 1, !!cb.sev) }));
    if (fam === 'D' && !cb.sev) out.push({ d: 5, sym: T.degreeChord(K, 4, true), sev: 1 });
    return out.filter((x, i, a) => a.findIndex(y => y.sym === x.sym) === i).map(x => ({ ...x, orig: x.sym === cbChords(cb, key)[pos] }));
  }
  function cbShared(a, b) { const pa = T.parseChord(a).notes.map(n => n.pc); return T.parseChord(b).notes.filter(n => pa.includes(n.pc)).map(n => D(n.name)); }
  // 曲库里哪里出现了这一串（按级数比，换了调也算；连着重复的和弦算一个）
  function cbFind(cb) {
    const out = [];
    allSongs().forEach(s => {
      if (!s.key || /m$/.test(s.key) !== !!cb.minor) return;
      const K = T.parseKey(s.key), sc = T.scale(K, true).map(x => T.parseNote(x.name).pc), seq = [];
      Object.entries(songBarMap(s)).sort((a, b) => a[0] - b[0]).forEach(([n, bar]) => bar.forEach(x => { const c = T.parseChord(x); if (!c) return; const d = sc.indexOf(c.root.pc) + 1; if (!d) { seq.push({ d: 0, n: +n }); return; } if (!seq.length || seq[seq.length - 1].d !== d) seq.push({ d, n: +n }); }));
      const hits = [];
      for (let i = 0; i + cb.deg.length <= seq.length; i++) if (cb.deg.every((d, k) => seq[i + k].d === d)) hits.push(seq.slice(i, i + cb.deg.length).map(x => x.n));
      if (hits.length) out.push({ s, hits });
    });
    return out;
  }
  function vCombo() {
    const id = route[1];
    const keyChips = minor => `<div class="chips">${(minor ? ['Am', 'Em', 'Dm'] : ['C', 'G', 'F', 'D']).map(k => `<button class="chip${(minor ? CB.mkey : CB.key) === k ? ' on' : ''}" data-act="cbkey" data-v="${k}">${kz(k)}</button>`).join('')}</div>`;
    if (!id) {
      view.innerHTML = `<header class="top"><div><a class="back" href="#path">←</a><small>一串一串记，不是一个一个记</small><h1>组合和弦</h1></div></header>
        <p class="fine">就像背单词要背词组：最常用的和弦顺序只有十来种。把 4 个和弦当成<b>一个词</b>记住（比如「4536」），看到谱就能一眼认出一整串。每一串都写成级数，所以<b>换调也一样</b>。</p>
        <p class="fine">每一串里还能<b>抠掉一个和弦，换成它的「字」</b>（稳 / 走 / 紧）：同一个字的和弦都能填回去，就变出新的进行。</p>
        ${keyChips(false)}
        <ul class="list combos">${COMBOS.map(cb => { const ch = cbChords(cb), f = cbFind(cb); return `<li><a href="#combo-${cb.id}"><span><b>${cb.name}<small class="alias"> · ${cb.alias}</small></b><small>${ch.map(D).join(' – ')}　${cb.deg.map(famWord).join(' ')}${f.length ? ` · 曲库里 ${f.reduce((a, x) => a + x.hits.length, 0)} 处` : ''}</small></span><span class="arr">→</span></a></li>`; }).join('')}</ul>
        <p class="pageend">— 到底了 —</p>`;
      return;
    }
    const cb = COMBOS.find(x => x.id === id); if (!cb) return go('#combo');
    if (CB.id !== id) { CB.id = id; CB.hide = null; CB.q = null; }
    const key = cbKey(cb), ch = cbChords(cb), finds = cbFind(cb), st = S.combo && S.combo[id];
    const pos = CB.hide;
    view.innerHTML = `<header class="top"><div><a class="back" href="#combo">←</a><small>组合和弦 · ${cb.alias}</small><h1>${cb.name}</h1></div></header>
      ${keyChips(cb.minor)}
      <section class="cbtop"><div class="viewsw">${S.cbView === 'staff' ? perRowChips() : ''}<span class="seg"><button class="${S.cbView !== 'staff' ? 'on' : ''}" data-act="cbview" data-v="grid">格子</button><button class="${S.cbView === 'staff' ? 'on' : ''}" data-act="cbview" data-v="staff">谱</button></span></div>
        ${S.cbView === 'staff' ? `<div class="cbstaff">${Staff.html({ key, bars: ch.map(x => [x]), end: true, time: true, start: 1, perRow: S.perRow || 4 })}</div>` : `${progRow(key, ch)}
        ${cbTiles(ch, key)}`}
        <p class="fine">${cb.say}${cb.where ? ' · 你在 ' + cb.where + ' 里见过它。' : ''}</p></section>
      ${pager('combo', [
        ['变体', `<h3>抠掉一个，换成它的「字」</h3>        <p class="fine">选一个位置抠掉。它变成一个字（稳 / 走 / 紧）：<b>同一个字的和弦都能填进去</b>，每填一个就是一个新变体。点每一行听。</p>
        <div class="chips">${ch.map((x, i) => `<button class="chip${pos === i ? ' on' : ''}" data-act="cbhide" data-v="${i}">抠掉第 ${i + 1} 个（${D(x)}）</button>`).join('')}</div>
        ${pos == null ? '' : `<p class="chain holed">${ch.map((x, i) => i === pos ? `<span class="hole"><b>？</b><i>${famWord(cb.deg[i])}</i></span>` : `<span><b>${D(x)}</b><i>${famWord(cb.deg[i])}</i></span>`).join('<em>→</em>')}</p>
          ${cbCands(cb, pos).map(c => { const row = ch.slice(); row[pos] = c.sym; const sh = cbShared(ch[pos], c.sym);
            return `<div class="variant${c.orig ? ' isorig' : ''}"><small>${c.orig ? '原版' : '变体'} · 填 <b>${D(c.sym)}</b>（${c.d} 级${c.sev ? '七和弦' : ''}）${c.orig ? '' : sh.length ? ` · 和 ${D(ch[pos])} 共用 ${sh.join('、')}，所以都是「${famWord(cb.deg[pos])}」` : ` · 同样是「${famWord(cb.deg[pos])}」`}</small>${progRow(key, row)}</div>`; }).join('')}`}
`],
        ['填空', `<h3>填空 <small>${st ? `· 做过 ${st.n} 题，原版答对 ${st.r} 题` : ''}</small></h3>${cbQuizHtml(cb)}`],
        ['曲子里', `<h3>在曲子里</h3>${finds.length ? finds.map(f => `<a class="link" href="#song-${f.s.id}-${f.hits.flat().join('.')}-${encodeURIComponent(cbChords(cb, f.s.key)[0])}"><small>${esc(f.s.title)}</small><b>第 ${f.hits.map(h => h[0] + '–' + h[h.length - 1]).slice(0, 4).join('、')}${f.hits.length > 4 ? ' 等' : ''} 小节 · ${cbChords(cb, f.s.key).map(D).join(' ')}</b><span>→</span></a>`).join('') : '<p class="fine">曲库里还没有完整出现这一串。</p>'}`],
        ['跟练', `<h3>看着彩条弹</h3>${rollEntry('combo', '把这一串连着落两遍，左右手跟着彩条弹')}`],
        ['琴上', `<h3>在琴上弹这一串</h3><p class="fine">一个和弦弹对了才往下走。</p>${placeChips()}<div id="cbtarget" class="chain">${ch.map((x, i) => `<span data-i="${i}"><b>${D(x)}</b></span>`).join('<em>→</em>')}</div><div id="dctl"></div>`],
      ])}`;
    pagerInit();
    drillStart(ch.map(x => ({ kind: 'chord', pcs: T.parseChord(x).notes.map(n => n.pc), label: x })), {
      onAdvance: i => document.querySelectorAll('#cbtarget span').forEach((e, k) => { e.classList.toggle('now', k === i); e.classList.toggle('done', k < i); }),
      onMiss: () => toast('不对，再试一次'),
      onMode: () => ($('#dctl').innerHTML = drillControls()),
      onDone: r => { const mic = DR && DR.mode === 'mic'; logEv('combo', { id, miss: r.miss, m: DR ? DR.mode : '' }); if (!r.miss) PK.mark('combo:' + id, mic); document.querySelectorAll('#cbtarget span').forEach(e => e.classList.add('done')); $('#dctl').innerHTML = `<p class="${r.miss ? 'no' : 'ok'}">${r.miss ? '弹完了，错了 ' + r.miss + ' 次 · 再来一遍' : mic ? '在琴上一遍弹对 · 记为「琴上弹过」' : '屏幕上一遍点对 · 记为「已学 · 未上琴」'}</p><button class="ghost sm" data-act="cbredo">再来一遍</button>`; },
    });
    DR.cands = ch.map(x => T.parseChord(x).notes.map(n => n.pc));
    $('#dctl').innerHTML = drillControls();

    if ((relisten || S.micOK) && place() === 'piano') { relisten = false; drillListen(); }
  }
  // 填空：先听原版，再从选项里选被抠掉的那个。同一个「字」的别的和弦算「也成立的变体」，但不算答对原版
  const cbDeg = (sym, key, sev) => [1, 2, 3, 4, 5, 6, 7].find(d => T.degreeChord(T.parseKey(key), d - 1, !!sev) === sym) || (T.parseChord(sym) && T.parseChord(sym).q === '7' ? 5 : 0);
  function cbQuizHtml(cb) {
    const ch = cbChords(cb), key = cbKey(cb);
    if (!CB.q) {
      const pos = Math.floor(Math.random() * ch.length), same = cbCands(cb, pos).filter(c => !c.orig).map(c => c.sym);
      const others = [1, 2, 3, 4, 5, 6].map(d => T.degreeChord(T.parseKey(key), d - 1, !!cb.sev)).filter(x => x !== ch[pos] && !same.includes(x));
      const opts = [ch[pos]].concat(same.slice(0, 1), others.sort(() => Math.random() - 0.5).slice(0, 2)).sort(() => Math.random() - 0.5);
      CB.q = { pos, opts, ans: null };
    }
    const q = CB.q, right = ch[q.pos], fw = o => famWord(cbDeg(o, key, cb.sev)) || '';
    const slot = (x, i) => i === q.pos ? `<span class="hole"><b>${q.ans ? D(x) : '？'}</b><i>${famWord(cb.deg[i])}</i></span>` : `<span><b>${D(x)}</b><i>${famWord(cb.deg[i])}</i></span>`;
    let why = '';
    if (q.ans) {
      if (q.ans === right) why = `<span class="ok">对，原版就是 ${D(right)}。</span>`;
      else if (fw(q.ans) === famWord(cb.deg[q.pos])) why = `<span class="ok">也成立：</span>${D(q.ans)} 和 ${D(right)} 都是「${fw(q.ans)}」，填进去是一个<b>变体</b>。不过原版是 <b>${D(right)}</b>，听听两个的区别。`;
      else why = `<span class="no">不对。</span>这个位置是「${famWord(cb.deg[q.pos])}」，${D(q.ans)} 是「${fw(q.ans) || '?'}」，放进去这一串的方向就变了。原版是 <b>${D(right)}</b>。`;
    }
    return `<p class="fine">先听一遍原版，再选被抠掉的那个和弦。</p>
      <p class="chain holed">${ch.map(slot).join('<em>→</em>')}</p>
      <div class="row"><button class="ghost sm" data-act="cbqplay">▶ 听原版</button></div>
      <div class="opts">${q.opts.map(o => `<button class="opt${q.ans ? (o === right ? ' right' : o === q.ans ? ' wrong' : '') : ''}" data-act="cbans" data-v="${esc(o)}"${q.ans ? ' disabled' : ''}><b>${D(o)}</b><small>${q.ans ? fw(o) : ''}</small></button>`).join('')}</div>
      ${q.ans ? `<p class="why">${why}</p><div class="row"><button class="ghost sm" data-act="cbqyours">▶ 听你选的</button><button class="btn" data-act="cbnext">下一题 →</button></div>` : ''}`;
  }
  // 曲目页顶部：只放一排小按钮；解释类的内容点 ⓘ 才在旁边弹出
  function songTop(s) {
    const o = s.orig || {}, sc = o.score;
    const main = '';
    return `<section class="songtop">${main}
      <div class="pills oneline">
        <button class="pill info" data-act="info" data-k="src">ⓘ 来源</button>
        ${s.copy ? '<button class="pill info" data-act="info" data-k="orig">ⓘ 原曲</button>' : ''}
        ${s.melody ? `<a class="pill" href="#sing-${s.melody}">原曲旋律 + 伴奏</a>` : ''}
        ${o.apple ? `<a class="pill" href="${o.apple}" target="_blank" rel="noopener">Apple Music ↗</a>` : ''}
        ${o.imslp ? `<a class="pill" href="${o.imslp}" target="_blank" rel="noopener">IMSLP ↗</a>` : ''}
        <button class="pill" data-act="mytoggle">我的原谱 ${S.myOpen ? '⌃' : '⌄'}</button>
      </div>
      <div class="mybox"${S.myOpen ? '' : ' hidden'}><p class="fine">对照你手上的谱：截图、照片或 PDF，只存在这台手机上。</p><div id="myscore"></div></div></section>`;
  }
  function songInfo(s, k) {
    if (k === 'src') return ['这些和弦从哪来', srcBox(s).replace(/<\/?section[^>]*>/g, '').replace(/<h3>.*?<\/h3>/, '')];
    if (k === 'orig') return ['原曲在哪', `<p>这首歌有版权，App 里不能放它的旋律和录音，只放和弦。把伴奏和原曲对上：</p><p>① 点「Apple Music」先完整听一遍原曲，边听边看下面的谱（小节号对着原曲）。</p><p>② 点「跟录音弹」：在 Apple Music 里放原曲，跟着拍子点 4 下，App 按原曲的速度一小节一小节亮出和弦，你和录音一起弹伴奏。</p><p class="fine">想先弄懂「旋律 → 伴奏」怎么配出来，可以看没有版权的 <a href="#sing-twinkle">小星星</a>、<a href="#sing-canon">卡农</a>。</p>`];
    if (k === 'how') return ['怎么看这张谱', `<p>每一小节正上方是它的和弦：<b>小节号 · 和弦 · 级数 · 稳/走/紧</b>。</p><p>点<b>小节空白处</b>播放这一小节；<b>长按</b>可以选好几个小节；小节线上的<b>小三角</b>从那里播到结尾；点<b>和弦标注</b>看这一小节的依据；点<b>音符</b>听这个音。</p><p class="fine">${S.pro ? 'I IV V = 大三和弦，ii vi = 小三和弦' : '6m = 六级小和弦 · 5⁷/2 = 五级七和弦、低音弹 2'}</p>`];
    return ['', ''];
  }
  function infoPop(anchor, title, html) {
    document.querySelectorAll('.cpop, .tpop').forEach(x => x.remove());
    const host = document.getElementById('phone') || document.body;
    const el = document.createElement('div'); el.className = 'tpop'; el.dataset.act = 'tpopclose';
    el.innerHTML = `<div class="tpop-card infopop" data-act="tpopstay"><i class="tpop-arrow"></i><div class="tpop-h"><b>${title}</b></div><div class="infobody">${html}</div></div>`;
    host.appendChild(el);
    const card = el.querySelector('.tpop-card'), arrow = el.querySelector('.tpop-arrow'), hr = el.getBoundingClientRect(), r = anchor.getBoundingClientRect();
    const W = Math.min(340, hr.width - 24); card.style.width = W + 'px';
    const cx = r.left - hr.left + r.width / 2, left = Math.max(12, Math.min(hr.width - W - 12, cx - W / 2));
    const H = card.offsetHeight, below = r.bottom - hr.top + 10, above = r.top - hr.top - 10 - H, up = below + H > hr.height - 70 && above > 10;
    card.style.left = left + 'px'; card.style.top = Math.max(8, up ? above : below) + 'px';
    arrow.style.left = Math.max(14, Math.min(W - 14, cx - left)) + 'px'; card.classList.add(up ? 'up' : 'down');
    tpopAt = Date.now(); requestAnimationFrame(() => el.classList.add('open'));
  }
  function srcBox(s) {
    const src = s.src || 'simplified', bmS = songBarMap(s), ev = s.ev ? Object.entries(s.ev).filter(([n]) => bmS[n]).map(([, e]) => e) : [];
    const low = ev.filter(e => e.conf === 'low').length, printed = ev.filter(e => e.printed).length;
    const txt = {
      printed: '和弦记号是<b>印在谱上的</b>（编曲者写的），我只是照抄并标出级数。',
      analyzed: `谱上<b>没有印和弦记号</b>。和弦是我<b>按谱上的音分析出来的</b>：每小节看左手低音 + 右手和声音，再判断是哪个和弦。${ev.length ? `一共 ${ev.length} 小节都有依据，点下面任意一格就能看到那一小节左手、右手各是什么音${low ? `；其中 ${low} 小节把握不大，格子带斜纹` : ''}。` : s.orig && s.orig.score ? '这首是公有领域的曲子：打开上面的「完整原谱」，每小节上方都标了和弦，可以对着谱上的音核对。' : '这首的和弦是常见分析，没有逐小节依据。'}`,
      simplified: '这是<b>学习用的简化和声</b>（常见的配法），<b>没有逐小节对过原谱</b>。和你的谱不一样时，以你的谱为准，可以在「编辑」里改。',
    }[src];
    return `<section class="srcbox"><h3>这些和弦从哪来</h3><p>${txt}</p><p class="fine">「▶ 播放进行」是用合成钢琴把这些和弦弹给你听，<b>不是原曲录音</b>；原曲请点 Apple Music。${s.orig && s.orig.score && s.orig.score.made ? '新造谱里左手是原谱的左手，右手是按和弦配的柱式和弦，没有旋律：旋律请看你自己的谱。' : ''}</p></section>`;
  }
  // 点曲目页任意一格：先说这一小节在原谱上是什么音（依据），再解释和弦
  function barEvidence(s, n, sym) {
    if (!s || !n) return '';
    const e = s.ev && s.ev[n];
    if (!e) return `<span class="evd"><b>第 ${n} 小节</b> · ${srcLabel(s)}${s.src === 'printed' ? '：谱上印的就是 ' + D(sym) : ''}</span>`;
    const clean = t => esc(String(t || '').replace(/\b([A-G])(#|b)?(\d)\b/g, (m, l, a) => l + (a === '#' ? '♯' : a === 'b' ? '♭' : '')));
    const conf = { high: '把握大', medium: '把握一般', low: '<span class="no">把握不大，请对照原谱</span>' }[e.conf] || '';
    return `<span class="evd"><b>第 ${n} 小节 · 原谱第 ${e.page} 页第 ${e.sys} 行</b><br>左手：${clean(e.lh)}<br>右手和声：${clean(e.rh)}${e.printed ? '<br>谱上印的和弦：' + esc(e.printed) : '<br>谱上没印和弦 → 按这些音判断是 <b>' + D(sym) + '</b>'} · ${conf}${e.note ? '<br><small>' + clean(e.note) + '</small>' : ''}</span>`;
  }
  const srcLabel = s => ({ printed: '和弦印在谱上', analyzed: '按谱分析', simplified: '学习用简化' }[s.src] || '学习用简化');
  function phraseHtml(s, si, p0, isHit) {
    const st = sectionStarts(s), sec = s.sections[si], bars = parseBars(sec.bars).slice(p0, p0 + 4);
    const flat = []; const cells = bars.map((bar, j) => bar.map((x, m) => { const i = flat.length; flat.push(x); const n = st[si] + p0 + j; const a = T.analyze(x, s.key);
      return `<div class="pc${isHit(n, x) ? ' hit' : ''}" data-i="${i}">${m === 0 ? `<small class="pbn">${n}</small>` : ''}<b>${D(x)}</b><i>${a ? degLabel(x, s.key) : '?'}</i></div>`; }).join('')).join('');
    return `<p class="fine phead">${esc(sec.name)} · 第 ${st[si] + p0}–${st[si] + p0 + bars.length - 1} 小节</p><div class="prog phrase" data-act="prog" data-k="${esc(s.key)}" data-c="${esc(flat.join(','))}">${cells}<em>▶</em></div>`;
  }
  // ---- 和弦浏览：曲库里出现过的和弦（按出现次数）、没出现过的常用和弦；选一个就列出曲库里含它的所有乐句 ----
  const BRQ = [['', '大三'], ['m', '小三'], ['7', '属七'], ['maj7', '大七'], ['m7', '小七'], ['m7b5', '半减七'], ['dim', '减三'], ['sus4', '挂四']];
  function libChords() {
    const m = {};
    allSongs().forEach(s => { const st = sectionStarts(s); s.sections.forEach((sec, si) => parseBars(sec.bars).forEach((bar, k) => bar.forEach(x => {
      const p = T.parseChord(x); if (!p) return; const key = p.root.name + p.q;
      const r = (m[key] = m[key] || { sym: key, q: p.q, pc: p.root.pc, bars: 0, songs: new Set(), forms: new Set() }); r.bars++; r.songs.add(s.id); r.forms.add(x);
    }))); });
    return m;
  }
  const BR = { q: 'all' };
  function vBrowse() {
    const lib = libChords(), sel = route[1] ? decodeURIComponent(route[1]) : null;
    const inLib = Object.values(lib).filter(x => BR.q === 'all' || x.q === BR.q).sort((a, b) => b.bars - a.bars);
    const missing = BR.q === 'all' ? [] : ROOT_MAJ.map(r => r + BR.q).filter(x => !lib[T.parseChord(x).root.name + BR.q] && !Object.values(lib).some(l => l.q === BR.q && l.pc === T.parseChord(x).root.pc));
    const chip = x => `<a class="chip${sel === x.sym ? ' on' : ''}" href="#browse-${encodeURIComponent(x.sym)}"><b>${D(x.sym)}</b><small>${x.bars} 小节 · ${x.songs.size} 首</small></a>`;
    let res = '';
    if (sel) {
      const c = T.parseChord(sel);
      const rows = allSongs().map(s => {
        const st = sectionStarts(s), hits = [];
        s.sections.forEach((sec, si) => parseBars(sec.bars).forEach((bar, k) => bar.forEach(x => { const p = T.parseChord(x); if (p && p.root.pc === c.root.pc && p.q === c.q) hits.push({ si, k, n: st[si] + k, x }); })));
        if (!hits.length) return '';
        const phr = []; hits.forEach(h => { const p0 = Math.floor(h.k / 4) * 4, id = h.si + ':' + p0; if (!phr.some(p => p.id === id)) phr.push({ id, si: h.si, p0 }); });
        const nums = [...new Set(hits.map(h => h.n))];
        return `<div class="brsong"><div class="brh"><b>${esc(s.title)}</b><small>${D(s.key)} 调 · 第 ${nums.slice(0, 8).join('、')}${nums.length > 8 ? ' 等' : ''}小节 · ${srcLabel(s)}</small></div>
          ${phr.map(p => phraseHtml(s, p.si, p.p0, (n, x) => hits.some(h => h.n === n && h.x === x))).join('')}
          <div class="row"><a class="ghost sm" href="#song-${s.id}-${nums.join('.')}-${encodeURIComponent(sel)}">到曲目页看 →</a><a class="ghost sm" href="#mem-${s.id}">练这首 →</a></div></div>`;
      }).join('');
      res = `<section class="cxblock"><h3>${D(sel)} 在曲库里的所有乐句</h3><p class="fine">橙色格子就是它。点一行听整句，跟着弹。小节号对着原谱。</p>${rows}</section>`;
    }
    view.innerHTML = `<header class="top"><div><a class="back" href="#chords">←</a><small>从曲库里摘出来的小段</small><h1>和弦浏览</h1></div></header>
      <div class="chips">${[['all', '全部']].concat(BRQ).map(([q, n]) => `<button class="chip${BR.q === q ? ' on' : ''}" data-act="brq" data-v="${q}">${n}</button>`).join('')}</div>
      <section class="cxblock"><h3>曲库里有 <small>· ${inLib.length} 个</small></h3><p class="fine">按出现的小节数排。选一个，下面列出含它的所有乐句。</p><div class="chips brchips">${inLib.map(chip).join('') || '<p class="fine">曲库里没有这一类的和弦。</p>'}</div></section>
      ${BR.q !== 'all' ? `<section class="cxblock"><h3>曲库里没有 <small>· ${missing.length} 个</small></h3><p class="fine">这些和弦曲库里还没出现。点开在和弦页用小进行练。</p><div class="chips brchips">${missing.map(x => `<a class="chip ghostchip" href="#chords-${encodeURIComponent(T.parseChord(x).root.name)}-${BR.q || '_'}"><b>${D(x)}</b></a>`).join('') || '<p class="fine">这一类 12 个根音曲库里都有。</p>'}</div></section>` : '<p class="fine">选上面的一类（比如「小七」），还能看到曲库里<b>没有</b>的那些。</p>'}
      ${res}
      <p class="pageend">— 到底了 —</p>`;
    if (sel) setTimeout(() => { const r = view.querySelector('.cxblock:last-of-type h3'); if (r && route[2] !== 'top') r.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
  }
  function chordFinds(c) {
    // 三种「找到」，每种都写清楚是什么关系
    const LV = { 3: ['原样', `就是 ${D(c.sym)}，一模一样`], 2: ['转位', `还是 ${D(c.root.name)}${c.q ? D(c.q) : ''} 这几个音，只是最低音换了（斜线后面是最低音）`], 1: ['同类型', `也是${(T.Q[c.q] || {}).zh || '这类和弦'}，只是换了根音：形状一样，整体平移`] };
    // 每首曲子的和弦是从哪来的
    const SRC = s => s.src === 'printed' ? ['谱上印的', '和弦名就印在原谱上，照抄的'] : s.src === 'analyzed' ? ['我读原谱判断的', s.ev ? '原谱上没印和弦名：我逐小节看左手低音和右手的音判断出来的，点小节号能看每小节的依据' : '原谱上没印和弦名：我按谱上的音判断出来的'] : ['学习用简化', '不是原谱上的和弦：为了好学，简化成了常用和弦，和原曲听起来会不一样'];
    const rows = allSongs().map(s => { const h = chordHits(s, c); return h.length ? { s, h, best: Math.max(...h.map(x => x.lv)) } : null; }).filter(Boolean)
      .sort((x, y) => y.best - x.best || y.h.filter(z => z.lv === y.best).length - x.h.filter(z => z.lv === x.best).length);
    if (!rows.length) return '<p class="fine">曲库里还没有用到这种和弦的曲子，先用上面的小进行练。</p>';
    const legend = `<p class="fine findlegend">找到的分三种：<b>原样</b> = 一模一样的 ${D(c.sym)}；<b>转位</b> = 同样的音，换了最低音；<b>同类型</b> = 同一种和弦换了根音。每首还标了和弦<b>从哪来</b>。</p>`;
    return legend + rows.slice(0, 6).map(({ s, h, best }) => {
      const use = h.filter(x => x.lv === best), src = SRC(s);
      const nums = [...new Set(use.map(x => x.n))];
      const phr = []; use.forEach(x => { const p0 = Math.floor(x.k / 4) * 4; const id = x.si + ':' + p0; if (!phr.some(p => p.id === id)) phr.push({ id, si: x.si, p0 }); });
      const blocks = phr.slice(0, 3).map(p => phraseHtml(s, p.si, p.p0, (n, x) => use.some(u => u.n === n && u.sym === x))).join('');
      const more = phr.length > 3 ? `<p class="fine">还有 ${phr.length - 3} 处，在曲目页里都高亮了。</p>` : '';
      // 这首里三种各有哪些
      const kinds = [3, 2, 1].map(lv => { const xs = h.filter(x => x.lv === lv); if (!xs.length) return ''; const ns = [...new Set(xs.map(x => x.n))], syms = [...new Set(xs.map(x => D(x.sym)))];
        return `<li><b class="lvtag lv${lv}">${LV[lv][0]}</b> ${syms.join('、')} · 第 ${ns.slice(0, 8).join('、')}${ns.length > 8 ? ' 等' : ''} 小节<br><small>${LV[lv][1]}</small></li>`; }).join('');
      // 每个命中小节的依据（有逐小节证据的才列）
      const nn = t => esc(String(t || '').replace(/\b([A-G])(#|b)?(\d)\b/g, (m, l, a) => l + (a === '#' ? '♯' : a === 'b' ? '♭' : '')));
      const ev = s.ev ? nums.slice(0, 4).map(n => { const e = s.ev[n]; if (!e) return ''; return `<li>第 ${n} 小节（原谱第 ${e.page} 页第 ${e.sys} 行）：${e.printed ? '谱上印着 ' + esc(e.printed) : '谱上没印，按 左手 ' + nn(e.lh) + ' + 右手 ' + nn(e.rh) + ' 判断'}</li>`; }).join('') : '';
      return `<details class="find"><summary><span><b>${esc(s.title)}</b><small><b class="lvtag lv${best}">${LV[best][0]}</b> ${[...new Set(use.map(x => D(x.sym)))].join('、')} · 第 ${nums.slice(0, 6).join('、')}${nums.length > 6 ? ' 等' : ''}小节 · <span class="srctag s-${s.src || 'simplified'}">${src[0]}</span></small></span><span class="arr">⌄</span></summary>
        <div class="findbody"><p class="fine findsrc"><b>和弦从哪来：${src[0]}</b> · ${src[1]}</p><ul class="findkinds">${kinds}</ul>${blocks}${more}${ev ? `<details class="findev"><summary>这几小节为什么是这个和弦</summary><ul>${ev}</ul></details>` : ''}<a class="ghost sm" href="#song-${s.id}-${nums.join('.')}-${encodeURIComponent(c.sym)}">到曲目页看这一段 →</a></div></details>`;
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
  // ---------------- 曲目：弹一首曲子（看谱 → 认和弦 → 弹下来）----------------
  // 类型自动识别；用户可以自己改标签（S.tags[id] 覆盖自动结果）
  const TYPES = ['古典', '影视', '流行', '儿歌民谣', '我的谱'];
  function autoTags(s) {
    const t = `${s.title} ${s.sub || ''} ${s.tag || ''}`, out = [];
    if (/莫扎特|巴赫|贝多芬|克列门蒂|帕赫贝尔|肖邦|舒伯特|海顿|奏鸣曲|前奏曲|BWV|K\.\d|Op\./.test(t) || s.tag === '古典') out.push('古典');
    else if (/《|电影|久石让|宫崎骏|爱乐之城|天空之城|OST/i.test(t)) out.push('影视');
    else if (/儿歌|民谣|民歌|童谣/.test(t)) out.push('儿歌民谣');
    else if (S.custom.some(c => c.id === s.id) && !SONGS.some(x => x.id === s.id)) out.push('我的谱');
    else out.push('流行');
    if (s.key) out.push(/m$/.test(s.key) ? '小调' : '大调');
    const flat = songFlat(s), sev = flat.filter(x => /7|maj7|m7/.test(x)).length;
    if (flat.length && sev / flat.length > 0.3) out.push('七和弦多');
    if (hasFull(s.id)) out.push('有扒谱');
    if (s.copy) out.push('有版权');
    return out;
  }
  const tagsOf = s => (S.tags && S.tags[s.id]) || autoTags(s);
  const typeOf = s => tagsOf(s).find(t => TYPES.includes(t)) || '流行';
  function miniStrip(s) { return `<span class="mstrip">${songFlat(s).map(x => `<i class="f${chordFunc(x, s.key)}"></i>`).join('')}</span>`; }
  const LV = { songs: 'card', acc: 'card' };
  function viewToggle(k) { const v = (S.lv && S.lv[k]) || 'card'; return `<div class="vtoggle"><button class="${v === 'card' ? 'on' : ''}" data-act="lvset" data-k="${k}" data-v="card" aria-label="卡片">▦</button><button class="${v === 'list' ? 'on' : ''}" data-act="lvset" data-k="${k}" data-v="list" aria-label="条状">☰</button></div>`; }
  function vSongs() {
    const songs = allSongs(), drafts = SONG_DRAFTS.filter(d => !songs.some(s => s.title === d.title));
    const lv = (S.lv && S.lv.songs) || 'card', f = S.songFilter || '全部';
    const allTags = [...new Set(songs.flatMap(tagsOf))].filter(t => !TYPES.includes(t));
    const types = TYPES.filter(t => songs.some(s => typeOf(s) === t));
    const shown = songs.filter(s => f === '全部' || tagsOf(s).includes(f));
    const prog = s => { const l = (S.songs[s.id] || {}).level || 0, a = (S.songs[s.id] || {}).away || 0; return `<span class="lv">${[0, 1, 2, 3].map(i => `<i class="${i < l ? 'on' : i < a ? 'half' : ''}"></i>`).join('')}</span>`; };
    const card = s => `<a class="scard" href="#song-${s.id}"><span class="stype">${typeOf(s)}</span><b>${esc(s.title)}</b><small>${esc(s.sub || '')}</small>${miniStrip(s)}<span class="smeta">${s.key ? kz(s.key) : '未设调'} · ${srcLabel(s)}</span><span class="sfoot">${prog(s)}<button class="tagbtn" data-act="tagedit" data-id="${s.id}">标签</button></span></a>`;
    const row = s => `<li><a href="#song-${s.id}"><span><b>${esc(s.title)}</b><small>${typeOf(s)} · ${s.key ? kz(s.key) : '未设调'} · ${srcLabel(s)}</small>${miniStrip(s)}</span><span class="lv2">${prog(s)}<button class="tagbtn" data-act="tagedit" data-id="${s.id}">标签</button></span></a></li>`;
    view.innerHTML = `<header class="top"><div><small>弹一首曲子：看谱 → 认和弦 → 弹下来</small><h1>曲目</h1></div><a class="stat" href="#scan"><b>⌗</b><small>识谱</small></a><a class="stat" href="#edit-new"><b>＋</b><small>手动</small></a></header><div class="seg2"><a class="on" href="#songs">曲目</a><a class="" href="#acc">伴奏</a></div>
      <div class="listbar"><div class="chips scroll">${['全部'].concat(types, allTags).map(t => `<button class="chip${f === t ? ' on' : ''}" data-act="sfilter" data-v="${esc(t)}">${t}${t === '全部' ? '' : ` <small>${songs.filter(s => tagsOf(s).includes(t)).length}</small>`}</button>`).join('')}</div>${viewToggle('songs')}</div>
      ${lv === 'card' ? `<div class="cards">${shown.map(card).join('')}</div>` : `<ul class="list slist">${shown.map(row).join('')}</ul>`}
      ${drafts.length ? `<ul class="list">${drafts.map(d => `<li class="draft"><a href="#edit-new-${SONG_DRAFTS.indexOf(d)}"><span><b>${esc(d.title)}</b><small>${esc(d.sub)}</small></span><span class="arr">＋</span></a></li>`).join('')}</ul>` : ''}
      <div class="pills" style="margin-top:14px"><a class="pill" href="#browse">按和弦找乐句</a><a class="pill" href="#scan">上传谱子识别和弦</a><a class="pill" href="#acc">想练即兴伴奏？去「伴奏」</a></div>
      <p class="fine">色条 = 整首的和声（深灰 稳 · 蓝 走 · 橙 紧）。四个小格 = 背谱四层：实心是在琴上弹过，虚线是屏幕上点过。</p>`;
  }
  function tagPop(anchor, id) {
    const s = allSongs().find(x => x.id === id); if (!s) return;
    const cur = tagsOf(s), pool = [...new Set(TYPES.concat(allSongs().flatMap(tagsOf), ['考级', '想学', '已背下']))];
    infoPop(anchor, '标签 · ' + esc(s.title), `<p class="fine">点一下加上 / 去掉。类型（第一行）只能选一个。${S.tags && S.tags[id] ? ' <a href="#" data-act="tagreset" data-id="' + id + '">恢复自动识别</a>' : ''}</p>
      <div class="chips">${TYPES.map(t => `<button class="chip${cur.includes(t) ? ' on' : ''}" data-act="tagtog" data-id="${id}" data-v="${t}" data-type="1">${t}</button>`).join('')}</div>
      <div class="chips">${pool.filter(t => !TYPES.includes(t)).map(t => `<button class="chip${cur.includes(t) ? ' on' : ''}" data-act="tagtog" data-id="${id}" data-v="${esc(t)}">${esc(t)}</button>`).join('')}</div>
      <div class="row"><input id="newtag" class="tagin" placeholder="自己加一个标签"><button class="ghost sm" data-act="tagadd" data-id="${id}">加上</button></div>`);
  }
  // ---------------- 伴奏：给旋律配伴奏（一首歌 × 一种伴奏型）----------------
  function singTags(x) { const t = x.sub + ' ' + x.title, out = [x.beats + '/4 拍']; out.push(/儿歌|小星星/.test(t) ? '儿歌' : /贝多芬|帕赫贝尔|莫扎特/.test(t) ? '古典旋律' : /生日/.test(t) ? '生活' : '老歌'); const ch = [...new Set(x.bars.flatMap(b => String(b[2] || '').split(/\s+/).filter(Boolean).map(y => y.split(':')[0])))]; out.push(ch.length <= 3 ? '三个和弦' : '多于三个和弦'); return out; }
  function vAcc() {
    const d = day(), lv = (S.lv && S.lv.acc) || 'card', f = S.accFilter || '全部';
    const tags = [...new Set(SING.flatMap(singTags))], shown = SING.filter(x => f === '全部' || singTags(x).includes(f));
    const chordsOf = x => [...new Set(x.bars.flatMap(b => String(b[2] || '').split(/\s+/).filter(Boolean).map(y => y.split(':')[0])))];
    const firstMel = x => songTimeline(x).notes.slice(0, 8).map(n => n.deg || '0').join(' ');
    const patName = x => { const pats = PATTERNS[x.beats]; const p = pats.find(q => q.id === SG.pat[x.id]); return p ? p.name : '还没选伴奏型'; };
    const card = x => `<a class="scard acard" href="#sing-${x.id}"><span class="stype">${x.beats}/4 拍</span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small><span class="jpprev">${firstMel(x)}</span><span class="chordset">${chordsOf(x).map(c => `<i class="f${chordFunc(c, x.key)}">${D(c)}</i>`).join('')}</span><span class="smeta">${patName(x)}</span></a>`;
    const row = x => `<li><a href="#sing-${x.id}"><span><b>${esc(x.title)}</b><small>${x.beats}/4 拍 · ${chordsOf(x).map(D).join(' ')} · ${patName(x)}</small></span><span class="arr">→</span></a></li>`;
    view.innerHTML = `<header class="top"><div><small>给旋律配伴奏：一首歌 × 一种伴奏型</small><h1>伴奏</h1></div></header><div class="seg2"><a class="" href="#songs">曲目</a><a class="on" href="#acc">伴奏</a></div>
      <a class="unitbar" href="#acctest"><small>每日一考${d.acc ? ' · 今天已完成 ✓' : ''}</small><b>给一段旋律配和弦</b><small>4 小节 · 选 I / IV / V · 弹给你听对不对</small></a>
      <div class="listbar"><div class="chips scroll">${['全部'].concat(tags).map(t => `<button class="chip${f === t ? ' on' : ''}" data-act="afilter" data-v="${esc(t)}">${t}</button>`).join('')}</div>${viewToggle('acc')}</div>
      ${lv === 'card' ? `<div class="cards">${shown.map(card).join('')}</div>` : `<ul class="list">${shown.map(row).join('')}</ul>`}
      <div class="pills" style="margin-top:14px"><a class="pill" href="#unit-u13">即兴伴奏入门：三步配和弦</a><a class="pill" href="#combo">组合和弦</a><a class="pill" href="#songs">想弹整首曲子？去「曲目」</a></div>
      <p class="fine">卡片上：第一句旋律（简谱）、这首用到的和弦（颜色 = 稳 / 走 / 紧）、你上次选的伴奏型。</p>`;
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
  function songGrid(s, only = -1) {
    const key = s.key, starts = sectionStarts(s);
    let idx = 0;
    return s.sections.map((sec, si) => (only >= 0 && si !== only) ? (idx += parseBars(sec.bars).flat().length, '') : `<div class="sec"><small>${esc(sec.name)}</small><div class="bars">${parseBars(sec.bars).map((bar, bi) => `<div class="bar"><span class="bn">${starts[si] + bi}</span>${bar.map(sym => {
      const a = T.analyze(sym, key), i = idx++;
      return `<div class="cell${s.ev && s.ev[starts[si] + bi] && s.ev[starts[si] + bi].conf === 'low' ? ' lowconf' : ''}" data-i="${i}" data-n="${starts[si] + bi}" data-act="explain" data-s="${esc(sym)}"><b>${D(sym)}</b><i>${a ? degLabel(sym, key) : '?'}</i>${chordShape(sym, key)}${funcTag(a && a.func)}</div>`;
    }).join('')}</div>`).join('')}</div></div>`).join('');
  }
  // 曲目页主体：谱和和弦在一起，一小节对一小节
  const FUNC_ZH = { T: '稳', S: '走', D: '紧' };
  function barLabel(s, n) {
    const bm = songBarMap(s)[n]; if (!bm) return '';
    return n + '  ' + bm.map(x => { const a = T.analyze(x, s.key); return D(x) + ' ' + degLabel(x, s.key) + (a && FUNC_ZH[a.func] ? ' ' + FUNC_ZH[a.func] : ''); }).join('  ·  ');
  }
  // ---------------- 和弦的「体块」：一小块大谱表，每个音换成一根横条（位置 = 五线谱上的高低，颜色 = 感觉色）----------------
  const LETTER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
  // 配色方式：稳走紧（和弦在曲子里的作用）或 和弦色（和弦本身的性质，和「和弦」页一致）。默认稳走紧
  const colorMode = () => (S.colorMode === 'chord' ? 'chord' : 'func');
  const colorSeg = () => `<span class="seg2 cmode" role="group" aria-label="配色方式">${[['func', '稳 · 走 · 紧'], ['chord', '和弦色']].map(([k, t]) => `<a class="${colorMode() === k ? 'on' : ''}" data-act="colormode" data-v="${k}">${t}</a>`).join('')}</span>`;
  function chordShape(sym, key, w = 64, h = 68) {
    const c = T.parseChord(sym); if (!c) return '';
    const b = c.bass || c.root; let bm = 36 + b.pc; if (bm < 40) bm += 12;
    const step = (name, midi) => { const L = LETTER[name[0]]; let oct = Math.floor(midi / 12) - 1; if (name.startsWith('B#')) oct -= 1; if (name.startsWith('Cb')) oct += 1; return L + 7 * oct; };
    const notes = [{ st: step(b.name, bm), L: 1 }].concat(T.voicing(c).map(n => ({ st: step(n.name, n.midi), L: 0 })));
    // 竖向范围：低音谱表最下线 G2（18）到高音谱表最上线 F5（38），留一点上下余量
    const top = 41, bot = 15, k = h / (top - bot), y = st => (top - st) * k;
    const lines = [30, 32, 34, 36, 38, 18, 20, 22, 24, 26].map(st => `<line x1="0" x2="${w}" y1="${y(st).toFixed(1)}" y2="${y(st).toFixed(1)}"/>`).join('');
    const ledger = notes.some(n => n.st === 28) ? `<line class="ldg" x1="${w * 0.3}" x2="${w * 0.7}" y1="${y(28).toFixed(1)}" y2="${y(28).toFixed(1)}"/>` : '';
    const f = klCfg().feel ? (colorMode() === 'chord' ? 'Q' : chordFunc(sym, key)) : 'N';
    // 横条和音符头一样宽（约 1.4 个谱线间距），居中；相邻二度像五线谱一样错开半个身位
    const nw = k * 2.8, cx = w / 2 - nw / 2, sorted = notes.slice().sort((p, q) => p.st - q.st);
    sorted.forEach((n, i) => { n.dx = i && sorted[i - 1].st === n.st - 1 && !sorted[i - 1].dx ? nw * 0.95 : 0; });
    const bars = notes.map(n => `<rect class="${n.L ? 'lh' : 'rh'}" x="${(cx + n.dx).toFixed(1)}" y="${(y(n.st) - k * 0.6).toFixed(1)}" width="${nw.toFixed(1)}" height="${(k * 1.2).toFixed(1)}" rx="${(k * 0.6).toFixed(1)}"/>`).join('');
    return `<svg class="cshape f${f}" style="${hueVars(cxHue(c.q))}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><g class="sl">${lines}${ledger}</g>${bars}</svg>`;
  }
  // ---------------- 键盘图层：用键盘上的高低看和弦（和弦格子下面）----------------
  // 三层可以分别开关：调内音（铺底）· 感觉色（稳走紧）· 和弦音（圆点 + 字：级数 / R 3 5 7 / 音名）；「只看」R 3 5 7 9
  const KL = { i: 0 };
  const klCfg = () => (S.kl = Object.assign({ scale: true, feel: true, tones: true, label: 'int', show: { R: 1, 3: 1, 5: 1, 7: 1, 9: 1 } }, S.kl || {}));
  const INTV = { 0: 'R', 1: '♭9', 2: '9', 3: '♭3', 4: '3', 5: '11', 6: '♭5', 7: '5', 8: '♯5', 9: '6', 10: '♭7', 11: '7' };
  const INT_GROUP = { 0: 'R', 3: '3', 4: '3', 6: '5', 7: '5', 8: '5', 10: '7', 11: '7', 1: '9', 2: '9', 5: '9', 9: '9' };
  function klDeg(pc, key) {
    const sc = T.scale(T.parseKey(key), true).map(n => T.parseNote(n.name).pc), i = sc.indexOf(pc);
    if (i >= 0) return String(i + 1);
    const lo = sc.indexOf((pc + 11) % 12); if (lo >= 0) return '♯' + (lo + 1);
    const hi = sc.indexOf((pc + 1) % 12); return hi >= 0 ? '♭' + (hi + 1) : '?';
  }
  // 和弦里每个音：根音 rt / 没动 st / 挪了或新加 mv（和「和弦」页同一套）
  function toneRole(c, m) { const i = c.notes.findIndex(n => n.pc === m % 12); return i < 0 ? 'st' : cxRole(c, i); }
  function klHtml(s, sym) {
    const cfg = klCfg(), c = T.parseChord(sym); if (!c) return '';
    const K = T.parseKey(s.key), scale = T.scale(K, true).map(n => T.parseNote(n.name).pc), func = chordFunc(sym, s.key);
    const b = c.bass || c.root; let bass = 36 + b.pc; if (bass < 40) bass += 12;
    const tones = [bass].concat(T.voicing(c).map(n => n.midi)), root = c.root.pc;
    // E2–G5：左手低音 + 右手和弦刚好装下，键不会太窄
    const lo = 40, hi = 79, whites = []; for (let m = lo; m <= hi; m++) if (![1, 3, 6, 8, 10].includes(m % 12)) whites.push(m);
    const ww = 100 / whites.length, nameOf = m => { const n = c.notes.find(x => x.pc === m % 12) || (c.bass && c.bass.pc === m % 12 ? c.bass : null); return n ? n.name : T.noteAt(0, m % 12).name; };
    const lab = m => cfg.label === 'deg' ? klDeg(m % 12, s.key) : cfg.label === 'name' ? D(nameOf(m)) : INTV[((m - root) % 12 + 12) % 12];
    let html = '';
    const key = (m, x, w, black) => {
      const inSc = scale.includes(m % 12), isT = tones.includes(m), grp = INT_GROUP[((m - root) % 12 + 12) % 12], vis = isT && cfg.tones && cfg.show[grp];
      return `<div class="lk ${black ? 'b' : 'w'}${cfg.scale && inSc ? ' sc' : ''}" style="left:${x}%;width:${w}%" data-m="${m}">${m % 12 === 0 && !black ? `<small>C${m / 12 - 1}</small>` : ''}${vis ? `<i class="dot${cfg.feel ? (colorMode() === 'chord' ? ' ' + toneRole(c, m) : ' f' + func) : ''}${m === bass ? ' bass' : ''}">${lab(m)}</i>` : isT && cfg.tones ? '<i class="dot ghostdot"></i>' : ''}</div>`;
    };
    whites.forEach((m, i) => (html += key(m, i * ww, ww, false)));
    whites.forEach((m, i) => { if (m + 1 <= hi && [1, 3, 6, 8, 10].includes((m + 1) % 12)) html += key(m + 1, i * ww + ww * 0.66, ww * 0.62, true); });
    return `<div class="lkb" style="${colorMode() === 'chord' ? hueVars(cxHue(c.q)) : ''}">${html}</div>`;
  }
  function klPanel(s) {
    const cfg = klCfg(), flat = songFlat(s), i = Math.min(KL.i, flat.length - 1), sym = flat[i], a = T.analyze(sym, s.key);
    const chip = (k, v, n, on) => `<button class="chip sm${on ? ' on' : ''}" data-act="klset" data-k="${k}" data-v="${v}">${n}</button>`;
    return `<section class="klpanel" id="klpanel">
      <div class="klhead"><button class="ghost sm" data-act="klstep" data-v="-1">‹</button><div><b${colorMode() === 'chord' ? ` class="hq" style="${hueVars(cxHue((T.parseChord(sym) || {}).q))}"` : ''}>${D(sym)}</b><small>${a ? degLabel(sym, s.key) + ' · ' + (FUNC_ZH[a.func] || '') : ''} · 第 ${i + 1}/${flat.length} 个和弦</small></div><button class="ghost sm" data-act="klstep" data-v="1">›</button></div>
      ${klHtml(s, sym)}
      <div class="klrow"><small>图层</small>${chip('scale', 1, '调内音', cfg.scale)}${chip('feel', 1, '感觉色', cfg.feel)}${chip('tones', 1, '和弦音', cfg.tones)}</div>
      <div class="klrow"><small>圆点里写</small>${chip('label', 'int', 'R 3 5 7', cfg.label === 'int')}${chip('label', 'deg', '级数 1–7', cfg.label === 'deg')}${chip('label', 'name', '音名', cfg.label === 'name')}</div>
      <div class="klrow"><small>只看</small>${['R', '3', '5', '7', '9'].map(g => chip('show', g, g, cfg.show[g])).join('')}</div>
      <p class="fine">左边单独那个圆点（粗边）是左手低音，右边一组是右手和弦。只看 3 和 7：换和弦时这两个音通常只挪一点点，手跟着它们走就顺了。</p>
    </section>`;
  }
  function klShow(i) {
    const s = allSongs().find(x => x.id === route[1]); if (!s) return;
    const n = songFlat(s).length; KL.i = Math.max(0, Math.min(n - 1, i));
    const p = $('#klpanel'); if (p) p.outerHTML = klPanel(s);
    document.querySelectorAll('#grid .cell').forEach(c => c.classList.toggle('sel', +c.dataset.i === KL.i));
  }
  // 当前看的是哪一段（-1 = 全曲）：长曲子一次只看一段，不要从上滑到下
  function secRange(s, si) { const st = sectionStarts(s); if (si < 0) return null; return [st[si], st[si] + parseBars(s.sections[si].bars).length - 1]; }
  function songSheet(s, si = -1) {
    const sc = s.orig && s.orig.score;
    if (hasFull(s.id) || sc) return `<div class="sheet"><div class="score" id="songscore"><p class="fine">正在加载谱面…（第一次需要下载乐谱引擎）</p></div><p class="fine sheetnote">${hasFull(s.id) ? '按你上传的谱逐音扒下来的原曲（两只手）。' : sc.made ? '新造谱：左手是原谱左手，右手是这一小节的和弦（不含旋律）。' : '公有领域的原谱。'}</p></div>`;
    const st = sectionStarts(s);
    return `<div class="sheet">${s.sections.map((sec, i) => si >= 0 && i !== si ? '' : `<div class="stf">${si < 0 ? `<small>${esc(sec.name)}</small>` : ''}${Staff.html({ key: s.key, bars: parseBars(sec.bars), end: i === s.sections.length - 1 || si >= 0, time: i === 0 || si >= 0, start: st[i], hideName: !labOn(), numerals: labOn() })}</div>`).join('')}<p class="fine sheetnote">和声骨架：左手弹低音，右手弹和弦，不是原曲的音。</p></div>`;
  }
  function songSheetRender(s, si = -1) {
    const el = $('#songscore'); if (!el) return;
    const lab = {}; Object.keys(songBarMap(s)).forEach(n => (lab[n] = barLabel(s, +n)));
    const r = secRange(s, si);
    let sc, section = false;
    if (hasFull(s.id)) sc = { kern: FullScore.build(FULL[s.id].kern, { mode: 'orig', barChords: songBarMap(s), kp, title: '', lyrics: (S.lyrics || {})[s.id], from: r ? r[0] : null, to: r ? r[1] : null }) };
    else { sc = Object.assign({}, s.orig.score); if (r) { sc.measures = r[0] + '-' + r[1]; section = true; } else section = !sc.made && !!sc.measures; }
    Score.render(el, sc, { section, labels: lab, barAct: true }).then(() => {
      const want = route[2] ? route[2].split('.').map(Number) : [];
      el.querySelectorAll('text.chordlab').forEach(t => { if (want.includes(+t.dataset.n)) t.classList.add('hit'); });
      const first = el.querySelector('text.chordlab.hit'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }).catch(() => (el.innerHTML = '<p class="no">谱面加载失败：需要联网。可以先用「只看和弦格子」。</p>'));
  }
  // 点一小节：就在点的位置旁边弹出这一小节的依据 + 和弦解释
  function barPop(s, n, x, y) {
    const bm = songBarMap(s)[n]; if (!bm) return;
    document.querySelectorAll('.cpop, .tpop').forEach(e => e.remove());
    const host = document.getElementById('phone') || document.body;
    const el = document.createElement('div'); el.className = 'tpop'; el.dataset.act = 'tpopclose';
    el.innerHTML = `<div class="tpop-card barpop" data-act="tpopstay"><i class="tpop-arrow"></i>
      <div class="tpop-h"><b>第 ${n} 小节 · ${bm.map(D).join(' ')}</b><button class="tpop-play" data-act="play" data-s="${esc(bm[0])}">▶ 听</button></div>
      ${barEvidence(s, n, bm[0]).replace(/<b>第 \d+ 小节 · /, '<b>').replace(/<b>第 \d+ 小节<\/b> · /, '')}<p class="tpop-ex">${bm.map(x => chordExplain(x, s.key)).join('<br>')}</p></div>`;
    host.appendChild(el);
    const card = el.querySelector('.tpop-card'), arrow = el.querySelector('.tpop-arrow');
    const hr = el.getBoundingClientRect(); // 浮层自己的范围 = 屏幕（手机）或手机外框（电脑预览）
    const W = Math.min(340, hr.width - 24); card.style.width = W + 'px';
    const cx = x - hr.left, left = Math.max(12, Math.min(hr.width - W - 12, cx - W / 2));
    const H = card.offsetHeight, below = y - hr.top + 14, above = y - hr.top - 14 - H, up = below + H > hr.height - 70 && above > 10;
    card.style.left = left + 'px'; card.style.top = Math.max(8, up ? above : below) + 'px';
    arrow.style.left = Math.max(14, Math.min(W - 14, cx - left)) + 'px'; card.classList.add(up ? 'up' : 'down');
    tpopAt = Date.now(); requestAnimationFrame(() => el.classList.add('open'));
    playChord(bm[0]);
  }
  function songFlat(s) { return s.sections.flatMap(sec => parseBars(sec.bars).flat()); }
  // 曲目页：三个分页，每页只做一件事 —— 谱（一次一段）/ 结构 / 练
  function vSong() {
    const s = allSongs().find(x => x.id === route[1]);
    if (!s) return go('#songs');
    if (!s.sections.length || !s.key) return go('#edit-' + s.id);
    const lv = songLv(s.id), st = sectionStarts(s);
    S.songSec = S.songSec || {};
    if (route[2]) { const n0 = +route[2].split('.')[0]; const k = st.findIndex((x, i) => n0 >= x && n0 < x + parseBars(s.sections[i].bars).length); if (k >= 0) S.songSec[s.id] = k; S.songTab = 'sheet'; }
    const long = s.sections.flatMap(x => parseBars(x.bars)).length > 12;
    let si = S.songSec[s.id]; if (si == null) si = long ? 0 : -1;
    const tab = S.songTab || 'sheet', v = S.songView || 'sheet';
    RL.maxLv = hasFull(s.id) ? 3 : 2; RL.lvl3name = '两只手全部音符'; if (RL.lvl > RL.maxLv || (RL.lvl === 3 && rollPassed() < 2)) RL.lvl = 1;
    const tabs = `<div class="tabs">${[['sheet', '谱'], ['shape', '结构'], ['play', '练']].map(([k, n]) => `<button class="tab${tab === k ? ' on' : ''}" data-act="songtab" data-v="${k}">${n}</button>`).join('')}</div>`;
    const secChips = v === 'roll' || s.sections.length < 2 ? '' : `<div class="chips scroll secchips">${s.sections.map((x, i) => `<button class="chip${si === i ? ' on' : ''}" data-act="songsec" data-v="${i}">${esc(x.name.replace(/\s*[‖:].*$/, ''))}</button>`).join('')}<button class="chip${si < 0 ? ' on' : ''}" data-act="songsec" data-v="-1">全曲</button></div>`;
    let body = '';
    if (tab === 'sheet') body = `
      <div class="chips scroll"><button class="chip${v === 'sheet' ? ' on' : ''}" data-act="songview" data-v="sheet">谱 + 和弦</button><button class="chip${v === 'roll' ? ' on' : ''}" data-act="songview" data-v="roll">瀑布流</button><button class="chip${v === 'grid' ? ' on' : ''}" data-act="songview" data-v="grid">和弦格子</button>${hasFull(s.id) ? `<a class="chip linkchip" href="#cmp-${s.id}">原曲↔和弦 →</a>` : ''}<button class="pill info" data-act="info" data-k="how">ⓘ</button></div>
      ${secChips}
      ${route[2] ? `<p class="hitnote">从 <b>${D(route[3] || '')}</b> 和弦页过来：要找的是第 ${route[2].split('.').join('、')} 小节。</p>` : ''}
      ${v === 'grid' ? `${colorSeg()}<div class="seg gmode" role="group" aria-label="格子排法">${[['wrap', '折行'], ['scroll', '横滑']].map(([k, t]) => `<button class="${(S.gridMode || 'wrap') === k ? 'on' : ''}" data-act="gridmode" data-v="${k}">${t}</button>`).join('')}</div><div class="grid" id="grid" data-mode="${S.gridMode || 'wrap'}">${songGrid(s, si)}</div>${(() => { const first = view && si >= 0 ? songFlat({ sections: s.sections.slice(0, si) }).length : 0; if (KL.song !== s.id || KL.sec !== si) { KL.song = s.id; KL.sec = si; KL.i = first; } return klPanel(s); })()}<p class="explain" id="explain">点任意和弦：听声音，并看它是什么意思。</p>` : v === 'roll' ? rollEntry('song', hasFull(s.id) ? '整首按原谱落下：简单只弹和弦，中等加左手低音，困难是原曲两只手' : '整首落下：简单只弹和弦，中等加左手低音') : songSheet(s, si)}`;
    if (tab === 'shape') body = `
      ${harmonyStrip(s)}
      <section class="logic"><h3>谱面逻辑 <small>· 点下划线的词看解释</small></h3>${songLogic(s).map(l => `<p>${l}</p>`).join('')}</section>
      ${s.note ? `<p class="fine">${esc(s.note)}</p>` : ''}`;
    if (tab === 'play') {
      const combos = COMBOS.map(cb => ({ cb, f: cbFind(cb).find(x => x.s.id === s.id) })).filter(x => x.f);
      body = `
      <a class="scorelink" href="#mem-${s.id}"><b>${place() === 'away' ? '屏幕上点出来' : '在琴上弹下来'} · 第 ${Math.min(4, lv + 1)} 层</b><small>一个和弦一个和弦弹对才往下走，四层提示越来越少</small><span>→</span></a>
      ${hasFull(s.id) ? `<a class="scorelink" href="#cmp-${s.id}"><b>原曲 ↔ 和弦伴奏</b><small>上下对比 · 右手原曲 + 左手和弦的练习版 · 可贴歌词</small><span>→</span></a>` : s.orig && s.orig.score ? `<a class="scorelink" href="#score-${s.id}"><b>${s.orig.score.made ? '新造谱（单独一页）' : '完整原谱（单独一页）'}</b><small>可分段、可听全部</small><span>→</span></a>` : ''}
      ${s.copy ? `<a class="scorelink" href="#along-${s.id}"><b>跟录音弹</b><small>放原曲录音，App 按原曲速度一小节一小节亮和弦</small><span>→</span></a>` : ''}
      ${combos.length ? `<h3 class="h3">这首里的组合和弦</h3><div class="pills">${combos.map(x => `<a class="pill" href="#combo-${x.cb.id}">${x.cb.name} · ${x.f.hits.length} 处</a>`).join('')}</div>` : ''}
      <div class="row"><button class="ghost" data-act="splay" data-id="${s.id}">▶ 只听和弦进行</button></div>
      ${s.rec ? `<section class="orig"><h3>真人演奏录音</h3><p class="fine">学习段落 ${s.rec.clipName}</p><audio controls preload="none" src="${s.rec.clip}"></audio><p class="fine">完整版</p><audio controls preload="none" src="${s.rec.full}"></audio><p class="fine">${s.rec.credit} · <a href="${s.rec.url}" target="_blank" rel="noopener">来源 ↗</a></p></section>` : ''}
      <details class="logic"><summary>背谱方法</summary>
        <p>1. <b>先分析后记忆</b>：每一段先说出「调、功能、怎么结束」。</p>
        <p>2. <b>分块</b>：按乐句（通常 2 或 4 小节）记，不按单个音记。</p>
        <p>3. <b>找相同与不同</b>：重复的地方只记一次，只把注意力放在不同处。</p>
        <p>4. <b>离开琴背</b>：能在脑中把级数说出来，手上才稳。</p></details>`;
    }
    view.innerHTML = `<header class="top"><div><a class="back" href="#songs">←</a><small>${esc(s.sub || '')}</small><h1>${esc(s.title)}</h1></div><a class="stat" href="#edit-${s.id}"><b>✎</b><small>编辑</small></a></header>
      ${songTop(s)}${tabs}<section class="songmain">${body}</section>`;
    if (tab !== 'sheet') return;
    if (v === 'roll') {}
    else if (v === 'sheet' && ((s.orig && s.orig.score) || hasFull(s.id))) songSheetRender(s, si);
    if (route[2] && v === 'grid') {
      const want = route[2].split('.').map(Number); let first = null;
      view.querySelectorAll('#grid .bar').forEach(el => { const n = +el.querySelector('.bn').textContent; if (want.includes(n)) { el.classList.add('hit'); first = first || el; } });
      if (first) setTimeout(() => first.scrollIntoView({ block: 'center', behavior: 'smooth' }), 80);
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
    el.innerHTML = `<dl class="stor"><dt>保存方式</dt><dd>本机两份（localStorage + IndexedDB）${cloudCfg() ? ' + GitHub 云端' : ''}</dd><dt>持久保存</dt><dd>${persisted ? '已开启，不会被系统自动清理' : standalone ? '主屏幕 App，iOS 不会自动清理' : '未开启 · 建议添加到主屏幕'}</dd><dt>每日快照</dt><dd>${snaps.length ? snaps.length + ' 份，最近 ' + snaps[snaps.length - 1].slice(5) : '还没有'}</dd><dt>最近备份</dt><dd>${S.backupAt ? new Date(S.backupAt).toLocaleDateString('zh-CN') : '还没导出过'}</dd>${used ? `<dt>占用空间</dt><dd>${used}</dd>` : ''}</dl>`;
  }
  async function exportBackup() {
    S.backupAt = Date.now(); save();
    const name = 'ChordMatter-备份-' + today() + '.json';
    const file = new File([JSON.stringify(S)], name, { type: 'application/json' });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'ChordMatter 备份' }); storInfo(); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); storInfo();
  }
  function vSet() {
    const th = S.theme || 'auto';
    view.innerHTML = `<header class="top"><div><small>外观和数据</small><h1>设置</h1></div></header>
      <h3 class="h3">外观</h3>
      <p class="fine">深色模式。整个 App 都会变；谱子里的音符、彩条会跟着换成适合深色的颜色。</p>
      <div class="chips">${[['auto', '跟随手机'], ['light', '始终浅色'], ['dark', '始终深色']].map(([v, t]) => `<button class="chip${th === v ? ' on' : ''}" data-act="theme" data-v="${v}">${t}</button>`).join('')}</div>
      <h3 class="h3">记录和数据</h3>
      <a class="link" href="#me"><small>记录</small><b>练琴日历、进度、备份、云端同步</b><span>→</span></a>
      <a class="link" href="#cards"><small>卡册</small><b>曲谱卡</b><span>→</span></a>
      <p class="fine">版本 ${APPV}</p>`;
  }
  function vMe() {
    CAL = CAL || { y: new Date().getFullYear(), m: new Date().getMonth() };
    view.innerHTML = `<header class="top"><div><a class="back" href="#today">←</a><small>记录</small><h1>我</h1></div></header>
      <section class="stats"><div><b>${streak()}</b><small>连续天</small></div><div><b>${S.xp}</b><small>XP</small></div><div><b>${UNITS.filter(u => unitState(u.id).done).length}/${UNITS.length}</b><small>单元</small></div></section>
      ${pkSummary()}
      <h3 class="h3 calh">练琴日历</h3><div class="calhead"><button class="ghost sm" data-act="calmonth" data-v="-1">‹</button><b>${CAL.y} 年 ${CAL.m + 1} 月</b><button class="ghost sm" data-act="calmonth" data-v="1">›</button></div>
      <div class="pills calshare"><button class="pill" data-act="sharemonth">分享这个月</button><button class="pill" data-act="shareday" data-v="${today()}">分享今天</button></div>
      <div id="calmonth">${calHtml(calWeeks(CAL.y, CAL.m))}</div>
      <p class="fine callegend">一天一小节：音符越高 = 练得越久，颜色越深 · 实心 = 当天 4 步都完成 · 空心 = 练了一部分 · 休止符 = 休息日 · 橙色双竖线 = 背下了一首曲子。点任意一天看详情。</p>
      <div id="caldetail" class="caldetail"></div>
      <a class="unitbar" href="#cards"><small>卡册 · ${ownedCards().length}/${CARDS.length}</small><b>${S.pts || 0} 分 · 再得 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))} 分抽一张曲谱卡</b></a>
      <h3 class="h3">最近的真实记录</h3>${logTable()}
      <h3 class="h3">琶音速度</h3><ul class="list">${Object.entries(S.arp).map(([k, v]) => `<li><a href="#arp-${k}"><span><b>${D(k)}</b></span><span>${v.bpm} BPM</span></a></li>`).join('') || '<li class="fine">还没有记录</li>'}</ul>
      <h3 class="h3">云端同步</h3><div id="cloudbox" class="cloudbox"></div>
      ${(window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) ? '' : `<div class="installtip"><b>装到手机主屏幕</b><p class="fine">用 Safari 打开这个网址 → 点底部的分享按钮 <span class="kbd">⬆︎</span> → 「添加到主屏幕」。以后点图标直接打开，全屏、离线也能用。</p></div>`}
      <h3 class="h3">数据</h3><div id="storinfo" class="fine">正在检查存储状态…</div>
      <p class="fine">版本 ${APPV} · 打开时会自动更新到最新版；看不到新功能就把 App 完全关掉再打开一次</p>
      <div class="row"><button class="ghost" data-act="export">导出备份</button><button class="ghost" data-act="import">导入备份</button><button class="ghost" data-act="reset">清空</button></div>
      <p class="fine">进度保存在这台 iPhone 上（两份 + 每日快照）。建议「添加到主屏幕」使用，iOS 不会清理主屏幕 App 的数据。换手机或重装前点「导出备份」，可以存到「文件」或 iCloud。<br>iPhone 静音键打开时可能听不到声音，请关闭静音。</p>`;
    storInfo(); cloudPaint();
    if (route[1] === 'cal') { const h = document.querySelector('.calh'); if (h) setTimeout(() => h.scrollIntoView({ block: 'start' }), 30); }
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
  // 伴奏页：三个分页 —— ① 看谱（双手谱）② 跟弹跟唱（大字现在/下一个）③ 为什么这样配
  function vSing() {
    const song = SING.find(s => s.id === route[1]) || SING[0];
    const pats = PATTERNS[song.beats];
    const pat = pats.find(p => p.id === SG.pat[song.id]) || pats[song.beats === 3 ? 1 : 1];
    const tl = songTimeline(song);
    const first = tl.slots[0], tab = SG.tab || 'score';
    const tabs = `<div class="tabs">${[['score', '① 看谱'], ['play', '② 跟弹跟唱'], ['why', '③ 为什么这样配']].map(([k, n]) => `<button class="tab${tab === k ? ' on' : ''}" data-act="sgtab" data-v="${k}">${n}</button>`).join('')}</div>`;
    const patChips = `<div class="chips"><small class="chipsh">左手伴奏型</small>${pats.map(p => `<button class="chip${p === pat ? ' on' : ''}" data-act="sgpat" data-v="${p.id}">${p.name}</button>`).join('')}</div>`;
    const jpNote = '<p class="fine">简谱：数字是旋律（1 = do），下面是歌词，上面是和弦。<b>只是给跟唱看的</b>，弹琴请看「① 看谱」的五线谱。</p>';
    let body = '';
    if (tab === 'score') {
      RL.maxLv = 3; RL.lvl3name = '旋律 + ' + pat.name; if (RL.lvl === 3 && rollPassed() < 2) RL.lvl = 1;
      body = `${patChips}
        <p class="fine">右手弹上面一行（原曲旋律，歌词在音符下面），左手弹下面一行（「${pat.name}」）。换伴奏型，左手整首跟着换。</p>
        <div class="chips"><button class="chip${SG.view === 'roll' ? '' : ' on'}" data-act="sgview" data-v="score">谱面</button><button class="chip${SG.view === 'roll' ? ' on' : ''}" data-act="sgview" data-v="roll">瀑布流</button></div>
        ${SG.view === 'roll' ? rollEntry('sing', '右手旋律 + 左手「' + pat.name + '」跟着彩条落下') : `<div class="score" id="twoscore"><p class="fine">正在生成双手谱…（第一次需要下载乐谱引擎）</p></div>
        <div class="row"><button class="btn" data-act="scplay" id="scbtn">▶ 旋律 + 伴奏一起听</button><button class="ghost sm" data-act="screte" data-v="-0.1">慢</button><button class="ghost sm" data-act="screte" data-v="0.1">快</button></div>`}`;
    }
    if (tab === 'play') body = `${patChips}
        <div class="now"><div><small>现在</small><b id="nowc">${D(first.sym)}</b></div><div><small>下一个</small><span id="nextc">${tl.slots[1] ? D(tl.slots[1].sym) : ''}</span></div><div><small>级数</small><span id="nowr">${degLabel(first.sym, song.key)}</span></div></div>
        <div class="row"><button class="btn" data-act="sgplay" data-id="${song.id}" id="sgbtn">▶ 开始（先数一小节）</button></div>
        <div class="row"><button class="ghost sm${SG.acc ? ' on' : ''}" data-act="sgtog" data-k="acc">伴奏 ${SG.acc ? '开' : '关'}</button><button class="ghost sm${SG.mel ? ' on' : ''}" data-act="sgtog" data-k="mel">旋律 ${SG.mel ? '开' : '关'}</button><button class="ghost sm" data-act="sgrate" data-v="-0.1">慢</button><button class="ghost sm" data-act="sgrate" data-v="0.1">快</button></div>
        <p class="fine">速度 ${Math.round(song.bpm * SG.rate)} BPM。关掉「伴奏示范」= 你自己弹伴奏；关掉「旋律」= 你自己唱。</p>
        <details class="jpbox"><summary>显示简谱（给跟唱看）</summary>${jpNote}${jianpuBars(song)}</details>`;
    if (tab === 'why') body = `
        <p class="fine">旋律（蓝色 = 落在和弦里的音，灰色 = 一带而过的经过音）：</p>${jianpuBars(song)}
        ${melWhyHtml(song)}
        <details class="patdetail"><summary>「${pat.name}」这个伴奏型怎么弹（单个和弦图解 + 键盘）</summary><section class="patbox">
          <p class="pwhen"><b>${pat.name}</b>：${pat.tip}。适合${PAT_WHEN[pat.id] || ''}。</p>
          <div id="pstaff">${patStaff(first.sym, pat, song.beats)}</div>
          ${patGrid(pat, song.beats)}
          <div id="skb">${kb(uniq(patEvents(first.sym, pat).flatMap(e => e.keys.map(k => k.midi))).map(m => ({ midi: m })), { lo: 36, hi: 72 })}</div>
          <div class="row"><button class="ghost sm" data-act="patplay" data-id="${song.id}">▶ 只听这个伴奏型（两小节）</button></div>
          <p class="fine">格子里是每半拍弹什么：根 = 和弦根音，五 = 五音，高根 / 高三 = 高八度的根音 / 三音，和弦 = 三个音一起按。换和弦时形状不变，只是整体平移。</p>
        </section></details>`;
    view.innerHTML = `<div class="qbar"><a href="#acc" class="x">×</a><span class="meter"><i id="sgbar" style="width:0%"></i></span><small>${song.title}</small></div>
      <section class="sing">${tabs}${body}</section>`;
    if (tab === 'score') { if (SG.view !== 'roll') setTimeout(() => singScore(song), 0); }
    melFit(song).forEach(f => { if (f.n.midi == null) return; view.querySelectorAll(`.jm .jn[data-n="${f.n.i}"]`).forEach(e => e.classList.add(f.role ? 'ct' : 'nct')); });
  }
  // 旋律 → 伴奏：每个旋律音落在当时那个和弦里的哪个位置（根 / 三 / 五 / 七），不在就是经过音
  function melFit(song) {
    const tl = songTimeline(song);
    return tl.notes.map(n => {
      const sl = tl.slots.find(x => n.start >= x.start - 1e-6 && n.start < x.start + x.d - 1e-6);
      if (!sl || n.midi == null) return { n, sl, role: null };
      const c = T.parseChord(sl.sym), k = c ? c.notes.findIndex(x => x.pc === ((n.midi % 12) + 12) % 12) : -1;
      return { n, sl, role: k < 0 ? null : ['根音', '三音', '五音', '七音'][k] };
    });
  }
  function melWhyHtml(song) {
    const fit = melFit(song), sc = T.scale(T.parseKey(song.key), true).map(x => x.name);
    const rows = song.bars.map((b, bi) => {
      const fs = fit.filter(f => f.n.bar === bi && f.sl);
      const groups = []; fs.forEach(f => { let g = groups.find(x => x.sl === f.sl); if (!g) groups.push((g = { sl: f.sl, fs: [] })); g.fs.push(f); });
      if (!groups.length) return '';
      const parts = groups.map(g => {
        const ct = g.fs.filter(f => f.role), nct = g.fs.filter(f => !f.role && f.n.midi != null);
        const uniqCt = []; ct.forEach(f => { if (!uniqCt.some(u => u.n.deg === f.n.deg)) uniqCt.push(f); });
        const where = groups.length > 1 ? `${g.sl.t === 0 ? '前' : '后'} ${g.sl.d} 拍` : '这一小节';
        return `${where}旋律 <b>${g.fs.filter(f => f.n.midi != null).map(f => f.n.deg).join(' ')}</b> → ${uniqCt.map(f => `${f.n.deg}（${D(sc[f.n.deg - 1])}）是 <b>${D(g.sl.sym)}</b> 的${f.role}`).join('，') || '没有落在和弦里的音'}，所以配 <b>${D(g.sl.sym)}</b>${nct.length ? `；${[...new Set(nct.map(f => f.n.deg))].join('、')} 不在和弦里，是一带而过的经过音` : ''}`;
      });
      return `<li><small>第 ${bi + 1} 小节${b[1] ? ' · ' + esc(String(b[1]).replace(/\s+/g, '')) : ''}</small><span>${parts.join('；')}。</span></li>`;
    }).join('');
    return `<details class="melwhy" open><summary>为什么配这些和弦？（逐小节）</summary><p class="fine">配和弦的方法只有一条：<b>看这几拍旋律唱的是哪个音，找一个包含它的和弦</b>，优先用 1、4、5 级（${D(T.degreeChord(T.parseKey(song.key), 0))}、${D(T.degreeChord(T.parseKey(song.key), 3))}、${D(T.degreeChord(T.parseKey(song.key), 4))}）。上面简谱里<span class="ctdemo">蓝色</span>的音是和弦音，灰色的是经过音。</p><ol class="whylist">${rows}</ol></details>`;
  }
  // 生成双手谱（Humdrum kern）：右手 = 简谱旋律，左手 = 每个和弦（柱式或根音）
  const KSIG = { C: '*k[]', G: '*k[f#]', D: '*k[f#c#]', F: '*k[b-]', Bb: '*k[b-e-]' };
  const KDUR = { 4: '1', 3: '2.', 2: '2', 1.5: '4.', 1: '4', 0.75: '8.', 0.5: '8', 0.25: '16' };
  function kp(name, midi) { const L = name[0], acc = name.slice(1).replace('#', '#').replace('b', '-'); let o = Math.floor(midi / 12) - 1; if (name === 'Cb') o++; if (name === 'B#') o--; return (o >= 4 ? L.toLowerCase().repeat(o - 3) : L.repeat(4 - o)) + acc; }
  function kd(b) { if (KDUR[b]) return [KDUR[b]]; const out = []; let r = b; [4, 2, 1, 0.5, 0.25].forEach(x => { while (r >= x - 1e-6) { out.push(KDUR[x]); r -= x; } }); return out; }
  // 伴奏型套到一小节上：事件落在哪个和弦的时间里就用哪个和弦；换和弦时如果没有新事件，把正在响的那一下换成新和弦接着弹
  function lhKeys(sym, code) {
    const c = T.parseChord(sym); if (!c) return [];
    const nameOf = m => { const pc = ((m % 12) + 12) % 12; const n = c.notes.find(x => x.pc === pc) || (c.bass && c.bass.pc === pc ? c.bass : null); return n ? n.name : T.noteAt(0, pc).name; };
    return accMidis(sym, code).map(m => [nameOf(m), m]);
  }
  function lhPattern(slots, pat, beats) {
    const out = [];
    slots.forEach(sl => {
      const a = sl.t, b = sl.t + sl.d, inside = pat.ev.filter(([t]) => t >= a - 1e-6 && t < b - 1e-6);
      if (!inside.length || inside[0][0] > a + 1e-6) { const prev = pat.ev.filter(([t]) => t <= a + 1e-6).pop() || pat.ev[0]; const first = inside.length ? inside[0][0] : b; out.push([a, Math.min(prev[0] + prev[2], first) - a > 0 ? Math.min(prev[0] + prev[2], first) - a : first - a, lhKeys(sl.sym, prev[1])]); }
      inside.forEach(([t, code, d]) => out.push([t, Math.min(d, b - t), lhKeys(sl.sym, code)]));
    });
    // 空隙补休止，保证每小节拍数完整
    const full = []; let cur = 0;
    out.sort((x, y) => x[0] - y[0]).forEach(e => { if (e[0] > cur + 1e-6) full.push([cur, e[0] - cur, []]); full.push(e); cur = e[0] + e[1]; });
    if (cur < beats - 1e-6) full.push([cur, beats - cur, []]);
    return full.map(([t, d, k]) => [t, d, k.length ? k : [['r', 0]]]);
  }
  function singKern(song, pat) {
    const K = T.parseKey(song.key), sc = T.scale(K, true).map(x => x.name), tl = songTimeline(song);
    // 第三个声部 **text = 歌词，贴在它左边的右手（旋律）声部下面
    const L = ['!!!OTL: ' + song.title + '（双手谱）', '**kern\t**kern\t**text', '*staff2\t*staff1\t*staff1', '*clefF4\t*clefG2\t*', (KSIG[song.key] || '*k[]') + '\t' + (KSIG[song.key] || '*k[]') + '\t*', `*M${song.beats}/4\t*M${song.beats}/4\t*`];
    let barStart = 0;
    song.bars.forEach((b, bi) => {
      const ns = tl.notes.filter(n => n.bar === bi), sl = tl.slots.filter(x => x.bar === bi);
      const len = ns.reduce((a, n) => a + n.beats, 0) < song.beats - 1e-6 && bi === 0 ? ns.reduce((a, n) => a + n.beats, 0) : song.beats;
      L.push(`=${bi + 1}\t=${bi + 1}\t=${bi + 1}`);
      const ev = [];
      let t = 0;
      ns.forEach(n => { const ds = kd(n.beats); ds.forEach((d, j) => { const tok = n.midi == null ? d + 'r' : d + kp(sc[n.deg - 1], n.midi) + (ds.length > 1 ? (j === 0 ? '[' : j === ds.length - 1 ? ']' : '_') : ''); ev.push([t, 1, tok]); if (j === 0 && n.midi != null && n.lyric && n.lyric !== '~') ev.push([t, 2, n.lyric.replace(/\s/g, '')]); t += 4 / parseFloat(d) * (d.endsWith('.') ? 1.5 : 1); }); });
      // 左手：按选中的伴奏型，每一拍用当时那个和弦
      if (bi === 0 && len < song.beats) { ev.push([0, 0, kd(len).map(d => d + 'r')[0]]); }
      else lhPattern(sl, pat, song.beats).forEach(([t0, d, keys]) => { const ds = kd(d); let tt = t0; ds.forEach((dd, j) => { const tie = ds.length > 1 ? (j === 0 ? '[' : j === ds.length - 1 ? ']' : '_') : ''; ev.push([tt, 0, keys[0][0] === 'r' ? dd + 'r' : keys.map(([nm, m]) => dd + kp(nm, m) + tie).join(' ')]); tt += 4 / parseFloat(dd) * (dd.endsWith('.') ? 1.5 : 1); }); });
      const times = [...new Set(ev.map(e => +e[0].toFixed(3)))].sort((a, b) => a - b);
      times.forEach(tt => { const g = k => ev.find(e => +e[0].toFixed(3) === tt && e[1] === k); const a = g(0), b2 = g(1), ly = g(2); L.push(`${a ? a[2] : '.'}\t${b2 ? b2[2] : '.'}\t${ly && b2 ? ly[2] : '.'}`); });
      barStart += len;
    });
    L.push('==\t==\t==', '*-\t*-\t*-');
    return L.join('\n');
  }
  const singPat = song => { const pats = PATTERNS[song.beats]; return pats.find(p => p.id === SG.pat[song.id]) || pats[1]; };
  window.__singKern = s => singKern(s, singPat(s)); // 自查用
  function singScore(song) {
    const el = $('#twoscore'); if (!el) return;
    const lab = {}; song.bars.forEach((b, i) => { lab[i + 1] = String(b[2] || '').split(/\s+/).filter(Boolean).map(x => { const sy = x.split(':')[0]; return D(sy) + ' ' + degLabel(sy, song.key); }).join('  '); });
    Score.render(el, { kern: singKern(song, singPat(song)) }, { section: false, labels: lab }).catch(() => (el.innerHTML = '<p class="no">双手谱加载失败：需要联网下载乐谱引擎。</p>'));
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
  const PCN = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']; // 收音 / 点键只知道音级时的音名
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
      drillJudge(pc === t.pcs[0], PCN[pc]);
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
    if (t.kind === 'note') return drillJudge(pc === t.pcs[0], PCN[pc]);
    DR.tap.has(pc) ? DR.tap.delete(pc) : DR.tap.add(pc);
    document.querySelectorAll('#tapkb .k').forEach(k => k.classList.toggle('sel', DR.tap.has(+k.dataset.m % 12)));
    if (DR.tap.size >= t.pcs.length) {
      const ok = t.pcs.every(p => DR.tap.has(p)) && DR.tap.size === t.pcs.length;
      DR.tap.clear();
      setTimeout(() => document.querySelectorAll('#tapkb .k').forEach(k => k.classList.remove('sel')), ok ? 200 : 400);
      drillJudge(ok);
    }
  }
  const placeChips = () => ''; // 改到页眉右上角统一切换
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
    let sc = s.orig.score;
    const made = !!sc.made, st = sectionStarts(s);
    const secs = s.sections.map((x, i) => [x.name, st[i] + '-' + (st[i] + parseBars(x.bars).length - 1)]);
    if (made) { if (SC.sid !== s.id) { SC.sid = s.id; SC.range = ''; } sc = Object.assign({}, sc, { measures: SC.range }); SC.section = !!SC.range; }
    view.innerHTML = `<header class="top"><div><a class="back" href="#song-${s.id}">←</a><small>${made ? '新造谱 · 小节号对着原谱' : esc(s.sub || '')}</small><h1>${esc(s.title)}</h1></div></header>
      ${made ? `<p class="fine madenote">${esc(sc.credit)}</p>
      <div class="chips"><button class="chip${SC.range ? '' : ' on'}" data-act="scrange" data-v="">全曲</button>${secs.map(([n, r]) => `<button class="chip${SC.range === r ? ' on' : ''}" data-act="scrange" data-v="${r}">${esc(n)}</button>`).join('')}</div>`
      : `<div class="chips"><button class="chip${SC.section ? '' : ' on'}" data-act="scmode" data-v="0">完整原谱（学习段落高亮）</button><button class="chip${SC.section ? ' on' : ''}" data-act="scmode" data-v="1">只看学习段落 ${sc.measures} 小节</button></div>`}
      <div class="row"><button class="btn" data-act="scplay" id="scbtn">▶ ${SC.section ? '听这一段' : '听全部'}</button><button class="ghost sm" data-act="screte" data-v="-0.1">慢</button><button class="ghost sm" data-act="screte" data-v="0.1">快</button></div>
      <p class="fine">速度 ${Math.round(SC.rate * 100)}% · ${made ? '每小节上方是和弦和级数 · 点任何音符听它 · 播放的是这份新造谱上的每一个音' : '橙色 = 你在「曲目」里学的段落 · 播放的是原谱上的每一个音'}</p>
      ${made ? `<a class="link" href="#mem-${s.id}"><small>边弹边判断</small><b>打开收音，一个和弦一个和弦弹，弹对才往下走</b><span>→</span></a>` : ''}
      <div class="score" id="score"><p class="fine">正在加载乐谱…（第一次需要下载约 13MB 的乐谱引擎，之后会快很多）</p></div>
      ${s.orig.apple ? `<a class="link" href="${s.orig.apple}" target="_blank" rel="noopener"><small>真人演奏</small><b>在 Apple Music 听录音</b><span>↗</span></a>` : ''}
      <p class="fine">乐谱：${esc(sc.credit)}</p>`;
    const bm = songBarMap(s), lab = {};
    Object.keys(bm).forEach(n => (lab[n] = bm[n].map(x => D(x) + ' ' + degLabel(x, s.key)).join('  ')));
    Score.render($('#score'), sc, { section: SC.section, labels: lab }).catch(() => { const e = $('#score'); if (e) e.innerHTML = '<p class="no">乐谱加载失败：需要联网。可以先用下面的链接。</p>'; });
  }
  function scorePlay(staffs, range) {
    const c0 = Score.get(); if (!c0 || !c0.notes.length) return toast('乐谱还没加载好');
    let ns = staffs ? c0.notes.filter(n => staffs.includes(n.staff)) : c0.notes;
    if (range) { ns = ns.filter(n => n.m >= range[0] && n.m <= range[1]); if (!ns.length) return; const t0 = Math.min(...ns.map(n => n.t)); ns = ns.map(n => Object.assign({}, n, { t: n.t - t0 })); }
    const c = Object.assign({}, c0, { notes: ns });
    stopAll(); A.init();
    const r = 1 / SC.rate, el = c.el;
    let lastY = -1, curM = null;
    c.notes.forEach(n => {
      A.note(n.pitch, n.t * r + 0.05, Math.min(2.5, n.dur * r + 0.3), 0.55);
      later(() => {
        if (n.m != null && n.m !== curM) { curM = n.m; el.querySelectorAll('text.chordlab.now').forEach(t => t.classList.remove('now')); const lb = el.querySelector(`text.chordlab[data-n="${n.m}"]`); if (lb) lb.classList.add('now'); }
        const g = el.querySelector('[data-id="' + n.id + '"]') || el.querySelector('[id="' + n.id + '"]'); if (!g) return;
        g.classList.add('playing'); setTimeout(() => g.classList.remove('playing'), Math.max(120, n.dur * r * 1000));
        const y = g.getBoundingClientRect().top;
        if (Math.abs(y - lastY) > 40) { const box = (document.getElementById('phone') && getComputedStyle(document.getElementById('phone')).overflowY === 'auto') ? document.getElementById('phone').getBoundingClientRect() : { top: 0, bottom: innerHeight }; if (y < box.top + 60 || y > box.bottom - 140) g.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        lastY = y;
      }, (n.t * r + 0.05) * 1000);
    });
    const end = Math.max(...c.notes.map(n => n.t + n.dur)) * r;
    later(() => { const b = $('#scbtn'); if (b) { b.textContent = '▶ 再听一遍'; b.dataset.act = 'scplay'; } el.querySelectorAll('text.chordlab.now').forEach(t => t.classList.remove('now')); dockReset(); }, end * 1000 + 300);
  }
  // ---------------- 瀑布流 + 和声色带 ----------------
  const RL = { mode: S.rlkb ? 'wait' : 'play', rate: 1, lvl: 1, kb: !!S.rlkb, kbReal: S.rlkbReal !== false, nopanel: false };
  // 真实琴键宽 23.5 mm；iPhone 网页里 1 mm ≈ 6.1 个 CSS 像素
  const KEY_REAL = Math.round(23.5 * 6.1);
  // 用手机弹：屏幕下半部分变成按真钢琴比例的键盘（只放 C4–E5 这 10 个白键），和弦都折进这个音区；竖着拿时整个画面转成横屏
  const KB_LO = 60, KB_HI = 76;
  // 难度：1 简单（只有右手和弦）· 2 中等（左手低音 + 右手和弦）· 3 困难（原曲两只手 / 旋律 + 伴奏型）
  // 困难不一开始给：先在「中等」用「等你弹」一遍弹对才解锁（如实记在 S.rollPass）
  const rollKey = () => route[0] + ':' + route[1];
  const rollPassed = () => ((S.rollPass || {})[rollKey()] || 0);
  const LV_NAME = ['', '简单 · 只弹和弦', '中等 · 左手低音 + 右手和弦', '困难 · 原曲'];
  const chordFunc = (sym, key) => { const a = T.analyze(sym, key); return a ? a.func : 'N'; };
  const chordLabel = (sym, key) => { const a = T.analyze(sym, key); return D(sym) + ' ' + (a ? degLabel(sym, key) : '') + (a && FUNC_ZH[a.func] ? ' ' + FUNC_ZH[a.func] : ''); };
  // 只有和弦的曲子 / 组合和弦：左手弹低音，右手弹和弦
  function rollFromBars(bars, key, beats = 4, startBar = 1, rhOnly = false) {
    const events = [], chords = []; let t = 0;
    bars.forEach((bar, bi) => bar.forEach(sym => {
      const d = beats / bar.length, c = T.parseChord(sym); if (!c) { t += d; return; }
      const b = c.bass || c.root; let lm = 36 + b.pc; if (lm < 40) lm += 12;
      if (!rhOnly) events.push({ t, d: d * 0.95, midi: lm, hand: 'L' });
      T.voicing(c).forEach(n => events.push({ t, d: d * 0.95, midi: n.midi, hand: 'R' }));
      chords.push({ t, d, sym, label: chordLabel(sym, key), func: chordFunc(sym, key), bar: startBar + bi });
      t += d;
    }));
    return { events, chords, beats, barNo: b => startBar + Math.floor(b / beats) };
  }
  // 完整扒谱：两只手真实的音；和弦标签按小节
  function rollFromFull(s) {
    const { events, barStart, lens } = FullScore.events(FULL[s.id].kern), bm = songBarMap(s), chords = [];
    Object.keys(barStart).forEach(n => { const ch = bm[n]; if (!ch) return; const L = lens[n], d = L / ch.length; ch.forEach((sym, i) => chords.push({ t: barStart[n] + i * d, d, sym, label: n + ' · ' + chordLabel(sym, s.key), func: chordFunc(sym, s.key), bar: +n })); });
    const firstBar = Math.min(...Object.keys(barStart).map(Number));
    return { events, chords, beats: 4, barNo: b => { let best = firstBar; Object.entries(barStart).forEach(([n, st]) => { if (st <= b + 1e-6) best = +n; }); return best; } };
  }
  // 伴奏歌曲：右手旋律 + 左手伴奏型
  function rollFromSing(song, pat, lvl = 3) {
    const tl = songTimeline(song), events = [], chords = [];
    if (lvl === 1) { tl.slots.forEach(x => { const c = T.parseChord(x.sym); if (c) T.voicing(c).forEach(n => events.push({ t: x.start, d: x.d * 0.95, midi: n.midi, hand: 'R' })); chords.push({ t: x.start, d: x.d, sym: x.sym, label: chordLabel(x.sym, song.key), func: chordFunc(x.sym, song.key) }); }); return { events, chords, beats: song.beats, barNo: b => 1 + Math.floor(b / song.beats) }; }
    if (lvl === 2) pat = { ev: [[0, 'R', song.beats]] };
    tl.notes.forEach(n => { if (n.midi != null) events.push({ t: n.start, d: n.beats * 0.95, midi: n.midi, hand: 'R' }); });
    song.bars.forEach((b, bi) => {
      const sl = tl.slots.filter(x => x.bar === bi); if (!sl.length) return;
      const bs = sl[0].start - sl[0].t;
      lhPattern(sl, pat, song.beats).forEach(([t, d, keys]) => keys.forEach(([nm, m]) => { if (nm !== 'r') events.push({ t: bs + t, d: d * 0.95, midi: m, hand: 'L' }); }));
      sl.forEach(x => chords.push({ t: x.start, d: x.d, sym: x.sym, label: chordLabel(x.sym, song.key), func: chordFunc(x.sym, song.key) }));
    });
    return { events, chords, beats: song.beats, barNo: b => 1 + Math.floor(b / song.beats) };
  }
  function harmonyStrip(s) {
    const st = sectionStarts(s);
    return `<div class="hstrip">${colorSeg()}${s.sections.map((sec, i) => `<div class="hsec"><small>${esc(sec.name)}</small><div class="hrow">${parseBars(sec.bars).map((bar, k) => `<div class="hbar" data-act="hstrip" data-n="${st[i] + k}">${bar.map(x => (colorMode() === 'chord' ? `<i class="q" style="${hueVars(cxHue((T.parseChord(x) || {}).q))}" title="${esc(D(x))}">${D(x)}</i>` : `<i class="f${chordFunc(x, s.key)}" title="${esc(D(x))}">${D(x)}</i>`)).join('')}</div>`).join('')}</div></div>`).join('')}<p class="fine">和声色带：${colorMode() === 'chord' ? '颜色 = 和弦的性质（大三金黄、小三蓝、属七橙……，和「和弦」页一样）' : '<span class="fT">■ 稳</span> <span class="fS">■ 走</span> <span class="fD">■ 紧</span>'} · 一格一小节，点一格看那一小节</p></div>`;
  }
  function rollPanel(id) {
    const maxLv = RL.maxLv || 2, passed = rollPassed();
    const lvChips = `<div class="chips lvchips">${[1, 2, 3].slice(0, maxLv).map(l => { const locked = l === 3 && passed < 2; return `<button class="chip${RL.lvl === l ? ' on' : ''}${locked ? ' locked' : ''}" data-act="rllvl" data-v="${l}"${locked ? ' data-locked="1"' : ''}>${LV_NAME[l]}${locked ? ' · 未解锁' : ''}${l === 3 && RL.lvl3name ? '（' + RL.lvl3name + '）' : ''}</button>`; }).join('')}</div>${maxLv === 3 && passed < 2 ? '<p class="fine">困难（原曲）先锁着：在「中等」用「等你弹」一遍弹对，就解锁。先把和弦的手感练出来，再加细节。</p>' : ''}`;
    return `<div class="rollbox">${lvChips}<div class="chips"><button class="chip${RL.mode === 'play' ? ' on' : ''}" data-act="rlmode" data-v="play">跟着落下（有声音）</button><button class="chip${RL.mode === 'wait' ? ' on' : ''}" data-act="rlmode" data-v="wait">等你弹（练手感）</button><button class="chip${RL.kb ? ' on' : ''}" data-act="rlkb">📱 用手机弹</button></div>${RL.kb && id === 'fsroll' ? `<div class="chips"><button class="chip${RL.kbReal ? ' on' : ''}" data-act="rlkbsize" data-v="1">琴键真实大小</button><button class="chip${!RL.kbReal ? ' on' : ''}" data-act="rlkbsize" data-v="0">一屏放下</button></div>` : ''}
      <div class="roll" id="${id}"></div>
      <div class="row"><button class="btn" data-act="rlgo">▶ 开始</button><button class="ghost sm" data-act="rlstop">■ 停</button><button class="ghost sm" data-act="rlrate" data-v="-0.15">慢</button><button class="ghost sm" data-act="rlrate" data-v="0.15">快</button><small class="fine" id="rlrate">${Math.round(RL.rate * 100)}%</small></div>
      <div id="rlctl"></div>
      <p class="fine">${RL.mode === 'wait' ? '彩条落到键盘就停住，等你把这个和弦弹对（有钢琴：开收音弹给它听；没钢琴：点上面画面里的键盘，任意八度都行）。一遍一遍来，手会自己记住形状。' : '彩条落到哪个键就弹哪个键。颜色就是这个和弦的感觉：深灰 = 稳，蓝 = 走，橙 = 紧；浅色是左手。'}</p></div>`;
  }
  // 入口卡片：页面里只放这个，点进去全屏跟练
  function rollEntry(kind, sub) {
    const bars = ['T', 'S', 'D', 'T', 'S', 'D', 'T', 'T', 'S', 'D'].map((f, i) => `<i class="f${f}" style="height:${30 + (i * 37 % 45)}%;left:${6 + i * 9}%"></i>`).join('');
    return `<button class="rollentry" data-act="rollopen" data-k="${kind}"><span class="rprev">${bars}</span><span class="rtxt"><b>瀑布流跟练 · 全屏</b><small>${sub}</small></span><span class="arr">→</span></button>`;
  }
  // 当前页对应的瀑布流数据
  function rollBuild(kind) {
    if (kind === 'song') { const s = allSongs().find(x => x.id === route[1]); RL.maxLv = hasFull(s.id) ? 3 : 2; RL.lvl3name = '两只手全部音符'; if (RL.lvl > RL.maxLv || (RL.lvl === 3 && rollPassed() < 2)) RL.lvl = 1; const bars = s.sections.flatMap(x => parseBars(x.bars)); return { title: s.title, bpm: s.bpm || 80, data: RL.lvl === 3 ? rollFromFull(s) : rollFromBars(bars, s.key, 4, sectionStarts(s)[0], RL.lvl === 1) }; }
    if (kind === 'sing') { const song = SING.find(x => x.id === route[1]) || SING[0], pat = singPat(song); RL.maxLv = 3; RL.lvl3name = '旋律 + ' + pat.name; if (RL.lvl === 3 && rollPassed() < 2) RL.lvl = 1; return { title: song.title, bpm: song.bpm, data: rollFromSing(song, pat, RL.lvl) }; }
    if (kind === 'prog' && RL.prog) { const p = RL.prog; RL.maxLv = 2; if (RL.lvl > 2) RL.lvl = 1; return { title: p.title, bpm: 72, data: rollFromBars([].concat(p.chords, p.chords).map(x => [x]), p.key, 2, 1, RL.lvl === 1) }; }
    if (kind === 'combo') { const cb = COMBOS.find(x => x.id === route[1]), ch = cbChords(cb); RL.maxLv = 2; if (RL.lvl > 2) RL.lvl = 1; return { title: cb.name + ' · ' + cb.alias, bpm: 72, data: rollFromBars([].concat(ch, ch).map(x => [x]), cbKey(cb), 2, 1, RL.lvl === 1) }; }
  }
  function rollOpen(kind) {
    RL.kind = kind || RL.kind;
    stopAll(); Roll.stop(); drillStop();
    const b = rollBuild(RL.kind); if (!b) return;
    let ov = document.querySelector('.rollfs');
    if (!ov) { ov = document.createElement('div'); ov.className = 'rollfs'; (document.getElementById('phone') || document.body).appendChild(ov); RL.scrollY = (document.getElementById('phone') && getComputedStyle(document.getElementById('phone')).overflowY === 'auto') ? document.getElementById('phone').scrollTop : scrollY; }
    document.body.classList.add('immersive');
    const rot = RL.kb && !isLand();
    ov.classList.toggle('rot', rot);
    const wide = isLand() || rot; ov.classList.toggle('nopanel', wide && RL.nopanel);
    if (rot) { ov.style.width = innerHeight + 'px'; ov.style.height = innerWidth + 'px'; } else { ov.style.width = ov.style.height = ''; }
    ov.innerHTML = `<div class="fshead"><button class="fsx" data-act="rollclose" aria-label="关闭">×</button><b>${esc(b.title)}</b><small>${isLand() ? '' : rot ? '把手机横过来拿' : '横过来更宽'}</small>${wide ? `<span class="fsmini"><button class="fsb fspp" data-act="rlpp" aria-label="暂停 / 继续">⏸</button></span>${RL.nopanel ? '' : '<button class="fsb fspanel" data-act="rlpanel">‹ 收起</button>'}` : ''}</div>${rollPanel('fsroll')}`;
    const cs = getComputedStyle(ov), H = ov.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), used = [...ov.children].reduce((a, e) => a + (e.querySelector && e.querySelector('#fsroll') ? 0 : e.offsetHeight), 0);
    const other = [...ov.querySelectorAll('.rollbox > :not(#fsroll)')].reduce((a, e) => a + e.offsetHeight + 8, 0);
    RL.fsH = isLand() || rot ? Math.max(200, H - 4) : Math.max(200, H - ov.querySelector('.fshead').offsetHeight - other - 24);
    rollMount('fsroll', b.data, b.bpm);
  }
  function rollClose() {
    stopAll(); Roll.stop(); drillStop();
    const ov = document.querySelector('.rollfs'); if (ov) ov.remove(); RL.nopanel = false;
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    document.body.classList.remove('immersive');
  }
  function rollMount(id, data, bpm) {
    const el = document.getElementById(id); if (!el) return;
    RL.data = data;
    const fs = id === 'fsroll', kb = fs && RL.kb, rot = kb && !!document.querySelector('.rollfs.rot');
    let evs = data.events;
    if (kb) { const seen = new Set(); evs = data.events.map(e => { let m = e.midi; while (m < KB_LO) m += 12; while (m > KB_HI) m -= 12; return Object.assign({}, e, { midi: m }); }).filter(e => { const k = e.t.toFixed(3) + ':' + e.midi; if (seen.has(k)) return false; seen.add(k); return true; }); }
    Roll.mount(el, { events: evs, real: kb, rot, lo: kb ? KB_LO : undefined, hi: kb ? KB_HI : undefined, keyFrac: kb ? 0.55 : 0, keyW: kb && RL.kbReal ? KEY_REAL : 0, chords: data.chords, beats: data.beats, bpm, barNo: data.barNo, lead: 2, height: id === 'fsroll' && RL.fsH ? RL.fsH : isLand() ? Math.max(220, (document.getElementById('phone') && getComputedStyle(document.getElementById('phone')).overflowY === 'auto' ? document.getElementById('phone').clientHeight : innerHeight) - 80) : Math.min(420, Math.round(innerHeight * 0.5)), onKey: m => { A.init(); if (RL.mode === 'wait' && DR) drillTapKey(m); else A.note(m, 0, 0.8, 0.6); } });
    $('#rlctl').innerHTML = kb ? `<p class="fine">${RL.mode === 'wait' ? '彩条停住时，在下面的键盘上把这个和弦按出来（几根手指一起按，或一个一个点都行）。' : '跟着彩条在下面的键盘上按。'}</p>` : RL.mode === 'wait' ? (place() === 'away' ? '<p class="fine">没钢琴模式：点画面里的键盘。</p>' : '<div class="row"><button class="ghost sm" data-act="dlisten">开始收音 · 弹给它听</button></div>') : '';
  }
  function rollGo() {
    const d = RL.data; if (!d) return;
    stopAll(); A.init(); Roll.reset();
    if (RL.mode === 'wait') {
      drillStart(d.chords.map(c => ({ kind: 'chord', pcs: T.parseChord(c.sym).notes.map(n => n.pc), label: c.sym })), {
        onHit: i => { Roll.release(); A.chord(chordMidis(d.chords[i].sym), 0, 0.01, 0.7); },
        onMiss: () => toast('不对，再试一次'),
        onMode: () => ($('#rlctl').innerHTML = DR && DR.mode === 'mic' ? drillControls() : $('#rlctl').innerHTML),
        onDone: r => {
          logEv('roll', { r: route.join('-'), lvl: RL.lvl, miss: r.miss, n: r.total, m: DR ? DR.mode : '' });
          if (!r.miss) { S.rollPass = S.rollPass || {}; const k = rollKey(), was = S.rollPass[k] || 0; S.rollPass[k] = Math.max(was, RL.lvl); save(); if (RL.lvl === 2 && was < 2 && (RL.maxLv || 2) === 3) { toast('中等一遍弹对 · 困难（原曲）解锁了'); setTimeout(() => (document.querySelector('.rollfs') ? rollOpen() : render()), 900); return; } }
          toast(r.miss ? `弹完了 · 错了 ${r.miss} 次 · 再来一遍` : '一遍弹对 · 手感就是这样练出来的');
        },
      });
      DR.mode = place() === 'away' ? 'tap' : DR.mode; DR.cands = uniq(d.chords.map(c => T.parseChord(c.sym).notes.map(n => n.pc).sort((a, b) => a - b).join())).map(x => x.split(',').map(Number));
      if (place() === 'piano' && S.micOK) drillListen();
    }
    Roll.play(A, { mode: RL.mode, rate: RL.rate, onEnd: () => { if (RL.nopanel && document.querySelector('.rollfs')) { RL.nopanel = false; setTimeout(rollOpen, 900); } } });
  }
  // ---- 点小节播放 / 长按多选小节 / 小节线上的 ▶ 从这里播到结尾 ----
  const SELB = { on: false, a: 0, b: 0 };
  function playBars(a, b) {
    const s = allSongs().find(x => x.id === route[1]);
    const end = b == null ? 1e9 : b;
    if (document.querySelector('#songscore svg, #cmpscore svg, #score svg, #twoscore svg')) scorePlay(route[0] === 'cmp' && CMP.mode === 'compare' ? [0, 1] : null, [a, end]);
    else if (s) playSkeleton(s, [a, end]);
    const bt = document.querySelector('.dock .play'); if (bt) { bt.textContent = '■ 停止'; bt.dataset.act = 'dockstop'; }
  }
  function barAt(e) {
    const m = (e.target.closest && e.target.closest('g.measure')) || [...document.querySelectorAll('.score g.measure[data-n]')].find(g => { const r = g.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12; });
    if (m && m.dataset.n != null) return +m.dataset.n;
    const st = e.target.closest && e.target.closest('div.staff'); if (!st || !st.__boxes) return null;
    const svg = st.querySelector('svg'), rc = svg.getBoundingClientRect(), W = st.__W, H = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.height || rc.height;
    const sx = (e.clientX - rc.left) * W / rc.width, sy = (e.clientY - rc.top) * (W / rc.width);
    const bx = st.__boxes.find(b => sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h); return bx ? bx.n : null;
  }
  function selPaint() {
    const lo = Math.min(SELB.a, SELB.b), hi = Math.max(SELB.a, SELB.b);
    document.querySelectorAll('g.measure[data-n]').forEach(g => g.classList.toggle('sel', SELB.on && +g.dataset.n >= lo && +g.dataset.n <= hi));
    document.querySelectorAll('.selbox').forEach(x => x.remove());
    if (SELB.on) document.querySelectorAll('.sheet div.staff').forEach(st => { const svg = st.querySelector('svg'); if (!svg || !st.__boxes) return; const k = svg.getBoundingClientRect().width / st.__W; st.style.position = 'relative'; st.__boxes.filter(b => b.n >= lo && b.n <= hi).forEach(b => { const d = document.createElement('div'); d.className = 'selbox'; Object.assign(d.style, { left: b.x * k + 'px', top: (b.y + 14) * k + 'px', width: b.w * k + 'px', height: (b.h - 14) * k + 'px' }); st.appendChild(d); }); });
    let bar = document.querySelector('.selbar');
    if (!SELB.on) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.className = 'selbar'; view.appendChild(bar); }
    bar.innerHTML = `<span>已选第 ${lo}${hi > lo ? '–' + hi : ''} 小节 · 再点别的小节可以扩大</span><button class="dk play" data-act="selplay">▶ 播放</button><button class="dk" data-act="selclear">✕</button>`;
  }
  let lpT = null, lpFired = false;
  document.addEventListener('pointerdown', e => {
    if (!['song', 'cmp', 'score', 'sing'].includes(route[0])) return;
    if (!(e.target.closest && e.target.closest('.score svg, .sheet div.staff'))) return;
    lpFired = false; clearTimeout(lpT);
    lpT = setTimeout(() => { const n = barAt(e); if (n == null) return; lpFired = true; SELB.on = true; SELB.a = SELB.b = n; selPaint(); if (navigator.vibrate) navigator.vibrate(15); toast('已选第 ' + n + ' 小节 · 再点别的小节扩大范围'); }, 480);
  }, true);
  ['pointerup', 'pointercancel', 'pointermove'].forEach(t => document.addEventListener(t, e => { if (t === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 4) return; clearTimeout(lpT); }, true));
  document.addEventListener('click', e => { if (lpFired) { lpFired = false; e.stopPropagation(); e.preventDefault(); } }, true);
  document.addEventListener('staffbar', e => {
    if (!['song', 'cmp', 'score', 'sing'].includes(route[0])) return;
    const n = e.detail;
    if (SELB.on) { SELB.b = n; selPaint(); return; }
    playBars(n, n); toast('播放第 ' + n + ' 小节');
  });
  document.addEventListener('staffplayfrom', e => { playBars(e.detail, null); toast('从第 ' + e.detail + ' 小节播放到结尾'); });
  // ---- 横屏：真机横屏或「横屏预览」时给 body 加 land；转屏后按新宽度重新排谱（保留大致滚动位置）----
  const LAND_MQ = window.matchMedia ? matchMedia('(orientation: landscape) and (max-height: 520px)') : null;
  const isLand = () => document.body.classList.contains('landprev') || !!(LAND_MQ && LAND_MQ.matches);
  let lastW = 0, rotT = null;
  function applyLand(relayout) {
    document.body.classList.toggle('land', isLand());
    const box = document.getElementById('phone'), w = (box && getComputedStyle(box).overflowY === 'auto') ? box.clientWidth : innerWidth;
    if (relayout && lastW && Math.abs(w - lastW) > 60) {
      const sc = box && getComputedStyle(box).overflowY === 'auto' ? box : document.scrollingElement, frac = sc.scrollTop / Math.max(1, sc.scrollHeight - sc.clientHeight);
      if (document.querySelector('.rollfs')) { rollOpen(); lastW = w; return; }
      render(); const back = () => { sc.scrollTop = frac * Math.max(0, sc.scrollHeight - sc.clientHeight); };
      setTimeout(back, 60); setTimeout(back, 1600);
    }
    lastW = w;
  }
  window.addEventListener('resize', () => { clearTimeout(rotT); rotT = setTimeout(() => applyLand(true), 250); });
  const rb = document.getElementById('rotbtn');
  if (rb) rb.addEventListener('click', () => { document.body.classList.toggle('landprev'); rb.textContent = document.body.classList.contains('landprev') ? '竖屏预览' : '横屏预览'; applyLand(true); });
  setTimeout(() => applyLand(false), 0);
  // ---- 右下角固定的小工具条：播放（跟着高亮）+ 一键开关和声标注 ----
  const labOn = () => S.lab !== false;
  function dockHtml() {
    return `<div class="dock"><button class="dk play" data-act="dockplay">▶ 播放</button><button class="dk lab${labOn() ? ' on' : ''}" data-act="labtog"><i></i>和声标注</button></div>`;
  }
  function dockReset() { const b = document.querySelector('.dock .play'); if (b) { b.textContent = '▶ 播放'; b.dataset.act = 'dockplay'; } }
  function dockPlay() {
    const sc = document.querySelector('#songscore svg, #cmpscore svg, #score svg');
    if (sc) {
      const staffs = route[0] === 'cmp' && CMP.mode === 'compare' ? [0, 1] : null;
      scorePlay(staffs);
    } else if (route[0] === 'song') { const sg = allSongs().find(x => x.id === route[1]); playChords(sg, songRange(sg)); }
    else return toast('谱面还没加载好');
    const b = document.querySelector('.dock .play'); if (b) { b.textContent = '■ 停止'; b.dataset.act = 'dockstop'; }
  }
  // 统一的和弦播放器：一个和弦一个和弦弹（左手低音 + 右手和弦），每到一个和弦就同步页面上所有看得见的东西：
  // 和弦格子（亮当前格）、键盘图层（换成这个和弦）、和声色带（亮当前小节）、和弦骨架谱（标当前和弦），看不见就自动滚过来
  function playChords(s, range) {
    if (!s) return; stopAll(); A.init();
    const st0 = sectionStarts(s), spb = 60 / (s.bpm || 80) / SC.rate, items = [];
    let gi = 0;
    s.sections.forEach((sec, si) => { let li = 0; parseBars(sec.bars).forEach((bar, bk) => bar.forEach(sym => { const n = st0[si] + bk; items.push({ sym, i: gi++, n, si, li: li++, d: 4 / bar.length }); })); });
    const play = items.filter(x => !range || (x.n >= range[0] && x.n <= range[1]));
    if (!play.length) return;
    const box = () => { const ph = document.getElementById('phone'); return ph && getComputedStyle(ph).overflowY === 'auto' ? ph.getBoundingClientRect() : { top: 0, bottom: innerHeight }; };
    const keepVisible = el => { if (!el) return; const r = el.getBoundingClientRect(), bx = box(); if (r.top < bx.top + 60 || r.bottom > bx.bottom - 140) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    const unmark = () => document.querySelectorAll('.sheet div.staff').forEach(x => { if (x.__marked) { const cfg = JSON.parse(x.dataset.staff); delete cfg.mark; x.dataset.staff = JSON.stringify(cfg); try { Staff.draw(x); } catch (e) {} x.__marked = false; } });
    let t = 0;
    play.forEach(it => {
      const at = t, dur = it.d * spb, c = T.parseChord(it.sym);
      if (c) { const b = c.bass || c.root; let bm = 36 + b.pc; if (bm < 40) bm += 12; A.note(bm, at + 0.05, dur * 0.95, 0.55); A.chord(chordMidis(it.sym), at + 0.05, 0.01, dur * 0.95); }
      later(() => {
        // 和弦格子
        let cell = null; document.querySelectorAll('#grid .cell').forEach(x => { const on = +x.dataset.i === it.i; x.classList.toggle('on-play', on); if (on) cell = x; });
        // 键盘图层
        if ($('#klpanel')) klShow(it.i);
        // 和声色带
        let hb = null; document.querySelectorAll('.hstrip .hbar').forEach(x => { const on = +x.dataset.n === it.n; x.classList.toggle('on-play', on); if (on) hb = x; });
        // 和弦骨架谱
        const staffs = [...document.querySelectorAll('.sheet div.staff')]; let stEl = null;
        if (staffs.length) { const el = staffs.length === s.sections.length ? staffs[it.si] : staffs[0]; if (el) { document.querySelectorAll('.sheet div.staff').forEach(x => { if (x !== el && x.__marked) { const cfg = JSON.parse(x.dataset.staff); delete cfg.mark; x.dataset.staff = JSON.stringify(cfg); try { Staff.draw(x); } catch (e) {} x.__marked = false; } }); const cfg = JSON.parse(el.dataset.staff); cfg.mark = it.li; el.dataset.staff = JSON.stringify(cfg); try { Staff.draw(el); } catch (e) {} el.__marked = true; stEl = el; } }
        keepVisible(cell || stEl || hb);
      }, at * 1000);
      t += dur;
    });
    later(() => { document.querySelectorAll('#grid .cell.on-play, .hstrip .hbar.on-play').forEach(x => x.classList.remove('on-play')); unmark(); dockReset(); }, t * 1000 + 300);
  }
  const playSkeleton = playChords; // 旧名字：和弦骨架谱也走同一个播放器
  // 当前看的是哪一段：曲目页选了段落就放那一段
  function songRange(s) { if (route[0] !== 'song' || (S.songTab || 'sheet') !== 'sheet') return null; const si = (S.songSec || {})[s.id]; return si != null && si >= 0 ? secRange(s, si) : null; }

  // ---------------- 识谱 ----------------
  let SCAN = null;
  // AI 识谱的设置：API Key 只存这台手机（localStorage），不进 S、备份和云端同步
  const AIK = 'hexian.ai';
  const aiCfg = () => { try { return JSON.parse(localStorage.getItem(AIK) || '{}') || {}; } catch (e) { return {}; } };
  const aiSet = o => { try { localStorage.setItem(AIK, JSON.stringify(Object.assign(aiCfg(), o))); } catch (e) {} };
  const aiInArt = () => 'HX_PRESEED' in window && !!window.claude;
  function vScan() {
    const cfg = aiCfg(), mode = cfg.mode || 'ai', inArt = aiInArt(), ready = mode === 'ai' && (inArt || cfg.key);
    const aiBox = mode !== 'ai' ? '' : inArt
      ? `<div class="cloudbox aibox"><p class="fine">用你自己的 Claude 账号读谱：第一次会弹窗问你是否允许这个页面使用 Claude、发送图片。谱子图片会发给 Claude，不会存进这个页面。</p></div>`
      : cfg.key
        ? `<div class="cloudbox aibox"><p>已填 API Key：<b>…${esc(cfg.key.slice(-4))}</b></p><div class="pills"><button class="pill" data-act="aikeyoff">换 / 删除 Key</button></div><p class="fine">谱子图片会发给 Anthropic 的 Claude 识别（不经过别的服务器）；Key 只存在这台手机，不进备份、不同步。每页大约花几毛钱人民币，从你的 API 余额里扣。</p></div>`
        : `<div class="cloudbox aibox"><p class="fine">AI 识谱用你自己的 Anthropic API Key：</p><ol class="fine cloudsteps"><li><a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">点这里创建 Key</a>（要先在 Billing 里充一点余额）</li><li>复制 sk-ant-… 粘到下面</li></ol><div class="row"><input id="aikey" type="password" autocomplete="off" placeholder="sk-ant-…"><button class="btn" data-act="aikeyset">保存</button></div><p class="fine">Key 只存在这台手机，不进备份、不同步到云端。也可以在 Claude App 里打开<a href="https://claude.ai/artifact/HaKhjcq9e3HQqRTsBY18Cj" target="_blank" rel="noopener">预览版</a>，用 Claude 账号识谱，不用 Key。</p></div>`;
    view.innerHTML = `<header class="top"><div><a class="back" href="#songs">←</a><small>截图 / 照片 / PDF</small><h1>识谱</h1></div></header>
      <div class="scanmode"><span class="seg"><button class="${mode === 'ai' ? 'on' : ''}" data-act="scanmode" data-v="ai">AI 识谱</button><button class="${mode !== 'ai' ? 'on' : ''}" data-act="scanmode" data-v="local">本机识别</button></span></div>
      ${aiBox}
      <label class="drop${mode === 'ai' && !ready ? ' off' : ''}" for="scanfile"><b>选择谱子</b><small>${mode === 'ai' ? '支持 PNG、JPG、PDF（最多 6 页）。印了和弦记号的谱照抄；纯五线谱由 Claude 读音判断和弦，会标出来' : '支持 PNG、JPG、PDF（最多 6 页）。文件只在这台手机上处理，不会上传'}</small></label>
      <input type="file" id="scanfile" accept="image/*,application/pdf,.pdf" hidden${mode === 'ai' && !ready ? ' disabled' : ''}>
      <div id="scanprog"></div><div id="scanout"></div>
      ${mode === 'ai' ? `<p class="fine"><b>说实话：</b>AI 读印出来的和弦记号很准；读纯五线谱判断和弦是「理解后的判断」，转位、经过音可能和你想的不一样，结果当起点，对照原谱改。</p>`
        : `<p class="fine"><b>说实话：</b>手机截图里的小号和弦字（尤其是 Gm⁷ 这种带上标的）经常认错，结果只能当起点。更准的办法：用「AI 识谱」，或在 iPhone「照片」里长按谱子 →「实况文本」选中和弦字母 → 拷贝，粘贴到识别结果的文本框里修改。</p>
      <p class="fine">能认出的是谱子上<b>印出来的和弦记号</b>（流行谱、弹唱谱上方的 C、Am、G7/B 这些）。纯五线谱的音符本机认不了，请用「AI 识谱」。</p>`}`;
    $('#scanfile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      const prog = $('#scanprog'); $('#scanout').innerHTML = '';
      const show = (msg, p) => { prog.innerHTML = `<p class="fine">${msg}</p><span class="meter"><i style="width:${Math.round(p * 100)}%"></i></span>`; };
      const title = f.name.replace(/\.[^.]+$/, '');
      try {
        if (mode === 'ai') {
          const r = await OCR.aiRecognize(f, show, inArt ? { claude: true } : { api: aiCfg().key });
          SCAN = Object.assign(r, { title: r.title || title, lines: r.sections.map(x => x.bars) });
        } else {
          const r = await OCR.recognize(f, show);
          SCAN = Object.assign(r, { title });
        }
        prog.innerHTML = '';
        renderScan();
      } catch (err) {
        const st = err.status, code = err.code;
        const why = st === 401 ? 'API Key 不对，或者被删掉了：点「换 / 删除 Key」重新填' : st === 400 && /credit|balance/i.test(err.message) ? 'API 余额不够：去 console.anthropic.com 的 Billing 充值' : st === 429 ? '请求太频繁，等一分钟再试' : st >= 500 ? 'Claude 那边暂时忙，过一会儿再试' : code === 'not_granted' ? '你没有允许这个页面使用 Claude；想用的话刷新页面再点一次' : code === 'rate_limited' ? 'Claude 用量到上限了，过一会儿再试' : code ? 'Claude 暂时用不了（' + esc(code) + '）' : mode === 'ai' ? esc(err.message || err) + '。检查网络后再试，或者先切到「本机识别」' : '识谱需要联网下载识别引擎，请检查网络后再试（' + esc(err.message || err) + '）';
        prog.innerHTML = `<p class="no">没能识别：${why}</p>`;
      }
    });
  }
  function renderScan() {
    const r = SCAN, n = r.lines.flat().length;
    const txt = r.sections ? r.sections.map(x => `${x.name}: ${x.bars.join(' | ')}`).join('\n') : r.lines.map((l, i) => `第${i + 1}行: ${l.join(' | ')}`).join('\n');
    const inf = r.sections ? r.sections.filter(x => x.src === 'inferred').map(x => x.name) : [];
    $('#scanout').innerHTML = `<div class="thumbs">${r.thumbs.map(t => `<img src="${t}" alt="谱子">`).join('')}</div>
      <p class="${n ? 'ok' : 'no'}">${n ? `${r.ai ? 'Claude 读出' : '认出'} ${n} 个和弦，${r.ai ? '判断' : '猜测'}是 ${kz(r.key)}` : r.ai ? 'Claude 没读出和弦' : '没有找到印出来的和弦记号'}</p>
      ${r.ai && n ? `<p class="fine">${inf.length ? `<span class="srctag">我读原谱判断的</span> ${inf.map(esc).join('、')}（谱上没印和弦，是 Claude 按音判断的）${inf.length < r.sections.length ? '；其余段落是<span class="srctag">谱上印的</span>' : ''}` : '<span class="srctag">谱上印的</span> 全部照抄谱面上的和弦记号'}${r.note ? '<br>' + esc(r.note) : ''}</p>` : ''}
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
      const inf = SCAN.ai && SCAN.sections ? SCAN.sections.filter(x => x.src === 'inferred').map(x => x.name) : [];
      const song = { id, title: f.title.value.trim() || '我的谱子', sub: SCAN.ai ? 'AI 识谱' : '识谱导入', key, sections, tag: '我的', bpm: 76, note: SCAN.ai ? (inf.length ? 'AI 识谱：' + inf.join('、') + ' 谱上没印和弦，是 Claude 读五线谱判断的；其余照抄谱面。请对照原谱核对' : 'AI 识谱：照抄谱面印的和弦记号，请对照原谱核对') : '和弦由识谱自动读取，请对照原谱核对', scanned: 1 };
      try { await OCR.savePages(id, SCAN.thumbs); } catch (err) {}
      S.custom = S.custom.concat(song); save();
      logEv('scan', { id, n: sections.reduce((s, x) => s + parseBars(x.bars).flat().length, 0) });
      go(sections.length ? '#song-' + id : '#edit-' + id);
    });
  }
  async function mountMyScore(id) {
    const el = $('#myscore'); if (!el) return;
    let pages = await OCR.loadPages(id);
    if (!el.isConnected) return; // 读取期间已经离开这一页
    if ((!pages || !pages.length) && window.HX_PRESEED && HX_PRESEED[id]) pages = HX_PRESEED[id];
    if (!pages || !pages.length) {
      el.innerHTML = `<label class="drop small" for="addscore"><b>添加你手上的原谱</b><small>截图、照片或 PDF · 只存在这台手机上 · 下面每格的小节号对着它看</small></label><input type="file" id="addscore" accept="image/*,application/pdf,.pdf" hidden>`;
      el.querySelector('#addscore').addEventListener('change', async e => {
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
        ${symDone(card.id) ? '' : `<button class="skipbtn" data-act="symskip" data-id="${card.id}">这一课我已经会了，跳过 →</button>`}
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
  // 今天页上的卡册入口：最近得到的几张卡（缩小版）+ 积分进度
  function cardBox() {
    const own = ownedCards(), pct = Math.min(100, (1 - ((S.ptsNext || PTS_STEP) - (S.pts || 0)) / PTS_STEP) * 100);
    const show = own.slice().sort((a, b) => ((S.cards && S.cards[b.id] && S.cards[b.id].at) || '').localeCompare((S.cards && S.cards[a.id] && S.cards[a.id].at) || '') || b.rare - a.rare).slice(0, 4);
    return `<a class="cardbox" href="#cards"><div class="cardbox-h"><b>我的卡册</b><small>${own.length}/${CARDS.length} 张</small><span class="arr">→</span></div>
      <div class="minicards">${show.map(c => `<span class="mini r${c.rare}"><small>${RARE[c.rare]}</small><b>${esc((cardSong(c.id) || { title: c.title || c.id }).title)}</b></span>`).join('')}${own.length < CARDS.length ? '<span class="mini locked">?</span>' : ''}</div>
      <span class="meter"><i style="width:${pct}%"></i></span><small>${S.pts || 0} 分 · 再得 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))} 分抽一张新曲谱卡</small></a>`;
  }
  function vCards() {
    const own = ownedCards();
    view.innerHTML = `<header class="top"><div><a class="back" href="#me">←</a><small>${own.length}/${CARDS.length} 张 · ${S.pts || 0} 分</small><h1>卡册</h1></div></header>
      <div class="ptsbar"><span class="meter"><i style="width:${Math.min(100, (1 - ((S.ptsNext || PTS_STEP) - (S.pts || 0)) / PTS_STEP) * 100)}%"></i></span><small>再得 ${Math.max(0, (S.ptsNext || PTS_STEP) - (S.pts || 0))} 分，随机解锁一张新曲谱卡</small></div>
      <p class="fine">评级：S 全对 100 分 · A ≥90% 80 分 · B ≥75% 60 分 · C ≥60% 40 分 · D 20 分。全部按真实结果计算。</p>
      <div class="cardgrid">${CARDS.map(c => (c.own || (S.cards && S.cards[c.id])) ? cardFace(c, { actions: true }) : `<div class="tcard locked r${c.rare}"><span>?</span><small>${RARE[c.rare]} · 未解锁</small></div>`).join('')}</div>`;
  }

  // ---------------- 视奏：看到音符就能弹（关卡数据在 sight.js） ----------------
  // S.sight[关id] = { acc, spm, n, pass }：最好成绩、练过几轮、第一次过关的日期
  let SR = null;
  window.__sight = () => SR; // 自查用
  const sightSt = id => (S.sight = S.sight || {})[id] || null;
  const sightPassed = () => Sight.LEVELS.filter(l => (sightSt(l.id) || {}).pass).length;
  const sightOpen = () => true; // 基础认音全部开放（5 级的人按需挑着练）
  const sightNext = () => Sight.LEVELS.find((l, i) => sightOpen(i) && !(sightSt(l.id) || {}).pass) || Sight.LEVELS[Sight.LEVELS.length - 1];
  const sightUnit = lv => (lv.kind === 'chord' ? '个和弦' : lv.kind === 'two' ? '组' : '个音');
  function vSight() {
    if (route[1] === 'next') { location.replace('#sight-' + sightNext().id); return; }
    if (route[1] === 'piece') return sightPiece(true);
    if (route[1] === 'react') return nrIntro();
    const lv = Sight.LEVELS.find(x => x.id === route[1]);
    if (lv) return sightIntro(lv);
    if (Listen.active()) Listen.stop();
    const g = S.sightGrade || 5, G = Sight.GRADE[g], pass = sightPassed();
    const recent = (S.log || []).filter(e => e.t === 'sightp').slice(-5).reverse();
    const nToday = (S.log || []).filter(e => e.t === 'sightp' && e.d === today()).length;
    const maxAcc = Math.max(...G.keys.map(k => Math.abs(Vex.Flow.keySignature(k).length)));
    view.innerHTML = `<header class="top"><div><a class="back" href="#path">←</a><small>看到没见过的谱，一口气弹下来</small><h1>视奏</h1></div><a class="stat" href="#sight"><b>${nToday}</b><small>今天几条</small></a></header>
      ${nrCard()}
      ${famCard()}
      <section class="spcard"><div class="spcard-h"><b>${g} 级视奏</b><span class="seg">${[4, 5, 6].map(x => `<button class="${x === g ? 'on' : ''}" data-act="spgrade" data-v="${x}">${x} 级</button>`).join('')}</span></div>
        <p class="fine">每次一首新的 8 小节双手小曲 · 预读 → 三问 → 一口气弹，错了别停 · 调号 ≤ ${maxAcc} 个 · ${G.times.join(' ')} 拍 · ${place() === 'piano' ? '收音打分' : '打节奏'}</p>
        <div class="sprate"><small>预读</small><span class="seg">${[10, 30, 60].map(x => `<button class="${(S.sightPrev || 30) === x ? 'on' : ''}" data-act="spprev" data-v="${x}">${x} 秒</button>`).join('')}</span><small>已练 ${S.sightPN || 0} 条</small></div>
        <a class="btn" href="#sight-piece">来一条新的 · No.${(S.sightPN || 0) + 1}</a>
        ${recent.length ? `<ul class="sprecent">${recent.map(e => `<li><span>${e.d.slice(5)} · ${esc(e.k)} · ${esc(e.ts)} · ${e.g} 级</span><b>${e.m === 'mic' ? `音准 ${e.p}% · ` : '节奏 · '}节奏 ${e.r}%</b></li>`).join('')}</ul>` : ''}
      </section>
      <details class="spbasic"><summary>基础认音 14 关 · ${pass}/${Sight.LEVELS.length}</summary>
      <ol class="path sightpath">${Sight.LEVELS.map(l => {
        const st = sightSt(l.id), done = st && st.pass;
        return `<li class="${done ? 'done' : ''}"><a href="#sight-${l.id}"><span class="node">${done ? '✓' : l.n}</span><span><b>${esc(l.name)}</b><small>${st ? `最好：${st.acc}% · 每分钟 ${st.spm} ${sightUnit(l)}` : `过关：90% · 每分钟 ${l.spm} ${sightUnit(l)}`}</small></span></a></li>`;
      }).join('')}</ol></details>`;
  }
  // ---------------- 视奏小曲：预读 → 三问 → 一口气弹 → 成绩 ----------------
  let SP = null;
  window.__sp = () => SP; // 自查用
  const spRate = () => S.sightRate || 0.8;
  function sightPiece(fresh) {
    if (Listen.active()) Listen.stop();
    if (fresh || !SP) {
      spStop(); S.sightPN = (S.sightPN || 0) + 1;
      const P = Sight.piece(S.sightGrade || 5, { key: k => FAM_W[famLv('key:' + k)], lh: k => FAM_W[famLv('lh:' + k)] });
      const tag = [['key:' + P.key, T.parseKey(P.key).zh], ['lh:' + P.lht, '左手' + P.lhName]];
      SP = { P, no: S.sightPN, phase: 'preview', left: S.sightPrev || 30, qi: 0, qok: 0, hint: S.hintStart == null ? 1 : S.hintStart, hintMax: 0, opened: new Set() };
      SP.hintMax = SP.hint;
      SP.mk = spMarks(P).map(x => Object.assign({ lv: famLv(x.id) }, x));
      SP.openIdx = SP.mk.findIndex(x => x.lv === 0); // 新的东西：第一个自动展开完整解释，其余圆点标出，点开再看
      SP.tag = tag.map(([id, t]) => ({ id, label: t, lv: famLv(id) }));
      SP.autoShown = SP.openIdx >= 0 ? SP.mk[SP.openIdx].id : '';
      SP.mk.forEach(x => famShown(x.id, x.label, x.long)); SP.tag.forEach(x => famShown(x.id, x.label));
      // 预读问题：已经「熟练」的概念不再问；「会了」以上的调性问题改问「凭什么判断」
      const all = Sight.questions(P).map(q => Object.assign({ lv: famLv(q.id) }, q));
      SP.qs = all.filter(q => q.lv < 3).map(q => (q.id === 'concept:relkey' && q.lv >= 2 ? spEvidence(q) : q));
      if (!SP.qs.length) SP.qs = [];
      save();
    }
    const P = SP.P;
    view.innerHTML = `<div class="qbar"><a href="#sight" class="x">×</a><span class="meter"><i id="spmeter" style="width:${{ preview: 15, q: 40, ready: 60, run: 80, done: 100 }[SP.phase] || 0}%"></i></span><small>${P.grade} 级</small></div>
      <div class="spwrap" id="spwrap" data-ph="pre"><p class="spmeta" id="spmeta"></p>
      <div class="spscore" id="spscore">${spStaffHtml([])}<div class="spcur" id="spcur" hidden></div></div>
      <div id="sppanel" class="sppanel"></div></div>`;
    spPanel();
  }
  function spEvidence(q) {
    const opts = ['只看调号就够了', '最后的低音，加上有没有升高的导音', '看右手第一个音', '看拍号'].sort(() => Math.random() - 0.5);
    return Object.assign({}, q, { q: '你是凭什么分出大调还是小调的？', a: '最后的低音，加上有没有升高的导音', opts, ev: 1 });
  }
  // 提示滑条：拖到哪一层就是哪一层（拖的时候不重画滑条本身，免得中断）
  document.addEventListener('input', e => {
    const el = e.target; if (!SP || !el.matches || !el.matches('input[data-act="sphint"]')) return;
    SP.hint = +el.value; SP.hintMax = Math.max(SP.hintMax || 0, SP.hint);
    const cap = $('#sphintcap'); if (cap) cap.textContent = SP.hint ? `第 ${SP.hint} 层 · ${HINT_TXT[SP.hint]}` : '纯谱';
    spRedraw(SP.bd ? SP.bd.names : []);
    if (SP.phase === 'bars') setTimeout(bdCursor, 60);
    if (SP.phase === 'run') { const k = $('#spkb'); if (k) k.remove(); if (SP.hint >= 3) { const all = SP.P.bars.flatMap(b => b.rh.concat(b.lh)).filter(x => !x.rest).flatMap(x => x.notes.map(n => n.midi)); $('#sppanel').insertAdjacentHTML('beforeend', `<div class="spkb" id="spkb">${kb([], { lo: Math.min(...all), hi: Math.max(...all) })}</div>`); } }
  });
  function spMeta() {
    const P = SP.P, m = $('#spmeta'); if (!m) return;
    const pre = SP.phase === 'preview' || SP.phase === 'q', mk = SP.mk, h = SP.hint || 0;
    const live = mk.filter(x => x.lv < 3), shown = SP.showAll ? mk : live.slice(0, SP.phase === 'done' ? 3 : 6), visible = mk.filter(x => shown.includes(x)), hidden = mk.length - visible.length, open = mk[SP.openIdx];
    m.innerHTML = (pre ? `${P.grade} 级视奏 No.${SP.no}` : `No.${SP.no} · ${P.keyZh} · ${P.time} · 左手${P.lhName}`)
      + `<span class="sphint"><small>提示</small><input type="range" min="0" max="3" step="1" value="${h}" data-act="sphint" aria-label="提示层数"><small id="sphintcap">${h ? `第 ${h} 层 · ${HINT_TXT[h]}` : '纯谱'}</small></span>`
      + `<span class="spmarks">${visible.map(x => `<button class="chip sm fl${x.lv}${SP.openIdx === mk.indexOf(x) ? ' on' : ''}" data-act="spmark" data-v="${mk.indexOf(x)}">${x.lv === 0 ? '<i class="newdot"></i>' : ''}${esc(x.label)}${x.lv === 1 && !SP.opened.has(x.id) ? `<em>${esc(x.short)}</em>` : ''}</button>`).join('')}${hidden ? `<button class="chip sm ghostchip" data-act="spmarkall">${SP.showAll ? '收起' : `+${hidden}`}</button>` : ''}</span>`
      + `<span class="fine spmarkx" id="spmarkx">${open ? `<b>${esc(open.label)}</b> ${esc(open.long)}` : ''}</span>`;
  }
  function spPanel() {
    const el = $('#sppanel'); if (!el || !SP) return;
    const wr = $('#spwrap'); if (wr) wr.dataset.ph = SP.phase === 'preview' || SP.phase === 'q' ? 'pre' : 'main';   // 预读 / 答题时，面板放在谱的上面
    spMeta();
    const mt = $('#spmeter'); if (mt) mt.style.width = ({ preview: 15, q: 40, ready: 60, run: 80, done: 100 }[SP.phase] || 0) + '%';
    const P = SP.P, bpm = Math.round(P.tempo.bpm * spRate());
    if (SP.phase === 'preview') {
      el.innerHTML = `<div class="spprev"><b id="spt">0:${String(SP.left).padStart(2, '0')}</b><span>预读：先别弹</span><button class="btn sm" data-act="spready">我看好了</button></div>
        ${spUnfam()}
        <p class="fine">看：调号拍号 · 音域 · 临时记号 · 左手型 · 最难的节奏</p>`;
      clearInterval(SP.timer);
      SP.timer = setInterval(() => { if (!SP || SP.phase !== 'preview' || route[1] !== 'piece') { clearInterval(SP && SP.timer); return; } SP.left--; const t = $('#spt'); if (t) t.textContent = '0:' + String(Math.max(0, SP.left)).padStart(2, '0'); if (SP.left <= 0) { clearInterval(SP.timer); SP.phase = 'q'; spPanel(); } }, 1000);
      return;
    }
    if (SP.phase === 'q') {
      const q = SP.qs[SP.qi];
      if (!q) { SP.phase = 'ready'; return spPanel(); }
      el.innerHTML = `<div class="spq"><small>预读问题 ${SP.qi + 1}/${SP.qs.length} · ${esc(q.t)} · ${FAM_NAME[q.lv]}${q.ev ? ' · 进阶问法' : ''}</small><b>${esc(q.q)}</b>
        <div class="opts">${q.opts.map((o, i) => `<button class="opt" data-act="spans" data-v="${i}">${esc(o)}</button>`).join('')}</div><p class="fine" id="spwhy"></p></div>`;
      return;
    }
    if (SP.phase === 'ready' || SP.phase === 'done') {
      const res = SP.phase === 'done' ? SP.res : null;
      el.innerHTML = `${res ? spResultHtml(res) : `<p class="fine">预读问题答对 ${SP.qok}/${SP.qs.length}。现在一口气弹下来：先有一小节预备拍，<b>中间错了也别停</b>——视奏练的就是不停。</p>`}
        <div class="sprate"><small>速度</small><span class="seg">${[[0.6, '慢'], [0.8, '中'], [1, '原速']].map(([v, t]) => `<button class="${spRate() === v ? 'on' : ''}" data-act="sprate" data-v="${v}">${t}</button>`).join('')}</span><small>♩ = ${bpm}</small></div>
        <div class="spgo">${place() === 'piano' ? `<button class="btn" data-act="spgo" data-v="mic">🎙 ${res ? '再弹一次' : '开始弹'}（收音打分）</button>` : ''}
          <button class="${place() === 'piano' ? 'ghost' : 'btn'}" data-act="spgo" data-v="tap">👏 两只手打节奏</button>
          <button class="ghost" data-act="bdstart">🔁 逐小节练${res && res.bars.some(b => b.st !== 'good') ? `（先练没过的 ${res.bars.filter(b => b.st !== 'good').length} 小节）` : ''}</button>
          <div class="row"><button class="ghost" data-act="spgo" data-v="listen">▶ 听一遍</button><button class="ghost" data-act="spnew">换一条新的</button></div></div>
        ${res ? '' : `<p class="fine">${place() === 'piano' ? '收音只分得清音名、分不清高低八度；手机放在琴上离琴弦近一点。弹的时候不响节拍器（会干扰收音），看谱上的光标走。' : '打节奏：左边按钮 = 左手，右边 = 右手，按谱上每个音开始的时刻点一下（休止不点、长音只点一下）。电脑上也可以用 F / J 键。'}</p>`}`;
      return;
    }
    if (SP.phase === 'bars') return bdPanel();
    if (SP.phase === 'run') {
      el.innerHTML = SP.run.mode === 'tap'
        ? `<div class="sppads"><button class="sppad" data-h="l">左手</button><button class="sppad" data-h="r">右手</button></div><div class="row"><button class="ghost" data-act="spstop">■ 停</button></div>`
        : `<p class="fine spnow" id="spnow">${SP.run.mode === 'mic' ? '预备拍……听到第 1 小节就开始弹' : '听：光标走到哪，弹到哪'}</p><div class="row"><button class="ghost" data-act="spstop">■ 停</button></div>`;
      if (SP.hint >= 3) { const all = SP.P.bars.flatMap(b => b.rh.concat(b.lh)).filter(e => !e.rest).flatMap(e => e.notes.map(n => n.midi)); el.insertAdjacentHTML('beforeend', `<div class="spkb" id="spkb">${kb([], { lo: Math.min(...all), hi: Math.max(...all) })}</div>`); }
      el.querySelectorAll('.sppad').forEach(b => b.addEventListener('pointerdown', ev => { ev.preventDefault(); spTap(b.dataset.h); b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 90); }));
    }
  }
  // 这首里你还不熟的：新 / 见过的记号、调、左手型，还有认得慢的音位
  function spUnfam() {
    const items = SP.mk.filter(x => x.lv <= 1).map(x => x.label).concat(SP.tag.filter(x => x.lv <= 1).map(x => x.label));
    const names = new Set();
    SP.P.bars.forEach(b => [[b.rh, 't'], [b.lh, 'b']].forEach(([evs, cl]) => evs.forEach(e => { if (!e.rest) e.notes.forEach(n => { const st = nrSt(cl, n.midi); if (st && nrLevel(st) === 'slow') names.add(n.name + n.oct); }); })));
    if (names.size) items.push('认得慢的 ' + [...names].slice(0, 3).join(' '));
    return items.length ? `<p class="fine spunfam">还不熟（${items.length}）：${items.slice(0, 5).map(esc).join('、')}${items.length > 5 ? '…' : ''}</p>` : '';
  }
  function spAnswer(i) {
    const q = SP.qs[SP.qi]; if (SP.answered) return;
    SP.answered = 1; const ok = q.opts[i] === q.a; if (ok) SP.qok++;
    document.querySelectorAll('.spq .opt').forEach((b, k) => { b.disabled = true; if (q.opts[k] === q.a) b.classList.add('right'); else if (k === i) b.classList.add('wrong'); });
    // 帮助随熟悉度减少：新 = 完整讲解；见过 = 一句话；会了 = 做对只打勾，做错才讲
    const first = q.lv === 0;
    if (first) { famTouch(q.id, q.t, q.why); const f = famGet(q.id); f.lv = 1; f.n++; if (ok) f.ok++; f.up = today(); } else if (ok) famRight(q.id, q.t, q.why); else famWrong(q.id, q.t, q.why);
    const txt = first ? q.why : q.lv === 1 ? (ok ? '' : q.why) + (q.short ? `<br><small>${esc(q.short)}</small>` : '') : q.lv >= 2 ? (ok ? '' : q.why) : q.why;
    const lvNow = famLv(q.id);
    save();
    const w = $('#spwhy'); if (w) w.innerHTML = (ok ? '<b>✓</b> ' : '') + (first || !ok ? esc(q.why) : q.lv === 1 ? esc(q.short || '') : '') + `<br><small class="famnote">「${esc(q.t)}」熟悉度：${FAM_NAME[lvNow]} ${famDots(lvNow)}${ok && lvNow > q.lv ? ' ↑ 升级了，以后给你的提示会少一点' : !ok ? ' · 做错了，下次还会多给一点提示' : ''}</small><br><button class="btn sm" data-act="spnextq">${SP.qi + 1 < SP.qs.length ? '下一题' : '开始弹 →'}</button>`;
  }
  function spClickAt(t, accent) { A.click(Math.max(0, t - A.ctx.currentTime), accent); }
  async function spGo(mode) {
    if (!SP) return;
    spStop(); A.init();
    const P = SP.P, spb = 60 / (P.tempo.bpm * spRate()), step = P.time === '6/8' ? 1.5 : 1, total = P.bars.length * P.bq;
    if (mode === 'mic') {
      try { await Listen.start(A.ctx, spEvent); if (!S.micOK) { S.micOK = 1; save(); } }
      catch (e) { toast(e && e.name === 'NotAllowedError' ? '没有麦克风权限 · 先用「两只手打节奏」' : '这里用不了麦克风 · 先用「两只手打节奏」'); return; }
    }
    if (mode === 'selftest') { Listen.attach(A.bus, spEvent); }
    const lead = P.bq * spb, start = A.ctx.currentTime + 0.25 + lead;
    // 预备拍一小节；打节奏 / 听的时候整首都有节拍器，收音时只有预备拍（节拍器会干扰收音）
    for (let b = -P.bq; b < (mode === 'mic' || mode === 'selftest' ? 0 : total); b += step) spClickAt(start + b * spb, ((b % P.bq) + P.bq) % P.bq === 0);
    // 自查用 window.__spBug = { shift: [小节…], skip: [小节…], late: [小节…] }：故意弹错，确认评分抓得到
    const bug = mode === 'selftest' && window.__spBug || {};
    if (mode === 'listen' || mode === 'selftest') P.bars.forEach((bar, bi) => { if ((bug.skip || []).includes(bi)) return; bar.rh.concat(bar.lh).forEach(e => { if (!e.rest) e.notes.forEach(n => A.note(n.midi + ((bug.shift || []).includes(bi) ? 2 : 0), start + (e.t + ((bug.late || []).includes(bi) ? 0.3 : 0)) * spb - A.ctx.currentTime, Math.max(0.2, e.d * spb * 0.95), n.midi < 60 ? 0.5 : 0.62)); }); });
    SP.run = { mode, spb, total, perf0: performance.now() + (start - A.ctx.currentTime) * 1000, det: [], taps: { r: [], l: [] }, row: -1 };
    SP.phase = 'run'; spPanel();
    const tl = Sight.onsets(P).all;
    const loop = () => {
      if (!SP || SP.phase !== 'run' || route[1] !== 'piece') return;
      const beat = (performance.now() - SP.run.perf0) / 1000 / spb;
      spCursor(beat, tl);
      const now = $('#spnow'); if (now && beat >= 0) now.textContent = `第 ${Math.min(P.bars.length, Math.floor(beat / P.bq) + 1)} 小节`;
      if (beat > total + 0.5) return spFinish();
      SP.raf = requestAnimationFrame(loop);
    };
    SP.raf = requestAnimationFrame(loop);
  }
  function spCursor(beat, tl) {
    const st = document.querySelector('#spscore .staff'), cur = $('#spcur'); if (!st || !cur || !st.__pos) return;
    if (beat < 0) { cur.hidden = true; return; }
    let o = null; for (const e of tl) { if (e.t <= beat + 1e-6) o = e; else break; }
    if (!o) { cur.hidden = true; return; }
    const p = st.__pos.find(q => q.t === o.t && q.h === 'r' && !q.rest) || st.__pos.find(q => q.t === o.t), bx = st.__bars[p.bar];
    const k = st.clientWidth / st.__W;
    const kbe = $('#spkb'); if (kbe) kbe.querySelectorAll('.k').forEach(k => k.classList.toggle('on', o.ms.includes(+k.dataset.m)));
    cur.hidden = false;
    Object.assign(cur.style, { left: (p.x - 3) * k + 'px', top: bx.y * k + 'px', height: bx.h * k + 'px' });
    const row = Math.round(bx.y);
    if (row !== SP.run.row) { SP.run.row = row; cur.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }
  const SP_LAT = 0.18; // 收音起音检测的延迟（秒）：合成钢琴实测约 0.18 秒
  function spEvent(ev) {
    if (!SP || !SP.run || ev.type !== 'onset') return;
    SP.run.det.push({ beat: ((performance.now() - SP.run.perf0) / 1000 - SP_LAT) / SP.run.spb, chroma: ev.chroma });
  }
  function spTap(h) {
    if (!SP || !SP.run || SP.run.mode !== 'tap') return;
    A.click(0, false);
    SP.run.taps[h].push((performance.now() - SP.run.perf0) / 1000 / SP.run.spb);
  }
  document.addEventListener('keydown', e => { if (!SP || !SP.run || SP.phase !== 'run' || SP.run.mode !== 'tap' || e.repeat) return; if (e.key === 'f' || e.key === 'F') spTap('l'); if (e.key === 'j' || e.key === 'J') spTap('r'); });
  window.addEventListener('resize', () => { if (SP && SP.phase === 'done') setTimeout(spBars, 300); });
  function spStop() {
    if (SP) { cancelAnimationFrame(SP.raf); clearInterval(SP.timer); }
    if (Listen.active()) Listen.stop();
    stopAll();
  }
  // 谱上的记号：每个都能点开看意思（预读时也能看，不说调名）
  const TEMPO_ZH = { Andante: '行板：稍慢，像走路的速度', Andantino: '小行板：比行板稍快一点', Moderato: '中板：不快不慢', Allegretto: '小快板：稍快、轻快', Grazioso: '优雅地：速度适中，弹得轻巧、有弹性' };
  function spMarks(P) {
    const out = [], m = (id, label, long, short) => out.push({ id, label, long, short });
    const ks = Math.abs(Vex.Flow.keySignature(T.parseKey(P.key).tonic.name + (P.minor ? 'm' : '')).length);
    const sharp = /#/.test(T.scale(T.parseKey(P.key)).map(n => n.name).join(''));
    if (ks) m('mark:keysig', '调号', `谱号旁边的 ${ks} 个${sharp ? '升号' : '降号'}管整首：写在哪条线 / 哪个间，那个音名在所有八度都要${sharp ? '升' : '降'}半音。先说出是什么调，再看最后一个低音确认。`, `${ks} 个${sharp ? '升' : '降'}号管整首`);
    const [n, d] = P.time.split('/');
    m('time:' + P.time, P.time, d === '8' ? '6/8 拍：每小节 6 个八分音符，按两大拍数（1-2-3 4-5-6），每大拍是一个附点四分音符。' : `${n}/4 拍：每小节 ${n} 拍，四分音符一拍。${n === '3' ? '第一拍重，后两拍轻。' : n === '4' ? '第一拍最重，第三拍次重。' : '强、弱交替。'}`, d === '8' ? '两大拍，每拍 3 个八分' : `每小节 ${n} 拍`);
    const bn = P.tempo.mark.replace(/\D/g, ''), tz = TEMPO_ZH[P.tempo.text] || '速度术语';
    m('term:' + P.tempo.text, P.tempo.text + ' ' + P.tempo.mark, tz + `。${P.tempo.mark}：每分钟 ${bn} 个${P.time === '6/8' ? '附点四分音符（一大拍）' : '四分音符'}。练的时候可以先慢下来。`, tz.split('：')[0]);
    const DZ = { p: ['p 弱', '弱'], mp: ['mp 中弱', '中弱'], mf: ['mf 中强', '中强'], f: ['f 强', '强'] }, dyn = [...new Set(Object.values(P.dyn || {}))];
    m('term:dyn', dyn.join(' '), dyn.map(x => DZ[x][0]).join('；') + '。从这里开始一直这样弹，直到出现下一个力度记号。', dyn.map(x => DZ[x][1]).join(' → '));
    if (P.cresc != null) m('term:cresc', 'cresc.', 'crescendo，渐强：从这里开始一点一点弹响，不要一下子变响。', '渐强');
    if (P.rit) m('term:rit', 'rit.', 'ritardando，渐慢：最后一点一点放慢，像要停下来。', '渐慢');
    const ev = P.bars.flatMap(b => b.rh);
    if (ev.some(e => !e.rest && [0.75, 1.5, 3].includes(e.d))) m('rhy:dot', '附点', '音符后面的点 = 把这个音延长一半：附点四分 = 一拍半，附点二分 = 三拍。数拍时多数一个「和」：1-2-和-3。', '点 = 多半拍');
    if (ev.some(e => !e.rest && e.t % 1 === 0.5 && e.d >= 1)) m('rhy:sync', '切分', '音从拍子中间（「和」）开始、拉过下一个拍点：重音落在弱拍上。数拍时在「和」上进来，拍点上不要再弹。', '从「和」开始，拉过拍点');
    if (P.bars.some(b => [b.rh, b.lh].some(evs => { let pv = null; return evs.some(e => { if (e.rest) return false; const v = e.notes[0].midi, hit = pv != null && Math.abs(v - pv) >= 7; pv = v; return hit; }); }))) m('concept:handshift', '换手位', '手要跳到另一个位置（跳了五度以上）：先看落点，提前把手移过去，别等到弹的时候才去找。', '先看落点');
    m('mark:slur', '连线', '音符上下的弧线（连奏线）：弧线下的音连贯地弹，手指一个接一个，不要断开；弧线结束的那个音轻轻抬手。', '连贯地弹');
    if (P.minor && P.bars.some(b => b.rh.concat(b.lh).some(e => !e.rest && e.notes.some(x => x.alt)))) { const k = T.parseKey(P.key).tonic, up = T.noteAt(k.li + 6, k.pc + 11).name, dn = T.noteAt(k.li + 6, k.pc + 10).name; m('concept:leading', '导音', `小调里第 7 级 ${T.disp(dn)} 要升高成 ${T.disp(up)}：离主音只差半音，非常想往上走回主音。谱上用临时升号（或还原号）写出来。`, `${T.disp(dn)} → ${T.disp(up)}`); }
    if (P.bars.some(b => b.lh.some(e => e.stac))) m('mark:stac', '跳音', '音符上的小圆点：短而轻，弹下去马上放开。', '短而轻');
    if (P.bars.some(b => b.rh.concat(b.lh).some(e => e.rest))) m('mark:rest', '休止符', '这里不弹，但拍子照数。8 字形的是八分休止（半拍），闪电形的是四分休止（一拍）。', '不弹，但数拍');
    if (P.bars.some(b => b.rh.concat(b.lh).some(e => !e.rest && e.notes.some(x => x.alt)))) m('mark:accidental', '临时记号', '音符前面的 ♯ ♭ ♮ 只管这一小节里、这个位置的音；过了小节线就回到调号。♮ 是还原：取消升降。', '只管这一小节');
    return out;
  }
  // ---------------- 熟悉度账本：每个「点」（记号、概念、调、拍号、左手型、音位）一条 ----------------
  // lv：0 新 → 1 见过 → 2 会了 → 3 熟练。帮助随等级减少：新 = 自动展开完整解释；见过 = 一句话；会了 = 不主动显示（点了还能看）；熟练 = 连标记都收起来
  // 升级：不看解释、做对。1→2 要累计做对 2 次；2→3 要隔天还做对。降级：点开看解释（回到「见过」），或做错（掉一级，最低「见过」）
  const FAM_NAME = ['新', '见过', '会了', '熟练'];
  const famGet = id => (S.fam || {})[id] || null;
  const famLv = id => { const f = famGet(id); return f ? f.lv : 0; };
  function famTouch(id, t, long) { S.fam = S.fam || {}; const f = (S.fam[id] = S.fam[id] || { t, lv: 0, n: 0, ok: 0, d: today(), up: '' }); if (t) f.t = t; if (long) f.long = long; return f; }
  function famShown(id, t, long) { const f = famTouch(id, t, long); if (f.lv < 1) { f.lv = 1; f.up = today(); } }
  function famSee(id, t, long) { const f = famTouch(id, t, long); f.lv = Math.min(f.lv, 1); f.ok = 0; f.seen = (f.seen || 0) + 1; save(); }
  function famRight(id, t, long) {
    const f = famTouch(id, t, long); f.n++; f.ok++;
    if (f.lv === 0) { f.lv = 1; f.up = today(); } else if (f.lv === 1 && f.ok >= 2) { f.lv = 2; f.up = today(); } else if (f.lv === 2 && f.up !== today() && f.ok >= 3) { f.lv = 3; f.up = today(); }
  }
  function famWrong(id, t, long) { const f = famTouch(id, t, long); f.n++; f.ok = 0; f.lv = Math.max(1, f.lv - 1); }
  const famDots = lv => '●'.repeat(Math.max(0, lv)) + '○'.repeat(3 - Math.max(0, lv));
  const FAM_W = [3, 2, 1, 0.4]; // 出题权重：越不熟出得越多
  // 提示层：0 纯谱 → 1 圈出要注意的 → 2 写出难点音名 → 3 全部音名
  function spHintCfg(P, layer) {
    if (!layer) return { hot: [], nameKeys: [], names: [] };
    const done = id => famLv(id) >= 3;                                                    // 熟练的东西：谱面上不再圈、不再写
    const hot = new Set(), nk = new Set(), sigL = new Set(T.scale(T.parseKey(P.key)).filter(n => n.name.length > 1).map(n => n.name[0])), seenL = new Set();
    const cx = e => (e.rest ? 1 : 0) + ([0.25, 0.75, 1.5].includes(e.d) ? 1 : 0) + (e.t % 1 === 0.5 && e.d >= 1 ? 1 : 0);
    const hard = P.bars.map(b => b.rh.concat(b.lh).reduce((a, e) => a + cx(e), 0));
    const hb = Math.max(...hard) >= 2 ? hard.indexOf(Math.max(...hard)) : -1;
    P.bars.forEach((b, bi) => [['r', b.rh, 't'], ['l', b.lh, 'b']].forEach(([h, evs, cl]) => { let prev = null; evs.forEach((e, i) => {
      if (e.rest) return;
      const key = bi + ':' + h + ':' + i, mid = e.notes[0].midi;
      const ledger = cl === 't' ? e.notes.some(x => x.midi <= 60 || x.midi >= 81) : e.notes.some(x => x.midi >= 60 || x.midi <= 40);
      const quick = e.notes.every(x => { const st = nrSt(cl, x.midi); return st && nrLevel(st) === 'fast'; });   // 这个位置你认得很快
      const acc = e.notes.some(x => x.alt) && !done('mark:accidental'), slow = e.notes.some(x => { const st = nrSt(cl, x.midi); return st && nrLevel(st) === 'slow'; });
      const shift = !done('concept:handshift') && prev != null && Math.abs(mid - prev) >= 7;                      // 换手位：跳了五度以上
      const sig = !done('mark:keysig') && e.notes.some(x => sigL.has(x.name[0]) && !x.alt) && !seenL.has(e.notes[0].name[0]) && (seenL.add(e.notes[0].name[0]), true); // 调号影响的音：每个字母只圈第一次
      const rhy = bi === hb && cx(e) > 0 && !(done('rhy:dot') && done('rhy:sync'));                                           // 最难的那一小节里的难节奏
      const led = ledger && !quick;
      if (acc || led || slow || shift || sig || rhy) hot.add(key);
      if (acc || led || slow) nk.add(key + (acc ? '|0' : slow ? '|1' : '|2'));
      prev = mid;
    }); }));
    const names = [...nk].sort((a, b) => a.split('|')[1] - b.split('|')[1]).slice(0, 6).map(x => x.split('|')[0]);   // 最多写 6 个，先写临时记号、再写认得慢的、最后加线音
    return { hot: [...hot], nameKeys: layer >= 2 ? names : [], names: layer >= 3 ? P.bars.map((_, i) => i) : [] };
  }
  window.__hintCfg = spHintCfg; // 自查用
  const HINT_TXT = ['纯谱', '圈出注意点', '难点音名', '全部音名 + 键盘'];
  const HINT_WHY = ['像考试一样，什么提示都没有。', '橙色的音 = 要注意的：临时记号、加线音、你认得慢的音。', '橙色的音下面写出了音名。', '每个音下面都写了音名。'];

  // 换一份谱面（显示某几小节的音名）
  // 谱面：熟练的记号（连线、力度、cresc.、rit.、跳音）在所有提示层都不印；点开它的解释（同时退回「见过」）就印回来
  const HIDE_MK = { 'mark:slur': 'slur', 'term:dyn': 'dyn', 'term:cresc': 'cresc', 'term:rit': 'rit', 'mark:stac': 'stac' };
  function spStaffHtml(names) {
    const h = spHintCfg(SP.P, SP.hint || 0);
    const hide = SP.mk.filter(x => HIDE_MK[x.id] && x.lv >= 3 && !SP.opened.has(x.id)).map(x => HIDE_MK[x.id]);
    return Staff.html({ piece: SP.P, names: [...new Set([...(names || []), ...h.names])], hot: h.hot, nameKeys: h.nameKeys, hide });
  }
  function spRedraw(names) {
    const box = $('#spscore'); if (!box) return;
    box.innerHTML = spStaffHtml(names) + '<div class="spcur" id="spcur" hidden></div>';
    if (SP.res && SP.phase === 'done') setTimeout(spBars, 40);
  }

  // ---------------- 逐小节练：一节一节弹对，再两节连起来，最后整首 ----------------
  // 每一步等你弹（收音或点屏幕键盘），弹对才往下走；错两次就把这一小节的音名写出来
  function bdStart() {
    spStop();
    const P = SP.P, weak = SP.res ? SP.res.bars.map((b, i) => (b.st !== 'good' ? i : -1)).filter(i => i >= 0) : [];
    const plan = [];
    if (weak.length) weak.forEach(b => plan.push([b, b]));
    else for (let b = 0; b < P.bars.length; b++) { plan.push([b, b]); if (b % 2 === 1) plan.push([b - 1, b]); if (b === 3) plan.push([0, 3]); }
    plan.push([0, P.bars.length - 1]);
    SP.bd = { plan, k: 0, j: 0, miss: 0, names: [], sel: new Set(), clean: true, mic: SP.bd && SP.bd.mic };
    SP.run = { row: -1 }; SP.phase = 'bars';
    spRedraw([]); bdLoad(); spPanel();
  }
  function bdLoad() {
    const bd = SP.bd, [a, b] = bd.plan[bd.k];
    bd.evs = Sight.onsets(SP.P).all.filter(o => o.bar >= a && o.bar <= b);
    bd.j = 0; bd.miss = 0; bd.sel.clear(); bd.clean = true;
  }
  function bdPanel() {
    const bd = SP.bd, el = $('#sppanel'), [a, b] = bd.plan[bd.k], P = SP.P;
    const all = P.bars.flatMap(x => x.rh.concat(x.lh)).filter(e => !e.rest).flatMap(e => e.notes.map(n => n.midi));
    const lo = Math.min(...all), hi = Math.max(...all);
    el.innerHTML = `<div class="bdh"><b>${a === b ? `第 ${a + 1} 小节` : `第 ${a + 1}–${b + 1} 小节连起来`}</b><small>${bd.k + 1}/${bd.plan.length} 步</small></div>
      <p class="sfb" id="bdfb">${bd.fb || (a === b ? '按顺序弹：光标指着的音（两只手同时响的一起按）。' : '连起来弹，中间别停。')}</p>
      <div class="pills"><button class="pill" data-act="bdplay">▶ 听</button><button class="pill${bd.names.includes(a) ? ' on' : ''}" data-act="bdnames">显示音名</button>${place() === 'piano' ? `<button class="pill${bd.mic ? ' on' : ''}" data-act="bdmic">${bd.mic ? '🎙 在听…' : '🎙 在琴上弹'}</button>` : ''}<button class="pill" data-act="bdskip" data-v="1">跳过 ›</button></div>
      <div class="skb wide" id="bdkb">${kb([], { tap: true, lo, hi })}</div>
      <div class="row"><button class="ghost" data-act="bdexit">回到整首</button></div>`;
    bd.fb = '';
    bdCursor();
    const wrap = $('#bdkb'), k0 = wrap && wrap.querySelector('[data-m="48"]'); if (k0) wrap.scrollLeft = Math.max(0, k0.getBoundingClientRect().left - wrap.getBoundingClientRect().left - 10);
  }
  function bdCursor() {
    const bd = SP.bd; if (!bd) return;
    const e = bd.evs[bd.j]; if (!e) return;
    const tl = Sight.onsets(SP.P).all;
    setTimeout(() => spCursor(e.t, tl), 30);
  }
  function bdKeys(show) {
    const ms = show ? bd_target() : [];
    document.querySelectorAll('#bdkb .k').forEach(k => { const m = +k.dataset.m; k.classList.toggle('sel', SP.bd.sel.has(m)); k.classList.toggle('on', ms.includes(m)); });
  }
  const bd_target = () => [...new Set(SP.bd.evs[SP.bd.j].ms)].sort((a, b) => a - b);
  function bdTap(m) {
    A.init(); A.note(m, 0, 0.8, 0.55);
    if (!SP || SP.phase !== 'bars' || !SP.bd) return;
    const bd = SP.bd, tg = bd_target();
    if (tg.length === 1) return bdJudge(m === tg[0], [m]);
    bd.sel.has(m) ? bd.sel.delete(m) : bd.sel.add(m); bdKeys(false);
    if (bd.sel.size >= tg.length) { const got = [...bd.sel].sort((a, b) => a - b); bd.sel.clear(); bdJudge(got.join() === tg.join(), got); }
  }
  const nmOf = m => { for (const b of SP.P.bars) for (const e of b.rh.concat(b.lh)) if (!e.rest) for (const n of e.notes) if (n.midi === m) return n.name + n.oct; return PCN[m % 12] + (Math.floor(m / 12) - 1); };
  function bdJudge(ok, got) {
    const bd = SP.bd, fb = $('#bdfb');
    if (ok) {
      bd.j++; bd.miss = 0; bdKeys(false);
      if (bd.j >= bd.evs.length) return bdAdvance(0);
      if (fb) fb.innerHTML = '<span class="ok">✓</span>';
      return bdCursor();
    }
    bd.miss++; bd.clean = false;
    const tg = bd_target(), [a] = bd.plan[bd.k];
    if (bd.miss >= 2) { if (!bd.names.includes(a)) { bd.names.push(...Array.from({ length: bd.plan[bd.k][1] - a + 1 }, (_, i) => a + i)); spRedraw(bd.names); setTimeout(bdCursor, 60); } if (fb) fb.innerHTML = `<span class="no">${got && got.length ? '你弹的是 ' + got.map(nmOf).join(' + ') + '。' : ''}应该是 <b>${tg.map(nmOf).join(' + ')}</b>（键盘上亮着，音名写在谱上了）</span>`; bdKeys(true); }
    else if (fb) fb.innerHTML = `<span class="no">${got && got.length ? '你弹的是 ' + got.map(nmOf).join(' + ') + '，' : ''}不对，再看一眼。</span>`;
  }
  function bdAdvance(skipped) {
    const bd = SP.bd, [a, b] = bd.plan[bd.k];
    if (!skipped) logEv('sightbar', { no: SP.no, a, b, clean: bd.clean ? 1 : 0 });
    bd.k++;
    if (bd.k >= bd.plan.length) {
      if (Listen.active()) Listen.stop();
      SP.bd = null; SP.phase = SP.res ? 'done' : 'ready'; spRedraw([]); spPanel();
      toast('逐小节练完了 · 现在整首一口气再弹一次'); return;
    }
    bd.fb = skipped ? '' : `<span class="ok">✓ ${a === b ? `第 ${a + 1} 小节` : `第 ${a + 1}–${b + 1} 小节`}${bd.clean ? '一次弹对' : '过了'}</span>`;
    // 下一步换了小节：如果音名是因为错了才显示的，换到新的小节就收起来，靠眼睛读
    bdLoad(); if (!bd.plan[bd.k].some(x => bd.names.includes(x))) { bd.names = []; spRedraw([]); }
    spPanel();
  }
  function bdNames() {
    const bd = SP.bd, [a, b] = bd.plan[bd.k];
    if (bd.names.includes(a)) bd.names = []; else { bd.clean = false; for (let i = a; i <= b; i++) bd.names.push(i); }
    spRedraw(bd.names); spPanel();
  }
  function bdPlay() {
    const bd = SP.bd, [a, b] = bd.plan[bd.k], P = SP.P, spb = 60 / (P.tempo.bpm * spRate()), t0 = a * P.bq;
    A.init();
    P.bars.slice(a, b + 1).forEach(bar => bar.rh.concat(bar.lh).forEach(e => { if (!e.rest) e.notes.forEach(n => A.note(n.midi, 0.1 + (e.t - t0) * spb, Math.max(0.2, e.d * spb * 0.95), n.midi < 60 ? 0.5 : 0.62)); }));
  }
  async function bdMic() {
    const bd = SP.bd;
    if (Listen.active()) { Listen.stop(); bd.mic = false; spPanel(); return; }
    A.init();
    try { await Listen.start(A.ctx, ev => { if (!SP || SP.phase !== 'bars' || ev.type !== 'onset') return; const tg = bd_target(), pcs = [...new Set(tg.map(m => m % 12))]; const ok = pcs.length === 1 ? Listen.bestNote(ev.chroma) === pcs[0] : Listen.matchChord(ev.chroma, pcs) >= 0.6; if (ok) bdJudge(true); else if (pcs.length === 1) bdJudge(false, []); }); bd.mic = true; toast('在听了：照着光标弹'); }
    catch (e) { bd.mic = false; toast('用不了麦克风 · 用屏幕键盘点'); }
    spPanel();
  }

  // ---------------- 认音反应：一眼认出音在哪，不从路标数格子 ----------------
  // 每个音记反应时间和对错（S.nrs），慢的、错的、没见过的出得多；目标是每个音 1 秒内
  let NR = null;
  window.__nr = () => NR; // 自查用
  const nrCfg = () => Object.assign({ cl: 'b', rg: 'in', ans: 'name' }, S.nrCfg || {});
  const nrPool1 = (cl, rg) => { const [lo, hi] = cl === 'b' ? (rg === 'ledger' ? [36, 64] : [41, 59]) : (rg === 'ledger' ? [57, 84] : [62, 79]); return Sight.range(lo, hi).map(m => ({ cl, m })); };
  const nrPool = c => (c.cl === 'g' ? nrPool1('b', c.rg).concat(nrPool1('t', c.rg)) : nrPool1(c.cl, c.rg));
  const nrSt = (cl, m) => (S.nrs || {})[cl + m] || null;
  const NRC = { none: '#c9c6bd', fast: '#2e9e5b', mid: '#d99a00', slow: '#e8541e' };
  const nrLevel = st => (!st ? 'none' : st.ok / st.n < 0.8 || st.ms > 2500 ? 'slow' : st.ms > 1200 ? 'mid' : 'fast');
  function nrWeight(it) { const st = nrSt(it.cl, it.m); if (!st) return 3; return Math.min(8, 1 + Math.max(0, (st.ms - 900) / 600) + (1 - st.ok / st.n) * 5); }
  function nrPick() {
    const due = NR.again.findIndex(x => x.at <= NR.i); if (due >= 0) return NR.again.splice(due, 1)[0].it;
    const pool = NR.pool.filter(x => !(NR.last && x.cl === NR.last.cl && x.m === NR.last.m));
    let r = Math.random() * pool.reduce((a, x) => a + nrWeight(x), 0);
    for (const x of pool) { r -= nrWeight(x); if (r <= 0) return x; }
    return pool[0];
  }
  // 一个谱表上所有音的反应快慢（绿 = 1.2 秒内，黄 = 2.5 秒内，红 = 更慢或常错，灰 = 还没练）
  function nrMap(cl, rg) {
    const pool = nrPool1(cl, rg), rows = [];
    for (let i = 0; i < pool.length; i += 6) rows.push(pool.slice(i, i + 6));
    return rows.map(row => Staff.html({ sight: 1, clef: cl === 'b' ? 'bass' : 'treble', ev: row.map(x => { const e = { t: [], b: [] }; e[cl].push(Sight.vex(x.m)); return e; }), done: row.length, names: row.map(x => { const st = nrSt(cl, x.m); return Sight.name(x.m) + (st ? ' ' + (st.ms / 1000).toFixed(1) : ''); }), colors: row.map(x => NRC[nrLevel(nrSt(cl, x.m))]) })).join('');
  }
  function nrSummary(cl) {
    const pool = nrPool1(cl, 'ledger'), sts = pool.map(x => nrSt(cl, x.m)).filter(Boolean);
    if (!sts.length) return '还没练';
    const avg = sts.reduce((a, x) => a + x.ms, 0) / sts.length, slow = pool.filter(x => nrLevel(nrSt(cl, x.m)) === 'slow');
    return `平均 ${(avg / 1000).toFixed(1)} 秒${slow.length ? ' · 要加强 ' + slow.slice(0, 5).map(x => Sight.nameOct(x.m)).join(' ') : ''}`;
  }
  // 我的熟悉度：不懂的东西永远找得到，点开看解释；越熟的越往后排
  function famCard() {
    const F = S.fam || {}, ids = Object.keys(F), nrs = Object.keys(S.nrs || {});
    if (!ids.length && !nrs.length) return '';
    const grp = [['concept:', '概念'], ['term:', '术语'], ['mark:', '记号'], ['rhy:', '节奏'], ['time:', '拍号'], ['key:', '调'], ['lh:', '左手型']];
    const cnt = [0, 0, 0, 0]; nrs.forEach(k => { cnt[{ none: 0, slow: 1, mid: 2, fast: 3 }[nrLevel(S.nrs[k])]]++; });
    const weak = ids.filter(id => F[id].lv <= 1).length;
    return `<details class="spcard famcard"><summary><b>我的熟悉度</b><small>${ids.length} 项 · 不熟 ${weak}</small></summary>
      ${grp.map(([pre, name]) => { const rows = ids.filter(id => id.startsWith(pre)).sort((a, b) => F[a].lv - F[b].lv); return rows.length ? `<details class="famg"><summary>${name} <small>${rows.length} · 不熟 ${rows.filter(id => F[id].lv <= 1).length}</small></summary><ul class="famlist">${rows.map(id => `<li><button class="famrow" data-act="famshow"><span>${esc(F[id].t || id)}</span><i class="fd fd${F[id].lv}">${famDots(F[id].lv)}</i></button><div class="famx" hidden>${esc(F[id].long || '遇到时会记下来')}</div></li>`).join('')}</ul></details>` : ''; }).join('')}
      ${nrs.length ? `<p class="fine">音位：快 ${cnt[3]} · 一般 ${cnt[2]} · 慢 ${cnt[1]} <a href="#sight-react">看每个音 →</a></p>` : ''}
      <p class="fine">●●● 熟练　●●○ 会了　●○○ 见过。点一项看解释；看解释会退回「见过」，不看解释做对会升级。</p></details>`;
  }
  function nrCard() {
    return `<section class="spcard nrcard"><div class="spcard-h"><b>认音反应</b><a class="pill" href="#sight-react">练 →</a></div>
      <p class="fine">低音：${nrSummary('b')}　高音：${nrSummary('t')}</p></section>`;
  }
  function nrIntro() {
    if (Listen.active()) Listen.stop();
    const c = nrCfg(); NR = null;
    const seg = (k, opts) => `<span class="seg">${opts.map(([v, t]) => `<button class="${c[k] === v ? 'on' : ''}" data-act="nrset" data-k="${k}" data-v="${v}">${t}</button>`).join('')}</span>`;
    view.innerHTML = `<div class="qbar"><a href="#sight" class="x">×</a><span class="meter"><i style="width:0%"></i></span><small>认音反应</small></div>
      <h2 class="sight-h">认音反应：一眼认出，不数格子</h2>
      <div class="nrset">${seg('cl', [['b', '低音谱表'], ['t', '高音谱表'], ['g', '两个都有']])}${seg('rg', [['in', '谱表里'], ['ledger', '加上加线']])}${seg('ans', [['name', '说音名'], ['key', '点琴键']])}</div>
      <p class="fine">一轮 20 个音。<b>说音名</b>：看到就点 C–B，练的是「这个位置 = 这个名字」；<b>点琴键</b>：直接点键盘上那个键（八度要对），练的是「这个位置 = 手放这里」。错了马上告诉你，过 3 个音再考一次。</p>
      <div class="cta"><button class="btn" data-act="nrgo">开始</button></div>
      <h3 class="h3">每个音有多快</h3><p class="fine"><span class="spk" style="background:${NRC.fast}"></span>1.2 秒内 <span class="spk" style="background:${NRC.mid}"></span>2.5 秒内 <span class="spk" style="background:${NRC.slow}"></span>更慢或常错 <span class="spk" style="background:${NRC.none}"></span>还没练（数字是平均秒数）</p>
      ${c.cl !== 't' ? '<p class="fine nrlab">低音谱表</p>' + nrMap('b', 'ledger') : ''}${c.cl !== 'b' ? '<p class="fine nrlab">高音谱表</p>' + nrMap('t', 'ledger') : ''}`;
  }
  function nrGo() {
    const c = nrCfg();
    NR = { c, pool: nrPool(c), i: 0, n: 20, again: [], log: [], last: null };
    nrNext();
  }
  function nrNext() {
    if (NR.i >= NR.n) return nrEnd();
    NR.cur = nrPick(); NR.last = NR.cur; NR.tried = false;
    const it = NR.cur, e = { t: [], b: [] }; e[it.cl].push(Sight.vex(it.m));
    const lo = Math.min(...NR.pool.map(x => x.m)), hi = Math.max(...NR.pool.map(x => x.m));
    const whites = Sight.range(Math.floor(lo / 12) * 12, Math.ceil((hi + 1) / 12) * 12 - 1).length;
    view.innerHTML = `<div class="qbar"><a href="#sight-react" data-act="nrintro" class="x">×</a><span class="meter"><i style="width:${NR.i / NR.n * 100}%"></i></span><small>${NR.i + 1}/${NR.n}</small></div>
      <div class="sight-st nrst">${Staff.html({ sight: 1, clef: it.cl === 'b' ? 'bass' : 'treble', ev: [e], mark: 0 })}</div>
      <p class="sfb" id="nrfb">${NR.fb || '&nbsp;'}</p>
      ${NR.c.ans === 'name' ? `<div class="nrnames">${'CDEFGAB'.split('').map(l => `<button class="opt" data-act="nrname" data-v="${l}">${l}</button>`).join('')}</div>` : `<div class="skb${whites > 22 ? ' wide' : ''}" id="nrkb">${kb([], { tap: true, lo, hi })}</div>`}`;
    NR.fb = '';
    const wrap = $('#nrkb'); if (wrap && wrap.classList.contains('wide')) { const k = wrap.querySelector(`[data-m="${it.cl === 'b' ? 48 : 60}"]`); if (k) wrap.scrollLeft = Math.max(0, k.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft - wrap.clientWidth / 2); }
    NR.t0 = performance.now();
  }
  function nrAnswer(v) {
    if (!NR || !NR.cur || NR.lock) return;
    const it = NR.cur, ms = performance.now() - NR.t0;
    if (typeof v === 'number') { A.init(); A.note(v, 0, 0.7, 0.5); }
    const ok = typeof v === 'number' ? v === it.m : v === Sight.name(it.m)[0];
    S.nrs = S.nrs || {};
    const st = S.nrs[it.cl + it.m] || { n: 0, ok: 0, ms: 0 };
    if (!NR.tried) { st.n++; if (ok) { st.ok++; st.ms = st.ms ? st.ms * 0.6 + ms * 0.4 : ms; } else st.ms = Math.max(st.ms || 0, 2600); S.nrs[it.cl + it.m] = st; NR.log.push({ it, ms, ok }); }
    NR.tried = true;
    if (ok) { NR.i++; NR.fb = `<span class="ok">✓ ${Sight.nameOct(it.m)} · ${(ms / 1000).toFixed(1)} 秒</span>`; return nrNext(); }
    NR.again.push({ it, at: NR.i + 3 });
    const fb = $('#nrfb'); if (fb) fb.innerHTML = `<span class="no">是 <b>${Sight.nameOct(it.m)}</b>${NR.c.ans === 'key' ? '（键盘上亮着）' : ''}，过一会儿再考你</span>`;
    if (NR.c.ans === 'key') document.querySelectorAll('#nrkb .k').forEach(k => k.classList.toggle('on', +k.dataset.m === it.m));
    else document.querySelectorAll('.nrnames .opt').forEach(b => b.classList.toggle(b.dataset.v === Sight.name(it.m)[0] ? 'right' : 'x', true));
    A.init(); A.note(it.m, 0, 0.9, 0.55);
    NR.lock = true; setTimeout(() => { NR.lock = false; NR.i++; nrNext(); }, 1300);
  }
  function nrEnd() {
    const L = NR.log, okL = L.filter(x => x.ok), avg = okL.length ? okL.reduce((a, x) => a + x.ms, 0) / okL.length : 0, acc = L.length ? okL.length / L.length : 0;
    const prev = (S.log || []).filter(e => e.t === 'nr' && e.cl === NR.c.cl).slice(-1)[0];
    logEv('nr', { cl: NR.c.cl, rg: NR.c.rg, ans: NR.c.ans, ms: Math.round(avg), acc: Math.round(acc * 100) });
    const g = award(acc * Math.min(1, 1500 / Math.max(avg, 1)), 'nr');
    const slow = L.slice().sort((a, b) => (b.ok ? b.ms : 9e9) - (a.ok ? a.ms : 9e9)).filter((x, i, a) => a.findIndex(y => y.it.m === x.it.m && y.it.cl === x.it.cl) === i).slice(0, 4);
    view.innerHTML = `<div class="qbar"><a href="#sight" class="x">×</a><span class="meter"><i style="width:100%"></i></span><small>${NR.n}/${NR.n}</small></div>
      <h2 class="sight-h">认音反应</h2>${gradeHtml(g)}
      <div class="sres"><div><b>${(avg / 1000).toFixed(1)} 秒</b><small>平均反应${prev ? `（上次 ${(prev.ms / 1000).toFixed(1)}）` : ''}</small></div><div><b>${Math.round(acc * 100)}%</b><small>一次认对</small></div></div>
      <p class="fine">最慢 / 错的：${slow.map(x => `<b>${Sight.nameOct(x.it.m)}</b>（${x.ok ? (x.ms / 1000).toFixed(1) + ' 秒' : '错'}）`).join('、')}。这几个下一轮会多出。</p>
      <div class="cta"><button class="btn" data-act="nrgo">再来一轮</button></div><div class="row"><button class="ghost" data-act="nrintro">看每个音有多快</button><a class="ghost" href="#sight">回到视奏</a></div>`;
  }

  // 成绩：每个「该响的时刻」找最近的一次起音（前后 0.35 拍内）。音对 + 准时（±0.2 拍）= 对；音对但早 / 晚 = 节奏偏；音不对 = 错音；没有 = 漏
  function spFinish() {
    const run = SP.run, P = SP.P; cancelAnimationFrame(SP.raf);
    if (Listen.active()) Listen.stop();
    const $c = $('#spcur'); if ($c) $c.hidden = true;
    if (run.mode === 'listen') { SP.phase = SP.res ? 'done' : 'ready'; spPanel(); return; }
    const O = Sight.onsets(P);
    let rows = [], extra = 0, pitch = null;
    if (run.mode === 'tap') {
      ['r', 'l'].forEach(h => {
        const used = new Set();
        O[h].forEach(e => {
          let bj = -1, bd = 9; run.taps[h].forEach((t, j) => { const d = t - e.t; if (!used.has(j) && Math.abs(d) < 0.25 && Math.abs(d) < Math.abs(bd)) { bd = d; bj = j; } });
          if (bj < 0) rows.push({ bar: e.bar, st: 'miss' }); else { used.add(bj); rows.push({ bar: e.bar, st: Math.abs(bd) <= 0.12 ? 'ok' : 'time', dt: bd }); }
        });
        extra += run.taps[h].length - used.size;
      });
    } else {
      const used = new Set();
      O.all.forEach(e => {
        const pcs = [...new Set(e.ms.map(m => m % 12))];
        let best = null;
        run.det.forEach((d, j) => {
          const dt = d.beat - e.t; if (used.has(j) || Math.abs(dt) > 0.35) return;
          const ok = pcs.length === 1 ? Listen.bestNote(d.chroma) === pcs[0] || Listen.matchChord(d.chroma, pcs) >= 0.75 : Listen.matchChord(d.chroma, pcs) >= 0.6;
          const sc = (ok ? 2 : 0) - Math.abs(dt); if (!best || sc > best.sc) best = { j, sc, ok, dt };
        });
        if (!best) rows.push({ bar: e.bar, st: 'miss' });
        else { used.add(best.j); rows.push({ bar: e.bar, st: best.ok ? (Math.abs(best.dt) <= 0.2 ? 'ok' : 'time') : 'wrong', dt: best.dt }); }
      });
      const n = rows.length; pitch = Math.round(rows.filter(r => r.st === 'ok' || r.st === 'time').length / n * 100);
    }
    const n = rows.length;
    // 节奏只看时间：音弹错了但时间对，节奏照样算对
    const thr = run.mode === 'tap' ? 0.12 : 0.2;
    const rhythm = Math.round(Math.max(0, rows.reduce((a, r) => a + (r.dt == null ? 0 : Math.abs(r.dt) <= thr ? 1 : 0.5), 0) - 0.5 * extra) / n * 100);
    let stops = 0, run2 = 0; rows.slice().sort((a, b) => a.bar - b.bar).forEach(r => { if (r.st === 'miss') { run2++; if (run2 === 3) stops++; } else run2 = 0; });
    const bars = P.bars.map((_, bi) => {
      const rs = rows.filter(r => r.bar === bi), ok = rs.filter(r => r.st === 'ok').length / Math.max(1, rs.length);
      const dts = rs.filter(r => r.dt != null).map(r => r.dt), avg = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
      const why = rs.filter(r => r.st === 'miss').length > rs.length / 3 ? '漏了 / 停了' : rs.filter(r => r.st === 'wrong').length >= 2 ? '错音' : avg > 0.12 ? '拖了' : avg < -0.12 ? '抢了' : rs.some(r => r.st !== 'ok') ? '有几个音不准' : '';
      return { st: ok >= 0.85 ? 'good' : ok >= 0.6 ? 'meh' : 'bad', why };
    });
    const acc = pitch == null ? rhythm / 100 : (pitch * 0.6 + rhythm * 0.4) / 100;
    const g = award(acc, 'sightp');
    logEv('sightp', { no: SP.no, h: Math.max(SP.hintMax || 0, SP.hint || 0), g: P.grade, k: P.keyZh, ts: P.time, m: run.mode, p: pitch, r: rhythm, s: stops, q: SP.qok });
    // 熟悉度：没点开解释的记号 / 调 / 拍号 / 左手型，按整首表现升降；临时记号按它所在的小节单独判
    const q = acc;
    const accBars = P.bars.map((b, i) => (b.rh.concat(b.lh).some(e => !e.rest && e.notes.some(x => x.alt)) ? i : -1)).filter(i => i >= 0);
    const upd = (id, t, long) => { if (SP.opened.has(id)) return; if (q >= 0.7) famRight(id, t, long); else if (q < 0.5) famWrong(id, t, long); };
    SP.mk.forEach(x => { if (x.id === 'mark:accidental' && accBars.length) { if (SP.opened.has(x.id)) return; const sb = accBars.map(i => bars[i].st); if (sb.every(v => v === 'good')) famRight(x.id, x.label, x.long); else if (sb.some(v => v === 'bad')) famWrong(x.id, x.label, x.long); } else upd(x.id, x.label, x.long); });
    SP.tag.forEach(x => upd(x.id, x.label));
    // 提示层自适应：整首弹得好 → 下次少一层；弹得差 → 下次从多一层开始
    const hm = Math.max(SP.hintMax || 0, SP.hint || 0);
    S.hintStart = q >= 0.8 ? Math.max(0, hm - 1) : q < 0.5 ? Math.min(3, hm + 1) : hm;
    save();
    SP.res = { pitch, rhythm, stops, bars, g, mode: run.mode, extra, hint: hm, next: S.hintStart };
    SP.phase = 'done'; spPanel(); spBars();
  }
  // 这一条里有哪些东西的熟悉度变了
  function spFamChanges() {
    const before = Object.fromEntries(SP.mk.map(x => [x.id, x.lv]).concat(SP.tag.map(x => [x.id, x.lv])));
    const up = Object.keys(before).filter(id => famLv(id) > before[id] && before[id] >= 1), dn = Object.keys(before).filter(id => famLv(id) < before[id]);
    const nm = id => (famGet(id) || {}).t || id;
    return up.length || dn.length ? `<p class="fine famch">${up.length ? '熟悉了：' + up.map(id => `<b>${esc(nm(id))}</b> → ${FAM_NAME[famLv(id)]}`).join('、') + '。' : ''}${dn.length ? ' 要再看看：' + dn.map(id => `<b>${esc(nm(id))}</b>`).join('、') + '。' : ''}</p>` : '';
  }
  function spBars() {
    const st = document.querySelector('#spscore .staff'), box = $('#spscore'); if (!st || !st.__bars || !SP.res) return;
    box.querySelectorAll('.spbar').forEach(x => x.remove());
    const k = st.clientWidth / st.__W;
    st.__bars.forEach((b, i) => { const r = SP.res.bars[i]; if (!r) return; const d = document.createElement('div'); d.className = 'spbar ' + r.st; Object.assign(d.style, { left: b.x * k + 'px', top: b.y * k + 'px', width: b.w * k + 'px', height: b.h * k + 'px' }); if (r.why) d.title = r.why; box.appendChild(d); });
  }
  function spResultHtml(r) {
    const bad = r.bars.map((b, i) => ({ i, ...b })).filter(b => b.st !== 'good' && b.why);
    return `${gradeHtml(r.g)}
      <div class="sres">${r.pitch != null ? `<div><b>${r.pitch}%</b><small>音准</small></div>` : ''}<div><b>${r.rhythm}%</b><small>节奏</small></div><div><b>${r.stops}</b><small>停下来</small></div></div>
      <p class="fine">谱上每小节：<span class="spk good"></span>稳 <span class="spk meh"></span>有点问题 <span class="spk bad"></span>要再练。${bad.length ? '<br>' + bad.slice(0, 4).map(b => `第 ${b.i + 1} 小节：${b.why}`).join('；') : ''}${r.extra > 2 ? `<br>多点了 ${r.extra} 下（不该响的地方）。` : ''}</p>
      ${r.mode === 'tap' ? '<p class="fine">打节奏只判节奏。回到琴边用收音再弹一次，会加上音准。</p>' : ''}
      <p class="fine">${r.hint ? `用了 ${r.hint} 层提示` : '没用提示'} · 下一条从第 ${r.next} 层开始${r.next < r.hint ? '（少一层）' : r.next > r.hint ? '（多一层）' : ''}</p>
      ${spFamChanges()}`;
  }
  // 每关开头：一句话 + 路标音（带音名，可点可听）
  function sightIntro(lv) {
    if (Listen.active()) Listen.stop();
    SR = null;
    const ev = lv.marks.map(m => { const st = lv.clef === 'treble' ? 't' : lv.clef === 'bass' ? 'b' : m >= 60 ? 't' : 'b'; const e = { t: [], b: [] }; e[st].push(Sight.vex(m)); return e; });
    const lmk = lv.id === 'k1' ? '' : Staff.html({ sight: 1, clef: lv.clef, ev, done: ev.length, names: lv.marks.map(m => Sight.nameOct(m)), tap: 1 });
    view.innerHTML = `<div class="qbar"><a href="#sight" class="x">×</a><span class="meter"><i style="width:0%"></i></span><small>第 ${lv.n} 关</small></div>
      <h2 class="sight-h">${esc(lv.name)}</h2>
      <p class="tip">${lv.tip}</p>
      ${lmk ? `<div class="sight-st">${lmk}</div><div class="pills"><button class="pill" data-act="smarks">▶ 听这几个路标音</button></div>` : ''}
      <p class="fine">一轮 ${Sight.ROUND} 个音${lv.kind === 'chord' || lv.kind === 'two' ? `（${Sight.ROUND / 2} ${sightUnit(lv)}）` : ''}，一次显示一行。过关：第一次就弹对 ≥ 90%，每分钟 ≥ ${lv.spm} ${sightUnit(lv)}。弹完的音下面会写出音名。</p>
      <div class="cta"><button class="btn" data-act="sgo">开始</button></div>`;
  }
  function sightGo() {
    const lv = Sight.LEVELS.find(x => x.id === route[1]); if (!lv) return;
    SR = { lv, items: Sight.round(lv), i: 0, t0: performance.now(), miss: {}, time: {}, sel: new Set(), fb: '', show: null, mic: SR && SR.mic };
    sightPaint();
    if (SR.mic && !Listen.active()) sightMic();
  }
  function sightPaint() {
    if (!SR) return;
    const { lv, items, i } = SR, it = items[i];
    const grp = items.filter(x => x.g === it.g), first = items.indexOf(grp[0]);
    const [lo, hi] = Sight.span(lv);
    const show = SR.show ? it.ms.map(m => ({ midi: m, f: Sight.name(m, it.key) })) : [];
    const whites = Sight.range(Math.floor(lo / 12) * 12, Math.ceil((hi + 1) / 12) * 12 - 1).length;
    const st = Staff.html({ sight: 1, clef: lv.clef, key: it.key, ev: grp.map(x => x.ev), mark: i - first, done: i - first, names: grp.map(x => x.ms.map(m => Sight.name(m, x.key)).join(' ')) });
    const head = `<div class="qbar"><a href="#sight" class="x">×</a><span class="meter"><i style="width:${i / items.length * 100}%"></i></span><small>${i + 1}/${items.length}</small></div>`;
    if (!$('#sst')) {
      view.innerHTML = `${head}<h2 class="sight-h">${esc(lv.name)}</h2>
        <div class="sight-st" id="sst"></div>
        <p class="sfb" id="sfb"></p>
        <div class="skb${whites > 22 ? ' wide' : ''}" id="skb"></div>
        <div class="pills sctl"><button class="pill" data-act="shint">提示</button>${place() === 'piano' ? `<button class="pill${SR.mic ? ' on' : ''}" data-act="smic" id="smic">${SR.mic ? '🎙 在听…' : '🎙 在琴上弹（收音）'}</button>` : ''}</div>`;
    } else view.querySelector('.qbar').outerHTML = head;
    $('#sst').innerHTML = st;
    $('#sfb').innerHTML = SR.fb || (it.ms.length > 1 ? `把这 ${it.ms.length} 个音一起按下去（屏幕上依次点 ${it.ms.length} 个键）` : '橙色这个音是什么？弹出来');
    $('#skb').innerHTML = kb(show, { tap: true, lo, hi });
    document.querySelectorAll('#skb .k').forEach(k => k.classList.toggle('sel', SR.sel.has(+k.dataset.m)));
    // 宽键盘：左右滑动找键（像手在琴上移动）；第一次停在中央 C 附近，之后不替你移动，免得泄露是哪个八度
    const wrap = $('#skb'); if (wrap.classList.contains('wide') && !SR.scrolled) { SR.scrolled = 1; const k = wrap.querySelector('[data-m="60"]'); if (k) wrap.scrollLeft = Math.max(0, k.getBoundingClientRect().left - wrap.getBoundingClientRect().left + wrap.scrollLeft - wrap.clientWidth / 2); }
  }
  // 提示：从最近的路标音往上 / 往下数几格（线和间各算一格）
  const dia = m => { const pc = m % 12, L = { 0: 0, 1: 0, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6 }; return Math.floor(m / 12) * 7 + L[pc]; };
  function hintText(lv, it) {
    const m = it.ms[0], mk = lv.marks.slice().sort((a, b) => Math.abs(dia(a) - dia(m)) - Math.abs(dia(b) - dia(m)))[0], d = dia(m) - dia(mk);
    const base = it.ms.length > 1 ? (lv.kind === 'two' ? '先看下面那个：' : '先看最下面那个：') : '';
    return base + (d === 0 ? `它就是路标音 <b>${Sight.nameOct(mk)}</b>` : `从路标 <b>${Sight.nameOct(mk)}</b> 往${d > 0 ? '上' : '下'}数 ${Math.abs(d)} 格（线、间各算一格）`) + (it.key !== 'C' ? `；注意调号：${it.key === 'G' ? 'F 都弹 F♯' : 'B 都弹 B♭'}` : '');
  }
  function sightHint() { if (!SR || !SR.items) return; const it = SR.items[SR.i]; SR.miss[SR.i] = SR.miss[SR.i] || 0.5; SR.fb = '提示：' + hintText(SR.lv, it); sightPaint(); }
  function sightTap(m) {
    if (!SR || !SR.items) { A.init(); A.note(m, 0, 0.8, 0.55); return; } A.init(); A.note(m, 0, 0.8, 0.55);
    const it = SR.items[SR.i];
    if (it.ms.length === 1) return sightJudge(m === it.ms[0], Sight.nameOct(m, it.key));
    SR.sel.has(m) ? SR.sel.delete(m) : SR.sel.add(m);
    document.querySelectorAll('#skb .k').forEach(k => k.classList.toggle('sel', SR.sel.has(+k.dataset.m)));
    if (SR.sel.size >= it.ms.length) { const got = [...SR.sel].sort((a, b) => a - b); SR.sel.clear(); sightJudge(got.join() === it.ms.slice().sort((a, b) => a - b).join(), got.map(x => Sight.nameOct(x, it.key)).join(' + ')); }
  }
  function sightJudge(ok, heard) {
    if (!SR) return;
    const it = SR.items[SR.i], now = performance.now();
    if (ok) {
      SR.time[SR.i] = (now - SR.t0) / 1000; SR.i++; SR.t0 = now; SR.show = null;
      SR.fb = `<span class="ok">✓ ${it.label}</span>`;
      if (SR.i >= SR.items.length) return sightEnd();
      return sightPaint();
    }
    SR.miss[SR.i] = Math.floor(SR.miss[SR.i] || 0) + 1;
    if (SR.miss[SR.i] >= 2) { SR.show = 1; SR.fb = `<span class="no">${heard ? '你弹的是 ' + heard + '。' : ''}正确的是 <b>${it.label}</b>（键盘上亮着），弹一下再往下走</span>`; }
    else SR.fb = `<span class="no">${heard ? '你弹的是 ' + heard + '，' : ''}不对。</span>${hintText(SR.lv, it)}`;
    sightPaint();
  }
  async function sightMic() {
    if (!SR) return;
    if (Listen.active()) { Listen.stop(); SR.mic = false; sightPaint(); const b = $('#smic'); if (b) { b.classList.remove('on'); b.textContent = '🎙 在琴上弹（收音）'; } return; }
    A.init();
    try { await Listen.start(A.ctx, sightEvent); SR.mic = true; if (!S.micOK) { S.micOK = 1; save(); } toast('在听了：看到就弹'); }
    catch (e) { SR.mic = false; toast(e && e.name === 'NotAllowedError' ? '没有麦克风权限 · 用屏幕键盘点' : '这里用不了麦克风 · 用屏幕键盘点'); }
    const b = $('#smic'); if (b) { b.classList.toggle('on', !!SR.mic); b.textContent = SR.mic ? '🎙 在听…' : '🎙 在琴上弹（收音）'; }
  }
  function sightEvent(ev) {
    if (!SR || !SR.items || ev.type !== "onset" || route[0] !== "sight") return;
    const it = SR.items[SR.i]; if (!it) return;
    const pcs = [...new Set(it.ms.map(m => m % 12))];
    if (pcs.length === 1) { const pc = Listen.bestNote(ev.chroma); sightJudge(pc === pcs[0], PCN[pc]); return; }
    const sc = Listen.matchChord(ev.chroma, pcs);
    if (sc >= 0.7) sightJudge(true);
    else if (sc < 0.45) { SR.fb = '<span class="no">没听清，再弹一次（几个音一起按下去）</span>'; const f = $('#sfb'); if (f) f.innerHTML = SR.fb; }
  }
  function sightEnd() {
    if (Listen.active()) Listen.stop();
    const { lv, items, miss, time } = SR, n = items.length;
    const first = items.filter((_, i) => !miss[i]).length, acc = first / n;
    const secs = Object.values(time).reduce((a, b) => a + b, 0) || 1, spm = Math.round(n / secs * 60);
    const pct = Math.round(acc * 100), pass = acc >= 0.9 && spm >= lv.spm;
    const old = sightSt(lv.id) || { acc: 0, spm: 0, n: 0 };
    const firstPass = pass && !old.pass;
    const better = pct > old.acc || (pct === old.acc && spm > old.spm);
    S.sight[lv.id] = { acc: better ? pct : old.acc, spm: better ? spm : old.spm, n: (old.n || 0) + 1, pass: old.pass || (pass ? today() : '') };
    logEv('sight', { id: lv.id, acc: pct, spm, m: SR.mic ? 'mic' : 'tap' });
    const g = award(acc, 'sight');
    const weak = items.map((x, i) => ({ x, i, w: (miss[i] || 0) * 10 + (time[i] || 0) })).sort((a, b) => b.w - a.w).filter(o => miss[o.i] || (time[o.i] || 0) > 60 / lv.spm * 1.5).slice(0, 3);
    const idx = Sight.LEVELS.indexOf(lv), nx = Sight.LEVELS[idx + 1];
    const mic = SR.mic; SR = { lv, mic, done: 1 };
    view.innerHTML = `<div class="qbar"><a href="#sight" class="x">×</a><span class="meter"><i style="width:100%"></i></span><small>${n}/${n}</small></div>
      <h2 class="sight-h">${esc(lv.name)}</h2>
      ${gradeHtml(g)}
      <div class="sres"><div><b>${pct}%</b><small>第一次就弹对</small></div><div><b>${spm}</b><small>每分钟${sightUnit(lv)}</small></div></div>
      <p class="${pass ? 'ok' : 'fine'}">${pass ? (firstPass ? `✓ 过关！${nx ? `解锁第 ${nx.n} 关「${esc(nx.name)}」` : '全部 14 关都过了'}` : '✓ 又过了一次') : `还差一点：${acc < 0.9 ? `正确率要 ≥ 90%（现在 ${pct}%）` : ''}${acc < 0.9 && spm < lv.spm ? '，' : ''}${spm < lv.spm ? `速度要每分钟 ≥ ${lv.spm}（现在 ${spm}）` : ''}。${acc < 0.9 ? '先慢一点，读对再弹。' : '已经读得很准了，再熟一点就快了。'}`}</p>
      ${weak.length ? `<p class="fine">多看两眼：${weak.map(o => `<b>${o.x.label}</b>（${miss[o.i] ? '错 ' + Math.ceil(miss[o.i]) + ' 次' : (time[o.i] || 0).toFixed(1) + ' 秒'}）`).join('、')}</p>` : ''}
      <div class="cta"><button class="btn" data-act="sgo">再来一轮</button></div>
      <div class="row">${pass && nx ? `<a class="ghost" href="#sight-${nx.id}">下一关 →</a>` : ''}<a class="ghost" href="#sight">所有关卡</a></div>`;
  }

  // ---------------- 练习时长（只算停留在练习页面、屏幕亮着的时间） ----------------
  const PRACTICE_ROUTES = ['sight', 'arp', 'quiz', 'mem', 'sing', 'acctest', 'sym', 'inv', 'logic', 'unit', 'score', 'song'];
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
  function calHtml(weeks, compact, mark) {
    return Staff.html({ calendar: true, compact: !!compact, weeks: weeks.map(w => w.map(x => ({ ds: x.ds, label: x.label, other: x.other, today: mark ? x.ds === mark : x.today, future: x.future, active: x.active, min: x.min, full: x.full, piece: x.piece }))) });
  }
  // ---------------- 分享：今日卡片（按内容自动排版）/ 这个月的五线谱日历 ----------------
  // 这一天练过哪些和弦：琶音、背谱的曲子、组合和弦、和弦页里弹过的和弦（如实从记录里取）
  function dayChords(ds) {
    const out = [], add = (sym, key, from) => { if (!T.parseChord(sym)) return; const k = sym + '@' + (key || 'C'); if (!out.some(x => x.k === k)) out.push({ k, sym, key: key || 'C', from }); };
    const songs = new Set(), combos = new Set(), arps = new Set();
    (S.log || []).filter(e => e.d === ds).forEach(e => {
      if (e.t === 'arp' && e.s) { arps.add(e.s); add(e.s, 'C', '琶音'); }
      if ((e.t === 'mem' || e.t === 'piece') && e.id) { const sg = allSongs().find(x => x.id === e.id); if (sg) { songs.add(sg.title); [...new Set(songFlat(sg))].slice(0, 10).forEach(x => add(x, sg.key, sg.title)); } }
      if ((e.t === 'combo' || e.t === 'cbq') && e.id) { const cb = COMBOS.find(x => x.id === e.id); if (cb) { combos.add(cb.name); cbChords(cb, cb.minor ? 'Am' : 'C').forEach(x => add(x, cb.minor ? 'Am' : 'C', cb.name)); } }
      if (e.t === 'chord' && e.s) add(e.s, 'C', '和弦页');
    });
    return { chords: out, songs: [...songs], combos: [...combos], arps: [...arps] };
  }
  const FCOL = { T: '#464646', S: '#2f6fdb', D: '#e8541e', N: '#9a9a9a' };
  // 今日卡片：画在 canvas 上，宽 1080，高度按内容自己长
  // 这一天所在的那一周的五线谱日历（这一天标橙）→ 图片
  async function weekImage(ds) {
    const dt = new Date(ds + 'T12:00:00'), box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:360px';
    box.innerHTML = calHtml(calWeeks(dt.getFullYear(), dt.getMonth(), ds), true, ds);
    document.body.appendChild(box);
    try {
      const el = box.querySelector('div.staff'); el.dataset.done = 1; Staff.draw(el);
      const svg = el.querySelector('svg'); if (!svg) return null;
      const vb = svg.viewBox.baseVal, xml = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, '#1a1a1a');
      const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' })), img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      URL.revokeObjectURL(url); return { img, w: vb.width, h: vb.height };
    } catch (e) { return null; } finally { box.remove(); }
  }
  async function dayCardCanvas(ds) {
    const wk = await weekImage(ds);
    const x = dayInfo(ds), dc = dayChords(ds), W = 1080, P = 72;
    const dt = new Date(ds + 'T12:00:00'), title = dt.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
    const cv = document.createElement('canvas'), g = cv.getContext('2d'), F = '-apple-system, "PingFang SC", "Helvetica Neue", sans-serif';
    // 先量一遍高度
    const chipH = 88, gap = 16;
    const layoutChips = (ctx) => { ctx.font = `600 40px ${F}`; let cx = P, cy = 0, rows = 1; dc.chords.forEach(c => { const w = ctx.measureText(D(c.sym)).width + 56; if (cx + w > W - P) { cx = P; cy += chipH + gap; rows++; } c._x = cx; c._y = cy; c._w = w; cx += w + gap; }); return dc.chords.length ? rows * (chipH + gap) : 0; };
    const tmp = document.createElement('canvas').getContext('2d');
    const chipsH = layoutChips(tmp);
    const lines = [dc.songs.length ? '曲子：' + dc.songs.join('、') : '', dc.combos.length ? '组合和弦：' + dc.combos.join('、') : '', dc.arps.length ? '琶音：' + dc.arps.map(D).join(' ') : ''].filter(Boolean);
    const WKH = wk ? Math.round(wk.h * (W - 2 * P) / wk.w) + 70 : 0;
    const H = P + 60 + 90 + 180 + WKH + (chipsH ? 70 + chipsH : 70) + lines.length * 62 + 150 + P;
    cv.width = W; cv.height = H;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#9a9a9a'; g.font = `500 34px ${F}`; g.fillText('ChordMatter · 和弦练习', P, P + 30);
    g.fillStyle = '#1a1a1a'; g.font = `700 72px ${F}`; g.fillText(title, P, P + 130);
    // 数字：分钟 / 步数 / 连续天
    const stats = [[String(x.min || 0), '分钟'], [x.steps + '/4', '今日步数'], [String(streak()), '连续天']];
    stats.forEach(([v, l], i) => { const sx = P + i * 300; g.fillStyle = '#1a1a1a'; g.font = `600 84px ${F}`; g.fillText(v, sx, P + 270); g.fillStyle = '#9a9a9a'; g.font = `400 32px ${F}`; g.fillText(l, sx, P + 318); });
    let y = P + 410;
    // 这一天的音符：所在那一周的五线谱日历，这一天标橙
    if (wk) { g.fillStyle = '#1a1a1a'; g.font = `600 38px ${F}`; g.fillText('这一天的音符', P, y); g.fillStyle = '#9a9a9a'; g.font = `400 28px ${F}`; g.fillText('一天一小节 · 越高练得越久 · 实心 = 4 步都完成', P + 250, y); g.drawImage(wk.img, P, y + 20, W - 2 * P, WKH - 70); y += WKH + 30; }
    g.fillStyle = '#1a1a1a'; g.font = `600 38px ${F}`; g.fillText(dc.chords.length ? `今天练的和弦 · ${dc.chords.length} 个` : '今天还没有练和弦', P, y); y += 40;
    layoutChips(g);
    dc.chords.forEach(c => { const f = chordFunc(c.sym, c.key); g.fillStyle = FCOL[f] || FCOL.N; roundRectPath(g, c._x, y + c._y, c._w, chipH, 22); g.fill(); g.fillStyle = '#fff'; g.font = `600 40px ${F}`; g.fillText(D(c.sym), c._x + 28, y + c._y + 58); });
    y += chipsH + 30;
    g.fillStyle = '#5a5a5a'; g.font = `400 34px ${F}`;
    lines.forEach(l => { let t = l; while (g.measureText(t).width > W - 2 * P && t.length > 4) t = t.slice(0, -2); if (t !== l) t += '…'; g.fillText(t, P, y + 40); y += 62; });
    // 图例 + 页脚
    y += 30; [['稳', 'T'], ['走', 'S'], ['紧', 'D']].forEach(([n, f], i) => { g.fillStyle = FCOL[f]; g.fillRect(P + i * 130, y + 10, 30, 30); g.fillStyle = '#5a5a5a'; g.font = `400 32px ${F}`; g.fillText(n, P + i * 130 + 42, y + 36); });
    g.fillStyle = '#c0c0c0'; g.font = `400 28px ${F}`; g.fillText('颜色 = 和弦的感觉', P + 420, y + 36);
    return cv;
  }
  function roundRectPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // 这个月的五线谱日历 → 图片（把画好的 SVG 原样转成图，再加上标题）
  async function monthCanvas() {
    const svg = document.querySelector('#calmonth svg'); if (!svg) return null;
    const vb = svg.viewBox.baseVal, W = 1080, k = W / vb.width, P = 60, head = 170, H = Math.round(vb.height * k) + head + P + 70;
    const xml = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, '#1a1a1a');
    const img = new Image(); const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const cv = document.createElement('canvas'); cv.width = W + 2 * P; cv.height = H; const g = cv.getContext('2d'), F = '-apple-system, "PingFang SC", sans-serif';
    g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#9a9a9a'; g.font = `500 32px ${F}`; g.fillText('ChordMatter · 练琴日历', P, P + 26);
    g.fillStyle = '#1a1a1a'; g.font = `700 64px ${F}`; g.fillText(`${CAL.y} 年 ${CAL.m + 1} 月`, P, P + 110);
    const days = Object.keys(S.days).filter(d => d.startsWith(`${CAL.y}-${String(CAL.m + 1).padStart(2, '0')}`) && dayInfo(d).active);
    const mins = days.reduce((a, d) => a + dayInfo(d).min, 0);
    g.fillStyle = '#5a5a5a'; g.font = `400 32px ${F}`; g.fillText(`练了 ${days.length} 天 · 共 ${mins} 分钟 · 连续 ${streak()} 天`, P + 420, P + 110);
    g.drawImage(img, P, head, W, vb.height * k);
    g.fillStyle = '#b0b0b0'; g.font = `400 26px ${F}`; g.fillText('一天一小节：音符越高 = 练得越久 · 休止符 = 休息日', P, H - 36);
    URL.revokeObjectURL(url);
    return cv;
  }
  // 预览 + 分享（iPhone 分享面板）/ 保存图片；也可以长按预览图存到相册
  // 深色模式下分享的图也是深色：整张图反色并保持色相（和页面里谱面的做法一样），再把黑白压进 #121212–#f7f7f7
  function darkenCanvas(cv) {
    try {
      const g = cv.getContext('2d'), im = g.getImageData(0, 0, cv.width, cv.height), d = im.data, cl = v => (v < 0 ? 0 : v > 255 ? 255 : v);
      for (let i = 0; i < d.length; i += 4) {
        const r = 255 - d[i], gg = 255 - d[i + 1], b = 255 - d[i + 2];
        const R = -0.574 * r + 1.43 * gg + 0.144 * b, G = 0.426 * r + 0.43 * gg + 0.144 * b, B = 0.426 * r + 1.43 * gg - 0.856 * b;
        d[i] = 18 + cl(R) * 0.9; d[i + 1] = 18 + cl(G) * 0.9; d[i + 2] = 18 + cl(B) * 0.9;
      }
      g.putImageData(im, 0, 0);
    } catch (e) {}
    return cv;
  }
  async function sharePreview(cv, name, title) {
    if (isDarkTheme()) darkenCanvas(cv);
    document.querySelectorAll('.sharepop').forEach(x => x.remove());
    const host = document.getElementById('phone') || document.body, url = cv.toDataURL('image/png');
    const el = document.createElement('div'); el.className = 'sharepop';
    el.innerHTML = `<div class="sharecard"><div class="shead"><b>${title}</b><button class="fsx" data-act="shareclose">×</button></div><img src="${url}" alt="${title}"><p class="fine">也可以长按图片，存到相册。</p><div class="row"><button class="btn" data-act="sharego">分享</button><button class="ghost" data-act="sharesave">保存图片</button></div></div>`;
    host.appendChild(el);
    el.__blob = await new Promise(r => cv.toBlob(r, 'image/png')); el.__name = name;
  }
  async function shareGo(save) {
    const el = document.querySelector('.sharepop'); if (!el || !el.__blob) return;
    const file = new File([el.__blob], el.__name, { type: 'image/png' });
    // 在 Claude 里打开时：网页不能自己下载，要走 Claude 的「保存文件」（iPhone 上会弹出系统分享面板）
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads').catch(() => null) : null;
    if (dl) {
      try { await dl.save({ filename: el.__name, data: el.__blob }); toast(save ? '已保存' : '已交给系统'); }
      catch (e) { const c = e && e.code; if (c === 'declined') return; toast(c === 'rate_limited' ? '上一个保存还没完成，稍等再点' : '这里存不了 · 长按图片保存'); }
      return;
    }
    if (!save) { try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: el.__name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; } toast('这里不能直接分享 · 已改为保存图片'); }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = el.__name; document.body.appendChild(a); a.click(); a.remove();
  }
  function calDetail(ds) {
    const x = dayInfo(ds), el = $('#caldetail'); if (!el) return;
    const dt = new Date(ds + 'T12:00:00');
    const title = dt.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
    if (!x.active) { el.innerHTML = `<b>${title}</b><p class="fine">${ds > today() ? '还没到。' : '休止符：休息日。休息也是练习的一部分。'}</p>`; return; }
    el.innerHTML = `<b>${title}</b> <button class="pill" data-act="shareday" data-v="${ds}">分享这一天</button><p>练习 ${x.min} 分钟 · 今日 ${x.steps}/4 步${x.piece ? ' · 背下了一首曲子' : ''}</p>${x.grades.length ? `<p class="fine">评级：${x.grades.join(' ')}</p>` : ''}${x.cards.length ? `<p class="fine">得到卡：${x.cards.map(id => (cardSong(id) || { title: id }).title).join('、')}</p>` : ''}`;
  }


  // ---------------- 文字里的和弦名：自动加下划线，点开浮窗解释 ----------------
  const CHORD_RE = /(^|[^A-Za-z0-9#♯♭\/])([A-G](?:#|♯|b|♭)?(?:maj7|m7b5|m7♭5|dim7|dim|aug|sus2|sus4|m7|m|7|°|ø)?(?:\/[A-G](?:#|♯|b|♭)?)?)(?![A-Za-z0-9#♯♭])/g;
  const SKIP = 'button, a, svg, input, textarea, select, label, nav, h1, .chain, .hstrip, .cards, .slist, .klpanel, .variant small, .chordref, .kb, .tcard, .symbig, .jp, .grade, .now, .cell, .pc, .opt, .chip, .stat, .qbar, .cxname, .tc-title, .bars, .ring-t, .heat, .jpq, .src, code';
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
  // 谱面（Verovio / VexFlow 画谱）里的变化不算：画一张长谱会连续改很多次，不能因此一直推迟给文字加下划线
  new MutationObserver(ms => { if (ms.every(m => m.target.closest && m.target.closest('.score, .staff, svg'))) return; clearTimeout(linkT); linkT = setTimeout(() => { linkChords(view); linkTerms(view); }, 60); }).observe(view, { childList: true, subtree: true });
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
    ['副属和弦', 'k7'], ['借用和弦', 'k7'], ['和声小调', 'k1'], ['导音', 'k1'], ['属音', 'k1'], ['下属音', 'k1'], ['主音', 'k1'],
    ['大三和弦', 's5'], ['小三和弦', 's6'], ['属七和弦', 's7'], ['大七和弦', 's8'], ['减三和弦', 's9'], ['罗马数字', 's14'],
    ['第一转位', 'i4'], ['第二转位', 'i5'], ['一转', 'i4'], ['二转', 'i5'], ['原位', 'i3'], ['转位', 'i4'],
    ['根音', 'i2'], ['三音', 'i2'], ['五音', 'i2'], ['级数', 's11'], ['伴奏型', 's20'],
    ['稳', 'l2'], ['走', 'l3'], ['紧', 'l4'],
  ];
  const ONECHAR = new Set(['稳', '走', '紧']);
  const glossCard = id => ALLCARDS.find(x => x.id === id) || KNOW.find(x => x.id === id);
  window.__glossOf = id => GLOSS.filter(g => g[1] === id).map(g => g[0]); // 审计用
  // 术语和账本的对应：账本里「熟练」的，正文里不再给下划线；点开解释就退回「见过」，下划线回来
  const TERM_FAM = { '导音': () => ['concept:leading'], '伴奏型': () => Object.keys(S.fam || {}).filter(k => k.startsWith('lh:')) };
  const dstr = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const termDone = t => {
    if (TERM_FAM[t]) { const ids = TERM_FAM[t](); return ids.length > 0 && ids.every(id => famLv(id) >= 3); }
    // 其余术语：对应的课已经学完（做对），而且是以前的日子学的（隔天），近 3 天又没点开过解释
    const g = GLOSS.find(x => x[0] === t); if (!g) return false;
    const sy = S.sym && S.sym[g[1]], rec = S.pk && S.pk['sym:' + g[1]];
    if (!sy || sy === 'skip' || !rec || !/^\d{4}-/.test(rec.a || '') || rec.a >= today()) return false;
    const tap = (S.gt || {})[t]; return !tap || tap < dstr(new Date(Date.now() - 3 * 864e5));
  };
  function linkTerms(root) {
    const own = route[0] === 'sym' ? route[1] : null; // 当前这一课自己的词不再链接
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (!n.nodeValue.trim() || (n.parentElement && n.parentElement.closest(SKIP + ', .termref, h2, .tag, .fx'))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      const txt = n.nodeValue; let i = 0, last = 0, frag = null;
      while (i < txt.length) {
        let hit = null;
        for (const [term, id] of GLOSS) {
          if (!txt.startsWith(term, i) || id === own || termDone(term)) continue;
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
  // 多邻国式小气泡：贴着点的那个词出现，箭头指着它；一句话解释 + 例子（跟着当前曲子的调）+ 听一听 + 去学这一课
  let TP = null;
  function termPlay() {
    if (!TP || !TP.play) return; stopAll(); A.init();
    const p = TP.play, el = document.querySelector('.tpop-play'); let t = 0;
    if (Array.isArray(p)) p.forEach((s, i) => { A.chord(chordMidis(s), i * 0.8, 0.02, 0.9); t = (i + 1) * 0.8; });
    else {
      if (p.chordFirst) { A.chord(chordMidis(p.chordFirst), 0, 0.02, 0.9); t = 1; }
      let prev = 59; p.notes.forEach((n, i) => { let m = 60 + T.parseNote(n).pc; if (p.chordFirst || i) while (m <= prev - 6) m += 12; prev = m; A.note(m, t + i * 0.45, 0.6, 0.6); }); t += p.notes.length * 0.45;
    }
    if (el) { el.classList.add('on'); later(() => el.classList.remove('on'), t * 1000); }
  }
  function termPop(id, word, anchor) {
    document.querySelectorAll('.cpop, .tpop').forEach(x => x.remove());
    const c = glossCard(id); if (!c) return;
    const isKnow = id.startsWith('k'), done = !isKnow && symDone(id);
    const song = ['song', 'mem', 'score'].includes(route[0]) ? allSongs().find(x => x.id === route[1]) : null;
    const d = termDef(word, song && song.key) || { mean: isKnow ? (c.blocks.find(b => b.t === 'p') || {}).x || '' : c.say };
    TP = d;
    const host = document.getElementById('phone') || document.body;
    const el = document.createElement('div'); el.className = 'tpop'; el.dataset.act = 'tpopclose';
    el.innerHTML = `<div class="tpop-card" data-act="tpopstay" role="dialog" aria-label="${esc(word)}"><i class="tpop-arrow"></i>
      <div class="tpop-h"><b>${esc(word)}</b>${d.play ? '<button class="tpop-play" data-act="termplay" aria-label="听一听">▶ 听</button>' : ''}</div>
      <p class="tpop-mean">${d.mean}</p>${d.ex ? `<p class="tpop-ex">${d.ex}</p>` : ''}
      <a class="tpop-link" href="${isKnow ? '#know-' + id : '#sym-' + id}">${isKnow ? '看完整的知识点' : done ? '再看一遍这一课' : '去学这一课'} →</a></div>`;
    host.appendChild(el);
    const card = el.querySelector('.tpop-card'), arrow = el.querySelector('.tpop-arrow');
    const hr = el.getBoundingClientRect(); // 浮层自己的范围 = 屏幕（手机）或手机外框（电脑预览）
    const r = (anchor || document.body).getBoundingClientRect();
    const W = Math.min(320, hr.width - 24); card.style.width = W + 'px';
    const cx = r.left - hr.left + r.width / 2;
    const left = Math.max(12, Math.min(hr.width - W - 12, cx - W / 2));
    const H = card.offsetHeight, below = r.bottom - hr.top + 10, above = r.top - hr.top - 10 - H;
    const up = below + H > hr.height - 70 && above > 10;
    card.style.left = left + 'px'; card.style.top = (up ? above : below) + 'px';
    arrow.style.left = Math.max(14, Math.min(W - 14, cx - left)) + 'px'; card.classList.add(up ? 'up' : 'down');
    if (anchor) anchor.classList.add('on');
    tpopAt = Date.now();
    requestAnimationFrame(() => el.classList.add('open'));
  }
  function tpopClose() { document.querySelectorAll('.tpop').forEach(x => x.remove()); document.querySelectorAll('.termref.on').forEach(x => x.classList.remove('on')); TP = null; }
  let tpopAt = 0;
  (document.getElementById('phone') || window).addEventListener('scroll', () => { if (document.querySelector('.tpop') && Date.now() - tpopAt > 500) tpopClose(); }, { passive: true });

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
    // 任何「播放」都先停掉正在响的（不然两次播放会叠在一起），并把别的「■ 停止」按钮还原
    if (/play$/.test(act) || act === 'prog' || act === 'symdemo') {
      stopAll();
      document.querySelectorAll('[data-act="scstop"],[data-act="sgstop"]').forEach(b => { if (b === el) return; b.dataset.act = b.dataset.act === 'scstop' ? 'scplay' : 'sgplay'; if (b.dataset.lab) b.textContent = b.dataset.lab; });
    }
    A.init();
    switch (act) {
      case 'explain': { if ($('#klpanel')) klShow(+el.dataset.i); playChord(el.dataset.s); const s = allSongs().find(x => x.id === route[1]); const ex = $('#explain'); if (ex) ex.innerHTML = barEvidence(s, +el.dataset.n, el.dataset.s) + chordExplain(el.dataset.s, s && s.key); document.querySelectorAll('.cell').forEach(c => c.classList.toggle('sel', c === el)); break; }
      case 'scmode': SC.section = el.dataset.v === '1'; render(); break;
      case 'sglh': SG.lh = el.dataset.v; render(); break;
      case 'songview': S.songView = el.dataset.v; save(); render(); break;
      case 'songtab': S.songTab = el.dataset.v; save(); render(); break;
      case 'songsec': S.songSec = S.songSec || {}; S.songSec[route[1]] = +el.dataset.v; save(); render(); break;
      case 'barev': { const s = allSongs().find(x => x.id === route[1]); const r = el.getBoundingClientRect(); if (s) barPop(s, +el.dataset.n, r.left + r.width / 2, r.bottom); break; }
      case 'cmpmode': CMP.mode = el.dataset.v; render(); break;
      case 'cmpsec': CMP.sec = +el.dataset.v; render(); break;
      case 'cmpplay': scorePlay(CMP.mode === 'orig' ? null : el.dataset.v === 'orig' ? [0, 1] : CMP.mode === 'practice' ? null : [0, 2]); break;
      case 'lyrsave': S.lyrics = S.lyrics || {}; S.lyrics[route[1]] = $('#lyrtext').value.trim(); save(); render(); toast('歌词已贴到谱上（只存在这台手机）'); break;
      case 'lyrclear': if (S.lyrics) delete S.lyrics[route[1]]; save(); render(); break;
      case 'cbkey': if (/m$/.test(el.dataset.v)) CB.mkey = el.dataset.v; else CB.key = el.dataset.v; CB.q = null; render(); break;
      case 'cbhide': CB.hide = CB.hide === +el.dataset.v ? null : +el.dataset.v; { const y = scrollY; render(); scrollTo(0, y); } break;
      case 'pgto': pagerGo(el.dataset.pg, +el.dataset.v); break;
      case 'cbnext': CB.q = null; { const y = scrollY; render(); scrollTo(0, y); } break;
      case 'cbredo': render(); break;
      case 'cbqplay': case 'cbqyours': { const cb = COMBOS.find(x => x.id === route[1]); const ch = cbChords(cb); if (act === 'cbqyours') ch[CB.q.pos] = CB.q.ans; A.init(); ch.forEach((x, i) => A.chord(chordMidis(x), i * 0.9, 0.01, 1)); break; }
      case 'cbans': { const cb = COMBOS.find(x => x.id === route[1]); const ch = cbChords(cb); CB.q.ans = el.dataset.v; const ok = CB.q.ans === ch[CB.q.pos]; S.combo = S.combo || {}; const r = (S.combo[cb.id] = S.combo[cb.id] || { n: 0, r: 0 }); r.n++; if (ok) r.r++; logEv('cbq', { id: cb.id, ok: ok ? 1 : 0, pick: CB.q.ans }); save(); { const y = scrollY; render(); scrollTo(0, y); } break; }
      case 'playfrom': playBars(+el.dataset.n, null); toast('从第 ' + el.dataset.n + ' 小节播放到结尾'); break;
      case 'selplay': playBars(Math.min(SELB.a, SELB.b), Math.max(SELB.a, SELB.b)); break;
      case 'selclear': SELB.on = false; selPaint(); stopAll(); dockReset(); break;
      case 'info': { const sg = allSongs().find(x => x.id === route[1]); if (!sg) break; const [t, h] = songInfo(sg, el.dataset.k); infoPop(el, t, h); break; }
      case 'mytoggle': S.myOpen = !S.myOpen; save(); { const b = document.querySelector('.mybox'); if (b) b.hidden = !S.myOpen; } el.textContent = '我的原谱 ' + (S.myOpen ? '⌃' : '⌄'); break;
      case 'lvset': S.lv = S.lv || {}; S.lv[el.dataset.k] = el.dataset.v; save(); render(); break;
      case 'theme': S.theme = el.dataset.v; save(); cxGlobalDark(); vSet(); break;
      case 'colormode': S.colorMode = el.dataset.v; save(); render(); break;
      case 'gridmode': { S.gridMode = el.dataset.v; save(); const g = document.getElementById('grid'); if (g) g.dataset.mode = S.gridMode; document.querySelectorAll('.gmode button').forEach(x => x.classList.toggle('on', x.dataset.v === S.gridMode)); break; }
      case 'sfilter': S.songFilter = el.dataset.v; save(); render(); break;
      case 'afilter': S.accFilter = el.dataset.v; save(); render(); break;
      case 'tagedit': e.preventDefault(); e.stopPropagation(); tagPop(el, el.dataset.id); break;
      case 'tagtog': { const id = el.dataset.id, sg = allSongs().find(x => x.id === id); S.tags = S.tags || {}; let t = (S.tags[id] || autoTags(sg)).slice(); const v = el.dataset.v; if (el.dataset.type) t = t.filter(x => !TYPES.includes(x)).concat([v]); else t = t.includes(v) ? t.filter(x => x !== v) : t.concat([v]); S.tags[id] = t; save(); render(); tagPop(document.querySelector('.tagbtn[data-id="' + id + '"]') || document.body, id); break; }
      case 'tagadd': { const v = ($('#newtag').value || '').trim().slice(0, 8); if (!v) break; const id = el.dataset.id, sg = allSongs().find(x => x.id === id); S.tags = S.tags || {}; const t = (S.tags[id] || autoTags(sg)).slice(); if (!t.includes(v)) t.push(v); S.tags[id] = t; save(); render(); tagPop(document.querySelector('.tagbtn[data-id="' + id + '"]') || document.body, id); break; }
      case 'tagreset': e.preventDefault(); if (S.tags) delete S.tags[el.dataset.id]; save(); render(); document.querySelectorAll('.tpop').forEach(x => x.remove()); break;
      case 'klstep': { const s = allSongs().find(x => x.id === route[1]); klShow(KL.i + +el.dataset.v); playChord(songFlat(s)[KL.i]); break; }
      case 'klset': { const cfg = klCfg(), k = el.dataset.k, v = el.dataset.v; if (k === 'label') cfg.label = v; else if (k === 'show') cfg.show[v] = cfg.show[v] ? 0 : 1; else cfg[k] = !cfg[k]; save(); klShow(KL.i); if (k === 'feel') { const sg = allSongs().find(x => x.id === route[1]); document.querySelectorAll('#grid .cell').forEach(cl => { const old = cl.querySelector('.cshape'); if (old) old.outerHTML = chordShape(cl.dataset.s, sg.key); }); } break; }
      case 'shareday': dayCardCanvas(el.dataset.v).then(cv => sharePreview(cv, 'ChordMatter-' + el.dataset.v + '.png', '今日卡片')).catch(() => toast('生成图片失败')); break;
      case 'sharemonth': monthCanvas().then(cv => cv ? sharePreview(cv, `ChordMatter-${CAL.y}-${CAL.m + 1}.png`, '这个月的练琴日历') : toast('日历还没画好')).catch(() => toast('生成图片失败')); break;
      case 'sharego': shareGo(false); break;
      case 'sharesave': shareGo(true); break;
      case 'shareclose': document.querySelectorAll('.sharepop').forEach(x => x.remove()); break;
      case 'dockplay': dockPlay(); break;
      case 'rlkb': RL.kb = !RL.kb; S.rlkb = RL.kb; save(); Roll.stop(); drillStop();
        if (RL.kb && RL.mode === 'play') RL.mode = 'wait';
        // 能锁横屏的（安卓 Chrome 全屏时）就锁；iPhone 不支持，就把画面转 90° 显示
        if (RL.kb && !isLand()) { try { const d = document.documentElement; (d.requestFullscreen ? d.requestFullscreen() : Promise.reject()).then(() => screen.orientation.lock('landscape')).then(() => setTimeout(rollOpen, 300)).catch(() => {}); } catch (e) {} }
        rollOpen(); break;
      case 'rlpp': { const r = Roll.get(); if (!r) break;
        if (r.running) { Roll.pause(); A.cut(); el.textContent = '▶'; }
        else if (r.paused) { A.init(); Roll.resume(A); el.textContent = '⏸'; }
        else { rollGo(); el.textContent = '⏸'; }
        break; }
      case 'rlpanel': RL.nopanel = !RL.nopanel; Roll.stop(); drillStop(); rollOpen(); break;
      case 'rlkbsize': RL.kbReal = el.dataset.v === '1'; S.rlkbReal = RL.kbReal; save(); Roll.stop(); drillStop(); rollOpen(); break;
      case 'rlmode': RL.mode = el.dataset.v; Roll.stop(); drillStop(); if (document.querySelector('.rollfs')) rollOpen(); else render(); break;
      case 'rllvl': if (el.dataset.locked) { toast('先在「中等」用「等你弹」一遍弹对，困难才解锁'); break; } RL.lvl = +el.dataset.v; Roll.stop(); drillStop(); if (document.querySelector('.rollfs')) rollOpen(); else render(); break;
      case 'rollopen': rollOpen(el.dataset.k); break;
      case 'rollprog': RL.prog = { key: el.dataset.k, chords: el.dataset.c.split(','), title: el.dataset.t }; rollOpen('prog'); break;
      case 'rollclose': rollClose(); break;
      case 'rlgo': {
        // 横屏全屏里点开始：左边选项自动收起，整个屏幕给彩条和键盘（左上角「选项 ›」可以再打开）
        const ov = document.querySelector('.rollfs');
        if (ov && !RL.nopanel && (isLand() || ov.classList.contains('rot'))) { RL.nopanel = true; RL.autoHid = true; rollOpen(); setTimeout(rollGo, 60); break; }
        rollGo(); break; }
      case 'rlstop': stopAll(); Roll.stop(); drillStop(); break;
      case 'rlrate': RL.rate = Math.max(0.4, Math.min(1.6, +(RL.rate + +el.dataset.v).toFixed(2))); $('#rlrate').textContent = Math.round(RL.rate * 100) + '%'; break;
      case 'hstrip': { const s = allSongs().find(x => x.id === route[1]); const r = el.getBoundingClientRect(); if (s) barPop(s, +el.dataset.n, r.left + r.width / 2, r.bottom); break; }
      case 'hgo': { const s = allSongs().find(x => x.id === route[1]); const n = +el.dataset.n, st = sectionStarts(s); const k = st.findIndex((x, i) => n >= x && n < x + parseBars(s.sections[i].bars).length); S.songSec = S.songSec || {}; S.songSec[s.id] = k; S.songTab = 'sheet'; save(); render(); break; }
      case 'sgview': SG.view = el.dataset.v; render(); break;
      case 'sgtab': SG.tab = el.dataset.v; stopAll(); render(); break;
      case 'dockstop': stopAll(); dockReset(); document.querySelectorAll('text.chordlab.now').forEach(t => t.classList.remove('now')); document.querySelectorAll('#grid .cell.on-play, .hstrip .hbar.on-play').forEach(x => x.classList.remove('on-play')); break;
      case 'labtog': S.lab = !labOn(); save(); document.body.classList.toggle('nolab', !labOn()); el.classList.toggle('on', labOn()); document.querySelectorAll('.sheet div.staff').forEach(x => { const cfg = JSON.parse(x.dataset.staff); cfg.hideName = !labOn(); cfg.numerals = labOn(); x.dataset.staff = JSON.stringify(cfg); try { Staff.draw(x); } catch (e) {} }); /* 原地重画，不跳回页面顶部 */ toast(labOn() ? '和声标注：开' : '和声标注：关（纯谱面）'); break;
      case 'scrange': SC.range = el.dataset.v; render(); break;
      case 'scplay': scorePlay(); el.dataset.lab = el.textContent; el.textContent = '■ 停止'; el.dataset.act = 'scstop'; break;
      case 'scstop': stopAll(); el.textContent = el.dataset.lab || '▶ 播放'; el.dataset.act = 'scplay'; break;
      case 'screte': SC.rate = Math.max(0.5, Math.min(1.3, Math.round((SC.rate + +el.dataset.v) * 10) / 10)); render(); break;
      case 'pro': S.pro = el.dataset.v === '1'; save(); render(); break;
      case 'altap': alTap(); break;
      case 'alstop': alStop(); render(); break;
      case 'alsec': alStop(); AL.sec = +el.dataset.v; render(); break;
      case 'alsound': AL.sound = !AL.sound; el.classList.toggle('on', AL.sound); el.textContent = 'App 也轻声弹和弦：' + (AL.sound ? '开' : '关'); break;
      case 'symskip': {
        const id = el.dataset.id; S.sym = S.sym || {}; S.sym[id] = 'skip'; S.skip = S.skip || {}; S.skip[id] = today(); logEv('skip', { id }); save();
        const c = ALLCARDS.find(x => x.id === id), nx = symNext(courseOf(c)) || nextAny();
        toast('已跳过「' + c.title + '」· 记为「跳过」，不算学会，随时可以回来学');
        go(SY && SY.fromToday ? stepHref('learn') : nx ? '#sym-' + nx.id : '#' + courseOf(c)); break;
      }
      case 'unitskip': {
        const u = unitState(el.dataset.u); u.done = true; u.skipped = today(); logEv('skip', { id: el.dataset.u }); save();
        toast('已跳过这个单元 · 下一单元已解锁；它仍会出现在每日复习里'); go('#path'); break;
      }
      case 'brq': BR.q = el.dataset.v; go('#browse'); render(); break;
      case 'place': S.place = el.dataset.v; save(); render(); break;
      case 'cbview': S.cbView = el.dataset.v; save(); render(); break;
      case 'perrow': S.perRow = +el.dataset.v; window.HX_PERROW = S.perRow; save(); render(); break;
      case 'placetoggle': S.place = place() === 'piano' ? 'away' : 'piano'; save(); render(); toast(place() === 'piano' ? '有钢琴：收音听你弹，记为「琴上弹过」' : '没钢琴：在屏幕上点，记为「已学 · 未上琴」'); break;
      case 'key': if (['sym', 'inv', 'logic'].includes(route[0])) symTap(+el.dataset.m); else if (route[0] === 'sight' && route[1] === 'piece') bdTap(+el.dataset.m); else if (route[0] === 'sight' && route[1] === 'react') nrAnswer(+el.dataset.m); else if (route[0] === 'sight') sightTap(+el.dataset.m); else drillTapKey(+el.dataset.m); break;
      case 'symdemo': symDemo(SY.card); break;
      case 'sympick': { if (!SY || SY.locked) break; const r = SY.reps[SY.i]; const ok = el.dataset.v === r.answer; document.querySelectorAll('#symtask .opt').forEach(b => { if (b.dataset.v === r.answer) b.classList.add('right'); else if (b === el) b.classList.add('wrong'); b.disabled = true; }); symJudge(ok); break; }
      case 'symplay': symPlay(SY.reps[SY.i]); break;
      case 'symnext': symAdvance(); break;
      case 'dlisten': drillListen(); break;
      case 'dstop': drillStop(); DR && (DR.mode = 'self'); $('#dctl') && ($('#dctl').innerHTML = drillControls()); break;
      case 'mhint': { if (!DR) break; DR.hinted = true; const t = DR.targets[DR.i]; if (t) { const ex = $('#explain'); if (ex) ex.innerHTML = '提示：' + chordExplain(t.label, (allSongs().find(x => x.id === route[1]) || {}).key); playChord(t.label); } break; }
      case 'mredo': render(); break;
      case 'sgpat': { SG.pat[route[1]] = el.dataset.v; vSing(); const song = SING.find(x => x.id === route[1]); const pat = PATTERNS[song.beats].find(p => p.id === el.dataset.v); playPattern(songTimeline(song).slots[0].sym, pat, song.beats, song.bpm * SG.rate); break; }
      case 'sgplay': singPlay(SING.find(s => s.id === el.dataset.id)); el.dataset.lab = el.textContent; el.textContent = '■ 停止'; el.dataset.act = 'sgstop'; break;
      case 'sgstop': stopAll(); vSing(); break;
      case 'patplay': { const song = SING.find(x => x.id === el.dataset.id); const pats = PATTERNS[song.beats]; const pat = pats.find(p => p.id === SG.pat[song.id]) || pats[1]; playPattern(songTimeline(song).slots[0].sym, pat, song.beats, song.bpm * SG.rate); break; }
      case 'sgtog': SG[el.dataset.k] = !SG[el.dataset.k]; vSing(); break;
      case 'sgrate': SG.rate = Math.max(0.5, Math.min(1.5, Math.round((SG.rate + +el.dataset.v) * 10) / 10)); vSing(); break;
      case 'atpick': AT.pick[+el.dataset.i] = el.dataset.v; renderAccTest(); A.init(); playChord(el.dataset.v); break;
      case 'atsubmit': accTestSubmit(); break;
      case 'atmel': accTestPlay(false); break;
      case 'atplay': accTestPlay(true); break;
      case 'play': if (route[0] === 'chords' && el.dataset.s) { const L = S.log || []; if (!L.some(e => e.d === today() && e.t === 'chord' && e.s === el.dataset.s)) logEv('chord', { s: el.dataset.s }); } playChord(el.dataset.s, !!el.dataset.arp); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 300); break;
      case 'prog': playProg(el, el.dataset.k, el.dataset.c.split(','), 84, 2); break;
      case 'flow': nextStep(); break;
      case 'chordpop': e.preventDefault(); chordPop(el.dataset.s); break;
      case 'termpop': e.preventDefault(); if (TERM_FAM[el.textContent]) TERM_FAM[el.textContent]().forEach(id => famSee(id)); S.gt = S.gt || {}; S.gt[el.textContent] = today(); save(); termPop(el.dataset.id, el.textContent, el); break;
      case 'termplay': termPlay(); break;
      case 'tpopclose': tpopClose(); break;
      case 'tpopstay': break;
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
      case 'libroot': CX.root = el.dataset.v; vLib(); playChord(CX.root); break;
      case 'cx': CX[el.dataset.k] = el.dataset.k === 'inv' ? +el.dataset.v : el.dataset.v; if (el.dataset.k === 'q') CX.inv = 0; vChords(); if (el.dataset.k !== 'hand') playChord(T.build(CX.root, CX.q, CX.inv).sym); break;
      case 'ahand': ARP.hand = el.dataset.v; vArp(); break;
      case 'bpm': { const sym = route[1]; const st = S.arp[sym]; st.bpm = Math.max(40, Math.min(160, st.bpm + +el.dataset.v)); save(); $('#bpm').textContent = st.bpm; if (metro) startMetro(st.bpm); break; }
      case 'ademo': arpDemo(el.dataset.s); break;
      case 'ametro': { if (metro) { stopMetro(); el.classList.remove('on'); } else { startMetro(S.arp[route[1]].bpm); el.classList.add('on'); } break; }
      case 'splay': { const sg = allSongs().find(x => x.id === el.dataset.id); playChords(sg, songRange(sg)); const bt = document.querySelector('.dock .play'); if (bt) { bt.textContent = '■ 停止'; bt.dataset.act = 'dockstop'; } break; }
      case 'sdel': S.custom = S.custom.filter(c => c.id !== el.dataset.id); save(); try { indexedDB.open('hexian-scores', 1).onsuccess = e => { const d = e.target.result; if (d.objectStoreNames.contains('pages')) d.transaction('pages', 'readwrite').objectStore('pages').delete(el.dataset.id); }; } catch (err) {} go('#songs'); break;
      case 'export': exportBackup(); break;
      case 'sgo': sightGo(); break;
      case 'spgrade': S.sightGrade = +el.dataset.v; save(); vSight(); break;
      case 'spready': if (SP) { clearInterval(SP.timer); SP.phase = 'q'; spPanel(); } break;
      case 'spans': spAnswer(+el.dataset.v); break;
      case 'spnextq': if (SP) { SP.answered = 0; SP.qi++; if (SP.qi >= SP.qs.length) SP.phase = 'ready'; spPanel(); } break;
      case 'sprate': S.sightRate = +el.dataset.v; save(); spPanel(); break;
      case 'spgo': spGo(el.dataset.v); break;
      case 'spstop': spStop(); if (SP) { SP.phase = SP.res ? 'done' : 'ready'; spPanel(); const c = $('#spcur'); if (c) c.hidden = true; } break;
      case 'spnew': sightPiece(true); break;
      case 'spprev': S.sightPrev = +el.dataset.v; save(); vSight(); break;
      case 'spmark': { const i = +el.dataset.v, x = SP.mk[i]; if (!x) break; if (SP.openIdx === i) SP.openIdx = -1; else { SP.openIdx = i; if (!SP.autoShown || SP.autoShown !== x.id) { SP.opened.add(x.id); famSee(x.id, x.label, x.long); if (HIDE_MK[x.id]) spRedraw(SP.bd ? SP.bd.names : []); } } spMeta(); break; }
      case 'spmarkall': SP.showAll = !SP.showAll; spMeta(); break;
      case 'famshow': { const x = el.nextElementSibling; if (x && x.classList.contains('famx')) x.hidden = !x.hidden; break; }
      case 'bdstart': bdStart(); break;
      case 'bdplay': bdPlay(); break;
      case 'bdnames': bdNames(); break;
      case 'bdskip': bdAdvance(+el.dataset.v); break;
      case 'bdmic': bdMic(); break;
      case 'bdexit': if (Listen.active()) Listen.stop(); SP.phase = SP.res ? 'done' : 'ready'; SP.bd = null; spRedraw([]); spPanel(); break;
      case 'nrset': { const c = nrCfg(); c[el.dataset.k] = el.dataset.v; S.nrCfg = c; save(); nrIntro(); break; }
      case 'nrgo': nrGo(); break;
      case 'nrintro': e.preventDefault(); nrIntro(); break;
      case 'nrname': nrAnswer(el.dataset.v); break;
      case 'sagain': vSight(); break;
      case 'smarks': { const lv = Sight.LEVELS.find(x => x.id === route[1]); if (!lv) break; A.init(); lv.marks.forEach((m, i) => A.note(m, i * 0.7, 1, 0.65)); break; }
      case 'shint': sightHint(); break;
      case 'smic': sightMic(); break;
      case 'slock': toast('先过上一关：正确率 ≥ 90%，速度达到要求'); break;
      case 'scanmode': aiSet({ mode: el.dataset.v }); vScan(); break;
      case 'aikeyset': { const v = (($('#aikey') || {}).value || '').trim(); if (!/^sk-ant-/.test(v)) { toast('Key 应该以 sk-ant- 开头'); break; } aiSet({ key: v }); vScan(); toast('已保存，只存在这台手机'); break; }
      case 'aikeyoff': if (confirm('删除这台手机上保存的 API Key？')) { aiSet({ key: '' }); vScan(); } break;
      case 'cloudconnect': { const v = ($('#cloudtoken') || {}).value; if (!v) { toast('先粘贴令牌'); break; } el.disabled = true; el.textContent = '连接中…'; cloudConnect(v).then(r => { toast(r === 'new' ? '已连接 · 在你的 GitHub 里新建了私密存档' : r === 'pulled' ? '已连接 · 已接上云端的记录' : '已连接 · 已同步'); cloudPaint(); storInfo(); }).catch(e => { CL.msg = e.status === 401 ? '令牌不对：确认复制完整，并且勾了 gist' : '连不上 GitHub，检查一下网络'; cloudPaint(); }); break; }
      case 'cloudsync': cloudPull(true); cloudPaint(); break;
      case 'cloudoff': if (confirm('断开后这台设备不再同步（本机和云端的记录都还在）。确定？')) { cloudSet(null); CL.msg = ''; cloudPaint(); storInfo(); } break;
      case 'import': { const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json'; i.onchange = () => { const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (!o || typeof o !== 'object' || !('xp' in o)) throw 0; S = migrate(o); save(); toast('已导入备份'); render(); } catch (err) { toast('这不是 ChordMatter 的备份文件'); } }; r.readAsText(i.files[0]); }; i.click(); break; }
      case 'reset': if (el.dataset.armed) { S = JSON.parse(JSON.stringify(DEF)); save(); render(); toast('已清空'); } else { el.dataset.armed = 1; el.textContent = '再点一次确认清空'; } break;
    }
  });

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') A.stale = true; });
  window.addEventListener('pagehide', () => { A.stale = true; });
  window.addEventListener('pageshow', e => { if (e.persisted) A.stale = true; });
  // iPhone 要在手指抬起 / 点击这类动作里才允许出声：每次触摸都顺手把声音通道叫醒（并放一个无声小片段），按住拖选这类自定义手势也不会没声音
  ['touchstart', 'touchend', 'pointerup', 'click'].forEach(t => document.addEventListener(t, () => {
    try { A.init(); const c = A.ctx; if (c) { const b = c.createBuffer(1, 1, 22050), n = c.createBufferSource(); n.buffer = b; n.connect(c.destination); n.start(0); } } catch (e) {}
  }, { capture: true, passive: true }));
  // 自动换新版：每次回到 App（或打开后几秒），去看服务器上的版本号；比手机上的新，就自动刷新一次，不用再手动关掉 App
  (function () {
    if ('HX_PRESEED' in window || !/^https?:/.test(location.protocol)) return;
    let busy = false;
    async function check() {
      if (busy) return; busy = true;
      try {
        const r = await fetch('app.js?v=' + Date.now(), { cache: 'no-store' }); const t = await r.text(), m = /APPV = (\d+)/.exec(t);
        if (m && +m[1] > APPV) { if (document.body.classList.contains('focus')) { toast('有新版本，做完这一轮会自动更新'); busy = false; return; } sessionStorage.setItem('hx.upd', String(m[1])); location.reload(); return; }
      } catch (e) {}
      busy = false;
    }
    setTimeout(check, 4000);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
  })();
  window.addEventListener('hashchange', render);
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', () => { cxGlobalDark(); render(); });
  document.addEventListener('pointerdown', e => { window.__lastClick = [e.clientX, e.clientY]; }, true);
  document.addEventListener('staffplay', e => { A.init(); const ms = e.detail || []; if (ms.length === 1) A.note(ms[0], 0, 1.4, 0.7); else A.chord(ms, 0, 0.02, 1.4); });
  document.addEventListener('calpick', e => { calDetail(e.detail); });
  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  window.__hexian = { T, GEN, S: () => S, A, SY: () => SY };
})();
