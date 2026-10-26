"""Build the default Hanori family with automatic ruby only for Japanese hints."""
import copy

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

from font_families import ROOT, FAMILIES, FONT_VERSION, stem

def build(family_config):
    font = TTFont(ROOT / "dist" / f"{stem(family_config)}Furigana-Regular.otf", recalcTimestamp=False)
    table = font["GSUB"].table
    ruby = {i for i, record in enumerate(table.FeatureList.FeatureRecord) if record.FeatureTag == "rclt"}
    assert ruby, "No automatic furigana feature found"
    for record in table.ScriptList.ScriptRecord:
        script = record.Script
        systems = ([script.DefaultLangSys] if script.DefaultLangSys else []) + [r.LangSys for r in script.LangSysRecord]
        for system in systems:
            system.FeatureIndex = [i for i in system.FeatureIndex if i not in ruby]
            system.FeatureCount = len(system.FeatureIndex)
            if system.ReqFeatureIndex in ruby:
                system.ReqFeatureIndex = 65535
        if record.ScriptTag not in {"DFLT", "hani", "kana"}:
            continue
        japanese = next((r for r in script.LangSysRecord if r.LangSysTag == "JAN "), None)
        if japanese is None:
            japanese = otTables.LangSysRecord()
            japanese.LangSysTag = "JAN "
            if script.DefaultLangSys is not None:
                japanese.LangSys = copy.deepcopy(script.DefaultLangSys)
            else:
                japanese.LangSys = otTables.LangSys()
                japanese.LangSys.LookupOrder = None
                japanese.LangSys.ReqFeatureIndex = 65535
                japanese.LangSys.FeatureIndex = []
            script.LangSysRecord.append(japanese)
        japanese.LangSys.FeatureIndex = sorted(set(japanese.LangSys.FeatureIndex) | ruby)
        japanese.LangSys.FeatureCount = len(japanese.LangSys.FeatureIndex)
        script.LangSysRecord.sort(key=lambda r: r.LangSysTag)
        script.LangSysCount = len(script.LangSysRecord)

    family = family_config["name"]
    postscript = stem(family_config) + "-Regular"
    names = {1: family, 3: f"{FONT_VERSION};{postscript}", 4: family + " Regular", 5: f"Version {FONT_VERSION}", 6: postscript, 16: family,
             10: f'{family_config["latinName"]} Latin + {family_config["cjkName"]}. Automatic furigana only for Japanese-tagged text; otherwise plain. Requires application language hints; does not detect languages.'}
    for ident, value in names.items():
        font["name"].removeNames(nameID=ident)
        font["name"].setName(value, ident, 3, 1, 0x409)
        font["name"].setName(value, ident, 1, 0, 0)
    font["CFF "].cff.fontNames = [postscript]
    top = font["CFF "].cff.topDictIndex[0]
    top.FamilyName = family
    top.FullName = family + " Regular"
    top.version = FONT_VERSION
    font["head"].fontRevision = float(FONT_VERSION)
    font.save(ROOT / "dist" / f"{postscript}.otf")
    print(f"Built {family}: Japanese hints enable readings; other or missing hints stay plain.")


if __name__ == "__main__":
    for family in FAMILIES:
        build(family)
