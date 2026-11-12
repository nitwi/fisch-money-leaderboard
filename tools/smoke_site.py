"""Exercise actual browser rendering, capture navigation, focus and proof lightbox."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
data=json.loads((ROOT/"site/data.json").read_text(encoding="utf-8"))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=ROOT / "site"))
Thread(target=server.serve_forever, daemon=True).start()
errors = []
try:
    with sync_playwright() as browser_tool:
        browser = browser_tool.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
        page = browser.new_page(viewport={"width": 1300, "height": 930})
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"http://127.0.0.1:{server.server_address[1]}/", wait_until="domcontentloaded")
        total_days=len(data['checkpoints'])
        page.locator("#capture-index").get_by_text(f"DAY {total_days:02d} / {total_days}",exact=False).wait_for(timeout=20000)
        last=data['checkpoints'][-1]
        assert page.locator("#capture-date").inner_text() == page.evaluate("dayLabel(state.data.checkpoints.at(-1).day_key)")
        assert page.locator("#stat-coverage").inner_text() == f"{last['verified']} / {last['coverage']}"
        assert page.locator(".proof").count() == len(last['evidence'])
        page.locator("#chart.js-plotly-plot").wait_for(timeout=20000)
        assert page.locator("#chart").evaluate("el => el.data.some(t => t.meta && t.meta.key)")
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.type") == "category"
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.tickvals.includes('2026-10-18')")
        nov12=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-11-12')
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(nov12))
        assert page.locator("#capture-date").inner_text() == "Nov 12, 2026"
        if data['checkpoints'][nov12]['id']=='2026-11-12_0036':
            assert page.locator("#stat-coverage").inner_text() == "50 / 50"
            assert page.locator(".proof").count() == 4
            assert page.locator(".movement-item").count() == 50
            assert page.locator('#stat-floor').inner_text() == '53.8B'
            assert page.locator('#stat-hours').inner_text() == '2h 03m'
            ismy=next(p for p in data['players'] if p['name']=='ismyaimbotworking')
            assert 'Rainbow-equivalent' in page.locator(f'.movement-item[data-player="{ismy["key"]}"]').inner_text()
        else:
            assert '2026-11-12_0036' in data['checkpoints'][nov12]['daily_source_sessions']
            assert page.locator('.proof').count() >= 4
            page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-11-11')))
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(nov12))
        for image_id in ('EV0165','EV0168'):
            page.locator(f'.proof[data-proof="{image_id}"]').click()
            page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
            page.locator('#lightbox button').click()
        assert "Rainbow-equivalent" in page.locator("#movement-list").inner_text()
        assert "(no multiplier" in page.locator("#movement-list").inner_text()
        assert page.evaluate("rainbowBase(15000000000n).toString()") == "10000000000"
        assert page.evaluate("Math.round(timeRate(15000000000n,24)/1.5)") == 416666667
        assert page.locator(".rainbow-static").first.evaluate("el => getComputedStyle(el).animationName") == "none"
        old_nov10=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-11-10')
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(old_nov10))
        cerulean=next(p for p in data['players'] if p['name']=='Ceruleanflare2')
        assert "↑13" in page.locator(f'.movement-item[data-player="{cerulean["key"]}"] .rank-move.up').inner_text()
        assert page.locator(f'.movement-item[data-player="{cerulean["key"]}"] .rank-move.up').evaluate('el => getComputedStyle(el).color') != 'rgb(255, 152, 165)'
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(nov12))
        page.screenshot(path=str(ROOT / "preview-desktop.png"), full_page=True)
        page.locator("#search").fill("LowTierNova")
        page.locator("#profile-title").get_by_text("LowTierNova").wait_for()
        lowtier=next(p for p in data['players'] if p['name']=='LowTierNova')
        assert page.locator(".profile-history a").count() == sum(row['key']==lowtier['key'] for row in data['observations'])
        page.locator(".movement-item[data-player='id:1316700350']").click()
        page.wait_for_timeout(200)
        assert not errors, errors
        assert page.locator("#profile-title").inner_text() == "ismyaimbotworking", page.locator("#profile-title").inner_text()
        assert page.locator("#profile-content .rainbow-static").count() > 0
        assert "player=id%3A1316700350" in page.url
        page.locator("#prev").click()
        assert f"DAY {nov12:02d} / {total_days}" in page.locator("#capture-index").inner_text()
        assert page.locator("#capture-date").inner_text() == "Nov 11, 2026"
        page.locator(".proof").first.click()
        assert page.locator("#lightbox").evaluate("el => el.open")
        page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
        page.locator("#lightbox button").click()
        morning_index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-04_0142')
        evening_index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-04_2100')
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(morning_index))
        assert "2 batches (10min)" in page.locator("#capture-index").inner_text()
        assert page.locator("#capture-date").inner_text() == "Nov 3, 2026"
        assert page.locator("#stat-coverage").inner_text() == "50 / 50"
        assert page.locator("#stat-floor").inner_text() != "UNKNOWN"
        assert page.locator(".proof").count() == 6
        assert page.locator(".proof[data-proof='EV0133']").count() == 1
        assert "Leaderboard day Nov 3, 2026" in page.locator("#evidence-subtitle").inner_text()
        assert page.evaluate("state.data.checkpoints[state.index-1].id") == "2026-11-02_2128"
        page.screenshot(path=str(ROOT / "preview-merged-desktop.png"), full_page=True)
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(evening_index))
        assert "2 batches (1min)" in page.locator("#capture-index").inner_text()
        assert page.locator("#capture-date").inner_text() == "Nov 4, 2026"
        assert page.locator("#stat-floor").inner_text() != "UNKNOWN"
        assert page.locator(".proof").count() == 6
        page.locator(".proof[data-proof='EV0134']").click()
        assert "9:01 PM" in page.locator("#lightbox-caption").inner_text()
        page.locator("#lightbox button").click()
        page.locator("#next").click()
        assert page.evaluate("state.data.checkpoints[state.index].id") == "2026-11-05_1930"
        october17=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-10-17')
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(october17))
        assert page.locator(".proof.earlier-proof").count() == 2
        assert page.locator("#stat-floor").inner_text() != "UNKNOWN"
        november7=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-11-07')
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(november7))
        assert page.locator("#capture-date").inner_text() == "Nov 7, 2026"
        assert "photo Nov 8, 2026, 1:16 AM" in page.locator("#capture-index").inner_text()
        assert page.locator(".proof").count() == 9
        assert page.locator(".proof.earlier-proof").count() == 1
        page.locator("#search").fill("LowTierNova")
        assert "photo Nov 8, 2026, 1:16 AM" in page.locator(".profile-history a").filter(has_text="Nov 7, 2026").first.inner_text()
        oct24=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-10-24')
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(oct24))
        metbepol=next(p for p in data['players'] if p['name']=='metbepol')
        assert "↓1" in page.locator(f'.movement-item[data-player="{metbepol["key"]}"] .rank-move.down').inner_text()
        assert page.locator(f'.movement-item[data-player="{metbepol["key"]}"] .rank-move.down').evaluate('el => getComputedStyle(el).color') != 'rgb(114, 233, 183)'
        capture_index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-10-20_1837')
        page.locator("#capture-slider").evaluate("(el, value) => { el.value = value; el.dispatchEvent(new Event('input', {bubbles:true})); }",str(capture_index))
        assert page.locator(".movement-item").count() > 25
        assert page.locator(".movement-item").count() == 50
        assert "OCR draft" not in page.locator("#movement-list").inner_text()
        page.locator("#capture-slider").evaluate("el => { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        assert "LEFT PICTURED TOP 50" in page.locator("#movement-list").inner_text()
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(total_days-1))
        page.set_viewport_size({"width": 390, "height": 840})
        page.wait_for_timeout(500)
        assert f"DAY {total_days:02d} / {total_days}" in page.locator("#capture-index").inner_text()
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 4"), "Mobile page overflows horizontally"
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.tickvals.length > el.layout.xaxis.ticktext.filter(Boolean).length")
        page.locator(".evidence-section").scroll_into_view_if_needed()
        page.wait_for_function("document.querySelector('.proof img').naturalWidth > 0")
        page.screenshot(path=str(ROOT / "preview-mobile.png"), full_page=True)
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(morning_index))
        assert page.locator(".proof").count() == 6
        assert page.locator("#stat-floor").inner_text() != "UNKNOWN"
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 4"), "Merged mobile snapshot overflows horizontally"
        assert not errors, errors
        browser.close()
    print("PASS: desktop/mobile capture navigation, movement, profile, screenshots and no browser exceptions")
finally:
    server.shutdown()
