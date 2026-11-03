"""Génère les textures de bruit compatibles avec Shadertoy (public/textures).

Convention « RGBA Noise » de Shadertoy : le canal vert est le canal rouge
décalé de (37, 17) pixels. Usage : python3 tools/make-noise.py
"""
import random
from PIL import Image

def noise(n, seed):
    rnd = random.Random(seed)
    r = [rnd.randrange(256) for _ in range(n * n)]
    b = [rnd.randrange(256) for _ in range(n * n)]
    a = [rnd.randrange(256) for _ in range(n * n)]
    img = Image.new('RGBA', (n, n))
    px = []
    for y in range(n):
        for x in range(n):
            g = r[((y + 17) % n) * n + ((x - 37) % n)]
            i = y * n + x
            px.append((r[i], g, b[i], a[i]))
    img.putdata(px)
    return img

for n in (64, 256):
    noise(n, n).save(f'public/textures/rgba_noise_{n}.png', optimize=True)
    print('ok', n)
