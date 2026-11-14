"""Exercise a future third Saturday point beside two photo-verified originals."""
from copy import deepcopy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'site/data.json').read_text(encoding='utf-8'))
base=next(cp for cp in data['checkpoints'] if cp['id']=='2026-11-14_1128')
kept={'2026-11-14_1124','2026-11-14_1128'}
data['checkpoints']=[cp for cp in data['checkpoints'] if cp['day_key']<'2026-11-14' or cp['id'] in kept]
data['observations']=[row for row in data['observations'] if row['day_key']<'2026-11-14' or row['checkpoint'] in kept]
data['captures']=[cp for cp in data['captures'] if cp['id'] in kept or cp['at']<='2026-11-14T17:28:00Z']
data['sessions']=[cp for cp in data['sessions'] if cp['day_key']<'2026-11-14' or cp['id'] in kept]
source=[row for row in data['observations'] if row['checkpoint']==base['id']]
ids=['2026-11-14_1124','2026-11-14_1128','2026-11-14_2100']
for prior in data['checkpoints']:
    if prior['day_key']=='2026-11-14':prior['day_snapshot_count']=3
capture_id,at='2026-11-14_2100','2026-11-15T03:00:00Z'
cp=deepcopy(base)
cp.update(id=capture_id,at=at,day_key='2026-11-14',local='2026-11-14T21:00:00-06:00',
          source_checkpoints=[capture_id],captured_from=at,captured_to=at,
          earlier_session_ids=ids[:2],daily_source_sessions=ids,
          day_snapshot_number=3,day_snapshot_count=3,early_am_rollover=False)
data['checkpoints'].append(cp)
data['captures'].append(cp)
data['sessions'].append({**cp,'used_as_daily':True})
for original in source:
    row={**original,'id':f'{capture_id}_R{original["rank"]:02d}',
         'checkpoint':capture_id,'day_key':'2026-11-14','at':at,
         'source_checkpoint':capture_id,'source_checkpoints':[capture_id]}
    if original['key']=='id:1316700350':row['balance']='296000000000'
    data['observations'].append(row)

class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*_):pass

server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=ROOT/'site'))
Thread(target=server.serve_forever,daemon=True).start()
errors=[]
try:
    with sync_playwright() as tool:
        browser=tool.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
        context=browser.new_context(viewport={'width':1300,'height':930})
        context.route('**/data.json',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps(data)))
        page=context.new_page()
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_address[1]}/',wait_until='domcontentloaded')
        page.locator('#capture-index').get_by_text('SATURDAY PHOTO 3/3').wait_for(timeout=20000)
        page.locator('#chart.js-plotly-plot').wait_for(timeout=20000)
        assert page.locator('#capture-date').inner_text()=='Nov 14, 2026'
        assert 'DAY 35 / 35' in page.locator('#capture-index').inner_text()
        assert page.locator('#chart').evaluate("el=>['2026-11-14','2026-11-14#2','2026-11-14#3'].every(day=>el.layout.xaxis.tickvals.includes(day))")
        assert page.locator('#chart').evaluate("el=>{const line=el.data.find(t=>t.meta?.key==='id:1316700350');return line.y[line.x.indexOf('2026-11-14#2')]-line.y[line.x.indexOf('2026-11-14')];}")==25315072200
        assert page.locator('#chart').evaluate("el=>el.layout.annotations.some(mark=>mark.text==='SELL') && el.layout.annotations.some(mark=>mark.text==='SAT 1')")
        assert page.locator('.event-card[data-event="weekend-sell"]').count()==1
        page.locator('#chart g.annotation').filter(has_text='SELL').click()
        assert 'snapshot=2026-11-14_1128' in page.url
        page.locator('#next').click()
        page.locator('.event-card[data-event="weekend-sell"] .event-jump').click()
        assert 'SATURDAY PHOTO 2/3' in page.locator('#capture-index').inner_text()
        assert 'MAJOR WEEKEND SELL POINT' in page.locator('#capture-index').inner_text()
        assert page.locator('#stat-hours').inner_text()=='0h 04m'
        assert 'snapshot=2026-11-14_1128' in page.url
        apathy=page.locator('.movement-item[data-player="id:1316700350"]')
        assert '+25.3B' in apathy.inner_text()
        page.locator('#prev').click()
        assert 'SATURDAY PHOTO 1/3' in page.locator('#capture-index').inner_text()
        assert 'DAY 35 / 35' in page.locator('#capture-index').inner_text()
        page.locator('#next').click()
        page.locator('#next').click()
        assert 'SATURDAY PHOTO 3/3' in page.locator('#capture-index').inner_text()
        page.locator('#search').fill('ismyaimbotworking')
        page.locator('#range-start').fill('2026-11-14')
        assert page.locator('.profile-history a').count()==3
        assert '3 pictured readings' in page.locator('#range-summary').inner_text()
        assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-14#3')")
        analysis=context.new_page()
        analysis.on('pageerror',lambda error:errors.append(str(error)))
        analysis.goto(f'http://127.0.0.1:{server.server_address[1]}/standouts.html',wait_until='domcontentloaded')
        analysis.locator('#highlight-count').get_by_text('FLAGS',exact=False).wait_for(timeout=20000)
        sell=analysis.locator('.highlight-card[data-highlight-day="2026-11-14"]').filter(has_text='ismyaimbotworking')
        assert sell.count()==1 and sell.get_attribute('data-severity')=='extreme'
        assert '+25.3B' in sell.inner_text() and '0h 04m' in sell.inner_text()
        sell.locator('.highlight-open').click()
        assert 'snapshot=2026-11-14_1128' in analysis.url
        assert '25,315,072,200' in analysis.locator('#overview-content').inner_text()
        analysis.set_viewport_size({'width':390,'height':840})
        analysis.wait_for_timeout(350)
        assert analysis.evaluate('document.documentElement.scrollWidth<=window.innerWidth+4')
        assert not errors,errors
        browser.close()
    print('PASS: three distinct Nov 14 points under one Saturday; selectable sell marker, actual 4-minute delta, range and standouts on desktop/mobile')
finally:
    server.shutdown()
