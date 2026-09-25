"""
Rebuilds assets/media/hero.mp4 - the monochrome nature loop behind the UI.

    python tools/fetch-background-video.py

Source: "Beauty Of Nature | Drone Aerial View" on YouTube
        https://youtu.be/RK1RRVR9A2g
Free stock footage, no copyright.

What it does:

  1. yt-dlp pulls the 720p video-only DASH stream (no audio track, which
     is fine - this is a silent background).
  2. ffmpeg takes a 24s slice, grades it to monochrome, and crossfades the
     tail into a reversed head so the last frame matches the first and the
     clip loops without a visible seam.
  3. A poster still is written for the <video> element so the first paint
     is not black.

Requirements:

    pip install yt-dlp imageio-ffmpeg numpy pillow

Edit START / LENGTH below to pick a different part of the footage. The
aerial foam around 11-12 minutes is the most graphic in monochrome; the
beach and wildlife sections read as literal scenery and sit busier behind
text.
"""

import os
import subprocess
import sys
import tempfile

import imageio_ffmpeg

# ----------------------------------------------------------------- settings

VIDEO_ID = "RK1RRVR9A2g"
FORMAT = "136"  # 1280x720, video only

START = 698      # seconds into the source
LENGTH = 24      # output loop length, seconds
FADE = 2         # crossfade length, seconds

WIDTH, HEIGHT = 1280, 720
FPS = 30
CONTRAST = 1.16
BRIGHTNESS = -0.045
CRF = 26

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "assets", "media")
OUT = os.path.join(OUT_DIR, "hero.mp4")
POSTER = os.path.join(OUT_DIR, "hero-poster.jpg")

FILTER = f"""
[0:v]
scale={WIDTH}:{HEIGHT}:force_original_aspect_ratio=increase,
crop={WIDTH}:{HEIGHT},
setsar=1,
fps={FPS},
trim=0:{LENGTH},
setpts=PTS-STARTPTS,
format=gray,
eq=contrast={CONTRAST}:brightness={BRIGHTNESS},
split=3[body][tail][head];

[body]trim=0:{LENGTH - FADE},setpts=PTS-STARTPTS,fps={FPS}[b];

[tail]trim={LENGTH - FADE}:{LENGTH},setpts=PTS-STARTPTS,fps={FPS}[t];

[head]trim=0:{FADE},reverse,setpts=PTS-STARTPTS,fps={FPS}[r];

[t][r]xfade=transition=fade:duration={FADE}:offset=0[x];

[b][x]concat=n=2:v=1:a=0,fps={FPS},format=yuv420p[v]
"""


def run(args, **kwargs):
    print("  $", " ".join(str(a) for a in args[:6]), "...")
    subprocess.run(args, check=True, **kwargs)


def main():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    os.makedirs(OUT_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        source = os.path.join(tmp, "source.mp4")

        print(f"[1/3] downloading {VIDEO_ID} (format {FORMAT})")
        run([
            sys.executable, "-m", "yt_dlp",
            "-f", FORMAT,
            "--no-playlist",
            "--no-warnings",
            "-o", source,
            f"https://youtu.be/{VIDEO_ID}",
        ])

        print(f"[2/3] cutting {LENGTH}s loop from {START}s, monochrome")
        with open(os.path.join(tmp, "loop.filter"), "w") as handle:
            handle.write(FILTER)

        run([
            ffmpeg, "-hide_banner", "-loglevel", "warning", "-y",
            "-ss", str(START), "-i", source,
            "-filter_complex_script", os.path.join(tmp, "loop.filter"),
            "-map", "[v]",
            "-c:v", "libx264",
            "-profile:v", "main",
            "-level", "4.0",
            "-pix_fmt", "yuv420p",
            "-crf", str(CRF),
            "-preset", "slow",
            "-g", str(FPS * 2),
            "-movflags", "+faststart",
            "-an",
            OUT,
        ])

        print("[3/3] writing poster")
        run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
            "-i", OUT,
            "-frames:v", "1",
            "-vf", f"eq=contrast=1.05:brightness=-0.10",
            "-q:v", "6",
            POSTER,
        ])

    size = os.path.getsize(OUT) / 1e6
    print(f"\ndone  {OUT}  ({size:.2f} MB)")
    print(f"done  {POSTER}")


if __name__ == "__main__":
    main()
