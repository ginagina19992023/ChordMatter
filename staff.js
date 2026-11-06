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
      lh: [vexKey(b.name, bm), vexKey(b.name, bm + 12)].slice(0, bm + 12 <= 59 ? 2 : 1),
    };
  }
  const DUR = { 1: ['w'], 2: ['h', 'h'], 3: ['q', 'q', 'h'], 4: ['q', 'q', 'q', 'q'] };

  function vexKeySig(key) {
    const k = T.parseKey(key || 'C');
    if (!k) return 'C';
    return k.tonic.name + (k.minor ? 'm' : '');
  }

  function draw(el) {
    if (!window.Vex) { el.innerHTML = ''; return; }
    const VF = Vex.Flow;
    const cfg = JSON.parse(el.dataset.staff);
    if (cfg.pattern) return drawPattern(el, cfg, VF);
    const W = Math.max(260, el.clientWidth || 340);
    const keySig = vexKeySig(cfg.key);
    const ksCount = Math.abs(VF.keySignature(keySig).length);
    const head = 58 + ksCount * 9;
    const perRow = cfg.perRow || Math.max(1, Math.min(4, Math.floor((W - head) / (cfg.minBar || 140))));
    const rows = [];
    for (let i = 0; i < cfg.bars.length; i += perRow) rows.push(cfg.bars.slice(i, i + perRow));
    const ROW_H = cfg.numerals === false ? 190 : 205, TOP = 34;
    el.innerHTML = '';
    const r = new VF.Renderer(el, VF.Renderer.Backends.SVG);
    r.resize(W, rows.length * ROW_H + 6);
    const ctx = r.getContext();
    const ink = css('--ink'), mute = css('--mute'), acc = css('--acc');
    ctx.setFillStyle(ink); ctx.setStrokeStyle(ink);
    let idx = 0;
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
          const p = parts(sym);
          const t = new VF.StaveNote({ keys: p.rh, duration: d, clef: 'treble', auto_stem: true });
          const b = new VF.StaveNote({ keys: p.lh, duration: d, clef: 'bass', auto_stem: true });
          const top = new VF.Annotation(T.disp(sym)).setFont('sans-serif', 12, 'bold').setVerticalJustification(VF.Annotation.VerticalJustify.TOP);
          if (!cfg.hideName) t.addModifier(top, 0);
          if (cfg.numerals !== false && cfg.key) {
            const lb = lab(sym, cfg.key);
            if (lb) b.addModifier(new VF.Annotation(lb).setFont('Times New Roman, serif', 13, 'normal').setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM), 0);
          }
          if (hl) [t, b].forEach(n => n.setStyle({ fillStyle: acc, strokeStyle: acc }));
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
        x += w;
      });
    });
    const svg = el.querySelector('svg');
    if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${rows.length * ROW_H + 6}`); svg.style.width = '100%'; svg.style.height = 'auto'; }
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
    const top = new VF.Annotation(T.disp(cfg.sym));
    ctx.save(); ctx.setFont('sans-serif', 13, 'bold'); ctx.fillText(T.disp(cfg.sym) + ' 和弦 · ' + cfg.name, 6, 14); ctx.restore();
    const svg = el.querySelector('svg'); if (svg) { svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.width = '100%'; svg.style.height = 'auto'; }
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
