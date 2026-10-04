/* 叮咚！便利店 — 設定
 * api：線上排行榜與留言板的網址（Google Apps Script 網頁應用程式，結尾是 /exec）。
 *      留空白就只有這台裝置自己的名人堂。安裝方式見 docs/LEADERBOARD.md。 */
(function (root) {
  root.DD_CONFIG = root.DD_CONFIG || {
    api: 'https://script.google.com/macros/s/AKfycbwdXwYpk3tu-4aR967sVkkfMSBMD8vR_C_5iQshU1SilcPudUZgdGDHsXs9ecs4gNaV/exec',
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
