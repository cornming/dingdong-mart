/* 叮咚！便利店 — 線上排行榜與留言板的連線（後端是 backend/Code.gs）。
 * 每個函式都回傳 Promise，而且不會丟例外：成功是 { ok: true, top, comments, ... }，失敗是 { ok: false, msg }。 */
(function (root) {
  'use strict';
  const cfg = root.DD_CONFIG || {};
  let api = String(cfg.api || '').trim();
  // 只接受 Apps Script 的網址（測試時另外允許本機）
  if (api && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(api) && !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(api)) api = '';
  const CID_KEY = 'dingdong-mart-cid';

  function cid() {
    try {
      let id = localStorage.getItem(CID_KEY);
      if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(CID_KEY, id); }
      return id;
    } catch (e) { return 'anon'; }
  }
  function call(body) {
    if (!api) return Promise.resolve({ ok: false, off: true, msg: '線上排行榜還沒有設定。' });
    if (!root.fetch) return Promise.resolve({ ok: false, msg: '這個瀏覽器不支援連線。' });
    const ctl = root.AbortController ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    // Apps Script 不處理預檢請求，所以 POST 要用 text/plain 送 JSON 字串
    const opt = body
      ? { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' }
      : { method: 'GET', redirect: 'follow' };
    if (ctl) opt.signal = ctl.signal;
    return root.fetch(api, opt)
      .then(function (r) { return r.json(); })
      .then(function (d) { return d && typeof d === 'object' && typeof d.ok === 'boolean' ? d : { ok: false, msg: '排行榜的回應看不懂。' }; })
      .catch(function () { return { ok: false, msg: '連不到排行榜，請稍後再試。' }; })
      .then(function (d) { clearTimeout(timer); return d; });
  }

  root.DD_CLOUD = {
    enabled: !!api,
    board: function () { return call(null); },
    submitScore: function (rec, version) {
      return call({ action: 'score', name: rec.name, loc: rec.loc, days: rec.days, rev: rec.rev, stores: rec.stores, worth: rec.worth, v: version, cid: cid() });
    },
    postComment: function (name, text, version) {
      return call({ action: 'comment', name: name, text: text, v: version, cid: cid() });
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
