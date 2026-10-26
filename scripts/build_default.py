"""Build the default Hanori family with automatic ruby only for Japanese hints."""
import copy
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import otTables

ROOT = Path(__file__).resolve().parents[1]
font = TTFont(ROOT / "dist/HanoriSansFurigana-Regular.otf", recalcTimestamp=False)
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

family = "Hanori Sans"
postscript = "HanoriSans-Regular"
names = {1: family, 3: f"0.102;{postscript}", 4: family + " Regular", 5: "Version 0.102", 6: postscript, 16: family,
         10: "Inter Latin + Source Han Sans CN. Automatic furigana only for Japanese-tagged text; otherwise plain. Requires application language hints; does not detect languages."}
for ident, value in names.items():
    font["name"].removeNames(nameID=ident)
    font["name"].setName(value, ident, 3, 1, 0x409)
    font["name"].setName(value, ident, 1, 0, 0)
font["CFF "].cff.fontNames = [postscript]
top = font["CFF "].cff.topDictIndex[0]
top.FamilyName = family
top.FullName = family + " Regular"
top.version = "0.102"
font["head"].fontRevision = 0.102
font.save(ROOT / "dist/HanoriSans-Regular.otf")
print("Built Hanori Sans: Japanese hints enable readings; other or missing hints stay plain.")
