// 弹奏识别：麦克风 → 频谱 → 起音检测 → 音级（chroma）匹配
// 原理：每次起音时，取「起音后频谱 − 起音前频谱」的正增量，只看新弹下去的音，避免前一个和弦的余音干扰
const Listen = (() => {
  let ctx = null, an = null, stream = null, src = null, timer = null, cb = null;
  let prev = null, hist = [], lastOnset = 0, pending = null, energyAvg = 0;
  const FFT = 8192;

  function chroma(mag, sr) {
    const c = new Array(12).fill(0);
    const binHz = sr / FFT;
    for (let k = Math.ceil(60 / binHz); k < Math.min(mag.length, 4200 / binHz); k++) {
      const v = mag[k]; if (v <= 0) continue;
      const f = k * binHz, m = 12 * Math.log2(f / 440) + 69;
      const pc = ((Math.round(m) % 12) + 12) % 12;
      const w = 1 - Math.min(1, Math.abs(m - Math.round(m)) * 1.6); // 离半音中心越远权重越小
      if (w > 0) c[pc] += v * w * (f < 300 ? 1.4 : 1);
    }
    const s = Math.sqrt(c.reduce((a, b) => a + b * b, 0)) || 1;
    return c.map(x => x / s);
  }
  // 和弦模板：根 1、加上泛音（五度 0.35、大三度 0.15）
  function template(pcs) {
    const t = new Array(12).fill(0);
    pcs.forEach(p => { t[p] += 1; t[(p + 7) % 12] += 0.35; t[(p + 4) % 12] += 0.12; });
    const s = Math.sqrt(t.reduce((a, b) => a + b * b, 0));
    return t.map(x => x / s);
  }
  const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
  function matchChord(ch, pcs) { return cos(ch, template(pcs)); }
  function bestNote(ch) {
    let best = -1, bi = 0;
    for (let p = 0; p < 12; p++) {
      const sc = ch[p] + 0.25 * ch[(p + 7) % 12] - 0.35 * ch[(p + 5) % 12]; // 抑制被当成「五度泛音」的低音
      if (sc > best) { best = sc; bi = p; }
    }
    return bi;
  }

  function tick() {
    const mag = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(mag);
    const lin = mag.map(db => (isFinite(db) ? Math.pow(10, db / 20) : 0));
    let e = 0; const binHz = ctx.sampleRate / FFT;
    for (let k = Math.ceil(60 / binHz); k < 4200 / binHz; k++) e += lin[k];
    const now = performance.now();
    if (pending && now >= pending.at) {
      const d = lin.map((v, i) => Math.max(0, v - pending.base[i]));
      const ch = chroma(d, ctx.sampleRate), full = chroma(lin, ctx.sampleRate);
      cb && cb({ type: 'onset', chroma: ch, full, energy: e });
      pending = null;
    }
    const floor = Listen.floor;
    if (!pending && e > floor && e > energyAvg * 1.45 && now - lastOnset > 140 && prev) {
      lastOnset = now;
      // 取前几帧里能量最低的作为基线
      const base = hist.length ? hist.reduce((a, b) => (a.e < b.e ? a : b)).lin : prev;
      pending = { at: now + 70, base };
    }
    energyAvg = energyAvg * 0.8 + e * 0.2;
    hist.push({ e, lin }); if (hist.length > 4) hist.shift();
    prev = lin;
    cb && cb({ type: 'level', energy: e });
  }

  async function start(audioCtx, onEvent) {
    stop();
    ctx = audioCtx; cb = onEvent;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('nomic');
    // iPhone：音频通道被设成「只播放」时，麦克风打不开。要先切到「播放 + 录音」
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
    catch (e) { if (e && e.name === 'NotAllowedError') throw e; stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } // 有的手机不接受关掉降噪这些参数：退一步用默认参数再试
    if (ctx.state !== 'running') await ctx.resume();
    src = ctx.createMediaStreamSource(stream);
    attach(src);
  }
  // 测试或内部用：直接接一个音频节点
  function attach(node, onEvent) {
    if (onEvent) cb = onEvent;
    ctx = node.context;
    an = ctx.createAnalyser(); an.fftSize = FFT; an.smoothingTimeConstant = 0; an.minDecibels = -110; an.maxDecibels = -10;
    node.connect(an);
    prev = null; hist = []; energyAvg = 0; pending = null;
    timer = setInterval(tick, 30);
  }
  function stop() {
    if (timer) clearInterval(timer); timer = null;
    if (src) try { src.disconnect(); } catch (e) {}
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; src = null; an = null; pending = null;
  }
  const active = () => !!timer;
  return { start, stop, attach, active, matchChord, bestNote, chroma, floor: 0.02 };
})();
