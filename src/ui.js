/* 叮咚！便利店 — 介面（DOM）。所有遊戲規則都在 engine.js，這裡只負責顯示與操作。 */
(function (root) {
  'use strict';
  const D = root.DD_DATA, E = root.DD, C = root.DD_CHAIN, SC = root.DD_SCENE, AU = root.DD_AUDIO;
  const CLOUD = root.DD_CLOUD || { enabled: false };
  const VER = root.DD_VERSION || { version: 'dev', changelog: [] };
  const SAVE_KEY = 'dingdong-mart-save-v1';
  const PREF_KEY = 'dingdong-mart-pref-v1';
  const SPEED_MS = { 1: 1500, 2: 500 };
  const SPEED_MULT = { 1: 1, 2: 3 };
  const HALL_MAX = 10;
  // 搜尋商品時也比對得到的同義詞
  const KEYWORDS = { snack: '零食 餅乾 點心', noodle: '杯麵 速食麵 零食', daily: '日用品 面紙', umbrella: '雨具 日用品', candy: '糖果 零食', pen: '筆 日用品',
    tea: '飲料 茶 綠茶', soda: '飲料 可樂 氣泡', milk: '飲料 牛奶 乳品', beer: '飲料 酒', onigiri: '飯糰 鮮食', bento: '飯 餐盒 鮮食', sandwich: '麵包 鮮食',
    egg: '熱食 蛋', oden: '熱食 黑輪', hotdog: '熱食 熱狗', popsicle: '冰品 冰', dumpling: '冷凍 餃子', paper: '書報', comic: '書報 雜誌', coffee: '飲料 咖啡', slush: '飲料 冰品' };
  const MEDALS = ['未達標', '銅牌店長', '銀牌店長', '金牌店長'];
  const WX_CH = { sunny: '晴', cloudy: '陰', rainy: '雨', hot: '暑', cold: '寒', typhoon: '颱' };
  const TABS = [['stock', '進貨'], ['equip', '設備'], ['staff', '店員'], ['promo', '宣傳'], ['report', '報表']];

  const app = document.getElementById('app');
  const money = E.money;
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function $(sel) { return app.querySelector(sel); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function signed(n) { return (n < 0 ? '−' : '+') + money(Math.abs(n)); }

  let CH = null;   // 連鎖：一家或多家店共用一個錢包
  let S = null;    // 目前正在看的那家店（CH.stores[CH.active]）
  let scene = null;
  const ui = { screen: 'title', speed: 1, paused: true, sheet: null, slotSel: null, modal: null, acc: 0, last: 0,
    cityId: null, locId: null, tick: '', closedNote: -1, toastTimer: null, hoursBy: {}, stockQ: '', stockCat: 'all',
    lastBg: [], milestone: false, branchMode: false, moveFrom: null };
  const pref = { sfx: true, music: true, tutorial: false, best: {}, hall: [], nick: '' };
  function hoursOf() { return (CH && ui.hoursBy[CH.active]) || []; }

  /* ---------- 存檔 ---------- */
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; } }
  function fetchStored(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save() { return CH && !C.over(CH) && !CH.retired ? store(SAVE_KEY, { chain: CH, speed: ui.speed, hours: ui.hoursBy, at: Date.now() }) : false; }
  /** 讀檔。舊版（只有一家店）的存檔會自動轉成連鎖格式。 */
  function loadSave() {
    const sv = fetchStored(SAVE_KEY);
    const ch = C.fromSave(sv);
    if (!ch) return null;
    const hours = Array.isArray(sv.hours) ? { 0: sv.hours } : (sv.hours && typeof sv.hours === 'object' ? sv.hours : {});
    return { chain: ch, speed: sv.speed === 1 || sv.speed === 2 ? sv.speed : 1, hours: hours };
  }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 沒有儲存空間就算了 */ } }
  (function () {
    const p = fetchStored(PREF_KEY);
    if (p) { pref.sfx = p.sfx !== false; pref.music = p.music !== false; pref.tutorial = !!p.tutorial; pref.best = p.best && typeof p.best === 'object' ? p.best : {}; pref.hall = Array.isArray(p.hall) ? p.hall.slice(0, HALL_MAX) : []; pref.nick = typeof p.nick === 'string' ? p.nick.slice(0, 10) : ''; }
    AU.setSfx(pref.sfx); AU.setMusic(pref.music);
  })();
  function savePref() { store(PREF_KEY, pref); }

  /* ---------- 小元件 ---------- */
  function wxChip(k, label) {
    return '<span class="wx wx-' + k + '">' + WX_CH[k] + '</span>' + (label ? '<span class="wx-name">' + D.WEATHER[k].name + '</span>' : '');
  }
  function chip(p) {
    const c = p.color.replace('#', '');
    const lum = (parseInt(c.substr(0, 2), 16) * 299 + parseInt(c.substr(2, 2), 16) * 587 + parseInt(c.substr(4, 2), 16) * 114) / 1000;
    return '<span class="chip" style="background:' + p.color + ';color:' + (lum > 150 ? '#1b1f3b' : '#fff') + '">' + p.ch + '</span>';
  }
  function bar(v, max, cls) {
    return '<span class="meter ' + (cls || '') + '"><i style="width:' + Math.max(0, Math.min(100, v / max * 100)) + '%"></i></span>';
  }
  function toast(msg, bad) {
    const el = $('#toast');
    if (!el || !msg) return;
    el.textContent = msg;
    el.className = 'toast show' + (bad ? ' bad' : '');
    clearTimeout(ui.toastTimer);
    ui.toastTimer = setTimeout(function () { el.className = 'toast'; }, 2600);
  }
  function say(msg) {
    ui.tick = msg;
    const el = $('#tick');
    if (el) el.textContent = msg;
  }

  /* ---------- 標題 ---------- */
  function renderTitle() {
    ui.screen = 'title';
    const sv = loadSave();
    app.innerHTML =
      '<div class="title">' +
        '<canvas id="titleCanvas" aria-label="夜裡亮著燈的便利店"></canvas>' +
        '<p class="tagline">一九九九年的夏天，你頂下了巷口的一間小店。<br>進貨、排班、對付奧客，把它變成整條街最亮的招牌。</p>' +
        '<div class="title-btns">' +
          (sv ? '<button class="btn big primary" data-act="continue">繼續經營<small>' + esc(sv.chain.stores[0].name) + (sv.chain.stores.length > 1 ? ' 等 ' + sv.chain.stores.length + ' 家店' : '') + '・第 ' + sv.chain.stores[0].day + ' 天</small></button>' : '') +
          '<button class="btn big' + (sv ? '' : ' primary') + '" data-act="new">開一家新店</button>' +
          '<div class="title-row three"><button class="btn" data-act="howto">怎麼玩</button><button class="btn" data-act="hall">排行榜</button><button class="btn" data-act="changelog">更新紀錄</button></div>' +
        '</div>' +
        '<p class="title-foot"><button class="link" data-act="toggleMusic">音樂：' + (pref.music ? '開' : '關') + '</button>' +
          '<button class="link" data-act="toggleSfx">音效：' + (pref.sfx ? '開' : '關') + '</button><span>v' + esc(VER.version) + '</span></p>' +
      '</div><div class="modal-wrap" id="modal" hidden></div><div class="toast" id="toast"></div>';
  }

  /* ---------- 選城市與地點 ---------- */
  function renderCity() {
    ui.screen = 'city';
    const br = ui.branchMode;
    let html = '<div class="pick"><div class="win"><div class="awning"></div><h2>' + (br ? '分店要開在哪個城市？' : '要在哪個城市開店？') + '</h2><div class="win-body">';
    D.CITY_ORDER.forEach(function (id) {
      const c = D.CITIES[id];
      html += '<button class="city" data-act="city" data-id="' + id + '"><b>' + c.name + '</b><span class="tag lv-' + id + '">' + c.level + '</span>' +
        '<p>' + c.blurb + '</p><small>' + (br ? '頂下一間店 ' + money(C.BRANCH_COST[id]) + '・含基本設備與第一批貨' : '創業資金 ' + money(c.cash) + '・' + c.days + ' 天內總資產達 ' + money(c.goals[0]) + ' 得銅牌') + '</small></button>';
    });
    html += '</div><div class="win-foot">' + (br ? '<span class="sub">現金 ' + money(C.wallet(CH)) + '</span><button class="btn" data-act="backToGame">回店裡</button>' : '<button class="btn" data-act="title">回標題</button>') + '</div></div></div>' +
      '<div class="modal-wrap" id="modal" hidden></div><div class="toast" id="toast"></div>';
    app.innerHTML = html;
  }
  function trafficWord(n) { return n >= 2800 ? '非常多' : n >= 2200 ? '多' : n >= 1700 ? '普通' : '偏少'; }
  function renderLoc() {
    ui.screen = 'loc';
    const city = D.CITIES[ui.cityId];
    const br = ui.branchMode;
    const mine = function (id) { return br && C.owns(CH, id); };
    const locs = D.LOCATIONS.filter(function (l) { return l.city === ui.cityId; });
    if (!ui.locId || E.LOC[ui.locId].city !== ui.cityId) ui.locId = (locs.filter(function (l) { return !mine(l.id); })[0] || locs[0]).id;
    const loc = E.LOC[ui.locId];
    let pins = '';
    locs.forEach(function (l) {
      const best = pref.best[l.id] | 0;
      pins += '<button class="pin' + (l.id === ui.locId ? ' on' : '') + (best ? ' won' : '') + (mine(l.id) ? ' own' : '') + '" style="left:' + l.x + '%;top:' + l.y + '%" data-act="loc" data-id="' + l.id + '"><i></i><span>' + l.name + (mine(l.id) ? '・你的店' : best ? '・' + ['', '銅', '銀', '金'][best] : '') + '</span></button>';
    });
    let mix = '';
    Object.keys(D.SEGMENTS).forEach(function (k) {
      const v = loc.mix[k] || 0;
      if (v > 0) mix += '<div class="mixrow"><span>' + D.SEGMENTS[k].name + '</span>' + bar(v, 0.75, 'seg-' + k) + '<small>' + Math.round(v * 100) + '%</small></div>';
    });
    const rivals = loc.rivals.length ? loc.rivals.map(function (r) { return r.name; }).join('、') : '目前沒有';
    const old = $('#storeName');
    const nameVal = old ? old.value : (ui.nameDraft || (br ? (CH.stores[0].name.slice(0, 6) + ['', '二店', '三店', '四店'][CH.stores.length]) : '叮咚便利店'));
    const can = br ? C.canBranch(CH, ui.locId) : null;
    app.innerHTML =
      '<div class="pick"><div class="win"><div class="awning"></div><h2>' + city.name + '・挑一個店面</h2><div class="win-body">' +
        '<div class="map map-' + ui.cityId + '">' + pins + '</div>' +
        '<div class="locinfo"><h3>' + loc.name + '<span class="tag">' + loc.kind + '</span>' + (pref.best[loc.id] ? '<span class="tag best">拿過' + MEDALS[pref.best[loc.id]].slice(0, 2) + '</span>' : '') + '</h3>' +
          '<div class="kv"><span>每日店租</span><b>' + money(loc.rent) + '</b><span>商圈人潮</span><b>' + trafficWord(loc.traffic) + '</b>' +
          '<span>週末人潮</span><b>' + (loc.weekend > 1.15 ? '比平日多' : loc.weekend < 0.85 ? '比平日少很多' : '跟平日差不多') + '</b><span>同業對手</span><b>' + rivals + '</b></div>' +
          mix +
          '<div class="advice"><img class="mascot" alt="" src="' + SC.mascot() + '"><p>' + loc.tip + '</p></div>' +
        '</div>' +
        '<label class="namefield">店名<input id="storeName" maxlength="8" value="' + esc(nameVal) + '" autocomplete="off"></label>' +
      '</div><div class="win-foot">' + (br
        ? (can.ok ? '' : '<span class="sub bad">' + esc(can.msg) + '</span>') + '<button class="btn" data-act="branch">換城市</button><button class="btn' + (can.ok ? ' primary' : ' off') + '" data-act="branchStart">頂下來 ' + money(C.branchCost(ui.locId)) + '</button>'
        : '<button class="btn" data-act="new">換城市</button><button class="btn primary" data-act="start">就開在這裡</button>') + '</div></div></div>' +
      '<div class="modal-wrap" id="modal" hidden></div><div class="toast" id="toast"></div>';
  }

  /* ---------- 營業畫面 ---------- */
  function renderGame() {
    ui.screen = 'game';
    let tabs = '';
    TABS.forEach(function (t) { tabs += '<button data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>'; });
    app.innerHTML =
      '<div class="game">' +
        '<header class="hud">' +
          '<div class="hud-row"><div class="hud-date"><b id="hDay"></b><span id="hClock" class="clock"></span></div>' +
            '<div class="hud-wx" id="hWx"></div><button class="icon-btn" data-act="menu">選單</button></div>' +
          '<div class="hud-row"><div class="lcd" id="hCash"></div><div class="hud-rep">口碑<b id="hRep"></b></div>' +
            '<button class="hud-goal" data-act="goal"><span id="hGoalTxt"></span><span class="meter gold"><i id="hGoalBar"></i></span></button></div>' +
        '</header>' +
        '<div class="stores" id="stores" hidden></div>' +
        '<div class="stage" id="stage"><canvas id="scene" aria-label="店面"></canvas></div>' +
        '<button class="dayline" id="dayline" data-act="tab" data-tab="staff" aria-label="今天每小時的來客數與三個班的人手，點一下去排班"></button>' +
        '<div class="advisor"><img class="mascot" alt="顧問咚咚" src="' + SC.mascot() + '"><p id="tick" aria-live="polite"></p></div>' +
        '<div class="controls"><div class="speed" role="group" aria-label="遊戲速度">' +
          '<button data-act="speed" data-v="0">暫停</button><button data-act="speed" data-v="1">×1</button><button data-act="speed" data-v="2">×3</button></div>' +
          '<div class="today" id="today"></div></div>' +
        '<nav class="tabs">' + tabs + '</nav>' +
        '<section class="sheet" id="sheet" hidden></section>' +
      '</div><div class="modal-wrap" id="modal" hidden></div><div class="toast" id="toast"></div>';
    scene = SC.Scene($('#scene'));
    scene.setState(S);
    scene.setSpeed(SPEED_MULT[ui.speed] || 1);
    fitStage();
    updateHud();
    say(ui.tick || '店長早！按「×1」就開始營業。');
  }
  function fitStage() {
    const st = $('#stage'), cv = $('#scene');
    if (!st || !cv) return;
    const scale = Math.min(st.clientWidth / 192, st.clientHeight / 160);
    cv.style.width = Math.floor(192 * scale) + 'px';
    cv.style.height = Math.floor(160 * scale) + 'px';
  }
  /* 今日時間軸：24 根長條代表每小時來客（過去＝實際、未來＝預估），下面是三個班的人手。 */
  function updateDayline() {
    const el = $('#dayline');
    if (!el) return;
    const exp = [], hrs = hoursOf();
    let max = 12;
    for (let t = 0; t < 24; t++) {
      const lam = E.lambdaAt(S, E.clockOf(t));
      exp.push(lam);
      const rec = hrs[t];
      max = Math.max(max, t < S.t && rec ? rec.n : lam);
    }
    let h = '<span class="dl-bars">';
    for (let t = 0; t < 24; t++) {
      const past = t < S.t, rec = hrs[t];
      const open = past && rec ? rec.open !== false : E.isOpen(S, E.shiftOf(t));
      const v = past && rec ? rec.n : exp[t];
      h += '<i class="' + (past ? 'dl-past' : 'dl-next') + (open ? '' : ' dl-shut') + (t === S.t ? ' dl-now' : '') + '" style="height:' + Math.max(7, Math.round(v / max * 100)) + '%"></i>';
    }
    h += '</span><span class="dl-shifts">';
    const cur = E.shiftOf(Math.min(S.t, 23));
    D.SHIFTS.forEach(function (sh, i) {
      const n = E.crewOn(S, i).length;
      h += '<span class="' + (E.isOpen(S, i) ? 'dl-ok' : 'dl-empty') + (cur === i ? ' dl-cur' : '') + '">' + sh.name + '　' + (S.closedToday ? '休息' : n ? n + ' 人' : '沒人顧') + '</span>';
    });
    el.innerHTML = h + '</span>';
  }
  function goalInfo() {
    const city = D.CITIES[S.cityId];
    const worth = E.netWorth(S);
    if (S.medal) {
      const w = C.wallet(CH);
      return { txt: w >= C.GOAL ? '現金破 300 萬！可以退休或開分店' : '距 300 萬 ' + money(C.GOAL - w), pct: w / C.GOAL * 100, worth: worth, chain: true };
    }
    let tier = 0;
    city.goals.forEach(function (g, i) { if (worth >= g) tier = i + 1; });
    const next = city.goals[Math.min(tier, 2)];
    const base = tier === 0 ? city.cash * 0.8 : city.goals[tier - 1];
    return { txt: tier >= 3 ? '金牌達標！' : '距' + ['銅', '銀', '金'][tier] + '牌 ' + money(Math.max(0, next - worth)), pct: tier >= 3 ? 100 : (worth - base) / (next - base) * 100,
      worth: worth, tier: tier, left: city.days - S.day + 1 };
  }
  function updateHud() {
    if (ui.screen !== 'game') return;
    const clock = E.clockOf(Math.min(S.t, 23));
    $('#hDay').textContent = '第 ' + S.day + ' 天 週' + D.WEEKDAYS[E.weekdayOf(S.day)];
    $('#hClock').textContent = pad2(clock) + ':00';
    $('#hWx').innerHTML = wxChip(S.weather, true) + '<small>明天</small>' + wxChip(S.forecast);
    const cash = $('#hCash');
    cash.textContent = money(S.cash);
    cash.className = 'lcd' + (S.cash < 0 ? ' neg' : '');
    $('#hRep').textContent = Math.round(S.rep);
    const g = goalInfo();
    $('#hGoalTxt').textContent = g.txt;
    $('#hGoalBar').style.width = Math.max(3, Math.min(100, g.pct)) + '%';
    const td = S.today;
    $('#today').textContent = '來客 ' + td.customers + '・營收 ' + money(td.rev);
    updateDayline();
    // 分店列：有兩家店以上，或已經可以開分店時才出現
    const sb = $('#stores');
    const show = CH.stores.length > 1 || CH.unlocked;
    if (sb.hidden === show) { sb.hidden = !show; fitStage(); }
    if (show) {
      let sh = '';
      CH.stores.forEach(function (st, i) {
        const warn = [0, 1, 2].some(function (k) { return !E.isOpen(st, k); });
        sh += '<button class="' + (i === CH.active ? 'on' : '') + '" data-act="switchStore" data-i="' + i + '">' + esc(st.name) + (warn ? '<i class="dot" title="有班次沒人顧"></i>' : '') + '</button>';
      });
      sb.innerHTML = sh + '<button class="hq" data-act="hq">總部</button>';
    }
    app.querySelectorAll('.speed button').forEach(function (b) {
      const v = +b.getAttribute('data-v');
      b.classList.toggle('on', ui.paused ? v === 0 : v === ui.speed);
    });
    app.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === ui.sheet); });
  }

  /* ---------- 分頁：進貨 ---------- */
  /** 明天清晨這項商品會補幾個、花多少錢（鮮食與報紙打烊就報廢，所以是整批重補）。 */
  function nextOrder(p) {
    const cap = E.cap(S, p.id);
    if (!cap) return { n: 0, cost: 0 };
    const goal = Math.min(S.target[p.id], cap);
    const n = p.perish ? goal : Math.max(0, goal - S.stock[p.id]);
    return { n: n, cost: Math.round(n * E.unitCost(S, p.id)) };
  }
  function stockSummary() {
    let n = 0, cost = 0, kinds = 0;
    D.PRODUCTS.forEach(function (p) { const o = nextOrder(p); if (o.n) { n += o.n; cost += o.cost; kinds++; } });
    const left = 24 - Math.min(S.t, 24);
    return '<div class="truck"><b>下一班貨車：明天清晨 06:00</b><span>還有 ' + left + ' 小時</span></div>' +
      '<div class="truckbar"><i style="width:' + (Math.min(S.t, 24) / 24 * 100) + '%"></i></div>' +
      '<p>' + (n ? '照現在的設定，會補 <b>' + kinds + '</b> 種、共 <b>' + n + '</b> 件，約 <b>' + money(cost) + '</b>（以打烊時剩下的量為準）。' : '照現在的設定，明天不用補貨。') + '</p>' +
      '<p class="sub">「補到」是每天自動補貨的目標量，<b>明早才到</b>。等不及就按<b>立刻到貨</b>：馬上上架，但多收三成運費。明天預報 ' + wxChip(S.forecast, true) + '</p>';
  }
  function prodRow(p) {
    const cap = E.cap(S, p.id), st = S.stock[p.id], tg = S.target[p.id], pct = S.price[p.id];
    const y = S.lastReport && S.lastReport.perProd[p.id];
    const rush = E.rushCost(S, p.id);
    const ord = nextOrder(p);
    const pctTxt = pct === 100 ? '原價' : (pct > 100 ? '貴 ' : '便宜 ') + Math.abs(pct - 100) + '%';
    let foot = y ? '昨天 賣 ' + y.sold + (y.soldOut ? '・<b class="bad">' + y.soldOut + ' 人買不到</b>' : '') + (y.waste ? '・<b class="bad">報廢 ' + y.waste + '</b>' : '') + (y.pricey ? '・' + y.pricey + ' 人嫌貴' : '') : '還沒有銷售紀錄';
    if (S.upgrades.pos && S.prodHist.length) foot += '・<b class="good">建議 ' + E.suggest(S, p.id) + '</b>';
    return '<div class="prod" data-pid="' + p.id + '">' +
      '<div class="prod-top">' + chip(p) + '<b>' + p.name + '</b>' + (p.perish ? '<span class="tag warn">當日報廢</span>' : '') + (S.promo[p.id] > 0 ? '<span class="tag good">進貨 7 折</span>' : '') +
        '<span class="stockn' + (st === 0 ? ' zero' : '') + '">庫存 ' + st + '／' + tg + '</span></div>' +
      '<div class="stockbar" aria-hidden="true"><i style="width:' + Math.min(100, st / cap * 100) + '%"></i><u style="left:' + Math.min(100, tg / cap * 100) + '%"></u></div>' +
      '<div class="prod-row"><span class="lbl">售價</span><button class="step" data-act="price" data-d="-5" aria-label="降價">−</button>' +
        '<span class="pv"><b>$' + E.unitPrice(S, p.id) + '</b><small class="' + (pct > 100 ? 'bad' : pct < 100 ? 'good' : '') + '">' + pctTxt + '</small></span>' +
        '<button class="step" data-act="price" data-d="5" aria-label="漲價">＋</button><span class="cost">成本 $' + E.unitCost(S, p.id) + '</span></div>' +
      '<div class="prod-row"><span class="lbl">補到</span><input type="range" min="0" max="' + cap + '" step="10" value="' + tg + '" data-act="target" aria-label="' + p.name + '進貨目標"><output>' + tg + '</output></div>' +
      '<div class="prod-eta"><span>' + (ord.n ? '明早 06:00 到貨 <b>+' + ord.n + '</b>（約 ' + money(ord.cost) + '）' : '明早不用補') + '</span>' +
        (rush ? '<button class="btn sm" data-act="rush">立刻到貨 +' + (Math.min(tg, cap) - st) + '・' + money(rush) + '</button>' : '') + '</div>' +
      '<div class="prod-foot"><span>' + foot + '</span></div></div>';
  }
  /* 模糊搜尋：直接包含最優先；否則只要每個字依序出現就算符合（打「茶蛋」找得到「茶葉蛋」）。 */
  function fuzzy(q, text) {
    q = q.replace(/\s+/g, '').toLowerCase();
    if (!q) return true;
    text = text.toLowerCase();
    if (text.indexOf(q) >= 0) return true;
    let i = 0;
    for (let k = 0; k < text.length && i < q.length; k++) if (text[k] === q[i]) i++;
    return i === q.length;
  }
  function stockMatch(p) {
    const cat = ui.stockCat;
    if (cat === 'out' && S.stock[p.id] > 0) return false;
    if (cat === 'low' && !(E.rushCost(S, p.id) > 0)) return false;
    if (cat.indexOf('fx:') === 0 && p.fx !== cat.slice(3)) return false;
    return fuzzy(ui.stockQ, p.name + ' ' + D.FIXTURES[p.fx].name + ' ' + (KEYWORDS[p.id] || ''));
  }
  /** 依搜尋字與分類，就地顯示或隱藏商品列（不重畫，輸入框才不會失去焦點）。 */
  function applyStockFilter() {
    const body = $('#sheet .sheet-body');
    if (!body || ui.sheet !== 'stock') return;
    let shown = 0;
    body.querySelectorAll('.prod').forEach(function (row) {
      const ok = stockMatch(E.P[row.getAttribute('data-pid')]);
      row.hidden = !ok;
      if (ok) shown++;
    });
    body.querySelectorAll('.grp[data-fx]').forEach(function (g) {
      const fx = g.getAttribute('data-fx');
      g.hidden = !D.PRODUCTS.some(function (p) { return p.fx === fx && E.cap(S, p.id) > 0 && stockMatch(p); });
    });
    const filtering = !!ui.stockQ.trim() || ui.stockCat !== 'all';
    body.querySelectorAll('.unsold').forEach(function (el) { el.hidden = filtering; });
    const none = $('#stockNone');
    if (none) none.hidden = shown > 0;
    body.querySelectorAll('.cats button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-k') === ui.stockCat); });
  }
  function sheetStock() {
    if (ui.stockCat.indexOf('fx:') === 0 && !E.fixtureCount(S, ui.stockCat.slice(3))) ui.stockCat = 'all';
    let html = '<div class="card ship" id="stockSum">' + stockSummary() + '</div>';
    html += '<input class="search" id="stockQ" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="搜尋商品，例如：茶、飲料、鮮食" aria-label="搜尋商品" data-act="stockSearch" value="' + esc(ui.stockQ) + '">';
    let cats = '<div class="cats" role="group" aria-label="商品分類"><button data-act="stockCat" data-k="all">全部</button><button data-act="stockCat" data-k="out">賣完了</button><button data-act="stockCat" data-k="low">沒補滿</button>';
    D.FIXTURE_ORDER.forEach(function (fx) { if (E.fixtureCount(S, fx)) cats += '<button data-act="stockCat" data-k="fx:' + fx + '">' + D.FIXTURES[fx].name + '</button>'; });
    html += cats + '</div>';
    if (S.upgrades.pos) html += '<button class="btn wide" data-act="applySuggest">一鍵套用 POS 建議進貨量</button>';
    html += '<p class="sub center" id="stockNone" hidden>找不到符合的商品。換個字，或按「全部」。</p>';
    const locked = [];
    D.FIXTURE_ORDER.forEach(function (fx) {
      const n = E.fixtureCount(S, fx);
      if (!n) { locked.push(fx); return; }
      html += '<h3 class="grp" data-fx="' + fx + '">' + D.FIXTURES[fx].name + ' ×' + n + '<small>每種最多 ' + D.FIXTURES[fx].cap * n + '</small></h3>';
      D.PRODUCTS.forEach(function (p) { if (p.fx === fx) html += prodRow(p); });
    });
    if (locked.length) {
      html += '<div class="unsold"><h3 class="grp">還不能賣的商品</h3>';
      locked.forEach(function (fx) {
        let chips = '', miss = 0;
        D.PRODUCTS.forEach(function (p) {
          if (p.fx !== fx) return;
          chips += chip(p) + '<span class="pname">' + p.name + '</span>';
          const y = S.lastReport && S.lastReport.perProd[p.id];
          if (y) miss += y.noSell;
        });
        html += '<div class="lockrow"><div>' + chips + '</div><small>需要「' + D.FIXTURES[fx].name + '」' + (miss ? '・昨天有 <b class="bad">' + miss + '</b> 人次想買' : '') + '</small></div>';
      });
      html += '<button class="btn wide" data-act="tab" data-tab="equip">去買設備</button></div>';
    }
    return html;
  }

  /* ---------- 分頁：設備 ---------- */
  function demandHint(fx) {
    const r = S.lastReport;
    if (!r) return '';
    let n = 0;
    const owned = E.fixtureCount(S, fx) > 0;
    D.PRODUCTS.forEach(function (p) {
      const y = r.perProd[p.id];
      if (p.fx === fx && y) n += owned ? (S.target[p.id] >= E.cap(S, p.id) ? y.soldOut : 0) : y.noSell;
    });
    if (!n) return '';
    return '<small class="hint">' + (owned ? '昨天放滿了還是有 ' + n + ' 人次買不到' : '昨天有 ' + n + ' 人次想買') + '</small>';
  }
  function sheetEquip() {
    const unlocked = E.unlockedSlots(S);
    if (ui.slotSel == null) { ui.slotSel = unlocked.filter(function (i) { return !S.slots[i]; })[0]; if (ui.slotSel == null) ui.slotSel = 0; }
    const rows = [[0, 1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11]];
    if (ui.moveFrom != null && !S.slots[ui.moveFrom]) ui.moveFrom = null;
    const moving = ui.moveFrom != null;
    let html = moving
      ? '<p class="note"><b>要把' + D.FIXTURES[S.slots[ui.moveFrom]].name + '搬到哪裡？</b>點下面亮起來的位置：空位直接搬過去，已經有設備的位置會互換。搬移不用錢。</p><div class="floor moving">'
      : '<p class="note">' + D.LEVELS[S.level].name + '・點一個位置來買、賣或搬設備。同一種設備買第二台，可以放的貨就加倍。</p><div class="floor">';
    rows.forEach(function (row, ri) {
      html += '<div class="floor-row r' + ri + '">';
      row.forEach(function (i) {
        const f = S.slots[i], lock = unlocked.indexOf(i) < 0;
        const cls = moving ? (i === ui.moveFrom ? ' from' : lock ? '' : ' to') : (i === ui.slotSel ? ' on' : '');
        html += '<button class="slot' + cls + (lock ? ' lock' : f ? ' has' : '') + '" data-act="slot" data-i="' + i + '"' + (moving && !lock && i !== ui.moveFrom ? ' aria-label="搬到這裡：' + (f ? '跟' + D.FIXTURES[f].name + '互換' : '空位') + '"' : '') + '>' + (lock ? '未擴建' : f ? D.FIXTURES[f].name : '空位') + '</button>';
      });
      html += '</div>';
    });
    html += '<div class="floor-door">櫃台　　　　　　　大門</div></div>';
    if (moving) return html + '<button class="btn wide" data-act="moveCancel">先不搬了</button>';
    const i = ui.slotSel, f = S.slots[i], lock = unlocked.indexOf(i) < 0;
    if (lock) {
      html += '<div class="card"><p>這個位置要先擴建店面才能使用。</p></div>';
    } else if (f) {
      const fx = D.FIXTURES[f];
      html += '<div class="card"><h4>' + fx.name + '</h4><p>' + fx.desc + '。每日電費 ' + money(fx.power) + '。</p>' + demandHint(f) +
        '<div class="btnrow"><button class="btn primary" data-act="moveFx">搬到別的位置</button><button class="btn" data-act="sellFx">半價賣掉（拿回 ' + money(fx.cost / 2) + '）</button></div></div>';
    } else {
      html += '<h3 class="grp">這個空位要放什麼？</h3>';
      D.FIXTURE_ORDER.forEach(function (k) {
        const fx = D.FIXTURES[k];
        const can = S.cash >= fx.cost;
        html += '<div class="card buy"><div><h4>' + fx.name + (E.fixtureCount(S, k) ? '<span class="tag">已有 ' + E.fixtureCount(S, k) + ' 台</span>' : '') + '</h4><p>' + fx.desc + '</p>' + demandHint(k) + '</div>' +
          '<button class="btn' + (can ? ' primary' : ' off') + '" data-act="buyFx" data-k="' + k + '">' + money(fx.cost) + '</button></div>';
      });
    }
    const next = D.LEVELS[S.level + 1];
    html += '<h3 class="grp">店面</h3>';
    if (next) {
      html += '<div class="card buy"><div><h4>擴建成' + next.name + '</h4><p>多 ' + (next.slots - D.LEVELS[S.level].slots) + ' 個設備位置，店租增加一成五。</p></div>' +
        '<button class="btn' + (S.cash >= next.cost ? ' primary' : ' off') + '" data-act="expand">' + money(next.cost) + '</button></div>';
    } else html += '<div class="card"><p>已經是最大的店面了。</p></div>';
    html += '<h3 class="grp">升級</h3>';
    D.UPGRADE_ORDER.forEach(function (k) {
      const u = D.UPGRADES[k];
      html += '<div class="card buy"><div><h4>' + u.name + '</h4><p>' + u.desc + '</p></div>' +
        (S.upgrades[k] ? '<span class="done">已安裝</span>' : '<button class="btn' + (S.cash >= u.cost ? ' primary' : ' off') + '" data-act="upgrade" data-k="' + k + '">' + money(u.cost) + '</button>') + '</div>';
    });
    return html;
  }

  /* ---------- 分頁：店員 ---------- */
  function shiftButtons(act, cur, id, withOff) {
    let h = '<div class="seg">';
    D.SHIFTS.forEach(function (sh, i) {
      h += '<button class="' + (cur === i ? 'on' : '') + '" data-act="' + act + '" data-shift="' + i + '"' + (id != null ? ' data-id="' + id + '"' : '') + '>' + sh.name + '</button>';
    });
    if (withOff) h += '<button class="' + (cur === -1 ? 'on' : '') + '" data-act="' + act + '" data-shift="-1">不站</button>';
    return h + '</div>';
  }
  function sheetStaff() {
    let html = '<p class="note">每一班至少要有一個人，店才會開。客人多的時段排兩位，結帳才不會塞車。大夜班時薪加兩成。</p><div class="shifts">';
    D.SHIFTS.forEach(function (sh, i) {
      const crew = E.crewOn(S, i);
      const names = [];
      S.staff.forEach(function (m) { if (m.shift === i) names.push(m.name + (m.sick ? '（病假）' : '')); });
      if (S.owner.shift === i) names.push('店長');
      if (S.temp[i]) names.push('臨時工');
      let capa = crew.reduce(function (a, m) { return a + m.speed; }, 0);
      if (S.upgrades.register2) capa *= 1.35;
      html += '<div class="shift' + (crew.length ? '' : ' empty') + '"><b>' + sh.name + '</b><small>' + sh.range + '</small><span>' + (names.length ? names.join('、') : '沒人顧店') + '</span>' +
        '<em>' + (crew.length ? '每小時可結帳 ' + Math.round(capa) + ' 人' : '這段時間不營業') + '</em></div>';
    });
    html += '</div>';
    if (S.branch) html += '<p class="note">你人在總店，這家分店沒有店長站櫃台，<b>三個班都要請人</b>。</p>';
    else html += '<h3 class="grp">店長（你）<small>不用薪水</small></h3><div class="card">' + shiftButtons('ownerShift', S.owner.shift, null, true) + '</div>';
    html += '<h3 class="grp">店員 ' + S.staff.length + '／6</h3>';
    if (!S.staff.length) html += '<div class="card"><p>目前沒有店員。從下面的應徵者挑一位吧。</p></div>';
    S.staff.forEach(function (m) {
      html += '<div class="card staff"><div class="who"><b>' + m.name + '</b><small>' + m.bio + '</small></div>' +
        '<div class="stats"><span>手腳</span>' + bar(m.speed, 80) + '<span>親切</span>' + bar(m.charm, 1, 'pink') + '<span class="wage">時薪 $' + m.wage + '</span></div>' +
        shiftButtons('shift', m.shift, m.id) + '<button class="btn sm danger" data-act="fire" data-id="' + m.id + '">請他走</button></div>';
    });
    html += '<h3 class="grp">應徵者<small>每 5 天換一批</small></h3>';
    if (!S.cands.length) html += '<div class="card"><p>這幾天沒有人來應徵。</p></div>';
    S.cands.forEach(function (c, i) {
      let hire = '<div class="seg hire">';
      D.SHIFTS.forEach(function (sh, si) { hire += '<button data-act="hire" data-i="' + i + '" data-shift="' + si + '">排' + sh.name + '</button>'; });
      html += '<div class="card staff"><div class="who"><b>' + c.name + '</b><small>' + c.bio + '</small></div>' +
        '<div class="stats"><span>手腳</span>' + bar(c.speed, 80) + '<span>親切</span>' + bar(c.charm, 1, 'pink') + '<span class="wage">時薪 $' + c.wage + '</span></div>' + hire + '</div></div>';
    });
    return html;
  }

  /* ---------- 分頁：宣傳 ---------- */
  function sheetPromo() {
    const sh = E.shares(S);
    let html = '<p class="note">商圈裡的客人會依「吸客力」分給每一家店。口碑好、商品多、有打廣告，客人就往你這邊走。</p><div class="card"><h4>商圈市佔率</h4>';
    html += '<div class="sharerow me"><span>' + esc(S.name) + '</span>' + bar(sh.me, 1, 'orange') + '<b>' + Math.round(sh.me * 100) + '%</b></div>';
    sh.rivals.forEach(function (r) {
      html += '<div class="sharerow"><span>' + r.name + (r.sale ? '<span class="tag warn">特價中</span>' : '') + '</span>' + bar(r.share, 1, 'grey') + '<b>' + Math.round(r.share * 100) + '%</b></div>';
    });
    html += '<div class="sharerow"><span>路過沒進來</span>' + bar(sh.other, 1, 'grey') + '<b>' + Math.round(sh.other * 100) + '%</b></div>';
    html += '<p class="sub">口碑 ' + Math.round(S.rep) + '／100・整潔 ' + Math.round(S.clean) + '／100・販售 ' + E.carriedList(S).length + ' 種商品' + (S.priceCut > 0 ? '・全店 9 折中（剩 ' + S.priceCut + ' 天）' : '') + '</p>';
    if (S.rivals.length) html += '<p class="sub">吸客力連續一週遠勝最弱的對手，他們就會撐不下去。</p>';
    html += '</div><h3 class="grp">打廣告</h3>';
    D.AD_ORDER.forEach(function (k) {
      const a = D.ADS[k];
      const on = S.ads[k] > 0;
      html += '<div class="card buy"><div><h4>' + a.name + '<span class="tag">' + a.days + ' 天</span></h4><p>' + a.desc + '</p></div>' +
        (on ? '<span class="done">進行中<br>剩 ' + S.ads[k] + ' 天</span>' : '<button class="btn' + (S.cash >= a.cost ? ' primary' : ' off') + '" data-act="ad" data-k="' + k + '">' + money(a.cost) + '</button>') + '</div>';
    });
    return html;
  }

  /* ---------- 分頁：報表 ---------- */
  function pnl(r) {
    const rows = [['營業收入', r.rev], ['手續費收入', r.service], ['商品成本', -r.cogs], ['報廢損失', -r.waste], ['失竊損失', -r.theft],
      ['店員薪資', -r.wages], ['店租', -r.rent], ['水電', -r.power], ['宣傳', -r.ads], ['雜支', -r.other]];
    let h = '<table class="pnl">';
    rows.forEach(function (x, i) { if (x[1] || i === 0) h += '<tr><td>' + x[0] + '</td><td class="' + (x[1] < 0 ? 'bad' : '') + '">' + (x[1] < 0 ? '−' : '') + money(Math.abs(x[1])) + '</td></tr>'; });
    h += '<tr class="total"><td>本日淨利</td><td class="' + (r.profit < 0 ? 'bad' : 'good') + '">' + signed(r.profit) + '</td></tr></table>';
    return h;
  }
  function chart() {
    const hs = S.history.slice(-14);
    if (!hs.length) return '<p class="sub">營業滿一天後，這裡會出現每天的淨利。</p>';
    const max = Math.max.apply(null, hs.map(function (h) { return Math.abs(h.profit); }).concat([1]));
    let h = '<div class="chart">';
    hs.forEach(function (x) {
      const pct = Math.abs(x.profit) / max * 46;
      h += '<div class="col"><i class="' + (x.profit < 0 ? 'neg' : 'pos') + '" style="height:' + pct + '%"></i><small>' + x.day + '</small></div>';
    });
    return h + '</div><p class="sub">最近 ' + hs.length + ' 天的每日淨利（橘色賺、紅色賠），最高 ' + money(max) + '。</p>';
  }
  function sheetReport() {
    const city = D.CITIES[S.cityId];
    const g = goalInfo();
    let html = '<div class="card"><h4>終極目標：現金 ' + money(C.GOAL) + '</h4><div class="goalrow' + (C.wallet(CH) >= C.GOAL ? ' hit' : '') + '"><span>現金</span>' + bar(C.wallet(CH), C.GOAL, 'gold') + '<b>' + money(C.wallet(CH)) + '</b></div>' +
      '<p class="sub">存到之後可以光榮退休（破關、進排行榜），或頂下一間分店繼續挑戰。經營 ' + (CH.stores[0].day - 1) + ' 天・累計營收 ' + money(CH.totalRev) + '</p>' +
      '<button class="btn wide" data-act="hq">總部' + (CH.stores.length > 1 ? '（' + CH.stores.length + ' 家店）' : '') + '</button></div>';
    if (!S.branch) {
      html += '<div class="card"><h4>' + city.days + ' 天評比：總資產</h4>';
      ['銅牌', '銀牌', '金牌'].forEach(function (nm, i) {
        html += '<div class="goalrow' + (g.worth >= city.goals[i] ? ' hit' : '') + '"><span>' + nm + '</span>' + bar(g.worth, city.goals[i], 'gold') + '<b>' + money(city.goals[i]) + '</b></div>';
      });
      html += '<p class="sub">這家店的總資產 <b>' + money(g.worth) + '</b>（現金 ' + money(S.cash) + '＋庫存 ' + money(E.inventoryValue(S)) + '＋設備半價）' +
        (S.medal ? '・已取得「' + MEDALS[S.medal.tier] + '」' : '・還剩 ' + g.left + ' 天') + '</p></div>';
    }
    const td = S.today;
    html += '<div class="card"><h4>今天到目前為止</h4><div class="kv"><span>來客</span><b>' + td.customers + '</b><span>營收</span><b>' + money(td.rev) + '</b>' +
      '<span>滿意</span><b class="good">' + td.happy + '</b><span>不滿意</span><b class="bad">' + td.unhappy + '</b>' +
      '<span>排隊走掉</span><b>' + td.queueLost + '</b><span>撲空</span><b>' + td.closedLost + '</b></div></div>';
    html += '<div class="card"><h4>每日淨利</h4>' + chart() + '</div>';
    if (S.lastReport) html += '<div class="card"><h4>第 ' + S.lastReport.day + ' 天損益</h4>' + pnl(S.lastReport) + '</div>';
    return html;
  }

  const SHEETS = { stock: sheetStock, equip: sheetEquip, staff: sheetStaff, promo: sheetPromo, report: sheetReport };
  function renderSheet(keepScroll) {
    const el = $('#sheet');
    if (!el) return;
    if (!ui.sheet) { el.hidden = true; el.innerHTML = ''; updateHud(); return; }
    const body = el.querySelector('.sheet-body');
    const top = keepScroll && body ? body.scrollTop : 0;
    const title = TABS.filter(function (t) { return t[0] === ui.sheet; })[0][1];
    el.hidden = false;
    el.innerHTML = '<div class="awning"></div><div class="sheet-head"><h2>' + title + '</h2><span class="lcd sm">' + money(S.cash) + '</span><button class="btn sm" data-act="closeSheet">回店面</button></div>' +
      '<div class="sheet-body">' + SHEETS[ui.sheet]() + '</div>';
    applyStockFilter();
    el.querySelector('.sheet-body').scrollTop = top;
    updateHud();
  }

  /* ---------- 視窗 ---------- */
  function openModal(html, cls) {
    const el = $('#modal');
    ui.modal = cls || 'modal';
    el.hidden = false;
    el.innerHTML = '<div class="win ' + (cls || '') + '" role="dialog" aria-modal="true"><div class="awning"></div>' + html + '</div>';
    const b = el.querySelector('button');
    if (b) b.focus({ preventScroll: true });
  }
  function closeModal() {
    const el = $('#modal');
    ui.modal = null;
    if (el) { el.hidden = true; el.innerHTML = ''; }
  }
  function showEvent(ev) {
    AU.event();
    let h = '<h2>' + ev.title + '</h2><div class="win-body"><p class="story">' + esc(ev.text) + '</p></div><div class="win-foot col">';
    ev.choices.forEach(function (c, i) { h += '<button class="btn' + (i === 0 ? ' primary' : '') + '" data-act="choose" data-i="' + i + '">' + esc(c) + '</button>'; });
    openModal(h + '</div>', 'event');
  }
  function showReport(r) {
    if (r.profit >= 0) AU.good(); else AU.bad();
    const g = goalInfo();
    const total = Math.max(1, r.customers);
    let tips = '';
    r.tips.forEach(function (t) { tips += '<li>' + esc(t) + '</li>'; });
    let others = '';
    if (ui.lastBg.length) {
      let sum = r.profit;
      others = '<table class="pnl others"><tr><td>' + esc(S.name) + '（上面這張）</td><td>' + signed(r.profit) + '</td></tr>';
      ui.lastBg.forEach(function (b) {
        const br = b.res && b.res.report;
        if (!br) return;
        sum += br.profit;
        others += '<tr><td>' + esc(CH.stores[b.i].name) + '</td><td class="' + (br.profit < 0 ? 'bad' : '') + '">' + signed(br.profit) + '</td></tr>';
      });
      others += '<tr class="total"><td>全部的店</td><td class="' + (sum < 0 ? 'bad' : 'good') + '">' + signed(sum) + '</td></tr></table>';
    }
    const h = '<h2>' + (CH.stores.length > 1 ? esc(S.name) + '・' : '') + '第 ' + r.day + ' 天結算<span class="stamp ' + (r.profit >= 0 ? 'win' : 'lose') + '">' + (r.profit >= 0 ? '賺' : '賠') + '</span></h2><div class="win-body">' +
      pnl(r) +
      '<div class="kv"><span>來客</span><b>' + r.customers + ' 人</b><span>滿意／不滿</span><b>' + Math.round(r.happy / total * 100) + '%／' + Math.round(r.unhappy / total * 100) + '%</b>' +
      '<span>口碑</span><b>' + r.rep + '</b><span>市佔率</span><b>' + Math.round(r.share * 100) + '%</b>' +
      '<span>清晨到貨</span><b>' + money(r.orderCost) + '</b><span>現金</span><b>' + money(C.wallet(CH)) + '</b></div>' +
      others +
      '<div class="advice"><img class="mascot" alt="" src="' + SC.mascot() + '"><ul>' + tips + '</ul></div>' +
      '<p class="sub">今天 ' + wxChip(S.weather, true) + '　明天預報 ' + wxChip(S.forecast, true) + (S.medal ? '' : '　' + g.txt) + '</p>' +
      '</div><div class="win-foot"><button class="btn primary" data-act="nextDay">開始第 ' + S.day + ' 天</button></div>';
    openModal(h, 'report');
  }
  function showResult() {
    const m = S.medal, city = D.CITIES[S.cityId];
    const lines = ['三十天過去了，店還在，但離目標還差一點。再調整一下進貨和設備，下次一定行。',
      '恭喜！你的店在這條街站穩了腳步。', '了不起！街坊都說這是附近最好的一家店。', '傳奇店長！總公司想請你去當講師了。'];
    AU.good();
    openModal('<h2>' + city.days + ' 天成績單</h2><div class="win-body center"><div class="medal m' + m.tier + '">' + ['？', '銅', '銀', '金'][m.tier] + '</div><h3>' + MEDALS[m.tier] + '</h3>' +
      '<p class="story">' + lines[m.tier] + '</p><div class="kv"><span>總資產</span><b>' + money(m.worth) + '</b><span>口碑</span><b>' + Math.round(S.rep) + '</b>' +
      '<span>市佔率</span><b>' + Math.round(E.share(S) * 100) + '%</b><span>剩下的對手</span><b>' + S.rivals.length + ' 家</b></div></div>' +
      '<div class="win-foot"><button class="btn" data-act="quit">回標題</button><button class="btn primary" data-act="closeModal">繼續自由經營</button></div>', 'result');
  }
  function showBankrupt() {
    AU.bad();
    clearSave();
    openModal('<h2>倒閉了……</h2><div class="win-body center"><p class="story">透支超過 ' + money(-E.OVERDRAFT) + '，銀行把' + (CH.stores.length > 1 ? '所有的店都' : '店') + '收走了。<br>你在鐵門上貼了一張紙：「感謝街坊 ' + (S.day - 1) + ' 天來的照顧。」</p></div>' +
      '<div class="win-foot"><button class="btn primary" data-act="quit">回標題重新來過</button></div>', 'result');
  }
  /* ---------- 總部：分店、里程碑、退休、排行榜 ---------- */
  function showHQ() {
    const w = C.wallet(CH);
    let h = '<h2>總部</h2><div class="win-body">' +
      '<div class="goalrow' + (w >= C.GOAL ? ' hit' : '') + '"><span>現金</span>' + bar(w, C.GOAL, 'gold') + '<b>' + money(w) + '</b></div>' +
      '<div class="kv"><span>目標</span><b>' + money(C.GOAL) + '</b><span>經營天數</span><b>' + (CH.stores[0].day - 1) + ' 天</b>' +
      '<span>累計營收</span><b>' + money(CH.totalRev) + '</b><span>總資產</span><b>' + money(C.netWorth(CH)) + '</b></div>';
    CH.stores.forEach(function (st, i) {
      const y = st.lastReport;
      const gaps = [0, 1, 2].filter(function (k) { return !E.isOpen(st, k); }).map(function (k) { return D.SHIFTS[k].name; });
      h += '<div class="card buy"><div><h4>' + esc(st.name) + '<span class="tag">' + E.LOC[st.locId].name + '</span></h4>' +
        '<p>' + (y ? '昨天淨利 <b class="' + (y.profit < 0 ? 'bad' : 'good') + '">' + signed(y.profit) + '</b>・' : '') + '口碑 ' + Math.round(st.rep) + (gaps.length ? '・<b class="bad">' + gaps.join('、') + '沒人顧</b>' : '') + '</p></div>' +
        (i === CH.active ? '<span class="done">你在這裡</span>' : '<button class="btn sm" data-act="switchStore" data-i="' + i + '">去這家店</button>') + '</div>';
    });
    if (!CH.unlocked) h += '<p class="note">現金存到 <b>' + money(C.GOAL) + '</b>，就可以選擇光榮退休（破關），或頂下一間分店繼續挑戰。</p>';
    h += '</div><div class="win-foot">' +
      (w >= C.GOAL ? '<button class="btn" data-act="retire">光榮退休</button>' : '') +
      (CH.unlocked && CH.stores.length < C.MAX_STORES ? '<button class="btn" data-act="branch">開分店</button>' : '') +
      '<button class="btn primary" data-act="closeModal">回到店裡</button></div>';
    openModal(h, 'hq');
  }
  function showMilestone() {
    AU.good();
    openModal('<h2>現金突破 300 萬！</h2><div class="win-body"><div class="advice big"><img class="mascot" alt="" src="' + SC.mascot() + '"><p>店長，我們做到了！用了 <b>' + (CH.stores[0].day - 1) + ' 天</b>。<br>接下來有兩條路：<b>光榮退休</b>，把成績留在排行榜；或是<b>頂下一間分店</b>，看看你能不能同時顧好兩家店。</p></div></div>' +
      '<div class="win-foot col"><button class="btn primary" data-act="branch">開分店，繼續挑戰</button><button class="btn" data-act="retire">光榮退休（破關）</button><button class="btn" data-act="closeModal">先繼續經營，之後再到「總部」決定</button></div>', 'milestone');
  }
  function hallHtml(mark) {
    if (!pref.hall.length) return '<p class="sub">還沒有人退休。存到 ' + money(C.GOAL) + ' 現金、選擇光榮退休，就會留名在這裡。</p>';
    let h = '<table class="pnl hall"><tr><th>#</th><th>店名</th><th>天數</th><th>累計營收</th></tr>';
    pref.hall.forEach(function (r, i) {
      h += '<tr class="' + (r === mark ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.name) + (r.stores > 1 ? '<small>・' + r.stores + ' 家店</small>' : '') + '</td><td>' + r.days + ' 天</td><td>' + money(r.rev) + '</td></tr>';
    });
    return h + '</table><p class="sub">依天數排序（越少越厲害）。只有這台裝置上的成績。</p>';
  }
  /* ---------- 線上排行榜與留言板（後端：backend/Code.gs） ---------- */
  function dateTxt(at) { const d = new Date(at); return isNaN(d.getTime()) ? '' : (d.getMonth() + 1) + '/' + d.getDate(); }
  function boardTopHtml(b, mark) {
    if (!b.top.length) return '<p class="sub">還沒有人上榜，你可以當第一個。</p>';
    let h = '<table class="pnl hall"><tr><th>#</th><th>店名</th><th>天數</th><th>累計營收</th></tr>';
    b.top.forEach(function (r, i) {
      const me = mark && r.name === mark.name && r.days === mark.days && r.rev === mark.rev;
      h += '<tr class="' + (me ? 'me' : '') + '"><td>' + (i + 1) + '</td><td>' + esc(r.name) + '<small>' + (r.loc ? '・' + esc(r.loc) : '') + (r.stores > 1 ? '・' + (r.stores | 0) + ' 家店' : '') + '</small></td><td>' + (r.days | 0) + ' 天</td><td>' + money(+r.rev || 0) + '</td></tr>';
    });
    return h + '</table><p class="sub">依天數排序（越少越厲害），同天數比累計營收。目前共有 ' + (b.count | 0) + ' 位店長光榮退休。</p>';
  }
  function boardMsgsHtml(b) {
    if (!b.comments.length) return '<p class="sub">還沒有人留言。</p>';
    let h = '<ul class="msgs">';
    b.comments.forEach(function (c) { h += '<li><b>' + esc(c.name) + '</b><small>' + dateTxt(c.at) + '</small><p>' + esc(c.text) + '</p></li>'; });
    return h + '</ul>';
  }
  function fillBoard(b, mark) {
    if (ui.modal !== 'board') return;
    const top = $('#bTop'), msgs = $('#bMsgs');
    if (!top || !msgs) return;
    if (!b.ok || !Array.isArray(b.top) || !Array.isArray(b.comments)) { top.innerHTML = '<p class="sub bad">' + esc(b.msg || '排行榜的回應看不懂。') + '</p>'; msgs.innerHTML = ''; return; }
    top.innerHTML = boardTopHtml(b, mark);
    msgs.innerHTML = boardMsgsHtml(b);
  }
  function showBoard(mark) {
    const done = CH && CH.retired;
    let h = '<h2>排行榜</h2><div class="win-body">';
    if (CLOUD.enabled) {
      h += '<h3 class="grp">前十名<small>所有玩家</small></h3><div id="bTop"><p class="sub">讀取中……</p></div>' +
        '<h3 class="grp">留言板<small>所有人都看得到</small></h3>' +
        '<div class="card msgform"><label class="namefield">店名<input id="cName" maxlength="10" autocomplete="off" value="' + esc(pref.nick || (CH ? CH.stores[0].name : '')) + '"></label>' +
        '<textarea id="cText" maxlength="140" rows="2" placeholder="給作者的建議，或給其他店長的話（140 字以內）" aria-label="留言內容"></textarea>' +
        '<div class="msgbar"><span class="sub" id="cNote" aria-live="polite"></span><button class="btn sm primary" data-act="postComment">送出留言</button></div></div>' +
        '<div id="bMsgs"></div>';
    } else {
      h += '<p class="note">線上排行榜還沒有開通，現在只看得到這台裝置上的成績。</p>';
    }
    h += '<h3 class="grp">這台裝置的紀錄</h3>' + hallHtml(mark) + '</div><div class="win-foot">' +
      (done ? '<button class="btn primary" data-act="quit">回標題</button>' : '<button class="btn primary" data-act="closeModal">關閉</button>') + '</div>';
    openModal(h, 'board');
    if (CLOUD.enabled) CLOUD.board().then(function (b) { fillBoard(b, mark); });
  }
  function showRetired(rec) {
    AU.good();
    openModal('<h2>光榮退休</h2><div class="win-body center"><div class="medal m3">退</div><h3>' + esc(rec.name) + '</h3>' +
      '<p class="story">你把鑰匙交給下一任店長，走出店門時，門鈴又「叮咚」了一聲。</p>' +
      '<div class="kv"><span>經營天數</span><b>' + rec.days + ' 天</b><span>累計營收</span><b>' + money(rec.rev) + '</b><span>店數</span><b>' + rec.stores + ' 家</b><span>總資產</span><b>' + money(rec.worth) + '</b></div>' +
      '<h3 class="grp">這台裝置的紀錄</h3>' + hallHtml(rec) + '</div><div class="win-foot">' +
      (CLOUD.enabled ? '<span class="sub">上榜只會送出店名、店面、天數與營收。</span><button class="btn" data-act="quit">回標題</button><button class="btn primary" data-act="submitScore">把成績送上排行榜</button>'
        : '<button class="btn primary" data-act="quit">回標題</button>') + '</div>', 'result');
  }
  function showMenu() {
    openModal('<h2>選單</h2><div class="win-foot col">' +
      '<button class="btn" data-act="toggleMusic">音樂：' + (pref.music ? '開' : '關') + '</button>' +
      '<button class="btn" data-act="toggleSfx">音效：' + (pref.sfx ? '開' : '關') + '</button>' +
      '<button class="btn" data-act="howto">怎麼玩</button><button class="btn" data-act="hall">排行榜與留言板</button><button class="btn" data-act="changelog">更新紀錄</button>' +
      '<button class="btn" data-act="saveNow">立刻存檔</button><button class="btn" data-act="quit">存檔並回標題</button>' +
      '<button class="btn primary" data-act="closeModal">回到店裡</button></div><p class="sub center">v' + esc(VER.version) + '</p>', 'menu');
  }
  function showHowto() {
    openModal('<h2>怎麼玩</h2><div class="win-body"><ol class="howto">' +
      '<li><b>按「×1」開始營業。</b>客人會走進來找想買的東西，買不到會不開心。</li>' +
      '<li><b>店面下方的長條</b>是今天每小時的人潮：橘色是已經來的客人，藍色是預估，斜紋代表那一班沒人顧店。</li>' +
      '<li><b>進貨：</b>設定每種商品要「補到」幾個、賣多少錢。貨車每天<b>清晨 06:00</b> 送到；等不及可以按「立刻到貨」，馬上上架但多收三成運費。鮮食和報紙賣不完當天就報廢。</li>' +
      '<li><b>設備：</b>買了冷藏櫃才能賣飲料、買了鮮食櫃才能賣便當。看每天結算的建議決定先買什麼。擺好的設備可以免費搬到別的位置或互換。</li>' +
      '<li><b>店員：</b>三個班都要有人，店才會 24 小時營業。</li>' +
      '<li><b>宣傳：</b>口碑和廣告決定你從對手那裡搶到多少客人。</li>' +
      '<li><b>音樂：</b>早班、晚班、大夜各有一首，聽到音樂變了就是換班了。</li>' +
      '<li><b>目標：</b>30 天結束時依總資產頒獎牌。之後繼續存到<b>現金 300 萬</b>，就能選擇光榮退休（破關、進排行榜）或開分店，最多四家店可以切換經營。</li></ol>' +
      '<p class="sub">每天結束會自動存檔。開著分頁或視窗時，時間會暫停。</p></div>' +
      '<div class="win-foot"><button class="btn primary" data-act="closeModal">知道了</button></div>', 'howto');
  }
  function showChangelog() {
    let h = '<h2>更新紀錄</h2><div class="win-body">';
    (VER.changelog || []).forEach(function (c) {
      h += '<h3 class="grp">v' + esc(c.version) + '<small>' + esc(c.date || '') + '</small></h3><ul class="log">';
      c.notes.forEach(function (n) { h += '<li>' + esc(n) + '</li>'; });
      h += '</ul>';
    });
    if (!(VER.changelog || []).length) h += '<p class="sub">還沒有紀錄。</p>';
    openModal(h + '</div><div class="win-foot"><button class="btn primary" data-act="closeModal">關閉</button></div>', 'howto');
  }
  const TUTORIAL = [
    '店長好！我是門口那顆門鈴，大家叫我<b>咚咚</b>。從今天起我當你的顧問。',
    '店裡現在只有一座<b>貨架</b>和一台<b>冷藏櫃</b>。很多客人想買的東西我們還沒賣，每天結算時我會告訴你該添什麼設備。',
    '晚班有工讀生阿明，早班你自己顧，<b>大夜班還沒人</b>——到「店員」請一位，店才會 24 小時開著。',
    '第一個目標是 <b>30 天後</b>的獎牌；最終目標是存到<b>現金 300 萬</b>——到時候可以光榮退休，也可以開分店。準備好了就按「×1」開門營業！',
  ];
  function showTutorial(i) {
    openModal('<h2>咚咚的開店叮嚀</h2><div class="win-body"><div class="advice big"><img class="mascot" alt="" src="' + SC.mascot() + '"><p>' + TUTORIAL[i] + '</p></div></div>' +
      '<div class="win-foot"><span class="sub">' + (i + 1) + '／' + TUTORIAL.length + '</span><button class="btn primary" data-act="tutorial" data-i="' + (i + 1) + '">' + (i + 1 < TUTORIAL.length ? '下一頁' : '開始當店長') + '</button></div>', 'tutorial');
  }
  function confirmBox(text, act, extra) {
    openModal('<h2>確定嗎？</h2><div class="win-body"><p class="story">' + text + '</p></div><div class="win-foot"><button class="btn" data-act="closeModal">先不要</button>' +
      '<button class="btn primary" data-act="' + act + '"' + (extra || '') + '>確定</button></div>', 'confirm');
  }

  /* ---------- 遊戲迴圈 ---------- */
  function running() { return ui.screen === 'game' && !ui.paused && !ui.sheet && !ui.modal && S && !C.over(CH) && !CH.retired; }
  function crewNames(sh) {
    const names = [];
    if (S.owner.shift === sh) names.push('店長');
    S.staff.forEach(function (m) { if (m.shift === sh && !m.sick) names.push(m.name); });
    if (S.temp[sh]) names.push('臨時工');
    return names;
  }
  function doTick() {
    const before = {};
    D.PRODUCTS.forEach(function (p) { before[p.id] = S.stock[p.id]; });
    const noteKey = S.day * 3 + E.shiftOf(S.t);
    const shiftName = D.SHIFTS[E.shiftOf(S.t)].name;
    const hour = S.t;
    const prevShift = E.shiftOf(Math.min(S.t, 23));
    const out = C.tick(CH);
    const res = out.res;
    if (res.event) { showEvent(res.event); return; }
    if (res.blocked) return;
    if (res.dayEnded) ui.hoursBy = {};
    else {
      (ui.hoursBy[CH.active] = ui.hoursBy[CH.active] || [])[hour] = { n: res.n, open: res.open };
      out.bg.forEach(function (b) { if (b.res) (ui.hoursBy[b.i] = ui.hoursBy[b.i] || [])[hour] = { n: b.res.n, open: b.res.open }; });
    }
    if (res.visits && res.visits.length) { scene.addVisits(res.visits, SPEED_MS[ui.speed]); AU.ding(); }
    // 跑馬燈
    let msg = res.msgs && res.msgs[0];
    // 分店的突發狀況：由當班的人先處理，這裡回報結果
    out.bg.forEach(function (b) { b.notes.forEach(function (n) { if (!msg) msg = '〔' + CH.stores[b.i].name + '〕' + n.title + '：' + n.text; }); });
    // 換班：音樂跟著換
    const nowShift = E.shiftOf(Math.min(S.t, 23));
    if (!res.dayEnded && nowShift !== prevShift) {
      AU.setShift(nowShift, true);
      const who = crewNames(nowShift);
      if (!msg) msg = '換班了！' + D.SHIFTS[nowShift].name + (who.length ? '上工：' + who.join('、') + '。' : '沒人顧店，這段時間不營業。');
    }
    if (!msg && res.open === false && res.n > 3 && !res.dayEnded && !S.closedToday && ui.closedNote !== noteKey) {
      ui.closedNote = noteKey;
      msg = shiftName + '沒人顧店，客人看到「準備中」就走了……到「店員」排個班吧。';
    }
    if (!msg && !res.dayEnded) {
      const out = D.PRODUCTS.filter(function (p) { return before[p.id] > 0 && S.stock[p.id] === 0; });
      if (out.length) msg = out.map(function (p) { return p.name; }).join('、') + '賣光了！';
    }
    if (!msg && res.clock === 11 && res.open) msg = '中午了，覓食的人潮湧進來。';
    if (!msg && res.clock === 22 && res.open) msg = '夜深了，店裡的燈還亮著。';
    if (msg) say(msg);
    updateHud();
    if (res.dayEnded) {
      ui.lastBg = out.bg;
      ui.milestone = ui.milestone || out.milestone;
      save();
      showReport(res.report);
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (ui.screen === 'title') {
      const c = document.getElementById('titleCanvas');
      if (c) SC.drawTitle(c, now);
      return;
    }
    if (ui.screen !== 'game' || !scene) return;
    const dt = Math.min(300, now - (ui.last || now));
    ui.last = now;
    if (running()) {
      ui.acc += dt;
      const per = SPEED_MS[ui.speed];
      let n = 0;
      while (ui.acc >= per && n < 4 && running()) { ui.acc -= per; doTick(); n++; }
      if (ui.acc > per) ui.acc = 0;
    }
    if (!ui.sheet) scene.draw(now);
  }

  /* ---------- 開始、繼續 ---------- */
  function startGame(chain, speed, hours, greet) {
    CH = chain;
    S = C.cur(CH);
    C.sync(CH);
    ui.hoursBy = hours || {};
    ui.lastBg = []; ui.milestone = false; ui.branchMode = false;
    ui.stockQ = ''; ui.stockCat = 'all';
    ui.speed = speed === 2 ? 2 : 1;
    ui.paused = true;
    ui.sheet = null;
    ui.slotSel = null;
    ui.acc = 0;
    ui.tick = greet || '';
    AU.setShift(E.shiftOf(Math.min(S.t, 23)), false);
    renderGame();
  }
  function backToGame(msg) {
    ui.branchMode = false;
    S = C.cur(CH);
    if (msg) ui.tick = msg;
    ui.sheet = null; ui.slotSel = null;
    renderGame();
  }
  function afterAction(res, rerender) {
    if (res && res.msg) toast(res.msg, !res.ok);
    if (res && !res.ok) AU.bad(); else AU.click();
    if (rerender !== false) renderSheet(true);
    updateHud();
  }

  /* ---------- 操作 ---------- */
  const ACT = {
    title: function () { renderTitle(); },
    new: function () {
      if (ui.screen === 'title' && loadSave() && !ui.modal) { confirmBox('開新店會蓋掉目前的存檔。', 'newConfirmed'); return; }
      renderCity();
    },
    newConfirmed: function () { closeModal(); renderCity(); },
    continue: function () { const sv = loadSave(); if (sv) startGame(sv.chain, sv.speed, sv.hours, '歡迎回來，店長！第 ' + sv.chain.stores[0].day + ' 天，按「×1」繼續營業。'); },
    city: function (el) { ui.cityId = el.getAttribute('data-id'); ui.locId = null; ui.nameDraft = null; renderLoc(); },
    loc: function (el) { ui.nameDraft = $('#storeName').value; ui.locId = el.getAttribute('data-id'); renderLoc(); },
    start: function () {
      const name = ($('#storeName').value || '').trim() || '叮咚便利店';
      // 網址加上 ?seed=數字 可以指定亂數種子（自動化測試用，讓每次結果一樣）
      const fixed = /[?&]seed=(\d+)/.exec(root.location ? root.location.search : '');
      const st = E.newGame({ locId: ui.locId, name: name, seed: fixed ? +fixed[1] : (Date.now() % 2147483647) | 0 });
      startGame(C.create(st), 1);
      save();
      showTutorial(0);
    },
    // ---- 連鎖 ----
    goal: function () { if (S.medal) showHQ(); else { ui.sheet = ui.sheet === 'report' ? null : 'report'; renderSheet(); } },
    hq: function () { showHQ(); },
    hall: function () { showBoard(); },
    postComment: function (el) {
      const name = ($('#cName').value || '').trim(), text = ($('#cText').value || '').trim();
      const note = $('#cNote');
      const tell = function (msg, bad) { if (ui.modal !== 'board' || !$('#cNote')) return; $('#cNote').textContent = msg; $('#cNote').className = 'sub' + (bad ? ' bad' : ' good'); };
      if (!name) { tell('請填店名。', true); return; }
      if (!text) { tell('留言是空的。', true); return; }
      el.disabled = true;
      note.textContent = '傳送中……'; note.className = 'sub';
      CLOUD.postComment(name, text, VER.version).then(function (b) {
        if (el.isConnected) el.disabled = false;
        if (!b.ok) { tell(b.msg, true); return; }
        pref.nick = name; savePref();
        if (ui.modal === 'board' && $('#cText')) $('#cText').value = '';
        fillBoard(b);
        tell('留言送出了。');
      });
    },
    submitScore: function (el) {
      const rec = ui.lastRec;
      if (!rec) return;
      if (rec.sent) { showBoard(rec); return; }
      el.disabled = true; el.textContent = '傳送中……';
      CLOUD.submitScore(rec, VER.version).then(function (b) {
        if (!b.ok) { if (el.isConnected) { el.disabled = false; el.textContent = '再送一次'; } toast(b.msg, true); return; }
        rec.sent = true; savePref();
        showBoard(rec);
        fillBoard(b, rec);
        toast(b.rank ? '上榜了！目前第 ' + b.rank + ' 名。' : '成績送出了。');
      });
    },
    switchStore: function (el) {
      const i = +el.getAttribute('data-i');
      closeModal();
      if (i === CH.active || !C.switchTo(CH, i).ok) return;
      S = C.cur(CH);
      scene.setState(S);
      ui.sheet = null; ui.slotSel = null; ui.moveFrom = null; ui.closedNote = -1;
      renderSheet();
      say('來到' + S.name + '（' + E.LOC[S.locId].name + '）。' + (S.lastReport && S.lastReport.tips[0] ? S.lastReport.tips[0] : ''));
      AU.click();
    },
    branch: function () {
      if (!CH.unlocked) { toast('現金存到 ' + money(C.GOAL) + ' 之後才能開分店。', true); return; }
      closeModal(); ui.milestone = false;
      ui.branchMode = true; ui.locId = null; ui.nameDraft = null;
      scene = null;
      renderCity();
    },
    backToGame: function () { backToGame(); },
    branchStart: function () {
      const name = ($('#storeName').value || '').trim() || '分店';
      const res = C.openBranch(CH, ui.locId, name, (Date.now() % 2147483647) | 0);
      if (!res.ok) { toast(res.msg, true); AU.bad(); return; }
      C.switchTo(CH, res.index);
      backToGame(res.msg + '分店沒有你親自站櫃台，記得到「店員」把大夜班補上。');
      AU.good();
      save();
    },
    retire: function () { confirmBox('光榮退休之後，這次的經營就結束了，成績會留在排行榜。', 'retireConfirmed'); },
    retireConfirmed: function () {
      const res = C.retire(CH);
      if (!res.ok) { closeModal(); toast(res.msg, true); return; }
      const rec = { name: res.result.name, loc: E.LOC[res.result.locId].name, days: res.result.days, rev: res.result.rev, stores: res.result.stores, worth: res.result.worth, at: Date.now() };
      ui.lastRec = rec;
      pref.hall.push(rec);
      pref.hall.sort(function (a, b) { return a.days - b.days || b.rev - a.rev; });
      pref.hall = pref.hall.slice(0, HALL_MAX);
      savePref();
      clearSave();
      showRetired(rec);
    },
    stockCat: function (el) { ui.stockCat = el.getAttribute('data-k'); AU.click(); applyStockFilter(); },
    tutorial: function (el) {
      const i = +el.getAttribute('data-i');
      if (i < TUTORIAL.length) showTutorial(i); else { closeModal(); pref.tutorial = true; savePref(); }
    },
    speed: function (el) {
      const v = +el.getAttribute('data-v');
      if (v === 0) ui.paused = true; else { ui.paused = false; ui.speed = v === 2 ? 2 : 1; scene.setSpeed(SPEED_MULT[ui.speed]); }
      ui.acc = 0;
      updateHud();
    },
    tab: function (el) {
      const t = el.getAttribute('data-tab');
      ui.sheet = ui.sheet === t ? null : t;
      ui.moveFrom = null;
      renderSheet();
    },
    closeSheet: function () { ui.sheet = null; ui.moveFrom = null; renderSheet(); },
    menu: function () { showMenu(); },
    closeModal: function () { closeModal(); },
    howto: function () { showHowto(); },
    changelog: function () { showChangelog(); },
    toggleMusic: function () {
      pref.music = !pref.music; AU.setMusic(pref.music); savePref();
      if (ui.screen === 'title') renderTitle(); else showMenu();
    },
    toggleSfx: function () {
      pref.sfx = !pref.sfx; AU.setSfx(pref.sfx); savePref();
      if (ui.screen === 'title') renderTitle(); else showMenu();
    },
    saveNow: function () { const done = save(); toast(done ? '存檔完成。' : '這個瀏覽器不讓網頁存檔，進度只會保留到關閉為止。', !done); },
    quit: function () { save(); closeModal(); S = null; CH = null; scene = null; AU.setShift(0, false); renderTitle(); },
    choose: function (el) {
      const text = E.resolveEvent(S, +el.getAttribute('data-i'));
      openModal('<h2>結果</h2><div class="win-body"><p class="story">' + esc(text) + '</p></div><div class="win-foot"><button class="btn primary" data-act="closeModal">好</button></div>', 'event');
      updateHud();
    },
    nextDay: function () {
      closeModal();
      const got = S.lastReport ? S.lastReport.orderCost : 0;
      say('第 ' + S.day + ' 天，' + D.WEATHER[S.weather].name + '。' + (got ? '清晨的貨車送來 ' + money(got) + ' 的貨。' : '') + (S.lastReport && S.lastReport.tips[0] ? S.lastReport.tips[0] : ''));
      AU.setShift(0, true);
      if (C.over(CH)) showBankrupt();
      else if (S.lastReport && S.lastReport.goal) {
        if ((pref.best[S.locId] | 0) < S.medal.tier) { pref.best[S.locId] = S.medal.tier; savePref(); }
        showResult();
      } else if (ui.milestone) { ui.milestone = false; showMilestone(); }
      updateHud();
    },
    price: function (el) {
      const row = el.closest('.prod'), pid = row.getAttribute('data-pid');
      E.setPrice(S, pid, S.price[pid] + (+el.getAttribute('data-d')));
      AU.click();
      row.outerHTML = prodRow(E.P[pid]);
    },
    rush: function (el) { afterAction(E.rushOrder(S, el.closest('.prod').getAttribute('data-pid'))); },
    applySuggest: function () { afterAction(E.applySuggestions(S)); },
    slot: function (el) {
      const i = +el.getAttribute('data-i');
      if (ui.moveFrom != null) {
        if (i === ui.moveFrom) { ui.moveFrom = null; AU.click(); renderSheet(true); return; }
        const res = E.moveFixture(S, ui.moveFrom, i);
        if (res.ok) { ui.moveFrom = null; ui.slotSel = i; }
        afterAction(res);
        return;
      }
      ui.slotSel = i; AU.click(); renderSheet(true);
    },
    moveFx: function () { if (S.slots[ui.slotSel]) { ui.moveFrom = ui.slotSel; AU.click(); renderSheet(true); } },
    moveCancel: function () { ui.moveFrom = null; AU.click(); renderSheet(true); },
    buyFx: function (el) { afterAction(E.buyFixture(S, ui.slotSel, el.getAttribute('data-k'))); },
    sellFx: function () { confirmBox('賣掉只能拿回半價，放不下的庫存也會一起清掉。', 'sellFxConfirmed'); },
    sellFxConfirmed: function () { closeModal(); afterAction(E.sellFixture(S, ui.slotSel)); },
    expand: function () { afterAction(E.expand(S)); },
    upgrade: function (el) { afterAction(E.buyUpgrade(S, el.getAttribute('data-k'))); },
    ad: function (el) { afterAction(E.runAd(S, el.getAttribute('data-k'))); },
    ownerShift: function (el) { afterAction(E.setOwnerShift(S, +el.getAttribute('data-shift'))); },
    shift: function (el) { afterAction(E.setShift(S, +el.getAttribute('data-id'), +el.getAttribute('data-shift'))); },
    hire: function (el) { afterAction(E.hire(S, +el.getAttribute('data-i'), +el.getAttribute('data-shift'))); },
    fire: function (el) { confirmBox('請這位店員離開之後，就找不回來了。', 'fireConfirmed', ' data-id="' + el.getAttribute('data-id') + '"'); },
    fireConfirmed: function (el) { closeModal(); afterAction(E.fireStaff(S, +el.getAttribute('data-id'))); },
  };

  app.addEventListener('click', function (e) {
    AU.unlock();
    const el = e.target.closest('[data-act]');
    if (el && el.tagName !== 'INPUT' && ACT[el.getAttribute('data-act')]) {
      ACT[el.getAttribute('data-act')](el);
      if (CH && S) C.sync(CH, S);   // 所有的店共用一個錢包
      return;
    }
    if (e.target.id === 'scene' && scene && !ui.modal) {
      const r = e.target.getBoundingClientRect();
      const hit = scene.hitTest((e.clientX - r.left) / r.width * 192, (e.clientY - r.top) / r.height * 160);
      if (hit && hit.kind === 'slot') { ui.slotSel = hit.i; ui.sheet = 'equip'; renderSheet(); }
      else if (hit && hit.kind === 'staff') { ui.sheet = 'staff'; renderSheet(); }
    }
  });
  app.addEventListener('input', function (e) {
    const el = e.target;
    if (el.getAttribute('data-act') === 'stockSearch') { ui.stockQ = el.value; applyStockFilter(); return; }
    if (el.getAttribute('data-act') !== 'target') return;
    const row = el.closest('.prod');
    E.setTarget(S, row.getAttribute('data-pid'), +el.value);
    row.querySelector('output').textContent = el.value;
  });
  app.addEventListener('change', function (e) {
    const el = e.target;
    if (el.getAttribute('data-act') !== 'target') return;
    const row = el.closest('.prod');
    row.outerHTML = prodRow(E.P[row.getAttribute('data-pid')]);
    const sum = $('#stockSum');
    if (sum) sum.innerHTML = stockSummary();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (ui.modal === 'menu' || ui.modal === 'howto') closeModal(); else if (ui.sheet && !ui.modal) ACT.closeSheet(); }
    if (ui.screen === 'game' && !ui.modal && !ui.sheet && e.key === ' ' && e.target === document.body) { e.preventDefault(); ui.paused = !ui.paused; updateHud(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { save(); AU.suspend(); ui.last = 0; } else AU.resume();
  });
  root.addEventListener('resize', fitStage);

  // 供自動化測試使用
  root.DD_UI = { state: function () { return S; }, chain: function () { return CH; }, ui: ui, tick: doTick, act: ACT };

  renderTitle();
  if (document.fonts && document.fonts.load) document.fonts.load('15px "Huninn"');
  requestAnimationFrame(frame);
})(typeof globalThis !== 'undefined' ? globalThis : this);
