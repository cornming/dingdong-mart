/* 叮咚！便利店 — 核心引擎（純邏輯，無 DOM；瀏覽器與 Node 共用） */
(function (root) {
  'use strict';
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.DD_DATA;

  const P = {};
  D.PRODUCTS.forEach(function (p) { P[p.id] = p; });
  const LOC = {};
  D.LOCATIONS.forEach(function (l) { LOC[l.id] = l; });
  const SEG_KEYS = Object.keys(D.SEGMENTS);
  const CURVE = {};
  SEG_KEYS.forEach(function (k) {
    const sum = D.CURVES[k].reduce(function (a, b) { return a + b; }, 0);
    CURVE[k] = D.CURVES[k].map(function (v) { return v / sum; });
  });

  const OWNER = { speed: 55, charm: 0.6 };
  const TEMP = { speed: 40, charm: 0.3 };
  const OVERDRAFT = -100000;
  const MAX_PER_SHIFT = 2;
  const MAX_STAFF = 6;

  /* ---------- 亂數（狀態存在 s.seed，存檔後可重現） ---------- */
  function rnd(s) {
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(s, a, b) { return a + Math.floor(rnd(s) * (b - a + 1)); }
  function pick(s, arr) { return arr[Math.floor(rnd(s) * arr.length)]; }
  function gauss(s) {
    const u = Math.max(rnd(s), 1e-9), v = rnd(s);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function poisson(s, lam) {
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * gauss(s)));
    const L = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= rnd(s); } while (p > L);
    return k - 1;
  }
  function weighted(s, entries, total) {
    let r = rnd(s) * total;
    for (let i = 0; i < entries.length; i++) {
      r -= entries[i][1];
      if (r <= 0) return entries[i][0];
    }
    return entries[entries.length - 1][0];
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

  /* ---------- 時間 ---------- */
  function clockOf(t) { return (6 + t) % 24; }
  function shiftOf(t) { return Math.floor(t / 8); }
  function bandOf(clock) {
    if (clock >= 6 && clock <= 10) return 'm';
    if (clock >= 11 && clock <= 13) return 'n';
    if (clock >= 14 && clock <= 17) return 'a';
    if (clock >= 18 && clock <= 21) return 'e';
    return 'l';
  }
  function weekdayOf(day) { return (day - 1) % 7; }
  function isWeekend(day) { return weekdayOf(day) >= 5; }
  function seasonOf(day) { return D.SEASONS[Math.floor((day - 1) / 30) % 4]; }

  /* ---------- 天氣 ---------- */
  function rollWeather(s, day) {
    const w = seasonOf(day).w;
    const entries = Object.keys(w).map(function (k) { return [k, w[k]]; });
    const total = entries.reduce(function (a, e) { return a + e[1]; }, 0);
    let res = weighted(s, entries, total);
    if (day <= 3 && res === 'typhoon') res = 'rainy'; // 開局三天不來颱風
    return res;
  }
  function makeForecast(s) {
    if (s.nextWeather === 'typhoon' || rnd(s) < 0.8) return s.nextWeather;
    const others = Object.keys(D.WEATHER).filter(function (k) { return k !== s.nextWeather && k !== 'typhoon'; });
    return pick(s, others);
  }

  /* ---------- 查詢 ---------- */
  function fixtureCount(s, type) {
    let n = 0;
    for (let i = 0; i < s.slots.length; i++) if (s.slots[i] === type) n++;
    return n;
  }
  function cap(s, pid) { return fixtureCount(s, P[pid].fx) * D.FIXTURES[P[pid].fx].cap; }
  function unlockedSlots(s) { return D.SLOT_ORDER.slice(0, D.LEVELS[s.level].slots); }
  function unitPrice(s, pid) {
    return Math.max(1, Math.round(P[pid].price * s.price[pid] / 100 * (s.priceCut > 0 ? 0.9 : 1)));
  }
  function unitCost(s, pid) {
    return Math.max(1, Math.round(P[pid].cost * (s.promo[pid] > 0 ? 0.7 : 1)));
  }
  function carriedList(s) {
    return D.PRODUCTS.filter(function (p) { return cap(s, p.id) > 0 && s.target[p.id] > 0; });
  }
  function adBoost(s) {
    let b = 0;
    Object.keys(s.ads).forEach(function (k) { if (s.ads[k] > 0) b += D.ADS[k].boost; });
    return b;
  }
  function attract(s) {
    const list = carriedList(s);
    let avgPct = 100;
    if (list.length) avgPct = list.reduce(function (a, p) { return a + s.price[p.id]; }, 0) / list.length;
    let a = 15 + 0.7 * s.rep + 1.2 * list.length + adBoost(s) + (100 - avgPct) * 0.4;
    if (s.priceCut > 0) a += 4;
    if (s.upgrades.sign) a += 8;
    if (s.upgrades.seats) a += 5;
    if (s.upgrades.service) a += 6;
    if (s.cat) a += 4;
    return Math.max(5, a);
  }
  function rivalPower(r) { return r.str * (r.sale > 0 ? 1.25 : 1); }
  function share(s) {
    const a = attract(s);
    const rv = s.rivals.reduce(function (x, r) { return x + rivalPower(r); }, 0);
    return a / (a + rv + 20);
  }
  function shares(s) {
    const a = attract(s);
    const rv = s.rivals.reduce(function (x, r) { return x + rivalPower(r); }, 0);
    const tot = a + rv + 20;
    return { me: a / tot, rivals: s.rivals.map(function (r) { return { name: r.name, share: rivalPower(r) / tot, sale: r.sale > 0 }; }), other: 20 / tot };
  }
  function rentOf(s) { return Math.round(LOC[s.locId].rent * (1 + 0.15 * s.level)); }
  function powerOf(s) {
    return s.slots.reduce(function (a, f) { return a + (f ? D.FIXTURES[f].power : 0); }, 0);
  }
  function crewOn(s, shift) {
    const crew = [];
    s.staff.forEach(function (m) { if (m.shift === shift && !m.sick) crew.push(m); });
    if (s.owner.shift === shift) crew.push(OWNER);
    if (s.temp[shift]) crew.push(TEMP);
    return crew;
  }
  function isOpen(s, shift) { return !s.closedToday && crewOn(s, shift).length > 0; }
  function staffOnShift(s, shift) { return s.staff.filter(function (m) { return m.shift === shift; }).length; }
  function inventoryValue(s) {
    return D.PRODUCTS.reduce(function (a, p) { return a + s.stock[p.id] * p.cost; }, 0);
  }
  function assetValue(s) {
    let v = 0;
    s.slots.forEach(function (f) { if (f) v += D.FIXTURES[f].cost; });
    Object.keys(s.upgrades).forEach(function (k) { if (s.upgrades[k]) v += D.UPGRADES[k].cost; });
    for (let i = 1; i <= s.level; i++) v += D.LEVELS[i].cost;
    return v * 0.5;
  }
  function netWorth(s) { return Math.round(s.cash + inventoryValue(s) + assetValue(s)); }
  function addRep(s, n) { s.rep = clamp(s.rep + n, 0, 100); }

  function suggest(s, pid) {
    const c = cap(s, pid);
    if (!c) return 0;
    const hist = s.prodHist.slice(-3);
    if (!hist.length) return s.target[pid];
    let sum = 0;
    hist.forEach(function (h) { const r = h[pid]; if (r) sum += r.sold + r.soldOut; });
    const avg = sum / hist.length;
    const mult = P[pid].perish ? 1.0 : 1.15;
    return clamp(Math.ceil(avg * mult / 10) * 10, 0, c);
  }

  /* ---------- 新遊戲 ---------- */
  function newDayStats() {
    return { rev: 0, service: 0, cogs: 0, waste: 0, theft: 0, wages: 0, rent: 0, power: 0, ads: 0, other: 0,
      customers: 0, served: 0, happy: 0, neutral: 0, unhappy: 0, queueLost: 0, queueBy: [0, 0, 0], closedLost: 0, perProd: {} };
  }
  function pp(td, pid) {
    return td.perProd[pid] || (td.perProd[pid] = { sold: 0, soldOut: 0, noSell: 0, pricey: 0, waste: 0, outAt: -1 });
  }
  function genCand(s) {
    const speed = rint(s, 36, 78);
    const charm = Math.round(rnd(s) * 10) / 10;
    const fair = 70 + speed * 0.55 + charm * 22;
    const wage = Math.round((fair + rint(s, -12, 12)) / 5) * 5;
    return { name: pick(s, D.STAFF_NAMES), bio: pick(s, D.STAFF_BIOS), speed: speed, charm: charm, wage: wage };
  }
  function genCands(s) {
    const out = [];
    const used = {};
    s.staff.forEach(function (m) { used[m.name] = 1; });
    let guard = 0;
    while (out.length < 4 && guard++ < 60) {
      const c = genCand(s);
      if (used[c.name]) continue;
      used[c.name] = 1;
      out.push(c);
    }
    return out;
  }

  function newGame(o) {
    const loc = LOC[o.locId];
    if (!loc) throw new Error('unknown location ' + o.locId);
    const city = D.CITIES[loc.city];
    const s = {
      v: 1, seed: (o.seed | 0) || 20260104, name: (o.name || '叮咚便利店').slice(0, 10), locId: loc.id, cityId: loc.city,
      day: 1, t: 0, cash: city.cash, rep: 45, clean: 85, level: 0,
      slots: [null, null, null, null, null, null, null, null, null, null, null, null],
      stock: {}, price: {}, target: {}, promo: {},
      staff: [], nextId: 1, owner: { shift: 0 }, cands: [],
      upgrades: {}, ads: {}, cat: false,
      rivals: loc.rivals.map(function (r) { return { name: r.name, str: r.str, sale: 0 }; }), streak: 0,
      weather: 'sunny', nextWeather: null, forecast: null,
      boosts: [], priceCut: 0, guard: 0, closedToday: false, temp: [false, false, false],
      today: newDayStats(), history: [], prodHist: [], lastReport: null,
      pending: null, scripted: [], todayEvent: null,
      medal: null, over: null,
    };
    D.PRODUCTS.forEach(function (p) { s.stock[p.id] = 0; s.price[p.id] = 100; s.target[p.id] = 0; s.promo[p.id] = 0; });
    s.slots[0] = 'shelf';
    s.slots[1] = 'fridge';
    D.PRODUCTS.forEach(function (p) {
      if (p.fx === 'shelf' || p.fx === 'fridge') { s.target[p.id] = 80; s.stock[p.id] = 80; }
    });
    s.target.umbrella = 20; s.stock.umbrella = 20;
    s.staff.push({ id: s.nextId++, name: '阿明', bio: '開幕就跟著你的工讀生', speed: 50, charm: 0.5, wage: 105, shift: 1, sick: false });
    s.nextWeather = rollWeather(s, 2);
    s.forecast = makeForecast(s);
    s.cands = genCands(s);
    planDay(s);
    return s;
  }

  /* ---------- 事件 ---------- */
  function coldStockLoss(s) {
    let lost = 0;
    D.PRODUCTS.forEach(function (p) {
      if (p.fx === 'fridge' || p.fx === 'fresh' || p.fx === 'freezer') {
        const q = Math.floor(s.stock[p.id] / 2);
        s.stock[p.id] -= q;
        lost += q * p.cost;
      }
    });
    s.today.waste += lost;
    return lost;
  }
  function addBoost(s, mult, days, delay) { s.boosts.push({ mult: mult, days: days, delay: delay || 0 }); }
  function spend(s, n) { s.cash -= n; s.today.other += n; }

  const EV = {
    typhoon: {
      build: function () {
        return { title: '颱風登陸', text: '外面風雨交加，招牌被吹得嘎嘎作響，路上幾乎沒有人。今天要營業嗎？',
          choices: ['風雨無阻，照常營業', '安全第一，休息一天'] };
      },
      resolve: function (s, i) {
        if (i === 0) { addRep(s, 3); return '鄰居冒雨來買泡麵，直說「還好有你們開著」。口碑上升！'; }
        s.closedToday = true;
        return '拉下鐵門，全店放颱風假。今天沒有收入，也不用付薪水。';
      },
    },
    rival_open: {
      build: function (s, ctx) {
        return { title: '強敵現身', text: '「' + ctx.name + '」在斜對面盛大開幕，花籃排了一整排，還在發氣球！',
          choices: ['來就來，誰怕誰'] };
      },
      resolve: function () { return '商圈的客人被分走了一些。到「宣傳」看看市佔率吧。'; },
    },
    rival_close: {
      build: function (s, ctx) {
        return { title: '對手收攤', text: '「' + ctx.name + '」的鐵門上貼出了紅紙：「頂讓」。街坊都說是被你的店打敗的。',
          choices: ['默默幫他們鼓掌三秒'] };
      },
      resolve: function (s) { addRep(s, 2); return '少了一個對手，客人自然往你這邊走。'; },
    },
    shoplift: {
      w: 3, band: 'day', cond: function (s, t) { return isOpen(s, shiftOf(t)); },
      build: function (s) {
        const have = D.PRODUCTS.filter(function (p) { return s.stock[p.id] > 0; });
        const p = have.length ? pick(s, have) : P.candy;
        return { title: '抓到小偷', text: '店員逮到一個偷拿' + p.name + '的國中生。他低著頭小聲說：「我只是肚子餓……」',
          choices: ['報警處理', '訓話後放他走', '罰他把玻璃門擦乾淨'] };
      },
      resolve: function (s, i) {
        if (i === 0) { addRep(s, -1); s.guard = 7; return '警察把人帶走了。消息傳開，附近的小混混一週內都不敢來。'; }
        if (i === 1) { addRep(s, 2); return '你請他吃了一顆茶葉蛋。隔天他媽媽特地帶他來道謝。'; }
        s.clean = clamp(s.clean + 25, 0, 100); addRep(s, 1);
        return '玻璃門亮到下一位客人直接撞上去。店裡整潔度大幅提升。';
      },
    },
    robbery: {
      w: 2, band: 'night', cond: function (s, t) { return isOpen(s, 2) && s.cash > 5000; },
      weight: function (s) { return s.upgrades.camera ? 0.5 : 2; },
      build: function () {
        return { title: '深夜搶案', text: '凌晨，一名戴安全帽的男子衝進店裡大喊：「把錢拿出來！」',
          choices: ['乖乖交出收銀機的錢', '遞上一杯熱的，問他怎麼了'] };
      },
      resolve: function (s, i) {
        if (i === 0) {
          let loss = rint(s, 3000, 6000);
          if (s.upgrades.camera) { loss = Math.round(loss / 2); spend(s, loss); return '監視器拍得一清二楚，警察隔天就破案，追回一半。實際損失 ' + money(loss) + '。'; }
          spend(s, loss);
          return '他抓了錢就跑。損失 ' + money(loss) + '。也許該裝支監視器了。';
        }
        if (rnd(s) < 0.5) { addRep(s, 6); return '他愣了一下，摘下安全帽哭了：「我被公司裁員了……」最後他買了一碗泡麵離開。這件事隔天上了地方新聞，口碑大漲！'; }
        const loss = rint(s, 6000, 9000);
        spend(s, loss);
        return '他把熱飲喝完，還是把錢全部拿走了，連飲料錢都沒付。損失 ' + money(loss) + '。';
      },
    },
    aoke: {
      w: 3, band: 'day', cond: function (s, t) { return isOpen(s, shiftOf(t)); },
      build: function () {
        return { title: '奧客上門', text: '一位客人堅持他買的東西「跟廣告上長得不一樣」，要求全額退費，還要店長出來鞠躬。',
          choices: ['鞠躬道歉，再送他一罐飲料', '請他看清楚：本店沒有登過廣告'] };
      },
      resolve: function (s, i) {
        if (i === 0) { spend(s, 50); addRep(s, 2); return '客人滿意地走了，排隊的人都說你脾氣真好。'; }
        if (rnd(s) < 0.5) { addRep(s, -4); return '客人氣得到處跟鄰居抱怨，口碑受了點傷。'; }
        addRep(s, 2);
        return '客人啞口無言，排隊的客人鼓掌叫好。';
      },
    },
    tv: {
      w: 1.5, band: 'day', cond: function (s) { return fixtureCount(s, 'hot') + fixtureCount(s, 'fresh') > 0 && s.day > 4; },
      build: function () {
        return { title: '電視台來電', text: '美食節目《寶島趴趴走》想來店裡拍攝，製作人說攝影機等一下就到！',
          choices: ['歡迎歡迎！', '婉拒，太麻煩了'] };
      },
      resolve: function (s, i) {
        if (i === 1) return '製作人有點失望地掛了電話。';
        if (s.clean >= 60) { addRep(s, 8); addBoost(s, 1.3, 3, 1); return '主持人對著鏡頭大讚「這家店乾淨又親切！」節目播出後三天，人潮大增。'; }
        addRep(s, -5);
        return '鏡頭拍到地上的垃圾和黏黏的地板，主持人笑得很尷尬。口碑下滑……下次記得先把店顧乾淨。';
      },
    },
    inspection: {
      w: 2, band: 'day', cond: function (s, t) { return isOpen(s, shiftOf(t)) && s.day > 3; },
      build: function () {
        return { title: '衛生稽查', text: '衛生局人員突然上門，戴上白手套，開始摸貨架的角落。', choices: ['請、請便……'] };
      },
      resolve: function (s) {
        if (s.clean >= 50) { addRep(s, 3); return '白手套依然雪白。稽查員在門口貼上「優良店家」貼紙！'; }
        spend(s, 5000); addRep(s, -4);
        return '白手套變成了灰手套。開罰 $5,000，還被要求限期改善。多排一位店員可以讓店裡更乾淨。';
      },
    },
    raise: {
      w: 2, band: 'day', cond: function (s) { return s.staff.length > 0 && s.day > 5; },
      build: function (s) {
        const m = pick(s, s.staff);
        return { title: '店員想加薪', text: m.name + '扭扭捏捏地走過來：「店長，我做得很認真……時薪可以加 10 元嗎？」',
          choices: ['好，加！', '再看看表現吧'], ctx: { id: m.id } };
      },
      resolve: function (s, i, ctx) {
        const m = s.staff.filter(function (x) { return x.id === ctx.id; })[0];
        if (!m) return '結果他已經不在店裡了。';
        if (i === 0) { m.wage += 10; m.charm = clamp(Math.round((m.charm + 0.1) * 10) / 10, 0, 1); m.speed += 3; return m.name + '開心得跳起來，工作更有勁了。'; }
        if (rnd(s) < 0.35) { s.staff = s.staff.filter(function (x) { return x.id !== m.id; }); return m.name + '隔天就沒來上班了，只留下一張字條：「我去對面了。」記得補人。'; }
        return m.name + '有點失落，但還是默默回去補貨了。';
      },
    },
    sick: {
      w: 2, band: 'early', cond: function (s) { return s.staff.length > 0 && s.day > 2; },
      build: function (s) {
        const m = pick(s, s.staff);
        return { title: '店員請假', text: m.name + '打電話來，聲音沙啞：「店長……我發燒了……今天沒辦法上班……」',
          choices: ['找臨時工代班（$1,500）', '那一班先頂著'], ctx: { id: m.id } };
      },
      resolve: function (s, i, ctx) {
        const m = s.staff.filter(function (x) { return x.id === ctx.id; })[0];
        if (!m) return '';
        m.sick = true;
        if (i === 0) { spend(s, 1500); s.temp[m.shift] = true; return '臨時工趕來了，動作有點生疏，但至少店能開。'; }
        return crewOn(s, m.shift).length ? m.name + '在家休息，' + D.SHIFTS[m.shift].name + '人手少了一個。' : m.name + '在家休息，今天' + D.SHIFTS[m.shift].name + '沒人顧店，只能暫停營業。';
      },
    },
    promo: {
      w: 2.5, band: 'day', cond: function (s) { return carriedList(s).length > 0; },
      build: function (s) {
        const p = pick(s, carriedList(s));
        return { title: '廠商促銷', text: '業務員滿臉笑容：「店長，' + p.name + '這三天進貨價打 7 折，要不要多叫一點？」',
          choices: ['進貨目標加五成', '照原本的量就好'], ctx: { pid: p.id } };
      },
      resolve: function (s, i, ctx) {
        s.promo[ctx.pid] = 3;
        if (i === 0) {
          s.target[ctx.pid] = clamp(Math.ceil(s.target[ctx.pid] * 1.5 / 10) * 10, 0, cap(s, ctx.pid));
          return P[ctx.pid].name + '的進貨目標調高到 ' + s.target[ctx.pid] + '。' + (P[ctx.pid].perish ? '不過它當天就會報廢，小心別叫太多。' : '便宜進的貨可以慢慢賣。');
        }
        return '接下來三天，' + P[ctx.pid].name + '的進貨成本照樣便宜三成。';
      },
    },
    blackout: {
      w: 1.5, band: 'day', cond: function (s) { return fixtureCount(s, 'fridge') + fixtureCount(s, 'fresh') + fixtureCount(s, 'freezer') > 0; },
      build: function () {
        return { title: '無預警停電', text: '整條街突然停電，冷藏櫃的燈暗了下來。電力公司說要搶修兩小時。',
          choices: ['衝去買乾冰（$1,200）', '應該撐得住吧'] };
      },
      resolve: function (s, i) {
        if (i === 0) { spend(s, 1200); return '乾冰冒著白煙，客人還以為店裡在辦活動。商品全數保住。'; }
        if (rnd(s) < 0.45) { const lost = coldStockLoss(s); return '兩小時後復電，冷藏和冷凍的商品壞了一半，損失 ' + money(lost) + '。'; }
        return '還好四十分鐘就復電了，虛驚一場。';
      },
    },
    festival: {
      w: 2.5, band: 'day', cond: function () { return true; },
      build: function (s) {
        const what = pick(s, ['園遊會', '演唱會', '廟會遶境', '路跑活動']);
        return { title: '明天有活動', text: '里長來貼公告：附近明天要辦' + what + '，預計會湧入大量人潮！', choices: ['趕快去調整進貨'] };
      },
      resolve: function (s) { addBoost(s, 1.5, 1, 1); return '明天人潮預計增加五成。記得把進貨目標調高，店員也要排夠。'; },
    },
    cat: {
      w: 1.5, band: 'day', cond: function (s) { return !s.cat && s.day > 2; },
      build: function () {
        return { title: '不速之客', text: '一隻橘貓大搖大擺走進店裡，跳上櫃台，打了個呵欠就睡著了。',
          choices: ['收編為店貓（每天飼料 $30）', '請牠出去'] };
      },
      resolve: function (s, i) {
        if (i === 0) { s.cat = true; addRep(s, 3); return '橘貓正式成為本店「副店長」。客人為了看牠特地繞過來，吸客力 +4。'; }
        return '牠回頭看了你一眼，眼神充滿不屑，慢慢走去了對面。';
      },
    },
    lottery: {
      w: 1.2, band: 'day', cond: function (s) { return s.day > 3; },
      build: function () {
        return { title: '財神爺駕到', text: '有位客人衝進來大喊：「我在這裡拿的發票中了兩百萬！」', choices: ['把消息貼在門口'] };
      },
      resolve: function (s) { addRep(s, 4); addBoost(s, 1.2, 2, 0); return '大家都想來沾喜氣，接下來兩天人潮增加兩成。'; },
    },
    idol: {
      w: 1, band: 'day', cond: function (s) { return s.rep >= 55; },
      build: function () {
        return { title: '明星光臨', text: '一位戴墨鏡的客人買了飲料，結帳時店員才發現——是當紅偶像本人！', choices: ['請他在牆上簽名'] };
      },
      resolve: function (s) { addRep(s, 3); addBoost(s, 1.25, 2, 0); return '簽名板掛上牆，粉絲接下來兩天都跑來朝聖。'; },
    },
    rival_sale: {
      w: 2.5, band: 'day', cond: function (s) { return s.rivals.length > 0 && s.day > 4; },
      build: function (s) {
        const r = pick(s, s.rivals);
        return { title: '對手出招', text: '「' + r.name + '」掛出紅布條：「週年慶全面 8 折，連續三天！」',
          choices: ['跟進，全店 9 折三天', '發傳單反擊（$2,000）', '不隨之起舞'], ctx: { name: r.name } };
      },
      resolve: function (s, i, ctx) {
        s.rivals.forEach(function (r) { if (r.name === ctx.name) r.sale = 3; });
        if (i === 0) { s.priceCut = 3; return '全店商品自動打 9 折三天。少賺一點，但客人不會跑。'; }
        if (i === 1) {
          if (s.cash < 2000) return '錢不夠印傳單……只好看著客人往對面走。';
          s.cash -= 2000; s.today.ads += 2000; s.ads.flyer = Math.max(s.ads.flyer || 0, D.ADS.flyer.days);
          return '傳單發出去了：「我們不打折，但我們有誠意。」';
        }
        return '你決定穩穩做自己的生意。這三天客人會被搶走一些。';
      },
    },
  };
  const RANDOM_EVENTS = Object.keys(EV).filter(function (k) { return EV[k].band; });

  function fire(s, id, ctx) {
    const built = EV[id].build(s, ctx);
    s.pending = { id: id, title: built.title, text: built.text, choices: built.choices, ctx: built.ctx || ctx || null };
    return s.pending;
  }
  function resolveEvent(s, i) {
    if (!s.pending) return '';
    const p = s.pending;
    const idx = clamp(i | 0, 0, p.choices.length - 1);
    const text = EV[p.id].resolve(s, idx, p.ctx);
    s.pending = null;
    return text;
  }
  function planDay(s) {
    s.todayEvent = null;
    if (s.weather === 'typhoon') { s.scripted.unshift({ id: 'typhoon' }); return; }
    if (s.day === 1 || rnd(s) > 0.6) return;
    const id = pickEvent(s);
    if (!id) return;
    const band = EV[id].band;
    const t = band === 'night' ? rint(s, 17, 22) : band === 'early' ? 0 : rint(s, 1, 15);
    s.todayEvent = { id: id, t: t };
  }
  function pickEvent(s) {
    const entries = [];
    let total = 0;
    RANDOM_EVENTS.forEach(function (k) {
      if (k === s.lastEvent) return;
      const w = EV[k].weight ? EV[k].weight(s) : EV[k].w;
      entries.push([k, w]);
      total += w;
    });
    return entries.length ? weighted(s, entries, total) : null;
  }

  /* ---------- 每小時模擬 ---------- */
  function trafficMult(s) {
    let m = D.WEATHER[s.weather].traffic;
    const loc = LOC[s.locId];
    if (isWeekend(s.day)) m *= loc.weekend;
    s.boosts.forEach(function (b) { if (!b.delay) m *= b.mult; });
    return m;
  }
  function lambdaAt(s, clock) {
    const loc = LOC[s.locId];
    let c = 0;
    SEG_KEYS.forEach(function (k) { c += (loc.mix[k] || 0) * CURVE[k][clock]; });
    let lam = loc.traffic * share(s) * c * trafficMult(s);
    if (s.upgrades.sign && (clock >= 18 || clock < 6)) lam *= 1.15;
    return lam;
  }

  function tickHour(s) {
    if (s.over) return { blocked: true };
    if (s.pending) return { blocked: true, event: s.pending };
    if (s.scripted.length) {
      const sc = s.scripted.shift();
      return { event: fire(s, sc.id, sc.ctx) };
    }
    if (s.todayEvent && s.todayEvent.t === s.t) {
      const te = s.todayEvent;
      s.todayEvent = null;
      if (EV[te.id].cond(s, s.t)) { s.lastEvent = te.id; return { event: fire(s, te.id) }; }
    }

    const td = s.today;
    const clock = clockOf(s.t);
    const shift = shiftOf(s.t);
    const loc = LOC[s.locId];
    const crew = crewOn(s, shift);
    const lam = lambdaAt(s, clock);
    const n = poisson(s, lam);
    const out = { clock: clock, visits: [], msgs: [], n: n, open: true };

    if (s.closedToday || crew.length === 0) {
      out.open = false;
      if (!s.closedToday) {
        td.closedLost += n;
        s.rep = clamp(s.rep - 0.04 * Math.min(1, n / 20), 0, 100);
      }
    } else {
      let capacity = crew.reduce(function (a, m) { return a + m.speed; }, 0);
      if (s.upgrades.register2) capacity *= 1.35;
      const charm = crew.reduce(function (a, m) { return a + m.charm; }, 0) / crew.length;
      const band = bandOf(clock);
      const eve = s.nextWeather === 'typhoon' && s.weather !== 'typhoon';
      // 這個小時各客層的權重、各客層想買什麼的權重
      const segW = [];
      let segTotal = 0;
      const wantW = {}, wantTotal = {};
      SEG_KEYS.forEach(function (k) {
        const w = (loc.mix[k] || 0) * CURVE[k][clock];
        if (w <= 0) return;
        segW.push([k, w]);
        segTotal += w;
        const arr = [];
        let tot = 0;
        D.PRODUCTS.forEach(function (p) {
          let x = p.seg[k] || 0;
          if (!x) return;
          if (p.time && p.time[band] != null) x *= p.time[band];
          if (p.wx) {
            if (p.wx[s.weather] != null) x *= p.wx[s.weather];
            if (eve && p.wx.eve != null) x *= p.wx.eve;
          }
          arr.push([p.id, x]);
          tot += x;
        });
        wantW[k] = arr;
        wantTotal[k] = tot;
      });

      const sampleEvery = n > 8 ? Math.floor(n / 8) : 1;
      let served = 0, happy = 0, unhappy = 0;
      for (let i = 0; i < n && segTotal > 0; i++) {
        const sk = weighted(s, segW, segTotal);
        const seg = D.SEGMENTS[sk];
        const k = rint(s, seg.wants[0], seg.wants[1]);
        const basket = [];
        const fxWanted = [];
        let soldOut = 0, pricey = 0, noSell = 0, cheap = 0;
        for (let j = 0; j < k; j++) {
          const pid = weighted(s, wantW[sk], wantTotal[sk]);
          const rec = pp(td, pid);
          const c = cap(s, pid);
          if (c === 0 || (s.target[pid] === 0 && s.stock[pid] === 0)) { noSell++; rec.noSell++; continue; }
          if (fxWanted.length < 2 && fxWanted.indexOf(P[pid].fx) < 0) fxWanted.push(P[pid].fx);
          if (s.stock[pid] <= 0) { soldOut++; rec.soldOut++; continue; }
          const price = unitPrice(s, pid);
          const ratio = price / P[pid].price;
          if (ratio > 1 && rnd(s) > clamp(1 - seg.sens * (ratio - 1) * 2.5, 0.05, 1)) { pricey++; rec.pricey++; continue; }
          if (ratio < 0.97) cheap++;
          s.stock[pid]--;
          basket.push(pid);
        }
        let queue = false, spent = 0;
        if (basket.length) {
          if (served >= capacity) {
            queue = true;
            td.queueLost++;
            td.queueBy[shift]++;
            basket.forEach(function (pid) { s.stock[pid]++; });
          } else {
            served++;
            basket.forEach(function (pid) {
              const rec = pp(td, pid);
              rec.sold++;
              const price = unitPrice(s, pid);
              td.rev += price; s.cash += price; td.cogs += P[pid].cost; spent += price;
              if (s.stock[pid] === 0 && rec.outAt < 0) rec.outAt = clock;
            });
            if (s.upgrades.service && rnd(s) < 0.2) { td.service += 8; s.cash += 8; }
          }
        }
        let score = queue ? -3 : basket.length - soldOut * 1.5 - pricey - noSell * 0.3;
        if (!queue && basket.length) {
          score += charm * 0.6;
          if (cheap) score += 0.3;
          if (s.upgrades.seats) score += 0.2;
        }
        if (s.clean < 40) score -= 0.7;
        if (s.weather === 'hot') score += s.upgrades.aircon ? 0.4 : -0.3;
        const mood = score >= 1 ? 'happy' : score <= -1 ? 'unhappy' : 'neutral';
        td[mood]++;
        if (mood === 'happy') happy++; else if (mood === 'unhappy') unhappy++;
        if (i % sampleEvery === 0 && out.visits.length < 8) {
          out.visits.push({ seg: sk, fx: fxWanted, bought: queue ? 0 : basket.length, spent: spent, mood: mood,
            bubble: queue ? 'queue' : soldOut ? 'out' : pricey ? 'pricey' : (noSell && !basket.length) ? 'none' : mood === 'happy' ? 'love' : null });
        }
      }
      td.customers += n;
      td.served += served;
      out.served = served;
      // 口碑往「這個小時的滿意度」靠攏
      if (n > 0) {
        let target = 50 + 50 * (happy - unhappy) / n + charm * 6 + clamp((s.clean - 60) * 0.15, -6, 6);
        target = clamp(target, 0, 100);
        s.rep = clamp(s.rep + (target - s.rep) * 0.02 * Math.min(1, n / 20), 0, 100);
      }
      // 整潔
      s.clean = clamp(s.clean - n * 0.05 + crew.length * 3.5, 0, 100);
      // 順手牽羊
      let pTheft = n > 5 ? 0.03 : 0;
      if (s.upgrades.camera) pTheft *= 0.3;
      if (s.guard > 0) pTheft *= 0.3;
      if (crew.length >= 2) pTheft *= 0.6;
      if (rnd(s) < pTheft) {
        const have = D.PRODUCTS.filter(function (p) { return s.stock[p.id] > 2; });
        if (have.length) {
          const p = pick(s, have);
          const q = Math.min(s.stock[p.id], rint(s, 1, 5));
          s.stock[p.id] -= q;
          td.theft += q * p.cost;
          out.msgs.push('盤點時發現少了 ' + q + ' 個' + p.name + '……被偷了！');
        }
      }
      // 薪資（大夜班加給兩成）
      s.staff.forEach(function (m) {
        if (m.shift === shift && !m.sick) td.wages += Math.round(m.wage * (shift === 2 ? 1.2 : 1));
      });
    }

    s.t++;
    if (s.t >= 24) { out.report = endDay(s); out.dayEnded = true; }
    return out;
  }

  /* ---------- 日結 ---------- */
  function buildTips(s, td, r) {
    const tips = [];
    const loc = LOC[s.locId];
    if (td.queueLost >= 8) {
      let worst = 0;
      td.queueBy.forEach(function (q, i) { if (q > td.queueBy[worst]) worst = i; });
      tips.push({ p: td.queueLost * 3, text: '結帳排太長，氣走了 ' + td.queueLost + ' 位客人，' + D.SHIFTS[worst].name + '最嚴重。那一班多排一位店員，或加裝第二收銀台。' });
    }
    if (td.closedLost >= 20) tips.push({ p: td.closedLost * 1.5, text: '沒人顧店的時段，有 ' + td.closedLost + ' 位客人撲空。到「店員」把三個班都排滿吧。' });
    // 沒有設備的品類
    const byFx = {};
    D.PRODUCTS.forEach(function (p) {
      const rec = td.perProd[p.id];
      if (rec && cap(s, p.id) === 0) byFx[p.fx] = (byFx[p.fx] || 0) + rec.noSell * (p.price - p.cost);
    });
    let bestFx = null;
    Object.keys(byFx).forEach(function (k) { if (!bestFx || byFx[k] > byFx[bestFx]) bestFx = k; });
    if (bestFx && byFx[bestFx] > 600) {
      const names = D.PRODUCTS.filter(function (p) { return p.fx === bestFx; }).map(function (p) { return p.name; }).join('、');
      tips.push({ p: byFx[bestFx] / 40, text: '很多客人想買' + names + '。添購一台' + D.FIXTURES[bestFx].name + '，估計每天多賺 ' + money(byFx[bestFx]) + '。' });
    }
    D.PRODUCTS.forEach(function (p) {
      const rec = td.perProd[p.id];
      if (!rec || cap(s, p.id) === 0) return;
      if (rec.soldOut >= 10) {
        const full = s.target[p.id] >= cap(s, p.id);
        tips.push({ p: rec.soldOut * (p.price - p.cost) / 10, text: p.name + (rec.outAt >= 0 ? ' ' + rec.outAt + ' 點就賣完了' : '缺貨') + '，有 ' + rec.soldOut + ' 人買不到。' +
          (full ? '已經放滿了，再買一台' + D.FIXTURES[p.fx].name + '才放得下。' : '把進貨目標調高吧。') });
      }
      if (rec.waste >= 10 && rec.waste > rec.sold * 0.25) tips.push({ p: rec.waste * p.cost / 10, text: p.name + '報廢了 ' + rec.waste + ' 個，白白丟掉 ' + money(rec.waste * p.cost) + '。進貨目標調低一點。' });
      if (rec.pricey >= 12 && rec.pricey > rec.sold * 0.3) tips.push({ p: rec.pricey / 2, text: '有 ' + rec.pricey + ' 位客人嫌' + p.name + '太貴，放回架上就走了。' });
    });
    if (s.clean < 45) tips.push({ p: 30, text: '店裡有點髒亂（整潔度 ' + Math.round(s.clean) + '）。店員越多、掃得越勤，客人和稽查員都看在眼裡。' });
    if (r.profit < 0 && !tips.length) tips.push({ p: 5, text: '今天賠錢了。看看是租金壓力大，還是商品種類太少、客人買不到東西。' });
    tips.sort(function (a, b) { return b.p - a.p; });
    const out = tips.slice(0, 3).map(function (x) { return x.text; });
    const fc = s.forecast;
    const fcTip = { hot: '明天預報酷暑，飲料和冰品會大賣。', rainy: '明天預報下雨，雨傘和熱食會好賣，人潮略少。', cold: '明天寒流來襲，關東煮、泡麵、咖啡要多備。',
      typhoon: '颱風警報！今天大家會搶購泡麵和衛生紙，明天路上幾乎沒人。' }[fc];
    if (fcTip) out.push(fcTip);
    if (weekdayOf(s.day) === 4 && Math.abs(loc.weekend - 1) > 0.15) out.push(loc.weekend > 1 ? '明天開始是週末，這一帶人潮會比平日多，貨要備足。' : '明天開始是週末，這一帶會冷清不少，鮮食別叫太多。');
    if (!out.length) out.push('今天一切順利。保持下去！');
    return out;
  }

  function endDay(s) {
    const td = s.today;
    const city = D.CITIES[s.cityId];
    // 報廢
    D.PRODUCTS.forEach(function (p) {
      if (p.perish && s.stock[p.id] > 0) {
        const rec = pp(td, p.id);
        rec.waste = s.stock[p.id];
        td.waste += s.stock[p.id] * p.cost;
        s.stock[p.id] = 0;
      }
    });
    // 固定支出
    td.rent = rentOf(s);
    td.power = powerOf(s);
    if (s.cat) td.other += 30;
    const interest = s.cash < 0 ? Math.round(-s.cash * 0.005) : 0;
    td.other += interest;
    s.cash -= td.wages + td.rent + td.power + (s.cat ? 30 : 0) + interest;
    const profit = td.rev + td.service - td.cogs - td.waste - td.theft - td.wages - td.rent - td.power - td.ads - td.other;

    const report = {
      day: s.day, weekday: weekdayOf(s.day), weather: s.weather,
      rev: td.rev, service: td.service, cogs: td.cogs, waste: td.waste, theft: td.theft, wages: td.wages, rent: td.rent,
      power: td.power, ads: td.ads, other: td.other, profit: profit,
      customers: td.customers, served: td.served, happy: td.happy, neutral: td.neutral, unhappy: td.unhappy,
      queueLost: td.queueLost, queueBy: td.queueBy, closedLost: td.closedLost, perProd: td.perProd,
      rep: Math.round(s.rep), share: share(s), orderCost: 0, worth: 0, tips: [], goal: null, rivalClosed: null,
    };

    // 換日
    s.prodHist.push(td.perProd);
    if (s.prodHist.length > 3) s.prodHist.shift();
    Object.keys(s.ads).forEach(function (k) { if (s.ads[k] > 0) s.ads[k]--; });
    s.boosts = s.boosts.filter(function (b) { if (b.delay) { b.delay--; return true; } b.days--; return b.days > 0; });
    if (s.priceCut > 0) s.priceCut--;
    if (s.guard > 0) s.guard--;
    s.rivals.forEach(function (r) {
      if (r.sale > 0) r.sale--;
      r.str = Math.min(90, r.str + city.rivalGrow * (0.5 + rnd(s)));
    });
    s.staff.forEach(function (m) { m.sick = false; });
    s.temp = [false, false, false];
    s.closedToday = false;

    // 對手倒閉：吸客力連續 7 天達最弱對手的 2.2 倍
    if (s.rivals.length) {
      let weakest = s.rivals[0];
      s.rivals.forEach(function (r) { if (r.str < weakest.str) weakest = r; });
      if (attract(s) >= weakest.str * 2.2) s.streak++; else s.streak = 0;
      if (s.streak >= 7) {
        s.rivals = s.rivals.filter(function (r) { return r !== weakest; });
        s.streak = 0;
        s.scripted.push({ id: 'rival_close', ctx: { name: weakest.name } });
        report.rivalClosed = weakest.name;
      }
    }
    // 新對手
    const loc = LOC[s.locId];
    if (loc.newRival && loc.newRival === s.day + 1) {
      const used = s.rivals.map(function (r) { return r.name; });
      const names = D.RIVAL_NAMES.filter(function (nm) { return used.indexOf(nm) < 0; });
      const nm = names.length ? pick(s, names) : '新開的店';
      s.rivals.push({ name: nm, str: 36 + Math.round(city.rivalGrow * 20), sale: 0 });
      s.scripted.push({ id: 'rival_open', ctx: { name: nm } });
    }

    // 進貨（隔天清晨到貨），透支額度用完就不再叫貨
    D.PRODUCTS.forEach(function (p) {
      const c = cap(s, p.id);
      if (!c) return;
      let want = Math.min(s.target[p.id], c) - s.stock[p.id];
      if (want <= 0) return;
      const uc = unitCost(s, p.id);
      const room = Math.floor((s.cash - OVERDRAFT) / uc);
      if (room <= 0) return;
      want = Math.min(want, room);
      s.stock[p.id] += want;
      s.cash -= want * uc;
      report.orderCost += want * uc;
    });
    D.PRODUCTS.forEach(function (p) { if (s.promo[p.id] > 0) s.promo[p.id]--; });

    report.worth = netWorth(s);
    report.cash = Math.round(s.cash);
    s.history.push({ day: s.day, rev: td.rev, profit: profit, customers: td.customers, rep: report.rep, share: report.share, worth: report.worth });
    if (s.history.length > 120) s.history.shift();

    // 目標與破產
    if (s.day === city.days && !s.medal) {
      let tier = 0;
      city.goals.forEach(function (g, i) { if (report.worth >= g) tier = i + 1; });
      s.medal = { tier: tier, worth: report.worth, day: s.day };
      report.goal = s.medal;
    }
    if (s.cash < OVERDRAFT) s.over = 'bankrupt';

    // 明天
    s.day++;
    s.t = 0;
    s.weather = s.nextWeather;
    s.nextWeather = rollWeather(s, s.day + 1);
    s.forecast = makeForecast(s);
    if (s.day % 5 === 1) s.cands = genCands(s);
    s.today = newDayStats();
    report.tips = buildTips(s, td, report);
    report.forecast = s.forecast;
    report.todayWeather = s.weather;
    s.lastReport = report;
    planDay(s);
    return report;
  }

  /* ---------- 玩家操作（皆回傳 { ok, msg }） ---------- */
  function ok(msg) { return { ok: true, msg: msg || '' }; }
  function no(msg) { return { ok: false, msg: msg }; }

  function buyFixture(s, slot, type) {
    const f = D.FIXTURES[type];
    if (!f) return no('沒有這種設備');
    if (unlockedSlots(s).indexOf(slot) < 0) return no('這個位置要先擴建店面');
    if (s.slots[slot]) return no('這個位置已經有設備了');
    if (s.cash < f.cost) return no('現金不夠，還差 ' + money(f.cost - s.cash));
    const first = fixtureCount(s, type) === 0;
    s.cash -= f.cost;
    s.slots[slot] = type;
    if (first) D.PRODUCTS.forEach(function (p) { if (p.fx === type && s.target[p.id] === 0) s.target[p.id] = Math.round(f.cap * 0.5 / 10) * 10; });
    return ok(first ? f.name + '裝好了！商品明早到貨，也可以到「進貨」按緊急補貨。' : '多了一台' + f.name + '，可以放更多貨了。');
  }
  function sellFixture(s, slot) {
    const type = s.slots[slot];
    if (!type) return no('這裡沒有設備');
    const f = D.FIXTURES[type];
    s.slots[slot] = null;
    s.cash += f.cost * 0.5;
    D.PRODUCTS.forEach(function (p) {
      if (p.fx !== type) return;
      const c = cap(s, p.id);
      if (s.stock[p.id] > c) s.stock[p.id] = c;
      if (s.target[p.id] > c) s.target[p.id] = c;
    });
    return ok(f.name + '以半價 ' + money(f.cost * 0.5) + ' 賣掉了。');
  }
  function setTarget(s, pid, n) {
    if (!P[pid]) return no('沒有這項商品');
    s.target[pid] = clamp(Math.round(n), 0, cap(s, pid));
    return ok();
  }
  function setPrice(s, pid, pct) {
    if (!P[pid]) return no('沒有這項商品');
    s.price[pid] = clamp(Math.round(pct / 5) * 5, 70, 150);
    return ok();
  }
  function rushCost(s, pid) {
    const q = Math.min(s.target[pid], cap(s, pid)) - s.stock[pid];
    return q > 0 ? Math.round(q * unitCost(s, pid) * 1.3) : 0;
  }
  function rushOrder(s, pid) {
    const q = Math.min(s.target[pid], cap(s, pid)) - s.stock[pid];
    if (q <= 0) return no('庫存已經達到目標了');
    const c = rushCost(s, pid);
    if (s.cash < c) return no('現金不夠，緊急補貨要 ' + money(c));
    s.cash -= c;
    s.today.other += c - q * P[pid].cost; // 多付的運費算雜支
    s.stock[pid] += q;
    return ok(P[pid].name + '補了 ' + q + ' 個（含急件運費 ' + money(c) + '）');
  }
  function applySuggestions(s) {
    if (!s.upgrades.pos) return no('需要先安裝 POS 系統');
    if (!s.prodHist.length) return no('至少要營業滿一天才有資料');
    D.PRODUCTS.forEach(function (p) { if (cap(s, p.id) > 0) s.target[p.id] = suggest(s, p.id); });
    return ok('已依最近的銷量調整全部進貨目標。');
  }
  function hire(s, idx, shift) {
    const c = s.cands[idx];
    if (!c) return no('這位應徵者已經被別家錄取了');
    if (s.staff.length >= MAX_STAFF) return no('店員最多 ' + MAX_STAFF + ' 位');
    if (staffOnShift(s, shift) >= MAX_PER_SHIFT) return no(D.SHIFTS[shift].name + '已經排滿 ' + MAX_PER_SHIFT + ' 位了');
    s.cands.splice(idx, 1);
    s.staff.push({ id: s.nextId++, name: c.name, bio: c.bio, speed: c.speed, charm: c.charm, wage: c.wage, shift: shift, sick: false });
    return ok(c.name + '加入了' + D.SHIFTS[shift].name + '！');
  }
  function fireStaff(s, id) {
    const m = s.staff.filter(function (x) { return x.id === id; })[0];
    if (!m) return no('找不到這位店員');
    s.staff = s.staff.filter(function (x) { return x.id !== id; });
    return ok(m.name + '離職了。');
  }
  function setShift(s, id, shift) {
    const m = s.staff.filter(function (x) { return x.id === id; })[0];
    if (!m) return no('找不到這位店員');
    if (m.shift === shift) return ok();
    if (staffOnShift(s, shift) >= MAX_PER_SHIFT) return no(D.SHIFTS[shift].name + '已經排滿 ' + MAX_PER_SHIFT + ' 位了');
    m.shift = shift;
    return ok(m.name + '改上' + D.SHIFTS[shift].name + '。');
  }
  function setOwnerShift(s, shift) {
    s.owner.shift = clamp(shift, -1, 2);
    return ok(shift < 0 ? '店長今天不站櫃台。' : '店長親自顧' + D.SHIFTS[shift].name + '。');
  }
  function buyUpgrade(s, id) {
    const u = D.UPGRADES[id];
    if (!u) return no('沒有這項升級');
    if (s.upgrades[id]) return no('已經裝過了');
    if (s.cash < u.cost) return no('現金不夠，還差 ' + money(u.cost - s.cash));
    s.cash -= u.cost;
    s.upgrades[id] = true;
    return ok(u.name + '安裝完成！');
  }
  function expand(s) {
    const next = D.LEVELS[s.level + 1];
    if (!next) return no('已經是最大的店面了');
    if (s.cash < next.cost) return no('現金不夠，還差 ' + money(next.cost - s.cash));
    s.cash -= next.cost;
    s.level++;
    return ok('擴建完成，升級為' + next.name + '！多了 ' + (next.slots - D.LEVELS[s.level - 1].slots) + ' 個設備位置，租金也漲了一成五。');
  }
  function runAd(s, id) {
    const a = D.ADS[id];
    if (!a) return no('沒有這種宣傳');
    if (s.ads[id] > 0) return no(a.name + '還在進行中（剩 ' + s.ads[id] + ' 天）');
    if (s.cash < a.cost) return no('現金不夠，還差 ' + money(a.cost - s.cash));
    s.cash -= a.cost;
    s.today.ads += a.cost;
    s.ads[id] = a.days;
    if (a.rep) addRep(s, a.rep);
    return ok(a.name + '開始了，效果持續 ' + a.days + ' 天。');
  }

  const API = {
    D: D, P: P, LOC: LOC, OWNER: OWNER, OVERDRAFT: OVERDRAFT, MAX_PER_SHIFT: MAX_PER_SHIFT,
    newGame: newGame, tickHour: tickHour, resolveEvent: resolveEvent, EVENT_IDS: Object.keys(EV),
    clockOf: clockOf, shiftOf: shiftOf, weekdayOf: weekdayOf, isWeekend: isWeekend, seasonOf: seasonOf,
    fixtureCount: fixtureCount, cap: cap, unlockedSlots: unlockedSlots, unitPrice: unitPrice, unitCost: unitCost,
    carriedList: carriedList, attract: attract, share: share, shares: shares, rentOf: rentOf, powerOf: powerOf,
    crewOn: crewOn, isOpen: isOpen, staffOnShift: staffOnShift, netWorth: netWorth, inventoryValue: inventoryValue,
    suggest: suggest, rushCost: rushCost, lambdaAt: lambdaAt, money: money,
    buyFixture: buyFixture, sellFixture: sellFixture, setTarget: setTarget, setPrice: setPrice, rushOrder: rushOrder,
    applySuggestions: applySuggestions, hire: hire, fireStaff: fireStaff, setShift: setShift, setOwnerShift: setOwnerShift,
    buyUpgrade: buyUpgrade, expand: expand, runAd: runAd,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.DD = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
