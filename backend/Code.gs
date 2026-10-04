/**
 * @OnlyCurrentDoc
 * （上面這一行讓這支程式只能存取它所在的這一份試算表，不會碰到你帳號裡的其他檔案。）
 */

/* 叮咚！便利店 — 線上排行榜與留言板的後端
 * 這是 Google Apps Script，綁在一份 Google 試算表上：玩家的成績寫進「scores」分頁，留言寫進「comments」分頁。
 * 安裝方式見 docs/LEADERBOARD.md。部署時「執行身分」選自己、「誰可以存取」選所有人。
 *
 * 管理：
 *   - 刪掉假成績：直接在 scores 分頁刪掉那一列。
 *   - 藏起不當留言：在 comments 分頁那一列的「隱藏」欄填任何字（例如 1），或直接刪列。
 *
 * 注意：成績是玩家的瀏覽器送來的，這裡只能擋掉明顯不合理的數字，擋不住有心造假。 */

var CONFIG = {
  TOP: 10,                 // 排行榜顯示幾名
  COMMENTS: 30,            // 留言板顯示最新幾則
  NAME_MAX: 10,
  TEXT_MAX: 140,
  GOAL: 3000000,           // 退休門檻（與遊戲 src/chain.js 的 GOAL 一致）
  MIN_DAYS: 40,            // 再快也不可能少於這個天數
  MAX_DAYS: 5000,
  MAX_REV_PER_DAY: 400000, // 四家店每天營收的合理上限
  WRITES_PER_MIN: 30,      // 全站每分鐘最多接受幾筆寫入
  CLIENT_COOLDOWN_SEC: 20  // 同一台裝置兩次寫入至少間隔幾秒
};
var SCORE_HEAD = ['時間', '店名', '店面', '天數', '累計營收', '店數', '總資產', '版本', '裝置代碼'];
var COMMENT_HEAD = ['時間', '店名', '留言', '版本', '裝置代碼', '隱藏'];

function doGet(e) {
  return out_(board_());
}
function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_(fail_('資料格式不對')); }
  if (!body || typeof body !== 'object') return out_(fail_('資料格式不對'));
  var lock = LockService.getScriptLock();
  try { lock.waitLock(8000); } catch (err) { return out_(fail_('現在人太多，請稍後再試')); }
  try {
    if (body.action === 'score') return out_(addScore_(body));
    if (body.action === 'comment') return out_(addComment_(body));
    return out_(fail_('不認得的動作'));
  } finally {
    lock.releaseLock();
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg) { return { ok: false, msg: msg }; }

function sheet_(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}
function rows_(sh) {
  var all = sh.getDataRange().getValues();
  return all.length > 1 ? all.slice(1) : [];
}
/** 整理玩家輸入的文字：去掉控制字元、把連續空白變成一個、裁到上限。 */
function clean_(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028-\u202e]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
/** 玩家的文字一律以「純文字」寫進試算表（前面加單引號），不讓它被當成公式、日期或數字。 */
function cell_(s) {
  return "'" + s;
}
function int_(v) {
  var n = Number(v);
  return isFinite(n) ? Math.round(n) : NaN;
}
function time_(v) {
  return v && v.getTime ? v.getTime() : (Number(v) || 0);
}

/** 節流：全站每分鐘的寫入上限，加上每台裝置的冷卻時間。 */
function throttle_(cid) {
  var cache = CacheService.getScriptCache();
  var minute = 'w:' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(minute) || 0);
  if (n >= CONFIG.WRITES_PER_MIN) return '現在人太多，請稍後再試';
  if (cid && cache.get('c:' + cid)) return '太頻繁了，請等一下再送';
  cache.put(minute, String(n + 1), 120);
  if (cid) cache.put('c:' + cid, '1', CONFIG.CLIENT_COOLDOWN_SEC);
  return '';
}

function sortScores_(list) {
  return list.sort(function (a, b) { return a.days - b.days || b.rev - a.rev || a.at - b.at; });
}
function scores_() {
  var list = [];
  rows_(sheet_('scores', SCORE_HEAD)).forEach(function (r) {
    var days = int_(r[3]), rev = int_(r[4]);
    if (!r[1] || !(days > 0) || !(rev > 0)) return;
    list.push({ name: String(r[1]), loc: String(r[2] || ''), days: days, rev: rev, stores: int_(r[5]) || 1, at: time_(r[0]) });
  });
  return sortScores_(list);
}
function comments_() {
  var list = [];
  rows_(sheet_('comments', COMMENT_HEAD)).forEach(function (r) {
    if (!r[1] || !r[2] || r[5]) return;
    list.push({ name: String(r[1]), text: String(r[2]), at: time_(r[0]) });
  });
  return list.slice(-CONFIG.COMMENTS).reverse();
}
function board_() {
  var all = scores_();
  return { ok: true, top: all.slice(0, CONFIG.TOP), count: all.length, comments: comments_() };
}

function addScore_(b) {
  var name = clean_(b.name, CONFIG.NAME_MAX);
  var loc = clean_(b.loc, 12);
  var days = int_(b.days), rev = int_(b.rev), stores = int_(b.stores), worth = int_(b.worth);
  if (!name) return fail_('請輸入店名');
  if (!(days >= CONFIG.MIN_DAYS && days <= CONFIG.MAX_DAYS)) return fail_('天數不合理');
  if (!(stores >= 1 && stores <= 4)) return fail_('店數不合理');
  if (!(worth >= CONFIG.GOAL)) return fail_('還沒達到退休門檻');
  if (!(rev >= CONFIG.GOAL / 3 && rev <= days * CONFIG.MAX_REV_PER_DAY)) return fail_('營收不合理');
  var sh = sheet_('scores', SCORE_HEAD);
  var dup = rows_(sh).slice(-300).some(function (r) { return String(r[1]) === name && int_(r[3]) === days && int_(r[4]) === rev; });
  if (!dup) {
    var wait = throttle_(clean_(b.cid, 40));
    if (wait) return fail_(wait);
    sh.appendRow([new Date(), cell_(name), cell_(loc), days, rev, stores, worth, clean_(b.v, 12), clean_(b.cid, 40)]);
  }
  var res = board_();
  var all = scores_();
  for (var i = 0; i < all.length; i++) if (all[i].name === name && all[i].days === days && all[i].rev === rev) { res.rank = i + 1; break; }
  return res;
}
function addComment_(b) {
  var name = clean_(b.name, CONFIG.NAME_MAX);
  var text = clean_(b.text, CONFIG.TEXT_MAX);
  if (!name) return fail_('請輸入店名');
  if (!text) return fail_('留言是空的');
  if (/https?:|www\.|\.com\b/i.test(text)) return fail_('留言不能放網址');
  var wait = throttle_(clean_(b.cid, 40));
  if (wait) return fail_(wait);
  sheet_('comments', COMMENT_HEAD).appendRow([new Date(), cell_(name), cell_(text), clean_(b.v, 12), clean_(b.cid, 40), '']);
  return board_();
}
