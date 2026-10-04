/* 叮咚！便利店 — 店面畫面（canvas 向量繪圖）。只負責「看起來的樣子」，不影響遊戲數值。
 * 座標系是 192×160 的邏輯尺寸（一格 16），實際解析度跟著螢幕走，高解析手機上線條也是平滑的。
 * 風格：現代便利商店——冷白燈光、淺色拋光地磚、玻璃門冷藏櫃、開放式鮮食櫃、咖啡吧、觸控收銀機、整面落地玻璃。 */
(function (root) {
  'use strict';
  const D = root.DD_DATA;
  const E = root.DD;
  const T = 16, W = 192, H = 160;
  const FONT = '"Huninn", "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const C = {
    ink: '#16202A', steel: '#3B4753', graphite: '#232B33', line: '#CBD3DA', floor: '#E9EDF0', wall: '#FCFDFD', white: '#FFFFFF',
    orange: '#FF6A13', teal: '#00A58E', tealD: '#00806F', yellow: '#FFD52E', red: '#E0352B', green: '#128A4A',
    wood: '#DDB98F', woodD: '#C79F72', glass: '#DDF1FB', skin: '#F6D2B5', pants: '#2B3540',
  };

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
    student:  { body: '#3E8BFF', hair: '#2B2118' },
    office:   { body: '#56627A', hair: '#1F1A17' },
    resident: { body: '#F08FB8', hair: '#6B4A3A' },
    night:    { body: '#6A58B5', hair: '#2B2118' },
    tourist:  { body: '#FFC83D', hair: '#8A5A2B' },
  };
  const CLERK_LOOK = { body: '#FFFFFF', hair: '#2B2118' };
  const BUBBLE = {
    out: { text: '缺貨', color: C.red }, pricey: { text: '太貴', color: C.red }, queue: { text: '排好久', color: C.red },
    none: { text: '沒賣', color: '#5B6875' }, love: { text: '♥', color: C.red },
  };

  /* ---------- 畫筆：把常用的向量圖形包成短函式 ---------- */
  function brush(ctx) {
    function path(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    const P = {
      rect: function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
      rr: function (x, y, w, h, r, c, stroke, lw) {
        path(x, y, w, h, r);
        if (c) { ctx.fillStyle = c; ctx.fill(); }
        if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 0.5; ctx.stroke(); }
      },
      circ: function (x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fillStyle = c; ctx.fill(); },
      ell: function (x, y, rx, ry, c) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.fillStyle = c; ctx.fill(); },
      dome: function (x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, r, Math.PI, 0); ctx.closePath(); ctx.fillStyle = c; ctx.fill(); },
      line: function (x1, y1, x2, y2, c, lw) {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = c; ctx.lineWidth = lw || 0.5; ctx.lineCap = 'round'; ctx.stroke();
      },
      poly: function (pts, c) {
        ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.closePath(); ctx.fillStyle = c; ctx.fill();
      },
      grad: function (x1, y1, x2, y2, stops) {
        const g = ctx.createLinearGradient(x1, y1, x2, y2);
        for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
        return g;
      },
      text: function (str, x, y, size, color, align, halo) {
        ctx.font = size + 'px ' + FONT;
        ctx.textAlign = align || 'center';
        ctx.textBaseline = 'middle';
        if (halo) { ctx.lineJoin = 'round'; ctx.strokeStyle = halo; ctx.lineWidth = size * 0.28; ctx.strokeText(str, x, y); }
        ctx.fillStyle = color;
        ctx.fillText(str, x, y);
      },
      width: function (str, size) { ctx.font = size + 'px ' + FONT; return ctx.measureText(str).width; },
      heart: function (x, y, s, c) {
        P.circ(x - s * 0.5, y - s * 0.25, s * 0.56, c); P.circ(x + s * 0.5, y - s * 0.25, s * 0.56, c);
        P.poly([x - s * 1.02, y, x + s * 1.02, y, x, y + s * 1.1], c);
      },
      // 品牌識別：橘色長帶，右端斜切接一段綠色
      band: function (x, y, w, h, split) {
        const sp = x + w * (split || 0.74), sl = h * 0.5, g = Math.max(0.5, h * 0.32);
        P.rect(x, y, w, h, C.orange);
        P.poly([sp + sl, y, x + w, y, x + w, y + h, sp - sl, y + h], C.teal);
        P.poly([sp + sl - g, y, sp + sl, y, sp - sl, y + h, sp - sl - g, y + h], C.white);
      },
      // 玻璃上的防撞圓點
      dots: function (x, y, w, c) { for (let dx = 1.2; dx < w - 0.6; dx += 2.6) P.circ(x + dx, y, 0.42, c); },
      steam: function (x, y, t) {
        for (let i = 0; i < 3; i++) {
          const ph = ((t / 1400) + i / 3) % 1;
          P.circ(x + Math.sin((ph + i) * 5) * 1.2, y - ph * 6, 0.9 + ph * 1.1, 'rgba(255,255,255,' + (0.75 * (1 - ph)).toFixed(2) + ')');
        }
      },
    };
    return P;
  }
  /** 讓畫布的實際像素數跟上顯示尺寸與螢幕密度；回傳「邏輯單位 → 像素」的倍率。 */
  function fit(canvas, lw, lh) {
    const cw = canvas.clientWidth || lw * 2;
    const dpr = Math.min(3, root.devicePixelRatio || 1);
    const w = Math.max(lw, Math.round(cw * dpr));
    if (canvas.width !== w) { canvas.width = w; canvas.height = Math.round(w * lh / lw); }
    return canvas.width / lw;
  }

  /* ---------- 人物（店內與標題畫面共用） ---------- */
  function drawPerson(P, x, y, look, frame, clerk, seg) {
    P.ell(x, y + 0.2, 5, 1.6, 'rgba(22,32,42,.16)');
    if (seg === 'student') P.rr(x - 6, y - 12.2, 3.2, 6.2, 1.2, '#E0352B');
    if (seg === 'night') P.circ(x, y - 15.4, 5.3, look.body);
    const l1 = frame ? 4.2 : 5.4, l2 = frame ? 5.4 : 4.2;
    P.rr(x - 3.1, y - l1, 2.6, l1, 1, C.pants); P.rr(x + 0.5, y - l2, 2.6, l2, 1, C.pants);
    P.rr(x - 5.7, y - 11.8, 2.3, 5.6, 1.1, look.body); P.rr(x + 3.4, y - 11.8, 2.3, 5.6, 1.1, look.body);
    P.circ(x - 4.55, y - 6.3, 1.05, C.skin); P.circ(x + 4.55, y - 6.3, 1.05, C.skin);
    P.rr(x - 4.3, y - 12.6, 8.6, 8.4, 2.6, look.body, clerk ? C.line : null, 0.35);
    if (clerk) { P.rr(x - 3, y - 11, 6, 6.8, 1.2, C.teal); P.rect(x - 3, y - 9.4, 6, 1.1, C.orange); }
    if (seg === 'office') { P.poly([x - 1.4, y - 12.6, x + 1.4, y - 12.6, x, y - 10.8], '#FFFFFF'); P.poly([x - 0.7, y - 11.6, x + 0.7, y - 11.6, x + 0.5, y - 8.4, x, y - 7.6, x - 0.5, y - 8.4], '#E0352B'); }
    P.circ(x, y - 15.6, 4.4, C.skin);
    P.dome(x, y - 16, 4.65, look.hair);
    P.circ(x - 1.6, y - 15, 0.62, C.ink); P.circ(x + 1.6, y - 15, 0.62, C.ink);
    P.circ(x - 2.9, y - 13.7, 0.85, 'rgba(255,110,110,.32)'); P.circ(x + 2.9, y - 13.7, 0.85, 'rgba(255,110,110,.32)');
    if (clerk) { P.dome(x, y - 16.5, 4.8, C.teal); P.rr(x - 5.2, y - 17.1, 10.4, 1.4, 0.7, C.tealD); }
    if (seg === 'office') P.rr(x + 4.4, y - 6.6, 4.2, 3.4, 0.8, '#4A3B32');
    else if (seg === 'resident') { P.circ(x + 3.2, y - 19.6, 1.7, look.hair); P.rr(x - 8.6, y - 6.8, 3.8, 4.6, 0.8, '#FFFFFF', C.teal, 0.45); P.rect(x - 8.6, y - 5.2, 3.8, 0.8, C.teal); }
    else if (seg === 'night') { P.rr(x - 5.4, y - 16.6, 1.6, 3, 0.8, C.ink); P.rr(x + 3.8, y - 16.6, 1.6, 3, 0.8, C.ink); }
    else if (seg === 'tourist') { P.ell(x, y - 17.4, 6.6, 1.5, '#F2E2B8'); P.dome(x, y - 17.6, 3.9, '#F2E2B8'); P.rr(x - 1.8, y - 10.4, 3.6, 2.5, 0.6, C.ink); P.circ(x, y - 9.15, 0.75, '#8FD3F4'); }
  }

  function Scene(canvas) {
    const ctx = canvas.getContext('2d');
    const P = brush(ctx);
    let state = null;
    let sprites = [];
    let floats = [];
    let queue = [];
    let last = 0;
    let speed = 1;
    let doorOpen = 0;
    let k = 4;

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
    function bottle(x, y, c) {
      P.rr(x, y + 1.1, 2.5, 4.2, 0.8, c);
      P.rect(x + 0.75, y, 1, 1.4, '#FFFFFF');
      P.rect(x, y + 2.6, 2.5, 1, 'rgba(255,255,255,.6)');
    }
    function fixture(type, x, y, fill, t) {
      const cols = fxColors(type);
      const n = function (max) { return fill <= 0 ? 0 : Math.max(1, Math.round(max * fill)); };
      P.ell(x + 16, y + 26.2, 15.5, 2.2, 'rgba(22,32,42,.13)');
      if (type === 'shelf') {
        // 白色中島貨架：三層層板、黃色價格牌
        P.rr(x + 1, y + 1, 30, 25, 1.6, C.white, C.line);
        P.rect(x + 2.4, y + 4.4, 27.2, 20, '#F1F4F6');
        P.rr(x + 1, y + 1, 30, 3.2, 1.6, C.teal);
        const k1 = n(18);
        for (let r = 0; r < 3; r++) {
          const sy = y + 10.6 + r * 6.6;
          for (let i = 0; i < 6; i++) {
            if (r * 6 + i >= k1) break;
            const c = cols[(i + r * 2) % cols.length];
            if ((i + r) % 3 === 0) P.rr(x + 3.2 + i * 4.4, sy - 5.2, 3.6, 5.2, 1.4, c);
            else P.rr(x + 3.2 + i * 4.4, sy - 4.6, 3.6, 4.6, 0.6, c);
            P.rect(x + 3.2 + i * 4.4, sy - 3.2, 3.6, 0.9, 'rgba(255,255,255,.55)');
          }
          P.rect(x + 2.4, sy, 27.2, 1.3, '#DCE3E9');
          for (let i = 0; i < 6; i++) P.rect(x + 3.6 + i * 4.4, sy + 0.25, 2.6, 0.8, C.yellow);
        }
      } else if (type === 'fridge') {
        // 玻璃門冷藏櫃：深色門框、冷白燈、直立把手
        P.rr(x + 1, y, 30, 26, 1.8, C.graphite);
        P.rect(x + 2.2, y + 1.1, 27.6, 1.7, '#EAF7FF');
        const k2 = n(18);
        for (let d = 0; d < 2; d++) {
          const dx = x + 2.4 + d * 13.9;
          P.rr(dx, y + 3.8, 13.3, 20.6, 0.8, P.grad(0, y + 3.8, 0, y + 24.4, [0, '#EAF8FF', 1, '#C9E9F8']));
          for (let r = 0; r < 3; r++) {
            const sy = y + 5 + r * 6.6;
            for (let i = 0; i < 3; i++) if (r * 6 + d * 3 + i < k2) bottle(dx + 1.3 + i * 3.9, sy, cols[(i + r + d) % cols.length]);
            P.rect(dx, sy + 5.5, 13.3, 0.6, 'rgba(59,71,83,.35)');
          }
          P.poly([dx + 1, y + 3.8, dx + 4.4, y + 3.8, dx + 1, y + 13], 'rgba(255,255,255,.34)');
        }
        P.rr(x + 14.4, y + 9.5, 0.9, 8.5, 0.4, '#D9E0E6'); P.rr(x + 16.7, y + 9.5, 0.9, 8.5, 0.4, '#D9E0E6');
        P.rect(x + 2.2, y + 24.6, 27.6, 0.9, '#11161B');
      } else if (type === 'fresh') {
        // 開放式鮮食櫃：白色機身、頂部 LED、三層鮮食、底部冷氣
        P.rr(x + 1, y + 0.6, 30, 25.4, 1.8, C.white, C.line);
        P.rect(x + 2.4, y + 4.6, 27.2, 17.6, P.grad(0, y + 4.6, 0, y + 22.2, [0, '#F3FBFE', 1, '#D9F1FA']));
        P.rr(x + 1, y + 0.6, 30, 4.2, 1.8, '#F4F6F8', C.line);
        P.rect(x + 3.4, y + 3.9, 25.2, 0.9, '#BDEFFF');
        const k3 = n(14);
        let idx = 0;
        for (let r = 0; r < 3; r++) {
          const sy = y + 10.2 + r * 5.6;
          for (let i = 0; i < 5; i++, idx++) {
            if (idx >= k3) break;
            const ix = x + 3.2 + i * 5.3;
            if (r === 0) { P.poly([ix + 2.1, sy - 4.4, ix + 4.3, sy - 0.2, ix - 0.1, sy - 0.2], '#FFFFFF'); P.rect(ix + 0.7, sy - 1.8, 2.8, 1.6, '#2B3540'); }
            else if (r === 1) { P.rr(ix, sy - 3.3, 4.5, 3.3, 0.7, '#2B3540'); P.rect(ix + 0.5, sy - 2.8, 2, 2.2, '#FFFFFF'); P.rect(ix + 2.6, sy - 2.8, 1.4, 1, C.orange); P.rect(ix + 2.6, sy - 1.6, 1.4, 1, '#6DBE45'); }
            else { P.poly([ix, sy - 0.2, ix + 4.4, sy - 0.2, ix, sy - 3.8], '#FFF7E0'); P.line(ix + 0.5, sy - 1.3, ix + 2.6, sy - 1.3, '#6DBE45', 0.6); P.line(ix + 0.5, sy - 2.3, ix + 1.5, sy - 2.3, '#F2A7B0', 0.6); }
          }
          P.rect(x + 2.4, sy, 27.2, 1, '#DCE3E9');
          for (let i = 0; i < 5; i++) P.rect(x + 3.9 + i * 5.3, sy + 0.15, 2.6, 0.7, C.yellow);
        }
        P.rect(x + 2.4, y + 22.2, 27.2, 2.6, '#E3E8ED');
        for (let i = 0; i < 9; i++) P.rect(x + 3.6 + i * 3, y + 22.9, 1.8, 1.2, '#B9C4CE');
        P.rect(x + 2.4, y + 19.4, 27.2, 2.8, P.grad(0, y + 19.4, 0, y + 22.2, [0, 'rgba(120,210,255,0)', 1, 'rgba(120,210,255,.28)']));
      } else if (type === 'hot') {
        // 熱食台：保溫蒸箱、關東煮鍋
        P.rr(x + 1, y + 12.4, 30, 13.6, 1.6, C.white, C.line);
        P.band(x + 1.4, y + 15, 29.2, 1.5);
        P.rr(x + 1, y + 11, 30, 2.4, 1, '#E3E8ED', C.line, 0.35);
        P.rr(x + 3, y + 1.4, 12.5, 10, 1.2, C.steel);
        P.rr(x + 4, y + 2.4, 10.5, 8, 0.7, P.grad(0, y + 2, 0, y + 10.4, [0, '#FFF8E2', 1, '#FFE6A8']));
        const k4 = n(6);
        for (let i = 0; i < 6; i++) if (i < k4) { const bx = x + 5.9 + (i % 3) * 3.3, by = y + 5 + Math.floor(i / 3) * 3.7; P.circ(bx, by, 1.45, '#FFFFFF'); P.circ(bx, by - 0.3, 0.35, '#E9D9B8'); }
        P.rect(x + 4, y + 6.6, 10.5, 0.5, 'rgba(59,71,83,.35)');
        P.rr(x + 17.4, y + 6, 12, 5.6, 1, '#B9C4CE', C.steel, 0.4);
        P.rr(x + 18.2, y + 6.8, 10.4, 3.6, 0.6, '#C98A3D');
        P.line(x + 21.7, y + 6.8, x + 21.7, y + 10.4, '#B9C4CE', 0.5); P.line(x + 25.1, y + 6.8, x + 25.1, y + 10.4, '#B9C4CE', 0.5);
        if (fill > 0) { P.circ(x + 19.9, y + 8.6, 1, '#FFFFFF'); P.rr(x + 22.5, y + 7.7, 1.9, 1.9, 0.3, '#F2D38A'); P.circ(x + 26.9, y + 8.6, 1, '#7A4B2A'); P.steam(x + 23.4, y + 5.4, t); }
      } else if (type === 'freezer') {
        // 臥式冰櫃：弧形滑動玻璃蓋
        P.rr(x + 1, y + 9, 30, 17, 2.2, C.white, C.line);
        P.band(x + 1.4, y + 18.8, 29.2, 1.5);
        for (let i = 0; i < 7; i++) P.rect(x + 5 + i * 3.4, y + 22.6, 2, 1, '#C9D2DA');
        P.rr(x + 2, y + 5.6, 28, 8.4, 2.4, P.grad(0, y + 5.6, 0, y + 14, [0, '#F2FBFF', 1, '#BFE4F5']), '#9FB4C3', 0.4);
        const k5 = n(6);
        for (let i = 0; i < 6; i++) if (i < k5) P.rr(x + 4 + i * 4.2, y + 8.2 + (i % 2) * 1.2, 3.4, 3.4, 0.7, cols[i % cols.length]);
        P.rr(x + 2, y + 5.6, 28, 8.4, 2.4, 'rgba(210,238,250,.42)');
        P.line(x + 16, y + 5.9, x + 16, y + 13.8, '#9FB4C3', 0.5);
        P.poly([x + 4.4, y + 6.4, x + 8.4, y + 6.4, x + 5.4, y + 10.6, x + 3.6, y + 10.6], 'rgba(255,255,255,.45)');
      } else if (type === 'rack') {
        // 書報架：斜放的雜誌、底層報紙
        P.rr(x + 3, y + 1, 26, 25, 1.6, C.white, C.line);
        P.rr(x + 3, y + 1, 26, 3, 1.6, C.steel);
        const cv = ['#E0352B', '#3B6FE0', '#9D4EDD', '#128A4A', '#FF6A13', '#F5B301'];
        const k6 = n(10);
        for (let r = 0; r < 2; r++) {
          const sy = y + 12.4 + r * 7;
          for (let i = 0; i < 5; i++) if (r * 5 + i < k6) {
            const mx = x + 4.6 + i * 4.7;
            P.rr(mx, sy - 6.4, 4, 6.2, 0.5, cv[(i + r * 2) % cv.length]);
            P.rect(mx + 0.5, sy - 5.7, 3, 1.1, 'rgba(255,255,255,.85)');
            P.rect(mx + 0.5, sy - 3.4, 3, 2.3, 'rgba(255,255,255,.28)');
          }
          P.rect(x + 4, sy - 0.4, 24, 1.2, '#DCE3E9');
        }
        if (fill > 0) for (let i = 0; i < 3; i++) { P.rr(x + 5 + i * 7.6, y + 20.6, 6.4, 4, 0.4, '#F4F6F8', '#B9C4CE', 0.35); P.rect(x + 5.7 + i * 7.6, y + 21.5, 5, 0.6, '#5B6875'); P.rect(x + 5.7 + i * 7.6, y + 22.8, 3.4, 0.5, '#9AA6B2'); }
      } else if (type === 'coffee') {
        // 咖啡吧：木紋檯面、全自動咖啡機、杯塔、小菜單
        P.rr(x + 1, y + 13.4, 30, 12.6, 1.6, C.wood, C.woodD, 0.4);
        for (let i = 0; i < 5; i++) P.line(x + 6 + i * 5, y + 16.4, x + 6 + i * 5, y + 25, C.woodD, 0.4);
        P.rr(x + 0.6, y + 12, 30.8, 2.4, 1, '#F4F6F8', C.line, 0.35);
        P.rr(x + 3.4, y + 0.6, 14.4, 11.8, 1.6, C.graphite);
        P.rr(x + 5, y + 2, 11.2, 3.6, 0.8, '#C9D2DA');
        P.rr(x + 6, y + 2.7, 4.2, 2.2, 0.4, '#5EE0C7'); P.circ(x + 13.2, y + 3.8, 0.9, C.orange);
        P.rect(x + 8.4, y + 6, 1.2, 1.6, '#C9D2DA'); P.rect(x + 11.4, y + 6, 1.2, 1.6, '#C9D2DA');
        P.rect(x + 5, y + 10.8, 11.2, 0.9, '#8A96A3');
        if (fill > 0) { P.poly([x + 8.6, y + 8, x + 12.6, y + 8, x + 12, y + 10.8, x + 9.2, y + 10.8], '#FFFFFF'); P.rect(x + 8.9, y + 8.2, 3.4, 0.8, '#6F4E37'); P.steam(x + 10.6, y + 7.2, t); }
        const k7 = n(4);
        for (let i = 0; i < k7; i++) P.poly([x + 21.4, y + 11.6 - i * 2, x + 26, y + 11.6 - i * 2, x + 25.4, y + 9.4 - i * 2, x + 22, y + 9.4 - i * 2], i % 2 ? '#F4F6F8' : '#FFFFFF');
        if (k7) P.rect(x + 21.9, y + 10.2 - (k7 - 1) * 2, 3.6, 0.6, C.orange);
        P.rr(x + 20.4, y + 0.6, 9.4, 4.6, 0.7, C.ink); P.rect(x + 21.4, y + 1.7, 5, 0.6, '#FFFFFF'); P.rect(x + 21.4, y + 3.1, 7.2, 0.6, C.yellow);
      } else if (type === 'slush') {
        // 冰沙機：兩個透明冰沙缸在慢慢攪拌
        P.rr(x + 1, y + 14, 30, 12, 1.6, C.white, C.line);
        P.band(x + 1.4, y + 17.6, 29.2, 1.5);
        const hgt = 9 * fill;
        const ph = (t / 500) % 6.2832;
        [['#3EC6E0', 3.6], ['#FF7BA9', 17.4]].forEach(function (tk, ti) {
          const tx = x + tk[1];
          P.rr(tx, y + 1.4, 11, 12.6, 2.4, 'rgba(235,247,252,.9)', '#9FB4C3', 0.45);
          if (hgt > 0.4) P.rr(tx + 0.9, y + 13 - hgt, 9.2, hgt, 1.4, tk[0]);
          P.line(tx + 5.5 + Math.cos(ph + ti) * 3, y + 5, tx + 5.5 - Math.cos(ph + ti) * 3, y + 12, 'rgba(255,255,255,.55)', 0.7);
          P.rr(tx + 0.6, y + 0.4, 9.8, 1.8, 0.8, C.steel);
          P.rr(tx + 4.3, y + 14, 2.4, 2.2, 0.5, C.steel);
          P.poly([tx + 1.4, y + 2.6, tx + 3.4, y + 2.6, tx + 1.4, y + 8], 'rgba(255,255,255,.5)');
        });
      }
    }
    function emptySlot(x, y, locked, t) {
      if (locked) {
        ctx.setLineDash([2, 2]);
        P.rr(x + 3, y + 9, 26, 15, 3, null, '#D0D8DF', 0.6);
        ctx.setLineDash([]);
        return;
      }
      const a = 0.55 + 0.25 * Math.sin(t / 420);
      P.rr(x + 2.5, y + 7.5, 27, 17, 3.5, 'rgba(255,106,19,.07)');
      ctx.setLineDash([2.4, 1.8]);
      P.rr(x + 2.5, y + 7.5, 27, 17, 3.5, null, 'rgba(255,106,19,' + a.toFixed(2) + ')', 0.8);
      ctx.setLineDash([]);
      P.rr(x + 12.5, y + 15.1, 7, 1.8, 0.9, C.orange); P.rr(x + 15.1, y + 12.5, 1.8, 7, 0.9, C.orange);
    }

    /* ----- 店面：地板、後牆、招牌、落地玻璃 ----- */
    function outsideColor(clock) {
      if (state.weather === 'typhoon') return ['#5B6875', '#46525E'];
      if (clock >= 6 && clock < 17) return state.weather === 'rainy' ? ['#A9BCCB', '#8FA5B6'] : state.weather === 'cloudy' ? ['#CCD9E3', '#B4C5D2'] : ['#BFE7FF', '#8ED0F7'];
      if (clock >= 17 && clock < 19) return ['#FFC08A', '#F28F5C'];
      return ['#14263F', '#0B1626'];
    }
    function background(t, clock) {
      // 拋光地磚與天花板燈條的倒影
      P.rect(0, 30, W, 116, C.floor);
      for (let c = 1; c < 12; c++) P.rect(c * T - 0.18, 32, 0.36, 112, '#D7DDE3');
      for (let r = 3; r < 9; r++) P.rect(0, r * T - 0.18, W, 0.36, '#D7DDE3');
      [34, 98, 162].forEach(function (cx) {
        P.rect(cx - 13, 32, 26, 112, P.grad(cx - 13, 0, cx + 13, 0, [0, 'rgba(255,255,255,0)', 0.5, 'rgba(255,255,255,.7)', 1, 'rgba(255,255,255,0)']));
      });
      // 排隊結帳的地貼
      [24, 40].forEach(function (fx) { P.rr(fx - 2.6, 138.4, 2.1, 3.8, 1, 'rgba(255,106,19,.3)'); P.rr(fx + 0.5, 138.4, 2.1, 3.8, 1, 'rgba(255,106,19,.3)'); });
      // 後牆：白牆、淺木腰板
      P.rect(0, 0, W, 32, C.wall);
      P.rect(0, 26.8, W, 4, '#EBD9BF');
      P.rect(0, 30.6, W, 1.4, '#D2BC9C');
      P.rect(0, 32, W, 3.4, P.grad(0, 32, 0, 35.4, [0, 'rgba(22,32,42,.13)', 1, 'rgba(22,32,42,0)']));
      // 招牌燈箱：白底、斜切的橘綠色帶，中間是店名
      P.rect(0, 0, W, 10, C.white);
      P.band(0, 1.6, W, 5.6, 0.8);
      P.rect(0, 9.7, W, 0.5, C.line);
      const name = state.name;
      const nw = Math.max(46, P.width(name, 6.2) + 14);
      const lit = !!state.upgrades.sign;
      if (lit) { ctx.save(); ctx.shadowColor = 'rgba(255,170,60,' + (0.65 + 0.2 * Math.sin(t / 600)).toFixed(2) + ')'; ctx.shadowBlur = 5 * k; }
      P.rr(W / 2 - nw / 2, 0.5, nw, 9, 2.2, C.white, lit ? C.orange : C.line, lit ? 0.7 : 0.4);
      if (lit) ctx.restore();
      P.text(name, W / 2, 5.3, 6.2, lit ? '#D9540A' : C.ink);
      // 升級設備
      if (state.upgrades.aircon) { P.rr(160, 11.6, 28, 7.6, 2, C.white, C.line); P.rect(163, 16.6, 22, 0.7, '#B9C4CE'); P.circ(185, 13.8, 0.7, C.teal); }
      if (state.upgrades.camera) { P.rr(2.4, 10.6, 8, 1.8, 0.8, '#C9D2DA'); ctx.beginPath(); ctx.arc(6.4, 12.3, 2.7, 0, Math.PI); ctx.closePath(); ctx.fillStyle = C.graphite; ctx.fill(); P.circ(6.4, 13.4, 0.7, Math.floor(t / 700) % 2 ? C.red : '#5B6875'); }
      if (state.upgrades.service) {
        P.ell(184.4, 33.4, 7, 1.2, 'rgba(22,32,42,.13)');
        P.rr(178, 12, 13, 21.4, 1.6, C.graphite);
        P.rr(179.4, 13.6, 10.2, 7.6, 0.8, P.grad(0, 13.6, 0, 21.2, [0, '#5EE0C7', 1, '#2D9CDB']));
        P.rect(180.4, 15, 4, 0.7, 'rgba(255,255,255,.85)'); P.rect(180.4, 16.6, 6.6, 0.6, 'rgba(255,255,255,.6)'); P.rect(180.4, 18, 5.4, 0.6, 'rgba(255,255,255,.6)');
        P.rr(180.2, 23.2, 8.6, 1.2, 0.5, '#0E141A'); P.rect(181.4, 23.9, 6.2, 1.6, '#FFFFFF');
        P.rr(180.2, 27.4, 8.6, 3.4, 0.6, '#3B4753');
      }
      // 落地玻璃與門框
      const sky = outsideColor(clock);
      P.rect(0, 144, W, 16, '#D5DCE3');
      P.rect(0, 144, W, 1.1, C.steel);
      [[1.5, 93], [129.5, 61]].forEach(function (g) {
        P.rr(g[0], 146.2, g[1], 12.6, 1, P.grad(0, 146, 0, 159, [0, sky[0], 1, sky[1]]), C.steel, 0.9);
        for (let x = g[0] + 31; x < g[0] + g[1] - 4; x += 31) P.rect(x, 146.2, 0.9, 12.6, C.steel);
        P.dots(g[0], 152.6, g[1], 'rgba(255,255,255,.85)');
        P.poly([g[0] + 5, 146.4, g[0] + 12, 146.4, g[0] + 6, 158.6, g[0] + 1.8, 158.6], 'rgba(255,255,255,.22)');
      });
      if (state.weather === 'rainy' || state.weather === 'typhoon') {
        for (let i = 0; i < 28; i++) {
          const rx = (i * 37 + Math.floor(t / 50) * 3) % 188;
          if (rx > 93 && rx < 128) continue;
          P.line(rx + 2.6, 147 + (i * 5 + Math.floor(t / 50)) % 9, rx + 2, 149.4 + (i * 5 + Math.floor(t / 50)) % 9, 'rgba(255,255,255,.75)', 0.4);
        }
      }
      // 自動門
      P.rr(95.5, 145.2, 33, 14.8, 1, C.steel);
      P.rect(96.6, 146.3, 30.8, 13.7, '#B9C4CE');
      const gap = 14.2 * doorOpen;
      P.rect(96.6, 146.3, 15.1 - gap, 13.7, 'rgba(200,232,246,.92)'); P.rect(112.3 + gap, 146.3, 15.1 - gap, 13.7, 'rgba(200,232,246,.92)');
      if (gap < 14) {
        P.dots(96.6, 152.6, 15.1 - gap, C.orange); P.dots(112.3 + gap, 152.6, 15.1 - gap, C.orange);
        P.rect(111 - gap, 146.3, 0.7, 13.7, C.steel); P.rect(112.3 + gap, 146.3, 0.7, 13.7, C.steel);
      }
      // 門口地墊、雨天的傘架
      P.rr(98.5, 134, 27, 8.4, 1.6, C.teal); P.rr(100, 135.4, 24, 5.6, 1, '#0B8F7C');
      P.text('歡迎光臨', 112, 138.4, 3.6, 'rgba(255,255,255,.8)');
      if (state.weather === 'rainy' || state.weather === 'typhoon') {
        P.ell(88.5, 143, 3.6, 0.9, 'rgba(22,32,42,.13)');
        P.rr(85.6, 136, 5.8, 7, 1, C.steel);
        P.line(87, 136, 86.2, 130.6, '#3B6FE0', 0.8); P.line(89, 136, 89.6, 130, C.red, 0.8); P.line(90.4, 136, 91.6, 131.4, C.yellow, 0.8);
      }
      // 座位區或盆栽
      if (state.upgrades.seats) {
        P.ell(174, 142.6, 17, 1.2, 'rgba(22,32,42,.10)');
        [163, 174, 185].forEach(function (sx) { P.rect(sx - 0.4, 134, 0.8, 7, C.steel); P.ell(sx, 133.6, 3.2, 1.5, C.orange); });
        P.rr(156, 138.4, 35, 3, 1.2, C.wood, C.woodD, 0.35);
      } else {
        P.ell(181.5, 141, 5.6, 1.2, 'rgba(22,32,42,.13)');
        P.circ(178.2, 128.4, 3.8, '#1E9E5A'); P.circ(185, 128.8, 3.6, '#2DB36A'); P.circ(181.6, 124.6, 4.4, '#35BF73'); P.circ(180, 127.6, 2.2, '#48CC84');
        P.poly([177, 131.6, 186, 131.6, 185, 140.6, 178, 140.6], C.white); P.rect(177, 131.6, 9, 1.4, '#E3E8ED');
        P.ell(167, 141.2, 7.6, 1.1, 'rgba(22,32,42,.12)');
        ['#3B6FE0', '#128A4A', '#8A96A3'].forEach(function (bc, bi) {
          const bx = 160.6 + bi * 4.5;
          P.rr(bx, 133.4, 3.9, 7.6, 0.9, bc); P.rr(bx - 0.2, 132.8, 4.3, 1.5, 0.7, C.graphite); P.circ(bx + 1.95, 137.4, 0.9, 'rgba(255,255,255,.85)');
        });
      }
    }
    function counter(t) {
      const shift = E.shiftOf(Math.min(state.t, 23));
      const crew = E.crewOn(state, shift);
      const open = E.isOpen(state, shift);
      const frame = Math.floor(t / 500) % 2;
      for (let i = 0; i < Math.min(crew.length, 3) && open; i++) drawPerson(P, 9 + i * 14, 110, CLERK_LOOK, i === 0 ? frame : 0, true);
      P.ell(24, 128.4, 25, 2, 'rgba(22,32,42,.13)');
      P.rr(-1, 108, 49, 20, 2, C.wood, C.woodD, 0.4);
      for (let i = 0; i < 9; i++) P.line(3.6 + i * 5, 117.4, 3.6 + i * 5, 127, C.woodD, 0.4);
      P.rr(-1, 107.4, 49.6, 6.2, 1.6, '#F6F8FA', C.line, 0.4);
      P.band(0, 114, 48, 1.7);
      // 觸控收銀機、感應刷卡機
      P.rr(34.6, 104, 2.2, 5, 0.6, C.steel);
      P.rr(28.6, 95.8, 14.2, 9.6, 1.6, C.graphite);
      P.rr(29.8, 97, 11.8, 7.2, 0.8, P.grad(0, 97, 0, 104.2, [0, '#7FE9F5', 1, '#2D9CDB']));
      P.rect(31, 98.4, 5, 0.8, 'rgba(255,255,255,.9)'); P.rect(31, 100.2, 8, 0.6, 'rgba(255,255,255,.6)'); P.rr(36.6, 101.6, 3.8, 1.8, 0.5, C.orange);
      P.rr(20.4, 105, 5.4, 4.2, 1, C.graphite); P.rect(21.4, 105.9, 3.4, 1.5, '#5EE0C7');
      if (state.cat) {
        const cx = 9, cy = 106.4;
        P.line(cx + 5.4, cy + 0.6, cx + 8.6, cy - (frame ? 1.6 : 0.4), '#E08A3C', 1.3);
        P.ell(cx + 0.6, cy, 5.6, 2.9, '#F4A261');
        P.circ(cx - 4.6, cy - 1.2, 2.7, '#F4A261');
        P.poly([cx - 6.8, cy - 2.6, cx - 6, cy - 5, cx - 4.6, cy - 3.2], '#F4A261'); P.poly([cx - 4.4, cy - 3.2, cx - 3, cy - 5, cx - 2.4, cy - 2.6], '#F4A261');
        P.line(cx - 5.8, cy - 1.2, cx - 5, cy - 1, C.ink, 0.4); P.line(cx - 3.9, cy - 1, cx - 3.1, cy - 1.2, C.ink, 0.4);
        P.line(cx - 1, cy - 2.4, cx - 1, cy - 0.6, '#E08A3C', 0.7); P.line(cx + 1.6, cy - 2.7, cx + 1.6, cy - 0.8, '#E08A3C', 0.7);
      }
      if (!open) { P.rr(5, 116.6, 38, 9.6, 2, C.white, C.red, 0.8); P.text('準備中', 24, 121.7, 6, C.red); }
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
            if (step.pay) floats.push({ x: 40, y: 96, text: '+$' + step.pay, until: now + 900, born: now });
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
      k = fit(canvas, W, H);
      ctx.setTransform(k, 0, 0, k, 0, 0);
      ctx.imageSmoothingEnabled = true;
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
        items.push({ y: s.y, draw: function () { drawPerson(P, s.x, s.y, SEG_LOOK[s.seg] || SEG_LOOK.student, Math.floor(s.walked / 5) % 2, false, s.seg); } });
      });
      items.sort(function (a, b) { return a.y - b.y; });
      items.forEach(function (it) { it.draw(); });
      // 沒人顧店：店裡的燈關掉
      const shift = E.shiftOf(Math.min(state.t, 23));
      if (!E.isOpen(state, shift)) P.rect(0, 0, W, H, 'rgba(11,22,38,.5)');
      // 泡泡與飄字
      sprites.forEach(function (s) {
        if (!s.bubble || now > s.bubbleUntil) return;
        const b = BUBBLE[s.bubble];
        const love = s.bubble === 'love';
        const w = (love ? 6 : P.width(b.text, 6)) + 7, h = 10;
        const bx = Math.max(1, Math.min(W - w - 1, s.x - w / 2)), by = Math.max(11, s.y - 33);
        P.rr(bx + 0.4, by + 0.9, w, h, 3.6, 'rgba(22,32,42,.16)');
        P.rr(bx, by, w, h, 3.6, C.white, '#C3CCD5', 0.4);
        P.poly([s.x - 1.7, by + h - 0.3, s.x + 1.7, by + h - 0.3, s.x, by + h + 2.2], C.white);
        if (love) P.heart(bx + w / 2, by + h / 2 - 0.4, 2.5, C.red);
        else P.text(b.text, bx + w / 2, by + h / 2 + 0.4, 6, b.color);
      });
      floats.forEach(function (f) {
        const q = (now - f.born) / 900;
        ctx.globalAlpha = 1 - q * q;
        P.text(f.text, f.x, f.y - q * 12, 7, C.green, 'center', '#FFFFFF');
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

  /* ---------- 標題畫面：夜裡亮著燈的店 ---------- */
  function drawTitle(canvas, now) {
    const TW = 192, TH = 132;
    const k = fit(canvas, TW, TH);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const P = brush(ctx);
    // 夜空、星星、月亮
    P.rect(0, 0, TW, TH, P.grad(0, 0, 0, 104, [0, '#070F1C', 1, '#1D3557']));
    for (let i = 0; i < 34; i++) {
      const a = 0.3 + 0.6 * Math.abs(Math.sin(now / 1100 + i * 1.7));
      P.circ((i * 53 + 17) % TW, (i * 29 + 5) % 52, i % 6 === 0 ? 0.75 : 0.45, 'rgba(255,255,255,' + a.toFixed(2) + ')');
    }
    // 彎月：先畫一圈柔和的光暈，再把「被遮住的那一塊」排除在繪圖範圍外畫月亮本體
    const halo = ctx.createRadialGradient(164.4, 17.6, 2, 164.4, 17.6, 17);
    halo.addColorStop(0, 'rgba(255,233,168,.22)'); halo.addColorStop(1, 'rgba(255,233,168,0)');
    P.circ(164.4, 17.6, 17, halo);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, TW, 60); ctx.arc(169.6, 15, 5.7, 0, 6.2832, true); ctx.clip('evenodd');
    P.circ(166, 17, 6.4, '#FFE9A8');
    ctx.restore();
    // 遠方大樓
    [[0, 30, 30], [24, 20, 46], [150, 22, 40], [168, 24, 28], [118, 18, 22]].forEach(function (b, bi) {
      P.rr(b[0], 100 - b[2], b[1], b[2] + 2, 1, '#12233B');
      for (let y = 4; y < b[2] - 6; y += 6) for (let x = 3; x < b[1] - 3; x += 5) if ((x * 7 + y * 3 + bi * 5) % 4 === 0) P.rr(b[0] + x, 100 - b[2] + y, 2, 3, 0.4, 'rgba(255,217,138,.8)');
    });
    // 人行道與馬路
    P.rect(0, 100, TW, 9, '#33404D'); P.rect(0, 100, TW, 0.8, '#4E5D6B');
    P.rect(0, 109, TW, 23, '#18212B'); P.rect(0, 109, TW, 1, '#55636F');
    for (let i = 0; i < 7; i++) P.rr(i * 30 + 6, 121, 14, 1.6, 0.8, 'rgba(255,255,255,.5)');
    // 店面
    const sx = 34, sy = 40, sw = 124;
    P.poly([sx + 4, 100, sx + sw - 4, 100, sx + sw + 14, 114, sx - 14, 114], P.grad(0, 100, 0, 114, [0, 'rgba(255,246,214,.36)', 1, 'rgba(255,246,214,0)']));
    P.rr(sx, sy + 6, sw, 54, 1.5, '#E9EEF2');
    // 招牌燈箱
    ctx.save(); ctx.shadowColor = 'rgba(255,255,255,.6)'; ctx.shadowBlur = 7 * k;
    P.rr(sx - 2, sy - 1, sw + 4, 15, 2.6, '#FFFFFF');
    ctx.restore();
    P.band(sx - 1.2, sy + 2, sw + 2.4, 8.6, 0.8);
    P.rr(sx + sw / 2 - 37, sy - 0.2, 74, 13.4, 2.2, '#FFFFFF');
    P.text('叮咚！便利店', sx + sw / 2, sy + 6.9, 9.4, C.ink);
    // 落地玻璃：看得到裡面的貨架、冷藏櫃、櫃台
    P.rr(sx + 3, sy + 17, 77, 43, 1, C.steel);
    P.rect(sx + 4.2, sy + 18.2, 74.6, 41.8, '#FFFDF4');
    P.rect(sx + 4.2, sy + 18.2, 74.6, 1.6, '#FFFFFF');
    P.rr(sx + 7, sy + 29, 21, 31, 1, '#FFFFFF', C.line, 0.4); P.rect(sx + 7, sy + 29, 21, 2.4, C.teal);
    const pc = ['#F2B632', '#E4572E', '#EF6F9C', '#6A994E', '#3B6FE0'];
    for (let r = 0; r < 3; r++) { for (let i = 0; i < 4; i++) P.rr(sx + 8.6 + i * 4.7, sy + 34 + r * 8.6, 3.6, 5.6, 0.7, pc[(i + r) % 5]); P.rect(sx + 7.6, sy + 39.8 + r * 8.6, 19.8, 1, '#DCE3E9'); }
    P.rr(sx + 31, sy + 25, 22, 35, 1.2, C.graphite); P.rect(sx + 32, sy + 26, 20, 1.5, '#EAF7FF');
    P.rr(sx + 32.2, sy + 28.4, 9.5, 30, 0.6, '#D4EEF9'); P.rr(sx + 42.3, sy + 28.4, 9.5, 30, 0.6, '#D4EEF9');
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) { const bx = sx + 33 + i * 3.1 + (i > 2 ? 0.8 : 0), by = sy + 31 + r * 9.4; P.rr(bx, by + 1.2, 2.3, 5, 0.8, ['#6A994E', '#E63946', '#FDFCDC', '#E9C46A'][(i + r) % 4]); P.rect(bx + 0.65, by, 1, 1.5, '#FFFFFF'); }
    drawPerson(P, sx + 66, sy + 50, CLERK_LOOK, 0, true);
    P.rr(sx + 56, sy + 47, 22.6, 13, 1.2, C.wood); P.rr(sx + 55.6, sy + 46.2, 23.4, 3.4, 1, '#F6F8FA'); P.band(sx + 56, sy + 50.2, 22.6, 1.2);
    P.rr(sx + 71, sy + 39.4, 6.4, 5, 0.9, C.graphite); P.rect(sx + 71.9, sy + 40.2, 4.6, 3.2, '#5ED8F0'); P.rect(sx + 73.6, sy + 44.2, 1.2, 2.2, C.steel);
    P.rr(sx + 58, sy + 22, 15, 10.5, 1, C.orange); P.poly([sx + 61.4, sy + 25, sx + 66, sy + 25, sx + 65.4, sy + 29.6, sx + 62, sy + 29.6], '#FFFFFF'); P.rect(sx + 67.6, sy + 25.4, 3.6, 0.9, '#FFFFFF'); P.rect(sx + 67.6, sy + 27.4, 2.6, 0.9, '#FFFFFF');
    P.rect(sx + 29.2, sy + 18.2, 1, 41.8, C.steel); P.rect(sx + 54.2, sy + 18.2, 1, 41.8, C.steel);
    P.dots(sx + 4.2, sy + 41, 74.6, 'rgba(255,255,255,.9)');
    P.poly([sx + 10, sy + 18.2, sx + 22, sy + 18.2, sx + 8, sy + 60, sx + 4.2, sy + 60, sx + 4.2, sy + 36], 'rgba(255,255,255,.16)');
    // 自動門
    const cyc = (now % 6000) / 6000;
    const open = cyc > 0.55 && cyc < 0.85 ? 1 : 0;
    P.rr(sx + 83, sy + 17, 38, 43, 1, C.steel);
    P.rect(sx + 84.2, sy + 18.2, 35.6, 41.8, '#FFFDF4');
    const gap = open * 15;
    P.rect(sx + 84.2, sy + 18.2, 17.4 - gap, 41.8, 'rgba(196,230,246,.9)'); P.rect(sx + 102.4 + gap, sy + 18.2, 17.4 - gap, 41.8, 'rgba(196,230,246,.9)');
    P.dots(sx + 84.2, sy + 41, 17.4 - gap, C.orange); P.dots(sx + 102.4 + gap, sy + 41, 17.4 - gap, C.orange);
    if (!open) P.rect(sx + 101.6, sy + 18.2, 0.8, 41.8, C.steel);
    P.rr(sx + 87, 100.4, 30, 3.2, 1, C.teal);
    // 店門口的機車與立牌
    P.ell(21, 107.6, 11, 1.3, 'rgba(0,0,0,.3)');
    P.circ(13.4, 104.6, 3.1, '#0C1218'); P.circ(13.4, 104.6, 1.2, '#8A96A3'); P.circ(28.4, 104.6, 3.1, '#0C1218'); P.circ(28.4, 104.6, 1.2, '#8A96A3');
    P.rr(12, 99.6, 14, 4.6, 2.2, C.teal); P.poly([24, 104, 28.6, 104, 27.4, 95.4, 25.4, 95.4], C.teal);
    P.rr(12.6, 97.6, 9.4, 2.4, 1.1, '#20272E'); P.line(26.4, 95.4, 24.2, 93.2, '#C9D2DA', 0.8); P.circ(28.2, 97.6, 0.9, '#FFE9A8');
    P.poly([sx + sw - 2, 107.4, sx + sw + 7, 107.4, sx + sw + 5.4, 95.4, sx + sw - 0.4, 95.4], '#FFFFFF');
    P.rect(sx + sw - 0.2, 95.4, 5.4, 3, C.orange); P.rect(sx + sw + 0.2, 100, 4.6, 0.8, C.ink); P.rect(sx + sw + 0.2, 102, 3.4, 0.8, '#8A96A3'); P.rect(sx + sw + 0.2, 104, 4, 0.8, '#8A96A3');
    // 走進店裡的客人
    const px = cyc < 0.6 ? cyc / 0.6 * (sx + 100) - 10 : sx + 102;
    if (cyc < 0.8) drawPerson(P, px, 108 - (cyc > 0.6 ? (cyc - 0.6) / 0.2 * 7 : 0), SEG_LOOK.student, Math.floor(now / 170) % 2, false, 'student');
  }

  /* ---------- 顧問「咚咚」：一顆有臉的門鈴 ---------- */
  let mascotUrl = null;
  function mascot() {
    if (mascotUrl) return mascotUrl;
    const c = document.createElement('canvas');
    c.width = 160; c.height = 160;
    const ctx = c.getContext('2d');
    ctx.setTransform(5, 0, 0, 5, 0, 0);
    const P = brush(ctx);
    P.ell(16, 29.6, 9, 1.4, 'rgba(22,32,42,.14)');
    P.circ(16, 27.6, 2.6, C.yellow);
    P.circ(16, 4.6, 2.3, C.teal);
    ctx.beginPath(); ctx.moveTo(4.6, 24.4); ctx.bezierCurveTo(9.4, 21.6, 7.6, 6.6, 16, 6.2); ctx.bezierCurveTo(24.4, 6.6, 22.6, 21.6, 27.4, 24.4); ctx.closePath();
    ctx.fillStyle = P.grad(0, 6, 0, 25, [0, '#FF8E42', 1, '#FF6A13']); ctx.fill();
    P.rr(3.4, 22.8, 25.2, 3.8, 1.9, C.yellow);
    ctx.save(); ctx.translate(11, 12.4); ctx.rotate(0.35); P.ell(0, 0, 1.4, 3.2, 'rgba(255,255,255,.45)'); ctx.restore();
    P.circ(12.2, 16.2, 1.45, C.ink); P.circ(19.8, 16.2, 1.45, C.ink);
    P.circ(12.7, 15.7, 0.45, '#FFFFFF'); P.circ(20.3, 15.7, 0.45, '#FFFFFF');
    P.circ(9.8, 19, 1.5, 'rgba(255,255,255,.4)'); P.circ(22.2, 19, 1.5, 'rgba(255,255,255,.4)');
    ctx.beginPath(); ctx.arc(16, 17.8, 2.5, 0.2 * Math.PI, 0.8 * Math.PI); ctx.strokeStyle = C.ink; ctx.lineWidth = 0.9; ctx.lineCap = 'round'; ctx.stroke();
    mascotUrl = c.toDataURL();
    return mascotUrl;
  }

  root.DD_SCENE = { Scene: Scene, drawTitle: drawTitle, mascot: mascot, SLOT_POS: SLOT_POS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
