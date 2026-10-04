/* 在 Node 裡執行 backend/Code.gs：用記憶體假裝 Google 試算表、鎖與快取。
 * 單元測試（tests/backend.test.js）與介面實測用的本機假後端（scripts/mock-backend.js）共用。 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function load() {
  const sheets = {};
  const cache = {};
  const clock = { now: Date.UTC(2026, 9, 4, 3, 0, 0) };
  function makeSheet() {
    const rows = [];
    return {
      rows: rows,
      appendRow: (r) => { rows.push(r.map((v) => (typeof v === 'string' && v[0] === "'" ? v.slice(1) : v))); },
      rawAppend: (r) => { rows.push(r); },
      setFrozenRows: () => {},
      getDataRange: () => ({ getValues: () => rows.map((r) => r.slice()) }),
    };
  }
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.now); }
    static now() { return clock.now; }
  }
  const written = [];
  const sandbox = {
    Date: FakeDate, JSON, Math, Number, String, isFinite,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => {
        sheets[n] = makeSheet();
        const orig = sheets[n].appendRow;
        sheets[n].appendRow = (r) => { written.push({ sheet: n, row: r.slice() }); orig(r); };
        return sheets[n];
      },
    }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (s) => ({ text: s, setMimeType() { return this; }, getContent() { return s; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({
      get: (k) => (cache[k] && cache[k].until > clock.now ? cache[k].v : null),
      put: (k, v, ttl) => { cache[k] = { v: v, until: clock.now + ttl * 1000 }; },
    }) },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'backend', 'Code.gs'), 'utf8'), sandbox, { filename: 'Code.gs' });
  return {
    sheets, clock, written, sandbox,
    get: () => JSON.parse(sandbox.doGet({ parameter: {} }).getContent()),
    post: (body) => JSON.parse(sandbox.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent()),
  };
}
module.exports = { load };
