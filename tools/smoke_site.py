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
        if last['id']=='2026-11-12_2258':
            assert page.locator('#capture-date').inner_text() == 'Nov 12, 2026'
            assert page.locator('#stat-hours').inner_text() == '22.4h'
            assert page.locator('#stat-floor').inner_text() == '53.8B'
            assert page.locator('.proof').count() == 5
            assert page.locator('.proof.earlier-proof').count() == 0
            assert page.locator('.proof.profile-proof[data-proof="PU0001"]').count() == 1
            assert page.locator('.movement-item').count() >= 50
            for image_id in ('EV0169','EV0172','PU0001'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                if image_id=='PU0001':
                    assert 'not a new board rank' in page.locator('#lightbox-caption').inner_text()
                page.locator('#lightbox button').click()
            apathy=page.locator('.movement-item[data-player="id:1316700350"]')
            assert '269B' in apathy.inner_text()
            assert '0h 42m' in apathy.inner_text()
            assert 'no multiplier +43.8M/hr' in apathy.inner_text()
            assert 'no multiplier +741.6M/hr' in apathy.inner_text()
            assert 'no later rank was photographed' in apathy.inner_text()
            assert '73.6B' in apathy.locator('.gaps').inner_text()  # Simultaneous board gap, not the later profile balance.
            apathy.click()
            assert '269,064,293,664 C$' in page.locator('.profile-update-detail').inner_text()
            assert '+519.1M' in page.locator('.profile-update-detail').inner_text()
            assert '0h 42m' in page.locator('.profile-update-detail').inner_text()
            assert 'PU0001' in page.locator('.profile-update-detail a').inner_text()
            assert 'PU0001' in page.locator('.profile-history a').first.get_attribute('data-proof')
            page.screenshot(path=str(ROOT/'preview-apathy-desktop.png'),full_page=True)
            page.locator('#profile-clear').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text() == 'Nov 11, 2026'
            assert page.locator('.proof').count() == 8
            page.locator('#next').click()
        page.locator("#chart.js-plotly-plot").wait_for(timeout=20000)
        assert page.locator("#chart").evaluate("el => el.data.some(t => t.meta && t.meta.key)")
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.type") == "category"
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.tickvals.includes('2026-10-18')")
        assert page.locator('#chart').evaluate("el => {const line=el.data.find(trace=>trace.meta?.key==='id:1316700350');return line.y[line.x.indexOf('2026-11-12')];}")==269064293664
        assert [event['day_key'] for event in data['checkpoints'] if event['day_key'] in ('2026-10-31','2026-11-07')]==['2026-10-31','2026-11-07']
        assert page.evaluate("patchEvents.map(event=>[event.day,localDay(event.at)])")==[['2026-10-31','2026-10-31'],['2026-11-07','2026-11-07']]
        assert set(page.locator('#chart').evaluate('el=>el.layout.annotations.map(event=>event.text)'))=={'v2.08','v2.09.1'}
        assert page.locator('.event-card').count()==2
        assert 'https://fischipedia.org/wiki/2.08#2.08.0'==page.locator('.event-card[data-event="venue-encore"] a').first.get_attribute('href')
        assert 'https://fischipedia.org/wiki/2.09#2.09.1'==page.locator('.event-card[data-event="stellarwave-change"] a').first.get_attribute('href')
        assert 'Oct 31, 2026, 11:00 AM' in page.locator('.event-card[data-event="venue-encore"]').inner_text()
        assert 'Nov 7, 2026, 8:34 PM' in page.locator('.event-card[data-event="stellarwave-change"]').inner_text()
        assert page.locator('.event-card[data-event="stellarwave-change"] a').nth(1).get_attribute('href')=='https://fischipedia.org/wiki/File:Stellarwave_Melody.png'
        page.locator('.event-card[data-event="stellarwave-change"] .event-jump').click()
        assert page.locator('#capture-date').inner_text()=='Nov 7, 2026'
        page.locator('.event-card[data-event="venue-encore"] .event-jump').click()
        assert page.locator('#capture-date').inner_text()=='Oct 31, 2026'
        assert page.locator('#profile-range').is_hidden()
        page.locator('#search').fill('ismyaimbotworking')
        assert page.locator('#profile-range').is_visible()
        assert page.locator('#range-start').input_value()=='2026-10-10'
        assert page.locator('#range-end').input_value()=='2026-11-12'
        full_rate=page.locator('.profile-stats > div').filter(has_text='AVERAGE OBSERVED NET RATE').locator('b').inner_text()
        page.locator('#range-start').fill('2026-11-07')
        assert page.locator('#range-start').input_value()=='2026-11-07'
        assert 'from=2026-11-07' in page.url and 'to=2026-11-12' in page.url
        assert page.locator('.profile-history a').count()==6
        assert '6 pictured readings' in page.locator('#range-summary').inner_text()
        recent_rate=page.locator('.profile-stats > div').filter(has_text='AVERAGE OBSERVED NET RATE').locator('b').inner_text()
        assert recent_rate!=full_rate
        selected_rows=[row for row in data['observations'] if row['key']=='id:1316700350' and '2026-11-07'<=row['day_key']<='2026-11-12']
        from datetime import datetime
        expected=(int(selected_rows[-1]['balance'])-int(selected_rows[0]['balance']))/((datetime.fromisoformat(selected_rows[-1]['at'].replace('Z','+00:00'))-datetime.fromisoformat(selected_rows[0]['at'].replace('Z','+00:00'))).total_seconds()/3600)
        actual=page.evaluate("(()=>{const r=rangedHistory('id:1316700350');return timeRate(BigInt(r.at(-1).balance)-BigInt(r[0].balance),hours(r[0].at,r.at(-1).at))})()")
        assert abs(actual-expected)<1
        assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-07') && !el.layout.xaxis.tickvals.includes('2026-10-31')")
        page.locator('#range-start').fill('2026-11-12')
        assert page.locator('.profile-history a').count()==1
        assert page.locator('.profile-stats > div').filter(has_text='AVERAGE OBSERVED NET RATE').locator('b').inner_text()=='—'
        assert 'two are required' in page.locator('#range-summary').inner_text()
        page.locator('#range-start').fill('2026-10-18')
        page.locator('#range-end').fill('2026-10-18')
        assert 'No photo-checked' in page.locator('#profile-content').inner_text()
        page.locator('#range-all').click()
        page.locator('#chart.js-plotly-plot').wait_for(timeout=20000)
        assert page.locator('#profile-range').is_visible() and page.locator('.profile-history a').count()>1
        page.locator('#range-week').click()
        assert page.locator('#range-start').input_value()=='2026-11-06'
        page.reload(wait_until='domcontentloaded')
        page.locator('#profile-title').get_by_text('ismyaimbotworking').wait_for(timeout=20000)
        assert page.locator('#range-start').input_value()=='2026-11-06'
        assert page.locator('#range-end').input_value()=='2026-11-12'
        page.locator('#clear').click()
        assert page.locator('#profile-range').is_hidden()
        assert 'from=' not in page.url and 'to=' not in page.url
        assert page.locator('.highlight-card').count()==0
        assert page.locator('.standout-teaser').is_visible()
        standouts=page.evaluate("standoutRows().map(item=>({day:item.cp.day_key,name:item.row.username,gain:item.change.delta.toString(),climb:item.climb}))")
        assert len(standouts)>8, "The archive-wide feed should paginate beyond its first eight flags"
        assert any(item['day']=='2026-11-12' and item['name']=='Ceruleanflare2' and item['gain']=='26027711662' and item['climb']==6 for item in standouts)
        assert any(item['day']=='2026-11-10' and item['name']=='Ceruleanflare2' for item in standouts)
        repeated=page.evaluate("standoutRows().filter(item=>item.row.username==='Ceruleanflare2' && item.repeatWith).map(item=>[item.cp.day_key,item.severity,item.repeatWith.cp.day_key,Math.round(Math.abs(hours(item.repeatWith.row.at,item.row.at))*10)/10])")
        assert ['2026-11-12','extreme','2026-11-10',49.5] in repeated
        assert ['2026-11-10','extreme','2026-11-12',49.5] in repeated
        assert page.evaluate("standoutRows().some(item=>!item.bigGain && item.climb>=5)")
        assert page.evaluate("standoutRows().some(item=>item.severity==='notable') && standoutRows().some(item=>item.severity==='high')")
        assert page.evaluate("standoutRows().every(item=>item.row.status==='verified' && item.change.old.status==='verified' && item.row.evidence.length && item.change.old.evidence.length && state.data.checkpoints[item.index-1].id===item.change.old.checkpoint)")
        assert f'{len(standouts)} pictured changes' in page.locator('#standout-teaser-summary').inner_text()
        analysis=browser.new_page(viewport={'width':1300,'height':930})
        analysis.on('pageerror',lambda error: errors.append(str(error)))
        analysis.goto(f'http://127.0.0.1:{server.server_address[1]}/standouts.html',wait_until='domcontentloaded')
        analysis.locator('#highlight-count').get_by_text(f'{len(standouts)} FLAGS').wait_for(timeout=20000)
        assert analysis.locator('.highlight-card').count()==8 and analysis.locator('#highlight-pages').is_visible()
        assert analysis.locator('#highlight-list').evaluate('el=>getComputedStyle(el).display')=='grid'
        assert analysis.locator('.standout-layout').evaluate('el=>{const [left,right]=el.children;const ratio=left.getBoundingClientRect().width/right.getBoundingClientRect().width;return ratio>1.8&&ratio<2.2}')
        assert 'Ceruleanflare2' in analysis.locator('#overview-content').inner_text()
        assert '26,027,711,662' in analysis.locator('#overview-content').inner_text()
        assert 'EV0166' in analysis.locator('#overview-content').inner_text() and 'EV0169' in analysis.locator('#overview-content').inner_text()
        assert 'two' not in analysis.locator('#overview-rate').inner_text().lower()
        analysis.locator('#overview-start').fill('2026-11-10')
        assert 'from=2026-11-10' in analysis.url and 'to=2026-11-12' in analysis.url
        assert '3 photographed points' in analysis.locator('#overview-rate').inner_text()
        analysis.locator('#overview-start').fill('2026-11-12')
        assert 'Two are needed' in analysis.locator('#overview-rate').inner_text()
        analysis.locator('#overview-all').click()
        assert 'from=' not in analysis.url
        analysis.locator('#flag-severity').select_option('extreme')
        assert 0<analysis.locator('.highlight-card').count()<=8
        assert analysis.locator('.highlight-card').evaluate_all("els=>els.every(el=>el.dataset.severity==='extreme')")
        analysis.locator('#flag-severity').select_option('all')
        analysis.locator('#flag-search').fill('Ceruleanflare2')
        assert 2<=analysis.locator('.highlight-card').count()<8
        analysis.locator('#flag-search').fill('')
        assert analysis.locator('#highlight-count').inner_text()==f'{len(standouts)} FLAGS'
        cerulean=next(p for p in data['players'] if p['name']=='Ceruleanflare2')
        latest_flag=f'.highlight-card[data-highlight-day="2026-11-12"][data-highlight-player="{cerulean["key"]}"]'
        for _ in range((len(standouts)+7)//8):
            if analysis.locator(latest_flag).count():break
            analysis.locator('#highlight-next').click()
        assert analysis.locator(latest_flag).count()==1
        assert analysis.locator(latest_flag).get_attribute('data-severity')=='extreme'
        assert '+26B' in analysis.locator(latest_flag).inner_text()
        assert '↑6 ranks' in analysis.locator(latest_flag).inner_text()
        assert 'Two ≥20B observed net changes' in analysis.locator(latest_flag).inner_text()
        assert '49.5h between later photos' in analysis.locator(latest_flag).inner_text()
        assert '255, 132, 149' in analysis.locator(latest_flag).evaluate('el=>getComputedStyle(el).borderColor')
        assert 'EV0166' in analysis.locator(f'{latest_flag} .highlight-proof-links').inner_text()
        assert 'EV0169' in analysis.locator(f'{latest_flag} .highlight-proof-links').inner_text()
        assert analysis.locator(f'{latest_flag} .highlight-proof-links a').evaluate_all("els=>els.length===2 && els.every(el=>el.href.includes('/evidence/screenshots/') && el.title.includes('SHA-256'))")
        analysis.screenshot(path=str(ROOT/'preview-standouts-desktop.png'),full_page=True)
        historical_flag=f'.highlight-card[data-highlight-day="2026-11-10"][data-highlight-player="{cerulean["key"]}"]'
        for _ in range((len(standouts)+7)//8):
            if analysis.locator(historical_flag).count():break
            analysis.locator('#highlight-next').click()
        assert analysis.locator(historical_flag).count()==1
        analysis.locator(f'{historical_flag} .highlight-open').click()
        assert 'Nov 10, 2026' in analysis.locator('#overview-content').inner_text()
        assert 'day=2026-11-10' in analysis.url and f'player={cerulean["key"].replace(":","%3A")}' in analysis.url
        assert 'day=2026-11-10' in analysis.locator('.overview-dashboard-link').get_attribute('href')
        analysis.reload(wait_until='domcontentloaded')
        analysis.locator('#highlight-count').get_by_text(f'{len(standouts)} FLAGS').wait_for(timeout=20000)
        assert 'Nov 10, 2026' in analysis.locator('#overview-content').inner_text()
        analysis.set_viewport_size({'width':390,'height':840})
        analysis.wait_for_timeout(400)
        assert analysis.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 4')
        assert analysis.locator('.standout-layout').evaluate('el=>el.children[1].getBoundingClientRect().top>el.children[0].getBoundingClientRect().top')
        analysis.screenshot(path=str(ROOT/'preview-standouts-mobile.png'),full_page=True)
        analysis.close()
        page.goto(f'http://127.0.0.1:{server.server_address[1]}/?day=2026-11-10&player={cerulean["key"].replace(":","%3A")}',wait_until='domcontentloaded')
        page.locator('#capture-date').get_by_text('Nov 10, 2026').wait_for(timeout=20000)
        assert page.locator('#profile-title').inner_text()=='Ceruleanflare2'
        assert page.locator('#capture-slider').get_attribute('max')==str(total_days-1)
        page.locator('#next').click()
        assert 'day=2026-11-11' in page.url
        nov11=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-11-11')
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(nov11))
        assert page.locator("#capture-date").inner_text() == "Nov 11, 2026"
        assert all(cp['day_key']!='2026-11-12' for cp in data['checkpoints'] if cp['at'] <= '2026-11-12T06:36:00Z')
        assert '2026-11-12_0036' in data['checkpoints'][nov11]['daily_source_sessions']
        assert page.locator('.proof').count() >= 8
        assert page.locator('.proof.earlier-proof').count() >= 4
        if data['checkpoints'][nov11]['id']=='2026-11-12_0036':
            assert page.locator("#stat-coverage").inner_text() == "50 / 50"
            assert page.locator(".proof").count() == 8
            assert page.locator(".movement-item").count() >= 50  # Confirmed Top-50 exits may add entries.
            assert page.locator('#stat-floor').inner_text() == '53.8B'
            assert page.locator('#stat-hours').inner_text() == '27.1h'
            ismy=next(p for p in data['players'] if p['name']=='ismyaimbotworking')
            assert 'Rainbow-equivalent' in page.locator(f'.movement-item[data-player="{ismy["key"]}"]').inner_text()
        for image_id in ('EV0161','EV0165','EV0168'):
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
        assert "↑13" in page.locator(f'.movement-item[data-player="{cerulean["key"]}"] .rank-move.up').inner_text()
        assert page.locator(f'.movement-item[data-player="{cerulean["key"]}"] .rank-move.up').evaluate('el => getComputedStyle(el).color') != 'rgb(255, 152, 165)'
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(nov11))
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
        assert f"DAY {nov11:02d} / {total_days}" in page.locator("#capture-index").inner_text()
        assert page.locator("#capture-date").inner_text() == "Nov 10, 2026"
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
