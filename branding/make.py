#!/usr/bin/env python3
"""ProtoPilot-Logo: erzeugt alle SVG-Dateien in branding/svg/.

Aufruf: python3 branding/make.py   (braucht: pip install fonttools uharfbuzz)
Schrift: Inter Display ExtraBold (SIL Open Font License), wird als Pfad eingebettet,
die SVGs brauchen also keine installierte Schrift.
"""
import math
import os

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'svg')
FONT = '/usr/share/fonts/opentype/inter/InterDisplay-ExtraBold.otf'

# Farben
PETROL = '#0b6f6a'
PETROL_HELL = '#bfe3df'
PETROL_MITTEL = '#3fb8ae'
ORANGE = '#ffa62b'
TEXT = '#15201f'
TEXT_DUNKEL = '#e6eeed'


def f(x):
    return f'{x:.1f}'.rstrip('0').rstrip('.')


# ---------- Papierflieger (Koordinaten im 512er-Icon) ----------
TIP, LEFT, FOLD, TAIL = (405, 115), (115, 217), (245, 275), (303, 405)


def offset_tri(a, b, c, d):
    """Dreieck a-b-c, Kante a-c um d nach innen versetzt (Spalt am Knick)."""
    ax, ay = a; cx, cy = c
    nx, ny = cy - ay, ax - cx
    n = math.hypot(nx, ny); nx, ny = nx / n, ny / n
    if (b[0] - ax) * nx + (b[1] - ay) * ny < 0:
        nx, ny = -nx, -ny
    p, q = (ax + nx * d, ay + ny * d), (cx + nx * d, cy + ny * d)

    def cut(u, v):  # Schnitt der versetzten Kante mit u-v
        x1, y1 = p; x2, y2 = q; x3, y3 = u; x4, y4 = v
        den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
        t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den
        return (x1 + t * (x2 - x1), y1 + t * (y2 - y1))
    return [cut(a, b), b, cut(c, b)]


def poly(pts, fill):
    return f'<path d="M{" ".join(f(x) + " " + f(y) for x, y in pts)}z" fill="{fill}"/>'


def dots(fill, r=11, n=5, gap=45):
    (x0, y0), (x1, y1), (x2, y2) = (80, 436), (134, 342), (216, 304)
    pts, last, s = [], None, 0.0
    for i in range(2001):
        t = i / 2000
        x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * x1 + t * t * x2
        y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * y1 + t * t * y2
        if last:
            s += math.hypot(x - last[0], y - last[1])
        if s >= len(pts) * gap and len(pts) < n:
            pts.append((x, y))
        last = (x, y)
    return ''.join(f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="{fill}"/>' for x, y in pts)


def plane(upper, lower, dot, gap=6, with_dots=True):
    g = poly(offset_tri(TIP, LEFT, FOLD, gap), upper) + poly(offset_tri(TIP, TAIL, FOLD, gap), lower)
    return (dots(dot) if with_dots and dot else '') + g


def bbox(with_dots=True, gap=6):
    pts = offset_tri(TIP, LEFT, FOLD, gap) + offset_tri(TIP, TAIL, FOLD, gap)
    if with_dots:
        pts += [(80 - 11, 436 + 11)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


# Lage des Fliegers im Icon: Inhalt leicht links unten von der Mitte, weil der
# Flieger rechts oben schwerer wirkt (optisch mittig)
CENTER = (262, 252)


def icon_body(bg, rounded=True, scale=1.0, small=False):
    bgel = f'<rect width="512" height="512" rx="112" fill="{bg}"/>' if rounded else f'<rect width="512" height="512" fill="{bg}"/>'
    if small:  # fuer 16-48 px: ohne Punkte, groesser, breiterer Knick
        x0, y0, x1, y1 = bbox(False, 14)
        inner = f'<g transform="translate(256 256) scale(1.2) translate({f(-(x0 + x1) / 2)} {f(-(y0 + y1) / 2)})">{plane("#fff", PETROL_HELL, None, gap=14, with_dots=False)}</g>'
    else:
        inner = f'<g transform="translate(256 256) scale({scale}) translate({-CENTER[0]} {-CENTER[1]})">{plane("#fff", PETROL_HELL, ORANGE)}</g>'
    return bgel + inner


def svg(w, h, body, title='ProtoPilot'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}" role="img">'
            f'<title>{title}</title>{body}</svg>\n')


# ---------- Schriftzug ----------
font = TTFont(FONT)
glyphset = font.getGlyphSet()
UPEM = font['head'].unitsPerEm
CAP = font['OS/2'].sCapHeight
blob = hb.Blob.from_file_path(FONT)
hbfont = hb.Font(hb.Face(blob))


def wordmark(size, x0, baseline, c1, c2, track=-0.0125):
    """'Proto' in c1, 'Pilot' in c2. size = Schriftgroesse in SVG-Einheiten."""
    buf = hb.Buffer(); buf.add_str('ProtoPilot'); buf.guess_segment_properties()
    hb.shape(hbfont, buf, {'kern': True, 'liga': True})
    s = size / UPEM
    x, parts, bounds = x0, {c1: [], c2: []}, BoundsPen(glyphset)
    for i, (info, pos) in enumerate(zip(buf.glyph_infos, buf.glyph_positions)):
        name = font.getGlyphName(info.codepoint)
        pen = SVGPathPen(glyphset)
        m = (s, 0, 0, -s, x + pos.x_offset * s, baseline - pos.y_offset * s)
        glyphset[name].draw(TransformPen(pen, m))
        glyphset[name].draw(TransformPen(bounds, m))
        parts[c1 if info.cluster < 5 else c2].append(pen.getCommands())
        x += pos.x_advance * s + track * size
    xmin, _, xmax, _ = bounds.bounds
    return ''.join(f'<path fill="{c}" d="{" ".join(d)}"/>' for c, d in parts.items() if d), xmin, xmax


def wordmark_at(size, left, baseline, c1, c2):
    """Schriftzug so, dass die Buchstaben genau bei left beginnen. Gibt (svg, Breite)."""
    _, xmin, xmax = wordmark(size, 0, baseline, c1, c2)
    text, _, _ = wordmark(size, left - xmin, baseline, c1, c2)
    return text, xmax - xmin


def lockup(c1, c2, icon=None, symbol=None):
    """Icon (oder Symbol) links, Schriftzug rechts. Hoehe 512."""
    size = 366
    mark = icon if icon is not None else symbol
    text, w = wordmark_at(size, 512 + 128, 256 + CAP * size / UPEM / 2, c1, c2)
    return svg(512 + 128 + w, 512, mark + text)


def write(name, content):
    with open(os.path.join(OUT, name), 'w') as fh:
        fh.write(content)


os.makedirs(OUT, exist_ok=True)

# App-Icon (abgerundet) und quadratisch fuer iPhone/Android (Inhalt im sicheren Bereich)
write('protopilot-icon.svg', svg(512, 512, icon_body(PETROL)))
write('protopilot-icon-quadratisch.svg', svg(512, 512, icon_body(PETROL, rounded=False)))
write('protopilot-icon-maskable.svg', svg(512, 512, icon_body(PETROL, rounded=False, scale=.74)))
write('protopilot-favicon.svg', svg(512, 512, icon_body(PETROL, small=True)))

# Symbol ohne Hintergrund
BX0, BY0, BX1, BY1 = bbox()
sym = lambda u, l, d: f'<g transform="translate({f(-BX0)} {f(-BY0)})">{plane(u, l, d)}</g>'
SYM_W, SYM_H = BX1 - BX0, BY1 - BY0
write('protopilot-symbol.svg', svg(SYM_W, SYM_H, sym(PETROL, PETROL_MITTEL, ORANGE)))
write('protopilot-symbol-dunkel.svg', svg(SYM_W, SYM_H, sym('#fff', PETROL_HELL, ORANGE)))
write('protopilot-symbol-schwarz.svg', svg(SYM_W, SYM_H, sym('#000', '#000', '#000')))
write('protopilot-symbol-weiss.svg', svg(SYM_W, SYM_H, sym('#fff', '#fff', '#fff')))

# Logo: Icon + Schriftzug
icon = icon_body(PETROL)
write('protopilot-logo.svg', lockup(TEXT, PETROL, icon=icon))
write('protopilot-logo-dunkel.svg', lockup(TEXT_DUNKEL, PETROL_MITTEL, icon=icon))
write('protopilot-logo-auf-petrol.svg', lockup('#fff', PETROL_HELL, icon=icon_body('#ffffff22')))
# Einfarbig (z. B. Aufkleber, Gravur): Symbol + Schriftzug
MS = 440 / SYM_H  # Symbol fuellt die Hoehe wie das Icon, mittig
msym = lambda c: f'<g transform="translate({f((512 - SYM_W * MS) / 2)} 36) scale({f(MS)}) translate({f(-BX0)} {f(-BY0)})">{plane(c, c, c)}</g>'
write('protopilot-logo-schwarz.svg', lockup('#000', '#000', symbol=msym('#000')))
write('protopilot-logo-weiss.svg', lockup('#fff', '#fff', symbol=msym('#fff')))

# Nur Schriftzug
for name, c1, c2 in [('protopilot-schriftzug.svg', TEXT, PETROL), ('protopilot-schriftzug-dunkel.svg', TEXT_DUNKEL, PETROL_MITTEL)]:
    text, w = wordmark_at(366, 0, CAP * 366 / UPEM, c1, c2)
    write(name, svg(w, CAP * 366 / UPEM, text))

print('\n'.join(sorted(os.listdir(OUT))))
