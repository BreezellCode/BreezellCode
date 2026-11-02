#!/usr/bin/env python3
"""
Makes the pet's pictures from what was painted for it: art/source/<name>.png, figure on pure black.
Writes ui/art/<name>.webp, page/images.generated.ts and media/icon.png. Needs numpy, scipy and Pillow.
"""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

ROOT = Path(__file__).resolve().parent.parent
# How much of the painting shows, from the top: down to just under her hands.
CROP_HEIGHT = 1130
# Twice the tallest she is drawn, so she is sharp on a high-density screen.
OUT_HEIGHT = 464
ICON_BOX = (300, 110, 700, 510)
# Her eyes in base.png, each from its outer corner to its inner one: the shape to cover, the lower lid
# to draw the shut eye along, the crease above it, and a bit of cheek for the colour of the lid.
EYES = (
    dict(cover=((374, 306), (392, 281), (420, 269), (450, 271), (465, 283), (456, 304), (436, 318), (405, 320), (384, 313)),
         lid=((377, 303), (416, 322), (462, 287)), crease=((392, 289), (424, 280), (452, 284)), cheek=(420, 328)),
    dict(cover=((592, 233), (579, 222), (550, 222), (527, 237), (518, 263), (527, 276), (546, 281), (571, 274), (586, 256)),
         lid=((590, 236), (562, 284), (521, 264)), crease=((574, 236), (548, 234), (530, 248)), cheek=(556, 292)),
)

def disc(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r

def patches_at_least(mask, size):
    """The connected patches of `mask` of at least `size` pixels."""
    labels, n = ndi.label(mask)
    if not n:
        return mask
    sizes = ndi.sum(mask, labels, index=np.arange(1, n + 1))
    return np.isin(labels, np.where(sizes >= size)[0] + 1)


def biggest_patch(mask):
    labels, n = ndi.label(mask)
    if not n:
        return mask
    return labels == int(np.argmax(ndi.sum(mask, labels, index=np.arange(1, n + 1)))) + 1


def cut_out(path):
    """
    What is bright, and the thin dark lines inside it, is solid. Skin and all it surrounds is solid, and
    so is a band around her face, so lashes stay as dark as they are. The rest is hair over black: its
    brightness says how much of it there is, and its colour is put back as if the black were not behind
    it, so it stays gold on a white page.
    """
    a = np.array(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    v = a.max(axis=2)
    skin = (v > 205) & (r - b > 8) & (r - b < 62) & (r - g < 45)
    skin = patches_at_least(ndi.binary_opening(skin, structure=disc(3)), 1500)
    face = ndi.binary_fill_holes(ndi.binary_closing(skin, structure=disc(14)))
    # Around her face, everything is her: lashes, brows, the shadows of her hair. Her face is the biggest
    # patch of skin that stays in the upper part of the picture: a sheer sleeve goes further down.
    labels, n = ndi.label(skin)
    head = np.zeros_like(skin)
    best = 0
    for k, where in enumerate(ndi.find_objects(labels)):
        size = int((labels[where] == k + 1).sum())
        if where[0].stop < skin.shape[0] * .55 and size > best:
            best = size
            head = labels == k + 1
    around_head = ndi.binary_dilation(head, structure=disc(34)) if best else head
    bright = v > 150
    core = ndi.binary_opening(ndi.binary_closing(bright, structure=disc(4)), structure=disc(2))
    # Pure black shut in by hair is no part of her, however small the gap.
    core &= ~ndi.binary_dilation(patches_at_least(v < 10, 6), iterations=1)
    # Nor anything nearly as dark: lines in her hair and dress are never this dark.
    core &= ~ndi.binary_dilation(v < 40, iterations=1)
    core |= face | around_head
    # Bright, then a soft step from there outward.
    edge = np.clip(ndi.distance_transform_edt(core) / 2.0, 0, 1)
    local = np.maximum(ndi.maximum_filter(v, size=15), 170)
    thin = np.clip((v - 8) / (local - 8), 0, 1) ** .9
    alpha = np.maximum(thin, edge)
    rgb = np.where(alpha[..., None] > .03, a / np.maximum(alpha[..., None], .03), a)
    rgb = np.clip(rgb, 0, 255)
    return rgb, alpha, face


def split_hair(rgb, alpha, body):
    """
    Her body and face, in one piece, stay as they are; all the rest of the picture is hair, on a layer
    of its own behind her that can move. So that no gap opens beside her when it does, the layer goes
    on behind her in the colour of the nearest hair.
    """
    r, b = rgb[..., 0], rgb[..., 2]
    # White cloth, and the blue of her sash.
    cloth = ((r - b < 28) | (b - r > 5)) & (rgb.max(axis=2) > 130) & (alpha > .9)
    her = ndi.binary_fill_holes(ndi.binary_closing(body | ndi.binary_opening(cloth, structure=disc(3)), structure=disc(16)))
    # One piece: bright strands off to the side are hair, however pale.
    her = biggest_patch(her)
    hair = (alpha > .02) & ~ndi.binary_dilation(her, structure=disc(2))
    moving = ndi.gaussian_filter(hair.astype(np.float32), 1.2)
    # Up by her head her hair does not move at all: it stays with her, so no seam shows on her forehead.
    rows = np.arange(hair.shape[0], dtype=np.float32)[:, None]
    leaving = moving * np.clip((rows - CROP_HEIGHT * .24) / (CROP_HEIGHT * .06), 0, 1)
    near, (iy, ix) = ndi.distance_transform_edt(~hair, return_indices=True)
    under = ndi.binary_dilation(her, structure=disc(5)) & ~hair & (near <= 34)
    colour = np.where(under[..., None], rgb[iy, ix], rgb)
    behind = np.where(under, 1.0, moving * alpha)
    def layer(colours, a):
        return Image.fromarray(np.dstack([colours, np.clip(a, 0, 1) * 255]).astype(np.uint8), 'RGBA')
    return layer(colour, behind), layer(rgb, alpha * (1 - leaving))


def shut_eyes(rgb):
    """The picture's eyes shut, over the same picture: skin where the eye is, a dark line along the lid."""
    k = 4
    height, width = rgb.shape[:2]
    out = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    for eye in EYES:
        mask = Image.new('L', (width * k, height * k), 0)
        ImageDraw.Draw(mask).polygon([(x * k, y * k) for x, y in eye['cover']], fill=255)
        mask = mask.resize((width, height), Image.LANCZOS)
        soft = ndi.gaussian_filter(np.array(mask).astype(np.float32) / 255, 1.8)
        cx, cy = eye['cheek']
        skin = rgb[cy - 3:cy + 3, cx - 3:cx + 3].reshape(-1, 3).mean(axis=0)
        # A little darker towards the lash, as a lid is.
        ys = np.arange(height)[:, None]
        top, bottom = min(p[1] for p in eye['cover']), max(p[1] for p in eye['cover'])
        shade = np.clip((ys - top) / max(1, bottom - top), 0, 1)
        lid = np.clip(skin[None, None, :] * (.99 + .03 * shade[..., None]), 0, 255)
        patch = np.dstack([np.broadcast_to(lid, (height, width, 3)), soft * 255]).astype(np.uint8)
        out.alpha_composite(Image.fromarray(patch, 'RGBA'))
        ink = Image.new('RGBA', (width * k, height * k), (0, 0, 0, 0))
        draw = ImageDraw.Draw(ink)
        def along(points, start, end, colour, steps=80):
            (x0, y0), (x1, y1), (x2, y2) = points
            for i in range(steps + 1):
                t = i / steps
                x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2
                y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2
                r = (start + (end - start) * t) * k / 2
                draw.ellipse((x * k - r, y * k - r, x * k + r, y * k + r), fill=colour)
        along(eye['crease'], 1.6, 1.0, (190, 130, 110, 150))
        along(eye['lid'], 5.6, 2, (66, 42, 28, 255))
        out.alpha_composite(ink.resize((width, height), Image.LANCZOS))
    return out


def icon(figure):
    box = figure.crop(ICON_BOX).resize((128, 128), Image.LANCZOS)
    top, bottom = np.array((169, 220, 247)), np.array((95, 168, 224))
    ramp = np.linspace(0, 1, 128)[:, None, None]
    sky = Image.fromarray(np.broadcast_to(top + (bottom - top) * ramp, (128, 128, 3)).astype(np.uint8), 'RGB').convert('RGBA')
    sky.alpha_composite(box)
    mask = Image.new('L', (512, 512), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 511, 511), 96, fill=255)
    sky.putalpha(mask.resize((128, 128), Image.LANCZOS))
    return sky


def main():
    names = sorted(p.stem for p in (ROOT / 'art' / 'source').glob('*.png'))
    if 'base' not in names:
        sys.exit('art/source/base.png is what everything else falls back to')
    out = ROOT / 'ui' / 'art'
    out.mkdir(parents=True, exist_ok=True)
    names = [n for n in names if n != 'blink']
    for name in names:
        rgb, alpha, body = cut_out(ROOT / 'art' / 'source' / f'{name}.png')
        whole = Image.fromarray(np.dstack([rgb, alpha * 255]).astype(np.uint8), 'RGBA')
        hair, her = split_hair(rgb, alpha, body)
        width = round(whole.width * OUT_HEIGHT / CROP_HEIGHT)
        def small(picture):
            return picture.crop((0, 0, picture.width, CROP_HEIGHT)).resize((width, OUT_HEIGHT), Image.LANCZOS)
        small(her).save(out / f'{name}.webp', quality=88, alpha_quality=92, method=6)
        small(hair).save(out / f'{name}.hair.webp', quality=86, alpha_quality=90, method=6)
        print(f'{name}: {width}x{OUT_HEIGHT}, {(out / f"{name}.webp").stat().st_size // 1024} + {(out / f"{name}.hair.webp").stat().st_size // 1024} KB')
        if name == 'base':
            icon(whole).save(ROOT / 'media' / 'icon.png')
            small(shut_eyes(rgb)).save(out / 'blink.webp', quality=90, alpha_quality=92, method=6)
    listed = ', '.join(f"'{n}'" for n in names + ['blink'])
    (ROOT / 'page' / 'images.generated.ts').write_text(
        f"// Written by tools/prepare_art.py: the pictures in ui/art.\nexport const PET_IMAGES: readonly string[] = [{listed}];\n", encoding='utf8')


if __name__ == '__main__':
    main()
