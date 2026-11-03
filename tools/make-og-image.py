"""Génère public/og-image.png (carte d'aperçu pour Discord, Reddit...).

Usage : python3 tools/make-og-image.py [chemin-vers-chrome]
Nécessite le module Python playwright et npm install (pour les polices).
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent

async def main():
    shader = (ROOT / 'tests/corpus/shadertoy_scene.glsl').read_text()
    args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    async with async_playwright() as p:
        kw = {'args': args}
        if len(sys.argv) > 1:
            kw['executable_path'] = sys.argv[1]
        browser = await p.chromium.launch(**kw)
        page = await browser.new_page(viewport={'width': 1200, 'height': 630})
        await page.add_init_script(f'window.SHADER = {json.dumps(shader)}; window.TIME = 2.6;')
        await page.goto((ROOT / 'tools/og-image.html').as_uri())
        await page.wait_for_function('window.DONE === true', timeout=60000)
        await page.evaluate('document.fonts.ready')
        loaded = await page.evaluate("[...document.fonts].filter(f => f.status === 'loaded').length")
        if loaded < 3:
            print('Attention : polices non chargées, lance npm install', file=sys.stderr)
        await page.wait_for_timeout(500)
        await page.screenshot(path=str(ROOT / 'public/og-image.png'))
        await browser.close()

asyncio.run(main())
