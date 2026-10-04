/* 叮咚！便利店 — 音效與音樂（WebAudio 即時合成，不需要任何音檔） */
(function (root) {
  'use strict';
  let ctx = null, master = null, musicGain = null;
  let sfxOn = true, musicOn = true;
  let timer = null, step = 0, nextTime = 0, lastCash = 0, lastDing = 0;

  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function tone(freq, start, dur, type, vol, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(dest || master);
    o.start(start); o.stop(start + dur + 0.02);
  }
  function sfx(fn) { if (!sfxOn || !ensure() || ctx.state !== 'running') return; fn(ctx.currentTime); }

  // 音名 → 頻率（例如 'A4' = 440）
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function hz(name) {
    const m = /^([A-G])(#|b)?(\d)$/.exec(name);
    const midi = 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  const N = {};
  ['C5', 'E5', 'G5', 'C6', 'E6', 'E4', 'B4'].forEach(function (n) { N[n] = hz(n); });

  /* 三首原創的小調子，一個班一首，換班時音樂跟著換：
   *   早班——明亮輕快；晚班——放鬆的中板；大夜——又慢又安靜。
   * lead 以八分音符為一格（0 = 休止），bass 每四格換一個音。 */
  const TUNES = [
    { step: 0.19, wave: 'square', vol: 0.22, hold: 0.9, bassVol: 0.5, bounce: true,
      lead: [
        'E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'A5', 'G5',   'F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'G5', 0,
        'E5', 'G5', 'C6', 'E6', 'D6', 'C6', 'B5', 'G5',   'A5', 'B5', 'C6', 'D6', 'C6', 0, 0, 0,
        'A5', 'C6', 'A5', 'F5', 'A5', 'C6', 'D6', 'C6',   'G5', 'B5', 'G5', 'D5', 'G5', 'B5', 'D6', 0,
        'C6', 'B5', 'A5', 'G5', 'A5', 'G5', 'E5', 'D5',   'C5', 'E5', 'G5', 'E5', 'C5', 0, 0, 0,
      ],
      bass: ['C3', 'C3', 'F3', 'F3', 'C3', 'C3', 'F3', 'G3', 'F3', 'F3', 'G3', 'G3', 'A3', 'E3', 'C3', 'C3'] },
    { step: 0.235, wave: 'triangle', vol: 0.42, hold: 1.25, bassVol: 0.42, bounce: true,
      lead: [
        'A4', 'C5', 'E5', 'C5', 'A4', 'C5', 'D5', 'E5',   'G5', 'E5', 'D5', 'C5', 'D5', 0, 0, 0,
        'F4', 'A4', 'C5', 'A4', 'F4', 'A4', 'C5', 'D5',   'E5', 'D5', 'C5', 'B4', 'C5', 0, 0, 0,
        'A4', 'C5', 'E5', 'G5', 'A5', 'G5', 'E5', 'C5',   'D5', 'F5', 'A5', 'F5', 'E5', 'D5', 'C5', 0,
        'B4', 'D5', 'G5', 'D5', 'B4', 'D5', 'E5', 'D5',   'C5', 'E5', 'A4', 0, 'A4', 0, 0, 0,
      ],
      bass: ['A2', 'A2', 'C3', 'G2', 'F2', 'F2', 'C3', 'C3', 'A2', 'A2', 'D3', 'D3', 'G2', 'G2', 'A2', 'A2'] },
    { step: 0.33, wave: 'sine', vol: 0.4, hold: 2.6, bassVol: 0.3, bounce: false,
      lead: [
        'E4', 0, 'G4', 0, 'B4', 0, 'A4', 0,   'G4', 0, 'E4', 0, 0, 0, 0, 0,
        'D4', 0, 'G4', 0, 'A4', 0, 'B4', 0,   'A4', 0, 0, 0, 'G4', 0, 0, 0,
        'E4', 0, 'B4', 0, 'D5', 0, 'B4', 0,   'A4', 0, 'G4', 0, 0, 0, 0, 0,
        'G4', 0, 'A4', 0, 'G4', 0, 'E4', 0,   'D4', 0, 'E4', 0, 0, 0, 0, 0,
      ],
      bass: ['E2', 'E2', 'C3', 'C3', 'G2', 'G2', 'D3', 'D3', 'E2', 'E2', 'A2', 'A2', 'C3', 'C3', 'E2', 'E2'] },
  ];
  TUNES.forEach(function (t) {
    t.lead = t.lead.map(function (n) { return n ? hz(n) : 0; });
    t.bass = t.bass.map(hz);
  });
  let tune = 0;
  function schedule() {
    if (!ctx || !musicOn) return;
    const T = TUNES[tune];
    while (nextTime < ctx.currentTime + 0.3) {
      const i = step % T.lead.length;
      if (T.lead[i]) tone(T.lead[i], nextTime, T.step * T.hold, T.wave, T.vol, musicGain);
      if (T.bounce ? i % 2 === 0 : i % 4 === 0) {
        const b = T.bass[Math.floor(i / 4) % T.bass.length];
        tone(b * (T.bounce && i % 4 !== 0 ? 1.5 : 1), nextTime, T.step * (T.bounce ? 1.6 : 3.6), 'triangle', T.bassVol, musicGain);
      }
      step++;
      nextTime += T.step;
    }
  }
  function startMusic() {
    if (!musicOn || !ensure() || timer) return;
    nextTime = ctx.currentTime + 0.05;
    timer = setInterval(schedule, 100);
  }
  function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }

  root.DD_AUDIO = {
    unlock: function () { if (ensure() && ctx.state === 'suspended') ctx.resume(); if (musicOn) startMusic(); },
    suspend: function () { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume: function () { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setSfx: function (v) { sfxOn = !!v; },
    setMusic: function (v) { musicOn = !!v; if (!musicOn) stopMusic(); else if (ctx) startMusic(); },
    /** 換班：換成那一班的音樂。announce 為 true 時先響一聲換班提示音。 */
    setShift: function (i, announce) {
      i = Math.max(0, Math.min(TUNES.length - 1, i | 0));
      if (i === tune) return false;
      tune = i; step = 0;
      if (ctx) nextTime = Math.max(nextTime, ctx.currentTime + (announce ? 0.75 : 0.05));
      if (announce) sfx(function (t) {
        const seq = [[N.C5, N.E5, N.G5, N.C6], [N.C6, N.G5, N.E5, N.C5], [N.E5, N.B4, N.E4]][i];
        seq.forEach(function (f, j) { tone(f, t + j * 0.15, 0.3, 'sine', 0.3); });
      });
      return true;
    },
    get shift() { return tune; },
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    // 叮咚：自動門的兩聲
    ding: function () { sfx(function (t) { if (t - lastDing < 2.2) return; lastDing = t; tone(N.E6, t, 0.22, 'sine', 0.35); tone(N.C6, t + 0.2, 0.4, 'sine', 0.35); }); },
    cash: function () { sfx(function (t) { if (t - lastCash < 0.12) return; lastCash = t; tone(1568, t, 0.05, 'square', 0.12); tone(2093, t + 0.05, 0.09, 'square', 0.12); }); },
    click: function () { sfx(function (t) { tone(880, t, 0.04, 'square', 0.1); }); },
    bad: function () { sfx(function (t) { tone(196, t, 0.16, 'sawtooth', 0.16); tone(147, t + 0.14, 0.25, 'sawtooth', 0.16); }); },
    event: function () { sfx(function (t) { [N.C5, N.E5, N.G5, N.C6].forEach(function (f, i) { tone(f, t + i * 0.07, 0.12, 'square', 0.16); }); }); },
    good: function () { sfx(function (t) { [N.G5, N.C6, N.E6].forEach(function (f, i) { tone(f, t + i * 0.09, 0.18, 'square', 0.16); }); tone(N.G5 * 2, t + 0.3, 0.4, 'square', 0.14); }); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
