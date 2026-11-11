// 开机动画：键盘线条 → 和弦色块 → 圆点 → 滑条曲线。可以带上用户做的和弦（cfg.pre），让后半段的圆点沿着和弦的升降线走。
// 用法：HXSplash.run(根元素, cfg, { onEnd })；根元素里要先放好 HXSplash.MARK
window.HXSplash = (function () {
  var MARK = `<svg viewBox="0 0 300 300" preserveAspectRatio="xMidYMid meet">
    <defs>
      <filter id="spglow" x="-80%" y="-40%" width="260%" height="180%"><feGaussianBlur stdDeviation="9"/></filter>
      <radialGradient id="spth" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#9aa8ff" stop-opacity=".9"/><stop offset=".45" stop-color="#9aa8ff" stop-opacity=".35"/><stop offset="1" stop-color="#9aa8ff" stop-opacity="0"/></radialGradient>
    </defs>
    <g id="sp-glow" filter="url(#spglow)"><rect id="gl1"/><rect id="gl2"/></g>
    <path id="pc1" d="" fill="none" stroke="#9aa8ff" stroke-width="7" stroke-linecap="round" opacity="0"/>
    <path id="pc3" d="" fill="none" stroke="#9aa8ff" stroke-width="7" stroke-linecap="round" opacity="0"/>
    <rect id="w1"/><rect id="w2"/><rect id="w3"/><rect id="w4"/><rect id="w5"/>
    <rect id="l1"/><rect id="l2"/><rect id="l3"/>
    <rect id="k1"/><rect id="k2"/><rect id="k3"/>
    <circle id="rp0" r="0" fill="none" stroke-width="3" opacity="0"/><circle id="rp1" r="0" fill="none" stroke-width="3" opacity="0"/><circle id="rp2" r="0" fill="none" stroke-width="3" opacity="0"/><circle id="rp3" r="0" fill="none" stroke-width="3" opacity="0"/>
    <circle id="dot" cx="150" cy="240" r="9.5" fill="#e8541e"/>
    <circle id="halo1" cx="164" cy="128" r="46" fill="url(#spth)" opacity="0"/><circle id="halo2" cx="164" cy="172" r="46" fill="url(#spth)" opacity="0"/>
    <g id="rd"><path id="rv0" d="" fill="none" stroke="#9aa8ff" stroke-width="7" stroke-linecap="round" opacity="0"/><path id="rv1" d="" fill="none" stroke="#9aa8ff" stroke-width="7" stroke-linecap="round" opacity="0"/><path id="rv2" d="" fill="none" stroke="#9aa8ff" stroke-width="7" stroke-linecap="round" opacity="0"/><path id="rv3" d="" fill="none" stroke="#9aa8ff" stroke-width="7" stroke-linecap="round" opacity="0"/>
    <circle id="rh0" r="34" fill="url(#spth)" opacity="0"/><circle id="rh1" r="34" fill="url(#spth)" opacity="0"/><circle id="rh2" r="34" fill="url(#spth)" opacity="0"/><circle id="rh3" r="34" fill="url(#spth)" opacity="0"/>
    <circle id="rt0" r="13" fill="#c7cdff" opacity="0"/><circle id="rt1" r="13" fill="#c7cdff" opacity="0"/><circle id="rt2" r="13" fill="#c7cdff" opacity="0"/><circle id="rt3" r="13" fill="#c7cdff" opacity="0"/>
    <text id="rlab" x="150" y="34" text-anchor="middle" font-size="30" font-weight="600" fill="#c7cdff" opacity="0" font-family="-apple-system, PingFang SC, sans-serif"></text></g>
  </svg>`;
  // 三种「语言」：dot = 圆点指示要弹的键；color = 键按和弦色亮起；line = 和弦用升降线呈现。
  // 它们在同一条链上：dot(0) — color(1) — 圆点(2，中间态) — line(3)。任意两种之间的变换，就是沿着这条链走几步，每一步都是形状连续变形。
  var ST = { dot: 0, color: 1, line: 3 }, KEYX = [126.5, 175.5, 224.5];
  function plan(cfg) {
    var pre = cfg.pre, spb = 60 / Math.max(30, cfg.bpm || 84), iv = Math.max(0.45, ((cfg.beats || 2) + (cfg.gap || 0)) * spb), N = pre.voices.length, arp = cfg.style === 'arp';
    var ord = cfg.order; if (typeof ord === 'string') ord = ord.split(','); ord = (ord || []).filter(function (x, i, a) { return ST[x] != null && a.indexOf(x) === i; }); if (!ord.length) ord = ['dot', 'color', 'line'];
    var S = ord.length, t = 0.5, kf = [[0, ST[ord[0]]], [0.5, ST[ord[0]]]], events = [], notes = [], ripples = [], hops = [], ivDot = Math.max(iv, 0.15 * 3 + 0.45);
    // 每个和弦只在自己的时刻弹一次；换「语言」时不再重弹，上一个和弦的声音一直延续到下一个和弦出现，画面在这段时间里变形
    for (var s = 0; s < S; s++) {
      var to = ST[ord[s]];
      if (s > 0) {
        var from = ST[ord[s - 1]], dur = Math.max(0.9, Math.abs(to - from) * 0.7);
        kf.push([t, from], [t + dur, to]); t += dur + 0.25; kf.push([t, to]);
      }
      var js = []; for (var j0 = 0; j0 < N; j0++) if (Math.min(S - 1, Math.floor(j0 * S / N)) === s) js.push(j0);
      if (!js.length) { t += 1.0; kf.push([t, to]); continue; }
      js.forEach(function (j) {
        var sc = ord[s], spread = sc === 'dot' ? 0.15 : (arp ? Math.min(spb / 3, 0.2) : 0.012), v = pre.voices[j];
        events.push({ j: j, t: t, scene: sc, iv: sc === 'dot' ? ivDot : iv, spread: spread });
        if (sc !== 'line') for (var k = 0; k < 3; k++) { ripples.push([t + k * spread, KEYX[k], 190, pre.acc[j]]); if (sc === 'dot') hops.push([t + k * spread, KEYX[k]]); }
        t += sc === 'dot' ? ivDot : iv;
      });
    }
    var endT = t + 0.9; kf.push([endT, ST[ord[S - 1]]]);
    events.forEach(function (ev, i) { var dur = (events[i + 1] ? events[i + 1].t : endT) - ev.t + 0.3; pre.midis[ev.j].forEach(function (m, k) { notes.push([m, ev.t + k * ev.spread, dur, 0.45]); }); });
    return { events: events, kf: kf, notes: notes, ripples: ripples, hops: hops, end: endT, order: ord };
  }
  function run(root, cfg, opt) {
    opt = opt || {};
  var el = root, $ = function (i) { return root.querySelector('[id="' + i + '"]'); };
  // 每个形状在 4 个时刻的样子：A 键盘线条 → B 和弦色块 → C 滑条（拉直）→ C 滑条（弯出去）。时刻之间全部连续插值，不是淡入淡出。
  var K = {
    w1: [{ x: 52, y: 84, w: 49, h: 132, rx: 3, fill: '#ffffff', stroke: '#111111', sw: 5.5, o: 1 }, { x: 55, y: 92, w: 43, h: 124, rx: 7, fill: '#efe6dc', stroke: '#efe6dc', sw: 0, o: 1 }, { x: 52, y: 92.5, w: 196, h: 7, rx: 3.5, fill: '#9aa8ff', stroke: '#9aa8ff', sw: 0, o: 1 }, { x: 52, y: 92.5, w: 196, h: 7, rx: 3.5, fill: '#9aa8ff', stroke: '#9aa8ff', sw: 0, o: 1 }],
    w2: [{ x: 101, y: 84, w: 49, h: 132, rx: 3, fill: '#ffffff', stroke: '#111111', sw: 5.5, o: 1 }, { x: 104, y: 92, w: 43, h: 124, rx: 7, fill: '#efe6dc', stroke: '#efe6dc', sw: 0, o: 1 }, { x: 52, y: 92.5, w: 196, h: 7, rx: 3.5, fill: '#9aa8ff', stroke: '#9aa8ff', sw: 0, o: 0 }, { x: 52, y: 92.5, w: 196, h: 7, rx: 3.5, fill: '#9aa8ff', stroke: '#9aa8ff', sw: 0, o: 0 }],
    w3: [{ x: 150, y: 84, w: 49, h: 132, rx: 3, fill: '#ffffff', stroke: '#111111', sw: 5.5, o: 1 }, { x: 153, y: 92, w: 43, h: 124, rx: 7, fill: '#efe6dc', stroke: '#efe6dc', sw: 0, o: 1 }, { x: 52, y: 146.5, w: 196, h: 7, rx: 3.5, fill: '#8d8c97', stroke: '#8d8c97', sw: 0, o: 1 }, { x: 52, y: 146.5, w: 196, h: 7, rx: 3.5, fill: '#8d8c97', stroke: '#8d8c97', sw: 0, o: 1 }],
    w4: [{ x: 199, y: 84, w: 49, h: 132, rx: 3, fill: '#ffffff', stroke: '#111111', sw: 5.5, o: 1 }, { x: 202, y: 92, w: 43, h: 124, rx: 7, fill: '#efe6dc', stroke: '#efe6dc', sw: 0, o: 1 }, { x: 52, y: 200.5, w: 196, h: 7, rx: 3.5, fill: '#9aa8ff', stroke: '#9aa8ff', sw: 0, o: 1 }, { x: 52, y: 200.5, w: 196, h: 7, rx: 3.5, fill: '#9aa8ff', stroke: '#9aa8ff', sw: 0, o: 0 }],
    w5: [{ x: 248, y: 92, w: 0, h: 124, rx: 3, fill: '#ffffff', stroke: '#ffffff', sw: 0, o: 0 }, { x: 248, y: 92, w: 0, h: 124, rx: 3, fill: '#ffffff', stroke: '#ffffff', sw: 0, o: 0 }, { x: 248, y: 92, w: 0, h: 124, rx: 3, fill: '#ffffff', stroke: '#ffffff', sw: 0, o: 0 }, { x: 248, y: 92, w: 0, h: 124, rx: 3, fill: '#ffffff', stroke: '#ffffff', sw: 0, o: 0 }],
    k1: [{ x: 86, y: 84, w: 30, h: 78, rx: 3, fill: '#111111', o: 1 }, { x: 86, y: 92, w: 30, h: 70, rx: 4, fill: '#1a1315', o: 1 }, { x: 46, y: 90, w: 12, h: 12, rx: 6, fill: '#efe6dc', o: 1 }, { x: 46, y: 90, w: 12, h: 12, rx: 6, fill: '#efe6dc', o: 1 }],
    k2: [{ x: 135, y: 84, w: 30, h: 78, rx: 3, fill: '#111111', o: 1 }, { x: 135, y: 92, w: 30, h: 70, rx: 4, fill: '#1a1315', o: 1 }, { x: 46, y: 144, w: 12, h: 12, rx: 6, fill: '#efe6dc', o: 1 }, { x: 46, y: 144, w: 12, h: 12, rx: 6, fill: '#efe6dc', o: 1 }],
    k3: [{ x: 184, y: 84, w: 30, h: 78, rx: 3, fill: '#111111', o: 1 }, { x: 184, y: 92, w: 30, h: 70, rx: 4, fill: '#1a1315', o: 1 }, { x: 46, y: 198, w: 12, h: 12, rx: 6, fill: '#efe6dc', o: 1 }, { x: 46, y: 198, w: 12, h: 12, rx: 6, fill: '#efe6dc', o: 1 }],
    l1: [{ x: 104, y: 92, w: 43, h: 124, rx: 7, fill: '#ff6b7c', o: 0 }, { x: 104, y: 92, w: 43, h: 124, rx: 7, fill: '#ff6b7c', o: 1 }, { x: 142, y: 106, w: 44, h: 44, rx: 22, fill: '#9aa8ff', o: 1 }, { x: 142, y: 106, w: 44, h: 44, rx: 22, fill: '#9aa8ff', o: 1 }],
    l2: [{ x: 153, y: 92, w: 43, h: 124, rx: 7, fill: '#8e8a80', o: 0 }, { x: 153, y: 92, w: 43, h: 124, rx: 7, fill: '#8e8a80', o: 1 }, { x: 150, y: 140, w: 20, h: 20, rx: 10, fill: '#8e8a80', o: 0 }, { x: 150, y: 140, w: 20, h: 20, rx: 10, fill: '#8e8a80', o: 0 }],
    l3: [{ x: 202, y: 92, w: 43, h: 124, rx: 7, fill: '#ff8d9a', o: 0 }, { x: 202, y: 92, w: 43, h: 124, rx: 7, fill: '#ff8d9a', o: 1 }, { x: 149, y: 157, w: 30, h: 30, rx: 15, fill: '#c7cdff', o: 1 }, { x: 149, y: 157, w: 30, h: 30, rx: 15, fill: '#c7cdff', o: 1 }],
    gl1: [{ x: 104, y: 92, w: 43, h: 124, rx: 7, fill: '#ff6b7c', o: 0 }, { x: 104, y: 92, w: 43, h: 124, rx: 7, fill: '#ff6b7c', o: 0.9 }, { x: 142, y: 106, w: 44, h: 44, rx: 22, fill: '#9aa8ff', o: 0.8 }, { x: 142, y: 106, w: 44, h: 44, rx: 22, fill: '#9aa8ff', o: 0.8 }],
    gl2: [{ x: 202, y: 92, w: 43, h: 124, rx: 7, fill: '#ffb3bb', o: 0 }, { x: 202, y: 92, w: 43, h: 124, rx: 7, fill: '#ffb3bb', o: 0.9 }, { x: 149, y: 157, w: 30, h: 30, rx: 15, fill: '#c7cdff', o: 0.7 }, { x: 149, y: 157, w: 30, h: 30, rx: 15, fill: '#c7cdff', o: 0.7 }]
  };
  var pre = cfg && cfg.pre, PL = pre ? plan(cfg) : null;
  var mixHex = function (a, b, t) { var p = function (c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); }, x = p(a), y = p(b); return '#' + [0, 1, 2].map(function (i) { var v = Math.round(x[i] + (y[i] - x[i]) * t); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); };
  // 在 B 和 C 之间加一个「油滴」阶段：键盘上的颜色被提炼成圆点，圆点变色，再长出三条线
  (function () {
    Object.keys(K).forEach(function (id) {
      var B = K[id][1], C = K[id][2], D, cx = B.x + B.w / 2;
      if (/^(l[123]|gl[12])$/.test(id)) D = { x: cx - 17, y: 137, w: 34, h: 34, rx: 17, fill: B.fill, o: B.o };
      else if (/^w[134]$/.test(id)) D = { x: 52, y: C.y, w: 0, h: 7, rx: 3.5, fill: B.fill, stroke: B.fill, sw: 0, o: 0 };
      else if (/^k/.test(id)) D = { x: 52, y: C.y + 6, w: 0, h: 0, rx: 0, fill: B.fill, o: 0 };
      else D = { x: cx, y: 154, w: 0, h: 0, rx: 0, fill: B.fill, stroke: B.fill, sw: 0, o: 0 };
      K[id].splice(2, 0, D);
    });
  })();
  if (pre) { K.w1[3].o = 0; K.w3[3].o = 0; K.w4[3].o = 0; } // 自定义动画里，三个彩色的音直接变成线上的三个点，不再经过「两个点」的中间画面
  var BG = ['#ffffff', '#2a1215', '#1b1424', '#141a36', '#141a36'];
  // 段落：停 0.5 → A→B 1.1 → 停 0.25 → B→C 1.1 → 弯出去 0.65 → 停 0.35 → 淡出
  var SEG = [[0.6, 1.8, 0, 1], [2.35, 3.15, 1, 2], [3.15, 3.95, 2, 3], [4.45, 5.15, 3, 4]], END = 5.6;
  var DL = { l1: 0, l2: 0.25, l3: 0.5, gl1: 0, gl2: 0.5 }, TAPS = [[0.5, 126.5, 190, '#ff6b7c'], [0.75, 175.5, 190, '#ff6b7c'], [1.0, 224.5, 190, '#ff6b7c'], [2.1, 150, 154, '#ff8d9a']];
  var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
  var hx = function (c) { return [1, 3, 5].map(function (i) { return parseInt(c.slice(i, i + 2), 16); }); };
  var mixc = function (a, b, t) { var x = hx(a), y = hx(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')'; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  function frame(t) {
    var s0 = 0, s1 = 0, p = 0, ps = 0;
    if (pre) {
      var kf = PL.kf; ps = kf[kf.length - 1][1];
      for (var q = 1; q < kf.length; q++) if (t <= kf[q][0]) { var A0 = kf[q - 1], B0 = kf[q]; ps = B0[0] === A0[0] ? B0[1] : A0[1] + (B0[1] - A0[1]) * (t - A0[0]) / (B0[0] - A0[0]); break; }
      s0 = Math.min(3, Math.floor(ps + 1e-9)); s1 = Math.min(3, Math.ceil(ps - 1e-9)); p = s1 === s0 ? 0 : ease(ps - s0);
      chordNow(t);
    } else if (t < SEG[0][0]) { s0 = s1 = 0; } else {
      for (var i = 0; i < SEG.length; i++) { var g = SEG[i]; if (t >= g[0] && t <= g[1]) { s0 = g[2]; s1 = g[3]; p = ease((t - g[0]) / (g[1] - g[0])); break; } if (t > g[1]) { s0 = s1 = g[3]; } }
    }
    el.style.background = mixc(BG[s0], BG[s1], p);
    Object.keys(K).forEach(function (id) {
      var n = $(id), a = K[id][s0], b = K[id][s1], pp = p;
      if (s0 === 0 && s1 === 1 && DL[id] !== undefined) pp = Math.max(0, Math.min(1, (p - DL[id]) / 0.5));
      var f = function (k) { return lerp(a[k], b[k], pp); };
      n.setAttribute('x', f('x')); n.setAttribute('y', f('y')); n.setAttribute('width', Math.max(0, f('w'))); n.setAttribute('height', Math.max(0, f('h'))); n.setAttribute('rx', f('rx'));
      n.setAttribute('fill', mixc(a.fill, b.fill, pp)); n.setAttribute('opacity', f('o'));
      if (a.stroke) { n.setAttribute('stroke', mixc(a.stroke, b.stroke, pp)); n.setAttribute('stroke-width', f('sw')); }
    });
    if (pre) ripples(t); else TAPS.forEach(function (T, i) { var u = (t - T[0]) / 0.55, r = $('rp' + i); if (u < 0 || u > 1) { r.setAttribute('opacity', 0); return; } r.setAttribute('cx', T[1]); r.setAttribute('cy', T[2]); r.setAttribute('stroke', T[3]); r.setAttribute('r', 1 + 36 * (1 - Math.pow(1 - u, 3))); r.setAttribute('opacity', 0.9 * Math.min(1, u * 5) * (1 - u)); });
    // 橙点：A 里在键盘下面，之后缩小淡出
    var dp = s1 >= 1 || s0 >= 1 ? (s0 >= 1 ? 1 : p) : 0; if (pre) $('dot').setAttribute('cx', dotX(t)); $('dot').setAttribute('opacity', 1 - dp); $('dot').setAttribute('r', 9.5 * (1 - dp * 0.6)); $('dot').setAttribute('cy', 240 - 30 * dp);
    // C：拉直的条换成曲线，再一点点弯出去；光晕随滑块出现
    var bend = s0 === 3 && s1 === 4 ? p : (s0 === 4 ? 1 : 0), cOn = (s0 === 3 && s1 === 4) || s0 === 4 ? 1 : 0;
    ['pc1', 'pc3'].forEach(function (id, k) {
      var y = k ? 204 : 96, y2 = k ? 172 : 128, yy = y + (y2 - y) * bend;
      $(id).setAttribute('d', 'M52 ' + y + ' H112 C138 ' + y + ' 138 ' + yy + ' 164 ' + yy + ' H248'); $(id).setAttribute('opacity', cOn);
    });
    ['w1', 'w5'].forEach(function (id) { $(id).setAttribute('opacity', cOn ? 0 : K[id][s1].o * p + K[id][s0].o * (1 - p)); });
    var hl = pre ? 0 : (s0 === 2 && s1 === 3 ? p : s0 >= 3 ? 1 : 0);
    $('halo1').setAttribute('opacity', hl * 0.9); $('halo2').setAttribute('opacity', hl * 0.7);
    if (pre) ride(t);
  }

    var base = [204, 150, 96], clampN = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
    var nC = pre ? pre.voices.length : 0, xs = [], vy = [[], [], [], []], RD = pre && nC > 0;
    var YS = 6; if (pre) { var mxd = 1; pre.voices.forEach(function (vc) { vc.forEach(function (m, i) { mxd = Math.max(mxd, Math.abs(m - pre.voices[0][i])); }); }); YS = Math.min(6, 70 / mxd); }
    var LS = (cfg && cfg.lines === 'voices') || !(pre && pre.alts) ? 'voices' : 'degree', YS1 = 6; if (pre) { var mx1 = 1; pre.voices.forEach(function (vc) { mx1 = Math.max(mx1, Math.abs(vc[0] - pre.voices[0][0])); }); YS1 = Math.min(6, 80 / mx1); }
    var NL = 3; if (LS === 'degree') { pre.alts.forEach(function (al) { if (al.length > 3) NL = 4; }); if (NL === 4) base = [216, 170, 124, 78]; }
    // 度数线（和弦页那样）：每条线是和弦的一个度数 1 / 3 / 5 / 7。和这个和弦的大调音阶度数一样就平着走，改了几个半音就弯几个半音：根音灰、没动的浅色、动了的用和弦色
    var roleCol = function (i, j) { if (LS !== 'degree') return pre.acc[j]; var r = pre.roles[j][i]; return r === 'rt' ? '#8e8a80' : r === 'st' ? '#c7cdff' : r === 'mv' ? pre.acc[j] : '#4d5278'; };
    if (RD) {
      for (var ci = 0; ci < nC; ci++) { xs.push(nC > 1 ? 92 + ci * (148 / (nC - 1)) : 150); var pv = pre.voices[ci], p0 = pre.voices[0];
        if (LS === 'degree') { for (var di = 0; di < NL; di++) { var al = pre.alts[ci][di]; vy[di].push(al == null ? base[di] : clampN(base[di] - al * 14, 40, 264)); } }
        else if (LS === 'default') { vy[0].push(clampN(150 + (pv[1] - pv[0]) * 10, 62, 264)); vy[1].push(150); vy[2].push(clampN(150 - (pv[2] - pv[1]) * 10, 62, 264)); } // 中间一条不动，上下两条随和弦的宽窄弯近、弯远
        else if (LS === 'single') { var yy = clampN(150 - (pv[0] - p0[0]) * YS1, 62, 264); vy[0].push(yy); vy[1].push(yy); vy[2].push(yy); } // 只有一条线：跟着根音（最低音）升降
        else for (var vv = 0; vv < 3; vv++) vy[vv].push(clampN(base[vv] - (pv[vv] - p0[vv]) * YS, 62, 264)); }
      // 线的颜色：沿着线，每个和弦的位置是这个和弦的颜色，中间渐变；球走到哪，线在那里就是同一个颜色
      var NS = 'http://www.w3.org/2000/svg', gids = [];
      for (var gi = 0; gi < NL; gi++) {
        var gid = 'spg' + Math.floor(Math.random() * 1e6) + gi, lg = document.createElementNS(NS, 'linearGradient'); gids.push(gid);
        lg.setAttribute('id', gid); lg.setAttribute('gradientUnits', 'userSpaceOnUse'); lg.setAttribute('x1', 52); lg.setAttribute('x2', 248); lg.setAttribute('y1', 0); lg.setAttribute('y2', 0);
        var stops = [[0, roleCol(gi, 0)]]; xs.forEach(function (x, j) { stops.push([(x - 52) / 196, roleCol(gi, j)]); }); stops.push([1, roleCol(gi, nC - 1)]);
        stops.forEach(function (st) { var e = document.createElementNS(NS, 'stop'); e.setAttribute('offset', st[0]); e.setAttribute('stop-color', st[1]); lg.appendChild(e); });
        root.querySelector('defs').appendChild(lg);
      }
      // 线的起点圆点跟着线的起点走
      K.k1[3].y = vy[2][0] - 6; K.k2[3].y = vy[1][0] - 6; K.k3[3].y = vy[0][0] - 6;
      for (var v2 = 0; v2 < NL; v2++) { $('rv' + v2).setAttribute('stroke', 'url(#' + gids[v2] + ')'); $('rv' + v2).setAttribute('pathLength', 1); $('rv' + v2).setAttribute('stroke-dasharray', 1); var d = 'M52 ' + vy[v2][0] + ' H' + xs[0]; for (var c2 = 0; c2 < nC - 1; c2++) { var ya0 = vy[v2][c2], yb0 = vy[v2][c2 + 1]; if (Math.abs(ya0 - yb0) < 0.5) { d += ' H' + xs[c2 + 1]; continue; } var sp = xs[c2 + 1] - xs[c2], aw = Math.min(52, sp * 0.8), xm = (xs[c2] + xs[c2 + 1]) / 2, x1 = xm - aw / 2; d += ' H' + x1 + ' C' + (x1 + aw / 2) + ' ' + ya0 + ' ' + (x1 + aw / 2) + ' ' + yb0 + ' ' + (x1 + aw) + ' ' + yb0 + ' H' + xs[c2 + 1]; } d += ' H248'; $('rv' + v2).setAttribute('d', d); }
    }
    // 当前的和弦（最近一次出现的那个），以及它和上一个之间的颜色渐变
    function evAt(t) { var e = -1; for (var k = 0; k < PL.events.length; k++) if (PL.events[k].t <= t + 0.02) e = k; return e; }
    var accNow = null, ltNow = null;
    function chordNow(t) {
      var e = Math.max(0, evAt(t)), ev = PL.events[e], pj = e > 0 ? PL.events[e - 1].j : ev.j, k = clampN((t - ev.t) / 0.3, 0, 1);
      accNow = mixHex(pre.acc[pj], pre.acc[ev.j], k); ltNow = mixHex(accNow, '#ffffff', 0.45);
      [1, 2].forEach(function (si) { K.l1[si].fill = '#8e8a80'; K.l2[si].fill = accNow; K.l3[si].fill = ltNow; K.gl1[si].fill = accNow; K.gl2[si].fill = ltNow; });
      K.gl1[1].x = 55 + 49 * 2; K.gl1[2].x = 55 + 49 * 2 + 21.5 - 17;
      if (RD) { // 线这一步里的三个点：位置就在这个和弦在三条线上的位置，颜色是这个和弦的颜色
        var cx = xs[ev.j]; ['l1', 'l2', 'l3'].forEach(function (id, w) { var o = K[id][3]; o.x = cx - 13; o.y = vy[w][ev.j] - 13; o.w = 26; o.h = 26; o.rx = 13; o.fill = roleCol(w, ev.j); o.o = 1; });
        K.gl1[3] = { x: cx - 22, y: vy[2][ev.j] - 22, w: 44, h: 44, rx: 22, fill: accNow, o: 0.8 }; K.gl2[3] = { x: cx - 15, y: vy[0][ev.j] - 15, w: 30, h: 30, rx: 15, fill: accNow, o: 0.7 };
      }
    }
    function dotX(t) { var x = 150, px = 150, t1 = -9; PL.hops.forEach(function (h) { if (h[0] <= t) { px = x; x = h[1]; t1 = h[0]; } }); return px + (x - px) * ease(clampN((t - t1) / 0.14, 0, 1)); }
    function ripples(t) {
      var used = 0;
      PL.ripples.forEach(function (R) { var u = (t - R[0]) / 0.55; if (u < 0 || u > 1 || used >= 4) return; var r = $('rp' + used++); r.setAttribute('cx', R[1]); r.setAttribute('cy', R[2]); r.setAttribute('stroke', R[3]); r.setAttribute('r', 1 + 36 * (1 - Math.pow(1 - u, 3))); r.setAttribute('opacity', 0.9 * Math.min(1, u * 5) * (1 - u)); });
      for (; used < 4; used++) $('rp' + used).setAttribute('opacity', 0);
    }
    function ride(t) {
      var lab = $('rlab'), e = Math.max(0, evAt(t)), ev = PL.events[e], cj = ev.j;
      lab.textContent = pre.labels[cj]; lab.setAttribute('fill', pre.acc[cj]); lab.setAttribute('opacity', clampN((t - PL.events[0].t + 0.1) / 0.4, 0, 1));
      var kf = PL.kf, psn = kf[kf.length - 1][1]; for (var q = 1; q < kf.length; q++) if (t <= kf[q][0]) { var A0 = kf[q - 1], B0 = kf[q]; psn = B0[0] === A0[0] ? B0[1] : A0[1] + (B0[1] - A0[1]) * (t - A0[0]) / (B0[0] - A0[0]); break; }
      var alL = RD ? clampN(psn - 2, 0, 1) : 0, al = RD ? clampN((psn - 2.85) / 0.15, 0, 1) : 0;
      if (al > 0) ['w1', 'w2', 'w3', 'w4', 'l1', 'l2', 'l3', 'gl1', 'gl2', 'halo1', 'halo2'].forEach(function (id) { var n = $(id); n.setAttribute('opacity', parseFloat(n.getAttribute('opacity') || 0) * (1 - al)); });
      for (var v = 0; v < 4; v++) { $('rv' + v).setAttribute('opacity', alL > 0 && v < NL ? 1 : 0); $('rv' + v).setAttribute('stroke-dashoffset', 1 - alL); $('rh' + v).setAttribute('opacity', 0); $('rt' + v).setAttribute('opacity', 0); }
      if (!RD || al <= 0) return;
      var nx = PL.events[e + 1], a = cj, b = cj, u = 0, pulse = ev.scene === 'line' ? Math.exp(-6 * Math.max(0, t - ev.t)) : 0;
      if (nx && nx.scene === 'line' && ev.scene === 'line') { b = nx.j; var ivE = nx.t - ev.t; u = clampN((t - (ev.t + 0.4 * ivE)) / (0.6 * ivE), 0, 1); }
      var eu = ease(u);
      for (var w = 0; w < 4; w++) {
        var ya = vy[w][a], yb = vy[w][b], x = xs[a] + (xs[b] - xs[a]) * eu, y = ya;
        if (a !== b) { var spn = Math.abs(xs[b] - xs[a]), aw2 = Math.min(52, spn * 0.8), xmm = (xs[a] + xs[b]) / 2, k0 = clampN((x - (xmm - aw2 / 2)) / aw2, 0, 1); if (xs[b] < xs[a]) k0 = clampN(((xmm + aw2 / 2) - x) / aw2, 0, 1); y = ya + (yb - ya) * (k0 * k0 * (3 - 2 * k0)); }
        if (w >= NL) continue; var hh = $('rh' + w), tt = $('rt' + w); hh.setAttribute('cx', x); hh.setAttribute('cy', y); hh.setAttribute('r', 34 * (1 + 0.5 * pulse)); hh.setAttribute('opacity', al * (0.8 + 0.2 * pulse)); tt.setAttribute('cx', x); tt.setAttribute('cy', y); tt.setAttribute('fill', mixHex(roleCol(w, a), roleCol(w, b), eu)); tt.setAttribute('opacity', al * (LS === 'degree' && pre.roles[cj][w] === undefined ? 0.35 : 1));
      }
    }
    var t0 = performance.now(), raf = 0, stopped = false, endT = pre ? PL.end : 5.6, lastSeg = SEG[SEG.length - 1][1];
    function tick(now) { if (stopped) return; var t = (now - t0) / 1000; frame(pre ? t : Math.min(t, lastSeg)); if (t >= endT) { if (opt.onEnd) opt.onEnd(); return; } raf = requestAnimationFrame(tick); }
    frame(0); raf = requestAnimationFrame(tick);
    return { stop: function () { stopped = true; cancelAnimationFrame(raf); }, restart: function () { t0 = performance.now(); }, plan: PL };
  }
  return { MARK: MARK, run: run, plan: plan };
})();
