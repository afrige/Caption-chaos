"""
Generates assets/media/hero-fallback.webp - the looping background used when
no video is available at assets/media/hero.mp4.

    python tools/generate-background.py

Deliberately NOT a space scene. Caption Chaos is a caption game, so the
fallback is a dark, near-monochrome plate: a near-black base, one slow
drifting light like a window moving across a wall, faint out-of-focus
foliage-like blobs, animated film grain and a vignette. It reads as film
stock rather than as a galaxy, and it sits far enough back that UI text
stays readable on top of it.

The loop is seamless: every animated term is a function of sin/cos of
(2 * pi * t) where t runs 0 -> 1 across the frames, so the last frame flows
back into the first.
"""

import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

# --------------------------------------------------------------- config

W, H = 1280, 720
FRAMES = 90
FRAME_MS = 80  # 7.2s loop

OUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets", "media", "hero-fallback.webp",
)

TAU = 2.0 * np.pi

rng = np.random.default_rng(4242)


# --------------------------------------------------------------- helpers

def radial(xn, yn, cx, cy, r, power=2.0):
    d = np.sqrt((xn - cx) ** 2 + (yn - cy) ** 2)
    return np.clip(1.0 - d / r, 0.0, 1.0) ** power


def to_image(arr):
    return Image.fromarray(
        np.clip(arr * 255.0, 0, 255).astype(np.uint8), "RGB"
    )


# --------------------------------------------------------------- base

yn, xn = np.mgrid[0:H, 0:W].astype(np.float32)
yn /= H
xn /= W

# near-black with a whisper of warmth at the bottom
base = np.zeros((H, W, 3), np.float32)
base += (1.0 - yn)[..., None] * np.array([0.016, 0.015, 0.018])
base += yn[..., None] * np.array([0.030, 0.026, 0.024])

BASE_PIL = to_image(base)


# --------------------------------------------------------------- drifting light

def light_layer(t):
    """
    One soft key light that sweeps across the frame, like daylight moving
    through a room. Screen-blended so it only ever adds luminance.
    """
    lx = 0.5 + 0.34 * np.sin(TAU * (t - 0.12))
    ly = 0.42 + 0.16 * np.sin(TAU * (t + 0.30))
    lr = 0.78 + 0.10 * np.sin(TAU * (t + 0.55))

    mask = radial(xn, yn, lx, ly, lr, 1.9)
    # keep the corners dark so panels and text have something to sit on
    mask *= 0.55 + 0.45 * np.sin(np.pi * xn) ** 0.5 * np.sin(np.pi * yn) ** 0.4

    warm = np.array([1.0, 0.96, 0.90], np.float32)

    return to_image((mask * 0.085)[..., None] * warm)


# --------------------------------------------------------------- foliage bokeh

BLOBS = [
    # cx,   cy,    r,     drift, turns, speed, gain
    (0.10, 0.24, 0.115, 0.030, 1, 0.9, 0.055),
    (0.88, 0.30, 0.090, 0.026, 2, 1.2, 0.045),
    (0.72, 0.72, 0.130, 0.022, 1, 0.7, 0.038),
    (0.26, 0.78, 0.100, 0.028, 2, 1.0, 0.042),
    (0.50, 0.16, 0.070, 0.020, 3, 1.3, 0.050),
    (0.94, 0.62, 0.075, 0.024, 1, 0.8, 0.036),
]

BOK_W, BOK_H = W // 4, H // 4


def blob_layer(t):
    layer = Image.new("RGBA", (BOK_W, BOK_H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)

    for (cx, cy, r, drift, turns, speed, gain) in BLOBS:
        x = cx + drift * np.sin(TAU * (t * turns + cx * 2.0))
        y = (cy + 0.018 * speed * np.sin(TAU * (t + cy * 3.0))) % 1.0

        pr = r * H * (BOK_H / H)
        px, py = x * BOK_W, y * BOK_H

        # desaturated grey-green, like defocused leaves. A single soft
        # fill only - stacking a brighter core makes them read as discs.
        tone = int(255 * gain * 3.0)
        c = (tone, int(tone * 1.02), int(tone * 0.94))

        draw.ellipse([px - pr, py - pr, px + pr, py + pr], fill=(*c, 34))

    # heavy blur relative to blob size, so nothing keeps a hard rim
    small = layer.filter(ImageFilter.GaussianBlur(13))
    return small.resize((W, H), Image.BICUBIC).convert("RGB")


# --------------------------------------------------------------- grain

GRAIN = rng.normal(0.0, 1.0, (H // 2, W // 2, 1)).astype(np.float32)
GRAIN_IMG = Image.fromarray(
    np.clip(GRAIN[..., 0] * 26 + 128, 0, 255).astype(np.uint8), "L"
).resize((W, H), Image.BILINEAR)


def grain_layer(t):
    """Animated film grain: shift the noise field and flip its contrast."""
    dx = int((t * GRAIN_IMG.width) % GRAIN_IMG.width)
    dy = int((t * 1.7 % 1.0) * GRAIN_IMG.height)

    shifted = ImageChops.offset(GRAIN_IMG, dx, dy)

    if int(t * FRAMES) % 2 == 0:
        shifted = shifted.point(lambda v: 128 + (v - 128) * 0.85)

    return shifted.convert("RGB")


# --------------------------------------------------------------- vignette

yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
vig = np.sqrt(((xx / W - 0.5) * 1.14) ** 2 + ((yy / H - 0.5) * 1.02) ** 2)
VIGNETTE = np.clip(1.0 - 0.80 * np.clip(vig - 0.24, 0, None) ** 1.25, 0.14, 1.0)


# --------------------------------------------------------------- render

frames = []

for i in range(FRAMES):
    t = i / FRAMES

    img = BASE_PIL.copy()

    img = ImageChops.screen(img, light_layer(t))
    img = ImageChops.screen(img, blob_layer(t))

    # grain last, so it sits on top of everything
    img = ImageChops.overlay(img, grain_layer(t))

    img = Image.fromarray(
        np.clip(
            np.asarray(img, np.float32) * VIGNETTE[..., None], 0, 255
        ).astype(np.uint8), "RGB",
    )

    frames.append(img)

    if (i + 1) % 30 == 0:
        print(f"  frame {i + 1}/{FRAMES}")

os.makedirs(os.path.dirname(OUT), exist_ok=True)

frames[0].save(
    OUT,
    save_all=True,
    append_images=frames[1:],
    duration=FRAME_MS,
    loop=0,
    lossless=False,
    quality=80,
    method=4,
)

print(f"wrote {OUT}  ({os.path.getsize(OUT) / 1e6:.2f} MB, {FRAMES} frames)")
