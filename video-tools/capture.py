# Records the REAL running Pebble app (static build on :3000) into image sequences
# used by the motion-graphics stage. Each clip = list of (ms, file).
import asyncio, json, os, time
from playwright.async_api import async_playwright

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "video", "cap")
os.makedirs(OUT, exist_ok=True)
BASE = "http://localhost:3000"
SAMPLE = "I'm starting a job at Princeton in August, need a cozy 2-bedroom under $3,000, walkable to campus, I have a dog"
manifest = {}

async def shot(pg, name, **kw):
    path = f"{OUT}/{name}.jpg"
    await pg.screenshot(path=path, type="jpeg", quality=92, **kw)
    return f"cap/{name}.jpg"

async def seq(pg, clip, dur_ms, every_ms=110, **kw):
    t0 = time.time(); i = 0; frames = []
    while (time.time() - t0) * 1000 < dur_ms:
        ts = (time.time() - t0) * 1000
        f = await shot(pg, f"{clip}_{i:03d}", **kw)
        frames.append([round(ts), f]); i += 1
        await asyncio.sleep(max(0, every_ms / 1000 - (time.time() - t0 - ts / 1000)))
    manifest[clip] = frames

async def one(pg, clip, **kw):
    manifest[clip] = [[0, await shot(pg, clip, **kw)]]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        cu = await ctx.new_page()
        await cu.goto(BASE + "/", wait_until="commit"); await cu.wait_for_timeout(800); await cu.evaluate("localStorage.clear()")
        await cu.goto(BASE + "/app/", wait_until="commit"); await cu.wait_for_timeout(1500)
        await one(cu, "c_home")
        await cu.evaluate(f"window.pebble.say({json.dumps(SAMPLE)}, 300)")
        await seq(cu, "c_listen", 300 * 27 + 900, 120)
        await seq(cu, "c_think", 1000, 150)
        await cu.wait_for_timeout(100)
        await seq(cu, "c_res1", 1800, 120)
        await cu.evaluate("window.pebble.slide(1)"); await seq(cu, "c_slide1", 700, 100)
        await cu.evaluate("window.pebble.slide(2)"); await seq(cu, "c_slide2", 700, 100)
        await cu.evaluate("window.pebble.slide(0)"); await cu.wait_for_timeout(700)
        await cu.evaluate("window.pebble.say('Show me something more artsy with lots of light', 280)")
        await seq(cu, "c_listen2", 280 * 9 + 900, 120)
        await seq(cu, "c_think2", 1000, 150)
        await cu.wait_for_timeout(100)
        await seq(cu, "c_res2", 1800, 120)
        await cu.evaluate("window.pebble.map(true)"); await cu.wait_for_timeout(1500); await one(cu, "c_map")
        await cu.evaluate("window.pebble.map(false)"); await cu.wait_for_timeout(500)
        await cu.evaluate("window.pebble.open(0)"); await cu.wait_for_timeout(900); await one(cu, "c_detail")
        await cu.evaluate("window.__tourSpeed = 7; window.pebble.tour()"); await cu.wait_for_timeout(600)
        frames = await cu.evaluate("""async () => { const c = document.querySelector('canvas'); const out = [];
          for (let i = 0; i < 100; i++) { await new Promise(r => requestAnimationFrame(r)); out.push(c.toDataURL('image/jpeg', 0.92)); } return out; }""")
        clip = []
        for i, fr in enumerate(frames):
            await cu.evaluate("""(src) => { const c = document.querySelector('canvas'); let im = document.getElementById('__f');
              if (!im) { im = document.createElement('img'); im.id='__f'; im.style.cssText='position:absolute;inset:0;width:100%;height:100%;'; c.parentElement.appendChild(im); c.style.visibility='hidden'; }
              im.src = src; return new Promise(r => im.complete ? r() : im.onload = r); }""", fr)
            clip.append([round(i * 1000 / 30), await shot(cu, f"c_tour_{i:03d}")])
        manifest["c_tour"] = clip
        await cu.evaluate("document.getElementById('__f')?.remove()")
        await cu.evaluate("window.pebble.view('detail')"); await cu.wait_for_timeout(500)
        await cu.evaluate("window.pebble.talk()"); await cu.wait_for_timeout(800); await one(cu, "c_sheet")
        await cu.evaluate("window.pebble.send()"); await cu.wait_for_timeout(900); await one(cu, "c_status_new")

        ag = await ctx.new_page()
        await ag.goto(BASE + "/agent/", wait_until="commit"); await ag.wait_for_timeout(1500)
        await one(ag, "a_inbox")
        lead_id = await ag.evaluate("JSON.parse(localStorage.getItem('pebble.state.v2')).leads[0].id")
        await ag.evaluate(f"window.pebbleAgent.open('{lead_id}')"); await ag.wait_for_timeout(900)
        await one(ag, "a_lead_top")
        # scroll to the checklist
        await ag.evaluate("document.querySelector('.absolute.inset-0.z-30 .overflow-y-auto').scrollTo({top: 420, behavior: 'instant'})")
        await ag.wait_for_timeout(400); await one(ag, "a_check0")
        boxes = ag.locator("section:has-text('Human verification') button")
        for i in range(4):
            await boxes.nth(i).click(); await ag.wait_for_timeout(350); await one(ag, f"a_check{i+1}")
        await ag.locator("button:has-text('Verify')").last.click(); await ag.wait_for_timeout(600); await one(ag, "a_verified")
        await ag.locator("button:has-text('Contact client')").click(); await ag.wait_for_timeout(700); await one(ag, "a_compose")
        await ag.locator("button:has-text('Send message')").click(); await ag.wait_for_timeout(600)
        await cu.bring_to_front(); await cu.wait_for_timeout(900); await one(cu, "c_status_verified")
        await cu.locator("button:has-text('Sat 10:00')").click(); await cu.wait_for_timeout(800); await one(cu, "c_status_tour")
        # two quiet days pass
        await cu.evaluate("(() => { const s = JSON.parse(localStorage.getItem('pebble.state.v2')); s.clockOffset = 50*3600*1000; localStorage.setItem('pebble.state.v2', JSON.stringify(s)); })()")
        await ag.bring_to_front(); await ag.evaluate("1"); await ag.wait_for_timeout(1200)
        await ag.evaluate("window.pebbleAgent.tab('nudges')"); await ag.wait_for_timeout(700); await one(ag, "a_nudges")
        await ag.locator("button:has-text('Send')").first.click(); await ag.wait_for_timeout(700); await one(ag, "a_nudge_sent")
        await cu.bring_to_front(); await cu.evaluate("1"); await cu.wait_for_timeout(1200)
        await cu.evaluate(f"window.pebble.status('{lead_id}')"); await cu.wait_for_timeout(900); await one(cu, "c_status_nudged")
        await cu.locator("button:has-text('Start application')").click(); await cu.wait_for_timeout(800); await one(cu, "c_status_applied")
        await ag.bring_to_front(); await ag.evaluate("1"); await ag.wait_for_timeout(1000)
        await ag.evaluate(f"window.pebbleAgent.open('{lead_id}')"); await ag.wait_for_timeout(700)
        await ag.evaluate("document.querySelector('.absolute.inset-0.z-30 .overflow-y-auto').scrollTo({top: 900, behavior: 'instant'})"); await ag.wait_for_timeout(300)
        await one(ag, "a_lead_app")
        await ag.locator("button:has-text('Close deal')").click(); await ag.wait_for_timeout(600)
        await ag.evaluate("window.pebbleAgent.tab('pipeline')"); await ag.wait_for_timeout(600); await one(ag, "a_pipeline")
        await cu.bring_to_front(); await cu.wait_for_timeout(900); await one(cu, "c_status_closed")
        # outcome montage: rent / buy / land / stay detail screens
        for lid, nm in [("pb-001", "rent"), ("pb-007", "buy"), ("pb-008", "land"), ("pb-009", "stay")]:
            await cu.evaluate(f"window.pebble.openId('{lid}')"); await cu.wait_for_timeout(600); await one(cu, f"o_{nm}")

        # auto-translate: a Spanish-speaking client (separate session)
        ectx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2)
        es = await ectx.new_page()
        await es.goto(BASE + "/", wait_until="commit"); await es.wait_for_timeout(800); await es.evaluate("localStorage.clear()")
        await es.goto(BASE + "/app/", wait_until="commit"); await es.wait_for_timeout(1500)
        ES = "Busco un apartamento acogedor de dos habitaciones cerca del campus, menos de 3 mil dólares al mes, para mí y mi perro"
        await es.evaluate(f"window.pebble.say({json.dumps(ES)}, 230)")
        await seq(es, "e_listen", 230 * 21 + 900, 140)
        await es.wait_for_timeout(1300); await seq(es, "e_res", 1200, 150)
        await es.locator("button:has-text('Sí / Yes')").click(); await es.wait_for_timeout(200)
        await seq(es, "e_res_es", 1200, 150)
        await es.evaluate("window.pebble.open(0)"); await es.wait_for_timeout(800); await one(es, "e_detail")
        await es.evaluate("window.pebble.talk()"); await es.wait_for_timeout(700); await one(es, "e_sheet")
        await es.evaluate("window.pebble.send()"); await es.wait_for_timeout(700)
        ea = await ectx.new_page(); await ea.goto(BASE + "/agent/", wait_until="commit"); await ea.wait_for_timeout(1500)
        await one(ea, "e_agent_inbox")
        eid = await ea.evaluate("JSON.parse(localStorage.getItem('pebble.state.v2')).leads[0].id")
        await ea.evaluate(f"window.pebbleAgent.open('{eid}')"); await ea.wait_for_timeout(800); await one(ea, "e_agent_lead")

        # dashboard
        dctx = await b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5)
        # share state with the dashboard
        state = await cu.evaluate("localStorage.getItem('pebble.state.v2')")
        d = await dctx.new_page()
        await d.goto(BASE + "/", wait_until="commit"); await d.wait_for_timeout(800); await d.evaluate(f"localStorage.setItem('pebble.state.v2', {json.dumps(state)})")
        await d.goto(BASE + "/dashboard/", wait_until="commit"); await d.wait_for_timeout(2000)
        await one(d, "d_top")
        await d.evaluate("window.scrollTo(0, 560)"); await d.wait_for_timeout(500); await one(d, "d_bottom")
        await d.locator("button:has-text('Approve')").first.click(); await d.wait_for_timeout(500); await one(d, "d_bottom_approved")

        # listing art for the "search every listing" visual
        g = await dctx.new_page()
        await g.goto(BASE + "/gallery/", wait_until="commit"); await g.wait_for_timeout(1500)
        ids = await g.evaluate("[...document.querySelectorAll('[id^=pb-]')].map(e=>e.id)")
        arts = []
        for lid in ids:
            el = g.locator(f"#{lid} > div").first
            await el.screenshot(path=f"{OUT}/art_{lid}.jpg", type="jpeg", quality=90); arts.append(f"cap/art_{lid}.jpg")
        manifest["arts"] = arts
        manifest["lead_id"] = lead_id
        json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=0)
        await b.close()

asyncio.run(main())
print("done")
