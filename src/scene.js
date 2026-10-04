/* 叮咚！便利店 — 店面畫面（canvas 像素風）。只負責「看起來的樣子」，不影響遊戲數值。 */
(function (root) {
  'use strict';
  const D = root.DD_DATA;
  const E = root.DD;
  const T = 16, W = 192, H = 160, S = 4;
  const FONT = '"Cubic 11", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
  const INK = '#1b1f3b';

  // 設備格位置（格子座標：欄、列），編號與 data.js 的 SLOT_ORDER 對應
  const SLOT_POS = [[1, 1], [3, 1], [5, 1], [7, 1], [9, 1], [1, 4], [4, 4], [7, 4], [10, 4], [4, 6], [7, 6], [10, 6]];
  const DOOR = [6, 9];
  const PAY = [1, 8];

  function blocked(c, r) {
    if (c < 0 || c > 11 || r < 2 || r > 9) return true;
    if (r === 9) return !(c === 6 || c === 7);
    if (r === 4) return !(c === 0 || c === 3 || c === 6 || c === 9);
    if (r === 6) return !(c === 3 || c === 6 || c === 9);
    if (r === 7) return c < 3;
    if (r === 8) return c > 9;
    return false;
  }
  function standTiles(i) {
    const c = SLOT_POS[i][0], r = SLOT_POS[i][1];
    if (r === 1) return [[c, 2], [c + 1, 2]];
    return [[c, r - 1], [c + 1, r - 1], [c, r + 1], [c + 1, r + 1]].filter(function (p) { return !blocked(p[0], p[1]); });
  }
  function bfs(from, to) {
    const key = function (c, r) { return r * 12 + c; };
    const prev = {};
    const q = [from];
    prev[key(from[0], from[1])] = -1;
    while (q.length) {
      const cur = q.shift();
      if (cur[0] === to[0] && cur[1] === to[1]) break;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (let i = 0; i < 4; i++) {
        const c = cur[0] + nb[i][0], r = cur[1] + nb[i][1];
        if (blocked(c, r) || prev[key(c, r)] !== undefined) continue;
        prev[key(c, r)] = cur;
        q.push([c, r]);
      }
    }
    const path = [];
    let cur = to;
    if (prev[key(to[0], to[1])] === undefined) return [to];
    while (cur !== -1) { path.unshift(cur); cur = prev[key(cur[0], cur[1])]; }
    return path;
  }
  function center(t) { return [t[0] * T + 8, t[1] * T + 13]; }

  const SEG_LOOK = {
    student:  { body: '#4aa3ff', hair: '#2b2118' },
    office:   { body: '#59607a', hair: '#1f1a17' },
    resident: { body: '#f29ac0', hair: '#6b4a3a' },
    night:    { body: '#4b3f72', hair: '#4b3f72' },
    tourist:  { body: '#ffd23f', hair: '#f4f1de' },
  };
  const BUBBLE = {
    out: { text: '缺貨', color: '#e8433f' }, pricey: { text: '太貴', color: '#e8433f' }, queue: { text: '排好久', color: '#e8433f' },
    none: { text: '沒賣', color: '#59607a' }, love: { text: '♥', color: '#ef476f' },
  };

  function Scene(canvas) {
    const ctx = canvas.getContext('2d');
    canvas.width = W * S;
    canvas.height = H * S;
    let state = null;
    let sprites = [];
    let floats = [];
    let queue = [];
    let last = 0;
    let speed = 1;
    let doorOpen = 0;

    function R(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
    function text(str, x, y, size, color, align) {
      ctx.font = size + 'px ' + FONT;
      ctx.textAlign = align || 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
    }

    /* ----- 人物 ----- */
    function person(x, y, look, frame, clerk) {
      R(x - 4, y - 1, 8, 2, 'rgba(27,31,59,.22)');
      if (frame) { R(x - 3, y - 4, 2, 4, '#2b2d42'); R(x + 1, y - 5, 2, 4, '#2b2d42'); }
      else { R(x - 3, y - 5, 2, 4, '#2b2d42'); R(x + 1, y - 4, 2, 4, '#2b2d42'); }
      R(x - 4, y - 11, 8, 7, look.body);
      R(x - 5, y - 10, 1, 4, look.body); R(x + 4, y - 10, 1, 4, look.body);
      R(x - 3, y - 17, 6, 6, '#ffd9b3');
      R(x - 3, y - 18, 6, 2, look.hair); R(x - 4, y - 17, 1, 3, look.hair); R(x + 3, y - 17, 1, 3, look.hair);
      R(x - 2, y - 14, 1, 1, INK); R(x + 1, y - 14, 1, 1, INK);
      if (clerk) { R(x - 4, y - 19, 8, 2, '#19b6a5'); R(x - 2, y - 9, 4, 5, '#fff3c4'); }
    }
    function accessory(x, y, seg) {
      if (seg === 'student') R(x - 6, y - 10, 2, 5, '#e63946');
      else if (seg === 'office') R(x, y - 11, 1, 4, '#e8433f');
      else if (seg === 'resident') { R(x + 4, y - 7, 3, 3, '#bc6c25'); R(x + 4, y - 8, 3, 1, INK); }
      else if (seg === 'tourist') { R(x - 5, y - 18, 10, 1, '#f4f1de'); R(x - 1, y - 9, 3, 2, INK); }
    }

    /* ----- 設備 ----- */
    function fxColors(type) {
      return D.PRODUCTS.filter(function (p) { return p.fx === type; }).map(function (p) { return p.color; });
    }
    function fxFill(type) {
      const ps = D.PRODUCTS.filter(function (p) { return p.fx === type; });
      let st = 0, cp = 0;
      ps.forEach(function (p) { st += state.stock[p.id]; cp += Math.max(1, Math.min(E.cap(state, p.id), Math.max(state.target[p.id], 40))); });
      return Math.min(1, st / cp);
    }
    function fixture(type, x, y, fill, t) {
      const cols = fxColors(type);
      const n = function (max) { return fill <= 0 ? 0 : Math.max(1, Math.round(max * fill)); };
      if (type === 'shelf') {
        R(x, y, 32, 22, '#5e3a1f'); R(x + 1, y + 1, 30, 20, '#f6e2b8');
        for (let r = 0; r < 3; r++) {
          R(x + 1, y + 7 + r * 7, 30, 1, '#5e3a1f');
          const k = n(7);
          for (let i = 0; i < k; i++) R(x + 2 + i * 4, y + 2 + r * 7, 3, 5, cols[(i + r * 2) % cols.length]);
        }
      } else if (type === 'fridge') {
        R(x, y, 32, 22, '#2b4a6f'); R(x + 1, y + 1, 30, 3, '#ffffff'); R(x + 1, y + 4, 30, 17, '#bfe6f7');
        R(x + 15, y + 4, 2, 17, '#2b4a6f'); R(x + 1, y + 12, 30, 1, '#8fc4dc');
        for (let r = 0; r < 2; r++) {
          const k = n(6);
          for (let i = 0; i < k; i++) R(x + 2 + i * 5 + (i > 2 ? 1 : 0), y + 5 + r * 8, 3, 7, cols[(i + r) % cols.length]);
        }
      } else if (type === 'fresh') {
        R(x, y, 32, 22, '#5b6470'); R(x + 1, y + 1, 30, 3, '#ffe08a'); R(x + 1, y + 4, 30, 17, '#fafafa');
        R(x + 1, y + 12, 30, 1, '#c9d1d9');
        const k = n(6);
        for (let i = 0; i < k; i++) { R(x + 2 + i * 5, y + 7, 4, 4, '#33312e'); R(x + 3 + i * 5, y + 8, 2, 1, '#fafafa'); }
        for (let i = 0; i < k; i++) { R(x + 2 + i * 5, y + 15, 4, 5, i % 2 ? '#f1e3c6' : '#bc6c25'); }
      } else if (type === 'hot') {
        R(x, y + 6, 32, 16, '#59606b'); R(x + 1, y + 7, 30, 14, '#c9d1d9');
        R(x + 3, y + 9, 11, 9, '#2b2d42'); R(x + 18, y + 9, 11, 9, '#2b2d42');
        if (fill > 0) { R(x + 4, y + 10, 9, 7, '#f4a261'); R(x + 19, y + 10, 9, 7, '#7f5539'); R(x + 6, y + 12, 2, 2, '#fff3c4'); R(x + 22, y + 12, 2, 2, '#fff3c4'); R(x + 25, y + 14, 2, 2, '#fff3c4'); }
        const ph = Math.floor(t / 300) % 3;
        if (fill > 0) { R(x + 7, y + 4 - ph, 1, 2, 'rgba(255,255,255,.8)'); R(x + 23, y + 3 - (ph + 1) % 3, 1, 2, 'rgba(255,255,255,.8)'); }
      } else if (type === 'freezer') {
        R(x, y + 5, 32, 17, '#2b4a6f'); R(x + 1, y + 6, 30, 15, '#f4f7fb'); R(x + 2, y + 7, 28, 7, '#bfe3f7');
        R(x + 1, y + 17, 30, 2, '#3b6fe0');
        const k = n(7);
        for (let i = 0; i < k; i++) R(x + 3 + i * 4, y + 9, 2, 4, cols[i % 2] === '#e0e1dd' ? '#8ecae6' : ['#8ecae6', '#ef476f', '#ffd23f'][i % 3]);
        R(x + 4, y + 8, 6, 1, '#ffffff'); R(x + 18, y + 8, 4, 1, '#ffffff');
      } else if (type === 'rack') {
        R(x + 2, y + 2, 28, 20, '#3d3d4a'); R(x + 3, y + 3, 26, 18, '#e9e4d4');
        const cv = ['#e8433f', '#3b6fe0', '#9d4edd', '#2fa84f', '#ff7a1a', '#c9c9c9'];
        const k = n(6);
        for (let i = 0; i < k; i++) { R(x + 4 + i * 4, y + 5, 3, 6, cv[i]); R(x + 4 + i * 4, y + 13, 3, 6, cv[(i + 3) % 6]); }
        R(x + 3, y + 11, 26, 1, '#3d3d4a'); R(x + 3, y + 19, 26, 1, '#3d3d4a');
      } else if (type === 'coffee') {
        R(x, y + 8, 32, 14, '#3b2a1f'); R(x + 1, y + 9, 30, 12, '#6f4e37');
        R(x + 4, y, 14, 12, '#2b2d42'); R(x + 5, y + 1, 12, 4, '#59606b'); R(x + 14, y + 6, 2, 2, fill > 0 ? '#e8433f' : '#59606b');
        R(x + 8, y + 7, 4, 4, '#fafafa');
        const k = n(4);
        for (let i = 0; i < k; i++) R(x + 21 + i % 2 * 5, y + 5 - Math.floor(i / 2) * 3, 4, 3, '#fafafa');
        if (fill > 0 && Math.floor(t / 400) % 2) R(x + 9, y - 2, 1, 2, 'rgba(255,255,255,.8)');
      } else if (type === 'slush') {
        R(x, y + 12, 32, 10, '#59606b'); R(x + 1, y + 13, 30, 8, '#e9e9e9');
        const ph = Math.floor(t / 250) % 4;
        [['#ef476f', 3], ['#48cae4', 18]].forEach(function (a) {
          R(x + a[1], y + 1, 11, 12, '#2b4a6f'); R(x + a[1] + 1, y + 2, 9, 10, '#f4f7fb');
          const hgt = Math.round(9 * fill);
          if (hgt > 0) { R(x + a[1] + 1, y + 12 - hgt, 9, hgt, a[0]); R(x + a[1] + 2 + ph * 2, y + 12 - Math.min(hgt, 5), 2, 1, '#ffffff'); }
          R(x + a[1] + 4, y + 15, 3, 4, '#2b2d42');
        });
      }
      if (fill <= 0 && Math.floor(t / 400) % 2) { R(x + 12, y - 9, 8, 8, '#e8433f'); text('!', x + 16, y - 4.5, 7, '#ffffff'); }
    }
    function emptySlot(x, y, locked, t) {
      if (locked) {
        R(x + 2, y + 8, 28, 12, 'rgba(27,31,59,.10)');
        for (let i = 0; i < 6; i++) R(x + 3 + i * 5, y + 13, 3, 2, i % 2 ? '#ffd23f' : INK);
        return;
      }
      const on = Math.floor(t / 600) % 2;
      ctx.strokeStyle = on ? '#ff7a1a' : 'rgba(27,31,59,.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(x + 2.5, y + 6.5, 27, 14);
      ctx.setLineDash([]);
      R(x + 15, y + 10, 2, 8, on ? '#ff7a1a' : 'rgba(27,31,59,.35)');
      R(x + 12, y + 13, 8, 2, on ? '#ff7a1a' : 'rgba(27,31,59,.35)');
    }

    /* ----- 背景 ----- */
    function outsideColor(clock) {
      if (state.weather === 'typhoon') return '#59607a';
      if (clock >= 6 && clock < 17) return state.weather === 'rainy' ? '#9fb4c7' : state.weather === 'cloudy' ? '#c4d4e0' : '#aee3ff';
      if (clock >= 17 && clock < 19) return '#f7a35c';
      return '#16224f';
    }
    function background(t, clock) {
      // 地板
      for (let r = 2; r < 9; r++) for (let c = 0; c < 12; c++) R(c * T, r * T, T, T, (r + c) % 2 ? '#eef3e6' : '#dfe9d8');
      // 後牆與招牌
      R(0, 0, W, 32, '#fbe7a1'); R(0, 30, W, 2, '#d9b95b');
      for (let i = 0; i < 24; i++) R(i * 8, 0, 8, 9, ['#ff7a1a', '#ffffff', '#19b6a5', '#ffffff'][i % 4]);
      R(0, 9, W, 1, INK);
      const name = state.name;
      const nw = Math.max(48, name.length * 8 + 12);
      R(W / 2 - nw / 2, 0, nw, 10, INK);
      const glow = state.upgrades.sign && Math.floor(t / 500) % 2;
      text(name, W / 2, 5.5, 8, glow ? '#ffd23f' : state.upgrades.sign ? '#ff9f1c' : '#fff3c4');
      if (state.upgrades.aircon) { R(162, 11, 26, 8, INK); R(163, 12, 24, 6, '#f4f7fb'); R(165, 16, 20, 1, '#8ecae6'); }
      if (state.upgrades.camera) { R(2, 11, 7, 4, INK); R(3, 12, 5, 2, '#59606b'); R(8, 12, 2, 2, Math.floor(t / 700) % 2 ? '#e8433f' : '#59606b'); }
      if (state.upgrades.service) { R(177, 13, 14, 19, INK); R(178, 14, 12, 17, '#e9e9e9'); R(180, 16, 8, 6, '#48cae4'); R(180, 25, 8, 1, INK); R(180, 27, 8, 2, '#fafafa'); }
      // 店門口
      R(0, 144, W, 16, '#fbe7a1'); R(0, 144, W, 1, INK);
      const sky = outsideColor(clock);
      [[2, 44], [50, 44], [130, 60]].forEach(function (g) { R(g[0], 147, g[1], 11, INK); R(g[0] + 1, 148, g[1] - 2, 9, sky); });
      if (state.weather === 'rainy' || state.weather === 'typhoon') {
        for (let i = 0; i < 26; i++) { const rx = (i * 37 + Math.floor(t / 60) * 3) % 188; if ((rx > 96 && rx < 128)) continue; R(rx + 2, 148 + (i * 5 + Math.floor(t / 60)) % 8, 1, 2, '#ffffff'); }
      }
      // 自動門與地墊
      R(96, 146, 32, 14, INK);
      const gap = Math.round(14 * doorOpen);
      R(97, 147, 15 - gap, 13, '#bfe6f7'); R(112 + gap, 147, 15 - gap, 13, '#bfe6f7');
      R(97 + (15 - gap), 147, gap * 2, 13, '#c9ccd6');
      R(98, 132, 28, 10, '#19b6a5'); R(100, 134, 24, 6, '#14968a');
      // 座位區或盆栽
      if (state.upgrades.seats) { R(164, 126, 14, 3, INK); R(165, 127, 12, 1, '#f6e2b8'); R(170, 129, 2, 8, INK); R(160, 133, 5, 2, '#e8433f'); R(180, 133, 5, 2, '#e8433f'); R(162, 135, 1, 5, INK); R(182, 135, 1, 5, INK); }
      else { R(178, 130, 8, 8, '#bc6c25'); R(176, 122, 12, 9, '#2fa84f'); R(180, 119, 4, 4, '#2fa84f'); }
    }
    function counter(t) {
      const shift = E.shiftOf(Math.min(state.t, 23));
      const crew = E.crewOn(state, shift);
      const open = E.isOpen(state, shift);
      const frame = Math.floor(t / 500) % 2;
      for (let i = 0; i < Math.min(crew.length, 3) && open; i++) person(9 + i * 14, 109, { body: '#ff7a1a', hair: '#2b2118' }, i === 0 ? frame : 0, true);
      R(0, 108, 48, 20, INK); R(1, 109, 46, 5, '#f0c27b'); R(1, 114, 46, 13, '#c98b4a'); R(1, 120, 46, 1, '#a66f37');
      R(30, 100, 12, 10, INK); R(31, 101, 10, 5, '#8ecae6'); R(31, 107, 10, 2, '#59606b');
      if (state.cat) {
        const cx = 8, cy = 104;
        R(cx, cy, 11, 5, '#f4a261'); R(cx - 2, cy - 2, 5, 5, '#f4a261'); R(cx - 2, cy - 3, 1, 1, '#f4a261'); R(cx + 2, cy - 3, 1, 1, '#f4a261');
        R(cx - 1, cy, 1, 1, INK); R(cx + 11, cy + (frame ? 1 : 2), 3, 1, '#e76f51');
      }
      if (!open) { R(4, 112, 40, 12, '#e8433f'); R(5, 113, 38, 10, '#fff3c4'); text('準備中', 24, 118.5, 8, '#e8433f'); }
    }

    /* ----- 客人 ----- */
    function spawn(v) {
      if (sprites.length >= 14) return;
      const steps = [];
      const owned = function (type) { const out = []; state.slots.forEach(function (f, i) { if (f === type) out.push(i); }); return out; };
      (v.fx || []).forEach(function (type) {
        const list = owned(type);
        if (!list.length) return;
        const slot = list[Math.floor(Math.random() * list.length)];
        const st = standTiles(slot);
        steps.push({ go: st[Math.floor(Math.random() * st.length)] }, { wait: 420 });
      });
      if (!steps.length) steps.push({ go: [3 + Math.floor(Math.random() * 6), 5] }, { wait: 500 });
      if (v.bubble && v.bubble !== 'love') steps.push({ bubble: v.bubble });
      if (v.bought > 0) steps.push({ go: [PAY[0] + Math.floor(Math.random() * 2), PAY[1]] }, { wait: 380, pay: v.spent || 0 });
      if (v.bubble === 'love') steps.push({ bubble: 'love' });
      steps.push({ go: [DOOR[0] + Math.floor(Math.random() * 2), 9] }, { leave: true });
      const start = [DOOR[0] + Math.floor(Math.random() * 2), 9];
      const p = center(start);
      sprites.push({ x: p[0], y: p[1] + 6, tile: start, seg: v.seg, steps: steps, path: null, wait: 0, bubble: null, bubbleUntil: 0, walked: 0 });
    }
    function update(dt, now) {
      const sp = Math.min(speed, 4);
      // 排程中的客人
      queue = queue.filter(function (q) { if (now >= q.at) { spawn(q.v); return false; } return true; });
      let nearDoor = false;
      sprites.forEach(function (s) {
        if (s.y > 136 && s.x > 92 && s.x < 132) nearDoor = true;
        const step = s.steps[0];
        if (!step) { s.dead = true; return; }
        if (step.go) {
          if (!s.path) s.path = bfs(s.tile, step.go).slice(1);
          if (!s.path.length) { s.tile = step.go; s.path = null; s.steps.shift(); return; }
          const tgt = center(s.path[0]);
          const dx = tgt[0] - s.x, dy = tgt[1] - s.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const mv = 70 * sp * dt / 1000;
          if (dist <= mv) { s.x = tgt[0]; s.y = tgt[1]; s.tile = s.path.shift(); }
          else { s.x += dx / dist * mv; s.y += dy / dist * mv; }
          s.walked += mv;
        } else if (step.wait != null) {
          s.wait += dt * sp;
          if (s.wait >= step.wait) {
            if (step.pay) floats.push({ x: 40, y: 98, text: '+$' + step.pay, until: now + 900, born: now });
            if (step.pay != null && root.DD_AUDIO) root.DD_AUDIO.cash();
            s.wait = 0; s.steps.shift();
          }
        } else if (step.bubble) {
          s.bubble = step.bubble; s.bubbleUntil = now + 1400 / Math.max(1, sp / 2);
          s.steps.shift();
        } else if (step.leave) { s.dead = true; }
      });
      sprites = sprites.filter(function (s) { return !s.dead; });
      floats = floats.filter(function (f) { return now < f.until; });
      doorOpen += ((nearDoor ? 1 : 0) - doorOpen) * Math.min(1, dt / 120);
    }

    function draw(now) {
      if (!state) return;
      const dt = last ? Math.min(100, now - last) : 16;
      last = now;
      update(dt, now);
      ctx.setTransform(S, 0, 0, S, 0, 0);
      ctx.imageSmoothingEnabled = false;
      const clock = E.clockOf(Math.min(state.t, 23));
      background(now, clock);
      const unlocked = E.unlockedSlots(state);
      // 依 y 排序：設備、櫃台、人物
      const items = [];
      SLOT_POS.forEach(function (pos, i) {
        const x = pos[0] * T, y = pos[1] * T - 6;
        items.push({ y: pos[1] * T + 16, draw: function () {
          const type = state.slots[i];
          if (type) fixture(type, x, y, fxFill(type), now + i * 130);
          else emptySlot(x, y, unlocked.indexOf(i) < 0, now);
        } });
      });
      items.push({ y: 128, draw: function () { counter(now); } });
      sprites.forEach(function (s) {
        items.push({ y: s.y, draw: function () {
          person(s.x, s.y, SEG_LOOK[s.seg] || SEG_LOOK.student, Math.floor(s.walked / 5) % 2, false);
          accessory(s.x, s.y, s.seg);
        } });
      });
      items.sort(function (a, b) { return a.y - b.y; });
      items.forEach(function (it) { it.draw(); });
      // 夜晚與打烊
      const shift = E.shiftOf(Math.min(state.t, 23));
      if (!E.isOpen(state, shift)) R(0, 0, W, H, 'rgba(13,22,56,.45)');
      else if (clock >= 19 || clock < 5) R(0, 0, W, H, 'rgba(22,34,79,.14)');
      // 泡泡與飄字
      sprites.forEach(function (s) {
        if (!s.bubble || now > s.bubbleUntil) return;
        const b = BUBBLE[s.bubble];
        const w = b.text.length * 8 + 6;
        const bx = Math.max(1, Math.min(W - w - 1, s.x - w / 2)), by = Math.max(11, s.y - 31);
        R(bx, by, w, 11, INK); R(bx + 1, by + 1, w - 2, 9, '#ffffff'); R(s.x - 1, by + 11, 2, 2, INK);
        text(b.text, bx + w / 2, by + 6, 8, b.color);
      });
      floats.forEach(function (f) {
        const k = (now - f.born) / 900;
        ctx.globalAlpha = 1 - k * k;
        text(f.text, f.x + 1, f.y - k * 12 + 1, 8, INK);
        text(f.text, f.x, f.y - k * 12, 8, '#2fa84f');
        ctx.globalAlpha = 1;
      });
    }

    return {
      setState: function (s) { state = s; sprites = []; floats = []; queue = []; },
      setSpeed: function (v) { speed = v; },
      addVisits: function (visits, spanMs) {
        const now = performance.now();
        const room = Math.max(0, 14 - sprites.length - queue.length);
        visits.slice(0, room).forEach(function (v, i) { queue.push({ v: v, at: now + (i / Math.max(1, visits.length)) * spanMs }); });
      },
      draw: draw,
      hitTest: function (lx, ly) {
        for (let i = 0; i < SLOT_POS.length; i++) {
          const x = SLOT_POS[i][0] * T, y = SLOT_POS[i][1] * T - 8;
          if (lx >= x && lx < x + 32 && ly >= y && ly < y + 26) return { kind: 'slot', i: i };
        }
        if (lx < 52 && ly > 88 && ly < 130) return { kind: 'staff' };
        return null;
      },
      W: W, H: H,
    };
  }

  /* ----- 標題畫面：夜裡亮著燈的店 ----- */
  function drawTitle(canvas, now) {
    const TW = 192, TH = 132, K = 4;
    if (canvas.width !== TW * K) { canvas.width = TW * K; canvas.height = TH * K; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(K, 0, 0, K, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const R = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    R(0, 0, TW, TH, '#16224f'); R(0, 0, TW, 40, '#0d1638');
    for (let i = 0; i < 28; i++) { const tw = (Math.floor(now / 500) + i) % 5 === 0; R((i * 53) % TW, (i * 29) % 46, 1, 1, tw ? '#ffffff' : '#7f8fc9'); }
    R(160, 8, 10, 10, '#ffe08a'); R(163, 8, 7, 7, '#0d1638');
    // 遠方大樓
    [[0, 36, 30], [26, 22, 44], [70, 30, 36], [122, 26, 40], [148, 44, 26], [176, 18, 48]].forEach(function (b, bi) {
      R(b[0], 88 - b[2], b[1], b[2], '#243474');
      for (let y = 0; y < b[2] - 6; y += 6) for (let x = 2; x < b[1] - 3; x += 5) if ((x * 7 + y * 3 + bi * 5) % 4 === 0) R(b[0] + x, 90 - b[2] + y, 2, 3, '#ffd23f');
    });
    // 地面
    R(0, 110, TW, 22, '#2b2d42'); R(0, 110, TW, 2, '#59606b');
    for (let i = 0; i < 8; i++) R(i * 26 + 4, 122, 12, 2, '#fff3c4');
    // 店
    const sx = 40, sy = 46;
    R(sx, sy, 112, 64, INK); R(sx + 1, sy + 1, 110, 62, '#fbe7a1');
    const on = Math.floor(now / 700) % 6 !== 0;
    R(sx - 2, sy - 4, 116, 18, INK); R(sx - 1, sy - 3, 114, 16, on ? '#ff7a1a' : '#b3560f');
    ctx.font = '12px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = INK; ctx.fillText('叮咚！便利店', sx + 57, sy + 6);
    ctx.fillStyle = on ? '#fff3c4' : '#e0c98a'; ctx.fillText('叮咚！便利店', sx + 56, sy + 5);
    for (let i = 0; i < 14; i++) R(sx + i * 8, sy + 14, 8, 6, ['#ff7a1a', '#ffffff', '#19b6a5', '#ffffff'][i % 4]);
    R(sx, sy + 20, 112, 1, INK);
    // 玻璃與店內
    R(sx + 4, sy + 25, 64, 34, INK); R(sx + 5, sy + 26, 62, 32, '#fff8dc');
    R(sx + 8, sy + 32, 18, 26, '#5e3a1f'); R(sx + 9, sy + 33, 16, 24, '#f6e2b8');
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) R(sx + 10 + i * 4, sy + 34 + r * 8, 3, 6, ['#f2b632', '#e4572e', '#ef6f9c', '#6a994e'][(i + r) % 4]);
    R(sx + 30, sy + 30, 20, 28, '#2b4a6f'); R(sx + 31, sy + 33, 18, 24, '#bfe6f7');
    for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) R(sx + 32 + i * 4, sy + 35 + r * 11, 3, 8, ['#6a994e', '#e63946', '#fdfcdc', '#e9c46a'][(i + r) % 4]);
    R(sx + 53, sy + 44, 12, 14, '#c98b4a');
    R(sx + 36, sy + 25, 1, 34, INK);
    // 門
    const cyc = (now % 6000) / 6000;
    const open = cyc > 0.55 && cyc < 0.85 ? 1 : 0;
    R(sx + 74, sy + 25, 34, 39, INK);
    const gap = open * 14;
    R(sx + 75, sy + 26, 16 - gap, 37, '#bfe6f7'); R(sx + 91 + gap, sy + 26, 16 - gap, 37, '#bfe6f7');
    if (open) R(sx + 75 + 16 - gap, sy + 26, gap * 2, 37, '#fff8dc');
    R(sx + 76, sy + 64, 30, 4, '#19b6a5');
    // 門口的光
    ctx.fillStyle = 'rgba(255,243,196,.16)'; ctx.fillRect(sx + 2, 110, 110, 12);
    // 路過的客人
    const px = cyc < 0.6 ? cyc / 0.6 * (sx + 90) - 10 : sx + 90;
    if (cyc < 0.78) {
      const y = 116 - (cyc > 0.6 ? (cyc - 0.6) / 0.18 * 8 : 0), f = Math.floor(now / 160) % 2;
      R(px - 4, y - 1, 8, 2, 'rgba(0,0,0,.3)');
      R(px - 3, y - (f ? 4 : 5), 2, 4, '#1b1f3b'); R(px + 1, y - (f ? 5 : 4), 2, 4, '#1b1f3b');
      R(px - 4, y - 11, 8, 7, '#4aa3ff'); R(px - 3, y - 17, 6, 6, '#ffd9b3'); R(px - 3, y - 18, 6, 2, '#2b2118');
      R(px - 6, y - 10, 2, 5, '#e63946');
    }
  }

  /* ----- 顧問「咚咚」：一顆有臉的門鈴 ----- */
  const MASCOT = [
    '......kkkk......',
    '.....kttttk.....',
    '......kyyk......',
    '....kkoooykk....',
    '...kooooooyyk...',
    '..koooooooooyk..',
    '..kooooooooook..',
    '..kowkooookwok..',
    '..kokkooookkok..',
    '..korooooorook..',
    '..koookkkkoook..',
    '.kooooooooooook.',
    'koooooooooooooyk',
    'kkkkkkkkkkkkkkkk',
    '......kyyk......',
    '.......kk.......',
  ];
  const PAL = { k: INK, o: '#ff9f1c', y: '#ffd23f', w: '#ffffff', r: '#e8433f', t: '#19b6a5' };
  let mascotUrl = null;
  function mascot() {
    if (mascotUrl) return mascotUrl;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    MASCOT.forEach(function (row, r) {
      for (let i = 0; i < row.length; i++) {
        if (PAL[row[i]]) { x.fillStyle = PAL[row[i]]; x.fillRect(i * 4, r * 4, 4, 4); }
      }
    });
    mascotUrl = c.toDataURL();
    return mascotUrl;
  }

  root.DD_SCENE = { Scene: Scene, drawTitle: drawTitle, mascot: mascot, SLOT_POS: SLOT_POS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
