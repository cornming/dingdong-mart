/* 連鎖經營的測試：共用錢包、時間同步、開分店、里程碑、讀舊存檔 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const C = require('../src/chain.js');
const clone = (o) => JSON.parse(JSON.stringify(o));

function runDay(ch, choose) {
  for (let guard = 0; guard < 400; guard++) {
    const out = C.tick(ch);
    if (out.res.event) { E.resolveEvent(C.cur(ch), choose || 0); C.sync(ch); continue; }
    if (out.res.blocked || out.res.dayEnded) return out;
  }
  throw new Error('一天跑不完');
}
function rich(locId, seed) {
  const ch = C.create(E.newGame({ locId: locId || 'kh1', seed: seed || 5, name: '總店' }));
  C.cur(ch).cash = 3200000;
  return ch;
}

test('只有一家店時，連鎖的結果和單店引擎完全一樣', () => {
  const a = E.newGame({ locId: 'tc1', seed: 9 });
  const ch = C.create(E.newGame({ locId: 'tc1', seed: 9 }));
  for (let d = 0; d < 6; d++) {
    for (let g = 0; g < 400; g++) { const r = E.tickHour(a); if (r.event) { E.resolveEvent(a, 0); continue; } if (r.dayEnded) break; }
    runDay(ch);
  }
  assert.deepEqual(ch.stores[0], a);
  assert.ok(ch.totalRev >= a.history.reduce((x, h) => x + h.rev, 0), '累計營收至少是每天營業收入的總和（另含手續費收入）');
});

test('現金沒到目標不能開分店，到了才會出現里程碑', () => {
  const ch = C.create(E.newGame({ locId: 'kh1', seed: 5 }));
  assert.equal(C.canBranch(ch, 'kh2').ok, false);
  assert.equal(C.retire(ch).ok, false);
  assert.equal(runDay(ch).milestone, false);
  C.cur(ch).cash = C.GOAL + 500000;
  const out = runDay(ch);
  assert.equal(out.milestone, true, '日結時現金達標，出現里程碑');
  assert.equal(ch.unlocked, true);
  assert.equal(runDay(ch).milestone, false, '同一次達標只問一次');
});

test('開分店：扣頂讓金、共用錢包、時間同步、分店沒有店長站櫃台', () => {
  const ch = rich();
  runDay(ch);
  const a = C.cur(ch);
  for (let i = 0; i < 5; i++) { const o = C.tick(ch); if (o.res.event) { E.resolveEvent(a, 0); C.sync(ch); } }
  const before = C.wallet(ch);
  assert.equal(C.openBranch(ch, 'kh1', '重複').ok, false, '同一個店面不能開兩次');
  const res = C.openBranch(ch, 'tp1', '西門店', 77);
  assert.equal(res.ok, true);
  const b = ch.stores[1];
  assert.equal(C.wallet(ch), before - C.BRANCH_COST.taipei);
  assert.equal(b.cash, a.cash, '兩家店看到的是同一個錢包');
  assert.equal(b.day, a.day); assert.equal(b.t, a.t);
  assert.equal(b.owner.shift, -1);
  assert.ok(E.crewOn(b, 0).length >= 1 && E.crewOn(b, 1).length >= 1, '分店的早班和晚班開幕時就有人');
  assert.deepEqual(clone(ch), ch, '連鎖狀態可以存檔');
  for (let d = 0; d < 35; d++) {
    const out = runDay(ch);
    if (out.res.blocked) break;
    assert.equal(a.day, b.day); assert.equal(a.t, b.t);
    assert.equal(a.cash, b.cash);
    assert.equal(out.bg.length, 1);
    assert.equal(out.bg[0].res.report.goal, null, '分店不會拿到 30 天獎牌');
  }
  assert.ok(b.history.length >= 30 && b.history.some((h) => h.rev > 0), '沒在看的分店也照常營業');
  assert.ok(ch.totalRev > a.history.reduce((x, h) => x + h.rev, 0), '累計營收包含分店');
});

test('現金流對得起來：錢包的變化＝各店收入－各店支出', () => {
  const ch = rich('kh2', 11);
  runDay(ch);
  C.openBranch(ch, 'tc4', '大里店', 3);
  C.openBranch(ch, 'kh3', '鹽埕店', 4);
  for (let d = 0; d < 12; d++) {
    const before = C.wallet(ch);
    const out = runDay(ch);
    const reports = [out.res.report].concat(out.bg.map((b) => b.res.report));
    let delta = 0;
    reports.forEach((r) => { delta += r.rev + r.service - r.wages - r.rent - r.power - r.ads - r.other - r.orderCost; });
    assert.ok(Math.abs(C.wallet(ch) - (before + delta)) < 0.01, '第 ' + out.res.report.day + ' 天差 ' + (C.wallet(ch) - before - delta));
  }
});

test('切換經營的店不會改變結果', () => {
  const mk = () => { const ch = rich('kh1', 21); runDay(ch); C.openBranch(ch, 'kh4', '西子灣店', 8); return ch; };
  const a = mk(), b = mk();
  for (let d = 0; d < 5; d++) {
    runDay(a);
    C.switchTo(b, d % 2);
    runDay(b);
  }
  C.switchTo(b, 0);
  assert.equal(C.wallet(a), C.wallet(b));
  const core = (ch) => ch.stores.map((s) => s.history.map((h) => [h.day, h.rev, h.profit, h.customers]));
  assert.deepEqual(core(a), core(b));
});

test('最多四家店；退休要現金達標，並留下成績', () => {
  const ch = rich();
  ch.unlocked = true;
  C.cur(ch).cash = 9e6; C.sync(ch);
  ['kh2', 'kh3', 'kh4'].forEach((id) => assert.equal(C.openBranch(ch, id, id).ok, true));
  assert.equal(C.openBranch(ch, 'tc1', 'x').ok, false);
  assert.equal(C.wallet(ch), 9e6 - 3 * C.BRANCH_COST.kaohsiung);
  const res = C.retire(ch);
  assert.equal(res.ok, true);
  assert.equal(res.result.stores, 4);
  assert.equal(ch.retired.cash, C.wallet(ch));
  assert.equal(C.netWorth(ch), ch.stores.reduce((x, s) => x + E.netWorth(s) - s.cash, 0) + C.wallet(ch));
});

test('透支超過額度，整個連鎖一起倒閉', () => {
  const ch = rich();
  runDay(ch);
  C.openBranch(ch, 'kh2', '二店', 2);
  C.cur(ch).cash = E.OVERDRAFT - 80000; C.sync(ch);
  runDay(ch);
  assert.equal(C.over(ch), true);
  assert.ok(ch.stores.every((s) => s.over === 'bankrupt'));
});

test('讀檔：新版、舊版單店存檔都能讀，壞掉的回傳 null', () => {
  const s = E.newGame({ locId: 'kh1', seed: 1 });
  s.history.push({ day: 1, rev: 1234, profit: 1 });
  const old = C.fromSave({ state: clone(s), speed: 1 });
  assert.equal(old.stores.length, 1);
  assert.equal(old.totalRev, 1234, '舊存檔的累計營收從歷史紀錄補回來');
  const ch = rich();
  ch.active = 7;
  const back = C.fromSave({ chain: clone(ch) });
  assert.equal(back.active, 0);
  assert.equal(C.fromSave(null), null);
  assert.equal(C.fromSave({ chain: { v: 2, stores: [] } }), null);
  assert.equal(C.fromSave({ chain: { v: 2, stores: [{ v: 1, locId: 'nowhere' }] } }), null);
});
