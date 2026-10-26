"""Fetch pinned upstream inputs and verify their recorded SHA-256 hashes."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
for entry in json.loads((ROOT / "sources.json").read_text()):
    path = ROOT / "sources" / entry["filename"]
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == entry["sha256"]:
        print(f"Verified {path.name}")
        continue
    with urlopen(entry["url"], timeout=60) as response:
        data = response.read()
    if hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {entry['filename']}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    temporary.write_bytes(data)
    temporary.replace(path)
    print(f"Downloaded {path.name}")
