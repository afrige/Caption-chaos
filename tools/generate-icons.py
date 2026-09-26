"""
Generates extra icons in the same style as the supplied set in assets/Icons.

    python tools/generate-icons.py

The house style is a thick, fully rounded white outline on transparent, on a
246x259 canvas. Shapes are built from polylines with round caps and joins.

Keep the strokes chunky but the shapes large and simple - at this thickness a
busy shape fills in solid and stops reading as an outline.
"""

import math
import os

from PIL import Image, ImageDraw

W, H = 246, 259          # same canvas as the supplied icons
STROKE = 21              # bubble outline thickness
SS = 4                   # supersample, then downsample for clean edges

OUT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "assets", "Icons",
)


def arc(cx, cy, rx, ry, a0, a1, n=30):
    """Points along an ellipse arc. 0 deg = right, 90 deg = down."""
    return [
        (
            cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / (n - 1))),
            cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / (n - 1))),
        )
        for i in range(n)
    ]


def circle(cx, cy, r):
    pts = arc(cx, cy, r, r, 0, 360, n=44)
    return pts + [pts[0]]


def render(paths):
    canvas = Image.new("L", (W * SS, H * SS), 0)
    draw = ImageDraw.Draw(canvas)

    sw = STROKE * SS
    r = sw / 2

    for points in paths:
        scaled = [(x * W * SS, y * H * SS) for (x, y) in points]

        draw.line(scaled, fill=255, width=sw, joint="curve")

        # round every vertex and both ends so joins and caps stay soft
        for (x, y) in scaled:
            draw.ellipse([x - r, y - r, x + r, y + r], fill=255)

    mask = canvas.resize((W, H), Image.LANCZOS)

    icon = Image.new("RGBA", (W, H), (255, 255, 255, 0))
    solid = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    icon.paste(solid, (0, 0), mask)

    return icon


# ------------------------------------------------------------------ shapes

def mic():
    """Capsule, cradle, stem, base."""
    return [
        # capsule: down the left, round the bottom, up the right, closed on top.
        # The arc must run 180 -> 360 so it starts on the left edge and ends
        # on the right, otherwise the path jumps across and fills solid.
        [
            (0.34, 0.08),
            *arc(0.50, 0.36, 0.16, 0.18, 180, 360),
            (0.66, 0.08),
            (0.34, 0.08),
        ],
        arc(0.50, 0.48, 0.30, 0.30, 0, 180),
        [(0.50, 0.78), (0.50, 0.88)],
        [(0.30, 0.92), (0.70, 0.92)],
    ]


def settings():
    """Three rails, each with a knob sitting on it."""
    paths = [
        [(0.14, 0.24), (0.86, 0.24)],
        [(0.14, 0.50), (0.86, 0.50)],
        [(0.14, 0.76), (0.86, 0.76)],
    ]

    for (y, kx) in [(0.24, 0.68), (0.50, 0.34), (0.76, 0.58)]:
        paths.append(circle(kx, y, 0.10))

    return paths


def trophy():
    """Cup, stem, base. The bowl arc runs 180 -> 360 for the same reason
    as the mic capsule - 0 -> 90 would start on the right and cross back."""
    return [
        [
            (0.28, 0.10),
            *arc(0.50, 0.44, 0.22, 0.22, 180, 360),
            (0.72, 0.10),
            (0.28, 0.10),
        ],
        [(0.50, 0.66), (0.50, 0.82)],
        [(0.28, 0.90), (0.72, 0.90)],
    ]


def medal():
    """Disc with a ribbon behind it."""
    return [
        circle(0.50, 0.68, 0.25),
        [(0.36, 0.14), (0.44, 0.46)],
        [(0.64, 0.14), (0.56, 0.46)],
    ]


def chart():
    """Three rounded bars of increasing height."""
    bottom = 0.86

    def bar(cx, top):
        h = STROKE / 2 / H * 2
        return [
            (cx - h, bottom), (cx - h, top + h), (cx, top),
            (cx + h, top + h), (cx + h, bottom),
        ]

    return [bar(0.28, 0.58), bar(0.50, 0.36), bar(0.72, 0.14)]


# ------------------------------------------------------------------ write

SHAPES = {
    "mic": mic,
    "settings": settings,
    "trophy": trophy,
    "medal": medal,
    "chart": chart,
}

os.makedirs(OUT_DIR, exist_ok=True)

for name, builder in SHAPES.items():
    icon = render(builder())

    path = os.path.join(OUT_DIR, f"{name}.png")
    icon.save(path)

    print(f"wrote {path}  ({os.path.getsize(path) / 1024:.1f} KB)")
