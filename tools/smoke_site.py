"""Exercise actual browser rendering, capture navigation, focus and proof lightbox."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


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
        page.locator("#capture-index").get_by_text("CAPTURE 35 / 35").wait_for(timeout=20000)
        assert page.locator("#stat-coverage").inner_text() == "50 / 50"
        assert page.locator(".proof").count() == 4
        assert page.locator(".movement-item").count() == 50
        page.locator("#chart.js-plotly-plot").wait_for(timeout=20000)
        assert page.locator("#chart").evaluate("el => el.data.some(t => t.meta && t.meta.key)")
        page.screenshot(path=str(ROOT / "preview-desktop.png"), full_page=True)
        page.locator("#search").fill("LowTierNova")
        page.locator("#profile-title").get_by_text("LowTierNova").wait_for()
        assert page.locator(".profile-history a").count() > 20
        page.locator("#prev").click()
        assert page.locator("#capture-index").inner_text() == "CAPTURE 34 / 35"
        page.locator(".proof").first.click()
        assert page.locator("#lightbox").evaluate("el => el.open")
        page.locator("#lightbox button").click()
        page.locator("#capture-slider").evaluate("el => { el.value = '1'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        assert "LEFT PICTURED TOP 50" in page.locator("#movement-list").inner_text()
        page.locator("#capture-slider").evaluate("el => { el.value = '34'; el.dispatchEvent(new Event('input', {bubbles:true})); }")
        page.set_viewport_size({"width": 390, "height": 840})
        assert page.locator("#capture-index").inner_text() == "CAPTURE 35 / 35"
        page.screenshot(path=str(ROOT / "preview-mobile.png"), full_page=True)
        assert not errors, errors
        browser.close()
    print("PASS: desktop/mobile capture navigation, movement, profile, screenshots and no browser exceptions")
finally:
    server.shutdown()
