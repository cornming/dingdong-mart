# 叮咚！便利店

一九九九年的夏天，你頂下了巷口的一間小店。進貨、排班、對付奧客，把它變成整條街最亮的招牌。

這是一款向九〇年代末台灣便利商店經營遊戲致敬的**原創**網頁遊戲：玩法、程式、美術、音樂都是重新做的，沒有使用任何原作的名稱、素材或角色。手機直式畫面優先，桌機也能玩。

- 線上玩：<https://cornming.github.io/dingdong-mart/>（需要先在 repo 的 Settings → Pages 把 Source 設為 GitHub Actions）
- 離線玩：執行 `npm run build`，用瀏覽器打開 `dist/index.html`（單一檔案，可以直接傳到手機）
- 開發時：直接用瀏覽器打開根目錄的 `index.html`，不需要任何建置或伺服器

## 怎麼玩

1. 選城市（高雄輕鬆、台中普通、台北困難）和店面。每個商圈的客層不一樣：學區的學生在意價格，商辦區的上班族要咖啡和便當，夜市旁邊越夜越熱鬧。
2. 按「×1」開門營業。客人走進來找想買的東西，買不到、太貴、排太久都會不開心。
3. **進貨**：設定每種商品明天清晨要補到幾個、賣多少錢。鮮食和報紙當天賣不完就報廢。
4. **設備**：有冷藏櫃才能賣飲料，有鮮食櫃才能賣便當。每天結算時，顧問咚咚會告訴你最該添什麼。
5. **店員**：早班、晚班、大夜，每一班都要有人，店才會 24 小時開著。
6. **宣傳**：口碑、商品數和廣告決定你從對手手上搶到多少客人。
7. 30 天後依總資產頒發銅、銀、金牌，之後可以繼續自由經營。

## 專案結構

| 路徑 | 內容 |
|---|---|
| `src/data.js` | 純資料：商品、設備、客層、城市與店面、天氣、廣告 |
| `src/engine.js` | 遊戲規則（純邏輯、沒有 DOM，瀏覽器與 Node 共用） |
| `src/scene.js` | 像素風店面與標題畫面（canvas） |
| `src/audio.js` | 音效與背景音樂（WebAudio 即時合成，沒有音檔） |
| `src/ui.js`、`src/styles.css` | 操作介面 |
| `src/version.js` | 遊戲內顯示的版本與更新紀錄（自動產生） |
| `tests/` | 規則與版號腳本的單元測試 |
| `scripts/balance.js` | 平衡模擬：三種機器人玩家跑完 12 個店面 |
| `scripts/smoke.py` | 介面實測：無頭瀏覽器實際點過一輪並截圖 |
| `scripts/build.js` | 建置成單一檔案 `dist/index.html` |
| `scripts/release.js` | 自動升版與更新紀錄 |
| `docs/` | 設計文件與每一圈循環的紀錄 |

## 開發與驗證

需要 Node 22 以上；介面實測另外需要 Python 與 Playwright（`pip install playwright && python -m playwright install chromium`）。

```
npm test            # 閘門一：規則測試
npm run balance     # 閘門二：平衡模擬
npm run build       # 建置單一檔案
npm run smoke       # 閘門三：介面實測（截圖存到 shots/）
npm run verify      # 以上全部
```

這個專案用 loop engineering 的方式開發：規劃輪廓 → 深入細節 → 批判 → 改進 → 驗證，一圈一圈做。做法與每一圈的紀錄在 [docs/LOOP.md](docs/LOOP.md)，遊戲設計在 [docs/DESIGN.md](docs/DESIGN.md)。

## 版本與更新紀錄

推到 `main` 之後，GitHub Actions 會先跑完三道驗證，再依 commit 訊息自動升版、更新 [CHANGELOG.md](CHANGELOG.md)、打標籤、建立 Release 並部署。遊戲標題畫面的「更新紀錄」顯示的就是同一份內容。

| commit 開頭 | 意思 | 版號 |
|---|---|---|
| `feat:` | 新功能 | 0.1.0 → 0.2.0 |
| `fix:`、`balance:`、`perf:` | 修正、數值調整、效能 | 0.1.0 → 0.1.1 |
| `docs:`、`test:`、`chore:`、`ci:`、`refactor:` | 玩家看不到的變更 | 不發佈 |

冒號後面的文字會原樣出現在更新紀錄裡，請寫玩家看得懂的話。

## 字型

介面使用點陣字型 Cubic 11，依 SIL Open Font License 1.1 授權，授權全文在 `assets/fonts/Cubic_11-OFL.txt`。
