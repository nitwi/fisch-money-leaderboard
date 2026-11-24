"""Exercise actual browser rendering, capture navigation, focus and proof lightbox."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from datetime import datetime, timedelta
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
data=json.loads((ROOT/"site/data.json").read_text(encoding="utf-8"))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def assert_chart_scale(page):
    assert page.locator('#chart').evaluate("""el => {
        const values=el.data.flatMap(trace=>trace.y||[]).filter(Number.isFinite);
        const peak=Math.max(...values), [lower,upper]=el.layout.yaxis.range;
        return el.data.every(trace=>trace.meta?.key!=='id:8144154137')
            && values.length>0 && Number.isFinite(peak) && peak>0
            && lower===0 && Number.isFinite(upper) && upper>peak && upper<=peak*1.1;
    }"""), 'Chart should fit all plotted balances with modest headroom and retain the existing outlier exclusion'


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
        calendar_days=len({cp['day_key'] for cp in data['checkpoints']})
        page.locator("#capture-index").get_by_text(f"DAY {calendar_days:02d} / {calendar_days}",exact=False).wait_for(timeout=20000)
        last=data['checkpoints'][-1]
        last_day=last['day_key']
        assert page.locator("#capture-date").inner_text() == page.evaluate("dayLabel(state.data.checkpoints.at(-1).day_key)")
        assert page.locator("#stat-coverage").inner_text() == f"{last['verified']} / {last['coverage']}"
        assert page.locator(".proof").count() == len(last['evidence'])
        page.locator('#chart.js-plotly-plot').wait_for(timeout=20000)
        assert_chart_scale(page)
        assert 'Nov 17\'s #1 outlier is omitted' in page.locator('#chart-subtitle').inner_text()
        assert 'day=2026-11-17' in page.locator('#chart-subtitle a').get_attribute('href')
        if last['id']=='2026-11-22_2213':
            assert page.locator('#capture-date').inner_text()=='Nov 22, 2026'
            assert '10:13 PM' in page.locator('#capture-index').inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' not in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='24.0h'
            assert page.locator('#stat-floor').inner_text()=='57.9B'
            assert page.locator('#stat-largest').inner_text()=='+3.1B'
            assert page.locator('#stat-largest-name').inner_text()=='Aumjung8267'
            assert page.locator('.proof').count()==4
            apathy=page.locator('.movement-item[data-player="id:1316700350"]')
            assert '#1 → #1' in apathy.inner_text() and '−1.9M observed net C$' in apathy.inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' not in apathy.inner_text()
            apathy.click()
            assert page.locator('.profile-stats > div').filter(has_text='WEEKLY AVG INCLUDING WEEKEND SELL').locator('b').inner_text()=='+44.4B/week'
            assert page.locator('.profile-stats > div').filter(has_text='DAILY AVG (WEEKLY ÷ 7)').locator('b').inner_text()=='+6.3B/day'
            assert page.evaluate("(()=>{const m=weekendAverages('id:1316700350');return m.latest.id==='2026-11-21_2214' && m.first.checkpoint==='2026-11-14_2223' && m.last.checkpoint==='2026-11-22_2213' && m.delta===50811319110n})()")
            page.locator('#profile-clear').click()
            for image_id in ('EV0220','EV0221','EV0222','EV0223'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 21, 2026'
            assert 'WEEKEND SETTLEMENT BASELINE' in page.locator('#capture-index').inner_text()
            assert page.locator('.proof[data-proof="EV0216"]').count()==1
            page.locator('#next').click()
        if last['id']=='2026-11-21_2214':
            assert page.locator('#capture-date').inner_text()=='Nov 21, 2026'
            assert '10:14 PM' in page.locator('#capture-index').inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='23.3h'
            assert page.locator('#stat-floor').inner_text()=='58B'
            assert page.locator('#stat-largest').inner_text()=='+43.7B'
            assert 'weekly settlement step' in page.locator('#stat-largest-name').inner_text()
            apathy=page.locator('.movement-item[data-player="id:1316700350"]')
            assert '#2 ↗ #1' in apathy.inner_text() and '+43.7B observed net C$' in apathy.inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' in apathy.inner_text() and 'NOTABLE +8B' in apathy.inner_text()
            assert '/hr' not in apathy.inner_text()
            apathy.click()
            weekly=page.locator('.profile-stats > div').filter(has_text='WEEKLY AVG INCLUDING WEEKEND SELL')
            daily=page.locator('.profile-stats > div').filter(has_text='DAILY AVG (WEEKLY ÷ 7)')
            assert weekly.locator('b').inner_text()=='+50.8B/week'
            assert daily.locator('b').inner_text()=='+7.2B/day'
            assert 'Nov 14, 2026' in weekly.inner_text() and 'Nov 21, 2026' in weekly.inner_text()
            assert 'includes Nov 21, 2026 weekend sell' in weekly.inner_text()
            assert page.evaluate("(()=>{const metric=weekendAverages('id:1316700350');return metric.latest.id==='2026-11-21_2214' && metric.first.checkpoint==='2026-11-14_2223' && metric.last.balance==='346829902904' && metric.delta===50813251496n && Math.abs(metric.weekly-metric.daily*7)<1})()")
            page.locator('#range-end').fill('2026-11-20')
            assert 'Nov 14, 2026 weekend sell' in weekly.inner_text()
            assert page.evaluate("(()=>{const metric=weekendAverages('id:1316700350');return metric.latest.id==='2026-11-14_2223' && metric.first.day_key==='2026-11-07' && metric.last.checkpoint==='2026-11-20_2256' && Math.abs(metric.weekly-metric.daily*7)<1})()")
            assert weekly.locator('b').inner_text().endswith('/week') and daily.locator('b').inner_text().endswith('/day')
            page.locator('#range-start').fill('2026-11-15')
            assert 'no weekend sell in date range' in daily.inner_text()
            assert daily.locator('b').inner_text().endswith('/day') and weekly.locator('b').inner_text().endswith('/week')
            page.locator('#range-all').click()
            page.locator('#profile-clear').click()
            sabbath=next(p for p in data['players'] if p['name']=='sabbath553')
            row=page.locator(f'.movement-item[data-player="{sabbath["key"]}"]')
            assert '#41 ↗ #31' in row.inner_text() and '↑10' in row.inner_text()
            assert '+9.9B observed net C$' in row.inner_text() and '/hr' not in row.inner_text()
            danish=next(p for p in data['players'] if p['name']=='TheDanishPlays')
            sylilia=next(p for p in data['players'] if p['name']=='Sylilia')
            assert page.locator(f'.movement-item[data-player="{danish["key"]}"] .gaps .negative').filter(has_text='lead below shrank by 58M').count()==1
            assert page.locator(f'.movement-item[data-player="{sylilia["key"]}"] .gaps .positive').filter(has_text='closed gap above by 58M').count()==1
            assert page.locator(f'.movement-item[data-player="{danish["key"]}"] .gaps .negative').filter(has_text='lead below shrank by 58M').evaluate('el=>getComputedStyle(el).color')!=page.locator(f'.movement-item[data-player="{sylilia["key"]}"] .gaps .positive').filter(has_text='closed gap above by 58M').evaluate('el=>getComputedStyle(el).color')
            xnnoel=next(p for p in data['players'] if p['name']=='xNnoel')
            cerulean=next(p for p in data['players'] if p['name']=='Ceruleanflare2')
            assert page.locator(f'.movement-item[data-player="{xnnoel["key"]}"] .gaps .positive').filter(has_text='lead below grew by 612.2M').count()==1
            assert page.locator(f'.movement-item[data-player="{cerulean["key"]}"] .gaps .negative').filter(has_text='fell further behind by 612.2M').count()==1
            lowtier=next(p for p in data['players'] if p['name']=='LowTierNova')
            apathy_swing=apathy.locator('.gaps .positive').filter(has_text='overtook by 42B net swing')
            lowtier_swing=page.locator(f'.movement-item[data-player="{lowtier["key"]}"] .gaps .negative').filter(has_text='lost lead by 42B net swing')
            assert apathy_swing.count()==lowtier_swing.count()==1
            assert apathy_swing.evaluate('el=>getComputedStyle(el).color')!=lowtier_swing.evaluate('el=>getComputedStyle(el).color')
            assert 'prior rank neighbor: ody_odinho' in apathy.locator('.gaps').inner_text()
            assert page.evaluate("(()=>{const cp=state.data.checkpoints.at(-1),prior=state.data.checkpoints.at(-2),apathy=point(cp,'id:1316700350'),lowtier=point(cp,'id:2769135100'),oldA=point(prior,apathy.key),oldL=point(prior,lowtier.key);return BigInt(apathy.balance)-BigInt(lowtier.balance)===25658389587n && BigInt(oldA.balance)-BigInt(oldL.balance)===-16398191512n && interval(cp,apathy,prior).currentGap.behind.priorSpread===-16398191512n && interval(cp,lowtier,prior).currentGap.ahead.priorSpread===16398191512n})()")
            assert page.evaluate("(()=>{const cps=state.data.checkpoints,cp=cps.find(c=>c.id==='2026-11-17_2350'),row=point(cp,'id:8144154137'),change=interval(cp,row,cps[cps.indexOf(cp)-1]);return change.old===null && nearbyLabel('↓',change.currentGap.behind,change.oldGap.behind).includes('previous head-to-head unknown')})()")
            metbepol=next(p for p in data['players'] if p['name']=='metbepol')
            assert 'head-to-head unchanged' in page.locator(f'.movement-item[data-player="{metbepol["key"]}"] .gaps .muted').inner_text()
            forcepush=next(p for p in data['players'] if p['name']=='ForcePush_Sith')
            assert 'RETURNED TO TOP 50' in page.locator(f'.movement-item[data-player="{forcepush["key"]}"]').inner_text()
            zantrille=next(p for p in data['players'] if p['name']=='Zantrille')
            assert 'LEFT PICTURED TOP 50' in page.locator(f'.movement-item[data-player="{zantrille["key"]}"]').inner_text()
            assert page.locator('.proof').count()==4
            assert page.locator('#chart').evaluate("el=>el.layout.annotations.some(mark=>mark.text==='WEEKEND' && mark.x==='2026-11-21') && el.data.every(trace=>trace.meta?.key!=='id:8144154137')")
            for image_id in ('EV0216','EV0217','EV0218','EV0219'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 20, 2026'
            assert page.locator('.proof[data-proof="EV0212"]').count()==1
            page.locator('#next').click()
        if last['id']=='2026-11-20_2256':
            assert page.locator('#capture-date').inner_text()=='Nov 20, 2026'
            assert '10:56 PM' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='22.8h'
            assert page.locator('#stat-floor').inner_text()=='56.9B'
            assert page.locator('.proof').count()==4
            assert page.locator('#stat-largest').inner_text()=='+3B'
            assert page.locator('#stat-largest-name').inner_text()=='sebax4514'
            sangui=page.locator('.movement-item[data-player="id:8804353958"]')
            assert '#48 → #48' in sangui.inner_text() and '+3.1M observed net C$' in sangui.inner_text()
            assert 'FIRST SEEN IN TOP 50' not in sangui.inner_text()
            assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-19') && el.layout.xaxis.tickvals.includes('2026-11-20') && el.data.every(trace=>trace.meta?.key!=='id:8144154137')")
            for image_id in ('EV0212','EV0213','EV0214','EV0215'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 19, 2026'
            assert 'photo Nov 20, 2026, 12:08 AM' in page.locator('#capture-index').inner_text()
            assert page.locator('.proof[data-proof="EV0208"]').count()==1
            page.locator('#next').click()
        if last['id']=='2026-11-20_0008':
            assert page.locator('#capture-date').inner_text()=='Nov 19, 2026'
            assert 'photo Nov 20, 2026, 12:08 AM' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='25.5h'
            assert page.locator('#stat-floor').inner_text()=='56.9B'
            assert page.locator('.proof').count()==4
            assert 'early AM, counted for preceding day' in page.locator('#evidence-subtitle').inner_text()
            assert '#1' in page.locator('.movement-item[data-player="id:2769135100"]').inner_text()
            assert '#2' in page.locator('.movement-item[data-player="id:1316700350"]').inner_text()
            returnee=page.locator('.movement-item[data-player="id:8804353958"]')
            assert '#48' in returnee.inner_text() and 'FIRST SEEN IN TOP 50' in returnee.inner_text()
            assert 'MAJOR TOP-50 ENTRY' not in returnee.inner_text()
            assert 'LEFT PICTURED TOP 50' in page.locator('.movement-item[data-player="id:8144154137"]').inner_text()
            assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-19') && !el.layout.xaxis.tickvals.includes('2026-11-20') && el.data.every(trace=>trace.meta?.key!=='id:8144154137')")
            for image_id in ('EV0208','EV0209','EV0210','EV0211'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 18, 2026'
            assert page.locator('.proof[data-proof="EV0204"]').count()==1
            page.locator('#next').click()
        if last['id']=='2026-11-18_2237':
            assert page.locator('#capture-date').inner_text()=='Nov 18, 2026'
            assert '10:37 PM' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='22.8h'
            assert page.locator('#stat-floor').inner_text()=='56.9B'
            assert page.locator('.proof').count()==4
            assert page.locator('#stat-largest').inner_text()=='+55.4B'
            assert page.locator('#stat-largest-name').inner_text()=='Ceruleanflare2'
            cerulean=next(p for p in data['players'] if p['name']=='Ceruleanflare2')
            cerulean_row=page.locator(f'.movement-item[data-player="{cerulean["key"]}"]')
            assert '#14 ↗ #7' in cerulean_row.inner_text() and '↑7' in cerulean_row.inner_text()
            assert '+55.4B observed net C$' in cerulean_row.inner_text()
            assert 'NOTABLE +8B' in cerulean_row.inner_text()
            assert '1195.8T' in page.locator('.movement-item[data-player="id:8144154137"]').inner_text()
            returnee=next(p for p in data['players'] if p['name']=='Zantrille')
            assert 'RETURNED TO TOP 50' in page.locator(f'.movement-item[data-player="{returnee["key"]}"]').inner_text()
            departed=next(p for p in data['players'] if p['name']=='Farniluque049')
            assert 'LEFT PICTURED TOP 50' in page.locator(f'.movement-item[data-player="{departed["key"]}"]').inner_text()
            for image_id in ('EV0204','EV0205','EV0206','EV0207'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 17, 2026'
            page.locator('#next').click()
        if last['id']=='2026-11-17_2350':
            assert page.locator('#capture-date').inner_text()=='Nov 17, 2026'
            assert '11:50 PM' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='25.4h'
            assert page.locator('#stat-floor').inner_text()=='57.2B'
            assert page.locator('.proof').count()==4
            for username,rank,bound in [('75percent3r','#1','+1195.7T'),('Farniluque049','#15','+64B')]:
                meta=next(p for p in data['players'] if p['name']==username)
                row=page.locator(f'.movement-item[data-player="{meta["key"]}"]')
                assert rank in row.inner_text() and bound in row.inner_text()
                assert 'MAJOR TOP-50 ENTRY' in row.inner_text()
                assert 'FIRST SEEN IN TOP 50' in row.inner_text()
                assert '/hr' not in row.inner_text()
            assert '1,195,852,462,505,654 C$' in page.locator('#movement-list').inner_html()
            assert page.evaluate("standoutRows().some(item=>item.row.key==='id:8144154137' && item.kind==='appearance' && item.lowerBound===1195796845523354n)")
            page.locator('.movement-item[data-player="id:8144154137"]').click()
            assert page.locator('#profile-title').inner_text()=='75percent3r'
            assert '1195.8T' in page.locator('#profile-content').inner_text()
            assert 'omitted from graph' in page.locator('#chart-title').inner_text()
            for top in ('10','25','50','all'):
                page.locator('#top-filter').select_option(top)
                assert_chart_scale(page)
            assert page.locator('#chart').evaluate("el=>el.data.some(trace=>trace.name==='LowTierNova' && trace.line.color!=='rgba(125,151,164,.22)')")
            page.locator('#profile-clear').click()
            assert page.locator('#chart-title').inner_text()=='Leaderboard trajectories'
            for departed in ('KNG_GBS','Zantrille'):
                meta=next(p for p in data['players'] if p['name']==departed)
                assert 'LEFT PICTURED TOP 50' in page.locator(f'.movement-item[data-player="{meta["key"]}"]').inner_text()
            for image_id in ('EV0200','EV0201','EV0202','EV0203'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 16, 2026'
            page.locator('#next').click()
        if last['id']=='2026-11-16_2223':
            assert page.locator('#capture-date').inner_text()=='Nov 16, 2026'
            assert '10:23 PM' in page.locator('#capture-index').inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' not in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='24.7h'
            assert page.locator('#stat-floor').inner_text()=='55.6B'
            assert page.locator('.proof').count()==4
            assert page.locator('.proof.earlier-proof').count()==0
            assert '+1.9B observed net C$' in page.locator('.movement-item[data-player="id:1316700350"]').inner_text()
            minkib=page.locator('.movement-item[data-player="id:1528395974"]')
            assert '#48' in minkib.inner_text()
            assert 'RETURNED TO TOP 50' in minkib.inner_text()
            assert 'MAJOR TOP-50 ENTRY' not in minkib.inner_text()
            departed=next(p for p in data['players'] if p['name']=='1234mysterio')
            assert 'LEFT PICTURED TOP 50' in page.locator(f'.movement-item[data-player="{departed["key"]}"]').inner_text()
            for image_id in ('EV0196','EV0197','EV0198','EV0199'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 15, 2026'
            page.locator('#next').click()
        if last['id']=='2026-11-15_2140':
            assert page.locator('#capture-date').inner_text()=='Nov 15, 2026'
            assert '9:40 PM' in page.locator('#capture-index').inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' not in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='23.3h'
            assert page.locator('#stat-floor').inner_text()=='55.4B'
            assert page.locator('.proof').count()==4
            assert page.locator('.proof.earlier-proof').count()==0
            newcomer=next(p for p in data['players'] if p['name']=='hc2khunowpng43ntk1')
            row=page.locator(f'.movement-item[data-player="{newcomer["key"]}"]')
            assert '#32 → #32' in row.inner_text()
            assert '−277.6M observed net C$' in row.inner_text()
            assert 'MAJOR TOP-50 ENTRY' not in row.inner_text()
            assert page.locator('.movement-item[data-player="id:1316700350"]').inner_text().count('+159M')==1
            for image_id in ('EV0192','EV0193','EV0194','EV0195'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 14, 2026'
            assert 'WEEKEND SETTLEMENT BASELINE' in page.locator('#capture-index').inner_text()
            page.locator('#next').click()
        if last['id']=='2026-11-14_2223':
            assert page.locator('#capture-date').inner_text()=='Nov 14, 2026'
            assert 'WEEKEND SETTLEMENT BASELINE' in page.locator('#capture-index').inner_text()
            assert '10:23 PM' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-hours').inner_text()=='24.5h'
            assert page.locator('#stat-floor').inner_text()=='55.4B'
            assert page.locator('.proof').count()==12
            assert page.locator('.proof.earlier-proof').count()==8
            assert 'LEFT PICTURED TOP 50' in page.locator('#movement-list').inner_text()
            newcomer=next(p for p in data['players'] if p['name']=='hc2khunowpng43ntk1')
            assert newcomer['roblox_id']=='11482999303'
            assert '#32' in page.locator(f'.movement-item[data-player="{newcomer["key"]}"]').inner_text()
            assert 'at least +18.7B floor-derived net C$' in page.locator(f'.movement-item[data-player="{newcomer["key"]}"]').inner_text()
            assert 'MAJOR TOP-50 ENTRY' in page.locator(f'.movement-item[data-player="{newcomer["key"]}"]').inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' in page.locator(f'.movement-item[data-player="{newcomer["key"]}"]').inner_text()
            assert '/hr' not in page.locator(f'.movement-item[data-player="{newcomer["key"]}"]').inner_text()
            for image_id in ('EV0180','EV0184','EV0188','EV0190','EV0191'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            assert page.locator('.event-card[data-event="weekend-settlement"] a').first.get_attribute('href').endswith('EV0188_Screenshot_2026-11-14_222156.png')
        weekend=next((i for i,cp in enumerate(data['checkpoints']) if cp['id']=='2026-11-14_1128'),None)
        if weekend is not None:
            page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(weekend))
            assert page.locator('#capture-date').inner_text()=='Nov 14, 2026'
            assert 'WEEKEND SETTLEMENT BASELINE' in page.locator('#capture-index').inner_text()
            assert page.locator('#stat-coverage').inner_text()=='50 / 50'
            assert page.locator('#stat-hours').inner_text()=='13.6h'
            assert 'no hourly rate' in page.locator('#stat-hours-note').inner_text()
            assert page.locator('.proof').count()==8
            assert page.locator('.proof.earlier-proof').count()==4
            assert page.locator('.event-card[data-event="weekend-settlement"]').count()==1
            apathy=page.locator('.movement-item[data-player="id:1316700350"]')
            assert '+25.6B' in apathy.inner_text()
            assert 'WEEKEND SETTLEMENT BASELINE' in apathy.inner_text()
            assert 'NOTABLE +8B' in apathy.inner_text()
            assert '/hr' not in apathy.inner_text()
            for image_id in ('EV0180','EV0184','EV0187'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 13, 2026'
            assert page.locator('.proof').count()==4
            page.locator('#next').click()
            page.locator('.event-card[data-event="weekend-settlement"] .event-jump').click()
            assert 'snapshot=2026-11-14_1128' in page.url
            page.locator('#search').fill('ismyaimbotworking')
            assert page.locator('.profile-stats > div').filter(has_text='WEEKLY AVG OBSERVED NET CHANGE').locator('b').inner_text().endswith('/week')
            assert page.locator('.profile-stats > div').filter(has_text='RAINBOW 1.5× BASE EQUIVALENT').locator('b').inner_text().startswith('≈+')
            assert page.locator('.profile-stats > div').filter(has_text='RAINBOW 1.5× WEEKLY BASE-EQUIV.').locator('b').inner_text().endswith('/week')
            assert 'includes Saturday settlement' in page.locator('#range-summary').inner_text()
            assert 'WEEKEND SETTLEMENT · no hourly rate' in page.locator('.profile-history a').filter(has_text='Nov 14, 2026').first.inner_text()
            page.screenshot(path=str(ROOT/'preview-weekend-baseline.png'),full_page=True)
            page.locator('#profile-clear').click()
            page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(total_days-1))
        if last['id']=='2026-11-13_2152':
            assert page.locator('#capture-date').inner_text()=='Nov 13, 2026'
            assert page.locator('#stat-hours').inner_text()=='22.9h'
            assert page.locator('#stat-floor').inner_text()=='53.9B'
            assert page.locator('.proof').count()==4
            assert page.locator('.proof.profile-proof').count()==0
            assert page.locator('.movement-item').count()>=50
            assert '+1B' in page.locator('.movement-item[data-player="id:1316700350"]').inner_text()
            for image_id in ('EV0173','EV0176'):
                page.locator(f'.proof[data-proof="{image_id}"]').click()
                page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
                page.locator('#lightbox button').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text()=='Nov 12, 2026'
            assert page.locator('.proof.profile-proof').count()==1
        nov12=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']=='2026-11-12')
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(nov12))
        if data['checkpoints'][nov12]['id']=='2026-11-12_2258':
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
            assert page.locator('.profile-history a').filter(has_text='Nov 12, 2026').first.get_attribute('data-proof')=='PU0001'
            page.screenshot(path=str(ROOT/'preview-apathy-desktop.png'),full_page=True)
            page.locator('#profile-clear').click()
            page.locator('#prev').click()
            assert page.locator('#capture-date').inner_text() == 'Nov 11, 2026'
            assert page.locator('.proof').count() == 8
            page.locator('#next').click()
        page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(total_days-1))
        page.locator("#chart.js-plotly-plot").wait_for(timeout=20000)
        assert page.locator("#chart").evaluate("el => el.data.some(t => t.meta && t.meta.key)")
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.type") == "category"
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.tickvals.includes('2026-10-18')")
        assert page.locator('#chart').evaluate("el => {const line=el.data.find(trace=>trace.meta?.key==='id:1316700350');return line.y[line.x.indexOf('2026-11-12')];}")==269064293664
        if any(cp['id']=='2026-11-14_2223' for cp in data['checkpoints']):
            assert page.locator('#chart').evaluate("el=>{const t=el.data.find(trace=>trace.meta?.key==='id:1316700350');return t.y[t.x.indexOf('2026-11-14')];}")==296016651408
            assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-14') && !el.layout.xaxis.tickvals.includes('2026-11-14#2')")
            assert page.locator('#chart').evaluate("el=>el.layout.annotations.some(mark=>mark.text==='WEEKEND')")
            assert page.evaluate("standoutRows().some(item=>item.cp.day_key==='2026-11-14' && item.kind==='appearance' && item.row.username==='hc2khunowpng43ntk1' && item.lowerBound===18724287019n && item.severity==='high')")
            assert page.evaluate("standoutRows().some(item=>item.cp.day_key==='2026-11-14' && item.kind==='movement' && item.row.username==='ismyaimbotworking' && item.change.delta===25886181970n && item.severity==='extreme' && item.change.rate===null && !item.repeatWith)")
            assert page.evaluate("""() => state.data.checkpoints.filter(cp=>weekendSettlement(cp)).every(cp=>{
              const index=state.data.checkpoints.indexOf(cp), previous=state.data.checkpoints[index-1], flags=standoutRows();
              return (state.byCapture.get(cp.id)||[]).filter(row=>{
                const change=interval(cp,row,previous);
                return confirmed(row)&&confirmed(change.old)&&change.elapsed>0&&(change.delta>=BigInt(state.data.threshold)||change.old.rank-row.rank>=5);
              }).every(row=>flags.some(flag=>flag.kind==='movement'&&flag.index===index&&flag.row.key===row.key));
            })""")
            page.locator('#search').fill('ismyaimbotworking')
            assert page.locator('.profile-stats > div').filter(has_text='WEEKLY AVG OBSERVED NET CHANGE').locator('b').inner_text().endswith('/week')
            assert 'WEEKEND SETTLEMENT · no hourly rate' in page.locator('.profile-history a').filter(has_text='Nov 14, 2026').first.inner_text()
            page.locator('#profile-clear').click()
        if weekend is not None:
            assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-14') && !el.layout.xaxis.tickvals.includes('2026-11-14#2')")
            assert page.locator('#chart').evaluate("el=>el.layout.annotations.some(mark=>mark.text==='WEEKEND') && !el.layout.annotations.some(mark=>mark.text==='SELL')")
        assert [event['day_key'] for event in data['checkpoints'] if event['day_key'] in ('2026-10-31','2026-11-07')]==['2026-10-31','2026-11-07']
        assert page.evaluate("patchEvents.map(event=>[event.day,localDay(event.at)])")==[['2026-10-31','2026-10-31'],['2026-11-07','2026-11-07']]
        assert {'v2.08','v2.09.1'}.issubset(set(page.locator('#chart').evaluate('el=>el.layout.annotations.map(event=>event.text)')))
        assert page.locator('.event-card').count()==(3 if any(cp['day_key']=='2026-11-14' and cp['weekend_settlement'] for cp in data['checkpoints']) else 2)
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
        assert page.locator('#range-end').input_value()==last_day
        full_rate=page.locator('.profile-stats > div').filter(has_text='WEEKLY AVG OBSERVED NET CHANGE').locator('b').inner_text()
        assert full_rate.endswith('/week')
        page.locator('#range-start').fill('2026-11-07')
        assert page.locator('#range-start').input_value()=='2026-11-07'
        assert 'from=2026-11-07' in page.url and f'to={last_day}' in page.url
        selected_rows=[row for row in data['observations'] if row['key']=='id:1316700350' and '2026-11-07'<=row['day_key']<=last_day]
        assert page.locator('.profile-history a').count()==len(selected_rows)
        assert f'{len(selected_rows)} pictured readings' in page.locator('#range-summary').inner_text()
        recent_rate=page.locator('.profile-stats > div').filter(has_text='WEEKLY AVG OBSERVED NET CHANGE').locator('b').inner_text()
        assert recent_rate.endswith('/week') and recent_rate!=full_rate
        assert 'includes Saturday settlement' in page.locator('#range-summary').inner_text()
        expected_week=(int(selected_rows[-1]['balance'])-int(selected_rows[0]['balance']))/((datetime.fromisoformat(selected_rows[-1]['at'].replace('Z','+00:00'))-datetime.fromisoformat(selected_rows[0]['at'].replace('Z','+00:00'))).total_seconds()/3600)*168
        actual_week=page.evaluate("(()=>{const r=rangedHistory('id:1316700350');return timeRate(BigInt(r.at(-1).balance)-BigInt(r[0].balance),hours(r[0].at,r.at(-1).at))*168})()")
        assert abs(actual_week-expected_week)<1
        page.locator('#range-end').fill('2026-11-13')
        assert page.locator('.profile-stats > div').filter(has_text='AVERAGE OBSERVED NET RATE').locator('b').inner_text()!='—'
        active_rows=[row for row in selected_rows if row['day_key']<='2026-11-13']
        expected=(int(active_rows[-1]['balance'])-int(active_rows[0]['balance']))/((datetime.fromisoformat(active_rows[-1]['at'].replace('Z','+00:00'))-datetime.fromisoformat(active_rows[0]['at'].replace('Z','+00:00'))).total_seconds()/3600)
        actual=page.evaluate("(()=>{const r=rangedHistory('id:1316700350');return timeRate(BigInt(r.at(-1).balance)-BigInt(r[0].balance),hours(r[0].at,r.at(-1).at))})()")
        assert abs(actual-expected)<1
        assert page.locator('#chart').evaluate("el=>el.layout.xaxis.tickvals.includes('2026-11-07') && !el.layout.xaxis.tickvals.includes('2026-10-31')")
        page.locator('#range-start').fill('2026-11-13')
        page.locator('#range-end').fill('2026-11-13')
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
        week_start=(datetime.fromisoformat(last_day)-timedelta(days=6)).date().isoformat()
        assert page.locator('#range-start').input_value()==week_start
        page.reload(wait_until='domcontentloaded')
        page.locator('#profile-title').get_by_text('ismyaimbotworking').wait_for(timeout=20000)
        assert page.locator('#range-start').input_value()==week_start
        assert page.locator('#range-end').input_value()==last_day
        page.locator('#clear').click()
        assert page.locator('#profile-range').is_hidden()
        assert 'from=' not in page.url and 'to=' not in page.url
        assert page.locator('.highlight-card').count()==0
        assert page.locator('.standout-teaser').is_visible()
        standouts=page.evaluate("standoutRows().map(item=>({day:item.cp.day_key,name:item.row.username,kind:item.kind,gain:item.change.delta?.toString()??null,bound:item.lowerBound?.toString()??null,climb:item.climb}))")
        assert len(standouts)>8, "The archive-wide feed should paginate beyond its first eight flags"
        if last['id']=='2026-11-22_2213':
            assert not any(item['day']=='2026-11-22' for item in standouts)
            assert any(item['day']=='2026-11-21' and item['name']=='ismyaimbotworking' and item['gain']=='43737208619' for item in standouts)
        if last['id']=='2026-11-21_2214':
            assert any(item['day']=='2026-11-21' and item['name']=='ismyaimbotworking' and item['gain']=='43737208619' and item['kind']=='movement' for item in standouts)
            assert any(item['day']=='2026-11-21' and item['name']=='sabbath553' and item['gain']=='9921712933' and item['climb']==10 for item in standouts)
            assert not any(item['day']=='2026-11-21' and item['name']=='ForcePush_Sith' for item in standouts)
            assert page.evaluate("standoutRows().filter(item=>item.cp.day_key==='2026-11-21').every(item=>item.kind==='movement' && item.change.rate===null && !item.repeatWith)")
        if last['id']=='2026-11-20_2256':
            assert not any(item['day']=='2026-11-20' for item in standouts)
            assert not any(item['day']=='2026-11-19' for item in standouts)
        if last['id']=='2026-11-20_0008':
            assert not any(item['day']=='2026-11-19' for item in standouts)
            assert any(item['day']=='2026-11-18' and item['name']=='Ceruleanflare2' and item['gain']=='55410839236' for item in standouts)
        if last['id']=='2026-11-18_2237':
            assert any(item['day']=='2026-11-18' and item['name']=='Ceruleanflare2' and item['kind']=='movement' and item['gain']=='55410839236' and item['climb']==7 for item in standouts)
            assert not any(item['day']=='2026-11-18' and item['name']=='75percent3r' for item in standouts)
        if last['id']=='2026-11-17_2350':
            assert any(item['day']=='2026-11-17' and item['name']=='75percent3r' and item['kind']=='appearance' and item['bound']=='1195796845523354' and item['gain'] is None for item in standouts)
            assert any(item['day']=='2026-11-17' and item['name']=='Farniluque049' and item['kind']=='appearance' and item['bound']=='64030620925' and item['gain'] is None for item in standouts)
            assert page.evaluate("standoutRows().filter(item=>item.cp.day_key==='2026-11-17' && item.kind==='appearance').every(item=>item.severity==='extreme' && item.previousFloor.rank===50 && item.change.rate===null)")
        assert any(item['day']=='2026-11-14' and item['name']=='hc2khunowpng43ntk1' and item['kind']=='appearance' and item['bound']=='18724287019' and item['gain'] is None for item in standouts)
        assert any(item['day']=='2026-11-14' and item['name']=='ismyaimbotworking' and item['kind']=='movement' and item['gain']=='25886181970' for item in standouts)
        assert any(item['day']=='2026-11-12' and item['name']=='Ceruleanflare2' and item['gain']=='26027711662' and item['climb']==6 for item in standouts)
        assert any(item['day']=='2026-11-10' and item['name']=='Ceruleanflare2' for item in standouts)
        repeated=page.evaluate("standoutRows().filter(item=>item.row.username==='Ceruleanflare2' && item.repeatWith).map(item=>[item.cp.day_key,item.severity,item.repeatWith.cp.day_key,Math.round(Math.abs(hours(item.repeatWith.row.at,item.row.at))*10)/10])")
        assert ['2026-11-12','extreme','2026-11-10',49.5] in repeated
        assert ['2026-11-10','extreme','2026-11-12',49.5] in repeated
        assert page.evaluate("standoutRows().every(item=>!item.repeatWith || (!weekendSettlement(item.cp) && !weekendSettlement(item.repeatWith.cp)))")
        assert page.evaluate("standoutRows().some(item=>!item.bigGain && item.climb>=5)")
        assert page.evaluate("standoutRows().some(item=>item.severity==='notable') && standoutRows().some(item=>item.severity==='high')")
        assert page.evaluate("standoutRows().every(item=>item.row.status==='verified' && item.row.evidence.length && state.data.checkpoints[item.index-1].complete && (item.kind==='appearance'?item.previousFloor.status==='verified' && item.change.old===null:item.change.old?.status==='verified' && item.change.old.evidence.length && state.data.checkpoints[item.index-1].id===item.change.old.checkpoint))")
        assert f'{len(standouts)} photo-backed flags' in page.locator('#standout-teaser-summary').inner_text()
        assert page.evaluate("""() => {
          const cps=state.data.checkpoints, index=cps.findIndex(item=>item.id==='2026-11-14_2223'), cp=cps[index], previous=cps[index-1];
          const row=state.byCapture.get(cp.id).find(item=>item.username==='hc2khunowpng43ntk1');
          const originals=state.byCapture.get(previous.id), floor=atRank(previous,50);
          const threshold=BigInt(state.data.threshold), min=BigInt(floor.balance)+threshold;
          if(floorEntry(cp,{...row,balance:String(min)},previous)?.lowerBound!==threshold || floorEntry(cp,{...row,balance:String(min-1n)},previous)!==null)return false;
          if(floorEntry({...cp,complete:false},row,previous)!==null || floorEntry(cp,row,{...previous,complete:false})!==null)return false;
          if(floorEntry(cp,{...row,status:'unverified'},previous)!==null || floorEntry(cp,{...row,key:'name:unresolved'},previous)!==null)return false;
          if(floorEntry(cp,{...row,key:originals[0].key,username:'different-account'},previous)!==null)return false;
          try {
            state.byCapture.set(previous.id,originals.map(item=>item.rank===50?{...item,status:'unverified'}:item));
            if(floorEntry(cp,row,previous)!==null)return false;
            state.byCapture.set(previous.id,[...originals,{...row,key:'name:unresolved',rank:51}]);
            if(floorEntry(cp,row,previous)!==null)return false;
          } finally {state.byCapture.set(previous.id,originals);}
          const entry=standoutRows().find(item=>item.cp.id===cp.id&&item.row.key===row.key);
          if(!entry || !appearanceCard(entry).includes('FIRST SEEN'))return false;
          const history=state.byPlayer.get(row.key);
          try {
            state.byPlayer.set(row.key,[{...row,at:previous.at},...history]);
            return appearanceCard(entry).includes('RETURNED');
          } finally {state.byPlayer.set(row.key,history);}
        }""")
        analysis=browser.new_page(viewport={'width':1300,'height':930})
        analysis.on('pageerror',lambda error: errors.append(str(error)))
        analysis.goto(f'http://127.0.0.1:{server.server_address[1]}/standouts.html',wait_until='domcontentloaded')
        analysis.locator('#highlight-count').get_by_text(f'{len(standouts)} FLAGS').wait_for(timeout=20000)
        assert analysis.locator('.highlight-card').count()==8 and analysis.locator('#highlight-pages').is_visible()
        assert analysis.locator('#highlight-list').evaluate('el=>getComputedStyle(el).display')=='grid'
        assert analysis.locator('.standout-layout').evaluate('el=>{const [left,right]=el.children;const ratio=left.getBoundingClientRect().width/right.getBoundingClientRect().width;return ratio>1.8&&ratio<2.2}')
        if last['id']=='2026-11-22_2213':
            assert 'ismyaimbotworking' in analysis.locator('#overview-content').inner_text()
            assert '43,737,208,619' in analysis.locator('#overview-content').inner_text()
            assert 'WEEKEND SELL CONTEXT' in analysis.locator('#overview-content').inner_text()
            assert analysis.locator('.overview-settlement-averages .overview-metrics b').all_inner_texts()==['+44.4B/week','+6.3B/day']
            analysis.locator('#flag-search').fill('hc2khunowpng43ntk1')
            analysis.locator('.highlight-card[data-highlight-day="2026-11-14"] .highlight-open').click()
            analysis.locator('#flag-search').fill('')
        if last['id']=='2026-11-21_2214':
            assert 'ismyaimbotworking' in analysis.locator('#overview-content').inner_text()
            assert '43,737,208,619' in analysis.locator('#overview-content').inner_text()
            assert 'WEEKEND SELL CONTEXT · SATURDAY BASELINE' in analysis.locator('#overview-content').inner_text()
            assert 'HOURLY RATE ACROSS SETTLEMENT' in analysis.locator('#overview-content').inner_text()
            assert 'Not inferred' in analysis.locator('#overview-content').inner_text()
            assert 'WEEKLY AVG OBSERVED NET CHANGE' in analysis.locator('#overview-rate').inner_text()
            assert 'includes Nov 21, 2026 weekend sell' in analysis.locator('#overview-rate').inner_text()
            assert analysis.locator('.overview-settlement-averages .overview-metrics b').all_inner_texts()==['+50.8B/week','+7.2B/day']
            analysis.locator('#overview-end').fill('2026-11-20')
            assert 'includes Nov 14, 2026 weekend sell' in analysis.locator('.overview-settlement-averages').inner_text()
            assert analysis.locator('.overview-settlement-averages .overview-metrics b').evaluate_all("els=>els.length===2 && els[0].textContent.endsWith('/week') && els[1].textContent.endsWith('/day') && els[0].textContent!=='+50.8B/week'")
            analysis.locator('#overview-all').click()
            apathy_flag=analysis.locator('.highlight-card[data-highlight-day="2026-11-21"][data-highlight-player="id:1316700350"]')
            assert apathy_flag.count()==1 and apathy_flag.get_attribute('data-severity')=='extreme'
            assert '+43.7B observed net C$' in apathy_flag.inner_text()
            assert 'WEEKEND SELL CONTEXT' in apathy_flag.inner_text() and '/hr' not in apathy_flag.inner_text()
            assert 'EV0212' in apathy_flag.locator('.highlight-proof-links').inner_text()
            assert 'EV0216' in apathy_flag.locator('.highlight-proof-links').inner_text()
            analysis.locator('#flag-search').fill('sabbath553')
            sabbath_flag=analysis.locator('.highlight-card[data-highlight-day="2026-11-21"]')
            assert sabbath_flag.count()==1 and sabbath_flag.get_attribute('data-severity')=='high'
            assert '+9.9B observed net C$' in sabbath_flag.inner_text()
            assert '↑10 ranks' in sabbath_flag.inner_text() and 'WEEKEND SELL CONTEXT' in sabbath_flag.inner_text()
            assert 'EV0214' in sabbath_flag.locator('.highlight-proof-links').inner_text()
            assert 'EV0217' in sabbath_flag.locator('.highlight-proof-links').inner_text()
            sabbath_flag.locator('.highlight-open').click()
            assert '9,921,712,933' in analysis.locator('#overview-content').inner_text()
            assert 'Not inferred' in analysis.locator('#overview-content').inner_text()
            analysis.locator('#flag-search').fill('hc2khunowpng43ntk1')
            analysis.locator('.highlight-card[data-highlight-day="2026-11-14"] .highlight-open').click()
            analysis.locator('#flag-search').fill('')
        if last['id'] in ('2026-11-18_2237','2026-11-20_0008','2026-11-20_2256'):
            assert 'Ceruleanflare2' in analysis.locator('#overview-content').inner_text()
            assert '55,410,839,236' in analysis.locator('#overview-content').inner_text()
            assert 'EV0200' in analysis.locator('#overview-content').inner_text()
            assert 'EV0204' in analysis.locator('#overview-content').inner_text()
            latest=analysis.locator('.highlight-card[data-highlight-day="2026-11-18"]')
            assert latest.count()==1 and latest.get_attribute('data-severity')=='extreme'
            assert '+55.4B observed net C$' in latest.inner_text() and '↑7 ranks' in latest.inner_text()
            assert 'EV0200' in latest.locator('.highlight-proof-links').inner_text()
            assert 'EV0204' in latest.locator('.highlight-proof-links').inner_text()
            analysis.locator('#flag-search').fill('75percent3r')
            assert analysis.locator('.highlight-card[data-flag-kind="appearance"][data-highlight-day="2026-11-17"]').count()==1
            analysis.locator('#flag-search').fill('hc2khunowpng43ntk1')
            analysis.locator('.highlight-card[data-highlight-day="2026-11-14"] .highlight-open').click()
            analysis.locator('#flag-search').fill('')
        if last['id']=='2026-11-17_2350':
            assert '75percent3r' in analysis.locator('#overview-content').inner_text()
            assert '1,195,852,462,505,654' in analysis.locator('#overview-content').inner_text()
            assert '1,195,796,845,523,354' in analysis.locator('#overview-content').inner_text()
            assert '55,616,982,300' in analysis.locator('#overview-content').inner_text()
            assert 'Two are needed' in analysis.locator('#overview-rate').inner_text()
            leader=analysis.locator('.highlight-card[data-flag-kind="appearance"][data-highlight-day="2026-11-17"]').first
            assert leader.get_attribute('data-severity')=='extreme'
            assert '1,195,796,845,523,354' in leader.inner_text()
            assert '/hr' not in leader.inner_text()
            assert 'day=2026-11-16' in leader.locator('.highlight-proof-links a').first.get_attribute('href')
            assert 'EV0200' in leader.locator('.highlight-proof-links a').nth(1).get_attribute('href')
            linked=browser.new_page(viewport={'width':1300,'height':930})
            linked.on('pageerror',lambda error: errors.append(str(error)))
            linked.goto(analysis.locator('.overview-dashboard-link').get_attribute('href'),wait_until='domcontentloaded')
            linked.locator('#profile-title').get_by_text('75percent3r').wait_for(timeout=20000)
            linked.locator('#chart.js-plotly-plot').wait_for(timeout=20000)
            assert_chart_scale(linked)
            assert '1195.8T' in linked.locator('#profile-content').inner_text()
            linked.close()
            analysis.locator('#flag-search').fill('Farniluque049')
            assert analysis.locator('.highlight-card').count()==1
            runner=analysis.locator('.highlight-card[data-flag-kind="appearance"]')
            assert runner.get_attribute('data-severity')=='extreme'
            assert '64,030,620,925' in runner.inner_text()
            assert 'EV0200' in runner.locator('.highlight-proof-links').inner_text()
            giant_mobile=browser.new_page(viewport={'width':390,'height':840})
            giant_mobile.on('pageerror',lambda error: errors.append(str(error)))
            giant_mobile.goto(f'http://127.0.0.1:{server.server_address[1]}/standouts.html',wait_until='domcontentloaded')
            giant_mobile.locator('.highlight-card[data-highlight-day="2026-11-17"]').first.wait_for(timeout=20000)
            assert '1,195,852,462,505,654' in giant_mobile.locator('#overview-content').inner_text()
            assert giant_mobile.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 4')
            giant_mobile.close()
            analysis.locator('#flag-search').fill('hc2khunowpng43ntk1')
            analysis.locator('.highlight-card[data-highlight-day="2026-11-14"] .highlight-open').click()
            analysis.locator('#flag-search').fill('')
        assert 'hc2khunowpng43ntk1' in analysis.locator('#overview-content').inner_text()
        assert '18,724,287,019' in analysis.locator('#overview-content').inner_text()
        assert '53,905,288,849' in analysis.locator('#overview-content').inner_text()
        assert 'Unknown · no rate' in analysis.locator('#overview-content').inner_text()
        assert 'EV0190' in analysis.locator('#overview-content').inner_text()
        if last['day_key']>='2026-11-15':
            assert ('2 photographed points' if last['id']=='2026-11-15_2140' else '9 photographed points' if last['id']=='2026-11-22_2213' else '8 photographed points' if last['id']=='2026-11-21_2214' else '7 photographed points' if last['id']=='2026-11-20_2256' else '6 photographed points' if last['id']=='2026-11-20_0008' else '5 photographed points' if last['id']=='2026-11-18_2237' else '4 photographed points' if last['id']=='2026-11-17_2350' else '3 photographed points') in analysis.locator('#overview-rate').inner_text()
            assert ('WEEKLY AVG OBSERVED NET CHANGE' if last['id'] in ('2026-11-21_2214','2026-11-22_2213') else 'OBSERVED NET RATE') in analysis.locator('#overview-rate').inner_text()
            assert ('−277.6M' if last['id']=='2026-11-15_2140' else '−275.6M') in analysis.locator('#overview-rate').inner_text()
        else:
            assert 'Two are needed' in analysis.locator('#overview-rate').inner_text()
        entry=analysis.locator('.highlight-card[data-flag-kind="appearance"][data-highlight-day="2026-11-14"]')
        assert entry.count()==1 and entry.get_attribute('data-severity')=='high'
        assert 'floor-derived minimum net increase' in entry.inner_text()
        assert 'WEEKEND SELL CONTEXT' in entry.inner_text()
        assert '18,724,287,019' in entry.inner_text()
        assert '/hr' not in entry.inner_text()
        assert 'day=2026-11-13' in entry.locator('.highlight-proof-links a').first.get_attribute('href')
        assert 'EV0190' in entry.locator('.highlight-proof-links a').nth(1).get_attribute('href')
        analysis.locator('#flag-search').fill('hc2khunowpng43ntk1')
        assert analysis.locator('.highlight-card').count()==1
        analysis.locator('#flag-search').fill('')
        analysis.locator('#flag-search').fill('ismyaimbotworking')
        settlement=analysis.locator('.highlight-card[data-highlight-day="2026-11-14"][data-highlight-player="id:1316700350"]')
        assert settlement.count()==1 and settlement.get_attribute('data-severity')=='extreme'
        assert 'WEEKEND SELL CONTEXT' in settlement.inner_text()
        assert '+25.8B observed net C$' in settlement.inner_text()
        assert 'no hourly earning rate inferred' in settlement.inner_text()
        assert '/hr' not in settlement.inner_text()
        assert 'EV0173' in settlement.locator('.highlight-proof-links').inner_text()
        assert 'EV0188' in settlement.locator('.highlight-proof-links').inner_text()
        settlement.locator('.highlight-open').click()
        assert '25,886,181,970' in analysis.locator('#overview-content').inner_text()
        assert 'WEEKEND SELL CONTEXT · SATURDAY BASELINE' in analysis.locator('#overview-content').inner_text()
        assert 'HOURLY RATE ACROSS SETTLEMENT' in analysis.locator('#overview-content').inner_text()
        assert 'Not inferred' in analysis.locator('#overview-content').inner_text()
        assert 'WEEKLY AVG OBSERVED NET CHANGE' in analysis.locator('#overview-rate').inner_text()
        analysis.locator('#flag-search').fill('')
        cerulean=next(p for p in data['players'] if p['name']=='Ceruleanflare2')
        latest_flag=f'.highlight-card[data-highlight-day="2026-11-12"][data-highlight-player="{cerulean["key"]}"]'
        for _ in range((len(standouts)+7)//8):
            if analysis.locator(latest_flag).count():break
            analysis.locator('#highlight-next').click()
        assert analysis.locator(latest_flag).count()==1
        analysis.locator(f'{latest_flag} .highlight-open').click()
        assert '26,027,711,662' in analysis.locator('#overview-content').inner_text()
        assert 'WEEKLY AVG OBSERVED NET CHANGE' in analysis.locator('#overview-rate').inner_text()
        assert '/week' in analysis.locator('#overview-rate').inner_text()
        analysis.locator('#overview-start').fill('2026-11-10')
        assert 'from=2026-11-10' in analysis.url and f'to={last_day}' in analysis.url
        cerulean_window=sum(row['key']==next(p['key'] for p in data['players'] if p['name']=='Ceruleanflare2') and '2026-11-10'<=row['day_key']<=last_day for row in data['observations'])
        assert f'{cerulean_window} photographed points' in analysis.locator('#overview-rate').inner_text()
        assert 'WEEKLY AVG OBSERVED NET CHANGE' in analysis.locator('#overview-rate').inner_text()
        analysis.locator('#overview-start').fill('2026-11-13')
        analysis.locator('#overview-end').fill('2026-11-13')
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
        for zone,photo_time,rolled_time,patch_time in (
            ('America/New_York','Nov 22, 2026, 11:13 PM EST','Nov 20, 2026, 1:08 AM EST','Oct 31, 2026, 12:00 PM EDT'),
            ('America/Los_Angeles','Nov 22, 2026, 8:13 PM PST','Nov 19, 2026, 10:08 PM PST','Oct 31, 2026, 9:00 AM PDT'),
        ):
            context=browser.new_context(timezone_id=zone,locale='en-US',viewport={'width':390 if zone.endswith('Angeles') else 1300,'height':840})
            viewer=context.new_page()
            viewer.on('pageerror',lambda error: errors.append(str(error)))
            viewer.goto(f'http://127.0.0.1:{server.server_address[1]}/?day=2026-11-22',wait_until='domcontentloaded')
            viewer.locator('#capture-date').get_by_text('Nov 22, 2026').wait_for(timeout=20000)
            assert zone in viewer.locator('#viewer-timezone').inner_text()
            assert photo_time in viewer.locator('#capture-index').inner_text()
            assert photo_time in viewer.locator('#evidence-subtitle').inner_text()
            assert patch_time in viewer.locator('.event-card[data-event="venue-encore"]').inner_text()
            viewer.locator('#chart.js-plotly-plot').wait_for(timeout=20000)
            assert viewer.locator('#chart').evaluate("(el,expected)=>{const trace=el.data.find(t=>t.meta?.key==='id:1316700350'),slot=trace.x.indexOf('2026-11-22');return slot>=0 && trace.customdata[slot][3]===expected && el.layout.xaxis.tickvals.includes('2026-11-22')}",photo_time)
            viewer.goto(f'http://127.0.0.1:{server.server_address[1]}/?day=2026-11-19',wait_until='domcontentloaded')
            viewer.locator('#capture-date').get_by_text('Nov 19, 2026').wait_for(timeout=20000)
            assert rolled_time in viewer.locator('#capture-index').inner_text()
            assert 'early AM, counted for preceding day' in viewer.locator('#evidence-subtitle').inner_text()
            viewer.goto(f'http://127.0.0.1:{server.server_address[1]}/?day=2026-11-17&player=id%3A8144154137',wait_until='domcontentloaded')
            viewer.locator('#profile-title').get_by_text('75percent3r').wait_for(timeout=20000)
            assert viewer.locator('.profile-history a').filter(has_text='Nov 17, 2026').first.inner_text().find('Nov 18, 2026, 12:50 AM EST' if zone.endswith('New_York') else 'photo 9:50 PM PST')>=0
            viewer.goto(f'http://127.0.0.1:{server.server_address[1]}/standouts.html?day=2026-11-21&player=id%3A1316700350',wait_until='domcontentloaded')
            weekend_flag=viewer.locator('.highlight-card[data-highlight-day="2026-11-21"][data-highlight-player="id:1316700350"]')
            weekend_flag.wait_for(timeout=20000)
            assert zone in viewer.locator('#viewer-timezone').inner_text()
            assert ('Nov 20, 2026, 11:56 PM EST' if zone.endswith('New_York') else 'Nov 20, 2026, 8:56 PM PST') in weekend_flag.inner_text()
            assert ('Nov 21, 2026, 11:14 PM EST' if zone.endswith('New_York') else 'Nov 21, 2026, 8:14 PM PST') in weekend_flag.inner_text()
            assert 'Nov 21, 2026' in viewer.locator('#overview-content').inner_text()
            assert viewer.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 4')
            context.close()
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
        assert f"DAY {nov11:02d} / {calendar_days}" in page.locator("#capture-index").inner_text()
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
        for day,evidence_id,username in (
            ('2026-10-23','EV0177','NoRoblox_Support'),
            ('2026-10-30','EV0178','johncenagaming347v2'),
            ('2026-11-02','EV0179','kawaiicatsophi67'),
        ):
            index=next(i for i,cp in enumerate(data['checkpoints']) if cp['day_key']==day)
            page.locator('#capture-slider').evaluate("(el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}))}",str(index))
            assert page.locator('#stat-coverage').inner_text()=='50 / 50'
            assert page.locator('.proof').count()==len(data['checkpoints'][index]['evidence'])==6
            assert username in page.locator('#movement-list').inner_text()
            page.locator(f'.proof[data-proof="{evidence_id}"]').click()
            page.wait_for_function("document.querySelector('#lightbox-image').naturalWidth > 0")
            page.locator('#lightbox button').click()
        oct30=next(row for row in data['observations'] if row['day_key']=='2026-10-30' and row['rank']==47)
        assert (oct30['balance'],oct30['evidence'])==('54021982503',['EV0082'])
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
        assert f"DAY {calendar_days:02d} / {calendar_days}" in page.locator("#capture-index").inner_text()
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 4"), "Mobile page overflows horizontally"
        if last['id']=='2026-11-21_2214':
            assert page.locator(f'.movement-item[data-player="{danish["key"]}"] .gaps .negative').filter(has_text='lead below shrank by 58M').count()==1
            assert page.locator(f'.movement-item[data-player="{sylilia["key"]}"] .gaps .positive').filter(has_text='closed gap above by 58M').count()==1
            assert page.locator('.movement-item[data-player="id:1316700350"] .gaps .positive').filter(has_text='overtook by 42B net swing').count()==1
            assert page.locator(f'.movement-item[data-player="{lowtier["key"]}"] .gaps .negative').filter(has_text='lost lead by 42B net swing').count()==1
        assert page.locator("#chart").evaluate("el => el.layout.xaxis.tickvals.length > el.layout.xaxis.ticktext.filter(Boolean).length")
        assert_chart_scale(page)
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
