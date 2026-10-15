#!/usr/bin/env python3
"""Slice approved hero part sheets into rig-pixel PNG parts.

Usage:
  python3 tools/slice-hero-parts.py teknium            # dry run: measure, report, write nothing
  python3 tools/slice-hero-parts.py teknium --write    # write PNGs + the hero's MANIFEST.md rows
  python3 tools/slice-hero-parts.py teknium --debug /tmp/dbg   # also write keyed crops/overlays there

Input:  assets/heroes/<id>/src/SLICE.json plus the sheet images it names.
Output: assets/heroes/<id>/<id>_<part>.png and the block between
        <!-- slice:<id>:begin --> / <!-- slice:<id>:end --> in assets/heroes/MANIFEST.md.

Deterministic: fixed regions, fixed scales, no randomness. Requires numpy, scipy and Pillow
(authoring tool only; tests never run it, they verify the hashes it records in SLICE.json).

Pipeline per part
  1. Key the sheet background by chroma ("magentaness" m = min(R, 1.6B) - G, which stays near
     zero for black/white/skin/red/green/blue art and is ~200+ on the pink/violet backgrounds).
     The background level is the median m of the sheet border, so JPEG noise and per-sheet hue
     drift are handled; alpha ramps linearly between 45% and 85% of that level.
  2. Connected components inside the part's region. Every component bigger than 2% of the
     largest one must be the same drawing, otherwise the slice FAILS (no silent guessing).
     Small specks inside the main bounding box (sparks, JPEG islands) are kept.
  3. Interior holes that are not background coloured are filled; real background holes
     (cable coil centre, guitar cut-outs) stay transparent. Interior pixels get alpha 1, so
     red visor stripes etc. are never partially keyed.
  4. Despill: edge colours are un-mixed from the measured background, F = (C - (1-a)B) / a,
     then any remaining magenta cast is clamped.
  5. Grip hands: the dark rod is located from the rod-only columns either side of the hand,
     removed outside the hand and where it is visible inside it, and its centre/axis become
     the grip point and grip axis. grip_front is the finger/thumb band in front of the rod
     line; grip_back is the whole hand. When the source grip_back and grip_front drawings are
     near-identical (IoU > 0.85) both are derived from the grip_front drawing, so the pair
     registers exactly.
  6. Optional rotate/flip, then premultiplied Lanczos downsample to the rig-pixel size.
  7. Pivots by rule (limb = top-cap centre, joint = bottom-cap centre, foot = ankle + flat
     sole heel/toe, hand = wrist, head = neck, torso = centre + SLICE.json anchor fractions).
"""
import argparse, hashlib, json, math, os, re, sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def magness(c):
    return np.minimum(c[..., 0], 1.6 * c[..., 2]) - c[..., 1]

class Sheet:
    def __init__(self, path):
        self.path = path
        self.rgb = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
        b = 10
        border = np.concatenate([self.rgb[:b].reshape(-1, 3), self.rgb[-b:].reshape(-1, 3),
                                 self.rgb[:, :b].reshape(-1, 3), self.rgb[:, -b:].reshape(-1, 3)])
        self.bg = np.median(border, 0)
        self.m = magness(self.rgb)
        self.mbg = float(np.median(magness(border)))
        if self.mbg < 150:
            raise SystemExit(f'{path}: background is not magenta-like (median m={self.mbg:.0f})')

    def key(self, rect):
        x0, y0, x1, y1 = rect
        rgb = self.rgb[y0:y1, x0:x1]
        m = self.m[y0:y1, x0:x1]
        hi, lo = 0.85 * self.mbg, 0.45 * self.mbg
        a = np.clip((hi - m) / (hi - lo), 0, 1)
        return rgb, a, m

def components(alpha, label):
    hard = alpha > 0.5
    lab, n = ndi.label(hard, structure=np.ones((3, 3)))
    if n == 0:
        raise SystemExit(f'{label}: empty region (no art found)')
    sizes = ndi.sum(hard, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1]
    main = order[0] + 1
    objs = ndi.find_objects(lab)
    sy, sx = objs[main - 1]
    keep = lab == main
    significant = [int(i + 1) for i in order if sizes[i] >= 0.02 * sizes[order[0]] and sizes[i] >= 150]
    if len(significant) > 1:
        info = ', '.join(f'#{i}:{int(sizes[i-1])}px@x{objs[i-1][1].start}-{objs[i-1][1].stop},y{objs[i-1][0].start}-{objs[i-1][0].stop}' for i in significant)
        raise SystemExit(f'{label}: {len(significant)} significant components in one cell ({info}); fix the region or regenerate the sheet')
    pad = 6
    for i in order[1:]:
        oy, ox = objs[i]
        if oy.start >= sy.start - pad and oy.stop <= sy.stop + pad and ox.start >= sx.start - pad and ox.stop <= sx.stop + pad:
            keep |= lab == i + 1
    return keep, int(sizes[order[0]]), len(significant)

def clean(rgb, alpha, m, keep, sheet):
    hard = keep & (alpha > 0.5)
    filled = ndi.binary_fill_holes(hard)
    holes, nh = ndi.label(filled & ~hard)
    for i in range(1, nh + 1):
        hm = holes == i
        if np.median(m[hm]) > 0.6 * sheet.mbg:   # genuinely background-coloured hole
            filled[hm] = False
    region = ndi.binary_dilation(filled, iterations=2)
    a = np.where(region, alpha, 0.0)
    interior = ndi.binary_erosion(filled, iterations=2)
    a[interior] = 1.0
    a[a < 0.12] = 0
    # despill: un-mix the measured background from partially transparent pixels
    out = rgb.copy()
    part = (a > 0) & (a < 1)
    aa = a[part][:, None]
    out[part] = np.clip((rgb[part] - (1 - aa) * sheet.bg) / aa, 0, 255)
    # clamp any residual magenta cast on the edge band
    edge = (a > 0) & ~interior
    c = out[edge]
    over = np.maximum(0, magness(c) - 20)
    c[:, 0] -= over * 0.6
    c[:, 2] -= over * 0.6 / 1.6
    out[edge] = np.clip(c, 0, 255)
    return out, a

def crop_to(rgb, a, margin=2, box_from=None):
    ys, xs = np.nonzero((a if box_from is None else box_from) > 0)
    y0, y1, x0, x1 = max(0, ys.min() - margin), ys.max() + 1 + margin, max(0, xs.min() - margin), xs.max() + 1 + margin
    return rgb[y0:y1, x0:x1], a[y0:y1, x0:x1], (x0, y0)

def to_image(rgb, a):
    arr = np.dstack([rgb, a * 255]).round().clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, 'RGBA')

def rgba_arrays(im):
    arr = np.asarray(im).astype(np.float32)
    return arr[..., :3], arr[..., 3] / 255.0

def resample(im, scale):
    w, h = im.size
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    out = im.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')
    arr = np.asarray(out).copy()
    arr[arr[..., 3] < 6] = 0          # drop ringing dust
    return Image.fromarray(arr, 'RGBA'), (nw / w, nh / h)

def cap_centre(a, end, frac=0.12):
    """Centroid of the topmost/bottommost `frac` of opaque rows."""
    ys, xs = np.nonzero(a > 0.5)
    y0, y1 = ys.min(), ys.max()
    span = max(2, int(round((y1 - y0 + 1) * frac)))
    sel = ys <= y0 + span if end == 'top' else ys >= y1 - span
    w = a[ys[sel], xs[sel]]
    return float((xs[sel] * w).sum() / w.sum()), float((ys[sel] * w).sum() / w.sum())

def rod_analysis(a, rgb, label):
    """Find a horizontal-ish rod through a hand: returns dict with band lines and hand span."""
    hard = a > 0.5
    h, w = hard.shape
    cols = np.nonzero(hard.any(0))[0]
    heights = np.array([hard[:, x].sum() for x in range(w)])
    present = heights > 0
    xs = np.nonzero(present)[0]
    left, right = xs.min(), xs.max()
    med_short = np.median(np.sort(heights[present])[: max(4, len(xs) // 8)])
    thin = present & (heights <= med_short * 1.8)
    # rod-only columns are the thin ones touching either end
    lcols, x = [], left
    while x <= right and thin[x]:
        lcols.append(x); x += 1
    rcols, x = [], right
    while x >= left and thin[x]:
        rcols.append(x); x -= 1
    if len(lcols) < 6 or len(rcols) < 6:
        raise SystemExit(f'{label}: could not find the grip rod on both sides of the hand (left {len(lcols)} cols, right {len(rcols)} cols)')
    pts = []
    for x in lcols[2:] + rcols[2:]:
        yy = np.nonzero(hard[:, x])[0]
        pts.append((x, yy.min(), yy.max()))
    pts = np.array(pts, float)
    top = np.polyfit(pts[:, 0], pts[:, 1], 1)
    bot = np.polyfit(pts[:, 0], pts[:, 2], 1)
    mid = (top + bot) / 2
    thick = float(np.median(pts[:, 2] - pts[:, 1]) + 1)
    hx0, hx1 = lcols[-1] + 1, rcols[-1] - 1
    rod_px = np.concatenate([rgb[int(y0):int(y1) + 1, int(x)] for x, y0, y1 in pts])
    rod_col = np.median(rod_px, 0)
    return dict(top=top, bot=bot, mid=mid, thick=thick, hx0=int(hx0), hx1=int(hx1), left=int(left), right=int(right),
                angle=math.degrees(math.atan(mid[0])), colour=rod_col)

def remove_rod(rgb, a, rod, mode):
    """mode 'back': keep whole hand; mode 'front': keep finger band in front of the rod line."""
    h, w = a.shape
    yy, xx = np.mgrid[0:h, 0:w]
    top = np.polyval(rod['top'], xx) - 1.5
    bot = np.polyval(rod['bot'], xx) + 1.5
    band = (yy >= top) & (yy <= bot)
    outside = (xx < rod['hx0']) | (xx > rod['hx1'])
    a = a.copy()
    a[band & outside] = 0
    # visible rod continuing into the hand: rod-coloured band pixels connected to the cut ends
    dist = np.linalg.norm(rgb - rod['colour'], axis=2)
    rodlike = band & (dist < 26) & (a > 0)
    lab, n = ndi.label(rodlike)
    for i in range(1, n + 1):
        comp = lab == i
        cx = xx[comp]
        if cx.min() <= rod['hx0'] + 1 or cx.max() >= rod['hx1'] - 1:
            a[comp] = 0
    if mode == 'front':
        a[yy < top + 1.5] = 0
    # remove any orphan fragments left after the cut
    lab, n = ndi.label(a > 0.5)
    if n > 1:
        sizes = ndi.sum(a > 0.5, lab, range(1, n + 1))
        big = np.argmax(sizes) + 1
        mask = ndi.binary_dilation(lab == big, iterations=2) if mode == 'back' else (sizes[lab - 1] >= 20) & (lab > 0)
        a = np.where(mask, a, 0) if mode == 'back' else np.where(mask | (a <= 0.5) & ndi.binary_dilation(a > 0.5), a, 0)
    return a

def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('hero')
    ap.add_argument('--write', action='store_true')
    ap.add_argument('--debug')
    args = ap.parse_args()
    hero = args.hero
    base = os.path.join(ROOT, 'assets', 'heroes', hero)
    spec_path = os.path.join(base, 'src', 'SLICE.json')
    spec = json.load(open(spec_path))
    if spec['hero'] != hero:
        raise SystemExit('SLICE.json hero mismatch')
    sheets = {k: Sheet(os.path.join(base, 'src', v['file'])) for k, v in spec['sheets'].items()}
    def rect_of(p):
        sh = spec['sheets'][p['sheet']]
        if 'rect' in p:
            return p['rect']
        cols, rows = sh['grid']
        H, W = sheets[p['sheet']].rgb.shape[:2]
        gx0, gy0, gx1, gy1 = sh.get('area', [0, 0, W, H])
        c, r = p['cell']
        cw, chh = (gx1 - gx0) / cols, (gy1 - gy0) / rows
        return [int(gx0 + c * cw), int(gy0 + r * chh), int(gx0 + (c + 1) * cw), int(gy0 + (r + 1) * chh)]

    raw = {}
    report = []
    for name, p in spec['parts'].items():
        if 'derive' in p:
            continue
        sheet = sheets[p['sheet']]
        rect = rect_of(p)
        rgb, alpha, m = sheet.key(rect)
        keep, size, nsig = components(alpha, f'{hero}.{name} ({p["sheet"]} {rect})')
        rgb2, a2 = clean(rgb, alpha, m, keep, sheet)
        raw[name] = (rgb2, a2, rect)
        report.append(f'{name:16s} sheet {p["sheet"]} rect {rect} main component {size}px')

    # grip pairs
    grip_info = {}
    for name, p in spec['parts'].items():
        if p.get('kind') != 'grip':
            continue
        rgb, a, rect = raw[name]
        rgb, a, _ = crop_to(rgb, a, 0)
        raw[name] = (rgb, a, rect)
        grip_info[name] = rod_analysis(a, rgb, f'{hero}.{name}')
    pairs = spec.get('gripPairs', [])
    derived_from = {}
    for back, front in pairs:
        rb, ab, _ = raw[back]
        rf, af, _ = raw[front]
        gb, gf = grip_info[back], grip_info[front]
        # align on the rod centre at the hand centre, compare silhouettes above the rod
        def hand_mask(a, g):
            h, w = a.shape
            cx = (g['hx0'] + g['hx1']) / 2
            cy = np.polyval(g['mid'], cx)
            return a > 0.5, cx, cy
        mb_, cxb, cyb = hand_mask(ab, gb)
        mf_, cxf, cyf = hand_mask(af, gf)
        H = max(mb_.shape[0], mf_.shape[0]) + 80; W = max(mb_.shape[1], mf_.shape[1]) + 80
        def place(mk, cx, cy):
            out = np.zeros((H, W), bool)
            ox, oy = int(round(W / 2 - cx)), int(round(H / 2 - cy))
            hh, ww = mk.shape
            out[max(0, oy):oy + hh, max(0, ox):ox + ww] = mk[max(0, -oy):H - oy, max(0, -ox):W - ox][:min(hh, H - oy), :min(ww, W - ox)]
            return out
        A_, B_ = place(mb_, cxb, cyb), place(mf_, cxf, cyf)
        iou = float((A_ & B_).sum() / max(1, (A_ | B_).sum()))
        # Always register the pair from ONE drawing: mixing two separately generated hands
        # misaligns fingers and thumbs. IoU is recorded so the choice is auditable.
        src_back = front
        derived_from[back] = (src_back, iou)
    grip_out = {}
    for back, front in pairs:
        src_back, iou = derived_from[back]
        rgbF, aF, rect = raw[front]
        g = grip_info[front]
        if src_back == front:
            a_back = remove_rod(rgbF, aF, g, 'back'); rgb_back = rgbF; gb = g
        else:
            rgbB, aB, _ = raw[back]; gb = grip_info[back]
            a_back = remove_rod(rgbB, aB, gb, 'back'); rgb_back = rgbB
        a_front = remove_rod(rgbF, aF, g, 'front')
        grip_out[back] = (rgb_back, a_back, gb, iou, src_back)
        grip_out[front] = (rgbF, a_front, g, iou, front)
        report.append(f'grip pair {back}/{front}: source IoU {iou:.2f} -> grip_back from {src_back}, grip_front = finger band of {front}; rod angle {g["angle"]:.1f} deg, thickness {g["thick"]:.0f}px')
    for name, p in spec['parts'].items():
        if p.get('kind') == 'grip' and name not in grip_out:
            rgb, a, rect = raw[name]
            g = grip_info[name]
            grip_out[name] = (rgb, remove_rod(rgb, a, g, 'back'), g, None, name)

    # scales
    def sheet_scale(sheet_key):
        sh = spec['sheets'][sheet_key]
        if 'scale' in sh:
            return sh['scale']
        ref = sh['scaleFrom']    # {"part": name, "wristWidth": px}
        a = grip_out[ref['part']][1] if ref['part'] in grip_out else raw[ref['part']][1]
        hard = a > 0.5
        ys = np.nonzero(hard.any(1))[0]
        rows = ys[:max(3, len(ys) // 12)]
        width = np.median([np.ptp(np.nonzero(hard[y])[0]) + 1 for y in rows])
        return ref['wristWidth'] / width

    outputs = {}
    measured = {}
    for name, p in spec['parts'].items():
        kind = p['kind']
        if name in grip_out:
            rgb, a, g, iou, src = grip_out[name]
        else:
            rgb, a, _ = raw[name]
            g = None
        partner = next((b for b, f in pairs if f == name), None)
        box = grip_out[partner][1] if partner and grip_out[partner][4] == name else None
        rgb, a, off = crop_to(rgb, a, 2, box)
        im = to_image(rgb, a)
        rot = p.get('rotate', 0)
        flip = p.get('flip', False)
        # geometry carried through rotate/flip for grips and weapon anchors (in crop px)
        anchors = {}
        if g is not None:
            cx = (g['hx0'] + g['hx1']) / 2 - off[0]
            cy = np.polyval(g['mid'], cx + off[0]) - off[1]
            anchors['grip'] = (cx, cy)
            anchors['axis'] = g['angle']
        if kind == 'weapon':
            W, H = im.size
            for key in ('grip', 'grip2', 'tip'):
                if key in p:
                    anchors[key] = (p[key][0] * W, p[key][1] * H)
        if rot:
            W, H = im.size
            im = im.rotate(-rot, resample=Image.BICUBIC, expand=True)
            W2, H2 = im.size
            r = math.radians(rot)
            def rp(pt):
                x, y = pt[0] - W / 2, pt[1] - H / 2
                return (x * math.cos(r) - y * math.sin(r) + W2 / 2, x * math.sin(r) + y * math.cos(r) + H2 / 2)
            anchors = {k: (rp(v) if isinstance(v, tuple) else v + rot) for k, v in anchors.items()}
        if flip:
            W, H = im.size
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            anchors = {k: ((W - 1 - v[0], v[1]) if isinstance(v, tuple) else -v) for k, v in anchors.items()}
        # target scale
        rgb_, a_ = rgba_arrays(im)
        if kind in ('limb',):
            top = cap_centre(a_, 'top'); bot = cap_centre(a_, 'bottom')
            s = p['length'] / math.dist(top, bot)
        elif kind in ('head', 'torso', 'secondary'):
            s = p['height'] / im.size[1]
        elif kind == 'foot':
            s = p['length'] / im.size[0]
        elif kind in ('grip', 'hand', 'weapon', 'cable'):
            s = sheet_scale(p['sheet']) * p.get('scaleMul', 1)
        else:
            raise SystemExit(f'{name}: unknown kind {kind}')
        out, (sx, sy) = resample(im, s)
        anchors = {k: ((v[0] + 0.5) * sx - 0.5, (v[1] + 0.5) * sy - 0.5) if isinstance(v, tuple) else v for k, v in anchors.items()}
        rgbo, ao = rgba_arrays(out)
        W, H = out.size
        info = {'w': W, 'h': H, 'kind': kind, 'scale': round(s, 4)}
        r1 = lambda v: [round(v[0]), round(v[1])]
        if kind == 'limb':
            info['pivot'] = r1(cap_centre(ao, 'top')); info['joint'] = r1(cap_centre(ao, 'bottom'))
        elif kind == 'secondary':
            info['pivot'] = r1(cap_centre(ao, 'top', 0.08))
        elif kind == 'foot':
            ys, xs = np.nonzero(ao > 0.5)
            info['pivot'] = r1(cap_centre(ao, 'top', 0.15))
            if 'ankle' in p:
                info['pivot'] = [round(p['ankle'][0] * W), round(p['ankle'][1] * H)]
            sole_y = int(np.percentile(ys, 99.5))
            row = np.nonzero(ao[max(0, sole_y - 2):sole_y + 1].max(0) > 0.5)[0]
            info['sole'] = [int(row.min()), sole_y, int(row.max()), sole_y]
        elif kind == 'head':
            info['pivot'] = r1(cap_centre(ao, 'bottom', 0.06)) if 'neck' not in p else [round(p['neck'][0] * W), round(p['neck'][1] * H)]
        elif kind == 'torso':
            info['pivot'] = [round(W / 2), round(H / 2)]
            info['anchors'] = {k: [round(v[0] * W), round(v[1] * H)] for k, v in p.get('anchors', {}).items()}
        elif kind in ('hand', 'grip'):
            info['pivot'] = r1(cap_centre(ao, 'top', 0.06))
            if partner and partner in measured:
                info['pivot'] = measured[partner]['pivot']; info['registeredWith'] = partner
            if 'grip' in anchors:
                info['grip'] = r1(anchors['grip']); info['axis'] = round(((anchors['axis'] + 90) % 180) - 90, 1)
            if 'gripPoint' in p:
                info['grip'] = [round(p['gripPoint'][0] * W), round(p['gripPoint'][1] * H)]
        elif kind == 'weapon':
            info['pivot'] = r1(anchors['grip'])
            if 'grip2' in anchors: info['grip2'] = r1(anchors['grip2'])
            if 'tip' in anchors: info['tip'] = r1(anchors['tip'])
            else:
                ys, xs = np.nonzero(ao > 0.5)
                d = (xs - anchors['grip'][0]) ** 2 + (ys - anchors['grip'][1]) ** 2
                i = int(np.argmax(d)); info['tip'] = [int(xs[i]), int(ys[i])]
        elif kind == 'cable':
            info['pivot'] = r1(cap_centre(ao, 'top', 0.08))
        if name in grip_out and grip_out[name][3] is not None:
            info['sourceIoU'] = round(grip_out[name][3], 3); info['source'] = grip_out[name][4]
        spillmask = (ao > 0) & (rgbo[..., 0] > 150) & (rgbo[..., 2] > 150) & (rgbo[..., 1] < 80)
        if spillmask.any():
            # residual fringe from glow-over-magenta edges: drop near-transparent ones, neutralise the rest
            arr = np.asarray(out).copy()
            weak = spillmask & (ao < 0.5)
            arr[weak] = 0
            strong = spillmask & ~weak
            g = arr[..., 1].astype(np.float32)
            arr[..., 0] = np.where(strong, np.minimum(arr[..., 0], g + 60), arr[..., 0])
            arr[..., 2] = np.where(strong, np.minimum(arr[..., 2], g + 60), arr[..., 2])
            info['fringeFixed'] = int(spillmask.sum())
            out = Image.fromarray(arr, 'RGBA'); rgbo, ao = rgba_arrays(out)
        partial = float(((ao > 0) & (ao < 1)).sum() / max(1, (ao > 0).sum()))
        info['partialAlpha'] = round(partial, 3)
        spill = int(((ao > 0) & (rgbo[..., 0] > 150) & (rgbo[..., 2] > 150) & (rgbo[..., 1] < 80)).sum())
        info['magentaPixels'] = spill
        measured[name] = info
        outputs[name] = out
        report.append(f'{name:16s} -> {W}x{H} scale {s:.3f} ' + ' '.join(f'{k}={v}' for k, v in info.items() if k in ('pivot', 'joint', 'grip', 'axis', 'sole', 'tip', 'grip2')) + f' partialAlpha {partial:.2f} magenta {spill}')
        if args.debug:
            os.makedirs(args.debug, exist_ok=True)
            big = out.resize((W * 4, H * 4), Image.NEAREST)
            bgim = Image.new('RGBA', big.size, (40, 44, 60, 255)); bgim.alpha_composite(big)
            bgim.save(os.path.join(args.debug, f'{hero}_{name}.png'))
    print('\n'.join(report))
    bad = [n for n, i in measured.items() if i['magentaPixels'] > 0 or i['partialAlpha'] < 0.02]
    if bad:
        raise SystemExit(f'quality gate failed (magenta spill or 1-bit alpha): {bad}')
    rows = build_rows(hero, spec, measured)
    if not args.write:
        print('\n(dry run) MANIFEST rows that --write would install:\n' + rows)
        return
    files = {}
    for name, out in outputs.items():
        fn = f'{hero}_{spec["parts"][name].get("file", name)}.png'
        path = os.path.join(base, fn)
        if os.path.relpath(path, base).startswith('..'):
            raise SystemExit('refusing to write outside the hero folder')
        out.save(path, optimize=True)
        files[fn] = sha(path)
    spec['outputs'] = {'sha256': files, 'inputs': {k: sha(os.path.join(base, 'src', v['file'])) for k, v in spec['sheets'].items()}}
    spec['measured'] = measured
    json.dump(spec, open(spec_path, 'w'), indent=1)
    open(spec_path, 'a').write('\n')
    install_rows(hero, rows)
    print(f'wrote {len(files)} PNGs, SLICE.json hashes and the MANIFEST.md block for {hero}')

def build_rows(hero, spec, M):
    """Rig rows from measurements + SLICE.json rig section (parents, attach rules, roles)."""
    rig = spec['rig']
    lines = ['| part | image | size | pivot | parent | attach | role | data |', '|---|---|---|---|---|---|---|---|']
    def anchor(ref):
        # "torso:shoulder" -> torso anchor, "uarm:joint" -> limb joint, "hand:grip", "foot", explicit [x,y]
        if isinstance(ref, list):
            return ref
        part, key = ref.split(':')
        info = M[part]
        if key == 'joint': return info['joint']
        if key == 'grip': return info['grip']
        if key == 'pivot': return info['pivot']
        return info['anchors'][key]
    for slot, r in rig.items():
        src = r.get('part', slot)
        info = M[src]
        fn = f'{hero}_{spec["parts"][src].get("file", src)}.png'
        parent = r.get('parent', '-')
        att = anchor(r['attach']) if 'attach' in r else None
        if 'attachOffset' in r and att: att = [att[0] + r['attachOffset'][0], att[1] + r['attachOffset'][1]]
        data = []
        for key in ('grip', 'axis', 'tip', 'grip2', 'sole'):
            if key in info and r.get('role') not in ('torso',):
                v = info[key]
                data.append(f'{key}=' + (','.join(str(x) for x in v) if isinstance(v, list) else str(v)))
        if 'joint' in info: data.append('joint=' + ','.join(str(x) for x in info['joint']))
        for key, v in r.get('data', {}).items():
            data.append(f'{key}=' + (','.join(str(x) for x in v) if isinstance(v, list) else str(v)))
        lines.append(f'| {slot} | {fn} | {info["w"]}x{info["h"]} | {info["pivot"][0]},{info["pivot"][1]} | {parent} | '
                     + (f'{att[0]},{att[1]}' if att else '-') + f' | {r.get("role", "body")} | {" ".join(data)} |')
    return '\n'.join(lines)

def install_rows(hero, rows):
    path = os.path.join(ROOT, 'assets', 'heroes', 'MANIFEST.md')
    text = open(path).read()
    begin, end = f'<!-- slice:{hero}:begin -->', f'<!-- slice:{hero}:end -->'
    if begin not in text or end not in text:
        raise SystemExit(f'MANIFEST.md has no {begin} … {end} block for {hero}')
    pre, rest = text.split(begin, 1)
    _, post = rest.split(end, 1)
    open(path, 'w').write(pre + begin + '\n' + rows + '\n' + end + post)

if __name__ == '__main__':
    main()
