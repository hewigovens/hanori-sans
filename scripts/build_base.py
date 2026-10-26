"""Compose Inter Latin with Source Han Sans CN without changing CJK outlines."""

import copy
import json
import unicodedata
from pathlib import Path

from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
BUILD_TIME = 1792972800  # 2026-10-26 UTC; fixed for reproducible output.


def rename_font(font, family, latin_copyright):
    names = font["name"]
    values = {
        0: names.getDebugName(0) + "; " + latin_copyright,
        1: family, 2: "Regular", 3: f"0.102;Hanori;{family.replace(' ', '')}-Regular",
        4: f"{family} Regular", 5: "Version 0.102",
        6: f"{family.replace(' ', '')}-Regular", 16: family, 17: "Regular",
        9: "Adobe (Source Han Sans); Rasmus Andersson (Inter); Hanori project (composition)",
        10: "Inter Latin + Source Han Sans CN. Simplified Chinese forms; full-width Han.",
        13: "Licensed under the SIL Open Font License, Version 1.1.",
        14: "https://openfontlicense.org/",
    }
    # Remove localized upstream family names so pickers always show our family.
    for name_id, value in values.items():
        names.removeNames(nameID=name_id)
        names.setName(value, name_id, 3, 1, 0x409)
        names.setName(value, name_id, 1, 0, 0)
    top = font["CFF "].cff.topDictIndex[0]
    top.FamilyName = family
    top.FullName = values[4]
    top.version = "0.102"
    font["CFF "].cff.fontNames = [values[6]]
    font["head"].fontRevision = 0.102
    font["head"].created = font["head"].modified = BUILD_TIME + 2082844800
    font.recalcTimestamp = False


def latin_codepoint(cp):
    return 0x20 <= cp <= 0x7E or (
        (0xA0 <= cp <= 0x24F or 0x1E00 <= cp <= 0x1EFF)
        and unicodedata.category(chr(cp)).startswith("L")
    )


def donor_kerning(font, mapping, scale):
    """Flatten only supported Latin pairs, after variable-font instantiation."""
    table = font["GPOS"].table
    indices = sorted({
        index for record in table.FeatureList.FeatureRecord
        if record.FeatureTag == "kern" for index in record.Feature.LookupListIndex
    })
    pairs = {}
    for index in indices:
        lookup = table.LookupList.Lookup[index]
        if lookup.LookupType != 2:
            raise ValueError(f"Unexpected Inter kerning lookup: {lookup.LookupType}")
        for subtable in lookup.SubTable:
            if subtable.Format == 1:
                entries = (
                    (left, pair.SecondGlyph, pair.Value1, pair.Value2)
                    for left, pair_set in zip(subtable.Coverage.glyphs, subtable.PairSet)
                    if left in mapping for pair in pair_set.PairValueRecord
                    if pair.SecondGlyph in mapping
                )
            elif subtable.Format == 2:
                entries = (
                    (left, right, value.Value1, value.Value2)
                    for left in subtable.Coverage.glyphs if left in mapping
                    for right in mapping
                    for value in [subtable.Class1Record[
                        subtable.ClassDef1.classDefs.get(left, 0)
                    ].Class2Record[subtable.ClassDef2.classDefs.get(right, 0)]]
                )
            else:
                raise ValueError(f"Unexpected PairPos format: {subtable.Format}")
            for left, right, first, second in entries:
                if second and any(getattr(second, key, 0) for key in ("XPlacement", "YPlacement", "XAdvance", "YAdvance")):
                    raise ValueError("Unsupported second-glyph kerning adjustment")
                if first and any(getattr(first, key, 0) for key in ("XPlacement", "YPlacement", "YAdvance")):
                    raise ValueError("Unsupported kerning positioning")
                amount = round(getattr(first, "XAdvance", 0) * scale) if first else 0
                if amount:
                    key = (mapping[left], mapping[right])
                    pairs[key] = pairs.get(key, 0) + amount
    return {key: value for key, value in pairs.items() if value}


def replace_kerning(font, pairs):
    temporary = TTFont()
    temporary.setGlyphOrder(font.getGlyphOrder())
    rules = "\n".join(f"pos {a} {b} {amount};" for (a, b), amount in sorted(pairs.items()))
    addOpenTypeFeaturesFromString(temporary, "feature kern {\n" + rules + "\n} kern;", tables=["GPOS"])
    target = font["GPOS"].table
    added = temporary["GPOS"].table.LookupList.Lookup
    offset = len(target.LookupList.Lookup)
    target.LookupList.Lookup.extend(copy.deepcopy(added))
    target.LookupList.LookupCount = len(target.LookupList.Lookup)
    for record in target.FeatureList.FeatureRecord:
        if record.FeatureTag == "kern":
            record.Feature.LookupListIndex = list(range(offset, offset + len(added)))
            record.Feature.LookupCount = len(added)


def main():
    font = TTFont(ROOT / "sources/SourceHanSansCN-Regular.otf")
    donor = instantiateVariableFont(
        TTFont(ROOT / "sources/InterVariable.ttf"), {"wght": 400, "opsz": 14}
    )
    base_cmap, donor_cmap = font.getBestCmap(), donor.getBestCmap()
    scale = font["head"].unitsPerEm / donor["head"].unitsPerEm
    donor_glyphs = {donor_cmap[cp] for cp in base_cmap.keys() & donor_cmap.keys() if latin_codepoint(cp)}
    # Variable TrueType outlines can overlap. Union them before conversion to
    # CFF so intersections do not turn into white seams in Core Text.
    removeOverlaps(donor, glyphNames=donor_glyphs)
    glyph_set = donor.getGlyphSet()
    top = font["CFF "].cff.topDictIndex[0]
    replacement = {}
    donor_to_base = {}
    for cp in sorted(base_cmap.keys() & donor_cmap.keys()):
        if not latin_codepoint(cp):
            continue
        target, source = base_cmap[cp], donor_cmap[cp]
        if target in replacement:
            if replacement[target] != source:
                raise ValueError(f"Ambiguous Latin alias U+{cp:04X}")
            continue
        replacement[target] = source
        donor_to_base[source] = target
        width = round(donor["hmtx"].metrics[source][0] * scale)
        _, fd = top.CharStrings.getItemAndSelector(target)
        private = top.FDArray[fd].Private
        encoded_width = None if width == private.defaultWidthX else width - private.nominalWidthX
        pen = T2CharStringPen(encoded_width, glyph_set)
        glyph_set[source].draw(TransformPen(pen, (scale, 0, 0, scale, 0, 0)))
        top.CharStrings[target] = pen.getCharString(private=private, globalSubrs=top.GlobalSubrs)
        bounds_pen = BoundsPen(glyph_set)
        glyph_set[source].draw(bounds_pen)
        lsb = round(bounds_pen.bounds[0] * scale) if bounds_pen.bounds else 0
        font["hmtx"].metrics[target] = (width, lsb)
    pairs = donor_kerning(donor, donor_to_base, scale)
    replace_kerning(font, pairs)
    # Upstream Latin ligatures would replace Inter letters with Source Han shapes.
    # Proportional CJK features conflict with this build's fixed Han spacing.
    # Source Han's locl also substitutes Western digits based on app language.
    # Lock this personal face to its CN defaults, including in English apps.
    disabled = {"liga", "dlig", "pwid", "palt", "halt", "locl"}
    for tag in ("GSUB", "GPOS"):
        for record in font[tag].table.FeatureList.FeatureRecord:
            if record.FeatureTag in disabled:
                record.Feature.LookupListIndex = []
                record.Feature.LookupCount = 0
    rename_font(font, "Hanori Sans Base", donor["name"].getDebugName(0))
    # The unannotated base is an internal compiler input. The public default
    # is generated from the furigana font with Japanese-only activation.
    output = ROOT / "build/HanoriBase-Regular.otf"
    output.parent.mkdir(exist_ok=True)
    font.save(output)
    report = {"latin_glyphs_replaced": len(replacement), "latin_kerning_pairs": len(pairs),
              "glyph_count": len(font.getGlyphOrder()), "cjk_units_per_em": font["head"].unitsPerEm}
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist/base-report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    main()
