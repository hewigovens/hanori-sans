"""Check the saved fonts at their actual outline, metric, and layout boundaries."""
import hashlib
import json

from fontTools.pens.recordingPen import RecordingPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

from font_families import ROOT, FAMILIES, FONT_VERSION, load_latin, stem


def check_coverages(table, font):
    if isinstance(table, otTables.Coverage):
        ids = [font.getGlyphID(name) for name in table.glyphs]
        assert ids == sorted(set(ids)), "Layout coverage is not sorted and unique"
    for child in table.iterSubTables():
        check_coverages(child.value, font)


def main():
    reports = []
    for family in FAMILIES:
        source = TTFont(ROOT / "sources" / family["cjk"])
        latin = load_latin(family)
        source_cmap, latin_cmap = source.getBestCmap(), latin.getBestCmap()
        for suffix in ["", "Furigana"]:
            filename = f"{stem(family)}{suffix}-Regular.otf"
            path = ROOT / "dist" / filename
            font = TTFont(path, checkChecksums=2)
            for tag in font.keys():
                if tag != "GlyphOrder":
                    font[tag]
            cmap = font.getBestCmap()
            assert font["name"].getDebugName(5) == f"Version {FONT_VERSION}"
            assert cmap.keys() >= source_cmap.keys(), "Lost base font coverage"
            for text in ["中文字体清晰汉字宽度一致骨直令遍返", "日本語勉強東京駅友達", "English AVATAR 0123456789 café"]:
                assert all(ord(c) in cmap for c in text), f"Missing sample character in {filename}"
            han = [g for cp, g in cmap.items() if 0x3400 <= cp <= 0x4DBF or 0x4E00 <= cp <= 0x9FFF or 0x20000 <= cp <= 0x3134F]
            assert all(font["hmtx"].metrics[g][0] == 1000 for g in han), "Uneven Han advances"
            for tag in ["GSUB", "GPOS"]:
                check_coverages(font[tag].table, font)
                assert all(not record.Feature.LookupListIndex for record in font[tag].table.FeatureList.FeatureRecord
                           if record.FeatureTag in {"locl", "palt", "pwid", "halt", "liga", "dlig"})
            check_coverages(font["GDEF"].table, font)
            top = font["CFF "].cff.topDictIndex[0]
            scale = font["head"].unitsPerEm / latin["head"].unitsPerEm
            for cp in range(32, 127):
                glyph = cmap[cp]
                width = round(latin["hmtx"].metrics[latin_cmap[cp]][0] * scale)
                assert font["hmtx"].metrics[glyph][0] == width, "Latin advance differs from source"
                outline = top.CharStrings[glyph]
                outline.draw(RecordingPen())
                assert outline.width == width, "CFF outline width differs from hmtx"
            for char in "骨直令遍返字体汉":
                pens = [RecordingPen(), RecordingPen()]
                source.getGlyphSet()[source_cmap[ord(char)]].draw(pens[0])
                font.getGlyphSet()[cmap[ord(char)]].draw(pens[1])
                assert pens[0].value == pens[1].value, f"Changed Chinese outline: {char}"
            assert font["OS/2"].fsType == 0
            assert len(font.getGlyphOrder()) <= 65535
            reports.append({"file": filename, "family": font["name"].getDebugName(1),
                            "glyphs": len(font.getGlyphOrder()), "codepoints": len(cmap),
                            "full_width_han_checked": len(han),
                            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    assert {p.name for p in (ROOT / "dist").glob("*.otf")} == {r["file"] for r in reports}
    output = {"checks": ["all font tables load", "base coverage retained", "full-width Han",
                          "Chinese source outlines retained", "Latin source ASCII widths",
                          "CFF/hmtx consistency", "sorted layout coverages",
                          "locale substitutions disabled", "embedding permitted"], "fonts": reports}
    (ROOT / "dist/validation.json").write_text(json.dumps(output, indent=2) + "\n")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
