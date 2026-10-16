#!/usr/bin/env python3
"""Compose before/after evidence from tools/capture-hero-evidence.mjs output.

Usage: python3 tools/compose-hero-evidence.py <before_dir> <after_dir> <out_dir> teknium nous_girl
Writes <out>/compare/<hero>-arms-grips.png (6 key poses: BEFORE/AFTER right-facing, then
BEFORE/AFTER left-facing) and <out>/contact-sheets/{before,after,comparison}-<hero>.png.
"""
import os, sys
from PIL import Image, ImageDraw

def label_band(width, text, h=22, bg=(23, 27, 43)):
    band = Image.new('RGB', (width, h), bg)
    ImageDraw.Draw(band).text((6, 5), text, fill=(255, 255, 255))
    return band

def main():
    before, after, out = sys.argv[1:4]
    heroes = sys.argv[4:]
    os.makedirs(os.path.join(out, 'compare'), exist_ok=True)
    os.makedirs(os.path.join(out, 'contact-sheets'), exist_ok=True)
    for hero in heroes:
        b = Image.open(os.path.join(before, f'{hero}-keyposes.png')).convert('RGB')
        a = Image.open(os.path.join(after, f'{hero}-keyposes.png')).convert('RGB')
        W, H = b.size
        rows = [('BEFORE (base feat/turbofit-rig-v2), right-facing', b.crop((0, 0, W, H // 2))),
                ('AFTER (feat/teknium-nous-rig-v2), right-facing', a.crop((0, 0, W, H // 2))),
                ('BEFORE, left-facing', b.crop((0, H // 2, W, H))),
                ('AFTER, left-facing', a.crop((0, H // 2, W, H)))]
        parts = []
        for text, im in rows:
            parts += [label_band(W, f'{hero} - {text}'), im]
        sheet = Image.new('RGB', (W, sum(p.height for p in parts)))
        y = 0
        for p in parts:
            sheet.paste(p, (0, y)); y += p.height
        sheet.save(os.path.join(out, 'compare', f'{hero}-arms-grips.png'), optimize=True)
        cb = Image.open(os.path.join(before, f'{hero}-contact.png')).convert('RGB')
        ca = Image.open(os.path.join(after, f'{hero}-contact.png')).convert('RGB')
        cb.save(os.path.join(out, 'contact-sheets', f'before-{hero}.png'), optimize=True)
        ca.save(os.path.join(out, 'contact-sheets', f'after-{hero}.png'), optimize=True)
        comp = Image.new('RGB', (cb.width + ca.width, max(cb.height, ca.height) + 30), (23, 27, 43))
        d = ImageDraw.Draw(comp)
        d.text((10, 8), f'{hero} - BEFORE', fill=(255, 255, 255)); d.text((cb.width + 10, 8), f'{hero} - AFTER', fill=(255, 255, 255))
        comp.paste(cb, (0, 30)); comp.paste(ca, (cb.width, 30))
        comp.save(os.path.join(out, 'contact-sheets', f'comparison-{hero}.png'), optimize=True)
        print(hero, 'compare', sheet.size, 'contact', cb.size, ca.size)

if __name__ == '__main__':
    main()
