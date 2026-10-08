/* 引擎單元測試：node --test tests/
 * loop engineering 的驗證閘門之一——規則正確性。數值手感由 scripts/balance.js 負責。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const D = E.D;

/** 跑完一整天；遇到事件一律選 choose 指定的選項。回傳日結的 tick 結果。 */
function runDay(s, choose) {
  for (let guard = 0; guard < 300; guard++) {
    const r = E.tickHour(s);
    if (r.event) { E.resolveEvent(s, typeof choose === 'function' ? choose(r.event) : (choose || 0)); continue; }
    if (r.blocked || r.dayEnded) return r;
  }
  throw new Error('一天跑不完，引擎卡住了');
}
function fresh(locId, seed) { return E.newGame({ locId: locId || 'kh1', seed: seed || 7, name: '測試店' }); }
const clone = (o) => JSON.parse(JSON.stringify(o));

test('資料完整性', () => {
  const ids = D.PRODUCTS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, '商品 id 不可重複');
  D.PRODUCTS.forEach((p) => {
    assert.ok(D.FIXTURES[p.fx], p.id + ' 的設備種類存在');
    assert.ok(p.price > p.cost && p.cost > 0, p.id + ' 售價要高於成本');
    assert.equal([...p.ch].length, 1, p.id + ' 的代表字只能一個字');
    Object.keys(p.seg).forEach((k) => assert.ok(D.SEGMENTS[k], p.id + ' 的客層 ' + k));
  });
  D.FIXTURE_ORDER.forEach((k) => assert.ok(D.PRODUCTS.some((p) => p.fx === k), k + ' 至少有一種商品可放'));
  assert.deepEqual([...D.SLOT_ORDER].sort((a, b) => a - b), [...Array(12).keys()], '設備格解鎖順序是 0~11 的排列');
  Object.keys(D.CURVES).forEach((k) => assert.equal(D.CURVES[k].length, 24));
  D.LOCATIONS.forEach((l) => {
    assert.ok(D.CITIES[l.city], l.id + ' 的城市存在');
    const sum = Object.values(l.mix).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, l.id + ' 的客層比例加總為 1（實際 ' + sum + '）');
  });
  Object.values(D.CITIES).forEach((c) => assert.ok(c.goals[0] < c.goals[1] && c.goals[1] < c.goals[2], '獎牌門檻遞增'));
  D.CITY_ORDER.forEach((c) => assert.equal(D.LOCATIONS.filter((l) => l.city === c).length, 4, c + ' 有四個店面'));
});

test('新遊戲的狀態是純資料，可以存檔再讀回', () => {
  const s = fresh();
  assert.deepEqual(clone(s), s);
  assert.equal(s.day, 1);
  assert.equal(s.cash, D.CITIES.kaohsiung.cash);
  assert.throws(() => E.newGame({ locId: 'nowhere' }));
});

test('同一個種子會重現同樣的結果，不同種子不會', () => {
  const run = (seed) => { const s = fresh('tc2', seed); for (let i = 0; i < 5; i++) runDay(s); return s; };
  assert.deepEqual(run(11), run(11));
  assert.notDeepEqual(run(11).history, run(12).history);
});

test('營業到一半存檔再讀檔，後續發展完全相同', () => {
  const a = fresh('tp1', 3);
  runDay(a);
  for (let i = 0; i < 13; i++) { const r = E.tickHour(a); if (r.event) E.resolveEvent(a, 0); }
  const b = clone(a);
  runDay(a); runDay(a);
  runDay(b); runDay(b);
  assert.deepEqual(a, b);
});

test('現金流對得起來：現金變化＝收入－各項支出－進貨', () => {
  ['kh2', 'tc1', 'tp3'].forEach((loc) => {
    const s = fresh(loc, 21);
    for (let d = 0; d < 20; d++) {
      const before = s.cash;
      const r = runDay(s).report;
      const expected = before + r.rev + r.service - r.wages - r.rent - r.power - r.ads - r.other - r.orderCost;
      assert.ok(Math.abs(s.cash - expected) < 0.01, loc + ' 第 ' + r.day + ' 天現金差 ' + (s.cash - expected));
      assert.equal(r.profit, r.rev + r.service - r.cogs - r.waste - r.theft - r.wages - r.rent - r.power - r.ads - r.other);
    }
  });
});

test('庫存永遠在 0 與容量之間，鮮食當日報廢後依目標補貨', () => {
  const s = fresh('kh3', 5);
  E.buyFixture(s, 2, 'fresh');
  E.buyFixture(s, 3, 'hot');
  for (let d = 0; d < 12; d++) {
    for (let h = 0; h < 400; h++) {
      const r = E.tickHour(s);
      if (r.event) { E.resolveEvent(s, 1); continue; }
      D.PRODUCTS.forEach((p) => {
        assert.ok(s.stock[p.id] >= 0, p.name + ' 庫存不可為負');
        assert.ok(s.stock[p.id] <= Math.max(E.cap(s, p.id), 0), p.name + ' 庫存不可超過容量');
      });
      if (r.dayEnded) {
        D.PRODUCTS.filter((p) => p.perish && E.cap(s, p.id) > 0).forEach((p) => {
          assert.equal(s.stock[p.id], Math.min(s.target[p.id], E.cap(s, p.id)), p.name + ' 清晨應補到目標量');
        });
        break;
      }
    }
  }
});

test('沒人顧的班不營業，客人會撲空', () => {
  const s = fresh('tc1', 9); // 夜市商圈，大夜人潮多
  const r = runDay(s).report;
  assert.ok(r.closedLost > 0, '開局大夜沒人，應該有人撲空');
  E.setOwnerShift(s, -1);
  s.staff = [];
  const r2 = runDay(s).report;
  assert.equal(r2.rev, 0, '全天沒人顧店就沒有營收');
  assert.equal(r2.served, 0);
});

test('玩家操作的檢查', () => {
  const s = fresh();
  assert.equal(E.buyFixture(s, 4, 'rack').ok, false, '未擴建的位置不能放');
  assert.equal(E.buyFixture(s, 0, 'rack').ok, false, '已經有設備的位置不能放');
  assert.equal(E.buyFixture(s, 2, 'nothing').ok, false);
  s.cash = 100;
  assert.equal(E.buyFixture(s, 2, 'coffee').ok, false, '錢不夠不能買');
  s.cash = 500000;
  assert.equal(E.buyFixture(s, 2, 'coffee').ok, true);
  assert.equal(s.cash, 500000 - D.FIXTURES.coffee.cost);
  assert.ok(s.target.coffee > 0, '第一台設備會自動設定進貨目標');

  E.setPrice(s, 'tea', 999); assert.equal(s.price.tea, 150);
  E.setPrice(s, 'tea', 1); assert.equal(s.price.tea, 70);
  E.setPrice(s, 'tea', 113); assert.equal(s.price.tea, 115);
  E.setTarget(s, 'tea', 99999); assert.equal(s.target.tea, E.cap(s, 'tea'));
  E.setTarget(s, 'tea', -5); assert.equal(s.target.tea, 0);
  E.setTarget(s, 'bento', 50); assert.equal(s.target.bento, 0, '沒有設備就不能進貨');

  s.cands = [1, 2, 3, 4].map((i) => ({ name: '應徵者' + i, bio: '', speed: 50, charm: 0.5, wage: 100 }));
  assert.equal(E.hire(s, 0, 1).ok, true);
  assert.equal(E.hire(s, 0, 1).ok, false, '同一班最多 ' + E.MAX_PER_SHIFT + ' 位店員');
  assert.equal(E.hire(s, 0, 2).ok, true);
  const id = s.staff[s.staff.length - 1].id;
  assert.equal(E.setShift(s, id, 1).ok, false);
  assert.equal(E.setShift(s, id, 0).ok, true);
  assert.equal(E.fireStaff(s, id).ok, true);
  assert.equal(E.fireStaff(s, id).ok, false);

  const cash = s.cash;
  assert.equal(E.sellFixture(s, 0).ok, true);
  assert.equal(s.cash, cash + D.FIXTURES.shelf.cost / 2);
  D.PRODUCTS.filter((p) => p.fx === 'shelf').forEach((p) => { assert.equal(s.stock[p.id], 0); assert.equal(s.target[p.id], 0); });

  assert.equal(E.applySuggestions(s).ok, false, '沒有 POS 不能套用建議');
  assert.equal(E.buyUpgrade(s, 'pos').ok, true);
  assert.equal(E.buyUpgrade(s, 'pos').ok, false);
  assert.equal(E.runAd(s, 'flyer').ok, true);
  assert.equal(E.runAd(s, 'flyer').ok, false, '同一種廣告不能重複下');
  const lv = s.level;
  assert.equal(E.expand(s).ok, true);
  assert.equal(s.level, lv + 1);
  assert.ok(E.unlockedSlots(s).length > D.LEVELS[lv].slots);
});

test('搬設備：搬到空位或互換，不花錢，庫存、容量、進貨設定都不變', () => {
  const s = fresh();
  s.cash = 500000;
  E.buyFixture(s, 2, 'coffee');
  const snap = () => JSON.stringify([s.cash, s.stock, s.target, s.price, D.PRODUCTS.map((p) => E.cap(s, p.id))]);
  const before = snap();
  assert.equal(E.moveFixture(s, 3, 5).ok, false, '空位沒有東西可以搬');
  assert.equal(E.moveFixture(s, 0, 0).ok, false, '搬到原地不算');
  assert.equal(E.moveFixture(s, 0, 4).ok, false, '不能搬到還沒擴建的位置');
  assert.equal(E.moveFixture(s, 0, 99).ok, false);
  assert.deepEqual(s.slots.slice(0, 3), ['shelf', 'fridge', 'coffee']);

  assert.equal(E.moveFixture(s, 0, 6).ok, true);           // 搬到空位
  assert.equal(s.slots[0], null);
  assert.equal(s.slots[6], 'shelf');
  const sw = E.moveFixture(s, 1, 2);                         // 互換
  assert.equal(sw.ok, true);
  assert.match(sw.msg, /換了位置/);
  assert.deepEqual([s.slots[1], s.slots[2]], ['coffee', 'fridge']);
  assert.equal(snap(), before, '搬來搬去之後，錢、庫存、容量、進貨設定都跟原本一樣');
  assert.equal(E.fixtureCount(s, 'shelf'), 1);
  assert.equal(E.buyFixture(s, 0, 'rack').ok, true, '搬走之後空出來的位置可以放新設備');
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  // 在同一區裡面搬（黃金狀態沒變），營業結果完全一樣
  const a = fresh('kh2', 31), b = fresh('kh2', 31);
  E.moveFixture(b, 0, 2); E.moveFixture(b, 1, 3);
  const ra = runDay(a).report, rb = runDay(b).report;
  assert.deepEqual([ra.rev, ra.profit, ra.customers], [rb.rev, rb.profit, rb.customers]);
});

test('黃金陳列：分區資料完整，每格屬於一區、每種設備有一個最適合的區', () => {
  const seen = {};
  D.ZONE_ORDER.forEach((z) => D.ZONES[z].slots.forEach((i) => { assert.equal(seen[i], undefined, '格子 ' + i + ' 重複'); seen[i] = z; }));
  assert.deepEqual(Object.keys(seen).map(Number).sort((x, y) => x - y), [...Array(12).keys()]);
  D.FIXTURE_ORDER.forEach((f) => {
    assert.equal(D.ZONE_ORDER.filter((z) => D.ZONES[z].fits.includes(f)).length, 1, f + ' 要剛好屬於一區');
    assert.ok(D.ZONES[E.homeZone(f)].slots.length > 0);
  });
  // 小型店（一開始的六格）每一區都至少有一格，不用擴建就玩得到
  const small = D.SLOT_ORDER.slice(0, D.LEVELS[0].slots);
  D.ZONE_ORDER.forEach((z) => assert.ok(small.some((i) => E.zoneOf(i) === z), '小型店沒有' + D.ZONES[z].name));
});

test('黃金陳列：擺對區域才算，同種設備只擺對一半就是一半', () => {
  const s = fresh();
  s.cash = 9e5;
  assert.equal(E.isGold(s, 1), true, '開局的冷藏櫃靠牆，是黃金位置');
  assert.equal(E.isGold(s, 0), false, '開局的貨架靠牆，不是');
  assert.equal(E.isGold(s, 6), false, '空位不算');
  assert.equal(E.goldShare(s, 'shelf'), 0);
  E.moveFixture(s, 0, 6);
  assert.equal(E.isGold(s, 6), true, '貨架搬到中島');
  assert.equal(E.goldShare(s, 'shelf'), 1);
  E.buyFixture(s, 0, 'shelf');
  assert.equal(E.goldShare(s, 'shelf'), 0.5);
  assert.equal(E.goldShare(s, 'coffee'), 0, '沒有這種設備');
  E.buyFixture(s, 5, 'hot');
  assert.equal(E.isGold(s, 5), true, '熱食台在櫃台旁');
});

test('黃金陳列：擺對了那台設備的商品多賣一成多，其他商品不受影響', () => {
  const run = (gold) => {
    let shelf = 0, fridge = 0, bonus = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = fresh('kh2', seed);
      if (gold) E.moveFixture(s, 0, 6);
      D.PRODUCTS.forEach((p) => { if (E.cap(s, p.id)) { s.stock[p.id] = 150; s.target[p.id] = 150; } });  // 貨給足，才看得出需求的差別
      for (let d = 0; d < 3; d++) {
        const r = runDay(s).report;
        D.PRODUCTS.forEach((p) => { const x = r.perProd[p.id]; if (!x) return; if (p.fx === 'shelf') shelf += x.sold; if (p.fx === 'fridge') fridge += x.sold; });
        bonus += r.goldUnits;
      }
    }
    return { shelf, fridge, bonus };
  };
  const off = run(false), on = run(true);
  const lift = on.shelf / off.shelf;
  assert.ok(lift > 1.08 && lift < 1.22, '貨架商品應多賣約 15%（實際 ' + ((lift - 1) * 100).toFixed(1) + '%）');
  assert.ok(Math.abs(on.fridge / off.fridge - 1) < 0.05, '冷藏櫃本來就擺對，銷量不該因為貨架搬家而大變');
  assert.ok(on.bonus > off.bonus, '日結會記下多賣的件數');
});

test('即期品折扣：設定的檢查、哪些商品適用、什麼時候生效', () => {
  const s = fresh();
  assert.deepEqual(E.mdOf(s), { at: 20, pct: 0 }, '預設不打折');
  assert.equal(E.setMarkdown(s, 19, 20).ok, false);
  assert.equal(E.setMarkdown(s, 20, 25).ok, false);
  assert.equal(E.setMarkdown(s, 20, 20).ok, true);
  assert.match(E.setMarkdown(s, 20, 20).msg, /8 折/);
  assert.match(E.setMarkdown(s, 22, 50).msg, /學會等/);
  E.setMarkdown(s, 20, 20);
  assert.deepEqual(D.PRODUCTS.filter((p) => E.mdApplies(p.id)).map((p) => p.id).sort(), ['bento', 'egg', 'hotdog', 'oden', 'onigiri', 'sandwich'], '只有鮮食櫃與熱食台的商品；報紙不算');
  assert.equal(E.mdActive(s, 13), false, '19:00 還沒開始');
  assert.equal(E.mdActive(s, 14), true, '20:00 開始');
  assert.equal(E.mdActive(s, 23), true, '一直到清晨');
  assert.equal(E.salePrice(s, 'bento', 13), 55);
  assert.equal(E.salePrice(s, 'bento', 14), 44);
  assert.equal(E.salePrice(s, 'tea', 14), E.unitPrice(s, 'tea'), '不是即期品就不打折');
  E.setPrice(s, 'bento', 120);
  assert.equal(E.salePrice(s, 'bento', 14), Math.round(66 * 0.8), '在玩家訂的售價上再打折');
  E.setMarkdown(s, 20, 0);
  assert.equal(E.mdActive(s, 20), false);
});

test('即期品折扣：晚上打折，報廢變少、整天比較賺；打折賣出的件數與金額會記下來', () => {
  const run = (pct) => {
    let waste = 0, profit = 0, mdUnits = 0, mdRev = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = fresh('tc1', seed);   // 夜市商圈：晚上人多
      s.cash = 9e5;
      E.buyFixture(s, 2, 'fresh'); E.buyFixture(s, 5, 'hot');
      E.hire(s, 0, 2);
      D.PRODUCTS.forEach((p) => { if (E.mdApplies(p.id)) { E.setTarget(s, p.id, 150); s.stock[p.id] = 150; } });   // 故意叫太多
      E.setMarkdown(s, 20, pct);
      for (let d = 0; d < 4; d++) { const r = runDay(s).report; waste += r.waste; profit += r.profit; mdUnits += r.mdUnits; mdRev += r.mdRev; }
    }
    return { waste, profit, mdUnits, mdRev };
  };
  const none = run(0), light = run(20);
  assert.equal(none.mdUnits, 0);
  assert.ok(light.mdUnits > 0 && light.mdRev > 0);
  assert.ok(light.waste < none.waste * 0.97, '報廢應該變少（' + none.waste + ' → ' + light.waste + '）');
  assert.ok(light.profit > none.profit, '貨叫太多的時候，8 折賣掉比丟掉賺（' + none.profit + ' → ' + light.profit + '）');
});

test('即期品折扣：折太兇客人會學會等，白天少賣；改回 8 折以內會慢慢恢復', () => {
  const s = fresh('kh1', 3);
  s.cash = 9e5;
  E.buyFixture(s, 2, 'fresh');
  E.setTarget(s, 'bento', 150); s.stock.bento = 150;
  E.setMarkdown(s, 22, 20);
  for (let d = 0; d < 6; d++) runDay(s);
  assert.equal(s.mdHabit, 0, '8 折不會養成習慣');
  E.setMarkdown(s, 22, 50);
  const seen = [];
  let waited = 0;
  for (let d = 0; d < 12; d++) { waited += runDay(s).report.waited; seen.push(s.mdHabit); }
  assert.ok(seen.every((h, i) => i === 0 || h >= seen[i - 1]), '習慣一天比一天深');
  assert.ok(seen[0] > 0 && seen[0] < 0.1, '第一天只有一點點（' + seen[0] + '）');
  assert.ok(seen[11] > 0.27 && seen[11] <= 0.3, '5 折天天折，最後白天約三成的人在等（' + seen[11] + '）');
  assert.ok(waited > 0, '日結會記下有多少件是「等晚上」沒買的');
  E.setMarkdown(s, 22, 20);
  for (let d = 0; d < 25; d++) runDay(s);
  assert.equal(s.mdHabit, 0, '改回 8 折，三週多之後習慣完全消失');
  // 每日建議會提醒
  E.setMarkdown(s, 22, 50);
  let tip = '';
  for (let d = 0; d < 6; d++) tip = runDay(s).report.tips.join('｜');
  assert.match(tip, /學會等晚上的折扣/);
});

test('舊存檔（沒有即期品與陳列的欄位）可以直接繼續玩', () => {
  const s = fresh('kh3', 8);
  delete s.md; delete s.mdHabit;
  ['goldUnits', 'mdUnits', 'mdRev', 'waited'].forEach((k) => delete s.today[k]);
  const r = runDay(s).report;
  assert.ok(r.rev > 0);
  assert.ok(Number.isFinite(s.cash) && Number.isFinite(s.mdHabit));
  assert.equal(E.setMarkdown(s, 18, 30).ok, true);
  runDay(s);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
});

test('每日建議：設備沒擺對、而且適合的區有空位時會提醒；報廢多又沒打折也會提醒', () => {
  const s = fresh('kh2', 5);
  s.cash = 9e5;
  E.hire(s, 0, 2);
  D.PRODUCTS.forEach((p) => { if (E.cap(s, p.id)) { E.setTarget(s, p.id, 150); s.stock[p.id] = 150; } });   // 不缺貨，建議才輪得到陳列
  let tips = runDay(s).report.tips.join('｜');
  assert.match(tips, /貨架現在擺在靠牆，它比較適合「中島」/);
  E.moveFixture(s, 0, 6);
  tips = runDay(s).report.tips.join('｜');
  assert.doesNotMatch(tips, /比較適合/);
  // 鮮食叫太多又賣不掉（這裡用整天沒人顧店來製造報廢）：報廢的建議會順便提到即期品折扣；已經開了就不再提
  const waste = (pct) => {
    const w = fresh('kh2', 5);
    w.cash = 9e5;
    E.buyFixture(w, 2, 'fresh');
    D.PRODUCTS.forEach((p) => { if (p.fx === 'fresh') { E.setTarget(w, p.id, 150); w.stock[p.id] = 150; } });
    E.setOwnerShift(w, -1); w.staff = [];
    E.setMarkdown(w, 20, pct);
    return runDay(w).report.tips.join('｜');
  };
  assert.match(waste(0), /報廢了 150 個.*即期品折扣/);
  assert.match(waste(20), /報廢了 150 個/);
  assert.doesNotMatch(waste(20), /即期品折扣/);
});

test('緊急補貨：補到目標量，並多收運費', () => {
  const s = fresh();
  s.stock.tea = 10;
  const cost = E.rushCost(s, 'tea');
  assert.equal(cost, Math.round((s.target.tea - 10) * D.PRODUCTS.find((p) => p.id === 'tea').cost * 1.3));
  const cash = s.cash;
  assert.equal(E.rushOrder(s, 'tea').ok, true);
  assert.equal(s.stock.tea, s.target.tea);
  assert.equal(s.cash, cash - cost);
  assert.equal(E.rushOrder(s, 'tea').ok, false, '已經補滿就不用再補');
});

test('賣貴了客人會嫌貴、賣得少；賣便宜吸客力較高', () => {
  const sold = (pct) => {
    let n = 0, pricey = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = fresh('tc2', seed); // 學區，對價格最敏感
      D.PRODUCTS.forEach((p) => E.setPrice(s, p.id, pct));
      const r = runDay(s).report;
      Object.values(r.perProd).forEach((x) => { n += x.sold; pricey += x.pricey; });
    }
    return { n, pricey };
  };
  const cheap = sold(100), dear = sold(140);
  assert.ok(dear.n < cheap.n * 0.8, '漲四成後銷量應明顯下滑（' + cheap.n + ' → ' + dear.n + '）');
  assert.ok(dear.pricey > cheap.pricey);
  const a = fresh(), b = fresh();
  D.PRODUCTS.forEach((p) => { E.setPrice(a, p.id, 80); E.setPrice(b, p.id, 130); });
  assert.ok(E.attract(a) > E.attract(b));
});

test('每一種事件、每一個選項都能正常結算', () => {
  E.EVENT_IDS.forEach((id) => {
    for (let choice = 0; choice < 3; choice++) {
      const s = fresh('kh1', 100 + choice);
      s.cash = 400000;
      E.buyFixture(s, 2, 'fresh'); E.buyFixture(s, 3, 'hot');
      for (let d = 0; d < 6; d++) runDay(s);
      s.rep = 70;
      s.pending = null; s.scripted = []; s.todayEvent = null;
      s.scripted.push({ id: id, ctx: { name: s.rivals[0] ? s.rivals[0].name : '測試對手', id: s.staff[0].id, pid: 'tea' } });
      const r = E.tickHour(s);
      assert.ok(r.event && r.event.title && r.event.text && r.event.choices.length >= 1, id + ' 產生事件視窗');
      assert.equal(E.tickHour(s).blocked, true, '事件沒處理前時間不會前進');
      const text = E.resolveEvent(s, choice);
      assert.equal(typeof text, 'string');
      assert.equal(s.pending, null);
      assert.ok(Number.isFinite(s.cash) && Number.isFinite(s.rep), id + ' 結算後數值正常');
      assert.deepEqual(clone(s), s, id + ' 結算後狀態仍可存檔');
      runDay(s); runDay(s);
    }
  });
});

test('第 30 天結算會頒獎牌，之後可以繼續經營', () => {
  const s = fresh('kh2', 4);
  let last;
  for (let d = 0; d < 30; d++) last = runDay(s).report;
  assert.equal(last.day, 30);
  assert.ok(last.goal && s.medal, '第 30 天有成績');
  const goals = D.CITIES.kaohsiung.goals;
  const tier = goals.filter((g) => last.worth >= g).length;
  assert.equal(s.medal.tier, tier);
  const r31 = runDay(s).report;
  assert.equal(r31.day, 31);
  assert.equal(r31.goal, null, '獎牌只頒一次');
});

test('透支超過額度就倒閉，時間不再前進', () => {
  const s = fresh();
  s.cash = E.OVERDRAFT - 50000;
  runDay(s);
  assert.equal(s.over, 'bankrupt');
  assert.equal(E.tickHour(s).blocked, true);
});

test('擊敗對手：吸客力長期遠勝，對手會收攤', () => {
  const s = fresh('kh1', 2);
  s.rep = 100; s.cash = 5e6;
  s.rivals[0].str = 20;
  ['sign', 'seats', 'service'].forEach((u) => E.buyUpgrade(s, u));
  let closed = null;
  for (let d = 0; d < 10 && !closed; d++) { s.rivals.forEach((r) => { r.str = 20; }); closed = runDay(s).report.rivalClosed; s.rep = 100; }
  assert.ok(closed, '連續七天壓制後對手應該收攤');
  assert.equal(s.rivals.length, 0);
});
