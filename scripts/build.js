/* 建置：把 index.html 參照的樣式、程式與字型全部內嵌成單一檔案 dist/index.html。
 * 這個檔案可以直接丟到任何靜態空間（GitHub Pages）、或用手機瀏覽器離線開啟。
 * 用法：node scripts/build.js */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

require('./release.js').sync(); // 確保遊戲內顯示的版本與更新紀錄是最新的

let html = read('index.html');
let missing = 0;

html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (m, href) => {
  let css = read(href);
  css = css.replace(/url\("([^")]+\.woff2)"\)/g, (mm, rel) => {
    const file = path.join(ROOT, path.dirname(href), rel);
    return 'url("data:font/woff2;base64,' + fs.readFileSync(file).toString('base64') + '")';
  });
  return '<style>\n' + css + '\n</style>';
});
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  if (!fs.existsSync(path.join(ROOT, src))) { missing++; console.error('找不到 ' + src); return m; }
  return '<script>\n' + read(src).replace(/<\/script/gi, '<\\/script') + '\n</script>';
});
if (missing || /<script src=|rel="stylesheet"/.test(html)) { console.error('建置失敗：還有沒內嵌的外部檔案'); process.exit(1); }

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'dist', 'index.html'), html);
const ver = JSON.parse(read('package.json')).version;
console.log('dist/index.html 建置完成：v' + ver + '，' + (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
