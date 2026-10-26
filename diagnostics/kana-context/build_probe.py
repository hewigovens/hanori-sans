"""Build a process-local diagnostic font; do not install this as a reading font."""
import json
from pathlib import Path

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
output = HERE / "work"
output.mkdir(exist_ok=True)
font = TTFont(ROOT / "build/HanoriBase-Regular.otf", recalcTimestamp=False)
cmap = font.getBestCmap()


def glyph(char):
    return cmap[ord(char)]


rules = [f"sub {glyph('日')}' lookup replace_day {glyph('月')};"]
for kana in "はハｱ":
    rules.extend([
        f"sub {glyph('日')}' lookup replace_day {glyph(kana)};",
        f"sub {glyph(kana)} {glyph('日')}' lookup replace_day;",
    ])
features = "\n".join([
    "languagesystem DFLT dflt;", "languagesystem hani dflt;", "languagesystem kana dflt;",
    f"lookup replace_day {{ sub {glyph('日')} by {glyph('一')}; }} replace_day;",
    "feature rclt {", *rules, "} rclt;",
])
addOpenTypeFeaturesFromString(font, features, tables=["GSUB"])
for ident, value in {1: "Hanori Kana Probe", 3: "HanoriKanaProbe-Regular", 4: "Hanori Kana Probe Regular",
                     6: "HanoriKanaProbe-Regular", 16: "Hanori Kana Probe"}.items():
    font["name"].removeNames(nameID=ident)
    font["name"].setName(value, ident, 3, 1, 0x409)
font["CFF "].cff.fontNames = ["HanoriKanaProbe-Regular"]
top = font["CFF "].cff.topDictIndex[0]
top.FamilyName = "Hanori Kana Probe"
top.FullName = "Hanori Kana Probe Regular"
font.save(output / "Probe.otf")
(output / "glyphs.json").write_text(json.dumps({char: font.getGlyphID(glyph(char)) for char in "日一月はハｱ"}))
print("Built diagnostic work/Probe.otf; 日 becomes 一 only when its context rule matches.")
