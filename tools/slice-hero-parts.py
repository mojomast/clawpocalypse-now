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
     line; grip_back is the whole hand behind the rod. Both are always derived from the ONE
     grip_front drawing so the pair registers exactly (two separately generated hands never
     line up); the IoU of the two source drawings is recorded in SLICE.json for audit.
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
    # clamp any residual magenta cast on the edge band. Only purple-ish pixels (blue AND red
    # above green) are touched, so red visor stripes and skin edges keep their colour.
    # JPEG chroma subsampling bleeds the background ~4 px into the art, so the band is wider
    # than the alpha ramp.
    edge = (a > 0) & ~ndi.binary_erosion(filled, iterations=5)
    c = out[edge]
    purple = (c[:, 2] - c[:, 1] > 12) & (c[:, 0] - c[:, 1] > 12)
    over = np.where(purple, np.maximum(0, magness(c) - 8), 0)
    c[:, 0] -= over
    c[:, 2] -= over / 1.6
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

def point_at(a, frac):
    """Point at a vertical fraction `frac` of the opaque bounding box (or [fx, fy] fractions)."""
    ys, xs = np.nonzero(a > 0.5)
    y0, y1 = ys.min(), ys.max()
    if isinstance(frac, (list, tuple)):
        return float(xs.min() + frac[0] * (xs.max() - xs.min())), float(y0 + frac[1] * (y1 - y0))
    target_y = y0 + frac * (y1 - y0)
    band = np.abs(ys - target_y) <= max(1.5, (y1 - y0) * 0.04)
    if not band.any():
        band = np.abs(ys - target_y) <= 3
    w = a[ys[band], xs[band]]
    return float((xs[band] * w).sum() / w.sum()), float(target_y)

def shape_limb_end(out, end, pt, radius=None, deoutline=False):
    """Round a limb tenon above pivot ('top') or below joint ('bottom') and optionally replace
    any dark horizontal cut-line outline inside the tenon with adjacent interior skin colour."""
    arr = np.asarray(out).astype(np.float32).copy()
    rgb, a = arr[..., :3], arr[..., 3] / 255.0
    H, W = a.shape
    px, py = pt
    ys, xs = np.nonzero(a > 0.5)
    if len(ys) == 0:
        return out
    row_y = min(H - 1, max(0, int(round(py))))
    row_xs = np.nonzero(a[row_y] > 0.5)[0]
    hw = (row_xs.max() - row_xs.min()) / 2.0 if len(row_xs) > 1 else 6.0
    r = float(radius) if radius is not None else hw
    yy, xx = np.mgrid[0:H, 0:W]
    in_cap = (yy < py) if end == 'top' else (yy > py)
    dist = np.hypot(xx - px, yy - py)
    # Smoothly clip pixels outside the semicircular tenon cap
    clip_scale = np.where(in_cap, np.clip(r + 0.5 - dist, 0.0, 1.0), 1.0)
    a *= clip_scale
    if deoutline:
        # Sample warm interior colour just inside the pivot/joint row
        ref_y0 = max(0, row_y + (1 if end == 'top' else -4))
        ref_y1 = min(H, row_y + (5 if end == 'top' else 0))
        ref_mask = (a[ref_y0:ref_y1] > 0.8) & (rgb[ref_y0:ref_y1].mean(axis=2) > 95)
        if ref_mask.any():
            skin = np.median(rgb[ref_y0:ref_y1][ref_mask], axis=0)
            lum = rgb.mean(axis=2)
            # Only de-outline inside the tenon cap, preserving left/right side outlines
            inner_x = (xx >= (row_xs.min() + 2 if len(row_xs) else 0)) & (xx <= (row_xs.max() - 2 if len(row_xs) else W))
            dark_cap = in_cap & (a > 0.05) & (lum < 110) & ( inner_x | (dist > r - 2.2) )
            blend = np.clip((110 - lum) / 55.0, 0.0, 1.0)[..., None]
            rgb = np.where(dark_cap[..., None], rgb * (1 - blend) + skin * blend, rgb)
    arr[..., :3] = rgb
    arr[..., 3] = a * 255.0
    return Image.fromarray(arr.round().clip(0, 255).astype(np.uint8), 'RGBA')

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
        if 'colorGain' in p:
            # palette match (e.g. hair pieces drawn browner than the approved copper head)
            rgb2 = np.clip(rgb2 * np.array(p['colorGain'], np.float32), 0, 255)
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
        if 'derive' in p:
            src_name = p['derive']
            src_out = outputs[src_name]
            src_info = measured[src_name]
            rgb_d, a_d = rgba_arrays(src_out)
            Hd, Wd = a_d.shape
            yy, xx = np.mgrid[0:Hd, 0:Wd]
            mask = np.ones((Hd, Wd), np.float32)
            if 'maskBox' in p:
                bx0, by0, bx1, by1 = p['maskBox']
                x0, y0, x1, y1 = bx0 * Wd, by0 * Hd, bx1 * Wd, by1 * Hd
                feather = float(p.get('feather', 2.0))
                if bx0 > 0: mask *= np.clip((xx - x0) / feather + 0.5, 0, 1)
                if by0 > 0: mask *= np.clip((yy - y0) / feather + 0.5, 0, 1)
                if bx1 < 1: mask *= np.clip((x1 - xx) / feather + 0.5, 0, 1)
                if by1 < 1: mask *= np.clip((y1 - yy) / feather + 0.5, 0, 1)
            if p.get('vestOnly'):
                # Exclude warm bare chest skin so a vest shoulder cap never pastes chest skin over a crossing arm
                r_ch, g_ch, b_ch = rgb_d[..., 0], rgb_d[..., 1], rgb_d[..., 2]
                skin = (r_ch > 150) & (g_ch > 85) & (r_ch - b_ch > 38)
                non_skin = (~skin).astype(np.float32)
                non_skin = ndi.uniform_filter(non_skin, size=2)
                mask *= non_skin
            a_new = a_d * mask
            a_new[a_new < 0.04] = 0.0
            rgb_c, a_c, off_c = crop_to(rgb_d, a_new, 1)
            out = to_image(rgb_c, a_c)
            W, H = out.size
            rgbo, ao = rgba_arrays(out)
            partial = float(((ao > 0) & (ao < 1)).sum() / max(1, (ao > 0).sum()))
            spill = int(((ao > 0) & (rgbo[..., 0] > 150) & (rgbo[..., 2] > 150) & (rgbo[..., 1] < 80)).sum())
            src_pt = src_info['pivot']
            if 'anchor' in p:
                src_pt = src_info.get('anchors', {}).get(p['anchor']) or measured[p.get('anchorFrom', 'torso')]['anchors'][p['anchor']]
            info = {
                'w': W, 'h': H, 'kind': kind, 'scale': src_info['scale'],
                'pivot': [int(src_pt[0] - off_c[0]), int(src_pt[1] - off_c[1])],
                'registeredWith': src_name,
                'partialAlpha': round(partial, 3), 'magentaPixels': spill
            }
            measured[name] = info
            outputs[name] = out
            report.append(f'{name:16s} -> {W}x{H} derived from {src_name} pivot={info["pivot"]} partialAlpha {partial:.2f} magenta {spill}')
            if args.debug:
                os.makedirs(args.debug, exist_ok=True)
                big = out.resize((W * 4, H * 4), Image.NEAREST)
                bgim = Image.new('RGBA', big.size, (40, 44, 60, 255)); bgim.alpha_composite(big)
                bgim.save(os.path.join(args.debug, f'{hero}_{name}.png'))
            continue
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
            if rot % 90 != 0 and kind != 'foot':
                rgb_r, a_r = rgba_arrays(im)
                rgb_r, a_r, off2 = crop_to(rgb_r, a_r, 2)
                im = to_image(rgb_r, a_r)
                anchors = {k: ((v[0] - off2[0], v[1] - off2[1]) if isinstance(v, tuple) else v) for k, v in anchors.items()}
        if flip:
            W, H = im.size
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            anchors = {k: ((W - 1 - v[0], v[1]) if isinstance(v, tuple) else -v) for k, v in anchors.items()}
        if 'fillDark' in p:
            # Close a painted opening (e.g. a vest armhole that the sleeve root now covers):
            # dark interior pixels inside the given fractional boxes take the colour of the
            # nearest non-dark fabric pixel. The silhouette outline (alpha edge band) is kept.
            arr = np.asarray(im).astype(np.float32).copy(); W0, H0 = im.size
            lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            fd = p['fillDark']
            edge = fd.get('edge', 6)
            inner = ndi.binary_erosion(arr[..., 3] > 128, iterations=edge) if edge > 0 else arr[..., 3] > 128
            sel = np.zeros(lum.shape, bool)
            for x0, y0, x1, y1 in fd['rects']:
                sel[int(y0 * H0):int(y1 * H0), int(x0 * W0):int(x1 * W0)] = True
            dark = sel & inner & (lum < fd.get('lum', 70))
            if dark.any():
                # colour sources: opaque, non-dark pixels well inside the silhouette (never the
                # despilled edge band, which can carry a faint background tint)
                chroma = arr[..., :3].max(-1) - arr[..., :3].min(-1)
                src_ok = ndi.binary_erosion(arr[..., 3] > 250, iterations=3) & ~dark & (lum >= fd.get('lum', 70)) & (chroma >= fd.get('minChroma', 0))
                _, (iy, ix) = ndi.distance_transform_edt(~src_ok, return_indices=True)
                arr[dark, :3] = arr[iy, ix][dark, :3]
                im = Image.fromarray(arr.round().clip(0, 255).astype(np.uint8), 'RGBA')
        # target scale
        rgb_, a_ = rgba_arrays(im)
        if 'scale' in p:
            s = p['scale']  # explicit uniform scale (e.g. matched to a part on another sheet)
        elif 'scaleAs' in p:
            s = measured[p['scaleAs']]['scale'] * p.get('scaleMul', 1)
        elif kind in ('limb',):
            top = point_at(a_, p['pivotAt']) if 'pivotAt' in p else cap_centre(a_, 'top')
            bot = point_at(a_, p['jointAt']) if 'jointAt' in p else cap_centre(a_, 'bottom')
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
            info['pivot'] = r1(point_at(ao, p['pivotAt']) if 'pivotAt' in p else cap_centre(ao, 'top'))
            info['joint'] = r1(point_at(ao, p['jointAt']) if 'jointAt' in p else cap_centre(ao, 'bottom'))
            if p.get('roundTop') or p.get('deoutlineTop'):
                rad = p['roundTop'] if isinstance(p.get('roundTop'), (int, float)) and not isinstance(p.get('roundTop'), bool) else None
                out = shape_limb_end(out, 'top', info['pivot'], radius=rad, deoutline=bool(p.get('deoutlineTop')))
            if p.get('roundBottom') or p.get('deoutlineBottom'):
                rad = p['roundBottom'] if isinstance(p.get('roundBottom'), (int, float)) and not isinstance(p.get('roundBottom'), bool) else None
                out = shape_limb_end(out, 'bottom', info['joint'], radius=rad, deoutline=bool(p.get('deoutlineBottom')))
            rgbo, ao = rgba_arrays(out)
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
            info['pivot'] = r1(point_at(ao, p['pivotAt']) if 'pivotAt' in p else cap_centre(ao, 'top', 0.06))
            if partner and partner in measured:
                info['pivot'] = measured[partner]['pivot']; info['registeredWith'] = partner
            if 'grip' in anchors:
                info['grip'] = r1(anchors['grip']); info['axis'] = round(((anchors['axis'] + 90) % 180) - 90, 1)
            if 'gripPoint' in p:
                info['grip'] = [round(p['gripPoint'][0] * W), round(p['gripPoint'][1] * H)]
            if p.get('roundTop') or p.get('deoutlineTop'):
                rad = p['roundTop'] if isinstance(p.get('roundTop'), (int, float)) and not isinstance(p.get('roundTop'), bool) else None
                out = shape_limb_end(out, 'top', info['pivot'], radius=rad, deoutline=bool(p.get('deoutlineTop')))
                rgbo, ao = rgba_arrays(out)
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
        # generic overrides: an explicit pivot (fractions of the output image) and named anchors
        if 'pivotFrac' in p and 'registeredWith' not in info:
            info['pivot'] = [round(p['pivotFrac'][0] * W), round(p['pivotFrac'][1] * H)]
        if 'anchors' in p and kind != 'torso':
            info['anchors'] = {k: [round(v[0] * W), round(v[1] * H)] for k, v in p['anchors'].items()}
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
        if 'toneMatch' in p:
            # Light tone match to another (already sliced) part, e.g. new sleeves to the approved
            # torso: per-channel mean/std of the light fabric pixels are matched to the reference's,
            # blended by `strength`; dark ink is left alone. `rim` darkens the 1 px silhouette edge
            # to the reference's line weight (never across a de-outlined tenon end).
            tm = p['toneMatch']; ref = outputs[tm['part']]
            rr, ra = rgba_arrays(ref)
            arr = np.asarray(out).astype(np.float32).copy()
            lumf = lambda x: x[..., :3] @ np.array([0.299, 0.587, 0.114], np.float32)
            rsel = ndi.binary_erosion(ra > 0.99, iterations=2) & (lumf(rr.astype(np.float32)) > 150)
            tsel = (ao > 0.99) & (lumf(arr) > 150)
            if rsel.sum() > 20 and tsel.sum() > 20:
                rv = rr.astype(np.float32)[rsel]; tv = arr[..., :3][tsel]
                mu_r, sd_r, mu_t, sd_t = rv.mean(0), rv.std(0), tv.mean(0), np.maximum(tv.std(0), 1)
                k = tm.get('strength', 1.0)
                mapped = (arr[..., :3] - mu_t) / sd_t * sd_r + mu_r
                w = (np.clip((lumf(arr) - 90) / 60, 0, 1) * k)[..., None]
                arr[..., :3] = arr[..., :3] * (1 - w) + mapped * w
            if tm.get('rim'):
                solid = ao > 0.5
                edge = solid & ~ndi.binary_erosion(solid, iterations=1)
                if kind == 'limb' and p.get('deoutlineTop'):
                    edge[:int(info['pivot'][1] + (p.get('roundTop') or 4)) + 1] = False
                if kind == 'limb' and p.get('deoutlineBottom'):
                    edge[int(info['joint'][1] - (p.get('roundBottom') or 4)):] = False
                arr[edge, :3] *= tm['rim']
            out = Image.fromarray(arr.round().clip(0, 255).astype(np.uint8), 'RGBA'); rgbo, ao = rgba_arrays(out)
            info['toneMatched'] = tm['part']
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
        if key == 'tip': return info['tip']
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
