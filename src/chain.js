/* 叮咚！便利店 — 連鎖經營（純邏輯，無 DOM；瀏覽器與 Node 共用）
 * 一個「連鎖」是好幾家店共用一個錢包。每家店仍然是 engine.js 的一份完整狀態，
 * 這裡只負責：讓所有店的時間同步前進、把現金同步成同一個數字、開分店、判斷里程碑與退休。 */
(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const E = node ? require('./engine.js') : root.DD;

  const GOAL = 3000000;          // 現金累積到這個數字：可以光榮退休（破關），也可以開分店
  const MAX_STORES = 4;
  const BRANCH_COST = { kaohsiung: 1000000, taichung: 1200000, taipei: 1500000 }; // 頂下一間分店（含基本設備與第一批貨）

  function ok(msg, extra) { return Object.assign({ ok: true, msg: msg }, extra || {}); }
  function no(msg) { return { ok: false, msg: msg }; }

  function create(state) {
    let rev = 0;
    (state.history || []).forEach(function (h) { rev += h.rev || 0; });
    return { v: 2, stores: [state], active: 0, totalRev: rev, unlocked: false, goalSeen: false, retired: null };
  }
  function cur(ch) { return ch.stores[ch.active]; }
  function wallet(ch) { return cur(ch).cash; }
  /** 把所有店的現金同步成同一個數字（預設以目前這家店為準）。玩家每做一個動作之後都要呼叫。 */
  function sync(ch, from) {
    const c = (from || cur(ch)).cash;
    ch.stores.forEach(function (s) { s.cash = c; });
  }
  function netWorth(ch) {
    let w = 0;
    ch.stores.forEach(function (s) { w += E.netWorth(s) - s.cash; });
    return Math.round(w + wallet(ch));
  }
  function over(ch) { return ch.stores.some(function (s) { return !!s.over; }); }

  /** 所有店一起前進一小時。目前這家店遇到事件時整個連鎖都先停下來等玩家決定；
   *  其他分店遇到事件，由當班的人照第一個選項先處理。 */
  function tick(ch) {
    const a = cur(ch);
    sync(ch, a);
    const res = E.tickHour(a);
    if (res.event || res.blocked) return { res: res, bg: [], milestone: false };
    let cash = a.cash;
    const bg = [];
    ch.stores.forEach(function (s, i) {
      if (i === ch.active) return;
      s.cash = cash;
      const notes = [];
      let r = null;
      for (let guard = 0; guard < 8; guard++) {
        r = E.tickHour(s);
        if (s.pending) { const title = s.pending.title; notes.push({ title: title, text: E.resolveEvent(s, 0) }); continue; }
        break;
      }
      cash = s.cash;
      bg.push({ i: i, res: r, notes: notes });
    });
    ch.stores.forEach(function (s) { s.cash = cash; });
    let milestone = false;
    if (res.dayEnded) {
      ch.totalRev += res.report.rev + res.report.service;
      bg.forEach(function (b) { if (b.res && b.res.report) ch.totalRev += b.res.report.rev + b.res.report.service; });
      if (cash < E.OVERDRAFT) ch.stores.forEach(function (s) { s.over = 'bankrupt'; });
      else if (!ch.goalSeen && cash >= GOAL) { ch.goalSeen = true; ch.unlocked = true; milestone = true; }
    }
    return { res: res, bg: bg, milestone: milestone };
  }

  function owns(ch, locId) { return ch.stores.some(function (s) { return s.locId === locId; }); }
  function branchCost(locId) { return BRANCH_COST[E.LOC[locId].city]; }
  function canBranch(ch, locId) {
    if (!ch.unlocked) return no('現金累積到 ' + E.money(GOAL) + ' 之後才能開分店');
    if (ch.stores.length >= MAX_STORES) return no('最多經營 ' + MAX_STORES + ' 家店');
    if (!E.LOC[locId]) return no('沒有這個店面');
    if (owns(ch, locId)) return no('這個店面已經是你的了');
    if (wallet(ch) < branchCost(locId)) return no('現金不夠，頂下這間店要 ' + E.money(branchCost(locId)));
    return ok('');
  }
  function openBranch(ch, locId, name, seed) {
    const can = canBranch(ch, locId);
    if (!can.ok) return can;
    const a = cur(ch);
    const s = E.newGame({ locId: locId, name: name, seed: seed });
    s.day = a.day; s.t = a.t;                               // 跟總店同一天、同一個小時
    s.branch = true;
    s.medal = { tier: 0, day: 0, worth: 0, branch: true };  // 分店不參加 30 天評比
    s.owner.shift = -1;                                     // 你人在原本的店，分店每一班都要請人
    if (s.cands.length) {
      let best = 0;
      s.cands.forEach(function (c, i) { if (c.speed / c.wage > s.cands[best].speed / s.cands[best].wage) best = i; });
      E.hire(s, best, 0);
    }
    s.cash = a.cash - branchCost(locId);
    ch.stores.push(s);
    sync(ch, s);
    ch.goalSeen = false;                                    // 下次再存到目標，會再問一次
    return ok(s.name + '開幕了！', { index: ch.stores.length - 1 });
  }
  function switchTo(ch, i) {
    if (!ch.stores[i]) return no('沒有這家店');
    sync(ch);
    ch.active = i;
    return ok('');
  }
  function summary(ch) {
    return { days: ch.stores[0].day - 1, rev: Math.round(ch.totalRev), worth: netWorth(ch), cash: Math.round(wallet(ch)), stores: ch.stores.length, name: ch.stores[0].name, locId: ch.stores[0].locId };
  }
  function retire(ch) {
    if (wallet(ch) < GOAL) return no('現金要達到 ' + E.money(GOAL) + ' 才能光榮退休');
    ch.retired = summary(ch);
    return ok('', { result: ch.retired });
  }
  /** 讀檔：接受新版（連鎖）與舊版（單一家店）兩種存檔；格式不對回傳 null。 */
  function fromSave(sv) {
    if (!sv) return null;
    if (sv.chain && sv.chain.v === 2 && Array.isArray(sv.chain.stores) && sv.chain.stores.length &&
        sv.chain.stores.every(function (s) { return s && s.v === 1 && E.LOC[s.locId]; })) {
      const ch = sv.chain;
      if (!ch.stores[ch.active]) ch.active = 0;
      return ch;
    }
    if (sv.state && sv.state.v === 1 && E.LOC[sv.state.locId]) return create(sv.state);
    return null;
  }

  const API = { GOAL: GOAL, MAX_STORES: MAX_STORES, BRANCH_COST: BRANCH_COST,
    create: create, cur: cur, wallet: wallet, sync: sync, netWorth: netWorth, over: over, tick: tick,
    owns: owns, branchCost: branchCost, canBranch: canBranch, openBranch: openBranch, switchTo: switchTo,
    summary: summary, retire: retire, fromSave: fromSave };
  if (node) module.exports = API;
  else root.DD_CHAIN = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
