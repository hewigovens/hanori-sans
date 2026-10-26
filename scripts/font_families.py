"""Shared composition inputs and output paths for both Hanori designs."""
import json
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
FAMILIES = json.loads((ROOT / "families.json").read_text())
VERSION = json.loads((ROOT / "package.json").read_text())["version"]
major, minor, patch = map(int, VERSION.split("."))
FONT_VERSION = f"{major}.{minor}{patch:02}"


def stem(family):
    return family["name"].replace(" ", "")


def base_path(family):
    return ROOT / "build" / f"{stem(family)}Base-Regular.otf"


def report_path(family, name):
    prefix = "" if family["id"] == "sans" else family["id"] + "-"
    return ROOT / "dist" / f"{prefix}{name}.json"


def load_latin(family):
    font = TTFont(ROOT / "sources" / family["latin"])
    return instantiateVariableFont(font, family["axes"]) if family["axes"] else font
