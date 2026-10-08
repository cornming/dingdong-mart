/* 平衡驗證：用三種機器人玩家跑完整個 30 天劇本，檢查數值是否落在設計範圍內。
 * 「用心」的機器人會把設備擺到黃金位置、晚上八點起把即期品打 8 折；「新手」和「放置」不會。
 * 用法：node scripts/balance.js [--seeds 20] [--verbose]
 * 這是 loop engineering 的「驗證閘門」之一：任何數值調整後都要通過。 */
'use strict';
const E = require('../src/engine.js');
const D = E.D;

const args = process.argv.slice(2);
const SEEDS = +(args[args.indexOf('--seeds') + 1] || 20) || 20;
const VERBOSE = args.includes('--verbose');

function freeSlot(s) { return E.unlockedSlots(s).find((i) => !s.slots[i]); }
// 優先找「適合這種設備的區」裡的空位，沒有才隨便找一個空位
function slotFor(s, type) {
  const free = E.unlockedSlots(s).filter((i) => !s.slots[i]);
  const gold = free.find((i) => E.zoneOf(i) === E.homeZone(type));
  return gold != null ? gold : free[0];
}
// 把沒擺對的設備搬到適合的區（那一區有空位才搬）
function tidy(s) {
  for (let i = 0; i < s.slots.length; i++) {
    const f = s.slots[i];
    if (!f || E.isGold(s, i)) continue;
    const to = E.unlockedSlots(s).find((j) => !s.slots[j] && E.zoneOf(j) === E.homeZone(f));
    if (to != null) E.moveFixture(s, i, to);
  }
}

const bots = {
  idle() {},
  // 新手：開局把貨叫滿、請一個大夜班，之後完全不調整
  naive(s) {
    if (s.day !== 1 || s.t !== 0) return;
    D.PRODUCTS.forEach((p) => E.setTarget(s, p.id, E.cap(s, p.id)));
    const slot = freeSlot(s);
    if (slot != null) E.buyFixture(s, slot, 'fresh');
    D.PRODUCTS.forEach((p) => E.setTarget(s, p.id, E.cap(s, p.id)));
    E.hire(s, 0, 2);
  },
  // 用心的玩家：依昨日銷量調進貨（會看週末）、看缺什麼買設備、把班排滿、適度宣傳；
  // 設備會擺到適合的區，鮮食與熱食晚上八點起打 8 折
  smart(s) {
    if (s.t !== 0) return;
    tidy(s);
    if (E.mdOf(s).pct === 0 && (E.fixtureCount(s, 'fresh') || E.fixtureCount(s, 'hot'))) E.setMarkdown(s, 20, 20);
    const r = s.lastReport;
    const loc = E.LOC[s.locId];
    const bestCand = () => {
      let best = 0;
      s.cands.forEach((c, i) => { if (c.speed / c.wage > s.cands[best].speed / s.cands[best].wage) best = i; });
      return best;
    };
    for (const sh of [2, 1, 0]) {
      if (E.crewOn(s, sh).length === 0 && s.cands.length) E.hire(s, bestCand(), sh);
    }
    if (!r) return;
    const daysLeft = Math.max(0, D.CITIES[s.cityId].days - s.day);
    // 進貨目標：現在設定的目標是「明天」的到貨量，所以要用明天對昨天的人潮比例修正
    const mult = (d) => (E.isWeekend(d) ? loc.weekend : 1);
    const f = mult(s.day + 1) / mult(s.day - 1);
    D.PRODUCTS.forEach((p) => {
      const c = E.cap(s, p.id);
      if (!c) return;
      const rec = r.perProd[p.id] || { sold: 0, soldOut: 0 };
      const demand = (rec.sold + rec.soldOut) * f;
      const want = Math.ceil((demand * (p.perish ? 0.95 : 1.15)) / 10) * 10;
      E.setTarget(s, p.id, Math.max(10, want));
    });
    // 尖峰加人
    if (r.queueLost > 20) {
      let worst = 0;
      r.queueBy.forEach((q, i) => { if (q > r.queueBy[worst]) worst = i; });
      if (E.staffOnShift(s, worst) < 2 && E.crewOn(s, worst).length < 2 && s.cands.length && s.cash > 30000) E.hire(s, bestCand(), worst);
      else if (!s.upgrades.register2 && s.cash > 50000) E.buyUpgrade(s, 'register2');
    }
    // 設備投資：估算每種設備一天能多賺多少毛利
    const gain = {};
    D.PRODUCTS.forEach((p) => {
      const rec = r.perProd[p.id];
      if (!rec) return;
      const c = E.cap(s, p.id);
      const lost = c === 0 ? rec.noSell : (s.target[p.id] >= c ? rec.soldOut : 0);
      gain[p.fx] = (gain[p.fx] || 0) + lost * (p.price - p.cost) * 0.7;
    });
    let bestFx = null, bestRoi = 0;
    Object.keys(gain).forEach((fx) => {
      const roi = gain[fx] * daysLeft - D.FIXTURES[fx].cost * 0.5;
      if (roi > bestRoi) { bestRoi = roi; bestFx = fx; }
    });
    if (bestFx && s.cash > D.FIXTURES[bestFx].cost + 30000) {
      let slot = slotFor(s, bestFx);
      const next = D.LEVELS[s.level + 1];
      if (slot == null && next && s.cash > next.cost + D.FIXTURES[bestFx].cost + 40000 && bestRoi > next.cost) {
        E.expand(s);
        slot = slotFor(s, bestFx);
      }
      if (slot != null) E.buyFixture(s, slot, bestFx);
    }
    if (!s.upgrades.sign && s.cash > 100000 && daysLeft > 10) E.buyUpgrade(s, 'sign');
    if (!(s.ads.flyer > 0) && s.cash > 40000 && daysLeft > 2) E.runAd(s, 'flyer');
  },
};

function play(locId, seed, botName) {
  const s = E.newGame({ locId, seed });
  const bot = bots[botName];
  const days = D.CITIES[s.cityId].days;
  let guard = 0;
  while (s.day <= days && !s.over && guard++ < 5000) {
    bot(s);
    const res = E.tickHour(s);
    if (res.event) E.resolveEvent(s, botName === 'smart' ? 0 : (seed + guard) % res.event.choices.length);
  }
  return s;
}

const summary = {};
let failed = 0;
function check(cond, msg) { if (!cond) { failed++; console.log('  ✗ ' + msg); } else if (VERBOSE) console.log('  ✓ ' + msg); }

for (const loc of D.LOCATIONS) {
  const city = D.CITIES[loc.city];
  const row = {};
  for (const b of Object.keys(bots)) {
    const worths = [], medals = [0, 0, 0, 0];
    let bankrupt = 0, cust = 0, rep = 0, rivalsGone = 0;
    for (let i = 1; i <= SEEDS; i++) {
      const s = play(loc.id, i * 7919, b);
      const w = E.netWorth(s);
      worths.push(w);
      if (s.over) bankrupt++;
      medals[s.medal ? s.medal.tier : 0]++;
      cust += s.history.reduce((a, h) => a + h.customers, 0) / Math.max(1, s.history.length);
      rep += s.rep;
      rivalsGone += loc.rivals.length + (loc.newRival ? 1 : 0) - s.rivals.length;
    }
    worths.sort((a, c) => a - c);
    row[b] = { avg: Math.round(worths.reduce((a, c) => a + c, 0) / SEEDS), min: worths[0], max: worths[SEEDS - 1],
      medals, bankrupt, cust: Math.round(cust / SEEDS), rep: Math.round(rep / SEEDS), rivalsGone: +(rivalsGone / SEEDS).toFixed(2) };
  }
  summary[loc.id] = row;
  console.log(`${loc.id} ${loc.name}（${city.name}）目標 ${city.goals.join('/')}`);
  for (const b of Object.keys(bots)) {
    const r = row[b];
    console.log(`  ${b.padEnd(5)} 平均資產 ${String(r.avg).padStart(8)} [${r.min} ~ ${r.max}] 無/銅/銀/金 ${r.medals.join('/')} 破產 ${r.bankrupt} 來客/日 ${r.cust} 口碑 ${r.rep} 擊退對手 ${r.rivalsGone}`);
  }
  const sm = row.smart, id = row.idle, nv = row.naive;
  check(sm.bankrupt === 0, `${loc.id}: 用心玩不該破產（破產 ${sm.bankrupt}）`);
  check((sm.medals[1] + sm.medals[2] + sm.medals[3]) / SEEDS >= 0.9, `${loc.id}: 用心玩至少九成拿到銅牌以上`);
  check((sm.medals[2] + sm.medals[3]) / SEEDS >= 0.5, `${loc.id}: 用心玩至少一半拿到銀牌以上`);
  check(sm.medals[3] / SEEDS <= 0.7, `${loc.id}: 金牌不該太容易（${sm.medals[3]}/${SEEDS}）`);
  check(id.medals[2] + id.medals[3] === 0, `${loc.id}: 放著不管不該拿到銀牌以上`);
  check(sm.avg > nv.avg && sm.avg > id.avg, `${loc.id}: 用心玩的成績要比新手和放置都好`);
}
console.log(failed ? `\n平衡檢查：${failed} 項未通過` : '\n平衡檢查：全部通過');
process.exit(failed ? 1 : 0);
