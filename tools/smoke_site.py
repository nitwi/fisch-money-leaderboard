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
        page.locator("#capture-index").get_by_text("SNAPSHOT 33 / 33").wait_for(timeout=20000)
        assert page.locator("#stat-coverage").inner_text() == "50 / 50"
        assert page.locator(".proof").count() == 4
        assert page.locator(".movement-item").count() == 50
        assert "Rainbow-equivalent" in page.locator("#movement-list").inner_text()
        assert "(no multiplier" in page.locator("#movement-list").inner_text()
        assert page.evaluate("rainbowBase(15000000000n).toString()") == "10000000000"
        assert page.evaluate("Math.round(timeRate(15000000000n,24)/1.5)") == 416666667
        assert page.locator(".rainbow-static").first.evaluate("el => getComputedStyle(el).animationName") == "none"
        page.locator("#chart.js-plotly-plot").wait_for(timeout=20000)
        assert page.locator("#chart").evaluate("el => el.data.some(t => t.meta && t.meta.key)")
        page.screenshot(path=str(ROOT / "preview-desktop.png"), full_page=True)
        page.locator("#search").fill("LowTierNova")
        page.locator("#profile-title").get_by_text("LowTierNova").wait_for()
        assert page.locator(".profile-history a").count() == 33
        page.locator(".movement-item[data-player='id:1316700350']").click()
        page.wait_for_timeout(200)
        assert not errors, errors
        assert page.locator("#profile-title").inner_text() == "ismyaimbotworking", page.locator("#profile-title").inner_text()
        assert page.locator("#profile-content .rainbow-static").count() > 0
        assert "player=id%3A1316700350" in page.url
        page.locator("#prev").click()
        assert page.locator("#capture-index").inner_text() == "SNAPSHOT 32 / 33"
        page.locator(".proof").first.click()
        assert page.locator("#lightbox").evaluate("el => el.open")
        page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
        page.locator("#lightbox button").click()
        morning_index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-04_0142')
        evening_index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-04_2100')
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(morning_index))
        assert "2 batches · 10min span" in page.locator("#capture-index").inner_text()
        assert page.locator("#stat-coverage").inner_text() == "50 / 50"
        assert page.locator("#stat-floor").inner_text() != "UNKNOWN"
        assert page.locator(".proof").count() == 6
        assert page.locator(".proof[data-proof='EV0133']").count() == 1
        assert "Nov 4, 2026" in page.locator("#evidence-subtitle").inner_text()
        assert page.evaluate("state.data.checkpoints[state.index-1].id") == "2026-11-02_2128"
        page.screenshot(path=str(ROOT / "preview-merged-desktop.png"), full_page=True)
        page.locator("#capture-slider").evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(evening_index))
        assert "2 batches · 1min span" in page.locator("#capture-index").inner_text()
        assert page.locator("#stat-floor").inner_text() != "UNKNOWN"
        assert page.locator(".proof").count() == 6
        page.locator(".proof[data-proof='EV0134']").click()
        assert "9:01 PM" in page.locator("#lightbox-caption").inner_text()
        page.locator("#lightbox button").click()
        page.locator("#next").click()
        assert page.evaluate("state.data.checkpoints[state.index].id") == "2026-11-05_1930"
        capture_index=next(i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-10-20_1837')
        page.locator("#capture-slider").evaluate("(el, value) => { el.value = value; el.dispatchEvent(new Event('input', {bubbles:true})); }",str(capture_index))
        assert page.locator(".movement-item").count() > 25
        assert page.locator(".movement-item").count() == 50
        assert "OCR draft" not in page.locator("#movement-list").inner_text()
        page.locator("#capture-slider").evaluate("el => { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        assert "LEFT PICTURED TOP 50" in page.locator("#movement-list").inner_text()
        page.locator("#capture-slider").evaluate("el => { el.value = '32'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        page.set_viewport_size({"width": 390, "height": 840})
        page.wait_for_timeout(500)
        assert page.locator("#capture-index").inner_text() == "SNAPSHOT 33 / 33"
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 4"), "Mobile page overflows horizontally"
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
