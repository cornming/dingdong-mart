/* 版號與更新紀錄腳本的測試 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../scripts/release.js');

test('依 commit 類型決定版號', () => {
  const c = (s, body) => ({ subject: s, body: body || '' });
  assert.equal(R.analyze([c('docs: 改 README'), c('chore: 整理'), c('隨便寫的訊息')], '0.3.1'), null, '沒有玩家看得到的變更就不發佈');
  assert.equal(R.analyze([c('fix: 修正排班')], '0.3.1').version, '0.3.2');
  assert.equal(R.analyze([c('balance: 調低租金'), c('perf: 加快繪圖')], '0.3.1').version, '0.3.2');
  assert.equal(R.analyze([c('fix: a'), c('feat(ui): b')], '0.3.1').version, '0.4.0');
  assert.equal(R.analyze([c('feat!: 存檔格式改版')], '0.3.1').version, '0.4.0', '1.0 之前破壞性變更只升次版號');
  assert.equal(R.analyze([c('feat!: 存檔格式改版')], '1.3.1').version, '2.0.0');
  assert.equal(R.analyze([c('fix: a', 'BREAKING CHANGE: 舊存檔失效')], '1.3.1').version, '2.0.0');
  const multi = R.analyze([c('feat: 開分店', '說明文字\nfeat: 名人堂\nbalance: 拿掉八倍速\n不是條目的句子：不會被列入')], '0.2.0');
  assert.equal(multi.version, '0.3.0');
  assert.match(multi.body, /### 新功能\n\n- 開分店\n- 名人堂\n\n### 數值調整\n\n- 拿掉八倍速$/, '內文裡每一行 feat:／fix: 都各自成為一條');
  assert.equal(R.analyze([c('docs: 文件', 'fix: 順手修了排版')], '0.2.0').version, '0.2.1');
  const body = R.analyze([c('feat: 新增店貓'), c('fix: 修正溢出'), c('feat: 新增冰沙機')], '0.1.0').body;
  assert.match(body, /### 新功能\n\n- 新增店貓\n- 新增冰沙機\n\n### 修正\n\n- 修正溢出/);
});

test('CHANGELOG.md 可以解析，且與 package.json、version.js 一致', () => {
  const root = path.join(__dirname, '..');
  const log = R.parseChangelog(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(log.length >= 1);
  assert.equal(log[0].version, pkg.version, 'CHANGELOG 最上面一筆就是目前版本');
  log.forEach((c) => { assert.match(c.date, /^\d{4}-\d{2}-\d{2}$/); assert.ok(c.notes.length > 0, 'v' + c.version + ' 有說明'); });
  const sandbox = {};
  new Function('globalThis', fs.readFileSync(path.join(root, 'src', 'version.js'), 'utf8'))(sandbox);
  assert.equal(sandbox.DD_VERSION.version, pkg.version, '遊戲內顯示的版本與 package.json 相同（不同的話執行 npm run release -- --sync）');
  assert.deepEqual(sandbox.DD_VERSION.changelog[0].notes, log[0].notes);
});
