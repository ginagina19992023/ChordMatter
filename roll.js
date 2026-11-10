// 瀑布流：音符变成彩条落到键盘上（颜色 = 和弦的感觉：稳 深灰 / 走 蓝 / 紧 橙；右手实色、左手浅色）
// events: [{ t, d, midi, hand: 'L'|'R' }]（单位：拍）；chords: [{ t, d, sym, label, func: 'T'|'S'|'D' }]
// 「等你弹」：每个和弦落到键盘时停住，直到 release() 被调用（外面用收音 / 屏幕键盘判定弹对了）
const Roll = (() => {
  const COL = { T: [70, 70, 70], S: [47, 111, 219], D: [232, 84, 30], N: [150, 150, 150] };
  const BLACK = [1, 3, 6, 8, 10];
  const isBlack = m => BLACK.includes(((m % 12) + 12) % 12);
  let cur = null;
  // real：按真钢琴的比例（黑键宽 ≈ 白键的 0.58，C♯D♯ 往两边分、F♯G♯A♯ 三个也错开）
  const BC = { 1: 0.9, 3: 2.1, 6: 3.88, 8: 5.0, 10: 6.12 }, WI = { 0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6 };
  function keyGeom(lo, hi, W, real) {
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = W / whites.length, pos = {};
    whites.forEach((m, i) => (pos[m] = { x: i * ww, w: ww, black: false }));
    for (let m = lo; m <= hi; m++) if (isBlack(m) && pos[m - 1]) {
      if (real) { const pc = ((m % 12) + 12) % 12, c0 = pos[m - 1].x - WI[pc - 1] * ww, bw = ww * 0.58; pos[m] = { x: c0 + BC[pc] * ww - bw / 2, w: bw, black: true }; }
      else pos[m] = { x: pos[m - 1].x + ww * 0.66, w: ww * 0.62, black: true };
    }
    return { pos, ww };
  }
  function funcAt(chords, t) { const c = chords.find(c => t >= c.t - 1e-6 && t < c.t + c.d - 1e-6); return c ? c.func || 'N' : 'N'; }
  function mount(el, opt) {
    stop();
    const ms = opt.events.map(e => e.midi);
    let lo = Math.min(...ms) - 2, hi = Math.max(...ms) + 2;
    while (isBlack(lo)) lo--; while (isBlack(hi)) hi++;
    if (opt.lo != null) { lo = opt.lo; hi = opt.hi; }
    else if (hi - lo < 24) { lo = Math.max(21, lo - Math.ceil((24 - (hi - lo)) / 2)); hi = lo + 24; while (isBlack(hi)) hi++; while (isBlack(lo)) lo--; }
    el.innerHTML = '<canvas class="rollcv"></canvas>';
    const cv = el.querySelector('canvas'), dpr = window.devicePixelRatio || 1;
    const W = el.clientWidth || 340, H = opt.height || 380;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const total = Math.max(...opt.events.map(e => e.t + e.d), ...(opt.chords || []).map(c => c.t + c.d));
    // keyW：每个白键固定宽度（真实大小），键盘比屏幕宽时跟着当前和弦左右滑
    let nW = 0; for (let m = lo; m <= hi; m++) if (!isBlack(m)) nW++;
    const GW = opt.keyW ? Math.max(W, nW * opt.keyW) : W;
    cur = { el, cv, g, W, H, lo, hi, GW, sx: 0, geo: keyGeom(lo, hi, GW, opt.real), opt, chords: opt.chords || [], beat: -opt.lead || -2, total, raf: 0, waitIdx: 0, released: 0, tapped: new Set() };
    cur.keyH = opt.keyFrac ? Math.round(H * opt.keyFrac) : Math.min(70, H * 0.2); cur.hitY = H - cur.keyH; cur.ppb = opt.ppb || 46;
    cur.sx = scrollTarget(); draw();
    // 多指同时按（和弦）：每根手指单独记，抬起才松开；rot = 画面被转了 90° 显示（竖着拿手机时模拟横屏）
    const down = new Map();
    const keyAt = e => {
      const r = cv.getBoundingClientRect();
      const x = (opt.rot ? e.clientY - r.top : e.clientX - r.left) + cur.sx, y = opt.rot ? r.right - e.clientX : e.clientY - r.top;
      // 用手机弹：键盘上方整条键道也算这个键（手指往前伸一点照样按得到）；彩条落在哪条道，按那条道就行
      if (y < cur.hitY && !opt.real) return null;
      const blackHit = y < cur.hitY + cur.keyH * 0.63;
      let m = null;
      if (blackHit) for (const [k, p] of Object.entries(cur.geo.pos)) if (p.black && x >= p.x && x < p.x + p.w) m = +k;
      if (m == null) for (const [k, p] of Object.entries(cur.geo.pos)) if (!p.black && x >= p.x && x < p.x + p.w) m = +k;
      return m;
    };
    cv.style.touchAction = 'none';
    cv.onpointerdown = e => {
      const m = keyAt(e); if (m == null) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      down.set(e.pointerId, m); cur.tapped.add(m); (cur.flashT = cur.flashT || {})[m] = performance.now(); draw();
      if (opt.onKey) opt.onKey(m);
    };
    const up = e => { const m = down.get(e.pointerId); if (m == null) return; down.delete(e.pointerId); if (![...down.values()].includes(m)) cur.tapped.delete(m); draw(); };
    cv.onpointerup = up; cv.onpointercancel = up;
    return cur;
  }
  function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  // 当前（或下一个）和弦的音放在屏幕中间
  function scrollTarget() {
    if (!cur || cur.GW <= cur.W) return 0;
    const c = cur.chords.find(c => c.t + c.d > cur.beat + 1e-6) || cur.chords[cur.chords.length - 1];
    const xs = cur.opt.events.filter(e => c ? e.t >= c.t - 1e-6 && e.t < c.t + c.d - 1e-6 : true).map(e => cur.geo.pos[e.midi]).filter(Boolean);
    if (!xs.length) return cur.sx;
    const a = Math.min(...xs.map(p => p.x)), b = Math.max(...xs.map(p => p.x + p.w));
    return Math.max(0, Math.min(cur.GW - cur.W, (a + b) / 2 - cur.W / 2));
  }
  function draw() {
    if (!cur) return;
    if (cur.GW > cur.W) { const t = scrollTarget(); cur.sx += Math.abs(t - cur.sx) < 0.5 ? t - cur.sx : (t - cur.sx) * 0.12; }
    const { g, W, H, hitY, ppb, geo, beat, chords, opt } = cur;
    g.clearRect(0, 0, W, H);
    const DK = document.body.classList.contains('dark'), INK = DK ? '255,245,235' : '0,0,0';
    g.fillStyle = DK ? '#181412' : '#fbfbfa'; g.fillRect(0, 0, W, hitY);
    // 竖直的键道（黑键位置浅灰）
    g.save(); g.translate(-cur.sx, 0);
    for (const [m, p] of Object.entries(geo.pos)) if (p.black) { g.fillStyle = 'rgba(' + INK + ',0.035)'; g.fillRect(p.x, 0, p.w, hitY); }
    g.restore();
    const yOf = t => hitY - (t - beat) * ppb;
    // 小节线 + 和弦标签
    const beats = opt.beats || 4;
    for (let b = Math.ceil(beat / beats) * beats; yOf(b) > -20; b += beats) {
      const y = yOf(b); if (y > hitY) continue;
      g.strokeStyle = 'rgba(' + INK + ',0.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      if (opt.barNo) { g.fillStyle = 'rgba(' + INK + ',0.45)'; g.font = '10px -apple-system, sans-serif'; g.fillText(String(opt.barNo(b)), 3, y - 3); }
    }
    chords.forEach(c => {
      const y0 = yOf(c.t), y1 = yOf(c.t + c.d); if (y1 > hitY || y0 < -40) return;
      const col = COL[c.func] || COL.N;
      g.fillStyle = rgba(col, 0.07); g.fillRect(0, Math.max(0, y1), W, Math.min(hitY, y0) - Math.max(0, y1));
      g.fillStyle = rgba(col, 1); g.font = '600 13px -apple-system, sans-serif';
      const ly = Math.min(hitY - 4, y0 - 4); if (ly > 12) g.fillText(c.label, W - g.measureText(c.label).width - 6, ly);
    });
    // 彩条
    g.save(); g.translate(-cur.sx, 0);
    opt.events.forEach(e => {
      const y0 = yOf(e.t), y1 = yOf(e.t + e.d); if (y1 > hitY || y0 < 0) return;
      const p = geo.pos[e.midi]; if (!p) return;
      const col = COL[funcAt(chords, e.t)] || COL.N, a = e.hand === 'L' ? 0.5 : 0.95;
      const x = p.x + 1, w = p.w - 2, top = Math.max(0, y1), bot = Math.min(hitY, y0) - 1;
      g.fillStyle = rgba(col, a); roundRect(g, x, top, w, Math.max(3, bot - top), Math.min(5, w / 2)); g.fill();
    });
    g.restore();
    // 手指按过的键：整条键道亮一下（告诉你「按这条道上任何位置都算」）
    if (opt.real) { g.save(); g.translate(-cur.sx, 0); const nowT = performance.now(), hot = new Set(cur.tapped); Object.keys(cur.flashT || {}).forEach(k => { if (nowT - cur.flashT[k] < 450) hot.add(+k); }); hot.forEach(m => { const p = geo.pos[m]; if (!p) return; const gr = g.createLinearGradient(0, 0, 0, hitY); gr.addColorStop(0, 'rgba(' + (DK ? '255,200,140' : '232,84,30') + ',0)'); gr.addColorStop(1, 'rgba(' + (DK ? '255,200,140' : '232,84,30') + ',0.28)'); g.fillStyle = gr; g.fillRect(p.x, 0, p.w, hitY); }); g.restore(); }
    // 判定线
    g.fillStyle = 'rgba(' + INK + ',0.6)'; g.fillRect(0, hitY - 1, W, 2);
    // 键盘：正在响的键按颜色亮
    const on = {};
    opt.events.forEach(e => { if (beat >= e.t - 1e-3 && beat < e.t + e.d) on[e.midi] = { col: COL[funcAt(chords, e.t)] || COL.N, hand: e.hand }; });
    if (cur.waiting) cur.waiting.forEach(m => (on[m] = on[m] || { col: COL[funcAt(chords, beat)] || COL.N, hand: 'R', wait: 1 }));
    const kh = cur.keyH;
    g.save(); g.translate(-cur.sx, 0);
    for (const [m, p] of Object.entries(geo.pos)) if (!p.black) {
      const o = on[m], t = cur.tapped.has(+m);
      g.fillStyle = o ? rgba(o.col, o.wait ? 0.45 : 0.85) : t ? (DK ? '#b9b0a6' : '#e9e9e9') : (DK ? '#efe6dc' : '#fff'); g.fillRect(p.x, hitY + 1, p.w - 1, kh - 1);
      g.strokeStyle = DK ? '#2a2420' : '#cfcfcf'; g.strokeRect(p.x + 0.5, hitY + 1.5, p.w - 1, kh - 2);
      if (opt.real) { const nm = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'][+m % 12] + (+m % 12 === 0 ? Math.floor(+m / 12) - 1 : ''); g.fillStyle = 'rgba(0,0,0,0.38)'; g.font = '12px -apple-system, sans-serif'; g.fillText(nm, p.x + p.w / 2 - g.measureText(nm).width / 2, hitY + kh - 8); }
      else if (+m % 12 === 0) { g.fillStyle = DK ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.4)'; g.font = '9px -apple-system, sans-serif'; g.fillText('C' + (Math.floor(+m / 12) - 1), p.x + 2, hitY + kh - 4); }
    }
    for (const [m, p] of Object.entries(geo.pos)) if (p.black) {
      const o = on[m], t = cur.tapped.has(+m);
      g.fillStyle = o ? rgba(o.col, 1) : t ? '#555' : '#1b1b1b'; roundRect(g, p.x, hitY + 1, p.w, kh * (opt.real ? 0.63 : 0.62), 2); g.fill();
    }
    g.restore();
    if (cur.waiting) { g.fillStyle = 'rgba(' + INK + ',0.7)'; g.font = '600 13px -apple-system, sans-serif'; const t = '等你弹：' + (cur.waitLabel || ''); g.fillText(t, 8, hitY - 10); }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  // mode: 'play'（跟着声音落下）| 'wait'（每个和弦等你弹对）
  function play(A, opt2) {
    if (!cur) return; cancelAnimationFrame(cur.raf);
    const spb = 60 / (cur.opt.bpm || 80) / (opt2.rate || 1), mode = opt2.mode || 'play';
    // from：从暂停的地方接着来（不重置进度）
    if (opt2.from == null) { cur.beat = -(cur.opt.lead || 2); cur.waitIdx = 0; cur.released = 0; } else cur.beat = opt2.from;
    cur.waiting = null; cur.mode = mode; cur.last2 = opt2; cur.running = true; cur.paused = false;
    let last = performance.now();
    if (mode === 'play') { const b0 = cur.beat; A.schedule(cur.opt.events.filter(e => e.t >= b0 - 1e-6).map(e => [e.midi, 0.1 + (e.t - b0) * spb, Math.min(3, e.d * spb + 0.15), e.hand === 'L' ? 0.5 : 0.62])); }
    const step = now => {
      if (!cur) return;
      const dt = (now - last) / 1000; last = now;
      if (mode === 'wait') {
        const c = cur.chords[cur.waitIdx];
        if (c && cur.beat >= c.t - 1e-6 && cur.released <= cur.waitIdx) {
          cur.beat = c.t; cur.waitLabel = c.label;
          cur.waiting = cur.opt.events.filter(e => Math.abs(e.t - c.t) < 1e-3).map(e => e.midi);
        } else { cur.waiting = null; if (c && cur.released > cur.waitIdx && cur.beat >= c.t - 1e-6) cur.waitIdx++; cur.beat += dt / spb; }
      } else cur.beat += dt / spb;
      draw();
      if (cur.opt.onBeat) cur.opt.onBeat(cur.beat);
      if (cur.beat < cur.total + 1) cur.raf = requestAnimationFrame(step); else { cur.waiting = null; cur.running = false; draw(); if (opt2.onEnd) opt2.onEnd(); }
    };
    cur.raf = requestAnimationFrame(step);
  }
  function pause() { if (cur && cur.running) { cancelAnimationFrame(cur.raf); cur.running = false; cur.paused = true; } }
  function resume(A) { if (cur && cur.paused) play(A, Object.assign({}, cur.last2, { from: cur.beat })); }
  function release() { if (cur) cur.released = cur.waitIdx + 1; }
  function stop() { if (cur) { cancelAnimationFrame(cur.raf); cur.waiting = null; cur.running = false; cur.paused = false; } }
  function reset() { if (cur) { stop(); cur.beat = -(cur.opt.lead || 2); draw(); } }
  return { mount, play, stop, reset, release, pause, resume, get: () => cur, COL };
})();
if (typeof module !== 'undefined') module.exports = Roll;
