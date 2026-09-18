#!/usr/bin/env python3
"""Generate real PNG assets for the OrderConfirm mobile app.

The checked-in files in mobile/assets/ are 68-byte 1x1 placeholder stubs, which
Expo prebuild happily turns into 1x1 launcher/splash/notification resources.
This script writes genuine images at the sizes Expo/Android expect.

Deterministic: no network access, no font files required.

Outputs (all RGBA, written into the directory given as argv[1]):
    icon.png               1024x1024  full-bleed rounded badge (app icon)
    adaptive-icon.png      1024x1024  badge inside the adaptive safe zone
    splash.png             1284x2778  badge centred on transparency
    notification-icon.png     96x96   flat white silhouette (Android status bar)
    favicon.png               64x64   web
"""

import os
import struct
import sys

from PIL import Image, ImageDraw

BRAND_GREEN = (37, 211, 102)      # #25D366 - matches app.json notification color
BRAND_GREEN_DARK = (18, 140, 66)  # gradient end
WHITE = (255, 255, 255)

ICON = 1024
SS = 2                            # supersample factor for the master artwork
BADGE = ICON * SS                 # 2048px master

MIN_PIXELS = 48                   # anything smaller is a placeholder, not an icon


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255
    )
    return mask


def vertical_gradient(size, top, bottom):
    strip = Image.new("RGB", (1, size[1]))
    px = strip.load()
    span = max(1, size[1] - 1)
    for y in range(size[1]):
        t = y / span
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return strip.resize(size, Image.BILINEAR)


def check_points(box):
    """The three points of a tick mark inside box = (x0, y0, x1, y1)."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    return [
        (x0 + 0.03 * w, y0 + 0.54 * h),
        (x0 + 0.37 * w, y0 + 0.92 * h),
        (x0 + 0.97 * w, y0 + 0.10 * h),
    ]


def draw_tick(draw, box, color, width):
    points = check_points(box)
    draw.line(points, fill=color, width=int(width), joint="curve")
    radius = width / 2.0
    for (px, py) in points:  # round caps so the stroke reads cleanly
        draw.ellipse([px - radius, py - radius, px + radius, py + radius], fill=color)


def build_badge():
    """Master artwork: green rounded square with a white tick."""
    art = Image.new("RGBA", (BADGE, BADGE), (0, 0, 0, 0))
    plate = vertical_gradient((BADGE, BADGE), BRAND_GREEN, BRAND_GREEN_DARK).convert("RGBA")
    plate.putalpha(rounded_mask((BADGE, BADGE), radius=int(BADGE * 0.22)))
    art.alpha_composite(plate)

    draw = ImageDraw.Draw(art)
    inset = BADGE * 0.24
    draw_tick(
        draw,
        (inset * 0.95, inset * 0.72, BADGE - inset * 0.95, BADGE - inset * 0.72),
        WHITE,
        width=BADGE * 0.105,
    )
    return art


def save(img, path):
    img.save(path, format="PNG", optimize=True)

    # Guard against ever re-introducing a placeholder-sized asset.
    with open(path, "rb") as fh:
        header = fh.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"not a PNG: {path}")
    width, height = struct.unpack(">II", header[16:24])
    if width < MIN_PIXELS or height < MIN_PIXELS:
        raise SystemExit(f"refusing to write a placeholder-sized asset: {path} ({width}x{height})")

    size = os.path.getsize(path)
    print(f"  {os.path.basename(path):<22} {width:>4}x{height:<4} {size:>9,} bytes")
    return width, height


def main():
    assets = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "assets")
    os.makedirs(assets, exist_ok=True)
    print(f"Generating app assets in {assets}")

    badge = build_badge()

    # App icon: full bleed; the launcher applies its own corner mask.
    save(badge.resize((ICON, ICON), Image.LANCZOS), os.path.join(assets, "icon.png"))

    # Adaptive foreground: keep artwork inside the ~66% safe zone, app.json
    # supplies the white background layer.
    adaptive = Image.new("RGBA", (ICON, ICON), (0, 0, 0, 0))
    inner = badge.resize((int(ICON * 0.60), int(ICON * 0.60)), Image.LANCZOS)
    offset = (ICON - inner.width) // 2
    adaptive.alpha_composite(inner, (offset, offset))
    save(adaptive, os.path.join(assets, "adaptive-icon.png"))

    # Splash: transparent background, app.json sets #ffffff + resizeMode contain.
    splash = Image.new("RGBA", (1284, 2778), (0, 0, 0, 0))
    logo = badge.resize((520, 520), Image.LANCZOS)
    splash.alpha_composite(logo, ((splash.width - 520) // 2, (splash.height - 520) // 2))
    save(splash, os.path.join(assets, "splash.png"))

    # Notification icon: Android tints it, so it must be a flat white silhouette
    # on transparency.
    notch = ICON * 2
    glyph = Image.new("RGBA", (notch, notch), (0, 0, 0, 0))
    margin = notch * 0.16
    draw_tick(
        ImageDraw.Draw(glyph),
        (margin, margin * 0.9, notch - margin, notch - margin * 0.9),
        WHITE,
        width=notch * 0.12,
    )
    save(glyph.resize((96, 96), Image.LANCZOS), os.path.join(assets, "notification-icon.png"))

    # Web favicon
    save(badge.resize((64, 64), Image.LANCZOS), os.path.join(assets, "favicon.png"))
    print("Asset generation complete.")


if __name__ == "__main__":
    main()
