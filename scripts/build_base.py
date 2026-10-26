"""Compose Hanori Sans and Serif while retaining their chosen Chinese outlines."""

import copy
import json
import unicodedata

from fontTools import subset
from fontTools.ttLib import newTable
from fontTools.ttLib.reorderGlyphs import reorderGlyphs
from fontTools.ttLib.scaleUpem import scale_upem
from fontTools.ttLib.tables import otTables
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.removeOverlaps import removeOverlaps
from font_families import ROOT, FAMILIES, FONT_VERSION, base_path, report_path, load_latin, stem
BUILD_TIME = 1792972800  # 2026-10-26 UTC; fixed for reproducible output.


def rename_font(font, family, latin_copyright):
    name = family["name"] + " Base"
    names = font["name"]
    values = {
        0: names.getDebugName(0) + "; " + latin_copyright,
        1: name, 2: "Regular", 3: f"{FONT_VERSION};{stem(family)}Base-Regular",
        4: f"{name} Regular", 5: f"Version {FONT_VERSION}",
        6: f"{stem(family)}Base-Regular", 16: name, 17: "Regular",
        9: family["credits"],
        10: f'{family["latinName"]} Latin + {family["cjkName"]}. Simplified Chinese forms; full-width Han.',
        13: "Licensed under the SIL Open Font License, Version 1.1.",
        14: "https://openfontlicense.org/",
    }
    # Remove localized upstream family names so pickers always show our family.
    for name_id, value in values.items():
        names.removeNames(nameID=name_id)
        names.setName(value, name_id, 3, 1, 0x409)
        names.setName(value, name_id, 1, 0, 0)
    top = font["CFF "].cff.topDictIndex[0]
    top.FamilyName = name
    top.FullName = values[4]
    top.version = FONT_VERSION
    font["CFF "].cff.fontNames = [values[6]]
    font["head"].fontRevision = float(FONT_VERSION)
    font["head"].created = font["head"].modified = BUILD_TIME + 2082844800
    font.recalcTimestamp = False


def latin_codepoint(cp):
    return 0x20 <= cp <= 0x7E or (
        (0xA0 <= cp <= 0x24F or 0x1E00 <= cp <= 0x1EFF)
        and unicodedata.category(chr(cp)).startswith("L")
    )


def replace_kerning(font, donor, mapping):
    """Transfer supported Latin kern lookups, including contextual positioning.

    Compile against donor names placed at the destination glyph IDs, then
    decompile against the base. This remaps every nested glyph reference without
    relying on an incomplete list of OpenType field names.
    """
    selected = copy.deepcopy(donor)
    # This copy is only for layout. Composite outline components would expand
    # the subset beyond glyphs that have a destination in the CJK font.
    for tag in ("glyf", "loca", "CFF ", "CFF2"):
        if tag in selected:
            del selected[tag]
    options = subset.Options()
    options.layout_features = ["kern"]
    options.layout_closure = False
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(glyphs=mapping)
    subsetter.subset(selected)
    scale_upem(selected, font["head"].unitsPerEm)
    order = list(font.getGlyphOrder())
    mapping = {**mapping, ".notdef": order[0]}
    # Coverage arrays and their parallel positioning records must follow the
    # destination order before glyph IDs change during compilation.
    reorderGlyphs(selected, sorted(selected.getGlyphOrder(), key=lambda name: font.getGlyphID(mapping[name])))
    for source, target in mapping.items():
        order[font.getGlyphID(target)] = source
    adapter = TTFont()
    adapter.setGlyphOrder(order)

    def remapped(tag):
        table = newTable(tag)
        table.decompile(selected[tag].compile(adapter), font)
        return table.table

    transferred = remapped("GPOS")
    lookups = transferred.LookupList.Lookup
    assert all(not lookup.LookupFlag & 0xFF00 for lookup in lookups), "Unsupported mark-attachment class"
    source_gdef = remapped("GDEF")
    target_gdef = font["GDEF"].table
    if source_gdef.GlyphClassDef:
        target_gdef.GlyphClassDef.classDefs.update(source_gdef.GlyphClassDef.classDefs)
    mark_sets = getattr(source_gdef, "MarkGlyphSetsDef", None)
    if mark_sets:
        if not getattr(target_gdef, "MarkGlyphSetsDef", None):
            target_gdef.MarkGlyphSetsDef = otTables.MarkGlyphSetsDef()
            target_gdef.MarkGlyphSetsDef.MarkSetTableFormat = 1
            target_gdef.MarkGlyphSetsDef.Coverage = []
        mark_offset = len(target_gdef.MarkGlyphSetsDef.Coverage)
        target_gdef.MarkGlyphSetsDef.Coverage.extend(mark_sets.Coverage)
        target_gdef.MarkGlyphSetsDef.MarkSetCount = len(target_gdef.MarkGlyphSetsDef.Coverage)
        target_gdef.Version = max(target_gdef.Version, 0x00010002)
        for lookup in lookups:
            if lookup.LookupFlag & 0x10:
                lookup.MarkFilteringSet += mark_offset

    target = font["GPOS"].table
    offset = len(target.LookupList.Lookup)

    def offset_references(table):
        if isinstance(table, otTables.PosLookupRecord):
            table.LookupListIndex += offset
        for child in table.iterSubTables():
            offset_references(child.value)

    for lookup in lookups:
        offset_references(lookup)
    roots = sorted({i for r in transferred.FeatureList.FeatureRecord
                    if r.FeatureTag == "kern" for i in r.Feature.LookupListIndex})
    assert roots, "No Latin kerning survived subsetting"
    target.LookupList.Lookup.extend(lookups)
    target.LookupList.LookupCount = len(target.LookupList.Lookup)
    for record in target.FeatureList.FeatureRecord:
        if record.FeatureTag == "kern":
            record.Feature.LookupListIndex = [offset + i for i in roots]
            record.Feature.LookupCount = len(roots)
    return len(lookups)


def build(family):
    font = TTFont(ROOT / "sources" / family["cjk"])
    donor = load_latin(family)
    base_cmap, donor_cmap = font.getBestCmap(), donor.getBestCmap()
    scale = font["head"].unitsPerEm / donor["head"].unitsPerEm
    donor_glyphs = {donor_cmap[cp] for cp in base_cmap.keys() & donor_cmap.keys() if latin_codepoint(cp)}
    # Variable TrueType outlines can overlap. Union them before conversion to
    # CFF so intersections do not turn into white seams in Core Text.
    if "glyf" in donor:
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
    kerning_lookups = replace_kerning(font, donor, donor_to_base)
    # Upstream ligatures would replace donor Latin with Source Han shapes.
    # Proportional CJK features conflict with this build's fixed Han spacing.
    # Source Han's locl also substitutes Western digits based on app language.
    # Lock this personal face to its CN defaults, including in English apps.
    disabled = {"liga", "dlig", "pwid", "palt", "halt", "locl"}
    for tag in ("GSUB", "GPOS"):
        for record in font[tag].table.FeatureList.FeatureRecord:
            if record.FeatureTag in disabled:
                record.Feature.LookupListIndex = []
                record.Feature.LookupCount = 0
    rename_font(font, family, donor["name"].getDebugName(0))
    # The unannotated base is an internal compiler input. The public default
    # is generated from the furigana font with Japanese-only activation.
    output = base_path(family)
    output.parent.mkdir(exist_ok=True)
    font.save(output)
    latin_test_path = ROOT / "build" / f'{stem(family)}Latin.{"ttf" if "glyf" in donor else "otf"}'
    donor.recalcTimestamp = False
    donor.save(latin_test_path)
    report = {"family": family["name"], "latin_glyphs_replaced": len(replacement),
              "latin_kerning_lookups": kerning_lookups, "latin_test_font": str(latin_test_path.relative_to(ROOT)),
              "glyph_count": len(font.getGlyphOrder()), "cjk_units_per_em": font["head"].unitsPerEm}
    (ROOT / "dist").mkdir(exist_ok=True)
    report_path(family, "base-report").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report))


if __name__ == "__main__":
    for family in FAMILIES:
        build(family)
