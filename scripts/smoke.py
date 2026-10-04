"""介面冒煙測試：用無頭瀏覽器實際點過一輪，確認沒有 JavaScript 錯誤、畫面沒有橫向溢出。
用法：python3 scripts/smoke.py [輸出截圖的資料夾] [要測的 html，預設 index.html]
這是 loop engineering 的「驗證閘門」之一。"""
import os
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


with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={'width': 390, 'height': 700}, device_scale_factor=2, has_touch=True)
    # 網路字型在測試裡一律回空白樣式：沒有網路的環境也能跑，而且每次用同一套備用字型，截圖才比得起來
    ctx.route('**/fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=''))
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

    # 進貨：調價格與目標
    page.click('.tabs [data-tab=stock]')
    before = page.evaluate('DD_UI.state().price.tea')
    page.click('.prod[data-pid=tea] [data-act=price][data-d="5"]')
    check(page.evaluate('DD_UI.state().price.tea') == before + 5, '調漲售價有生效')
    page.evaluate('''() => { const r = document.querySelector('.prod[data-pid=tea] input[type=range]'); r.value = 120; r.dispatchEvent(new Event('input', {bubbles: true})); r.dispatchEvent(new Event('change', {bubbles: true})); }''')
    check(page.evaluate('DD_UI.state().target.tea') == 120, '拉桿調整進貨目標有生效')

    # 設備：買一台鮮食櫃
    page.click('.tabs [data-tab=equip]')
    page.click('[data-act=buyFx][data-k=fresh]')
    check(page.evaluate('DD.fixtureCount(DD_UI.state(), "fresh")') == 1, '買設備成功')
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
    page.click('[data-act=quit]')

    # 桌機寬度也要正常
    page.set_viewport_size({'width': 1200, 'height': 800})
    page.wait_for_timeout(300)
    shot('13-desktop')
    browser.close()

check(not errors, '沒有 JavaScript 錯誤' + ('：' + ' | '.join(errors[:3]) if errors else ''))
failed = [m for ok, m in checks if not ok]
print(f'\n介面冒煙測試：{len(checks) - len(failed)}/{len(checks)} 通過，截圖在 {OUT}')
sys.exit(1 if failed else 0)
