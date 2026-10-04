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
    page = ctx.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.goto('file://' + os.path.join(ROOT, PAGE))
    page.wait_for_timeout(700)

    def shot(name):
        page.screenshot(path=os.path.join(OUT, name + '.png'))

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

    # 實際讓時間跑一下，確認客人會進來
    page.click('[data-act=speed][data-v="2"]')
    page.wait_for_timeout(2600)
    shot('05-running')
    check(page.evaluate('DD_UI.state().today.customers') > 0, '開始營業後有客人上門')
    page.click('[data-act=speed][data-v="0"]')

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

    # 用測試掛鉤快轉三天，沿途處理事件與日結視窗
    reports = 0
    for _ in range(24 * 3 + 30):
        if page.evaluate('DD_UI.state().day') > 3 and not page.evaluate('!!DD_UI.ui.modal'):
            break
        if page.locator('[data-act=choose]').count():
            if reports == 0 and not os.path.exists(os.path.join(OUT, '08-event.png')):
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

    # 存檔與讀檔
    page.click('[data-act=menu]')
    shot('12-menu')
    page.click('[data-act=quit]')
    check(page.locator('[data-act=continue]').count() == 1, '回標題後出現「繼續經營」')
    page.reload()
    page.wait_for_timeout(400)
    page.click('[data-act=continue]')
    check(page.evaluate('DD_UI.state().day') >= 4, '重新整理後可以讀回存檔')

    # 桌機寬度也要正常
    page.set_viewport_size({'width': 1200, 'height': 800})
    page.wait_for_timeout(300)
    shot('13-desktop')
    browser.close()

check(not errors, '沒有 JavaScript 錯誤' + ('：' + ' | '.join(errors[:3]) if errors else ''))
failed = [m for ok, m in checks if not ok]
print(f'\n介面冒煙測試：{len(checks) - len(failed)}/{len(checks)} 通過，截圖在 {OUT}')
sys.exit(1 if failed else 0)
