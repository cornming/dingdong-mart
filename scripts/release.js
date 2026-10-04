/* 版號與更新紀錄：依照 commit 訊息自動決定版號、寫入 CHANGELOG.md，並產生遊戲內「更新紀錄」用的 src/version.js。
 *
 *   node scripts/release.js          依上一個 v* 標籤之後的 commit 升版（沒有需要發佈的變更就什麼都不做）
 *   node scripts/release.js --dry    只顯示會做什麼，不寫檔
 *   node scripts/release.js --sync   不升版，只依 package.json 與 CHANGELOG.md 重新產生 src/version.js
 *
 * commit 訊息格式（Conventional Commits）：
 *   feat: ……      新功能   → 次版號 +1（0.1.0 → 0.2.0）
 *   fix: ……       修正     → 修訂號 +1（0.1.0 → 0.1.1）
 *   balance: ……   數值調整 → 修訂號 +1
 *   perf: ……      效能     → 修訂號 +1
 *   feat!: ……     破壞性變更 → 1.0 之後主版號 +1（1.0 之前視為次版號）
 *   docs/test/chore/ci/refactor/style 不會觸發發佈。
 * 冒號後面的文字會原樣寫進更新紀錄，請寫玩家看得懂的話。
 * 一個 commit 做了好幾件事時，在內文另起一行、同樣用「feat: ……」「fix: ……」開頭，每一行都會各自列進更新紀錄。 */
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..');
const PKG = path.join(ROOT, 'package.json');
const LOG = path.join(ROOT, 'CHANGELOG.md');
const VER = path.join(ROOT, 'src', 'version.js');
const NOTES = path.join(ROOT, 'dist', 'RELEASE_NOTES.md');
const SECTIONS = { feat: '新功能', fix: '修正', balance: '數值調整', perf: '效能' };
const HEADER = '# 更新紀錄\n\n這個檔案由 `scripts/release.js` 依 commit 訊息自動維護，遊戲內的「更新紀錄」也是從這裡產生的。\n';

function git(args) {
  try { return cp.execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch (e) { return ''; }
}

/** 把 CHANGELOG.md 解析成 [{ version, date, notes: [..], body }]，新的在前。 */
function parseChangelog(text) {
  const out = [];
  let cur = null;
  text.split('\n').forEach((line) => {
    const m = /^## \[(\d+\.\d+\.\d+)\](?: - (\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (m) { cur = { version: m[1], date: m[2] || '', notes: [], body: [] }; out.push(cur); return; }
    if (!cur) return;
    cur.body.push(line);
    const n = /^- (.+)$/.exec(line);
    if (n) cur.notes.push(n[1].trim());
  });
  out.forEach((c) => { c.body = c.body.join('\n').trim(); });
  return out;
}

/** 從 commit 清單算出要升哪一級，以及各分類的說明文字。 */
function analyze(commits, current) {
  const groups = {};
  let level = 0; // 0 不發佈、1 修訂、2 次版、3 主版
  commits.forEach((c) => {
    const lines = [c.subject].concat((c.body || '').split('\n').map((x) => x.trim()));
    lines.forEach((line, i) => {
      const m = /^(\w+)(?:\([^)]*\))?(!)?:\s*(.+)$/.exec(line);
      if (!m || !SECTIONS[m[1]]) return;
      const breaking = !!m[2] || (i === 0 && /BREAKING CHANGE/.test(c.body || ''));
      level = Math.max(level, breaking ? 3 : m[1] === 'feat' ? 2 : 1);
      (groups[m[1]] = groups[m[1]] || []).push(m[3].trim());
    });
  });
  if (!level) return null;
  const v = current.split('.').map(Number);
  if (level === 3 && v[0] === 0) level = 2;
  const next = level === 3 ? [v[0] + 1, 0, 0] : level === 2 ? [v[0], v[1] + 1, 0] : [v[0], v[1], v[2] + 1];
  let body = '';
  Object.keys(SECTIONS).forEach((k) => {
    if (groups[k]) body += '### ' + SECTIONS[k] + '\n\n' + groups[k].map((t) => '- ' + t).join('\n') + '\n\n';
  });
  return { version: next.join('.'), body: body.trim() };
}

function writeVersionFile(version, changelog) {
  const data = { version: version, changelog: changelog.slice(0, 10).map((c) => ({ version: c.version, date: c.date, notes: c.notes })) };
  fs.writeFileSync(VER,
    '/* 由 scripts/release.js 自動產生，請勿手動修改。版本與更新紀錄的來源是 package.json 與 CHANGELOG.md。 */\n' +
    '(function (root) {\n  root.DD_VERSION = ' + JSON.stringify(data) + ';\n})(typeof globalThis !== \'undefined\' ? globalThis : this);\n');
}

function output(kv) {
  const line = Object.keys(kv).map((k) => k + '=' + kv[k]).join('\n') + '\n';
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
}

function sync() {
  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const log = fs.existsSync(LOG) ? parseChangelog(fs.readFileSync(LOG, 'utf8')) : [];
  writeVersionFile(pkg.version, log);
  return { pkg, log };
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry');
  if (args.includes('--sync')) { const r = sync(); console.log('src/version.js 已同步為 v' + r.pkg.version); return; }

  const pkg = JSON.parse(fs.readFileSync(PKG, 'utf8'));
  const lastTag = git(['describe', '--tags', '--abbrev=0', '--match', 'v*']);
  const range = lastTag ? [lastTag + '..HEAD'] : [];
  const raw = git(['log'].concat(range, ['--no-merges', '--pretty=format:%s%x1f%b%x1e']));
  const commits = raw.split('\x1e').map((x) => x.trim()).filter(Boolean).map((x) => { const p = x.split('\x1f'); return { subject: p[0].trim(), body: p[1] || '' }; });
  const plan = lastTag ? analyze(commits, pkg.version) : null;

  if (!plan) {
    // 沒有新版本要發：仍然輸出目前版本的說明，讓第一次發佈能建立 Release。
    const log = sync().log;
    const cur = log.find((c) => c.version === pkg.version);
    if (!dry) { fs.mkdirSync(path.dirname(NOTES), { recursive: true }); fs.writeFileSync(NOTES, (cur ? cur.body : 'v' + pkg.version) + '\n'); }
    console.log((lastTag ? '自 ' + lastTag + ' 以來沒有需要發佈的變更' : '還沒有任何版本標籤') + '，維持 v' + pkg.version + '。');
    output({ released: 'false', version: pkg.version });
    return;
  }

  const date = new Date().toISOString().slice(0, 10);
  console.log('v' + pkg.version + ' → v' + plan.version + '\n\n' + plan.body + '\n');
  if (dry) return;
  pkg.version = plan.version;
  fs.writeFileSync(PKG, JSON.stringify(pkg, null, 2) + '\n');
  const old = fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : HEADER;
  const at = old.indexOf('\n## [');
  const head = at >= 0 ? old.slice(0, at + 1) : old.replace(/\s*$/, '\n\n');
  const rest = at >= 0 ? old.slice(at + 1) : '';
  fs.writeFileSync(LOG, head + '## [' + plan.version + '] - ' + date + '\n\n' + plan.body + '\n\n' + rest);
  sync();
  fs.mkdirSync(path.dirname(NOTES), { recursive: true });
  fs.writeFileSync(NOTES, plan.body + '\n');
  output({ released: 'true', version: plan.version });
}

if (require.main === module) main();
module.exports = { parseChangelog, analyze, sync };
