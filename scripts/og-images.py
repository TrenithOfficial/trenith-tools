#!/usr/bin/env python3
"""Generate the 1200x630 social preview images in public/og/.

Static images keep social previews independent of any runtime renderer (the
site builds for both Vercel and Cloudflare). Re-run after adding tools:

    python3 scripts/og-images.py

Needs Pillow and the Inter font family (fonts/ paths below). The catalog is
read from lib/catalog.ts, so names and categories stay in sync automatically.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "og"
W, H = 1200, 630
BG = (246, 241, 231)
INK = (25, 24, 33)
MUTED = (110, 107, 118)
ACCENT = (40, 85, 255)
FONT_DIR = Path("/usr/share/fonts/opentype/inter")


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    for candidate in [FONT_DIR / f"{name}.otf", Path("/usr/share/fonts/truetype/inter") / f"{name}.ttf"]:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size)
    return ImageFont.load_default()


def catalog() -> list[dict]:
    """Pull slug/name/category/kind out of lib/catalog.ts with Node so the
    TypeScript stays the single source of truth."""
    script = "import('./lib/catalog.ts').then(m => console.log(JSON.stringify(m.tools.map(t => ({slug: t.slug, name: t.name, category: t.category, kind: t.kind})))))"
    output = subprocess.run(["node", "--input-type=module", "-e", script], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return json.loads(output.strip().splitlines()[-1])


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    words, lines, current = text.split(), [], ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textlength(trial, font=fnt) <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def render(headline: str, kicker: str, line: str, path: Path, footer: str = "free, private, no upload") -> None:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    # Soft accent band on the right, like the site's hero gradient.
    for x in range(760, W):
        t = (x - 760) / (W - 760)
        draw.line([(x, 0), (x, H)], fill=(int(246 - 28 * t), int(241 - 30 * t), int(231 + 10 * t)))
    # The mark is black with a white "T"; keep the shape, swap white for the
    # card colour so the letter stays readable on the cream background.
    mark = Image.open(ROOT / "public" / "trenith-mark.png").convert("RGBA").resize((150, 150), Image.LANCZOS)
    pixels = mark.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b, a = pixels[x, y]
            pixels[x, y] = (INK if (r + g + b) / 3 < 128 else (250, 248, 243)) + (a,)
    image.paste(mark, (920, 86), mark)

    kicker_font = font("Inter-Bold", 26)
    draw.text((84, 92), kicker.upper(), font=kicker_font, fill=ACCENT, spacing=4)
    size = 84
    while True:
        head_font = font("InterDisplay-Bold", size)
        lines = wrap(draw, headline, head_font, 760)
        if len(lines) <= 3 or size <= 52:
            break
        size -= 6
    y = 150
    for text in lines:
        draw.text((82, y), text, font=head_font, fill=INK)
        y += int(size * 1.12)
    line_font = font("Inter-Medium", 32)
    ly = min(y + 24, 440)
    for text in wrap(draw, line, line_font, 800)[:2]:
        draw.text((84, ly), text, font=line_font, fill=MUTED)
        ly += 42
    footer_font = font("Inter-SemiBold", 28)
    draw.text((84, 556), "tools.trenith.com", font=footer_font, fill=INK)
    draw.text((84 + draw.textlength("tools.trenith.com  ", font=footer_font), 556), f"·  {footer}", font=footer_font, fill=MUTED)
    image.save(path, "JPEG", quality=82, optimize=True, progressive=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    tools = catalog()
    lines = {
        "device": "Runs entirely in your browser — files never leave your device",
        "web": "Finds what a public page or feed openly exposes — no logins, no DRM",
        "byok": "Bring your own API key — your provider, your bill, no Trenith account",
    }
    for tool in tools:
        render(tool["name"], f"Free {tool['category']} tool", lines.get(tool["kind"], lines["device"]), OUT / f"{tool['slug']}.jpg")
    render("Free private file tools, BYOK AI and Watch Together rooms", "Trenith Tools", "Audio, video, PDF, image and metadata tools that run in your browser", OUT / "default.jpg")
    render("Watch together. Feel in the same room.", "Trenith Watch Together", "Synchronized OTT playback with encrypted chat, voice and video — free", OUT / "watch-together.jpg", footer="own account, encrypted room, no Trenith login")
    render("Practical guides for private file work", "Trenith field guides", "Metadata privacy, conversion, PDF compression and watch-party sync", OUT / "guides.jpg", footer="plain answers, no keyword filler")
    print(f"wrote {len(list(OUT.glob('*.jpg')))} images to {OUT}")


if __name__ == "__main__":
    sys.exit(main())
