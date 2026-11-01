#!/usr/bin/env python3
"""breezell.ico: the input method's icon (16, 20, 24, 32 px): a teal rounded square with a white
breeze line, drawn here so the build needs no image tools."""
import struct, sys

def draw(n):
    px = [[(0, 0, 0, 0)] * n for _ in range(n)]
    r = max(2, n // 5)
    for y in range(n):
        for x in range(n):
            # rounded square
            dx = max(r - x, 0, x - (n - 1 - r)); dy = max(r - y, 0, y - (n - 1 - r))
            if dx * dx + dy * dy > r * r:
                continue
            px[y][x] = (0x2a, 0x9d, 0x8f, 255)  # teal (R,G,B,A)
    # two white wave strokes
    import math
    for k, yy in enumerate((0.40, 0.62)):
        for xi in range(n * 4):
            x = n * 0.18 + (n * 0.64) * xi / (n * 4)
            y = n * yy + math.sin((x / n) * 2 * math.pi * 1.2 + k) * n * 0.07
            for oy in (-0.6, 0, 0.6):
                X, Y = int(round(x)), int(round(y + oy * max(1, n / 16)))
                if 0 <= X < n and 0 <= Y < n and px[Y][X][3]:
                    px[Y][X] = (255, 255, 255, 255)
    return px

def bmp(n):
    px = draw(n)
    rows = b''.join(b''.join(struct.pack('BBBB', b, g, r, a) for (r, g, b, a) in px[y]) for y in range(n - 1, -1, -1))
    mask_row = ((n + 31) // 32) * 4
    mask = b'\x00' * mask_row * n
    header = struct.pack('<IiiHHIIiiII', 40, n, n * 2, 1, 32, 0, len(rows) + len(mask), 0, 0, 0, 0)
    return header + rows + mask

sizes = [16, 20, 24, 32, 48]
images = [bmp(n) for n in sizes]
out = struct.pack('<HHH', 0, 1, len(sizes))
offset = 6 + 16 * len(sizes)
for n, img in zip(sizes, images):
    out += struct.pack('<BBBBHHII', n % 256, n % 256, 0, 0, 1, 32, len(img), offset)
    offset += len(img)
out += b''.join(images)
open(sys.argv[1], 'wb').write(out)
