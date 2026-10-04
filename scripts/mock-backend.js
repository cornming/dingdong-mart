/* 本機假後端：把 backend/Code.gs 跑在一個小小的 HTTP 伺服器上，給介面實測用。
 * 用法：node scripts/mock-backend.js [port]　啟動後會印出 READY <port>。
 * 跟真的 Apps Script 一樣：GET 讀排行榜，POST（text/plain 的 JSON）寫入，回應帶 CORS 標頭。 */
'use strict';
const http = require('http');
const gas = require('./gas-mock.js').load();
gas.realClock = setInterval(() => { gas.clock.now = Date.now(); }, 50);
gas.clock.now = Date.now();

const server = http.createServer((req, res) => {
  const send = (obj) => { res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(obj)); };
  if (req.method === 'GET') return send(gas.get());
  if (req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => send(gas.post(body)));
    return;
  }
  res.writeHead(405); res.end();
});
server.listen(+process.argv[2] || 0, '127.0.0.1', () => { console.log('READY ' + server.address().port); });
