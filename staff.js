// 五线谱（大谱表）渲染：基于 VexFlow
// 用法：<div class="staff" data-staff='{"key":"C","bars":[["C","G7/D"],["C"]],"hide":[1]}'></div>
const Staff = (() => {
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#111';

  function vexKey(name, midi) {
    const p = T.parseNote(name);
    const oct = Math.floor((midi - p.acc) / 12) - 1;
    return p.letter.toLowerCase() + (p.acc > 0 ? '#'.repeat(p.acc) : 'b'.repeat(-p.acc)) + '/' + oct;
  }
  // 右手：和弦音（中音区）；左手：低音（根音或斜线低音）
  function parts(sym) {
    const c = T.parseChord(sym);
    let v = T.voicing(c).filter(n => n.deg !== -1);
    while (Math.min(...v.map(n => n.midi)) < 57) v.forEach(n => (n.midi += 12));
    while (Math.min(...v.map(n => n.midi)) > 69) v.forEach(n => (n.midi -= 12));
    const b = c.bass || c.root;
    let bm = 36 + b.pc; if (bm < 41) bm += 12;
    return {
      rh: v.sort((x, y) => x.midi - y.midi).map(n => vexKey(n.name, n.midi)),
      lh: [vexKey(b.name, bm)],
    };
  }
  const DUR = { 1: ['w'], 2: ['h', 'h'], 3: ['q', 'q', 'h'], 4: ['q', 'q', 'q', 'q'] };

  function vexKeySig(key) {
    const k = T.parseKey(key || 'C');
    if (!k) return 'C';
    return k.tonic.name + (k.minor ? 'm' : '');
  }


  const LPC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  function vexMidi(k) { const m = /^([a-g])(#{1,2}|b{1,2})?\/(-?\d)$/.exec(k); if (!m) return null; const acc = !m[2] ? 0 : m[2][0] === '#' ? m[2].length : -m[2].length; return (+m[3] + 1) * 12 + LPC[m[1]] + acc; }
  // 记录每个音符的位置；点音符头 = 播放那个音，点在小节里别处 = 播放整列和弦
  function collect(cols, n, row) {
    const ks = n && (n.getKeys ? n.getKeys() : n.keys);
    if (!ks || !n.getYs || (n.isRest && n.isRest())) return;
    let x; try { x = n.getAbsoluteX(); } catch (e) { return; }
    const ys = n.getYs(), ms = ks.map(vexMidi);
    let col = cols.find(c => Math.abs(c.x - x) < 6 && (row == null || (c.y0 === row[0])));
    if (!col) { col = { x, heads: [], y0: row ? row[0] : -1e9, y1: row ? row[1] : 1e9 }; cols.push(col); }
    ys.forEach((y, i) => ms[i] != null && col.heads.push({ y, m: ms[i] }));
  }
  function clickable(el, cols, W, H, boxes) {
    const svg = el.querySelector('svg'); if (!svg || !cols.length) return;
    svg.style.cursor = 'pointer';
    el.onclick = e => {
      const rc = svg.getBoundingClientRect(), sx = (e.clientX - rc.left) * W / rc.width, sy = (e.clientY - rc.top) * H / rc.height;
      // 点到哪一小节：告诉外面（曲目页用来显示这一小节的依据）
      const mk = (boxes || []).find(b => b.mx != null && Math.abs(sx - b.mx - 4) < 12 && Math.abs(sy - b.my) < 12);
      if (mk) { el.dispatchEvent(new CustomEvent('staffplayfrom', { detail: mk.n, bubbles: true })); return; }
      // 只在点到的那一行里找（不同行同一横坐标的音不混在一起）
      const inRow = cols.filter(c => sy >= c.y0 && sy <= c.y1);
      const col = (inRow.length ? inRow : cols).slice().sort((a, b) => Math.abs(a.x - sx) - Math.abs(b.x - sx))[0];
      // 点在音符（那一列和弦）附近 = 听音；点在小节的空白处 = 告诉外面播放这一小节
      if (!col || Math.abs(col.x + 6 - sx) > 22) {
        const bx = (boxes || []).find(b => sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h);
        if (bx) el.dispatchEvent(new CustomEvent('staffbar', { detail: bx.n, bubbles: true }));
        return;
      }
      const head = col.heads.slice().sort((a, b) => Math.abs(a.y - sy) - Math.abs(b.y - sy))[0];
      const ms = head && Math.abs(head.y - sy) < 9 && Math.abs(col.x + 8 - sx) < 24 ? [head.m] : col.heads.map(h => h.m);
      el.dispatchEvent(new CustomEvent('staffplay', { detail: ms, bubbles: true }));
    };
  }

  function draw(el) {
    if (!window.Vex) { el.innerHTML = ''; return; }
    const VF = Vex.Flow;
    const cfg = JSON.parse(el.dataset.staff);
    if (cfg.pattern) return drawPattern(el, cfg, VF);
    if (cfg.calendar) return drawCalendar(el, cfg, VF);
    if (cfg.sight) return drawSight(el, cfg, VF);
    if (cfg.piece) return drawPiece(el, cfg, VF);
    const W = Math.max(260, el.clientWidth || 340);
    const keySig = vexKeySig(cfg.key);
    const ksCount = Math.abs(VF.keySignature(keySig).length);
    const head = 58 + ksCount * 9;
    // 每行几小节：谱面自己指定 > 用户手调（全局，2 / 3 / 4）> 按宽度自动
    const perRow = cfg.perRow || (typeof window !== 'undefined' && window.HX_PERROW) || Math.max(1, Math.min(4, Math.floor((W - head) / (cfg.minBar || 140))));
    const rows = [];
    for (let i = 0; i < cfg.bars.length; i += perRow) rows.push(cfg.bars.slice(i, i + perRow));
    const ROW_H = cfg.numerals === false ? 190 : 205, TOP = 34;
    el.innerHTML = '';
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG);
    r.resize(W, rows.length * ROW_H + 6);
    const ctx = r.getContext();
    const ink = css('--ink'), mute = css('--mute'), acc = css('--acc');
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    let idx = 0, barNo = 0;
    const cols = [], boxes = [];
    rows.forEach((row, ri) => {
      const y = ri * ROW_H + TOP;
      const avail = W - 2 - head;
      const bw = avail / row.length;
      let x = 1;
      row.forEach((bar, bi) => {
        const w = bi === 0 ? bw + head : bw;
        const tr = new VF.Stave(x, y, w), bs = new VF.Stave(x, y + 74, w);
        if (bi === 0) {
          tr.addClef('treble').addKeySignature(keySig);
          bs.addClef('bass').addKeySignature(keySig);
          if (ri === 0 && cfg.time) { tr.addTimeSignature('4/4'); bs.addTimeSignature('4/4'); }
        }
        [tr, bs].forEach(s => s.setStyle({ strokeStyle: mute, fillStyle: ink }));
        tr.setContext(ctx).draw(); bs.setContext(ctx).draw();
        // 小节号：和原谱对齐（cfg.start = 这一段第一小节的号）
        if (cfg.start != null) {
          const n = cfg.start + barNo; const bx = bi === 0 ? x + head - 8 : x + 3;
          ctx.save(); ctx.setFont('sans-serif', 10, 'normal'); ctx.setFillStyle(mute); ctx.fillText(String(n), bx, y + 8);
          // 小 ▶：从这一小节播放到结尾
          // 小三角（画出来的，不用 ▶ 字符）：从这一小节播放到结尾
          const mx = bx - 11, ty = y + 1.5, sz = 6.5;
          ctx.setFillStyle(mute); ctx.save(); if (ctx.setGlobalAlpha) ctx.setGlobalAlpha(document.body.classList.contains('nolab') ? 0.7 : 0.45);
          ctx.beginPath(); ctx.moveTo(mx, ty); ctx.lineTo(mx, ty + sz); ctx.lineTo(mx + sz * 0.9, ty + sz / 2); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.restore();
          boxes.push({ n, x: bi === 0 ? x + head - 10 : x, y: y - 20, w: bi === 0 ? w - head + 10 : w, h: 170, mx, my: y + 4 });
        }
        barNo++;
        if (bi === 0) {
          new VF.StaveConnector(tr, bs).setType('brace').setContext(ctx).draw();
          new VF.StaveConnector(tr, bs).setType('singleLeft').setContext(ctx).draw();
        }
        new VF.StaveConnector(tr, bs).setType(ri === rows.length - 1 && bi === row.length - 1 && cfg.end ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();

        const durs = DUR[Math.min(4, bar.length)] || bar.map(() => 'q');
        const tn = [], bn = [];
        bar.forEach((sym, ci) => {
          const d = durs[ci] || 'q', i = idx++;
          const hidden = cfg.hide && cfg.hide.includes(i);
          const hl = cfg.mark === i;
          const lab = window.HX_LABEL ? window.HX_LABEL : (x, k) => { const an = T.analyze(x, k); return an ? an.numeral : ''; };
          if (hidden) {
            const t = new VF.StaveNote({ keys: ['b/4'], duration: d + 'r', clef: 'treble' });
            const b = new VF.StaveNote({ keys: ['d/3'], duration: d + 'r', clef: 'bass' });
            const mode = cfg.hideMode || 'all';
            const topTxt = mode === 'names' ? T.disp(sym) : mode === 'degree' ? '' : '?';
            if (topTxt) t.addModifier(new VF.Annotation(topTxt).setFont('sans-serif', mode === 'all' ? 14 : 12, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP), 0);
            if (mode !== 'all' && cfg.key) b.addModifier(new VF.Annotation(lab(sym, cfg.key)).setFont('Times New Roman, serif', 13, 'normal').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
            const col = hl ? acc : mute;
            [t, b].forEach(n => n.setStyle({ fillStyle: col, strokeStyle: col }));
            tn.push(t); bn.push(b);
            return;
          }
          let t, b;
          if (cfg.exact) {
            // 和键盘完全一致：同样的音，中央 C 以上写高音谱表，以下写低音谱表
            const vs = (cfg.notes ? cfg.notes.slice() : T.voicing(T.parseChord(sym))).sort((x, y) => x.midi - y.midi);
            // 按手分谱表：右手永远在高音谱表，左手永远在低音谱表（没有手的信息时按中央 C 分）
            const isL = n => (n.lh != null ? !!n.lh : n.midi < 60);
            const hi = vs.filter(n => !isL(n)).map(n => vexKey(n.name, n.midi)), lo = vs.filter(isL).map(n => vexKey(n.name, n.midi));
            t = hi.length ? new VF.StaveNote({ keys: hi, duration: d, clef: 'treble', auto_stem: true }) : new VF.GhostNote({ duration: d });
            b = lo.length ? new VF.StaveNote({ keys: lo, duration: d, clef: 'bass', auto_stem: true }) : new VF.GhostNote({ duration: d });
          } else {
            const p = parts(sym);
            t = new VF.StaveNote({ keys: p.rh, duration: d, clef: 'treble', auto_stem: true });
            b = new VF.StaveNote({ keys: p.lh, duration: d, clef: 'bass', auto_stem: true });
          }
          const top = new VF.Annotation(T.disp(sym)).setFont('sans-serif', 12, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
          if (!cfg.hideName) (t instanceof VF.StaveNote ? t : b).addModifier(top, 0);
          if (cfg.numerals !== false && cfg.key) {
            const lb = lab(sym, cfg.key);
            if (lb) b.addModifier(new VF.Annotation(lb).setFont('Times New Roman, serif', 13, 'normal').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
          }
          if (hl) [t, b].forEach(n => n.setStyle && n.setStyle({ fillStyle: acc, strokeStyle: acc }));
          tn.push(t); bn.push(b);
        });
        const tv = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables(tn);
        const bv = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables(bn);
        VF.Accidental.applyAccidentals([tv], keySig);
        VF.Accidental.applyAccidentals([bv], keySig);
        const fmt = new VF.Formatter();
        fmt.joinVoices([tv]).joinVoices([bv]);
        const ns = Math.max(tr.getNoteStartX(), bs.getNoteStartX());
        tr.setNoteStartX(ns); bs.setNoteStartX(ns);
        fmt.format([tv, bv], Math.max(40, x + w - ns - 14));
        tv.draw(ctx, tr); bv.draw(ctx, bs);
        const rowY = [y - TOP + 2, y - TOP + ROW_H];
        tn.forEach(n => collect(cols, n, rowY)); bn.forEach(n => { try { const ks = n.getKeys ? n.getKeys() : n.keys; const x = n.getAbsoluteX(); const col = cols.find(c => Math.abs(c.x - x) < 14 && c.y0 === rowY[0]); if (col && ks && n.getYs && !(n.isRest && n.isRest())) n.getYs().forEach((yy, i) => { const m = vexMidi(ks[i]); if (m != null) col.heads.push({ y: yy, m }); }); else collect(cols, n, rowY); } catch (e) {} });
        x += w;
      });
    });
    const svg = el.querySelector('svg');
    if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${rows.length * ROW_H + 6}`); svg.style.width = '100%'; svg.style.height = 'auto'; el.style.width = el.style.height = ''; }
    el.__boxes = boxes; el.__W = W;
    clickable(el, cols, W, rows.length * ROW_H + 6, boxes);
  }

  // 伴奏型：一小节低音谱表，写出左手实际要弹的每个音
  function drawPattern(el, cfg, VF) {
    const W = Math.max(260, el.clientWidth || 340), H = 150;
    el.innerHTML = '';
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG); r.resize(W, H);
    const ctx = r.getContext();
    const ink = css('--ink'), mute = css('--mute'), acc = css('--acc');
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    const st = new VF.Stave(1, 22, W - 3).addClef('bass').addTimeSignature(cfg.beats + '/4');
    st.setStyle({ strokeStyle: mute, fillStyle: ink }); st.setContext(ctx).draw();
    const DUR = { 0.5: '8', 1: 'q', 2: 'h', 3: 'hd', 4: 'w' };
    const notes = cfg.events.map((e, i) => {
      const keys = e.keys.slice().sort((a, b) => a.midi - b.midi).map(k => vexKey(k.name, k.midi));
      const d = DUR[e.d] || 'q';
      const n = new VF.StaveNote({ keys, duration: d, clef: 'bass', auto_stem: true });
      if (d === 'hd') n.addModifier(new VF.Dot(), 0), keys.forEach((_, ki) => ki && n.addModifier(new VF.Dot(), ki));
      n.addModifier(new VF.Annotation(e.label).setFont('sans-serif', 11, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
      if (cfg.mark === i) n.setStyle({ fillStyle: acc, strokeStyle: acc });
      return n;
    });
    const v = new VF.Voice({ num_beats: cfg.beats, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables(notes);
    VF.Accidental.applyAccidentals([v], 'C');
    const beams = VF.Beam.generateBeams(notes);
    new VF.Formatter().joinVoices([v]).format([v], W - st.getNoteStartX() - 16);
    v.draw(ctx, st); beams.forEach(b => b.setContext(ctx).draw());
    const pcols = []; notes.forEach(n => collect(pcols, n));
    const top = new VF.Annotation(T.disp(cfg.sym));
    ctx.save(); ctx.setFont('sans-serif', 13, 'bold'); ctx.fillText(T.disp(cfg.sym) + ' 和弦 · ' + cfg.name, 6, 14); ctx.restore();
    const svg = el.querySelector('svg'); if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.width = '100%'; svg.style.height = 'auto'; el.style.width = el.style.height = ''; }
    clickable(el, pcols, W, H);
  }


  // 视奏：一行（高音 / 低音）或大谱表，一组全音符；cfg.ev = [{t:['c/4'], b:['g/2']}]，
  // cfg.mark = 正在读的那个（橙色），cfg.done = 已经弹对的个数（变灰并在下面写音名），cfg.names = 音名
  function drawSight(el, cfg, VF) {
    const grand = cfg.clef === 'grand', W = Math.max(260, el.clientWidth || 340), H = grand ? 290 : 150;
    el.innerHTML = '';
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG); r.resize(W, H);
    const ctx = r.getContext();
    const ink = css('--ink'), mute = css('--mute'), acc = css('--acc');
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    const ks = cfg.key && cfg.key !== 'C' ? cfg.key : null;
    const mk = (y, clef) => { const st = new VF.Stave(14, y, W - 18).addClef(clef); if (ks) st.addKeySignature(ks); st.setStyle({ strokeStyle: mute, fillStyle: ink }); return st; };
    const top = mk(grand ? 44 : 34, grand || cfg.clef === 'treble' ? 'treble' : 'bass');
    const bot = grand ? mk(154, 'bass') : null;
    top.setContext(ctx).draw(); if (bot) {
      bot.setContext(ctx).draw();
      new VF.StaveConnector(top, bot).setType('brace').setContext(ctx).draw();
      new VF.StaveConnector(top, bot).setType('singleLeft').setContext(ctx).draw();
      new VF.StaveConnector(top, bot).setType('singleRight').setContext(ctx).draw();
    }
    const evs = cfg.ev || [];
    const color = (n, i) => { const c = cfg.colors && cfg.colors[i] ? cfg.colors[i] : i < (cfg.done || 0) ? mute : i === cfg.mark ? acc : ink; n.setStyle({ fillStyle: c, strokeStyle: c }); };
    const mkNotes = (side, clef) => evs.map((e, i) => {
      const keys = e[side] || [];
      if (!keys.length) return new VF.GhostNote({ duration: 'w' });
      const n = new VF.StaveNote({ keys, duration: 'w', clef });
      color(n, i);
      if (cfg.names && i < (cfg.done || 0) && (side === 'b' || !grand || !(e.b || []).length)) n.addModifier(new VF.Annotation(cfg.names[i]).setFont('sans-serif', 13, 'normal').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
      return n;
    });
    const voices = [], staves = [];
    const tn = mkNotes(grand ? 't' : (cfg.clef === 'bass' ? 'b' : 't'), grand || cfg.clef === 'treble' ? 'treble' : 'bass');
    voices.push(new VF.Voice({ num_beats: 4 * Math.max(1, evs.length), beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables(tn)); staves.push(top);
    if (grand) { const bn = mkNotes('b', 'bass'); voices.push(new VF.Voice({ num_beats: 4 * Math.max(1, evs.length), beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables(bn)); staves.push(bot); }
    voices.forEach(v => VF.Accidental.applyAccidentals([v], ks || 'C'));
    const fm = new VF.Formatter(); voices.forEach(v => fm.joinVoices([v]));
    fm.format(voices, W - 18 - top.getNoteStartX() - 24);
    voices.forEach((v, i) => v.draw(ctx, staves[i]));
    const cols = []; voices.forEach(v => v.getTickables().forEach(n => collect(cols, n)));
    const svg = el.querySelector('svg'); if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.width = '100%'; svg.style.height = 'auto'; el.style.width = el.style.height = ''; }
    if (cfg.tap) clickable(el, cols, W, H);
  }

  // 视奏小曲：8 小节大谱表，带节奏、附点、休止、连梁、临时记号、力度、连线、跳音
  // 画完把每个音的横坐标存在 el.__pos（给光标和成绩上色用），每小节的框存在 el.__bars
  const PDUR = { 4: 'w', 3: 'hd', 2: 'h', 1.5: 'qd', 1: 'q', 0.75: '8d', 0.5: '8', 0.25: '16' };
  function drawPiece(el, cfg, VF) {
    const P = cfg.piece, W = Math.max(300, el.clientWidth || 360);
    const perRow = cfg.perRow || (W >= 640 ? 4 : 2), rows = Math.ceil(P.bars.length / perRow);
    const ROW_H = 220, TOP = 46, H = TOP + rows * ROW_H;
    el.innerHTML = '';
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG); r.resize(W, H);
    const ctx = r.getContext();
    const ink = css('--ink'), mute = css('--mute');
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    const keySig = vexKeySig(P.key), ks = Math.abs(VF.keySignature(keySig).length);
    const [num, den] = P.time.split('/').map(Number);
    const headRow = 40 + ks * 10, head0 = headRow + 26;
    ctx.save(); ctx.setFont('serif', 15, 'bold'); ctx.fillText(P.tempo.text, 16, 20); let tw = P.tempo.text.length * 8.6; try { tw = ctx.measureText(P.tempo.text).width; } catch (e) {} ctx.setFont('serif', 14, 'normal'); ctx.fillText(P.tempo.mark, 16 + tw + 10, 20); ctx.restore();
    const pos = [], boxes = [];
    const showNames = new Set(cfg.names || []), hot = new Set(cfg.hot || []), nameKeys = new Set(cfg.nameKeys || []);
    const accC = css('--acc');
    const mkNote = (e, clef, bi, i) => {
      const key = bi + ':' + (clef === 'treble' ? 'r' : 'l') + ':' + i;
      const keys = e.rest ? [clef === 'treble' ? 'b/4' : 'd/3'] : e.notes.map(n => n.vex);
      const d = PDUR[e.d] || 'q';
      const n = new VF.StaveNote({ keys, duration: d + (e.rest ? 'r' : ''), clef, auto_stem: !e.rest });
      if (/d$/.test(d)) VF.Dot.buildAndAttach([n], { all: true });
      if (e.stac) n.addModifier(new VF.Articulation('a.').setPosition(VF.Modifier.Position.ABOVE), 0);
      if (!e.rest && hot.has(key)) n.setStyle({ fillStyle: accC, strokeStyle: accC });
      if (!e.rest && (showNames.has(bi) || nameKeys.has(key))) n.addModifier(new VF.Annotation(e.notes.map(x => x.name + x.oct).join(' ')).setFont('sans-serif', 10, 'normal').setVerticalJustification(clef === 'treble' ? VF.Annotation.VerticalJustify.TOP : VF.Annotation.VerticalJustify.BOTTOM), 0);
      return n;
    };
    for (let ri = 0; ri < rows; ri++) {
      const y = TOP + ri * ROW_H, rowBars = P.bars.slice(ri * perRow, ri * perRow + perRow);
      const extra = ri === 0 ? head0 : headRow, bw = (W - 18 - extra) / perRow;
      let x = 14;
      const rowRH = [];
      rowBars.forEach((bar, k) => {
        const bi = ri * perRow + k, w = k === 0 ? bw + extra : bw;
        const tr = new VF.Stave(x, y, w), bs = new VF.Stave(x, y + 100, w);
        if (k === 0) { tr.addClef('treble').addKeySignature(keySig); bs.addClef('bass').addKeySignature(keySig); if (ri === 0) { tr.addTimeSignature(P.time); bs.addTimeSignature(P.time); } }
        if (bi === P.bars.length - 1) { tr.setEndBarType(VF.Barline.type.END); bs.setEndBarType(VF.Barline.type.END); }
        [tr, bs].forEach(st => { st.setStyle({ strokeStyle: mute, fillStyle: ink }); st.setContext(ctx).draw(); });
        if (k === 0) { new VF.StaveConnector(tr, bs).setType('brace').setContext(ctx).draw(); new VF.StaveConnector(tr, bs).setType('singleLeft').setContext(ctx).draw(); }
        new VF.StaveConnector(tr, bs).setType(bi === P.bars.length - 1 ? 'boldDoubleRight' : 'singleRight').setContext(ctx).draw();
        if (k === 0 && bi > 0) { ctx.save(); ctx.setFont('sans-serif', 10, 'normal'); ctx.setFillStyle(mute); ctx.fillText(String(bi + 1), x + 2, tr.getYForLine(0) - 8); ctx.restore(); }
        const rn = bar.rh.map((e, i) => mkNote(e, 'treble', bi, i)), ln = bar.lh.map((e, i) => mkNote(e, 'bass', bi, i));
        const vr = new VF.Voice({ num_beats: num, beat_value: den }).setMode(VF.Voice.Mode.SOFT).addTickables(rn);
        const vl = new VF.Voice({ num_beats: num, beat_value: den }).setMode(VF.Voice.Mode.SOFT).addTickables(ln);
        VF.Accidental.applyAccidentals([vr], keySig); VF.Accidental.applyAccidentals([vl], keySig);
        const grp = den === 8 ? { groups: [new VF.Fraction(3, 8)] } : {};
        const beams = VF.Beam.generateBeams(rn.filter(n => !n.isRest()), grp).concat(VF.Beam.generateBeams(ln.filter(n => !n.isRest()), grp));
        const sx = Math.max(tr.getNoteStartX(), bs.getNoteStartX()); tr.setNoteStartX(sx); bs.setNoteStartX(sx);
        new VF.Formatter().joinVoices([vr]).joinVoices([vl]).format([vr, vl], tr.getNoteEndX() - sx - 14);
        vr.draw(ctx, tr); vl.draw(ctx, bs); beams.forEach(b => b.setContext(ctx).draw());
        bar.rh.forEach((e, i) => pos.push({ bar: bi, h: 'r', t: e.t, x: rn[i].getAbsoluteX(), rest: !!e.rest }));
        bar.lh.forEach((e, i) => pos.push({ bar: bi, h: 'l', t: e.t, x: ln[i].getAbsoluteX() }));
        const top = tr.getYForLine(0) - 14, bot = bs.getYForLine(4) + 14;
        boxes.push({ bar: bi, x, w, y: top, h: bot - top, sx, ex: tr.getNoteEndX() });
        // 力度（两行谱之间）、cresc.、rit.
        const mid = tr.getYForLine(4) + 34;
        if (P.dyn && P.dyn[bi]) { ctx.save(); ctx.setFont('serif', 17, 'bold italic'); ctx.fillText(P.dyn[bi], sx - 4, mid); ctx.restore(); }
        if (P.cresc === bi) { ctx.save(); ctx.setFont('serif', 13, 'italic'); ctx.fillText('cresc.', sx, mid); ctx.restore(); }
        if (P.rit && bi === P.bars.length - 1) { ctx.save(); ctx.setFont('serif', 13, 'italic'); ctx.fillText('rit.', sx, tr.getYForLine(0) - 22); ctx.restore(); }
        rowRH.push({ bi, notes: rn.filter(n => !n.isRest()) });
        x += w;
      });
      // 连线：两小节一句（在同一行里才画）
      for (let k = 0; k + 1 < rowRH.length; k += 2) {
        const a = rowRH[k], b = rowRH[k + 1];
        if (a.bi % 2 || !a.notes.length || !b.notes.length) continue;
        try { new VF.Curve(a.notes[0], b.notes[b.notes.length - 1], { cps: [{ x: 0, y: 14 }, { x: 0, y: 14 }] }).setContext(ctx).draw(); } catch (e) {}
      }
    }
    const svg = el.querySelector('svg'); if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.width = '100%'; svg.style.height = 'auto'; el.style.width = el.style.height = ''; }
    el.__pos = pos; el.__bars = boxes; el.__W = W; el.__H = H;
    el.dispatchEvent(new CustomEvent('piecedrawn', { bubbles: true }));
  }

  // 五线谱日历：一周一行，一天一小节；音高 = 练习时长，实心 = 4 步完成，空心 = 部分，休止符 = 休息日，橙色双竖线 = 背下一首
  const CAL_KEYS = ['e/4', 'f/4', 'g/4', 'a/4', 'b/4', 'c/5', 'd/5', 'e/5', 'f/5'];
  const CAL_MIN = [1, 3, 6, 10, 15, 20, 30, 45, 60];
  function mix(c1, c2, t) {
    const p = c => { const m = c.match(/^#([0-9a-f]{6})$/i); return m ? [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128]; };
    const a = p(c1), b = p(c2); return 'rgb(' + a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',') + ')';
  }
  function drawCalendar(el, cfg, VF) {
    // 月历：整张谱按比例缩小（虚拟宽度放大 1.75 倍再缩回屏幕宽），一个月大约一屏；日期数字单独加大保证看得清
    const compact = cfg.compact, K = compact ? 1 : 1.75;
    const W = Math.max(280, el.clientWidth || 340) * K;
    const ROW = compact ? 92 : 100, TOP = 4, head = 42;
    const H = cfg.weeks.length * ROW + 6;
    el.innerHTML = '';
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG); r.resize(W, H);
    const ctx = r.getContext();
    const ink = css('--ink'), mute = css('--mute'), acc = css('--acc'), line = css('--line');
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    const mw = (W - 2 - head) / 7, hits = [];
    cfg.weeks.forEach((week, wi) => {
      const y = wi * ROW + TOP;
      let x = 1;
      week.forEach((dd, di) => {
        const w = di === 0 ? mw + head : mw;
        const st = new VF.Stave(x, y, w);
        if (di === 0) st.addClef('treble');
        st.setStyle({ strokeStyle: dd.other ? line : mute, fillStyle: ink });
        st.setContext(ctx).draw();
        let n;
        if (dd.future) n = new VF.GhostNote({ duration: 'w' });
        else if (!dd.active) n = new VF.StaveNote({ keys: ['b/4'], duration: 'wr', clef: 'treble' });
        else {
          let lv = 0; CAL_MIN.forEach((m, i) => { if (dd.min >= m) lv = i; });
          n = new VF.StaveNote({ keys: [CAL_KEYS[lv]], duration: dd.full ? 'q' : 'h', clef: 'treble', stem_direction: lv >= 4 ? -1 : 1 });
          const col = mix(mute.startsWith('#') ? mute : '#8a8880', acc.startsWith('#') ? acc : '#e8541e', 0.25 + 0.75 * lv / 8);
          n.setStyle({ fillStyle: col, strokeStyle: col });
        }
        if (n.setStyle && (dd.other)) n.setStyle({ fillStyle: line, strokeStyle: line });
        const v = new VF.Voice({ num_beats: 4, beat_value: 4 }).setMode(VF.Voice.Mode.SOFT).addTickables([n]);
        const ns = st.getNoteStartX();
        new VF.Formatter().joinVoices([v]).format([v], Math.max(10, x + w - ns - 10));
        v.draw(ctx, st);
        if (dd.piece) { ctx.save(); ctx.setFillStyle(acc); ctx.fillRect(x + w - 6, y + 40, 1.5, 40); ctx.fillRect(x + w - 2.5, y + 40, 2.5, 40); ctx.restore(); }
        const fs = compact ? 10 : 17, cx = (di === 0 ? x + head : x) + (w - (di === 0 ? head : 0)) / 2;
        ctx.save(); ctx.setFont('sans-serif', fs, dd.today ? 'bold' : 'normal'); ctx.setFillStyle(dd.today ? acc : dd.other ? line : mute);
        ctx.fillText(String(dd.label), cx - fs * 0.4 * String(dd.label).length, y + 94 - (compact ? 6 : 0) + (compact ? 0 : 2)); ctx.restore();
        if (dd.today) { ctx.save(); ctx.setFillStyle(acc); ctx.fillRect(cx - fs * 0.7, y + 97 - (compact ? 6 : 0) + (compact ? 0 : 4), fs * 1.4, compact ? 1.5 : 2.5); ctx.restore(); }
        hits.push({ x0: x + (di === 0 ? head : 0), x1: x + w, y0: y, y1: y + ROW, ds: dd.ds });
        x += w;
      });
    });
    const svg = el.querySelector('svg'); if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.width = '100%'; svg.style.height = 'auto'; el.style.width = el.style.height = ''; svg.style.cursor = 'pointer'; }
    el.onclick = e => {
      const rc = svg.getBoundingClientRect(), sx = (e.clientX - rc.left) * W / rc.width, sy = (e.clientY - rc.top) * H / rc.height;
      const h = hits.find(t => sx >= t.x0 && sx <= t.x1 && sy >= t.y0 && sy <= t.y1);
      if (h) { e.preventDefault(); el.dispatchEvent(new CustomEvent('calpick', { detail: h.ds, bubbles: true })); }
    };
  }

  function mount(root = document) {
    root.querySelectorAll('div.staff:not([data-done])').forEach(el => {
      el.dataset.done = 1;
      try { draw(el); } catch (e) { el.innerHTML = ''; console.warn('staff', e); }
    });
  }
  function redrawAll() { document.querySelectorAll('div.staff[data-done]').forEach(el => { try { draw(el); } catch (e) {} }); }
  const html = cfg => `<div class="staff" data-staff='${JSON.stringify(cfg).replace(/'/g, '&#39;')}'></div>`;

  if (typeof window !== 'undefined') {
    new MutationObserver(() => mount()).observe(document.documentElement, { childList: true, subtree: true });
    let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(redrawAll, 150); });
    if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', redrawAll);
  }
  return { html, mount, parts, draw };
})();
