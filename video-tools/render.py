# Renders stage.html frame-by-frame into one H.264 file per segment.
import asyncio, subprocess, sys, os
from playwright.async_api import async_playwright
FPS = 30
SEGS = [(0,6.5),(6.5,17),(17,31),(31,41),(41,49.3),(49.3,56.6),(56.6,73),(73,88),(88,101),(101,109)]
async def seg(b, i, a, z):
    out = f"segs/s{i:02d}.mp4"; tmp = f"segs/s{i:02d}.part.mp4"
    n0, n1 = round(a * FPS), round(z * FPS)
    pg = await b.new_page(viewport={"width": 1920, "height": 1080})
    await pg.goto("http://localhost:3100/stage.html"); await pg.evaluate("window.ready")
    ff = subprocess.Popen(["ffmpeg","-v","error","-y","-f","image2pipe","-framerate",str(FPS),"-c:v","mjpeg","-i","-","-c:v","libx264","-preset","veryfast","-crf","18","-pix_fmt","yuv420p","-r",str(FPS),tmp], stdin=subprocess.PIPE)
    for n in range(n0, n1):
        await pg.evaluate(f"window.render({n / FPS})")
        ff.stdin.write(await pg.screenshot(type="jpeg", quality=92))
    ff.stdin.close(); ff.wait()
    if ff.returncode == 0: os.replace(tmp, out)
    await pg.close(); print("done", i, flush=True)
async def main():
    only = [int(x) for x in sys.argv[1].split(",")] if len(sys.argv) > 1 else range(len(SEGS))
    os.makedirs("segs", exist_ok=True)
    async with async_playwright() as p:
        bs = [await p.chromium.launch(executable_path="/usr/bin/google-chrome") for _ in range(2)]
        sem = asyncio.Semaphore(2); jobs = []
        async def run(k, i):
            async with sem: await seg(bs[k % 2], i, *SEGS[i])
        await asyncio.gather(*[run(k, i) for k, i in enumerate(only)])
        for b in bs: await b.close()
asyncio.run(main())
