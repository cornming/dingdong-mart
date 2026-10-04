/* 排行榜後端（backend/Code.gs）的測試：在 Node 裡用假的 Google 服務執行同一份程式。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../scripts/gas-mock.js');
const C = require('../src/chain.js');

const score = (o) => Object.assign({ action: 'score', name: '叮咚便利店', loc: '新堀江商圈', days: 140, rev: 6200000, stores: 1, worth: 3300000, v: '0.4.0', cid: 'a' }, o);
const later = (g, sec) => { g.clock.now += (sec || 30) * 1000; };

test('Code.gs 不含區塊註解（手機貼進 Apps Script 編輯器時，編輯器會自動補結尾而造成語法錯誤）', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'backend', 'Code.gs'), 'utf8');
  assert.equal(src.indexOf('/*'), -1, '不可以出現區塊註解的開頭');
  assert.equal(src.indexOf('*/'), -1, '不可以出現區塊註解的結尾');
  assert.ok(!/`/.test(src), '也不用樣板字串，避免同類的自動補字問題');
});

test('空的排行榜；第一次讀取會自動建立分頁與標題列', () => {
  const g = load();
  const b = g.get();
  assert.deepEqual(b, { ok: true, top: [], count: 0, comments: [] });
  assert.equal(g.sheets.scores.rows.length, 1);
  assert.equal(g.sheets.comments.rows[0][5], '隱藏');
});

test('送成績：依天數排序（越少越前面），同天數比營收；只回前十名', () => {
  const g = load();
  for (let i = 0; i < 12; i++) {
    const r = g.post(score({ name: '店' + i, days: 200 - i * 5, cid: 'c' + i }));
    assert.equal(r.ok, true, r.msg);
    assert.equal(r.rank, 1, '每一筆都比前一筆快');
    later(g, 5);
  }
  g.post(score({ name: '同天數高營收', days: 145, rev: 9000000, cid: 'x' }));
  const b = g.get();
  assert.equal(b.count, 13);
  assert.equal(b.top.length, 10);
  assert.deepEqual(b.top.slice(0, 3).map((x) => x.name), ['同天數高營收', '店11', '店10']);
  assert.ok(b.top.every((x, i) => i === 0 || b.top[i - 1].days <= x.days));
  assert.equal(Object.keys(b.top[0]).sort().join(), 'at,days,loc,name,rev,stores', '不會把裝置代碼等欄位傳給其他玩家');
});

test('擋掉不合理的成績', () => {
  const g = load();
  [[{ days: 5 }, '天數'], [{ days: 99999 }, '天數'], [{ days: 'abc' }, '天數'], [{ stores: 9 }, '店數'], [{ worth: 100 }, '門檻'],
    [{ rev: 10 }, '營收'], [{ days: 50, rev: 50 * 400000 + 1 }, '營收'], [{ name: '   ' }, '店名']].forEach(([o, word]) => {
    const r = g.post(score(o));
    assert.equal(r.ok, false);
    assert.match(r.msg, new RegExp(word));
  });
  assert.equal(g.get().count, 0);
  assert.equal(g.post('這不是 JSON').ok, false);
  assert.equal(g.post({ action: 'drop table' }).ok, false);
  assert.equal(score({}).worth >= C.GOAL && g.sandbox.CONFIG.GOAL === C.GOAL, true, '後端的退休門檻與遊戲一致');
});

test('重複送同一筆成績只會記一次，而且仍然回報名次', () => {
  const g = load();
  assert.equal(g.post(score({})).rank, 1);
  const again = g.post(score({}));
  assert.equal(again.ok, true);
  assert.equal(again.rank, 1);
  assert.equal(again.count, 1);
});

test('節流：同一台裝置要等冷卻時間；全站每分鐘有上限', () => {
  const g = load();
  assert.equal(g.post(score({ name: 'A' })).ok, true);
  const fast = g.post(score({ name: 'B', days: 150 }));
  assert.equal(fast.ok, false);
  assert.match(fast.msg, /太頻繁/);
  later(g, 21);
  assert.equal(g.post(score({ name: 'B', days: 150 })).ok, true);
  const h = load();
  let okN = 0;
  for (let i = 0; i < 40; i++) if (h.post({ action: 'comment', name: '路人' + i, text: '第 ' + i + ' 則', cid: 'd' + i }).ok) okN++;
  assert.equal(okN, 30, '同一分鐘內只收 30 筆');
});

test('留言：新的在前、最多 30 則、可以在試算表裡隱藏', () => {
  const g = load();
  for (let i = 0; i < 33; i++) { assert.equal(g.post({ action: 'comment', name: '店' + i, text: '留言 ' + i, cid: 'k' + i }).ok, true); later(g, 61); }
  let b = g.get();
  assert.equal(b.comments.length, 30);
  assert.equal(b.comments[0].text, '留言 32');
  assert.ok(b.comments[0].at > b.comments[1].at);
  g.sheets.comments.rows[33][5] = 1; // 站長在「隱藏」欄填了 1
  b = g.get();
  assert.equal(b.comments[0].text, '留言 31');
  assert.equal(Object.keys(b.comments[0]).sort().join(), 'at,name,text');
});

test('留言的清理：去控制字元、裁長度、擋網址、空白不收', () => {
  const g = load();
  const p = (o) => { later(g, 61); return g.post(Object.assign({ action: 'comment', name: '阿明', cid: 'z' }, o)); };
  assert.equal(p({ text: '' }).ok, false);
  assert.equal(p({ text: '  \n\t ' }).ok, false);
  assert.equal(p({ text: '快來 http://spam.example 看看' }).ok, false);
  assert.equal(p({ text: 'www.spam.example' }).ok, false);
  assert.equal(p({ name: '', text: '嗨' }).ok, false);
  const r = p({ name: '很長很長很長很長很長的店名', text: '第一行\n第二行\u202e反轉' + '啊'.repeat(300) });
  assert.equal(r.ok, true);
  assert.equal(r.comments[0].name.length, 10);
  assert.equal(r.comments[0].text.length, 140);
  assert.ok(!/[\n\u202e]/.test(r.comments[0].text));
});

test('玩家的文字不會被試算表當成公式', () => {
  const g = load();
  g.post({ action: 'comment', name: '=HYPERLINK("x")', text: '+SUM(A1:A9)', cid: 'q' });
  later(g, 61);
  g.post(score({ name: '@店', loc: '-1+1', cid: 'q2' }));
  const mine = g.written.filter((w) => w.row[0] instanceof Date);
  assert.equal(mine.length, 2);
  mine.forEach((w) => [w.row[1], w.row[2]].forEach((v) => assert.equal(v[0], "'", v + ' 要以純文字寫入')));
  const b = g.get();
  assert.equal(b.comments[0].name, '=HYPERLINK', '讀出來的還是原本的字（裁到 10 個字）');
  assert.equal(b.top[0].name, '@店');
});

test('試算表裡被人手動改壞的列不會讓整個排行榜壞掉', () => {
  const g = load();
  g.post(score({}));
  g.sheets.scores.rawAppend(['亂寫', '', '', 'x', 'y']);
  g.sheets.scores.rawAppend([new Date(), '手動加的', '', 100, 5000000, 1, 3000000, '', '']);
  const b = g.get();
  assert.equal(b.ok, true);
  assert.deepEqual(b.top.map((x) => x.name), ['手動加的', '叮咚便利店']);
});
