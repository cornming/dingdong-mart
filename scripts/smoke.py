"""介面冒煙測試：用無頭瀏覽器實際點過一輪，確認沒有 JavaScript 錯誤、畫面沒有橫向溢出。
用法：python3 scripts/smoke.py [輸出截圖的資料夾] [要測的 html，預設 index.html]
這是 loop engineering 的「驗證閘門」之一。"""
import os
import subprocess
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'shots')
PAGE = sys.argv[2] if len(sys.argv) > 2 else 'index.html'
os.makedirs(OUT, exist_ok=True)
errors = []
checks = []


def check(cond, msg):
    checks.append((bool(cond), msg))
    print(('  ✓ ' if cond else '  ✗ ') + msg)


# 排行榜的假後端：同一份 backend/Code.gs，跑在本機的小伺服器上
mock = subprocess.Popen(['node', os.path.join(ROOT, 'scripts', 'mock-backend.js')], stdout=subprocess.PIPE, text=True)
API = 'http://127.0.0.1:' + mock.stdout.readline().split()[1] + '/'

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 700}, device_scale_factor=2, has_touch=True)
    # 網路字型在測試裡一律回空白樣式：沒有網路的環境也能跑，而且每次用同一套備用字型，截圖才比得起來
    ctx.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    ctx.add_init_script("window.DD_CONFIG = { api: '%s' };" % API)
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto('file://' + os.path.join(ROOT, PAGE) + '?seed=20261004')
    page.wait_for_timeout(700)

    def shot(name):
        page.wait_for_timeout(220)  # 等視窗的進場動畫結束
        page.screenshot(path=os.path.join(OUT, name + '.png'))

    def settle():
        """時間在跑的時候可能跳出事件；把事件視窗處理掉再繼續。"""
        for _ in range(4):
            if page.locator('[data-act=choose]').count():
                page.click('[data-act=choose] >> nth=0')
                page.click('#modal [data-act=closeModal]')
            else:
                return

    def no_overflow(where):
        w = page.evaluate('Math.max(...[...document.querySelectorAll("#app *")].map(e => e.getBoundingClientRect().right))')
        check(w <= 391, f'{where}：沒有橫向溢出（最右 {w:.0f}px）')

    shot('01-title')
    check(page.locator('#titleCanvas').count() == 1, '標題畫面出現')

    # 線上排行榜與留言板（連到本機的假後端）
    page.click('[data-act=hall]')
    page.wait_for_selector('#bTop:has-text("還沒有人上榜")')
    check(True, '排行榜讀得到線上資料（目前是空的）')
    page.click('[data-act=postComment]')
    check('請填店名' in page.locator('#cNote').inner_text(), '沒填店名不能留言')
    page.fill('#cName', '路人甲')
    page.fill('#cText', '好玩！<img src=x onerror="window.__xss=1"> 建議加宵夜')
    page.click('[data-act=postComment]')
    page.wait_for_selector('#bMsgs li')
    check(page.locator('#bMsgs li').count() == 1 and '<img' in page.locator('#bMsgs li p').inner_text(), '留言送出後立刻出現在留言板')
    check(page.locator('#bMsgs img').count() == 0 and not page.evaluate('window.__xss'), '留言裡的 HTML 只會被當成文字顯示')
    check(page.input_value('#cText') == '', '送出後輸入框清空')
    page.fill('#cText', '連續洗版')
    page.click('[data-act=postComment]')
    page.wait_for_selector('#cNote.bad')
    check('太頻繁' in page.locator('#cNote').inner_text() and page.locator('#bMsgs li').count() == 1, '同一台裝置短時間內不能連續留言')
    shot('01b-board')
    no_overflow('排行榜')
    page.click('#modal [data-act=closeModal]')
    page.click('[data-act=new]')
    shot('02-city')
    page.click('[data-act=city][data-id=kaohsiung]')
    page.wait_for_timeout(200)
    shot('03-location')
    no_overflow('選地點')
    page.click('[data-act=loc][data-id=kh3]')
    page.fill('#storeName', '測試商店')
    page.click('[data-act=start]')
    shot('04-tutorial')
    for _ in range(4):
        page.click('[data-act=tutorial]')
    check(page.evaluate('DD_UI.state().name') == '測試商店', '新遊戲建立，店名正確')
    no_overflow('營業畫面')
    check(page.locator('#dayline .dl-bars i').count() == 24, '今日時間軸有 24 個小時')
    check(page.locator('#dayline .dl-bars i.dl-shut').count() == 8, '開局大夜班沒人，時間軸標出 8 個小時不營業')
    check(page.locator('#dayline .dl-shifts .dl-empty').count() == 1, '時間軸標出沒人顧的班')
    check(page.locator('.hud [data-act=menu]').inner_text().strip() == '選單', '選單按鈕有文字')
    check(page.locator('.speed button').count() == 3 and '×8' not in page.locator('.speed').inner_text(), '速度只有暫停、×1、×3（沒有 ×8）')
    check(page.locator('#stores').is_hidden(), '只有一家店、還沒達標時不顯示分店列')

    # 實際讓時間跑一下，確認客人會進來
    page.click('[data-act=speed][data-v="2"]')
    page.wait_for_timeout(2600)
    shot('05-running')
    check(page.evaluate('DD_UI.state().today.customers') > 0, '開始營業後有客人上門')
    page.click('[data-act=speed][data-v="0"]', force=True)
    settle()

    for tab in ['stock', 'equip', 'staff', 'promo', 'report']:
        page.click(f'.tabs [data-tab={tab}]')
        page.wait_for_timeout(120)
        shot('06-' + tab)
        no_overflow('分頁 ' + tab)
        check(page.locator('#sheet .sheet-body').inner_text().strip() != '', f'分頁 {tab} 有內容')

    # 進貨：到貨時間、搜尋、分類
    page.click('.tabs [data-tab=stock]')
    body = page.locator('#sheet .sheet-body')
    check('明天清晨 06:00' in page.locator('#stockSum').inner_text() and '還有' in page.locator('#stockSum').inner_text(), '進貨分頁寫明下一班貨車的時間與倒數')
    check(page.locator('.prod[data-pid=tea] .prod-eta').inner_text().strip() != '', '每項商品都標出明早會補多少')
    total = page.locator('.prod:visible').count()
    page.fill('#stockQ', '茶')
    check(page.locator('.prod:visible').count() == 1 and page.locator('.prod[data-pid=tea]').is_visible(), '搜尋「茶」只剩罐裝茶')
    check(page.evaluate('document.activeElement && document.activeElement.id') == 'stockQ', '搜尋時輸入框不會失去焦點')
    page.fill('#stockQ', '飲料')
    check(page.locator('.prod:visible').count() == 4, '搜尋「飲料」找到冷藏櫃裡的四種飲料（同義詞）')
    page.fill('#stockQ', '洋片')
    check(page.locator('.prod[data-pid=snack]').is_visible() and page.locator('.prod:visible').count() == 1, '只打其中幾個字也找得到（洋片 → 洋芋片）')
    page.fill('#stockQ', '火箭')
    check(page.locator('#stockNone').is_visible() and page.locator('.prod:visible').count() == 0, '找不到時有提示')
    page.fill('#stockQ', '')
    page.click('.cats [data-k="fx:fridge"]')
    check(page.locator('.prod:visible').count() == 4 and page.locator('.cats .on').inner_text() == '冷藏櫃', '分類：只看冷藏櫃')
    page.click('.cats [data-k=low]')
    low = page.locator('.prod:visible').count()
    check(0 < low <= total, f'分類：沒補滿的商品（{low} 項）')
    shot('06b-stock-filter')
    if page.locator('.prod:visible [data-act=rush]').count():
        pid = page.locator('.prod:visible').first.get_attribute('data-pid')
        st0 = page.evaluate(f'DD_UI.state().stock["{pid}"]')
        page.locator('.prod:visible [data-act=rush]').first.click()
        check(page.evaluate(f'DD_UI.state().stock["{pid}"]') > st0, '「立刻到貨」按下去庫存馬上增加')
        check(page.locator('.prod:visible').count() == low - 1, '補滿的商品會從「沒補滿」清單消失')
    page.click('.cats [data-k=all]')
    check(page.locator('.prod:visible').count() == total, '按「全部」恢復完整清單')
    no_overflow('進貨（搜尋與分類）')

    # 進貨：調價格與目標
    before = page.evaluate('DD_UI.state().price.tea')
    page.click('.prod[data-pid=tea] [data-act=price][data-d="5"]')
    check(page.evaluate('DD_UI.state().price.tea') == before + 5, '調漲售價有生效')
    page.evaluate('''() => { const r = document.querySelector('.prod[data-pid=tea] input[type=range]'); r.value = 120; r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); }''')
    check(page.evaluate('DD_UI.state().target.tea') == 120, '拉桿調整進貨目標有生效')

    # 設備：買一台鮮食櫃
    page.click('.tabs [data-tab=equip]')
    page.click('[data-act=buyFx][data-k=fresh]')
    check(page.evaluate('DD.fixtureCount(DD_UI.state(), "fresh")') == 1, '買設備成功')

    # 設備：搬移（搬到空位、互換、取消、不能搬到未擴建的位置）
    slots = lambda: page.evaluate('DD_UI.state().slots')
    cash0 = page.evaluate('DD_UI.state().cash')
    page.click('.slot[data-i="0"]')
    page.click('[data-act=moveFx]')
    check(page.locator('.floor.moving').count() == 1 and page.locator('.slot.from').count() == 1 and page.locator('.slot.to').count() == 5, '搬移模式：來源變淡，五個可用位置亮起來')
    shot('06c-equip-move')
    no_overflow('設備（搬移中）')
    page.click('.slot[data-i="4"]')
    check(slots()[0] == 'shelf' and page.locator('.floor.moving').count() == 1 and '擴建' in page.locator('#toast').inner_text(), '不能搬到還沒擴建的位置，而且仍停在搬移模式')
    page.click('.slot[data-i="5"]')
    check(slots()[0] is None and slots()[5] == 'shelf' and page.locator('.floor.moving').count() == 0, '貨架搬到空位')
    check(page.locator('.slot.on').get_attribute('data-i') == '5', '搬完後選取框跟著設備走')
    page.click('[data-act=moveFx]')
    page.click('.slot[data-i="1"]')
    check(slots()[1] == 'shelf' and slots()[5] == 'fridge', '貨架和冷藏櫃互換位置')
    page.click('[data-act=moveFx]')
    page.click('[data-act=moveCancel]')
    check(page.locator('.floor.moving').count() == 0 and slots()[1] == 'shelf', '可以取消搬移')
    page.click('[data-act=moveFx]')
    page.click('[data-act=closeSheet]')
    page.click('.tabs [data-tab=equip]')
    check(page.locator('.floor.moving').count() == 0, '關掉分頁會離開搬移模式')
    check(page.evaluate('DD_UI.state().cash') == cash0, '搬設備不用錢')
    page.click('[data-act=closeSheet]')
    page.wait_for_timeout(200)
    shot('06d-store-after-move')
    # 店員：請第一位應徵者上大夜
    page.click('.tabs [data-tab=staff]')
    page.click('[data-act=hire][data-i="0"][data-shift="2"]')
    check(page.evaluate('DD_UI.state().staff.length') == 2, '雇用店員成功')
    shot('07-staff-after-hire')
    page.click('[data-act=closeSheet]')
    check(page.locator('#dayline .dl-bars i.dl-shut').count() == 0, '補上大夜班後，時間軸不再有不營業的時段')

    # 用測試掛鉤快轉三天，沿途處理事件與日結視窗
    reports = 0
    seen_event = False
    for _ in range(24 * 3 + 30):
        if page.evaluate('DD_UI.state().day') > 3 and not page.evaluate('!!DD_UI.ui.modal'):
            break
        if page.locator('[data-act=choose]').count():
            if not seen_event:
                seen_event = True
                shot('08-event')
            page.click('[data-act=choose] >> nth=0')
            page.click('[data-act=closeModal]')
        elif page.locator('[data-act=nextDay]').count():
            reports += 1
            if reports == 1:
                page.wait_for_timeout(200)
                shot('09-day-report')
                no_overflow('日結視窗')
            page.click('[data-act=nextDay]')
        elif page.locator('[data-act=closeModal]').count():
            page.click('[data-act=closeModal]')
        else:
            page.evaluate('DD_UI.tick()')
    check(reports >= 3, f'連續營業三天並看到日結（{reports} 次）')
    check(page.evaluate('DD_UI.state().history.length') >= 3, '歷史紀錄有累積')
    page.click('.tabs [data-tab=report]')
    page.wait_for_timeout(150)
    shot('10-report-with-history')
    page.click('[data-act=closeSheet]')
    page.click('[data-act=speed][data-v="1"]')
    page.wait_for_timeout(1800)
    shot('11-store-day4')
    page.click('[data-act=speed][data-v="0"]', force=True)
    settle()

    # 存檔與讀檔
    page.click('[data-act=menu]')
    shot('12-menu')
    page.click('[data-act=quit]')
    check(page.locator('[data-act=continue]').count() == 1, '回標題後出現「繼續經營」')
    page.reload()
    page.wait_for_timeout(400)
    page.click('[data-act=continue]')
    check(page.evaluate('DD_UI.state().day') >= 4, '重新整理後可以讀回存檔')
    check(page.locator('#dayline .dl-bars i.dl-past').count() >= 1, '讀檔後時間軸保留今天已經過去的時段')

    # 小螢幕：店面畫面仍然看得到、沒有溢出
    for w, h in [(360, 640), (320, 568)]:
        page.set_viewport_size({'width': w, 'height': h})
        page.wait_for_timeout(250)
        box = page.locator('#scene').bounding_box()
        check(box and box['height'] >= 150 and box['width'] <= w, f'{w}×{h}：店面畫面高度 {box["height"]:.0f}px')
        ww = page.evaluate('Math.max(...[...document.querySelectorAll("#app *")].map(e => e.getBoundingClientRect().right))')
        check(ww <= w + 1, f'{w}×{h}：沒有橫向溢出（最右 {ww:.0f}px）')
        shot(f'14-small-{w}x{h}')
    page.set_viewport_size({'width': 390, 'height': 700})
    page.wait_for_timeout(250)

    # 快轉到第 30 天結算：成績單、最佳紀錄
    page.evaluate('() => { const s = DD_UI.state(); s.day = 30; s.t = 23; s.pending = null; s.scripted = []; s.todayEvent = null; DD_UI.tick(); }')
    for _ in range(6):
        if page.locator('#modal .medal').count():
            break
        if page.locator('[data-act=choose]').count():
            page.click('[data-act=choose] >> nth=0')
            page.click('#modal [data-act=closeModal]')
            page.evaluate('DD_UI.tick()')
        elif page.locator('[data-act=nextDay]').count():
            page.click('[data-act=nextDay]')
    check(page.locator('#modal .medal').count() == 1, '第 30 天結算後出現成績單')
    shot('15-result')
    tier = page.evaluate('DD_UI.state().medal.tier')
    page.click('[data-act=quit]')
    best = page.evaluate("JSON.parse(localStorage.getItem('dingdong-mart-pref-v1')).best")
    check((best.get('kh3', 0) if tier else 'kh3' not in best) == (tier if tier else True), f'成績（第 {tier} 級）有記到最佳紀錄')
    page.click('[data-act=continue]')
    check(page.evaluate('DD_UI.state().day') == 31, '拿到成績後可以繼續自由經營')
    page.click('[data-act=menu]')
    shot('12b-menu')
    page.click('#modal [data-act=closeModal]')

    # 換班：音樂跟著換
    page.evaluate('() => { const s = DD_UI.state(); s.pending = null; s.scripted = []; s.todayEvent = null; while (s.t < 8) { DD_UI.tick(); if (s.pending) { DD.resolveEvent(s, 0); } } }')
    settle()
    check(page.evaluate('DD_AUDIO.shift') == 1, '到了 14:00 換成晚班的音樂')

    # 連鎖：現金到 300 萬 → 里程碑 → 開分店 → 切換 → 退休 → 名人堂
    page.evaluate('() => { const s = DD_UI.state(); s.cash = 3400000; s.t = 23; s.pending = null; s.scripted = []; s.todayEvent = null; DD_UI.tick(); }')
    for _ in range(6):
        if page.locator('#modal .milestone').count():
            break
        if page.locator('[data-act=choose]').count():
            page.click('[data-act=choose] >> nth=0')
            page.click('#modal [data-act=closeModal]')
            page.evaluate('DD_UI.tick()')
        elif page.locator('[data-act=nextDay]').count():
            page.click('[data-act=nextDay]')
    check(page.locator('#modal .milestone').count() == 1, '現金破 300 萬，日結後出現里程碑')
    shot('16-milestone')
    page.click('#modal [data-act=branch]')
    page.click('[data-act=city][data-id=taipei]')
    shot('17-branch-pick')
    no_overflow('開分店選址')
    cash0 = page.evaluate('DD_UI.chain().stores[0].cash')
    page.click('[data-act=branchStart]')
    check(page.evaluate('DD_UI.chain().stores.length') == 2 and page.evaluate('DD_UI.chain().active') == 1, '分店開幕，畫面切到新分店')
    check(page.evaluate('DD_UI.chain().stores[0].cash') == cash0 - 1500000 == page.evaluate('DD_UI.state().cash'), '扣了頂讓金，兩家店共用一個錢包')
    check(page.locator('#stores button').count() == 3 and not page.locator('#stores').is_hidden(), '出現分店列（兩家店＋總部）')
    page.click('.tabs [data-tab=staff]')
    check('三個班都要請人' in page.locator('#sheet .sheet-body').inner_text() and page.locator('[data-act=ownerShift]').count() == 0, '分店的店員頁沒有「店長站哪一班」')
    page.click('[data-act=hire][data-i="0"][data-shift="2"]')
    page.click('[data-act=closeSheet]')
    check(page.evaluate('DD_UI.chain().stores[0].cash') == page.evaluate('DD_UI.chain().stores[1].cash'), '在分店操作後錢包仍然同步')
    page.click('[data-act=speed][data-v="2"]')
    page.wait_for_timeout(1800)
    page.click('[data-act=speed][data-v="0"]', force=True)
    settle()
    shot('18-branch-store')
    no_overflow('分店營業畫面')
    t0, t1 = page.evaluate('DD_UI.chain().stores.map(s => s.t)')
    check(t0 == t1 and page.evaluate('DD_UI.chain().stores[0].today.customers') > 0, '沒在看的總店也同步營業')
    page.click('#stores [data-act=switchStore][data-i="0"]')
    check(page.evaluate('DD_UI.state().name') == '測試商店', '切換回總店')
    page.click('#stores [data-act=hq]')
    shot('19-hq')
    no_overflow('總部')
    check(page.locator('#modal .card.buy').count() == 2, '總部列出兩家店')
    page.click('#modal [data-act=closeModal]')
    page.evaluate('location.reload()')
    page.wait_for_timeout(600)
    page.click('[data-act=continue]')
    check(page.evaluate('DD_UI.chain().stores.length') == 2, '重新整理後兩家店都讀得回來')
    page.evaluate('() => { const c = DD_UI.chain(); c.stores.forEach(s => { s.cash = 3100000; s.day = 151; }); c.totalRev = 6543210; }')
    page.click('.hud [data-act=goal]')
    page.click('#modal [data-act=retire]')
    page.click('#modal [data-act=retireConfirmed]')
    check(page.locator('#modal .hall tr.me').count() == 1, '退休後成績記在這台裝置上')
    shot('20-retired')
    page.click('#modal [data-act=submitScore]')
    page.wait_for_selector('#bTop tr.me')
    row = page.locator('#bTop tr.me').inner_text()
    check('測試商店' in row and '150 天' in row and '$6,543,210' in row, '成績送上線上排行榜，並標出自己那一列')
    check('第 1 名' in page.locator('#toast').inner_text(), '送出後告訴玩家目前第幾名')
    shot('21-board-ranked')
    no_overflow('排行榜（有成績與留言）')
    page.click('#modal [data-act=quit]')
    check(page.locator('[data-act=continue]').count() == 0, '退休後存檔結束，標題不再有「繼續經營」')
    page.click('[data-act=hall]')
    page.wait_for_selector('#bTop tr')
    check(page.locator('#bTop tr').count() == 2 and page.locator('#bMsgs li').count() == 1, '回到標題再打開，線上的成績與留言都還在')
    page.click('#modal [data-act=closeModal]')
    # 後端連不上時：說清楚，而且本機紀錄照常顯示
    seen = len(errors)
    page.route(API + '**', lambda r: r.abort())
    page.click('[data-act=hall]')
    page.wait_for_selector('#bTop .bad')
    check('連不到排行榜' in page.locator('#bTop').inner_text() and page.locator('#modal .hall tr.me, #modal .hall tr').count() >= 2, '後端連不上時顯示原因，本機紀錄照常顯示')
    page.click('#modal [data-act=closeModal]')
    page.unroute(API + '**')
    del errors[seen:]  # 這一段是故意把連線切斷，瀏覽器記下的連線失敗不算錯誤

    # 桌機寬度也要正常
    page.set_viewport_size({'width': 1200, 'height': 800})
    page.wait_for_timeout(300)
    shot('13-desktop')

    # 後端網址留空時：只顯示本機紀錄，不會發出任何連線
    ctx2 = browser.new_context(viewport={'width': 390, 'height': 700})
    ctx2.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
    ctx2.add_init_script("window.DD_CONFIG = { api: '' };")
    page2 = ctx2.new_page()
    reqs = []
    page2.on('request', lambda r: reqs.append(r.url) if r.url.startswith('http') and 'fonts.googleapis' not in r.url else None)
    page2.goto('file://' + os.path.join(ROOT, PAGE))
    page2.wait_for_timeout(400)
    page2.click('[data-act=hall]')
    check('還沒有開通' in page2.locator('#modal').inner_text() and page2.locator('#cText').count() == 0, '沒設定後端時，排行榜說明尚未開通')
    check(not reqs, '沒設定後端時不會連到任何外部網址' + (('：' + reqs[0]) if reqs else ''))
    browser.close()

mock.terminate()

check(not errors, '沒有 JavaScript 錯誤' + ('：' + ' | '.join(errors[:3]) if errors else ''))
failed = [m for ok, m in checks if not ok]
print(f'\n介面冒煙測試：{len(checks) - len(failed)}/{len(checks)} 通過，截圖在 {OUT}')
sys.exit(1 if failed else 0)
