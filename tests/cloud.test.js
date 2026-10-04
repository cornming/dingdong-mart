/* 排行榜連線（src/config.js、src/cloud.js）的測試：用假的 fetch 檢查它送出去的請求長什麼樣子。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');

function boot(config, respond) {
  const calls = [];
  const store = {};
  const sb = {
    setTimeout, clearTimeout, Promise, JSON, Math, Date, String,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    AbortController,
    fetch: (url, opt) => { calls.push({ url, opt }); return respond ? respond(url, opt) : Promise.resolve({ json: () => Promise.resolve({ ok: true, top: [], count: 0, comments: [] }) }); },
  };
  sb.globalThis = sb;
  if (config !== undefined) sb.DD_CONFIG = config;
  vm.createContext(sb);
  if (config === undefined) vm.runInContext(read('config.js'), sb);
  vm.runInContext(read('cloud.js'), sb);
  return { cloud: sb.DD_CLOUD, calls, config: sb.DD_CONFIG };
}

test('設定檔裡的後端網址是空的，或是合法的 Apps Script 網址', () => {
  const { config, cloud } = boot();
  assert.ok(config.api === '' || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(config.api), config.api);
  assert.equal(cloud.enabled, config.api !== '', '網址合法時連線功能要是開的');
});

test('讀排行榜用 GET；寫入用 text/plain 的 POST（Apps Script 不處理預檢請求）', async () => {
  const api = 'https://script.google.com/macros/s/ABC-def_123/exec';
  const { cloud, calls } = boot({ api });
  assert.equal((await cloud.board()).ok, true);
  assert.equal(calls[0].url, api);
  assert.equal(calls[0].opt.method, 'GET');
  await cloud.postComment('路人', '嗨', '9.9.9');
  await cloud.submitScore({ name: '店', loc: '西門町', days: 150, rev: 6000000, stores: 2, worth: 3100000 }, '9.9.9');
  [calls[1], calls[2]].forEach((c) => {
    assert.equal(c.opt.method, 'POST');
    assert.equal(c.opt.headers['Content-Type'], 'text/plain;charset=utf-8');
    assert.equal(Object.keys(c.opt.headers).length, 1, '多加任何自訂標頭都會觸發預檢而失敗');
  });
  const c = JSON.parse(calls[1].opt.body), s = JSON.parse(calls[2].opt.body);
  assert.deepEqual([c.action, c.name, c.text, c.v], ['comment', '路人', '嗨', '9.9.9']);
  assert.deepEqual([s.action, s.name, s.loc, s.days, s.rev, s.stores, s.worth], ['score', '店', '西門町', 150, 6000000, 2, 3100000]);
  assert.ok(c.cid && c.cid === s.cid, '同一台裝置用同一個代碼');
});

test('網址不是 Apps Script 就不連線；連線失敗或回應怪怪的都不會丟例外', async () => {
  for (const bad of ['', 'https://evil.example/exec', 'http://script.google.com/macros/s/x/exec', 'https://script.google.com/macros/s/x/exec?x=1', 'javascript:alert(1)']) {
    const { cloud, calls } = boot({ api: bad });
    assert.equal(cloud.enabled, false, bad);
    const r = await cloud.board();
    assert.equal(r.ok, false);
    assert.equal(calls.length, 0, '不該送出任何請求');
  }
  const api = 'https://script.google.com/macros/s/ABC/exec';
  const down = boot({ api }, () => Promise.reject(new Error('offline')));
  assert.deepEqual(Object.keys(await down.cloud.board()).sort(), ['msg', 'ok']);
  const html = boot({ api }, () => Promise.resolve({ json: () => Promise.reject(new Error('不是 JSON')) }));
  assert.equal((await html.cloud.postComment('a', 'b', '1')).ok, false);
  const odd = boot({ api }, () => Promise.resolve({ json: () => Promise.resolve('字串') }));
  assert.equal((await odd.cloud.board()).ok, false);
});
