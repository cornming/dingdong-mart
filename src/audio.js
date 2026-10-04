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

  const N = { C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196, A3: 220, B3: 246.94,
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77, C6: 1046.5, D6: 1174.66, E6: 1318.51 };
  // 原創的輕快小調子：16 小節、八分音符為一格（0 = 休止）
  const LEAD = [
    'E5', 'G5', 'C6', 'G5', 'E5', 'G5', 'A5', 'G5',   'F5', 'A5', 'C6', 'A5', 'F5', 'A5', 'G5', 0,
    'E5', 'G5', 'C6', 'E6', 'D6', 'C6', 'B5', 'G5',   'A5', 'B5', 'C6', 'D6', 'C6', 0, 0, 0,
    'A5', 'C6', 'A5', 'F5', 'A5', 'C6', 'D6', 'C6',   'G5', 'B5', 'G5', 'D5', 'G5', 'B5', 'D6', 0,
    'C6', 'B5', 'A5', 'G5', 'A5', 'G5', 'E5', 'D5',   'C5', 'E5', 'G5', 'E5', 'C5', 0, 0, 0,
  ];
  const BASS = ['C3', 'C3', 'F3', 'F3', 'C3', 'C3', 'F3', 'G3', 'F3', 'F3', 'G3', 'G3', 'A3', 'E3', 'C3', 'C3'];
  const STEP = 0.19;
  function schedule() {
    if (!ctx || !musicOn) return;
    while (nextTime < ctx.currentTime + 0.3) {
      const i = step % LEAD.length;
      if (LEAD[i]) tone(N[LEAD[i]], nextTime, STEP * 0.9, 'square', 0.22, musicGain);
      if (i % 2 === 0) {
        const b = BASS[Math.floor(i / 4) % BASS.length];
        tone(N[b] * (i % 4 === 0 ? 1 : 1.5), nextTime, STEP * 1.6, 'triangle', 0.5, musicGain);
      }
      step++;
      nextTime += STEP;
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
